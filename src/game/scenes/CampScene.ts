import Phaser from 'phaser';
import { store } from '../store';
import { button, COLORS, text } from '../ui';
import { CURRENCY_NAMES, MATERIAL_NAMES, type CurrencyId, type MaterialId } from '../../data/items';
import { COMPANIONS } from '../../data/companions';
import { UPGRADE_NODES } from '../../data/progression';
import { ULTIMATES, type UltimateId } from '../../data/skills';
import { buyNode, canBuyNode, nodeLevel, toggleUltimate } from '../../meta/save';
import { armorEnhanceInfo, canCraft, canCraftArmor, craftArmor, craftWeapon, enhanceArmor, enhanceInfo, enhanceWeapon, equipArmor, equipWeapon, equippedArmorStats, forgeUnlocked, unequipArmor, visitForge } from '../../meta/forge';
import { ARMOR_DEFS, ARMOR_IDS, ARMOR_SLOT_NAMES, ARMOR_STAT_NAMES, armorStatsAt, type ArmorId, type ArmorStatKey, type ArmorStats } from '../../data/armor';
import { pendingClear } from '../../meta/settlement';
import { accessoryEnhanceInfo, canCraftAccessory, craftAccessory, enhanceAccessory, equipAccessory, equippedAccessoryStats, unequipAccessory, workshopUnlocked } from '../../meta/forge';
import { ACCESSORY_DEFS, ACCESSORY_IDS, ACCESSORY_STAT_NAMES, accessoryValueAt, type AccessoryStatKey } from '../../data/accessories';
import { CRAFTABLE_WEAPONS, ENHANCE_RULES, GEAR_SLOT_NAMES, WEAPON_DEFS, enhanceAttackBonus, weaponGrade, type MaterialCount, type WeaponId } from '../../data/weapons';
import { sound } from '../sound';

type Tab = 'main' | 'growth' | 'ult' | 'gear' | 'forge' | 'armor' | 'workshop' | 'settings';

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
    // 클리어 확정 뒤 구출 중 종료된 판이 있으면 구출 완료 흐름부터 마무리(전투 재개 아님)
    if (pendingClear(s)) { this.scene.start('rescue'); return; }
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.input.once('pointerdown', () => sound.unlock());

    text(this, 24, 16, '냥냥 츄르 대모험 · 이동 캠프', 26, '#ffd9a0');
    text(this, 24, 52, store.preview
      ? '[미리보기 전용 저장·TEMP 우회] 깡깡이·나비 구출, 액세서리 설계도·재료 보유 상태입니다. 실제 저장과 분리, 새로고침하면 사라집니다.'
      : '임시 표시물 빌드 — 아트·음악은 아직 제공되지 않아 도형·합성음으로 대신합니다.', 13, store.preview ? COLORS.warn : COLORS.dim);

    if (store.recovered?.applied && this.tab === 'main') {
      const n = Object.values(store.recovered.loot).reduce((a, b) => a + (b ?? 0), 0);
      text(this, 470, 84, `지난 판이 중간에 끝나 주운 재화·재료 ${n}개만 정산했습니다.`, 13, COLORS.warn);
    }
    // 영구 재화
    const cur = (Object.keys(CURRENCY_NAMES) as CurrencyId[]).map((id) => `${CURRENCY_NAMES[id]} ${s.currencies[id]}`).join('   ');
    text(this, 24, 84, cur, 18, '#ffe7b8');

    // 대장간 탭은 깡깡이 구출 전에는 아예 보이지 않는다(미래 시설·동료 정체 비공개)
    const tabs: [Tab, string][] = [['main', '출격'], ['growth', '영구 성장'], ['ult', '궁극기'], ['gear', '장비']];
    if (forgeUnlocked(s)) tabs.push(['forge', '대장간'], ['armor', '보호구']);
    // 나비 공방(액세서리)은 나비 구출 후에만 탭이 보인다
    if (workshopUnlocked(s)) tabs.push(['workshop', '나비 공방']);
    tabs.push(['settings', '설정']);
    const tw = Math.min(122, Math.floor((912 - (tabs.length - 1) * 8) / tabs.length));
    tabs.forEach(([t, label], i) => {
      button(this, 24 + i * (tw + 8), 118, tw, 36, label, () => this.scene.restart({ tab: t }), { color: t === this.tab ? 0x5b4f86 : COLORS.panelLight, size: tabs.length > 7 ? 14 : 16 });
    });

    if (this.tab === 'main') this.drawMain();
    else if (this.tab === 'growth') this.drawGrowth();
    else if (this.tab === 'ult') this.drawUlt();
    else if (this.tab === 'gear') this.drawGear();
    else if (this.tab === 'forge' && forgeUnlocked(s)) this.drawForge();
    else if (this.tab === 'armor' && forgeUnlocked(s)) this.drawArmor();
    else if (this.tab === 'workshop' && workshopUnlocked(s)) this.drawWorkshop();
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
    text(this, 40, y0 + 290, `출격 ${s.stats.runs} · 클리어 ${s.stats.clears} · 패배 ${s.stats.defeats} · 중도 종료 ${s.stats.quits}`, 14, COLORS.dim);

    this.add.rectangle(488, y0, 448, 340, COLORS.panel).setOrigin(0);
    text(this, 504, y0 + 12, 'Ch 1 말랑 운석 평원', 20, '#ffd9a0');
    const cleared = s.clearedChapters.includes(1);
    text(this, 504, y0 + 44, cleared ? '구출 완료: 닥터 코숏 · 고난도 Ch 1 해금됨(고난도 미구현)' : '저 멀리 정체를 알 수 없는 감옥이 보입니다.', 14, COLORS.dim);
    text(this, 504, y0 + 76, '규칙: 오른쪽 전진만 · 대시 없음 · 3웨이브마다 목표 처치 후\n엘리트/보스와 부하 전부 처치 · 보스 열쇠로 감옥을 열어야 클리어', 14);
    const mode = s.settings.advanceMode === 'hold' ? '누르는 동안 전진' : '자동 전진(비교 도구)';
    const pass = s.settings.passPolicy === 'frontBlock' ? '전방 전투' : '점프 통과+후방 레이저(비교 도구)';
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
      const col = i < 7 ? 0 : 1;
      const row = i < 7 ? i : i - 7;
      const x = 24 + col * 460;
      const y = 194 + row * 47;
      const lvl = nodeLevel(s, n.id);
      const st = canBuyNode(s, n.id);
      const price = lvl >= n.maxLevel ? '최대' : `${CURRENCY_NAMES[n.currency]} ${n.cost(lvl)}`;
      const reason = st === 'locked' ? (n.requiresRescue && !s.rescued.includes(n.requiresRescue) ? ' (코숏 구출 필요)' : ' (선행 필요)') : '';
      this.add.rectangle(x, y, 448, 43, COLORS.panel).setOrigin(0);
      text(this, x + 10, y + 3, `${n.name}  Lv.${lvl}/${n.maxLevel}`, 14);
      text(this, x + 10, y + 23, `${n.desc}${reason}`.slice(0, 44), 11, COLORS.dim);
      button(this, x + 318, y + 5, 122, 33, price, () => {
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
    text(this, 24, 172, '전진 방식 — 확정: 누르는 동안 전진. 자동 전진은 비교용 개발 도구', 18, '#ffd9a0');
    button(this, 24, 204, 300, 44, `누르는 동안 전진, 놓으면 정지${s.settings.advanceMode === 'hold' ? ' ✔' : ''}`, () => {
      s.settings.advanceMode = 'hold'; store.persist(); this.scene.restart({ tab: 'settings' });
    }, { size: 14 });
    button(this, 340, 204, 300, 44, `[비교] 자동 전진, 적 앞에서 정지${s.settings.advanceMode === 'auto' ? ' ✔' : ''}`, () => {
      s.settings.advanceMode = 'auto'; store.persist(); this.scene.restart({ tab: 'settings' });
    }, { size: 14 });

    text(this, 24, 262, '적 통과 — 확정: 전방 전투. 점프 통과는 비교용 개발 도구', 18, '#ffd9a0');
    button(this, 24, 294, 300, 44, `전방 전투: 서로 넘어가지 않음${s.settings.passPolicy === 'frontBlock' ? ' ✔' : ''}`, () => {
      s.settings.passPolicy = 'frontBlock'; store.persist(); this.scene.restart({ tab: 'settings' });
    }, { size: 14 });
    button(this, 340, 294, 300, 44, `[비교] 점프 통과 + 후방 레이저${s.settings.passPolicy === 'jumpPass' ? ' ✔' : ''}`, () => {
      s.settings.passPolicy = 'jumpPass'; store.persist(); this.scene.restart({ tab: 'settings' });
    }, { size: 14 });

    text(this, 660, 172, '[시험] 확인용 (확정 아님)', 18, '#ffd9a0');
    button(this, 660, 204, 276, 44, `캠프 위협 A/B 시험 적 ${s.settings.campThreatTest ? '켜짐 ✔' : '꺼짐'}`, () => {
      s.settings.campThreatTest = !s.settings.campThreatTest; store.persist(); this.scene.restart({ tab: 'settings' });
    }, { size: 14 });
    button(this, 660, 294, 276, 44, `적 상태이상 공격 ${s.settings.statusTest ? '켜짐 ✔' : '꺼짐'}`, () => {
      s.settings.statusTest = !s.settings.statusTest; store.persist(); this.scene.restart({ tab: 'settings' });
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

  /** 장비 슬롯: 무기 + 보호구 머리·몸통·발 각 1칸 + 액세서리 1칸, 코스튬 별도. 장착은 캠프에서만. */
  private drawGear(): void {
    const s = store.save;
    text(this, 24, 162, '장비 슬롯 (판 중 교체 없음). 보호구는 대장간 → 보호구 탭에서 제작·강화·장착합니다.', 13, COLORS.dim);
    const armorName = (id: ArmorId | null) => (id ? `${ARMOR_DEFS[id].name} +${s.armor[id]?.level ?? 0}` : '비어 있음');
    const slots: [string, string, boolean][] = [
      [GEAR_SLOT_NAMES.weapon, `${WEAPON_DEFS[s.equipment.weapon].name} +${s.weapons[s.equipment.weapon]?.level ?? 0}`, true],
      [GEAR_SLOT_NAMES.head, armorName(s.equipment.head), !!s.equipment.head],
      [GEAR_SLOT_NAMES.body, armorName(s.equipment.body), !!s.equipment.body],
      [GEAR_SLOT_NAMES.feet, armorName(s.equipment.feet), !!s.equipment.feet],
      ...s.equipment.accessories.map((id, i): [string, string, boolean] => [`${GEAR_SLOT_NAMES.accessory} ${i + 1}`, id ? `${ACCESSORY_DEFS[id].name} +${s.accessories[id]?.level ?? 0}` : '비어 있음', !!id]),
      ['코스튬(별도)', s.equipment.costume ?? '비어 있음', false],
    ];
    slots.forEach(([name, v, on], i) => {
      const y = 182 + i * 36;
      this.add.rectangle(24, y, 400, 31, COLORS.panel).setOrigin(0);
      text(this, 36, y + 7, `${name}: ${v}`, 14, on ? COLORS.text : COLORS.dim);
    });
    const { total } = equippedArmorStats(s);
    text(this, 24, 474, `보호구 합계(TEMP): ${this.statLine(total) || '없음'}`, 12, '#bff7ff');
    text(this, 24, 494, `액세서리 합계(TEMP, 세트 보너스 없음): ${this.accLine(equippedAccessoryStats(s)) || '없음'}`, 12, '#ffe7b8');

    text(this, 448, 186, '보유 무기', 18, '#ffd9a0');
    const owned = (Object.keys(s.weapons) as WeaponId[]).filter((id) => s.weapons[id]);
    owned.forEach((id, i) => {
      const d = WEAPON_DEFS[id];
      const lv = s.weapons[id]!.level;
      const y = 216 + i * 50;
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

  private accValue(k: AccessoryStatKey, v: number): string {
    return k === 'maxHp' || k === 'defense' || k === 'luck' ? `+${Math.round(v * 10) / 10}` : k === 'critDamage' ? `+${Math.round(v * 100) / 100}배` : `+${Math.round(v * 1000) / 10}%`;
  }

  private accLine(st: Record<AccessoryStatKey, number>): string {
    return (Object.keys(st) as AccessoryStatKey[]).filter((k) => st[k] > 0).map((k) => `${ACCESSORY_STAT_NAMES[k].replace(/\(.*\)/, '')} ${this.accValue(k, st[k])}`).join(' · ');
  }

  /** 나비 공방: 액세서리 10종 제작·강화·2칸 착용. 같은 아이템 중복 착용 불가, 세트 보너스 없음. */
  private drawWorkshop(): void {
    const s = store.save;
    text(this, 24, 160, this.forgeMsg || '종류 무관 2칸 · 같은 아이템은 한 칸만(등급 무관) · 같은 종류 다른 아이템·시리즈 혼합 가능 · 세트 보너스 없음. 강화 규칙은 장비 공통, 수치 TEMP.', 11, this.forgeMsg ? '#bff7ff' : COLORS.dim);
    ACCESSORY_IDS.forEach((id, i) => {
      const d = ACCESSORY_DEFS[id];
      const col = d.series === 'sun' ? 0 : 1;
      const row = i % 5;
      const x = 24 + col * 468;
      const y = 178 + row * 72;
      const owned = s.accessories[id];
      const bp = s.accessoryBlueprints.includes(id);
      this.add.rectangle(x, y, 456, 68, COLORS.panel).setOrigin(0);
      const eff = `${ACCESSORY_STAT_NAMES[d.stat].replace(/\(.*\)/, '')} ${this.accValue(d.stat, accessoryValueAt(id, owned?.level ?? 0))}`;
      text(this, x + 8, y + 3, `${d.name}${owned ? ` +${owned.level} [${weaponGrade(owned.level)}]` : bp ? '' : ' · 설계도 시점 미정(잠김)'} · ${eff}`, 13, owned || bp ? COLORS.text : COLORS.dim);
      if (!owned) {
        text(this, x + 8, y + 24, `제작: ${this.matLine(d.craft)}`, 11, COLORS.dim);
        if (bp) button(this, x + 366, y + 34, 80, 28, '제작', () => {
          const r = craftAccessory(s, id);
          if (r === 'ok') { store.persist(); sound.play('levelUp'); }
          this.scene.restart({ tab: 'workshop', msg: r === 'ok' ? `${d.name} 제작 완료!` : '' });
        }, { size: 12, enabled: canCraftAccessory(s, id) === 'ok' });
        return;
      }
      const info = accessoryEnhanceInfo(s, id);
      if (info.blocker === 'max') text(this, x + 8, y + 24, '최대 강화', 11, COLORS.dim);
      else {
        const sp = info.specials.length ? ` · 특별(성공 시): ${this.matLine(info.specials)}` : '';
        text(this, x + 8, y + 22, `+${info.target} ${Math.round(info.rate * 100)}% (실패 ${info.fails}) · ${info.material ? this.matLine([info.material]) : ''}${sp}`, 11, info.blocker ? '#ffb3b3' : COLORS.dim);
        button(this, x + 196, y + 38, 70, 26, '강화', () => {
          const r = enhanceAccessory(s, id, Math.random);
          if (!r.attempted) return;
          store.persist();
          sound.play(r.success ? 'levelUp' : 'hurt');
          this.scene.restart({ tab: 'workshop', msg: r.success ? `성공! ${d.name} +${r.newLevel}` : '실패… 단계·특별 재료 유지, 기본 재료만 소모' });
        }, { size: 12, enabled: !info.blocker });
      }
      const at = s.equipment.accessories.indexOf(id);
      [0, 1].forEach((slot) => {
        const here = at === slot;
        button(this, x + 276 + slot * 88, y + 38, 82, 26, here ? `칸${slot + 1} 해제` : `칸${slot + 1} 착용`, () => {
          if (here) unequipAccessory(s, slot);
          else if (equipAccessory(s, id, slot) !== 'ok') return;
          store.persist();
          sound.play('pickup');
          this.scene.restart({ tab: 'workshop' });
        }, { size: 12, enabled: here || at < 0, color: here ? 0x4f7a5b : COLORS.panelLight });
      });
    });
  }

  private statLine(st: ArmorStats): string {
    const fmt = (k: ArmorStatKey, v: number) => (k === 'maxHp' || k === 'defense' ? `${ARMOR_STAT_NAMES[k]} +${Math.round(v * 10) / 10}` : `${ARMOR_STAT_NAMES[k]} ${Math.round(v * 1000) / 10}%`);
    return (Object.keys(st) as ArmorStatKey[]).filter((k) => st[k] > 0).map((k) => fmt(k, st[k])).join(' · ');
  }

  /** 깡깡이 보호구: 설계도 → 제작 → 강화(무기 공통 성공률·보장) → 장착. 효과는 보호구 표(수치 TEMP). */
  private drawArmor(): void {
    const s = store.save;
    const granted = visitForge(s);
    if (granted.length) { store.persist(); this.forgeMsg = `깡깡이: 설계도 획득 — ${granted.map((id) => (id in ARMOR_DEFS ? ARMOR_DEFS[id as ArmorId].name : WEAPON_DEFS[id as WeaponId].name)).join(', ')}`; }
    text(this, 24, 162, this.forgeMsg || '머리·몸통·발 각 1칸. 강화 성공률·소모량·실패 보정·10회 보장은 무기와 같고, 효과는 보호구별(수치 TEMP). 재료는 무기와 공유.', 12, this.forgeMsg ? '#bff7ff' : COLORS.dim);
    ARMOR_IDS.forEach((id, i) => {
      const d = ARMOR_DEFS[id];
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 24 + col * 468;
      const y = 184 + row * 116;
      const owned = s.armor[id];
      this.add.rectangle(x, y, 456, 110, COLORS.panel).setOrigin(0);
      const bp = s.armorBlueprints.includes(id);
      const lockNote = d.blueprint.kind === 'undecided' ? '설계도 시점 미정(TEMP)' : d.blueprint.kind === 'firstClear' ? `일반 Ch ${d.blueprint.chapter} 최초 클리어 설계도` : '대장간 설계도';
      text(this, x + 10, y + 4, `[${ARMOR_SLOT_NAMES[d.slot]}] ${d.name}${owned ? ` +${owned.level} [${weaponGrade(owned.level)}]` : bp ? '' : ` · ${lockNote}`}`, 14, owned || bp ? COLORS.text : COLORS.dim);
      if (!owned) {
        text(this, x + 10, y + 26, `제작: ${this.matLine(d.craft)}`, 11, COLORS.dim);
        text(this, x + 10, y + 58, `일반 효과: ${this.statLine(armorStatsAt(id, 0))}`, 11, '#bff7ff');
        if (bp) {
          const c = canCraftArmor(s, id);
          button(this, x + 350, y + 70, 96, 32, '제작', () => {
            const r = craftArmor(s, id);
            if (r === 'ok') { store.persist(); sound.play('levelUp'); }
            this.scene.restart({ tab: 'armor', msg: r === 'ok' ? `${d.name} 제작 완료!` : '' });
          }, { size: 13, enabled: c === 'ok' });
        }
        return;
      }
      text(this, x + 10, y + 24, this.statLine(armorStatsAt(id, owned.level)), 11, '#bff7ff');
      const info = armorEnhanceInfo(s, id);
      if (info.blocker === 'max') text(this, x + 10, y + 44, '최대 강화', 12, COLORS.dim);
      else {
        const pity = info.pityLeft === 0 ? '다음 시도 확정' : `확정까지 실패 ${info.pityLeft}회`;
        text(this, x + 10, y + 42, `+${info.target} 성공률 ${Math.round(info.rate * 100)}% (실패 ${info.fails}회) · ${pity}`, 11, COLORS.dim);
        const sp = info.specials.length ? ` · 특별(성공 시): ${this.matLine(info.specials)}` : '';
        text(this, x + 10, y + 58, `${info.material ? this.matLine([info.material]) : ''}${sp}`, 11, info.blocker ? '#ffb3b3' : COLORS.dim);
        button(this, x + 244, y + 74, 96, 30, '강화', () => {
          const r = enhanceArmor(s, id, Math.random);
          if (!r.attempted) return;
          store.persist();
          sound.play(r.success ? 'levelUp' : 'hurt');
          this.scene.restart({ tab: 'armor', msg: r.success ? `성공! ${d.name} +${r.newLevel}` : '실패… 단계 유지, 기본 재료만 소모' });
        }, { size: 13, enabled: !info.blocker });
      }
      const on = s.equipment[d.slot] === id;
      button(this, x + 350, y + 74, 96, 30, on ? '해제' : '장착', () => {
        if (on) unequipArmor(s, d.slot); else equipArmor(s, id);
        store.persist();
        sound.play('pickup');
        this.scene.restart({ tab: 'armor' });
      }, { size: 13, color: on ? 0x4f7a5b : COLORS.panelLight });
    });
  }

  /** 대장간: 설계도 → 제작 → 강화. 냥젤리 비용 없음. */
  private drawForge(): void {
    const s = store.save;
    const granted = visitForge(s);
    if (granted.length) {
      store.persist();
      this.forgeMsg = `깡깡이: "첫 방문 기념이다냥!" 설계도 획득 — ${granted.map((id) => (id in ARMOR_DEFS ? ARMOR_DEFS[id as ArmorId].name : WEAPON_DEFS[id as WeaponId].name)).join(', ')}`;
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
