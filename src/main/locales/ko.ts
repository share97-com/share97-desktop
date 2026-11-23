import type { Strings } from './tr.ts'

export const ko: Strings = {
  translate: '이 페이지 번역',
  incognito: '시크릿', newTab: "새 탭", reload: "새로고침", duplicate: "복제", unmute: "사이트 음소거 해제", mute: "사이트 음소거", close: "닫기", closeOthers: "다른 탭 닫기", reopen: "닫은 탭 다시 열기", openLink: "링크를 새 탭에서 열기", copyLink: "링크 주소 복사", openImage: "이미지를 새 탭에서 열기", saveImage: "이미지 저장", copyImage: "이미지 복사", undo: "실행 취소", redo: "다시 실행", cut: "잘라내기", copy: "복사", paste: "붙여넣기", selectAll: "모두 선택", search: "Google에서 검색:", back: "뒤로", forward: "앞으로", print: "인쇄…", inspect: "검사", permAllow: "허용", permDeny: "차단", permAsk: "다음 권한을 요청합니다:", permRemember: "선택한 내용은 이 브라우저의 이 사이트에 기억됩니다.", browser: "브라우저", approvalNeeded: "승인 필요", agentDone: "에이전트가 작업을 마쳤습니다.", agentFailed: "에이전트가 중지되었습니다", openInApp: "앱에서 링크 열기", openExternal: "시스템 브라우저에서 링크 열기", addWord: "사전에 추가", chatData: "채팅 데이터", quit: "종료",
  example: '예시 워크플로',
  sessionEnded: (handle: string) => `@${handle}: 세션이 종료되어 이 계정에서 워크플로를 실행할 수 없습니다. 클릭하여 다시 로그인하세요.`,
  started: '시작됨',
  noContent: (flow: string) => `"${flow}"에 공유할 콘텐츠가 남아 있지 않습니다. 폴더에 콘텐츠를 추가하거나 앱에서 생성하세요.`,
  alreadyQueued: '이미 대기열에서 기다리는 중이라 이번 실행은 추가되지 않았습니다',
  queued: (ahead: number) => `대기열에 추가됨 (앞에 ${ahead}건)`,
  offWhileQueued: '대기열에서 기다리는 동안 꺼져서 실행되지 않았습니다',
  runDone: '완료',
  runSkipped: '건너뜀',
  stoppedFromSite: '사이트에서 중지됨',
}
