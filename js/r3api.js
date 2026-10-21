// 3차시 질문 나무: 서버(gas/Code.gs의 r3.* 기능)와 이야기하는 곳
//  서버  → 개발진이 배포한 Apps Script 웹 앱 하나를 모든 반이 함께 쓴다
//  연습 모드 → 같은 코드를 이 브라우저 안에서 돌린다

import { getLocalApi, getServerApi, explainError, pollMs } from './api.js';

export class GasR3 {
  constructor(api) {
    this.api = api;
    this.kind = api.kind; // 'server' | 'local'
  }

  serverNow() {
    return this.api.serverNow();
  }

  onConnection(cb) {
    return this.api.onConnection(cb);
  }

  pollMs(name) {
    return pollMs(this.api, name);
  }

  linkParams() {
    return this.kind === 'local' ? { mode: 'local' } : {};
  }

  // 선생님
  async createGame(settings) {
    const r = await this.api.teacher('r3.create', { settings });
    return { code: r.code, game: r.game };
  }

  async listGames() {
    this.api.teacher('cleanup').catch(() => {});
    const r = await this.api.teacher('r3.list');
    return r.games || [];
  }

  view(code) {
    return this.api.teacher('r3.view', { code });
  }

  async stage(code, op) {
    return (await this.api.teacher('r3.stage', { code, op })).game;
  }

  async release(code, group) {
    return (await this.api.teacher('r3.release', { code, group })).game;
  }

  async teacherItems(code) {
    return (await this.api.teacher('r3.items', { code })).items || {};
  }

  async deleteItem(code, id) {
    return (await this.api.teacher('r3.edit', { code, id, op: 'delete' })).items || {};
  }

  deleteGame(code) {
    return this.api.teacher('r3.delete', { code, rows: true });
  }

  // 모둠 태블릿
  async info(code) {
    return (await this.api.call('r3.info', { code })).game;
  }

  join(code, group, names, token) {
    return this.api.call('r3.join', { code, group, names, token: token || '' });
  }

  leave(code, group, token) {
    return this.api.call('r3.leave', { code, group, token });
  }

  poll(code, group, token) {
    return this.api.call('r3.poll', { code, group: group || '', token: token || '' });
  }

  async mine(code, group, token) {
    return (await this.api.call('r3.mine', { code, group, token })).items || [];
  }

  save(code, group, token, places, added) {
    return this.api.call('r3.save', { code, group, token, places, added });
  }

  done(code, group, token) {
    return this.api.call('r3.done', { code, group, token });
  }

  explain(e, who) {
    return explainError(e, who);
  }
}

// mode = 'server' | 'local'
export async function r3Client(mode) {
  if (mode === 'local') return new GasR3(await getLocalApi());
  return new GasR3(getServerApi());
}

// 화면에서 쓰는 진행 상태: view = lobby · play · done, status = ready · playing · paused · ended · idle
// 3차시는 제한 시간이 없어서 endsAt이 비어 있고, 선생님이 [활동 끝]을 눌러야 끝난다
export function deriveR3(game, now) {
  if (!game) return null;
  let status = game.status;
  let endedAt = game.endedAt;
  if (status === 'playing' && game.endsAt && now >= game.endsAt) {
    status = 'ended';
    endedAt = game.endsAt;
  }
  if (status === 'playing' && game.goAt && now < game.goAt) status = 'ready';
  const view = status === 'idle' ? 'lobby' : status === 'ended' ? 'done' : 'play';
  return { view, status, startedAt: game.startedAt, goAt: game.goAt, endsAt: game.endsAt, remainingMs: game.remainingMs, endedAt };
}
