#!/usr/bin/env node
/**
 * 채널 레지스트리를 확장이 읽을 수 있는 모양으로 옮겨 적는다.
 *
 * 확장은 빌드가 없다. 번들러도 `import` 도 없이 서비스워커가 `importScripts` 로 파일을
 * 순서대로 싣는다. 그래서 `@kiditem/shared/channel-registry` 를 그대로 쓸 수 없고, 생성물을
 * 저장소에 커밋한다.
 *
 * 손으로 고치지 않는다 — `npm run check:channel-registry-sync` 가 원본과 다르면 막는다.
 *
 *   node scripts/generate-channel-registry.mjs            # 생성물 갱신
 *   node scripts/generate-channel-registry.mjs --check    # 다르면 실패
 *   node scripts/generate-channel-registry.mjs --out FILE # 임시 파일로 뽑기
 */
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'packages/shared/src/channel-registry.ts');
const TARGET = path.join(ROOT, 'extensions/kiditem-os/shared/channel-registry.js');

/**
 * 원본에서 행 배열만 떼어 값으로 읽는다.
 *
 * 빌드 산출물(`dist/`)이 아니라 소스를 읽는 이유: 이 검사가 빌드 순서에 매이면 CI 가
 * 빌드를 건너뛴 순간 조용히 통과한다. 행 배열은 리터럴뿐이라 타입 없이도 그대로 값이다.
 */
export function readRegistryRows(source = readFileSync(SOURCE, 'utf8')) {
  const start = source.indexOf('const REGISTRY_ROWS = [');
  if (start < 0) throw new Error('REGISTRY_ROWS not found in channel-registry.ts');
  const open = source.indexOf('[', start);
  const close = source.indexOf('] as const satisfies', open);
  if (close < 0) throw new Error('REGISTRY_ROWS terminator not found');
  const literal = source.slice(open, close + 1);
  // 리터럴 배열 하나만 평가한다. 식별자도 호출도 없는 값이다.
  return Function(`"use strict"; return ${literal};`)();
}

const FIELD_ORDER = [
  'key',
  'name',
  'kind',
  'sharedAccountChannel',
  'formSpec',
  'collector',
  'uploadTracking',
  'delivery',
  'representativeImage',
  'soldOutScope',
  'verified',
  'logo',
];

/** 원본 행에 FIELD_ORDER 밖의 칸이 있으면 생성물이 그 칸을 조용히 버린다 — 여기서 막는다. */
function assertKnownFields(rows) {
  for (const row of rows) {
    const unknown = Object.keys(row).filter((field) => !FIELD_ORDER.includes(field));
    if (unknown.length > 0) {
      throw new Error(`channel-registry row ${JSON.stringify(row.key)} has fields not in FIELD_ORDER: ${unknown.join(', ')}`);
    }
  }
}

function renderRow(row) {
  assertKnownFields([row]);
  const parts = FIELD_ORDER
    .filter((field) => row[field] !== undefined)
    .map((field) => `${JSON.stringify(field)}: ${JSON.stringify(row[field])}`);
  return `    Object.freeze({ ${parts.join(', ')} }),`;
}

export function renderRegistryModule(rows) {
  return `// 생성 파일입니다. 고치지 마세요.
// 원본: packages/shared/src/channel-registry.ts
// 생성: node scripts/generate-channel-registry.mjs
//
// 확장은 빌드가 없어 공유 패키지를 그대로 쓸 수 없다. 서비스워커가 이 파일을 먼저 싣고,
// 도메인 워커는 \`self.KidItemChannelRegistry\` 로 읽는다. 이 파일이 원본과 다르면
// \`npm run check:channel-registry-sync\` 가 막는다.
(function initializeChannelRegistry(root) {
  "use strict";

  var CHANNEL_REGISTRY = Object.freeze([
${rows.map(renderRow).join('\n')}
  ]);

  var BY_KEY = new Map(CHANNEL_REGISTRY.map(function (entry) { return [entry.key, entry]; }));

  function findChannel(key) {
    return BY_KEY.get(key) || null;
  }

  /** 확장이 이 채널의 폼을 채울 때 여는 스펙 키. 대개 제 키와 같다. */
  function channelFormSpec(key) {
    var entry = findChannel(key);
    return (entry && entry.formSpec) || key;
  }

  /** 관찰 기록 · 알림이 쓰는 키 — 계정 행을 함께 쓰는 채널은 그 행의 채널로 모은다. */
  function channelOutcomeKey(key) {
    var entry = findChannel(key);
    return (entry && entry.sharedAccountChannel) || key;
  }

  /** 우리 확장 수집기가 주문을 가져오는 채널. */
  function channelCollectsViaExtension(key) {
    var entry = findChannel(key);
    return Boolean(entry) && entry.collector === "extension";
  }

  /** 확장에 발송처리(송장 등록) 경로가 있는 채널. */
  function channelUploadsTracking(key) {
    var entry = findChannel(key);
    return Boolean(entry) && entry.uploadTracking === true;
  }

  root.KidItemChannelRegistry = Object.freeze({
    CHANNEL_REGISTRY: CHANNEL_REGISTRY,
    findChannel: findChannel,
    channelFormSpec: channelFormSpec,
    channelOutcomeKey: channelOutcomeKey,
    channelCollectsViaExtension: channelCollectsViaExtension,
    channelUploadsTracking: channelUploadsTracking,
  });
})(typeof self !== "undefined" ? self : globalThis);
`;
}

function main(argv) {
  const generated = renderRegistryModule(readRegistryRows());
  const outIndex = argv.indexOf('--out');
  if (outIndex >= 0) {
    const out = argv[outIndex + 1];
    if (!out) throw new Error('--out requires a file path');
    writeFileSync(out, generated);
    return 0;
  }
  if (argv.includes('--check')) {
    let current;
    try {
      current = readFileSync(TARGET, 'utf8');
    } catch {
      console.error(`❌ ${path.relative(ROOT, TARGET)} 가 없습니다.`);
      console.error('   node scripts/generate-channel-registry.mjs 로 만들고 커밋하세요.');
      return 1;
    }
    if (current !== generated) {
      console.error(`❌ ${path.relative(ROOT, TARGET)} 가 원본과 다릅니다.`);
      console.error('   node scripts/generate-channel-registry.mjs 로 다시 만들고 커밋하세요.');
      return 1;
    }
    console.log(`✅ check:channel-registry-sync — 확장 생성물이 원본과 같습니다 (${readRegistryRows().length}개 채널).`);
    return 0;
  }
  writeFileSync(TARGET, generated);
  console.log(`✅ ${path.relative(ROOT, TARGET)} 갱신 (${readRegistryRows().length}개 채널).`);
  return 0;
}

/**
 * 직접 실행됐는가. `process.argv[1]` 과 문자열로 비교하지 않는다 — macOS 의 `/var` 는
 * `/private/var` 심볼릭 링크라 임시 디렉터리에서 실행하면 두 값이 갈리고, 검사가 아무것도
 * 하지 않은 채 조용히 성공한다.
 */
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
