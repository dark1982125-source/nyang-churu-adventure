import { defineConfig } from 'vite';

// GitHub Pages 하위 경로에서도 열리도록 상대 경로로 빌드한다.
export default defineConfig({
  base: './',
  // 옷장 참고 시안 썸네일(각 60KB 남짓)은 JS에 인라인해 단일 파일 미리보기에서도 보이게 한다.
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2000, assetsInlineLimit: 100 * 1024 },
});
