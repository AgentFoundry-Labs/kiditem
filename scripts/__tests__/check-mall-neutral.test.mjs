import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ALLOWLIST, collectMallNeutralFindings, mallNameHits } from '../check-mall-neutral.mjs';

test('counts a channel name only in code: identifiers and strings, not comments or unrelated words', () => {
  assert.deepEqual(mallNameHits([
    '// Coupang Wing is one mall',
    '/** the WING form */',
    'const showing = following;',
    'const wingProduct = 1;',
    "const key = 'coupang';",
    'const url = `https://wing.coupang.com/x`; // trailing',
    'function isRocket() {}',
  ].join('\n')), [4, 5, 6, 7]);
});

test('fails an unlisted file with a channel name and a stale allowlist entry, and passes a neutral tree', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'mall-neutral-'));
  const domain = path.join(root, 'apps/server/src/channels/domain/registration');
  mkdirSync(domain, { recursive: true });
  writeFileSync(path.join(domain, 'neutral.ts'), '// mentions Wing only in prose\nexport const kind = "register";\n');
  writeFileSync(path.join(domain, 'neutral.spec.ts'), "it('uses coupang as a fixture key', () => {});\n");
  const findings = collectMallNeutralFindings(root);
  assert.ok(findings.every((finding) => finding.endsWith('remove the entry')), 'a neutral tree only reports stale entries');
  assert.equal(findings.length, ALLOWLIST.size);

  writeFileSync(path.join(domain, 'leaky.ts'), "export const channel = 'coupang';\n");
  assert.ok(collectMallNeutralFindings(root).some((finding) =>
    finding === 'apps/server/src/channels/domain/registration/leaky.ts:1 names a channel outside a channel adapter'));
});

test('every allowlist entry carries a reason', () => {
  for (const [file, reason] of ALLOWLIST) assert.ok(reason.trim().length > 10, file);
});
