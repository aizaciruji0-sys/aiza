/**
 * APEX BACKEND - GOOGLE APPS SCRIPT (ULTRA APEX KISS)
 *
 * Actions (field `a` / `action`):
 *   manifest   -> pastikan sheet ada, kembalikan daftar sheet, kolom, versi
 *   pull_batch -> p.reqs=[{t:indeksTabel}] -> data.results=[{t, v, r:[[baris]], cols}]
 *   push       -> terapkan mutasi p.m=[{tn,y,r}] (y=0 hapus)
 */

var DEFAULT_TABLES = [
  'penjualan', 'produk_jual', 'produk', 'pembelian', 'produk_beli',
  'kas', 'kontak', 'cicil', 'ecer', 'users', 'roles', 'cms', 'absen', 'toko'
];

// ---------------------------------------------------------------- entry

function doGet(e) {
  return out(core((e && e.parameter) || {}));
}

function doPost(e) {
  var p = (e && e.parameter) || {}, b = {};
  try { b = JSON.parse((e && e.postData && e.postData.contents) || p.payload || '{}'); } catch (_) {}
  return out(core(Object.assign({}, p, b)));
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------- helpers

function cleanCols(cols) {
  return Array.isArray(cols)
    ? cols.map(function (x) { return String(x || '').trim(); }).filter(Boolean)
    : [];
}

// Cegah formula injection: awalan = + @ atau - diikuti non-digit diberi apostrof
function safeCell(v) {
  if (v == null) return '';
  var s = String(v);
  return (/^[=+@]/.test(s) || /^-\D/.test(s)) ? "'" + s : s;
}

function padRow(r, n) {
  var row = [];
  for (var i = 0; i < n; i++) row.push(safeCell(r[i]));
  return row;
}

function pkKey(v) {
  return String(v == null ? '' : v).trim().toLowerCase();
}

// Ambil sheet; buat bila belum ada; lengkapi header yang kurang
function getSh(ss, name, cols) {
  if (!name) return null;
  var c = cleanCols(cols);
  var sh = ss.getSheetByName(name);

  if (!sh) {
    if (!c.length) return null;
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, c.length).setValues([c]);
    var d = ss.getSheetByName('Sheet1');
    if (d && ss.getSheets().length > 1 && d.getLastRow() === 0) {
      try { ss.deleteSheet(d); } catch (_) {}
    }
    return sh;
  }

  if (c.length) {
    var lc = sh.getLastColumn();
    if (!sh.getLastRow() || !lc) {
      sh.getRange(1, 1, 1, c.length).setValues([c]);
    } else if (lc < c.length) {
      sh.getRange(1, lc + 1, 1, c.length - lc).setValues([c.slice(lc)]);
    }
  }
  return sh;
}

// Versi sheet = "jumlahBaris_counterPerubahan" (sama dengan D1; '0_0' = kosong/tidak ada)
function getVers(ss, tables) {
  var pr = PropertiesService.getScriptProperties().getProperties();
  return tables.map(function (t) {
    var sh = ss.getSheetByName(t);
    return sh ? Math.max(sh.getLastRow() - 1, 0) + '_' + (pr['v_' + t] || 0) : '0_0';
  });
}

function bump(names) {
  if (!names.length) return;
  var sp = PropertiesService.getScriptProperties(), cur = sp.getProperties(), upd = {};
  names.forEach(function (t) { upd['v_' + t] = String(Number(cur['v_' + t] || 0) + 1); });
  sp.setProperties(upd);
}

// Sel -> string; Date (hasil auto-parse Sheets) dikembalikan ke yyyy-MM-dd [HH:mm:ss]
function str(x, tz) {
  if (x == null) return '';
  if (x instanceof Date) {
    var d = Utilities.formatDate(x, tz, 'yyyy-MM-dd'), t = Utilities.formatDate(x, tz, 'HH:mm:ss');
    return t === '00:00:00' ? d : d + ' ' + t;
  }
  return String(x);
}

function openSpreadsheet(p, props) {
  var ss = null;
  if (p.sid) ss = SpreadsheetApp.openById(p.sid);
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss && props.getProperty('APEX_SID')) ss = SpreadsheetApp.openById(props.getProperty('APEX_SID'));
  return ss;
}

// ---------------------------------------------------------------- actions

function actManifest(ss, tn, colsMap) {
  tn.forEach(function (t) { if (colsMap[t]) getSh(ss, t, colsMap[t]); });

  var shs = [], cols = {}, vis = {};
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName(), lc = sh.getLastColumn();
    shs.push(name);
    if (lc > 0) {
      var h = sh.getRange(1, 1, 1, lc).getValues()[0].map(function (x) {
        return String(x || '').trim().toLowerCase();
      });
      cols[name] = h;
      vis[name] = h.slice(0, 4);
    }
  });

  var v = getVers(ss, tn);
  return { ok: true, data: { shs: shs, cols: cols, vis: vis, v: v }, v: v };
}

function actPullBatch(ss, tn, p) {
  var v = getVers(ss, tn), results = [], tz = ss.getSpreadsheetTimeZone();

  (Array.isArray(p.reqs) ? p.reqs : []).forEach(function (rq) {
    var sh = ss.getSheetByName(tn[rq.t]);
    if (!sh || !sh.getLastColumn()) return;
    var lr = sh.getLastRow(), lc = sh.getLastColumn();
    var cols = sh.getRange(1, 1, 1, lc).getValues()[0].map(function (x) {
      return String(x || '').trim().toLowerCase();
    });
    var rows = lr > 1
      ? sh.getRange(2, 1, lr - 1, lc).getValues().map(function (r) {
          return r.map(function (x) { return str(x, tz); });
        })
      : [];
    results.push({ t: rq.t, v: v[rq.t], r: rows, cols: cols });
  });

  return { ok: true, data: { results: results }, v: v };
}

function actPush(ss, tn, colsMap, p) {
  var touched = {};
  // Mutasi (y === 0 hapus, selain itu upsert), indeks PK di-cache per sheet
  var cache = {};
  (Array.isArray(p.m) ? p.m : []).forEach(function (m) {
    if (!m || typeof m !== 'object') return;
    var t = m.tn;
    var c = colsMap[t], r = Array.isArray(m.r) ? m.r : [], key = pkKey(r[0]);
    if (!t || !c || !c.length || !key) return;

    var st = cache[t];
    if (!st) {
      var sh = getSh(ss, t, c);
      if (!sh) return;
      var lr = sh.getLastRow();
      st = cache[t] = {
        sh: sh,
        lc: Math.max(sh.getLastColumn(), c.length),
        pks: lr > 1 ? sh.getRange(2, 1, lr - 1, 1).getValues().map(function (x) { return pkKey(x[0]); }) : []
      };
    }

    touched[t] = 1;
    var idx = st.pks.indexOf(key);
    if (m.y === 0) {
      if (idx !== -1) { st.sh.deleteRow(idx + 2); st.pks.splice(idx, 1); }
    } else if (idx !== -1) {
      st.sh.getRange(idx + 2, 1, 1, st.lc).setValues([padRow(r, st.lc)]);
    } else {
      st.sh.appendRow(padRow(r, st.lc));
      st.pks.push(key);
    }
  });

  tn.forEach(function (t) { if (colsMap[t]) getSh(ss, t, colsMap[t]); });
  bump(Object.keys(touched));
  return { ok: true, manifest: { v: getVers(ss, tn) } };
}

// ---------------------------------------------------------------- core

function core(p) {
  p = p || {};
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, error: 'Server sibuk, coba lagi' };

  try {
    var props = PropertiesService.getScriptProperties();
    var ss = openSpreadsheet(p, props);
    if (!ss) return { ok: false, error: 'Spreadsheet tidak ditemukan' };
    try { props.setProperty('APEX_SID', ss.getId()); } catch (_) {}

    var a = p.a || p.action || '';
    var tn = Array.isArray(p.tn) && p.tn.length ? p.tn : DEFAULT_TABLES;
    var colsMap = (p.cols && typeof p.cols === 'object') ? p.cols : {};

    switch (a) {
      case 'manifest':   return actManifest(ss, tn, colsMap);
      case 'pull_batch': return actPullBatch(ss, tn, p);
      case 'push':       return actPush(ss, tn, colsMap, p);
      default:           return { ok: true, status: 'ready', online: true };
    }
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}
