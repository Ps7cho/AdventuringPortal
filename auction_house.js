window.GameAuctionHouse = ({api}) => {
  const panel=document.createElement('section');panel.className='auction-house';
  panel.innerHTML=`<h2>Auction House</h2><p>Trade equipment, consumables, essences, and orbs with other players. Prices are for the whole listing. No trading fee.</p>
    <div class="row market-identity"><span>Trading as <strong data-market-hero>No character selected</strong></span><button data-market-refresh>Refresh Market</button></div>
    <p data-market-gold></p><p data-market-status role="status"></p>
    <div class="row"><button data-market-view="browse" aria-pressed="true">Browse Listings</button><button data-market-view="mine" aria-pressed="false">My Sales & Bids</button></div>
    <details class="market-sell"><summary>Sell an Item</summary><p>Listed items are held until sold, cancelled, or expired. Unequip weapons before listing. Auctions with bids cannot be cancelled.</p>
      <form data-market-sell><label>Item <select name="item" required></select></label><label>Quantity <input name="quantity" type="number" min="1" max="9999" value="1" required></label>
      <label>Sale type <select name="mode"><option value="fixed">Fixed price</option><option value="auction">Timed auction</option></select></label>
      <label><span data-price-label>Total price (gold)</span> <input name="price" type="number" min="1" max="100000000" required></label>
      <label>Duration <select name="duration"><option value="1">1 hour</option><option value="24" selected>24 hours</option><option value="72">3 days</option><option value="168">7 days</option></select></label><button>List Item</button></form></details>
    <div data-market-list class="market-list"></div><div class="row"><button data-market-prev>Previous</button><button data-market-next>Next</button></div>`;
  const get=s=>panel.querySelector(s), form=get('[data-market-sell]'), heroLabel=get('[data-market-hero]');
  let busy=false, heroes=[], selectedHeroId=sessionStorage.getItem('selected-character')||'', inventory=[], rows=[], offset=0, mine=false, hasMore=false, epoch=0;
  const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
  const hero=()=>heroes.find(h=>String(h.id)===String(selectedHeroId));
  const canTrade=()=>hero()?.is_alive && hero()?.health>0 && !hero()?.active_encounter_id;
  const selectedItem=()=>inventory.find(i=>i.key===form.elements.namedItem('item').value);
  panel.updateControls=()=>{
    panel.querySelectorAll('button,input,select').forEach(e=>e.disabled=busy);
    form.querySelector('button').disabled=busy || !canTrade() || !selectedItem();
    form.elements.quantity.disabled=busy || ['weapon','gear'].includes(selectedItem()?.item_type);
    get('[data-market-prev]').disabled=busy || offset===0;get('[data-market-next]').disabled=busy || !hasMore;
    panel.querySelectorAll('[data-trade]').forEach(b=>b.disabled=busy || !canTrade() || Date.parse(b.dataset.expires)<=Date.now());
    panel.querySelectorAll('[data-cancel]').forEach(b=>b.disabled=busy || Date.parse(b.dataset.expires)<=Date.now());
  };
  async function task(work) {
    if(busy)return;busy=true;const generation=epoch;get('[data-market-status]').textContent='';panel.updateControls();
    try {await work(generation);} catch(error) {if(generation===epoch)get('[data-market-status]').textContent=error.message;}
    finally {if(generation===epoch){busy=false;panel.updateControls();}}
  }
  async function loadInventory(generation) {
    const h=hero();inventory=[];
    if(h) {
      const sheet=await api('/adventurers/'+encodeURIComponent(h.id));if(generation!==epoch)return;
      const equipped=new Set(Object.values(sheet.equipment || {}).filter(Boolean).map(i=>i.id));
      inventory=[...(sheet.inventory || []).filter(i=>(i.weapon_type || i.item_type==='gear') && !equipped.has(i.id)).map(i=>({...i,item_type:i.weapon_type?'weapon':'gear',key:'equipment:'+i.id,quantity:1})),
        ...(sheet.consumables || []).filter(i=>i.quantity>0).map(i=>({...i,item_type:'consumable',key:'item:'+i.slug}))];
      h.gold=sheet.gold;
    }
    if(generation!==epoch)return;
    form.elements.namedItem('item').replaceChildren(new Option('Choose an item',''),...inventory.map(i=>new Option(i.name+' ? '+i.quantity,i.key)));
    heroLabel.textContent=h?.name||'No character selected';
    get('[data-market-gold]').textContent=h ? h.name+' ? '+h.gold+' gold'+(!canTrade()?' ? Return to the village with a living adventurer to trade.':'') : 'Select a living adventurer in Character to trade.';
  }
  async function reload(generation) {
    const [people,data]=await Promise.all([api('/adventurers'),api('/auction-house?mine='+mine+'&offset='+offset)]);
    if(generation!==epoch)return;
    heroes=people;
    rows=data.listings;hasMore=data.has_more;await loadInventory(generation);
    if(generation===epoch)draw();
  }
  function transact(row,action,body) {return task(async generation=>{
    await api('/auction-house/'+row.id+'/'+action,body);if(generation!==epoch)return;
    await reload(generation);get('[data-market-status]').textContent=action==='bid'?'Bid placed. Your bid gold is held until you win or are outbid.':action==='cancel'?'Listing cancelled. Item returned.':'Purchase complete.';
  });}
  function draw() {
    const list=get('[data-market-list]');list.replaceChildren();
    if(!rows.length)list.append(node('p',mine?'No sales or bids yet.':'No listings available. Be the first to list an item.'));
    for(const row of rows) {
      const card=node('article','');card.className='market-card';
      card.append(node('h3',row.item.name+' ? '+row.quantity),node('p',row.mode==='fixed'?'Fixed price: '+row.price+' gold':'Highest bid: '+row.bid+' gold ? Next bid: '+row.minimum_bid+' gold'),node('small','Seller: '+row.seller+' ? '+row.status+(row.my_bid?' ? Your bid':'')));
      if(row.item.item_type==='weapon')card.append(node('p',row.item.base_damage+' damage ? '+row.item.required_rank+' rank ? '+row.item.tags.join(', ')));
      else if(row.item.item_type==='gear')card.append(node('p',row.item.slot+' ? '+row.item.required_rank+' rank ? '+Object.entries(row.item.bonuses).map(([k,v])=>k+' +'+v).join(', ')));
      else if(row.item.description)card.append(node('p',row.item.description));
      card.append(node('p',(row.status==='open'?'Ends ':'Deadline ')+new Date(row.expires_at).toLocaleString()));
      if(row.status==='open') {
        if(row.mine && !row.bid) {const b=node('button','Cancel Listing');b.dataset.cancel='';b.dataset.expires=row.expires_at;b.onclick=()=>transact(row,'cancel',{});card.append(b);}
        else if(!row.mine && row.mode==='fixed') {const b=node('button','Buy for '+row.price+' gold');b.dataset.trade='';b.dataset.expires=row.expires_at;b.onclick=()=>transact(row,'buy',{adventurer_id:selectedHeroId});card.append(b);}
        else if(!row.mine) {
          const bidForm=node('form','');bidForm.className='row';const label=node('label','Bid amount (gold) '),input=document.createElement('input');
          input.type='number';input.min=row.minimum_bid;input.max=100000000;input.value=row.minimum_bid;input.required=true;label.append(input);
          const b=node('button','Place Bid');b.dataset.trade='';b.dataset.expires=row.expires_at;
          bidForm.append(label,b);bidForm.onsubmit=e=>{e.preventDefault();transact(row,'bid',{adventurer_id:selectedHeroId,amount:Number(input.value)});};card.append(bidForm);
        }
      }
      list.append(card);
    }
  }
  panel.refresh=()=>task(reload);
  panel.setAdventurer=id=>{selectedHeroId=id?String(id):'';heroLabel.textContent=hero()?.name||'No character selected';panel.updateControls();};
  panel.reset=()=>{epoch++;busy=false;heroes=[];inventory=[];rows=[];offset=0;form.reset();form.elements.namedItem('item').replaceChildren();get('[data-market-list]').replaceChildren();heroLabel.textContent='No character selected';get('[data-market-gold]').textContent='';get('[data-market-status]').textContent='';};
  get('[data-market-refresh]').onclick=panel.refresh;
  panel.querySelectorAll('[data-market-view]').forEach(b=>b.onclick=()=>{if(busy)return;mine=b.dataset.marketView==='mine';offset=0;panel.querySelectorAll('[data-market-view]').forEach(e=>e.setAttribute('aria-pressed',String(e===b)));panel.refresh();});
  get('[data-market-prev]').onclick=()=>{offset=Math.max(0,offset-50);panel.refresh();};get('[data-market-next]').onclick=()=>{offset+=50;panel.refresh();};
  form.elements.mode.onchange=()=>{get('[data-price-label]').textContent=form.elements.mode.value==='auction'?'Starting bid for the lot (gold)':'Total price (gold)';};
  form.elements.namedItem('item').onchange=()=>{form.elements.quantity.value=1;form.elements.quantity.max=selectedItem()?.quantity || 1;panel.updateControls();};
  form.onsubmit=e=>{e.preventDefault();const item=selectedItem();if(!item)return;task(async generation=>{
    await api('/auction-house',{adventurer_id:selectedHeroId,mode:form.elements.mode.value,quantity:Number(form.elements.quantity.value),price:Number(form.elements.price.value),duration_hours:Number(form.elements.duration.value),
      ...(item.item_type==='weapon'?{weapon_id:item.id}:item.item_type==='gear'?{gear_id:item.id}:{consumable_slug:item.slug})});
    if(generation!==epoch)return;await reload(generation);get('[data-market-status]').textContent='Item listed. It is held by the auction house until this listing closes.';
  });};
  return panel;
};
