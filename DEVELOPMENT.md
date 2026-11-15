# Share97 Desktop

Share97'nin masaüstü uygulaması (Electron, Windows). Kullanıcı **Share97 ile giriş yap** der, tarayıcıda onaylar ve bu kurulum hesabının bir **Worker**'ı olur: sosyal medya hesaplarının oturumları bu bilgisayarda durur, işleri uygulamanın yapay zekâ agent'ı gerçek tarayıcılarda yapar.

```bash
npm install
npm run dev        # geliştirme (SHARE97_URL=http://localhost:3000 yerel sunucu için)
npm test           # birim testleri
npm run typecheck
npm run dist       # Windows kurulum dosyası: dist/
```

## Ekranlar (kenar çubuğu)

| Ekran | Ne yapar |
| --- | --- |
| **Sohbet** | Agent ile sohbet: plan, araç çağrıları, onay kartları, dosyalar. Yazma kutusunun üstünde bu cihazdaki hesaplar işaretlenir; işaretlenen her hesap için agent o hesabın tanımlı olduğu tarayıcıda (ya da Chrome'da) çalışır. Worker ve akış işleri de burada sohbet süreci olarak görünür. |
| **Bağlantılar** | Bütün sosyal medya hesapları tek listede; platforma, kendi grubuna, cihaza ya da duruma göre gruplanır. Hesap ekleme, yeniden giriş, grup verme, kaldırma. |
| **Akışlar** | Sunucudaki akışlar (web ile aynı kayıt): aç/durdur, çalıştıracak cihazı seç, şimdi çalıştır; sıradaki yuvalar, son çalışmaların sonucu ve hesaba bağlı bütün cihazlar. Düzenleme sitenin düzenleyicisinde açılır. |
| **Worker'lar** | Bu cihazda elle ("Çalıştır") başlatılan kayıtlı agent işleri: talimat + hesaplar + model. Zamanlama yok: zamanı gelince çalışan iş bir akıştır. Çalışınca bir sohbet süreci başlatır. |
| **Chrome** | `share97-chrome` eklentisiyle bağlanan Chrome profilleri. |
| **Yedekler** | Bütün ayarlar ve tarayıcı çerezleri tek `.share97` dosyasında (brotli ile sıkıştırılmış), `Belgeler\Share97\Yedekler` altında: yeni yedek, var olanı güncelle, klasörde göster, dosyadan ekle, geri yükle (önce bugünkü durum ayrıca yedeklenir). `src/main/backup.ts`. |
| **Paket ve kredi** | Ücretsiz / Pro paket, günlük hak, ek kredi, yapay zekâ bakiyesi; satın alma sitenin faturalama sayfasında. |
| **Ayarlar** | Hesap, arka planda çalışma, modeller, agent, tema, tarayıcılar… |

Üst şeritteki sekmeler uygulamanın tarayıcılarıdır: her hesap kendi tarayıcısında (kendi çerez deposu) durur.

## Share97'ye bağlanma

- `src/main/auth.ts`: OAuth 2.0 + PKCE (S256), `127.0.0.1` dönüş adresi → `POST /api/connect/token` → **cihaz anahtarı**. Anahtar Windows DPAPI ile şifreli, arayüze hiç gitmez. Sunucuda anahtar = Worker (`/workers` sayfasında bilgisayarın adıyla görünür); orada kaldırılırsa uygulama girişe döner.
- Hesap bilgisi `GET /api/v1/worker/me`: paket, kredi, yapay zekâ bakiyesi, sınırlar.
- Site (faturalama, akış düzenleyicisi) `/api/v1/worker/web` ile bu cihazın oturumuyla ayrı pencerede açılır.

## Yapay zekâ

Model çağrıları Share97'nin geçidine gider (`src/main/gateway.ts` → `/api/v1/ai/*`, OpenAI biçimi). Sunucu isteği api14'e aktarır; bedel (api14 fiyatı + yönetim panelindeki marj) kullanıcının Share97 kredisinden düşer. Model listesindeki fiyatlar ve sohbetteki maliyet kullanıcının ödediği tutardır. Kredi biterse geçit `insufficient-credits` döner ve sohbet "Kredi yükle"ye yönlendirir.

## Sosyal hesaplar

`src/shared/platforms.ts` dokuz platformu tanımlar (Instagram, TikTok, X, LinkedIn, Facebook, YouTube, Pinterest, Threads, Reddit). **Hesap ekle** iki yoldan:

- **Uygulamada**: hesaba özel bir tarayıcı açılır, kullanıcı platformun kendi ekranında giriş yapar; oturum çerezi görülünce hesap sunucuya yazılır (`POST /api/v1/worker/accounts`). Parola uygulamaya da agent'a da görünmez.
- **Chrome'da**: eklentiyle bağlı bir Chrome seçilir; kullanıcı o Chrome'da zaten girişli olmalıdır. Eklenti platformun oturum çerezinin **var olup olmadığını** söyler (değeri Chrome'dan çıkmaz): giriş yoksa hesap eklenmez, platformun giriş sayfası o Chrome'da açılır. Agent işleri o Chrome'un sekmelerinde yapar.

Oturumlar cihazdan çıkmaz; sunucuda yalnız hesabın adı ve bu cihaza bağlı olduğu yazar. Gruplar sunucudadır (`PATCH /api/v1/worker/accounts`): bütün cihazlarda aynı görünür.

## Bu kurulum bir Worker

`src/main/device.ts`: uygulama 15 saniyede bir `POST /api/v1/worker/poll` ile iş alır. Sunucudaki akış bir paylaşımı ya da talimatı bu cihazdaki bir hesaba gönderdiğinde agent işi hesabın tarayıcısında yapar (`Agent.task`, sonuç `finish_task` ile), sonuç `POST /api/v1/worker/jobs/<id>` ile sunucuya yazılır ve sitede akışın çalışmasında görünür. Oturum düşmüşse iş başlamadan `expired` bildirilir.

`src/main/workers.ts`: Worker tanımlarını cihaz çalıştırır (`workers.json`) ve her değişiklikte, her çalışmadan sonra sunucuya yazar (`PUT /api/v1/worker/definitions`): sitedeki Workers sayfası hangi cihazda hangi görevin çalıştığını ve son sonucunu gösterir, yeniden kurulan cihaz tanımlarını oradan geri alır. Tanımda zamanlama yoktur (zamanı akışlar belirler); tanım "Çalıştır" ile başlar. Başıboş işler (sunucu işleri + Worker'lar) sırayla koşar. Bu işlerde agent'ın onay isteyeceği eylemler kendiliğinden onaylanır: başında kimse yoktur.

**Yerel içerik** (`src/main/contents.ts`, saf kısmı `src/shared/contents.ts`): akışın içerik kaynağı "cihazdaki klasör" ise içerikleri bu bilgisayarda durur: `<kullanıcı klasörü>/share97-desktop/workflow/<akış kimliği>/contents/1, 2, 3…`. Her numaralı klasör bir içeriktir: bir metin dosyası (açıklama), görseller ya da videolar ve durumu gösteren `status.txt` (`pending` · `publishing` · `published` · `failed`; ikinci satır not). Akış çalışınca sunucu sıradaki içeriği yoklamayla ister (`poll` yanıtındaki `content`); cihaz `pending` olanlardan sıradakini ya da rastgele birini seçer (akışın ayarı), `publishing` yazar ve metni + dosya adlarını bildirir (`POST /api/v1/worker/content/<id>`). Yayını yine bu cihazdaki agent yapar (dosyalar klasörden yüklenir, sunucuya çıkmaz) ve sonuç `status.txt`e yazılır: `published` olan bir daha alınmaz; yeniden paylaşmak için `pending` yazılır. Tekrar açıksa hepsi paylaşılınca baştan başlar.

**Akış eşitlemesi**: akışlar sunucuda durur; uygulama onları hesaplarla birlikte dakikada bir ve Akışlar ekranındaki **Eşitle** düğmesiyle okur (`accounts.syncAccounts` → `contents.syncContents`). İçeriği bu cihazda duran her akışın klasörü kurulur; ilk kurulduğunda içine örnek bir içerik (`1`, durumu `published`) ve `README.txt` konur. Hesapta hiç akış yoksa bir kez **örnek akış** açılır (`POST /api/v1/worker/workflows`: durdurulmuş taslak, içeriği bu cihazın klasöründen). İçerik ayarları (kaynak, sıra, tekrar) Akışlar ekranından da değişir.

**Otomatik paylaşım** (`src/main/auto.ts`): ayar sitenin Ayarlar sayfasında (aralık, diller, konular). Yoklamada sıra boşsa tur sunucudan alınır (`POST /api/v1/worker/auto-content`, iki cihaz aynı turu alamaz); seçili her dil için bir paylaşım, hesaplara sırayla, konusu rastgele. Metin ve görsel Share97 geçidiyle yazılır (bedeli krediden), paylaşımı agent hesabın tarayıcısında yapar, sonuç `PUT /api/v1/worker/auto-content` ile sitedeki İçerikler'e yazılır. Paylaşımlar arası 30 dakika; sıra `auto.json`da, yeniden açılışta kaldığı yerden sürer.

**Sürekli çalışma** (Ayarlar > Hesap > Bilgisayar uyumasın, `src/main/power.ts`): Windows'un uyku, hazırda bekleme, ekran kapanması ve kapak eylemi `powercfg` ile kapatılır (isteğe bağlı pilde de), uygulama açılışta başlar. Önceki değerler `power.json`da saklanır, kapatınca geri yüklenir.

**Arka plan** (Ayarlar > Hesap): pencere kapanınca tepside çalışmaya devam eder, isteğe bağlı olarak bilgisayar açılınca gizli başlar; açıkken uyku engellenir. Tek kopya çalışır.

## Chrome eklentisi (`share97-chrome/`)

Manifest V3; kurulumla gelir, **Chrome** ekranındaki adımlarla "Paketlenmemiş öğe yükle" ile kurulur. Uygulama `127.0.0.1:17614`te dinler, her Chrome bir kez onaylanır. Agent o Chrome'un sekmelerini uygulamanın tarayıcıları gibi kullanır (Chrome DevTools Protocol).

## Sınırlar

- Agent sayfa arayüzüne bakarak çalışır; her platform canlı hesapla ayrıca denenmelidir.
- Doğrulama, captcha, hız sınırı ya da otomasyon uyarısında iş durur; aşılmaya çalışılmaz.
- Otomasyon bazı platformların kullanım şartlarına aykırı olabilir ve hesabı kısıtlatabilir.
- Uygulama kapalıyken gelen akış işi sunucuda `offline` hatasıyla düşer.
- Güncelleme `share97-com/share97-desktop` GitHub sürümlerinden okunur (`src/main/updater.ts`).

```
src/main/        ana süreç
  auth.ts        Share97 Connect, cihaz anahtarı, sunucu istekleri
  gateway.ts     yapay zekâ geçidi istemcisi (modeller, medya)
  accounts.ts    sosyal hesaplar: ekleme, giriş, gruplar, sunucuyla eşitleme
  device.ts      Worker döngüsü: sunucudan iş al, yap, sonucu bildir
  workers.ts     Worker tanımları (elle çalıştırılır)
  contents.ts    Akışların yerel içerik klasörleri ve akış eşitlemesi
  auto.ts        otomatik paylaşım turu
  power.ts       sürekli çalışma (Windows güç ayarları)
  agent/         LangChain agent, araçlar, sayfa kontrolü
  browsers.ts    tarayıcı profilleri ve sekmeler
  chrome/        eklenti köprüsü
src/shared/      tipler, platform tablosu, yerel içerik kuralları
src/renderer/    React arayüzü (Hallmark, Lumen teması: styles.css + tokens.css)
share97-chrome/  Chrome eklentisi
```
