import Phaser from 'phaser';
import { store } from '../store';
import { FONT, text } from '../ui';
import { COMPANIONS } from '../../data/companions';
import { completePendingClear, pendingClear } from '../../meta/settlement';
import { sound } from '../sound';
import { drawHeroSide } from '../costumeArt';
import { COSTUME_DEFS } from '../../data/costumes';

const W = 960;
const GROUND = 430;
const JAIL_X = 760;
const OPEN_TIME = 1.6; // 전투 화면 감옥 개방과 같은 시간
const REVEAL_TIME = 3; // 전투 화면 정체 공개와 같은 시간

/**
 * 구출 완료 흐름 복귀. 최종 보스 처치(클리어 확정) 뒤 구출을 끝내기 전에 앱이 꺼진 판만 여기로 온다.
 * 전투는 재개하지 않는다(적·타이머 없음). 열쇠는 보스 처치로 이미 얻은 상태이고, 감옥은 직접 가서 연다.
 * 동료·재화·클리어 보상은 감옥 개방 → 정체 공개 뒤 정산에서 한 번만 지급한다(같은 판 id라 중복 없음).
 */
export class RescueScene extends Phaser.Scene {
  private heroX = 160;
  private phase: 'walk' | 'opening' | 'revealed' | 'done' = 'walk';
  private timer = 0;
  private g!: Phaser.GameObjects.Graphics;
  private label!: Phaser.GameObjects.Text;

  constructor() { super('rescue'); }

  create(): void {
    const a = pendingClear(store.save);
    if (!a) { this.scene.start('camp'); return; }
    this.heroX = 160;
    this.phase = 'walk';
    this.timer = 0;
    this.cameras.main.setBackgroundColor(0xbfe3f2);
    this.input.once('pointerdown', () => sound.unlock());
    this.g = this.add.graphics();
    text(this, 24, 18, `Ch ${a.chapterId} 클리어 확정 · 구출 마무리`, 24, '#3a2a4a');
    text(this, 24, 54, '지난번에 보스를 처치한 뒤 구출을 끝내기 전에 게임이 종료되었습니다.\n전투는 다시 하지 않습니다. 열쇠를 들고 감옥으로 가서 구출을 마무리하세요.', 14, '#3d3852');
    this.label = this.add.text(W / 2, 150, '열쇠 보유 · 감옥으로 자동으로 걸어갑니다', { fontFamily: FONT, fontSize: '20px', color: '#ffffff', stroke: '#3a2a4a', strokeThickness: 5, align: 'center' }).setOrigin(0.5);
  }

  update(_t: number, deltaMs: number): void {
    const a = pendingClear(store.save);
    if (!a && this.phase !== 'done') return;
    const dt = Math.min(deltaMs / 1000, 0.05);
    if (this.phase === 'walk') {
      // 자동 전진(확정): 입력 없이 감옥으로 걸어간다
      this.heroX = Math.min(JAIL_X - 60, this.heroX + 180 * dt);
      if (this.heroX >= JAIL_X - 62) { this.phase = 'opening'; this.timer = OPEN_TIME; this.label.setText('열쇠로 감옥을 여는 중…'); sound.play('pickup'); }
    } else if (this.phase === 'opening') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.phase = 'revealed';
        this.timer = REVEAL_TIME;
        const name = a?.clearConfirmed.rescue ? COMPANIONS[a.clearConfirmed.rescue].name : '';
        this.label.setText(name ? `${name}을(를) 구출했습니다!` : '클리어!');
        sound.play('clear');
      }
    } else if (this.phase === 'revealed') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.phase = 'done';
        // 여기서 처음으로 동료·재화·클리어 보상을 정산(같은 저장 쓰기에서 저널 삭제)
        const done = completePendingClear(store.save);
        store.persist();
        if (done) this.scene.start('result', { result: done.result, summary: done.summary, log: [], resumed: true });
        else this.scene.start('camp');
        return;
      }
    }
    this.draw(a?.clearConfirmed.rescue ?? null);
  }

  private draw(rescue: keyof typeof COMPANIONS | null): void {
    const g = this.g;
    g.clear();
    g.fillStyle(0x9ad08a, 1).fillRect(0, GROUND, W, 540 - GROUND);
    // 감옥 또는 공개된 동료(임시 도형)
    if (this.phase === 'revealed' && rescue) {
      g.fillStyle(0xf1e4d0, 1).fillCircle(JAIL_X, GROUND - 40, 30);
      g.fillStyle(0x6ac0e0, 1).fillRect(JAIL_X - 20, GROUND - 16, 40, 10);
    } else {
      g.fillStyle(0x3c3550, 1).fillRoundedRect(JAIL_X - 34, GROUND - 76, 68, 76, 6);
      g.lineStyle(3, this.phase === 'opening' ? 0xffe08a : 0x8d84a8, 1);
      for (let k = -2; k <= 2; k++) g.lineBetween(JAIL_X + k * 12, GROUND - 74, JAIL_X + k * 12, GROUND - 2);
    }
    // 호냥이(임시 도형)와 열쇠
    const sv = store.save;
    drawHeroSide(g, this.heroX, GROUND, { look: sv.equipment.costume ? COSTUME_DEFS[sv.equipment.costume].look : null, weapon: sv.equipment.weapon, walk: this.phase === 'walk' ? Math.sin(this.time.now / 70) : 0 });
    g.fillStyle(0xffd34d, 1).fillCircle(this.heroX + 22, GROUND - 64, 7).fillRect(this.heroX + 22, GROUND - 66, 16, 4);
  }
}
