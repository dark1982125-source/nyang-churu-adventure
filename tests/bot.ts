import { Battle, type InputState } from '../src/sim/battle';
import { buildLoadout, newSave, type SaveData } from '../src/meta/save';

/** 테스트용 단순 조작 봇: 계속 전진, 충격파가 가까우면 점프, 선택창은 전용 기술 우선. */
export function botInput(b: Battle): InputState {
  const p = b.player;
  // 충격파가 가까우면 점프
  const wave = b.hazards.some((h) => h.kind === 'shockwave' && h.x > p.x && h.x - p.x < 70 + h.radius);
  // 캠프로 날아가는 큰 돌이 머리 위 가까이 오면 점프해서 공중 펀치
  const rock = b.hazards.some((h) => h.kind === 'bigRock' && h.x > p.x && h.x - p.x < 110 && h.y > 85);
  // 구르는 쥐가 굴러오면 점프로 피한다
  const roll = b.enemies.some((e) => e.state === 'roll' && e.x > p.x && e.x - p.x < 120);
  // 캠프 조준 투사체가 머리 위로 오면 점프해서 요격, 공중 적이 바로 앞에 오면 점프 펀치
  const shot = b.hazards.some((h) => h.kind === 'campShot' && h.x > p.x - 10 && h.x - p.x < 90 && h.y > 60);
  const bat = b.enemies.some((e) => e.def.flying && e.x > p.x && e.x - p.x < 75);
  return { jump: wave || rock || roll || (BOT.intercept && (shot || bat)), ult: b.ultGauge >= 100 ? 0 : null };
}

/** 봇 옵션: intercept=false면 캠프 조준 투사체·공중 적을 일부러 무시한다(위협 측정용) */
export const BOT = { intercept: true };

export function botChoose(b: Battle): void {
  const offers = b.pending[0].offers;
  let idx = offers.findIndex((o) => o.kind === 'exclusive');
  if (idx < 0) idx = offers.findIndex((o) => o.kind === 'basic');
  b.choose(Math.max(0, idx));
}

export interface BotRun { battle: Battle; minXViolation: boolean }

export function runBot(opts: { save?: SaveData; seed?: number; maxTime?: number; forceBell?: boolean; input?: (b: Battle) => InputState } = {}): BotRun {
  const save = opts.save ?? newSave();
  const b = new Battle({ runId: 1, seed: opts.seed ?? 7, loadout: buildLoadout(save), forceBellDrop: opts.forceBell });
  const dt = 1 / 60;
  let lastX = b.player.x;
  let minXViolation = false;
  while (!b.finished && b.t < (opts.maxTime ?? 600)) {
    if (b.paused) { botChoose(b); continue; }
    b.update(dt, (opts.input ?? botInput)(b));
    if (b.player.x < lastX) minXViolation = true;
    lastX = b.player.x;
  }
  return { battle: b, minXViolation };
}
