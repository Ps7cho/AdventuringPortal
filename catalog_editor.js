/* Forms edit catalog source records; saved run snapshots are never submitted. */
window.GameCatalogEditor = function(api, onSaved) {
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const dialog=el('dialog');dialog.className='catalog-editor';dialog.setAttribute('aria-label','Edit gameplay definition');
  const style=el('style',`.catalog-editor{width:min(1100px,calc(100% - 24px));max-height:90vh;overflow:auto;background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:12px;padding:24px}.catalog-editor::backdrop{background:#000b}.catalog-editor .editor-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:16px;margin:20px 0}.catalog-editor label{display:flex;flex-direction:column;align-items:stretch}.catalog-editor textarea{width:100%;min-height:180px;background:var(--panel);color:var(--text);font:13px/1.5 monospace;padding:12px;border:1px solid var(--line);border-radius:6px}.catalog-editor .editor-json{grid-column:1/-1}.catalog-editor pre{white-space:pre-wrap;overflow-wrap:anywhere}.catalog-editor .editor-actions{position:sticky;bottom:0;background:var(--bg);padding:12px 0;display:flex;gap:12px;flex-wrap:wrap}.catalog-editor [role=alert]{color:#ffb4ab}.quest-builder{grid-column:1/-1;border:1px solid var(--line);padding:18px;background:var(--panel)}.quest-builder h3{margin-top:0}.quest-builder h4{margin:0}.quest-builder-head,.quest-card-head,.quest-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.quest-card{border:1px solid var(--line);padding:14px;margin:12px 0;background:var(--bg)}.quest-group,.loot-drop{display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:10px;align-items:end;margin-top:10px}.loot-drop{grid-template-columns:minmax(150px,1fr) minmax(190px,1.4fr) 90px 90px auto}.quest-builder select[multiple]{min-height:110px}.quest-builder button{padding:7px 10px}.quest-builder .danger{background:transparent;color:#ffb4ab}.quest-advanced{grid-column:1/-1}.quest-advanced>summary{cursor:pointer;color:var(--muted);margin-bottom:8px}@media(max-width:700px){.loot-drop{grid-template-columns:1fr 1fr}.loot-drop button{grid-column:2}.quest-group{grid-template-columns:1fr}}`);
  document.head.append(style);document.body.append(dialog);
  let dirty=false,busy=false;
  function close(){if(busy)return;if(dirty&&!confirm('Discard unsaved definition changes?'))return;dialog.close();}
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  window.addEventListener('beforeunload',event=>{if(dialog.open&&dirty){event.preventDefault();event.returnValue='';}});
  return function open(catalog, record, schema, catalogs, create=false) {
    dirty=false;busy=false;dialog.replaceChildren();
    const initial=structuredClone(record.values), original=structuredClone(record.values);
    if(create){
      if(catalog==='abilities'){
        const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
        const hex=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');initial.id=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
      }
      if('slug' in initial)initial.slug += '-copy';
      if('name' in initial)initial.name += ' (copy)';
    }
    dialog.append(el('h2',(create?'Create ':'Edit ')+catalog.replaceAll('_',' ')),el('p','Save updates the connected database. Review changes before saving. Existing encounter and raid snapshots keep their saved definitions.'));
    const fields=el('div');fields.className='editor-fields';
    const inputs=new Map();
    const references={status_effect_slug:'afflictions',weapon_type_slug:'weapon_types',required_rank:'ranks',enemy_slug:'enemies',ability_id:'abilities',orb_slug:'consumables',essence_slug:'essences',consumable_slug:'consumables',enemy_type:'entity_types',village_slug:'villages',shop_slug:'shops'};
    for(const field of schema.fields){
      const label=el('label',field.name.replaceAll('_',' ') + (field.primary_key?' (key)':'') + (field.nullable?' · optional':''));
      let input;
      if(field.type==='json'){
        input=el('textarea');label.className='editor-json';input.value=initial[field.name]===null?'':JSON.stringify(initial[field.name],null,2);
        label.append(el('small',field.name==='journey'?'Source quest rules, including loot tables, push tiers, stages, and rewards. Chances are percentages; item weights determine the split within a table.':'JSON object or array. Use stable slugs and IDs from the catalogs for references.'));
      } else if(catalog==='quests'&&field.name==='region'){
        input=el('select');const regions=new Map((catalogs.villages?.records||[]).map(r=>[r.values.region,`${r.values.name} \u00b7 ${r.values.region}`]));for(const [value,name] of regions)input.add(new Option(name,value));if(!regions.has(initial[field.name]))input.add(new Option(initial[field.name],initial[field.name]));input.value=initial[field.name];
      } else if(field.choices || references[field.name]){
        input=el('select');if(field.nullable)input.add(new Option('None',''));
        let records=catalogs[references[field.name]]?.records||[];
        if(catalog==='orb_outcomes'&&field.name==='orb_slug')records=records.filter(r=>r.values.effect==='orb');
        if(catalog==='essences'&&field.name==='consumable_slug')records=records.filter(r=>r.values.effect==='essence');
        const options=field.choices?.map(value=>[value,value]) || records.map(r=>{
          const value=Object.values(r.key)[0];return [r.values.name ? r.values.name+' · '+value : value,value];
        });
        for(const [name,value] of options)input.add(new Option(name,value));
        if(initial[field.name]!==null && ![...input.options].some(o=>o.value===String(initial[field.name])))input.add(new Option(String(initial[field.name]),String(initial[field.name])));
        input.value=initial[field.name]??'';
      } else if(field.type==='boolean'){
        input=el('input');input.type='checkbox';input.checked=initial[field.name];
      } else {
        input=el('input');input.type=['integer','number'].includes(field.type)?'number':'text';if(input.type==='number')input.step=field.type==='integer'?'1':'any';input.value=initial[field.name]??'';
      }
      input.setAttribute('aria-label',field.name);input.disabled=field.immutable&&!create;label.append(input);
      if(catalog==='quests'&&field.name==='journey'){const advanced=el('details');advanced.className='quest-advanced';advanced.append(el('summary','Advanced journey JSON'),label);fields.append(advanced);}else fields.append(label);
      inputs.set(field.name,input);
    }
    if(catalog==='quests'&&inputs.has('journey')){
      const journeyInput=inputs.get('journey');let rules=structuredClone(initial.journey||{});
      const builder=el('section');builder.className='quest-builder';
      const enemies=(catalogs.enemies?.records||[]).map(r=>r.values),consumables=(catalogs.consumables?.records||[]).map(r=>r.values),weapons=(catalogs.weapon_definitions?.records||[]).map(r=>r.values);
      const ranks=(catalogs.ranks?.records||[]).map(r=>r.values),rests=(catalogs.rest_policies?.records||[]).map(r=>r.values);
      const button=(text,action,className='')=>{const b=el('button',text);b.type='button';b.className=className;b.onclick=action;return b;};
      const labeled=(text,control)=>{const label=el('label',text);label.append(control);return label;};
      function commit(){journeyInput.value=JSON.stringify(rules,null,2);journeyInput.dispatchEvent(new Event('input',{bubbles:true}));}
      function set(path,value){let target=rules;for(const key of path.slice(0,-1))target=target[key];target[path.at(-1)]=value;commit();}
      function textControl(value,onchange,type='text'){const input=el('input');input.type=type;input.value=value??'';input.oninput=()=>onchange(type==='number'?(input.value===''?'':Number(input.value)):input.value);return input;}
      function selectControl(options,value,onchange){const select=el('select');for(const [label,key] of options)select.add(new Option(label,key));select.value=value??'';select.onchange=()=>onchange(select.value);return select;}
      function ensureJourney(){if(Object.keys(rules).length)return;const enemy=enemies[0]?.slug||'';rules={death_policy:'permanent',bank_rewards:false,repeat_groups:true,raid:null,encounter_groups:null,required_rank:ranks[0]?.slug||'iron',kind:'quest',description:'New quest route',stages:[{description:'First stage',groups:[[enemy]]}],gold:0,experience:0,completion_gold:0,completion_experience:0,camp_rest:null,max_rests:null,push_gold:0,push_experience:0,push_xp_tiers:[],enemy_health_multiplier:1,enemy_power_multiplier:1};commit();}
      function renderBuilder(){builder.replaceChildren();const title=el('div');title.className='quest-builder-head';title.append(el('h3','Quest route designer'));if(!Object.keys(rules).length){title.append(button('Enable playable quest',()=>{ensureJourney();renderBuilder();}));builder.append(title,el('p','This is a legacy catalog-only quest. Enable it to draft stages, enemies, rewards, and loot.'));return;}builder.append(title);
        const basics=el('div');basics.className='editor-fields';
        basics.append(labeled('Quest kind',textControl(rules.kind,v=>set(['kind'],v))),labeled('Required rank',selectControl(ranks.map(x=>[x.name||x.slug,x.slug]),rules.required_rank,v=>set(['required_rank'],v))),labeled('Route description',textControl(rules.description,v=>set(['description'],v))),labeled('Death policy',selectControl([['Permanent','permanent'],['Rescue on return','rescue_on_return']],rules.death_policy,v=>set(['death_policy'],v))),labeled('Gold per encounter',textControl(rules.gold,v=>set(['gold'],v),'number')),labeled('XP per encounter',textControl(rules.experience,v=>set(['experience'],v),'number')),labeled('Completion gold',textControl(rules.completion_gold,v=>set(['completion_gold'],v),'number')),labeled('Completion XP',textControl(rules.completion_experience,v=>set(['completion_experience'],v),'number')),labeled('Camp rest policy',selectControl([['None',''],...rests.map(x=>[x.slug,x.slug])],rules.camp_rest||'',v=>set(['camp_rest'],v||null))),labeled('Maximum rests',textControl(rules.max_rests??'',v=>set(['max_rests'],v===''?null:v),'number')));builder.append(basics);
        const stagesHead=el('div');stagesHead.className='quest-builder-head';stagesHead.append(el('h3','Stages and encounter groups'),button('Add stage',()=>{rules.stages.push({description:'New stage',groups:[[enemies[0]?.slug||'']]});commit();renderBuilder();}));builder.append(stagesHead);
        for(const [stageIndex,stage] of rules.stages.entries()){
          const card=el('article');card.className='quest-card';const head=el('div');head.className='quest-card-head';head.append(el('h4',`Stage ${stageIndex+1}`),button('Remove stage',()=>{if(rules.stages.length>1){rules.stages.splice(stageIndex,1);commit();renderBuilder();}},'danger'));card.append(head,labeled('Stage description',textControl(stage.description,v=>set(['stages',stageIndex,'description'],v))));
          for(const [groupIndex,group] of stage.groups.entries()){
            const row=el('div');row.className='quest-group';const select=el('select');select.multiple=true;select.size=Math.min(6,Math.max(3,enemies.length));for(const enemy of enemies)select.add(new Option(`${enemy.name} \u00b7 ${enemy.slug}`,enemy.slug,false,group.includes(enemy.slug)));select.onchange=()=>{const chosen=[...select.selectedOptions].map(o=>o.value);if(chosen.length>6){select.setCustomValidity('Choose no more than six enemies.');return;}select.setCustomValidity('');stage.groups[groupIndex]=chosen;commit();};row.append(labeled(`Possible group ${groupIndex+1} (choose 1\u20136)`,select),button('Remove group',()=>{if(stage.groups.length>1){stage.groups.splice(groupIndex,1);commit();renderBuilder();}},'danger'));card.append(row);
          }
          card.append(button('Add possible group',()=>{stage.groups.push([enemies[0]?.slug||'']);commit();renderBuilder();}));builder.append(card);
        }
        const lootHead=el('div');lootHead.className='quest-builder-head';lootHead.append(el('h3','Weighted loot tables'));if(!rules.encounter_groups)lootHead.append(button('Enable loot tables',()=>{rules.encounter_groups={shared_orb_essence_pool:false,loot_policy:'legacy',loot_rng:'run',size:2,min_size:null,max_size:null,health_step_percent:10,power_step_percent:10,max_threat_percent:300,loot_tiers:[{name:'Base loot',drop_chance_percent:100,drops:[]} ]};addDefaultDrop(rules.encounter_groups.loot_tiers[0]);commit();renderBuilder();}));else lootHead.append(button('Add loot tier',()=>{const tier={name:`Tier ${rules.encounter_groups.loot_tiers.length+1}`,drop_chance_percent:100,drops:[]};addDefaultDrop(tier);rules.encounter_groups.loot_tiers.push(tier);commit();renderBuilder();}));builder.append(lootHead);
        if(!rules.encounter_groups){builder.append(el('p','Enable weighted loot to choose exactly what can drop and how frequently.'));return;}
        for(const [tierIndex,tier] of rules.encounter_groups.loot_tiers.entries()){
          const card=el('article');card.className='quest-card';const head=el('div');head.className='quest-card-head';head.append(el('h4',`Loot tier ${tierIndex+1}`),button('Remove tier',()=>{if(rules.encounter_groups.loot_tiers.length>1){rules.encounter_groups.loot_tiers.splice(tierIndex,1);commit();renderBuilder();}},'danger'));card.append(head);
          const tierFields=el('div');tierFields.className='quest-row';tierFields.append(labeled('Tier name',textControl(tier.name,v=>set(['encounter_groups','loot_tiers',tierIndex,'name'],v))),labeled('Chance any item drops (%)',textControl(tier.drop_chance_percent,v=>set(['encounter_groups','loot_tiers',tierIndex,'drop_chance_percent'],v),'number')));card.append(tierFields);
          const total=tier.drops.reduce((sum,drop)=>sum+(Number(drop.weight)||1),0);
          for(const [dropIndex,drop] of tier.drops.entries()){
            const row=el('div');row.className='loot-drop';const kind=drop.consumable_slug?'consumable':'weapon';const kindSelect=selectControl([['Loot item','consumable'],['Weapon','weapon']],kind,value=>{tier.drops[dropIndex]=value==='consumable'?consumableDrop(consumables[0]):weaponDrop(weapons[0]);commit();renderBuilder();});
            const options=kind==='consumable'?consumables.map(x=>[`${x.name} \u00b7 ${x.effect}`,x.slug]):weapons.map(x=>[`${x.name} \u00b7 ${x.base_damage} damage`,x.slug]);const selected=kind==='consumable'?drop.consumable_slug:weapons.find(x=>x.name===drop.name&&x.weapon_type_slug===drop.weapon_type_slug&&x.base_damage===drop.base_damage)?.slug||'';const itemSelect=selectControl(options,selected,value=>{tier.drops[dropIndex]=kind==='consumable'?consumableDrop(consumables.find(x=>x.slug===value),drop.weight,drop.quantity):weaponDrop(weapons.find(x=>x.slug===value),drop.weight);commit();renderBuilder();});
            const quantity=textControl(kind==='consumable'?drop.quantity:drop.base_damage,value=>{if(kind==='consumable')drop.quantity=value;else drop.base_damage=value;commit();},'number'),weight=textControl(drop.weight||1,value=>{drop.weight=value;commit();},'number');const share=total?Math.round((drop.weight||1)*1000/total)/10:0;
            row.append(labeled('Type',kindSelect),labeled('Definition',itemSelect),labeled(kind==='consumable'?'Quantity':'Damage',quantity),labeled(`Weight (${share}%)`,weight),button('Remove',()=>{if(tier.drops.length>1){tier.drops.splice(dropIndex,1);commit();renderBuilder();}},'danger'));card.append(row);
          }
          card.append(button('Add drop',()=>{addDefaultDrop(tier);commit();renderBuilder();}));builder.append(card);
        }
      }
      function consumableDrop(item,weight=1,quantity=1){return {name:item?.name||'Loot item',consumable_slug:item?.slug||'',quantity:Number(quantity)||1,weight:Number(weight)||1};}
      function weaponDrop(item,weight=1){return {name:item?.name||'Weapon',weapon_type_slug:item?.weapon_type_slug||'',base_damage:item?.base_damage||1,quantity:1,weight:Number(weight)||1};}
      function addDefaultDrop(tier){if(consumables.length)tier.drops.push(consumableDrop(consumables[0]));else if(weapons.length)tier.drops.push(weaponDrop(weapons[0]));}
      renderBuilder();const advanced=journeyInput.closest('.quest-advanced');fields.insertBefore(builder,advanced);
    }
    const abilityBuilder=['abilities','ability_archetypes'].includes(catalog)&&window.GameAbilityDesigner
      ? GameAbilityDesigner({fields,inputs,catalog,catalogs}) : null;
    const error=el('p');error.role='alert';
    const review=el('div');review.setAttribute('aria-live','polite');
    const actions=el('div');actions.className='editor-actions';
    const validate=el('button','Review changes'),save=el('button',create?'Create in database':'Save to database'),cancel=el('button','Cancel');
    for(const button of [validate,save,cancel])button.type='button';save.disabled=true;
    let reviewed=null;
    fields.addEventListener('input',()=>{dirty=true;reviewed=null;save.disabled=true;review.replaceChildren();});
    fields.addEventListener('change',()=>{dirty=true;reviewed=null;save.disabled=true;review.replaceChildren();});
    function payload(){
      for(const input of fields.querySelectorAll('input,select,textarea'))if(!input.checkValidity()){input.reportValidity();throw new Error('Correct the highlighted value before reviewing.');}
      const values={};
      for(const field of schema.fields){
        const input=inputs.get(field.name);
        if(field.immutable&&!create){values[field.name]=original[field.name];continue;}
        if(field.type==='boolean')values[field.name]=input.checked;
        else if(input.value.trim()===''&&field.nullable)values[field.name]=null;
        else if(field.type==='json'){try{values[field.name]=JSON.parse(input.value);}catch{throw new Error(field.name+': invalid JSON.');}}
        else if(['integer','number'].includes(field.type)){if(input.value==='')throw new Error(field.name+' is required.');values[field.name]=Number(input.value);}
        else values[field.name]=input.value;
      }
      if(catalog==='quests'&&values.journey?.stages){const slugs=[...new Set(values.journey.stages.flatMap(stage=>(stage.groups||[]).flat()))];values.enemy_pool=slugs.map(slug=>(catalogs.enemies?.records||[]).find(r=>r.values.slug===slug)?.values.name||slug);}
      return {catalog,key:Object.fromEntries(schema.fields.filter(f=>f.primary_key).map(f=>[f.name,values[f.name]])),values,create,expected_revision:create?null:record.revision};
    }
    function lock(value){busy=value;validate.disabled=cancel.disabled=value;if(abilityBuilder)abilityBuilder.disabled=value;for(const field of schema.fields)inputs.get(field.name).disabled=value || field.immutable&&!create;save.disabled=value||!reviewed;}
    validate.onclick=async()=>{
      error.textContent='';reviewed=null;lock(true);
      try{
        const draft=payload();const result=await api('/catalog-editor',{...draft,validate_only:true});
        reviewed={...draft,values:result.record.values};
        const changes=Object.entries(result.record.values).filter(([key,value])=>create||JSON.stringify(value)!==JSON.stringify(original[key]));
        review.replaceChildren(el('h3',create?'New definition':'Review database changes'));
        if(!changes.length){review.append(el('p','No changes to save.'));reviewed=null;}
        for(const [field,value] of changes){review.append(el('h4',field),el('pre',(create?'': 'Before: '+JSON.stringify(original[field],null,2)+'\n\n')+'After: '+JSON.stringify(value,null,2)));}
      }catch(e){error.textContent=e.message;}finally{lock(false);}
    };
    save.onclick=async()=>{
      if(!reviewed||busy)return;error.textContent='';lock(true);
      try{const result=await api('/catalog-editor',reviewed);dirty=false;dialog.close();await onSaved(catalog,result.record);}
      catch(e){error.textContent=e.message;reviewed=null;}
      finally{lock(false);}
    };
    cancel.onclick=close;actions.append(validate,save,cancel);dialog.append(fields,error,review,actions);dialog.showModal();
  };
};
