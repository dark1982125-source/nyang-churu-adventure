// 측정 실행용(테스트 아님): npx vite-node tests/measure.run.ts [시드 수]
import { measureRun, summarize } from './metrics';
const n = Number((globalThis as { process?: { argv: string[] } }).process?.argv[2] ?? 30);
const runs = Array.from({ length: n }, (_, i) => measureRun(i + 1, undefined, 1500));
const s = summarize(runs);
console.log(JSON.stringify({ ...s, waves: undefined }));
s.waves.forEach((w, i) => console.log(`wave${i + 1}`, JSON.stringify(w)));
console.log('outcomes', runs.map((r) => `${r.seed}:${r.outcome[0]}${r.time}`).join(' '));
