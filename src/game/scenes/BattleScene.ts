import Phaser from 'phaser';
import { Battle, type Enemy, type InputState } from '../../sim/battle';
import { offerLabel } from '../../sim/choices';
import { buildLoadout } from '../../meta/save';
import { beginRun, markClearConfirmed, recordRunLoot, settleRun } from '../../meta/settlement';
import { TUNING } from '../../config/tuning';
import { PASSIVES, ULTIMATES, type PassiveId } from '../../data/skills';
import { MEDICINES, STATUS_NAMES, type MedicineId } from '../../data/medicines';
import { store } from '../store';
import { sound } from '../sound';
import { button, COLORS, FONT, text } from '../ui';
import { drawHeroSide, HERO_FUR } from '../costumeArt';
import { COSTUME_DEFS, type CostumeLook } from '../../data/costumes';
import type { WeaponId } from '../../data/weapons';

const W = 960;
/** 코숏 약 임시 색 */
const MED_COLORS: Record<MedicineId, number> = {
  antidote: 0x8fd16a, bandage: 0xf3eadb, mintOintment: 0x9ff0e0, hotPack: 0xff7a4d, nyangCas: 0xffd0f0, panacea: 0xffe066,
};
const H = 540;
const GROUND = 430;

/**
 * 전투 화면. sim/battle.ts의 상태를 매 프레임 읽어 그리기만 한다.
 * 모든 그림은 임시 도형이다(실제 스프라이트 미제공).
 */
export class BattleScene extends Phaser.Scene {
  private battle!: Battle;
  private g!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private textPool: Phaser.GameObjects.Text[] = [];
  private textUsed = 0;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private touchJump = false;
  private touchUlt: number | null = null;
  private choiceLayer: Phaser.GameObjects.Container | null = null;
  private choiceShownFor: unknown = null;
  private logCursor = 0;
  private settled = false;
  private clearJournaled = false;
  private hudTexts: Record<string, Phaser.GameObjects.Text> = {};
  private quitConfirm: Phaser.GameObjects.Container | null = null;
  /** 착용 코스튬(임시 도형). 캠프에서만 바뀌므로 출격 때 한 번 읽는다. 능력치와 무관. */
  private costumeLook: CostumeLook | null = null;
  private weaponId: WeaponId = 'starterGlove';

  constructor() { super('battle'); }

  create(): void {
    const save = store.save;
    // 판 id 발급과 판 저널을 출격 즉시 저장한다. 앱이 도중에 꺼지면 다음 실행 때 저널로 중도 종료 정산.
    const runId = beginRun(save, 1);
    store.persist();
    this.quitConfirm = null;
    this.battle = new Battle({ runId, seed: (Date.now() ^ (runId * 2654435761)) >>> 0, loadout: buildLoadout(save) });
    this.costumeLook = save.equipment.costume ? COSTUME_DEFS[save.equipment.costume].look : null;
    this.weaponId = save.equipment.weapon;
    this.settled = false;
    this.clearJournaled = false;
    this.logCursor = 0;
    this.choiceLayer = null;
    this.choiceShownFor = null;
    this.textPool = [];

    this.cameras.main.setBackgroundColor(0xbfe3f2);
    this.g = this.add.graphics();
    this.hud = this.add.graphics().setDepth(10);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('SPACE,UP,W,ONE,TWO,THREE,ESC') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.addPointer(2);

    this.hudTexts.top = text(this, 16, 10, '', 15).setDepth(11);
    this.hudTexts.right = text(this, W - 16, 10, '', 15).setOrigin(1, 0).setDepth(11);
    this.hudTexts.banner = this.add.text(W / 2, 120, '', { fontFamily: FONT, fontSize: '24px', color: '#ffffff', stroke: '#3a2a4a', strokeThickness: 6, align: 'center', wordWrap: { width: 820 } }).setOrigin(0.5).setDepth(12);
    this.hudTexts.note = text(this, 180, H - 50, '', 11, '#3d3852').setDepth(11);

    this.makeTouchControls();
    button(this, W / 2 + 60, 38, 90, 26, '나가기', () => this.askQuit(), { size: 12, color: 0x6a4b6c }).setDepth(13);
    // 탭 전환·앱 종료 직전에도 저널을 한 번 더 저장(이 이벤트에만 의존하지 않는다)
    const flush = () => { if (!this.settled) { recordRunLoot(store.save, this.battle.runId, this.battle.loot); store.persist(); } };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    this.events.once('shutdown', () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    });
  }

  /** 판 도중 나가기 확인. 확인창이 떠 있는 동안 전투 시간은 멈춘다. */
  private askQuit(): void {
    if (this.quitConfirm || this.battle.finished || this.battle.clearConfirmed) return;
    const items: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(0, 0, W, H, 0x120f1c, 0.75).setOrigin(0).setInteractive(),
      text(this, W / 2, 150, '판을 나갈까요?', 26, '#ffd9a0').setOrigin(0.5, 0),
      text(this, W / 2, 200, '지금까지 주운 재화·제작 재료는 보존됩니다.\n레벨·기술·패시브·다시냥 방울은 사라지고, 구출·클리어 보상은 없습니다.\n이어하기 없이 다음 출격은 웨이브 1부터입니다.', 16).setOrigin(0.5, 0).setAlign('center'),
      button(this, W / 2 - 230, 320, 210, 56, '나가기', () => { this.battle.quit(); this.closeQuit(); }, { size: 18, color: 0x7a3b3b }),
      button(this, W / 2 + 20, 320, 210, 56, '계속하기', () => this.closeQuit(), { size: 18, color: 0x5b4f86 }),
    ];
    this.quitConfirm = this.add.container(0, 0, items).setDepth(40);
  }

  private closeQuit(): void {
    this.quitConfirm?.destroy();
    this.quitConfirm = null;
  }

  private makeTouchControls(): void {
    const mk = (x: number, y: number, w: number, h: number, label: string, down: () => void, up: () => void) => {
      const r = this.add.rectangle(x, y, w, h, 0x000000, 0.22).setOrigin(0).setDepth(20).setStrokeStyle(2, 0xffffff, 0.5).setInteractive();
      this.add.text(x + w / 2, y + h / 2, label, { fontFamily: FONT, fontSize: '18px', color: '#ffffff' }).setOrigin(0.5).setDepth(21);
      r.on('pointerdown', () => { sound.unlock(); down(); r.setFillStyle(0xffffff, 0.3); });
      const release = () => { up(); r.setFillStyle(0x000000, 0.22); };
      r.on('pointerup', release);
      r.on('pointerout', release);
    };
    mk(W - 166, H - 120, 150, 96, '점프', () => { this.touchJump = true; }, () => undefined);
    const ults = this.battle.loadout.ultimateEnabled ? this.battle.loadout.ultimates : [];
    ults.forEach((id, i) => {
      mk(W - 166 - (i + 1) * 92, H - 92, 84, 68, `궁${i + 1}\n${ULTIMATES[id].category}`, () => { this.touchUlt = i; }, () => undefined);
    });
  }

  private readInput(): InputState {
    const k = this.keys;
    const jd = Phaser.Input.Keyboard.JustDown;
    const jump = jd(k.SPACE) || jd(k.UP) || jd(k.W) || this.touchJump;
    let ult: number | null = this.touchUlt;
    if (jd(k.ONE)) ult = 0;
    if (jd(k.TWO)) ult = 1;
    if (jd(k.THREE)) ult = 2;
    this.touchJump = false;
    this.touchUlt = null;
    return { jump, ult };
  }

  update(_time: number, deltaMs: number): void {
    const b = this.battle;
    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) { if (this.quitConfirm) this.closeQuit(); else this.askQuit(); }
    if (this.quitConfirm) {
      // 확인창 동안 전투 정지
    } else if (b.paused) {
      this.showChoice();
    } else {
      if (this.choiceLayer) { this.choiceLayer.destroy(); this.choiceLayer = null; this.choiceShownFor = null; }
      b.update(deltaMs / 1000, this.readInput());
    }
    this.playSounds();
    this.draw();

    // 클리어 확정 순간 저널에 기록·저장: 감옥으로 가는 중 앱이 꺼져도 다음 실행 때 구출 완료 흐름으로 복귀
    if (b.clearConfirmed && !this.clearJournaled && !this.settled) {
      this.clearJournaled = true;
      markClearConfirmed(store.save, b.result(), b.chapter.rescue?.companion ?? null);
      store.persist();
    }

    if (b.finished && !this.settled) {
      this.settled = true;
      const result = b.result();
      const summary = settleRun(store.save, result);
      store.persist();
      this.time.delayedCall(900, () => this.scene.start('result', { result, summary, log: b.log }));
    }
  }

  private playSounds(): void {
    const log = this.battle.log;
    let lootChanged = false;
    for (; this.logCursor < log.length; this.logCursor++) {
      const l = log[this.logCursor];
      const map: Partial<Record<typeof l.type, Parameters<typeof sound.play>[0]>> = {
        kill: 'hit', skill: 'skill', levelUp: 'levelUp', campLevelUp: 'levelUp', eliteSpawn: 'warn',
        bell: 'bell', revive: 'bell', key: 'pickup', jailOpen: 'clear', victory: 'clear', ult: 'ult', waveStart: 'warn',
        rockBroken: 'hit', rockHitCamp: 'hurt', loot: 'pickup',
      };
      const s = map[l.type];
      if (s) sound.play(s);
      if (l.type === 'loot' || l.type === 'filler') lootChanged = true;
    }
    // 주운 영구 재화·재료는 그때그때 판 저널에 저장(갑작스러운 종료 대비)
    if (lootChanged && !this.settled) {
      recordRunLoot(store.save, this.battle.runId, this.battle.loot);
      store.persist();
    }
  }

  // ───────────────────────── 그리기

  private t(x: number, y: number, s: string, size = 14, color = '#ffffff', stroke = true): Phaser.GameObjects.Text {
    let tx = this.textPool[this.textUsed];
    if (!tx) {
      tx = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '14px', color: '#fff' }).setOrigin(0.5).setDepth(5);
      this.textPool.push(tx);
    }
    this.textUsed++;
    tx.setVisible(true).setPosition(x, y).setText(s).setFontSize(size).setColor(color);
    tx.setStroke('#2b2238', stroke ? 4 : 0);
    return tx;
  }

  private draw(): void {
    const b = this.battle;
    const g = this.g;
    g.clear();
    this.textUsed = 0;
    // 호위 전투 중에도 캠프와 멘탈 게이지가 화면에 보이도록 카메라를 캠프 쪽으로 붙잡는다
    const camX = Math.min(b.player.x - TUNING.world.viewBehind, b.camp.x - 80);
    const sx = (x: number) => x - camX;
    const sy = (y: number) => GROUND - y;

    // 배경(임시): 먼 언덕·운석·지면
    g.fillStyle(0xd7c3f0, 1);
    for (let i = -1; i < 6; i++) {
      const hx = ((i * 260 - camX * 0.3) % 1560 + 1560) % 1560 - 260;
      g.fillEllipse(hx, GROUND - 10, 320, 160);
    }
    g.fillStyle(0xa98fd1, 1);
    for (let i = -1; i < 8; i++) {
      const rx = ((i * 190 - camX * 0.6) % 1520 + 1520) % 1520 - 190;
      g.fillCircle(rx, GROUND - 30 - (i % 3) * 12, 18 + (i % 2) * 8);
    }
    g.fillStyle(0x9ad08a, 1).fillRect(0, GROUND, W, H - GROUND);
    g.fillStyle(0x7fb873, 1);
    for (let x = -(camX % 40); x < W; x += 40) g.fillRect(x, GROUND, 20, 6);

    // 웨이브 구역 표시
    // 다음 웨이브 지점은 앞 웨이브를 정리한 뒤 정해지므로 이동 구간에서만 표시한다
    b.waveX.forEach((wx, i) => {
      if (!(b.mode === 'travel' && i === b.waveIndex)) return;
      const x = sx(wx);
      if (x > -50 && x < W + 50) {
        g.lineStyle(2, 0xffffff, 0.35).lineBetween(x, GROUND - 160, x, GROUND);
        this.t(x, GROUND - 172, `웨이브 ${i + 1}`, 12, '#ffffff');
      }
    });

    // 감옥(구출 목표). 개방 전 정체 비공개.
    if (b.chapter.rescue) {
      const jx = sx(b.jailX);
      // 감옥 위치는 마지막 보스를 처치한 뒤 정해진다. 그 전에는 화면 끝 안내만
      const farHint = jx > W - 20 || !['toJail', 'opening', 'revealed', 'victory'].includes(b.mode);
      const drawX = farHint ? W - 40 : jx;
      if (b.mode === 'revealed' || b.mode === 'victory') {
        this.drawCat(drawX, GROUND, 0xf1e4d0, 0x6ac0e0, 1, false, 'kosyot');
        this.t(drawX, GROUND - 92, '닥터 코숏', 16, '#bff7ff');
      } else {
        g.fillStyle(0x3c3550, farHint ? 0.55 : 1).fillRoundedRect(drawX - 34, GROUND - 76, 68, 76, 6);
        g.lineStyle(3, 0x8d84a8, 1);
        for (let k = -2; k <= 2; k++) g.lineBetween(drawX + k * 12, GROUND - 74, drawX + k * 12, GROUND - 2);
        this.t(drawX, GROUND - 40, '?', 28, '#ffffff');
        this.t(drawX, GROUND - 92, farHint ? '동료 발견! ▶' : (b.mode === 'opening' ? '여는 중…' : '감옥'), 13, '#fff3b0');
      }
    }

    // 캠프
    const cx = sx(b.camp.x);
    const bob = b.camp.moving ? Math.sin(b.t * 12) * 2 : 0;
    g.fillStyle(0x8a5a3c, 1).fillRoundedRect(cx - 45, GROUND - 50 + bob, 90, 38, 6);
    g.fillStyle(0xf6e3c6, 1).fillTriangle(cx - 38, GROUND - 50 + bob, cx + 38, GROUND - 50 + bob, cx, GROUND - 92 + bob);
    g.fillStyle(0x4a3a2e, 1).fillCircle(cx - 26, GROUND - 10, 11).fillCircle(cx + 26, GROUND - 10, 11);
    if (b.camp.shield > 0) {
      g.lineStyle(3, 0xa8f0ff, 0.8).strokeEllipse(cx, GROUND - 46, 120, 110);
    }
    // 캠프 멘탈 게이지(캠프 위)
    this.bar(g, cx - 50, GROUND - 120, 100, 9, b.camp.mental / b.camp.maxMental, 0xff9cc2);
    if (b.camp.shield > 0) this.bar(g, cx - 50, GROUND - 109, 100, 4, Math.min(1, b.camp.shield / 60), 0xa8f0ff);
    this.t(cx, GROUND - 132, `캠프 멘탈 ${Math.ceil(b.camp.mental)}`, 11);
    this.bar(g, cx - 50, GROUND - 102, 100, 4, b.campXp / b.campXpNeeded, 0xc9c9c9);
    this.t(cx, GROUND - 94 + 12, `캠프 Lv.${b.campLevel}`, 10, '#ffffff');

    // 위험 요소
    for (const h of b.hazards) {
      const hx = sx(h.x);
      if (h.kind === 'shockwave') {
        g.fillStyle(0xd9c27a, 0.9).fillTriangle(hx - h.radius, GROUND, hx + h.radius, GROUND, hx, GROUND - 30);
      } else if (h.kind === 'bigRock') {
        // 큰 돌: 캠프를 향해 포물선으로 날아온다. 착탄 지점(캠프)에 그림자, 남은 내구도 표시.
        const tx = sx(h.targetX);
        g.fillStyle(0xff4f4f, 0.18 + 0.25 * h.progress).fillEllipse(tx, GROUND - 2, 70, 12);
        g.fillStyle(0x8c8174, 1).fillCircle(hx, sy(h.y), h.radius);
        g.lineStyle(3, 0x5d554b, 1).strokeCircle(hx, sy(h.y), h.radius);
        this.bar(g, hx - 20, sy(h.y) - h.radius - 10, 40, 5, h.hp / h.maxHp, 0xffb36b);
      } else {
        // 캠프 조준 투사체(시험): 조약돌(투척) / 먼지 뭉치(공중 투하). 캠프에 착탄 그림자.
        const tx = sx(h.targetX);
        g.fillStyle(0xff4f4f, 0.15 + 0.25 * h.progress).fillEllipse(tx, GROUND - 2, 56, 10);
        if (h.style === 'drop') g.fillStyle(0x9b8fb0, 1).fillCircle(hx, sy(h.y), h.radius).lineStyle(2, 0x5b4f70, 1).strokeCircle(hx, sy(h.y), h.radius);
        else g.fillStyle(0xb0a48e, 1).fillCircle(hx, sy(h.y), h.radius).lineStyle(2, 0x6d6355, 1).strokeCircle(hx, sy(h.y), h.radius);
      }
    }

    // 드롭
    for (const p of b.pickups) {
      const px = sx(p.x), py = sy(p.y) - 8;
      const col = { catnip: 0x6fcf6a, gear: 0x9aa0a8, bell: 0xffd34d, key: 0xffe066, capsule: 0xff9cc2, loot: 0xc7a0ff, medicine: MED_COLORS[p.medId ?? 'antidote'] }[p.kind];
      if (p.kind === 'gear') g.fillStyle(col, 1).fillCircle(px, py, 6).fillStyle(0x5b5f66, 1).fillCircle(px, py, 2);
      else if (p.kind === 'key') { g.fillStyle(col, 1).fillCircle(px - 6, py, 7).fillRect(px - 2, py - 2, 16, 4); }
      else if (p.kind === 'bell') { g.fillStyle(col, 1).fillCircle(px, py, 9).fillStyle(0x7fe0c9, 1).fillRect(px - 8, py - 11, 16, 3); }
      else if (p.kind === 'capsule') { g.fillStyle(col, 1).fillRoundedRect(px - 10, py - 6, 20, 12, 6); }
      else if (p.kind === 'medicine') {
        // 코숏 약(임시 도형): 색 병 + 짧은 이름
        g.fillStyle(col, 1).fillRoundedRect(px - 8, py - 10, 16, 18, 4).fillStyle(0xffffff, 0.9).fillRect(px - 4, py - 14, 8, 5);
        this.t(px, py - 24, MEDICINES[p.medId!].name.split(' ').pop()!, 10, '#ffffff');
      }
      else if (p.kind === 'loot') { g.fillStyle(col, 1).fillRoundedRect(px - 7, py - 7, 14, 14, 4).lineStyle(1, 0xffffff, 0.8).strokeRoundedRect(px - 7, py - 7, 14, 14, 4); }
      else g.fillStyle(col, 1).fillEllipse(px, py, 9, 12);
    }

    // 적
    for (const e of b.enemies) this.drawEnemy(g, e, sx(e.x), sy(e.y));

    // 호냥이
    const p = b.player;
    const blink = p.invuln > 0 && Math.floor(b.t * 20) % 2 === 0;
    const frozen = b.heroStatus.frozen;
    if (!blink) {
      drawHeroSide(this.g, sx(p.x), sy(p.y), {
        look: this.costumeLook, weapon: this.weaponId, punching: p.attackAnim > 0,
        walk: frozen || p.y > 0 ? 0 : Math.sin(b.t * 14), fur: frozen ? 0xa8dcff : HERO_FUR,
      });
    }
    if (frozen) g.lineStyle(3, 0xd8f4ff, 0.9).strokeRoundedRect(sx(p.x) - 24, sy(p.y) - 74, 50, 76, 8);
    // 머리 위 상태이상 표시(태그·남은 시간)
    const sts = b.heroStatus.effects.map((e) => `${STATUS_NAMES[e.tag]}${e.origin === 'terrain' ? '(지형)' : ''} ${e.remaining.toFixed(1)}`).join(' ');
    if (sts) this.t(sx(p.x), sy(p.y) - 92, sts, 12, '#e6c6ff');
    if (b.hasBell) this.t(sx(p.x) + 22, sy(p.y) - 66, '🔔', 14, '#ffd34d', false);

    // 연출
    for (const fx of b.effects) {
      const a = Math.max(0, Math.min(1, fx.ttl / fx.maxTtl));
      if (fx.kind === 'zone') { g.fillStyle(fx.color ?? 0xffd38a, 0.35 * a).fillRect(sx(fx.x1), sy(fx.y2), fx.x2 - fx.x1, fx.y2 - fx.y1); }
      else if (fx.kind === 'beam') { g.fillStyle(fx.color ?? 0x9be7ff, 0.5 * a).fillRect(sx(fx.x1), sy(fx.y2), fx.x2 - fx.x1, fx.y2 - fx.y1); }
      else if (fx.kind === 'telegraph') {
        g.fillStyle(0x000000, 0.25).fillRect(sx(fx.x1), GROUND - 6, fx.x2 - fx.x1, 10);
        if (fx.text) this.t((sx(fx.x1) + sx(fx.x2)) / 2, GROUND - 60, fx.text, 13, '#ffe08a');
      } else if (fx.kind === 'hit') { g.fillStyle(fx.color ?? 0xffffff, a).fillCircle(sx((fx.x1 + fx.x2) / 2), sy((fx.y1 + fx.y2) / 2), (fx.x2 - fx.x1) / 2); }
      else if (fx.kind === 'aim') {
        // 캠프 조준선 예고
        g.lineStyle(2, 0xff5555, 0.4 + 0.5 * a).lineBetween(sx(fx.x2), sy(fx.y2), sx(fx.x1), sy(fx.y1));
        if (fx.text) this.t(sx(fx.x2), sy(fx.y2) - 30, fx.text, 12, '#ffb0b0');
      } else if (fx.kind === 'dropMark') {
        // 공중 투하 낙하 예고: 캠프 위 그림자
        g.fillStyle(0x5b2b6b, 0.25 + 0.3 * (1 - a)).fillEllipse(sx((fx.x1 + fx.x2) / 2), GROUND - 2, fx.x2 - fx.x1, 14);
        if (fx.text && a > 0.4) this.t(sx((fx.x1 + fx.x2) / 2), GROUND - 150, fx.text, 12, '#ffb0ff');
      }
      else if (fx.kind === 'laser') { g.lineStyle(3, 0xff4f8b, a).lineBetween(sx(fx.x1), sy(fx.y1), sx(fx.x2), sy(fx.y2)); }
      else if (fx.kind === 'shield') { g.lineStyle(4, 0xa8f0ff, a).strokeEllipse(sx((fx.x1 + fx.x2) / 2), GROUND - 46, 130, 120); }
      else if (fx.kind === 'ult') { g.fillStyle(0xffffff, 0.35 * a).fillRect(0, 0, W, H); if (fx.text) this.t(W / 2, 200, fx.text, 22, '#ffe08a'); }
      else if (fx.kind === 'text' && fx.text) {
        const rise = (1 - a) * 24;
        this.t(sx(fx.x1), sy(fx.y1) - rise, fx.text, fx.text.length > 4 ? 13 : 12, fx.color ? `#${fx.color.toString(16)}` : '#ffffff');
      }
    }

    this.drawHud();
    for (let i = this.textUsed; i < this.textPool.length; i++) this.textPool[i].setVisible(false);
  }

  private bar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, ratio: number, color: number): void {
    g.fillStyle(0x221c30, 0.75).fillRect(x, y, w, h);
    g.fillStyle(color, 1).fillRect(x + 1, y + 1, Math.max(0, (w - 2) * Math.max(0, Math.min(1, ratio))), h - 2);
  }

  /** 임시 고양이 도형: 통통한 이족보행, 오른쪽 측면. 걷기 시 머리·몸 상하 움직임. */
  private drawCat(x: number, footY: number, fur: number, scarf: number, scale: number, punching: boolean, who: 'hero' | 'kosyot', t = 0, air = false): void {
    const g = this.g;
    const s = scale;
    const walk = who === 'hero' && !air ? Math.sin(t * 14) : 0;
    const bob = Math.abs(walk) * 2;
    // 다리(교차)
    g.fillStyle(fur, 1);
    g.fillRoundedRect(x - 10 + walk * 4, footY - 14 * s, 9, 14 * s, 3);
    g.fillRoundedRect(x + 2 - walk * 4, footY - 14 * s, 9, 14 * s, 3);
    // 몸
    g.fillStyle(fur, 1).fillEllipse(x, footY - 26 * s - bob, 34 * s, 28 * s);
    g.fillStyle(0xfff3e0, 1).fillEllipse(x + 4, footY - 24 * s - bob, 16 * s, 16 * s);
    // 꼬리(뒤쪽 = 왼쪽)
    g.lineStyle(5, fur, 1).beginPath();
    g.moveTo(x - 16, footY - 26 - bob);
    g.lineTo(x - 26, footY - 38 - bob);
    g.lineTo(x - 22, footY - 50 - bob);
    g.strokePath();
    // 팔(반대 흔들림)
    const armX = punching ? x + 24 : x + 8 - walk * 4;
    g.fillStyle(fur, 1).fillCircle(armX, footY - 28 * s - bob, 6);
    // 머리
    const hy = footY - 52 * s - bob;
    g.fillStyle(fur, 1).fillCircle(x + 4, hy, 17 * s);
    g.fillTriangle(x - 10, hy - 8, x - 4, hy - 26, x + 4, hy - 12);
    g.fillTriangle(x + 6, hy - 12, x + 14, hy - 26, x + 18, hy - 6);
    g.fillStyle(0x2b2238, 1).fillCircle(x + 12, hy - 2, 2.5);
    g.fillStyle(0xff8fa8, 1).fillCircle(x + 20, hy + 3, 2);
    // 스카프
    g.fillStyle(scarf, 1).fillRect(x - 10, hy + 13, 26, 6);
    if (who === 'kosyot') g.fillStyle(0xffffff, 1).fillRect(x - 4, hy - 22, 12, 6);
  }

  private drawEnemy(g: Phaser.GameObjects.Graphics, e: Enemy, x: number, y: number): void {
    const d = e.def;
    const flash = e.flash > 0;
    const c = (col: number) => (flash ? 0xffffff : col);
    switch (d.kind) {
      case 'dustSlime':
      case 'kingDustSlime': {
        const squish = Math.sin((e.id + this.battle.t) * 6) * 2;
        g.fillStyle(c(0xb7b1bf), 1).fillEllipse(x, y - d.height / 2, d.width + squish, d.height - squish);
        g.fillStyle(0x2b2238, 1).fillCircle(x - d.width * 0.18, y - d.height * 0.55, 2.5).fillCircle(x - d.width * 0.38, y - d.height * 0.55, 2.5);
        if (d.kind === 'kingDustSlime') g.fillStyle(0xffd34d, 1).fillTriangle(x - 14, y - d.height + 2, x, y - d.height - 14, x + 14, y - d.height + 2);
        break;
      }
      case 'spikyBug':
        g.fillStyle(c(0x6cbf5a), 1).fillEllipse(x, y - 11, d.width, d.height);
        g.fillStyle(0x3f7f35, 1);
        for (let k = -1; k <= 1; k++) g.fillTriangle(x + k * 8 - 4, y - 18, x + k * 8, y - 30, x + k * 8 + 4, y - 18);
        g.fillStyle(0x2b2238, 1).fillCircle(x - 10, y - 13, 2);
        break;
      case 'meteorRat':
      case 'rollingRat': {
        const rolling = e.state === 'roll';
        g.fillStyle(c(d.kind === 'rollingRat' ? 0x8a6f5a : 0xa58a74), 1);
        if (rolling) g.fillCircle(x, y - d.height / 2, d.height / 2);
        else {
          g.fillEllipse(x, y - d.height / 2, d.width, d.height);
          g.fillStyle(c(0x6f6255), 1).fillCircle(x + d.width * 0.1, y - d.height * 0.75, d.height * 0.25);
          g.fillStyle(0x2b2238, 1).fillCircle(x - d.width * 0.32, y - d.height * 0.55, 2.5);
          g.lineStyle(2, 0xd6a9a0, 1).lineBetween(x + d.width / 2, y - 6, x + d.width / 2 + 14, y - 14);
        }
        if (e.state === 'telegraph') g.lineStyle(2, 0xff5555, 1).strokeCircle(x, y - d.height / 2, d.height / 2 + 6);
        break;
      }
      case 'pebbleRat':
        // 시험 적 A: 돌을 든 쥐
        g.fillStyle(c(0xb59a7e), 1).fillEllipse(x, y - d.height / 2, d.width, d.height);
        g.fillStyle(0x2b2238, 1).fillCircle(x - d.width * 0.3, y - d.height * 0.55, 2.5);
        g.fillStyle(0x8c8174, 1).fillCircle(x + 6, y - d.height - (e.state === 'aim' ? 10 : 2), 7);
        if (e.state === 'aim') g.lineStyle(2, 0xff5555, 1).strokeCircle(x, y - d.height / 2, d.height / 2 + 6);
        break;
      case 'dustBat': {
        // 시험 적 B: 공중 먼지 박쥐
        const flap = Math.sin((e.id + this.battle.t) * 14) * 8;
        g.fillStyle(c(0x7b6d93), 1).fillEllipse(x, y - d.height / 2, d.width * 0.6, d.height);
        g.fillTriangle(x - 4, y - d.height / 2, x - 26, y - d.height / 2 - flap, x - 10, y - 2);
        g.fillTriangle(x + 4, y - d.height / 2, x + 26, y - d.height / 2 - flap, x + 10, y - 2);
        g.fillStyle(0xffe0e0, 1).fillCircle(x - 4, y - d.height * 0.6, 2);
        if (e.state === 'aim') g.lineStyle(2, 0xff66ff, 1).strokeCircle(x, y - d.height / 2, d.height / 2 + 8);
        break;
      }
      case 'stompSole': {
        const lift = e.state === 'stomp' ? 18 : 0;
        g.fillStyle(c(0x8f8a84), 1).fillRoundedRect(x - d.width / 2, y - d.height - lift, d.width, d.height, 18);
        g.fillStyle(c(0x6d6862), 1);
        for (let k = 0; k < 4; k++) g.fillCircle(x - d.width / 2 + 14 + k * 22, y - d.height - lift + 6, 11);
        g.fillStyle(0x2b2238, 1).fillCircle(x - 22, y - d.height * 0.6 - lift, 4).fillCircle(x - 4, y - d.height * 0.6 - lift, 4);
        break;
      }
    }
    if (e.cc > 0 && e.ccKind) this.t(x, y - d.height - 22, { sleep: '수면', stun: '기절', freeze: '빙결' }[e.ccKind], 11, '#fff3a0');
    else if (e.slow > 0) this.t(x, y - d.height - 22, '감속', 11, '#bfe0ff');
    if (d.temp) this.t(x, y + 12, '시험', 9, '#ffd0a0');
    if (d.rank !== 'normal' || e.hp < d.hp) {
      this.bar(g, x - d.width / 2, y - d.height - 12, d.width, 5, e.hp / d.hp, d.rank === 'boss' ? 0xff6b6b : 0xffb86b);
    }
    if (d.rank !== 'normal') this.t(x, y - d.height - 26, d.name, 12, d.rank === 'boss' ? '#ffb3b3' : '#ffe0b3');
    if (!e.required) this.t(x, y + 10, '분열', 10, '#e0dbff');
    if (d.flying) g.fillStyle(0x000000, 0.15).fillEllipse(x, GROUND - 2, d.width, 6);
  }

  private drawHud(): void {
    const b = this.battle;
    const h = this.hud;
    h.clear();
    h.fillStyle(0x1d1b2a, 0.6).fillRect(0, 0, W, 70);
    // HP / 레벨 / 경험치
    this.bar(h, 16, 32, 220, 14, b.player.hp / b.player.maxHp, 0xff6b6b);
    this.bar(h, 16, 50, 220, 7, b.heroXp / b.heroXpNeeded, 0x6fcf6a);
    // 냥기력
    this.bar(h, 250, 32, 140, 14, b.player.energy / b.player.maxEnergy, 0x7fe0c9);
    // 궁극기 게이지(해금 시)
    if (b.loadout.ultimateEnabled) this.bar(h, 404, 32, 140, 14, b.ultGauge / TUNING.ultimate.gaugeMax, 0xffd34d);

    // 확정: 일반 구간만 '처치 k/목표'. 엘리트·보스 구간의 분열·소환체 잔여 수는 표시하지 않는다(내부 판정만).
    let w: string;
    if (b.mode === 'wave') {
      const rt = b.waves[b.waveIndex];
      if (rt.phase === 'normal') {
        const np = b.normalProgress();
        w = `웨이브 ${b.waveIndex + 1}/3 · 처치 ${np.kills}/${np.target}`;
      } else {
        const boss = b.enemies.find((e) => e.role === 'finale');
        const finale = b.chapter.waves[b.waveIndex].finale;
        if (b.introTimer > 0) { w = `웨이브 ${b.waveIndex + 1}/3 · 등장!`; } else
        w = `웨이브 ${b.waveIndex + 1}/3 · ${boss?.def.rank === 'boss' || finale === 'stompSole' ? '보스' : '엘리트'} 전투`;
      }
    } else {
      w = b.waveIndex >= 3 ? '감옥으로!' : `웨이브 ${b.waveIndex + 1}/3 접근 중`;
    }
    this.hudTexts.top.setText(
      `HP ${Math.ceil(b.player.hp)}/${b.player.maxHp}${b.hasBell ? ' 🔔' : ''}  Lv.${b.heroLevel}` +
      `            냥기력 ${Math.floor(b.player.energy)}` +
      (b.loadout.ultimateEnabled ? `          궁극기 ${Math.floor(b.ultGauge)}%` : '          궁극기 미해금'),
    );
    const jelly = b.loot.nyangJelly ?? 0;
    this.hudTexts.right.setText(`${w}\n주운 냥젤리 ${jelly}`);
    const banner = b.effects.find((e) => e.kind === 'banner');
    this.hudTexts.banner.setText(banner?.text ?? '').setAlpha(banner ? Math.min(1, banner.ttl * 2) : 0);
    const skills = b.skills.exclusives.map((s) => {
      const def = b.weapon.exclusives.find((d) => d.id === s.id)!;
      const cd = b.skillCd[s.id] ?? 0;
      return `${def.name}${cd > 0 ? ` ${cd.toFixed(1)}s` : ' ✓'}`;
    }).join(' · ');
    const passives = (Object.entries(b.skills.passives) as [PassiveId, number][])
      .filter(([, lv]) => lv > 0).map(([id, lv]) => `${PASSIVES[id].name.replace(' 증가', '').replace(' 감소', '')} ${lv}`).join(' · ');
    const lootKinds = Object.keys(b.loot).filter((k) => k !== 'nyangJelly').length;
    const st = b.stats();
    const finaleStop = b.mode === 'wave' && b.waves[b.waveIndex]?.phase === 'finale';
    const moveState = b.player.stagger > 0 ? '밀려남(경직)' : b.player.x < b.camp.x + TUNING.camp.followGap - 0.5 ? '호위 위치로 복귀' : finaleStop ? '엘리트/보스 정차' : b.engaged ? '교전 정차' : '자동 전진';
    this.hudTexts.note.setText(
      `[${moveState}] 방어력 ${Math.round(st.defense)} (직접 피해 ×${st.damageTaken.toFixed(2)})` +
      (b.heroStatus.effects.length ? ` | 상태: ${b.heroStatus.effects.map((e) => `${STATUS_NAMES[e.tag]}(${e.source}) ${e.remaining.toFixed(1)}s`).join(', ')}` : '') +
      (b.heroStatus.refreezeImmune > 0 ? ` | 재빙결 면역 ${b.heroStatus.refreezeImmune.toFixed(1)}s` : '') + '\n' +
      `기본 Lv.${b.skills.basicLevel} | 전용 ${b.skills.exclusives.length}/3: ${skills || '없음'}\n` +
      `패시브 ${passives ? passives.split(' · ').length : 0}/5: ${passives || '없음'} | 주운 재료 ${lootKinds}종 (판 종료 시 정산)`,
    );
  }

  // ───────────────────────── 선택창

  private showChoice(): void {
    const b = this.battle;
    const pending = b.pending[0];
    if (this.choiceShownFor === pending) {
      const k = this.keys;
      const jd = Phaser.Input.Keyboard.JustDown;
      if (jd(k.ONE)) this.pick(0);
      else if (jd(k.TWO)) this.pick(1);
      else if (jd(k.THREE)) this.pick(2);
      return;
    }
    this.choiceLayer?.destroy();
    this.choiceShownFor = pending;
    const items: Phaser.GameObjects.GameObject[] = [];
    items.push(this.add.rectangle(0, 0, W, H, 0x120f1c, 0.72).setOrigin(0).setInteractive());
    const title = pending.track === 'hero' ? `호냥이 레벨업! Lv.${b.heroLevel} — 하나를 고르세요` : `캠프 레벨업! Lv.${b.campLevel} — 동료 지원 강화`;
    items.push(text(this, W / 2, 70, title, 24, pending.track === 'hero' ? '#ffd9a0' : '#bff7ff').setOrigin(0.5, 0));
    pending.offers.forEach((o, i) => {
      const lab = offerLabel(o, b.weapon);
      const x = 60 + i * 290;
      const card = button(this, x, 150, 260, 250, `${i + 1}\n\n${lab.title}\n\n${lab.detail}`, () => this.pick(i), { size: 15, color: 0x3d3958 });
      items.push(card);
    });
    items.push(text(this, W / 2, 430, '키보드 1·2·3 또는 터치로 선택', 14, COLORS.dim).setOrigin(0.5, 0));
    this.choiceLayer = this.add.container(0, 0, items).setDepth(30);
  }

  private pick(i: number): void {
    this.battle.choose(i);
    sound.play('pickup');
    this.choiceLayer?.destroy();
    this.choiceLayer = null;
    this.choiceShownFor = null;
  }
}
