import { Battle } from '../src/sim/battle';
import { TUNING } from '../src/config/tuning';
import { buildLoadout, newSave, type SaveData } from '../src/meta/save';
import { BOT, botChoose, botInput } from './bot';

/**
 * 재플레이 관찰용 측정(시뮬레이션 밖에서 감싸서 기록, 전투 규칙은 바꾸지 않는다).
 * - 처치 기여: 마지막 타격이 어느 갱신 단계에서 났는지(호냥이 기본·기술 / 캠프 지원 / 궁극기 / 지속 피해).
 * - 시간: 웨이브 중 전진 / 교전 정차(사거리 안에 칠 적 있음) / 대기 정차(칠 적 없음).
 * - 웨이브별: 일반 구간 활성 시간, 획득 경험치·레벨업 수, 엘리트/보스 진입 HP·처치 시간, 첫 유효 타격.
 * - 성능: 시뮬레이션 한 틱 계산 시간과 최대 동시 적 수(화면 그리기 제외).
 */
export interface WaveMetrics {
  /** 일반 구간 활성 시간(초) */
  normal: number;
  /** 엘리트/보스 등장 → 그 웨이브 적 전멸까지(초) */
  finale: number;
  /** 등장 → 호냥이 첫 유효 타격(초) */
  firstHit: number;
  /** 엘리트/보스 구간에서 칠 적 없이 서 있던 시간 */
  idle: number;
  /** 이 웨이브(앞 이동 구간 포함) 동안 얻은 호냥이 경험치 */
  xp: number;
  /** 이 웨이브 동안 호냥이 레벨업 수 */
  levelUps: number;
  campLevelUps: number;
  /** 엘리트/보스 등장 순간 호냥이 HP 비율 */
  entryHp: number;
  kills: number;
}

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
  /** 교전 정차 ↔ 전진 전환 횟수 */
  toggles: number;
  /** 사거리 밖 적 때문에 1.5초 넘게 서 있었던 구간 수(일반 구간) */
  longWaits: number;
  /** 전진을 재개한 뒤 0.3초 안에 다시 멈춘 횟수(경계 떨림) */
  quickRestops: number;
  /** 멈춰 있는데 기본 공격이 닿는 적이 없던 시간(일반 구간, 실제 타격 가능성 확인) */
  stoppedNoTarget: number;
  waves: WaveMetrics[];
  heroLevel: number;
  heroChoices: number;
  campLevel: number;
  campChoices: number;
  perf: { avgTickMs: number; maxTickMs: number; maxEnemies: number; maxPickups: number };
  /** 패배 시 위치: 웨이브 번호(1~3)·구간·일반 구간 활성 시간 */
  death: string;
}

/** 지금까지 얻은 호냥이 경험치 누적(레벨 곡선 합 + 현재 경험치) */
function totalHeroXp(b: Battle): number {
  let s = b.heroXp;
  for (let l = 1; l < b.heroLevel; l++) s += TUNING.growth.heroXpCurve(l);
  return s;
}

export function measureRun(seed: number, save: SaveData = newSave(), maxTime = 1500, prepare?: (b: Battle) => void, survival = true): RunMetrics {
  const prevSurvival = BOT.survival;
  BOT.survival = survival;
  try { return measureInner(seed, save, maxTime, prepare); } finally { BOT.survival = prevSurvival; }
}

function measureInner(seed: number, save: SaveData, maxTime: number, prepare?: (b: Battle) => void): RunMetrics {
  const b = new Battle({ runId: 1, seed, loadout: buildLoadout(save) });
  prepare?.(b);
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
  const waves: WaveMetrics[] = [0, 1, 2].map(() => ({ normal: 0, finale: -1, firstHit: -1, idle: 0, xp: 0, levelUps: 0, campLevelUps: 0, entryHp: -1, kills: 0 }));
  let finaleSpawnT = -1;
  const origHit = anyB.hitEnemy.bind(b);
  anyB.hitEnemy = (...a: unknown[]) => {
    const e = a[0] as { role: string; wave: number };
    const w = waves[e.wave];
    if (ctx === 'hero' && e.role === 'finale' && w && w.firstHit < 0 && finaleSpawnT >= 0) w.firstHit = Math.round((b.t - finaleSpawnT) * 100) / 100;
    return origHit(...a);
  };
  const origKill = anyB.killEnemy.bind(b);
  anyB.killEnemy = (e: unknown) => {
    if (b.enemies.includes(e as never)) { kills[ctx]++; const w = waves[(e as { wave: number }).wave]; if (w) w.kills++; }
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
  let stoppedNoTarget = 0;
  let lastMoved = false;
  let resumedAt = -1;
  let heroChoices = 0;
  let campChoices = 0;
  let tickMs = 0;
  let ticks = 0;
  let maxTickMs = 0;
  let maxEnemies = 0;
  let maxPickups = 0;
  const dt = 1 / 60;
  const range = TUNING.basicAttack.range;
  const now = () => (globalThis.performance ? performance.now() : Date.now());
  while (!b.finished && b.t < maxTime) {
    const wi = Math.min(b.waveIndex, 2);
    if (b.paused) { if (b.pending[0].track === 'hero') heroChoices++; else campChoices++; botChoose(b); continue; }
    const x0 = b.player.x;
    const hp0 = b.player.hp;
    const m0 = b.camp.mental;
    const t0 = b.t;
    const xp0 = totalHeroXp(b);
    const lv0 = b.heroLevel;
    const clv0 = b.campLevel;
    const spawned0 = b.waves[wi].finaleSpawned;
    const input = botInput(b);
    const c0 = now();
    b.update(dt, input);
    const c1 = now() - c0;
    tickMs += c1; ticks++; maxTickMs = Math.max(maxTickMs, c1);
    maxEnemies = Math.max(maxEnemies, b.enemies.length);
    maxPickups = Math.max(maxPickups, b.pickups.length);
    waves[wi].xp += totalHeroXp(b) - xp0;
    waves[wi].levelUps += b.heroLevel - lv0;
    waves[wi].campLevelUps += b.campLevel - clv0;
    if (!spawned0 && b.waves[wi].finaleSpawned) { finaleSpawnT = b.t; waves[wi].entryHp = Math.round((b.player.hp / b.player.maxHp) * 100) / 100; }
    if (finaleSpawnT >= 0 && (b.waveIndex !== wi || b.finished || b.waves[wi].cleared)) {
      if (b.waves[wi].cleared || b.mode === 'victory') waves[wi].finale = Math.round((b.t - finaleSpawnT) * 10) / 10;
      finaleSpawnT = -1;
    }
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
      const rt = b.waves[b.waveIndex];
      const normal = rt?.phase === 'normal';
      if (normal) {
        waves[b.waveIndex].normal = rt.normalTime;
        if (!moved && !engaged && b.player.stagger <= 0 && !b.heroStatus.frozen) stoppedNoTarget += dt;
      } else if (rt?.finaleSpawned && !moved && !engaged) waves[b.waveIndex].idle += dt;
      if (!moved && !engaged && normal) waitRun += dt;
      else { if (waitRun > 1.5) longWaits++; waitRun = 0; }
    }
  }
  const total = kills.hero + kills.camp + kills.ult + kills.dot;
  return {
    seed, outcome: b.mode, time: Math.round(b.t), kills,
    heroShare: total ? kills.hero / total : 0,
    waveTime, firstAttackDelay: firstAttack, heroDamage, campDamage, toggles, longWaits, quickRestops,
    stoppedNoTarget: Math.round(stoppedNoTarget * 10) / 10,
    waves: waves.map((w) => ({ ...w, normal: Math.round(w.normal * 10) / 10, idle: Math.round(w.idle * 10) / 10, xp: Math.round(w.xp) })),
    heroLevel: b.heroLevel, heroChoices, campLevel: b.campLevel, campChoices,
    death: b.mode === 'defeat' ? `w${b.waveIndex + 1}${b.waves[b.waveIndex]?.phase === 'finale' ? 'F' : 'N' + Math.round(b.waves[b.waveIndex]?.normalTime ?? 0)}` : '',
    perf: { avgTickMs: Math.round((tickMs / Math.max(1, ticks)) * 1000) / 1000, maxTickMs: Math.round(maxTickMs * 100) / 100, maxEnemies, maxPickups },
  };
}

const stat = (xs: number[]) => {
  const v = xs.filter((x) => x >= 0).sort((a, b) => a - b);
  if (!v.length) return { min: -1, med: -1, max: -1 };
  const r = (x: number) => Math.round(x * 100) / 100;
  return { min: r(v[0]), med: r(v[Math.floor(v.length / 2)]), max: r(v[v.length - 1]) };
};

export function summarize(runs: RunMetrics[]) {
  const avg = (f: (r: RunMetrics) => number) => Math.round((runs.reduce((s, r) => s + f(r), 0) / runs.length) * 100) / 100;
  return {
    runs: runs.length,
    victories: runs.filter((r) => r.outcome === 'victory').length,
    time: stat(runs.map((r) => r.time)),
    heroKills: avg((r) => r.kills.hero), campKills: avg((r) => r.kills.camp), ultKills: avg((r) => r.kills.ult), dotKills: avg((r) => r.kills.dot),
    heroShare: stat(runs.map((r) => r.heroShare)),
    moving: avg((r) => r.waveTime.moving), engaged: avg((r) => r.waveTime.engaged), waiting: avg((r) => r.waveTime.waiting),
    firstAttackDelay: avg((r) => r.firstAttackDelay),
    heroDmgStopped: avg((r) => r.heroDamage.stopped), heroDmgMoving: avg((r) => r.heroDamage.moving), campDamage: avg((r) => r.campDamage),
    toggles: avg((r) => r.toggles), longWaits: avg((r) => r.longWaits), quickRestops: avg((r) => r.quickRestops), stoppedNoTarget: avg((r) => r.stoppedNoTarget),
    heroLevel: stat(runs.map((r) => r.heroLevel)), heroChoices: stat(runs.map((r) => r.heroChoices)), campLevel: stat(runs.map((r) => r.campLevel)),
    perf: { avgTickMs: avg((r) => r.perf.avgTickMs), maxTickMs: Math.max(...runs.map((r) => r.perf.maxTickMs)), maxEnemies: Math.max(...runs.map((r) => r.perf.maxEnemies)), maxPickups: Math.max(...runs.map((r) => r.perf.maxPickups)) },
    waves: [0, 1, 2].map((i) => ({
      normal: stat(runs.map((r) => r.waves[i].normal)),
      xp: stat(runs.filter((r) => r.waves[i].finale >= 0).map((r) => r.waves[i].xp)),
      levelUps: stat(runs.filter((r) => r.waves[i].finale >= 0).map((r) => r.waves[i].levelUps)),
      kills: stat(runs.filter((r) => r.waves[i].finale >= 0).map((r) => r.waves[i].kills)),
      entryHp: stat(runs.map((r) => r.waves[i].entryHp)),
      finale: stat(runs.map((r) => r.waves[i].finale)),
      firstHit: stat(runs.map((r) => r.waves[i].firstHit)),
      idle: stat(runs.filter((r) => r.waves[i].finale >= 0).map((r) => r.waves[i].idle)),
    })),
  };
}
