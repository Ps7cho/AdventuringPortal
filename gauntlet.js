/* Gauntlet commands use the shared encounter UI and authoritative API. */
window.GameGauntlet = function({api, onEncounter}) {
  const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const root=node('section');root.className='gauntlet-panel';
  const intro=node('p','Choose one or more of your adventurers for a nonlethal endurance trial. Health and cooldowns carry between stages. Your characters keep their pre-run state afterward. No rewards, rests, or consumables.');
  const definition=node('select');definition.setAttribute('aria-label','Gauntlet definition');
  const roster=node('div'),selectedText=node('p'),status=node('p');status.setAttribute('role','status');
  const deploy=node('button','Start Gauntlet'),refresh=node('button','Refresh Gauntlets');
  const summary=node('section'),history=node('section'),best=node('p');
  let heroes=[],definitions=[],selected=new Set(),busy=false,activeRun=null,owner=null;
  for(const b of [deploy,refresh]){b.type='button';b.dataset.localControl='true';}
  root.append(node('h2','Gauntlet'),intro,definition,roster,selectedText,deploy,refresh,status,summary,best,history);
  function controls(){
    const limit=definitions.find(d=>d.slug===definition.value)?.party_limit;
    deploy.disabled=busy||!selected.size||!limit||selected.size>limit||[...selected].some(id=>!heroes.some(h=>h.id===id&&h.is_alive&&h.health>0&&!h.active_encounter_id));
    refresh.disabled=busy;definition.disabled=busy;
    root.querySelectorAll('input').forEach(input=>input.disabled=busy||input.dataset.unavailable==='true');
    selectedText.textContent=`${selected.size} selected${limit?` (limit ${limit})`:''}. ${heroes.filter(h=>selected.has(h.id)).map(h=>h.name).join(', ')}`;
  }
  async function perform(task){if(busy)return;busy=true;status.textContent='';controls();try{await task();}catch(e){status.textContent=e.message;}finally{busy=false;controls();}}
  function button(text,task){const b=node('button',text);b.type='button';b.dataset.localControl='true';b.onclick=()=>perform(task);return b;}
  function drawRoster(){
    roster.replaceChildren();
    for(const h of heroes){const label=node('label'),check=node('input');check.type='checkbox';check.value=h.id;check.checked=selected.has(h.id);
      check.dataset.unavailable=String(!h.is_alive||h.health<=0||Boolean(h.active_encounter_id));
      check.onchange=()=>{if(check.checked)selected.add(h.id);else selected.delete(h.id);controls();};
      label.append(check,document.createTextNode(` ${h.name} · level ${h.rank_level} · ${h.health} HP${h.active_encounter_id?' · in an adventure':!h.is_alive?' · fallen':''}`));
      const row=node('div');row.append(label);roster.append(row);
    }
    if(!heroes.length)roster.append(node('p','Create an adventurer in the Character tab first.'));
    controls();
  }
  async function showRun(id){
    const run=await api('/gauntlet-runs/'+encodeURIComponent(id));activeRun=id;summary.replaceChildren();
    summary.append(node('h3',run.name+' — '+run.status.replaceAll('_',' ')),node('p',run.party.map(h=>h.name).join(', ')),
      node('p',`Reached stage ${run.highest_stage_reached}; completed stage ${run.highest_stage_completed}. ${run.encounters_completed} encounters completed. Duration: ${run.duration_seconds}s.`));
    if(run.termination_reason)summary.append(node('p',run.termination_reason));
    summary.append(button(['active','awaiting_continue'].includes(run.status)?'Resume Gauntlet':'View final battle',async()=>onEncounter(await api('/encounters/'+run.encounter_id))));
    if(!['active','awaiting_continue'].includes(run.status))summary.append(button('Use this party again',async()=>{selected=new Set(run.participant_ids);await load();status.textContent='Party selected. Start again or change the selection above.';}));
    const battles=node('ol');for(const e of run.encounters){const li=node('li');li.append(button(`Stage ${e.stage}: ${e.state.replaceAll('_',' ')} (${e.turn} turns)`,async()=>onEncounter(await api('/encounters/'+e.id))));battles.append(li);}summary.append(battles);
  }
  async function load(){
    const me=await api('/auth/me');if(owner!==me.id){owner=me.id;selected.clear();activeRun=null;summary.replaceChildren();}
    const [rosterData,definitionData,historyData]=await Promise.all([api('/adventurers'),api('/gauntlets'),api('/gauntlet-runs')]);
    heroes=rosterData;definitions=definitionData;const old=definition.value;
    definition.replaceChildren(...definitions.map(d=>new Option(d.name,d.slug)));if(definitions.some(d=>d.slug===old))definition.value=old;
    drawRoster();best.textContent=`Personal best: stage ${historyData.best_completed} completed; stage ${historyData.best_reached} reached.`;
    history.replaceChildren(node('h3','Recent runs'));
    for(const r of historyData.runs){const row=node('p');row.append(button(`${r.party.map(h=>h.name).join(' + ')} — completed ${r.highest_stage_completed}, reached ${r.highest_stage_reached} — ${r.status.replaceAll('_',' ')} — ${new Date(r.started_at+'Z').toLocaleString()}`,()=>showRun(r.id)));history.append(row);}
    if(!historyData.runs.length)history.append(node('p','No Gauntlet runs yet.'));
    if(activeRun)await showRun(activeRun);
  }
  definition.onchange=controls;
  deploy.onclick=()=>perform(async()=>{
    const result=await api('/gauntlet-runs',{definition_slug:definition.value,adventurer_ids:[...selected]});
    activeRun=result.run.id;await load();onEncounter(result.encounter);
  });
  refresh.onclick=()=>perform(load);
  root.refresh=()=>perform(load);
  root.showRun=id=>perform(async()=>{await load();await showRun(id);});
  controls();return root;
};
