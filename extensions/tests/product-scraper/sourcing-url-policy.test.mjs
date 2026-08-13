import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const policyPath = path.resolve('extensions/kiditem-os/background/sourcing/url-policy.js');

function loadPolicy() {
  const context = vm.createContext({ URL });
  vm.runInContext(readFileSync(policyPath, 'utf8'), context, { filename: policyPath });
  return context.KiditemSourcingUrlPolicy;
}

test('1688 상세 URL 정책은 허용된 HTTPS offer URL만 정규화한다', () => {
  const policy = loadPolicy();

  assert.equal(
    policy.parseAllowedSupplierUrl('https://detail.1688.com/offer/607635921546.html?spm=x#ignored'),
    'https://detail.1688.com/offer/607635921546.html?spm=x',
  );
  assert.equal(
    policy.parseAllowedSupplierUrl('https://m.1688.com/offer/607635921546.html'),
    'https://m.1688.com/offer/607635921546.html',
  );
});

test('1688 상세 URL 정책은 page-world가 주입한 내부·비허용 URL을 거부한다', () => {
  const policy = loadPolicy();

  for (const value of [
    'http://detail.1688.com/offer/607635921546.html',
    'https://localhost:3000/internal',
    'https://detail.1688.com.evil.test/offer/607635921546.html',
    'https://detail.1688.com:8443/offer/607635921546.html',
    'https://user:pass@detail.1688.com/offer/607635921546.html',
  ]) {
    assert.throws(() => policy.parseAllowedSupplierUrl(value), undefined, value);
  }
});
