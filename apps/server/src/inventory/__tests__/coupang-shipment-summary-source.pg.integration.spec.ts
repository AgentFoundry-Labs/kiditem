import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { AlertsRepository } from "../../alerts/alerts.repository";
import { SourceFailureAlerts } from "../../alerts/alerts.service";
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
} from "../../test-helpers/real-prisma";
import { CoupangShipmentsController } from "../adapter/in/http/coupang-shipments.controller";
import { CoupangShipmentDateSummaryRepositoryAdapter } from "../adapter/out/repository/coupang-shipment-date-summary.repository.adapter";
import { CoupangShipmentsService } from "../application/service/coupang-shipments.service";
import { COUPANG_SHIPMENTS_PORT } from "../application/port/in/fulfillment";

const base = "/api/coupang-shipments/date-summary";
const row = (date: string, count: number, boxes = count) => ({
  date,
  count,
  boxes,
});

describe("Shipment summary owner HTTP + disposable PostgreSQL", () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let alerts: SourceFailureAlerts;
  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    alerts = new SourceFailureAlerts(new AlertsRepository(prisma as never));
    const repository = new CoupangShipmentDateSummaryRepositoryAdapter(
      prisma as never,
      alerts,
    );
    const module = await Test.createTestingModule({
      controllers: [CoupangShipmentsController],
      providers: [
        {
          provide: COUPANG_SHIPMENTS_PORT,
          useValue: new CoupangShipmentsService({} as never, repository),
        },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix("api");
    app.use(
      (
        req: { headers: Record<string, string>; authUser?: unknown },
        _res: unknown,
        next: () => void,
      ) => {
        if (req.headers["x-test-organization"])
          req.authUser = { organizationId: req.headers["x-test-organization"] };
        next();
      },
    );
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it("keeps baseline unverified and separates exact captures from per-date last COMPLETE calendar history", async () => {
    await prisma.coupangShipmentDateSummary.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        shipmentDate: "2026-08-01",
        count: 8,
        boxes: 9,
        capturedAt: new Date("2026-08-02T00:00:00Z"),
      },
    });
    expect((await get("/source")).body).toMatchObject({
      status: "MISSING",
      latestComplete: null,
      items: [{ date: "2026-08-01", count: 8, verified: false }],
    });
    const a = await begin("a");
    expect(a).toMatchObject({ state: "RUNNING", plan: { maxPages: 40 } });
    await complete(a, [row("2026-09-01", 5), row("2026-09-02", 3)]).expect(200);
    const b = await begin("b");
    await complete(b, [row("2026-09-02", 2)]).expect(200);
    const current = (await get("/source")).body;
    expect(current).toMatchObject({
      status: "READY",
      latestComplete: { attemptId: b.attemptId },
      capturedItems: [row("2026-09-02", 2)],
      items: [
        { date: "2026-09-02", count: 2, verified: true },
        { date: "2026-09-01", count: 5, verified: true },
        { date: "2026-08-01", count: 8, verified: false },
      ],
    });
    expect(
      (await get(`/attempts/${a.attemptId}`)).body.capturedItems,
    ).toMatchObject([row("2026-09-02", 3), row("2026-09-01", 5)]);
    const empty = await begin("empty");
    await complete(empty, []).expect(200);
    const after = (await get("/source")).body;
    expect(after).toMatchObject({
      status: "READY",
      latestComplete: { attemptId: empty.attemptId },
      capturedItems: [],
    });
    expect(after.items).toEqual(current.items);
    expect((await get("")).body.items).toEqual(current.items);
  });

  function get(path: string, organizationId = TEST_ORGANIZATION_ID) {
    return request(app.getHttpServer())
      .get(base + path)
      .set("x-test-organization", organizationId);
  }
  it("rejects a claimed processed prefix whose per-page proof is missing or whose totals exceed observed rows", async () => {
    const attempt = await begin("proof");
    const submit = (body: unknown) =>
      request(app.getHttpServer())
        .put(base + `/attempts/${attempt.attemptId}`)
        .set("x-test-organization", TEST_ORGANIZATION_ID)
        .set("X-Source-Attempt-Token", attempt.attemptToken)
        .send(body);
    await submit({
      items: [row("2026-09-01", 2)],
      scannedPages: 1,
      totalRows: 2,
      proof: {
        maxPages: 40,
        validatedTable: true,
        stopReason: "short_page",
        lastPageRowCount: 1,
        pageRowCounts: [1],
      },
    }).expect(400);
    await submit({
      items: [row("2026-09-01", 2)],
      scannedPages: 2,
      totalRows: 2,
      proof: {
        maxPages: 40,
        validatedTable: true,
        stopReason: "short_page",
        lastPageRowCount: 2,
        pageRowCounts: [2],
      },
    }).expect(400);
    expect((await get("/source")).body).toMatchObject({
      status: "MISSING",
      capturedItems: [],
      latestAttempt: { state: "RUNNING" },
    });
  });
  it("replays normalized frozen intent, rejects distinct concurrent starts, and starts only explicit fresh retries", async () => {
    const a = await begin("same", 0);
    expect(await begin("same", 40)).toEqual(a);
    await start("same", 60).expect(409);
    const competing = await Promise.all([start("other"), start("another")]);
    expect(competing.map((response) => response.status)).toEqual([409, 409]);
    await fail(a, "coupang_shipment_session_required").expect(201);
    expect(await begin("same", 40)).toMatchObject({
      attemptId: a.attemptId,
      state: "FAILED",
    });
    const b = await begin("explicit-retry", 100);
    expect(b).toMatchObject({
      generation: "2",
      state: "RUNNING",
      plan: { maxPages: 60 },
    });
    expect(b.attemptToken).not.toBe(a.attemptToken);
  });

  it("fences auth, org, source, token, proof plan, and immutable terminal data", async () => {
    await request(app.getHttpServer())
      .get(base + "/source")
      .expect(401);
    const a = await begin("fence");
    await get(`/attempts/${a.attemptId}`, OTHER_ORGANIZATION_ID).expect(404);
    await complete(
      { ...a, attemptToken: "00000000-0000-4000-8000-000000000000" },
      [],
    ).expect(409);
    await complete({ ...a, plan: { maxPages: 1 } }, []).expect(400);
    const foreign = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: "unrelated_source",
      },
    });
    await get(`/attempts/${foreign.id}`).expect(404);
    await complete(
      { ...a, attemptId: foreign.id, attemptToken: foreign.attemptToken },
      [],
    ).expect(404);
    const payload = [row("2026-09-01", 2)];
    const done = (await complete(a, payload).expect(200)).body;
    expect((await complete(a, payload).expect(200)).body).toEqual(done);
    await complete(a, [row("2026-09-01", 3)]).expect(409);
    await fail(a, "late_failure").expect(409);
    expect((await get("/source?maxPages=60")).body.status).toBe("STALE");
    expect((await get("/source", OTHER_ORGANIZATION_ID)).body).toMatchObject({
      status: "MISSING",
      items: [],
      capturedItems: [],
    });
    await request(app.getHttpServer())
      .put(base)
      .set("x-test-organization", TEST_ORGANIZATION_ID)
      .send({ items: [] })
      .expect(404);
  });

  it("preserves prior COMPLETE on failure/expiry, reads expiry without Alerts, and rejects late publication after fresh retry", async () => {
    const a = await begin("prior");
    await complete(a, [row("2026-09-01", 2)]).expect(200);
    const prior = (await get("/source")).body;
    const b = await begin("failed");
    expect((await get("/source")).body).toMatchObject({
      status: "READY",
      refreshing: true,
    });
    await fail(b, "coupang_cookie_bloat").expect(201);
    const opened = await alerts.list(TEST_ORGANIZATION_ID);
    await fail(b, "coupang_cookie_bloat").expect(201);
    expect(await alerts.list(TEST_ORGANIZATION_ID)).toEqual(opened);
    expect((await get("/source")).body).toMatchObject({
      status: "STALE",
      items: prior.items,
      capturedItems: prior.capturedItems,
    });
    const c = await begin("expiry");
    await prisma.sourceImportRun.update({
      where: { id: c.attemptId },
      data: { expiresAt: new Date(0) },
    });
    expect((await get("/source")).body).toMatchObject({
      status: "STALE",
      refreshing: false,
      latestAttempt: { errorCode: "ATTEMPT_EXPIRED" },
      items: prior.items,
    });
    expect(await alerts.list(TEST_ORGANIZATION_ID)).toEqual(opened);
    await complete(c, []).expect(409);
    const d = await begin("new-after-expiry");
    expect(await alerts.list(TEST_ORGANIZATION_ID)).toMatchObject([
      { attemptId: c.attemptId, status: "OPEN" },
    ]);
    await complete(c, []).expect(409);
    await complete(d, []).expect(200);
    expect(await alerts.list(TEST_ORGANIZATION_ID)).toMatchObject([
      { attemptId: d.attemptId, status: "RESOLVED" },
    ]);
  });

  it("rolls facts and terminal state back with an Alert failure, then replays the same one-shot publication", async () => {
    const failed = await begin("open-alert");
    await fail(failed, "coupang_shipment_session_required").expect(201);
    const a = await begin("atomic");
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION reject_shipment_alert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test alert unavailable'; END $$`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER reject_shipment_alert BEFORE UPDATE OR INSERT ON alerts FOR EACH ROW EXECUTE FUNCTION reject_shipment_alert()`,
    );
    try {
      await complete(a, [row("2026-09-01", 2)]).expect(500);
      expect((await get(`/attempts/${a.attemptId}`)).body).toMatchObject({
        state: "RUNNING",
        items: [],
        capturedItems: [],
      });
      await fail(a, "provider_error").expect(500);
      expect((await get(`/attempts/${a.attemptId}`)).body.state).toBe(
        "RUNNING",
      );
    } finally {
      await prisma.$executeRawUnsafe(
        "DROP TRIGGER reject_shipment_alert ON alerts",
      );
      await prisma.$executeRawUnsafe("DROP FUNCTION reject_shipment_alert()");
    }
    await complete(a, [row("2026-09-01", 2)]).expect(200);
    await complete(a, [row("2026-09-01", 2)]).expect(200);
    expect((await get("/source")).body).toMatchObject({
      status: "READY",
      capturedItems: [row("2026-09-01", 2)],
    });
  });

  function start(key: string, maxPages?: number) {
    return request(app.getHttpServer())
      .post(base + "/attempts")
      .set("x-test-organization", TEST_ORGANIZATION_ID)
      .set("Idempotency-Key", key)
      .send({ maxPages });
  }
  it("bulk publishes duplicate-date last values and replays equivalent JSON without changing earlier captures", async () => {
    const a = await begin("bulk", 1);
    const items = Array.from({ length: 60 }, (_, index) =>
      row(
        `2026-${index < 30 ? "07" : "08"}-${String((index % 30) + 1).padStart(2, "0")}`,
        1,
      ),
    );
    items.push(row("2026-07-01", 4));
    const proof = {
      maxPages: 1,
      validatedTable: true,
      stopReason: "max_pages",
      lastPageRowCount: 63,
      pageRowCounts: [63],
    };
    const send = (body: unknown) =>
      request(app.getHttpServer())
        .put(base + `/attempts/${a.attemptId}`)
        .set("x-test-organization", TEST_ORGANIZATION_ID)
        .set("x-source-attempt-token", a.attemptToken)
        .send(body);
    const first = (
      await send({ items, scannedPages: 1, totalRows: 63, proof }).expect(200)
    ).body;
    expect(
      (await get(`/attempts/${a.attemptId}`)).body.capturedItems,
    ).toHaveLength(60);
    expect(
      (await get(`/attempts/${a.attemptId}`)).body.capturedItems,
    ).toContainEqual(expect.objectContaining({ date: "2026-07-01", count: 4 }));
    expect(
      (await send({ proof, totalRows: 63, scannedPages: 1, items }).expect(200))
        .body,
    ).toEqual(first);
  });
  function fail(
    attempt: { attemptId: string; attemptToken: string },
    code: string,
  ) {
    return request(app.getHttpServer())
      .post(base + `/attempts/${attempt.attemptId}/fail`)
      .set("x-test-organization", TEST_ORGANIZATION_ID)
      .set("X-Source-Attempt-Token", attempt.attemptToken)
      .send({ code, message: "다시 로그인 후 조회해주세요." });
  }
  async function begin(key: string, maxPages?: number) {
    const response = await request(app.getHttpServer())
      .post(base + "/attempts")
      .set("x-test-organization", TEST_ORGANIZATION_ID)
      .set("Idempotency-Key", key)
      .send({ maxPages })
      .expect(201);
    return response.body;
  }
  function complete(
    attempt: {
      attemptId: string;
      attemptToken: string;
      plan: { maxPages: number };
    },
    items: ReturnType<typeof row>[],
  ) {
    return request(app.getHttpServer())
      .put(base + `/attempts/${attempt.attemptId}`)
      .set("x-test-organization", TEST_ORGANIZATION_ID)
      .set("X-Source-Attempt-Token", attempt.attemptToken)
      .send({
        items,
        scannedPages: 1,
        totalRows: items.reduce((sum, item) => sum + item.count, 0),
        proof: {
          maxPages: attempt.plan.maxPages,
          validatedTable: true,
          stopReason: items.length ? "short_page" : "empty_page",
          lastPageRowCount: items.reduce((sum, item) => sum + item.count, 0),
          pageRowCounts: [items.reduce((sum, item) => sum + item.count, 0)],
        },
      });
  }
});
