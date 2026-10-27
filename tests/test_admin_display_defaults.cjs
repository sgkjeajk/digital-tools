const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Node{
 constructor(tag=''){this.tagName=tag;this.children=[];this.value='';this.checked=false;this.disabled=false;this.textContent='';this.className='';this.attributes={};}
 setAttribute(name,value){this.attributes[name]=value;}
 append(...nodes){this.children.push(...nodes);if(this.tagName==='select'&&!this.value&&this.children.length)this.value=this.children[0].value||'';}
 replaceChildren(...nodes){this.children=[];this.value='';if(nodes.length)this.append(...nodes);}
 get options(){return this.children;}
}
function harness(){
 const ids=['defaultTickerPage','defaultTickerSearch','defaultTickerList','saveDefaultTickers','reloadDefaultTickers','defaultTickerStatus','defaultTickerCount','selectFilteredDefaultTickers','clearFilteredDefaultTickers','toggleDefaultETF','toggleDefaultStock','toggleDefaultFund'],nodes=Object.fromEntries(ids.map(x=>[x,new Node(x)]));
 const data={version:1,pages:{'index.html':{visibleTickers:['SPY'],settingsPassword:'index'},'tools/kwc.html':{visibleTickers:['AAPL'],settingsPassword:'kwc'}}};
 const instruments=[{ticker:'SPY',enabled:true,name:'S&P 500 ETF',region:'US',type:'ETF'},{ticker:'AAPL',enabled:true,name:'Apple',region:'US',type:'Stock'},{ticker:'MSFT',enabled:true,name:'Microsoft',region:'US',type:'Stock'}];
 const calls=[];
 const ctx={document:{getElementById:id=>nodes[id],createElement:tag=>new Node(tag)},ECGitHub:{
  async file(path){return {data:path.includes('display-defaults')?structuredClone(data):{instruments:structuredClone(instruments)}};},
  async savePageDefaults(page,tickers,previous){calls.push({page,tickers:[...tickers],previous:[...previous]});assert.equal(JSON.stringify(data.pages[page].visibleTickers),JSON.stringify(previous));data.pages[page].visibleTickers=[...tickers];return {data:structuredClone(data),commit_sha:'test-commit'};}
 }};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../stock-monitor/admin-display-defaults.js','utf8'),ctx);
 return {nodes,data,calls,ready:new Promise(resolve=>setImmediate(resolve))};
}
test('Admin default ticker selection is page-specific, survives filtering, saves, and reloads',async()=>{
 const h=harness(),n=h.nodes;await h.ready;
 assert.equal(n.defaultTickerPage.value,'index.html');
 assert.equal(n.toggleDefaultETF.textContent,'Hide all ETFs');
 assert.equal(n.toggleDefaultStock.textContent,'Show all stocks');
 await n.toggleDefaultStock.onclick();
 assert.deepEqual(Array.from((()=>{const a=[];for(const x of n.defaultTickerList.children)if(x.children[0].checked)a.push(x.children[0].value);return a;})()),['AAPL','MSFT','SPY']);
 assert.equal(n.toggleDefaultStock.textContent,'Hide all stocks');
 await n.toggleDefaultStock.onclick();
 assert.equal(n.toggleDefaultStock.textContent,'Show all stocks');
 assert.equal(n.defaultTickerList.children.find(x=>x.children[1].textContent.startsWith('SPY')).children[0].checked,true);
 n.defaultTickerPage.value='tools/kwc.html';n.defaultTickerPage.onchange();
 assert.equal(n.defaultTickerList.children.find(x=>x.children[1].textContent.startsWith('AAPL')).children[0].checked,true);
 n.defaultTickerPage.value='index.html';n.defaultTickerPage.onchange();
 n.defaultTickerSearch.value='AAPL';n.defaultTickerSearch.oninput();
 await n.clearFilteredDefaultTickers.onclick();
 n.defaultTickerSearch.value='';n.defaultTickerSearch.oninput();
 const msft=n.defaultTickerList.children.find(x=>x.children[1].textContent.startsWith('MSFT')).children[0];msft.checked=true;n.defaultTickerList.onchange();
 await n.saveDefaultTickers.onclick();
 assert.deepEqual(h.calls,[{page:'index.html',tickers:['MSFT','SPY'],previous:['SPY']}]);
 assert.match(n.defaultTickerStatus.textContent,/Saved 2 default tickers/);
 await n.reloadDefaultTickers.onclick();
 assert.equal(n.defaultTickerList.children.find(x=>x.children[1].textContent.startsWith('SPY')).children[0].checked,true);
 assert.equal(n.defaultTickerList.children.find(x=>x.children[1].textContent.startsWith('MSFT')).children[0].checked,true);
 assert.equal(n.defaultTickerList.children.find(x=>x.children[1].textContent.startsWith('AAPL')).children[0].checked,false);
});

test('saved Admin defaults are the exact tickers shown after a fresh monitor visit',async()=>{
 const h=harness(),n=h.nodes;await h.ready;
 const msft=n.defaultTickerList.children.find(x=>x.children[1].textContent.startsWith('MSFT')).children[0];msft.checked=true;n.defaultTickerList.onchange();
 await n.saveDefaultTickers.onclick();
 const panel=new Node('panel'),actions=new Node('actions'),status=new Node('status');
 panel.querySelector=()=>actions;
 const ctx={URL,JSON,Date,Set,Map,TextDecoder,TextEncoder,Uint8Array,atob,btoa,console,
  document:{currentScript:{src:'https://myai118.github.io/digital-tools/stock-monitor/display-defaults.js'},createElement:tag=>new Node(tag),getElementById:id=>id==='settingsPanel'?panel:id==='ownerDefaultsStatus'?status:null},
  location:{pathname:'/digital-tools/stock-monitor/index.html'},window:{addEventListener(){}},
  async fetch(){return {ok:true,json:async()=>structuredClone(h.data)};}
 };
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../stock-monitor/display-defaults.js','utf8'),ctx);
 const hidden=new Set(),cfg={instruments:[{ticker:'SPY',enabled:true},{ticker:'AAPL',enabled:true},{ticker:'MSFT',enabled:true}]};
 await ctx.window.StockMonitorDisplay.initialise(cfg,hidden,()=>{});
 assert.equal(hidden.has('SPY'),false);assert.equal(hidden.has('MSFT'),false);assert.equal(hidden.has('AAPL'),true);
});
