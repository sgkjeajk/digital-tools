'use strict';
// Credentials remain inside this closure and are never written to browser storage.
window.ECGitHub=(()=>{
 const tickerRepo='sgkjeajk/stkref',settingsRepo='myai118/digital-tools',branch='main';
 const baseFor=repo=>'https://api.github.com/repos/'+repo;
  const DEFAULT_PRICE_CHECKER={enabled:true,intervalMinutes:8,cycles:30,maxActiveCheckers:3,categories:{ETF:true,Stock:true,Fund:true}};
 const CHECKER_INTERVALS=[5,6,8,9,10];
 let credentials={stkref:'',digitalTools:''};const catalogs=new Map();
 const tokenFor=repo=>repo===tickerRepo?credentials.stkref:credentials.digitalTools;
 const headers=(repo,extra={})=>({...extra,'X-GitHub-Api-Version':'2022-11-28',...(tokenFor(repo)?{Authorization:'Bearer '+tokenFor(repo)}:{})});
 async function request(repo,path,options={}){
  const r=await fetch(baseFor(repo)+path,{...options,cache:'no-store',headers:headers(repo,{Accept:'application/vnd.github+json',...(options.headers||{})})});
  if(!r.ok){let detail;try{detail=(await r.json()).message;}catch(e){}throw Error('GitHub '+r.status+': '+(detail||'Request failed.')+(r.status===401?' Connect with a valid token.':r.status===403?' Check token permissions or API rate limits.':''));}
  return r.status===204?null:r.json();
 }
 const decode=s=>new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g,'')),c=>c.charCodeAt(0)));
 const encode=s=>{let binary='';for(const byte of new TextEncoder().encode(s))binary+=String.fromCharCode(byte);return btoa(binary);};
 async function file(path,repo=tickerRepo){const raw=await request(repo,'/contents/'+path+'?ref='+branch+'&ts='+Date.now());return {data:JSON.parse(decode(raw.content)),sha:raw.sha};}
 async function raw(path,repo=tickerRepo){return request(repo,'/contents/'+path+'?ref='+branch+'&ts='+Date.now(),{headers:{Accept:'application/vnd.github.raw+json'}});}
 function normalise(t){if(typeof t!=='string')throw Error('Ticker must be text.');t=t.trim().toUpperCase();if(!/^[A-Z0-9][A-Z0-9.\-]{0,31}$/.test(t)||/[.\-]{2}/.test(t)||/[.\-]$/.test(t))throw Error('Invalid ticker format.');return t;}
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),id=()=>crypto.randomUUID();
 async function dispatch(repo,workflow,inputs={}){if(!tokenFor(repo))throw Error('Connect the GitHub token for '+repo+' first. Actions: read and write is required.');return request(repo,'/actions/workflows/'+workflow+'/dispatches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:branch,inputs})});}
 async function lookup(t){t=normalise(t);const prefix=t[0];if(!catalogs.has(prefix))catalogs.set(prefix,raw('data/symbol-directory/'+prefix+'.json').catch(e=>{catalogs.delete(prefix);if(e.message.startsWith('GitHub 404:'))return {};throw e;}));const catalog=await catalogs.get(prefix);if(Object.hasOwn(catalog,t)){const x=catalog[t];return {ticker:t,name:x.name,region:x.market,type:x.type,metadata_source:x.source};}
  const requestId=id();await dispatch(tickerRepo,'ticker-lookup.yml',{ticker:t,request_id:requestId});
  for(let i=0;i<45;i++){await delay(4000);try{const result=await raw('data/lookups/'+encodeURIComponent(t)+'.json');if(result.request_id!==requestId)continue;if(result.error)throw Error(result.error);return result.instrument;}catch(e){if(!e.message.startsWith('GitHub 404:'))throw e;}}
  throw Error('Ticker verification is still pending. Check the price updater workflow, then try again. No ticker was added.');
 }
 async function save(input,items){
  if(!credentials.stkref)throw Error('Connect a GitHub token restricted to sgkjeajk/stkref. Nothing was saved.');
  const seen=new Set();
  const instruments=items.map(x=>{const ticker=normalise(x.ticker);if(seen.has(ticker))throw Error('Duplicate ticker: '+ticker);seen.add(ticker);if(typeof x.enabled!=='boolean'||!['ETF','Stock','Fund'].includes(x.type)||!x.name||!x.market)throw Error('Verify every ticker before saving.');return {ticker,enabled:x.enabled,show:x.type==='Fund'?x.show!==false:true,name:x.name,region:x.market,type:x.type,metadata_source:x.source||x.metadata_source};}).sort((a,b)=>({ETF:0,Stock:1,Fund:2}[a.type]??3)-({ETF:0,Stock:1,Fund:2}[b.type]??3)||a.ticker.localeCompare(b.ticker));
  const interval=input.refreshIntervalMinutes;if(![5,10,15,30,60].includes(interval))throw Error('Invalid refresh interval.');
  const rawChecker=input.priceChecker||{},rawCategories=rawChecker.categories||{};
  const priceChecker={
   enabled:typeof rawChecker.enabled==='boolean'?rawChecker.enabled:DEFAULT_PRICE_CHECKER.enabled,
   intervalMinutes:CHECKER_INTERVALS.includes(Number(rawChecker.intervalMinutes))?Number(rawChecker.intervalMinutes):DEFAULT_PRICE_CHECKER.intervalMinutes,
   cycles:Number.isInteger(Number(rawChecker.cycles))?Math.max(1,Number(rawChecker.cycles)):DEFAULT_PRICE_CHECKER.cycles,
   maxActiveCheckers:Number.isInteger(Number(rawChecker.maxActiveCheckers))?Math.max(1,Number(rawChecker.maxActiveCheckers)):DEFAULT_PRICE_CHECKER.maxActiveCheckers,
   categories:{
    ETF:typeof rawCategories.ETF==='boolean'?rawCategories.ETF:DEFAULT_PRICE_CHECKER.categories.ETF,
    Stock:typeof rawCategories.Stock==='boolean'?rawCategories.Stock:DEFAULT_PRICE_CHECKER.categories.Stock,
    Fund:typeof rawCategories.Fund==='boolean'?rawCategories.Fund:DEFAULT_PRICE_CHECKER.categories.Fund
   }
  };
  const latest=await file('data/stock-tickers.json',tickerRepo);if((latest.data.revision||0)!==input.revision)throw Error('Another save changed the configuration. Reload before saving your draft.');
  const cfg={...latest.data,version:1,revision:input.revision+1,refreshIntervalMinutes:interval,priceChecker:{...(latest.data.priceChecker||{}),...priceChecker},saved_at:new Date().toISOString(),instruments};
  const result=await request(tickerRepo,'/contents/data/stock-tickers.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Update Stock ETF Monitor ticker configuration',branch,sha:latest.sha,content:encode(JSON.stringify(cfg,null,2)+'\n')})});
  return {...cfg,commit_sha:result.commit?.sha};
 }
 async function getCheckerSnapshot(path){return raw(path);}
 async function refreshPrices(progress=()=>{}){
  const requestId=id();await dispatch(tickerRepo,'task.yml',{request_id:requestId,force_price_check:'true',refresh_ath:'true'});progress('STKREF price and ATH retrieval queued. Waiting for the STKREF workflow…');
  for(let i=0;i<45;i++){await delay(4000);const data=await raw('market-data.json',tickerRepo);if(data.request_id===requestId)return data;}
  throw Error('STKREF price retrieval is still queued or running. Saved prices retain their timestamps. Check the STKREF Task workflow and refresh later.');
 }
 async function startChecker(progress=()=>{}){
  const data=await raw('data/stock-monitor.json',tickerRepo).catch(()=>raw('market-data.json',tickerRepo));
  const timestamp=data.last_check_completed_at||data.generated_at;
  if(timestamp){
   const ageMinutes=(Date.now()-Date.parse(timestamp))/60000;
   if(Number.isFinite(ageMinutes)&&ageMinutes<15){
    throw Error('Checker is already fresh: last completed check was '+ageMinutes.toFixed(1)+' minutes ago. No recovery launch needed.');
   }
  }
  const cfg=await raw('data/stock-tickers.json',tickerRepo),settings={...DEFAULT_PRICE_CHECKER,...(cfg.priceChecker||{})};
  const requestId=id();await dispatch(tickerRepo,'task.yml',{request_id:requestId});progress('Price checker queued in sgkjeajk/stkref. Saved settings: '+(settings.enabled?'enabled':'disabled')+', '+settings.cycles+' cycles, about every '+settings.intervalMinutes+' minutes.');
  return {requestId,workflowUrl:'https://github.com/'+tickerRepo+'/actions/workflows/task.yml'};
 }
 function mount(container){
  container.innerHTML='<details open><summary>STKREF access — connect GitHub</summary><p><b>This admin saves ticker configuration to <code>sgkjeajk/stkref</code> → <code>data/stock-tickers.json</code>.</b> Create a fine-grained token with Resource owner <b>sgkjeajk</b>, Repository access set to <b>Only select repositories</b> → <b>stkref</b>, and <b>Contents: read and write</b> plus <b>Actions: read and write</b>. The token stays in this tab’s memory until disconnected or reloaded. Never paste it into chat.</p><label>STKREF GitHub token <input type="password" data-token="stkref" autocomplete="off" spellcheck="false" aria-label="STKREF GitHub token"></label><button type="button" class="connect" data-repo="stkref">Connect STKREF</button> <button type="button" class="disconnect" data-repo="stkref">Disconnect STKREF</button><p class="auth-status" data-status="stkref" role="status">STKREF not connected. Public viewing is available.</p><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">Create a fine-grained token</a> · <a href="https://github.com/sgkjeajk/stkref" target="_blank" rel="noopener noreferrer">Open sgkjeajk/stkref</a> · <a href="https://github.com/sgkjeajk/stkref/actions/workflows/task.yml" target="_blank" rel="noopener noreferrer">STKREF price checker</a> · <a href="https://github.com/sgkjeajk/stkref/actions/workflows/ticker-lookup.yml" target="_blank" rel="noopener noreferrer">STKREF ticker lookup</a></details><details><summary>Optional Monitor page settings access</summary><p>The password and default-ticker settings below still save to <b>myai118/digital-tools</b>. Connect a separate token for that repository only if you use those settings. It is not needed to add tickers to STKREF.</p><label>Digital Tools GitHub token <input type="password" data-token="digitalTools" autocomplete="off" spellcheck="false" aria-label="Digital Tools GitHub token"></label><button type="button" class="connect" data-repo="digitalTools">Connect Digital Tools</button> <button type="button" class="disconnect" data-repo="digitalTools">Disconnect Digital Tools</button><p class="auth-status" data-status="digitalTools" role="status">Digital Tools settings not connected.</p><a href="https://github.com/myai118/digital-tools" target="_blank" rel="noopener noreferrer">Open myai118/digital-tools</a></details>';
  for(const repo of ['stkref','digitalTools']){
   const input=container.querySelector('[data-token="'+repo+'"]'),status=container.querySelector('[data-status="'+repo+'"]'),button=container.querySelector('.connect[data-repo="'+repo+'"]');
   const owner=repo==='stkref'?tickerRepo:settingsRepo;
   button.onclick=async()=>{const value=input.value.trim();input.value='';if(!value){status.textContent='Enter the token for '+owner+'.';return;}credentials[repo]=value;button.disabled=true;try{await request(owner,'');status.textContent='Connected to '+owner+' for this tab.';}catch(e){credentials[repo]='';status.textContent=e.message;}finally{button.disabled=false;}};
   container.querySelector('.disconnect[data-repo="'+repo+'"]').onclick=()=>{credentials[repo]='';input.value='';status.textContent='Disconnected from '+owner+'. The token has been cleared from this tab.';};
  }
 }
 async function savePageDefaults(page,visibleTickers,previousVisibleTickers){
  if(!credentials.digitalTools)throw Error('Connect the optional myai118/digital-tools token before saving monitor defaults.');
  const path='data/stock-monitor-display-defaults.json',latest=await file(path,settingsRepo),data=latest.data;
  if(data.version!==1||!data.pages||!Object.hasOwn(data.pages,page)||!Array.isArray(data.pages[page]?.visibleTickers))throw Error('This monitor page is not configured. Reload the default ticker settings.');
  const normaliseList=value=>{if(!Array.isArray(value)||value.some(t=>typeof t!=='string'))throw Error('Invalid ticker default list.');return [...new Set(value.map(t=>t.trim().toUpperCase()))].sort();};
  if(JSON.stringify(normaliseList(data.pages[page].visibleTickers))!==JSON.stringify(normaliseList(previousVisibleTickers)))throw Error('This page’s defaults changed elsewhere. Reload before saving.');
  const next={...data.pages[page],visibleTickers:normaliseList(visibleTickers),savedAt:new Date().toISOString()};
  data.pages[page]=next;
  const result=await request(settingsRepo,'/contents/'+path,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Set default tickers for stock-monitor/'+page,branch,sha:latest.sha,content:encode(JSON.stringify(data,null,2)+'\n')})});
  if(!result?.commit?.sha)throw Error('GitHub did not confirm the default ticker save.');
  return {data,commit_sha:result.commit.sha};
 }
 async function savePagePassword(page,password,previousPassword){
  if(!credentials.digitalTools)throw Error('Connect the optional myai118/digital-tools token before saving a monitor password.');
  if(typeof password!=='string'||!password.trim())throw Error('Enter a new password.');
  const path='data/stock-monitor-display-defaults.json',latest=await file(path,settingsRepo),data=latest.data;
  if(data.version!==1||!data.pages||!Object.hasOwn(data.pages,page)||!Array.isArray(data.pages[page]?.visibleTickers))throw Error('This monitor page is not configured. Reload the password settings.');
  if(data.pages[page].settingsPassword!==previousPassword)throw Error('This password changed elsewhere. Reload password settings before saving.');
  data.pages[page]={...data.pages[page],settingsPassword:password};
  const result=await request(settingsRepo,'/contents/'+path,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Update monitor settings password for '+page,branch,sha:latest.sha,content:encode(JSON.stringify(data,null,2)+'\n')})});
  if(!result?.commit?.sha)throw Error('GitHub did not confirm the password save. Reload password settings to check before retrying.');
  return {data,commit_sha:result.commit.sha};
 }
 return {file,raw,lookup,save,savePageDefaults,savePagePassword,refreshPrices,getCheckerSnapshot,startChecker,mount,connected:()=>Boolean(credentials.stkref)};
})();

