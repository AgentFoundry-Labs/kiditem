#!/usr/bin/env node
/**
 * 오류 레지스트리(ADR-0023)를 확장이 읽을 수 있는 모양으로 옮겨 적는다.
 *
 * 확장은 빌드가 없어 `@kiditem/shared/errors`를 그대로 쓸 수 없다. 코드·kind·HTTP status·한국어 문장,
 * 확장·옛 코드 alias, 원천 이름을 값으로 떼어 `extensions/kiditem-os/shared/operator-error.js`에 커밋한다.
 * 확장이 이 파일을 싣고 쓰는 연결은 확장 재설계(KID-338)가 한다 — 이 스크립트는 생성물만 만든다.
 *
 * 손으로 고치지 않는다 — `npm run check:operator-error-sync`가 원본과 다르면 막는다.
 *
 *   node scripts/generate-operator-error.mjs            # 생성물 갱신
 *   node scripts/generate-operator-error.mjs --check    # 다르면 실패
 *   node scripts/generate-operator-error.mjs --out FILE # 임시 파일로 뽑기
 */
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFINITIONS = path.join(ROOT, 'packages/shared/src/errors/definitions.ts');
const OPERATOR_ERROR = path.join(ROOT, 'packages/shared/src/errors/operator-error.ts');
const TARGET = path.join(ROOT, 'extensions/kiditem-os/shared/operator-error.js');

function block(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`${startMarker} not found`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`${endMarker} not found after ${startMarker}`);
  return source.slice(start, end);
}

/**
 * 원본 TypeScript에서 값만 읽는다(빌드 산출물이 아니라 소스 — 검사가 빌드 순서에 매이지 않게).
 * `def(owner, kind, text, { httpStatus?, retryable? })` 한 줄이 코드 하나다.
 */
export function readOperatorErrorSource(
  definitionsSource = readFileSync(DEFINITIONS, 'utf8'),
  operatorSource = readFileSync(OPERATOR_ERROR, 'utf8'),
) {
  const kindStatus = {};
  for (const match of block(definitionsSource, 'export const KIND_HTTP_STATUS', '};').matchAll(/^\s{2}(\w+):\s*(\d{3}),/gm)) {
    kindStatus[match[1]] = Number(match[2]);
  }
  const definitions = {};
  const defBlock = block(definitionsSource, 'export const ERROR_DEFINITIONS', 'as const satisfies');
  const defLine = /^\s{2}([A-Z][A-Z0-9_]+):\s*def\('(\w+)',\s*'(\w+)',\s*'([^']+)'(?:,\s*\{([^}]*)\})?\),\s*$/gm;
  for (const match of defBlock.matchAll(defLine)) {
    const [, code, owner, kind, text, options = ''] = match;
    const httpStatus = /httpStatus:\s*(\d{3})/.exec(options);
    if (!(kind in kindStatus)) throw new Error(`${code}: unknown kind ${kind}`);
    definitions[code] = {
      owner,
      kind,
      httpStatus: httpStatus ? Number(httpStatus[1]) : kindStatus[kind],
      text,
      retryable: /retryable:\s*true/.test(options),
    };
  }
  const declared = [...defBlock.matchAll(/^\s{2}([A-Z][A-Z0-9_]+):\s*def\(/gm)].map((match) => match[1]);
  const missing = declared.filter((code) => !definitions[code]);
  if (missing.length) throw new Error(`could not read registry lines for: ${missing.join(', ')} (keep each def(...) on one line)`);

  const aliases = {};
  for (const match of block(definitionsSource, 'export const EXTENSION_CODE_ALIASES', '};').matchAll(/^\s{2}([A-Za-z0-9_]+):\s*'([A-Z0-9_]+)',/gm)) {
    if (!definitions[match[2]]) throw new Error(`alias ${match[1]} points at unregistered ${match[2]}`);
    aliases[match[1]] = match[2];
  }
  const sourceLabels = {};
  for (const match of block(operatorSource, 'export const SOURCE_LABELS', '};').matchAll(/^\s{2}([a-z0-9_]+):\s*'([^']+)',/gm)) {
    sourceLabels[match[1]] = match[2];
  }
  return { definitions, aliases, sourceLabels };
}

const json = (value) => JSON.stringify(value, null, 2).replace(/\n/g, '\n  ');

export function renderOperatorErrorModule({ definitions, aliases, sourceLabels }) {
  return `// 생성 파일입니다. 고치지 마세요.
// 원본: packages/shared/src/errors/definitions.ts, packages/shared/src/errors/operator-error.ts (ADR-0023)
// 생성: node scripts/generate-operator-error.mjs
//
// 확장은 빌드가 없어 공유 패키지를 그대로 쓸 수 없다. 이 파일을 싣는 쪽은 \`self.KidItemOperatorError\`로
// 코드를 풀고 운영자 문장을 얻는다. 원본과 다르면 \`npm run check:operator-error-sync\`가 막는다.
(function initializeOperatorError(root) {
  "use strict";

  function deepFreeze(value) {
    Object.values(value).forEach(function (child) {
      if (child && typeof child === "object") deepFreeze(child);
    });
    return Object.freeze(value);
  }

  var ERROR_DEFINITIONS = deepFreeze(${json(definitions)});

  var EXTENSION_CODE_ALIASES = deepFreeze(${json(aliases)});

  var SOURCE_LABELS = deepFreeze(${json(sourceLabels)});

  function isErrorCode(value) {
    return typeof value === "string" && Object.prototype.hasOwnProperty.call(ERROR_DEFINITIONS, value);
  }

  /** 등록 코드 그대로 → alias → 대문자·\`-\`→\`_\` 정규화. 어느 것도 아니면 null. */
  function resolveErrorCode(raw) {
    if (typeof raw !== "string") return null;
    var trimmed = raw.trim();
    if (!trimmed) return null;
    if (isErrorCode(trimmed)) return trimmed;
    if (Object.prototype.hasOwnProperty.call(EXTENSION_CODE_ALIASES, trimmed)) return EXTENSION_CODE_ALIASES[trimmed];
    var normalized = trimmed.toUpperCase().replace(/[-\\s]+/g, "_");
    return isErrorCode(normalized) ? normalized : null;
  }

  function sourceLabel(source) {
    if (!source) return "수집";
    return SOURCE_LABELS[source] || SOURCE_LABELS[String(source).toLowerCase().replace(/[-\\s]+/g, "_")] || "수집";
  }

  /** 운영자 문장 하나. 알려진 코드는 레지스트리 문장, 모르는 코드는 원천별 일반 문장. 원문은 돌려주지 않는다. */
  function operatorErrorText(input) {
    var code = resolveErrorCode(input && input.code);
    if (code) return ERROR_DEFINITIONS[code].text;
    return sourceLabel(input && input.source) + " 작업이 실패했습니다. 다시 시도해 주세요.";
  }

  root.KidItemOperatorError = Object.freeze({
    ERROR_DEFINITIONS: ERROR_DEFINITIONS,
    EXTENSION_CODE_ALIASES: EXTENSION_CODE_ALIASES,
    SOURCE_LABELS: SOURCE_LABELS,
    resolveErrorCode: resolveErrorCode,
    sourceLabel: sourceLabel,
    operatorErrorText: operatorErrorText,
  });
})(typeof self !== "undefined" ? self : globalThis);
`;
}

function main(argv) {
  const source = readOperatorErrorSource();
  const generated = renderOperatorErrorModule(source);
  const outIndex = argv.indexOf('--out');
  if (outIndex >= 0) {
    const out = argv[outIndex + 1];
    if (!out) throw new Error('--out requires a file path');
    writeFileSync(out, generated);
    return 0;
  }
  const count = Object.keys(source.definitions).length;
  if (argv.includes('--check')) {
    let current;
    try {
      current = readFileSync(TARGET, 'utf8');
    } catch {
      console.error(`❌ ${path.relative(ROOT, TARGET)} 가 없습니다.`);
      console.error('   node scripts/generate-operator-error.mjs 로 만들고 커밋하세요.');
      return 1;
    }
    if (current !== generated) {
      console.error(`❌ ${path.relative(ROOT, TARGET)} 가 원본과 다릅니다.`);
      console.error('   node scripts/generate-operator-error.mjs 로 다시 만들고 커밋하세요.');
      return 1;
    }
    console.log(`✅ check:operator-error-sync — 확장 생성물이 원본과 같습니다 (코드 ${count}개, alias ${Object.keys(source.aliases).length}개).`);
    return 0;
  }
  writeFileSync(TARGET, generated);
  console.log(`✅ ${path.relative(ROOT, TARGET)} 갱신 (코드 ${count}개).`);
  return 0;
}

/** 직접 실행됐는가(macOS `/var` → `/private/var` 심볼릭 링크 때문에 realpath로 비교). */
function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  process.exitCode = main(process.argv.slice(2));
}
