import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHANNEL_REGISTRY, MALL_CHANNELS } from '@kiditem/shared/channel-registry';
import { MALL_OPERATION_OUTCOME_KEY_ALIASES } from '@kiditem/shared/mall-operation-outcomes';
import { MALL_ADAPTER_MANIFESTS } from './mall-adapter-manifest';

/**
 * 채널 레지스트리가 아직 남아 있는 사본들과 같은 것을 말하는지 증명한다 — **확장 단계의
 * 임시 비계**다.
 *
 * 사본이 레지스트리에서 파생되도록 옮겨질 때마다 그 사본의 단언은 여기서 빠지고, 마지막
 * 사본이 사라지면 이 파일도 사라진다. 그때 남는 것은 레지스트리 자신의 내용 명세
 * (`packages/shared/src/channel-registry.spec.ts`)뿐이다.
 *
 * 서버 쪽 사본(주문수집 카탈로그 · 몰 등록 매니페스트 · 몰 계정 시드)은 이미 레지스트리에서
 * 파생되므로 여기서 대조하지 않는다 — 자기 자신과 비교하는 명세는 아무것도 지키지 못한다.
 */
function repoRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(dir, 'extensions', 'kiditem-os'))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('repository root not found');
    dir = parent;
  }
  return dir;
}

const ROOT = repoRoot();

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), 'utf8');
}

/** `const SPECS = { … };` 블록 안의 최상위 키들. 확장은 빌드가 없어 파일을 읽어 본다. */
function specKeys(source: string): string[] {
  const start = source.indexOf('const SPECS = ');
  if (start < 0) throw new Error('SPECS block not found');
  const end = source.slice(start).search(/\n {2}\}[);]/);
  if (end < 0) throw new Error('SPECS block end not found');
  const block = source.slice(start, start + end);
  const keys: string[] = [];
  for (const match of block.matchAll(/^ {4}(?:"([^"]+)"|([A-Za-z0-9_$-]+)): (?:Object\.freeze\()?\{/gm)) {
    keys.push(match[1] ?? match[2]!);
  }
  return [...new Set(keys)];
}

const registryKeys = new Set(CHANNEL_REGISTRY.map((entry) => entry.key));

describe('채널 레지스트리 = 아직 남은 사본들', () => {
  it('⭐ 몰 등록 매니페스트는 레지스트리의 몰을 순서까지 그대로 담는다', () => {
    expect(MALL_ADAPTER_MANIFESTS.map((entry) => entry.key))
      .toEqual(MALL_CHANNELS.map((entry) => entry.key));
  });

  /** `@kiditem/shared` 의 별칭 표는 아직 손으로 적혀 있다. 레지스트리로 옮길 때 사라진다. */
  it('⭐ 관찰 기록 별칭 표가 레지스트리의 공유 계정 행과 같다', () => {
    const shared: Record<string, string> = {};
    for (const entry of CHANNEL_REGISTRY) {
      if (entry.sharedAccountChannel) shared[entry.key] = entry.sharedAccountChannel;
    }
    expect(shared).toEqual({ ...MALL_OPERATION_OUTCOME_KEY_ALIASES });
  });

  it('⭐ 웹 로고 표가 레지스트리의 로고와 같고, 파일이 실제로 있다', () => {
    for (const entry of CHANNEL_REGISTRY) {
      if (entry.logo === null) continue;
      expect([entry.key, existsSync(path.join(ROOT, 'apps/web/public', entry.logo))])
        .toEqual([entry.key, true]);
    }
    expect(CHANNEL_REGISTRY.filter((entry) => entry.logo === null).map((entry) => entry.key))
      .toEqual(['one-polaris']);

    const webTable = readRepoFile('apps/web/src/app/(channels)/_shared/mall-presentation.ts');
    const fromWeb = [...webTable.matchAll(/^ {2}'([^']+)': '(\/mall-logos\/[^']+)',$/gm)]
      .map(([, key, logo]) => [key, logo]);
    expect(Object.fromEntries(fromWeb)).toEqual(
      Object.fromEntries(
        CHANNEL_REGISTRY.filter((entry) => entry.logo !== null).map((entry) => [entry.key, entry.logo]),
      ),
    );
  });

  /**
   * 확장 `mall-form-register.js` 의 SPECS 키만 제 철자를 쓰고 있고, 웹이 `MALL_ACCOUNT_KEY`
   * 로 번역해 넘긴다. 옮긴 뒤에는 SPECS 키가 곧 채널 키다(옥션은 지마켓 ESM 폼을 함께 쓴다).
   */
  it('확장 폼 스펙 키는 채널 키로 옮겨진다', () => {
    const CANONICAL: Record<string, string> = {
      gsshop: 'gs-shop',
      lotteon: 'lotte-on',
      artgonggu: 'art09',
      alwayz: 'always',
      teacherville: 'teacher-mall',
      icecream: 'icecream-mall',
      esmplus: 'gmarket',
    };
    const keys = specKeys(readRepoFile('extensions/kiditem-os/background/orders/mall-form-register.js'))
      .map((key) => CANONICAL[key] ?? key);
    expect(keys.filter((key) => !registryKeys.has(key))).toEqual([]);
  });

  it('확장 세션 프로브 키는 이미 채널 키다', () => {
    const keys = specKeys(readRepoFile('extensions/kiditem-os/background/orders/mall-session-probe.js'));
    expect(keys.filter((key) => !registryKeys.has(key))).toEqual([]);
  });
});
