import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readOperatorErrorSource, renderOperatorErrorModule } from '../generate-operator-error.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GENERATOR = path.join(ROOT, 'scripts/generate-operator-error.mjs');
const TARGET = path.join(ROOT, 'extensions/kiditem-os/shared/operator-error.js');

function load(source = readOperatorErrorSource()) {
  const self = {};
  new Function('self', renderOperatorErrorModule(source))(self);
  return self.KidItemOperatorError;
}

/**
 * 확장은 빌드가 없어 오류 레지스트리(ADR-0023)의 사본을 커밋한다. 사본이 원본과 갈라지면 확장만
 * 옛 문장·옛 alias로 말하게 되므로, 만드는 쪽과 막는 쪽을 함께 지킨다.
 */
test('원본에서 코드·문장·alias·원천 이름을 값으로 읽는다', () => {
  const source = readOperatorErrorSource();
  assert.equal(source.definitions.ATTEMPT_EXPIRED.text, '수집 시도가 만료됐습니다. 다시 시작해 주세요.');
  assert.equal(source.definitions.ATTEMPT_EXPIRED.kind, 'expired');
  assert.equal(source.definitions.CHANNELS_MALL_UNSUPPORTED.httpStatus, 501);
  assert.equal(source.definitions.ATTEMPT_EXPIRED.retryable, true);
  assert.equal(source.aliases.login_required, 'MALL_LOGIN_REQUIRED');
  assert.equal(source.sourceLabels.sellpia_inventory, '셀피아 재고 수집');
  assert.ok(Object.keys(source.definitions).length > 50);
});

test('생성물은 확장 전역 하나를 만들고 shared와 같은 규칙으로 문장을 낸다', () => {
  const errors = load();
  assert.equal(errors.resolveErrorCode('login_required'), 'MALL_LOGIN_REQUIRED');
  assert.equal(errors.resolveErrorCode('attempt-expired'), 'ATTEMPT_EXPIRED');
  assert.equal(errors.resolveErrorCode('made_up'), null);
  assert.equal(errors.operatorErrorText({ code: 'COLLECTION_CANCELLED' }), '수집이 중단됐습니다.');
  assert.equal(
    errors.operatorErrorText({ code: 'sellpia_made_up', source: 'sellpia_inventory' }),
    '셀피아 재고 수집 작업이 실패했습니다. 다시 시도해 주세요.',
  );
  assert.equal(errors.sourceLabel('unknown_source'), '수집');
  assert.ok(Object.isFrozen(errors.ERROR_DEFINITIONS));
});

test('커밋된 생성물이 지금 원본과 같다', () => {
  assert.equal(readFileSync(TARGET, 'utf8'), renderOperatorErrorModule(readOperatorErrorSource()));
});

test('--check는 생성물이 원본과 다르면 실패하고, --out은 임시 파일로 뽑는다', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'operator-error-'));
  try {
    const out = path.join(dir, 'operator-error.js');
    execFileSync(process.execPath, [GENERATOR, '--out', out]);
    assert.equal(readFileSync(out, 'utf8'), readFileSync(TARGET, 'utf8'));
    assert.doesNotThrow(() => execFileSync(process.execPath, [GENERATOR, '--check'], { stdio: 'pipe' }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
