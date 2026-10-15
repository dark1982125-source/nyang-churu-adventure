import { TUNING, type AdvanceMode } from '../config/tuning';
import { CHAPTER_1, requiredKillCount, type ChapterDef } from '../data/chapters';
import { BOSS_PATTERNS, ENEMIES, ROLL_PATTERN, type EnemyDef, type EnemyKind } from '../data/enemies';
import type { LootId } from '../data/items';
import { COMPANIONS, type CompanionId } from '../data/companions';
import { GLOVE, ULTIMATES, type CampSkillId, type ExclusiveSkillDef, type UltimateId, type WeaponDef } from '../data/skills';
import type { Loadout } from '../meta/save';
import {
  campOffers, heroOffers, type Offer, type PendingChoice, type RunSkills,
} from './choices';
import { Rng } from './rng';

/**
 * 한 판(챕터 1개)의 전투 시뮬레이션. Phaser와 분리된 순수 로직이라
 * 테스트에서 화면 없이 끝까지 돌릴 수 있다. 좌표: x는 오른쪽이 +, y는 지면(0)에서 위로 +.
 */

export interface InputState {
  /** 전진 입력(누르고 있는 동안). auto 모드에서는 무시된다. */
  forward: boolean;
  /** 점프(이번 틱에 눌렸으면 true) */
  jump: boolean;
  /** 궁극기 슬롯 번호(0~2), 없으면 null */
  ult: number | null;
}

export const NO_INPUT: InputState = { forward: false, jump: false, ult: null };

export type Mode = 'travel' | 'wave' | 'toJail' | 'opening' | 'revealed' | 'victory' | 'defeat';
export type DefeatCause = 'hero' | 'camp';

export interface Enemy {
  id: number;
  def: EnemyDef;
  x: number;
  y: number;
  vy: number;
  hp: number;
  wave: number;
  /** 지정 처치 대상(웨이브 데이터에 있는 적). 분열 자식은 false */
  required: boolean;
  parentId: number | null;
  generation: number;
  contactCd: number;
  stun: number;
  passed: boolean;
  /** 패턴 상태 */
  state: 'walk' | 'telegraph' | 'roll' | 'stomp' | 'throw' | 'hop';
  stateTimer: number;
  cdA: number;
  cdB: number;
  rollTarget: number;
  hopTimer: number;
  flash: number;
}

export interface Hazard {
  kind: 'shockwave' | 'rock';
  x: number;
  vx: number;
  /** 낙석: 낙하까지 남은 시간 */
  timer: number;
  radius: number;
  damage: number;
  hitPlayer: boolean;
  done: boolean;
}

export type PickupKind = 'catnip' | 'gear' | 'bell' | 'key' | 'capsule';
export interface Pickup {
  id: number;
  kind: PickupKind;
  x: number;
  y: number;
  vy: number;
  age: number;
  lifetime: number | null;
  value: number;
}

export interface Effect {
  kind: 'hit' | 'zone' | 'beam' | 'telegraph' | 'text' | 'laser' | 'banner' | 'shield' | 'ult';
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  ttl: number;
  maxTtl: number;
  text?: string;
  color?: number;
}

export interface LogEntry {
  t: number;
  type:
    | 'waveStart' | 'waveClear' | 'eliteSpawn' | 'kill' | 'split' | 'pass' | 'outOfBounds' | 'missedPickup'
    | 'levelUp' | 'campLevelUp' | 'skill' | 'ult' | 'revive' | 'bell' | 'key' | 'jailOpen' | 'victory' | 'defeat';
  detail?: string;
  value?: number;
}

interface ScheduledHit {
  at: number;
  skill: ExclusiveSkillDef;
  /** chain: 그 시점 가장 가까운 전방 적 1명 */
  chainRange?: number;
  area?: { x1: number; x2: number; y1: number; y2: number };
  damage: number;
  stun: number;
}

interface WaveRuntime {
  started: boolean;
  cleared: boolean;
  queue: { kind: EnemyKind; delay: number }[];
  spawnTimer: number;
  finaleSpawned: boolean;
  finaleId: number | null;
}

export interface RunResult {
  runId: number;
  chapterId: number;
  outcome: 'victory' | 'defeat';
  defeatCause: DefeatCause | null;
  loot: Partial<Record<LootId, number>>;
  rescued: CompanionId | null;
  time: number;
  kills: { required: number; requiredTotal: number; children: number };
  heroLevel: number;
}

export interface BattleOptions {
  runId: number;
  seed: number;
  loadout: Loadout;
  chapter?: ChapterDef;
  weapon?: WeaponDef;
  /** 테스트용 강제 다시냥 방울 드롭 */
  forceBellDrop?: boolean;
}

export class Battle {
  readonly chapter: ChapterDef;
  readonly weapon: WeaponDef;
  readonly loadout: Loadout;
  readonly runId: number;
  readonly rng: Rng;
  advanceMode: AdvanceMode;

  t = 0;
  mode: Mode = 'travel';
  defeatCause: DefeatCause | null = null;
  modeTimer = 0;

  player = {
    x: 160, y: 0, vy: 0, hp: 0, maxHp: 0, invuln: 0,
    energy: TUNING.player.maxEnergy as number, maxEnergy: TUNING.player.maxEnergy as number,
    basicTimer: 0, attackAnim: 0, maxXReached: 160, hurt: 0,
  };
  camp = { x: 0, mental: 0, maxMental: 0, shield: 0, moving: false };

  heroLevel = 1;
  heroXp = 0;
  campLevel = 1;
  campXp = 0;
  runLuck = 0;
  ultGauge = 0;
  hasBell = false;
  revivesUsed = 0;
  hasKey = false;
  slowAll = 0;

  skills: RunSkills = { basicLevel: 1, exclusives: [], passives: {}, camp: {} };
  skillCd: Record<string, number> = {};
  pending: PendingChoice[] = [];

  enemies: Enemy[] = [];
  hazards: Hazard[] = [];
  pickups: Pickup[] = [];
  effects: Effect[] = [];
  log: LogEntry[] = [];
  loot: Partial<Record<LootId, number>> = {};

  waveIndex = 0;
  waves: WaveRuntime[];
  rightLimit: number;
  killsRequired = 0;
  readonly requiredTotal: number;
  childrenSpawned = 0;
  childrenKilled = 0;

  private nextId = 1;
  private scheduled: ScheduledHit[] = [];
  private supportTimers = { barrier: 2, laser: 1.5, capsule: 6 };
  private forceBellDrop: boolean;

  constructor(opts: BattleOptions) {
    this.chapter = opts.chapter ?? CHAPTER_1;
    this.weapon = opts.weapon ?? GLOVE;
    this.loadout = opts.loadout;
    this.runId = opts.runId;
    this.rng = new Rng(opts.seed);
    this.advanceMode = opts.loadout.advanceMode;
    this.forceBellDrop = opts.forceBellDrop ?? false;

    this.player.maxHp = this.player.hp = opts.loadout.maxHp;
    this.camp.maxMental = this.camp.mental = opts.loadout.campMaxMental;
    this.camp.x = this.player.x - TUNING.camp.followGap;
    this.requiredTotal = requiredKillCount(this.chapter);

    this.waves = this.chapter.waves.map((w) => {
      const queue: { kind: EnemyKind; delay: number }[] = [];
      for (const g of w.groups) for (let i = 0; i < g.count; i++) queue.push({ kind: g.kind, delay: g.interval });
      return { started: false, cleared: false, queue, spawnTimer: 0.6, finaleSpawned: false, finaleId: null };
    });
    this.rightLimit = this.chapter.waves[0].triggerX;

    if (this.chapter.rescue) {
      this.banner('저 멀리 무언가 갇혀 있다… 동료 발견! 보스를 물리치고 감옥 열쇠를 획득하세요.', 4);
    }
  }

  // ───────────────────────── 조회용

  get paused(): boolean { return this.pending.length > 0; }
  get finished(): boolean { return this.mode === 'victory' || this.mode === 'defeat'; }
  get luck(): number { return this.loadout.baseLuck + this.runLuck; }
  get heroXpNeeded(): number { return TUNING.growth.heroXpCurve(this.heroLevel); }
  get campXpNeeded(): number { return TUNING.growth.campXpCurve(this.campLevel); }
  get grounded(): boolean { return this.player.y <= 0; }
  get rescued(): CompanionId[] { return this.loadout.rescued; }

  /** 남은 지정 처치 대상(스폰 대기 포함) */
  get requiredRemaining(): number { return this.requiredTotal - this.killsRequired; }
  /** 살아 있는 분열 자식 수. 처치 수 UI 집계 정책이 미정이라 따로 보여 준다. */
  get childrenAlive(): number { return this.enemies.filter((e) => !e.required).length; }

  waveRemaining(i: number): number {
    const w = this.waves[i];
    const alive = this.enemies.filter((e) => e.wave === i).length;
    return w.queue.length + (w.finaleSpawned ? 0 : 1) + alive;
  }

  result(): RunResult {
    return {
      runId: this.runId,
      chapterId: this.chapter.id,
      outcome: this.mode === 'victory' ? 'victory' : 'defeat',
      defeatCause: this.defeatCause,
      loot: { ...this.loot },
      rescued: this.mode === 'victory' && this.chapter.rescue ? this.chapter.rescue.companion : null,
      time: this.t,
      kills: { required: this.killsRequired, requiredTotal: this.requiredTotal, children: this.childrenKilled },
      heroLevel: this.heroLevel,
    };
  }

  // ───────────────────────── 선택창

  choose(index: number): void {
    const p = this.pending[0];
    if (!p) return;
    const o = p.offers[Math.max(0, Math.min(index, p.offers.length - 1))];
    this.applyOffer(o);
    this.pending.shift();
  }

  private applyOffer(o: Offer): void {
    const s = this.skills;
    switch (o.kind) {
      case 'basic': s.basicLevel = o.nextLevel; break;
      case 'exclusive': {
        const owned = s.exclusives.find((e) => e.id === o.id);
        if (owned) { owned.grade = o.grade; owned.level = o.level; }
        else { s.exclusives.push({ id: o.id, grade: o.grade, level: o.level }); this.skillCd[o.id] = 0.5; }
        break;
      }
      case 'passive':
        s.passives[o.id] = o.nextLevel;
        if (o.id === 'vitality') { this.player.maxHp += 15; this.player.hp = Math.min(this.player.maxHp, this.player.hp + 15); }
        if (o.id === 'luckyBell') this.runLuck += 2;
        break;
      case 'heal': this.player.hp = Math.min(this.player.maxHp, this.player.hp + 25); break;
      case 'camp':
        s.camp[o.id] = o.nextLevel;
        if (o.id === 'repair') this.camp.mental = Math.min(this.camp.maxMental, this.camp.mental + TUNING.supports.campRepair);
        break;
    }
  }

  private availableCampSkills(): CampSkillId[] {
    const list: CampSkillId[] = ['barrier', 'laser', 'repair'];
    // 구출한 동료만 다음 출격부터 지원. 미래 동료는 활성화하지 않는다.
    if (this.loadout.rescued.includes('kosyot')) list.push('capsule');
    return list;
  }

  // ───────────────────────── 메인 루프

  update(dtRaw: number, input: InputState): void {
    if (this.finished || this.paused) return;
    const dt = Math.min(dtRaw, 1 / 20);
    this.t += dt;
    this.tickEffects(dt);

    if (this.mode === 'opening' || this.mode === 'revealed') {
      this.modeTimer -= dt;
      if (this.modeTimer <= 0) {
        if (this.mode === 'opening') {
          this.mode = 'revealed';
          this.modeTimer = 3;
          const name = this.chapter.rescue ? companionName(this.chapter.rescue.companion) : '';
          this.banner(`${name}을(를) 구출했습니다!`, 3);
          this.logEvent('jailOpen', name);
        } else {
          this.finish('victory');
        }
      }
      return;
    }

    this.updatePlayer(dt, input);
    this.updateCamp(dt);
    this.updateWaves(dt);
    this.updateEnemies(dt);
    this.updateHazards(dt);
    this.updateCombat(dt);
    this.updateSupports(dt);
    this.updatePickups(dt);
    if (input.ult !== null) this.useUltimate(input.ult);
    this.checkDefeat();
    this.checkJail();
  }

  private updatePlayer(dt: number, input: InputState): void {
    const p = this.player;
    p.invuln = Math.max(0, p.invuln - dt);
    p.hurt = Math.max(0, p.hurt - dt);
    p.attackAnim = Math.max(0, p.attackAnim - dt);
    const regenMul = 1 + 0.25 * (this.skills.passives.energyFlow ?? 0);
    p.energy = Math.min(p.maxEnergy, p.energy + TUNING.player.energyRegen * regenMul * dt);

    let wantMove: boolean;
    if (this.advanceMode === 'hold') wantMove = input.forward;
    else wantMove = !this.enemyAhead(150);

    if (wantMove) {
      let nx = p.x + TUNING.player.moveSpeed * dt;
      nx = Math.min(nx, this.rightLimit);
      // 지상의 적에게 막힌다(통과 불가)
      for (const e of this.enemies) {
        if (e.passed || e.x < p.x) continue;
        if (!this.verticalOverlap(e)) continue;
        nx = Math.min(nx, e.x - (TUNING.player.width + e.def.width) / 2);
      }
      // 오른쪽 전진만 허용: 어떤 경우에도 x는 줄어들지 않는다.
      p.x = Math.max(p.x, nx);
    }
    p.maxXReached = Math.max(p.maxXReached, p.x);

    if (input.jump && this.grounded) p.vy = TUNING.player.jumpVelocity;
    p.vy -= TUNING.world.gravity * dt;
    p.y = Math.max(0, p.y + p.vy * dt);
    if (p.y <= 0 && p.vy < 0) p.vy = 0;
  }

  private verticalOverlap(e: Enemy): boolean {
    return this.player.y < e.y + e.def.height && e.y < this.player.y + TUNING.player.height;
  }

  private enemyAhead(dist: number): boolean {
    return this.enemies.some((e) => !e.passed && e.x > this.player.x && e.x - e.def.width / 2 - this.player.x < dist);
  }

  private updateCamp(dt: number): void {
    const c = this.camp;
    const target = this.player.x - TUNING.camp.followGap;
    // 캠프는 웨이브 전투 중 정차, 그 외에는 오른쪽으로 전진
    if (this.mode !== 'wave' && c.x < target) {
      c.x = Math.min(target, c.x + TUNING.camp.moveSpeed * dt);
      c.moving = true;
    } else {
      c.moving = false;
    }
  }

  // ───────────────────────── 웨이브

  private updateWaves(dt: number): void {
    if (this.mode === 'travel' && this.waveIndex < 3) {
      const def = this.chapter.waves[this.waveIndex];
      if (this.player.x >= def.triggerX - 1) this.startWave();
    }
    if (this.mode !== 'wave') return;

    const i = this.waveIndex;
    const w = this.waves[i];
    const aliveNow = this.enemies.length;
    if (w.queue.length > 0) {
      w.spawnTimer -= dt;
      if (w.spawnTimer <= 0 && aliveNow < TUNING.waves.maxAlive) {
        const next = w.queue.shift()!;
        this.spawnEnemy(next.kind, i, true);
        w.spawnTimer = next.delay;
      }
    } else if (!w.finaleSpawned) {
      // 일반 적을 모두 처치하면 엘리트/보스 등장
      if (!this.enemies.some((e) => e.wave === i)) {
        const kind = this.chapter.waves[i].finale;
        const e = this.spawnEnemy(kind, i, true);
        w.finaleSpawned = true;
        w.finaleId = e.id;
        this.logEvent('eliteSpawn', e.def.name);
        this.banner(`${e.def.rank === 'boss' ? '보스' : '엘리트'} 등장! ${e.def.name}`, 2.2);
      }
    } else if (!this.enemies.some((e) => e.wave === i)) {
      // 엘리트/보스와 그 분열 자식까지 전부 처치해야 웨이브 종료
      this.clearWave();
    }
  }

  private startWave(): void {
    const i = this.waveIndex;
    const def = this.chapter.waves[i];
    this.waves[i].started = true;
    this.mode = 'wave';
    // 전방 전투 구역: 이 너머로는 전진할 수 없다
    this.rightLimit = def.triggerX + TUNING.waves.arenaLength;
    this.logEvent('waveStart', `${i + 1}`);
    this.banner(`웨이브 ${i + 1} / 3`, 1.8);
  }

  private clearWave(): void {
    const i = this.waveIndex;
    this.waves[i].cleared = true;
    this.logEvent('waveClear', `${i + 1}`);
    this.waveIndex++;
    if (this.waveIndex < 3) {
      this.mode = 'travel';
      this.rightLimit = this.chapter.waves[this.waveIndex].triggerX;
      this.banner(`웨이브 ${i + 1} 돌파! 캠프 전진`, 1.8);
    } else if (this.chapter.rescue) {
      this.mode = 'toJail';
      this.rightLimit = this.chapter.rescue.jailX - 50;
      this.banner('감옥 열쇠를 챙겨 감옥으로!', 2.5);
    } else {
      this.finish('victory');
    }
  }

  private spawnEnemy(kind: EnemyKind, wave: number, required: boolean, x?: number, parent?: Enemy): Enemy {
    const def = ENEMIES[kind];
    const spawnX = x ?? this.chapter.waves[wave].triggerX + TUNING.waves.arenaLength + TUNING.waves.spawnAhead;
    const e: Enemy = {
      id: this.nextId++, def, x: spawnX, y: 0, vy: 0, hp: def.hp, wave, required,
      parentId: parent?.id ?? null, generation: parent ? parent.generation + 1 : 0,
      contactCd: 0, stun: 0, passed: false, state: 'walk', stateTimer: 0,
      cdA: 2, cdB: 3.5, rollTarget: 0, hopTimer: this.rng.range(0.5, 1.5), flash: 0,
    };
    this.enemies.push(e);
    return e;
  }

  // ───────────────────────── 적

  private updateEnemies(dt: number): void {
    const p = this.player;
    const slowMul = this.slowAll > 0 ? 0.5 : 1;
    this.slowAll = Math.max(0, this.slowAll - dt);
    const campFront = this.camp.x + TUNING.camp.width / 2;

    for (const e of this.enemies) {
      e.contactCd = Math.max(0, e.contactCd - dt);
      e.flash = Math.max(0, e.flash - dt);
      // 낙하
      if (e.y > 0 || e.vy > 0) {
        e.vy -= TUNING.world.gravity * dt;
        e.y = Math.max(0, e.y + e.vy * dt);
        if (e.y === 0) e.vy = 0;
      }
      if (e.stun > 0) { e.stun -= dt; continue; }

      const speed = e.def.speed * slowMul;
      if (e.def.kind === 'rollingRat') this.updateRollingRat(e, dt, speed);
      else if (e.def.kind === 'stompSole') this.updateBoss(e, dt, speed);
      else {
        if (e.def.kind === 'spikyBug') {
          e.hopTimer -= dt;
          if (e.hopTimer <= 0 && e.y === 0) { e.vy = 300; e.hopTimer = 1.4; } // TEMP 깡충
        }
        this.walkLeft(e, speed * dt);
      }

      // 캠프에 붙은 적은 멘탈을 깎는다
      if (e.x - e.def.width / 2 <= campFront + 1) {
        e.x = Math.max(e.x, campFront + e.def.width / 2);
        this.damageCamp(TUNING.camp.contactDps * dt);
      }

      // 호냥이 접촉 피해
      const overlapX = Math.abs(e.x - p.x) < (TUNING.player.width + e.def.width) / 2;
      if (overlapX && this.verticalOverlap(e) && e.contactCd <= 0) {
        if (this.damagePlayer(e.def.contactDamage)) e.contactCd = e.def.contactInterval;
      }

      // 통과·이탈 감지(자동 처치/도주 처리 없이 기록만 한다)
      if (!e.passed && e.x < p.x) {
        e.passed = true;
        this.logEvent('pass', e.def.name);
      }
      if (e.x < this.camp.x - 200 || e.x > this.rightLimit + 2000) {
        this.logEvent('outOfBounds', e.def.name);
        e.x = Math.max(campFront + e.def.width / 2, Math.min(e.x, this.rightLimit + 600));
      }
    }
  }

  /** 왼쪽으로 걷기. 지상의 호냥이 앞에서는 막힌다(호냥이가 공중이면 아래로 지나갈 수 있음). */
  private walkLeft(e: Enemy, step: number): void {
    const p = this.player;
    let nx = e.x - step;
    if (!e.passed && e.x >= p.x && this.verticalOverlap(e)) {
      nx = Math.max(nx, p.x + (TUNING.player.width + e.def.width) / 2 - 2);
    }
    e.x = Math.min(e.x, nx);
  }

  private updateRollingRat(e: Enemy, dt: number, speed: number): void {
    const p = this.player;
    e.cdA -= dt;
    if (e.state === 'walk') {
      this.walkLeft(e, speed * dt);
      if (e.cdA <= 0 && e.x - p.x < 420) {
        e.state = 'telegraph';
        e.stateTimer = ROLL_PATTERN.telegraph;
        this.addEffect({ kind: 'telegraph', x1: p.x, x2: e.x, y1: 0, y2: 8, ttl: ROLL_PATTERN.telegraph, text: '구르기!' });
      }
    } else if (e.state === 'telegraph') {
      e.stateTimer -= dt;
      if (e.stateTimer <= 0) {
        e.state = 'roll';
        // 구르기 목표: 예고 종료 시점 호냥이 바로 앞. 호냥이 뒤로는 넘어가지 않는다.
        e.rollTarget = p.x + (TUNING.player.width + e.def.width) / 2 - 4;
      }
    } else if (e.state === 'roll') {
      e.x = Math.max(e.rollTarget, e.x - ROLL_PATTERN.speed * dt);
      const touching = Math.abs(e.x - p.x) < (TUNING.player.width + e.def.width) / 2;
      if (touching && this.verticalOverlap(e)) {
        this.damagePlayer(ROLL_PATTERN.damage);
        e.x += ROLL_PATTERN.bounce;
        e.state = 'walk';
        e.cdA = ROLL_PATTERN.cooldown;
      } else if (e.x <= e.rollTarget) {
        e.state = 'walk';
        e.cdA = ROLL_PATTERN.cooldown;
      }
    }
  }

  private updateBoss(e: Enemy, dt: number, speed: number): void {
    const p = this.player;
    const gap = e.x - e.def.width / 2 - (p.x + TUNING.player.width / 2);
    e.cdA -= dt;
    e.cdB -= dt;
    const onScreen = e.x - p.x < TUNING.world.viewAhead - 60;
    if (e.state === 'walk') {
      if (gap > 20) this.walkLeft(e, speed * dt);
      if (!onScreen) return;
      if (e.cdB <= 0) {
        // 돌 던지기: 호냥이 바로 앞에 그림자 예고 → 떨어진 돌이 왼쪽으로 굴러온다. 점프로 넘거나 맞는다.
        e.state = 'throw';
        e.stateTimer = 0.5;
        const R = BOSS_PATTERNS.rockThrow;
        for (let k = 0; k < R.count; k++) {
          const tx = p.x + R.landAhead + k * R.spread;
          this.hazards.push({ kind: 'rock', x: tx, vx: 0, timer: R.telegraph + k * R.stagger, radius: R.radius, damage: R.damage, hitPlayer: false, done: false });
        }
        e.cdB = R.cooldown;
      } else if (e.cdA <= 0) {
        e.state = 'stomp';
        e.stateTimer = BOSS_PATTERNS.shockwave.telegraph;
        this.addEffect({ kind: 'telegraph', x1: e.x - 60, x2: e.x + 60, y1: 0, y2: 10, ttl: e.stateTimer, text: '쿵!' });
      }
    } else if (e.state === 'stomp') {
      e.stateTimer -= dt;
      if (e.stateTimer <= 0) {
        const S = BOSS_PATTERNS.shockwave;
        this.hazards.push({ kind: 'shockwave', x: e.x - e.def.width / 2, vx: -S.speed, timer: 0, radius: S.width / 2, damage: S.damage, hitPlayer: false, done: false });
        e.state = 'walk';
        e.cdA = S.cooldown;
      }
    } else if (e.state === 'throw') {
      e.stateTimer -= dt;
      if (e.stateTimer <= 0) e.state = 'walk';
    }
  }

  private updateHazards(dt: number): void {
    const p = this.player;
    const S = BOSS_PATTERNS.shockwave;
    for (const h of this.hazards) {
      if (h.kind === 'shockwave') {
        h.x += h.vx * dt * (this.slowAll > 0 ? 0.5 : 1);
        const hit = Math.abs(h.x - p.x) < h.radius + TUNING.player.width / 2 && p.y < S.height;
        if (hit && !h.hitPlayer) { if (this.damagePlayer(h.damage)) h.hitPlayer = true; }
        if (h.x <= this.camp.x + TUNING.camp.width / 2) {
          this.damageCamp(S.campDamage);
          h.done = true;
        }
      } else {
        const R = BOSS_PATTERNS.rockThrow;
        if (h.timer > 0) {
          h.timer -= dt;
          if (h.timer <= 0) {
            // 낙하 순간 바로 아래에 있으면 피해, 이후 굴러오기 시작
            if (Math.abs(h.x - p.x) < h.radius + TUNING.player.width / 2 - 4 && p.y < 40) { if (this.damagePlayer(h.damage)) h.hitPlayer = true; }
            h.vx = -R.rollSpeed;
            this.addEffect({ kind: 'hit', x1: h.x - h.radius, x2: h.x + h.radius, y1: 0, y2: 30, ttl: 0.25, color: 0x9a8f7a });
          }
          continue;
        }
        h.x += h.vx * dt * (this.slowAll > 0 ? 0.5 : 1);
        const hit = Math.abs(h.x - p.x) < h.radius + TUNING.player.width / 2 - 6 && p.y < R.height;
        if (hit && !h.hitPlayer) { if (this.damagePlayer(h.damage)) h.hitPlayer = true; }
        if (h.x <= this.camp.x + TUNING.camp.width / 2) {
          this.damageCamp(R.campDamage);
          h.done = true;
        }
      }
    }
    this.hazards = this.hazards.filter((h) => !h.done);
  }

  // ───────────────────────── 호냥이 공격

  private damageMul(): number {
    return this.loadout.damageMul * (1 + 0.08 * (this.skills.passives.sharpClaws ?? 0));
  }

  private frontEnemies(range: number): Enemy[] {
    const front = this.player.x + TUNING.player.width / 2;
    return this.enemies
      .filter((e) => !e.passed && e.x >= this.player.x && e.x - e.def.width / 2 <= front + range)
      .sort((a, b) => a.x - b.x);
  }

  private updateCombat(dt: number): void {
    const p = this.player;
    const B = TUNING.basicAttack;
    const lvl = this.skills.basicLevel;

    // 기본 공격: 무소모 자동 전방 공격
    p.basicTimer -= dt;
    if (p.basicTimer <= 0) {
      const target = this.frontEnemies(B.range)[0];
      if (target) {
        const dmg = B.damage * (1 + B.damagePerLevel * (lvl - 1)) * this.damageMul();
        this.hitEnemy(target, dmg, 0);
        p.attackAnim = 0.15;
        p.basicTimer = Math.max(0.2, B.interval - B.intervalPerLevel * (lvl - 1));
        if (TUNING.ultimate.basicAttackCharges) this.chargeUlt(TUNING.ultimate.basicAttackChargeAmount);
      }
    }

    // 전용 기술: 냥기력과 쿨타임이 모두 준비되고 전방에 적이 있을 때 자동 발동
    for (const owned of this.skills.exclusives) {
      const def = this.weapon.exclusives.find((d) => d.id === owned.id)!;
      this.skillCd[def.id] = Math.max(0, (this.skillCd[def.id] ?? 0) - dt);
      if (this.skillCd[def.id] > 0 || p.energy < def.energy) continue;
      if (this.frontEnemies(def.triggerRange).length === 0) continue;
      const gi = owned.level - 1;
      const dmgMul = TUNING.growth.gradeDamage[owned.grade][gi];
      const cdMul = TUNING.growth.gradeCooldown[owned.grade][gi];
      // 실제 발동 시에만 차감·쿨타임 시작
      p.energy -= def.energy;
      this.skillCd[def.id] = def.cooldown * cdMul;
      this.chargeUlt(def.ultCharge);
      this.castSkill(def, def.damage * dmgMul * this.damageMul());
      this.logEvent('skill', def.name);
    }

    // 예약된 타격 처리
    const due = this.scheduled.filter((s) => s.at <= this.t);
    this.scheduled = this.scheduled.filter((s) => s.at > this.t);
    for (const s of due) {
      if (s.chainRange !== undefined) {
        const target = this.frontEnemies(s.chainRange)[0];
        if (target) {
          this.hitEnemy(target, s.damage, 0);
          this.addEffect({ kind: 'hit', x1: target.x - 8, x2: target.x + 8, y1: 20, y2: 36, ttl: 0.15, color: 0xffb3d1 });
        }
      } else if (s.area) {
        for (const e of [...this.enemies]) {
          if (e.passed) continue;
          const l = e.x - e.def.width / 2, r = e.x + e.def.width / 2;
          if (r >= s.area.x1 && l <= s.area.x2 && e.y + e.def.height >= s.area.y1 && e.y <= s.area.y2) {
            this.hitEnemy(e, s.damage, s.stun);
          }
        }
      }
    }
  }

  private castSkill(def: ExclusiveSkillDef, damage: number): void {
    const px = this.player.x;
    const sh = def.shape;
    if (sh.kind === 'chain') {
      for (let k = 0; k < sh.shots; k++) this.scheduled.push({ at: this.t + k * sh.shotInterval, skill: def, chainRange: sh.range, damage, stun: 0 });
      this.addEffect({ kind: 'text', x1: px, x2: px, y1: 70, y2: 70, ttl: 0.6, text: def.name });
    } else if (sh.kind === 'zone') {
      const area = { x1: px + sh.x1, x2: px + sh.x2, y1: sh.y1, y2: sh.y2 };
      if (sh.telegraph > 0) this.addEffect({ kind: 'telegraph', ...area, y2: 10, ttl: sh.telegraph, text: def.name });
      for (let k = 0; k < sh.hits; k++) {
        this.scheduled.push({ at: this.t + sh.telegraph + k * sh.hitInterval, skill: def, area, damage, stun: 0 });
        this.addEffect({ kind: 'zone', ...area, ttl: sh.telegraph + k * sh.hitInterval + 0.18, color: 0xffd38a });
      }
      if (sh.telegraph === 0) this.addEffect({ kind: 'text', x1: px, x2: px, y1: 70, y2: 70, ttl: 0.6, text: def.name });
    } else {
      const area = { x1: px, x2: px + sh.length, y1: 0, y2: sh.height };
      this.addEffect({ kind: 'telegraph', ...area, y2: 10, ttl: sh.telegraph, text: def.name });
      this.scheduled.push({ at: this.t + sh.telegraph, skill: def, area, damage, stun: sh.stun });
      this.addEffect({ kind: 'beam', ...area, ttl: sh.telegraph + 0.3, color: 0x9be7ff });
    }
  }

  private hitEnemy(e: Enemy, dmg: number, stun: number): void {
    if (!this.enemies.includes(e)) return;
    e.hp -= dmg;
    e.flash = 0.1;
    if (stun > 0) e.stun = Math.max(e.stun, stun);
    this.addEffect({ kind: 'text', x1: e.x, x2: e.x, y1: e.def.height + 10, y2: 0, ttl: 0.5, text: `${Math.round(dmg)}` });
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy): void {
    this.enemies = this.enemies.filter((x) => x !== e);
    if (e.required) this.killsRequired++;
    else this.childrenKilled++;
    this.logEvent('kill', e.def.name, e.required ? 1 : 0);

    // 분열: 자식까지 추적. 세대 상한으로 무한 분열 방지.
    if (e.def.splitInto && e.generation < TUNING.waves.maxSplitGeneration) {
      for (let k = 0; k < e.def.splitInto.count; k++) {
        this.spawnEnemy(e.def.splitInto.kind, e.wave, false, e.x + 20 + k * 30, e);
        this.childrenSpawned++;
      }
      this.logEvent('split', e.def.name, e.def.splitInto.count);
    }

    // 경험치 드롭(작은 개다래 / 작은 톱니)
    for (let k = 0; k < e.def.catnip; k++) this.dropPickup('catnip', e.x + this.rng.range(-20, 20), 1);
    if (this.rng.chance(e.def.gearChance)) this.dropPickup('gear', e.x, e.def.rank === 'normal' ? 1 : 4);

    // 영구 재화·재료는 처치 즉시 판 획득물에 기록(되돌아가 줍는 동작 없음)
    for (const roll of e.def.loot) {
      if (!this.rng.chance(roll.chance)) continue;
      const n = this.rng.int(roll.min, roll.max);
      this.loot[roll.id] = (this.loot[roll.id] ?? 0) + n;
    }

    if (e.def.rank !== 'normal' && !this.hasBell && this.revivesUsed === 0) {
      const p = TUNING.revive.eliteDropChance * (1 + this.luck * TUNING.luck.rareDropPerLuck);
      if (this.forceBellDrop || this.rng.chance(p)) this.dropPickup('bell', e.x, 1);
    }
    if (e.def.rank === 'boss' && this.chapter.rescue) this.dropPickup('key', e.x, 1);
  }

  private chargeUlt(n: number): void {
    // 궁극기 자체 재충전 없음: 기술 발동에서만 충전
    if (!this.loadout.ultimateEnabled) return;
    this.ultGauge = Math.min(TUNING.ultimate.gaugeMax, this.ultGauge + n);
  }

  useUltimate(slot: number): boolean {
    if (!this.loadout.ultimateEnabled || this.ultGauge < TUNING.ultimate.gaugeMax) return false;
    const id: UltimateId | undefined = this.loadout.ultimates[slot];
    if (!id) return false;
    this.ultGauge = 0;
    const p = this.player;
    const visible = this.enemies.filter((e) => e.x - p.x < TUNING.world.viewAhead && e.x > this.camp.x);
    switch (id) {
      case 'atkArea': for (const e of [...visible]) this.hitEnemy(e, 60 * this.damageMul(), 0); break;
      case 'atkSingle': {
        const t = [...this.frontEnemies(TUNING.world.viewAhead)].sort((a, b) => b.hp - a.hp)[0];
        if (t) this.hitEnemy(t, 220 * this.damageMul(), 0);
        break;
      }
      case 'defSlow': this.slowAll = 5; break;
      case 'defReflect':
        this.hazards = [];
        for (const e of this.enemies) if (!e.passed && e.def.rank !== 'boss') e.x += 120;
        break;
      case 'healHero': p.hp = p.maxHp; break;
      case 'healCamp': this.camp.mental = this.camp.maxMental; break;
    }
    this.addEffect({ kind: 'ult', x1: p.x - 300, x2: p.x + 700, y1: 0, y2: 400, ttl: 0.6, text: ULTIMATES[id].name });
    this.logEvent('ult', id);
    return true;
  }

  // ───────────────────────── 동료 지원

  private updateSupports(dt: number): void {
    const S = TUNING.supports;
    const lv = (id: CampSkillId) => this.skills.camp[id] ?? 0;

    // 수염할아버지 골골송 배리어: 캠프 보호막 (적용 대상 TEMP)
    this.supportTimers.barrier -= dt;
    if (this.supportTimers.barrier <= 0) {
      this.camp.shield = Math.max(this.camp.shield, S.barrier.shield + S.barrier.levelShield * lv('barrier'));
      this.supportTimers.barrier = S.barrier.interval - S.barrier.levelInterval * lv('barrier');
      this.addEffect({ kind: 'shield', x1: this.camp.x - 50, x2: this.camp.x + 50, y1: 0, y2: 90, ttl: 0.8 });
    }

    // 삐콩이 서치 레이저: 호냥이 뒤로 넘어간 적을 우선 조준, 없으면 전방 가장 가까운 적
    this.supportTimers.laser -= dt;
    if (this.supportTimers.laser <= 0) {
      const behind = this.enemies.filter((e) => e.passed).sort((a, b) => a.x - b.x)[0];
      const target = behind ?? this.frontEnemies(420)[0];
      if (target) {
        this.addEffect({ kind: 'laser', x1: this.camp.x, x2: target.x, y1: 60, y2: target.y + 14, ttl: 0.25 });
        this.hitEnemy(target, S.laser.damage + S.laser.levelDamage * lv('laser'), 0);
        this.supportTimers.laser = S.laser.interval - S.laser.levelInterval * lv('laser');
      } else {
        this.supportTimers.laser = 0.3;
      }
    }

    // 닥터 코숏 캣닢 캡슐: 구출 이후 출격부터, 호냥이 앞쪽에 투하·접촉 시 자동 사용
    if (this.loadout.rescued.includes('kosyot')) {
      this.supportTimers.capsule -= dt;
      if (this.supportTimers.capsule <= 0) {
        const pk = this.dropPickup('capsule', this.player.x + S.capsule.dropAhead, S.capsule.heal + S.capsule.levelHeal * lv('capsule'));
        pk.lifetime = S.capsule.lifetime;
        pk.y = 160;
        this.supportTimers.capsule = S.capsule.interval - S.capsule.levelInterval * lv('capsule');
      }
    }
  }

  // ───────────────────────── 드롭

  private dropPickup(kind: PickupKind, x: number, value: number): Pickup {
    const pk: Pickup = { id: this.nextId++, kind, x, y: 20, vy: 220, age: 0, lifetime: null, value };
    this.pickups.push(pk);
    return pk;
  }

  private updatePickups(dt: number): void {
    const p = this.player;
    const keep: Pickup[] = [];
    for (const pk of this.pickups) {
      pk.age += dt;
      pk.vy -= TUNING.world.gravity * 0.6 * dt;
      pk.y = Math.max(0, pk.y + pk.vy * dt);
      if (pk.y === 0) pk.vy = 0;
      const dx = p.x - pk.x;
      // 감옥 열쇠는 놓치면 진행 불가가 되므로 거리와 상관없이 호냥이에게 끌려온다
      const magnet = pk.kind === 'key' || (pk.kind !== 'capsule' && Math.abs(dx) < TUNING.pickups.magnetRadius && pk.age > 0.25);
      if (magnet) pk.x += Math.sign(dx) * Math.min(Math.abs(dx), TUNING.pickups.magnetSpeed * dt);
      if (Math.abs(p.x - pk.x) < 22 && Math.abs(p.y - pk.y) < 60) {
        this.collect(pk);
        continue;
      }
      const expired = pk.lifetime !== null && pk.age > pk.lifetime;
      const leftBehind = pk.x < p.x - TUNING.pickups.missedBehind;
      if (expired || leftBehind) {
        this.logEvent('missedPickup', pk.kind, pk.value);
        continue;
      }
      keep.push(pk);
    }
    this.pickups = keep;
  }

  private collect(pk: Pickup): void {
    switch (pk.kind) {
      case 'catnip':
        this.heroXp += pk.value;
        while (this.heroXp >= this.heroXpNeeded) {
          this.heroXp -= this.heroXpNeeded;
          this.heroLevel++;
          this.logEvent('levelUp', `${this.heroLevel}`);
          this.pending.push({ track: 'hero', offers: heroOffers(this.skills, this.weapon, this.luck, this.rng) });
        }
        break;
      case 'gear':
        this.campXp += pk.value;
        while (this.campXp >= this.campXpNeeded) {
          this.campXp -= this.campXpNeeded;
          this.campLevel++;
          this.logEvent('campLevelUp', `${this.campLevel}`);
          this.pending.push({ track: 'camp', offers: campOffers(this.skills, this.availableCampSkills(), this.rng) });
        }
        break;
      case 'bell':
        this.hasBell = true;
        this.logEvent('bell');
        this.banner('다시냥 방울 획득!', 1.6);
        break;
      case 'key':
        this.hasKey = true;
        this.logEvent('key');
        this.banner('감옥 열쇠 획득!', 1.6);
        break;
      case 'capsule':
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + pk.value);
        this.addEffect({ kind: 'text', x1: this.player.x, x2: 0, y1: 80, y2: 0, ttl: 0.7, text: `+${pk.value}`, color: 0x8ef0a0 });
        break;
    }
  }

  // ───────────────────────── 피해·패배·구출

  /** @returns 실제로 피해를 받았는지 */
  damagePlayer(n: number): boolean {
    const p = this.player;
    if (p.invuln > 0 || this.finished) return false;
    p.hp -= n;
    p.invuln = TUNING.player.contactInvuln;
    p.hurt = 0.25;
    if (p.hp <= 0 && this.hasBell && this.revivesUsed < TUNING.revive.perRun) {
      // 다시냥 방울: HP 0에서 자동 소모, 최대 HP 50%로 부활, 3초 무적
      this.hasBell = false;
      this.revivesUsed++;
      p.hp = p.maxHp * TUNING.revive.hpRatio;
      p.invuln = TUNING.revive.invuln;
      this.logEvent('revive');
      this.banner('다시냥 방울! 부활!', 1.8);
    }
    return true;
  }

  damageCamp(n: number): void {
    let left = n;
    if (this.camp.shield > 0) {
      const absorbed = Math.min(this.camp.shield, left);
      this.camp.shield -= absorbed;
      left -= absorbed;
    }
    this.camp.mental -= left;
  }

  private checkDefeat(): void {
    if (this.finished) return;
    // 미정: 동시 패배 판정 우선순위. 지금은 캠프 파괴를 먼저 본다(방울은 캠프에 적용되지 않음).
    if (this.camp.mental <= 0) { this.camp.mental = 0; this.defeatCause = 'camp'; this.finish('defeat'); return; }
    if (this.player.hp <= 0) { this.player.hp = 0; this.defeatCause = 'hero'; this.finish('defeat'); }
  }

  private checkJail(): void {
    const r = this.chapter.rescue;
    if (this.mode !== 'toJail' || !r) return;
    if (this.hasKey && this.player.x >= this.rightLimit - 2) {
      this.mode = 'opening';
      this.modeTimer = 1.6;
      this.banner('열쇠로 감옥을 여는 중…', 1.6);
    }
  }

  private finish(outcome: 'victory' | 'defeat'): void {
    this.mode = outcome;
    this.pending = [];
    this.logEvent(outcome, this.defeatCause ?? undefined);
  }

  // ───────────────────────── 연출 보조

  private addEffect(e: Omit<Effect, 'maxTtl'>): void {
    this.effects.push({ ...e, maxTtl: e.ttl });
  }

  banner(text: string, ttl: number): void {
    this.effects = this.effects.filter((e) => e.kind !== 'banner');
    this.addEffect({ kind: 'banner', x1: 0, x2: 0, y1: 0, y2: 0, ttl, text });
  }

  private tickEffects(dt: number): void {
    for (const e of this.effects) e.ttl -= dt;
    this.effects = this.effects.filter((e) => e.ttl > 0);
  }

  private logEvent(type: LogEntry['type'], detail?: string, value?: number): void {
    this.log.push({ t: Math.round(this.t * 100) / 100, type, detail, value });
  }
}

function companionName(id: CompanionId): string {
  return COMPANIONS[id].name;
}
