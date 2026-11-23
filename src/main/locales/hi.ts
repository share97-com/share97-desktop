import type { Strings } from './tr.ts'

export const hi: Strings = {
  translate: 'इस पेज का अनुवाद करें',
  incognito: 'इनकॉग्निटो', newTab: "नया टैब", reload: "रीलोड", duplicate: "डुप्लिकेट", unmute: "साइट अनम्यूट करें", mute: "साइट म्यूट करें", close: "बंद करें", closeOthers: "अन्य टैब बंद करें", reopen: "बंद किया टैब फिर खोलें", openLink: "लिंक नए टैब में खोलें", copyLink: "लिंक का पता कॉपी करें", openImage: "इमेज नए टैब में खोलें", saveImage: "इमेज सहेजें", copyImage: "इमेज कॉपी करें", undo: "पूर्ववत करें", redo: "फिर से करें", cut: "कट करें", copy: "कॉपी करें", paste: "पेस्ट करें", selectAll: "सभी चुनें", search: "Google पर खोजें:", back: "पीछे", forward: "आगे", print: "प्रिंट करें…", inspect: "इंस्पेक्ट करें", permAllow: "अनुमति दें", permDeny: "ब्लॉक करें", permAsk: "अनुमति चाहता है:", permRemember: "यह चुनाव इस ब्राउज़र में इस साइट के लिए याद रखा जाता है।", browser: "ब्राउज़र", approvalNeeded: "मंज़ूरी ज़रूरी है", agentDone: "एजेंट ने काम पूरा किया।", agentFailed: "एजेंट रुक गया", openInApp: "लिंक ऐप में खोलें", openExternal: "लिंक सिस्टम ब्राउज़र में खोलें", addWord: "शब्दकोश में जोड़ें", chatData: "चैट डेटा", quit: "बाहर निकलें",
  example: 'उदाहरण वर्कफ़्लो',
  sessionEnded: (handle: string) => `@${handle}: सत्र समाप्त हो गया और वर्कफ़्लो इस खाते पर नहीं चल सका। दोबारा साइन इन करने के लिए क्लिक करें।`,
  started: 'शुरू हुआ',
  noContent: (flow: string) => `"${flow}" में साझा करने के लिए कोई कंटेंट नहीं बचा। उसके फ़ोल्डर में कंटेंट जोड़ें या ऐप में बनाएँ।`,
  alreadyQueued: 'पहले से कतार में प्रतीक्षा में है, यह रन नहीं जोड़ा गया',
  queued: (ahead: number) => `कतार में (${ahead} रन आगे)`,
  offWhileQueued: 'कतार में प्रतीक्षा के दौरान बंद कर दिया गया, चलाया नहीं गया',
  runDone: 'पूरा हुआ',
  runSkipped: 'छोड़ा गया',
  stoppedFromSite: 'साइट से रोका गया',
}
