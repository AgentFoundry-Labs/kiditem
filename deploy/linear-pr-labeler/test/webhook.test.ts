import { createHash, createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReconcileJob } from "../src/reconcile";
import { handleWebhook, MAX_BODY_BYTES, type WebhookEnv } from "../src/webhook";
import { REPO } from "./fakes";

const SECRET = "lin_wh_test_secret";
const NOW = 1_790_000_000_000;

const env: WebhookEnv = {
  LINEAR_WEBHOOK_SECRET: SECRET,
  LINEAR_API_KEY: "lin_api_test",
  GITHUB_TOKEN: "github_pat_test",
  GITHUB_REPO: REPO,
};

function attachmentEvent(overrides: Record<string, unknown> = {}, data: Record<string, unknown> = {}) {
  return {
    action: "create",
    type: "Attachment",
    webhookTimestamp: NOW,
    webhookId: "wh",
    organizationId: "org",
    createdAt: "2026-09-17T15:00:00.000Z",
    url: "https://linear.app/kiditem/issue/KID-260",
    data: {
      id: "att-1",
      url: `https://github.com/${REPO}/pull/546`,
      issueId: "issue-uuid",
      title: "feat(KID-260): labeler",
      ...data,
    },
    ...overrides,
  };
}

function sign(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function delivery(
  payload: unknown,
  options: { secret?: string; path?: string; method?: string; signature?: string | null; headers?: Record<string, string> } = {},
) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const headers = new Headers({ "Content-Type": "application/json", "Linear-Delivery": "delivery-1", ...options.headers });
  const signature = options.signature === undefined ? sign(body, options.secret) : options.signature;
  if (signature !== null) headers.set("Linear-Signature", signature);
  const method = options.method ?? "POST";
  return new Request(`https://labeler.example.workers.dev${options.path ?? "/linear"}`, {
    method,
    headers,
    body: method === "GET" ? undefined : body,
  });
}

function context(dispatchResult: () => Promise<void> = async () => {}) {
  const jobs: ReconcileJob[] = [];
  const pending: Promise<unknown>[] = [];
  return {
    jobs,
    pending,
    ctx: {
      now: NOW,
      dispatch: (job: ReconcileJob) => {
        jobs.push(job);
        return dispatchResult();
      },
      waitUntil: (p: Promise<unknown>) => {
        pending.push(p);
      },
    },
  };
}

function logged(spy: { mock: { calls: unknown[][] } }): Array<Record<string, unknown>> {
  return spy.mock.calls.map((call) => JSON.parse(String(call[0])) as Record<string, unknown>);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleWebhook", () => {
  it("accepts a signed attachment event for a kiditem PR and hands it to the PR's object", async () => {
    const { ctx, jobs, pending } = context();

    const response = await handleWebhook(delivery(attachmentEvent()), env, ctx);
    await Promise.all(pending);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("accepted");
    expect(jobs).toEqual([
      {
        prNumber: 546,
        prUrl: `https://github.com/${REPO}/pull/546`,
        action: "create",
        issueId: "issue-uuid",
        delivery: "delivery-1",
      },
    ]);
  });

  it("uses the PR URL the GitHub integration attaches, whatever form the event carries", async () => {
    const { ctx, jobs } = context();

    await handleWebhook(
      delivery(attachmentEvent({}, { url: "https://github.com/agentfoundry-labs/KIDITEM/pull/546/files?w=1" })),
      env,
      ctx,
    );

    expect(jobs.map((job) => job.prUrl)).toEqual([`https://github.com/${REPO}/pull/546`]);
  });

  it("logs a failed hand-off instead of failing the delivery", async () => {
    const { ctx, pending } = context(async () => {
      throw new Error("Durable Object reset");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await handleWebhook(delivery(attachmentEvent({ action: "update" })), env, ctx);
    await Promise.all(pending);

    expect(response.status).toBe(200);
    expect(logged(error)).toEqual([
      { event: "dispatch_failed", delivery: "delivery-1", pr: 546, action: "update", message: "Durable Object reset" },
    ]);
  });

  it.each([
    ["another entity type", attachmentEvent({ type: "Issue" })],
    ["a removed attachment", attachmentEvent({ action: "remove" })],
    ["another repository", attachmentEvent({}, { url: "https://github.com/AgentFoundry-Labs/other/pull/1" })],
    ["a non-PR attachment", attachmentEvent({}, { url: "https://www.figma.com/file/x" })],
    ["a missing issue id", attachmentEvent({}, { issueId: undefined })],
    ["data that is not an object", attachmentEvent({ data: "x" })],
  ])("ignores %s with 200 and no work", async (_name, payload) => {
    const { ctx, jobs, pending } = context();

    const response = await handleWebhook(delivery(payload), env, ctx);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ignored");
    expect(jobs).toEqual([]);
    expect(pending).toEqual([]);
  });

  it("rejects unsigned and wrongly signed deliveries", async () => {
    const { ctx, jobs } = context();
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect((await handleWebhook(delivery(attachmentEvent(), { signature: null }), env, ctx)).status).toBe(401);
    expect((await handleWebhook(delivery(attachmentEvent(), { secret: "other" }), env, ctx)).status).toBe(401);
    expect(jobs).toEqual([]);
  });

  it("describes a Linear delivery that fails the check without revealing the secret", async () => {
    const { ctx } = context();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const webhookId = "53188995-5f3b-44a9-993b-9bb0d37136a5";
    const body = JSON.stringify(attachmentEvent({ webhookId }));
    const linearDelivery = new Request("https://labeler.example.workers.dev/linear", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(Buffer.byteLength(body)),
        "Linear-Delivery": `d${"x".repeat(99)}`,
        "Linear-Event": "Attachment",
        "Linear-Signature": sign(body, "the-webhook-secret"),
      },
      body,
    });
    const stranger = new Request("https://labeler.example.workers.dev/linear", { method: "POST", body: "{}" });

    expect((await handleWebhook(linearDelivery, env, ctx)).status).toBe(401);
    expect((await handleWebhook(stranger, env, ctx)).status).toBe(401);

    expect(logged(warn)).toEqual([
      {
        event: "signature_mismatch",
        delivery: `d${"x".repeat(63)}`,
        linearEvent: "Attachment",
        sendingWebhookId: webhookId,
        bodyBytes: Buffer.byteLength(body),
        contentLength: String(Buffer.byteLength(body)),
        storedSecret: {
          length: SECRET.length,
          linearPrefix: true,
          cleaned: false,
          fingerprint: createHash("sha256").update(SECRET).digest("hex").slice(0, 8),
        },
      },
    ]);
    expect(JSON.stringify(logged(warn))).not.toContain(SECRET);
  });

  it.each([
    ["an id that is not a UUID", { webhookId: "-".repeat(36) }],
    ["a body too large to parse unverified", { webhookId: "53188995-5f3b-44a9-993b-9bb0d37136a5", padding: "x".repeat(70_000) }],
  ])("leaves the sending webhook out of the mismatch log for %s", async (_name, overrides) => {
    const { ctx } = context();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await handleWebhook(delivery(attachmentEvent(overrides), { secret: "other" }), env, ctx);

    expect(response.status).toBe(401);
    expect(logged(warn)).toHaveLength(1);
    expect(logged(warn)[0]).not.toHaveProperty("sendingWebhookId");
  });

  it.each([
    ["surrounding whitespace", `  ${SECRET}\n`],
    ["bracketed-paste markers", `\u001b[200~${SECRET}\u001b[201~`],
    ["quotes", `"${SECRET}"`],
    ["a zero-width character", `\u200b${SECRET}`],
  ])("accepts a stored secret with %s", async (_name, stored) => {
    const { ctx, jobs } = context();

    const response = await handleWebhook(delivery(attachmentEvent()), { ...env, LINEAR_WEBHOOK_SECRET: stored }, ctx);

    expect(response.status).toBe(200);
    expect(jobs).toHaveLength(1);
  });

  it("verifies a signed body that arrives in many small chunks split inside multi-byte characters", async () => {
    const { ctx, jobs } = context();
    const body = JSON.stringify(attachmentEvent({ note: "라벨 🏷️ 테스트 ".repeat(40) }));
    const bytes = new TextEncoder().encode(body);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
        controller.close();
      },
    });
    const request = new Request("https://labeler.example.workers.dev/linear", {
      method: "POST",
      headers: { "Linear-Signature": sign(body), "Linear-Delivery": "delivery-1" },
      body: stream,
      duplex: "half",
    } as RequestInit);

    const response = await handleWebhook(request, env, ctx);

    expect(response.status).toBe(200);
    expect(jobs).toHaveLength(1);
  });

  it("processes Linear's late retries and logs how late they are", async () => {
    const { ctx, jobs } = context();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await handleWebhook(delivery(attachmentEvent({ webhookTimestamp: NOW - 3_600_000 })), env, ctx);

    expect(await response.text()).toBe("accepted");
    expect(jobs).toHaveLength(1);
    expect(logged(warn)).toEqual([{ event: "late_delivery", delivery: "delivery-1", ageMs: 3_600_000 }]);
  });

  it("answers 200 without work for stale or future deliveries, so Linear does not count failures", async () => {
    const { ctx, jobs } = context();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    for (const webhookTimestamp of [NOW - 9 * 3_600_000, NOW + 120_000]) {
      const response = await handleWebhook(delivery(attachmentEvent({ webhookTimestamp })), env, ctx);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("stale");
    }
    expect(jobs).toEqual([]);
    expect(logged(warn).map((entry) => entry.event)).toEqual(["stale_delivery", "stale_delivery"]);
  });

  it("rejects signed bodies that are not a JSON object with a timestamp", async () => {
    const { ctx } = context();
    const statusOf = async (payload: unknown) => (await handleWebhook(delivery(payload), env, ctx)).status;

    expect(await statusOf("not json")).toBe(400);
    expect(await statusOf("null")).toBe(400);
    expect(await statusOf("[1]")).toBe(400);
    expect(await statusOf(attachmentEvent({ webhookTimestamp: undefined }))).toBe(400);
  });

  it("answers 503 until all three secrets are set", async () => {
    const { ctx } = context();
    for (const missing of ["LINEAR_WEBHOOK_SECRET", "LINEAR_API_KEY", "GITHUB_TOKEN"] as const) {
      const response = await handleWebhook(delivery(attachmentEvent()), { ...env, [missing]: "" }, ctx);
      expect(response.status).toBe(503);
    }
  });

  it("only serves POST /linear", async () => {
    const { ctx } = context();
    expect((await handleWebhook(delivery(attachmentEvent(), { path: "/" }), env, ctx)).status).toBe(404);
    expect((await handleWebhook(delivery(attachmentEvent(), { path: "/linear/extra" }), env, ctx)).status).toBe(404);
    expect((await handleWebhook(delivery(attachmentEvent(), { method: "GET" }), env, ctx)).status).toBe(405);
  });

  it("refuses a declared length over 1 MB before reading the body", async () => {
    const { ctx } = context();
    const request = delivery(attachmentEvent(), { headers: { "Content-Length": String(MAX_BODY_BYTES + 1) } });

    expect((await handleWebhook(request, env, ctx)).status).toBe(413);
    expect(request.bodyUsed).toBe(false);
  });

  it("stops reading a chunked body once it passes 1 MB", async () => {
    const { ctx } = context();
    let pulled = 0;
    const chunk = new Uint8Array(400_000);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        if (pulled > 50) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const request = new Request("https://labeler.example.workers.dev/linear", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);

    expect((await handleWebhook(request, env, ctx)).status).toBe(413);
    expect(pulled).toBeLessThan(10);
  });
});
