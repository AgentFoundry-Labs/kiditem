import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// KID-357: 확장 새 런타임(extensions/src)의 4층 import 경계.
// 의존은 한 방향 entry → core → collectors → sites 이고, 수집기는 서버를 모른다.
//   entry      : 무엇이든 import 가능(라우터·조립)
//   core       : core 와 @kiditem/shared 만
//   collectors : core 중 site-caller·errors 와 collectors, shared. operation-client·runner·browser·api 금지
//   sites      : core 중 site-caller·errors 와 shared 만
// 옛 전역(KidItem*, sourceOwnerEnvironmentContext …)은 entry/legacy-bridge.ts 만 참조한다.
// 도메인 코드는 chrome.* 만 쓴다: import.meta 와 번들러 전용 API 금지.

export const LAYERS = ['entry', 'core', 'collectors', 'sites'];
const CORE_FOR_LOWER_LAYERS = new Set(['site-caller', 'errors']);
const LEGACY_BRIDGE = 'entry/legacy-bridge.ts';
// KidItemRuntime 은 이 번들 자신의 전역 이름이라 옛 전역이 아니다.
const LEGACY_GLOBAL = /\b(KidItem(?!Runtime\b)[A-Z]\w*|sourceOwnerEnvironmentContext|sharedEnvironmentContext|collectionSessions)\b/;
const COMMENT_RE = /\/\*[\s\S]*?\*\/|(^|[^:'"`])\/\/.*$/gm;

/** 주석은 옛 전역을 설명할 수 있으므로 코드만 검사한다. */
export function stripComments(source) {
  return source.replace(COMMENT_RE, '$1');
}
const IMPORT_RE = /^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm;

function layerOf(relative) {
  const top = relative.split('/')[0];
  return LAYERS.includes(top) ? top : null;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.ts$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(full);
  }
  return out;
}

/** 파일 하나의 위반 목록. `relative` 는 extensions/src 기준, `source` 는 파일 내용. */
export function violationsFor(relative, source) {
  const layer = layerOf(relative);
  const violations = [];
  const isSpec = /\.spec\.ts$/.test(relative);
  if (/\bimport\.meta\b/.test(source)) violations.push(`${relative}: import.meta 는 번들러 전용 — chrome.* 만 쓴다`);
  const code = stripComments(source);
  if (relative !== LEGACY_BRIDGE && !isSpec && LEGACY_GLOBAL.test(code)) {
    violations.push(`${relative}: 옛 전역(${code.match(LEGACY_GLOBAL)[1]})은 ${LEGACY_BRIDGE} 만 참조한다`);
  }
  if (!layer) return violations;
  for (const match of source.matchAll(IMPORT_RE)) {
    const specifier = match[1] ?? match[2];
    if (!specifier.startsWith('.')) continue; // @kiditem/shared, zod 등 패키지는 어느 층이나 가능
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier));
    const targetLayer = layerOf(target);
    if (!targetLayer) continue;
    const targetFile = target.split('/').slice(1).join('/').replace(/\.(ts|js)$/, '');
    const bad = (why) => violations.push(`${relative} → ${specifier}: ${why}`);
    if (layer === 'entry') continue;
    if (layer === 'core' && targetLayer !== 'core') bad('core 는 core 만 import 한다');
    if (layer === 'collectors') {
      if (targetLayer === 'entry' || targetLayer === 'sites') bad('collectors 는 entry·sites 를 모른다');
      if (targetLayer === 'core' && !CORE_FOR_LOWER_LAYERS.has(targetFile)) bad('collectors 는 core 중 site-caller·errors 만 쓴다 — 서버 통신은 runner 가 한다');
    }
    if (layer === 'sites') {
      if (targetLayer !== 'sites' && !(targetLayer === 'core' && CORE_FOR_LOWER_LAYERS.has(targetFile))) bad('sites 는 core 중 site-caller·errors 와 sites 만 쓴다');
    }
  }
  return violations;
}

export function scan(srcDir) {
  const violations = [];
  for (const file of walk(srcDir)) {
    const relative = path.relative(srcDir, file).split(path.sep).join('/');
    violations.push(...violationsFor(relative, readFileSync(file, 'utf8')));
  }
  return violations;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const violations = scan(path.join(root, 'extensions', 'src'));
  if (violations.length) {
    console.error('check:extension-runtime-layers FAIL');
    for (const line of violations) console.error(`  ${line}`);
    process.exit(1);
  }
  console.log('check:extension-runtime-layers PASS');
}
