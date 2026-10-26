// 질문 나무 그리기: 태블릿 나무 판, 선생님 둘러보기(작게·크게), 그림 파일 저장
//  가지(잎이 풍성한 윗부분) · 기둥(나무줄기) · 뿌리(땅 아래) 세 자리 + 질문 바구니

import { esc } from './ui.js';
import { ZONES, KEY_SENTENCE } from './content.js';

// 같은 자리 안에서는 옮긴 순서대로 (처음 바구니에 있던 질문은 번호 순서)
export function sortZone(list) {
  return list.slice().sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0) || a.no - b.no);
}

export function byZone(items) {
  const out = { branch: [], trunk: [], root: [], basket: [] };
  (items || []).forEach((x) => (out[ZONES[x.zone] ? x.zone : 'basket'] || out.basket).push(x));
  Object.keys(out).forEach((k) => (out[k] = sortZone(out[k])));
  return out;
}

// ── 꾸밈 그림 ───────────────────────────────────────

const CROWN_BUMPS = [
  [500, 235, 440, 175],
  [130, 175, 115, 115],
  [270, 100, 125, 125],
  [420, 72, 135, 135],
  [580, 72, 135, 135],
  [730, 100, 125, 125],
  [870, 175, 115, 115],
  [85, 285, 95, 95],
  [915, 285, 95, 95],
  [250, 345, 110, 90],
  [750, 345, 110, 90],
  [500, 360, 140, 80],
];

function crownSvg() {
  const layer = (grow, fill) => CROWN_BUMPS.map(([cx, cy, rx, ry]) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx + grow}" ry="${ry + grow}" fill="${fill}"/>`).join('');
  return `<svg class="tz-art" aria-hidden="true" viewBox="-20 -20 1040 470" preserveAspectRatio="none">
    ${layer(9, '#8dbb6c')}${layer(0, '#dff0cb')}
    <g fill="#c7e3ac">
      <circle cx="210" cy="150" r="16"/><circle cx="790" cy="160" r="14"/><circle cx="340" cy="300" r="12"/><circle cx="660" cy="300" r="15"/><circle cx="500" cy="120" r="12"/>
    </g>
  </svg>`;
}

function trunkSvg() {
  return `<svg class="tz-art" aria-hidden="true" viewBox="0 0 400 200" preserveAspectRatio="none">
    <path d="M118 0 L282 0 L290 150 Q300 190 340 200 L60 200 Q100 190 110 150 Z" fill="#c99862" stroke="#8a6238" stroke-width="5" vector-effect="non-scaling-stroke"/>
    <g fill="none" stroke="#a97a48" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke">
      <path d="M150 20 Q140 70 152 120"/><path d="M250 30 Q262 80 248 140"/><path d="M200 60 Q194 90 204 130"/>
    </g>
  </svg>`;
}

function groundSvg() {
  return `<svg aria-hidden="true" viewBox="0 0 1000 40" preserveAspectRatio="none">
    <path d="M0 22 Q60 6 120 20 T240 18 T360 22 T480 16 T600 22 T720 16 T840 22 T1000 18 L1000 40 L0 40 Z" fill="#9cc877"/>
    <path d="M0 30 L1000 30 L1000 40 L0 40 Z" fill="#c9a37a"/>
  </svg>`;
}

function rootSvg() {
  return `<svg class="tz-art" aria-hidden="true" viewBox="0 0 1000 300" preserveAspectRatio="none">
    <rect width="1000" height="300" fill="#f6e7d4"/>
    <g fill="none" stroke="#c99862" stroke-linecap="round" vector-effect="non-scaling-stroke">
      <path d="M470 0 C460 70 330 110 160 210" stroke-width="12"/>
      <path d="M530 0 C540 70 670 110 840 210" stroke-width="12"/>
      <path d="M500 0 C500 90 490 170 500 290" stroke-width="13"/>
      <path d="M300 140 C250 170 230 230 250 290" stroke-width="7"/>
      <path d="M700 140 C750 170 770 230 750 290" stroke-width="7"/>
      <path d="M160 210 C120 230 80 240 40 238" stroke-width="6"/>
      <path d="M840 210 C880 230 920 240 960 238" stroke-width="6"/>
    </g>
  </svg>`;
}

export function basketIcon(size = 34) {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 48 48">
    <path d="M12 20 Q24 4 36 20" fill="none" stroke="#a97a48" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M6 20h36l-4 20a4 4 0 0 1-4 3H14a4 4 0 0 1-4-3z" fill="#e8c48a" stroke="#8a6238" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M9 27h30M10.5 34h27M18 20l2 23M30 20l-2 23M24 20v23" stroke="#c79856" stroke-width="2"/>
  </svg>`;
}

export function treeIcon(size = 40) {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 48 48">
    <g stroke="#7a5c3e" stroke-width="2.2" stroke-linejoin="round">
      <path d="M21 26h6l1 12h-8z" fill="#c99862"/>
      <circle cx="24" cy="17" r="11" fill="#9cc877"/>
      <circle cx="15" cy="21" r="6" fill="#9cc877"/><circle cx="33" cy="21" r="6" fill="#9cc877"/>
      <path d="M8 40h32" stroke-linecap="round"/>
      <path d="M22 38l-5 5M26 38l5 5" stroke="#c99862" stroke-width="2.6" stroke-linecap="round"/>
    </g>
  </svg>`;
}

// ── 질문 카드와 자리 ────────────────────────────────

export function cardHtml(x, { removable = false, selected = false, fresh = false } = {}) {
  return `<div class="qcard ${x.isNew ? 'is-new' : ''} ${selected ? 'selected' : ''} ${fresh ? 'pop' : ''}" data-id="${esc(x.id)}" tabindex="0" role="button" aria-label="${esc(x.text)}">
    <span class="qt">${esc(x.text)}</span>${x.isNew ? '<span class="qnew">새 질문</span>' : ''}${
      removable ? `<button type="button" class="qdel" data-act="del-item" data-id="${esc(x.id)}" aria-label="이 질문 지우기">×</button>` : ''
    }</div>`;
}

function zoneHead(zone, n, { showDesc = true } = {}) {
  const z = ZONES[zone];
  return `<div class="tz-head"><b>${z.name}</b>${n === null ? '' : `<span class="tz-n">${n}</span>`}${showDesc ? `<span class="tz-desc">${esc(z.desc)}</span>` : ''}</div>`;
}

function cardsHtml(list, opts, empty) {
  if (!list.length) return `<div class="tz-empty">${empty}</div>`;
  return list.map((x) => cardHtml(x, { removable: opts.removable, selected: opts.selected === x.id, fresh: opts.fresh === x.id })).join('');
}

// mode: 'board'(태블릿) · 'mini'(선생님 둘러보기) · 'big'(크게 보기) · 'guide'(뜻만, 선생님 진행 화면)
export function treeHtml(items, opts = {}) {
  const mode = opts.mode || 'board';
  const z = byZone(items);
  const legend = mode === 'guide';
  const empty = (k) => (legend ? '' : opts.emptyText ? opts.emptyText[k] || '' : mode === 'board' ? '여기에 질문을 놓아요' : '없어요');
  const count = (k) => (legend ? null : z[k].length);
  const showDesc = mode !== 'mini';
  return `<div class="qtree ${mode}">
    <section class="tz branch" data-zone="branch" aria-label="가지 질문">${crownSvg()}
      <div class="tz-in">${zoneHead('branch', count('branch'), { showDesc })}<div class="tz-cards">${legend ? '' : cardsHtml(z.branch, opts, empty('branch'))}</div></div>
    </section>
    <section class="tz trunk" data-zone="trunk" aria-label="기둥">${trunkSvg()}
      <div class="tz-in">${zoneHead('trunk', count('trunk'), { showDesc })}<div class="tz-cards">${legend ? '' : cardsHtml(z.trunk, opts, empty('trunk'))}</div></div>
    </section>
    <div class="tz-ground">${groundSvg()}</div>
    <section class="tz root" data-zone="root" aria-label="뿌리 질문">${rootSvg()}
      <div class="tz-in">${zoneHead('root', count('root'), { showDesc })}<div class="tz-cards">${legend ? '' : cardsHtml(z.root, opts, empty('root'))}</div></div>
    </section>
  </div>`;
}

export function basketHtml(items, opts = {}) {
  const list = byZone(items).basket;
  return `<section class="basket" data-zone="basket" aria-label="질문 바구니">
    <div class="basket-head">${basketIcon(38)}<div><b>${ZONES.basket.name}</b> <span class="tz-n">${list.length}</span><div class="tz-desc">${esc(ZONES.basket.desc)}</div></div></div>
    <div class="basket-list">${list.length ? list.map((x) => cardHtml(x, { removable: opts.removable, selected: opts.selected === x.id, fresh: opts.fresh === x.id })).join('') : `<div class="tz-empty">${opts.emptyText || '바구니가 비었어요!'}</div>`}</div>
    ${opts.footer || ''}
  </section>`;
}

// 네 자리의 뜻 (선생님 화면 설명용)
export function legendItemHtml(k, cls = '') {
  const mark = k === 'basket' ? `<span class="sw-icon">${basketIcon(26)}</span>` : '<span class="sw" aria-hidden="true"></span>';
  return `<div class="lg lg-${k} ${cls}">${mark}<div><b>${ZONES[k].name}</b><div class="d">${esc(ZONES[k].desc)}</div></div></div>`;
}

export function legendHtml({ compact = false } = {}) {
  return `<div class="legend ${compact ? 'compact' : ''}">
    ${['root', 'branch', 'trunk', 'basket'].map((k) => legendItemHtml(k)).join('')}
  </div>`;
}

export function keySentenceHtml(cls = '') {
  // 두 문장 사이에서만 줄이 바뀌게
  const parts = KEY_SENTENCE.split(/(?<=\.)\s+/).map((t) => `<span class="ks">${esc(t)}</span>`).join(' ');
  return `<div class="key-sentence ${cls}">${treeIcon(34)}<span>${parts}</span></div>`;
}

// ── 그림 파일로 저장 (PNG) ───────────────────────────

const FONT = "'Dunggeunmiso', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

function wrap(ctx, text, maxW) {
  const out = [];
  let line = '';
  for (const word of String(text).split(' ')) {
    const tryLine = line ? line + ' ' + word : word;
    if (ctx.measureText(tryLine).width <= maxW) line = tryLine;
    else {
      if (line) out.push(line);
      // 한 낱말이 너무 길면 글자 단위로 자른다
      let w = word;
      while (ctx.measureText(w).width > maxW) {
        let i = w.length;
        while (i > 1 && ctx.measureText(w.slice(0, i)).width > maxW) i--;
        out.push(w.slice(0, i));
        w = w.slice(i);
      }
      line = w;
    }
  }
  if (line) out.push(line);
  return out;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 카드 묶음의 높이를 재고(draw=false) 그린다(draw=true)
function cardBlock(ctx, list, x, y, w, cols, draw, style) {
  const gap = 18;
  const cw = (w - gap * (cols - 1)) / cols;
  ctx.font = `400 26px ${FONT}`;
  const hs = list.map((it) => wrap(ctx, it.text, cw - 36).length * 36 + 30);
  let top = y;
  for (let i = 0; i < list.length; i += cols) {
    const rowH = Math.max(...hs.slice(i, i + cols));
    if (draw) {
      for (let c = 0; c < cols && i + c < list.length; c++) {
        const it = list[i + c];
        const cx = x + c * (cw + gap);
        rr(ctx, cx, top, cw, rowH, 16);
        ctx.fillStyle = style.card;
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = style.line;
        ctx.stroke();
        ctx.fillStyle = '#3b3125';
        ctx.font = `400 26px ${FONT}`;
        wrap(ctx, it.text, cw - 36).forEach((ln, k) => ctx.fillText(ln, cx + 18, top + 42 + k * 36));
        if (it.isNew) {
          ctx.font = `700 18px ${FONT}`;
          ctx.fillStyle = '#c06a45';
          ctx.fillText('새 질문', cx + cw - 82, top + 24);
        }
      }
    }
    top += rowH + gap;
  }
  return list.length ? top - y - gap : 0;
}

export async function treePng({ group, names = [], items = [], theme = '' }) {
  try {
    await document.fonts.load(`700 30px Dunggeunmiso`);
    await document.fonts.load(`400 26px Dunggeunmiso`);
  } catch (e) {}
  const z = byZone(items);
  const W = 1500;
  const PAD = 60;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const sections = [
    { k: 'branch', cols: 3, fill: '#dff0cb', line: '#8dbb6c', card: '#ffffff', title: ZONES.branch },
    { k: 'trunk', cols: 2, fill: '#ead2b3', line: '#a97a48', card: '#fffaf2', title: ZONES.trunk },
    { k: 'root', cols: 3, fill: '#f6e7d4', line: '#c99862', card: '#ffffff', title: ZONES.root },
  ];
  if (z.basket.length) sections.push({ k: 'basket', cols: 3, fill: '#f2ede2', line: '#cdbfa6', card: '#ffffff', title: ZONES.basket });
  const measure = (draw) => {
    let y = 210;
    sections.forEach((s) => {
      const inner = W - PAD * 2 - 60;
      const h = Math.max(70, cardBlock(ctx, z[s.k], PAD + 30, y + 96, inner, s.cols, false, s));
      s.y = y;
      s.h = h + 130;
      y += s.h + 26;
    });
    return y + 30;
  };
  const H = measure();
  c.width = W;
  c.height = H;
  ctx.fillStyle = '#fff8df';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#3b3125';
  ctx.font = `700 50px ${FONT}`;
  ctx.fillText(`${group}모둠 질문 나무`, PAD, 90);
  ctx.font = `400 26px ${FONT}`;
  ctx.fillStyle = '#635440';
  ctx.fillText([theme ? `주제: ${theme}` : '', names.length ? names.join(', ') : ''].filter(Boolean).join('  ·  '), PAD, 134);
  ctx.fillStyle = '#426639';
  ctx.font = `700 28px ${FONT}`;
  ctx.fillText(KEY_SENTENCE, PAD, 182);
  sections.forEach((s) => {
    rr(ctx, PAD, s.y, W - PAD * 2, s.h, 36);
    ctx.fillStyle = s.fill;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = s.line;
    ctx.stroke();
    ctx.fillStyle = '#3b3125';
    ctx.font = `700 32px ${FONT}`;
    ctx.fillText(`${s.title.name}  ${z[s.k].length}`, PAD + 30, s.y + 52);
    ctx.font = `400 22px ${FONT}`;
    ctx.fillStyle = '#635440';
    ctx.fillText(s.title.desc, PAD + 30, s.y + 84);
    if (z[s.k].length) cardBlock(ctx, z[s.k], PAD + 30, s.y + 104, W - PAD * 2 - 60, s.cols, true, s);
    else {
      ctx.fillStyle = '#7d6c55';
      ctx.fillText('놓은 질문이 없어요', PAD + 30, s.y + 130);
    }
  });
  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
}

export async function downloadTreePng(opts, filename) {
  const blob = await treePng(opts);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
