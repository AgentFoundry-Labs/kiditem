import { errorMessage, log } from "./log";
import { parsePullRequestUrl, pullRequestUrl } from "./pull-request";
import type { ReconcileJob } from "./reconcile";
import { deliveryTiming, verifyLinearSignature } from "./signature";

export const WEBHOOK_PATH = "/linear";
export const MAX_BODY_BYTES = 1_000_000;

export interface WebhookEnv {
  LINEAR_WEBHOOK_SECRET?: string;
  LINEAR_API_KEY?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO: string;
}

export interface WebhookContext {
  now: number;
  /** Hands the job to the PR's Durable Object, which logs its own outcome. */
  dispatch(job: ReconcileJob): Promise<void>;
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * Verifies a Linear delivery and, for a kiditem pull request attachment,
 * schedules reconciliation of that PR. Linear needs HTTP 200 within 5 seconds
 * and counts anything else as a failure, so the work runs after the response.
 */
export async function handleWebhook(
  request: Request,
  env: WebhookEnv,
  ctx: WebhookContext,
): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname !== WEBHOOK_PATH) return text(404, "not found");
  if (request.method !== "POST") return text(405, "method not allowed");
  if (!env.LINEAR_WEBHOOK_SECRET || !env.LINEAR_API_KEY || !env.GITHUB_TOKEN) {
    return text(503, "not configured");
  }

  const raw = await readBody(request, MAX_BODY_BYTES);
  if (!raw) return text(413, "payload too large");

  const signed = await verifyLinearSignature(
    raw,
    request.headers.get("linear-signature"),
    env.LINEAR_WEBHOOK_SECRET,
  );
  if (!signed) return text(401, "bad signature");

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return text(400, "bad json");
  }
  if (!isRecord(payload)) return text(400, "bad payload");

  const delivery = request.headers.get("linear-delivery") ?? undefined;
  const timing = deliveryTiming(payload.webhookTimestamp, ctx.now);
  if (timing === "invalid") return text(400, "missing webhookTimestamp");
  if (timing === "stale") {
    log("warn", { event: "stale_delivery", delivery, webhookTimestamp: payload.webhookTimestamp });
    return text(200, "stale");
  }
  if (timing === "late") {
    log("warn", { event: "late_delivery", delivery, ageMs: ctx.now - Number(payload.webhookTimestamp) });
  }

  const job = toJob(payload, env.GITHUB_REPO, delivery);
  if (!job) return text(200, "ignored");

  ctx.waitUntil(
    ctx.dispatch(job).catch((error: unknown) =>
      log("error", {
        event: "dispatch_failed",
        delivery,
        pr: job.prNumber,
        action: job.action,
        message: errorMessage(error),
      }),
    ),
  );
  return text(200, "accepted");
}

function toJob(payload: Record<string, unknown>, repo: string, delivery?: string): ReconcileJob | null {
  if (payload.type !== "Attachment") return null;
  if (payload.action !== "create" && payload.action !== "update") return null;
  const data = isRecord(payload.data) ? payload.data : {};
  const prNumber = parsePullRequestUrl(data.url, repo);
  if (prNumber === null || typeof data.issueId !== "string") return null;
  return {
    prNumber,
    prUrl: pullRequestUrl(repo, prNumber),
    action: payload.action,
    issueId: data.issueId,
    delivery,
  };
}

/** Reads the body, giving up as soon as it passes `limit` bytes (chunked bodies carry no length). */
async function readBody(request: Request, limit: number): Promise<ArrayBuffer | null> {
  if (Number(request.headers.get("content-length") ?? "0") > limit) return null;
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(status: number, body: string): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
