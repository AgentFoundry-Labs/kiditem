// Linear signs each delivery with HMAC-SHA256 over the raw body (hex, header
// `Linear-Signature`) and puts the send time in the signed `webhookTimestamp`.

import { cleanSecret } from "./secret-value";

/** Allowed clock difference for an on-time delivery, and for timestamps ahead of ours. */
export const MAX_CLOCK_SKEW_MS = 60_000;
/**
 * Signed deliveries up to this age are still processed. Linear retries a failed
 * delivery after 1 minute, 1 hour and 6 hours, and reconciliation is
 * idempotent, so a late delivery can only cause a redundant run.
 */
export const MAX_DELIVERY_AGE_MS = 8 * 60 * 60 * 1000;

const encoder = new TextEncoder();

export async function verifyLinearSignature(
  rawBody: ArrayBuffer,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  const key = cleanSecret(secret);
  if (!signatureHeader || !key) return false;
  const signature = hexToBytes(signatureHeader.trim());
  if (!signature || signature.byteLength !== 32) return false;
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  // subtle.verify compares in constant time.
  return crypto.subtle.verify("HMAC", hmacKey, signature, rawBody);
}

export type DeliveryTiming = "on-time" | "late" | "stale" | "invalid";

export function deliveryTiming(webhookTimestamp: unknown, nowMs: number): DeliveryTiming {
  if (typeof webhookTimestamp !== "number" || !Number.isFinite(webhookTimestamp)) return "invalid";
  const age = nowMs - webhookTimestamp;
  if (age < -MAX_CLOCK_SKEW_MS || age > MAX_DELIVERY_AGE_MS) return "stale";
  return age > MAX_CLOCK_SKEW_MS ? "late" : "on-time";
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
