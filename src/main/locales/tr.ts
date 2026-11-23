/** Ana sürecin Türkçe metinleri: biçim (`Strings`) buradan. */
export const tr = {
  translate: 'Bu sayfayı çevir',
  incognito: 'Gizli', newTab: "Yeni sekme", reload: "Yeniden yükle", duplicate: "Sekmeyi çoğalt", unmute: "Sitenin sesini aç", mute: "Siteyi sessize al", close: "Kapat", closeOthers: "Diğer sekmeleri kapat", reopen: "Kapatılan sekmeyi yeniden aç", openLink: "Bağlantıyı yeni sekmede aç", copyLink: "Bağlantı adresini kopyala", openImage: "Resmi yeni sekmede aç", saveImage: "Resmi kaydet", copyImage: "Resmi kopyala", undo: "Geri al", redo: "Yinele", cut: "Kes", copy: "Kopyala", paste: "Yapıştır", selectAll: "Tümünü seç", search: "Google'da ara", back: "Geri", forward: "İleri", print: "Yazdır…", inspect: "İncele", permAllow: "İzin ver", permDeny: "İzin verme", permAsk: "şu izni istiyor", permRemember: "Karar bu tarayıcıda bu site için hatırlanır.", browser: "Tarayıcı", approvalNeeded: "Onay bekleniyor", agentDone: "Agent işi bitirdi.", agentFailed: "Agent durdu", openInApp: "Bağlantıyı uygulamada aç", openExternal: "Bağlantıyı sistem tarayıcısında aç", addWord: "Sözlüğe ekle", chatData: "Sohbet verileri", quit: "Çıkış",
  example: 'Örnek akış',
  sessionEnded: (handle: string) => `@${handle}: oturum düşmüş, akış bu hesapta çalışamadı. Yeniden giriş yapmak için tıkla.`,
  started: 'başladı',
  noContent: (flow: string) => `"${flow}": paylaşacak içerik kalmadı. Klasöre yeni içerik ekle ya da uygulamada üret.`,
  alreadyQueued: 'zaten sırada bekliyor, bu çalışma eklenmedi',
  queued: (ahead: number) => `sıraya alındı (önünde ${ahead} çalışma)`,
  offWhileQueued: 'sırada beklerken kapatıldı, çalışmadı',
  runDone: 'tamamlandı',
  runSkipped: 'atlandı',
  stoppedFromSite: 'siteden durduruldu',
}

export type Strings = typeof tr
