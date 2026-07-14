import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const extensionsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const canonicalPath = path.join(extensionsRoot, 'shared/collection-session.js');
const generatedPaths = [
  path.join(
    extensionsRoot,
    'coupang-ads-scraper/background/collection-session.js',
  ),
  path.join(extensionsRoot, 'product-scraper/collection-session.js'),
  path.join(extensionsRoot, 'order-collector/background/collection-session.js'),
];

const canonical = await fs.readFile(canonicalPath);

if (process.argv.includes('--check')) {
  let drifted = false;
  for (const generatedPath of generatedPaths) {
    let generated;
    try {
      generated = await fs.readFile(generatedPath);
    } catch {
      generated = null;
    }
    if (!generated || !generated.equals(canonical)) {
      console.error(
        `Generated collection session adapter is out of sync: ${path.relative(
          extensionsRoot,
          generatedPath,
        )}`,
      );
      drifted = true;
    }
  }
  if (drifted) process.exitCode = 1;
} else {
  await Promise.all(
    generatedPaths.map(async (generatedPath) => {
      await fs.mkdir(path.dirname(generatedPath), { recursive: true });
      await fs.writeFile(generatedPath, canonical);
    }),
  );
}

