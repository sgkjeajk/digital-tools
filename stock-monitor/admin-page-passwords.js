'use strict';
(()=>{
 const byId=id=>document.getElementById(id),page=byId('passwordPage'),password=byId('pagePassword'),confirm=byId('pagePasswordConfirm'),save=byId('savePagePassword'),reload=byId('reloadPagePasswords'),status=byId('pagePasswordStatus');
 let pages={},loading=false;
 function busy(value){loading=value;for(const node of [page,password,confirm,save,reload])node.disabled=value;}
 function clear(){password.value='';confirm.value='';}
 page.onchange=()=>{clear();status.textContent='Enter and confirm a new Settings password for '+page.value+'.';};
 async function load(){
  if(loading)return;const selected=page.value;busy(true);clear();status.textContent='Loading monitor password settings…';
  try{
   const result=await ECGitHub.file('data/stock-monitor-display-defaults.json'),data=result.data;
   if(data.version!==1||!data.pages||typeof data.pages!=='object'||Array.isArray(data.pages))throw Error('Invalid monitor password settings.');
   pages=data.pages;page.replaceChildren();
   for(const key of Object.keys(pages).sort()){const option=document.createElement('option');option.value=key;option.textContent=key;page.append(option);}
   if(Object.hasOwn(pages,selected))page.value=selected;
   status.textContent=page.options.length?'Connect GitHub under Owner access, then choose a page and enter its new Settings password.':'No monitor pages have been configured.';
  }catch(error){pages={};page.replaceChildren();status.textContent='Could not load password settings. '+error.message;}
  finally{busy(false);save.disabled=!page.options.length;}
 }
 byId('pagePasswordForm').onsubmit=async event=>{
  event.preventDefault();
  if(loading)return;
  if(!password.value.trim()){status.textContent='Enter a new password.';return;}
  if(password.value!==confirm.value){status.textContent='The two passwords do not match.';return;}
  const key=page.value,value=password.value,previous=pages[key]?.settingsPassword;
  if(!Object.hasOwn(pages,key)){status.textContent='Choose a configured monitor page.';return;}
  busy(true);status.textContent='Saving Settings password for '+key+'…';
  try{const result=await ECGitHub.savePagePassword(key,value,previous);pages=result.data.pages;clear();status.textContent='Password saved for '+key+'. It takes effect after website publication finishes, usually within a few minutes. Existing browser lockouts remain in place.';}
  catch(error){status.textContent='Password was not confirmed saved. '+error.message;}
  finally{busy(false);}
 };
 reload.onclick=load;load();
})();
