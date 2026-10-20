const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
// Minimal DOM used to execute the real monitor scripts without a network/browser dependency.
class Element{
 constructor(tag,attrs={}){this.tagName=tag.toLowerCase();this.attrs=attrs;this.children=[];this.parentElement=null;this.style={};this.dataset={};this._text='';this.hidden=false;this.events={};for(const [k,v]of Object.entries(attrs)){if(k==='id')this.id=v;if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=v;}this.className=attrs.class||'';this.classList={contains:c=>this.className.split(/\s+/).includes(c),toggle:(c,on)=>{const set=new Set(this.className.split(/\s+/).filter(Boolean));if(on===undefined)on=!set.has(c);on?set.add(c):set.delete(c);this.className=[...set].join(' ');},add:c=>this.classList.toggle(c,true),remove:c=>this.classList.toggle(c,false)};}
 append(...nodes){for(let node of nodes){if(typeof node==='string'){const n=new Element('#text');n._text=node;node=n;}if(node.parentElement)node.parentElement.children=node.parentElement.children.filter(x=>x!==node);node.parentElement=this;this.children.push(node);}}
 replaceChildren(...nodes){for(const n of this.children)n.parentElement=null;this.children=[];this._text='';this.append(...nodes);}
 set textContent(value){this.replaceChildren();this._text=String(value??'');}get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
 set innerHTML(html){this.replaceChildren(...parse(html).children);}get innerHTML(){return this.textContent;}
 setAttribute(name,value){this.attrs[name]=String(value);if(name==='id')this.id=value;}
 getAttribute(name){return name==='id'?this.id||null:this.attrs[name]??null;}
 matches(selector){const attr=selector.match(/\[([^=\]]+)(?:="([^\"]*)")?\]/),base=selector.replace(/\[.*?\]/g,'');let ok=!base||base==='*'||base[0]==='#'&&this.id===base.slice(1)||base[0]==='.'&&this.classList.contains(base.slice(1))||base===this.tagName;if(attr){const val=attr[1].startsWith('data-')?this.dataset[attr[1].slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]:this.getAttribute(attr[1]);ok=ok&&val!==null&&val!==undefined&&(attr[2]===undefined||val===attr[2]);}return ok;}
 querySelectorAll(selector){const parts=selector.trim().split(/\s+/);let found=[];const walk=node=>{for(const child of node.children){if(child.matches(parts.at(-1))){let parent=child.parentElement,i=parts.length-2;while(i>=0&&parent){if(parent.matches(parts[i]))i--;parent=parent.parentElement;}if(i<0)found.push(child);}walk(child);}};walk(this);return found;}
 querySelector(s){return this.querySelectorAll(s)[0]||null;}closest(s){let p=this;while(p){if(p.matches(s))return p;p=p.parentElement;}return null;}
 addEventListener(name,handler){(this.events[name]||=[]).push(handler);}click(){const event={preventDefault(){}};this.onclick?.(event);for(const fn of this.events.click||[])fn(event);}scrollIntoView(){}
 insertAdjacentElement(where,node){const p=this.parentElement;if(where!=='afterend'||!p)throw Error('Unsupported insertion');node.parentElement=p;p.children.splice(p.children.indexOf(this)+1,0,node);}
}
function parse(html){const root=new Element('#document'),stack=[root];html=html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');for(const token of html.match(/<[^>]*>|[^<]+/g)||[]){if(token.startsWith('<!'))continue;if(token.startsWith('</')){const tag=token.slice(2,-1).trim().toLowerCase();let index=stack.length-1;while(index>0&&stack[index].tagName!==tag)index--;if(index>0)stack.length=index;continue;}if(token.startsWith('<')){const tag=token.match(/^<([\w-]+)/)?.[1];if(!tag)continue;const attrs={};for(const m of token.matchAll(/([\w-]+)="([^\"]*)"/g))attrs[m[1]]=m[2];const el=new Element(tag,attrs);stack.at(-1).append(el);if(!['meta','link','input','br','img','hr'].includes(tag))stack.push(el);}else{const n=new Element('#text');n._text=token;stack.at(-1).append(n);}}return root;}
const root=require('node:path').resolve(__dirname,'..'),read=p=>fs.readFileSync(root+'/'+p,'utf8');
const defaults={version:1,pages:Object.fromEntries(['index.html','tools/kwc.html','tools/syc.html','tools/klz.html'].map(key=>[key,{visibleTickers:[],settingsPassword:'owner-secret'}]))};
Element.prototype.showModal=function(){this.open=true;};Element.prototype.close=function(){this.open=false;};Element.prototype.focus=function(){};Element.prototype.remove=function(){this.parentElement.children=this.parentElement.children.filter(x=>x!==this);};
function loadPage(key,storage=new Map(),displayDefaults=defaults){const doc=parse(read('stock-monitor/'+key));doc.body=doc.querySelector('body');doc.createElement=tag=>new Element(tag);doc.getElementById=id=>doc.querySelector('#'+id);doc.currentScript={src:'https://myai118.github.io/digital-tools/stock-monitor/display-defaults.js'};
 const ctx={document:doc,location:{href:'https://myai118.github.io/digital-tools/stock-monitor/'+key,pathname:'/digital-tools/stock-monitor/'+key,hash:''},URL,TextEncoder,TextDecoder,Uint8Array,atob,btoa,console,Blob,AbortController,setInterval(){return 1;},clearInterval(){},setTimeout(){},clearTimeout(){},addEventListener(){},navigator:{userAgent:'test',maxTouchPoints:0},localStorage:{getItem(key){assert.ok(key.startsWith('stock-monitor:settings-failures:'));return storage.get(key)||null;},setItem(key,value){assert.ok(key.startsWith('stock-monitor:settings-failures:'));storage.set(key,value);}},async fetch(url){let p=String(url),data;if(p.includes('stock-monitor-display-defaults.json'))data=displayDefaults;else if(p.includes('stock-tickers.json'))data=JSON.parse(read('data/stock-tickers.json'));else if(p.includes('dividend-data.json'))data=JSON.parse(read('dividend-data.json'));else if(p.includes('market-data.json'))data=JSON.parse(read('market-data.json'));else throw Error('Unexpected request '+p);return {ok:true,json:async()=>structuredClone(data)};}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(read('stock-monitor/display-defaults.js'),ctx);const script=key==='index-funds.html'?'stock-monitor/funds-monitor.js':key.startsWith('tools/')?'stock-monitor/tools/monitor-page-defaults.js':'stock-monitor/monitor-index-defaults.js';vm.runInContext(read(script),ctx);return {ctx,doc};}
async function ready(doc){for(let i=0;i<20;i++){if(doc.getElementById('status').textContent.includes('Latest'))return;await new Promise(resolve=>setImmediate(resolve));}assert.fail(doc.getElementById('status').textContent);}
test('all four monitor pages load without visitor settings and hide the overall instrument total',async()=>{
 for(const key of Object.keys(defaults.pages)){
  const {doc}=loadPage(key);await ready(doc);
  for(const id of ['settingsButton','settingsLink','settingsPanel','settingsPasswordDialog'])assert.equal(doc.getElementById(id),null,key+' must not expose '+id);
  assert.equal(doc.querySelectorAll('tr[data-ticker]').length,0,key+' starts with its empty owner list');
  assert.equal(doc.getElementById('tracked').textContent,'0 shown');
  doc.getElementById('exportExcelButton').click();assert.match(doc.getElementById('status').textContent,/Market Watch Admin/);
  doc.getElementById('jumpFund').click();assert.match(doc.getElementById('status').textContent,/Market Watch Admin/);
 }
});
test('each page preserves its own defaults through refresh, sorting and Excel export',async()=>{
 const cfg=JSON.parse(read('data/stock-tickers.json')),tickers=cfg.instruments.filter(x=>x.enabled).slice(0,4).map(x=>x.ticker);
 assert.equal(tickers.length,4);
 const custom=structuredClone(defaults);Object.keys(custom.pages).forEach((key,i)=>custom.pages[key].visibleTickers=[tickers[i]]);
 for(const [i,key] of Object.keys(custom.pages).entries()){
  const {ctx,doc}=loadPage(key,new Map(),custom);await ready(doc);
  const rows=()=>doc.querySelectorAll('tr[data-ticker]');assert.deepEqual(rows().map(x=>x.dataset.ticker),[tickers[i]],key);
  assert.equal(doc.getElementById('tracked').textContent,'1 shown');assert.equal(rows()[0].children.length,11);
  assert.match(rows()[0].querySelector('a').href,/finance.yahoo.com/);
  for(const th of doc.querySelectorAll('th[data-sort-key]'))th.querySelector('button').click();
  await ctx.refresh();assert.deepEqual(rows().map(x=>x.dataset.ticker),[tickers[i]]);
  let workbook,downloaded;ctx.XlsxWriter={build(value){workbook=value;return 'test';}};ctx.download=(name)=>{downloaded=name;};
  doc.getElementById('exportExcelButton').click();assert.match(downloaded,/\.xlsx$/);assert.equal(workbook.rows.length,1);assert.equal(workbook.rows[0][2].value,tickers[i]);
  assert.match(doc.getElementById('reference-time').textContent,/SGT/);
 }
});
