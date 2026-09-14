import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const modelsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../prisma/models');

test('partial index predicates avoid IN lists that PostgreSQL rewrites and db push re-plans', () => {
  const offenders = readdirSync(modelsDir)
    .filter((name) => name.endsWith('.prisma'))
    .flatMap((name) => readFileSync(path.join(modelsDir, name), 'utf8')
      .split('\n')
      .flatMap((line, index) => (/where:\s*raw\(/.test(line) && /\bIN\s*\(/i.test(line) ? [`${name}:${index + 1}`] : [])));

  assert.deepEqual(offenders, [], 'write list predicates as = ANY (ARRAY[...]) so db push does not re-plan them');
});
