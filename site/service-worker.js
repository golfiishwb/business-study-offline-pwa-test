/* Stable offline router. No version polling, sync, push, navigation preload,
   runtime cache filling, or snapshot downloads during browser-driven upgrades. */
'use strict';
const BASE = new URL('./', self.location.href);
const META = 'business-study-pwa-meta-v1';
const PREFIX = 'business-study-pwa-snapshot-';
const POINTER = new URL('__offline_active_snapshot__', BASE).href;
const REQUIRED = ['index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
const NAVIGATIONS = ['', 'index.html', 'learning.html', 'install.html'];
let updating = false;

async function activeSnapshot() {
  const entry = await (await caches.open(META)).match(POINTER);
  return entry ? entry.json() : null;
}
async function installedStatus() {
  const active = await activeSnapshot();
  if (!active) return {ready:false};
  const cache = await caches.open(active.cache);
  for (const file of REQUIRED) if (!await cache.match(new URL(file, BASE))) return {ready:false, version:active.version};
  return {ready:true, version:active.version};
}
function verifyManifest(data) {
  if (data?.format !== 1 || !/^[a-zA-Z0-9._-]{1,80}$/.test(data.version || '') || !Array.isArray(data.files) || data.files.length !== REQUIRED.length) throw Error('更新清单格式错误');
  const names = new Set();
  for (const file of data.files) {
    if (!REQUIRED.includes(file.path) || names.has(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256 || '') || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > 12000000) throw Error('更新资源清单错误');
    names.add(file.path);
  }
  return data;
}
async function fetchBytes(path, limit, signal) {
  const url = new URL(path, BASE);
  const response = await fetch(url, {cache:'no-store', credentials:'same-origin', redirect:'error', signal});
  if (!response.ok || response.type === 'opaque') throw Error('下载失败：'+path+' ('+response.status+')');
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  while (true) {
    const {done,value} = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > limit) {await reader.cancel(); throw Error('更新资源过大：'+path);}
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) {bytes.set(chunk,offset);offset += chunk.byteLength;}
  return {bytes, response};
}
async function sha256(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function updateSnapshot(force=false) {
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(),25000);
  let stage = null;
  try {
    const downloaded = await fetchBytes('release.json',16384,controller.signal);
    const manifest = verifyManifest(JSON.parse(new TextDecoder().decode(downloaded.bytes)));
    const previous = await activeSnapshot();
    if (!force && previous?.version === manifest.version && (await installedStatus()).ready) return {ready:true,version:manifest.version,changed:false};
    stage = PREFIX+manifest.version+'-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    const cache = await caches.open(stage);
    for (const file of manifest.files) {
      const {bytes,response} = await fetchBytes(file.path,file.bytes,controller.signal);
      if (bytes.byteLength !== file.bytes || await sha256(bytes) !== file.sha256) throw Error('完整性校验失败：'+file.path);
      const type = response.headers.get('content-type') || '';
      if (file.path.endsWith('.html') && !type.includes('text/html')) throw Error('页面类型错误');
      if (file.path.endsWith('.webmanifest')) {
        const parsed = JSON.parse(new TextDecoder().decode(bytes));
        if (parsed.display !== 'standalone') throw Error('安装清单无效');
      }
      if (file.path.endsWith('.png') && !type.includes('image/png')) throw Error('图标类型错误');
      // Use the response MIME type but never carry response Content-Encoding
      // after fetch has already decoded its bytes.
      await cache.put(new URL(file.path, BASE),new Response(bytes,{headers:{'Content-Type':type}}));
    }
    // Commit only one pointer after every file has been checked and cached.
    // Storage failure before this line leaves the previous snapshot untouched.
    await (await caches.open(META)).put(POINTER,new Response(JSON.stringify({version:manifest.version,cache:stage,previous:previous?.cache||null}),{headers:{'Content-Type':'application/json'}}));
    const committed=stage;stage = null;
    try { for(const name of await caches.keys()) if(name.startsWith(PREFIX)&&name!==committed&&name!==previous?.cache) await caches.delete(name); } catch(_) {}
    return {ready:true,version:manifest.version,changed:true};
  } catch(error) {
    if(stage) await caches.delete(stage).catch(()=>{});
    throw error;
  } finally {clearTimeout(timeout);}
}
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
  const reply = event.ports?.[0];
  if (!reply || !event.source || !event.source.url.startsWith(BASE.href)) return;
  const type = event.data?.type;
  if (!['GET_OFFLINE_STATUS','INSTALL_OFFLINE','CHECK_FOR_UPDATES'].includes(type)) return;
  event.waitUntil((async()=>{
    try {
      if(type==='GET_OFFLINE_STATUS') {reply.postMessage({ok:true,...await installedStatus()});return;}
      if(updating) throw Error('另一个页面正在安装或更新，请稍后重试');
      updating=true;
      try {reply.postMessage({ok:true,...await updateSnapshot(event.data.force===true)});}
      finally {updating=false;}
    } catch(error) {reply.postMessage({ok:false,error:error.name==='AbortError'?'下载超时':String(error.message||error)});}
  })());
});
function recoveryPage() {
  return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>修复离线题库</title><body style="font:16px/1.7 system-ui;padding:24px"><h1>离线缓存需要修复</h1><p>本地缓存可能已被系统清理。学习记录不会在修复时被清除。</p><button id="repair">联网后点击修复离线题库</button><p id="status">尚未发起网络请求</p><script>document.getElementById('repair').onclick=()=>{const button=document.getElementById('repair');button.disabled=true;document.getElementById('status').textContent='正在修复…';const channel=new MessageChannel();const timer=setTimeout(()=>{button.disabled=false;document.getElementById('status').textContent='修复超时，请重试';channel.port1.close()},30000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();button.disabled=false;if(e.data.ok)location.reload();else document.getElementById('status').textContent='修复失败：'+e.data.error};navigator.serviceWorker.controller.postMessage({type:'INSTALL_OFFLINE',force:true},[channel.port2])};<\/script></body></html>`,{status:200,headers:{'Content-Type':'text/html;charset=utf-8'}});
}
self.addEventListener('fetch',event=>{
  event.respondWith((async()=>{
    const request=event.request, url=new URL(request.url);
    if(request.method!=='GET' || url.origin!==BASE.origin || !url.href.startsWith(BASE.href)) return new Response('离线策略已阻止此请求',{status:403});
    const active=await activeSnapshot();
    if(!active && request.mode==='navigate')return recoveryPage();
    if(!active)return new Response('离线缓存尚未安装',{status:503});
    let relative=url.pathname.slice(BASE.pathname.length);
    if(request.mode==='navigate' && NAVIGATIONS.includes(relative)) relative='index.html';
    const cached=await (await caches.open(active.cache)).match(new URL(relative,BASE));
    if(cached) return cached;
    if(request.mode==='navigate'&&NAVIGATIONS.includes(url.pathname.slice(BASE.pathname.length)))return recoveryPage();
    // Never fall back to the network, even online or after a cache miss.
    return new Response('此资源未安装；请点击检查更新修复离线缓存。',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}});
  })());
});
