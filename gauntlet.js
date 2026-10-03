/* The browser trial uses the same ordered ability policy as the terminal runner. */
window.GameGauntletCommands = function*(encounter, priority, healBelow) {
  const actor=encounter.participants.find(p=>p.hp>0&&!p.acted);
  if(!actor)return;
  const base={actor_id:actor.id,expected_turn:encounter.turn};
  const living=encounter.participants.filter(p=>p.hp>0);
  const enemies=encounter.enemies.filter(e=>e.hp>0).sort((a,b)=>a.hp-b.hp||String(a.id).localeCompare(String(b.id)));
  for(const slug of priority){
    if(slug==='wait')break;
    const spec=(actor.equipped_abilities||[]).find(a=>slug===a.catalog_slug||slug===a.slug);
    if(!spec||spec.trigger_mode==='on_hit')continue;
    if(encounter.turn<(actor.ability_ready_turns?.[spec.slug]||1)||Date.now()/1000<(actor.ability_ready_at?.[spec.slug]||0))continue;
    const command={...base,ability_id:spec.slug};
    if(spec.requires_weapon){
      const weapons=(actor.weapons||[]).filter(w=>!spec.allowed_weapon_tags?.length||w.tags?.some(tag=>spec.allowed_weapon_tags.includes(tag)));
      if(!weapons.length)continue;
      command.weapon_id=weapons.sort((a,b)=>b.base_damage-a.base_damage||String(b.id).localeCompare(String(a.id)))[0].id;
    }
    const allies=spec.target_type==='self'?[actor]:living;
    const weakest=[...allies].sort((a,b)=>a.hp/a.max_hp-b.hp/b.max_hp||String(a.id).localeCompare(String(b.id)))[0];
    if(spec.effect==='heal'&&weakest.hp/weakest.max_hp>=healBelow)continue;
    if(spec.effect==='cleanse'){
      const afflicted=allies.find(p=>p.statuses?.length);
      if(!afflicted)continue;
      if(spec.target_type==='ally')command.target_id=afflicted.id;
    } else if(spec.target_type==='enemy'){
      if(!enemies.length)continue;
      command.target_id=enemies[0].id;
    } else if(spec.target_type==='ally')command.target_id=weakest.id;
    yield command;
  }
  yield {...base,action:'wait'};
};

/* Gauntlet commands use the shared encounter UI and authoritative API. */
window.GameGauntlet = function({api, onEncounter}) {
  const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const root=node('section');root.className='gauntlet-panel';
  const intro=node('p','The character selected in Character enters this nonlethal endurance trial. Health and cooldowns carry between stages. Your character keeps their pre-run state afterward. No rewards, rests, or consumables.');
  const definition=node('select');definition.setAttribute('aria-label','Gauntlet definition');
  const selectedText=node('p'),status=node('p');status.setAttribute('role','status');
  const deploy=node('button','Start manually'),auto=node('button','Run automatic trial'),stop=node('button','Stop after current action'),refresh=node('button','Refresh Gauntlets');
  const priorityList=node('div'),policyNote=node('p','Choose abilities in priority order. The trial tries the first ready ability, then waits if none can be used. It stops after 1,000 actions if the stage limit has not been reached. This does not change your character’s loadout.');
  const healLabel=node('label','Heal below HP fraction '),healBelow=node('input');healBelow.type='number';healBelow.min='0.01';healBelow.max='1';healBelow.step='0.05';healBelow.value='0.5';healLabel.append(healBelow);
  const stagesLabel=node('label','Stop after cleared stages '),maxStages=node('input');maxStages.type='number';maxStages.min='1';maxStages.max='1000';maxStages.value='10';stagesLabel.append(maxStages);
  const summary=node('section'),history=node('section'),best=node('p');
  let heroes=[],definitions=[],abilities=[],priority=[],priorityHero=null,busy=false,autoRunning=false,stopRequested=false,activeRun=null,owner=null;
  for(const b of [deploy,auto,stop,refresh]){b.type='button';b.dataset.localControl='true';}
  stop.onclick=()=>{stopRequested=true;stop.disabled=true;status.textContent='Stopping after the current action…';};
  const policy=node('section');policy.className='gauntlet-policy';policy.append(node('h3','Automatic ability priority'),policyNote,priorityList,healLabel,stagesLabel);
  root.append(node('h2','Gauntlet'),intro,definition,selectedText,policy,deploy,auto,stop,refresh,status,summary,best,history);
  const selectedHero=()=>heroes.find(h=>h.id===window.GameSelectedCharacter.id);
  function controls(){
    const limit=definitions.find(d=>d.slug===definition.value)?.party_limit;
    const hero=selectedHero();
    deploy.disabled=busy||!limit||!hero||!hero.is_alive||hero.health<=0||Boolean(hero.active_encounter_id);
    auto.disabled=deploy.disabled||!priority.length||!Number.isInteger(Number(maxStages.value))||Number(maxStages.value)<1||Number(maxStages.value)>1000||!(Number(healBelow.value)>0&&Number(healBelow.value)<=1);
    stop.disabled=!autoRunning||stopRequested;
    refresh.disabled=busy;definition.disabled=busy;
    priorityList.querySelectorAll('button,input').forEach(control=>control.disabled=busy||control.dataset.boundary==='true');
    healBelow.disabled=busy;maxStages.disabled=busy;
    selectedText.textContent=hero ? `${hero.name} · level ${hero.rank_level} · ${hero.health} HP${hero.active_encounter_id?' · in an adventure':!hero.is_alive?' · fallen':''}` : 'Select a character in the Character tab first.';
  }
  async function perform(task){if(busy)return;busy=true;status.textContent='';controls();try{await task();}catch(e){status.textContent=e.message;}finally{busy=false;controls();}}
  function button(text,task){const b=node('button',text);b.type='button';b.dataset.localControl='true';b.onclick=()=>perform(task);return b;}
  function drawPriority(){
    priorityList.replaceChildren();
    const ordered=[...abilities].sort((a,b)=>{
      const ai=priority.indexOf(a.slug),bi=priority.indexOf(b.slug);
      return (ai<0?Infinity:ai)-(bi<0?Infinity:bi)||a.name.localeCompare(b.name);
    });
    for(const ability of ordered){
      const row=node('div');row.className='gauntlet-policy-row';
      const label=node('label'),check=node('input');check.type='checkbox';check.checked=priority.includes(ability.slug);
      check.onchange=()=>{priority=check.checked?[...priority,ability.slug]:priority.filter(slug=>slug!==ability.slug);drawPriority();controls();};
      label.append(check,document.createTextNode(' '+ability.name));row.append(label);
      const index=priority.indexOf(ability.slug);
      if(index>=0){for(const [text,offset] of [['↑',-1],['↓',1]]){const move=node('button',text);move.type='button';move.dataset.localControl='true';move.dataset.boundary=String(index+offset<0||index+offset>=priority.length);move.setAttribute('aria-label',`${text==='↑'?'Raise':'Lower'} ${ability.name} priority`);move.disabled=busy||move.dataset.boundary==='true';move.onclick=()=>{[priority[index],priority[index+offset]]=[priority[index+offset],priority[index]];drawPriority();};row.append(move);}}
      priorityList.append(row);
    }
    if(!abilities.length)priorityList.append(node('p','No learned abilities available for the selected character.'));
  }
  async function showRun(id){
    const run=await api('/gauntlet-runs/'+encodeURIComponent(id));activeRun=id;summary.replaceChildren();
    summary.append(node('h3',run.name+' — '+run.status.replaceAll('_',' ')),node('p',run.party.map(h=>h.name).join(', ')),
      node('p',`Reached stage ${run.highest_stage_reached}; completed stage ${run.highest_stage_completed}. ${run.encounters_completed} encounters completed. Duration: ${run.duration_seconds}s.`));
    if(run.termination_reason)summary.append(node('p',run.termination_reason));
    summary.append(button(['active','awaiting_continue'].includes(run.status)?'Resume Gauntlet':'View final battle',async()=>onEncounter(await api('/encounters/'+run.encounter_id))));
    const battles=node('ol');for(const e of run.encounters){const li=node('li');li.append(button(`Stage ${e.stage}: ${e.state.replaceAll('_',' ')} (${e.turn} turns)`,async()=>onEncounter(await api('/encounters/'+e.id))));battles.append(li);}summary.append(battles);
  }
  async function load(){
    const me=await api('/auth/me');if(owner!==me.id){owner=me.id;activeRun=null;summary.replaceChildren();}
    const [rosterData,definitionData,historyData]=await Promise.all([api('/adventurers'),api('/gauntlets'),api('/gauntlet-runs')]);
    heroes=rosterData;definitions=definitionData;const old=definition.value;
    definition.replaceChildren(...definitions.map(d=>new Option(d.name,d.slug)));if(definitions.some(d=>d.slug===old))definition.value=old;
    const selectedId=window.GameSelectedCharacter.id;
    const sheet=heroes.some(h=>h.id===selectedId)?await api('/adventurers/'+encodeURIComponent(selectedId)):null;
    abilities=(sheet?.abilities||[]).filter(a=>a.unlocked&&a.trigger_mode!=='on_hit');
    const available=new Set(abilities.map(a=>a.slug));
    if(selectedId!==priorityHero){priorityHero=selectedId;priority=['power_strike','attack'].filter(slug=>available.has(slug));}
    else priority=priority.filter(slug=>available.has(slug));
    drawPriority();
    controls();best.textContent=`Personal best: stage ${historyData.best_completed} completed; stage ${historyData.best_reached} reached.`;
    history.replaceChildren(node('h3','Recent runs'));
    for(const r of historyData.runs){const row=node('p');row.append(button(`${r.party.map(h=>h.name).join(' + ')} — completed ${r.highest_stage_completed}, reached ${r.highest_stage_reached} — ${r.status.replaceAll('_',' ')} — ${new Date(r.started_at+'Z').toLocaleString()}`,()=>showRun(r.id)));history.append(row);}
    if(!historyData.runs.length)history.append(node('p','No Gauntlet runs yet.'));
    if(activeRun)await showRun(activeRun);
  }
  definition.onchange=controls;
  healBelow.oninput=controls;maxStages.oninput=controls;
  deploy.onclick=()=>perform(async()=>{
    const result=await api('/gauntlet-runs',{definition_slug:definition.value,adventurer_ids:[window.GameSelectedCharacter.id]});
    activeRun=result.run.id;await load();onEncounter(result.encounter);
  });
  auto.onclick=()=>perform(async()=>{
    autoRunning=true;stopRequested=false;controls();
    const selectedId=window.GameSelectedCharacter.id,chosen=[...priority],heal=Number(healBelow.value),stageCap=Number(maxStages.value);
    let encounter=null,actions=0,retired=false;
    try{
      const result=await api('/gauntlet-runs',{definition_slug:definition.value,adventurer_ids:[selectedId]});
      activeRun=result.run.id;encounter=result.encounter;
      while(!stopRequested&&actions<1000){
        status.textContent=`Stage ${encounter.gauntlet.reached} · ${actions} actions · ${chosen.join(' → ')}`;
        if(encounter.state==='defeat')break;
        if(encounter.state==='victory'){
          if(encounter.gauntlet.completed>=stageCap){await api('/encounters/'+encounter.id+'/continue',{return_to_village:true});retired=true;break;}
          encounter=await api('/encounters/'+encounter.id+'/continue',{});
        } else {
          let applied=false;
          for(const command of window.GameGauntletCommands(encounter,chosen,heal)){
            try{encounter=await api('/encounters/'+encounter.id+'/actions',command);actions++;applied=true;break;}
            catch(error){if(error.status!==400)throw error;}
          }
          if(!applied)throw new Error('No legal action, including Wait.');
        }
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      if(retired||encounter.state==='defeat'){
        await load();status.textContent=retired?`Trial retired after ${encounter.gauntlet.completed} cleared stages and ${actions} actions.`:`Trial ended at stage ${encounter.gauntlet.reached} after ${actions} actions.`;
      } else {
        onEncounter(encounter);
        status.textContent=stopRequested?'Automatic trial stopped. Continue manually from Encounter.':'Trial paused after 1000 actions. Continue manually from Encounter.';
      }
    } catch(error){if(encounter){try{onEncounter(await api('/encounters/'+encounter.id));}catch{ /* Leave the run available in history. */ }}throw error;}
    finally{autoRunning=false;stopRequested=false;controls();}
  });
  refresh.onclick=()=>perform(load);
  root.refresh=()=>perform(load);
  root.showRun=id=>perform(async()=>{await load();await showRun(id);});
  controls();return root;
};
