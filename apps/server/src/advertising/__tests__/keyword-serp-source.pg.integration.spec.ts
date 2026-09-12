import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { json } from "express";
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from "../../test-helpers/real-prisma";
import { AlertsController } from "../../alerts/alerts.controller";
import { SourceFailureAlerts } from "../../alerts/alerts.service";
import { KeywordRankController } from "../adapter/in/http/keyword-rank.controller";
import { KeywordSerpSourceController } from "../adapter/in/http/keyword-serp-source.controller";
import { KeywordRankService } from "../application/service/keyword-rank.service";
import { KeywordRankIngestHandler } from "../application/service/keyword-rank-ingest.handler";
import { KeywordRankRepositoryAdapter } from "../adapter/out/repository/keyword-rank.repository.adapter";
import { KeywordSerpSourceRepository } from "../adapter/out/repository/keyword-serp-source.repository";
import { currentBusinessDate } from "../domain/business-date";

const base = "/api/ads/keyword-rank/serp";
describe("Public keyword SERP owner HTTP + PostgreSQL", () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let httpUrl: string;
  let alerts: SourceFailureAlerts;
  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    alerts = new SourceFailureAlerts(prisma as never);
    const rank = new KeywordRankRepositoryAdapter(prisma as never);
    const owner = new KeywordSerpSourceRepository(
      prisma as never,
      alerts,
      rank,
      new KeywordRankIngestHandler(rank),
    );
    const module = await Test.createTestingModule({
      controllers: [
        KeywordSerpSourceController,
        KeywordRankController,
        AlertsController,
      ],
      providers: [
        { provide: KeywordSerpSourceRepository, useValue: owner },
        { provide: KeywordRankService, useValue: new KeywordRankService(rank) },
        { provide: SourceFailureAlerts, useValue: alerts },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false, bodyParser: false });
    app.use(json({ limit: "25mb" }));
    app.setGlobalPrefix("api");
    app.use(
      (
        req: { headers: Record<string, string>; authUser?: unknown },
        _res: unknown,
        next: () => void,
      ) => {
        if (req.headers["x-test-org"])
          req.authUser = {
            id: USER,
            organizationId: req.headers["x-test-org"],
          };
        next();
      },
    );
    await app.init();
    await app.listen(0, "127.0.0.1");
    httpUrl = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.coupangKeywordTracker.create({
      data: {
        organizationId: ORG,
        keyword: "문구",
        vendorItemIds: ["EXPLICIT", "MISS"],
        maxPages: 2,
      },
    });
    const account = await prisma.channelAccount.create({
      data: { organizationId: ORG, channel: "coupang", name: "Wing" },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: ORG,
        channelAccountId: account.id,
        externalId: "OWN",
        channelName: "Own product",
      },
    });
    await prisma.channelListingOption.create({
      data: {
        organizationId: ORG,
        listingId: listing.id,
        externalOptionId: "OWN",
      },
    });
  });
  const start = (key = randomUUID(), body = { keyword: "문구", maxPages: 2 }) =>
    request(httpUrl)
      .post(`${base}/attempts`)
      .set("x-test-org", ORG)
      .set("Idempotency-Key", key)
      .send(body);
  const get = (path: string) =>
    request(httpUrl).get(path).set("x-test-org", ORG);
  const submit = (
    attempt: { attemptId: string; attemptToken: string },
    body = capture(),
  ) =>
    request(httpUrl)
      .put(`${base}/attempts/${attempt.attemptId}`)
      .set("x-test-org", ORG)
      .set("x-source-attempt-token", attempt.attemptToken)
      .send(body);
  const fail = (
    attempt: { attemptId: string; attemptToken: string },
    code = "PROVIDER_FAILED",
  ) =>
    request(httpUrl)
      .post(`${base}/attempts/${attempt.attemptId}/fail`)
      .set("x-test-org", ORG)
      .set("x-source-attempt-token", attempt.attemptToken)
      .send({ code, message: "Provider interrupted." });
  it("publishes a frozen keyword capture and exposes exact COMPLETE plus existing daily ranks without an Operation", async () => {
    const a = (await start().expect(201)).body;
    expect(a).toMatchObject({
      state: "RUNNING",
      generation: "1",
      plan: {
        keyword: "문구",
        maxPages: 2,
        explicitVendorItemIds: ["EXPLICIT", "MISS"],
      },
    });
    const payload = capture();
    expect((await submit(a, payload).expect(200)).body).toMatchObject({
      state: "COMPLETE",
      itemCount: 3,
    });
    expect(
      (
        await get(
          `${base}/source?keyword=${encodeURIComponent("문구")}`,
        ).expect(200)
      ).body,
    ).toMatchObject({
      ready: true,
      latestComplete: { attemptId: a.attemptId },
    });
    expect(
      (await get(`${base}/attempts/${a.attemptId}/capture`).expect(200)).body,
    ).toMatchObject({ attemptId: a.attemptId, capture: payload });
    expect(
      (await get("/api/ads/keyword-rank/history?keyword=문구").expect(200)).body
        .series,
    ).toMatchObject([
      {
        vendorItemId: "EXPLICIT",
        points: [{ overallRank: 1, organicRank: 2, adRank: 1 }],
      },
      { vendorItemId: "MISS", points: [{ overallRank: null }] },
      {
        vendorItemId: "OWN",
        points: [{ overallRank: 2, organicRank: 1, adRank: null }],
      },
    ]);
    expect((await get("/api/alerts").expect(200)).body).toEqual([]);
  });
  it("replays admission with frozen targets and marks changed normalization inputs STALE without provider IO", async () => {
    const key = randomUUID();
    const a = (await start(key).expect(201)).body;
    await prisma.coupangKeywordTracker.updateMany({
      where: { organizationId: ORG },
      data: { vendorItemIds: ["NEW"] },
    });
    await prisma.channelListingOption.updateMany({
      where: { organizationId: ORG },
      data: { isActive: false },
    });
    expect((await start(key).expect(201)).body).toEqual(a);
    await start(key, { keyword: "문구", maxPages: 3 }).expect(409);
    await submit(a).expect(200);
    const history = (
      await get("/api/ads/keyword-rank/history?keyword=문구").expect(200)
    ).body;
    expect(
      history.series.map((row: { vendorItemId: string }) => row.vendorItemId),
    ).toEqual(["EXPLICIT", "MISS", "OWN"]);
    expect(
      (await get(`${base}/source?keyword=문구`).expect(200)).body,
    ).toMatchObject({
      ready: false,
      latestComplete: { attemptId: a.attemptId },
    });
  });
  it("rejects a claimed page range that omits an earlier observed page, with FAILED plus Alert and no capture", async () => {
    const a = (await start().expect(201)).body;
    const payload = capture();
    payload.items = [{ ...payload.items[0], isAd: false, page: 2 }];
    expect((await submit(a, payload).expect(200)).body.state).toBe("FAILED");
    await get(`${base}/attempts/${a.attemptId}/capture`).expect(404);
    expect((await get("/api/alerts").expect(200)).body).toMatchObject([
      { attemptId: a.attemptId, status: "OPEN", href: "/rank-tracking" },
    ]);
  });
  it("retains exact A while same-day B advances current, a failed C preserves it, and delayed older D does not rewind daily ranks", async () => {
    const now = Date.now();
    const a = (await start().expect(201)).body;
    const aPayload = {
      ...capture(),
      capturedAt: new Date(now - 20_000).toISOString(),
    };
    await submit(a, aPayload).expect(200);
    const b = (await start().expect(201)).body;
    const bPayload = {
      ...capture(),
      capturedAt: new Date(now - 10_000).toISOString(),
    };
    bPayload.items[0].priceKrw = 2500;
    await submit(b, bPayload).expect(200);
    const c = (await start().expect(201)).body;
    expect((await fail(c).expect(201)).body.state).toBe("FAILED");
    expect(
      (await get(`${base}/source?keyword=문구`).expect(200)).body,
    ).toMatchObject({
      ready: false,
      latestComplete: {
        attemptId: b.attemptId,
        actualCutoffAt: bPayload.capturedAt,
      },
    });
    const alertsBefore = (await get("/api/alerts").expect(200)).body;
    await fail(c).expect(201);
    expect((await get("/api/alerts").expect(200)).body).toEqual(alertsBefore);
    const d = (await start().expect(201)).body;
    const dPayload = {
      ...capture(),
      capturedAt: new Date(now - 30_000).toISOString(),
    };
    await submit(d, dPayload).expect(200);
    expect(
      (await get(`${base}/source?keyword=문구`).expect(200)).body,
    ).toMatchObject({
      latestAttempt: { attemptId: d.attemptId },
      latestComplete: { attemptId: b.attemptId },
    });
    expect(
      (await get(`${base}/attempts/${a.attemptId}/capture`).expect(200)).body
        .capture,
    ).toEqual(aPayload);
    expect(
      (await get(`${base}/attempts/${d.attemptId}/capture`).expect(200)).body
        .capture,
    ).toEqual(dPayload);
    const serp = (
      await get("/api/ads/keyword-rank/serp?keyword=문구").expect(200)
    ).body;
    expect(serp.capturedAt).toBe(bPayload.capturedAt);
    const replay = (await submit(b, bPayload).expect(200)).body;
    expect(replay.actualCutoffAt).toBe(bPayload.capturedAt);
    await submit(b, { ...bPayload, capturedAt: aPayload.capturedAt }).expect(
      409,
    );
    await fail(b).expect(409);
    expect((await get("/api/alerts").expect(200)).body).toMatchObject([
      { status: "RESOLVED", attemptId: d.attemptId },
    ]);
  });
  it("reads only the winning COMPLETE rank generation per keyword/day, preserving other days and explicit null misses", async () => {
    const now = Date.now();
    const yesterday = (await start().expect(201)).body;
    await submit(yesterday, {
      ...capture(),
      capturedAt: new Date(now - 86_400_000).toISOString(),
    }).expect(200);
    const other = (
      await start(randomUUID(), { keyword: "다른", maxPages: 2 }).expect(201)
    ).body;
    await submit(other, { ...capture(), keyword: "다른" }).expect(200);

    const a = (await start().expect(201)).body;
    await submit(a, {
      ...capture(),
      capturedAt: new Date(now - 20_000).toISOString(),
    }).expect(200);
    const b = (await start().expect(201)).body;
    const bPayload = {
      ...capture(),
      capturedAt: new Date(now - 10_000).toISOString(),
    };
    bPayload.items = bPayload.items.map((item) => ({
      ...item,
      vendorItemId: "COMPETITOR",
    }));
    await submit(b, bPayload).expect(200);
    const readHistory = async () =>
      (await get("/api/ads/keyword-rank/history?keyword=문구").expect(200)).body
        .series;
    const history = await readHistory();
    expect(
      history.find(
        (row: { vendorItemId: string }) => row.vendorItemId === "OWN",
      ).points,
    ).toHaveLength(1);
    expect(
      history.find(
        (row: { vendorItemId: string }) => row.vendorItemId === "EXPLICIT",
      ).points,
    ).toMatchObject([{ overallRank: 1 }, { overallRank: null }]);
    expect(
      (await get("/api/ads/keyword-rank/history?keyword=다른").expect(200)).body
        .series,
    ).toMatchObject([{ vendorItemId: "OWN", points: [{ overallRank: 2 }] }]);
    const listing = await prisma.channelListing.findFirstOrThrow({
      where: { organizationId: ORG },
    });
    await prisma.channelListingOption.create({
      data: {
        organizationId: ORG,
        listingId: listing.id,
        externalOptionId: "LATE",
      },
    });
    const d = (await start().expect(201)).body;
    const dPayload = {
      ...capture(),
      capturedAt: new Date(now - 30_000).toISOString(),
    };
    dPayload.items[0].vendorItemId = "LATE";
    await submit(d, dPayload).expect(200);
    expect(await readHistory()).toEqual(history);
    expect(
      (await get(`${base}/source?keyword=문구`).expect(200)).body.latestComplete
        .attemptId,
    ).toBe(b.attemptId);
    expect(
      (await get(`${base}/attempts/${a.attemptId}/capture`).expect(200)).body
        .capture.items,
    ).toEqual(capture().items);
    expect(
      (await get(`${base}/attempts/${d.attemptId}/capture`).expect(200)).body
        .capture,
    ).toEqual(dPayload);
  });
  it("fences organization, token, source keyword and concurrent active admission", async () => {
    const results = await Promise.all([start(), start()]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    const a = results.find((result) => result.status === 201)!.body;
    await request(httpUrl)
      .get(`${base}/attempts/${a.attemptId}`)
      .set("x-test-org", randomUUID())
      .expect(404);
    await request(httpUrl)
      .put(`${base}/attempts/${a.attemptId}`)
      .set("x-test-org", randomUUID())
      .set("x-source-attempt-token", a.attemptToken)
      .send(capture())
      .expect(404);
    await submit({ ...a, attemptToken: randomUUID() }).expect(409);
    await submit(a, { ...capture(), extra: true } as ReturnType<
      typeof capture
    >).expect(400);
    expect(
      (await get(`${base}/attempts/${a.attemptId}`).expect(200)).body.state,
    ).toBe("RUNNING");
    const invalid = { ...capture(), keyword: "다른 키워드" };
    expect((await submit(a, invalid).expect(200)).body.state).toBe("FAILED");
    expect((await submit(a, invalid).expect(200)).body.state).toBe("FAILED");
    await submit(a).expect(409);
    await get(`${base}/attempts/${a.attemptId}/capture`).expect(404);
    expect(
      (await get(`${base}/source?keyword=문구`).expect(200)).body,
    ).toMatchObject({ ready: false, latestComplete: null });
  });
  it("keeps expiry reads side-effect-free and settles FAILED plus Alert on the next begin", async () => {
    const a = (await start().expect(201)).body;
    await prisma.sourceImportRun.update({
      where: { id: a.attemptId },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect(
      (await get(`${base}/attempts/${a.attemptId}`).expect(200)).body,
    ).toMatchObject({ state: "FAILED", errorCode: "ATTEMPT_EXPIRED" });
    expect((await get("/api/alerts").expect(200)).body).toEqual([]);
    await submit(a).expect(409);
    const b = (await start().expect(201)).body;
    expect(b).toMatchObject({ state: "RUNNING", generation: "2" });
    expect((await get("/api/alerts").expect(200)).body).toMatchObject([
      { attemptId: a.attemptId, status: "OPEN" },
    ]);
    await fail(a).expect(409);
  });
  it("accepts observed later empty pages and rejects every interrupted proof without replacing prior COMPLETE", async () => {
    const a = (await start().expect(201)).body;
    const payload = capture();
    payload.pagesScanned = 1;
    payload.items = payload.items.slice(0, 2);
    payload.pagination.stopReason = "empty_page";
    await submit(a, payload).expect(200);
    for (const reason of [
      "load_failed",
      "redirect",
      "extraction_failed",
      "provider_wall",
      "invalid_result",
    ]) {
      const next = (await start().expect(201)).body;
      const submission = await submit(next, {
        ...payload,
        pagination: { ...payload.pagination, stopReason: reason },
      })
        .expect((response) => {
          if (response.status !== 200) {
            throw new Error(
              [
                `SERP loop submission failed for stopReason=${reason}`,
                `status=${response.status}`,
                `content-type=${response.headers["content-type"] ?? "unknown"}`,
                `server=${response.headers.server ?? "unknown"}`,
                `body=${JSON.stringify(response.body ?? "").slice(0, 1000)}`,
                `text=${(response.text ?? "").slice(0, 1000)}`,
              ].join("; "),
            );
          }
      })
        .expect(200);
      expect(submission.body.state).toBe("FAILED");
      const source = await get(`${base}/source?keyword=문구`)
        .expect((response) => {
          if (response.status !== 200) {
            throw new Error(
              [
                `SERP loop source failed for stopReason=${reason}`,
                `status=${response.status}`,
                `content-type=${response.headers["content-type"] ?? "unknown"}`,
                `body=${JSON.stringify(response.body ?? "").slice(0, 1000)}`,
                `text=${(response.text ?? "").slice(0, 1000)}`,
              ].join("; "),
            );
          }
        })
        .expect(200);
      expect(source.body.latestComplete.attemptId).toBe(a.attemptId);
    }
    const empty = (await start().expect(201)).body;
    expect(
      (
        await submit(empty, {
          ...payload,
          pagesScanned: 0,
          items: [],
          pagination: { ...payload.pagination, stoppedAtPage: 1 },
        }).expect(200)
      ).body.state,
    ).toBe("FAILED");
  });
  it("rolls back capture, projections, tracker creation and terminal state when the Alert transaction fails", async () => {
    const a = (
      await start(randomUUID(), { keyword: "신규", maxPages: 2 }).expect(201)
    ).body;
    const payload = { ...capture(), keyword: "신규" };
    vi.spyOn(alerts, "resolveSourceFailure").mockRejectedValueOnce(
      new Error("Injected Alert persistence failure"),
    );
    await submit(a, payload).expect(500);
    expect(
      (await get(`${base}/attempts/${a.attemptId}`).expect(200)).body.state,
    ).toBe("RUNNING");
    await get(`${base}/attempts/${a.attemptId}/capture`).expect(404);
    expect(
      (await get("/api/ads/keyword-rank/trackers").expect(200)).body.map(
        (row: { keyword: string }) => row.keyword,
      ),
    ).not.toContain("신규");
    await submit(a, payload).expect(200);
    expect(
      (await get("/api/ads/keyword-rank/trackers").expect(200)).body.map(
        (row: { keyword: string }) => row.keyword,
      ),
    ).toContain("신규");
    const b = (await start().expect(201)).body;
    vi.spyOn(alerts, "recordTerminalOutcome").mockRejectedValueOnce(
      new Error("Injected failure Alert error"),
    );
    await fail(b).expect(500);
    expect(
      (await get(`${base}/attempts/${b.attemptId}`).expect(200)).body.state,
    ).toBe("RUNNING");
    await fail(b).expect(201);
  });
  it("does not certify physically retained unlinked daily rows as COMPLETE", async () => {
    await prisma.coupangKeywordSerpDailySnapshot.create({
      data: {
        organizationId: ORG,
        keyword: "legacy",
        businessDate: new Date(),
        capturedAt: new Date(),
        pagesScanned: 1,
        itemCount: 1,
        items: [{ vendorItemId: "OLD" }],
      },
    });
    await prisma.coupangKeywordRankDailySnapshot.create({
      data: {
        organizationId: ORG,
        keyword: "legacy",
        vendorItemId: "OLD",
        businessDate: new Date(),
        capturedAt: new Date(),
        overallRank: 1,
      },
    });
    expect(
      (await get(`${base}/source?keyword=legacy`).expect(200)).body,
    ).toMatchObject({ ready: false, latestComplete: null });
    expect(
      (await get("/api/ads/keyword-rank/history?keyword=legacy").expect(200))
        .body.series,
    ).toEqual([]);
    expect(
      (await get("/api/ads/keyword-rank/serp?keyword=legacy").expect(200)).body
        .items,
    ).toEqual([]);
    expect(
      await prisma.coupangKeywordSerpDailySnapshot.count({
        where: { organizationId: ORG, keyword: "legacy" },
      }),
    ).toBe(1);
    expect(
      await prisma.coupangKeywordRankDailySnapshot.count({
        where: { organizationId: ORG, keyword: "legacy" },
      }),
    ).toBe(1);
  });
  it.each([-60_000, 60_000])(
    "does not promote an unlinked legacy seller catalog or timestamp (%s) when a genuine capture replaces that daily slot",
    async (offset) => {
      const payload = capture();
      await prisma.coupangKeywordSerpDailySnapshot.create({
        data: {
          organizationId: ORG,
          keyword: "문구",
          businessDate: currentBusinessDate(),
          capturedAt: new Date(Date.now() + offset),
          itemCount: 1,
          pagesScanned: 1,
          items: {
            serpItems: [],
            sellerCatalogs: [
              {
                sellerId: "LEGACY",
                sellerStoreUrl: "https://shop.coupang.com/LEGACY",
                capturedAt: new Date().toISOString(),
                products: [{ productId: "P", name: "Old product" }],
              },
            ],
          },
        },
      });
      await prisma.coupangKeywordRankDailySnapshot.create({
        data: {
          organizationId: ORG,
          keyword: "문구",
          vendorItemId: "EXPLICIT",
          businessDate: currentBusinessDate(),
          capturedAt: new Date(Date.now() + offset),
          overallRank: 999,
        },
      });
      const a = (await start().expect(201)).body;
      await submit(a, payload).expect(200);
      const serp = (
        await get("/api/ads/keyword-rank/serp?keyword=문구").expect(200)
      ).body;
      expect(serp.items.sellerCatalogs).toEqual([]);
      expect(
        (await get("/api/ads/keyword-rank/history?keyword=문구").expect(200))
          .body.series[0].points[0].overallRank,
      ).toBe(1);
      expect(
        (await get(`${base}/attempts/${a.attemptId}/capture`).expect(200)).body
          .capture,
      ).toEqual(payload);
    },
  );
  it("measures a realistic three-page one-shot and returns the same capture after terminal recovery", async () => {
    const items = Array.from({ length: 144 }, (_, index) => ({
      rank: index + 1,
      page: Math.floor(index / 48) + 1,
      positionInPage: (index % 48) + 1,
      isAd: index % 8 === 0,
      productId: String(100000 + index),
      itemId: String(200000 + index),
      vendorItemId: String(300000 + index),
      name: "어린이 캐릭터 문구 세트 노트 연필 지우개",
      priceKrw: 12900,
      reviewCount: 240,
      ratingScore: 4.5,
      link: `https://www.coupang.com/vp/products/${100000 + index}?itemId=${200000 + index}&vendorItemId=${300000 + index}`,
    }));
    await prisma.coupangKeywordTracker.updateMany({
      where: { organizationId: ORG },
      data: { vendorItemIds: items.map((item) => item.vendorItemId) },
    });
    const a = (
      await start(randomUUID(), { keyword: "문구", maxPages: 3 }).expect(201)
    ).body;
    const payload = {
      ...capture(),
      pagesScanned: 3,
      items,
      pagination: {
        requestedMaxPages: 3,
        stoppedAtPage: 3,
        stopReason: "page_limit",
      },
    };
    const started = performance.now();
    expect((await submit(a, payload).expect(200)).body).toMatchObject({
      state: "COMPLETE",
      itemCount: 144,
    });
    const terminalMs = performance.now() - started;
    const readStarted = performance.now();
    expect(
      (await get(`${base}/attempts/${a.attemptId}/capture`).expect(200)).body
        .capture,
    ).toEqual(payload);
    console.info(
      "SERP_THREE_PAGE_MEASUREMENT",
      JSON.stringify({
        rows: items.length,
        bytes: Buffer.byteLength(JSON.stringify(payload)),
        terminalMs: Math.round(terminalMs),
        exactReadMs: Math.round(performance.now() - readStarted),
      }),
    );
    const replay = await Promise.all([submit(a, payload), submit(a, payload)]);
    expect(replay.map((reply) => reply.status)).toEqual([200, 200]);
    const reordered = {
      ...payload,
      items: payload.items.map((item) =>
        Object.fromEntries(Object.entries(item).reverse()),
      ),
    };
    await submit(a, reordered as typeof payload).expect(200);
  });
});

function capture() {
  return {
    keyword: "문구",
    capturedAt: new Date().toISOString(),
    pagesScanned: 2,
    items: [
      {
        rank: 1,
        page: 1,
        positionInPage: 1,
        isAd: true,
        productId: "P1",
        vendorItemId: "EXPLICIT",
        name: "Explicit",
        priceKrw: 1000,
      },
      {
        rank: 2,
        page: 1,
        positionInPage: 2,
        isAd: false,
        productId: "P2",
        vendorItemId: "OWN",
        name: "Own",
      },
      {
        rank: 3,
        page: 2,
        positionInPage: 1,
        isAd: false,
        productId: "P1",
        vendorItemId: "EXPLICIT",
        name: "Explicit",
      },
    ],
    pagination: {
      requestedMaxPages: 2,
      stoppedAtPage: 2,
      stopReason: "page_limit",
    },
  };
}
