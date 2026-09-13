import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalOwnerInputHash } from "../../apps/server/src/common/owner-idempotency-key";
import { canonicalCoupangDirectOrderHash } from "../../apps/server/src/orders/mapper/coupang-direct-order.mapper";
import {
  normalizedTransportProjectionForMigration,
  parseCaptureArtifactForMigration,
} from "../data-migrations/v0.1.31/006_backfill_coupang_direct_transport_receipts";

const migrationPath = join(
  __dirname,
  "..",
  "data-migrations",
  "v0.1.31",
  "006_backfill_coupang_direct_transport_receipts.ts",
);
const artifactJson = `{"channelAccountId":"11111111-1111-4111-8111-111111111111","transport":"MILKRUN","centers":{"Unused FC":{"addr":"Unused","zip":"99999","contact":"000"},"Busan FC":{"addr":"Busan","zip":"48900","contact":"051-1234"},"Seoul FC":{"addr":"Seoul","zip":"01234","contact":"02-1234"}},"pos":[{"seq":"PO-OUTSIDE-EDD","status":"PA","center":"Seoul FC","transport":"SHIPMENT","edd":"2026-08-20","reg":"2026-07-18 09:00:00","items":[{"skuId":"P-OUTSIDE-EDD","barcode":"8801234567890","name":"Rocket item","qty":2,"amount":2000}]},{"seq":"PO-MILKRUN","status":"PA","center":"Busan FC","transport":"MILKRUN","edd":"2026-07-20","reg":"2026-07-18 09:00:00","items":[{"skuId":"P-MILKRUN","barcode":"8801234567890","name":"Rocket item","qty":2,"amount":2000}]},{"seq":"PO-ITEMLESS","status":"PA","center":"Seoul FC","transport":"SHIPMENT","edd":"2026-07-20","reg":"2026-07-18 09:00:00","items":[]},{"seq":"PO-OWNER","status":"PA","center":"Seoul FC","transport":"SHIPMENT","edd":"2026-07-20","reg":"2026-07-18 09:00:00","items":[{"skuId":"P-OWNER","barcode":"8801234567890","name":"Rocket item","qty":2,"amount":2000}]}]}`;
const purchaseOrderKeys = {
  outsideEdd:
    "e46e21132ca62cb35918f3aecc69faf415001754b96bccc8a3084d1a0c7ee61f",
  milkrun: "b87fb504222b89888d0d4cde23ed9e42c86b66ce67aefa5173267e8de96ca4fd",
  itemless: "f83b75520a7845d1d700c9fd55d6d918cf958248394606b29f971aebe74f4f8c",
  shipment: "56c356fee3e01ea2abfb0b220a094c1ce5671a97a6d773d838ccc802b38dbb97",
} as const;
const vectors = [
  {
    transport: "SHIPMENT" as const,
    selection: [
      purchaseOrderKeys.shipment,
      purchaseOrderKeys.milkrun,
      purchaseOrderKeys.itemless,
    ],
    selectedSequence: "PO-OWNER",
    normalizedSelection: [purchaseOrderKeys.shipment],
    payloadChecksum:
      "ddbe2bd31379e4c91a01040c955d682c2501127925067b9cf4e5682096e379e5",
  },
  {
    transport: "MILKRUN" as const,
    selection: [
      purchaseOrderKeys.milkrun,
      purchaseOrderKeys.shipment,
      purchaseOrderKeys.itemless,
    ],
    selectedSequence: "PO-MILKRUN",
    normalizedSelection: [purchaseOrderKeys.milkrun],
    payloadChecksum:
      "b94281ed1c8c31b4de7816f8be0bd1c4a3b090ca363692fba4f8c859fe88d783",
  },
] as const;

describe("Coupang direct transport receipt migration", () => {
  it("keeps the historical artifact parser and hash closure in the ledgered source", () => {
    const source = readFileSync(migrationPath, "utf8");
    const runtimeImports = [
      ...source.matchAll(/^import(?! type )[\s\S]*?\sfrom\s"([^"]+)";$/gm),
    ].map((match) => match[1]);

    expect(runtimeImports).toEqual(["node:crypto", "zod"]);
  });

  it.each(vectors)(
    "reconstructs the literal $transport artifact-to-hash vector",
    ({ transport, selection, normalizedSelection, payloadChecksum }) => {
      const capture = parseCaptureArtifactForMigration(
        { sourceBytes: Buffer.from(artifactJson) },
        "literal-vector",
      );

      expect(
        normalizedTransportProjectionForMigration(
          capture,
          [...selection],
          "literal-vector",
          transport,
        ),
      ).toEqual({
        selectedPurchaseOrderKeys: normalizedSelection,
        payloadChecksum,
      });
    },
  );

  it("fails closed when a selected key does not resolve to the artifact", () => {
    const capture = parseCaptureArtifactForMigration(
      { sourceBytes: Buffer.from(artifactJson) },
      "literal-vector",
    );

    expect(() =>
      normalizedTransportProjectionForMigration(
        capture,
        ["0".repeat(64)],
        "literal-vector",
        "SHIPMENT",
      ),
    ).toThrow("SHIPMENT selection is not present in capture artifact");
  });

  it("keeps the frozen purchase-order keys aligned with the runtime writer", () => {
    const capture = JSON.parse(artifactJson) as {
      pos: unknown[];
    };

    expect(capture.pos.map(canonicalOwnerInputHash)).toEqual([
      purchaseOrderKeys.outsideEdd,
      purchaseOrderKeys.milkrun,
      purchaseOrderKeys.itemless,
      purchaseOrderKeys.shipment,
    ]);
  });

  it.each(vectors)(
    "keeps the frozen $transport checksum aligned with the runtime writer",
    ({ transport, selectedSequence, payloadChecksum }) => {
      const capture = JSON.parse(artifactJson) as {
        pos: Array<{ seq: string }>;
      } & Record<string, unknown>;
      const request = {
        ...capture,
        pos: capture.pos.filter(({ seq }) => seq === selectedSequence),
        transport,
      };

      expect(canonicalCoupangDirectOrderHash(request as never)).toBe(
        payloadChecksum,
      );
    },
  );
});
