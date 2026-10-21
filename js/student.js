// 모둠 태블릿 화면 (3차시 질문 나무)
// 코드 입력 → 모둠 고르기 → 친구 이름 → 대기(빈 나무) → 질문 나무 만들기(끌어 놓기) → 끝(나무 보내기)
// 차례는 없고, 모둠 친구들이 함께 의논하며 질문을 옮긴다.
// 옮길 때마다 잠시 뒤 서버에 저장하고, 보내지 못하면 다시 보낸다.

import { $, esc, toast, confirmBox, watchConnection, brandHtml, catSvg, ICON, isComposingEnter } from './ui.js';
import { groupColor, cleanQuestion, cleanName, NAME_MAX } from './game.js';
import { createTimerFx, isSoundOn, setSoundOn, SOUND_ICON, bell, beep, flashBanner, tick as tickSound, unlockAudio } from './effects.js';
import { hasServer, explainError } from './api.js';
import { r3Client, deriveR3 } from './r3api.js';
import { ZONES, NEW_MAX, sameQuestion } from './content.js';
import { treeHtml, byZone, cardHtml, basketIcon, keySentenceHtml } from './treeview.js';
import { enableDnd } from './dnd.js';

const app = document.getElementById('app');
const SESSION_KEY = 'qr3-tablet';
const MAX_MEMBERS = 8;
const SAVE_DELAY = 1200;
const TEXT_MAX = 100;

const T = {
  cli: null,
  target: null, // 'server' | 'local'
  code: null,
  game: null,
  group: null,
  token: null,
  names: [],
  items: [],
  dirty: {},
  unsent: {},
  loaded: false,
  doneSent: false,
  selected: null,
  fresh: null,
  view: 'join',
  built: null,
  draftNames: null,
  pickedGroup: null,
  loop: null,
  pollTimer: null,
  saveTimer: null,
  finishTimer: null,
  saving: false,
  saveAgain: false,
  saveErr: false,
  finishing: false,
  loading: false,
  stopConn: null,
  dnd: null,
  fx: createTimerFx('student', () => ({ start: '질문 나무 시작!', startSub: '바구니의 질문을 끌어서 나무에 놓아요', endSub: '우리 모둠 나무를 선생님께 보내요' })),
  lastGoAt: null,
};

// ════════════════════════════════════════════════
// 이어서 하기
// ════════════════════════════════════════════════

const store = () => (T.target === 'local' ? sessionStorage : localStorage);

function saveSession() {
  if (!T.code) return;
  try {
    store().setItem(
      SESSION_KEY,
      JSON.stringify({ target: T.target, code: T.code, group: T.group, token: T.token, names: T.names, items: T.items, dirty: T.dirty, unsent: T.unsent, loaded: T.loaded, doneSent: T.doneSent })
    );
  } catch (e) {}
}

function loadSession(local) {
  try {
    const raw = (local ? sessionStorage : localStorage).getItem(SESSION_KEY);
    const s = raw ? JSON.parse(raw) : null;
    return s && s.code && (s.target === 'server' || s.target === 'local') ? s : null;
  } catch (e) {
    return null;
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch (e) {}
}

const now = () => (T.cli ? T.cli.serverNow() : Date.now());
const st = () => deriveR3(T.game, now());
const isShared = () => T.target === 'server';
const explain = (e) => explainError(e, 'student');
const canMove = () => {
  const s = st();
  return !!(s && s.status === 'playing' && T.loaded);
};

function topbar(right = '') {
  const sub = T.group ? `${T.group}모둠 태블릿` : '모둠 태블릿용 · 3차시';
  return `<header class="topbar">${brandHtml(sub)}<div class="spacer"></div>${right}</header>`;
}

function soundBtn() {
  const on = isSoundOn('student');
  return `<button type="button" class="btn btn-ghost btn-sm" data-act="sound" id="sound-btn" aria-pressed="${on}">${on ? SOUND_ICON.on : SOUND_ICON.off}${on ? '소리 켜짐' : '소리 꺼짐'}</button>`;
}

function leaveBtn() {
  return `<button type="button" class="btn btn-ghost btn-sm" data-act="exit">나가기</button>`;
}

// ════════════════════════════════════════════════
// 1. 게임 코드 입력
// ════════════════════════════════════════════════

function renderJoin(prefill = '', error = '') {
  stopLoops();
  T.view = 'join';
  T.built = null;
  app.innerHTML = `
    ${topbar(`<a class="btn btn-cream btn-sm" href="index.html">${ICON.back}처음으로</a>`)}
    <section class="card pad-lg center-card" aria-labelledby="h">
      <span class="deco butter" style="width:220px;height:220px;right:-80px;top:-90px"></span>
      <span class="deco green" style="width:160px;height:160px;left:-60px;bottom:-70px"></span>
      <div class="mascot-row" style="margin-bottom:18px">${catSvg(92)}<div class="bubble">우리 모둠 태블릿이에요!<br>선생님이 알려 준 <b>게임 코드</b>를 입력해 봐요.</div></div>
      <h1 id="h" class="sr-only">질문 나무 입장</h1>
      <form id="join-form" class="stack" style="gap:20px" novalidate>
        <div class="field">
          <label for="code">게임 코드</label>
          <input class="input code" id="code" inputmode="numeric" autocomplete="off" maxlength="4" pattern="[0-9]*" placeholder="0000" value="${esc(prefill)}">
        </div>
        <div id="join-err" aria-live="assertive">${error ? `<div class="notice apricot"><div>${esc(error)}</div></div>` : ''}</div>
        <button type="submit" class="btn btn-apricot btn-lg" id="join-btn">들어가기 ${ICON.arrow}</button>
      </form>
    </section>`;
  const codeEl = $('#code');
  codeEl.addEventListener('input', () => {
    codeEl.value = codeEl.value.replace(/\D/g, '').slice(0, 4);
  });
  $('#join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    findGame($('#code').value.trim());
  });
  setTimeout(() => {
    if (T.view === 'join' && $('#code')) $('#code').focus();
  }, 50);
}

function joinError(msg) {
  const box = $('#join-err');
  if (box) box.innerHTML = `<div class="notice apricot"><div>${esc(msg)}</div></div>`;
  const btn = $('#join-btn');
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `들어가기 ${ICON.arrow}`;
  }
}

function candidates() {
  if (urlMode === 'local') return ['local'];
  return hasServer() ? ['server', 'local'] : ['local'];
}

async function findGame(code) {
  if (!/^\d{4}$/.test(code)) return joinError('게임 코드 4자리를 입력해 주세요.');
  const btn = $('#join-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '찾는 중…';
  }
  let lastErr = null;
  for (const target of candidates()) {
    try {
      const cli = await r3Client(target);
      const game = await cli.info(code);
      const sess = loadSession(target === 'local');
      if (sess && sess.code === code && sess.target === target) return restore(sess, cli, game);
      setClient(cli, target);
      resetGame(code);
      T.game = game;
      startLoops();
      render();
      return;
    } catch (e) {
      if (!lastErr || (lastErr.code === 'NO_GAME' && e.code !== 'NO_GAME')) lastErr = e;
    }
  }
  if (!hasServer() && urlMode !== 'local') return joinError('아직 서버가 준비되지 않았어요. 선생님께 알려 주세요.');
  joinError(lastErr ? explain(lastErr) : '게임 코드를 다시 확인해 주세요.');
}

function setClient(cli, target) {
  T.cli = cli;
  T.target = target;
  if (T.stopConn) T.stopConn();
  T.stopConn = watchConnection(cli);
}

function resetGame(code) {
  Object.assign(T, { code, game: null, group: null, token: null, names: [], items: [], dirty: {}, unsent: {}, loaded: false, doneSent: false, selected: null, fresh: null, draftNames: null, pickedGroup: null });
}

function restore(sess, cli, game) {
  setClient(cli, sess.target);
  resetGame(sess.code);
  Object.assign(T, {
    group: sess.group || null,
    token: sess.token || null,
    names: sess.names || [],
    items: Array.isArray(sess.items) ? sess.items : [],
    dirty: sess.dirty || {},
    unsent: sess.unsent || {},
    loaded: !!sess.loaded,
    doneSent: !!sess.doneSent,
  });
  T.game = game;
  startLoops();
  render();
  if (T.group && T.token && game.status !== 'idle') loadMine();
}

// ════════════════════════════════════════════════
// 상태 확인 · 저장
// ════════════════════════════════════════════════

function stopLoops() {
  clearInterval(T.loop);
  clearTimeout(T.pollTimer);
  clearTimeout(T.saveTimer);
  clearTimeout(T.finishTimer);
  T.loop = null;
  T.pollTimer = null;
  T.saveTimer = null;
  T.finishTimer = null;
}

function startLoops() {
  stopLoops();
  T.loop = setInterval(tick, 250);
  poll();
}

function pollDelay() {
  const P = (name) => T.cli.pollMs(name);
  if (document.hidden) return P('hidden');
  const s = st();
  if (!s || s.view === 'lobby') return P('tabletLobby');
  if (s.view === 'play') return P('tabletPlay');
  return P('tabletDone');
}

async function poll() {
  clearTimeout(T.pollTimer);
  if (!T.code || !T.cli) return;
  const code = T.code;
  try {
    const res = await T.cli.poll(code, T.group || '', T.token || '');
    if (T.code !== code) return;
    if (res.gone) return gone('선생님이 게임을 정리했어요. 새 게임 코드를 입력해 주세요.');
    T.game = res.game;
    if (T.group && T.token && res.mine === false) released();
    render();
  } catch (e) {
    if (e.code === 'NO_GAME') return gone('선생님이 게임을 정리했어요. 새 게임 코드를 입력해 주세요.');
  } finally {
    if (T.code === code) T.pollTimer = setTimeout(poll, pollDelay());
  }
}

function released() {
  toast('선생님이 이 태블릿의 모둠 연결을 풀었어요. 모둠을 다시 골라 주세요.', 'warn');
  Object.assign(T, { group: null, token: null, items: [], dirty: {}, unsent: {}, loaded: false, selected: null });
  saveSession();
}

function gone(msg) {
  stopLoops();
  clearSession();
  Object.assign(T, { code: null, game: null, group: null, token: null, items: [] });
  renderJoin('', msg);
}

// 서버의 우리 모둠 질문 + 아직 못 보낸 변경 (선생님이 지운 질문은 빠진다)
function merge(server) {
  const local = new Map(T.items.map((x) => [x.id, x]));
  const out = [];
  (server || []).forEach((x) => {
    const mine = local.get(x.id);
    if (mine && T.dirty[x.id]) out.push({ ...x, zone: mine.zone, at: mine.at });
    else out.push(x);
    local.delete(x.id);
  });
  local.forEach((x) => {
    if (T.unsent[x.id]) out.push(x);
  });
  const ids = new Set(out.map((x) => x.id));
  Object.keys(T.dirty).forEach((id) => {
    if (!ids.has(id)) delete T.dirty[id];
  });
  Object.keys(T.unsent).forEach((id) => {
    if (!ids.has(id) || (server || []).some((x) => x.id === id)) delete T.unsent[id];
  });
  T.items = out;
}

async function loadMine() {
  if (T.loading || !T.token) return;
  T.loading = true;
  const code = T.code;
  try {
    const list = await T.cli.mine(T.code, T.group, T.token);
    if (T.code !== code) return;
    merge(list);
    T.loaded = true;
    saveSession();
    T.built = null;
    render();
    if (Object.keys(T.dirty).length) scheduleSave(200);
  } catch (e) {
    if (e.code === 'NOT_MINE') {
      released();
      render();
    } else setTimeout(() => T.code === code && !T.loaded && loadMine(), 3000);
  } finally {
    T.loading = false;
  }
}

function scheduleSave(ms = SAVE_DELAY) {
  clearTimeout(T.saveTimer);
  T.saveTimer = setTimeout(saveNow, ms);
  drawSaveState();
}

async function saveNow() {
  clearTimeout(T.saveTimer);
  T.saveTimer = null;
  if (!T.token) return;
  const ids = Object.keys(T.dirty);
  const newIds = Object.keys(T.unsent);
  if (!ids.length && !newIds.length) return drawSaveState();
  if (T.saving) {
    T.saveAgain = true;
    return;
  }
  T.saving = true;
  drawSaveState();
  const snap = {};
  const places = {};
  ids.forEach((id) => {
    const x = T.items.find((y) => y.id === id);
    if (x) {
      places[id] = [x.zone, x.at || 0];
      snap[id] = x.at || 0;
    }
  });
  const added = T.items.filter((x) => T.unsent[x.id]).map((x) => ({ id: x.id, text: x.text }));
  const code = T.code;
  try {
    await T.cli.save(T.code, T.group, T.token, places, added);
    if (T.code !== code) return;
    Object.keys(snap).forEach((id) => {
      const x = T.items.find((y) => y.id === id);
      if (!x || (x.at || 0) === snap[id]) delete T.dirty[id];
    });
    added.forEach((a) => delete T.unsent[a.id]);
    T.saveErr = false;
    saveSession();
  } catch (e) {
    if (e.code === 'NOT_MINE') {
      released();
      render();
    } else if (e.code !== 'NOT_STARTED') {
      T.saveErr = true;
      if (T.code === code) T.saveTimer = setTimeout(saveNow, 3000);
    }
  } finally {
    T.saving = false;
    if (T.saveAgain) {
      T.saveAgain = false;
      scheduleSave(300);
    }
    drawSaveState();
    if (T.view === 'done') drawSendStatus();
  }
}

const pending = () => Object.keys(T.dirty).length + Object.keys(T.unsent).length;

function drawSaveState() {
  const el = $('#save-state');
  if (!el) return;
  const n = pending();
  let html;
  let warn = false;
  if (T.saveErr && n) {
    html = '인터넷 연결 확인 중 · 다시 보낼게요';
    warn = true;
  } else if (n || T.saving) html = '저장하는 중…';
  else html = `${ICON.check.replace('stroke="#fff"', 'stroke="currentColor"')}저장됨`;
  el.classList.toggle('warn', warn);
  if (el.innerHTML !== html) el.innerHTML = html;
}

// 활동이 끝나면: 남은 변경을 모두 보내고 "다 보냈어요" 표시
async function finish() {
  if (T.doneSent || T.finishing || !T.token) return;
  clearTimeout(T.finishTimer);
  T.finishing = true;
  const code = T.code;
  try {
    if (pending()) await saveNow();
    if (pending()) throw Object.assign(new Error('PENDING'), { code: 'PENDING' });
    await T.cli.done(T.code, T.group, T.token);
    if (T.code !== code) return;
    T.doneSent = true;
    saveSession();
  } catch (e) {
    if (e.code === 'NOT_MINE') {
      released();
      render();
    } else if (T.code === code) T.finishTimer = setTimeout(finish, 3000);
  } finally {
    T.finishing = false;
    drawSendStatus();
  }
}

function drawSendStatus() {
  const box = $('#send-status');
  if (!box) return;
  let html;
  if (T.doneSent) html = `<div class="notice green"><div><strong>선생님께 우리 모둠 나무를 보냈어요!</strong>선생님 화면에서 모든 모둠 나무를 함께 둘러봐요.</div></div>`;
  else if (!T.token) html = `<div class="notice apricot"><div><strong>나무를 보내지 못했어요</strong>선생님이 이 태블릿의 모둠 연결을 풀었어요. 선생님께 알려 주세요.</div></div>`;
  else if (T.finishTimer) html = `<div class="notice apricot"><div><strong>인터넷 연결을 확인하는 중이에요</strong>잠시 뒤 다시 보내요. 태블릿을 끄지 말고 기다려 주세요.</div></div>`;
  else html = `<div class="notice"><div><strong>우리 모둠 나무를 선생님께 보내는 중…</strong>잠깐만 기다려요.</div></div>`;
  if (box.innerHTML !== html) box.innerHTML = html;
}

// ════════════════════════════════════════════════
// 화면 고르기
// ════════════════════════════════════════════════

function viewFor() {
  if (!T.game) return 'join';
  if (!T.group || !T.token) return T.draftNames ? 'names' : 'pick';
  if (T.draftNames) return 'names';
  const s = st();
  return s.view === 'lobby' ? 'wait' : s.view;
}

function render() {
  if (!T.game) return;
  const view = viewFor();
  if (view !== T.view) {
    T.view = view;
    T.built = null;
    T.selected = null;
    window.scrollTo(0, 0);
  }
  if ((view === 'play' || view === 'done') && !T.loaded && !T.loading) loadMine();
  if (view === 'done' && T.loaded && !T.doneSent) finish();
  if (view === 'pick') renderPick();
  else if (view === 'names') renderNames();
  else renderBoard(view);
}

// ════════════════════════════════════════════════
// 2. 모둠 고르기 · 3. 친구 이름
// ════════════════════════════════════════════════

function renderPick() {
  const sig = JSON.stringify([T.game.groups, T.game.status]);
  if (T.built === 'pick' && T._pickSig === sig) return;
  T._pickSig = sig;
  T.built = 'pick';
  const s = st();
  let cards = '';
  for (let g = 1; g <= T.game.groupCount; g++) {
    const c = groupColor(g);
    const taken = T.game.groups[g];
    cards += `<button type="button" class="group-pick ${taken ? 'taken' : ''}" data-act="pick" data-g="${g}" ${taken ? 'aria-disabled="true"' : ''} style="background:${c.soft};border-color:${c.main}">
      <span class="gt"><span class="badge" style="background:${c.main};color:#3b2a1a">${g}</span>${g}모둠</span>
      <span class="gm">${taken ? esc(taken.names.join(', ')) : '비어 있어요'}</span>
      <span class="gm" style="margin-top:auto"><b>${taken ? '다른 태블릿이 쓰는 중' : '이 모둠으로 들어가기'}</b></span>
    </button>`;
  }
  app.innerHTML = `
    ${topbar(`<span class="chip cream">게임 코드 ${esc(T.code)}</span>${leaveBtn()}`)}
    <section class="card pad" aria-labelledby="h">
      <span class="deco green" style="width:200px;height:200px;right:-70px;top:-80px"></span>
      <div class="mascot-row" style="margin-bottom:16px">${catSvg(80)}<div class="bubble">이 태블릿은 어느 모둠일까요?<br>2차시와 같은 모둠 번호를 눌러요.</div></div>
      <h1 id="h" class="section-title" style="font-size:30px">모둠 고르기</h1>
      ${
        s.view !== 'lobby'
          ? '<div class="notice" style="margin:12px 0"><div><strong>활동이 이미 시작됐어요</strong>모둠을 고르고 이름을 쓰면 우리 모둠 나무에 이어서 함께해요.</div></div>'
          : '<p class="section-desc" style="margin-bottom:16px">선생님이 정해 준 모둠을 눌러요. 우리 모둠이 2차시에 만든 질문이 바구니에 담겨요.</p>'
      }
      <div class="group-picks">${cards}</div>
    </section>`;
}

function pickGroup(g) {
  if (T.game.groups[g]) {
    toast('이 모둠은 이미 다른 태블릿이 쓰고 있어요. 잘못 들어갔다면 선생님께 알려 주세요.', 'warn');
    return;
  }
  T.pickedGroup = String(g);
  T.draftNames = ['', '', '', ''];
  render();
}

function renderNames() {
  const g = T.group || T.pickedGroup;
  const c = groupColor(g);
  const editing = !!T.group;
  if (T.built !== 'names') {
    T.built = 'names';
    app.innerHTML = `
      ${topbar(`<span class="chip cream">게임 코드 ${esc(T.code)}</span>`)}
      <section class="card pad-lg center-card names-card" style="max-width:820px" aria-labelledby="h">
        <span class="deco butter" style="width:220px;height:220px;right:-80px;top:-100px"></span>
        <div class="row" style="margin-bottom:6px">
          <span style="display:inline-flex;align-items:center;gap:12px;padding:10px 18px;border-radius:22px;background:${c.soft};color:${c.ink}"><span class="badge" style="background:${c.main};color:#3b2a1a">${g}</span><b style="font-size:24px">${g}모둠</b></span>
        </div>
        <h1 id="h" class="section-title" style="font-size:30px;margin-top:14px">모둠 친구 이름을 써요</h1>
        <p class="section-desc" style="margin-bottom:18px">오늘은 차례 없이 모둠 친구들이 함께 의논하며 질문을 옮겨요. (${NAME_MAX}글자까지, ${MAX_MEMBERS}명까지)</p>
        ${
          isShared()
            ? `<div class="notice apricot trial-hint"><div><strong>여러 학교가 함께 쓰는 서버예요: 실명 대신 번호나 별명을 써요</strong>예: 1번, 2번 또는 별빛, 구름처럼 써 주세요.</div></div>`
            : ''
        }
        <div id="name-list" class="name-list"></div>
        <div class="row" style="margin-top:12px">
          <button type="button" class="btn btn-cream btn-sm" data-act="name-add" id="name-add">${ICON.plus}친구 더하기</button>
        </div>
        <div id="names-err" aria-live="assertive" style="margin-top:14px"></div>
        <div class="row" style="margin-top:22px">
          <button type="button" class="btn btn-cream" data-act="names-cancel">${editing ? '고치지 않고 돌아가기' : '다른 모둠 고르기'}</button>
          <div class="spacer"></div>
          <button type="button" class="btn btn-apricot btn-lg" data-act="names-save" id="names-save">${editing ? '고친 내용 저장' : '준비 완료!'}</button>
        </div>
      </section>`;
    drawNameRows(true);
  }
}

function drawNameRows(focusFirst = false) {
  const list = $('#name-list');
  if (!list) return;
  const names = T.draftNames;
  list.innerHTML = names
    .map(
      (n, i) => `<div class="name-row">
        <span class="ord">${i + 1}</span>
        <label class="sr-only" for="nm-${i}">${i + 1}번째 친구 이름</label>
        <input class="input" id="nm-${i}" data-i="${i}" maxlength="${NAME_MAX}" autocomplete="off" placeholder="${isShared() ? `예: ${i + 1}번 또는 별명` : `${i + 1}번째 친구 이름`}" value="${esc(n)}">
        <button type="button" class="btn btn-ghost btn-icon" data-act="name-del" data-i="${i}" aria-label="지우기" ${names.length <= 1 ? 'disabled' : ''}>${ICON.x}</button>
      </div>`
    )
    .join('');
  list.querySelectorAll('input').forEach((inp) => {
    inp.addEventListener('input', () => {
      T.draftNames[Number(inp.dataset.i)] = inp.value;
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !isComposingEnter(e)) {
        e.preventDefault();
        const next = $(`#nm-${Number(inp.dataset.i) + 1}`);
        if (next) next.focus();
        else saveNames();
      }
    });
  });
  const add = $('#name-add');
  if (add) add.disabled = names.length >= MAX_MEMBERS;
  if (focusFirst) setTimeout(() => $('#nm-0') && $('#nm-0').focus(), 60);
}

function namesError(msg) {
  const box = $('#names-err');
  if (box) box.innerHTML = msg ? `<div class="notice apricot"><div>${esc(msg)}</div></div>` : '';
}

async function saveNames() {
  const raw = T.draftNames.map((n) => String(n || '').trim()).filter(Boolean);
  if (!raw.length) return namesError('모둠 친구 이름을 한 명 이상 써 주세요.');
  const names = [];
  for (const n of raw) {
    const r = cleanName(n);
    if (!r.ok) return namesError(`"${n}": ${r.message}`);
    names.push(r.name);
  }
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) return namesError(`"${dup}" 이름이 두 번 있어요. 성이나 별명을 붙여 구별해 주세요.`);
  const g = T.group || T.pickedGroup;
  const btn = $('#names-save');
  btn.disabled = true;
  btn.textContent = '저장하는 중…';
  try {
    const res = await T.cli.join(T.code, g, names, T.token || '');
    const changedGroup = String(T.group) !== String(res.group);
    T.group = String(res.group);
    T.token = res.token;
    T.names = names;
    if (changedGroup) Object.assign(T, { items: [], dirty: {}, unsent: {}, loaded: false, doneSent: false });
    if (res.game) T.game = res.game;
    if (res.game && res.game.status !== 'idle') {
      merge(res.items || []);
      T.loaded = true;
    }
    T.draftNames = null;
    T.pickedGroup = null;
    saveSession();
    toast(`${g}모둠으로 들어왔어요!`, 'good');
    render();
    if (pending()) scheduleSave(200);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = T.group ? '고친 내용 저장' : '준비 완료!';
    namesError(explain(e));
    if (e.code === 'GROUP_TAKEN') {
      setTimeout(() => {
        T.draftNames = null;
        T.pickedGroup = null;
        poll();
      }, 2200);
    }
  }
}

// ════════════════════════════════════════════════
// 4. 나무 판 (대기 · 활동 · 끝)
// ════════════════════════════════════════════════

const WAIT_EMPTY = { branch: '시작하면 여기에 가지 질문을 놓아요', trunk: '헷갈리는 질문은 여기에', root: '시작하면 여기에 뿌리 질문을 놓아요' };

function renderBoard(view) {
  const g = T.group;
  const c = groupColor(g);
  if (T.built !== view) {
    T.built = view;
    const playing = view === 'play';
    const top =
      view === 'wait'
        ? `<section class="card pad" style="padding:18px 22px;margin-bottom:14px">
            <div class="row">
              <span style="display:inline-flex;align-items:center;gap:12px;padding:8px 16px;border-radius:20px;background:${c.soft};color:${c.ink}"><span class="badge" style="background:${c.main};color:#3b2a1a">${g}</span><b style="font-size:22px">우리는 ${g}모둠</b></span>
              <div class="row turn-list">${T.names.map((n) => `<span class="pchip" style="cursor:default">${esc(n)}</span>`).join('')}</div>
              <div class="spacer"></div>
              <button type="button" class="btn btn-cream btn-sm" data-act="edit-names">이름 고치기</button>
              <button type="button" class="btn btn-ghost btn-sm" data-act="change-group">모둠 바꾸기</button>
            </div>
            <div class="mascot-row" style="margin-top:14px">${catSvg(70)}<div class="bubble">선생님이 시작하면 <b>질문 바구니</b>에 우리 모둠 질문이 담겨요.<br>모둠 친구들과 의논하며 질문을 끌어서 나무에 놓아요.</div></div>
          </section>`
        : view === 'done'
        ? `<section class="card pad done-banner" style="padding:18px 22px">
            <div class="mascot-row">${catSvg(80)}<div><h1 style="font-size:clamp(26px,3.6vw,38px);margin:0 0 4px">땡! 우리 모둠 질문 나무 완성</h1>
              <p style="margin:0;font-size:18px;color:var(--ink-2)">이제 질문을 옮길 수 없어요.</p></div></div>
            <div id="send-status" style="margin-top:12px"></div>
          </section>`
        : '';
    app.innerHTML = `
      <header class="topbar play-top">${brandHtml(`${g}모둠 태블릿`)}<div class="spacer"></div>
        ${playing ? `<span class="save-state" id="save-state" aria-live="polite"></span>` : ''}
        ${soundBtn()}${view !== 'play' ? leaveBtn() : ''}
      </header>
      ${top}
      <div class="board-top">${keySentenceHtml()}</div>
      <div class="tree-board ${view === 'play' ? '' : 'locked'}" id="board">
        <section class="basket" data-zone="basket" aria-label="질문 바구니">
          <div class="basket-head">${basketIcon(38)}<div><b>${ZONES.basket.name}</b> <span class="tz-n" id="bcount">0</span><div class="tz-desc">${esc(ZONES.basket.desc)}</div></div></div>
          <div class="basket-list" id="blist"></div>
          ${
            playing
              ? `<form class="new-q" id="newq" autocomplete="off" novalidate>
                  <label for="nq">새 질문 쓰기</label>
                  <div class="row"><input class="input" id="nq" maxlength="${TEXT_MAX + 2}" placeholder="질문을 적어주세요."><button type="submit" class="btn btn-cream btn-sm">${ICON.plus}넣기</button></div>
                  <div class="msg" id="nq-msg" aria-live="polite"></div>
                </form>`
              : ''
          }
        </section>
        <div id="tree"></div>
      </div>
      <div id="cover"></div>`;
    if (playing) {
      $('#newq').addEventListener('submit', (e) => {
        e.preventDefault();
        addQuestion();
      });
      $('#nq').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && isComposingEnter(e)) e.preventDefault();
      });
    }
    const board = $('#board');
    T.dnd = enableDnd(board, {
      canDrag: canMove,
      onDrop: (id, zone) => moveItem(id, zone),
      onTap: (id) => select(id),
      onZoneTap: (zone) => {
        if (T.selected) moveItem(T.selected, zone);
      },
    });
    T._boardSig = null;
  }
  drawBoard();
  if (view === 'play') {
    drawSaveState();
    updateCover(st());
  }
  if (view === 'done') drawSendStatus();
}

function drawBoard() {
  const board = $('#board');
  if (!board) return;
  const view = T.view;
  const items = view === 'wait' ? [] : T.items;
  const sig = JSON.stringify([view, T.loaded, items.map((x) => [x.id, x.zone, x.at, x.text]), T.selected]);
  if (sig === T._boardSig) return;
  T._boardSig = sig;
  const list = $('#blist');
  const keep = list.scrollTop;
  const basket = byZone(items).basket;
  $('#bcount').textContent = basket.length;
  if (view === 'wait') list.innerHTML = '<div class="tz-empty">선생님이 시작하면<br>우리 모둠 질문이 담겨요</div>';
  else if (!T.loaded) list.innerHTML = '<div class="tz-empty">질문 바구니를 채우는 중이에요…</div>';
  else
    list.innerHTML = basket.length
      ? basket.map((x) => cardHtml(x, { selected: T.selected === x.id, fresh: T.fresh === x.id })).join('')
      : `<div class="tz-empty">${items.length ? '바구니가 비었어요! 모든 질문을 나무에 놓았어요.' : '우리 모둠 질문이 없어요. 아래에서 새 질문을 써 봐요.'}</div>`;
  list.scrollTop = keep;
  $('#tree').innerHTML = treeHtml(items, { mode: 'board', selected: T.selected, fresh: T.fresh, emptyText: view === 'wait' ? WAIT_EMPTY : null });
  board.classList.toggle('is-selecting', !!T.selected);
  T.fresh = null;
}

function select(id) {
  if (!canMove()) return;
  T.selected = T.selected === id ? null : id;
  drawBoard();
  if (T.selected && !T._tapTip) {
    T._tapTip = true;
    toast('놓을 자리를 누르면 옮겨져요. 끌어서 놓아도 돼요.');
  }
}

function moveItem(id, zone) {
  if (!canMove() || !ZONES[zone]) return;
  const x = T.items.find((y) => y.id === id);
  T.selected = null;
  if (!x) return drawBoard();
  if (x.zone !== zone) {
    x.zone = zone;
    x.at = now();
    T.dirty[id] = true;
    T.fresh = id;
    saveSession();
    scheduleSave();
    if (isSoundOn('student')) tickSound({ vol: 0.3 });
  }
  drawBoard();
}

function addQuestion() {
  if (!canMove()) return;
  const inp = $('#nq');
  const msg = $('#nq-msg');
  const cq = cleanQuestion(inp.value);
  if (!cq.ok) {
    msg.textContent = cq.message;
    inp.focus();
    return;
  }
  if (cq.text.length > TEXT_MAX) {
    msg.textContent = `${TEXT_MAX}글자 안으로 줄여 볼까요?`;
    return;
  }
  if (T.items.filter((x) => x.isNew).length >= NEW_MAX) {
    msg.textContent = `새 질문은 ${NEW_MAX}개까지 쓸 수 있어요.`;
    return;
  }
  const same = T.items.find((x) => sameQuestion(x.text, cq.text));
  if (same) {
    msg.textContent = `이미 있는 질문이에요: "${same.text}"`;
    return;
  }
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  const id = 'n' + Date.now().toString(36) + [...a].map((b) => b.toString(36)).join('').slice(0, 8);
  const no = T.items.reduce((m, x) => Math.max(m, Number(x.no) || 0), 0) + 1;
  T.items.push({ id, no, text: cq.text, zone: 'basket', isNew: true, src: '', srcNo: null, at: now() });
  T.unsent[id] = true;
  T.fresh = id;
  inp.value = '';
  msg.textContent = cq.addedMark ? '물음표를 붙여서 바구니에 넣었어요.' : '바구니에 넣었어요. 끌어서 나무에 놓아요.';
  saveSession();
  scheduleSave(400);
  drawBoard();
  const list = $('#blist');
  if (list) list.scrollTop = list.scrollHeight;
  if (isSoundOn('student')) beep({ freq: 1318, dur: 0.09, vol: 0.25 });
}

function updateCover(s) {
  const cover = $('#cover');
  if (!cover) return;
  let html = '';
  let key = '';
  if (s.status === 'paused') {
    key = 'p';
    html = `<div class="pause-cover" role="dialog" aria-label="잠깐 멈춤">${catSvg(110)}<div>잠깐 멈췄어요</div><div style="font-size:19px;font-weight:400;color:var(--ink-2)">선생님이 다시 시작하면 이어서 해요.</div></div>`;
  } else if (s.status === 'ready') {
    const sec = Math.max(1, Math.ceil((Number(s.goAt) - now()) / 1000));
    const again = Number(s.goAt) !== Number(s.startedAt);
    key = 'r' + sec;
    html = `<div class="pause-cover ready-cover" role="status">${catSvg(100)}<div>${again ? '곧 다시 시작해요!' : '곧 질문 나무를 시작해요!'}</div><div class="ready-num">${sec}</div>
      <div style="font-size:19px;font-weight:400;color:var(--ink-2)">모둠 친구들이 태블릿 앞에 모여요</div></div>`;
  }
  if (cover.dataset.key !== key) {
    cover.dataset.key = key;
    cover.innerHTML = html;
  }
}

// ════════════════════════════════════════════════
// 시계
// ════════════════════════════════════════════════

function tick() {
  if (!T.game) return;
  const s = st();
  const t = now();
  if (T.group && T.token) T.fx.update(s, t);
  if (s.status === 'playing' && s.goAt && Number(s.goAt) !== Number(s.startedAt) && T.lastGoAt !== s.goAt && t - Number(s.goAt) < 3000 && T.view === 'play') {
    T.lastGoAt = s.goAt;
    if (isSoundOn('student')) bell({ strikes: 1, base: 880 });
    flashBanner('다시 시작!', '', 1400);
  }
  const view = viewFor();
  if (view !== T.view) return render();
  if (view === 'play') {
    updateCover(s);
    if (s.status !== 'playing' && T.selected) {
      T.selected = null;
      drawBoard();
    }
  }
}

// ════════════════════════════════════════════════
// 클릭 처리
// ════════════════════════════════════════════════

app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const i = Number(el.dataset.i);
  switch (el.dataset.act) {
    case 'pick':
      pickGroup(el.dataset.g);
      break;
    case 'name-add':
      if (T.draftNames.length < MAX_MEMBERS) {
        T.draftNames.push('');
        drawNameRows();
        const last = $(`#nm-${T.draftNames.length - 1}`);
        if (last) last.focus();
      }
      break;
    case 'name-del':
      T.draftNames.splice(i, 1);
      drawNameRows();
      break;
    case 'names-save':
      saveNames();
      break;
    case 'names-cancel':
      T.draftNames = null;
      T.pickedGroup = null;
      render();
      break;
    case 'edit-names':
      T.draftNames = T.names.slice();
      render();
      break;
    case 'change-group': {
      const ok = await confirmBox({ title: '모둠을 바꿀까요?', body: '이 태블릿이 지금 모둠에서 빠지고, 모둠 고르기 화면으로 가요.', ok: '모둠 바꾸기' });
      if (!ok) return;
      try {
        const res = await T.cli.leave(T.code, T.group, T.token);
        if (res && res.game) T.game = res.game;
      } catch (err) {}
      Object.assign(T, { group: null, token: null, items: [], dirty: {}, unsent: {}, loaded: false, doneSent: false });
      saveSession();
      render();
      break;
    }
    case 'sound':
      setSoundOn('student', !isSoundOn('student'));
      document.querySelectorAll('#sound-btn').forEach((b) => (b.outerHTML = soundBtn()));
      if (isSoundOn('student')) {
        unlockAudio();
        beep({ freq: 880, dur: 0.12, vol: 0.3 });
      }
      toast(isSoundOn('student') ? '이 태블릿에서도 효과음이 나요.' : '이 태블릿의 효과음을 껐어요.');
      break;
    case 'exit': {
      const s = st();
      const playing = s && s.view === 'play';
      const ok = await confirmBox({
        title: '활동에서 나갈까요?',
        body: playing ? '활동이 진행 중이에요. 나가면 아직 보내지 못한 나무가 선생님께 가지 않을 수 있어요.' : '나가면 처음 화면으로 돌아가요.',
        ok: '나가기',
        danger: true,
      });
      if (!ok) return;
      if (T.group && T.token && s && s.view === 'lobby') T.cli.leave(T.code, T.group, T.token).catch(() => {});
      stopLoops();
      clearSession();
      location.href = 'index.html';
      break;
    }
  }
});

document.addEventListener('visibilitychange', () => {
  if (!T.code) return;
  if (document.hidden) {
    if (pending()) saveNow();
  } else {
    poll();
    if (pending()) scheduleSave(200);
  }
});

// ════════════════════════════════════════════════
// 시작
// ════════════════════════════════════════════════

const params = new URLSearchParams(location.search);
const urlCode = (params.get('code') || '').replace(/\D/g, '').slice(0, 4);
const urlMode = params.get('mode') === 'local' ? 'local' : null;

(async function boot() {
  const sess = urlMode === 'local' ? loadSession(true) : loadSession(false) || loadSession(true);
  if (sess && (!urlCode || urlCode === sess.code) && (!urlMode || sess.target === 'local')) {
    try {
      const cli = await r3Client(sess.target);
      const game = await cli.info(sess.code);
      restore(sess, cli, game);
      return;
    } catch (e) {
      if (e.code === 'NO_GAME' || e.code === 'EXPIRED') clearSession();
      else {
        T.target = sess.target;
        renderJoin(sess.code, explain(e));
        return;
      }
    }
  }
  renderJoin(urlCode);
  if (urlCode) findGame(urlCode);
})();
