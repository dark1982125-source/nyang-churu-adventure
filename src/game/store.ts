import { loadSave, localStorageAdapter, writeSave, type SaveData } from '../meta/save';

/** 화면 사이에서 공유하는 영구 저장 상태 */
export const store = {
  save: loadSave(localStorageAdapter) as SaveData,
  persist(): void { writeSave(localStorageAdapter, this.save); },
  reset(): void {
    localStorageAdapter.clear();
    this.save = loadSave(localStorageAdapter);
  },
};
