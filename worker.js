/**
 * APEX BACKEND - CLOUDFLARE WORKER + D1 (ULTRA APEX KISS)
 * Binding: env.DB
 *
 * Actions (POST, field `a` / `action`):
 *   manifest   -> pastikan tabel ada, kembalikan versi tiap tabel
 *   pull_batch -> p.reqs=[{t:indeksTabel}] -> data.results=[{t, v, r:[[baris]], cols}]
 *   push       -> terapkan mutasi p.m=[{tn,y,r}] (y=0 hapus), forward ke GAS
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

const DEFAULT_TABLES = [
  'penjualan', 'produk_jual', 'produk', 'pembelian', 'produk_beli',
  'kas', 'kontak', 'cicil', 'ecer', 'users', 'roles', 'cms', 'absen', 'toko'
];

const BATCH_SIZE = 50;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });

// Quote identifier SQLite
const q = (name) => `"${String(name).replace(/"/g, '""')}"`;

// Nama tabel aman: tidak boleh tabel internal SQLite/Cloudflare/APEX
const isSafeTable = (t) =>
  typeof t === 'string' && t.trim() !== '' && !/^(sqlite_|_cf_|_apex_)/i.test(t.trim());

const cell = (v) => String(v == null ? '' : v);

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const runBatches = async (db, stmts) => {
  for (const part of chunk(stmts, BATCH_SIZE)) await db.batch(part);
};

/**
 * Pastikan tabel & kolom ada (kolom pertama = PRIMARY KEY) + tabel versi.
 * Hemat kuota D1 (50 query/invokasi di paket gratis): 1 query baca skema + 1 batch tulis.
 */
async function ensureTables(db, colsMap) {
  const want = [];
  for (const [t, c] of Object.entries(colsMap || {})) {
    if (!isSafeTable(t) || !Array.isArray(c)) continue;
    const list = [...new Set(c.map((x) => String(x).trim()).filter(Boolean))];
    if (list.length) want.push([t, list]);
  }
  const stmts = [db.prepare('CREATE TABLE IF NOT EXISTS _apex_ver (t TEXT PRIMARY KEY, n INTEGER)')];
  if (want.length) {
    const { results } = await db.prepare(
      "SELECT m.name AS t, p.name AS c FROM sqlite_master m, pragma_table_info(m.name) p WHERE m.type = 'table'"
    ).all();
    const have = {};
    for (const r of results || []) (have[String(r.t).toLowerCase()] ||= new Set()).add(String(r.c).toLowerCase());
    for (const [t, cols] of want) {
      const cur = have[t.toLowerCase()];
      if (!cur) {
        const ddl = cols.map((c, i) => `${q(c)} TEXT${i === 0 ? ' PRIMARY KEY' : ''}`).join(', ');
        stmts.push(db.prepare(`CREATE TABLE IF NOT EXISTS ${q(t)} (${ddl})`));
      } else {
        for (const c of cols) if (!cur.has(c.toLowerCase())) stmts.push(db.prepare(`ALTER TABLE ${q(t)} ADD COLUMN ${q(c)} TEXT`));
      }
    }
  }
  await runBatches(db, stmts);
}

/** Versi tabel = "jumlah_counterPerubahan". Tabel hilang/error -> "0_0". 3 query untuk semua tabel. */
async function getVersions(db, tables) {
  const out = tables.map(() => '0_0');
  try {
    const { results: ex } = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    const exist = new Set((ex || []).map((r) => r.name));
    const names = [...new Set(tables.filter((t) => isSafeTable(t) && exist.has(t)))];
    if (!names.length) return out;
    const cnt = {}, ctr = {};
    const { results: cr } = await db.prepare(
      names.map((t) => `SELECT ? AS t, count(*) AS c FROM ${q(t)}`).join(' UNION ALL ')
    ).bind(...names).all();
    for (const r of cr || []) cnt[r.t] = r.c;
    if (exist.has('_apex_ver')) {
      const { results: vr } = await db.prepare('SELECT t, n FROM _apex_ver').all();
      for (const r of vr || []) ctr[r.t] = r.n;
    }
    tables.forEach((t, i) => { if (t in cnt) out[i] = `${cnt[t] || 0}_${ctr[t] || 0}`; });
  } catch (_) {}
  return out;
}

// UPSERT (bukan REPLACE) agar rowid/urutan baris asli tetap
const upsertStmt = (db, table, cols, row) => {
  const set = cols.slice(1).map((c) => `${q(c)} = excluded.${q(c)}`).join(', ');
  return db.prepare(
    `INSERT INTO ${q(table)} (${cols.map(q).join(',')}) VALUES (${cols.map(() => '?').join(',')}) ` +
    `ON CONFLICT(${q(cols[0])}) DO ${set ? 'UPDATE SET ' + set : 'NOTHING'}`
  ).bind(...cols.map((_, i) => cell(row[i])));
};

const bumpStmt = (db, t) =>
  db.prepare('INSERT INTO _apex_ver (t, n) VALUES (?, 1) ON CONFLICT(t) DO UPDATE SET n = n + 1').bind(t);

// ---------------------------------------------------------------- actions

async function manifest(env, tn, colsMap) {
  await ensureTables(env.DB, Object.fromEntries(tn.filter((t) => colsMap[t]).map((t) => [t, colsMap[t]])));
  const v = await getVersions(env.DB, tn);
  return json({ ok: true, data: { v, shs: tn }, v });
}

async function pullBatch(env, tn, reqs) {
  const v = await getVersions(env.DB, tn);
  const results = [];

  for (const { t } of Array.isArray(reqs) ? reqs : []) {
    const table = tn[t];
    if (!isSafeTable(table)) continue;
    try {
      const info = await env.DB.prepare(`PRAGMA table_info(${q(table)})`).all();
      const cols = (info.results || []).map((c) => String(c.name));
      if (!cols.length) continue;
      const r = (await env.DB.prepare(`SELECT ${cols.map(q).join(',')} FROM ${q(table)} ORDER BY rowid`).raw()) || [];
      results.push({ t, v: v[t], r, cols });
    } catch (_) {}
  }

  return json({ ok: true, data: { results }, v });
}

async function push(env, ctx, p, tn, colsMap) {
  await ensureTables(env.DB, colsMap);
  const touched = new Set();

  // 1. Mutasi: y === 0 hapus, selain itu upsert
  const muts = Array.isArray(p.m) ? p.m : [];
  const stmts = [];
  for (const item of muts) {
    if (!item || typeof item !== 'object') continue;
    const t = item.tn;
    const cols = colsMap[t];
    const row = Array.isArray(item.r) ? item.r : [];
    if (!isSafeTable(t) || !cols?.length || cell(row[0]) === '') continue;

    touched.add(t);
    stmts.push(
      item.y === 0
        ? env.DB.prepare(`DELETE FROM ${q(t)} WHERE ${q(cols[0])} = ?`).bind(cell(row[0]))
        : upsertStmt(env.DB, t, cols, row)
    );
  }
  await runBatches(env.DB, stmts);

  await runBatches(env.DB, [...touched].map((t) => bumpStmt(env.DB, t)));

  // 2. Forward ke Google Apps Script (fire-and-forget)
  if (typeof p.gasUrl === 'string' && /^https?:\/\//i.test(p.gasUrl) && ctx?.waitUntil) {
    ctx.waitUntil(
      fetch(p.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(p),
        redirect: 'follow'
      }).catch(() => {})
    );
  }

  const v = await getVersions(env.DB, tn);
  return json({ ok: true, manifest: { v } });
}

// ---------------------------------------------------------------- entry

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (!env?.DB) return json({ ok: false, error: "Binding 'DB' tidak ditemukan" }, 500);
    if (req.method !== 'POST') return json({ ok: true, status: 'ready' });

    try {
      const p = await req.json().catch(() => ({}));
      const a = p.a || p.action || '';
      const tn = Array.isArray(p.tn) && p.tn.length ? p.tn : DEFAULT_TABLES;
      const colsMap = p.cols && typeof p.cols === 'object' ? p.cols : {};

      switch (a) {
        case 'manifest':   return await manifest(env, tn, colsMap);
        case 'pull_batch': return await pullBatch(env, tn, p.reqs);
        case 'push':       return await push(env, ctx, p, tn, colsMap);
        default:           return json({ ok: true, status: 'ready' });
      }
    } catch (err) {
      return json({ ok: false, error: err?.message || String(err) }, 500);
    }
  }
};
