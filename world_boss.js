window.GameWorldBoss = ({api,isSignedIn,hero,onReview,onClaimed}) => {
  const panel=document.createElement('section');panel.className='world-boss-panel';
  panel.innerHTML=`<p class="eyebrow">SERVER-WIDE ALPHA FINALE</p><h2>Alpha Wolf</h2>
    <p>Every night at 8 PM America/Denver. All parties share one colossal health pool; the wolf attacks each party separately.</p>
    <p class="world-boss-consequence" data-world-policy></p>
    <label data-world-settings hidden><input type="checkbox" role="switch" data-world-delete> Delete adventurers on failure</label>
    <p data-world-settings-help hidden>Turning this on arms permanent deletion of every adventurer, inventory, and progression record if the timer expires. Accounts remain. Victory then unlocks beta. Changes apply to the current event too.</p>
    <div class="world-boss-stats"><strong data-world-health>10,000,000 HP</strong><strong data-world-timer>Loading schedule…</strong><span data-world-parties></span></div>
    <progress data-world-bar aria-label="Alpha Wolf shared health" max="10000000" value="10000000"></progress>
    <p data-world-phase></p><p>Reward: a nine-piece epic Wolf Sovereign set, earned once per contributing account per event. Account bound; cannot be auctioned.</p>
    <div class="row"><button type="button" data-world-join disabled>Review event & gather party</button><button type="button" data-world-refresh>Refresh event</button><button type="button" data-world-claim hidden>Claim epic set</button></div>
    <p data-world-message role="status"></p>`;
  const get=s=>panel.querySelector(s);let data=null,pending=false,offset=0;
  function draw(){
    if(!data)return;
    get('[data-world-settings]').hidden=!data.can_manage;
    get('[data-world-settings-help]').hidden=!data.can_manage;
    get('[data-world-delete]').checked=data.delete_adventurers_on_failure;
    get('[data-world-delete]').disabled=pending;
    get('[data-world-policy]').textContent=data.delete_adventurers_on_failure?'Deletion ON: ten minutes to defeat the wolf. Failure permanently deletes all adventurers, inventories, and progression; accounts remain. Victory unlocks beta.':'Deletion OFF: nightly testing. The ten-minute deadline retains adventurers on failure. Victories keep testing going; beta stays locked. Normal combat death still applies.';
    const event=data.event,active=event?.status==='active',now=Date.now()+offset;
    const health=event?.health??data.max_health,max=event?.max_health??data.max_health;
    get('[data-world-health]').textContent=`${health.toLocaleString()} / ${max.toLocaleString()} HP`;
    get('[data-world-bar]').max=max;get('[data-world-bar]').value=health;
    get('[data-world-parties]').textContent=event?`${event.parties} parties joined`:'';
    const seconds=Math.max(0,Math.ceil((Date.parse(active?event.ends_at:data.next_start_at)-now)/1000));
    get('[data-world-timer]').textContent=data.phase==='beta'?'Beta unlocked':active?`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} remaining`:`Next event: ${new Date(data.next_start_at).toLocaleString(undefined,{timeZone:'America/Denver'})} America/Denver`;
    get('[data-world-phase]').textContent=data.phase==='beta'?'The Alpha Wolf fell. The server has entered beta; no further alpha wipes.':event?.status==='failed'?(event.wiped_adventurers?`The previous event failed. ${event.wiped_adventurers} adventurers were wiped. Rebuild for the next attempt.`:'The previous event failed. No server-wide deletion occurred. Prepare for the next nightly attempt.'):active?'The Alpha Wolf is attacking. Join with a ready party now.':'Alpha testing continues. Prepare your party before the event opens.';
    get('[data-world-join]').disabled=!active||seconds===0||data.phase==='beta';
    get('[data-world-claim]').hidden=!data.rewards.length;get('[data-world-claim]').disabled=!hero();
  }
  async function refresh(){if(!isSignedIn()||pending)return;pending=true;try{data=await api('/world-boss');offset=Date.parse(data.server_time)-Date.now();draw();}catch(error){get('[data-world-message]').textContent=error.message;}finally{pending=false;draw();}}
  get('[data-world-delete]').onchange=async()=>{
    if(pending||!data?.can_manage){draw();return;}
    const enabled=get('[data-world-delete]').checked;pending=true;get('[data-world-delete]').disabled=true;
    try{const saved=await api('/world-boss',{delete_adventurers_on_failure:enabled},'PATCH');data.delete_adventurers_on_failure=saved.delete_adventurers_on_failure;get('[data-world-message]').textContent=enabled?'Adventurer deletion is ON. Failure will permanently wipe every adventurer.':'Adventurer deletion is OFF. Nightly testing continues.';}
    catch(error){get('[data-world-message]').textContent=error.message;}
    finally{pending=false;draw();await refresh();}
  };
  get('[data-world-refresh]').onclick=refresh;
  get('[data-world-join]').onclick=()=>onReview(data.template_slug);
  get('[data-world-claim]').onclick=async()=>{if(!hero()||pending)return;pending=true;try{const result=await api('/world-boss/rewards/claim',{event_id:data.rewards[0],adventurer_id:hero().id});get('[data-world-message]').textContent=result.message;await onClaimed();}catch(error){get('[data-world-message]').textContent=error.message;}finally{pending=false;await refresh();}};
  setInterval(()=>{if(isSignedIn()&&panel.getClientRects().length)refresh();},2000);setInterval(draw,1000);
  panel.refresh=refresh;return panel;
};
