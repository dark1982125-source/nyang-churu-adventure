import Phaser from 'phaser';
import type { CostumeLook } from '../data/costumes';
import type { WeaponId } from '../data/weapons';

/**
 * 호냥이 임시 도형(코스튬 포함). 실제 스프라이트가 오기 전까지 쓰는 임시 표현이다.
 * 승인 시안 PNG(docs/costume-concepts/)는 외형 참고용이라 전투에 붙이지 않고, 색·모양만 따와 도형으로 그린다.
 * 그리는 순서: 고양이 몸 → 코스튬(외형 우선, 보호구 외형은 따로 그리지 않음) → 실제 장착 무기(코스튬과 무관하게 항상 위).
 * 얼굴·귀·꼬리·통통한 비율은 코스튬과 상관없이 같다.
 */

export const HERO_FUR = 0xf3a65a;
const BELLY = 0xfff3e0;
const SCARF = 0x2fb9a8;
const EYE = 0x2b2238;
const NOSE = 0xff8fa8;

/** 실제 장착 무기의 임시 표시 색(장갑만 전투 구현). 코스튬이 바꾸지 않는다. */
const WEAPON_COLORS: Partial<Record<WeaponId, number>> = { starterGlove: 0xe85d5d };
export function weaponColor(id: WeaponId): number { return WEAPON_COLORS[id] ?? 0xd9d9e8; }

function star(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, color: number): void {
  const pts: Phaser.Types.Math.Vector2Like[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  g.fillStyle(color, 1).fillPoints(pts, true);
}

/** 정수리의 작은 두잎 새싹(새싹 구조대 세트 확정 외형) */
function sprout(g: Phaser.GameObjects.Graphics, x: number, top: number, s: number): void {
  g.lineStyle(2 * s, 0x4f9a3a, 1).lineBetween(x, top, x, top - 6 * s);
  g.fillStyle(0x6cc24a, 1).fillEllipse(x - 4 * s, top - 8 * s, 8 * s, 5 * s).fillEllipse(x + 4 * s, top - 9 * s, 8 * s, 5 * s);
}

export interface HeroDrawOpts {
  look: CostumeLook | null;
  weapon: WeaponId;
  punching?: boolean;
  /** 걷기 위상(-1~1). 공중·정지면 0 */
  walk?: number;
  fur?: number;
  scale?: number;
}

/** 전투용 오른쪽 완전 측면(확정: 전투는 오른쪽 완전 측면) */
export function drawHeroSide(g: Phaser.GameObjects.Graphics, x: number, footY: number, o: HeroDrawOpts): void {
  const s = o.scale ?? 1;
  const fur = o.fur ?? HERO_FUR;
  const L = o.look;
  const walk = o.walk ?? 0;
  const bob = Math.abs(walk) * 2 * s;
  const X = (dx: number) => x + dx * s;
  const Y = (dy: number) => footY - dy * s - bob;
  // 다리(교차)
  const legs = L?.bottom ?? fur;
  g.fillStyle(legs, 1);
  g.fillRoundedRect(X(-10 + walk * 4), footY - 14 * s, 9 * s, 14 * s, 3);
  g.fillRoundedRect(X(2 - walk * 4), footY - 14 * s, 9 * s, 14 * s, 3);
  if (L) {
    g.fillStyle(L.feet, 1);
    g.fillRoundedRect(X(-11 + walk * 4), footY - 6 * s, 12 * s, 6 * s, 3);
    g.fillRoundedRect(X(1 - walk * 4), footY - 6 * s, 12 * s, 6 * s, 3);
  }
  // 망토(몸 뒤)
  if (L?.cape !== undefined) g.fillStyle(L.cape, 1).fillTriangle(X(-6), Y(42), X(-22), Y(12), X(2), Y(16));
  // 꼬리(뒤쪽 = 왼쪽)
  g.lineStyle(5 * s, fur, 1).beginPath();
  g.moveTo(X(-16), Y(26)); g.lineTo(X(-26), Y(38)); g.lineTo(X(-22), Y(50));
  g.strokePath();
  // 몸
  g.fillStyle(fur, 1).fillEllipse(x, Y(26), 34 * s, 28 * s);
  g.fillStyle(BELLY, 1).fillEllipse(X(4), Y(24), 16 * s, 16 * s);
  if (L) {
    switch (L.topKind) {
      case 'vest':
        g.fillStyle(L.top, 1).fillEllipse(X(-3), Y(30), 28 * s, 20 * s);
        g.lineStyle(2, 0xffffff, 0.6).strokeEllipse(X(-3), Y(30), 28 * s, 20 * s);
        break;
      case 'apron':
        g.fillStyle(0xfbf3e2, 1).fillEllipse(X(-2), Y(30), 26 * s, 18 * s); // 크림 셔츠
        g.fillStyle(L.top, 1).fillRoundedRect(X(2), Y(38), 16 * s, 26 * s, 4);
        g.fillStyle(0xffffff, 0.5).fillRect(X(6), Y(24), 7 * s, 5 * s); // 주머니
        break;
      case 'pajama':
        g.fillStyle(L.top, 1).fillEllipse(x, Y(26), 36 * s, 28 * s);
        star(g, X(-6), Y(30), 3 * s, L.accent); star(g, X(6), Y(20), 3 * s, L.accent); star(g, X(-2), Y(16), 2.5 * s, L.accent);
        g.fillStyle(L.accent, 1).fillRect(X(-12), Y(40), 26 * s, 3 * s);
        break;
      case 'pocketVest':
        g.fillStyle(L.top, 1).fillEllipse(X(-3), Y(28), 30 * s, 24 * s);
        g.fillStyle(L.accent, 1).fillRect(X(2), Y(26), 8 * s, 7 * s).fillRect(X(-10), Y(24), 7 * s, 6 * s);
        break;
      case 'heroSuit':
        g.fillStyle(L.top, 1).fillEllipse(x, Y(26), 35 * s, 28 * s);
        g.fillStyle(BELLY, 1).fillEllipse(X(6), Y(24), 10 * s, 14 * s);
        g.lineStyle(2, L.accent, 1).strokeEllipse(x, Y(26), 35 * s, 28 * s);
        star(g, X(10), Y(36), 3.5 * s, L.accent);
        break;
    }
  }
  // 머리(얼굴·귀는 코스튬과 무관하게 같다)
  const hx = X(4);
  const hy = Y(52);
  g.fillStyle(fur, 1).fillCircle(hx, hy, 17 * s);
  g.fillTriangle(X(-10), hy - 8 * s, X(-4), hy - 26 * s, X(4), hy - 12 * s);
  g.fillTriangle(X(6), hy - 12 * s, X(14), hy - 26 * s, X(18), hy - 6 * s);
  g.fillStyle(EYE, 1).fillCircle(X(12), hy - 2 * s, 2.5 * s);
  g.fillStyle(NOSE, 1).fillCircle(X(20), hy + 3 * s, 2 * s);
  // 스카프(시안에서 파자마·별빛 영웅은 스카프 없음)
  if (!L || (L.topKind !== 'pajama' && L.topKind !== 'heroSuit')) g.fillStyle(SCARF, 1).fillRect(X(-10), hy + 13 * s, 26 * s, 6 * s);
  if (L) hatSide(g, L, hx, hy, s);
  // 팔 + 실제 장착 무기(코스튬 위)
  const armX = o.punching ? X(24) : X(8 - walk * 4);
  g.fillStyle(L && L.topKind !== 'vest' && L.topKind !== 'apron' && L.topKind !== 'pocketVest' ? L.top : fur, 1).fillCircle(armX - 3 * s, Y(28), 5 * s);
  g.fillStyle(weaponColor(o.weapon), 1).fillCircle(armX, Y(28), 6.5 * s);
  g.lineStyle(1.5, 0x7a2b2b, 0.9).strokeCircle(armX, Y(28), 6.5 * s);
}

function hatSide(g: Phaser.GameObjects.Graphics, L: CostumeLook, hx: number, hy: number, s: number): void {
  switch (L.hat) {
    case 'sproutCap':
      g.fillStyle(L.hatColor, 1).fillEllipse(hx - 1 * s, hy - 11 * s, 34 * s, 18 * s);
      g.fillStyle(0xe9fff4, 1).fillRect(hx - 17 * s, hy - 6 * s, 33 * s, 4 * s);
      sprout(g, hx - 1 * s, hy - 19 * s, s);
      break;
    case 'chefHat':
      g.fillStyle(L.hatColor, 1).fillEllipse(hx - 2 * s, hy - 20 * s, 30 * s, 16 * s);
      g.fillStyle(L.accent, 1).fillRect(hx - 15 * s, hy - 15 * s, 28 * s, 7 * s);
      break;
    case 'sleepCap':
      g.fillStyle(L.hatColor, 1).fillEllipse(hx - 1 * s, hy - 12 * s, 34 * s, 16 * s);
      g.fillTriangle(hx - 14 * s, hy - 16 * s, hx + 6 * s, hy - 18 * s, hx - 22 * s, hy + 2 * s);
      g.fillStyle(L.accent, 1).fillRect(hx - 17 * s, hy - 7 * s, 33 * s, 4 * s).fillCircle(hx - 22 * s, hy + 3 * s, 4 * s);
      star(g, hx - 2 * s, hy - 14 * s, 2.5 * s, L.accent);
      break;
    case 'explorerHat':
      g.fillStyle(L.accent, 1).fillEllipse(hx + 1 * s, hy - 8 * s, 46 * s, 8 * s);
      g.fillStyle(L.hatColor, 1).fillEllipse(hx - 1 * s, hy - 15 * s, 28 * s, 16 * s);
      g.fillStyle(L.accent, 1).fillRect(hx - 14 * s, hy - 12 * s, 27 * s, 3 * s);
      break;
    case 'starBand':
      g.lineStyle(3 * s, L.hatColor, 1).beginPath();
      g.arc(hx, hy, 15 * s, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(330));
      g.strokePath();
      star(g, hx + 10 * s, hy - 13 * s, 5 * s, L.hatColor);
      break;
  }
}

/** 옷장 미리보기용 정면(확정: 보유품 선택 → 정면 미리보기). 임시 도형 표현. */
export function drawHeroFront(g: Phaser.GameObjects.Graphics, x: number, footY: number, o: HeroDrawOpts): void {
  const s = o.scale ?? 1;
  const fur = o.fur ?? HERO_FUR;
  const L = o.look;
  const X = (dx: number) => x + dx * s;
  const Y = (dy: number) => footY - dy * s;
  // 꼬리(화면 왼쪽으로 살짝)
  g.lineStyle(6 * s, fur, 1).beginPath();
  g.moveTo(X(-14), Y(16)); g.lineTo(X(-30), Y(22)); g.lineTo(X(-32), Y(38));
  g.strokePath();
  // 다리
  g.fillStyle(L?.bottom ?? fur, 1).fillRoundedRect(X(-13), Y(14), 10 * s, 14 * s, 3).fillRoundedRect(X(3), Y(14), 10 * s, 14 * s, 3);
  if (L) g.fillStyle(L.feet, 1).fillRoundedRect(X(-15), Y(6), 13 * s, 6 * s, 3).fillRoundedRect(X(2), Y(6), 13 * s, 6 * s, 3);
  // 몸
  g.fillStyle(fur, 1).fillEllipse(x, Y(27), 36 * s, 30 * s);
  g.fillStyle(BELLY, 1).fillEllipse(x, Y(25), 18 * s, 22 * s);
  if (L) {
    switch (L.topKind) {
      case 'vest':
        g.fillStyle(L.top, 1).fillRoundedRect(X(-18), Y(40), 12 * s, 22 * s, 4).fillRoundedRect(X(6), Y(40), 12 * s, 22 * s, 4);
        break;
      case 'apron':
        g.fillStyle(0xfbf3e2, 1).fillEllipse(x, Y(34), 34 * s, 14 * s);
        g.fillStyle(L.top, 1).fillRoundedRect(X(-11), Y(38), 22 * s, 30 * s, 4);
        g.fillStyle(0xffffff, 0.5).fillRect(X(2), Y(24), 7 * s, 5 * s);
        break;
      case 'pajama':
        g.fillStyle(L.top, 1).fillEllipse(x, Y(27), 38 * s, 30 * s);
        g.fillStyle(L.accent, 1).fillRect(X(-1), Y(40), 2 * s, 26 * s);
        star(g, X(-9), Y(32), 3 * s, L.accent); star(g, X(9), Y(22), 3 * s, L.accent); star(g, X(8), Y(36), 2.5 * s, L.accent);
        break;
      case 'pocketVest':
        g.fillStyle(L.top, 1).fillRoundedRect(X(-18), Y(40), 13 * s, 24 * s, 4).fillRoundedRect(X(5), Y(40), 13 * s, 24 * s, 4);
        g.fillStyle(L.accent, 1).fillRect(X(-16), Y(28), 9 * s, 7 * s).fillRect(X(7), Y(28), 9 * s, 7 * s);
        break;
      case 'heroSuit':
        g.fillStyle(L.cape ?? L.top, 1).fillTriangle(X(-20), Y(42), X(20), Y(42), X(0), Y(8));
        g.fillStyle(L.top, 1).fillRoundedRect(X(-18), Y(40), 12 * s, 24 * s, 4).fillRoundedRect(X(6), Y(40), 12 * s, 24 * s, 4);
        star(g, x, Y(38), 4 * s, L.accent);
        break;
    }
  }
  // 팔 + 실제 무기
  g.fillStyle(weaponColor(o.weapon), 1).fillCircle(X(-20), Y(24), 6 * s).fillCircle(X(20), Y(24), 6 * s);
  // 머리
  const hy = Y(56);
  g.fillStyle(fur, 1).fillCircle(x, hy, 19 * s);
  g.fillTriangle(X(-18), hy - 6 * s, X(-14), hy - 28 * s, X(-3), hy - 16 * s);
  g.fillTriangle(X(18), hy - 6 * s, X(14), hy - 28 * s, X(3), hy - 16 * s);
  g.fillStyle(0xffc1cc, 1).fillTriangle(X(-14), hy - 10 * s, X(-13), hy - 22 * s, X(-7), hy - 15 * s).fillTriangle(X(14), hy - 10 * s, X(13), hy - 22 * s, X(7), hy - 15 * s);
  g.fillStyle(BELLY, 1).fillEllipse(x, hy + 7 * s, 18 * s, 11 * s);
  g.fillStyle(EYE, 1).fillCircle(X(-7), hy, 3 * s).fillCircle(X(7), hy, 3 * s);
  g.fillStyle(NOSE, 1).fillCircle(x, hy + 5 * s, 2 * s);
  if (!L || (L.topKind !== 'pajama' && L.topKind !== 'heroSuit')) g.fillStyle(SCARF, 1).fillRect(X(-14), hy + 16 * s, 28 * s, 6 * s);
  if (!L) return;
  switch (L.hat) {
    case 'sproutCap':
      g.fillStyle(L.hatColor, 1).fillEllipse(x, hy - 11 * s, 40 * s, 20 * s);
      g.fillStyle(0xe9fff4, 1).fillRect(X(-20), hy - 6 * s, 40 * s, 4 * s);
      sprout(g, x, hy - 20 * s, s);
      break;
    case 'chefHat':
      g.fillStyle(L.hatColor, 1).fillEllipse(x, hy - 22 * s, 34 * s, 18 * s);
      g.fillStyle(L.accent, 1).fillRect(X(-16), hy - 17 * s, 32 * s, 8 * s);
      break;
    case 'sleepCap':
      g.fillStyle(L.hatColor, 1).fillEllipse(x, hy - 13 * s, 40 * s, 18 * s);
      g.fillTriangle(X(-16), hy - 14 * s, X(10), hy - 20 * s, X(-28), hy + 4 * s);
      g.fillStyle(L.accent, 1).fillRect(X(-20), hy - 7 * s, 40 * s, 4 * s).fillCircle(X(-28), hy + 5 * s, 4 * s);
      star(g, X(4), hy - 15 * s, 2.5 * s, L.accent);
      break;
    case 'explorerHat':
      g.fillStyle(L.accent, 1).fillEllipse(x, hy - 8 * s, 52 * s, 9 * s);
      g.fillStyle(L.hatColor, 1).fillEllipse(x, hy - 15 * s, 32 * s, 18 * s);
      g.fillStyle(L.accent, 1).fillRect(X(-16), hy - 12 * s, 32 * s, 3 * s);
      break;
    case 'starBand':
      g.fillStyle(L.hatColor, 1).fillRect(X(-17), hy - 12 * s, 34 * s, 4 * s);
      star(g, x, hy - 12 * s, 6 * s, L.hatColor);
      break;
  }
}
