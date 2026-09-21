/* Deployment menu shared by both clients. */
window.GameLobby = ({roster,enemy,length,start,account,onSelection,openCharacter}) => {
  document.body.classList.add('game-menu');
  account.classList.add('account-strip');document.querySelector('main > header').append(account);
  const play=document.createElement('section');play.className='play-lobby';
  play.innerHTML=`<div class="lobby-adventurer"><div class="lobby-heading"><span class="eyebrow">YOUR ADVENTURER</span><a class="lobby-sheet">Character</a></div>
  <div class="lobby-portrait"><svg viewBox="0 0 300 480" role="img" aria-label="Adventurer silhouette"><ellipse cx="150" cy="452" rx="86" ry="12" fill="#101414"/><circle cx="150" cy="65" r="32" fill="#829d98"/><path d="M127 94 L173 94 180 112 213 124 237 223 219 271 200 263 207 219 188 165 185 267 201 420 180 440 159 433 149 310 139 433 115 440 99 420 114 267 111 165 92 219 100 263 81 271 64 223 87 124 120 112 Z" fill="#3f5955" stroke="#b1cfbe" stroke-width="2"/><path d="M120 116 L150 153 180 116 M114 259 L185 259" fill="none" stroke="#a9c8ca" stroke-width="3"/></svg></div>
  <h2 class="lobby-name">No adventurer</h2><p class="lobby-health"></p><div class="lobby-roster" role="group" aria-label="Active adventurer"></div></div>
  <div class="quest-intro"><p class="eyebrow">PREPARE FOR YOUR NEXT QUEST</p><h2>Choose your adventurer</h2>
  <p>Pick an adventurer, then browse Quests or take a recovery contract from the Bulletin Board.</p>
  <p class="lobby-empty" hidden>Create an adventurer to enter Mosswood.</p></div>`;
  const list=play.querySelector('.lobby-roster'),sheet=play.querySelector('.lobby-sheet');
  sheet.onclick=event=>{if(!selected||!openCharacter)return;event.preventDefault();openCharacter(selected);};
  const recruit=document.createElement('button');recruit.textContent='Create Adventurer';
  recruit.onclick=()=>{document.getElementById('tab-character').click();document.getElementById('name').focus();};
  play.querySelector('.lobby-empty').append(recruit);
  let selected=null;
  const sync=()=>{
    const inputs=[...roster.querySelectorAll('input[type=checkbox]')].filter(input=>!input.disabled);
    selected=inputs.find(input=>input.value===selected)?.value || inputs.find(input=>input.checked)?.value || inputs[0]?.value || null;
    list.replaceChildren();
    for(const input of inputs) {
      input.checked=input.value===selected;
      const label=input.closest('label'),row=label.parentElement,option=document.createElement('label'),radio=document.createElement('input');
      radio.type='radio';radio.name='lobby-adventurer';radio.value=input.value;radio.checked=input.checked;
      option.append(radio,document.createTextNode(label.textContent));list.append(option);
      radio.onchange=()=>{selected=input.value;sync();};
      if(input.checked) {
        play.querySelector('.lobby-name').textContent=label.textContent;
        play.querySelector('.lobby-health').textContent=row.querySelector('span')?.textContent || '';
        sheet.href=row.querySelector('a').href;sheet.hidden=false;
      }
    }
    if(!inputs.length) {play.querySelector('.lobby-name').textContent='No adventurer';play.querySelector('.lobby-health').textContent='';sheet.hidden=true;}
    play.querySelector('.lobby-empty').hidden=!!inputs.length;
    onSelection();
  };
  new MutationObserver(sync).observe(roster,{childList:true,subtree:true});
  roster.addEventListener('change',event=>{if(event.target.checked)selected=event.target.value;sync();});
  play.selectCharacter=id=>{selected=id;sync();};
  return play;
};

/* Keeps the complete character sheet inside the primary game workspace. */
window.GameCharacterWorkspace = ({onSelect,recruit}={}) => {
  const root=document.createElement('section');root.className='character-workspace';
  root.innerHTML=`<header class="workspace-heading"><div><p class="eyebrow">ADVENTURER RECORD</p><h2>Character</h2><p>Manage progression, equipment, abilities, essences, and friends without leaving the village.</p></div><div class="character-workspace-controls"><label>Adventurer<select data-character-select></select></label><div data-character-recruit></div></div></header><div class="character-workspace-empty">Create a living adventurer above to open a character record.</div><iframe data-character-frame title="Character sheet" hidden></iframe>`;
  const select=root.querySelector('[data-character-select]'),frame=root.querySelector('[data-character-frame]'),empty=root.querySelector('.character-workspace-empty');
  if(recruit)root.querySelector('[data-character-recruit]').append(recruit);
  let heroes=[],selected=null,section='overview';
  function show(id,tab='overview'){
    const hero=heroes.find(row=>row.id===id);if(!hero)return;
    selected=id;section=tab;select.value=id;sessionStorage.setItem('selected-character',id);
    const hash=tab&&tab!=='overview'?'#'+encodeURIComponent(tab):'';
    const src='./adventurer.html?id='+encodeURIComponent(id)+'&embedded=1'+hash;
    if(frame.getAttribute('src')!==src)frame.src=src;
    frame.hidden=false;empty.hidden=true;onSelect?.(id);
  }
  select.onchange=()=>show(select.value);
  root.update=rows=>{
    heroes=(rows||[]).filter(hero=>hero.is_alive);
    const preferred=heroes.some(hero=>hero.id===selected)?selected:heroes.some(hero=>hero.id===sessionStorage.getItem('selected-character'))?sessionStorage.getItem('selected-character'):heroes[0]?.id||null;
    select.replaceChildren(...heroes.map(hero=>new Option(`${hero.name} · ${hero.health} HP`,hero.id)));
    select.disabled=!heroes.length;
    if(preferred)show(preferred,section);else{selected=null;frame.hidden=true;frame.removeAttribute('src');empty.hidden=false;}
  };
  root.open=show;
  root.selected=()=>selected;
  return root;
};
window.GameBulletin = (host, accept) => {
  const section=document.createElement('section');section.className='bulletin-board';
  section.innerHTML='<h2>Bulletin Board</h2><p class="muted">Soul recovery contracts</p><div class="bulletin-list"></div>';
  host.prepend(section);
  const list=section.querySelector('.bulletin-list');let rows=[],pending=false,previous='';
  const node=(tag,text)=>{const element=document.createElement(tag);element.textContent=text;return element;};
  return data=>{
    if(JSON.stringify(data)===previous)return;previous=JSON.stringify(data);rows=data;list.replaceChildren();
    if(!rows.length)list.append(node('p','No recovery contracts posted.'));
    for(const row of rows) {
      const card=document.createElement('article');card.className='bulletin-contract';card.dataset.contractId=row.id;
      card.append(node('h3',row.title),node('p',row.region+' / '+row.encounter_count+' encounters'),node('small',row.soul_count+' souls / '+row.status.replaceAll('_',' ')));
      const inspectButton=node('button','Review contract & gather party');inspectButton.dataset.localControl='';inspectButton.disabled=pending||row.status!=='open';inspectButton.onclick=async()=>{if(pending)return;pending=true;try{await accept(row);}finally{pending=false;}};card.append(inspectButton);list.append(card);
    }
  };
};

/* Home uses published announcements and the player's existing party memberships. */
window.GameHome = ({news = [], navigate, manageFriends, resume}) => {
  const home=document.createElement('section');home.className='village-home';
  home.innerHTML=`<div class="home-welcome"><p class="eyebrow">MOSSWOOD VILLAGE</p><h2>Your next story starts here.</h2><p>Catch up with the village, gather your friends, and find your next quest.</p><button class="home-resume" hidden>Resume Adventure</button></div>
    <div class="home-quests"><article><span class="eyebrow">EXPLORE</span><h3>Quests</h3><p>Start a journey, venture deeper into an epic, or take on a raid.</p><button data-home-route="quest-list">Find a Quest</button></article>
    <article><span class="eyebrow">HELP THE VILLAGE</span><h3>Bulletin Board</h3><p>Take a soul recovery contract and bring fallen adventurers home.</p><button data-home-route="bulletin">Browse Contracts</button></article></div>
    <div class="home-feeds"><section aria-labelledby="news-heading"><h3 id="news-heading">Village News</h3><div class="news-feed"></div></section>
    <section aria-labelledby="friends-heading"><h3 id="friends-heading">Friend Feed</h3><p class="muted">The latest status of friends in your parties.</p><div class="friend-feed" aria-live="polite"></div><button class="home-friends">Gather Friends</button></section></div>`;
  const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
  for(const entry of news) {
    const article=node('article','');article.className='feed-entry';
    article.append(node('small',entry.label || 'Village update'),node('h4',entry.title),node('p',entry.body));
    if(entry.destination) {const button=node('button',entry.linkText || 'Explore');button.onclick=()=>navigate(entry.destination);article.append(button);}
    home.querySelector('.news-feed').append(article);
  }
  if(!news.length)home.querySelector('.news-feed').append(node('p','No announcements yet.'));
  home.querySelectorAll('[data-home-route]').forEach(button=>button.onclick=()=>navigate(button.dataset.homeRoute));
  home.querySelector('.home-friends').onclick=manageFriends;
  let activeEncounter=null;
  home.querySelector('.home-resume').onclick=()=>resume(activeEncounter);
  home.update=({parties=[],heroes=[],signedIn=false,error=false,encounterId=null}={})=>{
    activeEncounter=encounterId || heroes.find(h=>h.active_encounter_id)?.active_encounter_id;
    home.querySelector('.home-resume').hidden=!signedIn || !activeEncounter;
    const feed=home.querySelector('.friend-feed');feed.replaceChildren();
    const own=new Set(heroes.map(h=>h.id));const seen=new Set();
    if(signedIn) for(const party of parties) for(const member of party.members || []) {
      if(own.has(member.id) || seen.has(member.id))continue;seen.add(member.id);
      const article=node('article','');article.className='feed-entry';
      const status=party.active_encounter_id ? 'Adventuring' : !member.is_alive ? 'Fallen' : member.is_ready ? 'Ready to depart' : 'Preparing in the village';
      article.append(node('h4',member.name),node('p',status),node('small',party.name));feed.append(article);
    }
    if(!seen.size) feed.append(node('p',!signedIn ? 'Log in to see your party friends and their adventures.' : error ? 'Friend activity is unavailable right now. Try refreshing the page.' : 'Your party friends will appear here. Invite a friend or join their party to adventure together.'));
    home.querySelector('.home-friends').textContent=signedIn ? 'Gather Friends' : 'Log In to Gather Friends';
  };
  home.update();return home;
};
