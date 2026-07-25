import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const extensionsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const adapterGroups = [
  {
    name: 'collection session',
    canonicalPath: path.join(extensionsRoot, 'shared/collection-session.js'),
    generatedPaths: [
      path.join(
        extensionsRoot,
        'coupang-ads-scraper/background/collection-session.js',
      ),
      path.join(extensionsRoot, 'product-scraper/collection-session.js'),
      path.join(extensionsRoot, 'order-collector/background/collection-session.js'),
    ],
  },
  {
    name: 'environment context',
    canonicalPath: path.join(extensionsRoot, 'shared/environment-context.js'),
    generatedPaths: [
      path.join(
        extensionsRoot,
        'coupang-ads-scraper/background/environment-context.js',
      ),
      path.join(extensionsRoot, 'product-scraper/environment-context.js'),
      path.join(
        extensionsRoot,
        'order-collector/background/environment-context.js',
      ),
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
