document.querySelectorAll('[data-api-docs]').forEach(link=>link.href=GameApi.docsUrl);
const $ = (id) => document.getElementById(id);
let encounter = null;
const liveStatus=document.createElement('small'); liveStatus.id='encounter-live-status'; liveStatus.setAttribute('role','status'); $('status').after(liveStatus);
const live=window.GameLive?.connect(GameApi.baseUrl,()=>GameApi.liveToken?.(),data=>render(data,true),value=>{liveStatus.textContent=value;}) || {watch(){liveStatus.textContent='Live updates unavailable';},close(){}};
let busy = false;
let loginRequested = false;
let resultsRunId=null;
let signedInUser = null;
const savedKey = () => `encounter-id:${signedInUser.id}`;
const finishedGauntlet = data => data.gauntlet && ['failed', 'retired'].includes(data.gauntlet.status);
function forgetGauntletEncounter() {
  localStorage.removeItem(savedKey());
  history.replaceState(null, '', './index.html');
}
let enemyCatalog = [];
let pendingVillage=null, villageHeroes=[], villageParties=[], villageQuestTemplates=[], friendFeedError=false;
function updateHome() { homePanel.update({parties:villageParties,heroes:villageHeroes,signedIn:Boolean(signedInUser),error:friendFeedError,encounterId:encounter?.state==='player_turn' ? encounter.id : null}); }
const villageStatus=document.createElement('small'); villageStatus.id='village-live-status'; $('account-name').after(villageStatus);
const villageLive=window.GameLive?.village?.(GameApi.baseUrl,()=>GameApi.liveToken?.(),data=>{
  if(data.account.id!==signedInUser?.id) return;
  pendingVillage=data;if(!busy) applyVillage();
},value=>{villageStatus.textContent=value;}) || {watch(){},close(){}};
function applyVillage() {
  const data=pendingVillage;pendingVillage=null;
  if(!data || data.account.id!==signedInUser?.id) return;
  signedInUser=data.account;
  villageParties=data.parties || [];friendFeedError=false;
  drawBulletin(data.contracts || []);
  if(JSON.stringify(villageHeroes)!==JSON.stringify(data.adventurers)) {
    villageHeroes=data.adventurers; $('roster').replaceChildren();villageHeroes.forEach(addHero);
    characterWorkspace.update(villageHeroes);renderQuestCards();
    controls();
  }
  questLobby.update(villageHeroes,villageParties);
  updateHome();
}
function renderEnemyDetails() {
  const enemy = enemyCatalog.find(e => e.slug === $('enemy').value);
  if (!enemy) return;
  $('enemy-details').innerHTML = `<p><strong>${escape(enemy.name)}</strong> &middot; ${escape(enemy.enemy_type)}</p>
    <p>${Object.entries(enemy.stat_ranges).map(([stat, range]) => `${escape(stat)}: ${range.min}-${range.max}`).join(' | ')}</p>
    <p>${Object.entries(enemy.attributes).map(([name, value]) => `${escape(name)}: ${value}`).join(' | ')}</p>`;
}
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path, body, method, timeoutMs) {
  try { return await GameApi.request(path, body, method, timeoutMs); }
  catch (error) { if (error.status === 401 && signedInUser) showLoggedOut(); throw error; }
}
async function run(task) {
  if (busy) return;
  busy = true; $('error').textContent = ''; controls();
  try { await task(); } catch (error) { $('error').textContent = error.message; }
  finally { busy = false; applyVillage(); controls(); }
}
function controls() {
  document.querySelectorAll('button:not([role=tab]):not([data-local-control])').forEach(b => b.disabled = busy);
  $('start').disabled = busy || !$('enemy').value || !document.querySelector('#roster input:checked');
  $('continue').disabled = busy || !encounter?.quest?.can_continue;
  $('push-on').disabled = busy || !encounter?.quest?.can_continue;
  document.querySelectorAll('[data-journey]').forEach(b=>b.disabled=busy || !document.querySelector('#roster input:checked'));
  const actor = encounter?.participants.find(p => p.id === $('actor').value);
  $('wait').disabled=busy || !actor || actor.acted || encounter?.state!=='player_turn';
  document.querySelectorAll('[data-action]').forEach(b => {
    b.disabled = busy || !actor || encounter.state !== 'player_turn' || actor.acted || actor.hp <= 0 ||
      (b.dataset.action === 'power_strike' && encounter.turn < actor.power_ready_turn);
  });
  document.querySelectorAll('[data-consumable]').forEach(b => b.disabled = busy || !actor || actor.hp <= 0 || actor.acted || encounter.state !== 'player_turn');
  document.querySelectorAll('[data-ability]').forEach(b => {
    b.disabled = busy || !actor || actor.acted || encounter.state !== 'player_turn' ||
      encounter.turn < (actor.ability_ready_turns?.[b.dataset.ability] || 1) ||
      Date.now()/1000 < (actor.ability_ready_at?.[b.dataset.ability] || 0);
  });
  document.querySelectorAll('.raid-completion').forEach(b=>b.disabled=busy || !b.classList.contains('raid-cleared'));
  auctionPanel.updateControls();
  updateActionAvailability();
}
function render(data, pushed=false) {
  if(window.GameLive?.stale(encounter,data)) return;
  if(resultsRunId===data.quest.id && ['victory','returned'].includes(data.quest.status))return;
  live.watch(data);
  if(pushed && encounter?.id===data.id && encounter?.revision===data.revision) return;
  encounter = data;
  if(finishedGauntlet(data)) forgetGauntletEncounter();
  else localStorage.setItem(savedKey(), data.id);
  $('quest-results').hidden=true;resultsRunId=null;
  $('log').closest('section').hidden=false;
  updateHome();
  if(!finishedGauntlet(data)) history.replaceState(null, '', './index.html?encounter=' + data.id);
  $('combat').hidden = false; $('no-encounter').hidden=true; if(!pushed) villageTabs.select('encounter');
  $('status').textContent = `Turn ${data.turn} - ${data.state.replaceAll('_', ' ')}`;
  $('encounter-id').textContent = data.id;
  $('quest-progress').textContent = `Encounter ${data.quest.encounter_number} of ${data.quest.encounter_count} - ${data.quest.status.replaceAll('_', ' ')}`;
  $('continue').hidden = !data.quest.can_continue || (data.quest.requires_choice && !data.quest.camp_rest);
  $('push-on').hidden = !data.quest.can_continue || !data.quest.requires_choice;
  $('continue').textContent=data.quest.camp_rest ? 'Rest at Camp & Continue' : 'Continue Journey';
  $('camp-description').textContent=data.quest.requires_choice ? `${data.quest.rests_remaining} camp rest remaining. Completion risk bonus: ${data.quest.risk_bonus.gold} gold / ${data.quest.risk_bonus.experience} experience. Press on without healing to add ${data.quest.journey.push_gold} gold / ${data.quest.journey.push_experience} experience. This bonus is lost if you retreat or are defeated.` : data.quest.camp_rest ? 'Rest at camp to recover before continuing.' : '';
  if(data.quest.journey.push_xp_tiers?.length) {
    $('camp-description').textContent += ` Battle XP: +${data.quest.xp_bonus_percent}% (${data.quest.push_streak} consecutive pushes). Next push: +${data.quest.next_push_xp_bonus_percent}%. Rest resets the streak. Earned XP is kept; completion bonuses stay separate.`;
    $('push-on').textContent=`Press On (+${data.quest.next_push_xp_bonus_percent}% battle XP)`;
  } else $('push-on').textContent='Press On';

  if(data.quest.requires_choice && data.quest.camp_rest) $('continue').textContent='Use Camp Rest (' + data.quest.rests_remaining + ' left)';
  const group=data.quest.group;
  $('group-loot').hidden=!group;
  if(group) {
    const cleared=data.state==='victory' && group.boundary;
    $('quest-progress').textContent=`Group ${group.number} | Battle ${group.battle} of ${group.size} | ${group.cleared} groups cleared`;
    $('continue').textContent=group.boundary ? `Camp & Enter Next Group (${data.quest.rests_remaining} left)` : 'Continue Group';
    $('push-on').textContent=`Push Into Next Group (+${data.quest.next_push_xp_bonus_percent}% battle XP)`;
    if(data.quest.raid) $('quest-progress').textContent=`${data.quest.journey.raid.cadence.toUpperCase()} RAID | Encounter ${data.quest.encounter_number} of ${data.quest.encounter_count}${data.quest.is_boss ? ' | BOSS' : ''} | Seed ${data.quest.raid.seed}`;
    $('return-village').textContent=data.state==='defeat' ? 'Return to Village' : 'Cash Out & Return';
    $('camp-description').textContent=cleared
      ? `Group cleared. Cash out now, or commit to the next group. ${data.quest.rests_remaining} camp rests left for this run. Next group: ${group.next_threat.health}% enemy health / ${group.next_threat.power}% enemy damage versus the route baseline. Rest resets the XP streak; the stash stays at risk.`
      : `Committed: clear all ${group.size} battles before retreating or camping. Current battle XP boost: +${data.quest.xp_bonus_percent}%.`;
    if(data.state==='defeat') $('camp-description').textContent='The party was wiped out. Unclaimed run gains and loot were lost.';
    if(data.quest.status==='returned') $('camp-description').textContent='Safe return. Loot and push bonuses have been claimed.';
    $('group-loot').replaceChildren();
    const heading=document.createElement('strong');heading.textContent=group.loot_claimed?'Loot claimed':'Loot at risk - per survivor';
    const stash=document.createElement('div');stash.className='results-loot-list';
    if(!group.stash.length)stash.textContent='No unclaimed items.';
    for(const drop of group.stash){const chip=document.createElement('span');chip.className='results-loot-item';chip.dataset.rarity=drop.rarity||'common';chip.textContent=`${drop.name} (${drop.consumable_slug?'x'+drop.quantity:drop.base_damage+' damage'})${drop.rarity?' · '+drop.rarity:''}`;stash.append(chip);}
    const next=document.createElement('p');next.textContent=`Next clear: ${group.next_loot_tier} loot table / ${group.next_loot_chance_percent}% chance of an item, otherwise no drop. Better tiers come from clearing more groups; resting does not reset loot tiers.`;
    const bank=document.createElement('p');bank.textContent=Object.entries(data.quest.run_gains || {}).map(([id,g])=>(data.participants.find(p=>p.id===id)?.name || 'Adventurer') + ': ' + g.gold + ' gold / ' + g.experience + ' XP banked').join(' | ');
    if(data.quest.journey.death_policy==='rescue_on_return') bank.textContent += ' Downed allies recover on safe return but forfeit their run gains.';
    if(data.quest.raid) bank.textContent += ' RAID: death is permanent.';
    const bonus=document.createElement('small');bonus.textContent=`Unclaimed push bonus: ${data.quest.risk_bonus.gold} gold / ${data.quest.risk_bonus.experience} XP. Return safely to claim. A wipe loses all unclaimed loot and push bonuses.`;
    $('group-loot').append(heading,stash,bank,next,bonus);
  } else $('return-village').textContent='Return to Village';
  $('stage-description').textContent=data.quest.stage_description || '';
  $('return-village').hidden=!data.quest.can_return;
  gauntletSummary.hidden=!data.gauntlet;
  if(data.gauntlet){
    $('quest-progress').textContent=`Gauntlet stage ${data.quest.encounter_number} | Highest reached: ${data.gauntlet.reached} | Stages completed: ${data.gauntlet.completed}`;
    $('continue').textContent='Next Gauntlet Stage';
    $('return-village').textContent=data.gauntlet.status==='awaiting_continue'?'End Gauntlet Run':'Return to Village';
    $('camp-description').textContent='Nonlethal trial: damage and cooldowns persist within this run. Pre-run character state is preserved. No rewards or consumables.';
  }
  const previousEnemyTarget=$('target').value;
  $('target').replaceChildren(new Option('Automatic target',''),...data.enemies.filter(e=>e.hp>0).map(e=>new Option(e.name,e.id)));
  if([...$('target').options].some(o=>o.value===previousEnemyTarget)) $('target').value=previousEnemyTarget;
  $('combatants').innerHTML = [...data.participants, ...data.enemies].map(p => `
    <div class="combatant ${data.enemies.includes(p) ? 'enemy' : ''}">
    <strong>${escape(p.name)}${p.hp<=0 && data.participants.includes(p) ? (data.gauntlet || data.quest.journey.death_policy==='rescue_on_return' && data.state!=='defeat' ? ' (Downed)' : ' (Dead)') : ''}</strong><p>${p.hp} / ${p.max_hp} HP${p.acted ? ' - Action submitted' : ''}</p>
    ${p.evasion && data.turn < p.evasion.until_turn ? `<small>Evasion: ${p.evasion.chance_percent}% against next direct attack</small>` : ''}
    ${p.flinched ? '<small>Flinched: next action skipped</small>' : ''}
    <progress value="${p.hp}" max="${p.max_hp}"></progress>
    ${p.guarding && (p.guard_turn ?? data.turn) === data.turn ? `<small>Guard: ${p.guard_reduction_percent != null ? `${p.guard_reduction_percent}% damage reduction` : `${p.guard_remaining ?? p.guard_power ?? 4} block remaining`}</small>` : ''}
    ${(p.ability_modifiers||[]).filter(m=>data.turn<m.until_turn).map(m=>`<small>${escape(m.name)}: ${escape(m.stat)} ${m.value>0?'+':''}${escape(m.value)}${m.operation==='percent'?'%':''} (${m.until_turn-data.turn} rounds)</small>`).join('')}
    ${p.next_move ? `<div class="enemy-intent"><strong>Next: ${escape(p.next_move.name)}</strong><div>${p.next_move.state === 'planned' ? p.next_move.targets.map(t => `${escape(t.name)}: ${t.amount} ${p.next_move.effect === 'damage' ? 'projected damage' : escape(p.next_move.effect)}${t.dodged ? ' (evaded)' : t.critical ? ' (critical)' : ''}`).join('<br>') : escape(p.next_move.state)}</div></div>` : ''}
    <div class="status-badges">${(p.statuses || []).map(s => `<span title="${escape(GameUI.statusHint(s))}">${escape(GameUI.statusLabel(s))}</span>`).join('')}${Object.entries(p.resources || {}).map(([name, amount]) => `<span>${escape(name)}: ${amount}</span>`).join('')}</div>
    ${Object.entries(p.status_resistances || {}).filter(([s,r]) => r > 0).map(([s,r]) => `<small class="muted">${escape(s)}: ${r === 100 ? 'immune' : r + '% resistant'}</small>`).join(' &middot; ')}
    </div>`).join('');
  if(window.GameIcons)$('combatants').querySelectorAll('.combatant.enemy').forEach((card,index)=>card.prepend(GameIcons.element(data.enemies[index].icon_path)));
  $('battlefield-glance').replaceChildren(...data.enemies.filter(enemy=>enemy.hp>0).map(enemy=>{
    const card=document.createElement('div'),name=document.createElement('strong'),health=document.createElement('span'),intent=document.createElement('small');
    card.className='battlefield-glance-card';name.textContent=enemy.name;health.textContent=`${enemy.hp}/${enemy.max_hp} HP`;
    intent.textContent=enemy.next_move?`Next: ${enemy.next_move.name}`:'Next move unknown';
    if(window.GameIcons)card.append(GameIcons.element(enemy.icon_path));card.append(name,health,intent);return card;
  }));
  const previous = $('actor').value;
  $('actor').replaceChildren(...data.participants.filter(p => data.pending_actor_ids.includes(p.id) && [...document.querySelectorAll('#roster input')].some(input => input.value === p.id)).map(p => new Option(p.name, p.id)));
  if ([...$('actor').options].some(o => o.value === previous)) $('actor').value = previous;
  renderActions();
  $('log').replaceChildren();
  for (const entry of data.combat_log || []) {
    for (const message of entry.messages) {
      const item = document.createElement('li'); item.textContent = `Turn ${entry.turn}: ${message}`; $('log').append(item);
    }
  }
  controls();
  if(data.quest.status==='victory' && !data.gauntlet)showQuestResults(data.quest.id);
}
async function showQuestResults(runId){
  if(resultsRunId===runId)return;
  resultsRunId=runId;
  try {const result=await api('/quest-runs/'+encodeURIComponent(runId)+'/results');questResults.render(result);$('combat').hidden=true;$('no-encounter').hidden=true;$('log').closest('section').hidden=true;villageTabs.select('encounter');history.replaceState(null,'','./index.html?results='+encodeURIComponent(runId));}
  catch(error){resultsRunId=null;$('error').textContent=error.message;}
}
$('create').addEventListener('submit', (event) => {
  event.preventDefault(); run(async () => {
    const hero = await api('/adventurers', {name: $('name').value.trim()});
    villageHeroes.push(hero);addHero(hero);characterWorkspace.update(villageHeroes);$('name').value = '';
  });
});
$('start').onclick = () => run(async () => {
  const ids = [...document.querySelectorAll('#roster input:checked')].map(el => el.value);
  const data = await api('/encounters', {adventurer_ids: ids, enemy_slug: $('enemy').value, encounter_count: Number($('length').value)}); $('log').replaceChildren(); render(data);
});
$('wait').onclick=()=>run(async()=>render(await api(`/encounters/${encounter.id}/actions`,{actor_id:$('actor').value,expected_turn:encounter.turn,action:'wait'})));
$('return-village').onclick=()=>run(async()=>{
  if(encounter.quest.can_continue){
    const returned=await api(`/encounters/${encounter.id}/continue`,{return_to_village:true});
    if(encounter.gauntlet)render(returned,true);
    else {await showQuestResults(returned.quest.id);return;}
  }
  if(encounter.gauntlet){
    const id=encounter.gauntlet.id;forgetGauntletEncounter();
    villageTabs.select('gauntlet');await gauntletPanel.showRun(id);return;
  }
  if(encounter.quest.status==='victory' || encounter.quest.status==='returned'){await showQuestResults(encounter.quest.id);return;}
  localStorage.removeItem(savedKey()); location.href='./index.html?village=1';
});
$('continue').onclick = () => run(async () => render(await api(`/encounters/${encounter.id}/continue`, encounter.quest.requires_choice ? {choice:'rest'} : {})));
$('push-on').onclick = () => run(async () => render(await api(`/encounters/${encounter.id}/continue`, {choice:'push'})));
$('resume').onclick = () => run(async () => render(await api('/encounters/' + encodeURIComponent($('resume-id').value.trim()))));
$('refresh').onclick = () => run(async () => render(await api('/encounters/' + encounter.id)));
$('actor').onchange = () => { renderActions(); controls(); };
$('enemy').onchange = renderEnemyDetails;
let actionBranch = null, selectedAction = null, actionContext = '';
window.addEventListener('game-catalog-saved',async event=>{
  if(event.detail?.catalog!=='abilities'||!encounter)return;
  const id=encounter.id;
  try{
    const data=await api('/encounters/'+id);
    if(encounter?.id!==id||encounter.revision!==data.revision)return;
    encounter=data;renderActions();
  }catch(error){console.warn('Encounter artwork refresh failed.',error);}
});
function encounterChoices(actor) {
  const abilities = !actor ? [] : actor.effective_abilities || actor.equipped_abilities || [
    {slug:'attack',name:'Attack',effect:'damage',target_type:'enemy'},
    {slug:'power_strike',name:'Power Strike',effect:'damage',target_type:'enemy'},
    {slug:'guard',name:'Guard',effect:'guard',target_type:'self'}];
  return [...abilities.filter(a=>a.trigger_mode!=='on_hit').map(a=>({...a, kind:'ability', branch:
    a.target_type==='enemy' || a.effect==='damage' ? 'attack' : 'support'})),
    ...(actor?.consumables || []).filter(i=>i.quantity>0 && !['essence','orb'].includes(i.effect))
      .map(i=>({...i,kind:'item',branch:'items',target_type:'ally'}))];
}
function actionUnavailable(actor, choice) {
  if(!actor || actor.hp<=0 || actor.acted || encounter?.state!=='player_turn') return 'Waiting for an available adventurer.';
  if(!choice) return 'Choose an action.';
  if(choice.kind==='item') return '';
  const turns=Math.max(actor.ability_ready_turns?.[choice.slug] || 1,
    (choice.catalog_slug || choice.slug)==='power_strike' ? actor.power_ready_turn || 1 : 1)-encounter.turn;
  if(turns>0) return `Ready in ${turns} turn${turns===1?'':'s'}.`;
  const seconds=Math.ceil((actor.ability_ready_at?.[choice.slug] || 0)-Date.now()/1000);
  if(seconds>0) return `Ready in ${seconds} seconds.`;
  return '';
}
function actionActor() { return encounter?.participants.find(p=>p.id===$('actor').value); }
const afflictionColors={bleed:'#e56779',poison:'#8bd464',sin:'#b98bea',necrosis:'#65bbcb',burn:'#f3a653',holy:'#f0d881'};
function afflictionColor(slug='') {
  if(afflictionColors[slug])return afflictionColors[slug];
  const hash=[...slug].reduce((value,char)=>(value*31+char.charCodeAt(0))%360,0);
  return `hsl(${hash} 70% 66%)`;
}
function renderPlayerGlance() {
  const player=actionActor() || encounter?.participants.find(p=>p.id===window.GameSelectedCharacter.id) || encounter?.participants[0];
  const glance=$('player-glance');glance.replaceChildren();if(!player)return;
  const title=document.createElement('strong'),health=document.createElement('b'),bar=document.createElement('div'),fill=document.createElement('span');
  title.textContent=player.name;health.textContent=`${player.hp} / ${player.max_hp} HP`;
  const maxHp=Math.max(1,player.max_hp),minimumHp=encounter?.turn<(player.shield?.until_turn||0)?1:0;
  let projectedHp=Math.max(0,player.hp),forecast=[],markerCount=0;
  bar.className='player-health-track';bar.setAttribute('role','progressbar');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax',String(player.max_hp));bar.setAttribute('aria-valuenow',String(player.hp));
  fill.className='player-health-fill';fill.style.width=`${Math.min(100,player.hp/maxHp*100)}%`;bar.append(fill);
  for(const status of player.statuses||[]){
    const raw=status.periodic && status.periodic!=='damage'?0:Math.ceil((Number(status.damage||0)+Number(status.amplification||0))*Number(status.stacks||0)*(100-Number(status.resistance||0))/100);
    const amount=Math.min(Math.max(0,projectedHp-minimumHp),Math.max(0,raw));
    if(!amount){
      const marker=document.createElement('span');marker.className='player-health-marker';marker.style.left=`${5+markerCount++*11}px`;
      marker.style.setProperty('--effect-color',afflictionColor(status.slug));marker.title=GameUI.statusLabel(status);
      bar.append(marker);continue;
    }
    projectedHp-=amount;forecast.push(`${status.name}: ${amount}`);
    const segment=document.createElement('span');segment.className='player-health-effect';
    segment.dataset.effect=status.slug||'';segment.dataset.damage=String(amount);
    segment.style.setProperty('--effect-color',afflictionColor(status.slug));
    segment.style.left=`${projectedHp/maxHp*100}%`;segment.style.width=`${amount/maxHp*100}%`;
    segment.title=`${GameUI.statusLabel(status)} · ${amount} projected damage at round end`;
    bar.append(segment);
  }
  bar.dataset.projectedDamage=String(Math.max(0,player.hp-projectedHp));
  bar.setAttribute('aria-valuetext',`${player.hp} of ${player.max_hp} HP${forecast.length?`; next round: ${forecast.join(', ')} damage`:''}${markerCount?`; ${markerCount} other active effect${markerCount===1?'':'s'}`:''}`);
  glance.classList.toggle('health-danger',player.hp/player.max_hp<=0.3);
  glance.append(title,health,bar);
}
function updateActionAvailability() {
  const actor=actionActor();
  for(const button of document.querySelectorAll('[data-choice]')) {
    const choice=encounterChoices(actor).find(c=>c.kind+':'+c.slug===button.dataset.choice);
    const reason=actionUnavailable(actor,choice);
    button.disabled=busy || !actor;
    button.querySelector('small').textContent=reason || (choice?.kind==='item' ? `In pocket: ${choice.quantity}` : 'Ready');
  }
  let reason=actionUnavailable(actor,selectedAction);
  if(!reason && selectedAction?.requires_weapon && !$('combat-weapon').value) reason='No compatible weapon available.';
  $('action-use').disabled=busy || Boolean(reason);
  $('action-availability').textContent=selectedAction ? reason || 'Uses this adventurer?s action.' : '';
  document.querySelectorAll('#action-categories button').forEach(b=>b.disabled=busy || !actor);
  document.querySelectorAll('#encounter-options select').forEach(s=>s.disabled=busy);
}
function renderActions() {
  const actor=actionActor();
  renderPlayerGlance();
  const context=[encounter?.id,encounter?.turn,actor?.id].join(':');
  if(context!==actionContext) { actionBranch=null; selectedAction=null; actionContext=context; }
  const choices=encounterChoices(actor);
  if(selectedAction) selectedAction=choices.find(c=>c.kind===selectedAction.kind && c.slug===selectedAction.slug) || null;
  $('action-prompt').textContent=actor ? 'Choose an action type. Your turn is spent only when you use an action or Wait.' : 'Waiting for the next available adventurer.';
  $('action-categories').hidden=Boolean(actionBranch);
  $('action-branch').hidden=!actionBranch;
  const labels={attack:'Attack',support:'Support',items:'Items'};
  $('action-categories').replaceChildren(...Object.entries(labels).map(([key,label])=>{
    const button=document.createElement('button'); button.type='button';
    const title=document.createElement('strong');title.textContent=label;
    const detail=document.createElement('small'); const count=choices.filter(c=>c.branch===key).length;
    detail.textContent=count ? `${count} available choices` : 'No choices yet';
    button.append(title,detail);button.onclick=()=>{actionBranch=key;selectedAction=null;renderActions();$('action-back').focus({preventScroll:true});};
    return button;
  }));
  $('action-path').textContent=actionBranch ? labels[actionBranch] + (selectedAction ? ' / '+selectedAction.name : '') : '';
  $('action-use').hidden=!selectedAction;
  $('action-buttons').hidden=Boolean(selectedAction);
  $('consumable-buttons').hidden=true;
  const branchChoices=choices.filter(c=>c.branch===actionBranch);
  $('action-buttons').replaceChildren(...branchChoices.map(choice=>{
    const button=document.createElement('button');button.type='button';button.dataset.choice=choice.kind+':'+choice.slug;
    const title=document.createElement('strong'); title.textContent=choice.name;
    if(window.GameIcons)button.append(GameIcons.element(choice.icon_path));button.append(title,document.createElement('small'));
    button.onclick=()=>{selectedAction=choice;renderActions();$('action-use').focus({preventScroll:true});};return button;
  }));
  if(actionBranch && !branchChoices.length) $('action-buttons').textContent=actionBranch==='items' ? 'No usable items in your pocket dimension.' : 'No learned skills in this category.';
  $('action-detail').hidden=!selectedAction;
  if(selectedAction) {
    const choice=selectedAction;
    $('action-name').textContent=choice.name;if(window.GameIcons)$('action-name').prepend(GameIcons.element(choice.icon_path));
    $('action-description').textContent=(choice.description || '') + (choice.target_type==='self' ? ' Targets yourself.' : choice.target_type==='party' ? ' Targets your party.' : '') + (choice.cooldown_turns ? ` Cooldown: ${choice.cooldown_turns} turns.` : choice.cooldown_seconds ? ` Cooldown: ${choice.cooldown_seconds} seconds.` : '');
    if(choice.kind==='ability')$('action-description').textContent += ` Current ${choice.effect==='guard'?`Guard: ${choice.guard_percent??60}%`:choice.damage_multiplier!=null?`multiplier: ${choice.damage_multiplier}×`:`power: ${choice.damage??0}`}.` + ((choice.effect_chain||[]).length?` Follow-ups: ${choice.effect_chain.map(s=>`${s.effect} → ${s.recipient}`).join('; ')}.`:'');
    $('enemy-field').hidden=choice.target_type!=='enemy';
    $('ally-field').hidden=choice.target_type!=='ally';
    $('weapon-field').hidden=!choice.requires_weapon;
    const previousTarget=$('consumable-target').value;
    $('consumable-target').replaceChildren(new Option('Self',''),...(encounter?.participants || []).filter(p=>p.hp>0 && p.id!==actor?.id).map(p=>new Option(p.name,p.id)));
    if([...$('consumable-target').options].some(o=>o.value===previousTarget)) $('consumable-target').value=previousTarget;
    const previousWeapon=$('combat-weapon').value;
    const weapons=actor?.weapons || (actor?.equipped_weapon ? [actor.equipped_weapon] : []);
    const compatible=weapons.filter(w=>!choice.allowed_weapon_tags?.length || choice.allowed_weapon_tags.some(t=>w.tags?.includes(t)));
    $('combat-weapon').replaceChildren(...compatible.map(w=>new Option(`${w.name} (${w.base_damage} damage)${w.effects?.length?' · '+w.effects.map(e=>e.name).join(', '):''}`,w.id)));
    for(const option of $('combat-weapon').options){const weapon=compatible.find(w=>w.id===option.value);if(weapon)option.textContent+=' · '+(weapon.rarity||'common').toUpperCase();}
    if(!compatible.length) $('combat-weapon').append(new Option('No compatible weapon',''));
    const preferred=compatible.find(w=>w.id===previousWeapon) || compatible.find(w=>w.id===actor?.equipped_weapon?.id);
    if(preferred) $('combat-weapon').value=preferred.id;
    $('action-use').textContent='Use '+choice.name;
  }
  updateActionAvailability();
}
$('action-back').onclick=()=>{if(selectedAction) selectedAction=null;else actionBranch=null;renderActions();
  (actionBranch ? $('action-buttons').querySelector('button') || $('action-back') : $('action-categories').querySelector('button'))?.focus({preventScroll:true});};
$('combat-weapon').onchange=updateActionAvailability;
$('action-use').onclick=()=>run(async()=>{
  const actor=actionActor(), choice=selectedAction;
  if(actionUnavailable(actor,choice)) return;
  const payload={actor_id:actor.id,expected_turn:encounter.turn};
  if(choice.kind==='item') payload.consumable_slug=choice.slug;
  else if(actor.equipped_abilities) payload.ability_id=choice.slug;
  else payload.action=choice.slug;
  if(choice.target_type==='enemy' && $('target').value) payload.target_id=$('target').value;
  if(choice.target_type==='ally') payload.target_id=$('consumable-target').value || actor.id;
  if(choice.requires_weapon && actor.weapons && $('combat-weapon').value) payload.weapon_id=$('combat-weapon').value;
  const data=await api(`/encounters/${encounter.id}/actions`,payload);
  actionBranch=null;selectedAction=null;render(data);
});
setInterval(controls, 1000);
function addHero(hero) {
  if(!hero.is_alive)return;
  const label = document.createElement('label');
  const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = hero.id;
  checkbox.checked = hero.id===window.GameSelectedCharacter.id;
  label.append(checkbox, document.createTextNode(hero.name));
  const link = document.createElement('a'); link.href = './adventurer.html?id=' + encodeURIComponent(hero.id); link.textContent = 'Open Character';
  link.onclick=event=>{event.preventDefault();openCharacter(hero.id);};
  const rest=document.createElement('button'); rest.textContent='Long Rest'; rest.onclick=()=>run(async()=>{ const result=await api('/adventurers/' + hero.id + '/rest',{}); await loadAccount(signedInUser); $('error').textContent=result.message; });
  const health=document.createElement('span'); health.textContent=hero.health + ' HP';
  const row = document.createElement('div'); row.className = 'row adventurer-card'; row.append(label, health, link, rest); $('roster').append(row);
}
function showLoggedOut() {
  villageLive.close();pendingVillage=null;villageHeroes=[];
  live.close();
  auctionPanel.reset();
  GameApi.clearSession(); signedInUser = null; encounter = null;
  villageParties=[];friendFeedError=false;updateHome();
  $('public-home').append(homePanel);
  history.replaceState(null, '', './index.html');
  $('game').hidden = true; $('login-panel').hidden = false;
  $('combat').hidden = true; $('roster').replaceChildren(); $('log').replaceChildren();
  $('quest-results').hidden=true;resultsRunId=null;
  characterWorkspace.update([]);
  questLobby.update([],[]);
  $('resume-id').value = ''; $('password').value = '';
}
async function loadAccount(user) {
  signedInUser = user;
  $('panel-home').append(homePanel);
  villageLive.watch(user);
  $('password').value = ''; $('login-panel').hidden = true; $('game').hidden = false;
  $('account-name').textContent = user.username;
  renderAccount(user);
  $('roster').replaceChildren();
  villageHeroes=await api('/adventurers');villageHeroes.forEach(addHero);
  characterWorkspace.update(villageHeroes);
  try { villageParties=await api('/parties');friendFeedError=false; }
  catch(error) { if(error.status===401) throw error; villageParties=[];friendFeedError=true; }
  questLobby.update(villageHeroes,villageParties);
  updateHome();
  enemyCatalog = await api('/enemies');
  $('enemy').replaceChildren(...enemyCatalog.map(e => new Option(e.name, e.slug)));
  if (enemyCatalog.some(e => e.slug === 'roadside-bandit')) $('enemy').value = 'roadside-bandit';
  renderEnemyDetails();
  drawBulletin(await api('/contracts'));
  villageQuestTemplates=await api('/quest-templates');renderQuestCards();
  if(new URLSearchParams(location.search).has('village')) { localStorage.removeItem(savedKey()); encounter=null; $('combat').hidden=true; $('no-encounter').hidden=false; villageTabs.select('home');updateHome(); return; }
  const resultId=new URLSearchParams(location.search).get('results');
  if(resultId){await showQuestResults(resultId);return;}
  const saved = new URLSearchParams(location.search).get('encounter') || localStorage.getItem(savedKey());
  if (saved) {
    $('resume-id').value = saved;
    const restored=await api('/encounters/' + encodeURIComponent(saved));
    if(finishedGauntlet(restored)) {
      forgetGauntletEncounter();
      villageTabs.select('gauntlet');
      await gauntletPanel.showRun(restored.gauntlet.id);
    } else render(restored,!new URLSearchParams(location.search).has('encounter'));
  }
}
function renderAccount(user) {
  $('account-identity').textContent = `${user.username} · ${user.account_type || 'player'} account`;
  const linked = Boolean(user.discord_linked);
  $('discord-link-status').textContent = linked ? 'Your Discord account is linked.' : 'No Discord account is linked.';
  $('discord-link').hidden = linked;
  $('discord-unlink').hidden = !linked;
}
$('login-form').addEventListener('submit', event => {
  event.preventDefault();
  loginRequested=true;
  const mode = event.submitter?.value || 'login';
  run(async () => {
    const result = await api('/auth/' + mode, {username: $('username').value, password: $('password').value});
    await loadAccount(result.user);
  });
});
$('logout').onclick = () => run(async () => { await api('/auth/logout', {}); showLoggedOut(); });
const villageArea=$('roster').closest('section');
$('account-open').onclick = () => villageTabs.select('account');
$('discord-link').onclick = () => run(async () => {
  const result = await api('/auth/discord/link', {});
  location.href = result.authorization_url;
});
$('discord-unlink').onclick = () => run(async () => {
  await api('/auth/discord/link', undefined, 'DELETE');
  const user = await api('/auth/me'); signedInUser = user; renderAccount(user);
  $('discord-link-message').textContent = 'Discord account unlinked.';
});
let auctionPanel=null,playPanel=null;
const characterWorkspace=GameCharacterWorkspace({recruit:$('create'),onSelect:id=>{playPanel?.selectCharacter(id);auctionPanel?.setAdventurer(id);questLobby?.update(villageHeroes,villageParties);updateQuestRankHeader();renderQuestCards();if(villageShopCatalog)drawVillageShop();controls();}});
const openCharacter=(id,section='overview')=>{characterWorkspace.open(id,section);villageTabs.select('character');};
playPanel=GameLobby({roster:$('roster'),enemy:$('enemy'),length:$('length'),start:$('start'),account:$('account-name').closest('section'),onSelection:controls,openCharacter});
const journeyPanel=document.createElement('section'), epicPanel=document.createElement('section'), raidPanel=document.createElement('section');
function renderQuestCards(){
  if(!villageQuestTemplates.length)return;
  const rankIndex=villageHeroes.find(row=>row.id===window.GameSelectedCharacter.id)?.rank_index ?? null;
  for(const [host,kind] of [[journeyPanel,'quest'],[epicPanel,'epic'],[raidPanel,'raid']])
    renderJourneyChoices(host,villageQuestTemplates,template=>openQuestLobby(template),kind,rankIndex);
  tickRaidCountdowns();
}
let raidRefreshPending=false,raidRefreshRetryAt=0;
setInterval(()=>{
  if(!signedInUser||!tickRaidCountdowns()||raidRefreshPending||Date.now()<raidRefreshRetryAt)return;
  raidRefreshPending=true;raidRefreshRetryAt=Date.now()+15000;
  api('/quest-templates').then(templates=>{villageQuestTemplates=templates;renderQuestCards();for(const template of templates)questLobby?.refreshTemplate(template);})
    .catch(error=>{$('error').textContent=error.message;}).finally(()=>{raidRefreshPending=false;});
},1000);
const bulletinPanel=document.createElement('section');
const questLobby=GameQuestLobby({api,
  startSolo:(entry,heroId,type)=>GameUI.rankedDeparture(accept=>type==='contract'
    ? api('/contracts/'+entry.id+'/accept',{adventurer_ids:[heroId],accept_rank_risk:accept},undefined,60000)
    : api('/encounters',{adventurer_ids:[heroId],template_slug:entry.slug,accept_rank_risk:accept},undefined,60000)),
  onEncounter:data=>render(data),
  recoverDeparture:async(heroId,partyId)=>{
    const [heroes,parties]=await Promise.all([api('/adventurers'),api('/parties')]);
    villageHeroes=heroes;villageParties=parties;characterWorkspace.update(heroes);questLobby.update(heroes,parties);updateHome();
    const active=heroes.find(row=>String(row.id)===String(heroId))?.active_encounter_id || parties.find(row=>String(row.id)===String(partyId))?.active_encounter_id;
    return active?api('/encounters/'+encodeURIComponent(active)):null;
  },
  refreshParties:async()=>{villageParties=await api('/parties');friendFeedError=false;questLobby.update(villageHeroes,villageParties);updateHome();return villageParties;},
  goBack:kind=>questTabs.select(kind==='contract'?'bulletin':kind==='epic'?'epics':kind==='raid'?'raids':'quest-list')
});
$('discord-login').onclick = () => { location.href = GameApi.baseUrl + '/auth/discord/login'; };
$('discord-recovery-form').onsubmit = event => {
  event.preventDefault();
  const password = $('discord-new-password').value;
  sessionStorage.setItem('discord-recovery-password', password);
  location.href = GameApi.baseUrl + '/auth/discord/login?purpose=recovery';
};
const openQuestLobby=async(entry,type='template')=>{
  questLobby.update(villageHeroes,villageParties);questLobby.open(entry,type);questTabs.select('lobby');
  try {
    const [freshHeroes,freshParties]=await Promise.all([api('/adventurers'),api('/parties')]);
    villageHeroes=freshHeroes;villageParties=freshParties;
    characterWorkspace.update(villageHeroes);questLobby.update(villageHeroes,villageParties);updateQuestRankHeader();
  } catch(error) {$('error').textContent=error.message;}
};
const drawBulletin=GameBulletin(bulletinPanel,contract=>openQuestLobby(contract,'contract'));
const bestiary=document.createElement('section'); bestiary.append(...villageArea.querySelectorAll('details'));
const rosterStore=$('roster');rosterStore.hidden=true;$('game').append(rosterStore);
villageArea.remove();
const noEncounter=document.createElement('p'); noEncounter.id='no-encounter'; noEncounter.textContent='Your next adventure starts in Quests. An active encounter will appear here.';
const questResults=GameQuestResults($('quest-results'),()=>{localStorage.removeItem(savedKey());location.href='./index.html?village=1';});
const villageHost=document.createElement('div');villageHost.className='menu-shell'; $('game').append(villageHost);
const homePanel=GameHome({news:window.VillageNews || [],
  navigate:destination=>{
    if(!signedInUser) { $('login-panel').scrollIntoView({behavior:'smooth'});$('username').focus();return; }
    villageTabs.select('journeys');questTabs.select(destination==='expeditions' ? 'quest-list' : destination);
    $('panel-journeys').scrollIntoView({behavior:'smooth'});
  },
  manageFriends:()=>{
    if(!signedInUser) {$('username').focus();return;}
    const selected=characterWorkspace.selected();
    if(selected) openCharacter(selected,'friends');
    else {villageTabs.select('character');$('name').focus();}
  },
  resume:id=>{if(id)run(async()=>render(await api('/encounters/'+encodeURIComponent(id))));}
});
const questContent=document.createElement('div');
const questTabs=GameUI.tabs(questContent,[
  {key:'quest-list',label:'Journeys',nodes:[journeyPanel]},
  {key:'bulletin',label:'Bulletin Board',nodes:[bulletinPanel]},
  {key:'epics',label:'Epics',nodes:[epicPanel]},
  {key:'raids',label:'Raids',nodes:[raidPanel]},
  {key:'lobby',label:'Quest Lobby',nodes:[questLobby]}
]);
const questSwipeKeys=['quest-list','bulletin','epics','raids'];
let questSwipeStart=null;
questContent.addEventListener('touchstart',event=>{
  if(!matchMedia('(max-width:720px)').matches || event.touches.length!==1 || event.target.closest('input,select,textarea,dialog,[draggable="true"]'))return;
  if(event.target.closest('button') && !event.target.closest('.tabs'))return;
  questSwipeStart={x:event.touches[0].clientX,y:event.touches[0].clientY,time:Date.now()};
},{passive:true});
questContent.addEventListener('touchend',event=>{
  if(!questSwipeStart || !event.changedTouches.length)return;
  const swipe=questSwipeStart;questSwipeStart=null;
  const dx=event.changedTouches[0].clientX-swipe.x,dy=event.changedTouches[0].clientY-swipe.y;
  if(Math.abs(dx)<70 || Math.abs(dx)<Math.abs(dy)*1.5 || Date.now()-swipe.time>800)return;
  const bar=questContent.querySelector(':scope > .tabs');
  const current=bar.querySelector('[aria-selected="true"]')?.getAttribute('aria-controls')?.replace('panel-','');
  const next=questSwipeKeys[questSwipeKeys.indexOf(current)+(dx<0?1:-1)];
  if(!next || !questSwipeKeys.includes(current))return;
  questTabs.select(next);
  const button=bar.querySelector(`[aria-controls="panel-${next}"]`);
  bar.scrollLeft=button.offsetLeft-bar.offsetLeft-(bar.clientWidth-button.clientWidth)/2;
  $('panel-journeys').scrollTop=0;
},{passive:true});
questContent.addEventListener('touchcancel',()=>{questSwipeStart=null;},{passive:true});
const questRankHeader=document.createElement('div');questRankHeader.className='quest-current-rank';questContent.prepend(questRankHeader);
function updateQuestRankHeader(){
  const hero=villageHeroes.find(row=>row.id===window.GameSelectedCharacter.id);
  questRankHeader.replaceChildren();
  const label=document.createElement('span');label.textContent='CURRENT ADVENTURER';
  const name=document.createElement('strong');name.textContent=hero?hero.name:'Choose a character';
  const rank=document.createElement('b');rank.textContent=hero?`${hero.rank} rank`:'No rank selected';rank.dataset.rank=(hero?.rank||'none').toLowerCase();
  questRankHeader.append(label,name,rank);
}
updateQuestRankHeader();
auctionPanel=GameAuctionHouse({api});
const villageShop=document.createElement('section');
villageShop.innerHTML=`<style>.village-shop{--ink:#f2eee7;--muted:#9b9a94;--edge:#373a3c;--panel:#1b2022;--gold:#d7b474;color:var(--ink)}.village-shop-hero{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;padding:24px;border:1px solid var(--edge);background:linear-gradient(120deg,#252b2a,#171c1e);border-radius:7px}.village-shop-hero h2{font:500 30px Georgia,serif;margin:3px 0}.village-shop-hero p{color:var(--muted);font-size:12px;margin:0}.village-shop-kicker{color:var(--gold);font-size:10px;letter-spacing:.18em;text-transform:uppercase}.village-shop-controls{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap}.village-shop-controls label{display:grid;gap:5px;font-size:10px;text-transform:uppercase}.village-shop-controls select{min-width:190px;background:#111618}.village-shop-controls button{border-radius:3px;background:transparent;color:var(--muted);border-color:var(--edge);font-size:12px}.village-shop-tabs{display:flex;gap:4px;margin:18px 0 12px;border-bottom:1px solid var(--edge)}.village-shop-tabs button{border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;color:var(--muted);padding:10px 14px;font-size:12px}.village-shop-tabs button[aria-selected=true]{color:var(--gold);border-bottom-color:var(--gold)}.village-shop-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.village-shop-card{display:flex;flex-direction:column;min-height:150px;padding:15px;background:var(--panel);border:1px solid var(--edge);border-radius:5px}.village-shop-card h3{font:500 17px Georgia,serif;margin:8px 0 3px}.village-shop-card p,.village-shop-card small{font-size:11px;color:var(--muted);margin:0 0 14px}.village-shop-card footer{display:flex;justify-content:space-between;align-items:center;margin-top:auto}.village-shop-price{color:var(--gold);font-size:13px}.village-shop-status{min-height:20px;color:#8fc39a;font-size:12px}.village-shop-empty{padding:42px;text-align:center;color:var(--muted);border:1px dashed var(--edge)}@media(max-width:640px){.village-shop-hero{display:block;padding:18px}.village-shop-controls{margin-top:18px}.village-shop-controls select{min-width:0;width:100%}}</style><div class="village-shop"><div class="village-shop-hero"><div><p class="village-shop-kicker">Mosswood Exchange</p><h2>Village Shops</h2><p>Outfit your next expedition with supplies from local merchants.</p></div><div class="village-shop-controls"><label>Village<select data-shop-village></select></label><span>Shopping as <strong data-shop-hero>No character selected</strong></span><button data-shop-refresh type="button">Refresh stock</button></div></div><div class="village-shop-tabs" role="tablist"></div><p class="village-shop-status" data-shop-status role="status"></p><div class="village-shop-grid" data-shop-items></div></div>`;
const shopHero=villageShop.querySelector('[data-shop-hero]'),shopVillage=villageShop.querySelector('[data-shop-village]'),shopItems=villageShop.querySelector('[data-shop-items]'),shopStatus=villageShop.querySelector('[data-shop-status]'),shopTabs=villageShop.querySelector('.village-shop-tabs');let villageShopCatalog=null,villageShopVillages=[],shopCategory='gear';
const shopRefreshTimer=document.createElement('small');shopRefreshTimer.className='raid-countdown';shopRefreshTimer.setAttribute('role','timer');shopRefreshTimer.hidden=true;villageShop.querySelector('.village-shop-controls').append(shopRefreshTimer);
function updateShopRefreshTimer(){const village=villageShopVillages.find(v=>v.slug===shopVillage.value)||villageShopVillages[0],shop=village?.shops?.[0];shopRefreshTimer.hidden=!shop?.resets_at;if(!shop?.resets_at)return;shopRefreshTimer.dataset.resetAt=shop.resets_at;shopRefreshTimer.dataset.serverTime=shop.server_time||new Date().toISOString();shopRefreshTimer.dataset.anchorTime=String(Date.now());shopRefreshTimer.title='Stock refreshes '+new Date(shop.resets_at).toLocaleString();tickShopRefreshTimer();}
function tickShopRefreshTimer(){if(shopRefreshTimer.hidden)return false;const initial=Date.parse(shopRefreshTimer.dataset.resetAt)-Date.parse(shopRefreshTimer.dataset.serverTime),left=Math.max(0,initial-(Date.now()-Number(shopRefreshTimer.dataset.anchorTime)));if(left===0){shopRefreshTimer.textContent='Refreshing shop stock…';return true;}const seconds=Math.ceil(left/1000),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60),remainder=seconds%60;shopRefreshTimer.textContent=`Stock refresh in ${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(remainder).padStart(2,'0')}`;return false;}
new MutationObserver(updateShopRefreshTimer).observe(shopStatus,{childList:true});shopVillage.addEventListener('change',updateShopRefreshTimer);
let shopRefreshRetryAt=0;
setInterval(()=>{if(tickShopRefreshTimer()&&$('tab-shop')?.getAttribute('aria-selected')==='true'&&Date.now()>=shopRefreshRetryAt){shopRefreshRetryAt=Date.now()+15000;refreshShop();}},1000);
function drawVillageShop(){const shopper=villageHeroes.find(h=>h.id===window.GameSelectedCharacter.id&&h.is_alive);shopHero.textContent=shopper?.name||'No character selected';shopTabs.replaceChildren(...Object.keys(villageShopCatalog||{}).map(category=>{const b=document.createElement('button');b.type='button';b.textContent=category==='gear'?'Armor & accessories':category[0].toUpperCase()+category.slice(1);b.setAttribute('aria-selected',String(shopCategory===category));b.onclick=()=>{shopCategory=category;drawVillageShop();};return b;}));shopItems.replaceChildren();const items=villageShopCatalog?.[shopCategory]||[];if(!items.length){const empty=document.createElement('div');empty.className='village-shop-empty';empty.textContent=villageShopCatalog?'No stock in this department.':'Open the shop to load today\'s stock.';shopItems.append(empty);return;}for(const item of items){const card=document.createElement('article');card.className='village-shop-card';const small=document.createElement('small');small.textContent=item.slot||item.item_type||shopCategory;const title=document.createElement('h3');title.textContent=item.name;const desc=document.createElement('p');desc.textContent=item.base_damage?`${item.base_damage} base damage`:item.description||Object.entries(item.bonuses||{}).map(([k,v])=>`${k} +${v}`).join(' · ')||'Ready for your next journey.';const foot=document.createElement('footer'),price=document.createElement('span');price.className='village-shop-price';price.textContent=`${item.price} gold`;const buy=document.createElement('button');buy.textContent='Purchase';buy.disabled=!shopper;buy.onclick=()=>run(async()=>{const result=await api('/shop/purchase',{adventurer_id:window.GameSelectedCharacter.id,item_type:item.item_type,item_slug:item.slug,quantity:1});shopStatus.textContent=result.message;await refreshShop();await loadAccount(await api('/auth/me'));});foot.append(price,buy);if(window.GameIcons)card.append(GameIcons.element(item.icon_path));card.append(small,title,desc,foot);shopItems.append(card);}}
async function refreshShop(){try{villageShopVillages=await api('/shop/villages');shopVillage.replaceChildren(...villageShopVillages.map(v=>new Option(v.name,v.slug)));if(!shopVillage.value&&shopVillage.options.length)shopVillage.selectedIndex=0;const village=villageShopVillages.find(v=>v.slug===shopVillage.value)||villageShopVillages[0],shop=village?.shops?.[0];villageShopCatalog=Object.fromEntries((shop?.tables||[]).map(table=>[table.category,table.items]));drawVillageShop();shopStatus.textContent=village&&shop?`${village.name} · ${shop.name} stock refreshed.`:'No village shops are configured.';}catch(e){shopStatus.textContent=e.message;}}
shopVillage.onchange=()=>{const village=villageShopVillages.find(v=>v.slug===shopVillage.value),shop=village?.shops?.[0];villageShopCatalog=Object.fromEntries((shop?.tables||[]).map(table=>[table.category,table.items]));drawVillageShop();};
villageShop.querySelector('[data-shop-refresh]').onclick=refreshShop;
const developerPanel=document.createElement('section');developerPanel.className='worldsmith-loading';developerPanel.textContent='Worldsmith loads when you open it.';
let worldsmithWorkspace=null,worldsmithPromise=null;
function loadWorldsmithScript(file){
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=`./${file}?v=live-ability-icons3`;
    script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error('Could not load Worldsmith. Open the tab again to retry.'));};
    document.head.append(script);
  });
}
function ensureWorldsmith(){
  if(worldsmithWorkspace)return Promise.resolve(worldsmithWorkspace);
  if(!worldsmithPromise)worldsmithPromise=(async()=>{
    developerPanel.textContent='Loading Worldsmith…';
    await Promise.all(['ability_designer.js','weapon_designer.js','armor_designer.js'].map(loadWorldsmithScript));
    await loadWorldsmithScript('catalog_editor.js');
    await loadWorldsmithScript('debug.js');
    worldsmithWorkspace=GameDebug(api);developerPanel.replaceWith(worldsmithWorkspace);
    return worldsmithWorkspace;
  })().catch(error=>{worldsmithPromise=null;developerPanel.textContent=error.message;throw error;});
  return worldsmithPromise;
}
const gauntletPanel=GameGauntlet({api,onEncounter:data=>render(data)});
const gauntletSummary=document.createElement('button');gauntletSummary.type='button';gauntletSummary.textContent='Gauntlet Run Summary';gauntletSummary.hidden=true;
gauntletSummary.onclick=()=>{villageTabs.select('gauntlet');gauntletPanel.showRun(encounter.gauntlet.id);};
$('return-village').after(gauntletSummary);
const villageTabs=GameUI.tabs(villageHost,[
  {key:'home',label:'Home',nodes:[homePanel]},
  {key:'journeys',label:'Quests',nodes:[questContent]},
  {key:'character',label:'Character',nodes:[characterWorkspace]},
  {key:'account',label:'Account',nodes:[$('account-page')]},
  {key:'auction-house',label:'Auction House',nodes:[auctionPanel]},
  {key:'shop',label:'Village Shops',nodes:[villageShop]},
  {key:'worldsmith',label:'Worldsmith',nodes:[developerPanel]},
  {key:'gauntlet',label:'Gauntlet',nodes:[gauntletPanel]},
  {key:'encounter',label:'Encounter',nodes:[noEncounter,$('combat'),$('quest-results'),$('log').closest('section')]},
  {key:'bestiary',label:'Bestiary & Testing',nodes:[bestiary]}
],undefined,{mobileNav:{label:'Village navigation',primary:['home','journeys','character','gauntlet'],icons:{home:'home',journeys:'map',character:'person',gauntlet:'shield'}}});
new MutationObserver(()=>{if($('tab-auction-house').getAttribute('aria-selected')==='true')auctionPanel.refresh();}).observe($('tab-auction-house'),{attributes:true,attributeFilter:['aria-selected']});
new MutationObserver(()=>{if($('tab-shop')?.getAttribute('aria-selected')==='true')refreshShop();}).observe($('tab-shop'),{attributes:true,attributeFilter:['aria-selected']});
new MutationObserver(()=>{if($('tab-worldsmith')?.getAttribute('aria-selected')==='true')ensureWorldsmith().then(panel=>{if($('tab-worldsmith').getAttribute('aria-selected')==='true')panel.refresh();}).catch(()=>{});}).observe($('tab-worldsmith'),{attributes:true,attributeFilter:['aria-selected']});
new MutationObserver(()=>{if($('tab-gauntlet')?.getAttribute('aria-selected')==='true')gauntletPanel.refresh();}).observe($('tab-gauntlet'),{attributes:true,attributeFilter:['aria-selected']});
$('public-home').append(homePanel);
GameUI.hint($('wait'),'Spend your action waiting. Enemies still act, and turn cooldowns advance.');
GameUI.hint($('target'),'Choose a living enemy as your primary target, or let the server choose.');
const discordRedirect = GameApi.consumeDiscordRedirect?.();
if (discordRedirect?.linked) $('discord-link-message').textContent = 'Discord account linked.';
if (discordRedirect?.recovery) {
  const password = sessionStorage.getItem('discord-recovery-password');
  sessionStorage.removeItem('discord-recovery-password');
  if (password) run(async () => {
    await api('/password/reset-with-discord', {discord_access_token: discordRedirect.token, new_password: password});
    $('discord-recovery-status').textContent = 'Password reset. You can now sign in with your new password.';
  });
  else $('discord-recovery-status').textContent = 'Enter a new password before starting recovery.';
}
const startupToken=GameApi.liveToken();
if(startupToken)GameApi.request('/auth/me').then(user=>{
  if(GameApi.liveToken()===startupToken && !signedInUser && !loginRequested)return loadAccount(user);
}).catch(error=>{if(error.status!==401 && !signedInUser && !loginRequested)$('error').textContent=error.message;});
