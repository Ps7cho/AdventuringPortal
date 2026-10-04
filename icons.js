/* Shared blank artwork slots and the Worldsmith asset picker. */
window.GameIcons = (() => {
  const base = new URL('./', document.currentScript.src);
  let library;
  const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  function valid(path){return typeof path==='string'&&path.startsWith('assets/icons/')&&path.endsWith('.webp')&&!path.split('/').some(p=>!p||p==='.'||p==='..')&&!/[\\:?#]/.test(path);}
  function element(path){
    const frame=node('span');frame.className='object-icon';frame.setAttribute('role','img');frame.setAttribute('aria-label','No icon assigned');
    if(valid(path)){
      const img=node('img');img.alt='';img.loading='lazy';img.src=new URL(path.split('/').map(encodeURIComponent).join('/'),base).href;
      frame.setAttribute('aria-label','Object icon');
      img.onerror=()=>{img.remove();frame.setAttribute('aria-label','Icon unavailable');};frame.append(img);
    }
    return frame;
  }
  function load(){
    if(!library)library=fetch(new URL('assets/icons/manifest.json',base)).then(response=>{if(!response.ok)throw new Error('Icon library could not be loaded.');return response.json();}).catch(error=>{library=null;throw error;});
    return library;
  }
  function picker(input){
    const root=node('section');root.className='icon-picker';root.setAttribute('aria-label','Object icon picker');
    const current=node('div');current.className='icon-picker-current';
    const caption=node('span'),clear=node('button','Use blank icon');clear.type='button';clear.setAttribute('aria-label','Use blank icon');
    const controls=node('div');controls.className='icon-picker-controls';
    const search=node('input');search.type='search';search.placeholder='Search icons';search.setAttribute('aria-label','Search icons');
    const category=node('select');category.setAttribute('aria-label','Icon category');category.add(new Option('All categories',''));
    const grid=node('div');grid.className='icon-picker-grid';grid.setAttribute('role','group');grid.setAttribute('aria-label','Available icons');
    const status=node('p','Loading icon library…');status.setAttribute('role','status');
    const pages=node('div');pages.className='icon-picker-pages';
    const previous=node('button','Previous icons'),next=node('button','Next icons');previous.type=next.type='button';pages.append(previous,next);
    let icons=[],page=0,ready=false;
    function selected(){current.replaceChildren(element(input.value),caption,clear);caption.textContent=input.value?input.value.split('/').slice(2).join(' / '):'Blank icon';}
    function assign(path){if(input.disabled)return;input.value=path;input.dispatchEvent(new Event('input',{bubbles:true}));selected();render();}
    clear.onclick=()=>assign('');
    function render(){
      if(!ready)return;
      const query=search.value.trim().toLowerCase(),filtered=icons.filter(icon=>(!category.value||icon.category===category.value)&&`${icon.name} ${icon.category}`.toLowerCase().includes(query));
      const count=Math.max(1,Math.ceil(filtered.length/60));page=Math.max(0,Math.min(page,count-1));grid.replaceChildren();
      for(const icon of filtered.slice(page*60,(page+1)*60)){
        const button=node('button');button.type='button';button.className='icon-choice';button.title=`${icon.category} / ${icon.name}`;button.setAttribute('aria-label',`Assign ${icon.category} / ${icon.name}`);button.setAttribute('aria-pressed',String(input.value===icon.path));button.append(element(icon.path),node('small',icon.name));button.onclick=()=>assign(icon.path);grid.append(button);
      }
      previous.disabled=page===0;next.disabled=page>=count-1;status.textContent=`${filtered.length} icons · Page ${page+1} of ${count}`;
    }
    search.oninput=category.onchange=event=>{event.stopPropagation();page=0;render();};previous.onclick=()=>{page--;render();};next.onclick=()=>{page++;render();};
    controls.append(search,category);root.append(current,controls,grid,status,pages);selected();
    load().then(data=>{icons=data;for(const name of [...new Set(icons.map(icon=>icon.category))].sort())category.add(new Option(name,name));ready=true;render();}).catch(error=>{status.textContent=error.message;const retry=node('button','Retry loading icons');retry.type='button';retry.onclick=()=>{const replacement=picker(input);root.replaceWith(replacement);};root.append(retry);});
    return root;
  }
  return {element,picker};
})();
