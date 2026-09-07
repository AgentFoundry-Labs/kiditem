import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  MallAdapterManifestView,
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
  buildCoupangNoticeDraft,
  COUPANG_UNAVAILABLE_FIELDS,
  type CoupangNoticeDraft,
} from '../../domain/mall/coupang-notice-backfill';
import { missingNoticeFields } from '../../domain/mall/product-notice-fields';
import {
  MALL_PUBLISHING_REPOSITORY_PORT,
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
}
