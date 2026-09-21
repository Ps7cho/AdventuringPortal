window.GameEquipmentInventory = (host, {api, reload, id}) => {
  host.className='equipment-workspace';
  host.innerHTML=`<div class="inventory-heading"><div><p class="eyebrow">POCKET DIMENSION</p><h2>Equipment & Inventory</h2><p>Carry everything. Choose your default weapon and outfit here.</p></div><strong data-gold></strong></div>
    <p data-gear-status role="status"></p><div class="gear-layout"><aside class="outfit"><h3>Equipped</h3><div data-slots></div><div data-bonuses></div></aside>
    <div class="inventory-browser"><div class="inventory-tools"><label>Search <input data-search type="search" placeholder="Name, type, or attribute"></label><label>Category <select data-category><option value="all">All items</option><option value="weapon">Weapons</option><option value="gear">Armor & Accessories</option><option value="consumable">Consumables</option><option value="essence">Essences</option><option value="orb">Orbs</option><option value="soul">Souls</option><option value="other">Other</option></select></label><label>Sort <select data-sort><option value="name">Name</option><option value="equipped">Equipped first</option><option value="damage">Weapon damage</option></select></label></div>
    <p data-count aria-live="polite"></p><div data-items class="inventory-grid"></div></div>
    <aside data-inspector class="item-inspector" aria-label="Selected item"><p>Select an item to inspect it.</p></aside></div>`;
  const get=s=>host.querySelector(s), node=(tag,text,cls)=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
  let hero=null, entries=[], selected=null, busy=false, shop=[];
  const equipped=i=>Object.values(hero.equipment || {}).some(e=>e?.id===i.id);
  const blocked=()=>busy || !hero?.is_alive || hero?.health<=0 || Boolean(hero?.active_encounter_id);
  const rankAllowed=i=>{const rank=hero.progression?.ladder?.find(r=>r.name.toLowerCase()===i.required_rank);return !rank || rank.reached;};
  const bonuses=i=>Object.entries(i.bonuses || {}).map(([k,v])=>`${k} +${v}`).join(' ? ');
  function controls(){host.querySelectorAll('[data-mutate]').forEach(b=>b.disabled=blocked() || b.dataset.rankLocked==='true');}
  async function act(work,message){if(busy)return;busy=true;controls();get('[data-gear-status]').textContent='';try{await work();await reload();get('[data-gear-status]').textContent=message;}catch(e){get('[data-gear-status]').textContent=e.message;}finally{busy=false;controls();}}
  function change(item,remove=false){act(()=>api('/adventurers/'+id+(item.weapon_type?'/weapon':'/equipment'),item.weapon_type?{weapon_id:remove?null:item.id}:{slot:item.slot,gear_id:remove?null:item.id}),remove?'Item unequipped.':'Equipment saved.');}
  function inspect(){
    const pane=get('[data-inspector]');pane.replaceChildren();const item=entries.find(e=>e.key===selected);
    if(!item){pane.append(node('p','Select an item to inspect it.'));return;}
    pane.append(node('p',item.category.toUpperCase(),'eyebrow'),node('h3',item.name));
    if(item.description)pane.append(node('p',item.description));
    if(item.weapon_type || item.item_type==='gear'){
      const slot=item.weapon_type?'Main Hand':item.slot, current=hero.equipment[slot];
      pane.append(node('p',slot+' ? '+(item.required_rank || 'iron')+' rank'));
      if(item.weapon_type){pane.append(node('strong',item.base_damage+' base damage'),node('p',(item.tags || []).join(' ? ')));
        const difference=item.base_damage-(current?.base_damage || 0);pane.append(node('p',`${difference>=0?'+':''}${difference} base damage compared with ${current?.name || 'unarmed'}.`));
      }else{
        pane.append(node('p',bonuses(item)));
        const keys=new Set([...Object.keys(item.bonuses || {}),...Object.keys(current?.bonuses || {})]);
        const list=node('dl','','gear-comparison');
        for(const key of keys){const delta=(item.bonuses?.[key] || 0)-(current?.bonuses?.[key] || 0);list.append(node('dt',key),node('dd',`${delta>=0?'+':''}${delta}`));}pane.append(node('p','Compared with '+(current?.name || 'empty slot')),list);
      }
      const button=node('button',equipped(item)?'Unequip':item.weapon_type?'Set Default Weapon':'Equip');button.dataset.mutate='';button.dataset.rankLocked=String(!equipped(item) && !rankAllowed(item));button.onclick=()=>change(item,equipped(item));pane.append(button);
      if(!rankAllowed(item))pane.append(node('p','Requires '+item.required_rank+' rank.'));
      if(hero.active_encounter_id)pane.append(node('p','Return to the village to change your outfit. Owned weapons can still be selected in combat.'));
    }else if(item.actionNode){pane.append(item.actionNode);}
    else if(item.fallen){pane.append(node('p',item.fallen.rank+' ? Level '+item.fallen.level),node('p',(item.fallen.abilities || []).map(a=>a.name).join(', ')));}
    else pane.append(node('p','Quantity: '+(item.quantity || 1)));
    controls();
  }
  function draw(){
    if(!hero)return;
    const query=get('[data-search]').value.toLowerCase().trim(),category=get('[data-category]').value,sort=get('[data-sort]').value;
    const filtered=entries.filter(i=>(category==='all'||i.category===category)&&[i.name,i.weapon_type,i.slot,bonuses(i),...(i.tags || [])].join(' ').toLowerCase().includes(query));
    filtered.sort((a,b)=>(sort==='damage'?(b.base_damage || 0)-(a.base_damage || 0):sort==='equipped'?Number(equipped(b))-Number(equipped(a)):0)||a.name.localeCompare(b.name));
    get('[data-count]').textContent=filtered.length+' of '+entries.length+' item entries';
    const grid=get('[data-items]');grid.replaceChildren();
    for(const item of filtered){const b=node('button','','inventory-card');b.type='button';b.setAttribute('aria-pressed',String(selected===item.key));
      b.append(node('small',equipped(item)?'EQUIPPED':item.category.toUpperCase()),node('strong',item.name),node('span',item.weapon_type?item.base_damage+' damage':item.item_type==='gear'?item.slot+' ? '+bonuses(item):'? '+(item.quantity || 1)));
      b.onclick=()=>{selected=item.key;draw();};grid.append(b);}
    if(!filtered.length)grid.append(node('p',entries.length?'No items match these filters.':'Your pocket dimension is empty.'));
    inspect();
  }
  function render(newHero,actions){
    hero=newHero;entries=[...(hero.inventory || []).map((raw,index)=>{const i=typeof raw==='string'?{name:raw}:raw;return {...i,name:i.name || i.type || 'Item',key:i.id || 'legacy:'+index,category:i.weapon_type?'weapon':i.item_type==='gear'?'gear':i.type==='soul'?'soul':'other'};}),
      ...(hero.consumables || []).map((i,index)=>({...i,key:'consumable:'+i.slug,category:['orb','essence'].includes(i.effect)?i.effect:'consumable',actionNode:actions[index]}))];
    if(selected && !entries.some(e=>e.key===selected))selected=null;
    get('[data-gold]').textContent=hero.gold+' gold';const slots=get('[data-slots]');slots.replaceChildren();
    for(const [slot,item] of Object.entries(hero.equipment)){
      const b=node('button','','equipped-slot');b.type='button';b.append(node('small',slot),node('strong',item?.name || 'Empty'));
      b.onclick=()=>{if(item){selected=item.id;draw();}else{get('[data-category]').value=slot==='Main Hand'?'weapon':'gear';get('[data-search]').value=slot==='Main Hand'?'':slot;draw();}};slots.append(b);
    }
    const totals={};for(const item of Object.values(hero.equipment))for(const [k,v] of Object.entries(item?.bonuses || {}))totals[k]=(totals[k] || 0)+v;
    get('[data-bonuses]').replaceChildren(node('h4','Outfit bonuses'),node('p',bonuses({bonuses:totals}) || 'No attribute bonuses equipped.'));
    draw();
  }
  get('[data-search]').oninput=draw;get('[data-category]').onchange=draw;get('[data-sort]').onchange=draw;
  return {render};
};
