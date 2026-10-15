import Phaser from 'phaser';
import type { LogEntry, RunResult } from '../../sim/battle';
import type { SettlementSummary } from '../../meta/settlement';
import { LOOT_NAMES, MATERIAL_NAMES, type LootId } from '../../data/items';
import { WEAPON_DEFS } from '../../data/weapons';
import { ARMOR_DEFS } from '../../data/armor';
import { COMPANIONS, type CompanionId } from '../../data/companions';
import { button, COLORS, text } from '../ui';

/** 판 정산 결과. 정산은 BattleScene에서 판 종료 즉시 저장까지 끝난 상태로 들어온다. */
export class ResultScene extends Phaser.Scene {
  constructor() { super('result'); }

  create(data: { result: RunResult; summary: SettlementSummary; log: LogEntry[]; resumed?: boolean }): void {
    const { result, summary, log } = data;
    const win = result.outcome === 'victory';
    this.cameras.main.setBackgroundColor(win ? 0x2d3b4f : 0x3a2533);

    text(this, 40, 30, win ? 'Ch 1 클리어!' : result.defeatCause === 'quit' ? '중도 종료' : '패배…', 34, win ? '#ffe08a' : '#ffb3b3');
    const cause = result.defeatCause === 'camp' ? '캠프 멘탈이 바닥났습니다.' : result.defeatCause === 'hero' ? '호냥이가 쓰러졌습니다.' : '판을 나갔습니다.';
    if (!win) text(this, 40, 78, `${cause} 주운 재화·재료는 보존되고, 새 동료 구출은 확정되지 않았습니다.`, 15, COLORS.dim);
    if (summary.newlyRescued) {
      const name = COMPANIONS[summary.newlyRescued as CompanionId].name;
      text(this, 40, 78, `${name} 정식 합류! 다음 출격부터 캣닢 캡슐 지원과 캠프 선택지가 열립니다.`, 16, '#bff7ff');
    }

    const lootLines = (Object.entries(result.loot) as [LootId, number][]).filter(([, n]) => n > 0).map(([id, n]) => `${LOOT_NAMES[id]} +${n}`);
    text(this, 40, 120, '획득 (영구 보존)', 18, '#ffd9a0');
    // 실제로 주운 드롭만 정산된다. 특별 재료·설계도는 클리어 보상.
    const extra = [
      ...summary.specials.map((m) => `★ ${MATERIAL_NAMES[m]} +1 (클리어 보상)`),
      ...summary.blueprints.map((id) => `📜 ${WEAPON_DEFS[id].name} 설계도`),
      ...(summary.armorBlueprints ?? []).map((id) => `📜 ${ARMOR_DEFS[id].name} 설계도`),
    ];
    text(this, 40, 150, [...(lootLines.length ? lootLines : ['없음']), ...extra].join('\n'), 14);

    const passes = log.filter((l) => l.type === 'pass').length;
    const missed = log.filter((l) => l.type === 'missedPickup').length;
    const oob = log.filter((l) => l.type === 'outOfBounds').length;
    text(this, 420, 120, '판 기록', 18, '#ffd9a0');
    text(this, 420, 150, [
      `시간 ${result.time.toFixed(0)}초 · 호냥이 Lv.${result.heroLevel}`,
      `처치 ${result.kills.normal + result.kills.finale + result.kills.children} (잡몹 ${result.kills.normal} · 엘리트/보스 ${result.kills.finale} · 분열 ${result.kills.children})`,
      `호냥이를 지나친 적 ${passes} · 화면 밖 이탈 ${oob}`,
      result.outcome === 'victory'
        ? `클리어 자동 회수 ${log.filter((l) => l.type === 'autoCollect' && l.detail === 'victory').reduce((n, l) => n + (l.value ?? 0), 0)}개 · 전환 회수 ${log.filter((l) => l.type === 'autoCollect' && l.detail === 'transition').reduce((n, l) => n + (l.value ?? 0), 0)}개`
        : `놓친 드롭 ${missed} (주운 것만 정산)`,
      `큰 돌 파괴 ${log.filter((l) => l.type === 'rockBroken').length} · 캠프 명중 ${log.filter((l) => l.type === 'rockHitCamp').length}`,
      `캠프 조준 요격 ${log.filter((l) => l.type === 'shotBroken').length} · 캠프 명중 ${log.filter((l) => l.type === 'shotHitCamp').length}`,
      `상태이상 ${log.filter((l) => l.type === 'status').length} · 코숏 약 해제 ${log.filter((l) => l.type === 'cure' && (l.value ?? 0) > 0).length}`,
      `회피 ${log.filter((l) => l.type === 'evade').length} · 치명타 ${log.filter((l) => l.type === 'crit').length}`,
      '',
      '임시 레벨·기술·패시브·다시냥 방울은 판 종료로 초기화됨',
      summary.duplicate ? '※ 이미 정산된 판(중복 지급 없음)' : '',
      data.resumed ? '※ 구출 중 종료된 판을 이어서 마무리(전투 재개 없음, 기록은 확정 시점 기준)' : '',
      summary.firstClear ? '최초 클리어 · 고난도 Ch 1 해금(고난도 미구현)' : '',
    ].filter(Boolean).join('\n'), 14);

    button(this, 40, 440, 260, 56, '캠프로 돌아가기', () => this.scene.start('camp'), { size: 18, color: 0x5b4f86 });
    button(this, 320, 440, 200, 56, '바로 재도전', () => this.scene.start('battle'), { size: 18, color: 0xc0623c });
  }
}
