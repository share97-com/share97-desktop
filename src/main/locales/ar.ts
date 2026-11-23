import type { Strings } from './tr.ts'

export const ar: Strings = {
  translate: 'ترجمة هذه الصفحة',
  incognito: 'تصفح خفي', newTab: "تبويب جديد", reload: "إعادة تحميل", duplicate: "تكرار", unmute: "إلغاء كتم الموقع", mute: "كتم الموقع", close: "إغلاق", closeOthers: "إغلاق التبويبات الأخرى", reopen: "إعادة فتح التبويب المغلق", openLink: "فتح الرابط في تبويب جديد", copyLink: "نسخ عنوان الرابط", openImage: "فتح الصورة في تبويب جديد", saveImage: "حفظ الصورة", copyImage: "نسخ الصورة", undo: "تراجع", redo: "إعادة", cut: "قص", copy: "نسخ", paste: "لصق", selectAll: "تحديد الكل", search: "البحث في Google عن", back: "رجوع", forward: "تقدّم", print: "طباعة…", inspect: "فحص", permAllow: "السماح", permDeny: "حظر", permAsk: "يطلب إذنًا لـ", permRemember: "يُحفظ الاختيار لهذا الموقع في هذا المتصفح.", browser: "المتصفح", approvalNeeded: "مطلوب موافقة", agentDone: "أنهى الوكيل عمله.", agentFailed: "توقف الوكيل", openInApp: "فتح الرابط في التطبيق", openExternal: "فتح الرابط في متصفح النظام", addWord: "إضافة إلى القاموس", chatData: "بيانات المحادثة", quit: "خروج",
  example: 'مسار عمل نموذجي',
  sessionEnded: (handle: string) => `@${handle}: انتهت الجلسة وتعذّر تشغيل مسار العمل على هذا الحساب. انقر لتسجيل الدخول مجددًا.`,
  started: 'بدأ',
  noContent: (flow: string) => `"${flow}" لم يبقَ فيه محتوى للمشاركة. أضف محتوى إلى مجلده أو أنشئه في التطبيق.`,
  alreadyQueued: 'ينتظر بالفعل في القائمة، لم يُضف هذا التشغيل',
  queued: (ahead: number) => `في القائمة (${ahead} تشغيل قبله)`,
  offWhileQueued: 'أُوقف أثناء الانتظار في القائمة، لم يُشغَّل',
  runDone: 'تم',
  runSkipped: 'تم تخطيه',
  stoppedFromSite: 'أُوقف من الموقع',
}
