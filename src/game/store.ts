import { loadSave, localStorageAdapter, memoryStorage, newSave, writeSave, type SaveData, type SaveStorage } from '../meta/save';
import { ACCESSORY_IDS } from '../data/accessories';
import { recoverInterruptedRun, type SettlementSummary } from '../meta/settlement';
import { syncCostumeUnlocks } from '../meta/costume';

/**
 * 검토용 미리보기: 주소 끝에 ?preview=forge(#forge)를 붙이면 깡깡이·나비 구출, 액세서리 설계도·코스튬 도안 일부(TEMP 우회), 재료 보유 상태의 임시 저장으로 시작한다.
 * Ch 2(깡깡이 구출)가 아직 없어서 대장간을 확인할 다른 방법이 없기 때문이다. 실제 저장과 분리되며 새로고침하면 사라진다.
 */
const previewMode = (() => {
  try {
    // 게시된 미리보기 페이지는 주소의 #만 전달되므로 #forge도 받는다
    if (location.hash === '#forge') return 'forge';
    return new URLSearchParams(location.search).get('preview');
  } catch { return null; }
})();

function forgePreviewSave(): SaveData {
  const s = newSave();
  s.rescued = ['kosyot', 'kangkang'];
  s.clearedChapters = [1];
  s.hardUnlocked = [1];
  s.currencies.nyangJelly = 120;
  s.materials = {
    softJelly: 12, wornLeather: 6, oldYarn: 15, hardJelly: 250, glossyLeather: 1, goldenFurball: 1,
    fishboneShard: 10, smallStone: 5, smoothStone: 40,
    // 보호구 확인용: 누빔모자·누빔조끼 제작분 + 강화재 + 유니크 특별 재료
    oldCloth: 10, fluffyMarshmallow: 20, oldSweater: 15, cloudCottonCandy: 120, cozyBlanketPiece: 1, angoraSweater: 1,
    // 액세서리 확인용(TEMP 테스트 우회): 햇살 목걸이·반지, 달빛 반지·부적 제작분 + 강화재 + 유니크 특별 재료
    fadedBell: 7, fragrantCatnip: 5, ribbonPiece: 8, smallLink: 3, oldSilverRing: 6, stickySlimeGlue: 2, oldCharmPiece: 5,
    sunDust: 80, moonDew: 80, flowerKnot: 1, auroraPearl: 1,
  };
  // [TEMP 테스트 우회] 나비(Ch 6)와 액세서리 설계도는 정상 진행으로 아직 얻을 수 없어 미리보기 저장에서만 연다
  s.rescued.push('nabi');
  s.accessoryBlueprints = [...ACCESSORY_IDS];
  // 코스튬: 새싹 도안은 정상 조건(Ch 1 클리어)으로 받는다. 파자마는 옷장 첫 방문 때 정상 흐름(나비 첫 대화)으로 받는다.
  syncCostumeUnlocks(s);
  // [TEMP 테스트 우회] 삼색이(Ch 3)·얼룩이(Ch 8) 미구현이라 요리사·탐험가 도안을 미리보기에서만 연다. 별빛 영웅(Ch 15)은 미해금 상태 확인용으로 둔다.
  s.costumeBlueprints.push('chef', 'explorer');
  // 새싹·요리사 제작분(제작가능 확인), 탐험가는 일부러 모자라게(재료부족 확인)
  Object.assign(s.materials, { oldCloth: 10 + 12 + 15, ribbonPiece: 8 + 5, freshSprout: 3, cleanApron: 1, explorerCloth: 1 });
  return s;
}

const storage: SaveStorage = previewMode === 'forge' ? memoryStorage() : localStorageAdapter;

const initialSave = previewMode === 'forge' ? forgePreviewSave() : loadSave(storage);
// 지난 판이 앱 종료 등으로 정산되지 않았다면 주운 것만 중도 종료로 정산하고 캠프에서 시작한다
const recovered = recoverInterruptedRun(initialSave);
if (recovered) writeSave(storage, initialSave);

/** 화면 사이에서 공유하는 영구 저장 상태 */
export const store = {
  preview: previewMode === 'forge' ? 'forge' as const : null,
  save: initialSave as SaveData,
  /** 이번 실행에서 복구 정산한 중도 종료 판(캠프 화면 안내용) */
  recovered: recovered as SettlementSummary | null,
  persist(): void { writeSave(storage, this.save); },
  reset(): void {
    storage.clear();
    this.save = this.preview === 'forge' ? forgePreviewSave() : loadSave(storage);
  },
};
