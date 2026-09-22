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
import type { ChannelAccountPort, MallAccount as OrderCollectionMallAccount } from "../../../application/port/in/account/channel-account.port";
import {
  findOrderCollectionMall,
  orderCollectionMallAccountIdentity,
} from "../../../domain/account/mall-account-identity";
import {
  MALL_CHANNELS,
  type MallChannelKey,
} from "@kiditem/shared/channel-registry";

const SEED_CONFIRMATION = "APPLY_ORDER_COLLECTION_MALL_ACCOUNTS";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 몰 키 → 자격증명 환경변수 접두사. 몰 목록 · 이름은 채널 레지스트리가 답하고, 시드는
 * 그 몰의 아이디 · 비밀번호 · 주소를 어느 변수에서 읽는지만 안다.
 */
export const ORDER_COLLECTION_MALL_ENV_PREFIX: Record<MallChannelKey, string> = {
  "one-polaris": "ONE_POLARIS",
  "icecream-mall": "ICECREAM_MALL",
  "kidkids": "KIDKIDS",
  "kidsnote": "KIDSNOTE",
  "haebub-mall": "HAEBUB_MALL",
  "onch": "ONCH",
  "kkomangse": "KKOMANGSE",
  "art09": "ART09",
  "tekville-edu": "TEKVILLE_EDU",
  "benepia-mul": "BENEPIA_MUL",
  "domeggook": "DOMEGGOOK",
  "lotte-on": "LOTTE_ON",
  "boribori": "BORIBORI",
  "always": "ALWAYS",
  "woongjin-class": "WOONGJIN_CLASS",
  "kakao": "KAKAO",
  "toss": "TOSS",
  "teacher-mall": "TEACHER_MALL",
  "gs-shop": "GS_SHOP",
  "coupang-direct": "COUPANG_DIRECT",
  "gmarket": "GMARKET",
  "auction": "AUCTION",
  "11st": "ELEVEN_ST",
  "smartstore": "SMARTSTORE",
  "ssg": "SSG",
  "thirtymall": "THIRTYMALL",
  "yoons": "YOONS",
};

type OrderCollectionMallSeedKey = MallChannelKey;

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
  for (const mall of MALL_CHANNELS) {
    const prefix = ORDER_COLLECTION_MALL_ENV_PREFIX[mall.key];
    const loginId = read(`${prefix}_ID`);
    const supplierLoginId = mall.key === "art09"
      ? read(`${prefix}_SUPPLIER_ID`)
      : undefined;
    const password = read(`${prefix}_PW`);
    const siteUrl = read(`${prefix}_URL`);
    const credentialValues = [loginId, password, siteUrl];
    const presentCount = credentialValues.filter(Boolean).length;

    if (presentCount === 0 && !supplierLoginId) continue;
    if (presentCount !== credentialValues.length) {
      throw new Error(
        `Incomplete ${prefix} credential triple: ${prefix}_ID, ${prefix}_PW, and ${prefix}_URL must be set together.`,
      );
    }
    assertHttpUrl(`${prefix}_URL`, siteUrl!);
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
  service: Pick<ChannelAccountPort, 'list' | 'update' | 'getPassword'>,
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

  // 기존 마켓 행을 쓰는 몰(쿠팡직배송 → rocket)은 그 행이 있어야 로그인을 둘 수 있다
  // (ADR-0012). 몰 몇 개를 쓰고 나서 멈추지 않도록, 쓰기 전에 모두 확인한다.
  for (const account of seedConfig.accounts) {
    const mall = findOrderCollectionMall(account.key);
    const identity = mall ? orderCollectionMallAccountIdentity(mall) : null;
    if (identity?.kind !== "shared") continue;
    const sharedRow = currentAccounts.get(account.key)?.channelAccountId;
    if (!sharedRow) {
      throw new Error(
        `Missing ${identity.channel} channel account: ${account.key} credentials are stored on that row.`,
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
  service: Pick<ChannelAccountPort, 'getPassword'>,
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
