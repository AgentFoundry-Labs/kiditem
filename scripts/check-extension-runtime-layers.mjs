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
// 상대 import 는 extensions/src 밖으로 나가지 못하고, entry 밖의 층은 층 밖(루트 index 등)도 못 본다.
// 루트 index.ts 는 entry 와 같고, src 바로 아래에는 index.ts·스펙·선언 파일·README·네 층 폴더만 둔다.
// 도메인 코드는 chrome.* 만 쓴다: import.meta 와 번들러 전용 API 금지. declare const·let·var·function·global 은
// legacy-bridge 만 쓴다. 동적 import()·require() 의 상대 경로에도 같은 층 규칙이 걸린다.

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
// 정적 import·export … from(여러 줄·줄 중간 포함), 부수효과 import, 동적 import()·require().
const IMPORT_RE = /\b(?:import|export)\s[^'";]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]/g;
// TS 에서 옛 전역을 쓰려면 declare 가 있어야 한다 — 이름 목록보다 확실한 관문.
const DECLARE_RE = /\bdeclare\s+(const|let|var|function|global)\b/;

// 루트 index.ts 는 번들 진입점이라 entry 와 같이 취급한다.
const ROOT_ENTRY = 'index.ts';

function layerOf(relative) {
  if (relative === ROOT_ENTRY) return 'entry';
  const top = relative.split('/')[0];
  return relative.includes('/') && LAYERS.includes(top) ? top : null;
}

/** src 바로 아래에 둘 수 있는 것: 진입점·스펙·선언 파일·README·네 층 폴더. */
export function topLevelViolations(entries) {
  const violations = [];
  for (const { name, directory } of entries) {
    const allowed = directory
      ? LAYERS.includes(name)
      : name === ROOT_ENTRY || name === 'README.md' || /\.spec\.ts$/.test(name) || /\.d\.ts$/.test(name);
    if (!allowed) violations.push(`${name}: extensions/src 바로 아래에는 index.ts·스펙·네 층 폴더(${LAYERS.join('·')})만 둔다`);
  }
  return violations;
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
  if (relative !== LEGACY_BRIDGE && !isSpec && DECLARE_RE.test(code)) {
    violations.push(`${relative}: declare ${code.match(DECLARE_RE)[1]} 는 ${LEGACY_BRIDGE} 만 쓴다(옛 전역 접근 경로)`);
  }
  if (relative !== LEGACY_BRIDGE && !isSpec && LEGACY_GLOBAL.test(code)) {
    violations.push(`${relative}: 옛 전역(${code.match(LEGACY_GLOBAL)[1]})은 ${LEGACY_BRIDGE} 만 참조한다`);
  }
  if (!layer) return violations;
  for (const match of code.matchAll(IMPORT_RE)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (!specifier.startsWith('.')) continue; // @kiditem/shared, zod 등 패키지는 어느 층이나 가능
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier));
    const bad = (why) => violations.push(`${relative} → ${specifier}: ${why}`);
    if (target.startsWith('../')) {
      bad('extensions/src 밖(옛 JS 등)을 import 하지 않는다');
      continue;
    }
    const targetLayer = layerOf(target) ?? (LAYERS.includes(target.split('/')[0]) ? target.split('/')[0] : null);
    if (!targetLayer) {
      if (layer !== 'entry') bad('층 밖(루트 index·src 의 다른 폴더)을 import 하지 않는다');
      continue;
    }
    const targetFile = target.split('/').slice(1).join('/').replace(/\.(ts|js)$/, '');
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
  const violations = topLevelViolations(
    readdirSync(srcDir).map((name) => ({ name, directory: statSync(path.join(srcDir, name)).isDirectory() })),
  );
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
