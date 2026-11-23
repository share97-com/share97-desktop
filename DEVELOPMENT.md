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
| **Sohbet** | Agent ile sohbet: plan, araç çağrıları, onay kartları, dosyalar. Yazma kutusunun üstünde bu cihazdaki hesaplar işaretlenir; işaretlenen her hesap için agent o hesabın tanımlı olduğu tarayıcıda (ya da Chrome'da) çalışır. Akış işleri de burada sohbet süreci olarak görünür. |
| **Bağlantılar** | Bütün sosyal medya hesapları tek listede; platforma, kendi grubuna, cihaza ya da duruma göre gruplanır. Hesap ekleme, yeniden giriş, grup verme, kaldırma. |
| **Akışlar** | Tanımı sunucuda duran, bu uygulamanın çalıştırdığı akışlar: hazır akışlar (tek tıkla), agent görevi, aç/durdur, çalıştıracak cihazı seç, şimdi çalıştır; sıradaki yuvalar, son çalışmaların sonucu, bu cihazın etkinlik günlüğü ve hesaba bağlı bütün cihazlar. Düzenleme sitenin düzenleyicisinde açılır. |
| **Chrome** | `share97-chrome` eklentisiyle bağlanan Chrome profilleri. |
| **Yedekler** | Bütün ayarlar ve tarayıcı çerezleri tek `.share97` dosyasında (brotli ile sıkıştırılmış), `Belgeler\Share97\Yedekler` altında: yeni yedek, var olanı güncelle, klasörde göster, dosyadan ekle, geri yükle (önce bugünkü durum ayrıca yedeklenir). `src/main/backup.ts`. |
| **Paket ve kredi** | Ücretsiz / Pro paket, günlük hak, ek kredi, yapay zekâ bakiyesi; satın alma sitenin faturalama sayfasında. |
| **Ayarlar** | Hesap, arka planda çalışma, modeller, agent, tema, tarayıcılar… Hesap bölümündeki **Share97 hesabı** kartı sitenin Ayarlar sayfasını açar (marka sesi, otomatik içerik, e-posta izinleri, veri indirme, hesabı silme). |
| **Share97 sitesi** | Takvim, Analiz, Marketplace, Arama: uygulamada çizilmez, site penceresinde (bu cihazın oturumuyla) açılır. |

Üst şeritteki sekmeler uygulamanın tarayıcılarıdır: her hesap kendi tarayıcısında (kendi çerez deposu) durur. Sitede yayındaki duyurular (`/api/v1/worker/me?lang=` → `announcements`) şeridin altında görünür; kapatılan duyuru bu bilgisayarda hatırlanır.

**Diller**: arayüz sitedekilerle aynı on beş dilde (`src/shared/locales.ts`); arayüz metinleri `src/renderer/src/locales/<dil>.ts`, ana sürecin metinleri (menü, bildirim, günlük) `src/main/locales/<dil>.ts`. Biçim Türkçe dosyadan (`Dict`, `Strings`): yeni anahtar eklenince typecheck bütün dillerde eksik olanı gösterir. Dil sistemin dilinden; Arapçada sayfa sağdan sola (`dir`). Site penceresi de aynı dilin önekiyle açılır (`sitePath`).

## Share97'ye bağlanma

- `src/main/auth.ts`: OAuth 2.0 + PKCE (S256), `127.0.0.1` dönüş adresi → `POST /api/connect/token` → **cihaz anahtarı**. Anahtar Windows DPAPI ile şifreli, arayüze hiç gitmez. Sunucuda anahtar = Worker (`/workers` sayfasında bilgisayarın adıyla görünür); orada kaldırılırsa uygulama girişe döner.
- Hesap bilgisi `GET /api/v1/worker/me`: paket, kredi, yapay zekâ bakiyesi, sınırlar.
- Site (faturalama, akış düzenleyicisi, takvim, analiz, marketplace, arama, site ayarları) `/api/v1/worker/web` ile bu cihazın oturumuyla ayrı pencerede açılır.
- Akışlar ekranındaki cihaz listesi öteki cihazları yeniden adlandırır ya da kaldırır (`PATCH`/`DELETE /api/v1/worker/workers/<id>`); bu cihaz oradan kaldırılmaz, Ayarlar'da çıkış yapılır.

## Yapay zekâ

Model çağrıları Share97'nin geçidine gider (`src/main/gateway.ts` → `/api/v1/ai/*`, OpenAI biçimi). Sunucu isteği api14'e aktarır; bedel (api14 fiyatı + yönetim panelindeki marj) kullanıcının Share97 kredisinden düşer. Model listesindeki fiyatlar ve sohbetteki maliyet kullanıcının ödediği tutardır. Kredi biterse geçit `insufficient-credits` döner ve sohbet "Kredi yükle"ye yönlendirir.

## Sosyal hesaplar

`src/shared/platforms.ts` dokuz platformu tanımlar (Instagram, TikTok, X, LinkedIn, Facebook, YouTube, Pinterest, Threads, Reddit). **Hesap ekle** iki yoldan:

- **Uygulamada**: hesaba özel bir tarayıcı açılır, kullanıcı platformun kendi ekranında giriş yapar; oturum çerezi görülünce hesap sunucuya yazılır (`POST /api/v1/worker/accounts`). Parola uygulamaya da agent'a da görünmez.
- **Chrome'da**: eklentiyle bağlı bir Chrome seçilir; kullanıcı o Chrome'da zaten girişli olmalıdır. Eklenti platformun oturum çerezinin **var olup olmadığını** söyler (değeri Chrome'dan çıkmaz): giriş yoksa hesap eklenmez, platformun giriş sayfası o Chrome'da açılır. Agent işleri o Chrome'un sekmelerinde yapar.

Oturumlar cihazdan çıkmaz; sunucuda yalnız hesabın adı ve bu cihaza bağlı olduğu yazar. Gruplar sunucudadır (`PATCH /api/v1/worker/accounts`): bütün cihazlarda aynı görünür.

## Bu kurulum bir Worker

**Akışları bu uygulama çalıştırır; sunucuda yalnız denetim ve kayıt durur.** Akışın tanımı (graf, zamanlama, hesaplar, açık/kapalı, hangi cihaz) sunucudadır ve sitedeki düzenleyiciyle aynıdır; zamanı gelen akışı ise **bu cihaz** yürütür (`src/main/runner.ts`, saf motoru `src/shared/workflow.ts`): grafı yürür, içeriği kendi klasöründen alır, her hesaptaki işi agent'a yaptırır ve çalışmayı adım adım sunucuya yazar (`POST /api/v1/worker/runs` → `PATCH /api/v1/worker/runs/<id>` → `POST …/publications`). Sunucu cihaza iş göndermez.

- **Zamanlama** (`schedule`, `dueSlot`): `src/main/device.ts` 15 saniyede bir yoklar (`POST /api/v1/worker/poll`: cihaz canlı işaretlenir, siteden istenen "Şimdi çalıştır"lar gelir) ve bu cihaza atanmış, açık her akışın son bakıştan bu yana saati gelen yuvasını başlatır. Yoklama ayrıca sitenin **eşitleme sürümünü** (`rev`) getirir: sitede akış, hesap ya da cihaz değiştiyse cihaz beklemeden eşitler (sitedeki düzenleme 15 sn içinde cihazda). Siteden **Durdur** (`stop`): akışın sırada bekleyen çalışması düşer, süren çalışmanın agent sohbetleri durur ve sonraki düğümü çalışmaz; kayda `stopped from the site` yazılır (`runner.ts` `stopFlow`). Uygulama kapalıyken kaçan yuvalar dönüşte **bir kez** telafi edilir (yalnız sonuncusu, bir günden eskisi değil). Aynı yuvayı sunucu ikinci kez açtırmaz (`409`): iki cihaz ya da yeniden başlayan uygulama çift paylaşım yapmaz.
- **Her hesap işi bir sohbet sürecidir** (`Agent.task`): iş başladığı anda sohbet ekranı o sohbette açılır (hesabın tarayıcısı da), kullanıcı agent'ın ne yaptığını canlı izler. Çalışma kaydı sohbete bağlıdır (`chatIds`): Akışlar ekranındaki "Son çalışmalar" ve etkinlik günlüğü işin sohbetini açar.
- **İş yalnız hesabın bağlantıda tanımlı tarayıcısında** (çerezleri taşıyan uygulama tarayıcısı ya da Chrome profili) çalışır: tarayıcı iş başlamadan açılır ve agent ona kilitlenir (`Ctx.only`, `lockProblem`). Tarayıcıya erişilemiyorsa (oturum düşmüş, Chrome kapalı) iş başlamaz, hesap sunucuya `expired` bildirilir ve kullanıcı uyarılır: Windows bildirimi (tıklayınca giriş ekranı açılır) ve Akışlar ekranında "Yeniden giriş yap" uyarısı.
- **Atlanan çalışma nedenini yazar** (`skipReason`): hiçbir hesapta iş yapılmadıysa neden çalışma kaydına ve ekrana yazılır (klasörde içerik kalmadı, içerik hesap adımına ulaşmadı, içerik adımı yalnız hata çıkışından bağlı…). Hesaba ulaşmayan içerik yanmaz: `pending`e döner, nedeni notunda.
- **Agent düğümü** (`agent`): seçilen hesapta yazılan görevi yapar (yanıtla, takip et, beğen, veri topla, paylaş…); içerik gerekmez, zamanlamaya doğrudan bağlanır. Yayın düğümleri içerik gelince paylaşır. Her hesap işi bir site kredisidir.
- **Hazır akışlar** (Akışlar ekranı, tek tıkla; `POST /api/v1/worker/workflows {template}`): otomatik paylaşım (`post`), yapay zekâ ile paylaşım (`aiPost`), otomatik yanıt (`reply`, 3 saatte bir), hesapları takip et (`follow`), boş agent görevi (`task`). Cihazdaki hesaplar ve zamanlama dolu, durdurulmuş açılır; görev metni ekranda düzenlenir (`PATCH … {instruction}`).
- **Sohbetten yönetim**: agent kullanıcının sosyal medya yöneticisidir. "Şunu paylaş / yorumları yanıtla" dendiğinde hesabın tarayıcısında hemen yapar; "her gün / 3 saatte bir" dendiğinde `create_workflow` ile akış kurar (`update_workflow`, `run_workflow`, `list_workflows`).


**İçerik hesapta, yalnız bu bilgisayarda** (`src/main/contents.ts`, saf kısmı `src/shared/contents.ts`): sitede içerik alanı yoktur, akışın da klasörü yoktur. Bu cihazdaki her hesabın alanı: `<kullanıcı klasörü>/share97-desktop/accounts/<kullanıcı adı>/<platform>/` → `account.txt` (profil, içerik özellikleri ve yazım istemi; yoksa LangChain ile yazılır, `accountProfile`), `contents/1, 2, 3…` ve plan `schedule.json`. Akışta içerik bir düğümdür: **Hesap içeriği** (`queue`) seçilen hesabın klasöründen sıradakini alır, **YZ ile üret** (`generate`) hesabın `account.txt`iyle o klasöre yeni içerik yazar; çıkışları yayın düğümüne ya da agent'a ("Sohbet mesajı") bağlanır ve içeriğin metni/dosyaları talimatla agent'a gider. Etkinleştirmede içerik düğümünün hesabı zorunludur (`no-account`) ve bir cihazdaki (Worker) hesap olmalıdır. Her numaralı klasör bir içeriktir: bir metin dosyası (açıklama), görseller ya da videolar ve durumu gösteren `status.txt` (`pending` · `publishing` · `published` · `failed`; ikinci satır not). Akış çalışınca `queue` düğümü `pending` olanlardan sıradakini ya da rastgele birini seçer (akışın ayarı) ve `publishing` yazar; `generate` düğümü konudan yeni bir içerik klasörü üretir. Yayını agent yapar (dosyalar klasörden yüklenir, sunucuya çıkmaz) ve sonuç `status.txt`e yazılır: `published` olan bir daha alınmaz; yeniden paylaşmak için `pending` yazılır. Tekrar açıksa hepsi paylaşılınca baştan başlar.

**Standart dosya adları** (`mediaName`): `content.txt`, `image.<uzantı>`, `video.<uzantı>` (aynı türden birden çok: `image-1`, `image-2`…), `status.txt`. Uygulamanın yazdığı her dosya (örnek, eklenen, üretilen) bu adları alır; elle eklenen dosyanın adı serbesttir.

**Agent araçları** (`agent/tools.ts`): `account_profile` (account.txt'i okur; yoksa profil sayfasından okunan notlarla LangChain yazar), `list_account_contents`, `add_account_content`, `requeue_account_content`, `plan_account_posts`, `upload_account_content` (bir içeriğin dosyalarını hesabın tarayıcısındaki sayfaya tek çağrıda ekler, metni ve planlanan saati döndürür), `mark_account_content_scheduled`. Platformun kendi zamanlayıcısına giden yol platform tablosunda (`shared/platforms.ts` `scheduler`, `schedulerNote`) durur ve plan sonucunda agent'a verilir. Kullanıcı sohbetten "Instagram hesabım için paylaşım planla" der: agent account.txt'i hazırlar, içerikleri (metin + görsel/mp4) `contents/1, 2, 3…` olarak yazar, **günde kaç paylaşım** istendiğini sorar ve `plan_account_posts` ile günlere dağıtır (saatler verilmezse 09:00–21:00 arasına eşit). Ardından hesabın tarayıcısında platformun kendi zamanlayıcısına bakar: varsa her içeriği orada zamanlar (`published`, notu "scheduled on …"); yoksa zamanı gelen içeriği cihaz paylaşır (`account-contents.ts` `accountStep`, yoklamada en çok bir paylaşım).

**İşler sırayla**: agent işleri (akışların hesap adımları, otomatik paylaşım) cihazda tek sıradan koşar (`device.exclusive`); aynı akış üst üste çalışmaz.

**Yapay zekâ ile içerik üretimi** (`generateContents`): Bağlantılar ekranında hesabın "İçerik" penceresindeki (`AccountContents.tsx`; akıştan içerik eklenmez) "İçerik üret" hesabın `account.txt`iyle, bir içeriği örnek alarak ya da konudan, hesabın klasörüne yeni numaralı içerikler yazar: özgün bir paylaşım metni (`content.txt`), istenirse bir görsel (`image.png`) ve `pending` durumu. Metin ve görsel Share97 geçidiyle üretilir (bedeli krediden).

**Akışlar ekranı ve eşitleme**: akışlar sunucuda durur; uygulama onları hesaplarla birlikte dakikada bir ve **Eşitle** düğmesiyle okur (`accounts.syncAccounts` → `contents.syncContents`), klasörlerini kurar. Hesapta hiç akış yoksa bir kez örnek akış açılır (`POST /api/v1/worker/workflows`: durdurulmuş taslak, bu cihaza atanmış). Yeni akış cihazdaki hesaplara paylaşan yalın bir grafla açılır (her gün 09:00 → klasörden içerik → hesaplar; etiket eklenmez). Zamanlama (günler + saatler ya da her N saatte bir) ve paylaşılacak hesaplar ekrandan seçilir (`PATCH … {schedule, accountIds}`: sunucu grafa yazar). İçerik ekrandan eklenir (metin + dosya seçimi), düşen ya da takılan içerik yeniden sıraya alınır; `publishing`de 90 dakikadan uzun kalan içerik `failed`e çekilir; platforma uymayan ya da kesilecek içerik ve azalan içerik uyarılır; birden çok hesabın sonucu aynı notta birikir (kısmen paylaşıldı). Ekrandan akış yeniden adlandırılır, silinir (`PATCH` / `DELETE /api/v1/worker/workflows/<id>`; cihazdaki içerik klasörü durur), açılıp durdurulur, cihazı ve içerik ayarları (sıra, tekrar) seçilir. Adımlar sitenin düzenleyicisinde düzenlenir.

**Otomatik paylaşım** (`src/main/auto.ts`): ayar sitenin Ayarlar sayfasında (aralık, diller, konular). Yoklamada sıra boşsa tur sunucudan alınır (`POST /api/v1/worker/auto-content`, iki cihaz aynı turu alamaz); seçili her dil için bir paylaşım, hesaplara sırayla, konusu rastgele. Metin ve görsel Share97 geçidiyle yazılır (bedeli krediden), paylaşımı agent hesabın tarayıcısında yapar, sonuç `PUT /api/v1/worker/auto-content` ile sitedeki İçerikler'e yazılır. Paylaşımlar arası 30 dakika; sıra `auto.json`da, yeniden açılışta kaldığı yerden sürer.

**Sürekli çalışma** (Ayarlar > Hesap > Bilgisayar uyumasın, `src/main/power.ts`): Windows'un uyku, hazırda bekleme, ekran kapanması ve kapak eylemi `powercfg` ile kapatılır (isteğe bağlı pilde de), uygulama açılışta başlar. Önceki değerler `power.json`da saklanır, kapatınca geri yüklenir.

**Arka plan** (Ayarlar > Hesap): pencere kapanınca tepside çalışmaya devam eder, isteğe bağlı olarak bilgisayar açılınca gizli başlar; açıkken uyku engellenir. Tek kopya çalışır.

## Chrome eklentisi (`share97-chrome/`)

Manifest V3; kurulumla gelir, **Chrome** ekranındaki adımlarla "Paketlenmemiş öğe yükle" ile kurulur. Uygulama `127.0.0.1:17614`te dinler, her Chrome bir kez onaylanır. Agent o Chrome'un sekmelerini uygulamanın tarayıcıları gibi kullanır (Chrome DevTools Protocol).

## Sınırlar

- Agent sayfa arayüzüne bakarak çalışır; her platform canlı hesapla ayrıca denenmelidir.
- Doğrulama, captcha, hız sınırı ya da otomasyon uyarısında iş durur; aşılmaya çalışılmaz.
- Otomasyon bazı platformların kullanım şartlarına aykırı olabilir ve hesabı kısıtlatabilir.
- Akışlar yalnız uygulama açıkken çalışır; kapalıyken kaçan çalışma açılınca bir kez telafi edilir.
- Güncelleme `share97-com/share97-desktop` GitHub sürümlerinden okunur (`src/main/updater.ts`).

```
src/main/        ana süreç
  auth.ts        Share97 Connect, cihaz anahtarı, sunucu istekleri
  gateway.ts     yapay zekâ geçidi istemcisi (modeller, medya)
  accounts.ts    sosyal hesaplar: ekleme, giriş, gruplar, sunucuyla eşitleme
  device.ts      Worker döngüsü: eşitle, yokla, saati gelen akışı başlat
  runner.ts      akışları çalıştırır: grafı yürür, işi agent'a yaptırır, kaydı sunucuya yazar
  contents.ts    Akışların yerel içerik klasörleri ve akış eşitlemesi
  auto.ts        otomatik paylaşım turu
  power.ts       sürekli çalışma (Windows güç ayarları)
  agent/         LangChain agent, araçlar, sayfa kontrolü
  browsers.ts    tarayıcı profilleri ve sekmeler
  chrome/        eklenti köprüsü
src/shared/      tipler, platform tablosu, yerel içerik kuralları, akış motoru (workflow.ts)
src/renderer/    React arayüzü (Hallmark, Lumen teması: styles.css + tokens.css)
share97-chrome/  Chrome eklentisi
```

## MCP sunucusu

`src/main/mcp.ts`: uygulamanın bütün agent araçları (ve `ask_agent`) `http://127.0.0.1:<port>/mcp` adresinde (varsayılan port 9797, Streamable HTTP, `Authorization: Bearer <anahtar>`). `GET /` araç dökümanıdır (ad, açıklama, parametreler; anahtarsız, tarayıcıdan açılır). Uygulamadaki MCP ekranı (`Mcp.tsx`) aç/kapa, port, anahtar ve Claude Code, Codex, Claude Desktop, Cursor için hazır bağlanma ayarını verir.

Medya özgün boyutta paylaşılır: `upload_files` / `upload_account_content` sonucu özgün boyutu ve "kırpma ekranında Original seç" uyarısını taşır; `media_info` boyutu, `crop_image` görsel kırpmayı verir (`src/main/media.ts`). Video kırpma yok (ffmpeg taşınmıyor): platformun kendi kırpma denetimi kullanılır.
