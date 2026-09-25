import { test } from 'node:test';
import assert from 'node:assert/strict';
import { violationsFor } from '../check-extension-runtime-layers.mjs';

test('core 는 core 와 패키지만 import 한다', () => {
  assert.deepEqual(violationsFor('core/runner.ts', "import { x } from './browser';\nimport { z } from 'zod';"), []);
  assert.equal(violationsFor('core/runner.ts', "import { c } from '../collectors/index';").length, 1);
});

test('collectors 는 core 의 site-caller·errors 만 쓰고 operation-client 는 못 부른다', () => {
  assert.deepEqual(violationsFor('collectors/test.echo/index.ts', "import type { SiteCaller } from '../../core/site-caller';\nimport { RuntimeError } from '../../core/errors';"), []);
  assert.match(violationsFor('collectors/test.echo/index.ts', "import { x } from '../../core/operation-client';")[0], /runner/);
  assert.equal(violationsFor('collectors/a/index.ts', "import { s } from '../../sites/wing/index';").length, 1);
});

test('sites 는 core 의 site-caller·errors 와 sites 만 쓴다', () => {
  assert.deepEqual(violationsFor('sites/wing/index.ts', "import { delayUntilNext } from '../../core/site-caller';\nimport { other } from '../ad-center/index';"), []);
  assert.equal(violationsFor('sites/wing/index.ts', "import { c } from '../../collectors/index';").length, 1);
  assert.equal(violationsFor('sites/wing/index.ts', "import { b } from '../../core/browser';").length, 1);
});

test('entry 는 무엇이든 import 하지만 옛 전역은 legacy-bridge 만 참조한다', () => {
  assert.deepEqual(violationsFor('entry/index.ts', "import { run } from '../core/runner';\nimport { c } from '../collectors/index';"), []);
  assert.deepEqual(violationsFor('entry/legacy-bridge.ts', 'declare const KidItemDomains: unknown;'), []);
  assert.match(violationsFor('entry/index.ts', 'KidItemDomains.register({});')[0], /legacy-bridge/);
  assert.match(violationsFor('core/api.ts', 'sourceOwnerEnvironmentContext.authedFetch();')[0], /legacy-bridge/);
});

test('주석 속 옛 전역 언급과 번들 자신의 전역 KidItemRuntime 은 위반이 아니다', () => {
  assert.deepEqual(violationsFor('entry/actions.ts', "// 옛 `KidItemDomains.externalActions` 에 같은 이름으로 등록된다\nexport const A = 1;"), []);
  assert.deepEqual(violationsFor('core/x.ts', '/* KidItemCollectionWindow 를 대체한다 */ export const B = 2;'), []);
  assert.deepEqual(violationsFor('index.ts', 'export const name = KidItemRuntime;'), []);
  assert.equal(violationsFor('core/x.ts', "const s = 'http://x'; KidItemDomains.register();").length, 1);
});

test('import.meta 는 어느 층에서도 금지, 스펙 파일은 옛 전역 언급이 허용된다', () => {
  assert.match(violationsFor('core/x.ts', 'const u = import.meta.url;')[0], /import\.meta/);
  assert.deepEqual(violationsFor('entry/index.spec.ts', "vi.stubGlobal('KidItemDomains', {});"), []);
});
