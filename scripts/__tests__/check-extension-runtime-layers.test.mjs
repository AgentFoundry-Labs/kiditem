import { test } from 'node:test';
import assert from 'node:assert/strict';
import { topLevelViolations, violationsFor } from '../check-extension-runtime-layers.mjs';

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

test('층 파일의 상대 import 가 extensions/src 밖이나 층 밖으로 풀리면 위반이다', () => {
  assert.equal(violationsFor('core/runner.ts', "import { x } from '../../kiditem-os/background/worker-globals.js';").length, 1);
  assert.equal(violationsFor('collectors/a/index.ts', "import { x } from '../../index';").length, 1);
  assert.equal(violationsFor('sites/wing/index.ts', "import { x } from '../../util/format';").length, 1);
  assert.equal(violationsFor('entry/index.ts', "import { x } from '../../kiditem-os/background/x.js';").length, 1);
  // 루트 index.ts 는 entry 와 같다: 층은 무엇이든, src 밖은 금지.
  assert.deepEqual(violationsFor('index.ts', "import { installEntry } from './entry';\nimport { k } from './collectors';"), []);
  assert.equal(violationsFor('index.ts', "import { x } from '../kiditem-os/background/x.js';").length, 1);
});

test('src 바로 아래는 index.ts·스펙·선언 파일·README·네 층 폴더만 둔다', () => {
  assert.deepEqual(
    topLevelViolations([
      { name: 'index.ts', directory: false },
      { name: 'index.spec.ts', directory: false },
      { name: 'raw-import.d.ts', directory: false },
      { name: 'README.md', directory: false },
      ...['entry', 'core', 'collectors', 'sites'].map((name) => ({ name, directory: true })),
    ]),
    [],
  );
  assert.equal(topLevelViolations([{ name: 'util', directory: true }, { name: 'helpers.ts', directory: false }]).length, 2);
});
