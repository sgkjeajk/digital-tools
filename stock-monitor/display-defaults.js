'use strict';
// Owner defaults are managed in Admin. Visitor changes live only in this page's memory.
window.StockMonitorDisplay = (() => {
 const scriptURL = new URL(document.currentScript.src);
 const root = new URL('../', scriptURL);
 const configPath = 'data/stock-monitor-display-defaults.json';
 const configURL = new URL(configPath, root);
 const relative = location.pathname.slice(root.pathname.length);
 const pageKey = relative.replace(/^stock-monitor\//, '') || 'index.html';
 const key = pageKey.endsWith('/') ? pageKey + 'index.html' : pageKey;
 let loading = null, loaded = false, entry = null, known = new Set();
 let hidden, config, redraw, mounted = false;
 function updateVisibility() { /* Use the bottom-left settings dot; no public prompt. */ }
 const copy = value => value == null ? null : JSON.parse(JSON.stringify(value));
 const decode = value => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g, '')), c => c.charCodeAt(0))));
 function validateDocument(data) {
  if (!data || data.version !== 1 || !data.pages || typeof data.pages !== 'object' || Array.isArray(data.pages)) throw Error('Invalid default display settings.');
  for (const item of Object.values(data.pages)) if (!item || !Array.isArray(item.visibleTickers) || item.visibleTickers.some(t => typeof t !== 'string')) throw Error('Invalid default ticker list.');
  return data;
 }
 function active() { return (config.instruments || []).filter(x => x.enabled); }
 function applyDefaults() {
  const selected = new Set(entry ? entry.visibleTickers : active().map(x => x.ticker));
  hidden.clear();
  for (const row of config.instruments || []) if (!selected.has(row.ticker)) hidden.add(row.ticker);
 }
 function status(message) { const node = document.getElementById('ownerDefaultsStatus'); if (node) node.textContent = message; }
 function mount() {
  const panel = document.getElementById('settingsPanel');
  if (mounted || !panel) return;
  mounted = true;
  const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = 'Reset to owner defaults';
  reset.onclick = () => { applyDefaults(); redraw(); };
  const actions = panel.querySelector('.settings-actions');
  if (actions) actions.append(reset);
 }
 async function initialise(cfg, hiddenSet, rerender) {
  config = cfg; hidden = hiddenSet; redraw = rerender;
  if (!loaded) {
   if (!loading) loading = (async () => {
    const url = new URL(configURL); url.searchParams.set('ts', Date.now());
    const response = await fetch(url, {cache:'no-store'});
    if (!response.ok) throw Error('Default display settings unavailable. Please reload this page.');
    const data = validateDocument(await response.json());
    if (!Object.hasOwn(data.pages, key)) throw Error('No default ticker list has been configured for this page.');
    entry = copy(data.pages[key]);
    applyDefaults(); known = new Set((cfg.instruments || []).map(x => x.ticker)); loaded = true;
   })().catch(error => { loading = null; throw error; });
   await loading;
  } else {
   // New instruments also start hidden unless included in the owner's list.
   for (const row of cfg.instruments || []) if (!known.has(row.ticker)) {
    if (entry && !entry.visibleTickers.includes(row.ticker)) hidden.add(row.ticker);
    known.add(row.ticker);
   }
  }
  mount();
 }
 window.addEventListener('pageshow', event => {
  if (!event.persisted || !config || !hidden) return;
  loaded = false; loading = null;
  initialise(config, hidden, redraw).then(redraw).catch(error => status(error.message));
 });
 async function settingsPassword() {
  const url = new URL(configURL); url.searchParams.set('ts', Date.now());
  const response = await fetch(url, {cache:'no-store'});
  if (!response.ok) throw Error('Settings password unavailable. Please try again later.');
  const data = validateDocument(await response.json());
  const password = data.pages[key]?.settingsPassword;
  if (typeof password !== 'string' || !password.trim()) throw Error('No settings password has been configured for this page.');
  return password;
 }
 return {initialise, updateVisibility, settingsPassword, pageKey:key};
})();

