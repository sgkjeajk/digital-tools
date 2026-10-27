const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const code=fs.readFileSync(__dirname+'/../stock-monitor/display-defaults.js','utf8');
const cfg={instruments:[{ticker:'D05.SI',enabled:true,type:'Stock'},{ticker:'SPY',enabled:true,type:'ETF'},{ticker:'FUND',enabled:true,type:'Fund'}]};
function harness(page='index.html',pages={'index.html':{visibleTickers:[]}},options={}){
 const nodes={},events={},calls=[],apiDoc={version:1,pages:structuredClone(pages)};
 const make=()=>({children:[],disabled:false,value:'',textContent:'',append(...items){this.children.push(...items);},querySelector(selector){return this.controls?.[selector]||make();},set innerHTML(value){this.controls={'input':nodes.input=make(),'[data-action="connect"]':nodes.connect=make(),'[data-action="disconnect"]':nodes.disconnect=make(),'[data-action="save"]':nodes.save=make()};}});
 const panel=make(),actions=make(),status=make();panel.querySelector=()=>actions;
 const ctx={URL,Set,Map,Date,JSON,TextDecoder,TextEncoder,Uint8Array,atob,btoa,console,
  document:{currentScript:{src:'https://myai118.github.io/digital-tools/stock-monitor/display-defaults.js'},createElement:make,getElementById(id){return id==='settingsPanel'?panel:id==='ownerDefaultsStatus'?status:null;}},
  location:{pathname:'/digital-tools/stock-monitor/'+page},localStorage:{getItem(){throw Error('Visitor storage must not be used');}},
  window:{addEventListener(name,handler){events[name]=handler;}},
  async fetch(url,opts={}){const target=String(url);calls.push({url:target,opts});
   if(target.startsWith('https://api.github.com')){
    if(target.endsWith('/digital-tools'))return {ok:true,json:async()=>({permissions:{push:true}})};
    if(opts.method==='PUT'){options.onPut?.(JSON.parse(opts.body));return {ok:true,json:async()=>({commit:{sha:'saved-commit'}})};}
    return {ok:true,json:async()=>({sha:'latest-blob',content:btoa(JSON.stringify(apiDoc))})};
   }
   if(options.fail)return {ok:false,status:503};
   return {ok:true,json:async()=>({version:1,pages})};
  }};
 vm.createContext(ctx);vm.runInContext(code,ctx);return {api:ctx.window.StockMonitorDisplay,nodes,events,calls,apiDoc,status};
}
test('initial and subsequent page loads hide every category despite legacy browser preferences',async()=>{
 for(let visit=0;visit<2;visit++){const h=harness(),hidden=new Set();await h.api.initialise(cfg,hidden,()=>{});assert.deepEqual([...hidden].sort(),['D05.SI','FUND','SPY']);}
});

test('settings password comes from each page configuration and changes are read fresh',async()=>{
 const pages={'index.html':{visibleTickers:[],settingsPassword:'custom-index'},'tools/kwc.html':{visibleTickers:[],settingsPassword:'custom-kwc'}};
 const h=harness('index.html',pages);assert.equal(await h.api.settingsPassword(),'custom-index');pages['index.html'].settingsPassword='new-value';assert.equal(await h.api.settingsPassword(),'new-value');
 assert.equal(await harness('tools/kwc.html',pages).api.settingsPassword(),'custom-kwc');
 for(const call of h.calls)assert.equal(call.opts.cache,'no-store');
});
test('missing, empty and unavailable passwords keep settings closed without filename fallback',async()=>{
 for(const value of [undefined,'','   ',123])await assert.rejects(harness('index.html',{'index.html':{visibleTickers:[],settingsPassword:value}}).api.settingsPassword(),/No settings password/);
 await assert.rejects(harness('index.html',{}, {fail:true}).api.settingsPassword(),/unavailable/);
});
test('visitor selections survive data refreshes but reset on reload',async()=>{
 const h=harness(),hidden=new Set();await h.api.initialise(cfg,hidden,()=>{});hidden.delete('D05.SI');await h.api.initialise(cfg,hidden,()=>{});assert.equal(hidden.has('D05.SI'),false);
 const next=harness(),reloaded=new Set();await next.api.initialise(cfg,reloaded,()=>{});assert.equal(reloaded.has('D05.SI'),true);
});
test('each HTML page uses only its own allowlist and directory URL maps to index.html',async()=>{
 const pages={'index.html':{visibleTickers:['D05.SI']},'tools/kwc.html':{visibleTickers:['SPY']}};
 for(const [page,expected] of [['',['FUND','SPY']],['tools/kwc.html',['D05.SI','FUND']]]){const h=harness(page,pages),hidden=new Set();await h.api.initialise(cfg,hidden,()=>{});assert.deepEqual([...hidden].sort(),expected);}
});
test('empty allowlist, new ticker and restored browser history all return to owner defaults',async()=>{
 const h=harness(),hidden=new Set();await h.api.initialise(cfg,hidden,()=>{});hidden.clear();await h.api.initialise({...cfg,instruments:[...cfg.instruments,{ticker:'NEW',enabled:true}]},hidden,()=>{});assert.equal(hidden.has('NEW'),true);assert.equal(hidden.has('SPY'),false);
 h.events.pageshow({persisted:true});await new Promise(resolve=>setImmediate(resolve));assert.equal(hidden.has('SPY'),true);
});
test('unavailable or unconfigured defaults block rendering rather than show all',async()=>{
 await assert.rejects(harness('index.html',{}, {fail:true}).api.initialise(cfg,new Set(),()=>{}),/unavailable/);
 await assert.rejects(harness('index.html',{}).api.initialise(cfg,new Set(),()=>{}),/No default ticker list/);
});
test('stock monitor settings do not ask for GitHub credentials',()=>{
 assert.doesNotMatch(code,/GitHub token|Connect GitHub|Save current selection as defaults/);
 assert.match(code,/Reset to owner defaults/);
});
