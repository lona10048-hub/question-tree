// ════════════════════════════════════════════════
// 개발진이 채우는 곳 (GitHub에서 이 파일의 연필 버튼을 눌러 고쳐요)
// ════════════════════════════════════════════════

// 서버 주소: 개발진이 Apps Script로 배포한 웹 앱 주소 (…/exec)
// 모든 선생님과 모둠 태블릿이 이 서버 하나를 함께 써요. 선생님은 따로 준비할 것이 없어요.
export const SERVER_URL = 'https://script.google.com/macros/s/AKfycbzbk-1Xtk-WhrQHTPhveh-GTTCCbxc1En8d2oTfngi4NlQLvm_iqZ9HmeLdcXeaZIJ1/exec';

// ════════════════════════════════════════════════

export const APP_NAME = '질문 룰렛 놀이';

// 서버 규칙 (서버 코드 gas/Code.gs의 TRIAL_TTL_MS, TRIAL_LIMIT과 같게 맞춰 두세요)
//  keepHours: 게임을 만든 뒤 질문까지 지워지기까지의 시간
//  gamesPerTeacher: 선생님(브라우저) 한 분이 한꺼번에 가질 수 있는 게임 수
export const SERVER_RULES = { keepHours: 24, gamesPerTeacher: 6 };

// 서버에 상태를 물어보는 간격 (밀리초). 여러 반이 함께 쓰니 너무 자주 묻지 않아요.
//  server: 실제 서버, local: 연습 모드(이 컴퓨터 안)
//  tabletWaitReveal: 룰렛이 끝나고 한 마디 바꾸기를 기다릴 때
export const POLL = {
  server: { teacher: 3000, tabletLobby: 2500, tabletPlay: 4000, tabletWaitReveal: 3000, tabletDone: 12000, hidden: 15000, items: 4000, itemsSlow: 15000 },
  local: { teacher: 2000, tabletLobby: 2000, tabletPlay: 2500, tabletWaitReveal: 2500, tabletDone: 8000, hidden: 10000, items: 3000, itemsSlow: 12000 },
};
