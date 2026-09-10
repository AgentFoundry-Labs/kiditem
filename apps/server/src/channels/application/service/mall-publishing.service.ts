import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
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
  MallListingProfile,
  MallNoticeBackfillResult,
  MallPreflightProduct,
  MallPreflightResponse,
  MallProfileField,
  MallPublishTarget,
  UpsertMallListingProfile,
} from '@kiditem/shared/mall-publishing';
import {
  MALL_ADAPTER_MANIFESTS,
  getMallAdapterManifest,
  resolveSoldOutCommand,
  type MallAdapterManifest,
} from '../../domain/mall/mall-adapter-manifest';
import {
  evaluateMallPreflight,
  type PreflightProfile,
} from '../../domain/mall/mall-publish-preflight';
import {
  countPublished,
  resolveMallListingState,
} from '../../domain/mall/mall-listing-state';
import {
  buildCoupangNoticeDraft,
  COUPANG_UNAVAILABLE_FIELDS,
  type CoupangNoticeDraft,
} from '../../domain/mall/coupang-notice-backfill';
import { missingNoticeFields } from '../../domain/mall/product-notice-fields';
import {
  MALL_PUBLISHING_REPOSITORY_PORT,
  type MallAccountAnchorRow,
  type MallListingAccountRow,
  type MallProfileRow,
  type MallPublishingRepositoryPort,
} from '../port/out/repository/mall-publishing.repository.port';
import {
  CHANNEL_SKU_AVAILABILITY_PORT,
  type ChannelSkuAvailabilityPort,
} from '../port/in/channel-sku-availability.port';

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
    };
  }
  return {
    createListing: manifest.supports.createListing,
    updateListing: manifest.supports.updateListing,
    soldOut: manifest.supports.soldOut,
    resume: manifest.supports.resume,
    setStock: manifest.supports.setStock !== null,
    soldOutDeletesListing: manifest.hazards.soldOutDeletesListing,
    requiresOperatorApproval: manifest.hazards.requiresOperatorApproval,
  };
}

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return true;
}

/**
 * 프로필이 실제로 채운 필드.
 *
 * 저장돼 있다는 것과 값이 들어 있다는 것은 다르다. 검증기는 값 기준으로 본다 —
 * 빈 JSON 이 들어 있는 프로필로 송신이 시작되면 몰이 거절한다.
 */
function filledProfileFields(row: MallProfileRow): MallProfileField[] {
  const address = (row.addressJson ?? {}) as Record<string, unknown>;
  const fields: MallProfileField[] = [];
  if (isFilled(row.shippingJson)) fields.push('shipping');
  if (isFilled(row.returnJson)) fields.push('returnPolicy');
  if (isFilled(address.release)) fields.push('releaseAddress');
  if (isFilled(address.return)) fields.push('returnAddress');
  if (isFilled(row.asPhone)) fields.push('asPhone');
  return fields;
}

function toProfileView(row: MallProfileRow): MallListingProfile {
  return {
    id: row.id,
    channelAccountId: row.channelAccountId,
    mallKey: row.mallKey,
    name: row.name,
    isDefault: row.isDefault,
    isActive: row.isActive,
    asPhone: row.asPhone,
    categoryCode: row.categoryCode,
    namePrefix: row.namePrefix,
    nameSuffix: row.nameSuffix,
    shippingJson: row.shippingJson ?? null,
    returnJson: row.returnJson ?? null,
    addressJson: row.addressJson ?? null,
    filledFields: filledProfileFields(row),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPreflightProfile(row: MallProfileRow | null): PreflightProfile | null {
  return row
    ? { id: row.id, name: row.name, filledFields: filledProfileFields(row) }
    : null;
}

export interface MallMatrixRequest {
  search?: string;
  /** 열로 세울 몰. 비면 리스팅이 있는 몰 전부. */
  mallKeys?: string[];
  filter?: MallMatrixFilter;
  page: number;
  limit: number;
}

export interface MallPreflightQuery {
  mallKeys?: string[];
  masterProductIds?: string[];
  search?: string;
  page: number;
  limit: number;
}

@Injectable()
export class MallPublishingService {
  constructor(
    @Inject(MALL_PUBLISHING_REPOSITORY_PORT)
    private readonly repository: MallPublishingRepositoryPort,
    @Inject(CHANNEL_SKU_AVAILABILITY_PORT)
    private readonly availability: ChannelSkuAvailabilityPort,
  ) {}

  listManifests(): MallAdapterManifestView[] {
    return MALL_ADAPTER_MANIFESTS.map(toManifestView);
  }

  /** 몰 카드 한 장씩. 무엇이 막고 있는지가 `readiness` 하나로 읽혀야 한다. */
  async listTargets(organizationId: string): Promise<MallPublishTarget[]> {
    const [anchors, profiles] = await Promise.all([
      this.repository.listMallAccountAnchors(organizationId),
      this.repository.listProfiles(organizationId),
    ]);
    const anchorByKey = new Map(anchors.map((row) => [row.mallKey, row]));
    const profilesByKey = new Map<string, MallProfileRow[]>();
    for (const profile of profiles) {
      const bucket = profilesByKey.get(profile.mallKey) ?? [];
      bucket.push(profile);
      profilesByKey.set(profile.mallKey, bucket);
    }

    return MALL_ADAPTER_MANIFESTS.map((manifest) => {
      const anchor = anchorByKey.get(manifest.key) ?? null;
      const mallProfiles = profilesByKey.get(manifest.key) ?? [];
      const defaultProfile = mallProfiles.find((profile) => profile.isDefault) ?? null;
      const hasCredentials = anchor?.hasCredentials ?? false;

      const readiness: MallPublishTarget['readiness'] = !manifest.applicable || manifest.unverified
        ? 'unsupported'
        : !hasCredentials
          ? 'needs_account'
          : !anchor
            ? 'needs_promotion'
            : mallProfiles.length === 0
              ? 'needs_profile'
              : 'ready';

      return {
        manifest: toManifestView(manifest),
        hasCredentials,
        channelAccountId: anchor?.channelAccountId ?? null,
        profileCount: mallProfiles.length,
        defaultProfileId: defaultProfile?.id ?? null,
        readiness,
      };
    });
  }

  async listProfiles(organizationId: string, mallKey?: string): Promise<MallListingProfile[]> {
    const rows = await this.repository.listProfiles(organizationId);
    return rows
      .filter((row) => !mallKey || row.mallKey === mallKey)
      .map(toProfileView);
  }

  async createProfile(
    organizationId: string,
    mallKey: string,
    input: UpsertMallListingProfile,
  ): Promise<MallListingProfile> {
    const manifest = getMallAdapterManifest(mallKey);
    if (!manifest) throw new NotFoundException(`알 수 없는 몰입니다 — ${mallKey}`);
    if (!manifest.applicable) {
      throw new BadRequestException(`${manifest.name}은(는) 상품 판매 채널이 아닙니다.`);
    }
    const account = await this.repository.ensureMallAccountAnchor({
      organizationId,
      mallKey,
      mallName: manifest.name,
    });
    const row = await this.repository.createProfile({
      organizationId,
      channelAccountId: account.id,
      data: input,
    });
    return toProfileView(row);
  }

  async updateProfile(
    organizationId: string,
    profileId: string,
    input: UpsertMallListingProfile,
  ): Promise<MallListingProfile> {
    const row = await this.repository.updateProfile({ organizationId, profileId, data: input });
    return toProfileView(row);
  }

  async deleteProfile(organizationId: string, profileId: string): Promise<void> {
    await this.repository.softDeleteProfile(organizationId, profileId);
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

    const [{ rows, total }, profileRows] = await Promise.all([
      this.repository.listPreflightProducts(organizationId, {
        ...(query.search ? { search: query.search } : {}),
        ...(query.masterProductIds?.length ? { masterProductIds: query.masterProductIds } : {}),
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
      }),
      this.repository.listProfiles(organizationId),
    ]);

    const defaultProfileByMall = new Map<string, MallProfileRow>();
    for (const profile of profileRows) {
      const current = defaultProfileByMall.get(profile.mallKey);
      if (!current || (profile.isDefault && !current.isDefault)) {
        defaultProfileByMall.set(profile.mallKey, profile);
      }
    }

    const products = rows.map<MallPreflightProduct>((row) => {
      const noticeMissingFields = missingNoticeFields(row.noticeCategory, row.noticeAttributes);
      const results = manifests.map((manifest) => {
        const profileRow = defaultProfileByMall.get(manifest.key) ?? null;
        return evaluateMallPreflight({
          manifest,
          product: {
            masterProductId: row.masterProductId,
            name: row.name,
            salePrice: row.salePrice,
            imageCount: row.imageCount,
            optionNames: row.optionNames,
            // 상품×몰 카테고리 매핑(MallCategoryLink)은 아직 없다. 지금은 프로필이
            // 몰 카테고리를 직접 지정한 경우만 매핑된 것으로 센다.
            hasMallCategory: Boolean(profileRow?.categoryCode),
            noticeCategory: row.noticeCategory,
            noticeMissingFields,
            certification: row.certification,
          },
          profile: toPreflightProfile(profileRow),
          asOf,
        });
      });
      return {
        masterProductId: row.masterProductId,
        name: row.name,
        code: row.code,
        salePrice: row.salePrice,
        imageCount: row.imageCount,
        optionNames: row.optionNames,
        hasNotice: row.noticeCategory !== null && noticeMissingFields.length === 0,
        hasCertification: row.certification !== null,
        results,
        eligibleMallCount: results.filter((result) => result.ok).length,
      };
    });

    return {
      asOf: asOf.toISOString(),
      mallKeys: manifests.map((manifest) => manifest.key),
      products,
      total,
    };
  }

  /**
   * 쿠팡 리스팅에서 상품정보고시를 역추출한다.
   *
   * 채울 수 있는 것만 채운다. Wing 상품목록에는 제조국·KC 인증번호·A/S 책임자가
   * 없으므로 이 작업만으로 송신 가능해지는 상품은 0건이다 — 그래서 고시 카테고리를
   * 잘못 추정해도 잘못된 송신으로 이어지지 않는다.
   *
   * 운영자가 직접 넣은 고시(`source='manual'`)는 건드리지 않는다.
   */
  async backfillNoticesFromCoupang(
    organizationId: string,
    options: { dryRun: boolean },
  ): Promise<MallNoticeBackfillResult> {
    const [sources, existing] = await Promise.all([
      this.repository.listCoupangNoticeSources(organizationId),
      this.repository.listExistingDefaultNotices(organizationId),
    ]);

    // 한 상품에 리스팅이 여러 개 붙어 있으면 가장 많이 채워진 쪽을 쓴다.
    const bestByProduct = new Map<string, CoupangNoticeDraft>();
    for (const source of sources) {
      const draft = buildCoupangNoticeDraft(source);
      const current = bestByProduct.get(draft.masterProductId);
      if (!current || draft.filledFields.length > current.filledFields.length) {
        bestByProduct.set(draft.masterProductId, draft);
      }
    }

    const manualProductIds = new Set(
      existing.filter((row) => row.source === 'manual').map((row) => row.masterProductId),
    );
    const drafts = [...bestByProduct.values()]
      .filter((draft) => !manualProductIds.has(draft.masterProductId));

    const fieldFillCounts: Record<string, number> = {};
    const stillMissingCounts: Record<string, number> = {};
    for (const draft of drafts) {
      for (const field of draft.filledFields) {
        fieldFillCounts[field] = (fieldFillCounts[field] ?? 0) + 1;
      }
      for (const field of draft.missingFields) {
        stillMissingCounts[field] = (stillMissingCounts[field] ?? 0) + 1;
      }
    }

    const written = options.dryRun
      ? { created: 0, updated: 0 }
      : await this.repository.upsertBackfilledNotices(
        organizationId,
        drafts.map((draft) => ({
          masterProductId: draft.masterProductId,
          noticeCategory: draft.noticeCategory,
          attributes: draft.attributes,
        })),
      );

    return {
      dryRun: options.dryRun,
      sourceListings: sources.length,
      candidateProducts: drafts.length,
      skippedManual: bestByProduct.size - drafts.length,
      created: written.created,
      updated: written.updated,
      categoryUnconfident: drafts.filter((draft) => !draft.categoryConfident).length,
      fieldFillCounts,
      stillMissingCounts,
      // Wing 상품목록에 KC 가 없다. 없는 걸 만들어 내지 않는다.
      certificationsCreated: 0,
      note: `Wing 상품목록에는 ${COUPANG_UNAVAILABLE_FIELDS.join('·')} 가 없어 이 역추출로 송신 가능해지는 상품은 없습니다.`,
    };
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

    const candidates = page.items.map<MallAvailabilityCandidate>((item) => {
      const manifest = getMallAdapterManifest(item.channelAccount.channel);
      const base = {
        channelListingOptionId: item.sku.id,
        mallKey: item.channelAccount.channel,
        mallName: manifest?.name ?? item.channelAccount.channel,
        channelAccountName: item.channelAccount.name,
        productName: item.product.displayName
          ?? item.product.registeredName
          ?? item.product.externalProductId,
        optionName: item.sku.optionName ?? item.sku.sellerSku ?? item.sku.externalSkuId,
        sellerSku: item.sku.sellerSku,
        sellableStock: item.sku.sellableStock,
        bottleneckCodes: item.components
          .filter((component) => component.isBottleneck)
          .map((component) => component.code),
        desiredState: 'sold_out' as const,
      };

      if (!manifest) {
        return {
          ...base,
          sendable: false,
          effectiveState: null,
          blockedReason: `${item.channelAccount.channel} 매니페스트가 없습니다.`,
        };
      }
      const resolved = resolveSoldOutCommand(manifest);
      return resolved.allowed
        ? { ...base, sendable: true, effectiveState: resolved.downgradedTo, blockedReason: null }
        : { ...base, sendable: false, effectiveState: null, blockedReason: resolved.reason };
    });

    return {
      candidates,
      total: page.total,
      loaded: candidates.length,
      sendableCount: candidates.filter((candidate) => candidate.sendable).length,
      blockedCount: candidates.filter((candidate) => !candidate.sendable).length,
    };
  }

  /**
   * 상품 × 몰 등록 현황.
   *
   * 열은 **우리가 리스팅을 가져온 계정**이다. 매니페스트에 몰이 29개 있어도
   * 리스팅을 모르는 몰은 칸을 채울 수 없다 — 전부 '미등록'으로 칠하면 그 몰에
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
    const [accounts, anchors] = await Promise.all([
      this.repository.listAccountsWithListings(organizationId),
      this.repository.listMallAccountAnchors(organizationId),
    ]);

    const columns = this.buildMatrixColumns(accounts, anchors, query.mallKeys ?? []);
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

    const matrixRows = rows.map<MallListingMatrixRow>((row) => {
      const listingByMall = new Map(
        row.listings.flatMap((listing) => {
          const mallKey = mallKeyByAccount.get(listing.channelAccountId);
          return mallKey ? [[mallKey, listing] as const] : [];
        }),
      );

      const cells = columns.map<MallListingMatrixCell>((column) => {
        const listing = listingByMall.get(column.mallKey) ?? null;
        const resolved = resolveMallListingState({
          hasListing: listing !== null,
          listingStatus: listing?.status ?? null,
        });
        return {
          mallKey: column.mallKey,
          state: resolved.state,
          rawStatus: listing?.status ?? null,
          externalId: listing?.externalId ?? null,
          warning: resolved.warning,
          updatedAt: listing?.updatedAt.toISOString() ?? null,
        } satisfies MallListingMatrixCell;
      });

      return {
        masterProductId: row.masterProductId,
        code: row.code,
        name: row.name,
        imageUrl: row.imageUrl,
        // 카테고리는 마스터에 저장돼 있지 않다. 리스팅이 들고 있는 값을 회수한다.
        category: row.listings.find((listing) => listing.category)?.category ?? null,
        stock: row.stock,
        publishedCount: countPublished(cells.map((cell) => cell.state)),
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
    anchors: readonly MallAccountAnchorRow[],
    requestedMallKeys: readonly string[],
  ): MallListingMatrixColumn[] {
    const anchorByAccountId = new Map(anchors.map((row) => [row.channelAccountId, row]));

    const withListings = [...accounts]
      .sort((left, right) => right.listingCount - left.listingCount)
      .map<MallListingMatrixColumn>((account) => {
        const anchor = anchorByAccountId.get(account.channelAccountId) ?? null;
        const mallKey = anchor?.mallKey ?? account.externalAccountId ?? account.channel;
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
      ...anchors.map((row) => row.mallKey),
      ...requestedMallKeys,
    ];

    const rest = candidateKeys.flatMap<MallListingMatrixColumn>((mallKey) => {
      if (seen.has(mallKey)) return [];
      const manifest = getMallAdapterManifest(mallKey);
      if (!manifest) return [];
      seen.add(mallKey);
      const anchor = anchors.find((row) => row.mallKey === mallKey) ?? null;
      return [{
        mallKey,
        mallName: manifest.name,
        channelAccountId: anchor?.channelAccountId ?? null,
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
    const [anchors, accounts, orderCounts, productCount, profiles] = await Promise.all([
      this.repository.listMallAccountAnchors(organizationId),
      this.repository.listAccountsWithListings(organizationId),
      this.repository.countOrdersByAccount(organizationId),
      this.repository.countActiveMasterProducts(organizationId),
      this.repository.listProfiles(organizationId),
    ]);

    const accountById = new Map(accounts.map((row) => [row.channelAccountId, row]));
    const ordersByAccount = new Map(
      orderCounts.map((row) => [row.channelAccountId, row.orderCount]),
    );
    const profileCountByMall = new Map<string, number>();
    for (const profile of profiles) {
      profileCountByMall.set(profile.mallKey, (profileCountByMall.get(profile.mallKey) ?? 0) + 1);
    }

    const channels = MALL_ADAPTER_MANIFESTS.flatMap<MallChannelSummary>((manifest) => {
      const anchor = anchors.find((row) => row.mallKey === manifest.key) ?? null;
      const account = anchor ? accountById.get(anchor.channelAccountId) ?? null : null;
      const hasCredentials = anchor?.hasCredentials ?? false;
      const listingCount = account?.listingCount ?? 0;
      const orderCount = anchor ? ordersByAccount.get(anchor.channelAccountId) ?? 0 : 0;

      // 연결의 흔적이 하나도 없는 몰은 허브에 걸지 않는다. 29개를 전부 그리면
      // 실제로 쓰는 몰이 안 보인다.
      if (!anchor && listingCount === 0 && orderCount === 0) return [];

      const profileCount = profileCountByMall.get(manifest.key) ?? 0;
      const readiness: MallChannelSummary['readiness'] = !manifest.applicable || manifest.unverified
        ? 'unsupported'
        : !hasCredentials
          ? 'needs_account'
          : !anchor
            ? 'needs_promotion'
            : profileCount === 0
              ? 'needs_profile'
              : 'ready';

      return [{
        mallKey: manifest.key,
        mallName: manifest.name,
        channelAccountId: anchor?.channelAccountId ?? null,
        canPublish: manifest.applicable && manifest.supports.createListing,
        hasCredentials,
        imported: listingCount > 0,
        listingCount,
        orderCount,
        productCount: account?.productCount ?? 0,
        readiness,
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
