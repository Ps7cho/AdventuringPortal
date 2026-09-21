const $ = id => document.getElementById(id);
const characterParams = new URLSearchParams(location.search);
const id = characterParams.get('id');
if(characterParams.has('embedded'))document.body.classList.add('embedded-character');
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let hero, currentParty = null, cachedInvite = null, partyBusy = false;
let partyRefreshing = false, sheetBusy = false;
const partyKey = 'selected-party:' + id;
async function api(path, body) {
  try { return await GameApi.request(path, body); }
  catch (error) { if (error.status === 401) location.href = './index.html'; throw error; }
}
function silhouette() {
  return `<svg class="hero-silhouette" viewBox="0 0 300 480" role="img" aria-label="Adventurer silhouette"><ellipse cx="150" cy="452" rx="86" ry="12" fill="#090f18"/><circle cx="150" cy="65" r="32" fill="#657b89"/><path d="M127 94 L173 94 180 112 213 124 237 223 219 271 200 263 207 219 188 165 185 267 201 420 180 440 159 433 149 310 139 433 115 440 99 420 114 267 111 165 92 219 100 263 81 271 64 223 87 124 120 112 Z" fill="#425b69" stroke="#8da9b4" stroke-opacity=".3" stroke-width="2"/><path d="M120 116 L150 153 180 116 M114 259 L185 259" fill="none" stroke="#a9c8ca" stroke-opacity=".25" stroke-width="3"/></svg>`;
}
function renderOverview() {
  const p=hero.progression, stats=hero.derived_stats || {};
  const strongest=Object.entries(hero.attributes).sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0])).slice(0,3);
  const weapon=hero.equipment['Main Hand'];
  const ready=hero.equipped_ability_ids.map(id=>hero.abilities.find(a=>a.id===id)).filter(Boolean);
  const essences=hero.essences || [];
  const palette={'essence-dark':'#ba9de9','essence-holy':'#e8cf93','essence-magic':'#a6baff','essence-sin':'#d896b1','essence-swift':'#97dfce','essence-fire':'#eab28b','essence-blood':'#e89999','essence-balance':'#c8d8b1','essence-might':'#d1bb91'};
  const color=palette[essences[0]?.slug] || '#94d9c5';
  const format=value=>Number(value || 0).toLocaleString(undefined,{maximumFractionDigits:1});
  const bonusCards=[['Critical chance',stats.critical_chance_percent,'%'],['Flinch chance',stats.flinch_chance_percent,'%'],['Damage reduction',stats.damage_reduction_percent,'%']].filter(([,value])=>value!==undefined);
  $('progression-panel').style.setProperty('--soul-color',color);
  $('progression-panel').innerHTML=`
    <div class="adventurer-stage">
      <div class="soul-portrait">
        ${silhouette()}
      </div>
      <div class="adventurer-identity">
        <div class="profile-strengths"><h2>Standout attributes</h2><div>${strongest.map(([name,value])=>`<span tabindex="0" data-profile-attribute="${escape(name)}"><strong>${value}</strong>${escape(name)}</span>`).join('')}</div></div>
        <div class="profile-progress"><div><span>Experience</span><span>${format(p.xp_to_level)} XP to level ${hero.level+1}</span></div><progress aria-label="Level experience" value="${p.level_xp}" max="${p.level_xp_required}"></progress><small>${p.next_rank ? format(p.xp_to_rank) + ' XP to ' + escape(p.next_rank) : 'Legendary rank achieved'}</small></div>

      </div>
    </div>
    <div class="profile-details">
      <article class="profile-card"><div class="profile-card-heading"><h2>Essences</h2><span>${essences.length} / ${hero.essence_limit}</span></div>
        ${essences.length ? `<div class="profile-essences">${essences.map(e=>{
          return `<div class="profile-essence" style="--mark-color:${palette[e.slug] || '#9daec4'}"><span class="essence-sigil" aria-hidden="true">${escape(e.name.charAt(0))}</span><div><strong>${escape(e.name)}${e.active?'':' <small>(retired)</small>'}</strong></div></div>`;
        }).join('')}</div>` : '<p class="profile-empty">No essences absorbed yet.</p>'}
      </article>
      <article class="profile-card"><div class="profile-card-heading"><h2>Equipped abilities</h2></div><div class="profile-abilities">${ready.map((ability,i)=>`<div tabindex="0" data-profile-ability="${escape(ability.id)}"><span>${String(i+1).padStart(2,'0')}</span><strong>${escape(ability.name)}</strong></div>`).join('') || '<p class="profile-empty">No abilities equipped.</p>'}</div></article>
      <article class="profile-card"><div class="profile-card-heading"><h2>At a glance</h2><span>${format(hero.gold)} gold</span></div><p class="profile-weapon">${weapon ? escape(weapon.name) : 'Unarmed'}<small>${weapon ? weapon.base_damage + ' base damage &middot; ' + escape(weapon.weapon_type || '') : 'No weapon equipped'}</small></p><dl class="profile-combat">${bonusCards.map(([name,value,unit])=>`<div><dt>${name}</dt><dd>${format(value)}${unit}</dd></div>`).join('')}</dl></article>
    </div>`;
  $('progression-panel').querySelectorAll('[data-profile-attribute]').forEach(el=>GameUI.hint(el,hero.attribute_descriptions?.[el.dataset.profileAttribute] || ''));
  $('progression-panel').querySelectorAll('[data-profile-ability]').forEach(el=>GameUI.hint(el,ready.find(a=>a.id===el.dataset.profileAbility).description));
}

function setControls(busy) {
  if(!busy) queueMicrotask(flushVillage);
  sheetBusy = busy;
  $('long-rest').disabled=busy || !hero?.is_alive || Boolean(hero?.active_encounter_id);
}
$('long-rest').onclick=async()=>{
  setControls(true); $('error').textContent='';
  try { const result=await api('/adventurers/' + id + '/rest',{}); await load(); $('rest-status').textContent=result.message; }
  catch(error) { $('error').textContent=error.message; setControls(false); }
};
let profileQueue=Promise.resolve(), pendingVillage=null;
const villageStatus=document.createElement('small'); villageStatus.id='village-live-status'; $('party-status').after(villageStatus);
const villageLive=window.GameLive?.village?.(GameApi.baseUrl,()=>GameApi.liveToken?.(),data=>{
  if(data.adventurer?.id!==id) return;
  pendingVillage=data; flushVillage();
},value=>{villageStatus.textContent=value;},id) || {watch(){},close(){}};
function flushVillage() {
  if(!pendingVillage || !hero || partyBusy || sheetBusy) return;
  const data=pendingVillage;pendingVillage=null;
  if(JSON.stringify(hero)!==JSON.stringify(data.adventurer)) load(data).catch(error=>{$('error').textContent=error.message;});
  else loadParty(data.parties).catch(error=>{$('party-status').textContent=error.message;});
}
function load(snapshot=null) {
  const task=profileQueue.catch(()=>{}).then(()=>renderSheet(snapshot));profileQueue=task;return task;
}
async function renderSheet(snapshot) {
  const slots=[...document.querySelectorAll('#loadout select')];
  const drafts=snapshot && !snapshot.adventurer.active_encounter_id ? [...document.querySelectorAll('#loadout select')].map(input=>{
    const saved=hero.equipped_ability_ids[slots.indexOf(input)] || '';
    return input.value===saved ? null : input.value;
  }) : null;
  hero = snapshot?.adventurer || await api('/adventurers/' + id);
  document.title = hero.name + ' - Adventurer'; $('name').textContent = hero.name;
  $('summary').textContent = `Level ${hero.level} | ${hero.health} / ${hero.max_health} HP | ${hero.progression.rank} Rank | ${hero.is_alive ? (hero.health > 0 ? 'Alive' : 'Downed') : 'Dead'} | ${hero.active_encounter_id ? 'On an adventure' : 'In the village'}`;
  $('character-statuses').replaceChildren(...(hero.statuses || []).map(s => {
    const badge=document.createElement('span'); badge.textContent=GameUI.statusLabel(s);
    GameUI.hint(badge,GameUI.statusHint(s)); return badge;
  }));
  $('health').value = hero.health; $('health').max = hero.max_health;
  renderOverview();
  $('attribute-points').textContent=hero.progression.attribute_points + ' unspent points | +3 each level. Attributes combine to shape combat. Hover a stat for its effects.';
  $('stats').innerHTML = Object.entries(hero.attributes).map(([name,value]) => `<div class="stat">${escape(name)}<strong>${value}</strong><button type="button" data-attribute="${escape(name)}" ${hero.progression.attribute_points < 1 || hero.active_encounter_id ? 'disabled' : ''} aria-label="Add one ${escape(name)} point">+1</button></div>`).join('');
  $('stats').querySelectorAll('.stat').forEach(stat=>GameUI.hint(stat,hero.attribute_descriptions?.[stat.querySelector('[data-attribute]').dataset.attribute] || ''));
  $('stats').querySelectorAll('[data-attribute]').forEach(button=>button.onclick=async()=>{
    button.disabled=true;
    try {await api('/adventurers/' + id + '/attributes',{allocations:{[button.dataset.attribute]:1}});await load();}
    catch(error){$('error').textContent=error.message; await load();}
  });
  $('combat-stats').textContent = hero.derived_stats && Object.keys(hero.derived_stats).length ? `Critical chance ${hero.derived_stats.critical_chance_percent || 0}% | Flinch chance ${hero.derived_stats.flinch_chance_percent || 0}% | Weapon damage +${hero.derived_stats.weapon_bonus_percent}% | Nonweapon damage +${hero.derived_stats.spell_bonus_percent}% | Ability healing +${hero.derived_stats.healing_bonus_percent}% | Damage reduction ${hero.derived_stats.damage_reduction_percent}% | Guard +${hero.derived_stats.guard_bonus} | DOT resistance ${hero.derived_stats.status_resistance_percent}%` : 'This saved adventure uses its original combat stats.';
  $('consumable-inventory').replaceChildren(...(hero.consumables || []).map(item=>{
    const row=document.createElement('div'); row.className='slot'; row.textContent=item.name + ' x' + item.quantity;
    GameUI.hint(row,item.description + (['essence','orb'].includes(item.effect) ? '' : ' Use from the Encounter tab.'));
    if(item.effect==='essence') {
      const definition=hero.essence_catalog.find(e=>e.slug===item.slug);
      if(definition) {
        const details=document.createElement('details'), summary=document.createElement('summary'); summary.textContent='Orb abilities'; details.append(summary);
        for(const recipe of hero.orb_options.filter(r=>r.essence_slug===item.slug)) {const text=document.createElement('p');text.textContent=recipe.name + ': ' + recipe.description;details.append(text);}
        row.append(details);
      } else row.append(document.createTextNode(' (retired)'));
      const button=document.createElement('button');button.textContent='Absorb permanently';
      button.disabled=!definition || Boolean(hero.active_encounter_id) || !hero.is_alive || hero.health<=0 || hero.essences.length>=hero.essence_limit || hero.essences.some(e=>e.slug===item.slug);
      button.onclick=async()=>{
        if(!window.confirm('Permanently absorb ' + item.name + '? This uses one of your three lifetime essence slots. Use orbs afterward to learn its abilities.')) return;
        button.disabled=true;
        try {await api('/adventurers/'+id+'/essences/'+encodeURIComponent(item.slug)+'/absorb',{});await load();}
        catch(error){$('error').textContent=error.message;await load();}
      };row.append(button);
    }
    if(item.effect==='orb') {
      const select=document.createElement('select');select.setAttribute('aria-label',item.name + ' target essence');
      const learned=new Set(hero.abilities.filter(a=>a.unlocked).map(a=>a.id));
      const recipes=hero.orb_options.filter(r=>r.orb_slug===item.slug && hero.essences.some(e=>e.slug===r.essence_slug && e.active));
      for(const recipe of recipes) {
        const essence=hero.essences.find(e=>e.slug===recipe.essence_slug);
        const option=new Option(essence.name + ' -> ' + recipe.name + (learned.has(recipe.ability_id) ? ' (learned)' : ''),recipe.essence_slug);
        option.disabled=learned.has(recipe.ability_id);select.append(option);
      }
      const available=recipes.find(r=>!learned.has(r.ability_id));
      if(available) select.value=available.essence_slug;
      const preview=document.createElement('p'),button=document.createElement('button');button.textContent='Use ' + item.name;
      const update=()=>{
        const recipe=recipes.find(r=>r.essence_slug===select.value);
        preview.textContent=recipe ? recipe.description : 'Absorb an available essence first.';
        button.disabled=!recipe || learned.has(recipe.ability_id) || Boolean(hero.active_encounter_id) || !hero.is_alive || hero.health<=0;
      };select.onchange=update;update();
      button.onclick=async()=>{
        button.disabled=true;
        try {const result=await api('/adventurers/'+id+'/essences/'+encodeURIComponent(select.value)+'/orbs/'+encodeURIComponent(item.slug)+'/use',{});await load();$('orb-status').textContent=result.message;}
        catch(error){$('error').textContent=error.message;await load();}
      };row.append(select,preview,button);
    }
    return row;
  }));
  equipmentInventory.render(hero, [...$('consumable-inventory').children]);
  $('essence-count').textContent=hero.essences.length + ' / ' + hero.essence_limit;
  $('absorbed-essences').replaceChildren(...Array.from({length:hero.essence_limit},(_,i)=>{
    const row=document.createElement('div');row.className='slot';const essence=hero.essences.find(e=>e.slot===i+1);
    row.textContent=essence ? essence.name + (essence.active ? '' : ' (retired)') : 'Empty essence slot ' + (i+1);
    if(essence) GameUI.hint(row,essence.active ? hero.orb_options.filter(r=>r.essence_slug===essence.slug).map(r=>r.name + ': ' + r.description).join('\n') : 'Retired essence: preserved from an earlier catalog.');
    return row;
  }));
  $('skills').innerHTML = hero.skills.length ? '<ul>' + hero.skills.map(s => `<li>${escape(s.name)}</li>`).join('') + '</ul>' : '<p class="muted">No skills learned.</p>';
  $('loadout').replaceChildren();
  for (let i=0; i<hero.progression.ability_slots; i++) {
    const label=document.createElement('label'); label.textContent='Slot ' + (i+1);
    const select=document.createElement('select'); select.name='ability'; select.setAttribute('aria-label','Ability slot ' + (i+1));
    select.append(new Option('Empty',''), ...hero.abilities.filter(a=>a.unlocked).map(a=>new Option(a.name,a.id)));
    select.value=hero.equipped_ability_ids[i] || ''; select.disabled=Boolean(hero.active_encounter_id);
    GameUI.dropZone(label,'application/x-game-ability',abilityId=>assignAbility(abilityId,i));
    label.append(select); $('loadout').append(label);
  }
  const save=document.createElement('button'); save.textContent='Save Loadout'; save.disabled=Boolean(hero.active_encounter_id); $('loadout').append(save);
  $('loadout-status').textContent=hero.active_encounter_id ? 'Loadout locked during adventure.' : '';
  $('abilities').className='ability-grid'; $('abilities').replaceChildren();
  for(const savedAbility of hero.abilities) {
    const ability={...savedAbility,...savedAbility.rank_values};
    const card=document.createElement('article'); card.className='ability-card'; card.tabIndex=0; card.dataset.abilityCard=ability.id;
    const name=document.createElement('strong'); name.textContent=ability.name;
    const badge=document.createElement('span'); badge.className='badge'; badge.textContent=hero.equipped_ability_ids.includes(ability.id)?'Equipped':ability.unlocked?'Learned':'Locked';
    const description=document.createElement('p'); description.textContent=ability.description || 'No description available.';
    const details=document.createElement('small'); details.textContent=ability.cooldown_value ? ability.cooldown_value + ' ' + ability.cooldown_type + ' cooldown' : 'No cooldown';
    GameUI.hint(card,ability.description + (ability.status_effect ? '\nApplies ' + ability.status_effect.name + ': ' + ability.status_effect.damage + ' damage/stack, ' + ability.status_effect.duration + ' rounds, max ' + ability.status_effect.max_stacks + ' stacks.' : '') + '\n' + (ability.requires_weapon ? 'Requires: ' + (ability.allowed_weapon_tags.join(' / ') || 'any weapon') : 'No weapon required') + '\n' + (ability.damage_multiplier==null ? 'Power: ' + ability.power : ability.damage_multiplier + ' x ' + (ability.requires_weapon?'weapon damage':'attack power')) + '\nTargets: ' + (ability.max_targets || 'all valid'));
    const equip=document.createElement('button'); equip.type='button'; equip.textContent='Add to Loadout'; equip.disabled=!ability.unlocked || Boolean(hero.active_encounter_id);
    equip.onclick=()=>{const slots=[...$('loadout').querySelectorAll('select')];const empty=slots.findIndex(s=>!s.value);assignAbility(ability.id,empty<0?0:empty);};
    if(ability.unlocked && !hero.active_encounter_id) GameUI.draggable(card,'application/x-game-ability',ability.id);
    const values=document.createElement('small');values.textContent=(ability.effect_type==='guard'?`Guard ${ability.guard_percent??60}%`:ability.damage_multiplier==null?`Power ${ability.power}`:`Multiplier ${ability.damage_multiplier}×`) + ` · Targets ${ability.max_targets??'all'}` + ((ability.effect_chain||[]).length?` · ${ability.effect_chain.length} follow-up effects`:'');
    card.append(badge,name,description,values,details,equip); $('abilities').append(card);
  }
  $('resume').hidden = !hero.active_encounter_id; $('resume').href = './index.html?encounter=' + hero.active_encounter_id;
  await loadParty(snapshot?.parties);
  if(drafts) [...document.querySelectorAll('#loadout select')].forEach((input,index)=>{if([...input.options].some(option=>option.value===drafts[index])) input.value=drafts[index];});
  $('loading').hidden = true; $('sheet').hidden = false; setControls(false);
}
function assignAbility(abilityId,index) {
  if(hero.active_encounter_id || !hero.abilities.some(a=>a.id===abilityId && a.unlocked)) return;
  const slots=[...$('loadout').querySelectorAll('select')];
  const source=slots.findIndex(s=>s.value===abilityId);
  const old=slots[index].value;
  if(source>=0 && source!==index) slots[source].value=old;
  slots[index].value=abilityId;
  $('loadout-status').textContent='Slot ' + (index+1) + ' updated. Save Loadout to apply your changes.';
}
function partyControls() {
  $('party-leave').disabled=partyBusy || !currentParty || Boolean(currentParty.active_encounter_id);
  $('copy-invite').disabled=partyBusy || Boolean(currentParty && !currentParty.is_leader);
  $('party-join').querySelector('button').disabled=partyBusy;
  $('party-refresh').disabled=partyBusy || partyRefreshing;
  $('party-ready').disabled=partyBusy || !currentParty?.selection || Boolean(currentParty?.active_encounter_id);
}
function selectParty(party) {
  $('party-selection').textContent=party?.selection ? party.selection.name+(party.selection.encounter_count ? ' - '+party.selection.encounter_count+' encounter(s)' : ' - Quest')+(party.selection.accept_rank_risk ? ' - Above-rank risk accepted' : '') : 'No encounter selected.';
  if(currentParty?.id !== party?.id) cachedInvite=null;
  currentParty=party;
  if(party) sessionStorage.setItem(partyKey,party.id);
  const self=party?.members.find(m=>m.id===id);
  $('party-ready').hidden=!self || Boolean(party.active_encounter_id);
  $('party-ready').textContent=self?.is_ready ? 'Cancel Ready' : 'Ready Up';
  $('party-status').textContent=!party ? 'No party selected.' : party.active_encounter_id ? 'Party adventure in progress.' :
    !party.selection ? 'Waiting for an encounter selection.' : party.all_ready ? 'Everyone is ready.' : 'Waiting for party members to ready up.';
  $('party-roster').innerHTML=party ? `<h3>${escape(party.name)} (${party.members.length}/${party.max_members})</h3><ul>${party.members.map(m=>
    `<li data-party-member="${escape(m.id)}"><strong>${escape(m.name)}</strong>${m.is_leader ? ' - Leader' : ''}${m.id===id ? ' - You' : ''} - ${m.health} HP - <span>${party.active_encounter_id ? 'In adventure' : !m.is_alive ? 'Defeated' : m.is_ready ? 'Ready' : 'Not ready'}</span></li>`).join('')}</ul>` : '';
  if(party?.active_encounter_id) {
    $('resume').hidden=false; $('resume').href='./index.html?encounter='+party.active_encounter_id;
  } else if(hero) { $('resume').hidden=!hero.active_encounter_id; }
  partyControls(); setControls(sheetBusy);
}
function renderFriends(parties) {
  const friends=new Map();
  for(const party of parties||[]) for(const member of party.members||[]) {
    if(member.is_yours)continue;
    const key=member.owner_id||member.id,record=friends.get(key)||{name:member.player||member.name,online:false,characters:new Set(),parties:new Set()};
    record.online=record.online||Boolean(member.is_online);record.characters.add(member.name);record.parties.add(party.name);friends.set(key,record);
  }
  const rows=[...friends.values()].sort((a,b)=>a.name.localeCompare(b.name));
  const draw=(host,online)=>{host.replaceChildren();for(const friend of rows.filter(row=>row.online===online)){const card=document.createElement('article');card.className='friend-card';const identity=document.createElement('div'),name=document.createElement('strong'),characters=document.createElement('p'),shared=document.createElement('small'),presence=document.createElement('span');name.textContent=friend.name;characters.textContent=[...friend.characters].join(' · ');shared.textContent='Shared parties: '+[...friend.parties].join(' · ');presence.className='friend-presence '+(online?'online':'offline');presence.textContent=online?'Online':'Offline';identity.append(name,characters,shared);card.append(presence,identity);host.append(card);}if(!host.children.length){const empty=document.createElement('p');empty.className='muted';empty.textContent=online?'No friends are online right now.':'Party members who are offline will appear here.';host.append(empty);}};
  draw($('online-friends'),true);draw($('offline-friends'),false);
  $('online-friend-count').textContent=rows.filter(row=>row.online).length;$('offline-friend-count').textContent=rows.filter(row=>!row.online).length;
}
async function loadParty(rows=null) {
  if(partyRefreshing) return;
  partyRefreshing=true;
  try {
  const allParties=rows || await api('/parties');renderFriends(allParties);
  const parties=allParties.filter(p=>p.members.some(m=>m.id===id));
  const selected=sessionStorage.getItem(partyKey);
  selectParty(selected==='solo' ? null : parties.find(p=>p.active_encounter_id && p.members.length>1) || parties.find(p=>p.id===selected && p.members.length>1) || null);
  } finally { partyRefreshing=false; partyControls(); }
}
async function partyTask(task) {
  if(partyBusy) return;
  partyBusy=true; partyControls(); $('error').textContent='';
  try { await task(); } catch(error) { $('error').textContent=error.message; }
  finally { partyBusy=false; partyControls(); flushVillage(); }
}
$('copy-invite').onclick=()=>partyTask(async()=>{
  if(!currentParty) {
    const party=await api('/parties',{adventurer_id:id,name:(hero.name + "'s party").slice(0,80)});
    selectParty(party); cachedInvite=party.invite;
  }
  if(!cachedInvite || Date.parse(cachedInvite.expires_at)<=Date.now()) {
    cachedInvite=await api('/parties/' + currentParty.id + '/invite',{});
  }
  try {
    await navigator.clipboard.writeText(cachedInvite.code);
    $('manual-invite').hidden=true;
    $('party-status').textContent='Invite code copied. Share it wherever you like.';
  } catch(error) {
    $('manual-invite').hidden=false;
    $('invite-fallback').value=cachedInvite.code; $('invite-fallback').focus(); $('invite-fallback').select();
    $('party-status').textContent='Clipboard access is unavailable. Copy the selected code manually.';
  }
});
$('party-join').onsubmit=event=>{
  event.preventDefault(); partyTask(async()=>{
    const party=await api('/parties/join',{adventurer_id:id,code:$('party-code').value.trim()});
    cachedInvite=null; $('manual-invite').hidden=true; $('party-code').value=''; selectParty(party);
  });
};
$('party-ready').onclick=()=>partyTask(async()=>{
  const self=currentParty.members.find(m=>m.id===id);
  selectParty(await api('/parties/'+currentParty.id+'/ready',{adventurer_id:id,ready:!self.is_ready,selection_revision:currentParty.selection_revision}));
});
$('party-refresh').onclick=()=>partyTask(loadParty);
$('friends-refresh').onclick=()=>partyTask(loadParty);
$('party-leave').onclick=()=>partyTask(async()=>{await api('/parties/'+currentParty.id+'/leave',{adventurer_id:id});sessionStorage.setItem(partyKey,'solo');selectParty(null);});
$('loadout').onsubmit=async event=>{
  event.preventDefault(); const button=$('loadout').querySelector('button'); button.disabled=true;
  try {
    await api('/adventurers/' + id + '/loadout', {ability_ids:[...$('loadout').querySelectorAll('select')].map(s=>s.value).filter(Boolean)});
    await load(); $('loadout-status').textContent='Loadout saved.';
  } catch(error) { $('error').textContent=error.message; button.disabled=false; }
};
const equipmentInventory=GameEquipmentInventory($('inventory-workspace'), {api, reload:()=>load(), id});
const characterTabs=document.createElement('div');characterTabs.className='menu-shell'; $('sheet').append(characterTabs);
const characterTabController=GameUI.tabs(characterTabs,[
  {key:'overview',label:'Overview',nodes:[$('progression-panel'),$('recovery-panel')]},
  {key:'attributes',label:'Attributes',nodes:[$('stats').closest('section')]},
  {key:'gear',label:'Equipment',nodes:[$('inventory-workspace'),$('orb-status')]},
  {key:'abilities',label:'Abilities',nodes:[$('loadout').closest('section'),$('abilities').closest('section'),$('essence-section'),$('skills').closest('section')]},
  {key:'friends',label:'Friends',nodes:[$('friends-directory'),$('copy-invite').closest('section')]}
]);
GameUI.hint($('long-rest'),'Rest in the village to restore health, clear status effects, and recover cooldowns. Available outside active adventures.');
GameUI.hint($('copy-invite'),'Copy an invitation to share with friends off platform.');
load().then(()=>villageLive.watch({id})).catch(error => { $('loading').hidden = true; $('error').textContent = error.message; });

const initialCharacterTab=decodeURIComponent(location.hash.slice(1));
if(['overview','attributes','gear','abilities','friends'].includes(initialCharacterTab))characterTabController.select(initialCharacterTab);
