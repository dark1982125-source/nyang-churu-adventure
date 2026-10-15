import Phaser from 'phaser';
import { store } from '../store';
import { button, COLORS, text } from '../ui';
import { CURRENCY_NAMES, MATERIAL_NAMES, type CurrencyId, type MaterialId } from '../../data/items';
import { COMPANIONS } from '../../data/companions';
import { UPGRADE_NODES } from '../../data/progression';
import { ULTIMATES, type UltimateId } from '../../data/skills';
import { buyNode, canBuyNode, nodeLevel, toggleUltimate } from '../../meta/save';
import { canCraft, craftWeapon, enhanceInfo, enhanceWeapon, equipWeapon, forgeUnlocked, visitForge } from '../../meta/forge';
import { CRAFTABLE_WEAPONS, ENHANCE_RULES, GEAR_SLOT_NAMES, WEAPON_DEFS, enhanceAttackBonus, weaponGrade, type MaterialCount, type WeaponId } from '../../data/weapons';
import { sound } from '../sound';

type Tab = 'main' | 'growth' | 'ult' | 'gear' | 'forge' | 'settings';

/** 캠프(출격 준비) 화면. 정면 UI 허용 구역. 배치는 검토용. */
export class CampScene extends Phaser.Scene {
  private tab: Tab = 'main';
  private confirmReset = false;
  private forgeMsg = '';

  constructor() { super('camp'); }

  init(data: { tab?: Tab; msg?: string }): void {
    this.tab = data.tab ?? 'main';
    this.confirmReset = false;
    this.forgeMsg = data.msg ?? '';
  }

  create(): void {
    const s = store.save;
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.input.once('pointerdown', () => sound.unlock());

    text(this, 24, 16, '냥냥 츄르 대모험 · 이동 캠프', 26, '#ffd9a0');
    text(this, 24, 52, store.preview
      ? '[미리보기 전용 저장] 깡깡이 구출·재료 보유 상태로 시작합니다. 실제 저장과 분리되며 새로고침하면 사라집니다.'
      : '임시 표시물 빌드 — 아트·음악은 아직 제공되지 않아 도형·합성음으로 대신합니다.', 13, store.preview ? COLORS.warn : COLORS.dim);

    // 영구 재화
    const cur = (Object.keys(CURRENCY_NAMES) as CurrencyId[]).map((id) => `${CURRENCY_NAMES[id]} ${s.currencies[id]}`).join('   ');
    text(this, 24, 84, cur, 18, '#ffe7b8');

    // 대장간 탭은 깡깡이 구출 전에는 아예 보이지 않는다(미래 시설·동료 정체 비공개)
    const tabs: [Tab, string][] = [['main', '출격'], ['growth', '영구 성장'], ['ult', '궁극기'], ['gear', '장비']];
    if (forgeUnlocked(s)) tabs.push(['forge', '대장간']);
    tabs.push(['settings', '설정']);
    tabs.forEach(([t, label], i) => {
      button(this, 24 + i * 130, 118, 122, 36, label, () => this.scene.restart({ tab: t }), { color: t === this.tab ? 0x5b4f86 : COLORS.panelLight });
    });

    if (this.tab === 'main') this.drawMain();
    else if (this.tab === 'growth') this.drawGrowth();
    else if (this.tab === 'ult') this.drawUlt();
    else if (this.tab === 'gear') this.drawGear();
    else if (this.tab === 'forge' && forgeUnlocked(s)) this.drawForge();
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
    text(this, 40, y0 + 230, mats.length ? mats.map((m) => `${MATERIAL_NAMES[m]} ${s.materials[m]}`).join(' · ') : '없음', 13).setWordWrapWidth(410);
    text(this, 40, y0 + 290, `출격 ${s.stats.runs} · 클리어 ${s.stats.clears} · 패배 ${s.stats.defeats}`, 14, COLORS.dim);

    this.add.rectangle(488, y0, 448, 340, COLORS.panel).setOrigin(0);
    text(this, 504, y0 + 12, 'Ch 1 말랑 운석 평원', 20, '#ffd9a0');
    const cleared = s.clearedChapters.includes(1);
    text(this, 504, y0 + 44, cleared ? '구출 완료: 닥터 코숏 · 고난도 Ch 1 해금됨(고난도 미구현)' : '저 멀리 정체를 알 수 없는 감옥이 보입니다.', 14, COLORS.dim);
    text(this, 504, y0 + 76, '규칙: 오른쪽 전진만 · 대시 없음 · 3웨이브 지정 적 전부 처치\n보스 열쇠로 감옥을 열어야 클리어', 14);
    const mode = s.settings.advanceMode === 'hold' ? '누르는 동안 전진(시험)' : '자동 전진(비교용)';
    const pass = s.settings.passPolicy === 'frontBlock' ? '전방 전투(시험)' : '점프 통과+후방 레이저(비교용)';
    text(this, 504, y0 + 122, `전진: ${mode} · 적 통과: ${pass}`, 14, COLORS.warn);
    const w = WEAPON_DEFS[s.equipment.weapon];
    text(this, 504, y0 + 142, `무기: ${w.name} +${s.weapons[w.id]?.level ?? 0}`, 13, COLORS.dim);
    text(this, 504, y0 + 166, 'PC: → / D 전진 · Space / ↑ 점프 · 1~3 궁극기\n모바일: 화면 아래 버튼', 13, COLORS.dim);
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

    text(this, 24, 262, '적 통과 처리 (미정 — 추천 시험안은 전방 전투)', 18, '#ffd9a0');
    button(this, 24, 294, 300, 44, `전방 전투: 적이 앞에서 막힘${s.settings.passPolicy === 'frontBlock' ? ' ✔' : ''}`, () => {
      s.settings.passPolicy = 'frontBlock'; store.persist(); this.scene.restart({ tab: 'settings' });
    }, { size: 14 });
    button(this, 340, 294, 300, 44, `점프 통과 + 후방 레이저(비교)${s.settings.passPolicy === 'jumpPass' ? ' ✔' : ''}`, () => {
      s.settings.passPolicy = 'jumpPass'; store.persist(); this.scene.restart({ tab: 'settings' });
    }, { size: 14 });

    text(this, 24, 356, `효과음 볼륨 ${Math.round(s.settings.sfxVolume * 100)}%  (배경음악은 파일 미제공으로 없음)`, 16);
    [0, 0.4, 0.8, 1].forEach((v, i) => button(this, 24 + i * 90, 386, 80, 36, `${v * 100}%`, () => {
      s.settings.sfxVolume = v; store.persist(); sound.play('pickup'); this.scene.restart({ tab: 'settings' });
    }, { size: 14 }));

    text(this, 680, 356, '저장 데이터 초기화', 16, '#ff8f8f');
    button(this, 680, 386, 240, 40, this.confirmReset ? '정말 초기화(다시 누르기)' : '초기화', () => {
      if (this.confirmReset) { store.reset(); this.scene.restart({ tab: 'main' }); return; }
      this.confirmReset = true;
      this.children.removeAll();
      this.create();
    }, { size: 14, color: 0x7a3b3b });
  }

  private matLine(list: MaterialCount[]): string {
    const s = store.save;
    return list.map((m) => `${MATERIAL_NAMES[m.id]} ${s.materials[m.id] ?? 0}/${m.count}`).join(' · ');
  }

  /** 장비 슬롯: 무기·몸통 보호구·발 보호구·액세서리 각 1칸 + 코스튬 별도. 장착은 캠프에서만. */
  private drawGear(): void {
    const s = store.save;
    text(this, 24, 166, '장비 슬롯 (판 중 교체 없음). 보호구·액세서리는 제작표가 미정이라 비어 있습니다.', 14, COLORS.warn);
    const slots: [string, string][] = [
      [GEAR_SLOT_NAMES.weapon, `${WEAPON_DEFS[s.equipment.weapon].name} +${s.weapons[s.equipment.weapon]?.level ?? 0}`],
      [GEAR_SLOT_NAMES.body, s.equipment.body ?? '비어 있음'],
      [GEAR_SLOT_NAMES.feet, s.equipment.feet ?? '비어 있음'],
      [GEAR_SLOT_NAMES.accessory, s.equipment.accessory ?? '비어 있음'],
      ['코스튬(별도)', s.equipment.costume ?? '비어 있음'],
    ];
    slots.forEach(([name, v], i) => {
      const y = 194 + i * 44;
      this.add.rectangle(24, y, 400, 38, COLORS.panel).setOrigin(0);
      text(this, 36, y + 9, `${name}: ${v}`, 15, i === 0 ? COLORS.text : COLORS.dim);
    });

    text(this, 448, 166 + 28, '보유 무기', 18, '#ffd9a0');
    const owned = (Object.keys(s.weapons) as WeaponId[]).filter((id) => s.weapons[id]);
    owned.forEach((id, i) => {
      const d = WEAPON_DEFS[id];
      const lv = s.weapons[id]!.level;
      const y = 224 + i * 50;
      this.add.rectangle(448, y, 488, 44, COLORS.panel).setOrigin(0);
      text(this, 460, y + 4, `${d.name} +${lv} [${weaponGrade(lv)}]`, 15);
      text(this, 460, y + 24, `공격력 +${Math.round(enhanceAttackBonus(lv) * 100)}% · ${d.combatReady ? `기본 공격 ${d.basicAttack}` : '전투 동작 미구현(장착 불가)'}`, 12, COLORS.dim);
      const on = s.equipment.weapon === id;
      button(this, 820, y + 6, 106, 32, on ? '장착 중' : '장착', () => {
        if (equipWeapon(s, id) === 'ok') { store.persist(); sound.play('pickup'); }
        this.scene.restart({ tab: 'gear' });
      }, { size: 13, enabled: !on && d.combatReady, color: on ? 0x4f7a5b : COLORS.panelLight });
    });
  }

  /** 대장간: 설계도 → 제작 → 강화. 냥젤리 비용 없음. */
  private drawForge(): void {
    const s = store.save;
    const granted = visitForge(s);
    if (granted.length) {
      store.persist();
      this.forgeMsg = `깡깡이: "첫 방문 기념이다냥!" 설계도 획득 — ${granted.map((id) => WEAPON_DEFS[id].name).join(', ')}`;
    }
    text(this, 24, 164, this.forgeMsg || `강화: 실패 시 기본 재료만 소모·단계 유지, 같은 단계 실패마다 +${ENHANCE_RULES.failBonus * 100}%p, ${ENHANCE_RULES.pityAfterFails}회 연속 실패 후 확정. 행운 미적용.`, 13, this.forgeMsg ? '#bff7ff' : COLORS.dim);

    // 설계도·제작
    text(this, 24, 190, '설계도', 18, '#ffd9a0');
    const bps = CRAFTABLE_WEAPONS.filter((id) => s.blueprints.includes(id));
    bps.forEach((id, i) => {
      const d = WEAPON_DEFS[id];
      const y = 218 + i * 62;
      const c = canCraft(s, id);
      this.add.rectangle(24, y, 440, 56, COLORS.panel).setOrigin(0);
      text(this, 36, y + 4, `${d.name}${c === 'owned' ? ' (보유)' : ''}`, 15);
      text(this, 36, y + 24, this.matLine(d.craft), 12, COLORS.dim);
      text(this, 36, y + 39, `강화 재료: ${d.enhanceMaterial ? MATERIAL_NAMES[d.enhanceMaterial] : '-'}${d.combatReady ? '' : ' · 전투 동작 미구현'}`, 11, COLORS.dim);
      if (c !== 'owned') button(this, 358, y + 10, 96, 36, '제작', () => {
        const r = craftWeapon(s, id);
        if (r === 'ok') { store.persist(); sound.play('levelUp'); }
        this.scene.restart({ tab: 'forge', msg: r === 'ok' ? `${d.name} 제작 완료!` : '' });
      }, { size: 14, enabled: c === 'ok' });
    });
    if (!bps.length) text(this, 36, 222, '설계도가 없습니다.', 14, COLORS.dim);

    // 강화
    text(this, 488, 190, '강화 (모든 무기 공통표)', 18, '#ffd9a0');
    const owned = CRAFTABLE_WEAPONS.filter((id) => s.weapons[id]);
    owned.forEach((id, i) => {
      const d = WEAPON_DEFS[id];
      const info = enhanceInfo(s, id);
      const y = 218 + i * 86;
      this.add.rectangle(488, y, 448, 80, COLORS.panel).setOrigin(0);
      text(this, 500, y + 4, `${d.name} +${info.level} [${weaponGrade(info.level)}] · 공격력 +${Math.round(enhanceAttackBonus(info.level) * 100)}%`, 15);
      if (info.blocker === 'max') { text(this, 500, y + 28, '최대 강화', 13, COLORS.dim); return; }
      const pity = info.pityLeft === 0 ? '다음 시도 확정 성공' : `확정까지 실패 ${info.pityLeft}회`;
      text(this, 500, y + 26, `+${info.target} 성공률 ${Math.round(info.rate * 100)}% (기본 ${Math.round(info.baseRate * 100)}%, 실패 ${info.fails}회) · ${pity}`, 12, COLORS.dim);
      const need = info.material ? this.matLine([info.material]) : '';
      const sp = info.specials.length ? ` · 특별(성공 시만 소모): ${this.matLine(info.specials)}` : '';
      text(this, 500, y + 44, `${need}${sp}`, 12, info.blocker ? '#ffb3b3' : COLORS.dim);
      button(this, 830, y + 8, 96, 36, '강화', () => {
        const r = enhanceWeapon(s, id, Math.random);
        if (!r.attempted) return;
        store.persist();
        sound.play(r.success ? 'levelUp' : 'hurt');
        this.scene.restart({ tab: 'forge', msg: r.success ? `성공! ${d.name} +${r.newLevel}` : `실패… 단계 유지, 기본 재료만 소모 (다음 +${ENHANCE_RULES.failBonus * 100}%p)` });
      }, { size: 14, enabled: !info.blocker });
    });
    if (!owned.length) text(this, 500, 222, '제작한 무기가 없습니다. 기본 장갑은 강화 대상이 아닙니다.', 13, COLORS.dim);
  }
}
