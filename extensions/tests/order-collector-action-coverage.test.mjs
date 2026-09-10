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
const coupangPoSessionPath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/orders/coupang-po-session.js',
);
const webSourceRoot = path.join(repoRoot, 'apps/web/src');
const sharedRunFieldsPath = path.join(
  routeRoot,
  'lib/order-collection-extension.ts',
);
const sharedRunFieldsModule = './order-collection-extension';
const sharedRunFieldsName = 'orderCollectionExtensionRunFields';
const ownerCorrelationFields = new Set(['attemptId', 'runId']);
const automaticCollectors = [
  'collectSellpiaDeliTracking',
  'collectIcecreamMallOrders',
  'collectKidsnoteOrders',
  'collectKkomangseOrders',
  'collectOnchannelOrders',
  'collectDomeggookOrders',
  'collectKidkidsOrders',
  'collectLotteonOrders',
  'collectGsshopOrders',
  'collectAlwayzOrders',
  'collectKakaoOrders',
  'collectBoriboriOrders',
  'collectTeachervilleOrders',
  'collectArt09Orders',
  'collectHaebeopOrders',
  'collectCoupangDirectOrders',
];
// Directship receives its date range from the server-owned attempt control
// record, so its extension message intentionally carries only attemptId.
const runDateActions = new Set([
  'collectKkomangseOrders',
  'collectKidkidsOrders',
  'collectLotteonOrders',
  'collectGsshopOrders',
  'collectAlwayzOrders',
  'collectKakaoOrders',
  'collectBoriboriOrders',
  'collectTeachervilleOrders',
  'collectArt09Orders',
  'collectHaebeopOrders',
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
  const coupangPoSession = readFileSync(coupangPoSessionPath, 'utf8');
  const extractedCollectors = {
    collectSellpiaDeliTracking: 'sellpia-shipment-tracking-collector.js',
  };
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
    if (collector === 'collectCoupangDirectOrders') {
      assert.match(body, /coupangPoSession\.run/);
      assert.match(
        coupangPoSession,
        /await attachOrderCollectionTab\(collection, tab, created\)/,
      );
    } else {
      assert.match(
        body,
        /await attachOrderCollectionTab\(collection, tab, created\)/,
        `${collector} managed tab attachment`,
      );
    }
  }
});

test('order worker imports failure evidence, session lifecycle, and focused Sellpia producers before dispatch', () => {
  const worker = readFileSync(workerPath, 'utf8');
  // 확장 병합 후 의존 모듈 로드는 통합 서비스워커가 소유한다.
  const entrySource = readFileSync(
    path.join(repoRoot, 'extensions/kiditem-os/background/service-worker.js'),
    'utf8',
  );
  assert.match(
    entrySource,
    /importScripts\([\s\S]*collection-session\.js[\s\S]*interactive-tabs\.js[\s\S]*orders\/collection-failure\.js[\s\S]*orders\/order-collection-lifecycle\.js[\s\S]*orders\/sellpia-inventory\.js[\s\S]*orders\/sellpia-inventory-source-owner\.js[\s\S]*orders\/sellpia-post-processing\.js/,
  );
  assert.doesNotMatch(worker, /^importScripts\(/m);
  assert.match(worker, /browserCollectionSessions:\s*true/);
  assert.match(worker, /collectSellpiaInventoryJsonV1:\s*true/);
  assert.match(worker, /collectSellpiaSaleSummary:\s*true/);
  assert.match(worker, /collectSellpiaSaleSummaryAuthoritativeV1:\s*true/);
  assert.match(worker, /collectSellpiaProductProfit:\s*true/);
  assert.match(worker, /collectSellpiaProductProfitEvidenceV2:\s*true/);
  assert.match(worker, /sellpiaProductProfitabilitySourceOwnerV1:\s*true/);
  assert.match(worker, /orderCollectionFailureEvidenceV1:\s*true/);
  assert.doesNotMatch(worker, /collectSellpiaProductStock/);
  assert.match(worker, /collectSellpiaInventory:\s*\{/);
  assert.match(worker, /KidItemSellpiaInventorySourceOwner\.parseAction/);
  assert.match(worker, /sellpiaInventorySourceOwnerV1:\s*true/);

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
  assert.match(worker, /producerPrefixes:\s*\["orders",\s*"inventory"\]/);
});

test('order collector manifest publishes normalized failure evidence and scoped Sellpia invoice selection at version 0.1.95', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.version, MERGED_EXTENSION_VERSION);
  assert.ok(manifest.permissions.includes('storage'));
  assert.ok(manifest.host_permissions.includes('https://*.sellpia.com/*'));
  const worker = readFileSync(workerPath, 'utf8');
  assert.match(worker, /sellpiaOrderFileUploadEvidenceV1:\s*true/);
  assert.match(worker, /sellpiaScopedAutoInvoiceV1:\s*true/);
  assert.match(worker, /collectCoupangShipmentDateSummaryValidatedV1:\s*true/);
  assert.match(worker, /coupangShipmentSummarySourceOwnerV1:\s*true/);
  assert.equal(/coupangRocketPoSourceOwnerV1:\s*true/.test(worker), true);
});

test('Sellpia inventory delegates the server-issued attempt directly to the source owner', () => {
  const worker = readFileSync(workerPath, 'utf8');
  const owner = readFileSync(
    path.join(repoRoot, 'extensions/kiditem-os/background/orders/sellpia-inventory-source-owner.js'),
    'utf8',
  );

  assert.match(worker, /collectSellpiaInventory:\s*\{/);
  assert.match(worker, /handle:\s*\(\{ attemptId \}, environmentId\)/);
  assert.match(worker, /sellpiaInventorySourceOwner\.run\(\{ attemptId, environmentId \}\)/);
  assert.match(owner, /\/api\/inventory\/sellpia-source\/attempts/);
  assert.match(owner, /FormData/);
  assert.match(owner, /x-source-attempt-token/);
  assert.doesNotMatch(worker, /\/api\/operation-alerts/);
  assert.doesNotMatch(worker, /\/api\/sellpia-product-sales\/attempts/);
  assert.doesNotMatch(worker, /\/api\/sellpia-product-sales\/ingest/);
});

test('Sellpia profitability owner binds its task-owned tab to the collection session', () => {
  const worker = readFileSync(workerPath, 'utf8');
  const collector = readFileSync(
    path.join(repoRoot, 'extensions/kiditem-os/background/orders/sellpia-product-profit-collector.js'),
    'utf8',
  );
  assert.match(worker, /collect: \(\{ plan, \.\.\.collection \}\) =>/);
  assert.match(collector, /if \(collection\?\.attachTab\)/);
  assert.match(collector, /collection\.attachTab\(tab, \{ owned: true \}\)/);
  assert.match(collector, /collection\.detachTab\(tab, \{ owned: true \}\)/);
  assert.match(worker, /KidItemSellpiaProductProfitabilitySourceOwner\.parseAction/);
  assert.match(worker, /sellpiaProductProfitabilitySourceOwner\.run\(\{ attemptId, environmentId \}\)/);
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

test('Coupang shipment date summary scans its bounded range in concurrent batches', () => {
  const worker = readFileSync(workerPath, 'utf8');
  const start = worker.indexOf('async function scrapeCoupangShipmentDateSummary(');
  const end = worker.indexOf('\nasync function collectCoupangShipmentList(', start);
  const body = worker.slice(start, end);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.match(body, /const PAGE_FETCH_CONCURRENCY = 6;/);
  assert.match(body, /await Promise\.all\(/);
  assert.match(body, /batchStart \+= PAGE_FETCH_CONCURRENCY/);
  assert.doesNotMatch(body, /for \(let page = 1; page <= maxPages; page\+\+\)/);
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

  assert.ok(messages.length >= 16);
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
      action: 'collectAlwayzOrders',
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

test('only explicit user actions route focus through the interactive helper', () => {
  const worker = readFileSync(workerPath, 'utf8');
  assert.doesNotMatch(worker, /active:\s*true|focused:\s*true/);
  for (const action of [
    'sendOrderFileToSellpia',
    'openCoupangShipmentPage',
    'clickCoupangShipmentDownloads',
    'uploadOnchTracking',
    'uploadDomeggookTracking',
  ]) {
    assert.match(worker, new RegExp(`msg\\?\\.action === ["']${action}["']`), action);
  }
  for (const [functionName, reason] of [
    ['findOrCreateSellpiaTab', 'ORDER_FILE_UPLOAD'],
    ['openCoupangShipmentPage', 'SHIPMENT_PAGE'],
    ['clickCoupangShipmentDownloads', 'SHIPMENT_DOWNLOAD'],
    ['uploadOnchTracking', 'TRACKING_MUTATION'],
    ['uploadDomeggookTracking', 'TRACKING_MUTATION'],
  ]) {
    const start = worker.indexOf(`async function ${functionName}(`);
    const next = worker.indexOf('\nasync function ', start + 1);
    const body = worker.slice(start, next === -1 ? worker.length : next);
    assert.notEqual(start, -1, functionName);
    assert.match(body, new RegExp(`INTERACTIVE_TAB_REASONS\\.${reason}`), functionName);
  }
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

test('Sellpia inventory is source-owner direct upload, not an Operation wrapper', () => {
  const worker = readFileSync(workerPath, 'utf8');
  const owner = readFileSync(
    path.join(repoRoot, 'extensions/kiditem-os/background/orders/sellpia-inventory-source-owner.js'),
    'utf8',
  );
  assert.match(owner, /\/api\/inventory\/sellpia-source\/attempts/);
  assert.match(owner, /contentChecksum === requested\.contentChecksum/);
  assert.doesNotMatch(owner, /fileHash/);
  assert.match(owner, /SOURCE_OWNER_UNAVAILABLE/);
  assert.doesNotMatch(worker, /\/api\/sellpia-product-sales\/attempts/);
  assert.doesNotMatch(worker, /Idempotency-Key/);
  assert.doesNotMatch(worker, /\/api\/sellpia-product-sales\/ingest/);
  assert.doesNotMatch(worker, /runSellpiaInventoryOperation/);
  assert.doesNotMatch(worker, /\/api\/operation-alerts/);
});
