import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// extensions/src/ 의 TypeScript 런타임을 서비스워커가 importScripts 로 싣는 IIFE
// 하나로 묶는다. 번들은 커밋하고, `--check` 는 커밋된 번들이 소스에서 다시 만든
// 결과와 바이트까지 같은지 본다(CI). 그래서 출력은 결정적이어야 한다 — 소스맵·
// 빌드 시각·절대 경로를 넣지 않는다.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputPath = path.join(repoRoot, 'extensions/kiditem-os/runtime/kiditem-runtime.js');
const result = await build({
  absWorkingDir: repoRoot,
  entryPoints: ['extensions/src/index.ts'],
  tsconfig: 'extensions/tsconfig.json',
  bundle: true,
  format: 'iife',
  // 옛 JS 모듈과 한 전역 스코프를 나눠 쓰므로 번들이 만드는 전역은 이것 하나다.
  globalName: 'KidItemRuntime',
  target: ['chrome120'],
  platform: 'browser',
  sourcemap: false,
  legalComments: 'none',
  write: false,
});
const generated = result.outputFiles[0].contents;

if (process.argv.includes('--check')) {
  const current = await fs.readFile(outputPath).catch(() => null);
  if (!current || !current.equals(generated)) {
    console.error(
      'extensions/kiditem-os/runtime/kiditem-runtime.js is out of sync with extensions/src — run `npm run extension:build`.',
    );
    process.exitCode = 1;
  }
} else {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, generated);
}
