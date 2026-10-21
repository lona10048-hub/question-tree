/**
 * 질문하는 힘 기르기 · 구글 시트 서버 코드 (Google Apps Script)
 *  - 1차시 질문 기차 게임, 2차시 질문 룰렛 놀이, 3차시 질문 나무를 이 코드 하나로 함께 써요.
 *
 * 이 코드 하나로 두 가지 서버를 만들 수 있어요.
 *  ■ 내 구글 시트 (기본): 선생님 한 명이 자기 반 수업에 써요. 선생님 비밀번호로 지켜요.
 *      질문 기록은 선생님이 지우기 전까지 '질문 기록' 탭에 남아요.
 *  ■ 체험 서버: 개발진이 한 번 배포해 두고, 여러 선생님이 아무 설정 없이 써 봐요.
 *      편집기에서 setupTrialServer 함수를 한 번 실행하면 체험 서버가 돼요.
 *      선생님마다 브라우저에 자동으로 생기는 열쇠로 자기 게임만 다루고, 기록은 하루 뒤 지워져요.
 *
 * 내 구글 시트 만들기 (사본 만들기 링크를 쓰지 않을 때)
 *  1. 구글 시트를 새로 만들고 [확장 프로그램 → Apps Script]를 열어요.
 *  2. 원래 내용을 모두 지우고 이 파일 내용을 붙여 넣은 뒤 저장해요.
 *  3. [배포 → 새 배포 → 웹 앱] (실행: 나 / 액세스 권한: 모든 사용자) → [액세스 승인]
 *  4. 웹 앱 URL(…/exec)을 게임 사이트의 '선생님 설정' 화면에 붙여 넣어요.
 *
 * 편집기에서 직접 실행하는 함수
 *  - setup               : 시트 탭을 만들어요. (사본 시트에는 이미 있어서 안 해도 돼요)
 *  - setupTemplate       : [개발진] 선생님들이 복사해 갈 '사본용 원본 시트'를 준비해요. 이 시트는 배포하지 마세요.
 *  - setupTrialServer    : [개발진] 이 시트를 '체험 서버'로 바꿔요. 사본용 원본 시트에서는 실행하지 마세요.
 *  - resetTeacherPassword: 선생님 비밀번호를 잊었을 때 지워요.
 *
 * 이 스크립트는 연결된 이 시트 한 개에만 접근해요.
 * @OnlyCurrentDoc
 */

var APP_VERSION = '1.3.1'; // 1.2.0: 2차시 질문 룰렛 놀이 추가 · 1.3.0: 3차시 질문 나무 추가 · 1.3.1: 3차시 제한 시간 없음
var Q_SHEET = '질문 기록';
var P_SHEET = '사진 저장소';
var G_SHEET = '처음 안내';
var Q_HEAD = ['게임 코드', '판', '모둠', '칸', '질문', '쓴 사람', '붙인 시각', '사진', '저장 시각'];
var P_HEAD = ['게임 코드', '조각', '내용'];
var GAME_TTL_MS = 7 * 24 * 3600 * 1000; // 내 구글 시트: 게임 진행 정보는 7일 뒤 정리 (질문 기록은 남김)
var TRIAL_TTL_MS = 24 * 3600 * 1000; // 체험 서버: 게임과 질문 기록 모두 하루 뒤 지움
var TRIAL_LIMIT = { gamesPerTeacher: 6, gamesTotal: 150 };
var START_LEAD_MS = 5000; // 시작 버튼을 누르고 실제로 출발하기까지 (모든 태블릿이 같은 순간에 출발하도록)
var RESUME_LEAD_MS = 4500; // 잠깐 멈춤 뒤 다시 출발하기까지
var CHUNK_SIZE = 45000; // 시트 칸 하나에 넣을 사진 조각 크기 (칸 하나는 5만 글자까지)
var MAX_PHOTO_CHARS = 1400000;
var CACHE_SEC = 21600; // 캐시는 6시간까지
var CLEANUP_EVERY_MS = 15 * 60 * 1000;
var TIME_ZONE = 'Asia/Seoul'; // 시트에 적는 시각의 기준 (한국 시간)
var LIMIT = { groupsMin: 2, groupsMax: 8, members: 8, name: 8, text: 100, cars: 200 };

// ════════════════════════════════════════════════
// 편집기에서 직접 실행하는 함수
// ════════════════════════════════════════════════

/** 시트 탭('질문 기록', '사진 저장소')을 만들어요. */
function setup() {
  ensureSheets();
  Logger.log('준비 완료! 이제 [배포 → 새 배포 → 웹 앱]으로 배포해 주세요.');
}

/** [개발진] 선생님들이 '사본 만들기'로 복사해 갈 원본 시트를 준비해요. */
function setupTemplate() {
  if (isShared()) {
    Logger.log('이 시트는 체험 서버예요. 사본용 원본은 새 구글 시트를 하나 더 만들어 준비해 주세요. (체험 서버를 복사하면 다른 학교 기록까지 복사돼요)');
    return;
  }
  // 사본에 따라가지 않도록 원본에 남은 비밀번호와 게임 정보를 비운다 (사본용 원본에서만 실행하세요)
  var p = props();
  p.deleteProperty('teacherPw');
  cacheDel('teacherPw');
  p.getKeys().forEach(function (k) {
    if (k.indexOf('game:') === 0 || k.indexOf('r2:') === 0 || k.indexOf('r3:') === 0) {
      p.deleteProperty(k);
      cacheDel(k);
    }
  });
  ensureSheets();
  ensureGuideSheet();
  Logger.log(
    '사본용 원본 준비 완료! 이 시트는 배포하지 마세요.\n' +
      '[공유 → 일반 액세스: 링크가 있는 모든 사용자 · 뷰어]로 바꾸고, 시트 주소의 /edit 뒤를 지우고 /copy 로 바꾼 주소를 ' +
      '게임 사이트 js/config.js의 TEMPLATE_COPY_URL에 넣어 주세요.'
  );
}

/** [개발진] 이 시트를 여러 선생님이 함께 쓰는 '체험 서버'로 바꿔요. */
function setupTrialServer() {
  props().setProperty('serverMode', 'shared');
  cachePut('serverMode', 'shared');
  ensureSheets();
  Logger.log(
    '체험 서버로 바꿨어요.\n' +
      '이제 [배포 → 새 배포 → 웹 앱] (실행: 나 / 액세스 권한: 모든 사용자)으로 배포하고, ' +
      '웹 앱 URL을 각 차시 사이트 js/config.js의 서버 주소(2·3차시 SERVER_URL, 1차시 TRIAL_GAS_URL)에 넣어 주세요.\n' +
      '코드를 고친 뒤에는 [배포 → 배포 관리 → 수정(연필) → 버전: 새 버전 → 배포]로 같은 주소를 유지해요.'
  );
}

/** 선생님 비밀번호를 잊었을 때 실행: 비밀번호를 지우면 선생님 설정 화면에서 새로 정할 수 있어요. */
function resetTeacherPassword() {
  props().deleteProperty('teacherPw');
  cacheDel('teacherPw');
  Logger.log('선생님 비밀번호를 지웠어요. 게임 사이트의 선생님 설정에서 새 비밀번호를 정해 주세요.');
}

// ════════════════════════════════════════════════
// 웹 앱 입구
// ════════════════════════════════════════════════

function doGet(e) {
  return respond({
    ok: true,
    app: 'question-train-game',
    version: APP_VERSION,
    shared: isShared(),
    now: Date.now(),
    message: isShared()
      ? '질문하는 힘 기르기 서버(1·2·3차시)가 잘 동작하고 있어요.'
      : '질문 기차 게임 서버가 잘 동작하고 있어요. 이 주소를 게임 사이트의 선생님 설정 화면에 붙여 넣어 주세요.',
  });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return respond({ ok: false, error: 'BAD_REQUEST', now: Date.now() });
  }
  return respond(handle(body));
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// 이름: [처리 함수, 선생님 확인 필요 여부, 한 번에 하나씩 처리(잠금) 필요 여부]
var ACTIONS = {
  hello: [act_hello, false, false],
  claim: [act_claim, false, true],
  createGame: [act_createGame, true, true],
  listGames: [act_listGames, true, false],
  teacherView: [act_teacherView, true, false],
  start: [act_start, true, true],
  pause: [act_pause, true, true],
  resume: [act_resume, true, true],
  end: [act_end, true, true],
  reveal: [act_reveal, true, true],
  playAgain: [act_playAgain, true, true],
  releaseGroup: [act_releaseGroup, true, true],
  deleteCar: [act_deleteCar, true, true],
  deleteGame: [act_deleteGame, true, true],
  cleanup: [act_cleanup, true, true],
  info: [act_info, false, false],
  photo: [act_photo, false, false],
  join: [act_join, false, true],
  leave: [act_leave, false, true],
  poll: [act_poll, false, false],
  submit: [act_submit, false, true],
  results: [act_results, false, false],
};

function handle(body) {
  var name = String((body && body.action) || '');
  var entry = ACTIONS.hasOwnProperty(name) ? ACTIONS[name] : null;
  if (!entry) return { ok: false, error: 'UNKNOWN_ACTION', now: Date.now() };
  try {
    if (entry[1]) authTeacher(body);
    var res = entry[2] ? withLock(function () { return entry[0](body); }) : entry[0](body);
    res = res || {};
    if (res.ok === undefined) res.ok = true;
    res.now = Date.now();
    return res;
  } catch (err) {
    var msg = String((err && err.message) || err);
    var code = (err && err.code) || (/too many times|simultaneous|quota|한도|너무 많/i.test(msg) ? 'BUSY' : 'SERVER_ERROR');
    return { ok: false, error: code, message: msg, now: Date.now() };
  }
}

function fail(code, message) {
  var e = new Error(message || code);
  e.code = code;
  throw e;
}

function withLock(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) fail('BUSY');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ════════════════════════════════════════════════
// 저장 도우미
// ════════════════════════════════════════════════

function props() {
  return PropertiesService.getScriptProperties();
}

// 캐시: 자주 읽는 게임 정보를 빠르게 꺼내고, 스크립트 속성 읽기 한도(하루 5만 번)를 아낀다.
function cache() {
  return CacheService.getScriptCache();
}

function cacheGet(k) {
  try {
    return cache().get(k);
  } catch (e) {
    return null;
  }
}

function cachePut(k, v, sec) {
  try {
    cache().put(k, v, sec || CACHE_SEC);
    return true;
  } catch (e) {
    cacheDel(k);
    return false;
  }
}

function cacheDel(k) {
  try {
    cache().remove(k);
  } catch (e) {}
}

// 이 서버가 체험 서버인지 (setupTrialServer를 실행했는지)
function isShared() {
  var c = cacheGet('serverMode');
  if (c) return c === 'shared';
  var v = props().getProperty('serverMode') || 'own';
  cachePut('serverMode', v);
  return v === 'shared';
}

function teacherPw() {
  var c = cacheGet('teacherPw');
  if (c) return c === '-' ? '' : c;
  var v = props().getProperty('teacherPw') || '';
  cachePut('teacherPw', v || '-');
  return v;
}

function checkTeacher(pw) {
  var saved = teacherPw();
  return !!saved && String(pw || '') === saved;
}

// 체험 서버에서 선생님을 알아보는 열쇠 (브라우저마다 자동으로 만들어짐)
function keyOf(b) {
  var k = String((b && b.tk) || '');
  return /^[A-Za-z0-9_-]{16,64}$/.test(k) ? k : '';
}

function authTeacher(b) {
  if (isShared()) {
    if (!keyOf(b)) fail('NO_KEY');
    return;
  }
  if (!checkTeacher(b.pw)) fail('WRONG_PASSWORD');
}

function isTeacherFor(b, g) {
  if (isShared()) return !!keyOf(b) && g.owner === keyOf(b);
  return checkTeacher(b.pw);
}

// 선생님 기능: 체험 서버에서는 자기가 만든 게임만 다룰 수 있다.
function teacherGame(b, fresh) {
  var g = mustGame(b.code, fresh);
  if (isShared() && g.owner !== keyOf(b)) fail('NOT_OWNER');
  return g;
}

function cleanCode(c) {
  c = String(c || '').replace(/\D/g, '');
  if (!/^\d{4}$/.test(c)) fail('BAD_CODE');
  return c;
}

// fresh: 잠금 안에서 바꾸기 전에는 캐시가 아닌 원본(스크립트 속성)을 읽는다.
function loadGame(code, fresh) {
  var key = 'game:' + code;
  var s = fresh ? null : cacheGet(key);
  if (!s) {
    s = props().getProperty(key);
    if (s) cachePut(key, s);
  }
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
}

function mustGame(code, fresh) {
  var g = loadGame(cleanCode(code), fresh);
  if (!g) fail('NO_GAME');
  return g;
}

function saveGame(g) {
  var s = JSON.stringify(g);
  props().setProperty('game:' + g.code, s);
  cachePut('game:' + g.code, s);
}

function allGames() {
  var all = props().getProperties();
  var out = [];
  for (var k in all) {
    if (!all.hasOwnProperty(k) || k.indexOf('game:') !== 0) continue;
    try {
      out.push(JSON.parse(all[k]));
    } catch (e) {
      out.push({ code: k.slice(5), broken: true });
    }
  }
  return out;
}

// 질문 기록에 이미 쓰인 코드는 다시 쓰지 않는다 (예전 기록이 새 게임 결과에 섞이지 않도록)
function usedCodes() {
  var used = {};
  [qSheet(), r2Sheet(), r3Sheet()].forEach(function (sh) {
    var last = sh.getLastRow();
    if (last >= 2) {
      sh.getRange(2, 1, last - 1, 1)
        .getValues()
        .forEach(function (r) {
          used[String(r[0])] = true;
        });
    }
  });
  return used;
}

function newCode() {
  var p = props();
  var used = usedCodes();
  for (var i = 0; i < 120; i++) {
    var c = String(1000 + Math.floor(Math.random() * 9000));
    if (!used[c] && !p.getProperty('game:' + c) && !p.getProperty('r2:' + c) && !p.getProperty('r3:' + c)) return c;
  }
  fail('NO_CODE');
}

function clampInt(v, min, max, dflt) {
  var n = Math.round(Number(v));
  if (!isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}

function cleanGroup(v, g) {
  var n = Math.round(Number(v));
  if (!isFinite(n) || n < 1 || n > g.groupCount) fail('BAD_GROUP');
  return String(n);
}

function cleanText(s, max) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanNames(list) {
  if (!Array.isArray(list)) fail('BAD_NAMES');
  var out = [];
  for (var i = 0; i < list.length && out.length < LIMIT.members; i++) {
    var n = cleanText(list[i], LIMIT.name);
    if (n) out.push(n);
  }
  if (!out.length) fail('BAD_NAMES');
  return out;
}

function cleanCars(list) {
  if (!Array.isArray(list)) fail('BAD_CARS');
  var out = [];
  for (var i = 0; i < list.length && out.length < LIMIT.cars; i++) {
    var c = list[i] || {};
    var text = cleanText(c.text, LIMIT.text);
    if (!text) continue;
    out.push({ no: out.length + 1, text: text, name: cleanText(c.name, LIMIT.name + 4), at: Number(c.at) || Date.now() });
  }
  return out;
}

// 시트가 글자를 수식·날짜·숫자로 바꾸지 않도록 앞에 '를 붙인다. (시트에는 '가 보이지 않아요)
function asText(s) {
  return "'" + String(s === null || s === undefined ? '' : s);
}

function fmtTime(ms) {
  return Utilities.formatDate(new Date(ms), TIME_ZONE, 'yyyy-MM-dd HH:mm:ss');
}

// 진행 중인데 마감 시각이 지났으면 끝난 것으로 본다.
function effective(g, now) {
  if (g.status === 'playing' && g.endsAt && now >= g.endsAt) return { status: 'ended', endedAt: g.endsAt };
  return { status: g.status, endedAt: g.endedAt || null };
}

function publicGame(g, now) {
  var e = effective(g, now);
  var groups = {};
  for (var k in g.groups) {
    if (g.groups.hasOwnProperty(k)) groups[k] = { names: g.groups[k].names, joinedAt: g.groups[k].joinedAt };
  }
  return {
    code: g.code,
    groupCount: g.groupCount,
    durationSec: g.durationSec,
    dupMode: g.dupMode,
    photo: g.photo,
    photoTitle: g.photoTitle || '',
    round: g.round,
    createdAt: g.createdAt,
    expiresAt: g.expiresAt,
    status: e.status,
    startedAt: g.startedAt || null,
    goAt: g.goAt || null,
    endsAt: g.endsAt || null,
    remainingMs: g.remainingMs === null || g.remainingMs === undefined ? null : g.remainingMs,
    endedAt: e.endedAt,
    revealedAt: g.revealedAt || null,
    updatedAt: g.updatedAt,
    groups: groups,
    subs: g.subs || {},
    shared: isShared(),
  };
}

// ── 시트 ─────────────────────────────────────────────

function ss() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheetUrl() {
  if (isShared()) return ''; // 체험 서버 시트 주소는 알려 주지 않는다
  try {
    return ss().getUrl();
  } catch (e) {
    return '';
  }
}

function ensureSheets() {
  var book = ss();
  var q = book.getSheetByName(Q_SHEET);
  if (!q) {
    q = book.insertSheet(Q_SHEET);
    q.getRange(1, 1, 1, Q_HEAD.length).setValues([Q_HEAD]).setFontWeight('bold').setBackground('#fcf1cc');
    q.setFrozenRows(1);
    q.setColumnWidth(5, 380);
    q.setColumnWidth(7, 150);
    q.setColumnWidth(8, 160);
    q.setColumnWidth(9, 150);
  }
  ensureR2Sheet(book);
  ensureR3Sheet(book);
  var p = book.getSheetByName(P_SHEET);
  if (!p) {
    p = book.insertSheet(P_SHEET);
    p.getRange(1, 1, 1, P_HEAD.length).setValues([P_HEAD]).setFontWeight('bold');
    p.setFrozenRows(1);
    p.hideSheet();
  }
  return { q: q, p: p };
}

// 사본을 만든 선생님이 시트를 열면 가장 먼저 보는 안내 탭
function ensureGuideSheet() {
  var book = ss();
  var g = book.getSheetByName(G_SHEET) || book.insertSheet(G_SHEET, 0);
  var rows = [
    ['질문 기차 게임 · 내 구글 시트', ''],
    ['', ''],
    ['이 시트가 우리 반 질문 기차 게임의 서버예요. 처음 한 번만 아래 순서대로 해 주세요.', ''],
    ['1', '위쪽 메뉴에서 [확장 프로그램 → Apps Script]를 눌러요. 새 창에 코드 편집기가 열려요. (코드는 이미 들어 있어요)'],
    ['2', '오른쪽 위 [배포 → 새 배포]를 누르고, "유형 선택" 옆 톱니바퀴에서 [웹 앱]을 골라요.'],
    ['3', '다음 사용자 인증 정보로 실행: 나 / 액세스 권한이 있는 사용자: 모든 사용자 로 정하고 [배포]를 눌러요.'],
    ['4', '[액세스 승인] → 내 계정 → "Google에서 확인하지 않은 앱"이 나오면 [고급] → [질문 기차 서버(으)로 이동] → [허용]을 눌러요.'],
    ['5', '화면에 나온 웹 앱 URL(…/exec로 끝나요)을 복사해서 게임 사이트 [선생님 설정]에 붙여 넣고 비밀번호를 정해요.'],
    ['', ''],
    ['알아 두세요', ''],
    ['•', '「질문 기록」 탭에 학생 질문이 쌓여요. 탭 이름과 열 순서는 바꾸지 마세요. 필요 없는 줄은 지워도 괜찮아요.'],
    ['•', '「2차시 질문 모음」 탭에는 2차시 질문 룰렛 놀이에서 만든 질문과 한 마디 바꾼 질문이 쌓여요.'],
    ['•', '「3차시 질문 나무」 탭에는 3차시 질문 나무 활동의 질문과 놓은 자리(가지·기둥·뿌리·바구니)가 쌓여요.'],
    ['•', '「사진 저장소」 탭은 숨겨져 있어요. 선생님이 올린 사진이 들어가고, 게임을 정리하면 지워져요.'],
    ['•', '코드를 새 버전으로 바꿀 때는 [배포 → 배포 관리 → 연필(수정) → 버전: 새 버전 → 배포]를 눌러요. 주소가 바뀌지 않아요.'],
    ['•', '경고 화면은 직접 만든 코드라서 나오는 거예요. 이 코드는 이 시트 하나에만 접근해요.'],
  ];
  g.getRange(1, 1, rows.length, 2).setValues(rows);
  g.getRange(1, 1).setFontSize(18).setFontWeight('bold');
  g.getRange(10, 1).setFontWeight('bold');
  g.setColumnWidth(1, 60);
  g.setColumnWidth(2, 900);
  return g;
}

function qSheet() {
  return ss().getSheetByName(Q_SHEET) || ensureSheets().q;
}

function pSheet() {
  return ss().getSheetByName(P_SHEET) || ensureSheets().p;
}

function readQRows(sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, Q_HEAD.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var v = vals[i];
    out.push({
      row: i + 2,
      code: String(v[0]),
      round: Number(v[1]),
      group: String(Number(v[2])),
      no: Number(v[3]),
      text: String(v[4]),
      name: String(v[5]),
      time: v[6] instanceof Date ? fmtTime(v[6].getTime()) : String(v[6]),
    });
  }
  return out;
}

// 이어진 줄 묶음을 아래쪽부터 지운다.
function deleteRowList(sh, rows) {
  rows = rows.slice().sort(function (a, b) { return b - a; });
  var i = 0;
  while (i < rows.length) {
    var end = rows[i];
    var start = end;
    while (i + 1 < rows.length && rows[i + 1] === start - 1) {
      i++;
      start = rows[i];
    }
    sh.deleteRows(start, end - start + 1);
    i++;
  }
}

// replace: 같은 모둠이 같은 판에 다시 보낸 경우에만 예전 줄을 찾아 지운다 (처음 보낼 때는 시트를 읽지 않음)
function writeCars(g, round, group, cars, now, replace) {
  var sh = qSheet();
  if (replace) {
    var old = readQRows(sh)
      .filter(function (r) { return r.code === g.code && r.round === round && r.group === group; })
      .map(function (r) { return r.row; });
    if (old.length) deleteRowList(sh, old);
  }
  if (!cars.length) return;
  var stamp = asText(fmtTime(now));
  var photo = asText(g.photoTitle || (g.photo && g.photo.kind === 'upload' ? '선생님이 올린 사진' : ''));
  var rows = cars.map(function (c) {
    return [Number(g.code), round, Number(group), c.no, asText(c.text), asText(c.name), asText(fmtTime(c.at)), photo, stamp];
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, Q_HEAD.length).setValues(rows);
}

function resKey(g) {
  return 'res:' + g.code + ':' + g.round;
}

function forgetResults(g) {
  cacheDel(resKey(g));
}

// 결과: 시트를 매번 읽지 않도록 캐시에 담아 둔다 (기차가 도착하거나 칸을 지우면 새로 만든다)
function collectResults(g) {
  var hit = cacheGet(resKey(g));
  if (hit) {
    try {
      return JSON.parse(hit);
    } catch (e) {}
  }
  var rows = readQRows(qSheet()).filter(function (r) { return r.code === g.code && r.round === g.round; });
  var out = {};
  for (var k in g.groups) {
    if (g.groups.hasOwnProperty(k)) out[k] = { names: g.groups[k].names, cars: [] };
  }
  rows.forEach(function (r) {
    if (!out[r.group]) out[r.group] = { names: [], cars: [] };
    out[r.group].cars.push({ no: r.no, text: r.text, name: r.name, time: r.time });
  });
  for (var key in out) {
    if (out.hasOwnProperty(key)) out[key].cars.sort(function (a, b) { return a.no - b.no; });
  }
  cachePut(resKey(g), JSON.stringify(out), 1800);
  return out;
}

function deleteQuestionRows(codes) {
  var set = {};
  (Array.isArray(codes) ? codes : [codes]).forEach(function (c) { set[String(c)] = true; });
  var sh = qSheet();
  var rows = readQRows(sh).filter(function (r) { return set[r.code]; }).map(function (r) { return r.row; });
  if (rows.length) deleteRowList(sh, rows);
}

// ── 사진 ─────────────────────────────────────────────

function savePhoto(code, data) {
  var sh = pSheet();
  var rows = [];
  for (var i = 0, part = 0; i < data.length; i += CHUNK_SIZE, part++) {
    // 조각 앞에 b를 붙여 시트가 + 나 / 로 시작하는 글을 수식으로 읽지 않게 한다.
    rows.push([Number(code), part, 'b' + data.slice(i, i + CHUNK_SIZE)]);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, P_HEAD.length).setValues(rows);
}

function photoRows(code) {
  var sh = pSheet();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, P_HEAD.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === code) out.push({ row: i + 2, part: Number(vals[i][1]), data: String(vals[i][2]) });
  }
  return out;
}

function loadPhoto(code) {
  var parts = photoRows(code).sort(function (a, b) { return a.part - b.part; });
  return parts.map(function (p) { return p.data.charAt(0) === 'b' ? p.data.slice(1) : p.data; }).join('');
}

function deletePhoto(code) {
  var rows = photoRows(code).map(function (r) { return r.row; });
  if (rows.length) deleteRowList(pSheet(), rows);
}

// 게임 하나를 지운다 (진행 정보, 캐시, 사진)
function removeGame(code, g) {
  props().deleteProperty('game:' + code);
  cacheDel('game:' + code);
  for (var r = 1; g && r <= (Number(g.round) || 1); r++) cacheDel('res:' + code + ':' + r);
  if (!g || !g.photo || g.photo.kind === 'upload') deletePhoto(code);
}

// ── 태블릿 연결 표시 (캐시: 6시간 뒤 저절로 사라짐) ───────

function touchSeen(code, group, now) {
  cachePut('seen:' + code + ':' + group, String(now), CACHE_SEC);
}

function seenMap(g) {
  var keys = [];
  for (var i = 1; i <= g.groupCount; i++) keys.push('seen:' + g.code + ':' + i);
  var out = {};
  try {
    var got = cache().getAll(keys) || {};
    for (var j = 1; j <= g.groupCount; j++) {
      var v = got['seen:' + g.code + ':' + j];
      if (v) out[j] = Number(v);
    }
  } catch (e) {}
  return out;
}

// ── 정리 ─────────────────────────────────────────────

// 기한이 지난 게임을 지운다.
//  - 내 구글 시트: 진행 정보와 사진만 지우고 질문 기록은 남긴다.
//  - 체험 서버: 질문 기록까지 모두 지운다. (주인 없는 질문 기록도 함께 지움)
function cleanupExpired(now) {
  var shared = isShared();
  var removed = [];
  var alive = {};
  allGames().forEach(function (g) {
    if (g.broken || (g.expiresAt && now > g.expiresAt)) {
      removeGame(g.code, g.broken ? null : g);
      removed.push(g.code);
    } else alive[g.code] = true;
  });
  if (shared) {
    var sh = qSheet();
    var orphan = readQRows(sh)
      .filter(function (r) { return !alive[r.code]; })
      .map(function (r) { return r.row; });
    if (orphan.length) deleteRowList(sh, orphan);
  }
  removed = removed.concat(r2CleanupExpired(now, shared));
  removed = removed.concat(r3CleanupExpired(now, shared));
  cachePut('cleanupAt', String(now), CACHE_SEC);
  return removed;
}

function maybeCleanup(now) {
  var last = Number(cacheGet('cleanupAt') || 0);
  if (now - last < CLEANUP_EVERY_MS) return [];
  return cleanupExpired(now);
}

// ════════════════════════════════════════════════
// 선생님 기능
// ════════════════════════════════════════════════

function act_hello() {
  var shared = isShared();
  return { claimed: shared ? false : !!teacherPw(), shared: shared, version: APP_VERSION };
}

// 처음 연결할 때 선생님 비밀번호를 정하고, 다른 컴퓨터에서는 같은 비밀번호로 연결한다.
function act_claim(b) {
  if (isShared()) fail('SHARED_SERVER');
  var pw = String(b.pw || '');
  var saved = props().getProperty('teacherPw');
  if (!saved) {
    if (pw.length < 4 || pw.length > 30) fail('BAD_PASSWORD');
    props().setProperty('teacherPw', pw);
    cachePut('teacherPw', pw);
    ensureSheets();
    return { created: true, sheetUrl: sheetUrl(), version: APP_VERSION };
  }
  if (saved !== pw) fail('WRONG_PASSWORD');
  ensureSheets();
  return { created: false, sheetUrl: sheetUrl(), version: APP_VERSION };
}

function act_createGame(b) {
  var s = b.settings || {};
  var now = Date.now();
  var shared = isShared();
  if (shared) {
    maybeCleanup(now);
    var mine = 0;
    var games = allGames();
    games.forEach(function (g) {
      if (g.owner === keyOf(b) && !(g.expiresAt && now > g.expiresAt)) mine++;
    });
    if (mine >= TRIAL_LIMIT.gamesPerTeacher) fail('TOO_MANY_GAMES');
    if (games.length + r2All().length + r3All().length >= TRIAL_LIMIT.gamesTotal) fail('SERVER_FULL');
  }
  var photo = s.photo && s.photo.kind === 'upload' ? { kind: 'upload' } : { kind: 'sample', id: cleanText((s.photo && s.photo.id) || 'bus-stop', 40) };
  if (photo.kind === 'upload') {
    var data = String(b.imageData || '');
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(data)) fail('BAD_PHOTO');
    if (data.length > MAX_PHOTO_CHARS) fail('PHOTO_TOO_BIG');
  }
  var code = newCode();
  var game = {
    code: code,
    owner: keyOf(b),
    groupCount: clampInt(s.groupCount, LIMIT.groupsMin, LIMIT.groupsMax, 6),
    durationSec: clampInt(s.durationSec, 60, 1800, 420),
    dupMode: s.dupMode === 'similar' ? 'similar' : 'same',
    photo: photo,
    photoTitle: cleanText(s.photoTitle, 40),
    createdAt: now,
    expiresAt: now + (shared ? TRIAL_TTL_MS : GAME_TTL_MS),
    round: 1,
    status: 'lobby',
    startedAt: null,
    goAt: null,
    endsAt: null,
    remainingMs: null,
    endedAt: null,
    revealedAt: null,
    updatedAt: now,
    groups: {},
    subs: {},
  };
  if (photo.kind === 'upload') savePhoto(code, String(b.imageData));
  saveGame(game);
  return { code: code, game: publicGame(game, now) };
}

function act_listGames(b) {
  var now = Date.now();
  var shared = isShared();
  var out = [];
  allGames().forEach(function (g) {
    if (g.broken) return;
    if (shared && g.owner !== keyOf(b)) return;
    if (shared && g.expiresAt && now > g.expiresAt) return;
    out.push({
      code: g.code,
      status: effective(g, now).status,
      revealed: !!g.revealedAt,
      round: g.round,
      createdAt: g.createdAt,
      expiresAt: g.expiresAt,
      groupCount: g.groupCount,
      joined: Object.keys(g.groups || {}).length,
      photoTitle: g.photoTitle || '',
    });
  });
  out.sort(function (a, b2) { return b2.createdAt - a.createdAt; });
  return { games: out, sheetUrl: sheetUrl(), shared: shared };
}

function act_teacherView(b) {
  var g = teacherGame(b);
  return { game: publicGame(g, Date.now()), seen: seenMap(g) };
}

function act_start(b) {
  var g = teacherGame(b, true);
  var now = Date.now();
  if (g.status === 'lobby') {
    if (!Object.keys(g.groups || {}).length) fail('NO_GROUPS');
    g.status = 'playing';
    g.goAt = now + START_LEAD_MS;
    g.startedAt = g.goAt;
    g.endsAt = g.goAt + g.durationSec * 1000;
    g.remainingMs = null;
    g.endedAt = null;
    g.revealedAt = null;
    g.subs = {};
    g.updatedAt = now;
    saveGame(g);
  }
  return { game: publicGame(g, now) };
}

function act_pause(b) {
  var g = teacherGame(b, true);
  var now = Date.now();
  if (effective(g, now).status === 'playing') {
    g.status = 'paused';
    g.remainingMs = Math.max(0, g.endsAt - Math.max(now, g.goAt || now));
    g.updatedAt = now;
    saveGame(g);
  }
  return { game: publicGame(g, now) };
}

function act_resume(b) {
  var g = teacherGame(b, true);
  var now = Date.now();
  if (g.status === 'paused') {
    g.status = 'playing';
    g.goAt = now + RESUME_LEAD_MS;
    g.endsAt = g.goAt + Math.max(1000, Number(g.remainingMs) || 0);
    g.remainingMs = null;
    g.updatedAt = now;
    saveGame(g);
  }
  return { game: publicGame(g, now) };
}

function act_end(b) {
  var g = teacherGame(b, true);
  var now = Date.now();
  if (g.status === 'playing' || g.status === 'paused') {
    var e = effective(g, now);
    g.status = 'ended';
    g.endedAt = e.status === 'ended' ? e.endedAt : now;
    g.remainingMs = null;
    g.updatedAt = now;
    saveGame(g);
  }
  return { game: publicGame(g, now) };
}

function act_reveal(b) {
  var g = teacherGame(b, true);
  var now = Date.now();
  var e = effective(g, now);
  if (e.status !== 'ended') fail('NOT_ENDED');
  g.status = 'ended';
  g.endedAt = e.endedAt || now;
  if (!g.revealedAt) g.revealedAt = now;
  g.updatedAt = now;
  saveGame(g);
  return { game: publicGame(g, now), results: collectResults(g) };
}

function act_playAgain(b) {
  var g = teacherGame(b, true);
  var now = Date.now();
  if (effective(g, now).status === 'ended') {
    g.round = (Number(g.round) || 1) + 1;
    g.status = 'lobby';
    g.startedAt = null;
    g.goAt = null;
    g.endsAt = null;
    g.remainingMs = null;
    g.endedAt = null;
    g.revealedAt = null;
    g.subs = {};
    g.expiresAt = isShared() ? Math.max(g.expiresAt || 0, now + 6 * 3600 * 1000) : Math.max(g.expiresAt || 0, now + GAME_TTL_MS);
    g.updatedAt = now;
    saveGame(g);
  }
  return { game: publicGame(g, now) };
}

function act_releaseGroup(b) {
  var g = teacherGame(b, true);
  var k = cleanGroup(b.group, g);
  delete g.groups[k];
  g.updatedAt = Date.now();
  saveGame(g);
  forgetResults(g);
  return { game: publicGame(g, g.updatedAt) };
}

function act_deleteCar(b) {
  var g = teacherGame(b, true);
  var now = Date.now();
  var k = cleanGroup(b.group, g);
  var round = Number(b.round) || g.round;
  var no = Number(b.no);
  var sh = qSheet();
  var mine = readQRows(sh).filter(function (r) { return r.code === g.code && r.round === round && r.group === k; });
  var target = null;
  for (var i = 0; i < mine.length; i++) if (mine[i].no === no) target = mine[i];
  if (!target) fail('NO_CAR');
  sh.deleteRow(target.row);
  // 뒤 칸 번호를 하나씩 당긴다
  mine.forEach(function (r) {
    if (r.no > no) sh.getRange(r.row > target.row ? r.row - 1 : r.row, 4).setValue(r.no - 1);
  });
  if (g.subs[k] && g.subs[k].round === round) {
    g.subs[k].count = Math.max(0, (Number(g.subs[k].count) || 1) - 1);
    g.subs[k].editedAt = now;
  }
  g.updatedAt = now;
  saveGame(g);
  forgetResults(g);
  return { game: publicGame(g, now), results: collectResults(g) };
}

function act_deleteGame(b) {
  var code = cleanCode(b.code);
  var g = loadGame(code, true);
  if (g && isShared() && g.owner !== keyOf(b)) fail('NOT_OWNER');
  removeGame(code, g);
  if (b.rows || isShared()) deleteQuestionRows(code);
  return { deleted: code };
}

function act_cleanup() {
  var now = Date.now();
  return { removed: isShared() ? maybeCleanup(now) : cleanupExpired(now) };
}

// ════════════════════════════════════════════════
// 모둠 태블릿 기능
// ════════════════════════════════════════════════

function act_info(b) {
  var g = mustGame(b.code);
  var now = Date.now();
  if (now > g.expiresAt) fail('EXPIRED');
  return { game: publicGame(g, now) };
}

function act_photo(b) {
  var g = mustGame(b.code);
  if (!g.photo || g.photo.kind !== 'upload') return { data: null };
  return { data: loadPhoto(g.code) || null };
}

function act_join(b) {
  var g = mustGame(b.code, true);
  var now = Date.now();
  if (now > g.expiresAt) fail('EXPIRED');
  var k = cleanGroup(b.group, g);
  var names = cleanNames(b.names);
  var token = String(b.token || '').slice(0, 64);
  var cur = g.groups[k];
  if (cur && cur.token !== token) fail('GROUP_TAKEN');
  if (!cur) {
    if (!token) token = Utilities.getUuid();
    // 한 태블릿은 한 모둠만: 다른 모둠에 들어가 있었다면 그 자리를 비운다
    for (var other in g.groups) {
      if (g.groups.hasOwnProperty(other) && g.groups[other].token === token) delete g.groups[other];
    }
  }
  g.groups[k] = { token: token, names: names, joinedAt: cur ? cur.joinedAt : now, updatedAt: now };
  g.updatedAt = now;
  saveGame(g);
  forgetResults(g);
  touchSeen(g.code, k, now);
  return { token: token, group: k, game: publicGame(g, now) };
}

function act_leave(b) {
  var g = mustGame(b.code, true);
  var k = cleanGroup(b.group, g);
  var cur = g.groups[k];
  if (cur && cur.token === String(b.token || '')) {
    delete g.groups[k];
    g.updatedAt = Date.now();
    saveGame(g);
    forgetResults(g);
  }
  return { game: publicGame(g, Date.now()) };
}

function act_poll(b) {
  var g = loadGame(cleanCode(b.code));
  var now = Date.now();
  if (!g) return { gone: true };
  var out = { game: publicGame(g, now) };
  if (b.group) {
    var k = String(b.group);
    var cur = g.groups[k];
    out.mine = !!(cur && cur.token === String(b.token || ''));
    if (out.mine) touchSeen(g.code, k, now);
  }
  return out;
}

function act_submit(b) {
  var g = mustGame(b.code, true);
  var now = Date.now();
  var k = cleanGroup(b.group, g);
  var cur = g.groups[k];
  if (!cur || cur.token !== String(b.token || '')) fail('NOT_MINE');
  var round = Number(b.round);
  if (round !== g.round) fail('OLD_ROUND');
  var cars = cleanCars(b.cars);
  var again = !!(g.subs[k] && Number(g.subs[k].round) === round);
  writeCars(g, round, k, cars, now, again);
  g.subs[k] = { round: round, count: cars.length, at: now };
  g.updatedAt = now;
  saveGame(g);
  forgetResults(g);
  touchSeen(g.code, k, now);
  return { saved: cars.length, game: publicGame(g, now) };
}

function act_results(b) {
  var g = mustGame(b.code);
  if (!g.revealedAt && !isTeacherFor(b, g)) fail('NOT_REVEALED');
  return { game: publicGame(g, Date.now()), results: collectResults(g) };
}

// ════════════════════════════════════════════════
// 2차시 · 질문 룰렛 놀이
//  게임 진행 정보: 스크립트 속성 'r2:코드'
//  학생 질문: 이 시트의 '2차시 질문 모음' 탭
// ════════════════════════════════════════════════

var R2_SHEET = '2차시 질문 모음';
var R2_HEAD = ['게임 코드', '모둠', '번호', '활동', '질문', '질문 틀', '제시어', '원래 질문 번호', '바꾼 방법', '쓴 사람', '별표', '붙인 시각', '대주제', '아이디'];
var R2_LIMIT = { wordsMin: 2, wordsMax: 12, wordLen: 16, themeLen: 20, itemsPerGroup: 300, frameLen: 40, methodLen: 20, text: 100 };
var R2_DUR = { roulette: 1080, change: 600 };
var R2_STAGES = { roulette: true, change: true };

ACTIONS['r2.create'] = [r2_create, true, true];
ACTIONS['r2.list'] = [r2_list, true, false];
ACTIONS['r2.view'] = [r2_view, true, false];
ACTIONS['r2.stage'] = [r2_stage, true, true];
ACTIONS['r2.release'] = [r2_release, true, true];
ACTIONS['r2.items'] = [r2_items, true, false];
ACTIONS['r2.edit'] = [r2_edit, true, true];
ACTIONS['r2.delete'] = [r2_delete, true, true];
ACTIONS['r2.info'] = [r2_info, false, false];
ACTIONS['r2.join'] = [r2_join, false, true];
ACTIONS['r2.leave'] = [r2_leave, false, true];
ACTIONS['r2.poll'] = [r2_poll, false, false];
ACTIONS['r2.mine'] = [r2_mine, false, false];
ACTIONS['r2.put'] = [r2_put, false, true];
ACTIONS['r2.done'] = [r2_done, false, true];

// ── 저장 도우미 ─────────────────────────────────────

function ensureR2Sheet(book) {
  book = book || ss();
  var r = book.getSheetByName(R2_SHEET);
  if (!r) {
    r = book.insertSheet(R2_SHEET);
    r.getRange(1, 1, 1, R2_HEAD.length).setValues([R2_HEAD]).setFontWeight('bold').setBackground('#e4eed7');
    r.setFrozenRows(1);
    r.setColumnWidth(5, 380);
    r.setColumnWidth(6, 200);
  }
  return r;
}

function r2Sheet() {
  return ss().getSheetByName(R2_SHEET) || ensureR2Sheet();
}

function r2Load(code, fresh) {
  var key = 'r2:' + code;
  var s = fresh ? null : cacheGet(key);
  if (!s) {
    s = props().getProperty(key);
    if (s) cachePut(key, s);
  }
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
}

function r2Must(code, fresh) {
  var g = r2Load(cleanCode(code), fresh);
  if (!g) fail('NO_GAME');
  return g;
}

function r2Save(g) {
  var s = JSON.stringify(g);
  props().setProperty('r2:' + g.code, s);
  cachePut('r2:' + g.code, s);
}

function r2Teacher(b, fresh) {
  var g = r2Must(b.code, fresh);
  if (isShared() && g.owner !== keyOf(b)) fail('NOT_OWNER');
  return g;
}

function r2All() {
  var all = props().getProperties();
  var out = [];
  for (var k in all) {
    if (!all.hasOwnProperty(k) || k.indexOf('r2:') !== 0) continue;
    try {
      out.push(JSON.parse(all[k]));
    } catch (e) {
      out.push({ code: k.slice(3), broken: true });
    }
  }
  return out;
}

function r2Effective(g, now) {
  if (g.status === 'playing' && g.endsAt && now >= g.endsAt) return { status: 'ended', endedAt: g.endsAt };
  return { status: g.status, endedAt: g.endedAt || null };
}

function r2Public(g, now) {
  var e = r2Effective(g, now);
  var groups = {};
  for (var k in g.groups) {
    if (g.groups.hasOwnProperty(k)) groups[k] = { names: g.groups[k].names, joinedAt: g.groups[k].joinedAt };
  }
  return {
    code: g.code,
    kind: 'r2',
    groupCount: g.groupCount,
    dupMode: g.dupMode,
    theme: g.theme,
    durations: g.durations,
    createdAt: g.createdAt,
    expiresAt: g.expiresAt,
    stage: g.stage,
    status: e.status,
    goAt: g.goAt || null,
    startedAt: g.startedAt || null,
    endsAt: g.endsAt || null,
    remainingMs: g.remainingMs === null || g.remainingMs === undefined ? null : g.remainingMs,
    endedAt: e.endedAt,
    groups: groups,
    done: g.done || {},
    updatedAt: g.updatedAt,
    shared: isShared(),
  };
}

function r2CleanWords(list) {
  if (!Array.isArray(list)) fail('BAD_WORDS');
  var out = [];
  var seen = {};
  for (var i = 0; i < list.length && out.length < R2_LIMIT.wordsMax; i++) {
    var w = cleanText(list[i], R2_LIMIT.wordLen);
    if (w && !seen[w]) {
      seen[w] = true;
      out.push(w);
    }
  }
  if (out.length < R2_LIMIT.wordsMin) fail('BAD_WORDS');
  return out;
}

function r2Seen(g) {
  var keys = [];
  for (var i = 1; i <= g.groupCount; i++) keys.push('r2seen:' + g.code + ':' + i);
  var out = {};
  try {
    var got = cache().getAll(keys) || {};
    for (var j = 1; j <= g.groupCount; j++) {
      var v = got['r2seen:' + g.code + ':' + j];
      if (v) out[j] = Number(v);
    }
  } catch (e) {}
  return out;
}

function r2Touch(code, group, now) {
  cachePut('r2seen:' + code + ':' + group, String(now), CACHE_SEC);
}

// ── 질문 (시트 + 캐시) ───────────────────────────────

function r2Rows(code) {
  var sh = r2Sheet();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, R2_HEAD.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var v = vals[i];
    if (code && String(v[0]) !== code) continue;
    out.push({
      row: i + 2,
      code: String(v[0]),
      g: String(Number(v[1])),
      no: Number(v[2]),
      kind: String(v[3]) === '한 마디 바꾸기' ? 'c' : 'r',
      text: String(v[4]),
      frame: String(v[5]),
      word: String(v[6]),
      parentNo: v[7] === '' || v[7] === null ? null : Number(v[7]),
      method: String(v[8]),
      name: String(v[9]),
      star: String(v[10]) === '★',
      time: v[11] instanceof Date ? fmtTime(v[11].getTime()) : String(v[11]),
      id: String(v[13]),
    });
  }
  return out;
}

function r2Strip(r) {
  return { id: r.id, no: r.no, kind: r.kind, text: r.text, frame: r.frame, word: r.word, parentNo: r.parentNo, method: r.method, name: r.name, star: r.star, time: r.time };
}

// 게임 하나의 질문 전체: { 모둠: [질문...] }
function r2ItemsMap(code) {
  var hit = cacheGet('r2i:' + code);
  if (hit) {
    try {
      return JSON.parse(hit);
    } catch (e) {}
  }
  var map = {};
  r2Rows(code).forEach(function (r) {
    (map[r.g] = map[r.g] || []).push(r2Strip(r));
  });
  for (var k in map) {
    if (map.hasOwnProperty(k)) map[k].sort(function (a, b) { return a.no - b.no; });
  }
  cachePut('r2i:' + code, JSON.stringify(map), 3600);
  return map;
}

function r2ForgetItems(code) {
  cacheDel('r2i:' + code);
}

function r2DeleteRowsOf(codes) {
  var set = {};
  (Array.isArray(codes) ? codes : [codes]).forEach(function (c) { set[String(c)] = true; });
  var sh = r2Sheet();
  var rows = r2Rows(null).filter(function (r) { return set[r.code]; }).map(function (r) { return r.row; });
  if (rows.length) deleteRowList(sh, rows);
}

function r2Remove(code, g) {
  props().deleteProperty('r2:' + code);
  cacheDel('r2:' + code);
  r2ForgetItems(code);
}

function r2CleanupExpired(now, shared) {
  var removed = [];
  var alive = {};
  r2All().forEach(function (g) {
    if (g.broken || (g.expiresAt && now > g.expiresAt)) {
      r2Remove(g.code, g);
      removed.push(g.code);
    } else alive[g.code] = true;
  });
  if (shared) {
    var sh = r2Sheet();
    var orphan = r2Rows(null)
      .filter(function (r) { return !alive[r.code]; })
      .map(function (r) { return r.row; });
    if (orphan.length) deleteRowList(sh, orphan);
  }
  return removed;
}

function r2TokenGroup(b, g) {
  var k = cleanGroup(b.group, g);
  var cur = g.groups[k];
  if (!cur || cur.token !== String(b.token || '')) fail('NOT_MINE');
  return k;
}

function r2CleanItem(x) {
  x = x || {};
  var id = String(x.id || '');
  if (!/^[A-Za-z0-9_-]{6,48}$/.test(id)) return null;
  var text = cleanText(x.text, R2_LIMIT.text);
  if (!text) return null;
  var parentNo = x.parentNo === null || x.parentNo === undefined || x.parentNo === '' ? null : clampInt(x.parentNo, 1, 9999, null);
  return {
    id: id,
    no: clampInt(x.no, 1, 9999, 1),
    kind: x.kind === 'c' ? 'c' : 'r',
    text: text,
    frame: cleanText(x.frame, R2_LIMIT.frameLen),
    word: cleanText(x.word, R2_LIMIT.wordLen),
    parentNo: parentNo,
    method: cleanText(x.method, R2_LIMIT.methodLen),
    name: cleanText(x.name, LIMIT.name + 4),
    star: false,
    at: Number(x.at) || Date.now(),
  };
}

// ── 선생님 기능 ──────────────────────────────────────

function r2_create(b) {
  var s = b.settings || {};
  var now = Date.now();
  var shared = isShared();
  if (shared) {
    maybeCleanup(now);
    var mine = 0;
    var all = r2All();
    all.forEach(function (g) {
      if (g.owner === keyOf(b) && !(g.expiresAt && now > g.expiresAt)) mine++;
    });
    if (mine >= TRIAL_LIMIT.gamesPerTeacher) fail('TOO_MANY_GAMES');
    if (all.length + allGames().length + r3All().length >= TRIAL_LIMIT.gamesTotal) fail('SERVER_FULL');
  }
  var themeName = cleanText(s.themeName, R2_LIMIT.themeLen);
  if (!themeName) fail('BAD_THEME');
  var d = s.durations || {};
  var code = newCode();
  var game = {
    code: code,
    kind: 'r2',
    owner: keyOf(b),
    groupCount: clampInt(s.groupCount, LIMIT.groupsMin, LIMIT.groupsMax, 6),
    dupMode: s.dupMode === 'similar' ? 'similar' : 'same',
    theme: { name: themeName, words: r2CleanWords(s.words) },
    durations: { roulette: clampInt(d.roulette, 60, 2400, R2_DUR.roulette), change: clampInt(d.change, 60, 2400, R2_DUR.change) },
    createdAt: now,
    expiresAt: now + (shared ? TRIAL_TTL_MS : GAME_TTL_MS),
    stage: 'lobby',
    status: 'idle',
    goAt: null,
    startedAt: null,
    endsAt: null,
    remainingMs: null,
    endedAt: null,
    groups: {},
    done: {},
    updatedAt: now,
  };
  r2Save(game);
  return { code: code, game: r2Public(game, now) };
}

function r2_list(b) {
  var now = Date.now();
  var shared = isShared();
  var out = [];
  r2All().forEach(function (g) {
    if (g.broken) return;
    if (shared && g.owner !== keyOf(b)) return;
    if (shared && g.expiresAt && now > g.expiresAt) return;
    out.push({
      code: g.code,
      stage: g.stage,
      status: r2Effective(g, now).status,
      createdAt: g.createdAt,
      expiresAt: g.expiresAt,
      groupCount: g.groupCount,
      joined: Object.keys(g.groups || {}).length,
      themeName: (g.theme && g.theme.name) || '',
    });
  });
  out.sort(function (a, c) { return c.createdAt - a.createdAt; });
  return { games: out, sheetUrl: sheetUrl(), shared: shared };
}

function r2_view(b) {
  var g = r2Teacher(b);
  return { game: r2Public(g, Date.now()), seen: r2Seen(g) };
}

function r2_stage(b) {
  var g = r2Teacher(b, true);
  var now = Date.now();
  var op = String(b.op || '');
  var e = r2Effective(g, now);
  var go = function (stage) {
    g.stage = stage;
    g.status = 'playing';
    g.goAt = now + START_LEAD_MS;
    g.startedAt = g.goAt;
    g.endsAt = g.goAt + g.durations[stage] * 1000;
    g.remainingMs = null;
    g.endedAt = null;
    g.done = g.done || {};
    g.done[stage] = {};
  };
  if (op === 'start') {
    if (g.stage !== 'lobby') return { game: r2Public(g, now) };
    if (!Object.keys(g.groups || {}).length) fail('NO_GROUPS');
    go('roulette');
  } else if (op === 'next') {
    if (!(g.stage === 'roulette' && e.status === 'ended')) return { game: r2Public(g, now) };
    go('change');
  } else if (op === 'pause') {
    if (e.status !== 'playing') return { game: r2Public(g, now) };
    g.status = 'paused';
    g.remainingMs = Math.max(0, g.endsAt - Math.max(now, g.goAt || now));
  } else if (op === 'resume') {
    if (g.status !== 'paused') return { game: r2Public(g, now) };
    g.status = 'playing';
    g.goAt = now + RESUME_LEAD_MS;
    g.endsAt = g.goAt + Math.max(1000, Number(g.remainingMs) || 0);
    g.remainingMs = null;
  } else if (op === 'end') {
    if (g.status !== 'playing' && g.status !== 'paused') return { game: r2Public(g, now) };
    g.status = 'ended';
    g.endedAt = e.status === 'ended' ? e.endedAt : now;
    g.remainingMs = null;
  } else fail('BAD_OP');
  g.updatedAt = now;
  r2Save(g);
  return { game: r2Public(g, now) };
}

function r2_release(b) {
  var g = r2Teacher(b, true);
  var k = cleanGroup(b.group, g);
  delete g.groups[k];
  g.updatedAt = Date.now();
  r2Save(g);
  return { game: r2Public(g, g.updatedAt) };
}

function r2_items(b) {
  var g = r2Teacher(b);
  return { game: r2Public(g, Date.now()), items: r2ItemsMap(g.code) };
}

function r2_edit(b) {
  var g = r2Teacher(b, true);
  var id = String(b.id || '');
  var rows = r2Rows(g.code).filter(function (r) { return r.id === id; });
  if (!rows.length) fail('NO_ITEM');
  var sh = r2Sheet();
  if (b.op === 'delete') sh.deleteRow(rows[0].row);
  else if (b.op === 'star') sh.getRange(rows[0].row, 11).setValue(b.value ? '★' : '');
  else fail('BAD_OP');
  r2ForgetItems(g.code);
  return { game: r2Public(g, Date.now()), items: r2ItemsMap(g.code) };
}

function r2_delete(b) {
  var code = cleanCode(b.code);
  var g = r2Load(code, true);
  if (g && isShared() && g.owner !== keyOf(b)) fail('NOT_OWNER');
  r2Remove(code, g);
  if (b.rows || isShared()) r2DeleteRowsOf(code);
  return { deleted: code };
}

// ── 모둠 태블릿 기능 ─────────────────────────────────

function r2_info(b) {
  var g = r2Must(b.code);
  var now = Date.now();
  if (now > g.expiresAt) fail('EXPIRED');
  return { game: r2Public(g, now) };
}

function r2_join(b) {
  var g = r2Must(b.code, true);
  var now = Date.now();
  if (now > g.expiresAt) fail('EXPIRED');
  var k = cleanGroup(b.group, g);
  var names = cleanNames(b.names);
  var token = String(b.token || '').slice(0, 64);
  var cur = g.groups[k];
  if (cur && cur.token !== token) fail('GROUP_TAKEN');
  if (!cur) {
    if (!token) token = Utilities.getUuid();
    for (var other in g.groups) {
      if (g.groups.hasOwnProperty(other) && g.groups[other].token === token) delete g.groups[other];
    }
  }
  g.groups[k] = { token: token, names: names, joinedAt: cur ? cur.joinedAt : now, updatedAt: now };
  g.updatedAt = now;
  r2Save(g);
  r2Touch(g.code, k, now);
  return { token: token, group: k, game: r2Public(g, now), items: r2ItemsMap(g.code)[k] || [] };
}

function r2_leave(b) {
  var g = r2Must(b.code, true);
  var k = cleanGroup(b.group, g);
  var cur = g.groups[k];
  if (cur && cur.token === String(b.token || '')) {
    delete g.groups[k];
    g.updatedAt = Date.now();
    r2Save(g);
  }
  return { game: r2Public(g, Date.now()) };
}

function r2_poll(b) {
  var g = r2Load(cleanCode(b.code));
  var now = Date.now();
  if (!g) return { gone: true };
  var out = { game: r2Public(g, now) };
  if (b.group) {
    var k = String(b.group);
    var cur = g.groups[k];
    out.mine = !!(cur && cur.token === String(b.token || ''));
    if (out.mine) r2Touch(g.code, k, now);
  }
  return out;
}

function r2_mine(b) {
  var g = r2Must(b.code);
  var k = r2TokenGroup(b, g);
  return { game: r2Public(g, Date.now()), items: r2ItemsMap(g.code)[k] || [] };
}

// 질문 저장: 같은 아이디는 한 번만 저장한다 (다시 보내도 안전)
function r2_put(b) {
  var g = r2Must(b.code, true);
  var now = Date.now();
  var k = r2TokenGroup(b, g);
  if (g.stage === 'lobby') fail('NOT_STARTED');
  var list = Array.isArray(b.items) ? b.items : [];
  var map = r2ItemsMap(g.code);
  var have = map[k] || [];
  var ids = {};
  have.forEach(function (x) { ids[x.id] = true; });
  var fresh = [];
  for (var i = 0; i < list.length && have.length + fresh.length < R2_LIMIT.itemsPerGroup; i++) {
    var it = r2CleanItem(list[i]);
    if (it && !ids[it.id]) {
      ids[it.id] = true;
      fresh.push(it);
    }
  }
  if (fresh.length) {
    var sh = r2Sheet();
    var theme = asText((g.theme && g.theme.name) || '');
    var rows = fresh.map(function (x) {
      return [Number(g.code), Number(k), x.no, x.kind === 'c' ? '한 마디 바꾸기' : '질문 룰렛', asText(x.text), asText(x.frame), asText(x.word), x.parentNo === null ? '' : x.parentNo, asText(x.method), asText(x.name), '', asText(fmtTime(x.at)), theme, asText(x.id)];
    });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, R2_HEAD.length).setValues(rows);
    map[k] = have.concat(fresh.map(function (x) {
      return { id: x.id, no: x.no, kind: x.kind, text: x.text, frame: x.frame, word: x.word, parentNo: x.parentNo, method: x.method, name: x.name, star: false, time: fmtTime(x.at) };
    }));
    map[k].sort(function (a, c) { return a.no - c.no; });
    cachePut('r2i:' + g.code, JSON.stringify(map), 3600);
  }
  r2Touch(g.code, k, now);
  return { saved: fresh.length, ids: list.map(function (x) { return x && x.id; }) };
}

function r2_done(b) {
  var g = r2Must(b.code, true);
  var k = r2TokenGroup(b, g);
  var stage = String(b.stage || '');
  if (!R2_STAGES[stage]) fail('BAD_STAGE');
  g.done = g.done || {};
  g.done[stage] = g.done[stage] || {};
  g.done[stage][k] = Date.now();
  g.updatedAt = Date.now();
  r2Save(g);
  return { game: r2Public(g, Date.now()) };
}

// ════════════════════════════════════════════════
// 3차시 · 질문 나무
//  게임 진행 정보: 스크립트 속성 'r3:코드'
//  질문과 놓은 자리: 이 시트의 '3차시 질문 나무' 탭 (질문 하나가 한 줄)
// ════════════════════════════════════════════════

var R3_SHEET = '3차시 질문 나무';
var R3_HEAD = ['게임 코드', '모둠', '번호', '질문', '자리', '새 질문', '2차시 활동', '2차시 번호', '옮긴 시각', '아이디'];
var R3_ZONES = { basket: '바구니', branch: '가지', trunk: '기둥', root: '뿌리' };
var R3_ZONE_OF = { '바구니': 'basket', '가지': 'branch', '기둥': 'trunk', '뿌리': 'root' };
var R3_LIMIT = { groupsMin: 1, groupsMax: 8, perGroup: 80, newPerGroup: 30, total: 480, text: 100, src: 20, theme: 20 };
var R3_DUR = 0; // 0 = 제한 시간 없음: 선생님이 [활동 끝]을 누를 때까지

ACTIONS['r3.create'] = [r3_create, true, true];
ACTIONS['r3.list'] = [r3_list, true, false];
ACTIONS['r3.view'] = [r3_view, true, false];
ACTIONS['r3.stage'] = [r3_stage, true, true];
ACTIONS['r3.release'] = [r3_release, true, true];
ACTIONS['r3.items'] = [r3_items, true, false];
ACTIONS['r3.edit'] = [r3_edit, true, true];
ACTIONS['r3.delete'] = [r3_delete, true, true];
ACTIONS['r3.info'] = [r3_info, false, false];
ACTIONS['r3.join'] = [r3_join, false, true];
ACTIONS['r3.leave'] = [r3_leave, false, true];
ACTIONS['r3.poll'] = [r3_poll, false, false];
ACTIONS['r3.mine'] = [r3_mine, false, false];
ACTIONS['r3.save'] = [r3_save, false, true];
ACTIONS['r3.done'] = [r3_done, false, true];

// ── 저장 도우미 ─────────────────────────────────────

function ensureR3Sheet(book) {
  book = book || ss();
  var r = book.getSheetByName(R3_SHEET);
  if (!r) {
    r = book.insertSheet(R3_SHEET);
    r.getRange(1, 1, 1, R3_HEAD.length).setValues([R3_HEAD]).setFontWeight('bold').setBackground('#e4eed7');
    r.setFrozenRows(1);
    r.setColumnWidth(4, 380);
  }
  return r;
}

function r3Sheet() {
  return ss().getSheetByName(R3_SHEET) || ensureR3Sheet();
}

function r3Load(code, fresh) {
  var key = 'r3:' + code;
  var s = fresh ? null : cacheGet(key);
  if (!s) {
    s = props().getProperty(key);
    if (s) cachePut(key, s);
  }
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
}

function r3Must(code, fresh) {
  var g = r3Load(cleanCode(code), fresh);
  if (!g) fail('NO_GAME');
  return g;
}

function r3Save(g) {
  var s = JSON.stringify(g);
  props().setProperty('r3:' + g.code, s);
  cachePut('r3:' + g.code, s);
}

function r3Teacher(b, fresh) {
  var g = r3Must(b.code, fresh);
  if (isShared() && g.owner !== keyOf(b)) fail('NOT_OWNER');
  return g;
}

function r3All() {
  var all = props().getProperties();
  var out = [];
  for (var k in all) {
    if (!all.hasOwnProperty(k) || k.indexOf('r3:') !== 0) continue;
    try {
      out.push(JSON.parse(all[k]));
    } catch (e) {
      out.push({ code: k.slice(3), broken: true });
    }
  }
  return out;
}

function r3Effective(g, now) {
  if (g.status === 'playing' && g.endsAt && now >= g.endsAt) return { status: 'ended', endedAt: g.endsAt };
  return { status: g.status, endedAt: g.endedAt || null };
}

function r3Public(g, now) {
  var e = r3Effective(g, now);
  var groups = {};
  for (var k in g.groups) {
    if (g.groups.hasOwnProperty(k)) groups[k] = { names: g.groups[k].names, joinedAt: g.groups[k].joinedAt };
  }
  return {
    code: g.code,
    kind: 'r3',
    groupCount: g.groupCount,
    durationSec: g.durationSec,
    themeName: g.themeName || '',
    createdAt: g.createdAt,
    expiresAt: g.expiresAt,
    status: e.status,
    goAt: g.goAt || null,
    startedAt: g.startedAt || null,
    endsAt: g.endsAt || null,
    remainingMs: g.remainingMs === null || g.remainingMs === undefined ? null : g.remainingMs,
    endedAt: e.endedAt,
    groups: groups,
    done: g.done || {},
    updatedAt: g.updatedAt,
    shared: isShared(),
  };
}

function r3Seen(g) {
  var keys = [];
  for (var i = 1; i <= g.groupCount; i++) keys.push('r3seen:' + g.code + ':' + i);
  var out = {};
  try {
    var got = cache().getAll(keys) || {};
    for (var j = 1; j <= g.groupCount; j++) {
      var v = got['r3seen:' + g.code + ':' + j];
      if (v) out[j] = Number(v);
    }
  } catch (e) {}
  return out;
}

function r3Touch(code, group, now) {
  cachePut('r3seen:' + code + ':' + group, String(now), CACHE_SEC);
}

// ── 질문 (시트 + 캐시) ───────────────────────────────
// 줄을 지우면 줄 번호가 바뀌니, 지울 때마다 '판 번호(epoch)'를 올려 줄 번호 기억을 버린다.

function r3Epoch() {
  var v = cacheGet('r3epoch');
  if (!v) {
    v = props().getProperty('r3epoch') || '1';
    cachePut('r3epoch', v);
  }
  return v;
}

function r3BumpEpoch() {
  var v = String(Number(props().getProperty('r3epoch') || '1') + 1);
  props().setProperty('r3epoch', v);
  cachePut('r3epoch', v);
}

function r3Rows(code) {
  var sh = r3Sheet();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, R3_HEAD.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var v = vals[i];
    if (code && String(v[0]) !== code) continue;
    out.push({
      row: i + 2,
      code: String(v[0]),
      g: String(Number(v[1])),
      no: Number(v[2]),
      text: String(v[3]),
      zone: R3_ZONE_OF[String(v[4])] || 'basket',
      isNew: String(v[5]) !== '',
      src: String(v[6]),
      srcNo: v[7] === '' || v[7] === null ? null : Number(v[7]),
      at: r3ParseTime(v[8]),
      id: String(v[9]),
    });
  }
  return out;
}

// 시트의 '옮긴 시각'(한국 시간 글자) → 밀리초. 같은 칸 안 질문 순서를 지키는 데 쓴다.
function r3ParseTime(v) {
  if (v instanceof Date) return v.getTime();
  var m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return 0;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]) - 9, Number(m[5]), Number(m[6]));
}

function r3Strip(r) {
  return { id: r.id, no: r.no, text: r.text, zone: r.zone, isNew: r.isNew, src: r.src, srcNo: r.srcNo, at: r.at };
}

// 게임 하나의 질문 전체: { 모둠: [질문...] }
function r3ItemsMap(code) {
  var hit = cacheGet('r3i:' + code);
  if (hit) {
    try {
      return JSON.parse(hit);
    } catch (e) {}
  }
  var map = {};
  var index = {};
  r3Rows(code).forEach(function (r) {
    (map[r.g] = map[r.g] || []).push(r3Strip(r));
    index[r.id] = r.row;
  });
  for (var k in map) {
    if (map.hasOwnProperty(k)) map[k].sort(function (a, b) { return a.no - b.no; });
  }
  cachePut('r3i:' + code, JSON.stringify(map), 3600);
  cachePut('r3x:' + code + ':' + r3Epoch(), JSON.stringify(index), 3600);
  return map;
}

// 아이디 → 시트 줄 번호
function r3Index(code) {
  var hit = cacheGet('r3x:' + code + ':' + r3Epoch());
  if (hit) {
    try {
      return JSON.parse(hit);
    } catch (e) {}
  }
  cacheDel('r3i:' + code);
  r3ItemsMap(code);
  return JSON.parse(cacheGet('r3x:' + code + ':' + r3Epoch()) || '{}');
}

function r3PutCaches(code, map, index) {
  cachePut('r3i:' + code, JSON.stringify(map), 3600);
  if (index) cachePut('r3x:' + code + ':' + r3Epoch(), JSON.stringify(index), 3600);
}

function r3ForgetItems(code) {
  cacheDel('r3i:' + code);
}

function r3Counts(map) {
  var out = {};
  for (var k in map) {
    if (!map.hasOwnProperty(k)) continue;
    var placed = 0;
    map[k].forEach(function (x) {
      if (x.zone !== 'basket') placed++;
    });
    out[k] = { total: map[k].length, placed: placed };
  }
  return out;
}

function r3DeleteRowsOf(codes) {
  var set = {};
  (Array.isArray(codes) ? codes : [codes]).forEach(function (c) { set[String(c)] = true; });
  var sh = r3Sheet();
  var rows = r3Rows(null).filter(function (r) { return set[r.code]; }).map(function (r) { return r.row; });
  if (rows.length) {
    deleteRowList(sh, rows);
    r3BumpEpoch();
  }
}

function r3Remove(code) {
  props().deleteProperty('r3:' + code);
  cacheDel('r3:' + code);
  r3ForgetItems(code);
}

function r3CleanupExpired(now, shared) {
  var removed = [];
  var alive = {};
  r3All().forEach(function (g) {
    if (g.broken || (g.expiresAt && now > g.expiresAt)) {
      r3Remove(g.code);
      removed.push(g.code);
    } else alive[g.code] = true;
  });
  if (shared) {
    var sh = r3Sheet();
    var orphan = r3Rows(null)
      .filter(function (r) { return !alive[r.code]; })
      .map(function (r) { return r.row; });
    if (orphan.length) {
      deleteRowList(sh, orphan);
      r3BumpEpoch();
    }
  }
  return removed;
}

function r3TokenGroup(b, g) {
  var k = cleanGroup(b.group, g);
  var cur = g.groups[k];
  if (!cur || cur.token !== String(b.token || '')) fail('NOT_MINE');
  return k;
}

function r3Id(v) {
  var id = String(v || '');
  return /^[A-Za-z0-9_-]{2,48}$/.test(id) ? id : '';
}

// ── 선생님 기능 ──────────────────────────────────────

function r3_create(b) {
  var s = b.settings || {};
  var now = Date.now();
  var shared = isShared();
  if (shared) {
    maybeCleanup(now);
    var mine = 0;
    var all = r3All();
    all.forEach(function (g) {
      if (g.owner === keyOf(b) && !(g.expiresAt && now > g.expiresAt)) mine++;
    });
    if (mine >= TRIAL_LIMIT.gamesPerTeacher) fail('TOO_MANY_GAMES');
    if (all.length + r2All().length + allGames().length >= TRIAL_LIMIT.gamesTotal) fail('SERVER_FULL');
  }
  var groupCount = clampInt(s.groupCount, R3_LIMIT.groupsMin, R3_LIMIT.groupsMax, 4);
  var list = Array.isArray(s.questions) ? s.questions : [];
  var perGroup = {};
  var rows = [];
  var code = newCode();
  var map = {};
  for (var i = 0; i < list.length && rows.length < R3_LIMIT.total; i++) {
    var q = list[i] || {};
    var gk = Math.round(Number(q.g));
    if (!isFinite(gk) || gk < 1 || gk > groupCount) continue;
    var text = cleanText(q.text, R3_LIMIT.text);
    if (!text) continue;
    var n = (perGroup[gk] = (perGroup[gk] || 0) + 1);
    if (n > R3_LIMIT.perGroup) continue;
    var id = 'q' + gk + '-' + n;
    var src = cleanText(q.src, R3_LIMIT.src);
    var srcNo = q.srcNo === null || q.srcNo === undefined || q.srcNo === '' ? null : clampInt(q.srcNo, 1, 99999, null);
    rows.push([Number(code), gk, n, asText(text), R3_ZONES.basket, '', asText(src), srcNo === null ? '' : srcNo, '', asText(id)]);
    (map[String(gk)] = map[String(gk)] || []).push({ id: id, no: n, text: text, zone: 'basket', isNew: false, src: src, srcNo: srcNo, at: 0 });
  }
  if (!rows.length) fail('NO_QUESTIONS');
  var sh = r3Sheet();
  var start = sh.getLastRow() + 1;
  sh.getRange(start, 1, rows.length, R3_HEAD.length).setValues(rows);
  var index = {};
  rows.forEach(function (r, j) {
    index[String(r[9]).replace(/^'/, '')] = start + j;
  });
  var game = {
    code: code,
    kind: 'r3',
    owner: keyOf(b),
    groupCount: groupCount,
    durationSec: Number(s.durationSec) > 0 ? clampInt(s.durationSec, 60, 2400, R3_DUR) : R3_DUR,
    themeName: cleanText(s.themeName, R3_LIMIT.theme),
    createdAt: now,
    expiresAt: now + (shared ? TRIAL_TTL_MS : GAME_TTL_MS),
    status: 'idle',
    goAt: null,
    startedAt: null,
    endsAt: null,
    remainingMs: null,
    endedAt: null,
    groups: {},
    done: {},
    updatedAt: now,
  };
  r3Save(game);
  r3PutCaches(code, map, index);
  return { code: code, game: r3Public(game, now) };
}

function r3_list(b) {
  var now = Date.now();
  var shared = isShared();
  var out = [];
  r3All().forEach(function (g) {
    if (g.broken) return;
    if (shared && g.owner !== keyOf(b)) return;
    if (shared && g.expiresAt && now > g.expiresAt) return;
    out.push({
      code: g.code,
      status: r3Effective(g, now).status,
      createdAt: g.createdAt,
      expiresAt: g.expiresAt,
      groupCount: g.groupCount,
      joined: Object.keys(g.groups || {}).length,
      themeName: g.themeName || '',
    });
  });
  out.sort(function (a, c) { return c.createdAt - a.createdAt; });
  return { games: out, shared: shared };
}

function r3_view(b) {
  var g = r3Teacher(b);
  var map = r3ItemsMap(g.code);
  return { game: r3Public(g, Date.now()), seen: r3Seen(g), progress: r3Counts(map) };
}

function r3_stage(b) {
  var g = r3Teacher(b, true);
  var now = Date.now();
  var op = String(b.op || '');
  var e = r3Effective(g, now);
  if (op === 'start') {
    if (g.status !== 'idle') return { game: r3Public(g, now) };
    if (!Object.keys(g.groups || {}).length) fail('NO_GROUPS');
    g.status = 'playing';
    g.goAt = now + START_LEAD_MS;
    g.startedAt = g.goAt;
    g.endsAt = g.durationSec ? g.goAt + g.durationSec * 1000 : null;
    g.remainingMs = null;
    g.endedAt = null;
    g.done = {};
  } else if (op === 'pause') {
    if (e.status !== 'playing') return { game: r3Public(g, now) };
    g.status = 'paused';
    g.remainingMs = g.endsAt ? Math.max(0, g.endsAt - Math.max(now, g.goAt || now)) : null;
  } else if (op === 'resume') {
    if (g.status !== 'paused') return { game: r3Public(g, now) };
    g.status = 'playing';
    g.goAt = now + RESUME_LEAD_MS;
    g.endsAt = g.endsAt && g.remainingMs !== null && g.remainingMs !== undefined ? g.goAt + Math.max(1000, Number(g.remainingMs) || 0) : null;
    g.remainingMs = null;
  } else if (op === 'end') {
    if (g.status !== 'playing' && g.status !== 'paused') return { game: r3Public(g, now) };
    g.status = 'ended';
    g.endedAt = e.status === 'ended' ? e.endedAt : now;
    g.remainingMs = null;
  } else fail('BAD_OP');
  g.updatedAt = now;
  r3Save(g);
  return { game: r3Public(g, now) };
}

function r3_release(b) {
  var g = r3Teacher(b, true);
  var k = cleanGroup(b.group, g);
  delete g.groups[k];
  g.updatedAt = Date.now();
  r3Save(g);
  return { game: r3Public(g, g.updatedAt) };
}

function r3_items(b) {
  var g = r3Teacher(b);
  return { game: r3Public(g, Date.now()), items: r3ItemsMap(g.code) };
}

function r3_edit(b) {
  var g = r3Teacher(b, true);
  var id = r3Id(b.id);
  if (b.op !== 'delete') fail('BAD_OP');
  var rows = r3Rows(g.code).filter(function (r) { return r.id === id; });
  if (!rows.length) fail('NO_ITEM');
  r3Sheet().deleteRow(rows[0].row);
  r3BumpEpoch();
  r3ForgetItems(g.code);
  return { game: r3Public(g, Date.now()), items: r3ItemsMap(g.code) };
}

function r3_delete(b) {
  var code = cleanCode(b.code);
  var g = r3Load(code, true);
  if (g && isShared() && g.owner !== keyOf(b)) fail('NOT_OWNER');
  r3Remove(code);
  if (b.rows || isShared()) r3DeleteRowsOf(code);
  return { deleted: code };
}

// ── 모둠 태블릿 기능 ─────────────────────────────────

function r3_info(b) {
  var g = r3Must(b.code);
  var now = Date.now();
  if (now > g.expiresAt) fail('EXPIRED');
  return { game: r3Public(g, now) };
}

function r3_join(b) {
  var g = r3Must(b.code, true);
  var now = Date.now();
  if (now > g.expiresAt) fail('EXPIRED');
  var k = cleanGroup(b.group, g);
  var names = cleanNames(b.names);
  var token = String(b.token || '').slice(0, 64);
  var cur = g.groups[k];
  if (cur && cur.token !== token) fail('GROUP_TAKEN');
  if (!cur) {
    if (!token) token = Utilities.getUuid();
    for (var other in g.groups) {
      if (g.groups.hasOwnProperty(other) && g.groups[other].token === token) delete g.groups[other];
    }
  }
  g.groups[k] = { token: token, names: names, joinedAt: cur ? cur.joinedAt : now, updatedAt: now };
  g.updatedAt = now;
  r3Save(g);
  r3Touch(g.code, k, now);
  var started = g.status !== 'idle';
  return { token: token, group: k, game: r3Public(g, now), items: started ? r3ItemsMap(g.code)[k] || [] : [] };
}

function r3_leave(b) {
  var g = r3Must(b.code, true);
  var k = cleanGroup(b.group, g);
  var cur = g.groups[k];
  if (cur && cur.token === String(b.token || '')) {
    delete g.groups[k];
    g.updatedAt = Date.now();
    r3Save(g);
  }
  return { game: r3Public(g, Date.now()) };
}

function r3_poll(b) {
  var g = r3Load(cleanCode(b.code));
  var now = Date.now();
  if (!g) return { gone: true };
  var out = { game: r3Public(g, now) };
  if (b.group) {
    var k = String(b.group);
    var cur = g.groups[k];
    out.mine = !!(cur && cur.token === String(b.token || ''));
    if (out.mine) r3Touch(g.code, k, now);
  }
  return out;
}

// 질문은 놀이가 시작된 뒤에만 태블릿에 보낸다 (미리 보고 옮기지 않도록)
function r3_mine(b) {
  var g = r3Must(b.code);
  var k = r3TokenGroup(b, g);
  if (g.status === 'idle') return { game: r3Public(g, Date.now()), items: [] };
  return { game: r3Public(g, Date.now()), items: r3ItemsMap(g.code)[k] || [] };
}

// 놓은 자리 저장: places = { 아이디: [자리, 옮긴 시각] }, added = 새로 쓴 질문
// 같은 내용을 다시 보내도 안전하다.
function r3_save(b) {
  // 자주 불리므로 게임 정보는 캐시에서 읽고, 스크립트 속성에는 쓰지 않는다 (하루 사용 한도 아끼기)
  var g = r3Must(b.code);
  var now = Date.now();
  var k = r3TokenGroup(b, g);
  if (g.status === 'idle') fail('NOT_STARTED');
  var map = r3ItemsMap(g.code);
  var list = map[k] || [];
  var byId = {};
  var newCount = 0;
  list.forEach(function (x) {
    byId[x.id] = x;
    if (x.isNew) newCount++;
  });
  var places = b.places && typeof b.places === 'object' ? b.places : {};
  var sh = r3Sheet();
  var index = r3Index(g.code);
  var rebuilt = false;
  var changed = 0;
  // 새로 쓴 질문 붙이기
  var added = Array.isArray(b.added) ? b.added : [];
  var fresh = [];
  var maxNo = 0;
  list.forEach(function (x) {
    if (x.no > maxNo) maxNo = x.no;
  });
  for (var i = 0; i < added.length && newCount + fresh.length < R3_LIMIT.newPerGroup && list.length + fresh.length < R3_LIMIT.perGroup + R3_LIMIT.newPerGroup; i++) {
    var a = added[i] || {};
    var id = r3Id(a.id);
    var text = cleanText(a.text, R3_LIMIT.text);
    if (!id || !text || byId[id]) continue;
    var p = places[id];
    var zone = p && R3_ZONES[p[0]] ? p[0] : 'basket';
    var at = (p && Number(p[1])) || now;
    var item = { id: id, no: maxNo + fresh.length + 1, text: text, zone: zone, isNew: true, src: '', srcNo: null, at: at };
    fresh.push(item);
    byId[id] = item;
  }
  if (fresh.length) {
    var start = sh.getLastRow() + 1;
    sh.getRange(start, 1, fresh.length, R3_HEAD.length).setValues(
      fresh.map(function (x) {
        return [Number(g.code), Number(k), x.no, asText(x.text), R3_ZONES[x.zone], '새 질문', '', '', x.at ? asText(fmtTime(x.at)) : '', asText(x.id)];
      })
    );
    fresh.forEach(function (x, j) {
      index[x.id] = start + j;
      list.push(x);
    });
    changed += fresh.length;
  }
  // 자리 바꾸기
  for (var pid in places) {
    if (!places.hasOwnProperty(pid)) continue;
    var cur = byId[pid];
    var pl = places[pid];
    if (!cur || cur.isNew && fresh.indexOf(cur) >= 0) continue;
    if (!Array.isArray(pl) || !R3_ZONES[pl[0]]) continue;
    var nz = pl[0];
    var nat = Number(pl[1]) || now;
    if (cur.zone === nz && cur.at === nat) continue;
    var row = index[pid];
    if (!row && !rebuilt) {
      rebuilt = true;
      cacheDel('r3x:' + g.code + ':' + r3Epoch());
      index = r3Index(g.code);
      row = index[pid];
    }
    if (!row) continue;
    sh.getRange(row, 5).setValue(R3_ZONES[nz]);
    sh.getRange(row, 9).setValue(asText(fmtTime(nat)));
    cur.zone = nz;
    cur.at = nat;
    changed++;
  }
  map[k] = list;
  if (changed) r3PutCaches(g.code, map, index);
  r3Touch(g.code, k, now);
  return { saved: changed, game: r3Public(g, now) };
}

function r3_done(b) {
  var g = r3Must(b.code, true);
  var k = r3TokenGroup(b, g);
  g.done = g.done || {};
  g.done[k] = Date.now();
  g.updatedAt = Date.now();
  r3Save(g);
  return { game: r3Public(g, Date.now()) };
}
