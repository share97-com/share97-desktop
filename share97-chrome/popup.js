const tr = navigator.language.toLowerCase().startsWith('tr')
const T = tr
  ? {
      offline: ['Share97 Desktop bulunamadı', 'Share97 Desktop uygulamasını aç. Eklenti her 30 saniyede bir kendiliğinden bağlanmayı dener.'],
      connecting: ['Bağlanıyor…', 'Share97 Desktop uygulamasına bağlanılıyor.'],
      pending: ['Onay bekleniyor', 'Share97 Desktop uygulamasında Chrome ekranını aç ve bu Chrome\'u onayla.'],
      connected: ['Bağlı', 'Share97 Desktop bu Chrome\'un sekmelerini görebilir. Bu Chrome\'da giriş yaptığın sosyal medya hesaplarını uygulamanın Bağlantılar ekranından ekle: Worker\'lar ve akışlar işleri bu sekmelerde yapar.'],
      rejected: ['Reddedildi', 'Share97 Desktop bu bağlantıyı reddetti. Tekrar istemek için aşağıdaki düğmeye bas.'],
      retry: 'Tekrar bağlan',
      name: 'Bu Chrome\'un adı',
      save: 'Kaydet',
      saved: 'Kaydedildi.',
      nameHelp: 'Uygulamada ve agent\'ta bu adla görünür (ör. "İş Chrome", "Müşteri A").',
    }
  : {
      offline: ['Share97 Desktop not found', 'Open the Share97 Desktop app. The extension retries on its own every 30 seconds.'],
      connecting: ['Connecting…', 'Connecting to the Share97 Desktop app.'],
      pending: ['Waiting for approval', 'Open the Chrome screen in Share97 Desktop and approve this Chrome.'],
      connected: ['Connected', 'Share97 Desktop can see the tabs of this Chrome. Add the social media accounts you are signed in to here on the Connections screen of the app: workers and workflows then operate them in these tabs.'],
      rejected: ['Rejected', 'Share97 Desktop rejected this connection. Press the button below to ask again.'],
      retry: 'Connect again',
      name: 'Name of this Chrome',
      save: 'Save',
      saved: 'Saved.',
      nameHelp: 'The app and the agent show this Chrome under this name (e.g. "Work Chrome", "Client A").',
    }

const $ = (id) => document.getElementById(id)
$('nameLabel').textContent = T.name
$('save').textContent = T.save
$('nameHelp').textContent = T.nameHelp
$('retry').textContent = T.retry

function render(status = 'offline') {
  const [title, help] = T[status] ?? T.offline
  $('dot').className = `dot ${status}`
  $('title').textContent = title
  $('help').textContent = help
  $('retry').hidden = !['offline', 'rejected'].includes(status)
}

const { status } = await chrome.storage.session.get('status')
render(status)
chrome.storage.session.onChanged.addListener((c) => c.status && render(c.status.newValue))
const { name } = await chrome.storage.local.get('name')
$('name').value = name ?? ''

$('save').onclick = async () => {
  await chrome.runtime.sendMessage({ type: 'rename', name: $('name').value })
  $('nameHelp').textContent = T.saved
}
$('retry').onclick = () => chrome.runtime.sendMessage({ type: 'connect' })
