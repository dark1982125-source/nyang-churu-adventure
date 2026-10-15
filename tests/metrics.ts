import { Battle } from '../src/sim/battle';
import { TUNING } from '../src/config/tuning';
import { buildLoadout, newSave, type SaveData } from '../src/meta/save';
import { botChoose, botInput } from './bot';

/**
 * 재플레이 관찰용 측정(시뮬레이션 밖에서 감싸서 기록, 전투 규칙은 바꾸지 않는다).
 * - 처치 기여: 마지막 타격이 어느 갱신 단계에서 났는지(호냥이 기본·기술 / 캠프 지원 / 궁극기 / 지속 피해).
 * - 시간: 웨이브 중 전진 / 교전 정차(사거리 안에 칠 적 있음) / 대기 정차(칠 적 없음).
 * - 피해: 호냥이 HP 감소(정차 중·이동 중), 캠프 멘탈 감소.
 */
export interface RunMetrics {
  seed: number;
  outcome: string;
  time: number;
  kills: { hero: number; camp: number; ult: number; dot: number };
  heroShare: number;
  waveTime: { moving: number; engaged: number; waiting: number };
  /** 첫 웨이브 시작부터 호냥이 첫 기본 공격까지 */
  firstAttackDelay: number;
  heroDamage: { stopped: number; moving: number };
  campDamage: number;
  /** 교전 정차 ↔ 전진 전환 횟수(경계 떨림 확인용) */
  toggles: number;
  /** 사거리 밖 적 때문에 1.5초 넘게 서 있었던 구간 수(일반 구간) */
  longWaits: number;
  /** 전진을 재개한 뒤 0.3초 안에 다시 멈춘 횟수(경계 떨림) */
  quickRestops: number;
}

export function measureRun(seed: number, save: SaveData = newSave(), maxTime = 600): RunMetrics {
  const b = new Battle({ runId: 1, seed, loadout: buildLoadout(save) });
  const anyB = b as unknown as Record<string, (...a: unknown[]) => unknown>;
  let ctx: 'hero' | 'camp' | 'ult' | 'dot' = 'dot';
  const kills = { hero: 0, camp: 0, ult: 0, dot: 0 };
  const wrap = (name: string, c: typeof ctx) => {
    const orig = anyB[name].bind(b);
    anyB[name] = (...a: unknown[]) => { const prev = ctx; ctx = c; try { return orig(...a); } finally { ctx = prev; } };
  };
  wrap('updateCombat', 'hero');
  wrap('updateSupports', 'camp');
  wrap('useUltimate', 'ult');
  wrap('updateEnemies', 'dot');
  const origKill = anyB.killEnemy.bind(b);
  anyB.killEnemy = (e: unknown) => {
    if (b.enemies.includes(e as never)) kills[ctx]++;
    return origKill(e);
  };

  const waveTime = { moving: 0, engaged: 0, waiting: 0 };
  const heroDamage = { stopped: 0, moving: 0 };
  let campDamage = 0;
  let firstWave = -1;
  let firstAttack = -1;
  let toggles = 0;
  let lastEngaged = false;
  let waitRun = 0;
  let longWaits = 0;
  let quickRestops = 0;
  let lastMoved = false;
  let resumedAt = -1;
  const dt = 1 / 60;
  const range = TUNING.basicAttack.range;
  while (!b.finished && b.t < maxTime) {
    if (b.paused) { botChoose(b); continue; }
    const x0 = b.player.x;
    const hp0 = b.player.hp;
    const m0 = b.camp.mental;
    const t0 = b.t;
    b.update(dt, botInput(b));
    const real = b.t > t0; // 등장 연출(정지) 틱 제외
    const moved = b.player.x > x0 + 1e-6;
    if (b.player.attackAnim > 0.149 && firstAttack < 0 && firstWave >= 0) firstAttack = b.t - firstWave;
    if (b.mode === 'wave' && firstWave < 0) firstWave = b.t;
    if (b.player.hp < hp0) heroDamage[moved ? 'moving' : 'stopped'] += hp0 - b.player.hp;
    if (b.camp.mental < m0) campDamage += m0 - b.camp.mental;
    if (b.mode === 'wave' && real) {
      const front = b.player.x + TUNING.player.width / 2;
      const top = TUNING.player.height + TUNING.player.punchReachUp;
      const engaged = b.enemies.some((e) => e.x >= b.player.x && e.x - e.def.width / 2 <= front + range && (!e.def.flying || e.y <= top));
      if (moved) waveTime.moving += dt;
      else if (engaged) waveTime.engaged += dt;
      else waveTime.waiting += dt;
      if (engaged !== lastEngaged) toggles++;
      if (moved && !lastMoved) resumedAt = b.t;
      if (!moved && lastMoved && resumedAt >= 0 && b.t - resumedAt < 0.3) quickRestops++;
      lastMoved = moved;
      lastEngaged = engaged;
      const normal = b.waves[b.waveIndex]?.phase === 'normal';
      if (!moved && !engaged && normal) waitRun += dt;
      else { if (waitRun > 1.5) longWaits++; waitRun = 0; }
    }
  }
  const total = kills.hero + kills.camp + kills.ult + kills.dot;
  return {
    seed, outcome: b.mode, time: Math.round(b.t), kills,
    heroShare: total ? kills.hero / total : 0,
    waveTime, firstAttackDelay: firstAttack, heroDamage, campDamage, toggles, longWaits, quickRestops,
  };
}

export function summarize(runs: RunMetrics[]) {
  const avg = (f: (r: RunMetrics) => number) => Math.round((runs.reduce((s, r) => s + f(r), 0) / runs.length) * 100) / 100;
  return {
    runs: runs.length,
    victories: runs.filter((r) => r.outcome === 'victory').length,
    time: avg((r) => r.time),
    heroKills: avg((r) => r.kills.hero), campKills: avg((r) => r.kills.camp), ultKills: avg((r) => r.kills.ult), dotKills: avg((r) => r.kills.dot),
    heroShare: avg((r) => r.heroShare),
    moving: avg((r) => r.waveTime.moving), engaged: avg((r) => r.waveTime.engaged), waiting: avg((r) => r.waveTime.waiting),
    firstAttackDelay: avg((r) => r.firstAttackDelay),
    heroDmgStopped: avg((r) => r.heroDamage.stopped), heroDmgMoving: avg((r) => r.heroDamage.moving), campDamage: avg((r) => r.campDamage),
    toggles: avg((r) => r.toggles), longWaits: avg((r) => r.longWaits), quickRestops: avg((r) => r.quickRestops),
  };
}
