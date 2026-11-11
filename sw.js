/* APEX service worker: shell offline (cache-first + perbarui di latar). API/POST tidak pernah di-cache. */
const C='apex-v2',F=['./','index.html','style.css','config.js','app.js','icon.svg','manifest.json'];
self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(F)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
  e.respondWith(caches.open(C).then(async c=>{
    const hit=await c.match(r,{ignoreSearch:true});
    const net=fetch(r).then(x=>{if(x.ok)c.put(r,x.clone());return x;}).catch(async()=>hit||(r.mode==='navigate'&&await c.match('index.html'))||Response.error());
    return hit||net;
  }));
});