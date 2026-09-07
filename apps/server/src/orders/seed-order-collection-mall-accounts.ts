/**
 * Idempotent, organization-scoped seed for order-collection mall credentials.
 *
 * Mall credentials are deployment inputs only. They are encrypted into the
 * target organization's ChannelAccount rows and are never API runtime
 * fallbacks shared across organizations.
 */
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config, parse } from "dotenv";
import {
  OrderCollectionMallAccountService,
  type OrderCollectionMallAccount,
} from "./services/order-collection-mall-account.service";
import type { PrismaService } from "../prisma/prisma.service";

const SEED_CONFIRMATION = "APPLY_ORDER_COLLECTION_MALL_ACCOUNTS";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ORDER_COLLECTION_MALL_ENV = [
  { key: "one-polaris", prefix: "ONE_POLARIS" },
  { key: "icecream-mall", prefix: "ICECREAM_MALL" },
  { key: "kidkids", prefix: "KIDKIDS" },
  { key: "kidsnote", prefix: "KIDSNOTE" },
  { key: "haebub-mall", prefix: "HAEBUB_MALL" },
  { key: "onch", prefix: "ONCH" },
  { key: "kkomangse", prefix: "KKOMANGSE" },
  { key: "art09", prefix: "ART09" },
  { key: "tekville-edu", prefix: "TEKVILLE_EDU" },
  { key: "benepia-mul", prefix: "BENEPIA_MUL" },
  { key: "domeggook", prefix: "DOMEGGOOK" },
  { key: "lotte-on", prefix: "LOTTE_ON" },
  { key: "boribori", prefix: "BORIBORI" },
  { key: "always", prefix: "ALWAYS" },
  { key: "woongjin-class", prefix: "WOONGJIN_CLASS" },
  { key: "kakao", prefix: "KAKAO" },
  { key: "toss", prefix: "TOSS" },
  { key: "teacher-mall", prefix: "TEACHER_MALL" },
  { key: "gs-shop", prefix: "GS_SHOP" },
  { key: "coupang-direct", prefix: "COUPANG_DIRECT" },
  { key: "gmarket", prefix: "GMARKET" },
  { key: "auction", prefix: "AUCTION" },
  { key: "11st", prefix: "ELEVEN_ST" },
  { key: "smartstore", prefix: "SMARTSTORE" },
  { key: "ssg", prefix: "SSG" },
  { key: "thirtymall", prefix: "THIRTYMALL" },
  { key: "yoons", prefix: "YOONS" },
] as const;

type OrderCollectionMallSeedKey =
  (typeof ORDER_COLLECTION_MALL_ENV)[number]["key"];

export interface OrderCollectionMallSeedAccount {
  key: OrderCollectionMallSeedKey;
  loginId: string;
  supplierLoginId?: string;
  password: string;
  siteUrl: string;
}

export interface OrderCollectionMallSeedConfig {
  organizationId: string;
  accounts: OrderCollectionMallSeedAccount[];
}

export interface OrderCollectionMallSeedResult {
  organizationId: string;
  accountCount: number;
  updatedCount: number;
  unchangedCount: number;
}

type SeedEnv = Record<string, string | undefined>;

export function loadOrderCollectionMallSeedEnv(cwd = process.cwd()): void {
  config({ path: resolve(cwd, ".env") });
  config({ path: resolve(cwd, "apps/server/.env") });
}

export function resolveOrderCollectionMallSeedConfig(
  env: SeedEnv = process.env,
): OrderCollectionMallSeedConfig {
  if (trimmed(env.ORDER_COLLECTION_MALL_SEED_CONFIRM) !== SEED_CONFIRMATION) {
    throw new Error(
      `Refusing to seed order-collection mall accounts: set ORDER_COLLECTION_MALL_SEED_CONFIRM=${SEED_CONFIRMATION}.`,
    );
  }

  const blob = env.ORDER_COLLECTION_MALL_ACCOUNTS_ENV
    ? parse(env.ORDER_COLLECTION_MALL_ACCOUNTS_ENV)
    : {};
  const read = (name: string) => trimmed(env[name]) ?? trimmed(blob[name]);
  const organizationId =
    read("ORDER_COLLECTION_MALL_ORGANIZATION_ID") ??
    read("KIDITEM_DEV_ORGANIZATION_ID");

  if (!organizationId || !UUID_PATTERN.test(organizationId)) {
    throw new Error(
      "Missing or invalid ORDER_COLLECTION_MALL_ORGANIZATION_ID (local seed may use KIDITEM_DEV_ORGANIZATION_ID).",
    );
  }

  const accounts: OrderCollectionMallSeedAccount[] = [];
  for (const mall of ORDER_COLLECTION_MALL_ENV) {
    const loginId = read(`${mall.prefix}_ID`);
    const supplierLoginId = mall.key === "art09"
      ? read(`${mall.prefix}_SUPPLIER_ID`)
      : undefined;
    const password = read(`${mall.prefix}_PW`);
    const siteUrl = read(`${mall.prefix}_URL`);
    const credentialValues = [loginId, password, siteUrl];
    const presentCount = credentialValues.filter(Boolean).length;

    if (presentCount === 0 && !supplierLoginId) continue;
    if (presentCount !== credentialValues.length) {
      throw new Error(
        `Incomplete ${mall.prefix} credential triple: ${mall.prefix}_ID, ${mall.prefix}_PW, and ${mall.prefix}_URL must be set together.`,
      );
    }
    assertHttpUrl(`${mall.prefix}_URL`, siteUrl!);
    accounts.push({
      key: mall.key,
      loginId: loginId!,
      ...(supplierLoginId ? { supplierLoginId } : {}),
      password: password!,
      siteUrl: siteUrl!,
    });
  }

  if (accounts.length === 0) {
    throw new Error(
      "No complete order-collection mall credential triples were provided.",
    );
  }

  return { organizationId, accounts };
}

export function createOrderCollectionMallSeedPrisma(
  env: SeedEnv = process.env,
): PrismaClient {
  const connectionString = trimmed(env.DATABASE_URL);
  if (!connectionString) {
    throw new Error(
      "Missing DATABASE_URL: order-collection mall seed requires a database connection.",
    );
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export async function seedOrderCollectionMallAccounts(
  prisma: PrismaClient,
  seedConfig: OrderCollectionMallSeedConfig,
  service = new OrderCollectionMallAccountService(
    prisma as unknown as PrismaService,
  ),
): Promise<OrderCollectionMallSeedResult> {
  const organization = await prisma.organization.findFirst({
    where: { id: seedConfig.organizationId, isActive: true },
    select: { id: true },
  });
  if (!organization) {
    throw new Error("Target organization does not exist or is inactive.");
  }

  const currentAccounts = new Map(
    (await service.list(seedConfig.organizationId)).map((account) => [
      account.key,
      account,
    ]),
  );
  let updatedCount = 0;
  let unchangedCount = 0;

  for (const account of seedConfig.accounts) {
    if (
      account.key === "art09" &&
      !resolveArt09SupplierLoginId(
        account,
        currentAccounts.get(account.key),
      )
    ) {
      throw new Error(
        "Missing ART09_SUPPLIER_ID: a new Art09 seed requires the supplier login ID.",
      );
    }
  }

  for (const account of seedConfig.accounts) {
    const current = currentAccounts.get(account.key);
    const supplierLoginId = account.key === "art09"
      ? resolveArt09SupplierLoginId(account, current)
      : undefined;
    const passwordMatches = await hasMatchingPassword(
      service,
      seedConfig.organizationId,
      current,
      account.password,
    );
    const unchanged =
      current?.enabled === true &&
      current.loginId === account.loginId &&
      (account.key !== "art09" ||
        current.supplierLoginId === supplierLoginId) &&
      current.siteUrl === account.siteUrl &&
      passwordMatches;

    if (unchanged) {
      unchangedCount += 1;
      continue;
    }

    await service.update(seedConfig.organizationId, account.key, {
      enabled: true,
      loginId: account.loginId,
      ...(account.key === "art09"
        ? { supplierLoginId }
        : {}),
      password: passwordMatches ? undefined : account.password,
      siteUrl: account.siteUrl,
      memo: current?.memo ?? undefined,
    });
    updatedCount += 1;
  }

  return {
    organizationId: seedConfig.organizationId,
    accountCount: seedConfig.accounts.length,
    updatedCount,
    unchangedCount,
  };
}

function resolveArt09SupplierLoginId(
  account: OrderCollectionMallSeedAccount,
  current: OrderCollectionMallAccount | undefined,
): string | undefined {
  return account.supplierLoginId ?? current?.supplierLoginId ?? undefined;
}

async function hasMatchingPassword(
  service: OrderCollectionMallAccountService,
  organizationId: string,
  current: OrderCollectionMallAccount | undefined,
  expectedPassword: string,
): Promise<boolean> {
  if (!current?.hasPassword) return false;
  const saved = await service.getPassword(organizationId, current.key);
  return saved.password === expectedPassword;
}

function trimmed(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result ? result : undefined;
}

function assertHttpUrl(name: string, value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${name} must use http or https.`);
  }
}

export async function runOrderCollectionMallSeed(): Promise<OrderCollectionMallSeedResult> {
  loadOrderCollectionMallSeedEnv();
  const seedConfig = resolveOrderCollectionMallSeedConfig();
  const prisma = createOrderCollectionMallSeedPrisma();
  try {
    const result = await seedOrderCollectionMallAccounts(prisma, seedConfig);
    console.log("Order-collection mall seed completed.");
    console.log(`  credential triples: ${result.accountCount}`);
    console.log(`  accounts updated: ${result.updatedCount}`);
    console.log(`  accounts unchanged: ${result.unchangedCount}`);
    console.log("Done.");
    return result;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runOrderCollectionMallSeed().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
