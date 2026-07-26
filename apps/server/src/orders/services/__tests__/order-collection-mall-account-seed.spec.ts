import { describe, expect, it, vi } from "vitest";
import {
  resolveOrderCollectionMallSeedConfig,
  seedOrderCollectionMallAccounts,
  type OrderCollectionMallSeedConfig,
} from "../../seed-order-collection-mall-accounts";
import type { OrderCollectionMallAccountService } from "../order-collection-mall-account.service";

const ORGANIZATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONFIRMATION = "APPLY_ORDER_COLLECTION_MALL_ACCOUNTS";

describe("order-collection mall account seed", () => {
  it("parses complete credential triples from the protected dotenv blob", () => {
    const result = resolveOrderCollectionMallSeedConfig({
      ORDER_COLLECTION_MALL_SEED_CONFIRM: CONFIRMATION,
      ORDER_COLLECTION_MALL_ORGANIZATION_ID: ORGANIZATION_ID,
      ORDER_COLLECTION_MALL_ACCOUNTS_ENV: [
        "ALWAYS_ID=always-user",
        'ALWAYS_PW="password with spaces"',
        "ALWAYS_URL=https://always.example.com/login",
        "KAKAO_ID=",
        "KAKAO_PW=",
        "KAKAO_URL=",
      ].join("\n"),
    });

    expect(result).toEqual({
      organizationId: ORGANIZATION_ID,
      accounts: [
        {
          key: "always",
          loginId: "always-user",
          password: "password with spaces",
          siteUrl: "https://always.example.com/login",
        },
      ],
    });
  });

  it("uses the local dev organization only when an explicit seed target is absent", () => {
    const result = resolveOrderCollectionMallSeedConfig({
      ORDER_COLLECTION_MALL_SEED_CONFIRM: CONFIRMATION,
      KIDITEM_DEV_ORGANIZATION_ID: ORGANIZATION_ID,
      GS_SHOP_ID: "gs-user",
      GS_SHOP_PW: "gs-password",
      GS_SHOP_URL: "https://gs.example.com/login",
    });

    expect(result.organizationId).toBe(ORGANIZATION_ID);
    expect(result.accounts.map((account) => account.key)).toEqual(["gs-shop"]);
  });

  it("rejects a partial credential triple without revealing its values", () => {
    expect(() =>
      resolveOrderCollectionMallSeedConfig({
        ORDER_COLLECTION_MALL_SEED_CONFIRM: CONFIRMATION,
        ORDER_COLLECTION_MALL_ORGANIZATION_ID: ORGANIZATION_ID,
        KIDKIDS_ID: "kidkids-user",
        KIDKIDS_PW: "super-secret",
      }),
    ).toThrow(
      "Incomplete KIDKIDS credential triple: KIDKIDS_ID, KIDKIDS_PW, and KIDKIDS_URL must be set together.",
    );
  });

  it("rejects execution without the explicit confirmation token", () => {
    expect(() =>
      resolveOrderCollectionMallSeedConfig({
        ORDER_COLLECTION_MALL_ORGANIZATION_ID: ORGANIZATION_ID,
        ALWAYS_ID: "always-user",
        ALWAYS_PW: "always-password",
        ALWAYS_URL: "https://always.example.com/login",
      }),
    ).toThrow("Refusing to seed order-collection mall accounts");
  });

  it("updates only changed accounts and preserves an unchanged encrypted password", async () => {
    const prisma = {
      organization: {
        findFirst: vi.fn().mockResolvedValue({ id: ORGANIZATION_ID }),
      },
    };
    const list = vi.fn().mockResolvedValue([
      mallAccount({
        key: "always",
        loginId: "always-user",
        siteUrl: "https://old.example.com",
      }),
      mallAccount({
        key: "kakao",
        loginId: "kakao-user",
        siteUrl: "https://kakao.example.com",
      }),
    ]);
    const getPassword = vi
      .fn()
      .mockImplementation(async (_organizationId: string, key: string) => ({
        key,
        password: key === "always" ? "same-password" : "old-password",
      }));
    const update = vi.fn().mockResolvedValue(undefined);
    const service = {
      list,
      getPassword,
      update,
    } as unknown as OrderCollectionMallAccountService;
    const config: OrderCollectionMallSeedConfig = {
      organizationId: ORGANIZATION_ID,
      accounts: [
        {
          key: "always",
          loginId: "always-user",
          password: "same-password",
          siteUrl: "https://new.example.com",
        },
        {
          key: "kakao",
          loginId: "kakao-user",
          password: "new-password",
          siteUrl: "https://kakao.example.com",
        },
      ],
    };

    const result = await seedOrderCollectionMallAccounts(
      prisma as never,
      config,
      service,
    );

    expect(result).toMatchObject({
      accountCount: 2,
      updatedCount: 2,
      unchangedCount: 0,
    });
    expect(update).toHaveBeenNthCalledWith(1, ORGANIZATION_ID, "always", {
      enabled: true,
      loginId: "always-user",
      password: undefined,
      siteUrl: "https://new.example.com",
      memo: "existing memo",
    });
    expect(update).toHaveBeenNthCalledWith(2, ORGANIZATION_ID, "kakao", {
      enabled: true,
      loginId: "kakao-user",
      password: "new-password",
      siteUrl: "https://kakao.example.com",
      memo: "existing memo",
    });
  });

  it("does not write accounts whose stored values already match", async () => {
    const prisma = {
      organization: {
        findFirst: vi.fn().mockResolvedValue({ id: ORGANIZATION_ID }),
      },
    };
    const service = {
      list: vi.fn().mockResolvedValue([
        mallAccount({
          key: "always",
          loginId: "always-user",
          siteUrl: "https://always.example.com",
        }),
      ]),
      getPassword: vi
        .fn()
        .mockResolvedValue({ key: "always", password: "same-password" }),
      update: vi.fn(),
    } as unknown as OrderCollectionMallAccountService;

    const result = await seedOrderCollectionMallAccounts(
      prisma as never,
      {
        organizationId: ORGANIZATION_ID,
        accounts: [
          {
            key: "always",
            loginId: "always-user",
            password: "same-password",
            siteUrl: "https://always.example.com",
          },
        ],
      },
      service,
    );

    expect(result).toMatchObject({
      accountCount: 1,
      updatedCount: 0,
      unchangedCount: 1,
    });
    expect(service.update).not.toHaveBeenCalled();
  });
});

function mallAccount({
  key,
  loginId,
  siteUrl,
}: {
  key: "always" | "kakao";
  loginId: string;
  siteUrl: string;
}) {
  return {
    key,
    name: key,
    configured: true,
    enabled: true,
    loginId,
    hasPassword: true,
    siteUrl,
    memo: "existing memo",
    passwordUpdatedAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
  };
}
