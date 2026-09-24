import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  codeMessageCount,
  englishLiteralCount,
  isSource,
  literalBaselineFailures,
  readLiteralBaseline,
  extensionCodeViolations,
  rawRenderViolations,
  renderBaselineFailure,
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

test('raw rendering through optional chains, nested error objects and status rows is caught', () => {
  const hits = rawRenderViolations([{ file: 'app/(x)/y.tsx', source: [
    '<p>{taobaoCollection.error.message}</p>',
    '<p>{source.data?.latestAttempt?.errorMessage}</p>',
    '<span>{attempt.errorMessage ?? attempt.errorCode ?? "수집 실패"}</span>',
    'const text = `실패: ${row.errorCode ?? \'UNKNOWN\'}`;',
  ].join('\n') }]);
  assert.equal(hits.length, 4);
});

test('presenter output, non-error detail fields and branching on a message are not raw rendering', () => {
  assert.deepEqual(rawRenderViolations([{ file: 'app/(x)/ok.tsx', source: [
    "<p>{attemptFailureText(attempt, 'coupang_reviews')}</p>",
    "<p>{operatorReason(state.errorMessage, '실패')}</p>",
    "toast.error(friendlyError(error, '저장하지 못했습니다.'));",
    '<p>{check.detail}</p>',
    "if (error.message === 'x') return null;",
  ].join('\n') }]), []);
});

test('nested-paren toasts and JSX `instanceof Error ? x.message` are raw rendering too', () => {
  const hits = rawRenderViolations([{ file: 'app/(x)/nested.tsx', source: [
    "toast.error(isApiError(e) ? e.message : e instanceof Error ? e.message : '실패');",
    "toast.error(describe(err), { description: err instanceof Error ? err.message : '' });",
    "<p>{saveError instanceof Error ? saveError.message : '저장 실패'}</p>",
  ].join('\n') }]);
  assert.equal(hits.length, 3);
});

test('the raw-render count is a ceiling: it may shrink, never grow', () => {
  assert.deepEqual(renderBaselineFailure(79, 79), null);
  assert.deepEqual(renderBaselineFailure(70, 79), null);
  assert.match(renderBaselineFailure(80, 79), /raw error rendering grew: 80 > baseline 79/);
});

test('code-spelled exception messages are counted separately from English sentences', () => {
  const entries = [{ file: 'x.ts', source: [
    "throw new ConflictException('ATTEMPT_FENCE_LOST');",
    "throw new BadRequestException('Order collection expired.');",
    "throw new Error('CATALOG_TOKEN_MISMATCH');",
    "throw new NotFoundException('상품을 찾을 수 없습니다.');",
    "throw new ConflictException(`ATTEMPT_${x}`);",
    "throw new ConflictException('ok');",
  ].join('\n') }];
  assert.equal(codeMessageCount(entries), 2);
  assert.equal(englishLiteralCount(entries), 1);
  assert.equal(codeMessageCount([{ file: 'y.ts', source: "throw new ConflictException('ATTEMPT_FENCE_LOST');" }]), 1);
});

test('a registered code spelled as an exception message still counts: the shape itself must migrate', () => {
  assert.equal(codeMessageCount([{ file: 'z.ts', source: "throw new NotFoundException('NOT_FOUND');" }]), 1);
});

test('the literal baseline reads key=value lines and the old one-integer file as english', () => {
  assert.deepEqual(readLiteralBaseline('english=735\ncode-message=650\n'), { english: 735, codeMessage: 650 });
  assert.deepEqual(readLiteralBaseline('747\n'), { english: 747, codeMessage: 0 });
  assert.throws(() => readLiteralBaseline('english=abc\n'));
  assert.throws(() => readLiteralBaseline('abc'));
});

test('either literal count growing by one fails; shrinking only notes', () => {
  const baseline = { english: 10, codeMessage: 20 };
  assert.deepEqual(literalBaselineFailures({ english: 10, codeMessage: 20 }, baseline), []);
  assert.deepEqual(literalBaselineFailures({ english: 9, codeMessage: 19 }, baseline), []);
  assert.match(literalBaselineFailures({ english: 11, codeMessage: 20 }, baseline)[0], /English exception literals grew: 11 > baseline 10/);
  assert.match(literalBaselineFailures({ english: 10, codeMessage: 21 }, baseline)[0], /code-spelled exception messages grew: 21 > baseline 20/);
});

test('server test helpers are test code, not source', () => {
  assert.equal(isSource('/r/apps/server/src/test-helpers/pg.ts'), false);
  assert.equal(isSource('/r/apps/server/src/orders/order.service.ts'), true);
  assert.equal(isSource('/r/apps/server/src/orders/order.service.spec.ts'), false);
});
