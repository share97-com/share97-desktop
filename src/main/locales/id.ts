import type { Strings } from './tr.ts'

export const id: Strings = {
  translate: 'Terjemahkan halaman ini',
  incognito: 'Penyamaran', newTab: "Tab baru", reload: "Muat ulang", duplicate: "Duplikat", unmute: "Bunyikan situs", mute: "Senyapkan situs", close: "Tutup", closeOthers: "Tutup tab lain", reopen: "Buka lagi tab yang ditutup", openLink: "Buka tautan di tab baru", copyLink: "Salin alamat tautan", openImage: "Buka gambar di tab baru", saveImage: "Simpan gambar", copyImage: "Salin gambar", undo: "Urungkan", redo: "Ulangi", cut: "Potong", copy: "Salin", paste: "Tempel", selectAll: "Pilih semua", search: "Cari di Google untuk", back: "Kembali", forward: "Maju", print: "Cetak…", inspect: "Inspeksi", permAllow: "Izinkan", permDeny: "Blokir", permAsk: "meminta izin untuk", permRemember: "Pilihan diingat untuk situs ini di browser ini.", browser: "Browser", approvalNeeded: "Perlu persetujuan", agentDone: "Agen selesai.", agentFailed: "Agen berhenti", openInApp: "Buka tautan di aplikasi", openExternal: "Buka tautan di browser sistem", addWord: "Tambahkan ke kamus", chatData: "Data obrolan", quit: "Keluar",
  example: 'Contoh alur kerja',
  sessionEnded: (handle: string) => `@${handle}: sesi berakhir dan alur kerja tidak dapat berjalan di akun ini. Klik untuk masuk lagi.`,
  started: 'dimulai',
  noContent: (flow: string) => `"${flow}" tidak punya konten tersisa untuk dibagikan. Tambahkan konten ke foldernya atau buat di aplikasi.`,
  alreadyQueued: 'sudah menunggu di antrean, jalan ini tidak ditambahkan',
  queued: (ahead: number) => `diantrekan (${ahead} jalan di depan)`,
  offWhileQueued: 'dimatikan saat menunggu di antrean, tidak dijalankan',
  runDone: 'selesai',
  runSkipped: 'dilewati',
  stoppedFromSite: 'dihentikan dari situs',
}
