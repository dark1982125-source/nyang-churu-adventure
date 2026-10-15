import type { CurrencyId } from './items';
import type { UltimateId } from './skills';
import type { CompanionId } from './companions';

/**
 * 영구 성장 노드. 구체 트리는 미정이라 저장/조건/가격 구조를 검증하기 위한
 * 제한된 테스트 노드만 둔다(전부 TEMP). 최종 트리가 아니다.
 */
export interface UpgradeNode {
  id: string;
  name: string;
  currency: CurrencyId;
  /** 레벨별 가격 */
  cost: (level: number) => number;
  maxLevel: number;
  requires?: string[];
  desc: string;
  /** 궁극기 해금 노드 */
  unlocksUltimate?: UltimateId;
  /** 이 동료를 구출해야 살 수 있다 */
  requiresRescue?: CompanionId;
}

const ultNode = (id: UltimateId, name: string): UpgradeNode => ({
  id: `ult_${id}`, name: `[테스트] ${name} 해금`, currency: 'goldenCatnip',
  cost: () => 2, maxLevel: 1, desc: '궁극기 해금 테스트 노드 (TEMP)', unlocksUltimate: id,
});

export const UPGRADE_NODES: UpgradeNode[] = [
  // 냥젤리: 호냥이 기본 스탯·행운
  { id: 'hp', name: '[테스트] 최대 체력', currency: 'nyangJelly', cost: (l) => 10 + l * 6, maxLevel: 5, desc: '최대 HP +10 (TEMP)' },
  { id: 'atk', name: '[테스트] 공격력', currency: 'nyangJelly', cost: (l) => 12 + l * 8, maxLevel: 5, desc: '모든 피해 +6% (TEMP)' },
  { id: 'def', name: '[테스트] 방어력', currency: 'nyangJelly', cost: (l) => 12 + l * 8, maxLevel: 5, desc: '영구 방어력 +5 (TEMP)' },
  { id: 'luck', name: '[테스트] 기본 행운', currency: 'nyangJelly', cost: (l) => 15 + l * 10, maxLevel: 3, desc: '영구 기본 행운 +1 (TEMP)' },
  // 황금 개다래: 패시브·궁극기
  { id: 'ultSlot', name: '[테스트] 궁극기 사용', currency: 'goldenCatnip', cost: () => 1, maxLevel: 1, desc: '궁극기 게이지 활성화 (TEMP)' },
  { ...ultNode('atkArea', '공격·광역'), requires: ['ultSlot'] },
  { ...ultNode('atkSingle', '공격·단일'), requires: ['ultSlot'] },
  { ...ultNode('defSlow', '방어·감속'), requires: ['ultSlot'] },
  { ...ultNode('defReflect', '방어·튕겨내기'), requires: ['ultSlot'] },
  { ...ultNode('healHero', '회복·호냥이'), requires: ['ultSlot'] },
  { ...ultNode('healCamp', '회복·캠프'), requires: ['ultSlot'] },
  // 골골기어: 캠프
  { id: 'campMental', name: '[테스트] 캠프 멘탈', currency: 'golgolGear', cost: (l) => 3 + l * 2, maxLevel: 5, desc: '캠프 최대 멘탈 +15 (TEMP)' },
  // 확정: 골골기어 영구 스킬트리 진화로 '코숏의 만능 처방약' 해금. 해금 레벨·가격·위치는 미정이라 단일 테스트 노드.
  {
    id: 'panacea', name: '[테스트] 코숏 만능 처방약 진화', currency: 'golgolGear', cost: () => 8, maxLevel: 1,
    requiresRescue: 'kosyot', desc: '독·화상·출혈·빙결·기술 감속 동시 해제(HP 없음). 해금 조건·쿨타임 TEMP',
  },
];

export const NODE_BY_ID: Record<string, UpgradeNode> = Object.fromEntries(UPGRADE_NODES.map((n) => [n.id, n]));
