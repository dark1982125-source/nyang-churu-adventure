import { COSTUME_DEFS, COSTUME_IDS, FINAL_CHAPTER, STAR_THREAD_FIRST_CLEAR, type CostumeId, type CostumeUnlock } from '../data/costumes';
import type { SaveData } from './save';
import { workshopUnlocked } from './forge';

/**
 * 나비 옷장(코스튬-5벌-확정정리.md). 외형 전용이라 이 파일의 어떤 함수도 능력치를 바꾸지 않는다
 * (buildLoadout은 equipment.costume을 읽지 않는다).
 * - 도안 해금은 나비 이전에도 기록, 제작은 나비 구출 후.
 * - 제작 100% 성공, 냥젤리 비용 없음, 재료는 제작 1회분만 소모, 한 번 만들면 영구 보유.
 * - 파자마는 나비 첫 대화 때 도안 + 무료 제작 1회. 별빛 자수실은 최종 챕터 최초 클리어 때 3개 1회.
 * - 착용·해제는 캠프에서만(판 저널이 남아 있는 동안 거절).
 */

export function costumeUnlockMet(save: SaveData, u: CostumeUnlock): boolean {
  switch (u.kind) {
    case 'clearOrRescue': return save.clearedChapters.includes(u.chapter) || save.rescued.includes(u.companion);
    case 'rescue': return save.rescued.includes(u.companion);
    case 'nabiFirstTalk': return save.flags.nabiFirstTalk;
    case 'firstClear': return save.clearedChapters.includes(u.chapter);
  }
}

/**
 * 도안 해금·최초 보상 동기화. 정산 직후와 저장 불러오기 때 부른다(이미 조건을 채운 기존 저장도 도안을 받는다).
 * 여러 번 불러도 같은 결과(도안은 목록에 한 번, 별빛 자수실은 플래그로 한 번).
 */
export function syncCostumeUnlocks(save: SaveData): { blueprints: CostumeId[]; starThread: number } {
  const blueprints: CostumeId[] = [];
  for (const id of COSTUME_IDS) {
    if (!save.costumeBlueprints.includes(id) && costumeUnlockMet(save, COSTUME_DEFS[id].unlock)) {
      save.costumeBlueprints.push(id);
      blueprints.push(id);
    }
  }
  let starThread = 0;
  if (save.clearedChapters.includes(FINAL_CHAPTER) && !save.flags.starThreadGranted) {
    save.flags.starThreadGranted = true;
    save.materials.starEmbroideryThread = (save.materials.starEmbroideryThread ?? 0) + STAR_THREAD_FIRST_CLEAR;
    starThread = STAR_THREAD_FIRST_CLEAR;
  }
  return { blueprints, starThread };
}

/**
 * 나비 첫 대화(나비 구출 후 옷장을 처음 열 때). 파자마 도안 + 무료 제작 1회. 두 번째부터는 아무것도 주지 않는다.
 */
export function talkToNabi(save: SaveData): { first: boolean } {
  if (!workshopUnlocked(save) || save.flags.nabiFirstTalk) return { first: false };
  save.flags.nabiFirstTalk = true;
  syncCostumeUnlocks(save);
  return { first: true };
}

export type CostumeCraftCheck = 'ok' | 'workshopLocked' | 'noBlueprint' | 'owned' | 'materials' | 'freeUsed';

export function canCraftCostume(save: SaveData, id: CostumeId): CostumeCraftCheck {
  if (!workshopUnlocked(save)) return 'workshopLocked';
  if (!save.costumeBlueprints.includes(id)) return 'noBlueprint';
  if (save.costumes.includes(id)) return 'owned';
  if (!COSTUME_DEFS[id].craft.length) return hasCostumeMaterials(save, id) ? 'ok' : 'freeUsed';
  return hasCostumeMaterials(save, id) ? 'ok' : 'materials';
}

/** 제작(100% 성공). 재료 1회분 또는 무료 제작권만 쓰고 영구 보유로 기록한다. */
export function craftCostume(save: SaveData, id: CostumeId): CostumeCraftCheck {
  const c = canCraftCostume(save, id);
  if (c !== 'ok') return c;
  const def = COSTUME_DEFS[id];
  if (!def.craft.length) save.flags.pajamaFreeCraftUsed = true;
  for (const x of def.craft) save.materials[x.id] = (save.materials[x.id] ?? 0) - x.count;
  save.costumes.push(id);
  return 'ok';
}

export type CostumeState = '미해금' | '제작가능' | '재료부족' | '보유' | '착용중';

/** 제작 재료(또는 무료 제작권)를 갖췄는지. 나비 구출 여부와 무관하게 재료만 본다. */
export function hasCostumeMaterials(save: SaveData, id: CostumeId): boolean {
  const def = COSTUME_DEFS[id];
  if (!def.craft.length) return save.flags.nabiFirstTalk && !save.flags.pajamaFreeCraftUsed;
  return def.craft.every((c) => (save.materials[c.id] ?? 0) >= c.count);
}

/** 옷장 카드 상태. 도안은 나비 구출 전에도 기록되므로 상태는 재료 기준, 실제 제작은 canCraftCostume이 나비 구출을 확인한다. */
export function costumeState(save: SaveData, id: CostumeId): CostumeState {
  if (save.equipment.costume === id) return '착용중';
  if (save.costumes.includes(id)) return '보유';
  if (!save.costumeBlueprints.includes(id)) return '미해금';
  return hasCostumeMaterials(save, id) ? '제작가능' : '재료부족';
}

export type CostumeEquipCheck = 'ok' | 'notOwned' | 'notInCamp';

/** 판이 진행 중(판 저널이 남아 있음)이면 바꾸지 않는다: 캠프에서만 변경(확정). */
export function inCamp(save: SaveData): boolean {
  return save.activeRun === null;
}

/** 착용. null이면 '기본 모습'(해제). */
export function equipCostume(save: SaveData, id: CostumeId | null): CostumeEquipCheck {
  if (!inCamp(save)) return 'notInCamp';
  if (id !== null && !save.costumes.includes(id)) return 'notOwned';
  save.equipment.costume = id;
  return 'ok';
}
