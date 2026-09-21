/* Visual authoring controls backed by the existing reviewed catalog workflow. */
window.GameAbilityDesigner = function({fields, inputs, catalog, catalogs}) {
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const isTemplate=catalog==='ability_archetypes';
  const defaults={effect_type:'damage',target_type:'enemy',power:10,damage_multiplier:null,requires_weapon:false,allowed_weapon_tags:[],cooldown_type:'turn',cooldown_value:0,max_targets:1,duration_turns:3,guard_percent:60,effect_chain:[],rank_upgrades:{},ability_type:'attack',status_effect_slug:null,affliction_ops:[]};
  const dialNames={power:'Power / healing % / evasion %',damage_multiplier:'Damage multiplier',cooldown_value:'Cooldown',max_targets:'Maximum targets',duration_turns:'Duration (rounds)',guard_percent:'Guard reduction (%)'};
  const builder=el('fieldset');builder.className='ability-designer';builder.append(el('legend',isTemplate?'Reusable ability archetype':'Ability designer'));
  const controls=new Map(inputs), labels=new Map();
  const advanced=el('details');advanced.className='quest-advanced';advanced.append(el('summary','Advanced definition fields'));
  const basic=el('div');basic.className='editor-fields';
  const select=(options,value,change)=>{const n=el('select');for(const [v,label] of options)n.add(new Option(label,v));if(value!=null&&![...n.options].some(o=>o.value===String(value)))n.add(new Option(String(value),value));n.value=value;n.onchange=()=>change(n.value);return n;};
  const number=(value,change)=>{const n=el('input');n.type='number';n.step='any';n.value=value??'';n.oninput=()=>change(n.value===''?null:Number(n.value));return n;};
  const label=(name,control)=>{const n=el('label',name);control.setAttribute('aria-label',name);n.append(control);return n;};
  const button=(name,action)=>{const n=el('button',name);n.type='button';n.onclick=action;return n;};
  function changed(){fields.dispatchEvent(new Event('input',{bubbles:true}));}
  function get(name){const n=controls.get(name);if(!n)return defaults[name];if(n.type==='checkbox')return n.checked;if(['effect_chain','rank_upgrades','allowed_weapon_tags','affliction_ops'].includes(name))return JSON.parse(n.value||JSON.stringify(defaults[name]));if(name in dialNames)return n.value===''?null:Number(n.value);if(name==='status_effect_slug')return n.value||null;return n.value;}
  function put(name,value){const n=controls.get(name);if(!n)return;if(n.type==='checkbox')n.checked=Boolean(value);else n.value=typeof value==='object'&&value!==null?JSON.stringify(value,null,2):value??'';}
  function definition(){return Object.fromEntries(Object.keys(defaults).map(k=>[k,get(k)]));}
  function commit(){if(isTemplate)inputs.get('definition').value=JSON.stringify(definition(),null,2);changed();}
  if(isTemplate){
    const data={...defaults,...JSON.parse(inputs.get('definition').value||'{}')};
    for(const [key,value] of Object.entries(data)){
      let n;
      const choices={effect_type:['damage','heal','guard','evade','buff','shield','cleanse','affliction'],target_type:['enemy','self','ally','party'],cooldown_type:['turn','minutes','hours']};
      if(choices[key])n=select(choices[key].map(v=>[v,v]),value,commit);
      else if(key==='status_effect_slug')n=select([['','None'],...(catalogs.afflictions?.records||[]).map(r=>[r.values.slug,r.values.name])],value||'',commit);
      else if(typeof value==='boolean'){n=el('input');n.type='checkbox';n.checked=value;n.onchange=commit;}
      else if(key in dialNames)n=number(value,commit);
      else {n=el(['effect_chain','rank_upgrades','allowed_weapon_tags','affliction_ops'].includes(key)?'textarea':'input');n.value=typeof value==='object'?JSON.stringify(value,null,2):value;n.oninput=commit;}
      controls.set(key,n);labels.set(key,label(key.replaceAll('_',' '),n));
    }
  }else{
    for(const [key,input] of inputs)labels.set(key,input.closest('label'));
  }
  const identity=el('div');identity.className='editor-fields';
  for(const key of ['name','slug','description'])if(inputs.get(key))identity.append(inputs.get(key).closest('label'));
  builder.append(identity);
  if(inputs.get('id'))advanced.append(inputs.get('id').closest('label'));
  const tagSource=labels.get('allowed_weapon_tags');if(tagSource)advanced.append(tagSource);
  const tagPicker=el('select');tagPicker.multiple=true;tagPicker.size=4;
  const knownTags=[...new Set([...(catalogs.weapon_types?.records||[]).flatMap(r=>r.values.tags||[]),...get('allowed_weapon_tags')])];
  for(const tag of knownTags)tagPicker.add(new Option(tag,tag));
  tagPicker.onchange=()=>{put('allowed_weapon_tags',[...tagPicker.selectedOptions].map(o=>o.value));commit();};
  labels.set('allowed_weapon_tags',label('Allowed weapon tags (empty means any)',tagPicker));
  const templateSelect=select([['','Choose an archetype…'],...(catalogs.ability_archetypes?.records||[]).map(r=>[r.values.slug,r.values.name])],inputs.get('archetype_slug')?.value||'',()=>{});
  const templateTools=el('div');templateTools.className='quest-row';
  templateTools.append(label('Start from archetype',templateSelect),button('Apply archetype',()=>{
    const chosen=catalogs.ability_archetypes?.records.find(r=>r.values.slug===templateSelect.value)?.values;
    if(!chosen)return;
    for(const [key,value] of Object.entries({...defaults,...chosen.definition}))put(key,value);
    if(!isTemplate)put('archetype_slug',chosen.slug);
    commit();renderChain();renderRanks();updatePrimary();
  }));
  builder.append(templateTools,el('p','Apply a reusable starting point, then tune this definition. Each ability keeps its own saved values. Duplicate an ability to make another variant.'));
  for(const key of ['effect_type','target_type','power','damage_multiplier','requires_weapon','allowed_weapon_tags','cooldown_type','cooldown_value','max_targets','duration_turns','guard_percent','status_effect_slug']){
    const l=labels.get(key);if(l)basic.append(l);
  }
  const hint=el('p');hint.className='muted';builder.append(el('h3','Primary effect'),basic,hint);
  function updatePrimary(){
    const effect=get('effect_type');
    const selectedTags=get('allowed_weapon_tags');for(const tag of selectedTags)if(![...tagPicker.options].some(o=>o.value===tag))tagPicker.add(new Option(tag,tag));for(const option of tagPicker.options)option.selected=selectedTags.includes(option.value);
    hint.textContent=effect==='damage'?'Blank multiplier uses fixed power. A multiplier uses actor power or equipped weapon damage.':effect==='heal'?'Power is a percentage of the recipient’s maximum HP.':effect==='guard'?'Guard reduction is a percentage for this round.':effect==='evade'?'Power is dodge chance; duration limits how long the next-attack dodge can wait.':effect==='affliction'?'Use this for status interactions or follow-up-only support/debuff abilities.':'Power and duration control the primary support effect.';
    for(const key of ['damage_multiplier','requires_weapon','allowed_weapon_tags'])if(labels.get(key))labels.get(key).hidden=effect!=='damage';
    if(labels.get('guard_percent'))labels.get('guard_percent').hidden=effect!=='guard';
    if(labels.get('duration_turns'))labels.get('duration_turns').hidden=!['buff','shield','evade'].includes(effect);
  }
  controls.get('effect_type').addEventListener('change',updatePrimary);updatePrimary();
  const chainBox=el('section'),rankBox=el('section');builder.append(chainBox,rankBox);
  function chain(){return get('effect_chain')||[];}
  function modifierDials(){const choices=new Map(Object.entries(dialNames));for(const ability of [...(catalogs.abilities?.records||[]).map(r=>r.values),{name:'This ability',effect_chain:chain()}])for(const s of ability.effect_chain||[]){if(s.effect==='modifier'){choices.set('modifier:'+s.id,`${s.id}: adjustment`);choices.set('duration:'+s.id,`${s.id}: active rounds`);}else choices.set('step:'+s.id,`${s.id}: amount / conversion`);}return [...choices];}
  function saveChain(value){put('effect_chain',value);commit();}
  function renderChain(){
    chainBox.replaceChildren(el('h3','Follow-up effects'),el('p','Steps run in order. Result-based values are percentages of actual damage, healing, or resources from an earlier step. A split divides one total across living recipients; otherwise each receives the full amount.'));
    const steps=chain();
    steps.forEach((step,index)=>{
      const card=el('article');card.className='quest-card';const head=el('div');head.className='quest-card-head';
      head.append(el('h4',`Step ${index+1} · ${step.id}`));
      for(const [text,offset] of [['Move up',-1],['Move down',1]]){const b=button(text,()=>{const to=index+offset;[steps[index],steps[to]]=[steps[to],steps[index]];saveChain(steps);renderChain();});b.disabled=index+offset<0||index+offset>=steps.length;head.append(b);}
      head.append(button('Remove step',()=>{steps.splice(index,1);const ranks=get('rank_upgrades');for(const values of Object.values(ranks))for(const prefix of ['step:','modifier:','duration:'])delete values[prefix+step.id];put('rank_upgrades',ranks);saveChain(steps);renderChain();renderRanks();}));card.append(head);
      const grid=el('div');grid.className='editor-fields';
      const set=(key,value,rerender=false)=>{step[key]=value;saveChain(steps);if(rerender)renderChain();};
      grid.append(label('Effect',select([['damage','Damage'],['heal','Restore HP'],['resource','Grant resource'],['modifier','Boost / nerf ability values']],step.effect,value=>{step.effect=value;if(value==='modifier'){step.source='fixed';step.split=false;step.stat='power';step.operation='percent';step.modifier=25;step.duration=1;}if(value==='damage')step.recipient='targets';if(['heal','resource'].includes(value))step.recipient='self';saveChain(steps);renderChain();renderRanks();})),
        label('Recipient',select([['self','Self'],['targets','Selected targets'],['party','Living party (including self)'],['enemies','Living opponents']],step.recipient,v=>set('recipient',v))),
        label('Trigger',select([['always','Always'],['on_hit','Primary attack hits'],['on_damage','Primary deals damage'],['on_kill','Primary kills a target']],step.when||'on_damage',v=>set('when',v))));
      if(step.effect==='modifier'){
        grid.append(label('Value to change',select(modifierDials(),step.stat||'power',v=>set('stat',v))),label('Adjustment',select([['percent','Percent (+ boost, − nerf)'],['add','Flat amount (+ / −)']],step.operation||'percent',v=>set('operation',v))),label('Adjustment amount',number(step.modifier??25,v=>set('modifier',v))),label('Active rounds',number(step.duration??1,v=>set('duration',v))),label('Affected ability',select([['','All abilities'],...(catalogs.abilities?.records||[]).map(r=>[r.values.slug,r.values.name])],step.ability_slug||'',v=>set('ability_slug',v||null))));
      }else{
        grid.append(label('Amount source',select([['fixed','Fixed amount'],['primary','Primary result total (%)'],['damage_dealt','Primary damage dealt (%)'],['previous','Previous step result (%)']],step.source||'damage_dealt',v=>set('source',v))),label('Amount / conversion (%)',number(step.value??50,v=>set('value',v))));
        const split=el('input');split.type='checkbox';split.checked=Boolean(step.split);split.onchange=()=>set('split',split.checked);grid.append(label('Split one total across recipients',split));
        if(step.effect==='resource'){const resource=el('input');resource.value=step.resource||'mana';resource.oninput=()=>set('resource',resource.value);grid.append(label('Resource name (e.g. mana)',resource));}
      }
      card.append(grid);chainBox.append(card);
    });
    const add=button('Add follow-up effect',()=>{let i=1;while(steps.some(s=>s.id==='effect_'+i))i++;steps.push({id:'effect_'+i,effect:'heal',recipient:'self',source:'damage_dealt',value:50,when:'on_damage',split:false});saveChain(steps);renderChain();renderRanks();});add.disabled=steps.length>=16;chainBox.append(add);
  }
  function renderRanks(){
    rankBox.replaceChildren(el('h3','Rank upgrades'),el('p','Set only values that change at each rank. Empty values inherit the previous rank. Upgrades apply when the character next departs; an active adventure keeps its saved ability values.'));
    const upgrades=get('rank_upgrades')||{},ranks=[...(catalogs.ranks?.records||[])].sort((a,b)=>a.values.min_level-b.values.min_level);
    const dials=[...Object.entries(dialNames),...chain().flatMap(s=>s.effect==='modifier'?[['modifier:'+s.id,`Step ${s.id}: adjustment`],['duration:'+s.id,`Step ${s.id}: active rounds`]]:[['step:'+s.id,`Step ${s.id}: amount / conversion`]])];
    for(const {values:rank} of ranks){
      const details=el('details');details.open=Boolean(upgrades[rank.slug]);details.append(el('summary',`${rank.name} · level ${rank.min_level}`));const grid=el('div');grid.className='editor-fields';
      for(const [key,name] of dials){const n=number(upgrades[rank.slug]?.[key],value=>{upgrades[rank.slug]||={};if(value===null)delete upgrades[rank.slug][key];else upgrades[rank.slug][key]=value;if(!Object.keys(upgrades[rank.slug]).length)delete upgrades[rank.slug];put('rank_upgrades',upgrades);commit();});n.placeholder='Inherit';grid.append(label(name,n));}details.append(grid);rankBox.append(details);
    }
  }
  for(const key of ['effect_chain','rank_upgrades']){
    const l=labels.get(key);if(l)advanced.append(l);
    controls.get(key)?.addEventListener('change',()=>{try{renderChain();renderRanks();}catch{/* The review step reports malformed JSON. */}});
  }
  if(isTemplate){inputs.get('definition').closest('label').hidden=true;advanced.append(labels.get('ability_type'),labels.get('affliction_ops'));}
  else for(const key of ['ability_type','cost_type','cost_value','loadout_order','affliction_ops','archetype_slug']){if(labels.get(key))advanced.append(labels.get(key));}
  builder.append(advanced);fields.prepend(builder);renderChain();renderRanks();
  if(isTemplate){basic.addEventListener('input',commit);basic.addEventListener('change',commit);}
  return builder;
};
