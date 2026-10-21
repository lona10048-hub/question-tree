// 선생님 화면 (3차시 질문 나무)
// 질문 불러오기(2차시 CSV · 붙여 넣기) → 대기실 → 진행(뜻 설명 · 모둠 진행 정도, 제한 시간 없음) → 끝나면 모든 모둠 나무 공개 → CSV · 그림 저장
// 진행 중에는 모둠 나무 내용을 보여 주지 않는다.

import { $, esc, toast, openModal, confirmBox, qrSvg, copyText, downloadText, csvCell, watchConnection, brandHtml, catSvg, ICON } from './ui.js';
import { groupColor } from './game.js';
import { createTimerFx, isSoundOn, setSoundOn, SOUND_ICON, bell, beep, flashBanner } from './effects.js';
import { SERVER_RULES } from './config.js';
import { explainError, hasServer } from './api.js';
import { r3Client, deriveR3 } from './r3api.js';
import { ZONES, ZONE_ORDER, KEY_SENTENCE, MAX_GROUPS, PER_GROUP, THEME_MAX, readQuestionsCsv, readPasted } from './content.js';
import { treeHtml, basketHtml, legendHtml, legendItemHtml, keySentenceHtml, byZone, downloadTreePng, treeIcon } from './treeview.js';

const app = document.getElementById('app');
const FORM_KEY = 'qr3-teacher-form';
const SEEN_FRESH_MS = 15000;
const FAST_ITEMS_MS = 60000;
const KEEP_H = SERVER_RULES.keepHours;

const S = {
  cli: null,
  mode: null,
  code: null,
  game: null,
  seen: {},
  progress: {},
  items: null,
  itemsSig: '',
  itemsTimer: null,
  itemsSince: 0,
  view: 'home',
  built: null,
  builtSig: '',
  form: loadForm(),
  loop: null,
  pollTimer: null,
  stopConn: null,
  fx: createTimerFx('teacher', () => ({ start: '질문 나무 시작!', startSub: '바구니의 질문을 나무에 옮겨 봐요', endSub: '모둠 나무를 함께 둘러봐요' })),
  ending: false,
  lastGoAt: null,
};

function defaultMode() {
  return hasServer() ? 'server' : 'local';
}

function loadForm() {
  const base = { mode: defaultMode(), source: 'csv', csv: null, pasteText: '', pasteGroups: 6, themeName: '' };
  try {
    const saved = JSON.parse(localStorage.getItem(FORM_KEY) || '{}');
    if (saved.pasteGroups >= 1 && saved.pasteGroups <= MAX_GROUPS) base.pasteGroups = saved.pasteGroups;
    if (saved.source === 'paste') base.source = 'paste';
  } catch (e) {}
  return base;
}

function saveForm() {
  const f = S.form;
  try {
    localStorage.setItem(FORM_KEY, JSON.stringify({ pasteGroups: f.pasteGroups, source: f.source }));
  } catch (e) {}
}

function explain(e) {
  const c = (e && e.code) || '';
  if (c === 'NO_QUESTIONS') return '불러온 질문이 없어요.';
  if (c === 'NO_ITEM') return '이미 지워진 질문이에요.';
  return explainError(e, 'teacher');
}

function topbar(right = '') {
  return `<header class="topbar">${brandHtml('선생님용 · 3차시')}<div class="spacer"></div>${right}</header>`;
}

function setLayout(mode) {
  app.classList.toggle('wide', mode === 'board' || mode === 'wide');
  app.classList.toggle('board-mode', mode === 'board');
}

const now = () => (S.cli ? S.cli.serverNow() : Date.now());
const st = () => deriveR3(S.game, now());
const joinedGroups = () =>
  Object.keys((S.game && S.game.groups) || {})
    .map(Number)
    .sort((a, b) => a - b);
const namesOf = (g) => ((S.game && S.game.groups[g] && S.game.groups[g].names) || []).slice();
const isFresh = (g) => S.seen[g] && now() - S.seen[g] < SEEN_FRESH_MS;
const doneOf = (g) => !!(S.game && S.game.done && S.game.done[g]);
const keepNote = () => (S.mode === 'local' ? '연습 모드 게임은 이 컴퓨터에만 남아 있어요.' : `게임 코드와 질문은 게임을 만든 뒤 ${KEEP_H}시간 동안 남아 있다가 저절로 지워져요.`);

// ════════════════════════════════════════════════
// 1. 질문 불러오기 (처음 화면)
// ════════════════════════════════════════════════

function showHome() {
  closeGame();
  S.view = 'home';
  S.built = null;
  history.replaceState(null, '', 'teacher.html');
  renderHome();
  loadGameList();
}

function renderHome() {
  setLayout('normal');
  app.innerHTML = `
    ${topbar(`<a class="btn btn-cream btn-sm" href="index.html">${ICON.back}처음으로</a>`)}
    <section class="card pad-lg" aria-labelledby="h">
      <span class="deco green" style="width:260px;height:260px;right:-90px;top:-110px"></span>
      <div class="eyebrow">선생님용 · 활동 준비</div>
      <h1 id="h" style="font-size:clamp(32px,4vw,46px);margin:10px 0 6px">질문 나무 만들기</h1>
      <p class="section-desc" style="font-size:19px;margin-bottom:20px">2차시에 만든 질문을 불러오면, 모둠 태블릿의 질문 바구니에 우리 모둠 질문이 담겨요.</p>
      <div id="home-form"></div>
    </section>
    <section class="card pad" style="margin-top:22px" aria-labelledby="rl">
      <h2 class="section-title" id="rl">지난 게임 이어서 하기</h2>
      <p class="section-desc" id="rl-desc"></p>
      <div class="room-list" id="room-list" style="margin-top:14px"><div class="empty-state" style="padding:16px">불러오는 중…</div></div>
    </section>`;
  renderForm();
}

function serverNotice() {
  const f = S.form;
  if (f.mode === 'local')
    return `<div class="notice apricot"><div><strong>연습 모드예요</strong>이 컴퓨터의 여러 창에서만 미리 해 볼 수 있어요. 학생 태블릿은 들어올 수 없어요.${
      hasServer() ? `<div style="margin-top:10px"><button type="button" class="btn btn-cream btn-sm" data-act="practice">수업 모드로 돌아가기</button></div>` : ''
    }</div></div>`;
  return `<div class="notice green"><div><strong>준비할 것 없이 바로 시작해요</strong>질문을 불러오고 게임 코드를 만들면 모둠 태블릿이 바로 들어올 수 있어요. 질문은 게임을 만든 뒤 <b>${KEEP_H}시간</b>이 지나면 저절로 지워지니, 활동이 끝나면 <b>CSV</b>나 <b>그림</b>으로 저장해 두세요.<div style="margin-top:10px"><button type="button" class="btn btn-cream btn-sm" data-act="practice">인터넷 없이 이 컴퓨터에서 연습해 보기</button></div></div></div>`;
}

// 지금 불러온 질문: [{g, text, src, srcNo}]
function questionsToSend() {
  const f = S.form;
  if (f.source === 'csv' && f.csv && f.csv.byGroup) {
    const out = [];
    Object.keys(f.csv.groups)
      .map(Number)
      .sort((a, b) => a - b)
      .forEach((g) => f.csv.groups[g].forEach((x) => out.push({ g, ...x })));
    return out;
  }
  const list = sharedList();
  const out = [];
  for (let g = 1; g <= f.pasteGroups; g++) list.forEach((x) => out.push({ g, ...x }));
  return out;
}

function sharedList() {
  const f = S.form;
  if (f.source === 'csv') return f.csv && !f.csv.byGroup ? f.csv.list : [];
  return readPasted(f.pasteText);
}

function groupCountToSend() {
  const f = S.form;
  if (f.source === 'csv' && f.csv && f.csv.byGroup) return f.csv.groupCount;
  return f.pasteGroups;
}

function previewHtml() {
  const f = S.form;
  if (f.source === 'csv' && f.csv && f.csv.byGroup) {
    const gs = [];
    for (let g = 1; g <= f.csv.groupCount; g++) gs.push(g);
    return `<div class="load-sum"><span class="chip">${esc(f.csv.fileName)}</span><span class="chip cream">질문 ${f.csv.count}개 · ${f.csv.groupCount}모둠</span>${
      f.csv.skipped ? `<span class="chip apricot">겹치거나 모둠이 없는 ${f.csv.skipped}개는 뺐어요</span>` : ''
    }<span class="spacer"></span><button type="button" class="btn btn-ghost btn-sm" data-act="csv-clear">다른 파일 올리기</button></div>
      <p class="section-desc" style="margin:10px 0 0;font-size:16px">각 모둠 태블릿에는 그 모둠이 2차시에 만든 질문만 담겨요. 빼고 싶은 질문은 × 를 눌러요.</p>
      <div class="preview-grid">${gs
        .map((g) => {
          const c = groupColor(g);
          const list = f.csv.groups[g] || [];
          return `<div class="pv"><div class="ph" style="background:${c.soft};color:${c.ink}"><span class="badge" style="background:${c.main};color:#3b2a1a">${g}</span>${g}모둠<span class="spacer"></span><span style="font-weight:400">질문 ${list.length}개</span></div>
            <ul>${list.length ? list.map((x, i) => `<li><span>${esc(x.text)}</span><button type="button" data-act="pv-del" data-g="${g}" data-i="${i}" aria-label="빼기">×</button></li>`).join('') : '<li><span style="color:var(--ink-3)">질문이 없어요 · 이 모둠 바구니는 비어 있어요</span></li>'}</ul></div>`;
        })
        .join('')}</div>`;
  }
  const list = sharedList();
  if (!list.length) return '';
  return `<div class="load-sum"><span class="chip cream">질문 ${list.length}개</span><span class="chip butter">모든 모둠에 같은 질문이 들어가요</span>${
    f.source === 'csv' ? `<span class="spacer"></span><button type="button" class="btn btn-ghost btn-sm" data-act="csv-clear">다른 파일 올리기</button>` : ''
  }</div>
    <div class="field" style="margin-top:14px"><div class="field-label">모둠 수</div>
      <div class="stepper">
        <button type="button" class="btn btn-cream btn-icon" data-act="pg-dec" aria-label="모둠 하나 줄이기" ${f.pasteGroups <= 1 ? 'disabled' : ''}>−</button>
        <span class="value" aria-live="polite">${f.pasteGroups}</span>
        <button type="button" class="btn btn-cream btn-icon" data-act="pg-inc" aria-label="모둠 하나 늘리기" ${f.pasteGroups >= MAX_GROUPS ? 'disabled' : ''}>+</button>
        <span style="color:var(--ink-3);font-size:17px">모둠 (1~${MAX_GROUPS}) · 모둠마다 태블릿 1대</span>
      </div>
    </div>`;
}

function renderForm() {
  const box = $('#home-form');
  if (!box) return;
  const f = S.form;
  const qn = questionsToSend().length;
  const loaded = f.source === 'csv' ? !!f.csv : sharedList().length > 0;
  const source =
    f.source === 'csv'
      ? f.csv
        ? previewHtml()
        : `<label class="drop" id="drop" for="file">${ICON.upload}<b>2차시 CSV 파일 올리기</b><span>「질문 룰렛 놀이」 선생님 화면에서 <b>질문 내려받기 (CSV)</b>로 받은 파일을 골라요.<br>파일을 여기로 끌어다 놓아도 돼요.</span></label>
           <input type="file" id="file" accept=".csv,text/csv" class="hidden">`
      : `<div class="paste-box"><label for="paste" class="sr-only">질문 붙여 넣기</label>
          <textarea class="input" id="paste" placeholder="한 줄에 질문 하나씩 써요.&#10;쉬는 시간은 학생에게 어떤 영향을 줄까?&#10;쉬는 시간은 얼마나 길까?">${esc(f.pasteText)}</textarea>
          <p class="section-desc" style="font-size:15px;margin:6px 0 0">2차시를 하지 않았을 때 써요. 줄 앞의 번호나 기호는 저절로 떼어져요. (${PER_GROUP}개까지)</p>
        </div><div id="paste-preview">${previewHtml()}</div>`;

  box.innerHTML = `
    ${serverNotice()}
    <div class="setup-grid" style="margin-top:28px">
      <div class="full field">
        <div class="field-label"><span class="form-num">1</span>질문 불러오기</div>
        <div class="seg" role="group" aria-label="질문 불러오는 방법" style="margin-bottom:14px">
          <button type="button" data-act="source" data-v="csv" aria-pressed="${f.source === 'csv'}">2차시 CSV 파일</button>
          <button type="button" data-act="source" data-v="paste" aria-pressed="${f.source === 'paste'}">질문 붙여 넣기</button>
        </div>
        ${source}
      </div>
      <div class="full field">
        <div class="field-label"><span class="form-num">2</span>주제 <span style="font-weight:400;color:var(--ink-3);font-size:16px">· 선택</span></div>
        <input class="input" id="theme" maxlength="${THEME_MAX}" autocomplete="off" placeholder="예: 학교" value="${esc(f.themeName)}" style="max-width:320px">
      </div>
      <div class="full field">
        <div class="field-label"><span class="form-num">3</span>학생 나무에 적히는 말</div>
        ${keySentenceHtml()}
        <div style="margin-top:12px">${legendHtml()}</div>
      </div>
    </div>
    <div class="row" style="margin-top:34px;justify-content:flex-end">
      <span style="color:var(--ink-3);font-size:17px" id="create-sum">${esc(summary())}</span>
      <button type="button" class="btn btn-primary btn-lg" data-act="create" id="create-btn" ${loaded && qn ? '' : 'disabled'}>게임 코드 만들기</button>
    </div>`;

  const theme = $('#theme');
  theme.addEventListener('input', () => {
    f.themeName = theme.value;
    $('#create-sum').textContent = summary();
  });
  const file = $('#file');
  if (file) file.addEventListener('change', () => file.files[0] && readFile(file.files[0]));
  const drop = $('#drop');
  if (drop) {
    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('over');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      const fl = e.dataTransfer.files && e.dataTransfer.files[0];
      if (fl) readFile(fl);
    });
  }
  const paste = $('#paste');
  if (paste)
    paste.addEventListener('input', () => {
      f.pasteText = paste.value;
      $('#paste-preview').innerHTML = previewHtml();
      $('#create-btn').disabled = !questionsToSend().length;
      $('#create-sum').textContent = summary();
    });
}

function summary() {
  const f = S.form;
  const n = questionsToSend().length;
  return `${f.mode === 'local' ? '연습 모드 · ' : ''}${n ? `질문 ${n}개 · ${groupCountToSend()}모둠` : '질문을 불러와 주세요'}${f.themeName.trim() ? ' · ' + f.themeName.trim() : ''}`;
}

// 엑셀에서 다시 저장한 CSV는 한글이 EUC-KR일 수 있어서, UTF-8로 읽다가 깨지면 EUC-KR로 다시 읽는다
async function readFile(file) {
  try {
    const buf = await file.arrayBuffer();
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch (e) {
      text = new TextDecoder('euc-kr').decode(buf);
    }
    const r = readQuestionsCsv(text);
    if (r.error) return toast(r.error, 'warn');
    S.form.csv = { ...r, fileName: file.name };
    if (r.themeName && !S.form.themeName) S.form.themeName = r.themeName;
    renderForm();
    toast(`질문 ${r.count}개를 불러왔어요.`, 'good');
  } catch (e) {
    toast('파일을 읽지 못했어요. CSV 파일인지 확인해 주세요.', 'warn');
  }
}

function statusLabel(g) {
  if (g.status === 'idle') return ['대기 중', 'cream'];
  if (g.status === 'ended') return ['끝 · 둘러보기', 'cream'];
  return ['진행 중', 'butter'];
}

function leftLabel(expiresAt) {
  if (!expiresAt) return '';
  const ms = expiresAt - Date.now();
  if (ms <= 0) return '곧 정리돼요';
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `${Math.max(1, Math.round(ms / 60000))}분 뒤 정리`;
  if (h < 48) return `${h}시간 뒤 정리`;
  return `${Math.floor(h / 24)}일 뒤 정리`;
}

async function loadGameList() {
  const box = $('#room-list');
  if (!box) return;
  const mode = S.form.mode;
  const desc = $('#rl-desc');
  if (desc) desc.textContent = mode === 'local' ? '이 컴퓨터에서 연습 모드로 만든 게임이에요.' : `이 브라우저에서 만든 게임이에요. 게임을 만든 뒤 ${KEEP_H}시간이 지나면 질문까지 모두 지워져요.`;
  try {
    const cli = await r3Client(mode);
    const games = await cli.listGames();
    if (!$('#room-list') || S.form.mode !== mode) return;
    if (!games.length) {
      box.innerHTML = `<div class="empty-state" style="padding:14px">아직 만든 게임이 없어요.</div>`;
      return;
    }
    box.innerHTML = games
      .slice(0, 12)
      .map((g) => {
        const [label, tone] = statusLabel(g);
        const when = g.createdAt ? new Date(g.createdAt).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
        return `<div class="room-item">
          <span class="rc">${esc(g.code)}</span>
          <span class="chip ${tone}">${label}</span>
          ${g.themeName ? `<span style="color:var(--ink-2);font-weight:700">${esc(g.themeName)}</span>` : ''}
          <span style="color:var(--ink-3)">${esc(when)} · 태블릿 ${g.joined}/${g.groupCount} · ${esc(leftLabel(g.expiresAt))}</span>
          <span class="spacer"></span>
          <button type="button" class="btn btn-primary btn-sm" data-act="open-room" data-code="${esc(g.code)}">이어서 열기</button>
          <button type="button" class="btn btn-danger btn-sm" data-act="del-room" data-code="${esc(g.code)}">${ICON.trash}지우기</button>
        </div>`;
      })
      .join('');
  } catch (e) {
    console.warn(e);
    if ($('#room-list') && S.form.mode === mode) box.innerHTML = `<div class="notice apricot"><div>${esc(explain(e))}</div></div>`;
  }
}

async function createGame() {
  const f = S.form;
  const questions = questionsToSend();
  if (!questions.length) return toast('질문을 먼저 불러와 주세요.', 'warn');
  const btn = $('#create-btn');
  btn.disabled = true;
  btn.textContent = '만드는 중…';
  try {
    const cli = await r3Client(f.mode);
    const res = await cli.createGame({ groupCount: groupCountToSend(), durationSec: 0, themeName: f.themeName.trim(), questions });
    // 예전 서버 코드(1.3.0)는 제한 시간을 없앨 줄 몰라 1분짜리 게임을 만든다 → 지우고 알린다
    if (res.game && res.game.durationSec) {
      cli.deleteGame(res.code).catch(() => {});
      const err = new Error('OLD_SERVER');
      err.code = 'UNKNOWN_ACTION';
      throw err;
    }
    saveForm();
    await openGame(f.mode, res.code, { game: res.game, cli });
  } catch (e) {
    console.warn(e);
    toast('게임을 만들지 못했어요. ' + explain(e), 'warn');
    btn.disabled = false;
    btn.textContent = '게임 코드 만들기';
  }
}

// ════════════════════════════════════════════════
// 게임 열기 · 상태 받아오기
// ════════════════════════════════════════════════

function closeGame() {
  clearInterval(S.loop);
  clearTimeout(S.pollTimer);
  clearTimeout(S.itemsTimer);
  if (S.stopConn) S.stopConn();
  Object.assign(S, { loop: null, pollTimer: null, itemsTimer: null, stopConn: null, code: null, game: null, seen: {}, progress: {}, items: null, itemsSig: '', built: null, builtSig: '', lastGoAt: null });
}

async function openGame(mode, code, preset = {}) {
  closeGame();
  app.innerHTML = `<div class="empty-state">게임을 여는 중이에요…</div>`;
  const cli = preset.cli || (await r3Client(mode));
  const first = preset.game ? { game: preset.game, seen: {}, progress: {} } : await cli.view(code);
  Object.assign(S, { cli, mode, code, game: first.game, seen: first.seen || {}, progress: first.progress || {} });
  history.replaceState(null, '', `teacher.html?room=${code}&mode=${mode}`);
  S.stopConn = watchConnection(cli);
  S.loop = setInterval(tick, 250);
  render();
  poll();
}

async function poll() {
  clearTimeout(S.pollTimer);
  if (!S.code) return;
  const code = S.code;
  try {
    const res = await S.cli.view(code);
    if (S.code !== code) return;
    S.game = res.game;
    S.seen = res.seen || {};
    S.progress = res.progress || {};
    render();
  } catch (e) {
    if (S.code !== code) return;
    if (e.code === 'NO_GAME') {
      toast('게임이 정리되었어요.');
      return showHome();
    }
    if (e.code === 'NOT_OWNER') {
      toast(explain(e), 'warn');
      return showHome();
    }
  } finally {
    if (S.code === code) S.pollTimer = setTimeout(poll, S.cli.pollMs(document.hidden ? 'hidden' : 'teacher'));
  }
}

// 끝난 뒤 둘러보기: 처음 1분은 자주(마지막 저장을 받으려고), 그다음은 가끔
async function loadItems() {
  clearTimeout(S.itemsTimer);
  if (!S.code || S.view !== 'done') return;
  const code = S.code;
  try {
    const map = await S.cli.teacherItems(code);
    if (S.code !== code) return;
    setItems(map);
  } catch (e) {
    if (S.items === null && S.code === code) {
      S.items = {};
      S.itemsSig = 'err';
      render();
    }
  } finally {
    if (S.code === code && S.view === 'done') {
      const fast = Date.now() - S.itemsSince < FAST_ITEMS_MS;
      S.itemsTimer = setTimeout(loadItems, S.cli.pollMs(document.hidden ? 'hidden' : fast ? 'items' : 'itemsSlow'));
    }
  }
}

function setItems(map) {
  const sig = JSON.stringify(map || {});
  S.items = map || {};
  if (sig !== S.itemsSig) {
    S.itemsSig = sig;
    render();
  }
}

function render() {
  if (!S.code || !S.game) return;
  const view = st().view;
  if (view !== S.view) {
    S.view = view;
    S.built = null;
    S.builtSig = '';
    window.scrollTo(0, 0);
    if (view === 'done') {
      S.items = null;
      S.itemsSig = '';
      S.itemsSince = Date.now();
      loadItems();
    }
  }
  if (view === 'lobby') renderLobby();
  else if (view === 'play') renderBoard();
  else renderDone();
}

function joinUrl() {
  const u = new URL('student.html', location.href);
  u.search = '';
  u.searchParams.set('code', S.code);
  Object.entries(S.cli.linkParams()).forEach(([k, v]) => u.searchParams.set(k, v));
  return u.toString();
}

function shortJoin() {
  const u = new URL('student.html', location.href);
  return u.host + u.pathname;
}

// ════════════════════════════════════════════════
// 2. 대기실
// ════════════════════════════════════════════════

function settingChips() {
  const g = S.game;
  return `${S.mode === 'local' ? '<span class="chip apricot">연습 모드</span>' : ''}<span class="chip cream">${g.groupCount}모둠</span>${
    g.themeName ? `<span class="chip cream">${esc(g.themeName)}</span>` : ''
  }`;
}

function joinCardHtml() {
  const tiles = S.code
    .split('')
    .map((d) => `<span>${esc(d)}</span>`)
    .join('');
  const share =
    S.mode !== 'local'
      ? `<div class="qr-box" aria-label="모둠 태블릿 입장 QR 코드">${qrSvg(joinUrl())}</div>
         <p class="join-url">모둠 태블릿으로 QR을 찍거나<br><b>${esc(shortJoin())}</b> 에서 코드를 입력해요</p>
         <div class="row" style="justify-content:center"><button type="button" class="btn btn-cream btn-sm" data-act="copy-link">${ICON.copy}입장 링크 복사</button></div>`
      : `<div class="notice" style="text-align:left"><div><strong>연습 모드예요</strong>이 컴퓨터에서 모둠 태블릿 창을 여러 개 열어 미리 해 볼 수 있어요. 다른 기기에서는 들어올 수 없어요.</div></div>
         <div class="row" style="justify-content:center"><button type="button" class="btn btn-apricot btn-sm" data-act="open-student">모둠 태블릿 창 열기</button></div>`;
  return `<div class="eyebrow" style="text-align:center">게임 코드</div>
    <div class="code-tiles" style="margin:14px 0 20px" aria-label="게임 코드 ${esc(S.code.split('').join(' '))}">${tiles}</div>
    <div class="stack" style="gap:14px">${share}</div>`;
}

function renderLobby() {
  if (S.built !== 'lobby') {
    S.built = 'lobby';
    setLayout('normal');
    app.innerHTML = `
      ${topbar(`${settingChips()}<button type="button" class="btn btn-cream btn-sm" data-act="home">${ICON.back}게임 목록</button>`)}
      <div class="lobby">
        <section class="card pad" aria-label="입장 안내">
          <span class="deco butter" style="width:180px;height:180px;left:-70px;top:-80px"></span>
          ${joinCardHtml()}
        </section>
        <section class="stack" style="gap:18px">
          <div class="card pad" style="padding:24px 28px">
            <span class="deco green" style="width:200px;height:200px;right:-70px;top:-90px"></span>
            <div class="row">
              <div>
                <h1 class="section-title" style="font-size:30px">모둠 대기실</h1>
                <p class="section-desc" id="lobby-desc">모둠 태블릿이 들어와 친구 이름을 쓰면 여기에 보여요.</p>
              </div>
              <div class="spacer"></div>
              <span class="chip" id="count">0모둠</span>
              <button type="button" class="btn btn-apricot btn-lg" data-act="start" id="start-btn">${ICON.play}질문 나무 시작!</button>
            </div>
          </div>
          <div class="groups-grid" id="groups"></div>
          <div class="card pad" style="padding:22px 24px">
            ${keySentenceHtml()}
            <div style="margin-top:14px">${legendHtml()}</div>
            <p class="section-desc" style="margin-top:12px;font-size:16px">시작하면 모둠 태블릿에 나무가 나타나고, 질문 바구니에 그 모둠의 질문이 담겨요. 모둠 친구들이 의논하며 질문을 끌어다 가지·기둥·뿌리에 놓아요.</p>
          </div>
        </section>
      </div>`;
  }
  const joined = joinedGroups();
  $('#count').textContent = `태블릿 ${joined.length}/${S.game.groupCount}모둠`;
  $('#start-btn').disabled = joined.length === 0;
  $('#lobby-desc').textContent = joined.length ? '모둠 카드를 누르면 태블릿 연결을 풀 수 있어요.' : '모둠 태블릿이 들어와 친구 이름을 쓰면 여기에 보여요.';
  let html = '';
  for (let g = 1; g <= S.game.groupCount; g++) {
    const c = groupColor(g);
    const names = namesOf(g);
    const has = names.length > 0;
    const fresh = isFresh(g);
    const total = (S.progress[g] && S.progress[g].total) || 0;
    html += `<${has ? 'button type="button" data-act="group-menu" data-g="' + g + '"' : 'div'} class="group-card ${has ? 'clickable' : ''}" aria-label="${g}모둠${has ? ' 태블릿 관리' : ''}">
      <div class="gh" style="background:${c.soft};color:${c.ink}">
        <span class="badge" style="background:${c.main};color:#3b2a1a">${g}</span>${g}모둠
        <span style="font-weight:400;font-size:15px">· 질문 ${total}개</span>
        <span class="spacer"></span>
        ${has ? `<span class="conn ${fresh ? '' : 'off'}"><span class="dot ${fresh ? '' : 'off'}"></span>${fresh ? '태블릿 연결됨' : '연결 확인 중'}</span>` : ''}
      </div>
      <div class="gb">${has ? names.map((n) => `<span class="pchip" style="cursor:inherit">${esc(n)}</span>`).join('') : '<span class="empty">아직 태블릿이 들어오지 않았어요</span>'}</div>
    </${has ? 'button' : 'div'}>`;
  }
  $('#groups').innerHTML = html;
}

function groupMenu(g) {
  const names = namesOf(g);
  if (!names.length) return;
  const m = openModal(`<h2>${g}모둠 태블릿</h2>
    <p>모둠 친구: ${names.map(esc).join(', ')}</p>
    <p style="font-size:16px;color:var(--ink-3)">다른 모둠이 잘못 들어왔거나 태블릿을 바꿔야 할 때 연결을 풀어요. 연결을 풀어도 이 모둠 나무는 그대로 남고, 새 태블릿으로 같은 모둠에 들어오면 이어서 할 수 있어요.</p>
    <div class="actions">
      <button type="button" class="btn btn-danger" data-release>연결 풀기</button>
      <button type="button" class="btn btn-cream" data-close>닫기</button>
    </div>`);
  m.el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-release]')) {
      m.close();
      try {
        S.game = await S.cli.release(S.code, g);
        S.builtSig = '';
        render();
        toast(`${g}모둠 태블릿 연결을 풀었어요.`, 'good');
      } catch (err) {
        toast(explain(err), 'warn');
      }
    } else if (e.target.closest('[data-close]')) m.close();
  });
}

async function startGame() {
  const joined = joinedGroups();
  if (!joined.length) return toast('들어온 모둠 태블릿이 아직 없어요.', 'warn');
  const empty = [];
  for (let g = 1; g <= S.game.groupCount; g++) if (!joined.includes(g)) empty.push(g);
  if (empty.length) {
    const ok = await confirmBox({
      title: '질문 나무를 시작할까요?',
      body: esc(`${empty.join(', ')}모둠은 아직 태블릿이 들어오지 않았어요. 활동 중에 들어와도 함께할 수 있어요.`),
      ok: '시작하기',
    });
    if (!ok) return;
  }
  const btn = $('#start-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '시작 신호 보내는 중…';
  }
  try {
    S.game = await S.cli.stage(S.code, 'start');
    render();
  } catch (e) {
    toast('시작하지 못했어요. ' + explain(e), 'warn');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `${ICON.play}질문 나무 시작!`;
    }
  }
}

// ════════════════════════════════════════════════
// 3. 진행 (전자칠판): 네 자리의 뜻 · 핵심 한 마디 · 모둠 진행 정도 (제한 시간 없음: [활동 끝]으로 마침)
// ════════════════════════════════════════════════

const CHEERS = [
  '모둠 친구들과 의논하며 질문을 옮겨요. 정답은 하나가 아니에요',
  '가지일까, 뿌리일까? 헷갈리면 기둥에 두고 함께 이야기해요',
  '뿌리 질문으로 알아낸 것이 가지 질문을 키워요',
  '필요한 질문이 없으면 바구니 아래에 새 질문을 써 봐요',
];

function renderBoard() {
  if (S.built !== 'board') {
    S.built = 'board';
    setLayout('board');
    app.innerHTML = `
      <header class="topbar">${brandHtml('3차시 · 질문하는 힘 기르기')}<div class="spacer"></div>
        <span class="chip cream" style="font-size:18px">게임 코드 <b style="letter-spacing:.12em;margin-left:4px">${esc(S.code)}</b></span>
        <button type="button" class="btn btn-ghost btn-sm" data-act="sound" id="sound-btn"></button>
        <button type="button" class="btn btn-cream btn-sm" data-act="join-info">태블릿 입장 안내</button>
      </header>
      <div class="board-head r3-head">
        <div class="card stage-card">
          <div class="eyebrow">지금 활동</div>
          <div class="st">${treeIcon(38)}질문 나무 만들기</div>
          ${S.game.themeName ? `<div class="theme">주제 · <b>${esc(S.game.themeName)}</b></div>` : ''}
        </div>
        <div class="card key-card">${keySentenceHtml()}</div>
      </div>
      <div class="r3-board">
        <section class="card legend-tree" aria-label="질문 나무 네 자리의 뜻">
          ${treeHtml([], { mode: 'guide' })}
          ${legendItemHtml('basket', 'guide-basket')}
        </section>
        <aside class="side-stack">
          <div class="card grow">
            <h2 class="panel-title" style="font-size:19px">모둠 태블릿 <span style="font-weight:400;font-size:15px;color:var(--ink-3)">· 나무에 놓은 질문</span></h2>
            <div class="tablet-list" id="tablets"></div>
            <p class="section-desc" style="font-size:14px;margin-top:10px">모둠 나무는 활동이 끝나면 공개돼요.</p>
          </div>
        </aside>
      </div>
      <div class="board-foot">
        <div class="cheer">${catSvg(64)}<span class="bubble" id="cheer">곧 시작해요!</span></div>
        <div class="spacer"></div>
        <button type="button" class="btn btn-cream" data-act="pause" id="pause-btn"></button>
        <button type="button" class="btn btn-apricot" data-act="end">${ICON.flag}활동 끝!</button>
      </div>
      <div id="cover"></div>`;
    S.builtSig = '';
    tick();
  }
  renderTablets();
  updateSoundBtn();
  updateBoardState();
}

function renderTablets() {
  const box = $('#tablets');
  if (!box) return;
  const sig = JSON.stringify([S.game.groups, S.progress, Object.keys(S.seen).map((g) => isFresh(g))]);
  if (sig === S.builtSig) return;
  S.builtSig = sig;
  let html = '';
  for (let g = 1; g <= S.game.groupCount; g++) {
    const c = groupColor(g);
    const names = namesOf(g);
    const has = names.length > 0;
    const fresh = isFresh(g);
    const p = S.progress[g] || { total: 0, placed: 0 };
    const pct = p.total ? Math.round((p.placed / p.total) * 100) : 0;
    html += `<${has ? `button type="button" data-act="group-menu" data-g="${g}"` : 'div'} class="tablet-row">
      <span class="badge" style="background:${c.main};color:#3b2a1a">${g}</span>
      <span class="nm">${has ? esc(names.join(' · ')) : '태블릿 없음'}</span>
      ${has ? `<span class="dot ${fresh ? '' : 'off'}" title="${fresh ? '연결됨' : '확인 중'}"></span>` : ''}
      <span class="pbar" aria-hidden="true"><i style="width:${pct}%"></i></span>
      <span class="pn">${p.placed}/${p.total}</span>
    </${has ? 'button' : 'div'}>`;
  }
  box.innerHTML = html;
}

function updateBoardState() {
  const s = st();
  const paused = s.status === 'paused';
  const ready = s.status === 'ready';
  const pb = $('#pause-btn');
  if (pb) {
    pb.innerHTML = paused ? `${ICON.play}다시 시작` : `${ICON.pause}잠깐 멈춤`;
    pb.disabled = ready;
  }
  const cover = $('#cover');
  if (!cover) return;
  let html = '';
  if (paused)
    html = `<div class="pause-cover" role="dialog" aria-label="잠깐 멈춤">${catSvg(120)}<div>잠깐 멈췄어요</div>
        <div style="font-size:20px;font-weight:400;color:var(--ink-2)">모둠 태블릿도 잠시 멈춰요</div>
        <button type="button" class="btn btn-primary btn-lg" data-act="pause">${ICON.play}다시 시작</button></div>`;
  else if (ready) {
    const sec = Math.max(1, Math.ceil((Number(s.goAt) - now()) / 1000));
    const again = Number(s.goAt) !== Number(s.startedAt);
    html = `<div class="pause-cover ready-cover" role="status">${catSvg(110)}
        <div>${again ? '곧 다시 시작해요!' : '곧 질문 나무를 시작해요!'}</div>
        <div class="ready-num">${sec}</div>
        <div style="font-size:20px;font-weight:400;color:var(--ink-2)">모둠 태블릿에 나무와 질문 바구니가 나타나요</div></div>`;
  }
  const key = paused ? 'p' : ready ? 'r' + Math.ceil((Number(s.goAt) - now()) / 1000) : '';
  if (cover.dataset.key !== key) {
    cover.dataset.key = key;
    cover.innerHTML = html;
  }
}

function updateSoundBtn() {
  const b = $('#sound-btn');
  if (!b) return;
  const on = isSoundOn('teacher');
  b.innerHTML = `${on ? SOUND_ICON.on : SOUND_ICON.off}${on ? '소리 켜짐' : '소리 꺼짐'}`;
  b.setAttribute('aria-pressed', String(on));
}

function updateCheer(s) {
  const el = $('#cheer');
  if (!el) return;
  let msg;
  if (s.status === 'ready') msg = '곧 시작해요! 모둠 친구들이 태블릿 앞에 모여요';
  else if (s.status === 'paused') msg = '잠깐 쉬어 가요';
  else msg = CHEERS[Math.floor((now() / 15000) % CHEERS.length)];
  if (el.textContent !== msg) el.textContent = msg;
}

function tick() {
  if (!S.code || !S.game) return;
  const t = now();
  const s = st();
  S.fx.update(s, t);
  if (s.status === 'playing' && s.goAt && Number(s.goAt) !== Number(s.startedAt) && S.lastGoAt !== s.goAt && t - Number(s.goAt) < 3000) {
    S.lastGoAt = s.goAt;
    if (isSoundOn('teacher')) bell({ strikes: 1, base: 880 });
    flashBanner('다시 시작!', '', 1400);
  }
  if (s.view !== S.view) return render();
  if (s.view === 'play') {
    updateCheer(s);
    updateBoardState();
    renderTablets();
  }
  if (s.status === 'ended' && S.game.status !== 'ended' && !S.ending) {
    S.ending = true;
    S.cli
      .stage(S.code, 'end')
      .then((g) => {
        if (g && g.code === S.code) S.game = g;
      })
      .catch(() => {})
      .finally(() => (S.ending = false));
  }
}

async function togglePause() {
  const s = st();
  try {
    if (s.status === 'playing') S.game = await S.cli.stage(S.code, 'pause');
    else if (s.status === 'paused') S.game = await S.cli.stage(S.code, 'resume');
    else return;
    render();
  } catch (e) {
    toast('바꾸지 못했어요. 다시 눌러 주세요.', 'warn');
  }
}

async function endNow() {
  const ok = await confirmBox({
    title: '질문 나무 활동을 끝낼까요?',
    body: '모둠 태블릿의 질문을 더 옮길 수 없게 돼요. 모둠 태블릿이 나무를 보내면 모든 모둠 나무를 함께 둘러볼 수 있어요.',
    ok: '끝내기',
  });
  if (!ok) return;
  try {
    S.game = await S.cli.stage(S.code, 'end');
    render();
  } catch (e) {
    toast('끝내지 못했어요. ' + explain(e), 'warn');
  }
}

function joinInfo() {
  const m = openModal(`<div style="text-align:center">${joinCardHtml()}</div>
    <div class="actions" style="margin-top:18px"><button type="button" class="btn btn-cream" data-close>닫기</button></div>`);
  m.el.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) m.close();
    else if (e.target.closest('[data-act="copy-link"]')) copyLink();
    else if (e.target.closest('[data-act="open-student"]')) openStudentWindow();
  });
}

async function copyLink() {
  const ok = await copyText(joinUrl());
  toast(ok ? '입장 링크를 복사했어요. 클래스룸이나 패들렛에 붙여 넣어 주세요.' : '복사하지 못했어요.', ok ? 'good' : 'warn');
}

function openStudentWindow() {
  window.open(joinUrl(), '_blank', 'noopener');
}

// ════════════════════════════════════════════════
// 4. 둘러보기: 모든 모둠 나무 공개
// ════════════════════════════════════════════════

const itemsOf = (g) => (S.items && S.items[g]) || [];

// 둘러보기에 보일 모둠: 태블릿이 들어왔거나, 나무를 보냈거나, 질문을 하나라도 옮긴 모둠
function shownGroups() {
  const set = new Set(joinedGroups());
  Object.keys((S.game && S.game.done) || {}).forEach((g) => set.add(Number(g)));
  Object.keys(S.items || {}).forEach((g) => {
    if (itemsOf(g).some((x) => x.zone !== 'basket' || x.isNew)) set.add(Number(g));
  });
  return [...set].sort((a, b) => a - b);
}

function treeCardHtml(g) {
  const c = groupColor(g);
  const list = itemsOf(g);
  const z = byZone(list);
  const names = namesOf(g);
  const sending = joinedGroups().includes(g) && !doneOf(g);
  return `<section class="card tree-card" aria-label="${g}모둠 질문 나무">
    <div class="th">
      <span class="badge" style="background:${c.main};color:#3b2a1a">${g}</span><span class="gn">${g}모둠</span>
      <span style="color:var(--ink-3)">${esc(names.join(', '))}</span>
      <span class="spacer"></span>
      ${sending ? '<span class="chip butter"><span class="dots"><i></i><i></i><i></i></span>보내는 중</span>' : ''}
      <button type="button" class="btn btn-cream btn-sm" data-act="big" data-g="${g}">${ICON.expand}크게 보기</button>
      <button type="button" class="btn btn-ghost btn-sm" data-act="png" data-g="${g}">${ICON.image}그림 저장</button>
    </div>
    ${treeHtml(list, { mode: 'mini' })}
    ${
      z.basket.length
        ? `<details class="left-basket"><summary>바구니에 남은 질문 ${z.basket.length}개</summary><div class="tz-cards">${z.basket.map((x) => `<div class="qcard ${x.isNew ? 'is-new' : ''}">${esc(x.text)}</div>`).join('')}</div></details>`
        : ''
    }
  </section>`;
}

function renderDone() {
  const sig = JSON.stringify(['done', S.itemsSig, S.game.done, S.game.groups]);
  if (S.built === 'done' && S.builtSig === sig) return;
  S.built = 'done';
  S.builtSig = sig;
  setLayout('wide');
  const groups = shownGroups();
  const loading = S.items === null;
  let nb = 0;
  let nr = 0;
  let nn = 0;
  groups.forEach((g) =>
    itemsOf(g).forEach((x) => {
      if (x.zone === 'branch') nb++;
      else if (x.zone === 'root') nr++;
      if (x.isNew) nn++;
    })
  );
  const scrollY = window.scrollY;
  app.innerHTML = `
    ${topbar(`<button type="button" class="btn btn-cream btn-sm" data-act="refresh">${ICON.refresh}새로 받기</button>
      <button type="button" class="btn btn-cream btn-sm" data-act="csv">${ICON.download}질문 내려받기 (CSV)</button>
      <button type="button" class="btn btn-ghost btn-sm" data-act="home">게임 목록</button>`)}
    <section class="card pad-lg">
      <span class="deco butter" style="width:300px;height:300px;right:-100px;top:-120px"></span>
      <div class="mascot-row">${catSvg(96)}<div class="bubble">우리 반 질문 나무가 모두 자랐어요!<br>가지 질문 <b>${nb}개</b>, 뿌리 질문 <b>${nr}개</b>${nn ? `, 새로 쓴 질문 <b>${nn}개</b>` : ''}가 모였어요.</div></div>
      <h1 class="display" style="font-size:clamp(34px,4.6vw,56px);margin:18px 0 16px">질문 나무 둘러보기</h1>
      ${keySentenceHtml()}
      <div style="margin-top:14px">${legendHtml()}</div>
    </section>
    <div class="notice green" style="margin-top:16px"><div><strong>4차시에 이어서 쓰려면</strong>위쪽 <b>질문 내려받기 (CSV)</b>로 모든 모둠 나무를 파일로 저장하거나, 모둠 나무의 <b>그림 저장</b>으로 그림 파일을 받아 두세요. ${esc(keepNote())}</div></div>
    <div class="trees-grid">${
      loading ? '<div class="card empty-state">모둠 나무를 받아오는 중이에요…</div>' : groups.length ? groups.map(treeCardHtml).join('') : '<div class="card empty-state">들어온 모둠이 없어요.</div>'
    }</div>
    <section class="card pad" style="margin-top:20px;background:var(--green-softer)">
      <div class="row"><span class="chip">함께 생각해요</span></div>
      <p style="font-size:clamp(22px,2.6vw,30px);font-weight:700;margin:12px 0 4px">이 가지 질문에 답하려면 어떤 뿌리 질문을 먼저 알아봐야 할까요?</p>
      <p class="section-desc">기둥에 놓인 질문은 가지일까요, 뿌리일까요? 모둠마다 생각이 달랐던 질문을 함께 이야기해 봐요.</p>
    </section>
    <div class="row" style="margin-top:28px;justify-content:center">
      <button type="button" class="btn btn-ghost" data-act="home">새 게임 만들기</button>
      <button type="button" class="btn btn-danger" data-act="delete-room">${ICON.trash}게임 정리하기</button>
    </div>`;
  if (scrollY) window.scrollTo(0, scrollY);
}

function bigView(g) {
  const c = groupColor(g);
  const list = itemsOf(g);
  const m = openModal(
    `<div class="row" style="margin-bottom:12px"><span class="badge" style="background:${c.main};color:#3b2a1a">${g}</span><b style="font-size:26px">${g}모둠 질문 나무</b>
      <span style="color:var(--ink-3)">${esc(namesOf(g).join(', '))}</span><span class="spacer"></span>
      <button type="button" class="btn btn-cream btn-sm" data-png>${ICON.image}그림 저장</button>
      <button type="button" class="btn btn-ghost btn-sm" data-close>닫기</button></div>
     ${keySentenceHtml()}
     <div class="big-tree" style="margin-top:14px">${treeHtml(list, { mode: 'big', removable: true })}${basketHtml(list, { removable: true, emptyText: '바구니에 남은 질문이 없어요' })}</div>`,
    { wide: true }
  );
  m.el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) m.close();
    else if (e.target.closest('[data-png]')) savePng(g);
    else {
      const del = e.target.closest('[data-act="del-item"]');
      if (del) {
        m.close();
        await deleteItem(del.dataset.id);
        bigView(g);
      }
    }
  });
}

async function deleteItem(id) {
  const ok = await confirmBox({ title: '이 질문을 지울까요?', body: '부적절한 질문일 때만 지워 주세요. 지운 질문은 되돌릴 수 없어요.', ok: '지우기', danger: true });
  if (!ok) return;
  try {
    setItems(await S.cli.deleteItem(S.code, id));
    toast('질문을 지웠어요.', 'good');
  } catch (e) {
    toast('지우지 못했어요. ' + explain(e), 'warn');
  }
}

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

async function savePng(g) {
  try {
    toast('그림을 만드는 중이에요…');
    await downloadTreePng({ group: g, names: namesOf(g), items: itemsOf(g), theme: S.game.themeName }, `질문나무_${S.code}_${g}모둠_${stamp()}.png`);
  } catch (e) {
    toast('그림을 만들지 못했어요.', 'warn');
  }
}

// 4차시에 쓸 CSV: 모둠마다 가지 → 기둥 → 뿌리 → 바구니 순서
function exportCsv() {
  if (!S.items) return toast('모둠 나무를 받아오는 중이에요. 잠시 뒤 다시 눌러 주세요.', 'warn');
  const rows = [['번호', '모둠', '자리', '질문', '새 질문', '2차시 활동', '주제']];
  let n = 0;
  shownGroups().forEach((g) => {
    const z = byZone(itemsOf(g));
    ZONE_ORDER.forEach((k) => z[k].forEach((x) => rows.push([++n, `${g}모둠`, ZONES[k].short, x.text, x.isNew ? '○' : '', x.src || '', S.game.themeName || ''])));
  });
  if (rows.length === 1) return toast('아직 내려받을 질문이 없어요.', 'warn');
  downloadText(`질문나무_${S.code}_${stamp()}.csv`, rows.map((r) => r.map(csvCell).join(',')).join('\r\n'));
  toast(`질문 ${n}개를 내려받았어요.`, 'good');
}

async function deleteGame(code, cli) {
  const ok = await confirmBox({
    title: `${code} 게임을 지울까요?`,
    body: '이 게임의 질문과 모둠 나무가 모두 지워져요. 지운 뒤에는 되돌릴 수 없어요. 필요하면 먼저 CSV나 그림으로 저장해 두세요.',
    ok: '모두 지우기',
    danger: true,
  });
  if (!ok) return false;
  try {
    await cli.deleteGame(code);
    toast('게임을 지웠어요.', 'good');
    return true;
  } catch (e) {
    toast('지우지 못했어요. ' + explain(e), 'warn');
    return false;
  }
}

// ════════════════════════════════════════════════
// 클릭 처리
// ════════════════════════════════════════════════

app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;
  const f = S.form;
  switch (act) {
    case 'practice':
      f.mode = f.mode === 'local' ? defaultMode() : 'local';
      renderForm();
      loadGameList();
      window.scrollTo(0, 0);
      break;
    case 'source':
      f.source = el.dataset.v;
      renderForm();
      break;
    case 'csv-clear':
      f.csv = null;
      renderForm();
      break;
    case 'pv-del': {
      const list = f.csv && f.csv.groups[el.dataset.g];
      if (list) {
        list.splice(Number(el.dataset.i), 1);
        f.csv.count--;
        renderForm();
      }
      break;
    }
    case 'pg-dec':
      f.pasteGroups = Math.max(1, f.pasteGroups - 1);
      renderForm();
      break;
    case 'pg-inc':
      f.pasteGroups = Math.min(MAX_GROUPS, f.pasteGroups + 1);
      renderForm();
      break;
    case 'create':
      createGame();
      break;
    case 'open-room':
      openGame(f.mode, el.dataset.code).catch((err) => {
        toast(explain(err), 'warn');
        showHome();
      });
      break;
    case 'del-room': {
      const cli = await r3Client(f.mode).catch(() => null);
      if (cli && (await deleteGame(el.dataset.code, cli))) loadGameList();
      break;
    }
    case 'home':
      showHome();
      break;
    case 'copy-link':
      copyLink();
      break;
    case 'open-student':
      openStudentWindow();
      break;
    case 'group-menu':
      groupMenu(Number(el.dataset.g));
      break;
    case 'start':
      startGame();
      break;
    case 'pause':
      togglePause();
      break;
    case 'end':
      endNow();
      break;
    case 'join-info':
      joinInfo();
      break;
    case 'sound':
      setSoundOn('teacher', !isSoundOn('teacher'));
      updateSoundBtn();
      if (isSoundOn('teacher')) beep({ freq: 880, dur: 0.12, vol: 0.3 });
      toast(isSoundOn('teacher') ? '효과음을 켰어요.' : '효과음을 껐어요.');
      break;
    case 'refresh':
      S.itemsSince = Date.now();
      loadItems();
      poll();
      toast('새로 받아 왔어요.');
      break;
    case 'csv':
      exportCsv();
      break;
    case 'big':
      bigView(Number(el.dataset.g));
      break;
    case 'png':
      savePng(Number(el.dataset.g));
      break;
    case 'delete-room': {
      const { cli, code } = S;
      if (await deleteGame(code, cli)) showHome();
      break;
    }
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && S.code) {
    poll();
    if (S.view === 'done') loadItems();
  }
});

// ════════════════════════════════════════════════
// 시작
// ════════════════════════════════════════════════

(async function boot() {
  const p = new URLSearchParams(location.search);
  const room = p.get('room');
  if (room) {
    const mode = p.get('mode') === 'local' ? 'local' : 'server';
    try {
      await openGame(mode, room);
      return;
    } catch (e) {
      console.warn(e);
      toast(explain(e), 'warn');
    }
  }
  showHome();
})();

void KEY_SENTENCE;
