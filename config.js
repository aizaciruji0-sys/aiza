/* APEX — Konfigurasi Dinamis SSOT */
const HARD = {
  d1Url: 'https://aiza3.aizaciruji0.workers.dev',
  gasUrl: 'https://script.google.com/macros/s/AKfycbzaLGQzwe3hoGekhRpMXgg3KOFA2YCdW5jvu5AY4LEoJGWgoXx-_jtz_GgMybDWxKKq/exec',
  store: { name: 'TB. AIZA CIRUJI', sub: 'Jl. Raya Saketi-Bayah', phone: '08787 117 6447', bank: 'BRI 0166 0113 7004 507', footer: 'Terima kasih' },
  shs: ['penjualan', 'produk_jual', 'produk', 'pembelian', 'produk_beli', 'kas', 'kontak', 'cicil', 'ecer', 'users', 'roles', 'cms', 'absen', 'toko'],
  cols: {
    penjualan: ['idpenjualan', 'user', 'date', 'bayar', 'catatan', 'diskon', 'idkontak', 'lokasi', 'foto', 'status'],
    produk_jual: ['idprodukjual', 'idpenjualan', 'idproduk', 'namaproduk', 'hargabeli', 'hargajual', 'qty', 'diskon', 'catatan'],
    produk: ['idproduk', 'subkategori', 'kategori', 'namaproduk', 'hargabeli', 'hargajual', 'stok', 'foto'],
    pembelian: ['idpembelian', 'user', 'date', 'bayar', 'catatan', 'idkontak', 'lokasi', 'foto', 'status'],
    produk_beli: ['idprodukbeli', 'idpembelian', 'idproduk', 'namaproduk', 'hargabeli', 'hargajual', 'qty'],
    kas: ['idkas', 'user', 'date', 'kategori', 'masuk', 'keluar', 'uraian', 'foto'],
    kontak: ['idkontak', 'user', 'kategori', 'nama', 'alamat', 'hp', 'lokasi', 'foto'],
    cicil: ['idcicil', 'idjual', 'user', 'date', 'jumlah', 'catatan', 'idkontak'],
    ecer: ['idecer', 'date', 'user', 'idproduk', 'namaproduk', 'hargabeli', 'hargajual', 'qty', 'diskon', 'catatan'],
    users: ['user', 'password', 'role'],
    roles: ['role', 'hide', 'validasi'],
    cms: ['idcms', 'date', 'user', 'judul', 'kategori', 'foto', 'file', 'status', 'konten'],
    absen: ['idabsen', 'user', 'date', 'tipe', 'jam', 'lokasi', 'foto', 'catatan'],
    toko: ['id', 'name', 'sub', 'phone', 'bank', 'footer']
  },
  vis: {
    penjualan: ['date', 'idkontak', 'status', 'user'],
    produk_jual: ['namaproduk', 'qty', 'hargajual'],
    produk: ['namaproduk', 'stok', 'hargajual'],
    pembelian: ['date', 'idkontak', 'status', 'user'],
    produk_beli: ['namaproduk', 'qty', 'hargabeli'],
    kas: ['date', 'kategori', 'uraian', 'masuk', 'keluar'],
    kontak: ['nama', 'hp', 'kategori'],
    cicil: ['date', 'idjual', 'jumlah'],
    ecer: ['date', 'namaproduk', 'qty'],
    users: ['user', 'role'],
    roles: ['role', 'hide'],
    cms: ['judul', 'kategori', 'status'],
    absen: ['date', 'user', 'tipe', 'jam'],
    toko: ['id', 'name', 'phone']
  },
  db: {}
};
HARD.shs.forEach(s => { HARD.db[s] = []; });