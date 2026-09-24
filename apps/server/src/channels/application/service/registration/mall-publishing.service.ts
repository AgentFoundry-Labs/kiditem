import type { MallPublishingPort, MallMatrixRequest, MallPreflightQuery } from "../../port/in/registration/mall-publishing.port";
export type { MallMatrixRequest, MallPreflightQuery } from "../../port/in/registration/mall-publishing.port";

import { isChannelSkuOutOfStock } from '@kiditem/shared/channel-sku-availability';
import type {
  MallAdapterManifestView,
  MallChannelOverview,
  MallChannelSummary,
  MallListingMatrixCell,
  MallListingMatrixColumn,
  MallListingMatrixResponse,
  MallListingMatrixRow,
  MallMatrixFilter,
  MallAvailabilityCandidate,
  MallAvailabilityPreview,
  MallPreflightProduct,
  MallPreflightResponse,
  MallPublishReadiness,
  MallPublishTarget,
} from '@kiditem/shared/mall-publishing';
import { CHANNEL_REGISTRY, findChannel } from '@kiditem/shared/channel-registry';
import {
  MALL_ADAPTER_MANIFESTS,
  getMallAdapterManifest,
  resolveSoldOutCommand,
  soldOutSendsByOption,
  type MallAdapterManifest,
  mallInboundSupports,
} from '../../../domain/registration/mall-adapter-manifest';
import { filledListingProfileFields } from '../../../domain/account/mall-listing-profile';
import { mallProductUrl } from '../../../domain/listing/mall-product-url';
import {
  evaluateMallPreflight,
  isKcReady,
  type PreflightAccount,
} from '../../../domain/registration/mall-publish-preflight';
import {
  countPublished,
  resolveMallListingState,
  type MallListingState,
} from '../../../domain/listing/mall-listing-state';
import type { RegistrationStatePort, SalesProductRegistrationView } from '../../port/in/registration-state.port';
import {
  MALL_PUBLISHING_REPOSITORY_PORT,
  type MallAccountRow,
  type MallListingAccountRow,
  type MallPublishingRepositoryPort,
} from '../../port/out/repository/mall-publishing.repository.port';
import {
  CHANNEL_SKU_AVAILABILITY_PORT,
  type ChannelSkuAvailabilityPort,
} from '../../port/in/channel-sku-availability.port';

/**
 * 도메인 매니페스트가 전송 규격과 어긋나면 여기서 컴파일이 깨진다.
 * 화면과 서버가 같은 모양을 본다는 걸 런타임이 아니라 타입으로 보장한다.
 */
function toManifestView(manifest: MallAdapterManifest): MallAdapterManifestView {
  return {
    ...manifest,
    hazards: { ...manifest.hazards, irreversibleStates: [...manifest.hazards.irreversibleStates] },
    preflightRules: [...manifest.preflightRules],
    requiredProfileFields: [...manifest.requiredProfileFields],
  };
}


/**
 * 매니페스트 → 화면이 켜고 끌 메뉴.
 *
 * 매니페스트를 모르는 몰은 아무것도 못 한다고 본다. 모르면서 할 수 있다고 하는
 * 것보다 못한다고 하는 편이 안전하다 — 이 값들이 파괴적 동작의 버튼을 연다.
 */
function toColumnActions(manifest: MallAdapterManifest | null | undefined) {
  if (!manifest || !manifest.applicable) {
    return {
      createListing: false,
      updateListing: false,
      soldOut: false,
      resume: false,
      setStock: false,
      soldOutDeletesListing: false,
      requiresOperatorApproval: false,
      soldOutRoute: null,
    };
  }
  return {
    createListing: manifest.supports.createListing,
    updateListing: manifest.supports.updateListing,
    soldOut: manifest.supports.soldOut,
    resume: manifest.supports.resume,
    setStock: manifest.supports.setStock !== null,
    soldOutDeletesListing: manifest.hazards.soldOutDeletesListing && manifest.soldOutRoute !== 'mall_admin',
    requiresOperatorApproval: manifest.hazards.requiresOperatorApproval,
    soldOutRoute: manifest.soldOutRoute,
  };
}

/**
 * 몰 한 곳의 등록 준비 상태. 무엇이 막고 있는지가 이 값 하나로 읽혀야 한다.
 *
 * 계정 행이 없거나 로그인이 저장돼 있지 않으면 `needs_account` 다 — 계정은 쇼핑몰 계정 화면이
 * 만든다. 등록 기본값 문서가 없으면 `needs_profile` 인데, 이것은 막는 상태가 아니다 — 그
 * 문서를 저장하는 화면이 아직 없어서(KID-235) 사람이 지금 할 수 있는 일이 없다. 송신 전
 * 점검(`profile_selected`)도 문서가 통째로 없는 것으로는 막지 않는다.
 */
function mallReadiness(
  manifest: MallAdapterManifest,
  account: MallAccountRow | null,
): MallPublishReadiness {
  if (!manifest.applicable || manifest.unverified) return 'unsupported';
  if (!account?.hasCredentials) return 'needs_account';
  if (!account.listingProfile) return 'needs_profile';
  return 'ready';
}

function toPreflightAccount(account: MallAccountRow | null): PreflightAccount | null {
  if (!account) return null;
  return {
    listingProfileFields: account.listingProfile
      ? filledListingProfileFields(account.listingProfile)
      : null,
  };
}


export class MallPublishingService implements MallPublishingPort {
  constructor(

    private readonly repository: MallPublishingRepositoryPort,

    private readonly availability: ChannelSkuAvailabilityPort,
    /** 판매 상품이 있는 칸의 등록 상태(KID-320). 쪽마다 한 번 읽는다. */
    private readonly registrationStates: RegistrationStatePort,
  ) {}

  listManifests(): MallAdapterManifestView[] {
    return MALL_ADAPTER_MANIFESTS.map(toManifestView);
  }

  /** 몰 카드 한 장씩. 무엇이 막고 있는지가 `readiness` 하나로 읽혀야 한다. */
  async listTargets(organizationId: string): Promise<MallPublishTarget[]> {
    const accounts = await this.repository.listMallAccounts(organizationId);
    const accountByKey = new Map(accounts.map((row) => [row.mallKey, row]));

    return MALL_ADAPTER_MANIFESTS.map((manifest) => {
      const account = accountByKey.get(manifest.key) ?? null;
      return {
        manifest: toManifestView(manifest),
        hasCredentials: account?.hasCredentials ?? false,
        channelAccountId: account?.channelAccountId ?? null,
        hasListingProfile: account?.listingProfile != null,
        readiness: mallReadiness(manifest, account),
      } satisfies MallPublishTarget;
    });
  }

  /**
   * "이 상품은 어느 몰에 올릴 수 있는가" 만 판정한다. 몰에는 아무것도 보내지 않는다.
   *
   * 사방넷은 이 판정을 송신 후 실패 큐로만 알려줬다. 여기서 답이 나오면
   * 몰에 나가는 요청 자체가 줄어든다.
   */
  async preflight(
    organizationId: string,
    query: MallPreflightQuery,
    asOf: Date,
  ): Promise<MallPreflightResponse> {
    const manifests = (query.mallKeys?.length
      ? query.mallKeys.flatMap((key) => {
          const manifest = getMallAdapterManifest(key);
          return manifest ? [manifest] : [];
        })
      : MALL_ADAPTER_MANIFESTS.filter((manifest) => manifest.applicable && !manifest.unverified));

    const [{ rows, total }, accounts] = await Promise.all([
      this.repository.listPreflightProducts(organizationId, {
        ...(query.search ? { search: query.search } : {}),
        ...(query.masterProductIds?.length ? { masterProductIds: query.masterProductIds } : {}),
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
      }),
      this.repository.listMallAccounts(organizationId),
    ]);
    const accountByKey = new Map(accounts.map((row) => [row.mallKey, row]));

    const products = rows.map<MallPreflightProduct>((row) => {
      const results = manifests.map((manifest) => {
        const account = accountByKey.get(manifest.key) ?? null;
        return evaluateMallPreflight({
          manifest,
          product: {
            masterProductId: row.masterProductId,
            name: row.name,
            salePrice: row.salePrice,
            imageCount: row.imageCount,
            optionNames: row.optionNames,
            // 상품×몰 카테고리 매핑은 아직 없다. 지금은 몰 계정의 등록 기본값이
            // 몰 카테고리를 직접 지정한 경우만 매핑된 것으로 센다.
            hasMallCategory: Boolean(account?.listingProfile?.categoryCode),
            certificationNumbers: row.certificationNumbers,
            kcStatus: row.kcStatus,
            stock: row.stock,
          },
          account: toPreflightAccount(account),
        });
      });
      return {
        masterProductId: row.masterProductId,
        name: row.name,
        code: row.code,
        salePrice: row.salePrice,
        imageCount: row.imageCount,
        optionNames: row.optionNames,
        hasCertification: isKcReady(row),
        results,
        eligibleMallCount: results.filter((result) => result.ok).length,
      } satisfies MallPreflightProduct;
    });

    return {
      asOf: asOf.toISOString(),
      mallKeys: manifests.map((manifest) => manifest.key),
      products,
      total,
    } satisfies MallPreflightResponse;
  }

  /**
   * 품절 송신 후보의 dry-run.
   *
   * 판매가능 재고 판정은 이미 있는 `ChannelSkuAvailability` 를 그대로 읽는다 —
   * 용량 계산 권위를 여기서 다시 만들지 않는다. 이 단계는 읽기만 한다.
   */
  async previewAvailability(
    organizationId: string,
    limit: number,
  ): Promise<MallAvailabilityPreview> {
    const page = await this.availability.list(organizationId, {
      status: 'out_of_stock',
      page: 1,
      limit,
    });

    // 상품 단위 품절 경로는 다른 옵션이 살아 있으면 안전하게 막는다. 옵션 단위
    // 경로(쿠팡 WING)는 해당 옵션만 전환하므로 그대로 보낸다.
    const listingIds = [...new Set(page.items.map((item) => item.product.id))];
    const liveOptions = new Map<string, number>();
    for (const option of await this.availability.findByListingIds(organizationId, listingIds)) {
      if (isChannelSkuOutOfStock(option)) continue;
      liveOptions.set(option.product.id, (liveOptions.get(option.product.id) ?? 0) + 1);
    }

    const candidates = page.items.map<MallAvailabilityCandidate>((item) => {
      const manifest = getMallAdapterManifest(item.channelAccount.channel);
      const channel = findChannel(item.channelAccount.channel);
      const base = {
        channelListingOptionId: item.sku.id,
        channelAccountId: item.channelAccount.id,
        mallKey: item.channelAccount.channel,
        mallName: manifest?.name ?? channel?.name ?? item.channelAccount.channel,
        channelAccountName: item.channelAccount.name,
        productName: item.product.displayName
          ?? item.product.registeredName
          ?? item.product.externalProductId,
        optionName: item.sku.optionName ?? item.sku.sellerSku ?? item.sku.externalSkuId,
        sellerSku: item.sku.sellerSku,
        mallProductCode: item.product.externalProductId,
        mallOptionCode: item.sku.externalSkuId,
        sellableStock: item.sku.sellableStock,
        bottleneckCodes: item.components
          .filter((component) => component.isBottleneck)
          .flatMap((component) => component.code === null ? [] : [component.code]),
        desiredState: 'sold_out' as const,
      };

      if (!manifest) {
        return {
          ...base,
          sendable: false,
          effectiveState: null,
          blockedReason: channel
            ? `${channel.name}은(는) 몰 상품등록·품절 송신 대상이 아닙니다.`
            : `${item.channelAccount.channel} 매니페스트가 없습니다.`,
        };
      }
      const resolved = resolveSoldOutCommand(manifest);
      if (!resolved.allowed) {
        return { ...base, sendable: false, effectiveState: null, blockedReason: resolved.reason };
      }
      const live = soldOutSendsByOption(manifest.key) ? 0 : liveOptions.get(item.product.id) ?? 0;
      if (live > 0) {
        return {
          ...base,
          sendable: false,
          effectiveState: null,
          blockedReason: `이 상품의 다른 옵션 ${live}개는 품절이 아니라(재고 있음 · 모름) 상품 전체를 멈추지 않습니다.`,
        };
      }
      return { ...base, sendable: true, effectiveState: resolved.downgradedTo, blockedReason: null };
    });
    return {
      candidates,
      total: page.total,
      loaded: candidates.length,
      sendableCount: candidates.filter((candidate) => candidate.sendable).length,
      blockedCount: candidates.filter((candidate) => !candidate.sendable).length,
      // 레시피가 확정되지 않은 옵션은 품절 후보가 아니다. 판정할 수 없다고 따로 센다.
      noRecipeCount: page.summary.unmatched,
    } satisfies MallAvailabilityPreview;
  }

  /**
   * 상품 × 몰 등록 현황.
   *
   * 열은 **우리가 리스팅을 가져온 계정**이다. 레지스트리에 채널이 29개 있어도
   * 리스팅을 모르는 채널은 칸을 채울 수 없다 — 전부 '미등록'으로 칠하면 그 몰에
   * 상품이 1,000개 올라가 있어도 하나도 없는 것처럼 보인다. 그래서 열마다
   * `imported` 를 실어 화면이 그 차이를 말할 수 있게 한다.
   *
   * `mallKeys` 로 요청한 몰은 리스팅이 없어도 열로 세운다. 아직 안 가져온 몰에
   * 무엇을 보낼지 고르려면 그 열이 보여야 하기 때문이다.
   */
  async listingMatrix(
    organizationId: string,
    query: MallMatrixRequest,
  ): Promise<MallListingMatrixResponse> {
    const [accounts, mallAccounts] = await Promise.all([
      this.repository.listAccountsWithListings(organizationId),
      this.repository.listMallAccounts(organizationId),
    ]);

    const columns = this.buildMatrixColumns(accounts, mallAccounts, query.mallKeys ?? []);
    const columnAccountIds = columns
      .map((column) => column.channelAccountId)
      .filter((id): id is string => id !== null);

    const filter: MallMatrixFilter = query.filter ?? 'listed';
    const { rows, total } = await this.repository.listMatrixProducts(organizationId, {
      ...(query.search ? { search: query.search } : {}),
      ...(columnAccountIds.length > 0 ? { channelAccountIds: columnAccountIds } : {}),
      ...(filter === 'listed' ? { listed: true } : {}),
      ...(filter === 'unlisted' ? { listed: false } : {}),
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });

    const mallKeyByAccount = new Map(
      columns.flatMap((column) =>
        column.channelAccountId ? [[column.channelAccountId, column.mallKey] as const] : [],
      ),
    );

    const salesProductIds = [...new Set(rows.flatMap((row) =>
      row.listings.flatMap((listing) => listing.salesProductId ? [listing.salesProductId] : [])))];
    const registrations = salesProductIds.length > 0
      ? await this.registrationStates.readForSalesProducts(organizationId, salesProductIds)
      : new Map<string, SalesProductRegistrationView>();

    const matrixRows = rows.map<MallListingMatrixRow>((row) => {
      const listingByMall = new Map(
        row.listings.flatMap((listing) => {
          const mallKey = mallKeyByAccount.get(listing.channelAccountId);
          return mallKey ? [[mallKey, listing] as const] : [];
        }),
      );

      const resolvedStates: MallListingState[] = [];
      const cells = columns.map<MallListingMatrixCell>((column) => {
        const listing = listingByMall.get(column.mallKey) ?? null;
        const resolved = resolveMallListingState({
          hasListing: listing !== null,
          listingStatus: listing?.status ?? null,
        });
        resolvedStates.push(resolved.state);
        // 계정 줄이 리스팅을 가리키면 이 칸의 리스팅일 때만 싣는다 — 옛 리스팅이 새 리스팅의 상태를 빌리지 않는다.
        const registration = listing?.salesProductId
          ? registrations.get(listing.salesProductId)?.accounts
            .find((account) => account.channelAccountId === listing.channelAccountId
              && (account.channelListingId === null || account.channelListingId === listing.id)) ?? null
          : null;
        return {
          mallKey: column.mallKey,
          state: resolved.state,
          registration,
          rawStatus: listing?.status ?? null,
          externalId: listing?.externalId ?? null,
          productUrl: listing
            ? mallProductUrl(column.mallKey, listing.externalId, listing.storefrontProductId)
            : null,
          warning: resolved.warning,
          updatedAt: listing?.updatedAt.toISOString() ?? null,
        } satisfies MallListingMatrixCell;
      });

      return {
        masterProductId: row.masterProductId,
        code: row.code,
        sellpiaCode: row.sellpiaCode,
        name: row.name,
        imageUrl: row.imageUrl,
        // 카테고리는 마스터에 저장돼 있지 않다. 리스팅이 들고 있는 값을 회수한다.
        category: row.listings.find((listing) => listing.category)?.category ?? null,
        stock: row.stock,
        publishedCount: countPublished(resolvedStates),
        cells,
        updatedAt: row.updatedAt.toISOString(),
      } satisfies MallListingMatrixRow;
    });

    return {
      filter,
      columns,
      rows: matrixRows,
      total,
      page: query.page,
      limit: query.limit,
    } satisfies MallListingMatrixResponse;
  }

  /**
   * 열을 세운다.
   *
   * **연결된 몰은 전부 열이 된다.** 리스팅을 가진 몰이 왼쪽(리스팅 수 내림차순),
   * 계정만 연결된 몰이 오른쪽이다. 우리가 파는 곳이 25곳인데 2곳만 보여주면
   * 나머지 23곳에 무엇을 안 올렸는지가 화면에서 사라진다 — 그게 이 표로 답해야
   * 하는 질문이다.
   *
   * 대신 아직 리스팅을 가져오지 않은 열은 `imported: false` 로 표시한다. 그 열의
   * 빈 칸은 '몰에 없다'가 아니라 '우리가 모른다'이고, 둘은 다른 사실이다.
   */
  private buildMatrixColumns(
    accounts: readonly MallListingAccountRow[],
    mallAccounts: readonly MallAccountRow[],
    requestedMallKeys: readonly string[],
  ): MallListingMatrixColumn[] {
    const withListings = [...accounts]
      .sort((left, right) => right.listingCount - left.listingCount)
      .map<MallListingMatrixColumn>((account) => {
        // 계정 행의 채널이 곧 몰 키다(ADR-0012).
        const mallKey = account.channel;
        const manifest = getMallAdapterManifest(mallKey);
        return {
          mallKey,
          mallName: manifest?.name ?? account.name,
          channelAccountId: account.channelAccountId,
          hasAdapter: manifest?.applicable === true && manifest.supports.createListing,
          imported: true,
          listingCount: account.listingCount,
          actions: toColumnActions(manifest),
        } satisfies MallListingMatrixColumn;
      });

    const seen = new Set(withListings.map((column) => column.mallKey));

    // 연결된 몰 전부 + 명시적으로 요청한 몰. 매니페스트에 없는 키는 버린다.
    const candidateKeys = [
      ...mallAccounts.map((row) => row.mallKey),
      ...requestedMallKeys,
    ];

    const rest = candidateKeys.flatMap<MallListingMatrixColumn>((mallKey) => {
      if (seen.has(mallKey)) return [];
      const manifest = getMallAdapterManifest(mallKey);
      if (!manifest) return [];
      seen.add(mallKey);
      const account = mallAccounts.find((row) => row.mallKey === mallKey) ?? null;
      return [{
        mallKey,
        mallName: manifest.name,
        channelAccountId: account?.channelAccountId ?? null,
        hasAdapter: manifest.applicable && manifest.supports.createListing,
        // 리스팅을 한 번도 가져온 적이 없다. 이 열의 '미등록'은 "몰에 없다"가
        // 아니라 "우리가 모른다"는 뜻이고, 화면이 그렇게 말해야 한다.
        imported: false,
        listingCount: 0,
        actions: toColumnActions(manifest),
      } satisfies MallListingMatrixColumn];
    });

    // 보낼 수 있는 몰을 앞으로. 등록 경로가 있는 곳이 먼저 눈에 들어와야 한다.
    rest.sort((left, right) => {
      if (left.hasAdapter !== right.hasAdapter) return left.hasAdapter ? -1 : 1;
      return left.mallName.localeCompare(right.mallName, 'ko');
    });

    return [...withListings, ...rest];
  }

  /**
   * 연결된 몰 전체 요약. 허브 화면이 쓴다.
   *
   * 숫자는 전부 우리 DB 에서 센 것이다. 몰에 물어본 값이 아니라 우리가 가져온
   * 만큼이고, 그 차이는 `imported` 가 말한다.
   */
  async channelOverview(organizationId: string): Promise<MallChannelOverview> {
    const [mallAccounts, accounts, orderCounts, productCount] = await Promise.all([
      this.repository.listMallAccounts(organizationId),
      this.repository.listAccountsWithListings(organizationId),
      this.repository.countOrdersByAccount(organizationId),
      this.repository.countVisibleMasterProducts(organizationId),
    ]);

    const mallAccountByKey = new Map(mallAccounts.map((row) => [row.mallKey, row]));
    const listingAccountById = new Map(accounts.map((row) => [row.channelAccountId, row]));
    const ordersByAccount = new Map(
      orderCounts.map((row) => [row.channelAccountId, row.orderCount]),
    );

    // 허브는 몰과 마켓을 함께 센다 — 쿠팡 로켓은 몰 등록 마법사에 서지 않지만 연결된
    // 채널이고 주문이 들어온다. 목록은 채널 레지스트리, 등록 사정은 매니페스트다.
    const channels = CHANNEL_REGISTRY.flatMap<MallChannelSummary>((entry) => {
      const mallAccount = mallAccountByKey.get(entry.key) ?? null;
      const account = mallAccount
        ? listingAccountById.get(mallAccount.channelAccountId) ?? null
        : null;
      const listingCount = account?.listingCount ?? 0;
      const orderCount = mallAccount ? ordersByAccount.get(mallAccount.channelAccountId) ?? 0 : 0;

      // 계정 행이 없는 채널은 허브에 걸지 않는다. 29개를 전부 그리면 실제로 쓰는 몰이
      // 안 보인다.
      if (!mallAccount) return [];

      const manifest = getMallAdapterManifest(entry.key);
      return [{
        mallKey: entry.key,
        mallName: entry.name,
        channelAccountId: mallAccount.channelAccountId,
        canPublish: manifest?.applicable === true && manifest.supports.createListing,
        hasCredentials: mallAccount.hasCredentials,
        imported: listingCount > 0,
        // 몰 → 우리 방향. 상품등록과 반대라 레지스트리가 따로 들고 있다.
        ...mallInboundSupports(entry.key),
        listingCount,
        orderCount,
        productCount: account?.productCount ?? 0,
        onSaleProductCount: account?.onSaleProductCount ?? 0,
        onSaleListingCount: account?.onSaleListingCount ?? 0,
        onSaleLinkedListingCount: account?.onSaleLinkedListingCount ?? 0,
        optionCount: account?.optionCount ?? 0,
        matchedOptionCount: account?.matchedOptionCount ?? 0,
        onSaleOptionCount: account?.onSaleOptionCount ?? 0,
        onSaleMatchedOptionCount: account?.onSaleMatchedOptionCount ?? 0,
        readiness: manifest ? mallReadiness(manifest, mallAccount) : 'unsupported',
      } satisfies MallChannelSummary];
    });

    return {
      shop: {
        productCount,
        connectedChannelCount: channels.length,
        publishableChannelCount: channels.filter((channel) => channel.canPublish).length,
      },
      channels,
    } satisfies MallChannelOverview;
  }
}
