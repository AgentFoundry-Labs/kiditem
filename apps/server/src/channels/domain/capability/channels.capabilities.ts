import { z } from "zod";
import { PrepareTargetExecutionInputSchema, ReportTargetExecutionInputSchema, TargetExecutionResultSchema } from '@kiditem/shared/sales-product';
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
  {
    key: 'channels.prepare_target_execution', ownerDomain: 'channels',
    ownerInputPort: 'channels.prepareTargetExecution',
    description: 'Freeze the selected registration target and option prices through the same execution port as the web UI. Does not submit to a marketplace.',
    resultSummary: '등록 대상의 제출 내용을 고정했습니다.',
    inputSchema: PrepareTargetExecutionInputSchema.omit({ idempotencyKey: true }).extend({ targetId: Uuid }).strict(),
    outputSchema: TargetExecutionResultSchema, effects: ['db_write'], approvalRisk: 'low', idempotency: 'required',
  },
  {
    key: 'channels.get_target_execution', ownerDomain: 'channels',
    ownerInputPort: 'channels.getTargetExecution',
    description: 'Read the frozen submission and its recorded provider outcome.',
    resultSummary: '등록 실행 상태를 조회했습니다.',
    inputSchema: z.object({ executionId: Uuid }).strict(),
    outputSchema: TargetExecutionResultSchema, effects: ['read'], approvalRisk: 'none', idempotency: 'recommended',
  },
  {
    key: 'channels.start_target_execution', ownerDomain: 'channels',
    ownerInputPort: 'channels.startTargetExecution',
    description: 'Claim a prepared execution once. Provider IO is allowed only when the result has maySubmit=true; retries never grant another submission.',
    resultSummary: '등록 실행의 제출 가능 상태를 확인했습니다.',
    inputSchema: z.object({ executionId: Uuid }).strict(),
    outputSchema: TargetExecutionResultSchema, effects: ['db_write'], approvalRisk: 'medium', idempotency: 'required',
  },
  {
    key: 'channels.report_target_execution', ownerDomain: 'channels',
    ownerInputPort: 'channels.reportTargetExecution',
    description: 'Report collected provider evidence with the frozen payload hash and lease. A form fill or unknown result is not confirmation.',
    resultSummary: '쇼핑몰의 확인 근거를 실행 기록에 반영했습니다.',
    inputSchema: ReportTargetExecutionInputSchema.extend({ executionId: Uuid }).strict(),
    outputSchema: TargetExecutionResultSchema, effects: ['db_write'], approvalRisk: 'medium', idempotency: 'required',
  },
] as const satisfies readonly CapabilityDefinition[];

export type ChannelsCapabilityKey =
  (typeof CHANNELS_CAPABILITIES)[number]["key"];
