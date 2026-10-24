(()=>{
 'use strict';
 const status=document.getElementById('offline-update-status');
 const button=document.getElementById('offline-update-button');
 const installButton=document.getElementById('offline-install-button');
 const KEY='business_study_offline_installed_v1';
 let registration=null;
 function rpc(type,options={}) {
   return new Promise((resolve,reject)=>{
     const worker=navigator.serviceWorker.controller||registration?.active;
     if(!worker){reject(Error('离线服务尚未就绪'));return;}
     const channel=new MessageChannel();
     const timer=setTimeout(()=>{channel.port1.close();reject(Error('等待离线服务超时'));},30000);
     channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();event.data.ok?resolve(event.data):reject(Error(event.data.error||'操作失败'));};
     worker.postMessage({type,...options},[channel.port2]);
   });
 }
 function rememberInstalled(){try{localStorage.setItem(KEY,'1');}catch(_){}}
 function wasInstalled(){try{return localStorage.getItem(KEY)==='1';}catch(_){return false;}}
 async function install(){
   installButton.disabled=true;button.disabled=true;status.textContent='正在下载完整离线题库，请保持联网…';
   try{
     if(!registration)registration=await navigator.serviceWorker.register('./service-worker.js',{scope:'./',updateViaCache:'all'});
     await navigator.serviceWorker.ready;
     const result=await rpc('INSTALL_OFFLINE',{force:true});
     rememberInstalled();status.textContent='离线已就绪 · '+result.version;installButton.hidden=true;button.disabled=false;
   }catch(error){status.textContent='安装未完成：'+error.message+'；可重试';installButton.hidden=false;}
   finally{installButton.disabled=false;}
 }
 async function boot(){
   if(!('serviceWorker'in navigator)||!window.isSecureContext){status.textContent='请在 Safari 中通过 HTTPS 打开本站';return;}
   try{
     registration=await navigator.serviceWorker.getRegistration('./');
     if(!registration){
       if(wasInstalled()){status.textContent='离线服务已丢失，请联网后点击重新安装';installButton.hidden=false;return;}
       registration=await navigator.serviceWorker.register('./service-worker.js',{scope:'./',updateViaCache:'all'});
     }
     await navigator.serviceWorker.ready;
     let state;
     try{state=await rpc('GET_OFFLINE_STATUS');}
     catch(error){
       // An old test-site worker may not understand the protocol. This is the
       // explicit initial migration path, never a daily version-check loop.
       status.textContent='旧版离线服务需要迁移，请联网后点击安装';installButton.hidden=false;return;
     }
     if(state.ready){rememberInstalled();status.textContent='离线已就绪 · '+state.version;installButton.hidden=true;button.disabled=false;}
     else if(!wasInstalled())await install();
     else{status.textContent='离线缓存不完整，请联网后点击重新安装';installButton.hidden=false;button.disabled=false;}
   }catch(error){status.textContent='离线服务未就绪：'+error.message;installButton.hidden=false;}
 }
 installButton.onclick=async()=>{
   // A deliberate installation/migration action may also replace an old router.
   try{
     registration=await navigator.serviceWorker.register('./service-worker.js',{scope:'./',updateViaCache:'all'});
     await registration.update();
     await navigator.serviceWorker.ready;
     if(registration.installing){await new Promise(resolve=>{const worker=registration.installing;worker.addEventListener('statechange',()=>{if(worker.state==='activated'||worker.state==='redundant')resolve();});});}
     await install();
   }catch(error){status.textContent='安装失败：'+error.message;installButton.hidden=false;}
 };
 button.onclick=async()=>{
   if(button.disabled)return;
   button.disabled=true;status.textContent='正在检查更新…';
   try{
     const result=await rpc('CHECK_FOR_UPDATES');rememberInstalled();
     status.textContent=result.changed?'更新完成，重新打开题库后生效':'已是最新版本 · '+result.version;
   }catch(error){status.textContent='更新失败，继续使用原离线版本（'+error.message+'）';}
   finally{button.disabled=false;}
 };
 document.getElementById('pwa-storage-status').textContent=window.navigator.standalone||window.matchMedia('(display-mode: standalone)').matches?'已从主屏幕启动':'Safari → 分享 → 添加到主屏幕';
 // No persistent-storage permission request or server check during daily use.
 boot();
 // Backups deliberately exclude installed application snapshots and update settings.
 const APP_DB='quiz_editor_media_v1';
 async function quizDB(){return new Promise((r,j)=>{const q=indexedDB.open(APP_DB,1);q.onupgradeneeded=()=>q.result.createObjectStore('banks');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})}
 async function dump(){const db=await quizDB();try{return await new Promise((r,j)=>{const t=db.transaction('banks'),s=t.objectStore('banks'),rows=[];const q=s.openCursor();q.onsuccess=()=>{const c=q.result;if(c){rows.push([c.key,c.value]);c.continue()}};t.oncomplete=()=>r(rows);t.onerror=()=>j(t.error)})}finally{db.close()}}
 document.getElementById('full-backup-export').onclick=async()=>{try{const data={format:'business-study-backup-v1',localStorage:Object.fromEntries(Object.entries(localStorage).filter(([k])=>!k.startsWith('offline_'))),indexedDB:await dump()};const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='题库完整学习备份.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){status.textContent='备份失败：'+e.message}};
 document.getElementById('full-backup-import').onclick=()=>document.getElementById('full-backup-file').click();
 document.getElementById('full-backup-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;const data=JSON.parse(await file.text());if(data.format!=='business-study-backup-v1'||!data.localStorage||!Array.isArray(data.indexedDB))throw Error('备份格式错误');if(!confirm('恢复备份会覆盖同名学习记录，是否继续？'))return;const old=Object.fromEntries(Object.entries(localStorage));try{for(const [k,v]of Object.entries(data.localStorage)){if(!k.startsWith('offline_'))localStorage.setItem(k,String(v))}const db=await quizDB();try{await new Promise((r,j)=>{const t=db.transaction('banks','readwrite');for(const [k,v]of data.indexedDB)t.objectStore('banks').put(v,k);t.oncomplete=r;t.onerror=()=>j(t.error);t.onabort=()=>j(t.error)})}finally{db.close()}}catch(err){for(const k of Object.keys(localStorage))if(!Object.hasOwn(old,k))localStorage.removeItem(k);for(const [k,v]of Object.entries(old))localStorage.setItem(k,v);throw err}status.textContent='备份已恢复，请刷新题库'}catch(err){status.textContent='恢复失败：'+err.message}finally{e.target.value=''}};
})();
