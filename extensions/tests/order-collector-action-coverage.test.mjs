import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { MERGED_EXTENSION_VERSION } from './helpers/domain-worker-modules.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const routeRoot = path.join(repoRoot, 'apps/web/src/app/(orders)/order-collection');
const workerPath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/orders/worker.js',
);
const manifestPath = path.join(repoRoot, 'extensions/kiditem-os/manifest.json');
const webSourceRoot = path.join(repoRoot, 'apps/web/src');
const sharedRunFieldsPath = path.join(
  routeRoot,
  'lib/order-collection-extension.ts',
);
const sharedRunFieldsModule = './order-collection-extension';
const sharedRunFieldsName = 'orderCollectionExtensionRunFields';
const ownerCorrelationFields = new Set(['attemptId', 'runId']);
const automaticCollectors = [
  'collectKakaoOrders',
];
// Directship receives its date range from the server-owned attempt control
// record, so its extension message intentionally carries only attemptId.
const runDateActions = new Set([
  'collectKakaoOrders',
]);

function sourceFilesUnder(directory) {
  return readdirSync(directory).flatMap((name) => {
    const entry = path.join(directory, name);
    if (statSync(entry).isDirectory()) return sourceFilesUnder(entry);
    return /\.(ts|tsx)$/.test(name) ? [entry] : [];
  });
}

function parseTypeScript(source, fileName) {
  return ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

const sharedRunFieldsSourceFile = parseTypeScript(
  readFileSync(sharedRunFieldsPath, 'utf8'),
  sharedRunFieldsPath,
);

function propertyNameText(propertyName) {
  if (
    ts.isIdentifier(propertyName) ||
    ts.isStringLiteral(propertyName) ||
    ts.isNumericLiteral(propertyName)
  ) {
    return propertyName.text;
  }
  return null;
}

function hasConcreteOwnerField(sourceFile) {
  let found = false;

  function visit(node) {
    if (found) return;
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === sharedRunFieldsName &&
      node.body
    ) {
      function visitHelperBody(child) {
        if (found) return;
        if (ts.isReturnStatement(child) && ts.isObjectLiteralExpression(child.expression)) {
          for (const property of child.expression.properties) {
            if (!ts.isPropertyAssignment(property)) continue;
            const fieldName = propertyNameText(property.name);
            if (!ownerCorrelationFields.has(fieldName)) continue;
            const initializer = property.initializer;
            if (
              ts.isPropertyAccessExpression(initializer) &&
              ts.isIdentifier(initializer.expression) &&
              initializer.expression.text === 'run' &&
              ownerCorrelationFields.has(initializer.name.text)
            ) {
              found = true;
              return;
            }
          }
        }
        ts.forEachChild(child, visitHelperBody);
      }
      visitHelperBody(node.body);
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

function approvedSharedRunFieldBindings(sourceFile, filePath) {
  const bindings = new Set();
  if (path.resolve(filePath) === path.resolve(sharedRunFieldsPath)) {
    bindings.add(sharedRunFieldsName);
  }

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== sharedRunFieldsModule
    ) {
      continue;
    }
    const resolvedModulePath = path.resolve(
      path.dirname(filePath),
      `${statement.moduleSpecifier.text}.ts`,
    );
    if (resolvedModulePath !== path.resolve(sharedRunFieldsPath)) continue;
    const namedBindings = statement.importClause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;
    for (const element of namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (importedName === sharedRunFieldsName) bindings.add(element.name.text);
    }
  }
  return bindings;
}

function automaticMessagesFromSource(source, filePath) {
  const sourceFile = parseTypeScript(source, filePath);
  const helperBindings = approvedSharedRunFieldBindings(sourceFile, filePath);
  const messages = [];

  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      const actionProperty = node.properties.find((property) => {
        if (!ts.isPropertyAssignment(property)) return false;
        if (propertyNameText(property.name) !== 'action') return false;
        return (
          (ts.isStringLiteral(property.initializer) ||
            ts.isNoSubstitutionTemplateLiteral(property.initializer)) &&
          new Set(automaticCollectors).has(property.initializer.text)
        );
      });
      if (actionProperty) {
        messages.push({
          action: actionProperty.initializer.text,
          filePath,
          objectLiteral: node,
          sourceFile,
          helperBindings,
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return messages;
}

function objectHasNamedProperty(objectLiteral, fieldName) {
  return objectLiteral.properties.some((property) => {
    if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
      return propertyNameText(property.name) === fieldName;
    }
    return false;
  });
}

function objectHasOwnerCorrelation(message) {
  if ([...ownerCorrelationFields].some((field) =>
    objectHasNamedProperty(message.objectLiteral, field))) {
    return true;
  }

  return message.objectLiteral.properties.some((property) => {
    if (!ts.isSpreadAssignment(property)) return false;
    const expression = property.expression;
    if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression)) {
      return false;
    }
    return message.helperBindings.has(expression.expression.text) &&
      hasConcreteOwnerField(sharedRunFieldsSourceFile);
  });
}

test('retired Orders and Rocket Operation wrappers are absent', () => {
  const worker = readFileSync(workerPath, 'utf8');
  assert.doesNotMatch(worker, /runMarketplaceOrderCollectionOperation|runCoupangRocketPurchaseOrderOperation/);
});

test('order-collection route actions are handled by the extension worker', () => {
  const requestedActions = new Set();
  for (const file of sourceFilesUnder(routeRoot)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/action:\s*['"]([^'"]+)['"]/g)) {
      requestedActions.add(match[1]);
    }
  }

  const worker = readFileSync(workerPath, 'utf8');
  const handledActions = new Set(
    [...worker.matchAll(/msg\?\.action\s*===\s*['"]([^'"]+)['"]/g)].map(
      (match) => match[1],
    ),
  );
  // 확장 병합 후 수집 세션 공통 액션은 통합 dispatch 가 처리한다. 웹앱 입장에서는
  // 여전히 확장 하나가 전부 받으므로 두 소유자를 합쳐서 본다.
  const dispatchSource = readFileSync(
    path.join(repoRoot, 'extensions/kiditem-os/background/external-dispatch.js'),
    'utf8',
  );
  for (const match of dispatchSource.matchAll(
    /msg\.action === ["']([^"']+)["']|^\s{4}["']([^"']+)["']\s*:/gm,
  )) {
    handledActions.add(match[1] ?? match[2]);
  }
  // Named source-owner actions are registered by the owning domain rather than
  // by the shared dispatch module. Count those keys as extension responders too.
  const externalActions = worker.match(
    /externalActions:\s*\{([\s\S]*?)\n\s*\},\s*externalPorts:/,
  )?.[1] ?? '';
  for (const match of externalActions.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:\s*\{/gm)) {
    handledActions.add(match[1]);
  }
  // 한 번에 끝나는 entry 액션(KID-366)은 새 런타임 dispatch가 받는다 — 이름은 shared 계약 하나에 있다.
  const entryContract = readFileSync(
    path.join(repoRoot, 'packages/shared/src/schemas/extension-actions.ts'),
    'utf8',
  );
  for (const match of entryContract.matchAll(/_ACTION = ['"]([^'"]+)['"] as const/g)) {
    handledActions.add(match[1]);
  }
  const missingActions = [...requestedActions].filter(
    (action) =>
      !handledActions.has(action) &&
      !new Set(['restartCollectionSession', 'finalizeCollectionSession']).has(action),
  );

  assert.deepEqual(missingActions, []);
});

test('order collector manifest grants the exact Kakao seller host', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  assert.ok(manifest.host_permissions.includes('https://shopping-seller.kakao.com/*'));
});

test('every automatic collector explicitly attaches its inactive tab to its own run', () => {
  const worker = readFileSync(workerPath, 'utf8');
  const extractedCollectors = {};
  for (const collector of automaticCollectors) {
    if (extractedCollectors[collector]) {
      const source = readFileSync(
        path.join(repoRoot, 'extensions/kiditem-os/background/orders', extractedCollectors[collector]),
        'utf8',
      );
      assert.match(source, /async function collect\(input = \{\}\)/, `${collector} collector interface`);
      assert.match(source, /if \(collection\?\.attachTab\)/, `${collector} managed tab attachment`);
      assert.match(source, /collection\.detachTab\(tab, \{ owned: true \}\)/, `${collector} owned tab cleanup`);
      continue;
    }
    const start = worker.indexOf(`async function ${collector}(`);
    assert.notEqual(start, -1, collector);
    const next = worker.indexOf('\nasync function ', start + 1);
    const body = worker.slice(start, next === -1 ? worker.length : next);
    assert.match(body, /\([^)]*collection[^)]*\)/, `${collector} collection argument`);
    assert.match(
      body,
      /await attachOrderCollectionTab\(collection, tab, created\)/,
      `${collector} managed tab attachment`,
    );
  }
});

test('order worker imports failure evidence and session lifecycle before dispatch', () => {
  const worker = readFileSync(workerPath, 'utf8');
  // 확장 병합 후 의존 모듈 로드는 통합 서비스워커가 소유한다.
  const entrySource = readFileSync(
    path.join(repoRoot, 'extensions/kiditem-os/background/service-worker.js'),
    'utf8',
  );
  assert.match(
    entrySource,
    /importScripts\([\s\S]*collection-session\.js[\s\S]*orders\/collection-failure\.js[\s\S]*orders\/order-collection-lifecycle\.js/,
  );
  assert.doesNotMatch(worker, /^importScripts\(/m);
  assert.match(worker, /browserCollectionSessions:\s*true/);
  assert.match(worker, /orderCollectionFailureEvidenceV1:\s*true/);
  assert.match(worker, /orderCollectionConfirmedCoverageV1:\s*true/);
  assert.doesNotMatch(worker, /collectSellpiaProductStock/);

  // 수집 세션 공통 액션은 통합 dispatch 가 단독으로 처리한다. 도메인 워커가
  // 각자 응답하면 세 리스너가 같은 메시지에 경쟁 응답하게 된다.
  const dispatchSource = readFileSync(
    path.join(repoRoot, 'extensions/kiditem-os/background/external-dispatch.js'),
    'utf8',
  );
  for (const action of [
    'listCollectionSessions',
    'getCollectionSession',
    'cancelCollectionSession',
    'openCollectionAttentionTab',
  ]) {
    assert.match(dispatchSource, new RegExp(`["']${action}["']`), action);
    assert.doesNotMatch(
      worker,
      new RegExp(`msg\\?\\.action === ["']${action}["']`),
      action,
    );
  }
  // 도메인은 자기 구현을 레지스트리로 넘긴다.
  assert.match(worker, /KidItemDomains\.register\(/);
  assert.match(worker, /producerPrefixes:\s*\["orders"\]/);
});

test('order collector manifest keeps storage and Sellpia host access at the merged version', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.version, MERGED_EXTENSION_VERSION);
  assert.ok(manifest.permissions.includes('storage'));
  // 셀피아 작업(전송·후처리·자동송장·스냅샷)은 새 런타임 kind다(KID-366 wave8b) — 옛 워커 capability 표시는 없다.
  assert.ok(manifest.host_permissions.includes('https://*.sellpia.com/*'));
});

test('web bridge reaches local and Office KidItem origins', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  const externalMatches = manifest.externally_connectable?.matches ?? [];
  assert.ok(externalMatches.includes('http://localhost:3000/*'));
  assert.ok(externalMatches.includes('http://kiditem-office/*'));

  const hostBridge = (manifest.content_scripts ?? []).find((entry) =>
    (entry.js ?? []).includes('content/host-bridge.js'),
  );
  assert.ok(hostBridge, 'host-bridge content script must be declared');
  assert.ok(hostBridge.matches.includes('http://localhost:3000/*'));
  assert.ok(hostBridge.matches.includes('http://kiditem-office/*'));
});

test('every web automatic order message carries local owner correlation explicitly', () => {
  const automaticActionSet = new Set(automaticCollectors);
  assert.equal(
    hasConcreteOwnerField(sharedRunFieldsSourceFile),
    true,
    'shared order collection run helper must return a concrete attemptId/runId field',
  );
  const messages = [];
  for (const file of sourceFilesUnder(webSourceRoot)) {
    if (/\.(spec|test)\.(ts|tsx)$/.test(file)) continue;
    const source = readFileSync(file, 'utf8');
    messages.push(
      ...automaticMessagesFromSource(source, file).filter((message) =>
        automaticActionSet.has(message.action),
      ),
    );
  }

  assert.ok(messages.length >= automaticCollectors.length);
  for (const message of messages) {
    assert.equal(
      objectHasOwnerCorrelation(message),
      true,
      `${message.action} in ${path.relative(repoRoot, message.filePath)}`,
    );
    if (runDateActions.has(message.action)) {
      assert.equal(
        objectHasNamedProperty(message.objectLiteral, 'date'),
        true,
        `${message.action} date in ${path.relative(repoRoot, message.filePath)}`,
      );
    }
  }
});

test('automatic order correlation guard rejects arbitrary spreads', () => {
  const syntheticPath = path.join(webSourceRoot, '__synthetic-order-message.ts');
  const syntheticSource = `
    const orderCollectionExtensionRunFields = (run: unknown) => ({ attemptId: run });
    sendToExtension({
      action: 'collectKakaoOrders',
      // attemptId: run.attemptId must not satisfy the source guard by comment alone.
      ...orderCollectionExtensionRunFields(run),
    });
  `;
  const [message] = automaticMessagesFromSource(syntheticSource, syntheticPath);

  assert.ok(message);
  assert.equal(
    objectHasOwnerCorrelation(message),
    false,
    'a same-named local helper without the shared import must not satisfy the guard',
  );
});

test('the order worker never moves focus — write steps that face the operator are runtime kinds', () => {
  const worker = readFileSync(workerPath, 'utf8');
  assert.doesNotMatch(worker, /active:\s*true|focused:\s*true/);
  // 셀피아 전송·후처리·자동송장·스냅샷, 쿠팡 배송 목록, 온채널·키드키즈 송장 업로드는 새 런타임 kind다(KID-366 wave8b,
  // 쓰기 단계의 운영자 탭은 `extensions/src/sites/operator-tab.ts`). 옛 워커에 남은 액션은 카카오·세션 셋뿐이다(wave9).
  const actions = worker.match(/const ORDERS_EXTERNAL_ACTIONS = \[([\s\S]*?)\];/)?.[1] ?? '';
  assert.deepEqual([...actions.matchAll(/"([^"]+)"/g)].map((match) => match[1]), ['closeOrderCollectionTabs', 'ensureMallLoggedIn', 'collectKakaoOrders']);
  const capabilities = worker.match(/capabilities:\s*\{([\s\S]*?)\n\s*\},/)?.[1] ?? '';
  assert.deepEqual([...capabilities.matchAll(/^\s*(\w+):\s*true,/gm)].map((match) => match[1]), [
    'collectKakaoOrders',
    'browserCollectionSessions',
    'orderCollectionFailureEvidenceV1',
    'orderCollectionConfirmedCoverageV1',
    'orderCollectionSourceOwnerV1',
    'orderCollectionTabCloseV1',
  ]);
  assert.doesNotMatch(worker, /INTERACTIVE_TAB_REASONS|KidItemInteractiveTabs/);
});

test('Orders registers only the recovery hook — the additional read hooks left with the Sellpia snapshot and shipment list', () => {
  const worker = readFileSync(workerPath, 'utf8');
  assert.match(worker, /recoverCollections:\s*\(environmentId\)\s*=>\s*recoverOrdersCollections\(environmentId\)/);
  // 셀피아 스냅샷·쿠팡 배송 목록은 실행 kind라(KID-366 wave8b) 옛 "추가 수집" 문맥·세션 저장소·훅이 없다.
  assert.doesNotMatch(worker, /AdditionalCollection|ordersAdditional|ORDERS_ADDITIONAL_RESOURCES_KEY/);
  const registry = readFileSync(path.join(repoRoot, 'extensions/kiditem-os/background/domain-registry.js'), 'utf8');
  assert.doesNotMatch(registry, /AdditionalCollections/);
});

test('collection-session dispatch exposes no restart or finalize command', () => {
  const dispatchSource = readFileSync(
    path.join(repoRoot, 'extensions/kiditem-os/background/external-dispatch.js'),
    'utf8',
  );
  const worker = readFileSync(workerPath, 'utf8');
  assert.doesNotMatch(dispatchSource, /restartCollectionSession/);
  assert.doesNotMatch(dispatchSource, /finalizeCollectionSession/);
  assert.doesNotMatch(worker, /msg\?\.action === ["'](?:restart|finalize)CollectionSession["']/);
});
