window.GameQuestResults=function(host,onLeave){
  const el=(tag,text,cls)=>{const node=document.createElement(tag);node.textContent=text;if(cls)node.className=cls;return node;};
  const number=value=>Number(value||0).toLocaleString();
  function bars(title,entries){
    const section=el('section','','results-card');section.append(el('h3',title));
    if(!entries?.length){section.append(el('p','No recorded damage.'));return section;}
    const max=Math.max(...entries.map(entry=>entry.damage),1);
    for(const entry of entries){const row=el('div','','results-bar-row'),label=el('span',entry.type),track=el('div','','results-bar-track'),fill=el('div','','results-bar-fill'),value=el('strong',number(entry.damage));fill.style.width=(entry.damage/max*100)+'%';track.append(fill);row.append(label,track,value);section.append(row);}
    return section;
  }
  function lootItem(item){const row=el('li','','results-loot-item');row.dataset.rarity=item.rarity||'common';row.append(el('strong',item.name||item.consumable_slug||'Item'));
    if(item.rarity)row.append(el('small',item.rarity.toUpperCase()+' · '+(item.effect_slots??({common:0,uncommon:1,rare:2,epic:3,legendary:4}[item.rarity]||0))+' empty effect slots'));
    if(item.quantity)row.append(el('small','x'+item.quantity));return row;}
  function render(data){
    host.replaceChildren();host.hidden=false;
    const outcome=data.status==='victory'?'COMPLETE':data.status==='returned'?'RETURNED SAFELY':'DEFEATED';
    const head=el('div','','results-heading'),eyebrow=el('p',(data.kind||'quest').toUpperCase()+' · '+outcome,'eyebrow'),title=el('h2',data.title||'Quest results'),meta=el('p',`${data.encounters} encounters · ${data.status.replaceAll('_',' ')}`),leave=el('button','Return to Village');leave.type='button';leave.dataset.localControl='';leave.onclick=onLeave;head.append(eyebrow,title,meta,leave);host.append(head);
    const totals=el('div','','results-totals');for(const [key,label] of [['damage_dealt','Damage dealt'],['damage_received','Damage received'],['healing_done','Healing done'],['healing_received','Healing received']]){const card=el('div','','results-metric');card.append(el('small',label),el('strong',number(data.totals?.[key])));totals.append(card);}host.append(totals);
    const charts=el('div','','results-charts');charts.append(bars('Damage dealt by enemy type',data.damage_by_enemy_type),bars('Damage received by enemy type',data.received_by_enemy_type));host.append(charts);
    const party=el('section','','results-card');party.append(el('h3','Party performance'));for(const member of data.party||[]){const row=el('div','','results-party-row');row.append(el('strong',member.name),el('span',number(member.damage_dealt)+' dealt'),el('span',number(member.damage_received)+' received'),el('span',number(member.healing_done)+' healed'));party.append(row);}host.append(party);
    const rolls=el('section','','results-card');rolls.append(el('h3','Party loot rolls'),el('p',data.loot_rolls?.length?'Each cleared group made one saved loot roll. The result is granted to each eligible survivor when the run is claimed.':'This quest had no party item rolls.'));
    for(const roll of data.loot_rolls||[]){const row=el('div','','results-roll');row.append(el('strong','Group '+roll.group+' · '+roll.tier),el('small',roll.drop_chance_percent+'% drop chance'));if(roll.item){const list=el('ul','','results-loot-list');list.append(lootItem(roll.item));row.append(list);}else row.append(el('span','No item dropped'));rolls.append(row);}host.append(rolls);
    const loot=el('section','','results-card');loot.append(el('h3','Individual loot & rewards'));for(const member of data.individual_loot||[]){const card=el('div','','results-individual');card.append(el('strong',member.name));if(member.gains?.gold||member.gains?.experience)card.append(el('small',`${number(member.gains.gold)} gold · ${number(member.gains.experience)} XP`));const list=el('ul','','results-loot-list');if(member.items?.length)for(const item of member.items)list.append(lootItem(item));else list.append(el('li','No items awarded'));card.append(list);loot.append(card);}host.append(loot);
  }
  return {render};
};
