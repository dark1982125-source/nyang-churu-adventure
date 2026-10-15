// 측정 실행용(테스트 아님): npx vite-node tests/measure.run.ts [시드 수] [rare|norare] [survival|attack]
import { measureRun, summarize } from './metrics';
import { TUNING } from '../src/config/tuning';
const argv = (globalThis as { process?: { argv: string[] } }).process?.argv ?? [];
const n = Number(argv[2] ?? 20);
if (argv[3] === 'norare') {
  // 희귀 스킬 없는 빌드: 유니크·전설 등급이 나오지 않게(측정용, 게임 규칙은 그대로)
  const L = TUNING.luck as Record<string, number>;
  L.baseUniqueChance = 0; L.baseLegendChance = 0; L.uniquePerLuck = 0; L.legendPerLuck = 0;
}
// 선택 방식: 기본은 생존형(회복·방어 패시브 우선), argv[4]=attack이면 예전 공격형(전용 기술 → 기본 공격 우선)
const survival = argv[4] !== 'attack';
const runs = Array.from({ length: n }, (_, i) => measureRun(i + 1, undefined, undefined, undefined, survival));
const s = summarize(runs);
console.log(JSON.stringify({ ...s, waves: undefined }));
s.waves.forEach((w, i) => console.log(`wave${i + 1}`, JSON.stringify(w)));
console.log('outcomes', runs.map((r) => `${r.seed}:${r.outcome[0]}${r.time}${r.death ? '@' + r.death : ''}`).join(' '));
