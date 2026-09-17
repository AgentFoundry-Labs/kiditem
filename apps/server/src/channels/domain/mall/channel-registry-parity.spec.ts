import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CHANNEL_REGISTRY,
  MALL_CHANNELS,
  MARKETPLACE_CHANNELS,
  channelRegistersListings,
  type ChannelRegistryEntry,
} from '@kiditem/shared/channel-registry';
import { MALL_OPERATION_OUTCOME_KEY_ALIASES } from '@kiditem/shared/mall-operation-outcomes';
import {
  ORDER_COLLECTION_MALLS,
  type OrderCollectionMallEntry,
} from '../../../orders/domain/order-collection-malls';
import { ORDER_COLLECTION_MALL_ENV } from '../../../orders/seed-order-collection-mall-accounts';
import { MALL_ADAPTER_MANIFESTS, mallInboundSupports } from './mall-adapter-manifest';

/**
 * 채널 레지스트리가 흩어진 사본들과 같은 것을 말하는지 증명한다 — **확장 단계의 임시 비계**다.
 *
 * 사본이 하나씩 레지스트리에서 파생되도록 옮겨질 때마다 그 사본의 단언은 여기서 빠지고,
 * 마지막 사본이 사라지면 이 파일도 사라진다. 그때 남는 것은 레지스트리 자신의 내용 명세
 * (`channel-registry.spec.ts`)뿐이다.
 *
 * 레지스트리가 사본을 **고치는** 자리는 따로 적는다. 카카오는 확장에 `collectKakaoOrders`
 * 가 있는데 서버만 모르고 있었고, 몰 이름은 세 곳에서 두 갈래로 갈려 있었다.
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

const mallKeys = MALL_CHANNELS.map((entry) => entry.key);
const registryByKey = new Map<string, ChannelRegistryEntry>(
  CHANNEL_REGISTRY.map((entry) => [entry.key, entry]),
);

describe('채널 레지스트리 = 흩어진 사본들', () => {
  it('⭐ 몰 27 + 마켓 2 이고 키가 겹치지 않는다', () => {
    expect(CHANNEL_REGISTRY).toHaveLength(29);
    expect(MALL_CHANNELS).toHaveLength(27);
    expect(MARKETPLACE_CHANNELS.map((entry) => entry.key)).toEqual(['coupang', 'rocket']);
    expect(new Set(CHANNEL_REGISTRY.map((entry) => entry.key)).size).toBe(29);
  });

  it('⭐ 주문수집 카탈로그(서버 Orders)와 몰 키가 순서까지 같다', () => {
    expect(mallKeys).toEqual(ORDER_COLLECTION_MALLS.map((mall) => mall.key));
  });

  it('⭐ 몰 계정 시드의 환경변수 표와 몰 키가 순서까지 같다', () => {
    expect(ORDER_COLLECTION_MALL_ENV.map((mall) => mall.key)).toEqual(mallKeys);
  });

  it('⭐ 몰 등록 매니페스트와 채널 키가 같다', () => {
    expect(new Set(MALL_ADAPTER_MANIFESTS.map((entry) => entry.key))).toEqual(
      new Set(CHANNEL_REGISTRY.map((entry) => entry.key)),
    );
  });

  it('⭐ 공유 계정 행이 주문수집 카탈로그 · 관찰 기록 별칭 표와 같다', () => {
    const shared: Record<string, string> = {};
    for (const entry of CHANNEL_REGISTRY) {
      if (entry.sharedAccountChannel) shared[entry.key] = entry.sharedAccountChannel;
    }
    expect(shared).toEqual({ 'coupang-direct': 'rocket' });
    expect(shared).toEqual({ ...MALL_OPERATION_OUTCOME_KEY_ALIASES });

    const fromCatalog: Record<string, string> = {};
    for (const mall of ORDER_COLLECTION_MALLS as readonly OrderCollectionMallEntry[]) {
      if (mall.sharedAccountChannel) fromCatalog[mall.key] = mall.sharedAccountChannel;
    }
    expect(fromCatalog).toEqual(shared);
  });

  it('⭐ 등록 방식 · 검증 여부가 매니페스트의 kind · unverified · applicable 과 같다', () => {
    const KIND_OF = { api: 'api', form: 'extension_form', excel: 'extension_excel', none: 'unknown' } as const;
    for (const manifest of MALL_ADAPTER_MANIFESTS) {
      const entry = registryByKey.get(manifest.key)!;
      expect({ key: manifest.key, kind: manifest.kind, unverified: manifest.unverified, applicable: manifest.applicable })
        .toEqual({
          key: entry.key,
          kind: KIND_OF[entry.register],
          unverified: !entry.verified,
          applicable: channelRegistersListings(entry),
        });
    }
  });

  it('⭐ 송장 송신 능력이 매니페스트와 같다', () => {
    for (const entry of CHANNEL_REGISTRY) {
      expect([entry.key, mallInboundSupports(entry.key).uploadsTracking])
        .toEqual([entry.key, entry.uploadTracking]);
    }
  });

  it('⭐ 셀피아가 가져오는 채널이 매니페스트와 같다', () => {
    for (const entry of CHANNEL_REGISTRY) {
      const via = mallInboundSupports(entry.key).orderCollectionVia;
      expect([entry.key, via === 'sellpia']).toEqual([entry.key, entry.collector === 'sellpia']);
    }
  });

  /**
   * 레지스트리가 사본을 고치는 자리 1 — 카카오.
   *
   * 확장에 `collectKakaoOrders` 가 있고 웹 `isBrowserCollectableMall` 도 카카오를 수집 가능으로
   * 두는데, 서버 매니페스트만 빠뜨려 `/mall-channels` 가 '아직' 이라고 그렸다.
   */
  it('⭐ 우리 확장이 가져오는 채널은 카카오를 더한 것이다', () => {
    const fromManifest = CHANNEL_REGISTRY
      .filter((entry) => mallInboundSupports(entry.key).orderCollectionVia === 'kiditem')
      .map((entry) => entry.key);
    const fromRegistry = CHANNEL_REGISTRY
      .filter((entry) => entry.collector === 'extension')
      .map((entry) => entry.key);
    expect(fromRegistry).toEqual(expect.arrayContaining(fromManifest));
    expect(fromRegistry.filter((key) => !fromManifest.includes(key))).toEqual(['kakao']);
    expect(readRepoFile('extensions/kiditem-os/background/orders/worker.js'))
      .toContain('collectKakaoOrders');
  });

  /**
   * 레지스트리가 사본을 고치는 자리 2 — 이름.
   *
   * 같은 몰을 주문수집 카탈로그는 짧게, 매니페스트는 길게 불렀다. 레지스트리는 더 정확한
   * 쪽(매니페스트)을 쓴다 — '토스' 는 결제앱이고 '카카오' 는 회사 이름이다.
   */
  it('⭐ 이름은 매니페스트 쪽으로 통일하고, 갈라져 있던 곳은 세 곳뿐이다', () => {
    for (const manifest of MALL_ADAPTER_MANIFESTS) {
      expect([manifest.key, manifest.name]).toEqual([manifest.key, registryByKey.get(manifest.key)!.name]);
    }
    const renamed = ORDER_COLLECTION_MALLS
      .filter((mall) => registryByKey.get(mall.key)!.name !== mall.name)
      .map((mall) => mall.key);
    expect(renamed).toEqual(['kakao', 'toss', 'ssg']);
  });

  it('⭐ 로고는 웹 public 에 파일이 있는 것만 적고, 원폴라리스만 비어 있다', () => {
    for (const entry of CHANNEL_REGISTRY) {
      if (entry.logo === null) continue;
      expect([entry.key, existsSync(path.join(ROOT, 'apps/web/public', entry.logo))]).toEqual([entry.key, true]);
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
   * 레지스트리가 사본을 고치는 자리 3 — 확장 폼 스펙의 철자.
   *
   * 확장 `mall-form-register.js` 의 SPECS 키만 제 철자를 쓰고 있었고, 웹이 `MALL_ACCOUNT_KEY`
   * 로 번역해 넘겼다. 옮긴 뒤에는 SPECS 키가 곧 채널 키다(옥션은 지마켓 ESM 폼을 함께 쓴다).
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
    expect(keys.filter((key) => !registryByKey.has(key))).toEqual([]);
  });

  it('확장 세션 프로브 키는 이미 채널 키다', () => {
    const keys = specKeys(readRepoFile('extensions/kiditem-os/background/orders/mall-session-probe.js'));
    expect(keys.filter((key) => !registryByKey.has(key))).toEqual([]);
  });
});
