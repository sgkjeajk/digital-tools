'use strict';
// Credentials remain inside this closure and are never written to browser storage.
window.ECGitHub=(()=>{
 const repo='sgkjeajk/digital-tools',branch='main',base='https://api.github.com/repos/'+repo;
 const MAX_TICKERS=50;
 let credential='';const catalogs=new Map();
 const headers=(extra={})=>({...extra,'X-GitHub-Api-Version':'2022-11-28',...(credential?{Authorization:'Bearer '+credential}:{})});
 async function request(path,options={}){
  const r=await fetch(base+path,{...options,cache:'no-store',headers:headers({Accept:'application/vnd.github+json',...(options.headers||{})})});
  if(!r.ok){let detail;try{detail=(await r.json()).message;}catch(e){}throw Error('GitHub '+r.status+': '+(detail||'Request failed.')+(r.status===401?' Connect with a valid token.':r.status===403?' Check token permissions or API rate limits.':''));}
  return r.status===204?null:r.json();
 }
 const decode=s=>new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g,'')),c=>c.charCodeAt(0)));
 const encode=s=>{let binary='';for(const byte of new TextEncoder().encode(s))binary+=String.fromCharCode(byte);return btoa(binary);};
 async function file(path){const raw=await request('/contents/'+path+'?ref='+branch+'&ts='+Date.now());return {data:JSON.parse(decode(raw.content)),sha:raw.sha};}
 async function raw(path){return request('/contents/'+path+'?ref='+branch+'&ts='+Date.now(),{headers:{Accept:'application/vnd.github.raw+json'}});}
 function normalise(t){if(typeof t!=='string')throw Error('Ticker must be text.');t=t.trim().toUpperCase();if(!/^[A-Z0-9][A-Z0-9.\-]{0,31}$/.test(t)||/[.\-]{2}/.test(t)||/[.\-]$/.test(t))throw Error('Invalid ticker format.');return t;}
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),id=()=>crypto.randomUUID();
 async function dispatch(inputs={}){if(!credential)throw Error('Connect GitHub first. New price retrieval and online metadata lookup require Actions: read and write.');return request('/actions/workflows/stock-monitor.yml/dispatches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:branch,inputs})});}
 async function lookup(t){t=normalise(t);const prefix=t[0];if(!catalogs.has(prefix))catalogs.set(prefix,raw('data/symbol-directory/'+prefix+'.json').catch(e=>{catalogs.delete(prefix);if(e.message.startsWith('GitHub 404:'))return {};throw e;}));const catalog=await catalogs.get(prefix);if(Object.hasOwn(catalog,t)){const x=catalog[t];return {ticker:t,name:x.name,region:x.market,type:x.type,metadata_source:x.source};}
  const requestId=id();await dispatch({lookupTicker:t,requestId});
  for(let i=0;i<45;i++){await delay(4000);try{const result=await raw('data/lookups/'+encodeURIComponent(t)+'.json');if(result.request_id!==requestId)continue;if(result.error)throw Error(result.error);return result.instrument;}catch(e){if(!e.message.startsWith('GitHub 404:'))throw e;}}
  throw Error('Ticker verification is still pending. Check the price updater workflow, then try again. No ticker was added.');
 }
 async function save(input,items){
  if(!credential)throw Error('Connect GitHub to save a shared configuration. Nothing was saved.');
  if(items.length>MAX_TICKERS)throw Error('Maximum '+MAX_TICKERS+' tickers.');const seen=new Set();
  const instruments=items.map(x=>{const ticker=normalise(x.ticker);if(seen.has(ticker))throw Error('Duplicate ticker: '+ticker);seen.add(ticker);if(typeof x.enabled!=='boolean'||!['ETF','Stock'].includes(x.type)||!x.name||!x.market)throw Error('Verify every ticker before saving.');return {ticker,enabled:x.enabled,name:x.name,region:x.market,type:x.type,metadata_source:x.source||x.metadata_source};}).sort((a,b)=>(a.type==='ETF'?0:1)-(b.type==='ETF'?0:1)||a.ticker.localeCompare(b.ticker));
  const interval=input.refreshIntervalMinutes;if(![5,10,15,30,60].includes(interval))throw Error('Invalid refresh interval.');
  const latest=await file('data/stock-tickers.json');if((latest.data.revision||0)!==input.revision)throw Error('Another save changed the configuration. Reload before saving your draft.');
  const cfg={version:1,revision:input.revision+1,refreshIntervalMinutes:interval,saved_at:new Date().toISOString(),instruments};
  const result=await request('/contents/data/stock-tickers.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Update Stock ETF Monitor ticker configuration',branch,sha:latest.sha,content:encode(JSON.stringify(cfg,null,2)+'\n')})});
  return {...cfg,commit_sha:result.commit?.sha};
 }
 async function refreshPrices(progress=()=>{}){
  const requestId=id();await dispatch({requestId});progress('Price retrieval queued in GitHub Actions. Waiting for its result…');
  for(let i=0;i<45;i++){await delay(4000);const data=await raw('market-data.json');if(data.request_id===requestId)return data;}
  throw Error('Price retrieval is still queued or running. Saved prices retain their timestamps. Check the updater workflow and refresh this page later.');
 }
 function mount(container){
  container.innerHTML='<details><summary>Owner access — connect GitHub</summary><p>For shared saves and new price retrieval, use a fine-grained token restricted to <b>sgkjeajk/digital-tools</b>, with <b>Contents: read and write</b> and <b>Actions: read and write</b>. The token stays in this tab’s memory until you disconnect or reload. Never paste it into chat.</p><label>GitHub token <input type="password" autocomplete="off" spellcheck="false" aria-label="GitHub token"></label><button type="button" class="connect">Connect GitHub</button> <button type="button" class="disconnect">Disconnect</button><p class="auth-status" role="status">Not connected. Public viewing is available.</p><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">Create a restricted token</a> · <a href="https://github.com/sgkjeajk/digital-tools/actions/workflows/stock-monitor.yml" target="_blank" rel="noopener noreferrer">Check price updater</a></details>';
  const input=container.querySelector('input'),status=container.querySelector('.auth-status'),button=container.querySelector('.connect');
  button.onclick=async()=>{const value=input.value.trim();input.value='';if(!value){status.textContent='Enter your restricted GitHub token.';return;}credential=value;button.disabled=true;try{await request('');status.textContent='Connected for this tab. Save writes the shared GitHub ticker configuration.';}catch(e){credential='';status.textContent=e.message;}finally{button.disabled=false;}};
  container.querySelector('.disconnect').onclick=()=>{credential='';input.value='';status.textContent='Disconnected. The token has been cleared from this tab.';};
 }
 return {file,raw,lookup,save,refreshPrices,mount,connected:()=>Boolean(credential)};
})();
