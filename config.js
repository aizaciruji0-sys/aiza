/* APEX — konfigurasi tunggal (SSOT). Isi d1Url / gasUrl; kosong = mode offline lokal. */
const HARD={
  d1Url:'https://aiza3.aizaciruji0.workers.dev',   // URL Cloudflare Worker
  gasUrl:'https://script.google.com/macros/s/AKfycbzaLGQzwe3hoGekhRpMXgg3KOFA2YCdW5jvu5AY4LEoJGWgoXx-_jtz_GgMybDWxKKq/exec',  // URL Web App Google Apps Script (/exec), cadangan bila D1 tidak tersedia
  store:{name:'TOKO',sub:'',phone:'',bank:'',footer:'Terima kasih'},
  shs:['penjualan','produk_jual','produk','pembelian','produk_beli','kas','kontak','cicil','ecer','users','roles','cms','absen'], // 'toko' ditambahkan otomatis oleh app.js
  cols:{
    penjualan:['idpenjualan','user','date','bayar','catatan','diskon','idkontak','lokasi','foto','status'],
    produk_jual:['idprodukjual','idpenjualan','idproduk','namaproduk','hargabeli','hargajual','qty','diskon','catatan'],
    produk:['idproduk','subkategori','kategori','namaproduk','hargabeli','hargajual','stok','foto'],
    pembelian:['idpembelian','user','date','bayar','catatan','idkontak','lokasi','foto','status'],
    produk_beli:['idprodukbeli','idpembelian','idproduk','namaproduk','hargabeli','hargajual','qty'],
    kas:['idkas','user','date','kategori','masuk','keluar','uraian','foto'],
    kontak:['idkontak','user','kategori','nama','alamat','hp','lokasi','foto'],
    cicil:['idcicil','idjual','user','date','jumlah','catatan','idkontak'],
    ecer:['idecer','date','user','idproduk','namaproduk','hargabeli','hargajual','qty','diskon','catatan'],
    users:['user','role','pass'],
    roles:['role','hide','validasi'],
    cms:['idcms','date','user','judul','kategori','foto','file','status','konten'],
    absen:['idabsen','user','date','tipe','jam','lokasi','foto','catatan']
  },
  vis:{
    penjualan:['date','idkontak','status','user'],produk_jual:['namaproduk','qty','hargajual'],produk:['namaproduk','stok','hargajual'],
    pembelian:['date','idkontak','status','user'],produk_beli:['namaproduk','qty','hargabeli'],kas:['date','kategori','uraian','masuk','keluar'],
    kontak:['nama','hp','kategori'],cicil:['date','idjual','jumlah'],ecer:['date','namaproduk','qty'],users:['user','role'],
    roles:['role','hide'],cms:['judul','kategori','status'],absen:['date','user','tipe','jam']
  },
  db:{}
};
HARD.shs.forEach(s=>{HARD.db[s]=[];});
