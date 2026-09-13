import { z } from "zod";
import type { CapabilityDefinition } from "../../../common/capability-definition";

const Uuid = z.string().uuid();
const Identifier = z.string().trim().min(1).max(256);
const RegistrationReferenceInput = z
  .object({
    registrationExecutionId: Uuid,
    preparationId: Uuid,
  })
  .strict();
const ListingOutput = z
  .object({
    preparationId: Uuid,
    listingId: Uuid.nullable(),
    status: z.enum(["registered", "failed"]),
  })
  .strict();

/** Channels owns browser-confirmed ChannelListing mutation. */
export const CHANNELS_CAPABILITIES = [
  {
    key: "channels.register_confirmed_listing",
    ownerDomain: "channels",
    ownerInputPort: "channels.registerConfirmedListing",
    description:
      "Resolve an externally confirmed frozen marketplace submission into a local ChannelListing.",
    resultSummary: "확정된 판매 상품 등록을 반영했습니다.",
    inputSchema: RegistrationReferenceInput.extend({
      externalListingId: Identifier,
      confirmationEvidence: z
        .object({
          wingVendorId: z.string().trim().min(1).max(80),
          wingIdentitySource: z.enum([
            "dom:data-vendor-id",
            "meta:vendor-id",
            "url:vendorId",
            "dom:vendor-code-label",
            "dom:inline-script",
          ]),
        })
        .strict(),
    }).strict(),
    outputSchema: ListingOutput,
    effects: ["db_write"],
    approvalRisk: "medium",
    idempotency: "required",
  },
  {
    key: "channels.submit_wing_thumbnail",
    ownerDomain: "channels",
    ownerInputPort: "channels.submitWingThumbnail",
    description:
      "Submit an approved generated thumbnail to Coupang Wing through the Channels owner.",
    resultSummary: "대표 이미지를 쿠팡 윙에 반영했습니다.",
    inputSchema: z.object({ generationId: Identifier }).strict(),
    outputSchema: z
      .object({ success: z.boolean(), screenshotPath: z.string().nullable() })
      .strict(),
    effects: ["browser", "external_write", "db_write"],
    approvalRisk: "high",
    idempotency: "required",
  },
] as const satisfies readonly CapabilityDefinition[];

export type ChannelsCapabilityKey =
  (typeof CHANNELS_CAPABILITIES)[number]["key"];
