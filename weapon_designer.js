/* Weapon pool authoring participates in the existing reviewed catalog save flow. */
window.GameWeaponPoolDesigner = function({fields,inputs,catalogs}) {
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const builder=el('fieldset');builder.className='ability-designer';builder.append(el('legend','Weapon effect pool'));
  for(const key of ['name','slug','description','chance_percent','min_effects','max_effects'])builder.append(inputs.get(key).closest('label'));
  builder.append(el('p','The chance decides whether a new weapon receives effects. Eligible effects are chosen by weight without duplicates, up to the available effects and maximum count. A zero chance creates plain weapons. Rolled effects stay with that weapon.'));
  const list=el('div'),raw=inputs.get('entries');builder.append(list);raw.closest('label').hidden=true;
  const effects=(catalogs.weapon_effects?.records||[]).map(r=>r.values);
  let entries=JSON.parse(raw.value||'[]');
  const save=()=>{raw.value=JSON.stringify(entries,null,2);fields.dispatchEvent(new Event('input',{bubbles:true}));};
  function draw(){
    list.replaceChildren();
    for(const [index,entry] of entries.entries()){
      const row=el('div');row.className='quest-row';
      const effectLabel=el('label','Weapon effect'),select=el('select');select.setAttribute('aria-label','Weapon effect');
      for(const effect of effects.filter(e=>e.slug===entry.effect_slug||!entries.some(item=>item.effect_slug===e.slug)))select.add(new Option(effect.name,effect.slug));
      select.value=entry.effect_slug;select.onchange=()=>{entry.effect_slug=select.value;save();draw();};effectLabel.append(select);
      const weightLabel=el('label','Weight'),weight=el('input');weight.type='number';weight.min='1';weight.max='10000';weight.value=entry.weight;weight.oninput=()=>{entry.weight=Number(weight.value);save();};weightLabel.append(weight);
      const remove=el('button','Remove');remove.type='button';remove.onclick=()=>{entries.splice(index,1);save();draw();};
      row.append(effectLabel,weightLabel,remove);list.append(row);
    }
    const next=effects.find(e=>!entries.some(item=>item.effect_slug===e.slug));
    const add=el('button','Add effect to pool');add.type='button';add.disabled=!next;add.onclick=()=>{entries.push({effect_slug:next.slug,weight:1});save();draw();};list.append(add);
    if(!effects.length)list.append(el('p','Create a Weapon Effect before adding entries.'));
  }
  fields.prepend(builder);draw();return builder;
};
