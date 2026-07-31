import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const extensionsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
// 주문수집/쿠팡/소싱 확장을 kiditem-os 하나로 합치면서 도메인별 사본이
// 사라졌다. 정본은 여전히 `shared/` 이고, 로드 가능한 확장 루트 안에 사본
// 하나만 둔다(확장 루트 밖 파일은 Chrome 이 싣지 못한다).
const adapterGroups = [
  {
    name: 'collection session',
    canonicalPath: path.join(extensionsRoot, 'shared/collection-session.js'),
    generatedPaths: [
      path.join(extensionsRoot, 'kiditem-os/background/collection-session.js'),
    ],
  },
  {
    name: 'environment context',
    canonicalPath: path.join(extensionsRoot, 'shared/environment-context.js'),
    generatedPaths: [
      path.join(extensionsRoot, 'kiditem-os/background/environment-context.js'),
    ],
  },
];

if (process.argv.includes('--check')) {
  let drifted = false;
  for (const group of adapterGroups) {
    const canonical = await fs.readFile(group.canonicalPath);
    for (const generatedPath of group.generatedPaths) {
      let generated;
      try {
        generated = await fs.readFile(generatedPath);
      } catch {
        generated = null;
      }
      if (!generated || !generated.equals(canonical)) {
        console.error(
          `Generated ${group.name} adapter is out of sync: ${path.relative(
            extensionsRoot,
            generatedPath,
          )}`,
        );
        drifted = true;
      }
    }
  }
  if (drifted) process.exitCode = 1;
} else {
  await Promise.all(
    adapterGroups.flatMap((group) =>
      group.generatedPaths.map(async (generatedPath) => {
        const canonical = await fs.readFile(group.canonicalPath);
        await fs.mkdir(path.dirname(generatedPath), { recursive: true });
        await fs.writeFile(generatedPath, canonical);
      }),
    ),
  );
}
