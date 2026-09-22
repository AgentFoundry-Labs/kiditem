import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  deliveryTiming,
  MAX_CLOCK_SKEW_MS,
  MAX_DELIVERY_AGE_MS,
  verifyLinearSignature,
} from "../src/signature";

const secret = "lin_wh_test_secret";
const body = JSON.stringify({ type: "Attachment", action: "create", webhookTimestamp: 1 });

function bytes(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

function sign(text: string, key = secret): string {
  return createHmac("sha256", key).update(text).digest("hex");
}

describe("verifyLinearSignature", () => {
  it("accepts the HMAC-SHA256 hex digest of the raw body", async () => {
    await expect(verifyLinearSignature(bytes(body), sign(body), secret)).resolves.toBe(true);
    await expect(verifyLinearSignature(bytes(body), sign(body).toUpperCase(), secret)).resolves.toBe(true);
  });

  it("rejects a digest made with another secret or over another body", async () => {
    await expect(verifyLinearSignature(bytes(body), sign(body, "other"), secret)).resolves.toBe(false);
    await expect(verifyLinearSignature(bytes(`${body} `), sign(body), secret)).resolves.toBe(false);
  });

  it("rejects missing, malformed or truncated signatures", async () => {
    await expect(verifyLinearSignature(bytes(body), null, secret)).resolves.toBe(false);
    await expect(verifyLinearSignature(bytes(body), "", secret)).resolves.toBe(false);
    await expect(verifyLinearSignature(bytes(body), "zz", secret)).resolves.toBe(false);
    await expect(verifyLinearSignature(bytes(body), sign(body).slice(0, 62), secret)).resolves.toBe(false);
    await expect(verifyLinearSignature(bytes(body), `sha256=${sign(body)}`, secret)).resolves.toBe(false);
  });

  it("rejects everything when the secret is empty", async () => {
    await expect(verifyLinearSignature(bytes(body), sign(body, ""), "")).resolves.toBe(false);
  });
});

describe("deliveryTiming", () => {
  const now = 1_790_000_000_000;

  it("treats deliveries within a minute either way as on time", () => {
    expect(deliveryTiming(now, now)).toBe("on-time");
    expect(deliveryTiming(now - MAX_CLOCK_SKEW_MS, now)).toBe("on-time");
    expect(deliveryTiming(now + MAX_CLOCK_SKEW_MS, now)).toBe("on-time");
  });

  it("still accepts Linear's retries, which arrive up to hours later", () => {
    expect(deliveryTiming(now - MAX_CLOCK_SKEW_MS - 1, now)).toBe("late");
    expect(deliveryTiming(now - 6 * 60 * 60 * 1000, now)).toBe("late");
    expect(deliveryTiming(now - MAX_DELIVERY_AGE_MS, now)).toBe("late");
  });

  it("drops older deliveries and timestamps from the future", () => {
    expect(deliveryTiming(now - MAX_DELIVERY_AGE_MS - 1, now)).toBe("stale");
    expect(deliveryTiming(now + MAX_CLOCK_SKEW_MS + 1, now)).toBe("stale");
  });

  it("flags missing or non-numeric timestamps", () => {
    expect(deliveryTiming(undefined, now)).toBe("invalid");
    expect(deliveryTiming(String(now), now)).toBe("invalid");
    expect(deliveryTiming(Number.NaN, now)).toBe("invalid");
  });
});
