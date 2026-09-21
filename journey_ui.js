function renderJourneyChoices(host, templates, depart, selectedKind = null) {
  host.replaceChildren(); host.className='journey-browser';
  const playable=templates.filter(t=>t.journey?.stages?.length);
  const sections=[];
  const make=(tag,text,className)=>{const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node;};
  for(const [kind,label] of [['quest','Journeys'],['epic','Epics'],['raid','Raids']]) {
    if(selectedKind && kind!==selectedKind) continue;
    const routes=playable.filter(t=>t.journey.kind===kind);
    if(kind==='raid') routes.sort((a,b)=>(a.journey.raid.cadence==='daily'?0:1)-(b.journey.raid.cadence==='daily'?0:1));
    if(!routes.length)continue;
    const panel=document.createElement('div');
    const first=routes[0].journey;
    const low=first.encounter_groups?.min_size || first.encounter_groups?.size;
    const high=first.encounter_groups?.max_size || low;
    const rule=kind==='raid' ? 'Permanent death. Fixed daily and weekly challenges with three boss checkpoints. Surviving teammates cannot revive you.' : `${low}-${high} battles per committed group. Clear the group to cash out, camp, or push deeper. Downed allies recover on safe return and lose their own run gains; a full wipe is fatal.`;
    const riskSummary=make('p',rule,kind==='raid'?'journey-warning':'section-note');
    const grid=document.createElement('div');grid.className='journey-grid';
    for(const template of routes) {
      const rules=template.journey, raid=rules.raid;
      const card=document.createElement('article');card.className='journey-card';
      const badges=make('p',raid ? raid.cadence.toUpperCase() + ' RAID' : (rules.required_rank || 'iron').toUpperCase() + ' RANK','eyebrow');
      card.append(badges,make('h3',template.name),make('p',template.region,'muted'));
      if(raid?.rotation) card.append(make('small','Resets ' + new Date(raid.rotation.resets_at).toLocaleString() + ' (your time)','muted'));
      if(raid?.rotation) card.append(raidCompletionBadge(template.name, raid.rotation));
      const button=make('button','Review quest & gather party');
      button.type='button';button.dataset.questTemplate=template.slug;button.onclick=()=>depart(template);card.append(button);
      grid.append(card);
    }
    panel.append(grid,riskSummary);
    const rules=document.createElement('details');rules.className='journey-shared-rules';rules.append(make('summary','How rewards and risk work'));
    rules.append(make('p','Battle rewards are banked until safe return. Each cleared group rolls its loot table and may drop no item. Successful rolls add a weapon or consumable stack to the stash. Pushing increases the XP bonus and improves loot tiers; resting resets the XP streak. A fallen character loses their run gains. Pre-run progression and gear stay intact.'));
    if(kind!=='raid') rules.append(make('p','Deeper groups grow stronger. You can keep pushing after the original route is cleared; the route completion bounty pays once. Camp is available only at group boundaries.'));
    panel.append(rules);
    sections.push({key:host.id+'-'+kind,label,nodes:[panel]});
  }
  if(selectedKind) {
    if(sections.length) host.append(...sections.flatMap(section=>section.nodes));
    else host.append(make('p','No '+({quest:'journeys',epic:'epics',raid:'raids'}[selectedKind])+' available right now.','muted'));
  } else if(sections.length) GameUI.tabs(host,sections);
}

window.GameQuestLobby = ({api,startSolo,onEncounter,refreshParties,goBack}) => {
  const root=document.createElement('section');root.className='quest-lobby';
  root.innerHTML=`<header class="quest-lobby-heading"><div><button type="button" data-lobby-back>&larr; All quests</button><p class="eyebrow" data-lobby-kind>QUEST LOBBY</p><h2 data-lobby-title>Select a quest</h2><p data-lobby-region></p></div></header>
    <div class="quest-lobby-layout"><article class="quest-lobby-brief" data-lobby-brief></article><aside class="quest-lobby-party"><p class="eyebrow">EXPEDITION PARTY</p><h3>Gather your party</h3>
      <label>Your adventurer<select data-lobby-hero></select></label><label>Departure group<select data-lobby-party></select></label>
      <div data-lobby-roster class="quest-lobby-roster"></div><p data-lobby-plan class="quest-lobby-plan"></p><label data-lobby-risk-wrap><input type="checkbox" data-lobby-risk> Accept above-rank risk</label>
      <div class="quest-lobby-actions"><button type="button" data-lobby-propose>Choose this quest</button><button type="button" data-lobby-ready>Ready up</button><button type="button" data-lobby-invite>Copy party invite</button><button type="button" data-lobby-depart>Depart</button></div>
      <label data-lobby-code-wrap hidden>Party invite code<input data-lobby-code readonly></label>
      <details class="quest-lobby-gather"><summary>Create or join a party</summary><form data-lobby-create><label>Party name<input name="name" maxlength="80" placeholder="Expedition name"></label><button>Create party</button></form><form data-lobby-join><label>Invite code<input name="code" maxlength="64" required placeholder="Paste invite code"></label><button>Join party</button></form></details>
      <p data-lobby-status role="status"></p></aside></div>`;
  const get=selector=>root.querySelector(selector),make=(tag,text,className)=>{const element=document.createElement(tag);element.textContent=text;if(className)element.className=className;return element;};
  const heroSelect=get('[data-lobby-hero]'),partySelect=get('[data-lobby-party]'),brief=get('[data-lobby-brief]'),roster=get('[data-lobby-roster]'),status=get('[data-lobby-status]');
  const propose=get('[data-lobby-propose]'),ready=get('[data-lobby-ready]'),invite=get('[data-lobby-invite]'),depart=get('[data-lobby-depart]'),risk=get('[data-lobby-risk]'),codeWrap=get('[data-lobby-code-wrap]'),code=get('[data-lobby-code]');
  let entry=null,type='template',heroes=[],parties=[],busy=false,inviteCache=new Map();
  root.querySelectorAll('button').forEach(button=>button.dataset.localControl='');
  const hero=()=>heroes.find(row=>String(row.id)===heroSelect.value);
  const party=()=>parties.find(row=>String(row.id)===partySelect.value);
  const partyOptions=()=>parties.filter(row=>row.members.some(member=>member.is_yours && String(member.id)===heroSelect.value));
  const routeMatches=row=>Boolean(row?.selection && (type==='contract' ? String(row.selection.contract_id)===String(entry?.id) : row.selection.template_slug===entry?.slug));
  const selectionMatches=row=>routeMatches(row)&&Boolean(row.selection.accept_rank_risk)===risk.checked;
  function renderBrief(){
    brief.replaceChildren();if(!entry)return;
    if(type==='contract') {
      brief.append(make('p','RECOVERY CONTRACT','eyebrow'),make('h3','Recover the fallen'),make('p',`${entry.encounter_count} encounters · ${entry.required_rank} rank · ${entry.soul_count} souls waiting`,'quest-lobby-summary'));
      const fallen=make('section','','quest-lobby-section');fallen.append(make('h4','Fallen adventurers'));
      const list=make('div','','quest-lobby-fallen');
      for(const member of entry.fallen||[]) {const card=make('article','');card.append(make('strong',member.name),make('small',`${member.rank} · Level ${member.level}`),make('p',(member.abilities||[]).map(ability=>ability.name).join(' · ')||'No known abilities'));list.append(card);}
      fallen.append(list);brief.append(fallen,make('p','Clear the full route to recover these souls. Returning early releases the contract.','journey-warning'));return;
    }
    const rules=entry.journey||{},raid=rules.raid,group=rules.encounter_groups;
    const count=raid ? `${raid.rotation?.encounter_count||entry.min_encounters+'–'+entry.max_encounters} encounters · 3 bosses` : `${group?.min_size||group?.size||entry.min_encounters}–${group?.max_size||group?.size||entry.max_encounters} battles per group · ${rules.stages?.length||0} route stages`;
    const facts=make('div','','quest-lobby-facts');
    for(const [label,value] of [['Route',count],['Battle rewards',`${rules.gold||0} gold · ${rules.experience||0} XP`],['Completion bounty',`${rules.completion_gold||0} gold · ${rules.completion_experience||0} XP`],['Camp rests',String(rules.max_rests||0)]]) {const fact=make('div','');fact.append(make('small',label),make('strong',value));facts.append(fact);}
    brief.append(facts);
    const enemies=make('section','','quest-lobby-section');enemies.append(make('h4','Enemy pool'),make('p',(entry.enemy_pool||[]).join(' · ')||'Route-defined enemies.'));brief.append(enemies);
    const route=make('section','','quest-lobby-section');route.append(make('h4',raid?'Boss route':'Route stages'));const stages=make('ol','');
    if(raid) stages.append(make('li','Boss encounters: '+(raid.rotation?.boss_encounters||[]).join(', ')+'.'));
    else for(const stage of rules.stages||[])stages.append(make('li',stage.description));route.append(stages);brief.append(route);
    if(rules.loot_tables?.length){const loot=make('section','','quest-lobby-section');loot.append(make('h4','Loot tables & drop odds'));for(const table of rules.loot_tables){const tier=document.createElement('details'),summary=make('summary',`${table.name} · ${table.drop_chance_percent}% item chance`),list=make('ul','','loot-table');tier.append(summary,make('small',`${table.no_drop_chance_percent}% no-drop chance.`));for(const item of table.items||[])list.append(make('li',`${item.name} · ${Number(item.chance_percent.toFixed(2))}%`));tier.append(list);loot.append(tier);}brief.append(loot);}
    brief.append(make('p',raid?'Permanent death applies. This fixed route ends after its final boss.':'Rewards and loot remain at risk until a safe return. A full wipe is fatal.','journey-warning'));
  }
  function syncPartySelect(preferred=partySelect.value){
    const options=partyOptions();partySelect.replaceChildren(new Option('Solo departure','solo'),...options.map(row=>new Option(`${row.name} (${row.members.length}/${row.max_members})`,row.id)));
    const saved=sessionStorage.getItem('quest-lobby-party');partySelect.value=options.some(row=>String(row.id)===String(preferred))?preferred:options.some(row=>String(row.id)===saved)?saved:'solo';
    if(routeMatches(party()))risk.checked=Boolean(party().selection.accept_rank_risk);
  }
  function renderParty(){
    const selected=party(),member=selected?.members.find(row=>row.is_yours&&String(row.id)===heroSelect.value),matches=selectionMatches(selected);
    roster.replaceChildren();
    if(!selected){const card=make('article','','quest-lobby-member');card.append(make('span','','presence-dot online'),make('strong',hero()?.name||'Choose an adventurer'),make('small','Solo · Ready'));roster.append(card);}
    else for(const row of selected.members){const card=make('article','','quest-lobby-member');card.append(make('span','',`presence-dot ${row.is_online?'online':'offline'}`),make('strong',row.name),make('small',`${row.player||'Player'} · ${row.is_online?'Online':'Offline'} · ${!row.is_alive?'Fallen':row.is_ready?'Ready':'Not ready'}${row.is_leader?' · Leader':''}`));roster.append(card);}
    get('[data-lobby-plan]').textContent=!selected?'Solo departure uses only the selected adventurer.':!selected.selection?'No quest has been proposed to this party.':`Party selection: ${selected.selection.name}${matches?' · This quest':' · Different quest'}`;
    get('[data-lobby-risk-wrap]').hidden=!selected||!selected.is_leader;propose.hidden=!selected||!selected.is_leader||matches;ready.hidden=!selected||!matches||!member||Boolean(selected.active_encounter_id);invite.hidden=!selected||!selected.is_leader;depart.hidden=Boolean(selected&&!selected.is_leader);
    propose.disabled=busy||!entry;ready.disabled=busy||!entry||!member?.is_alive;ready.textContent=member?.is_ready?'Cancel ready':'Ready up';invite.disabled=busy;
    depart.disabled=busy||!entry||!hero()||Boolean(selected&&(!matches||!selected.all_ready||selected.active_encounter_id));depart.textContent=selected?'Depart with party':'Depart solo';
    get('[data-lobby-create]').querySelector('button').disabled=busy||!hero();get('[data-lobby-join]').querySelector('button').disabled=busy||!hero();
  }
  async function task(work){if(busy)return;busy=true;status.textContent='';renderParty();try{await work();}catch(error){status.textContent=error.message;}finally{busy=false;renderParty();}}
  async function sync(preferred){parties=await refreshParties();syncPartySelect(preferred);renderParty();}
  heroSelect.onchange=()=>{syncPartySelect();renderParty();};partySelect.onchange=()=>{sessionStorage.setItem('quest-lobby-party',partySelect.value);risk.checked=Boolean(party()?.selection?.accept_rank_risk);codeWrap.hidden=true;renderParty();};risk.onchange=renderParty;
  propose.onclick=()=>task(async()=>{const selected=party();const payload={...(type==='contract'?{contract_id:entry.id}:{template_slug:entry.slug}),accept_rank_risk:risk.checked};const updated=await api(`/parties/${selected.id}/selection`,payload);await sync(updated.id);status.textContent='Quest proposed. Every party member must ready up.';});
  ready.onclick=()=>task(async()=>{const selected=party(),member=selected.members.find(row=>row.is_yours&&String(row.id)===heroSelect.value);const updated=await api(`/parties/${selected.id}/ready`,{adventurer_id:member.id,ready:!member.is_ready,selection_revision:selected.selection_revision});await sync(updated.id);});
  invite.onclick=()=>task(async()=>{const selected=party();let value=inviteCache.get(selected.id);if(!value||Date.parse(value.expires_at)<=Date.now()){value=await api(`/parties/${selected.id}/invite`,{});inviteCache.set(selected.id,value);}try{await navigator.clipboard.writeText(value.code);codeWrap.hidden=true;status.textContent='Invite copied. Your friend can join from this lobby.';}catch(error){code.value=value.code;codeWrap.hidden=false;code.focus();code.select();status.textContent='Copy the selected invite code.';}});
  depart.onclick=()=>task(async()=>{const selected=party();const encounter=selected?await api(`/parties/${selected.id}/encounters`,{selection_revision:selected.selection_revision}):await startSolo(entry,heroSelect.value,type);if(encounter)onEncounter(encounter);});
  get('[data-lobby-create]').onsubmit=event=>{event.preventDefault();task(async()=>{const name=new FormData(event.currentTarget).get('name').trim()||`${hero().name}'s party`;const created=await api('/parties',{adventurer_id:heroSelect.value,name});if(created.invite)inviteCache.set(created.id,created.invite);await sync(created.id);status.textContent='Party created. Copy the invite when you are ready.';});};
  get('[data-lobby-join]').onsubmit=event=>{event.preventDefault();task(async()=>{const form=event.currentTarget,joined=await api('/parties/join',{adventurer_id:heroSelect.value,code:new FormData(form).get('code').trim()});form.reset();await sync(joined.id);status.textContent='Party joined. Review the proposed quest and ready up.';});};
  get('[data-lobby-back]').onclick=()=>goBack(type==='contract'?'bulletin':entry?.journey?.kind||'quest');
  root.open=(value,entryType='template')=>{entry=value;type=entryType;risk.checked=routeMatches(party())?Boolean(party().selection.accept_rank_risk):false;get('[data-lobby-kind]').textContent=type==='contract'?'RECOVERY CONTRACT LOBBY':`${entry.journey?.kind||'quest'} lobby`;get('[data-lobby-title]').textContent=entry.title||entry.name;get('[data-lobby-region]').textContent=entry.region||'';codeWrap.hidden=true;status.textContent='';renderBrief();renderParty();};
  root.update=(rows,partyRows)=>{heroes=(rows||[]).filter(row=>row.is_alive&&row.health>0&&!row.active_encounter_id);parties=partyRows||[];const previous=heroSelect.value;heroSelect.replaceChildren(...heroes.map(row=>new Option(`${row.name} · ${row.health} HP`,row.id)));if(heroes.some(row=>String(row.id)===previous))heroSelect.value=previous;heroSelect.disabled=!heroes.length;syncPartySelect();renderParty();};
  return root;
};

function raidCompletionBadge(name, rotation) {
  const clears=rotation.completions;
  const badge=document.createElement('button');badge.type='button';badge.className='raid-completion';
  // Older servers do not publish completion data; do not imply an uncleared raid.
  const available=Array.isArray(clears);
  const completed=available && clears.length>0;
  badge.textContent=completed ? '? Cleared ? '+clears.length : available ? '? Not yet cleared' : '? Completion status unavailable';
  badge.classList.toggle('raid-cleared',completed);
  badge.disabled=!completed;badge.setAttribute('aria-label',completed ? `${name}: ${clears.length} completions. View players and teams in completion order.` : badge.textContent);
  badge.onclick=()=>{
    let dialog=document.getElementById('raid-completions');
    if(!dialog) {dialog=document.createElement('dialog');dialog.id='raid-completions';dialog.className='raid-completions';document.body.append(dialog);}
    dialog.replaceChildren();
    const form=document.createElement('form');form.method='dialog';
    const close=document.createElement('button');close.textContent='Close';form.append(close);
    const title=document.createElement('h2');title.id='raid-completions-title';title.textContent=name+' ? Completions';
    dialog.setAttribute('aria-labelledby',title.id);
    const note=document.createElement('p');note.textContent='Rotation '+rotation.period+' ? Earliest completion first. Each successful run is listed.';
    const list=document.createElement('ol');
    for(const clear of clears) {
      const row=document.createElement('li');
      const label=document.createElement('strong');
      label.textContent=clear.team || clear.players.map(p=>p.player || p.character).join(', ');
      const roster=document.createElement('p');roster.textContent=clear.players.map(p=>p.character+(p.player ? ' ('+p.player+')' : '')+(p.survived ? '' : ' ? fallen')).join(', ');
      const time=document.createElement('time');time.dateTime=clear.completed_at;time.textContent=new Date(clear.completed_at).toLocaleString()+' (your time)';
      row.append(label,roster,time);list.append(row);
    }
    dialog.append(form,title,note,list);dialog.addEventListener('close',()=>badge.focus(),{once:true});dialog.showModal();
  };
  return badge;
}
