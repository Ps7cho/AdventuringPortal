/* Assign reusable reactions to armor through the reviewed catalog editor. */
window.GameArmorAssignmentDesigner = function({fields,inputs,catalogs}) {
  const box=document.createElement('fieldset');box.className='ability-designer';
  const legend=document.createElement('legend');legend.textContent='Armor effects';box.append(legend);
  const hint=document.createElement('p');hint.textContent='Choose up to four effects. They trigger only while this armor is equipped. Edit their proc chance, cooldown, retaliation, and follow-up effects in Armor Effects.';box.append(hint);
  const raw=inputs.get('effect_slugs');raw.closest('label').hidden=true;
  const selected=JSON.parse(raw.value||'[]');
  const select=document.createElement('select');select.multiple=true;select.size=6;select.setAttribute('aria-label','Armor effects');
  for(const record of catalogs.armor_effects?.records||[]){const e=record.values;select.add(new Option(e.name,e.slug,false,selected.includes(e.slug)));}
  select.onchange=()=>{raw.value=JSON.stringify([...select.selectedOptions].map(o=>o.value));fields.dispatchEvent(new Event('input',{bubbles:true}));};
  box.append(select);fields.prepend(box);return box;
};
