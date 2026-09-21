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
  function tabs(container,groups,initial) {
    const bar=document.createElement('div'); bar.className='tabs'; bar.role='tablist'; bar.setAttribute('aria-label','Sections');
    container.prepend(bar); const entries=[];
    function select(key,focus=false) {
      for(const entry of entries) { const active=entry.key===key; entry.panel.hidden=!active; entry.button.setAttribute('aria-selected',String(active)); entry.button.tabIndex=active?0:-1; if(active&&focus)entry.button.focus(); }
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
