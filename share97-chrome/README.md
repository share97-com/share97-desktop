# Share97 for Chrome

This Chrome extension connects your own Google Chrome to the **Share97 Desktop** app. Social media accounts you are already signed in to in this Chrome can be added on the app's **Connections** screen (pick this Chrome as the place of the session); Share97 workers and server workflows then publish and work in this Chrome's tabs. The app also shows your Chrome windows, tabs and extensions, and its AI agent can work in your Chrome tabs exactly like in the app's own browsers: read pages, click, type, open and close tabs, take screenshots, save PDFs, search history, download files and turn extensions on or off.

## Install

1. In Share97 Desktop open **Chrome** in the sidebar and click **Install the extension**. Click **Open folder** (this folder) or **Copy path**.
2. In Chrome open `chrome://extensions` (the app's **Open the extensions page in Chrome** button does it for you).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick this `share97-chrome` folder.
5. Click the Share97 icon in the Chrome toolbar and give this Chrome a name, for example "Work Chrome".
6. In Share97 Desktop the Chrome appears as **Waiting for approval**. Click **Approve**.

Install it in every Chrome profile you want to use; each profile shows up in the app under its own name. To let the agent upload files into pages, open the extension's **Details** on `chrome://extensions` and turn on **Allow access to file URLs**.

## How it works

- The extension connects to `ws://127.0.0.1:17614`, only on this computer. The app accepts connections only from Chrome extensions, and each new extension has to be approved by you once.
- While the agent works in a tab, Chrome shows its debugging bar and the extension icon shows **AI** on that tab. The debugger detaches 30 seconds after the agent's last action.
- When the agent scans the screen (a screenshot read by a vision model), the tab shows a purple scanning frame and the icon shows **SCAN**; a pink ring marks the spot the agent is about to click.
- Files that start downloading while the agent works in a Chrome tab (also exports a site prepares for a few seconds first, like Google Ads) are moved into the app's workspace (`share97-desktop/downloads` in your user folder), opened and added to the chat data, and removed from Chrome's download list. The agent sees Chrome's own download history too and can copy one of your earlier downloads into the workspace; your original file stays where it is.
- The agent can also use Chrome's bookmarks, reopen closed tabs, pin tabs, open and close windows and open the print dialog.
- For the supported social platforms the extension can tell the app whether you are signed in (it checks that the session cookie exists; the cookie's value never leaves Chrome). That is why it asks for access to those sites.
- If the app is closed the extension retries every 30 seconds and reconnects on its own.
- When the app ships a newer version of this folder, the extension reloads itself.

## Türkçe

1. Share97 Desktop'ta kenar çubuğundan **Chrome** ekranını aç, **Eklentiyi kur** düğmesine bas, **Klasörü aç** ile bu klasörü aç.
2. Chrome'da `chrome://extensions` sayfasını aç, sağ üstten **Geliştirici modu**nu aç.
3. **Paketlenmemiş öğe yükle** ile bu `share97-chrome` klasörünü seç.
4. Araç çubuğundaki Share97 simgesine bas, bu Chrome'a bir ad ver.
5. Share97 Desktop'ta Chrome **Onay bekliyor** olarak görünür: **Onayla**.
6. Bu Chrome'da giriş yaptığın sosyal medya hesaplarını **Bağlantılar > Hesap ekle** ile ekle (oturum yeri olarak bu Chrome'u seç).
