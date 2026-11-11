'use strict';
/* ============================================================
   APEX ULTRA KISS — ZERO COMPLICATION, DIRECT & STABLE
   ============================================================ */
const W=window,L=localStorage,$=id=>document.getElementById(id);
let db=null,syncing=false,scanStream=null,scanTimer=null;

const bc=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('sync'):{postMessage(){},onmessage:null};
const softRender=()=>{if(K.u&&K.idx===null&&!['toko','schema','bulksheet','edit'].includes(K.v))render();};

bc.onmessage=e=>{
  if(e.data==='synced')idbGet('apex_matrix').then(m=>{if(m){Object.assign(K.db,m);softRender();}});
  else if(e.data==='kick'&&!syncing)syn();
};

/* ---------------- IndexedDB ---------------- */
function initDB(cb){
  const rq=indexedDB.open('apex_db',1);
  rq.onupgradeneeded=e=>{
    const d=e.target.result;
    if(!d.objectStoreNames.contains('kv'))d.createObjectStore('kv');
    if(!d.objectStoreNames.contains('mut'))d.createObjectStore('mut',{keyPath:'i'});
  };
  rq.onsuccess=e=>{db=e.target.result;cb?.(db);};
  rq.onerror=()=>cb?.(null);
}
const idbStore=(st,mode)=>db.transaction(st,mode).objectStore(st);
const idbRead=(st,method,arg,fallback)=>new Promise(res=>{
  if(!db)return res(fallback);
  try{const rq=idbStore(st,'readonly')[method](arg);rq.onsuccess=()=>res(rq.result??fallback);rq.onerror=()=>res(fallback);}
  catch{res(fallback);}
});
const idbGet=(key,st='kv')=>idbRead(st,'get',key,null);
const idbGetAll=(st='mut')=>idbRead(st,'getAll',undefined,[]);
function idbPut(val,key=null,st='kv'){
  if(!db)return;
  try{const s=idbStore(st,'readwrite');if(st==='kv'&&key!=null)s.put(val,key);else s.put(val);}catch{}
}
function idbClearStore(st){if(!db)return;try{if(db.objectStoreNames.contains(st))idbStore(st,'readwrite').clear();}catch{}}
function idbDelKeys(keys,st='mut'){
  if(!db||!keys?.length)return;
  try{const s=idbStore(st,'readwrite');keys.forEach(k=>s.delete(k));}catch{}
}

/* ---------------- Mutasi & Sinkronisasi Sederhana ---------------- */
let seq=0;
function save(row,targetTable=K.cur,actionType=2){
  idbPut({
    i:`${Date.now()}_${++seq}_${Math.random().toString(36).slice(2,5)}`,
    tn:targetTable,
    y:actionType,
    r:Array.isArray(row)?row:Object.values(row)
  },null,'mut');
  bc.postMessage('kick');
  setTimeout(()=>syn(false),50);
}

const isOk=r=>Boolean(r?.ok||r?.s==='ok'||r?.status==='ok');
const sig=()=>AbortSignal.timeout?.(25000);

async function req(p={}){
  p.u=p.u||L.u||K.u||'admin';
  if(HARD.d1Url){
    try{
      const res=await fetch(HARD.d1Url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p),signal:sig()});
      if(res.ok){const r=await res.json();if(isOk(r))return r;}
    }catch{}
  }
  if(HARD.gasUrl&&/^https?:\/\//i.test(HARD.gasUrl)){
    try{
      const res=await fetch(HARD.gasUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(p),redirect:'follow',signal:sig()});
      if(res.ok){const r=await res.json();if(isOk(r))return r;}
    }catch{}
  }
  return{ok:false};
}

async function syn(force=false){
  if(!navigator.onLine||!db||syncing)return false;
  syncing=true;msg('sedang sync...');
  let ok=false;
  try{
    const tables=[...K.shs];
    if(force)L.vs='[]';
    const ver=JSON.parse(L.vs||'[]');

    // 1. Push mutasi lokal
    const queued=await idbGetAll('mut');
    if(queued.length){
      const pr=await req({a:'push',m:queued,tn:tables,cols:K.cols,gasUrl:HARD.gasUrl});
      if(pr?.ok)idbDelKeys(queued.map(x=>x.i),'mut');
    }

    // 2. Manifest
    const r0=await req({a:'manifest',tn:tables,cols:K.cols});
    const m=r0?.data||r0;
    if(!m?.v)throw new Error('manifest');

    if(m.cols)Object.assign(K.cols,m.cols);
    if(m.vis)Object.assign(K.vis,m.vis);

    // 3. Pull tabel
    const toPull=[];
    tables.forEach((_,i)=>{if(force||m.v[i]!==ver[i])toPull.push({t:i});});

    if(toPull.length){
      const b=await req({a:'pull_batch',reqs:toPull,tn:tables,cols:K.cols});
      (b?.data?.results||b?.results||[]).forEach(x=>{
        const name=K.shs[x?.t];
        if(!name)return;
        ver[x.t]=x.v;
        K.db[name]=x.r||[];
        if(x.cols?.length)K.cols[name]=x.cols;
      });
      L.vs=JSON.stringify(ver);
      persist();
      bc.postMessage('synced');
      softRender();
    }
    ok=true;
  }catch{
    ok=false;
  }finally{
    syncing=false;
    msg(ok?'':'offline');
  }
  return ok;
}

/* ---------------- State ---------------- */
const K={
  u:L.u||'',cur:'penjualan',v:'dash',idx:null,page:1,sort:0,dir:1,grid:false,
  conf:null,prefill:null,parent:null,receiptRaw:'',readyOnly:false,
  df:{u:'',from:'',to:'',kat:''},
  shs:[...HARD.shs],cols:JSON.parse(JSON.stringify(HARD.cols)),vis:JSON.parse(JSON.stringify(HARD.vis)),
  fvis:{},db:JSON.parse(JSON.stringify(HARD.db)),
  savedFormState:null,refTargetInp:null,pwaEvent:null
};

if(!K.shs.includes('toko'))K.shs.push('toko');
if(!K.cols.toko)K.cols.toko=['id','name','sub','phone','bank','footer'];
if(!K.vis.toko)K.vis.toko=['name','phone'];
if(!K.db.toko)K.db.toko=[];

const dom={
  h:$('h'),q:$('q'),msg:$('msg'),tools:$('tools'),
  scanBox:$('scan-box'),scanVid:$('scan-vid'),
  fCam:$('f-cam'),fImg:$('f-img'),fDoc:$('f-doc'),fImp:$('f-imp'),
  sh:$('sh-sel'),st:$('st-sel'),act:$('act-sel'),
  fb:$('box-form'),db:$('box-dash'),ls:$('list'),ft:$('ft'),tape:$('tape'),bn:$('box-nota')
};

const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const isSafeUrl=u=>/^https?:\/\//i.test(String(u||''))||/^data:(image|application|text)\/[a-zA-Z0-9.\-_+]+;base64,/i.test(String(u||''));
const S2=s=>String(s||'').trim().toLowerCase();
const N=v=>{const n=parseFloat(String(v??'').replace(/[^\d.-]/g,''));return(!isFinite(n)||n<0)?0:n;};
const Z=v=>parseFloat(String(v??'').replace(/[^\d.-]/g,''))||0;
const fmtNum=n=>N(n).toLocaleString('id-ID');
const today=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
const msg=t=>{dom.msg.innerHTML='';dom.msg.hidden=!t;if(t)dom.msg.textContent=t;};

const getStore=()=>{
  const r=K.db.toko?.[0]||[],c=K.cols.toko;
  const g=k=>{const i=c.indexOf(k);return i>-1&&r[i]!==undefined?r[i]:(HARD.store?.[k]||'');};
  return{name:g('name'),sub:g('sub'),phone:g('phone'),bank:g('bank'),footer:g('footer')};
};

const cols=(s=K.cur)=>K.cols[s]||[];
const cI=(s,k)=>cols(s).indexOf(k);
const cV=(r,s,k)=>{const i=cI(s,k);return(r&&i>-1&&r[i]!==undefined)?String(r[i]):'';};
const vis=(s=K.cur)=>(K.vis[s]||cols(s)).filter(c=>cols(s).includes(c));
const fvis=(s=K.cur)=>((K.fvis?.[s]?.length)?K.fvis[s]:cols(s)).filter(c=>cols(s).includes(c));

// Pemetaan relasi statis
const PARENT_MAP={produk_jual:'penjualan',produk_beli:'pembelian',cicil:'penjualan'};
const CHILD_MAP={penjualan:'produk_jual',pembelian:'produk_beli'};
const FK_MAP={produk_jual:'idpenjualan',produk_beli:'idpembelian',cicil:'idjual'};

const parentOf=s=>PARENT_MAP[s]||null;
const childOf=s=>CHILD_MAP[s]||null;
const fkCol=s=>FK_MAP[s]||null;
const isTrx=(s=K.cur)=>Boolean(CHILD_MAP[s]);

const genId=()=>{const d=new Date();return String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0')+Math.random().toString(36).slice(2,5).padEnd(3,'0');};
const getTheme=()=>L.theme||(W.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light');
const applyTheme=t=>{
  document.documentElement.dataset.theme=t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',t==='dark'?'#000':'#fff');
};

const fld=c=>dom.fb.querySelector(`[data-col="${CSS.escape(c)}"]`);
const flds=()=>[...dom.fb.querySelectorAll('[data-col]')];
const fldBy=re=>flds().find(i=>re.test(i.dataset.col));

/* ---------------- Hak Akses Dasar ---------------- */
const setView=(v,idx=null)=>{
  if(dom.q&&dom.q.value.trim()!==''){dom.q.value='';K.page=1;}
  K.v=v;K.idx=idx;K.conf=null;
};
const isAdmin=()=>!K.u||K.u==='admin';
const isUserVisible=(r,sh=K.cur)=>{
  if(isAdmin()||sh==='produk')return true;
  const uCol=cI(sh,'user');
  return uCol===-1||S2(r[uCol])===S2(K.u);
};
const hasAccess=()=>true; // Membuka akses tombol untuk mencegah tombol hilang secara tidak terduga
const addFooter=(a,txt,sheet=K.cur,extra='')=>{
  dom.ft.insertAdjacentHTML('beforeend',`<button data-a="${esc(a)}" ${extra}>${esc(txt)}</button> `);
};

/* ---------------- Stok & Kalkulasi Transaksi ---------------- */
const syncStockDelta=(sh,o,n)=>{
  if(!['produk_jual','produk_beli','ecer'].includes(sh))return;
  const m=sh==='produk_beli'?1:-1,si=cI('produk','stok');
  [{r:o,s:-m},{r:n,s:m}].forEach(({r,s})=>{
    if(!r)return;
    const id=cV(r,sh,'idproduk'),row=id&&K.db.produk?.find(k=>S2(k[0])===S2(id));
    if(row&&si>-1){row[si]=String(Z(row[si])+N(cV(r,sh,'qty'))*s);save(row,'produk',1);}
  });
};

const calcItems=(t,id)=>{
  const ch=childOf(t);
  if(!ch)return{raw:0,disc:0,cogs:0,items:[]};
  return(K.db[ch]||[]).reduce((a,r)=>{
    if(S2(cV(r,ch,fkCol(ch)))!==S2(id))return a;
    const q=N(cV(r,ch,'qty')),p=N(cV(r,ch,t==='penjualan'?'hargajual':'hargabeli')),
          b=N(cV(r,ch,'hargabeli')),d=N(cV(r,ch,'diskon'));
    a.raw+=q*p;a.disc+=d;a.cogs+=q*b;
    a.items.push({name:cV(r,ch,'namaproduk')||'item',q,p,eff:Math.max(0,p-(q>0?d/q:0)),tot:q*p-d});
    return a;
  },{raw:0,disc:0,cogs:0,items:[]});
};

const formatNota=id=>{
  const row=K.db.penjualan?.find(r=>S2(r[0])===S2(id));
  if(!row)return'';
  const val=k=>cV(row,'penjualan',k),paid=N(val('bayar')),{raw,disc,items}=calcItems('penjualan',id),
        gTot=Math.max(0,raw-disc-N(val('diskon'))),diff=paid-gTot,WL=32,store=getStore(),
        pad=s=>{const t=String(s||'').trim();if(t.length>=WL)return t.slice(0,WL);const l=Math.floor((WL-t.length)/2);return' '.repeat(l)+t+' '.repeat(WL-t.length-l);},
        lr=(l,r)=>l+' '.repeat(Math.max(1,WL-l.length-String(r).length))+r,
        bar=c=>c.repeat(WL),
        lines=[pad(store.name),store.sub&&pad(store.sub),store.phone&&pad(store.phone),store.bank&&pad(store.bank),bar('='),
               lr(`${val('date')||today()} ${id}`,val('user')||K.u||'admin'),bar('-')].filter(Boolean);

  if(!items.length)lines.push('(kosong)');
  items.forEach(it=>{
    lines.push(it.name);
    lines.push(lr(`${it.q}x ${fmtNum(it.eff)}`,fmtNum(it.tot)));
  });
  lines.push(bar('-'),lr('Subtotal',fmtNum(raw)));
  if(disc>0)lines.push(lr('Diskon Item','-'+fmtNum(disc)));
  if(N(val('diskon'))>0)lines.push(lr('Diskon','-'+fmtNum(val('diskon'))));
  lines.push(lr('Total',fmtNum(gTot)),lr('Bayar',fmtNum(paid)),lr(diff>=0?'Kembali':'Kurang',fmtNum(Math.abs(diff))),bar('-'));
  if(store.footer)lines.push(pad(store.footer));
  return lines.join('\n');
};

const queryRows=()=>{
  const rows=K.db[K.cur]||[],q=S2(dom.q.value).split(/\s+/).filter(Boolean),res=[];
  for(let i=0;i<rows.length;i++){
    const r=rows[i]||[];
    if(!isUserVisible(r,K.cur))continue;
    if(K.cur==='produk'&&K.readyOnly&&N(cV(r,'produk','stok'))<=0)continue;
    if(!q.length||q.every(w=>r.join(' ').toLowerCase().includes(w)))res.push(i);
  }
  if(K.sort>0&&K.sort<=cols().length){
    const ci=K.sort-1;
    res.sort((a,b)=>String(rows[a]?.[ci]||'').localeCompare(String(rows[b]?.[ci]||''),undefined,{numeric:true})*K.dir);
  }else if(K.dir===-1)res.reverse();
  return res;
};

/* ---------------- Render Tampilan ---------------- */
const renderChrome=()=>{
  dom.sh.innerHTML=K.shs.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
  dom.sh.value=K.cur;
  const c=cols();
  dom.st.innerHTML='<option value="0">srt</option>'+c.map((col,i)=>`<option value="${i+1}">${esc(col)}</option>`).join('');
  dom.st.value=String(K.sort);
  const addBtn=dom.h.querySelector('[data-a="add"]');
  if(addBtn)addBtn.hidden=K.v!=='list';
};

const renderNavFooters=()=>{
  if(K.v!=='dash')addFooter('v-dash','dashboard');
  if(K.cur!=='kas'||K.v==='dash')addFooter('v-kas','kas');
  if(K.cur!=='produk'||K.v==='dash')addFooter('v-shop','produk');
};

const renderDash=()=>{
  msg();
  dom.db.insertAdjacentHTML('beforeend',`<input placeholder="user" data-df="u" value="${esc(K.df.u)}"><input type="date" data-df="from" value="${esc(K.df.from)}"><input type="date" data-df="to" value="${esc(K.df.to)}"><input placeholder="kategori" data-df="kat" value="${esc(K.df.kat)}">`);
  addFooter('df-today','hari ini');addFooter('df-clear','clear filter');

  const effU=isAdmin()?K.df.u:(K.u||'');
  const passFlt=(u,d,kt)=>
    (!effU||S2(u).includes(S2(effU)))&&
    (!K.df.from||String(d||'')>=K.df.from)&&
    (!K.df.to||String(d||'')<=K.df.to)&&
    (!K.df.kat||S2(kt).includes(S2(K.df.kat)));

  let mFil=0,kFil=0,jFil=0,profFil=0;
  (K.db.kas||[]).forEach(r=>{
    if(!isUserVisible(r,'kas'))return;
    const m=N(cV(r,'kas','masuk')),k=N(cV(r,'kas','keluar'));
    if(passFlt(cV(r,'kas','user'),cV(r,'kas','date'),`${cV(r,'kas','kategori')} ${cV(r,'kas','uraian')}`)){mFil+=m;kFil+=k;}
  });

  (K.db.penjualan||[]).forEach(r=>{
    if(!isUserVisible(r,'penjualan'))return;
    const{raw,disc,cogs}=calcItems('penjualan',r[0]);
    const net=Math.max(0,raw-disc-N(cV(r,'penjualan','diskon')));
    if(passFlt(cV(r,'penjualan','user'),cV(r,'penjualan','date'),cV(r,'penjualan','catatan'))){
      jFil+=net;profFil+=net-cogs;
    }
  });

  [
    {l:'kas masuk',v:fmtNum(mFil),s:'kas'},
    {l:'kas keluar',v:fmtNum(kFil),s:'kas'},
    {l:'penjualan',v:fmtNum(jFil),s:'penjualan'},
    {l:'estimasi profit',v:fmtNum(profFil),s:'penjualan'}
  ].forEach(c=>{
    dom.db.insertAdjacentHTML('beforeend',`<button data-a="nav" data-s="${esc(c.s)}">${esc(c.l)}: <b>${esc(c.v)}</b></button>`);
  });
  renderNavFooters();
};

const renderForm=()=>{
  if(!K.u){
    dom.fb.innerHTML='<input placeholder="user" data-f="user"><input type="password" placeholder="password" data-f="pass">';
    addFooter('login','login');addFooter('reg','register');addFooter('bypass','bypass admin');
    return;
  }
  const c=cols(),row=(K.idx!==null&&K.idx>=0)?(K.db[K.cur][K.idx]||[]):[];
  const formCols=fvis();

  formCols.forEach(col=>{
    let val=(K.idx===-1&&c.indexOf(col)===0)?genId():(row[c.indexOf(col)]??'');
    if(K.idx===-1&&K.prefill?.[col]!=null)val=K.prefill[col];
    else if(K.idx===-1&&!val&&/date|tanggal/i.test(col))val=today();
    else if(K.idx===-1&&!val&&col==='user')val=K.u||'admin';

    const isLong=/catatan|alamat|uraian|konten/i.test(col);
    const tag=isLong?'textarea':'input';
    const typeAttr=/date|tanggal/i.test(col)?'type="date"':'';
    dom.fb.insertAdjacentHTML('beforeend',`<${tag} ${typeAttr} placeholder="${esc(col)}" data-col="${esc(col)}">${isLong?esc(val):''}</${tag}>`);
    if(!isLong)fld(col).value=val;
  });

  addFooter('back','<');addFooter('save-row','save');
  if(formCols.some(k=>/foto/i.test(k))){addFooter('cam','kamera');addFooter('pic','file foto');}
  if(formCols.some(k=>/file/i.test(k)))addFooter('doc-upload','upload berkas');
  if(K.cur==='produk'&&K.idx!==null&&K.idx>=0){addFooter('jual-prod','jual');addFooter('beli-prod','beli');}
  if(isTrx()&&K.idx!==null&&K.idx>=0){addFooter('show-nota','nota');addFooter('print','print');}
  if(K.idx!==null&&K.idx>=0)addFooter('del-row',K.conf==='del'?'sure?':'del');
  renderNavFooters();
};

const renderList=()=>{
  msg();
  const c=cols(),vCols=vis(),rows=K.db[K.cur]||[],matched=queryRows(),
        vIdxs=c.map((col,i)=>vCols.includes(col)?i:-1).filter(i=>i!==-1),eff=vIdxs.length?vIdxs:[0],
        limit=Math.min(K.page*25,matched.length);

  for(let m=0;m<limit;m++){
    const trg=matched[m],r=rows[trg]||[],el=document.createElement('div');
    el.dataset.idx=trg;
    el.textContent=eff.map(i=>r[i]).filter(Boolean).join(' ') || '-';
    dom.ls.appendChild(el);
  }
  if(limit<matched.length)addFooter('more','more');
  renderNavFooters();
};

const persist=()=>{
  try{
    L.setItem('apex',JSON.stringify({cur:K.cur,u:K.u,shs:K.shs,cols:K.cols,vis:K.vis,grid:K.grid,df:K.df}));
    idbPut(K.db,'apex_matrix');
  }catch{}
};

const render=()=>{
  dom.fb.innerHTML=dom.ft.innerHTML=dom.db.innerHTML=dom.ls.innerHTML='';
  document.body.dataset.grid=K.grid?'1':'0';
  if(!K.u){
    dom.h.hidden=dom.tools.hidden=dom.db.hidden=dom.bn.hidden=dom.ls.hidden=true;
    dom.fb.hidden=false;renderForm();return;
  }
  const isF=['toko','schema','bulksheet'].includes(K.v)||K.idx!==null;
  dom.h.hidden=isF;
  dom.tools.hidden=isF||K.v==='dash'||K.v==='nota';
  dom.fb.hidden=!isF;
  dom.db.hidden=K.v!=='dash';
  dom.bn.hidden=K.v!=='nota';
  dom.ls.hidden=isF||K.v==='dash'||K.v==='nota';
  renderChrome();
  if(K.v==='dash')renderDash();
  else if(K.v==='nota'){dom.tape.textContent=K.receiptRaw;addFooter('back','<');addFooter('print','print');}
  else if(isF)renderForm();
  else renderList();
};

/* ---------------- Tindakan (Actions) ---------------- */
const actions={
  back:()=>{
    K.idx=K.prefill=K.conf=null;
    K.v='dash';
    render();
  },
  menu:()=>{setView(K.v==='dash'?'list':'dash');render();},
  theme:()=>{const t=getTheme()==='dark'?'light':'dark';L.theme=t;applyTheme(t);render();},
  refresh:()=>syn(true),
  scan:()=>{
    if(!('BarcodeDetector' in W))return msg('kamera scanner tidak didukung');
    const detector=new BarcodeDetector({formats:['qr_code','ean_13','ean_8','code_128','code_39','upc_a']});
    navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}).then(stream=>{
      scanStream=stream;dom.scanVid.srcObject=stream;dom.scanVid.play();dom.scanBox.hidden=false;
      scanTimer=setInterval(async()=>{
        try{
          const codes=await detector.detect(dom.scanVid);
          if(codes?.length){actions['stop-scan']();dom.q.value=codes[0].rawValue;render();}
        }catch{}
      },250);
    }).catch(()=>msg('kamera tidak aktif'));
  },
  'stop-scan':()=>{
    if(scanTimer){clearInterval(scanTimer);scanTimer=null;}
    if(scanStream){scanStream.getTracks().forEach(t=>t.stop());scanStream=null;}
    dom.scanBox.hidden=true;
  },
  'v-dash':()=>{setView('dash');render();},
  'v-kas':()=>{K.cur='kas';setView('form',-1);render();},
  'v-shop':()=>{K.cur='produk';setView('list');render();},
  'df-today':()=>{K.df.from=K.df.to=today();persist();render();},
  'df-clear':()=>{K.df={u:'',from:'',to:'',kat:''};persist();render();},
  nav:b=>{K.cur=b.dataset.s;setView('list');render();},
  add:()=>{setView('form',-1);render();},
  more:()=>{K.page++;render();},
  login:()=>{
    const u=S2(dom.fb.querySelector('[data-f="user"]')?.value);
    const p=dom.fb.querySelector('[data-f="pass"]')?.value;
    const f=K.db.users?.find(r=>S2(r[0])===u);
    if(f&&cV(f,'users','password')===p){K.u=L.u=f[0];setView('dash');syn(true);render();}
    else msg('kredensial salah');
  },
  reg:()=>{
    const u=S2(dom.fb.querySelector('[data-f="user"]')?.value);
    const p=dom.fb.querySelector('[data-f="pass"]')?.value;
    if(!u)return msg('user required');
    const r=[u,p,'user'];
    (K.db.users=K.db.users||[]).push(r);
    K.u=L.u=u;save(r,'users',2);persist();setView('dash');render();
  },
  bypass:()=>{K.u=L.u='admin';setView('dash');render();},
  logout:()=>{K.u=L.u='';persist();render();},
  cam:()=>dom.fCam.click(),
  pic:()=>dom.fImg.click(),
  'doc-upload':()=>dom.fDoc.click(),
  grid:()=>{K.grid=!K.grid;render();},
  dir:()=>{K.dir=-K.dir;render();},
  'save-row':()=>{
    const c=cols(),oldRow=(K.idx>=0)?K.db[K.cur][K.idx]:null;
    const row=oldRow?oldRow.slice():new Array(c.length).fill('');
    flds().forEach(inp=>{const ci=c.indexOf(inp.dataset.col);if(ci!==-1)row[ci]=inp.value.trim();});
    if(!row[0])row[0]=genId();

    if(K.idx===-1){(K.db[K.cur]=K.db[K.cur]||[]).push(row);syncStockDelta(K.cur,null,row);save(row,K.cur,2);}
    else{K.db[K.cur][K.idx]=row;syncStockDelta(K.cur,oldRow,row);save(row,K.cur,1);}

    persist();
    if(K.cur==='penjualan'){K.receiptRaw=formatNota(row[0]);setView('nota');}
    else setView('list');
    render();
  },
  'del-row':()=>{
    if(K.conf!=='del'){K.conf='del';render();return;}
    const target=K.db[K.cur][K.idx];
    if(target){
      K.db[K.cur]=K.db[K.cur].filter(r=>r!==target);
      syncStockDelta(K.cur,target,null);
      save(target,K.cur,0);
    }
    persist();setView('list');render();
  },
  'jual-prod':()=>{
    const p=K.db.produk[K.idx];
    if(!p)return;
    K.cur='produk_jual';K.prefill={idproduk:p[0],namaproduk:p[3],hargajual:p[5],qty:'1'};
    setView('form',-1);render();
  },
  'beli-prod':()=>{
    const p=K.db.produk[K.idx];
    if(!p)return;
    K.cur='produk_beli';K.prefill={idproduk:p[0],namaproduk:p[3],hargabeli:p[4],qty:'1'};
    setView('form',-1);render();
  },
  'show-nota':()=>{
    const pid=K.db.penjualan?.[K.idx]?.[0];
    if(pid){K.receiptRaw=formatNota(pid);setView('nota');render();}
  },
  print:()=>W.print(),
  'sh-sel':el=>{K.cur=el.value;setView('list');render();},
  'st-sel':el=>{K.sort=parseInt(el.value,10)||0;render();},
  'act-sel':el=>{
    const a=el.value;el.value='';
    if(a==='clear'){
      if(K.conf!=='clear'){K.conf='clear';msg(`clear ${K.cur}?`);return;}
      (K.db[K.cur]||[]).forEach(r=>save(r,K.cur,0));
      K.db[K.cur]=[];persist();syn(true);render();
    }
  }
};

/* ---------------- Event Listeners ---------------- */
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-a]');
  if(b&&actions[b.dataset.a])return actions[b.dataset.a](b);
  const r=e.target.closest('#list>[data-idx]');
  if(r&&K.v==='list'){
    const idx=parseInt(r.dataset.idx,10);
    setView('form',idx);render();
  }
});

document.addEventListener('input',e=>{
  if(e.target.id==='q'){K.page=1;render();}
  if(e.target.dataset.df){K.df[e.target.dataset.df]=e.target.value;persist();render();}
});

document.addEventListener('change',e=>{
  const t=e.target;
  if(t.dataset.a&&actions[t.dataset.a])actions[t.dataset.a](t);
  const file=t.files?.[0];
  if(file&&(t===dom.fCam||t===dom.fImg)){
    const rd=new FileReader();
    rd.onload=ev=>{const inp=fld('foto');if(inp)inp.value=ev.target.result;};
    rd.readAsDataURL(file);
    t.value='';
  }
});

W.addEventListener('online',()=>syn(true));

(()=>{
  if(L.theme)applyTheme(L.theme);
  try{
    const d=JSON.parse(L.getItem('apex')||'null');
    if(d)Object.assign(K,d);
  }catch{}
  initDB(async()=>{
    const matrix=await idbGet('apex_matrix');
    if(matrix)Object.assign(K.db,matrix);
    render();
    syn(true);
  });
})();