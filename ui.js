window.GameUI = (() => {
  const tooltip=document.createElement('div'); tooltip.id='tooltip'; tooltip.role='tooltip'; tooltip.hidden=true; document.body.append(tooltip);
  function hint(element,text) {
    element.setAttribute('aria-describedby','tooltip');
    const show=()=>{ tooltip.textContent=text; tooltip.hidden=false; const rect=element.getBoundingClientRect();
      tooltip.style.left=Math.max(12,Math.min(rect.left,innerWidth-tooltip.offsetWidth-12))+'px';
      tooltip.style.top=(rect.bottom+tooltip.offsetHeight+16<innerHeight ? rect.bottom+8 : Math.max(12,rect.top-tooltip.offsetHeight-8))+'px'; };
    const hide=()=>{tooltip.hidden=true;};
    element.addEventListener('mouseenter',show); element.addEventListener('mouseleave',hide);
    element.addEventListener('focus',show); element.addEventListener('blur',hide);
  }
  document.addEventListener('keydown',e=>{if(e.key==='Escape')tooltip.hidden=true;});
  document.addEventListener('scroll',()=>tooltip.hidden=true,true);
  function tabs(container,groups,initial,options={}) {
    const bar=document.createElement('div'); bar.className='tabs'; bar.role='tablist'; bar.setAttribute('aria-label','Sections');
    container.prepend(bar); const entries=[],mobileButtons=new Map();
    let mobileMore=null,mobileSheet=null,mobileScrim=null;
    function select(key,focus=false) {
      for(const entry of entries) { const active=entry.key===key; entry.panel.hidden=!active; entry.button.setAttribute('aria-selected',String(active)); entry.button.tabIndex=active?0:-1; if(active&&focus)entry.button.focus(); }
      for(const [itemKey,button] of mobileButtons) {
        if(itemKey===key)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
      }
      if(mobileMore){
        if(!mobileButtons.has(key))mobileMore.setAttribute('aria-current','page');else mobileMore.removeAttribute('aria-current');
        mobileSheet.hidden=true;mobileScrim.hidden=true;mobileMore.setAttribute('aria-expanded','false');
      }
      tooltip.hidden=true;
    }
    for(const group of groups) {
      const panel=document.createElement('div'); panel.id='panel-'+group.key; panel.className='tab-panel'; panel.role='tabpanel'; panel.setAttribute('aria-labelledby','tab-'+group.key); panel.tabIndex=0;
      panel.append(...group.nodes); container.append(panel);
      const button=document.createElement('button'); button.type='button'; button.id='tab-'+group.key; button.role='tab'; button.textContent=group.label; button.setAttribute('aria-controls',panel.id); button.onclick=()=>select(group.key);
      button.onkeydown=e=>{const index=entries.findIndex(x=>x.button===button); let next;
        if(e.key==='ArrowRight')next=(index+1)%entries.length; if(e.key==='ArrowLeft')next=(index-1+entries.length)%entries.length; if(e.key==='Home')next=0; if(e.key==='End')next=entries.length-1;
        if(next!==undefined){e.preventDefault();select(entries[next].key,true);} };
      bar.append(button); entries.push({key:group.key,panel,button});
    }
    if(options.mobileNav){
      container.classList.add('mobile-navigation');
      const primary=options.mobileNav.primary||groups.map(group=>group.key);
      const icons={home:'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',map:'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14',person:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',shield:'M12 2 20 6v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z',spark:'M12 2 14 9l7 3-7 2-2 7-2-7-7-2 7-3z',bolt:'M13 2 5 13h6l-1 9 9-12h-6z',people:'M8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M16 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M2 21a6 6 0 0 1 12 0 M10 21a6 6 0 0 1 12 0',grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z'};
      const icon=name=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',icons[name]||icons.grid);svg.append(path);return svg;};
      const mobileBar=document.createElement('nav');mobileBar.className='mobile-nav';mobileBar.setAttribute('aria-label',options.mobileNav.label||'Sections');
      const makeButton=(group,small=false)=>{const button=document.createElement('button');button.type='button';button.dataset.mobileKey=group.key;button.append(icon(options.mobileNav.icons?.[group.key]||'grid'));const label=document.createElement('span');label.textContent=group.label;button.append(label);button.onclick=()=>select(group.key);if(!small)mobileButtons.set(group.key,button);return button;};
      for(const key of primary){const group=groups.find(item=>item.key===key);if(group)mobileBar.append(makeButton(group));}
      const remaining=groups.filter(group=>!primary.includes(group.key));
      if(remaining.length){
        mobileScrim=document.createElement('button');mobileScrim.type='button';mobileScrim.className='mobile-nav-scrim';mobileScrim.setAttribute('aria-label','Close more sections');mobileScrim.hidden=true;
        mobileSheet=document.createElement('div');mobileSheet.className='mobile-nav-sheet';mobileSheet.setAttribute('role','dialog');mobileSheet.setAttribute('aria-label','More sections');mobileSheet.hidden=true;
        const heading=document.createElement('div');heading.className='mobile-nav-sheet-heading';const title=document.createElement('h2');title.textContent='More sections';const close=document.createElement('button');close.type='button';close.textContent='Close';close.onclick=()=>{mobileSheet.hidden=true;mobileScrim.hidden=true;mobileMore.setAttribute('aria-expanded','false');mobileMore.focus();};heading.append(title,close);mobileSheet.append(heading);
        const list=document.createElement('div');list.className='mobile-nav-list';for(const group of remaining)list.append(makeButton(group,true));mobileSheet.append(list);
        mobileMore=document.createElement('button');mobileMore.type='button';mobileMore.className='mobile-nav-more';mobileMore.append(icon('grid'));const label=document.createElement('span');label.textContent='More';mobileMore.append(label);mobileMore.setAttribute('aria-expanded','false');mobileMore.onclick=()=>{const opening=mobileSheet.hidden;mobileSheet.hidden=!opening;mobileScrim.hidden=!opening;mobileMore.setAttribute('aria-expanded',String(opening));if(opening)mobileSheet.querySelector('button').focus();};
        mobileScrim.onclick=()=>{mobileSheet.hidden=true;mobileScrim.hidden=true;mobileMore.setAttribute('aria-expanded','false');};
        mobileBar.append(mobileMore);container.append(mobileScrim,mobileSheet);
        container.addEventListener('keydown',event=>{if(event.key==='Escape'&&!mobileSheet.hidden){mobileSheet.hidden=true;mobileScrim.hidden=true;mobileMore.setAttribute('aria-expanded','false');mobileMore.focus();}});
      }
      container.append(mobileBar);
    }
    select(initial || groups[0].key); return {select};
  }
  function dropZone(element,type,accept) {
    element.addEventListener('dragover',e=>{ if(e.dataTransfer.types.includes(type)){ e.preventDefault(); e.dataTransfer.dropEffect='copy'; element.classList.add('drop-over'); } });
    element.addEventListener('dragleave',()=>element.classList.remove('drop-over'));
    element.addEventListener('drop',e=>{element.classList.remove('drop-over');const value=e.dataTransfer.getData(type);if(value){e.preventDefault();accept(value);}});
  }
  function draggable(element,type,value) { element.draggable=true; element.addEventListener('dragstart',e=>{tooltip.hidden=true;e.dataTransfer.setData(type,value);e.dataTransfer.effectAllowed='copy';});element.addEventListener('dragend',()=>document.querySelectorAll('.drop-over').forEach(el=>el.classList.remove('drop-over'))); }
  async function rankedDeparture(depart) {
    try { return await depart(false); }
    catch(error) {
      if(error.code!=='rank_warning') throw error;
      if(!window.confirm(error.message + '\n\nIgnore this warning and enter anyway?')) return null;
      return await depart(true);
    }
  }
  function statusLabel(s) {
    return s.name + ' x' + s.stacks + ' / ' + s.remaining_rounds + ' rounds' +
      (s.amplification ? ' / +' + s.amplification + ' power' : '') +
      (s.preserve_rounds ? ' / preserved ' + s.preserve_rounds : '');
  }
  function statusHint(s) {
    return (s.periodic === 'none' ? 'No periodic damage.' :
      ((s.damage + (s.amplification || 0)) + ' damage per stack at round end; ' + (s.resistance || 0) + '% resisted.')) +
      (s.preserve_rounds ? ' Preservation pauses expiry and prevents stack removal; periodic effects still occur.' : '') +
      (s.harmful === false ? ' Beneficial stacks are not cleansed.' : '');
  }
  return {hint,tabs,dropZone,draggable,rankedDeparture,statusLabel,statusHint};
})();

// One read-only socket per adventure. Commands still use HTTP.
window.GameLive = (() => {
  function connect(base, getToken, onState, onStatus, options={}) {
    let socket, retry, watchdog, stopped=false, topic=null, currentId=null, attempt=0;
    const status=value=>onStatus?.(value);
    function open() {
      if(stopped || !currentId) return;
      const url=new URL(base.replace(/\/$/,'')+(options.path || '/encounters/'+currentId+'/live'),location.href);
      url.protocol=url.protocol==='https:'?'wss:':'ws:';
      const active=socket=new WebSocket(url);
      status('Connecting');
      const touch=()=>{clearTimeout(watchdog);watchdog=setTimeout(()=>active.close(),45000);};
      active.onopen=()=>{active.send(JSON.stringify({token:getToken()}));touch();};
      active.onmessage=event=>{
        if(socket!==active || stopped) return;
        touch();
        const message=JSON.parse(event.data);
        if(message.type==='ping') {active.send(JSON.stringify({type:'pong'}));return;}
        if(message.type===(options.type || 'encounter')) {attempt=0;status('Live');onState(message.data);}
      };
      active.onclose=event=>{
        if(socket!==active || stopped) return;
        clearTimeout(watchdog);
        if([4401,4403].includes(event.code)) {status('Login or encounter access required');return;}
        status('Reconnecting');
        retry=setTimeout(open,Math.min(15000,1000*2**Math.min(attempt++,4))+Math.random()*300);
      };
      active.onerror=()=>active.close();
    }
    function watch(data) {
      if(topic===data.quest.id) return;
      clearTimeout(retry);clearTimeout(watchdog);
      const old=socket;socket=null;old?.close();
      stopped=false;topic=data.quest.id;currentId=data.id;open();
    }
    function close() {
      stopped=true;topic=null;currentId=null;
      clearTimeout(retry);clearTimeout(watchdog);
      const old=socket;socket=null;old?.close();status('Disconnected');
    }
    window.addEventListener('pagehide',close);
    return {watch,close};
  }
  function stale(current,next) {
    if(!current || current.quest.id!==next.quest.id) return false;
    return next.quest.encounter_number<current.quest.encounter_number ||
      next.id===current.id && next.revision<current.revision;
  }
  function village(base,getToken,onState,onStatus,adventurerId=null) {
    const connection=connect(base,getToken,onState,onStatus,{type:'village',path:'/village/live'+(adventurerId ? '?adventurer_id='+encodeURIComponent(adventurerId) : '')});
    return {watch:user=>connection.watch({id:user.id,quest:{id:'village:'+user.id}}),close:connection.close};
  }
  return {connect,stale,village};
})();
