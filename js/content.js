// 3차시 콘텐츠: 질문 나무의 네 자리와 뜻, 핵심 한 마디, 질문 불러오기(CSV · 붙여 넣기)
// 흐름도 「질문하는 힘 기르기 1~4차시 흐름도(수정본)」의 '아이들에게 쓰는 말'을 따른다.

export const KEY_SENTENCE = '뿌리가 튼튼해야 가지가 뻗어요. 두 질문 모두 탐구에 꼭 필요해요.';

export const ZONES = {
  branch: { id: 'branch', name: '가지 질문', short: '가지', desc: '알아낸 것으로 따져 보며 뻗어 나가는 질문 · 탐구의 출발점' },
  trunk: { id: 'trunk', name: '기둥', short: '기둥', desc: '가지일까, 뿌리일까? 함께 고민할 질문' },
  root: { id: 'root', name: '뿌리 질문', short: '뿌리', desc: '찾아보면 알 수 있는 질문 · 탐구의 바탕' },
  basket: { id: 'basket', name: '질문 바구니', short: '바구니', desc: '아직 놓지 않은 질문' },
};
export const ZONE_ORDER = ['branch', 'trunk', 'root', 'basket'];

export const MAX_GROUPS = 8;
export const PER_GROUP = 80; // 모둠마다 불러올 수 있는 질문 (서버와 같게)
export const NEW_MAX = 30; // 모둠마다 새로 쓸 수 있는 질문
export const THEME_MAX = 20;

const squash = (s) => String(s || '').replace(/[\s?？!.,~·]/g, '').toLowerCase();

// ── CSV 읽기 (따옴표, 줄바꿈이 든 칸, BOM 처리) ─────────────────

export function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function addTo(groups, g, item) {
  const list = (groups[g] = groups[g] || []);
  if (list.length >= PER_GROUP) return false;
  if (list.some((x) => squash(x.text) === squash(item.text))) return false;
  list.push(item);
  return true;
}

// 2차시 CSV → { groups: {모둠: [{text, src, srcNo}]}, groupCount, themeName, byGroup }
//  byGroup = false 이면 '모둠' 열이 없어서 모든 모둠에 같은 질문을 넣어야 한다.
export function readQuestionsCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { error: '파일에 내용이 없어요.' };
  const head = rows[0].map((h) => clean(h));
  const col = (name) => head.findIndex((h) => h === name);
  let qi = col('질문');
  const gi = col('모둠');
  const either = (a, b) => (col(a) >= 0 ? col(a) : col(b));
  const ai = either('활동', '2차시 활동'); // 3차시 CSV를 다시 올려도 읽힌다
  const ni = col('번호');
  const ti = either('대주제', '주제');
  let body = rows.slice(1);
  if (qi < 0) {
    // 머리줄이 없는 목록: 첫 칸을 질문으로
    qi = 0;
    body = rows;
  }
  const groups = {};
  let themeName = '';
  let count = 0;
  let skipped = 0;
  const byGroup = gi >= 0;
  const list = [];
  body.forEach((r) => {
    const t = clean(r[qi]);
    if (!t) return;
    const item = { text: t.slice(0, 100), src: ai >= 0 ? clean(r[ai]).slice(0, 20) : '', srcNo: ni >= 0 && /^\d+$/.test(clean(r[ni])) ? Number(clean(r[ni])) : null };
    if (ti >= 0 && !themeName && clean(r[ti])) themeName = clean(r[ti]).slice(0, THEME_MAX);
    if (byGroup) {
      const m = clean(r[gi]).match(/\d+/);
      const g = m ? Number(m[0]) : 0;
      if (g < 1 || g > MAX_GROUPS) {
        skipped++;
        return;
      }
      if (addTo(groups, g, item)) count++;
      else skipped++;
    } else list.push(item);
  });
  if (!byGroup) {
    const uniq = [];
    list.forEach((x) => {
      if (uniq.length < PER_GROUP && !uniq.some((y) => squash(y.text) === squash(x.text))) uniq.push(x);
    });
    if (!uniq.length) return { error: '질문을 찾지 못했어요. 「질문」 열이 있는 CSV인지 확인해 주세요.' };
    return { byGroup: false, list: uniq, themeName, count: uniq.length, skipped: list.length - uniq.length };
  }
  if (!count) return { error: '질문을 찾지 못했어요. 2차시 「질문 룰렛 놀이」에서 내려받은 CSV인지 확인해 주세요.' };
  const groupCount = Math.max(...Object.keys(groups).map(Number));
  return { byGroup: true, groups, groupCount, themeName, count, skipped };
}

// 붙여 넣은 글 → 질문 목록 (줄마다 하나, 앞의 번호·기호는 뗀다)
export function readPasted(text) {
  const out = [];
  String(text || '')
    .split(/\r?\n/)
    .map((l) =>
      clean(l)
        .replace(/^(\d+[.)]|[-*•·]|\(\d+\))\s*/, '')
        .trim()
    )
    .filter(Boolean)
    .forEach((t) => {
      if (out.length < PER_GROUP && !out.some((x) => squash(x.text) === squash(t))) out.push({ text: t.slice(0, 100), src: '', srcNo: null });
    });
  return out;
}

export const sameQuestion = (a, b) => squash(a) === squash(b);
