import type { Strings } from './tr.ts'

export const ja: Strings = {
  translate: 'このページを翻訳',
  incognito: 'シークレット', newTab: "新しいタブ", reload: "再読み込み", duplicate: "複製", unmute: "サイトのミュートを解除", mute: "サイトをミュート", close: "閉じる", closeOthers: "他のタブを閉じる", reopen: "閉じたタブを開く", openLink: "リンクを新しいタブで開く", copyLink: "リンクのアドレスをコピー", openImage: "画像を新しいタブで開く", saveImage: "画像を保存", copyImage: "画像をコピー", undo: "元に戻す", redo: "やり直す", cut: "切り取り", copy: "コピー", paste: "貼り付け", selectAll: "すべて選択", search: "Google で検索:", back: "戻る", forward: "進む", print: "印刷…", inspect: "検証", permAllow: "許可", permDeny: "ブロック", permAsk: "次の許可を求めています:", permRemember: "選択内容は、このブラウザのこのサイトで記憶されます。", browser: "ブラウザ", approvalNeeded: "承認が必要です", agentDone: "エージェントが作業を終えました。", agentFailed: "エージェントが停止しました", openInApp: "アプリでリンクを開く", openExternal: "システムのブラウザでリンクを開く", addWord: "辞書に追加", chatData: "チャットデータ", quit: "終了",
  example: 'サンプルワークフロー',
  sessionEnded: (handle: string) => `@${handle}: セッションが終了したため、このアカウントでワークフローを実行できませんでした。クリックして再ログインしてください。`,
  started: '開始しました',
  noContent: (flow: string) => `「${flow}」には共有するコンテンツが残っていません。フォルダーにコンテンツを追加するか、アプリで生成してください。`,
  alreadyQueued: 'すでにキューで待機中のため、今回の実行は追加されませんでした',
  queued: (ahead: number) => `キューに追加しました（前に ${ahead} 件）`,
  offWhileQueued: 'キューで待機中にオフになったため、実行されませんでした',
  runDone: '完了',
  runSkipped: 'スキップ',
  stoppedFromSite: 'サイトから停止されました',
}
