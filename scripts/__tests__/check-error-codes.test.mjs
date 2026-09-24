import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  englishLiteralCount,
  extensionCodeViolations,
  rawRenderViolations,
  readBaseline,
  readRegistryCodes,
  registeredCodeViolations,
} from '../check-error-codes.mjs';

const { codes, aliases } = readRegistryCodes();

test('reads the registry keys and the extension alias table from the TypeScript source', () => {
  assert.ok(codes.has('ATTEMPT_EXPIRED'));
  assert.ok(codes.has('VALIDATION_FAILED'));
  assert.equal(aliases.get('login_required'), 'MALL_LOGIN_REQUIRED');
  assert.ok(codes.size > 30);
});

test('a Kiditem error constructed with an unregistered code fails; a registered one passes', () => {
  const ok = [{ file: 'a.ts', source: "throw new KiditemNotFoundError('NOT_FOUND', { details: { id } });" }];
  const bad = [{ file: 'b.ts', source: "throw new KiditemConflictError('CHANNELS_MADE_UP_CODE');" }];
  assert.deepEqual(registeredCodeViolations(ok, codes), []);
  assert.match(registeredCodeViolations(bad, codes)[0], /CHANNELS_MADE_UP_CODE is not registered/);
});

test('counts English exception and Error literals but not Korean sentences or bare codes', () => {
  const entries = [{ file: 'x.ts', source: [
    "throw new BadRequestException('Order collection expired.');",
    "throw new ConflictException('ATTEMPT_IN_PROGRESS');",
    "throw new NotFoundException('상품을 찾을 수 없습니다.');",
    "throw new Error('Catalog attempt token mismatch');",
    "throw new Error(`dynamic ${x}`);",
  ].join('\n') }];
  assert.equal(englishLiteralCount(entries), 2);
  assert.equal(readBaseline('12\n'), 12);
  assert.throws(() => readBaseline('abc'));
});

test('web code that renders a raw message fails unless the file is an allowed presenter', () => {
  const bad = [{ file: 'app/(orders)/x.tsx', source: "toast.error(error.message); <p>{row.errorMessage}</p>; label = errorCode ?? 'UNKNOWN';" }];
  const hits = rawRenderViolations(bad);
  assert.equal(hits.length, 3);
  assert.deepEqual(rawRenderViolations([{ file: 'lib/api-error.ts', source: 'return error.message;' }]), []);
  assert.deepEqual(rawRenderViolations([{ file: 'app/y.tsx', source: 'toast.error(friendlyError(error));' }]), []);
});

test('extension code literals resolve through the registry or the alias table', () => {
  const entries = [{ file: 'worker.js', source: "code: 'login_required'; code: 'COLLECTION_CANCELLED'; code: 'sellpia_made_up';" }];
  const hits = extensionCodeViolations(entries, codes, aliases);
  assert.equal(hits.length, 1);
  assert.match(hits[0], /sellpia_made_up/);
});
