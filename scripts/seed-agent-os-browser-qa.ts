#!/usr/bin/env tsx
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { hashAuthPassword } from '../apps/server/src/auth/domain/auth-credentials';
import {
  extractSupplierOfferId,
  parseAllowedSupplierUrl,
} from '../apps/server/src/sourcing/domain/supplier-source-url-policy';
import { canonicalSourcingCandidateIdentity } from '../apps/server/src/sourcing/domain/sourcing-candidate-identity';

export const GENERATED_DATABASE_MARKER = 'kiditem_agent_os_clean_cutover';
export const BROWSER_QA_SEED_TARGET_ENV = 'KIDITEM_BROWSER_QA_SEED_TARGET';
export const BROWSER_QA_EMAIL_ENV = 'KIDITEM_BROWSER_QA_EMAIL';

const DEFAULT_DEVELOPMENT_DATABASE_NAMES = new Set([
  'kiditem',
  'kiditem_dev',
  'kiditem_development',
  'kiditem_local',
  'postgres',
]);

const BROWSER_QA_ORGANIZATION = {
  name: 'Browser QA',
  slug: 'browser-qa-agent-os',
  isActive: true,
} as const;

export const BROWSER_QA_FIXTURE_PROFILES = [
  'sourcing.recommendation.v1',
  'sourcing.candidate-ingest.v1',
  'products.listing-generation.v1',
  'runtime.two-turn-restart.v1',
  'runtime.general-chat.v1',
  'sourcing.existing-candidate.v1',
  'sourcing.candidate-denial.v1',
  'sourcing.scrape-failure.v1',
  'supply.purchase-order-submit.v1',
] as const;

export type BrowserQaFixtureProfileId = (typeof BROWSER_QA_FIXTURE_PROFILES)[number];

type BrowserQaProfileDefinition = {
  inputVariables: readonly string[];
  outputVariables: readonly string[];
  includesCandidate?: boolean;
  includesRecommendationWorkspace?: boolean;
  includesSupply?: boolean;
  createsFailureSupplierUrl?: boolean;
};

const BROWSER_QA_PROFILE_DEFINITIONS: Record<
  BrowserQaFixtureProfileId,
  BrowserQaProfileDefinition
> = {
  'sourcing.recommendation.v1': {
    inputVariables: [],
    outputVariables: [],
    includesRecommendationWorkspace: true,
  },
  'sourcing.candidate-ingest.v1': {
    inputVariables: ['supplierUrl'],
    outputVariables: ['supplierUrl'],
  },
  'products.listing-generation.v1': {
    inputVariables: [],
    outputVariables: ['candidateRef'],
    includesCandidate: true,
  },
  'runtime.two-turn-restart.v1': {
    inputVariables: [],
    outputVariables: [],
    includesRecommendationWorkspace: true,
  },
  'runtime.general-chat.v1': {
    inputVariables: [],
    outputVariables: [],
  },
  'sourcing.existing-candidate.v1': {
    inputVariables: [],
    outputVariables: ['supplierUrl'],
    includesCandidate: true,
  },
  'sourcing.candidate-denial.v1': {
    inputVariables: ['supplierUrl'],
    outputVariables: ['supplierUrl'],
  },
  'sourcing.scrape-failure.v1': {
    inputVariables: [],
    outputVariables: ['supplierUrl'],
    createsFailureSupplierUrl: true,
  },
  'supply.purchase-order-submit.v1': {
    inputVariables: [],
    outputVariables: ['purchaseOrderRef', 'externalOrderId'],
    includesSupply: true,
  },
};

const BROWSER_QA_SELLPIA_INVENTORY_SKU = {
  code: 'browser-qa-synthetic-sku',
  name: 'Browser QA synthetic inventory SKU',
  isActive: true,
} as const;

const BROWSER_QA_SELLPIA_INVENTORY_STATE = {
  sourceOrigin: 'https://kiditem.sellpia.com',
  sourceAccountKey: 'kiditem',
  refreshRequestedAt: null,
  refreshReason: null,
  requestedSyncScope: 'inventory',
  syncNotBefore: null,
  activeSyncToken: null,
  activeSyncOwnerUserId: null,
  activeSyncStartedAt: null,
  activeSyncLeaseExpiresAt: null,
  activeSyncScope: null,
  requestedGeneration: 1n,
  activeGeneration: null,
  verifiedGeneration: 1n,
  failedGeneration: null,
  lastAttemptStatus: 'completed',
  lastAttemptSyncScope: 'inventory',
  lastErrorCode: null,
  lastErrorMessage: null,
} as const;

const BROWSER_QA_PURCHASE_ORDER = {
  supplierName: 'Browser QA synthetic supplier',
  totalAmountCny: 1,
  status: 'draft',
  externalOrderPlatform: 'ALIBABA_1688',
  externalOrderUrl: null,
  idempotencyKey: 'browser-qa-synthetic-purchase-order',
  requestHash: null,
} as const;

const BROWSER_QA_PURCHASE_ORDER_ITEM = {
  productName: 'Browser QA synthetic inventory item',
  quantity: 1,
  unitPriceCny: 1,
} as const;

type BrowserQaSyntheticSupplier = {
  sourceUrl: string;
  externalOfferId: string;
};

type BrowserQaSourcingCandidate = {
  sourceUrl: string;
  sourcePlatform: 'ALIBABA_1688';
  externalOfferId: string;
  sourceIdentityHash: string;
  variantKeyNormalized: string;
  name: string;
  description: string;
  status: 'sourced';
  isDeleted: false;
};

const BROWSER_QA_FIXTURE_HASH = 'b'.repeat(64);

type BrowserQaRecommendationPlan = {
  evidenceIngestionRun: {
    sourceKey: string;
    scopeKey: string;
    targetKey: string;
    idempotencyKey: string;
    requestHash: string;
    collectorKey: string;
    collectorVersion: string;
    triggerKind: string;
    status: string;
    discoveredCount: number;
    acceptedCount: number;
    rejectedCount: number;
    duplicateCount: number;
    startedAt: Date;
    completedAt: Date;
  };
  evidenceObservation: {
    sourceKey: string;
    platform: string;
    evidenceFamily: string;
    signalRole: string;
    conceptKey: string;
    supportsCandidate: boolean;
    observationKey: string;
    revision: number;
    sourceEntityType: string;
    sourceEntityKey: string;
    observationType: string;
    schemaVersion: string;
    evidenceClass: string;
    observedAt: Date;
    availableAt: Date;
    businessDate: Date;
    sourceUrl: string;
    payloadHash: string;
    envelopeHash: string;
    payload: Record<string, unknown>;
    ingestedAt: Date;
  };
  recommendationRun: {
    policyKey: string;
    policyVersion: string;
    modelVersion: string;
    calculationVersion: string;
    inputManifestHash: string;
    inputManifest: Record<string, unknown>;
    status: string;
    businessDate: Date;
    generatedAt: Date;
    completedAt: Date;
    expiresAt: Date;
    warningCodes: string[];
    errorCode: null;
    errorMessage: null;
  };
  recommendationItem: {
    itemKey: string;
    sourcePlatform: string;
    externalOfferId: string;
    variantKeyNormalized: string;
    matchedCoupangProductId: null;
    displayName: string;
    rank: number;
    score: number;
    grade: string;
    baselineAction: string;
    reasonCodes: string[];
    riskCodes: string[];
    scoreComponents: Record<string, number>;
    sourceSnapshot: Record<string, unknown>;
  };
  workspaceSnapshot: {
    scope: string;
    businessDate: Date;
    projectionVersion: string;
    inputHash: string;
    payload: Record<string, unknown>;
    generatedAt: Date;
    expiresAt: Date;
  };
};

export type BrowserQaSeedTarget = {
  databaseName: string;
  host: string;
  mappedPort: number;
};

export type BrowserQaSeedPlan = {
  profile: BrowserQaFixtureProfileId;
  variables: Record<string, string>;
  organization: typeof BROWSER_QA_ORGANIZATION;
  user: {
    email: string;
    name: string;
    passwordHash: string;
    role: string;
    type: string;
    isActive: boolean;
  };
  membership: {
    role: string;
    status: string;
  };
  sourcingCandidate?: BrowserQaSourcingCandidate;
  sellpiaInventorySku?: typeof BROWSER_QA_SELLPIA_INVENTORY_SKU;
  sellpiaInventoryState?: typeof BROWSER_QA_SELLPIA_INVENTORY_STATE & {
    lastVerifiedAt: Date;
    lastAttemptAt: Date;
  };
  purchaseOrder?: typeof BROWSER_QA_PURCHASE_ORDER & { externalOrderId: string };
  purchaseOrderItem?: typeof BROWSER_QA_PURCHASE_ORDER_ITEM;
} & Partial<BrowserQaRecommendationPlan>;

export type BrowserQaSeedResult = {
  profile: BrowserQaFixtureProfileId;
  variables: Record<string, string>;
  organizationId: string;
  userId: string;
  membershipId: string;
  sourcingCandidateId?: string;
  evidenceIngestionRunId?: string;
  evidenceObservationId?: string;
  recommendationRunId?: string;
  recommendationItemId?: string;
  workspaceSnapshotId?: string;
  sellpiaInventorySkuId?: string;
  purchaseOrderId?: string;
  purchaseOrderItemId?: string;
};

export type BrowserQaPasswordInput = {
  isTTY?: boolean;
  setRawMode?: (enabled: boolean) => unknown;
  on: (event: 'data' | 'end' | 'error', listener: (...args: any[]) => void) => unknown;
  removeListener?: (event: 'data' | 'end' | 'error', listener: (...args: any[]) => void) => unknown;
  resume?: () => unknown;
  pause?: () => unknown;
};

export type BrowserQaPasswordOutput = {
  write: (chunk: string) => unknown;
};

export function parseBrowserQaSeedArgs(
  argv: string[],
  environment: NodeJS.ProcessEnv = process.env,
): {
  email: string;
  reset: boolean;
  profile: BrowserQaFixtureProfileId;
  variables: Record<string, string>;
} {
  let email = environment[BROWSER_QA_EMAIL_ENV];
  let reset = false;
  let profile: BrowserQaFixtureProfileId | undefined;
  const variables = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--reset') {
      if (reset) throw new Error('--reset may be supplied only once.');
      reset = true;
      continue;
    }
    if (argument === '--profile') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--profile requires a value.');
      if (profile) throw new Error('--profile may be supplied only once.');
      profile = parseBrowserQaFixtureProfile(value);
      index += 1;
      continue;
    }
    if (argument.startsWith('--profile=')) {
      if (profile) throw new Error('--profile may be supplied only once.');
      profile = parseBrowserQaFixtureProfile(argument.slice('--profile='.length));
      continue;
    }
    if (argument === '--var') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--var requires name=value.');
      addBrowserQaSeedVariable(variables, value);
      index += 1;
      continue;
    }
    if (argument.startsWith('--var=')) {
      addBrowserQaSeedVariable(variables, argument.slice('--var='.length));
      continue;
    }
    if (argument === '--email') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--email requires a value.');
      email = value;
      index += 1;
      continue;
    }
    if (argument.startsWith('--email=')) {
      email = argument.slice('--email='.length);
      continue;
    }
    if (argument === '--password' || argument.startsWith('--password=')) {
      throw new Error('Browser-QA password is accepted only through interactive stdin.');
    }
    throw new Error(`Unsupported browser-QA seed argument: ${argument}`);
  }

  const normalizedEmail = normalizeEmail(email ?? '');
  if (!profile) throw new Error('Browser-QA seed requires --profile <fixture-id>.');
  return {
    email: normalizedEmail,
    reset,
    profile,
    variables: normalizeBrowserQaProfileVariables(profile, Object.fromEntries(variables)),
  };
}

export function assertIsolatedBrowserQaSeedTarget({
  databaseUrl,
  seedTarget,
}: {
  databaseUrl: string | undefined;
  seedTarget: string | undefined;
}): BrowserQaSeedTarget & { databaseUrl: string } {
  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
    throw new Error('Browser-QA seed requires the clean-cutover injected DATABASE_URL.');
  }
  const expected = parseSeedTarget(seedTarget);
  const parsedUrl = parsePostgresUrl(databaseUrl);
  const actualHost = normalizeHost(parsedUrl.hostname);
  const actualPort = Number(parsedUrl.port || '5432');
  const actualDatabaseName = readDatabaseName(parsedUrl);

  assertNotDefaultDevelopmentDatabaseName(actualDatabaseName);
  assertGeneratedDatabaseName(actualDatabaseName);
  if (isOfficeHost(actualHost)) {
    throw new Error('Refusing Office host for the isolated browser-QA seed.');
  }
  if (actualHost !== expected.host) {
    throw new Error('Refusing non-Testcontainer DATABASE_URL: host does not match the clean-cutover target.');
  }
  if (actualPort !== expected.mappedPort) {
    throw new Error('Refusing non-Testcontainer DATABASE_URL: port does not match the clean-cutover target.');
  }
  if (actualDatabaseName !== expected.databaseName) {
    throw new Error('Refusing non-Testcontainer DATABASE_URL: database does not match the clean-cutover target.');
  }

  return { ...expected, databaseUrl };
}

export async function readBrowserQaPassword(
  input: BrowserQaPasswordInput,
  output: BrowserQaPasswordOutput,
): Promise<string> {
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('Browser-QA password requires interactive stdin.');
  }

  output.write('Browser-QA password: ');
  input.setRawMode(true);
  input.resume?.();

  return new Promise((resolvePromise, rejectPromise) => {
    let received = '';
    let settled = false;

    const cleanup = () => {
      input.removeListener?.('data', onData);
      input.removeListener?.('end', onEnd);
      input.removeListener?.('error', onError);
      input.setRawMode?.(false);
      input.pause?.();
    };
    const settle = (result: { value: string } | { error: Error }) => {
      if (settled) return;
      settled = true;
      cleanup();
      output.write('\n');
      if ('error' in result) rejectPromise(result.error);
      else resolvePromise(result.value);
    };
    const onData = (chunk: unknown) => {
      const value = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      if (value.includes('\u0003')) {
        settle({ error: new Error('Browser-QA password entry was cancelled.') });
        return;
      }
      received += value;
      const terminator = received.search(/[\r\n]/);
      if (terminator < 0) return;
      const password = received.slice(0, terminator);
      if (password.length === 0) {
        settle({ error: new Error('Browser-QA password must not be empty.') });
        return;
      }
      settle({ value: password });
    };
    const onEnd = () => settle({ error: new Error('Browser-QA password was not provided.') });
    const onError = () => settle({ error: new Error('Browser-QA password could not be read from stdin.') });

    input.on('data', onData);
    input.on('end', onEnd);
    input.on('error', onError);
  });
}

export function createBrowserQaSeedPlan({
  profile,
  email,
  passwordHash,
  variables = {},
  now = new Date(),
  externalOrderId,
}: {
  profile: BrowserQaFixtureProfileId;
  email: string;
  passwordHash: string;
  variables?: Record<string, string>;
  now?: Date;
  externalOrderId?: string;
}): BrowserQaSeedPlan {
  const definition = BROWSER_QA_PROFILE_DEFINITIONS[profile];
  const planVariables = normalizeBrowserQaProfileVariables(profile, variables);
  const basePlan = {
    profile,
    variables: planVariables,
    organization: BROWSER_QA_ORGANIZATION,
    user: {
      email,
      name: 'Browser QA user',
      passwordHash,
      role: 'owner',
      type: 'human',
      isActive: true,
    },
    membership: {
      role: 'owner',
      status: 'active',
    },
  };

  if (definition.includesCandidate) {
    const supplier = createBrowserQaSyntheticSupplier();
    return {
      ...basePlan,
      variables: {
        ...planVariables,
        ...(profile === 'sourcing.existing-candidate.v1' && {
          supplierUrl: supplier.sourceUrl,
        }),
      },
      sourcingCandidate: createBrowserQaSourcingCandidate(supplier),
    };
  }
  if (definition.includesRecommendationWorkspace) {
    return {
      ...basePlan,
      ...createBrowserQaRecommendationPlan(now, createBrowserQaSyntheticSupplier()),
    };
  }
  if (definition.includesSupply) {
    const resolvedExternalOrderId = normalizeBrowserQaExternalOrderId(
      externalOrderId ?? `browser-qa-${randomUUID()}`,
    );
    return {
      ...basePlan,
      variables: {
        ...planVariables,
        externalOrderId: resolvedExternalOrderId,
      },
      sellpiaInventorySku: BROWSER_QA_SELLPIA_INVENTORY_SKU,
      sellpiaInventoryState: {
        ...BROWSER_QA_SELLPIA_INVENTORY_STATE,
        lastVerifiedAt: now,
        lastAttemptAt: now,
      },
      purchaseOrder: {
        ...BROWSER_QA_PURCHASE_ORDER,
        externalOrderId: resolvedExternalOrderId,
      },
      purchaseOrderItem: BROWSER_QA_PURCHASE_ORDER_ITEM,
    };
  }
  if (definition.createsFailureSupplierUrl) {
    return {
      ...basePlan,
      variables: {
        ...planVariables,
        supplierUrl: createBrowserQaFailureSupplierUrl(),
      },
    };
  }
  return basePlan;
}

export async function runBrowserQaSeed({
  prisma,
  profile,
  variables = {},
  email,
  password,
  hashPassword = hashAuthPassword,
}: {
  prisma: PrismaClient;
  profile: BrowserQaFixtureProfileId;
  variables?: Record<string, string>;
  email: string;
  password: string;
  hashPassword?: (value: string) => Promise<string>;
}): Promise<BrowserQaSeedResult> {
  const passwordHash = await hashPassword(password);
  const plan = createBrowserQaSeedPlan({ profile, email, passwordHash, variables });

  return prisma.$transaction(async (transaction) => {
    const organization = await transaction.organization.upsert({
      where: { slug: plan.organization.slug },
      update: {
        name: plan.organization.name,
        isActive: plan.organization.isActive,
      },
      create: plan.organization,
      select: { id: true },
    });
    const user = await transaction.user.upsert({
      where: { email: plan.user.email },
      update: {
        name: plan.user.name,
        passwordHash: plan.user.passwordHash,
        role: plan.user.role,
        type: plan.user.type,
        isActive: plan.user.isActive,
      },
      create: plan.user,
      select: { id: true },
    });
    const membership = await transaction.organizationMembership.upsert({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: user.id,
        },
      },
      update: plan.membership,
      create: {
        organizationId: organization.id,
        userId: user.id,
        ...plan.membership,
      },
      select: { id: true },
    });
    const result: BrowserQaSeedResult = {
      profile: plan.profile,
      variables: { ...plan.variables },
      organizationId: organization.id,
      userId: user.id,
      membershipId: membership.id,
    };

    if (plan.sourcingCandidate) {
      const existingCandidate = await transaction.sourcingCandidate.findFirst({
        where: {
          organizationId: organization.id,
          sourceUrl: plan.sourcingCandidate.sourceUrl,
          sourcePlatform: plan.sourcingCandidate.sourcePlatform,
          sourceIdentityHash: plan.sourcingCandidate.sourceIdentityHash,
          isDeleted: false,
        },
        select: { id: true },
      });
      const sourcingCandidate = existingCandidate ?? await transaction.sourcingCandidate.create({
        data: {
          organizationId: organization.id,
          triggeredByUserId: user.id,
          ...plan.sourcingCandidate,
        },
        select: { id: true },
      });
      result.sourcingCandidateId = sourcingCandidate.id;
      if (plan.profile === 'products.listing-generation.v1') {
        result.variables.candidateRef = sourcingCandidate.id;
      }
    }

    if (plan.recommendationRun) {
      Object.assign(result, await seedBrowserQaRecommendationWorkspace({
        transaction,
        organizationId: organization.id,
        userId: user.id,
        plan,
      }));
    }

    if (
      plan.sellpiaInventorySku
      && plan.sellpiaInventoryState
      && plan.purchaseOrder
      && plan.purchaseOrderItem
    ) {
      const sellpiaInventorySku = await transaction.sellpiaInventorySku.upsert({
        where: {
          organizationId_code: {
            organizationId: organization.id,
            code: plan.sellpiaInventorySku.code,
          },
        },
        update: plan.sellpiaInventorySku,
        create: {
          organizationId: organization.id,
          ...plan.sellpiaInventorySku,
        },
        select: { id: true },
      });
      await transaction.sellpiaInventoryState.upsert({
        where: { organizationId: organization.id },
        update: plan.sellpiaInventoryState,
        create: {
          organizationId: organization.id,
          ...plan.sellpiaInventoryState,
        },
        select: { organizationId: true },
      });
      const purchaseOrder = await findOrCreateBrowserQaPurchaseOrder({
        transaction,
        organizationId: organization.id,
        purchaseOrder: plan.purchaseOrder,
      });
      const existingPurchaseOrderItem = await transaction.purchaseOrderItem.findFirst({
        where: {
          organizationId: organization.id,
          orderId: purchaseOrder.id,
          sellpiaInventorySkuId: sellpiaInventorySku.id,
        },
        select: { id: true },
      });
      const purchaseOrderItem = existingPurchaseOrderItem
        ?? await transaction.purchaseOrderItem.create({
          data: {
            organizationId: organization.id,
            orderId: purchaseOrder.id,
            sellpiaInventorySkuId: sellpiaInventorySku.id,
            ...plan.purchaseOrderItem,
          },
          select: { id: true },
        });
      result.sellpiaInventorySkuId = sellpiaInventorySku.id;
      result.purchaseOrderId = purchaseOrder.id;
      result.purchaseOrderItemId = purchaseOrderItem.id;
      result.variables.purchaseOrderRef = purchaseOrder.id;
    }

    result.variables = selectBrowserQaProfileOutputVariables(plan.profile, result.variables);
    return result;
  });
}

function createBrowserQaRecommendationPlan(
  now: Date,
  supplier: BrowserQaSyntheticSupplier,
): BrowserQaRecommendationPlan {
  const businessDate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1_000);
  return {
    evidenceIngestionRun: {
      sourceKey: 'browser_qa',
      scopeKey: 'recommendation',
      targetKey: 'browser-qa-recommendation',
      idempotencyKey: 'browser-qa-recommendation-evidence',
      requestHash: BROWSER_QA_FIXTURE_HASH,
      collectorKey: 'browser-qa-fixture',
      collectorVersion: 'v1',
      triggerKind: 'fixture',
      status: 'complete',
      discoveredCount: 1,
      acceptedCount: 1,
      rejectedCount: 0,
      duplicateCount: 0,
      startedAt: now,
      completedAt: now,
    },
    evidenceObservation: {
      sourceKey: 'browser_qa',
      platform: '1688',
      evidenceFamily: 'supplier_offer',
      signalRole: 'source',
      conceptKey: 'browser-qa',
      supportsCandidate: true,
      observationKey: 'browser-qa-recommendation-evidence',
      revision: 1,
      sourceEntityType: 'supplier_offer',
      sourceEntityKey: supplier.externalOfferId,
      observationType: 'offer_snapshot',
      schemaVersion: 'browser-qa-v1',
      evidenceClass: 'synthetic',
      observedAt: now,
      availableAt: now,
      businessDate,
      sourceUrl: supplier.sourceUrl,
      payloadHash: BROWSER_QA_FIXTURE_HASH,
      envelopeHash: BROWSER_QA_FIXTURE_HASH,
      payload: {
        displayName: 'Browser QA synthetic recommendation evidence',
        source: 'synthetic-browser-qa',
      },
      ingestedAt: now,
    },
    recommendationRun: {
      policyKey: 'sourcing_workspace',
      policyVersion: 'browser-qa-v1',
      modelVersion: 'browser-qa-fixture',
      calculationVersion: 'browser-qa-v1',
      inputManifestHash: BROWSER_QA_FIXTURE_HASH,
      inputManifest: { source: 'synthetic-browser-qa', version: 1 },
      status: 'complete',
      businessDate,
      generatedAt: now,
      completedAt: now,
      expiresAt,
      warningCodes: [],
      errorCode: null,
      errorMessage: null,
    },
    recommendationItem: {
      itemKey: 'browser-qa-recommendation-item',
      sourcePlatform: '1688',
      externalOfferId: supplier.externalOfferId,
      variantKeyNormalized: '',
      matchedCoupangProductId: null,
      displayName: 'Browser QA synthetic recommendation',
      rank: 1,
      score: 90,
      grade: 'A',
      baselineAction: 'observe_3d',
      reasonCodes: ['synthetic_evidence'],
      riskCodes: [],
      scoreComponents: { evidence: 90 },
      sourceSnapshot: {
        keyword: 'browser qa',
        sourceKeywords: ['browser qa'],
        salePriceKrw: 1,
      },
    },
    workspaceSnapshot: {
      scope: 'sourcing_agent_rag',
      businessDate,
      projectionVersion: 'sourcing-agent-rag.v3',
      inputHash: BROWSER_QA_FIXTURE_HASH,
      payload: {
        version: 3,
        result: {
          documents: [],
          stats: {
            documentCount: 0,
            sourceSnapshotCount: 0,
            sourceScopes: [],
          },
        },
        meta: { generatedAt: now.toISOString() },
      },
      generatedAt: now,
      expiresAt,
    },
  };
}

async function seedBrowserQaRecommendationWorkspace({
  transaction,
  organizationId,
  userId,
  plan,
}: {
  transaction: Prisma.TransactionClient;
  organizationId: string;
  userId: string;
  plan: BrowserQaSeedPlan;
}): Promise<Pick<
  BrowserQaSeedResult,
  | 'evidenceIngestionRunId'
  | 'evidenceObservationId'
  | 'recommendationRunId'
  | 'recommendationItemId'
  | 'workspaceSnapshotId'
>> {
  if (
    !plan.evidenceIngestionRun
    || !plan.evidenceObservation
    || !plan.recommendationRun
    || !plan.recommendationItem
    || !plan.workspaceSnapshot
  ) {
    throw new Error('Browser-QA recommendation fixture plan is incomplete.');
  }

  const evidenceIngestionRun = await transaction.sourcingEvidenceIngestionRun.upsert({
    where: {
      organizationId_idempotencyKey: {
        organizationId,
        idempotencyKey: plan.evidenceIngestionRun.idempotencyKey,
      },
    },
    update: {
      ...plan.evidenceIngestionRun,
      triggeredByUserId: userId,
    },
    create: {
      organizationId,
      triggeredByUserId: userId,
      ...plan.evidenceIngestionRun,
    },
    select: { id: true },
  });
  const evidenceObservation = await transaction.sourcingEvidenceObservation.upsert({
    where: {
      organizationId_observationKey_revision: {
        organizationId,
        observationKey: plan.evidenceObservation.observationKey,
        revision: plan.evidenceObservation.revision,
      },
    },
    update: {
      ingestionRunId: evidenceIngestionRun.id,
      ...plan.evidenceObservation,
      payload: plan.evidenceObservation.payload as Prisma.InputJsonValue,
    },
    create: {
      organizationId,
      ingestionRunId: evidenceIngestionRun.id,
      ...plan.evidenceObservation,
      payload: plan.evidenceObservation.payload as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  const recommendationRun = await transaction.sourcingRecommendationRun.upsert({
    where: {
      organizationId_policyKey_policyVersion_modelVersion_calculationVersion_inputManifestHash: {
        organizationId,
        policyKey: plan.recommendationRun.policyKey,
        policyVersion: plan.recommendationRun.policyVersion,
        modelVersion: plan.recommendationRun.modelVersion,
        calculationVersion: plan.recommendationRun.calculationVersion,
        inputManifestHash: plan.recommendationRun.inputManifestHash,
      },
    },
    update: {
      ...plan.recommendationRun,
      inputManifest: plan.recommendationRun.inputManifest as Prisma.InputJsonValue,
    },
    create: {
      organizationId,
      ...plan.recommendationRun,
      inputManifest: plan.recommendationRun.inputManifest as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  const recommendationItem = await transaction.sourcingRecommendationItem.upsert({
    where: {
      recommendationRunId_itemKey: {
        recommendationRunId: recommendationRun.id,
        itemKey: plan.recommendationItem.itemKey,
      },
    },
    update: {
      ...plan.recommendationItem,
      scoreComponents: plan.recommendationItem.scoreComponents as Prisma.InputJsonValue,
      sourceSnapshot: plan.recommendationItem.sourceSnapshot as Prisma.InputJsonValue,
    },
    create: {
      organizationId,
      recommendationRunId: recommendationRun.id,
      ...plan.recommendationItem,
      scoreComponents: plan.recommendationItem.scoreComponents as Prisma.InputJsonValue,
      sourceSnapshot: plan.recommendationItem.sourceSnapshot as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  await transaction.sourcingRecommendationItemEvidence.upsert({
    where: {
      recommendationItemId_evidenceObservationId_role: {
        recommendationItemId: recommendationItem.id,
        evidenceObservationId: evidenceObservation.id,
        role: 'source',
      },
    },
    update: { ordinal: 0 },
    create: {
      organizationId,
      recommendationItemId: recommendationItem.id,
      evidenceObservationId: evidenceObservation.id,
      role: 'source',
      ordinal: 0,
    },
    select: { id: true },
  });
  const workspaceSnapshot = await transaction.sourcingWorkspaceSnapshot.upsert({
    where: {
      organizationId_scope_businessDate_projectionVersion_inputHash: {
        organizationId,
        scope: plan.workspaceSnapshot.scope,
        businessDate: plan.workspaceSnapshot.businessDate,
        projectionVersion: plan.workspaceSnapshot.projectionVersion,
        inputHash: plan.workspaceSnapshot.inputHash,
      },
    },
    update: {
      payload: plan.workspaceSnapshot.payload as Prisma.InputJsonValue,
      generatedAt: plan.workspaceSnapshot.generatedAt,
      expiresAt: plan.workspaceSnapshot.expiresAt,
    },
    create: {
      organizationId,
      ...plan.workspaceSnapshot,
      payload: plan.workspaceSnapshot.payload as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  return {
    evidenceIngestionRunId: evidenceIngestionRun.id,
    evidenceObservationId: evidenceObservation.id,
    recommendationRunId: recommendationRun.id,
    recommendationItemId: recommendationItem.id,
    workspaceSnapshotId: workspaceSnapshot.id,
  };
}

async function findOrCreateBrowserQaPurchaseOrder({
  transaction,
  organizationId,
  purchaseOrder,
}: {
  transaction: Prisma.TransactionClient;
  organizationId: string;
  purchaseOrder: NonNullable<BrowserQaSeedPlan['purchaseOrder']>;
}): Promise<{ id: string }> {
  const existing = await transaction.purchaseOrder.findFirst({
    where: {
      organizationId,
      idempotencyKey: purchaseOrder.idempotencyKey,
    },
    select: { id: true },
  });
  if (existing) {
    return transaction.purchaseOrder.update({
      where: {
        id_organizationId: {
          id: existing.id,
          organizationId,
        },
      },
      data: purchaseOrder,
      select: { id: true },
    });
  }

  return transaction.purchaseOrder.create({
    data: {
      organizationId,
      ...purchaseOrder,
    },
    select: { id: true },
  });
}

export async function resetBrowserQaDatabase({
  prisma,
  target,
}: {
  prisma: Pick<PrismaClient, '$executeRaw'>;
  target: BrowserQaSeedTarget & { databaseUrl: string };
}): Promise<void> {
  assertIsolatedBrowserQaSeedTarget({
    databaseUrl: target.databaseUrl,
    seedTarget: JSON.stringify({
      databaseName: target.databaseName,
      host: target.host,
      mappedPort: target.mappedPort,
    }),
  });

  await prisma.$executeRaw`
    DO $reset$
    DECLARE
      table_names text;
    BEGIN
      SELECT string_agg(
        format('%I.%I', namespace.nspname, relation.relname),
        ', ' ORDER BY namespace.nspname, relation.relname
      )
      INTO table_names
      FROM pg_catalog.pg_class AS relation
      INNER JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relkind IN ('r', 'p')
        AND relation.relname <> '_prisma_migrations'
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.pg_inherits AS inheritance
          WHERE inheritance.inhrelid = relation.oid
        );

      IF table_names IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE ' || table_names || ' RESTART IDENTITY CASCADE';
      END IF;
    END
    $reset$;
  `;
}

export async function main({
  argv = process.argv.slice(2),
  environment = process.env,
  input = process.stdin,
  output = process.stderr,
  resultOutput = process.stdout,
  createPrisma = createBrowserQaPrisma,
  resetDatabase = resetBrowserQaDatabase,
  runSeed = runBrowserQaSeed,
}: {
  argv?: string[];
  environment?: NodeJS.ProcessEnv;
  input?: BrowserQaPasswordInput;
  output?: BrowserQaPasswordOutput;
  resultOutput?: BrowserQaPasswordOutput;
  createPrisma?: (databaseUrl: string) => PrismaClient;
  resetDatabase?: typeof resetBrowserQaDatabase;
  runSeed?: typeof runBrowserQaSeed;
} = {}): Promise<BrowserQaSeedResult> {
  const target = assertIsolatedBrowserQaSeedTarget({
    databaseUrl: environment.DATABASE_URL,
    seedTarget: environment[BROWSER_QA_SEED_TARGET_ENV],
  });
  const { email, reset, profile, variables } = parseBrowserQaSeedArgs(argv, environment);
  const password = await readBrowserQaPassword(input, output);
  const prisma = createPrisma(target.databaseUrl);
  try {
    if (reset) await resetDatabase({ prisma, target });
    const result = await runSeed({ prisma, profile, variables, email, password });
    resultOutput.write(`Isolated browser-QA fixture seeded: ${JSON.stringify(result)}\n`);
    return result;
  } finally {
    await prisma.$disconnect();
  }
}

function createBrowserQaPrisma(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

function parseSeedTarget(value: string | undefined): BrowserQaSeedTarget {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Browser-QA seed requires the isolated clean-cutover target context.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Browser-QA seed requires a valid isolated clean-cutover target context.');
  }
  if (!isRecord(parsed)
    || Object.keys(parsed).length !== 3
    || typeof parsed.databaseName !== 'string'
    || typeof parsed.host !== 'string'
    || typeof parsed.mappedPort !== 'number') {
    throw new Error('Browser-QA seed requires a valid isolated clean-cutover target context.');
  }

  const target = {
    databaseName: parsed.databaseName,
    host: normalizeHost(parsed.host),
    mappedPort: normalizeMappedPort(parsed.mappedPort),
  };
  assertNotDefaultDevelopmentDatabaseName(target.databaseName);
  assertGeneratedDatabaseName(target.databaseName);
  if (isOfficeHost(target.host)) {
    throw new Error('Refusing Office host for the isolated browser-QA seed.');
  }
  return target;
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Browser-QA email must be a valid email address.');
  }
  return email;
}

function parseBrowserQaFixtureProfile(value: string): BrowserQaFixtureProfileId {
  const profile = value.trim();
  if (!BROWSER_QA_FIXTURE_PROFILES.includes(profile as BrowserQaFixtureProfileId)) {
    throw new Error(`Unknown browser-QA fixture profile: ${profile || '(empty)'}.`);
  }
  return profile as BrowserQaFixtureProfileId;
}

function addBrowserQaSeedVariable(variables: Map<string, string>, value: string): void {
  const separator = value.indexOf('=');
  const name = value.slice(0, separator);
  const variableValue = value.slice(separator + 1);
  if (
    separator < 1
    || !/^[A-Za-z][A-Za-z0-9]*$/.test(name)
    || variableValue.trim() === ''
    || variableValue.length > 2_000
    || /[\r\n]/.test(variableValue)
  ) {
    throw new Error('Browser-QA --var requires a bounded name=value pair.');
  }
  if (variables.has(name)) {
    throw new Error(`Browser-QA --var may be supplied only once for ${name}.`);
  }
  variables.set(name, variableValue);
}

function normalizeBrowserQaProfileVariables(
  profile: BrowserQaFixtureProfileId,
  variables: Record<string, string>,
): Record<string, string> {
  const definition = BROWSER_QA_PROFILE_DEFINITIONS[profile];
  const allowed = new Set(definition.inputVariables);
  for (const [name, value] of Object.entries(variables)) {
    if (!allowed.has(name)) {
      throw new Error(`Unknown browser-QA profile variable: ${name}.`);
    }
    if (typeof value !== 'string' || value.trim() === '' || value.length > 2_000) {
      throw new Error(`Browser-QA profile variable ${name} must be a bounded string.`);
    }
  }
  for (const name of definition.inputVariables) {
    if (!(name in variables)) {
      throw new Error(`Browser-QA profile ${profile} requires ${name}.`);
    }
  }

  const normalized = { ...variables };
  if ('supplierUrl' in normalized) {
    normalized.supplierUrl = parseAllowedSupplierUrl(normalized.supplierUrl).normalizedUrl;
  }
  return normalized;
}

function selectBrowserQaProfileOutputVariables(
  profile: BrowserQaFixtureProfileId,
  variables: Record<string, string>,
): Record<string, string> {
  const selected: Record<string, string> = {};
  for (const name of BROWSER_QA_PROFILE_DEFINITIONS[profile].outputVariables) {
    const value = variables[name];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`Browser-QA profile ${profile} did not produce ${name}.`);
    }
    selected[name] = value;
  }
  return selected;
}

function normalizeBrowserQaExternalOrderId(value: string): string {
  const externalOrderId = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(externalOrderId)) {
    throw new Error('Browser-QA external order identity is invalid.');
  }
  return externalOrderId;
}

function createBrowserQaSyntheticSupplier(): BrowserQaSyntheticSupplier {
  const supplier = parseAllowedSupplierUrl(createBrowserQaOfferUrl(
    `8${createBrowserQaSyntheticDigits()}`,
  ));
  const externalOfferId = extractSupplierOfferId(supplier);
  if (!externalOfferId) {
    throw new Error('Browser-QA synthetic supplier fixture requires a 1688 offer ID.');
  }
  return {
    sourceUrl: supplier.normalizedUrl,
    externalOfferId,
  };
}

function createBrowserQaSourcingCandidate(
  supplier: BrowserQaSyntheticSupplier,
): BrowserQaSourcingCandidate {
  return {
    sourceUrl: supplier.sourceUrl,
    sourcePlatform: 'ALIBABA_1688',
    externalOfferId: supplier.externalOfferId,
    sourceIdentityHash: canonicalSourcingCandidateIdentity({
      sourcePlatform: 'ALIBABA_1688',
      sourceUrl: supplier.sourceUrl,
      validatedExternalOfferId: supplier.externalOfferId,
      variantKeyNormalized: '',
    }),
    variantKeyNormalized: '',
    name: 'Browser QA fixture',
    description: 'Synthetic record for isolated Agent OS browser QA.',
    status: 'sourced',
    isDeleted: false,
  };
}

function createBrowserQaOfferUrl(externalOfferId: string): string {
  return [
    'https:',
    '',
    'detail.1688.com',
    'offer',
    `${externalOfferId}.html`,
  ].join('/');
}

function createBrowserQaSyntheticDigits(): string {
  return randomUUID()
    .replaceAll('-', '')
    .split('')
    .map((character) => String(character.charCodeAt(0) % 10))
    .join('');
}

function createBrowserQaFailureSupplierUrl(): string {
  return parseAllowedSupplierUrl(createBrowserQaOfferUrl(
    `999999999999${createBrowserQaSyntheticDigits()}`,
  )).normalizedUrl;
}

function parsePostgresUrl(databaseUrl: string): URL {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error('Refusing non-Testcontainer DATABASE_URL: a PostgreSQL URL is required.');
  }
  if (parsedUrl.protocol !== 'postgresql:' && parsedUrl.protocol !== 'postgres:') {
    throw new Error('Refusing non-Testcontainer DATABASE_URL: a PostgreSQL URL is required.');
  }
  return parsedUrl;
}

function normalizeHost(host: string): string {
  if (host.trim() === '') {
    throw new Error('Refusing non-Testcontainer DATABASE_URL: host is required.');
  }
  return host.trim().replace(/^\[|\]$/g, '').toLowerCase();
}

function normalizeMappedPort(mappedPort: number): number {
  if (!Number.isInteger(mappedPort) || mappedPort < 1 || mappedPort > 65535) {
    throw new Error('Refusing non-Testcontainer DATABASE_URL: mapped port is required.');
  }
  return mappedPort;
}

function readDatabaseName(parsedUrl: URL): string {
  const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ''));
  if (!databaseName || databaseName.includes('/')) {
    throw new Error('Refusing non-Testcontainer DATABASE_URL: exactly one database name is required.');
  }
  return databaseName;
}

function assertNotDefaultDevelopmentDatabaseName(databaseName: string): void {
  if (DEFAULT_DEVELOPMENT_DATABASE_NAMES.has(databaseName.toLowerCase())) {
    throw new Error('Refusing default development database name for the isolated browser-QA seed.');
  }
}

function assertGeneratedDatabaseName(databaseName: string): void {
  const pattern = new RegExp(`^${GENERATED_DATABASE_MARKER}_[a-f0-9]{16}$`);
  if (!pattern.test(databaseName)) {
    throw new Error('Refusing database without the clean-cutover generated marker.');
  }
}

function isOfficeHost(host: string): boolean {
  return /(^|[.-])office([.-]|$)|kiditem.*office|office.*kiditem/i.test(host);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
