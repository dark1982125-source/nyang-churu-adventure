import Phaser from 'phaser';
import { store } from '../store';
import { button, COLORS, text } from '../ui';
import { CURRENCY_NAMES, MATERIAL_NAMES, type CurrencyId, type MaterialId } from '../../data/items';
import { COMPANIONS } from '../../data/companions';
import { UPGRADE_NODES } from '../../data/progression';
import { ULTIMATES, type UltimateId } from '../../data/skills';
import { buyNode, canBuyNode, nodeLevel, toggleUltimate } from '../../meta/save';
import { sound } from '../sound';

type Tab = 'main' | 'growth' | 'ult' | 'settings';

/** 캠프(출격 준비) 화면. 정면 UI 허용 구역. 배치는 검토용. */
export class CampScene extends Phaser.Scene {
  private tab: Tab = 'main';
  private confirmReset = false;

  constructor() { super('camp'); }

  init(data: { tab?: Tab }): void {
    this.tab = data.tab ?? 'main';
    this.confirmReset = false;
  }

  create(): void {
    const s = store.save;
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.input.once('pointerdown', () => sound.unlock());

    text(this, 24, 16, '냥냥 츄르 대모험 · 이동 캠프', 26, '#ffd9a0');
    text(this, 24, 52, '임시 표시물 빌드 — 아트·음악은 아직 제공되지 않아 도형·합성음으로 대신합니다.', 13, COLORS.dim);

    // 영구 재화
    const cur = (Object.keys(CURRENCY_NAMES) as CurrencyId[]).map((id) => `${CURRENCY_NAMES[id]} ${s.currencies[id]}`).join('   ');
    text(this, 24, 84, cur, 18, '#ffe7b8');

    const tabs: [Tab, string][] = [['main', '출격'], ['growth', '영구 성장'], ['ult', '궁극기'], ['settings', '설정']];
    tabs.forEach(([t, label], i) => {
      button(this, 24 + i * 130, 118, 122, 36, label, () => this.scene.restart({ tab: t }), { color: t === this.tab ? 0x5b4f86 : COLORS.panelLight });
    });

    if (this.tab === 'main') this.drawMain();
    else if (this.tab === 'growth') this.drawGrowth();
    else if (this.tab === 'ult') this.drawUlt();
    else this.drawSettings();
  }

  private drawMain(): void {
    const s = store.save;
    const y0 = 172;
    this.add.rectangle(24, y0, 440, 340, COLORS.panel).setOrigin(0);
    text(this, 40, y0 + 12, '캠프 동료', 18, '#ffd9a0');
    const crew = Object.values(COMPANIONS).filter((c) => c.initial || s.rescued.includes(c.id));
    crew.forEach((c, i) => text(this, 40, y0 + 44 + i * 24, `· ${c.name} — ${c.support}`, 15));
    const locked = Object.values(COMPANIONS).filter((c) => !c.initial && !s.rescued.includes(c.id)).length;
    text(this, 40, y0 + 44 + crew.length * 24 + 6, `아직 구출하지 못한 동료 ${locked}명 (정체 비공개)`, 14, COLORS.dim);

    text(this, 40, y0 + 200, '제작 재료 (실패해도 보존)', 18, '#ffd9a0');
    const mats = (Object.keys(MATERIAL_NAMES) as MaterialId[]).filter((m) => (s.materials[m] ?? 0) > 0);
    text(this, 40, y0 + 230, mats.length ? mats.map((m) => `${MATERIAL_NAMES[m]} ${s.materials[m]}`).join('  ·  ') : '없음', 14);
    text(this, 40, y0 + 290, `출격 ${s.stats.runs} · 클리어 ${s.stats.clears} · 패배 ${s.stats.defeats}`, 14, COLORS.dim);

    this.add.rectangle(488, y0, 448, 340, COLORS.panel).setOrigin(0);
    text(this, 504, y0 + 12, 'Ch 1 말랑 운석 평원', 20, '#ffd9a0');
    const cleared = s.clearedChapters.includes(1);
    text(this, 504, y0 + 44, cleared ? '구출 완료: 닥터 코숏 · 고난도 Ch 1 해금됨(고난도 미구현)' : '저 멀리 정체를 알 수 없는 감옥이 보입니다.', 14, COLORS.dim);
    text(this, 504, y0 + 76, '규칙: 오른쪽 전진만 · 대시 없음 · 3웨이브 지정 적 전부 처치\n보스 열쇠로 감옥을 열어야 클리어', 14);
    const mode = s.settings.advanceMode === 'hold' ? '전진 입력 중에만 이동(임시)' : '자동 전진(임시)';
    text(this, 504, y0 + 130, `전진 방식: ${mode}`, 14, COLORS.warn);
    text(this, 504, y0 + 156, 'PC: → / D 전진 · Space / ↑ 점프 · 1~3 궁극기\n모바일: 화면 아래 버튼', 13, COLORS.dim);
    button(this, 504, y0 + 250, 416, 64, 'Ch 1 출격!', () => {
      sound.unlock();
      this.scene.start('battle');
    }, { size: 24, color: 0xc0623c });
  }

  private drawGrowth(): void {
    const s = store.save;
    text(this, 24, 168, '영구 성장 — 모두 [테스트] 노드입니다. 최종 트리·가격은 미정.', 14, COLORS.warn);
    UPGRADE_NODES.forEach((n, i) => {
      const col = i < 6 ? 0 : 1;
      const row = i < 6 ? i : i - 6;
      const x = 24 + col * 460;
      const y = 196 + row * 54;
      const lvl = nodeLevel(s, n.id);
      const st = canBuyNode(s, n.id);
      const price = lvl >= n.maxLevel ? '최대' : `${CURRENCY_NAMES[n.currency]} ${n.cost(lvl)}`;
      const reason = st === 'locked' ? ' (선행 필요)' : '';
      this.add.rectangle(x, y, 448, 48, COLORS.panel).setOrigin(0);
      text(this, x + 10, y + 5, `${n.name}  Lv.${lvl}/${n.maxLevel}`, 14);
      text(this, x + 10, y + 26, `${n.desc}${reason}`, 12, COLORS.dim);
      button(this, x + 318, y + 7, 122, 34, price, () => {
        if (buyNode(s, n.id) === 'ok') { store.persist(); sound.play('levelUp'); }
        this.scene.restart({ tab: 'growth' });
      }, { size: 13, enabled: st === 'ok' });
    });
  }

  private drawUlt(): void {
    const s = store.save;
    text(this, 24, 168, '궁극기 장착 (최대 3종, 공유 게이지). 명칭·효과·수치는 미정이며 아래 효과는 검토용 자리표시자입니다.', 14, COLORS.warn);
    (Object.keys(ULTIMATES) as UltimateId[]).forEach((id, i) => {
      const u = ULTIMATES[id];
      const y = 200 + i * 52;
      const unlocked = nodeLevel(s, `ult_${id}`) > 0;
      const slot = s.equippedUltimates.indexOf(id);
      this.add.rectangle(24, y, 912, 46, COLORS.panel).setOrigin(0);
      text(this, 36, y + 5, `${u.name}`, 15);
      text(this, 36, y + 25, `TEMP 효과: ${u.tempEffect}${unlocked ? '' : ' · 미해금(영구 성장에서 해금)'}`, 12, COLORS.dim);
      button(this, 790, y + 6, 136, 34, slot >= 0 ? `장착 중 [${slot + 1}]` : '장착', () => {
        if (toggleUltimate(s, id)) store.persist();
        this.scene.restart({ tab: 'ult' });
      }, { size: 13, enabled: unlocked, color: slot >= 0 ? 0x4f7a5b : COLORS.panelLight });
    });
  }

  private drawSettings(): void {
    const s = store.save;
    text(this, 24, 172, '전진 방식 (미정 — 검토용 임시 옵션)', 18, '#ffd9a0');
    button(this, 24, 204, 300, 44, `전진 입력 중에만 이동${s.settings.advanceMode === 'hold' ? ' ✔' : ''}`, () => {
      s.settings.advanceMode = 'hold'; store.persist(); this.scene.restart({ tab: 'settings' });
    }, { size: 14 });
    button(this, 340, 204, 300, 44, `자동 전진, 적 앞에서 정지${s.settings.advanceMode === 'auto' ? ' ✔' : ''}`, () => {
      s.settings.advanceMode = 'auto'; store.persist(); this.scene.restart({ tab: 'settings' });
    }, { size: 14 });

    text(this, 24, 276, `효과음 볼륨 ${Math.round(s.settings.sfxVolume * 100)}%  (배경음악은 파일 미제공으로 없음)`, 16);
    [0, 0.4, 0.8, 1].forEach((v, i) => button(this, 24 + i * 90, 306, 80, 36, `${v * 100}%`, () => {
      s.settings.sfxVolume = v; store.persist(); sound.play('pickup'); this.scene.restart({ tab: 'settings' });
    }, { size: 14 }));

    text(this, 24, 380, '저장 데이터 초기화', 16, '#ff8f8f');
    button(this, 24, 410, 240, 40, this.confirmReset ? '정말 초기화(다시 누르기)' : '초기화', () => {
      if (this.confirmReset) { store.reset(); this.scene.restart({ tab: 'main' }); return; }
      this.confirmReset = true;
      this.children.removeAll();
      this.create();
    }, { size: 14, color: 0x7a3b3b });
  }
}
