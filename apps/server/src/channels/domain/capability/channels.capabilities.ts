import { z } from "zod";
import { PrepareTargetExecutionInputSchema, ReportTargetExecutionInputSchema, TargetExecutionResultSchema } from '@kiditem/shared/sales-product';
import type { CapabilityDefinition } from "../../../common/capability-definition";

const Uuid = z.string().uuid();
const Identifier = z.string().trim().min(1).max(256);
/** Channels Agent capabilities: target execution and representative-image upload (KID-321). */
export const CHANNELS_CAPABILITIES = [
  {
    key: "channels.submit_representative_image",
    ownerDomain: "channels",
    ownerInputPort: "channels.submitRepresentativeImage",
    description:
      "Put one approved generated thumbnail (by generationId) into the representative-image slot of the product's " +
      "listing edit form on a channel that supports representative images. It does not press save: the result is " +
      "success=false with status awaiting_operator_confirmation and a screenshot path until the operator saves it in " +
      "the mall admin and confirms it in the KidItem web app, after which a replay returns success=true with status " +
      "succeeded. Use it only for a thumbnail the operator already approved; it does not generate images, and a " +
      "rejected or unknown mall result is not success.",
    resultSummary: "대표 이미지를 몰 상품 수정 화면에 올렸습니다 — 운영자가 몰에서 저장을 확인하면 반영됩니다.",
    inputSchema: z.object({ generationId: Identifier }).strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        status: z.enum(["awaiting_operator_confirmation", "succeeded"]),
        screenshotPath: z.string().nullable(),
      })
      .strict(),
    effects: ["browser", "external_write", "db_write"],
    approvalRisk: "high",
    idempotency: "required",
  },
  {
    key: 'channels.prepare_target_execution', ownerDomain: 'channels',
    ownerInputPort: 'channels.prepareTargetExecution',
    description:
      'Freeze one registration target (targetId) into a new execution: the selected options, resolved prices, images ' +
      'and mall inputs are locked as the submission payload and the result returns the execution id and its frozen ' +
      'content. Use it as the first step of a registration; a target whose product is still a draft (no confirmed ' +
      'price) or has a live execution is refused. It does not submit to the marketplace.',
    resultSummary: '등록 대상의 제출 내용을 고정했습니다.',
    inputSchema: PrepareTargetExecutionInputSchema.omit({ idempotencyKey: true }).extend({ targetId: Uuid }).strict(),
    outputSchema: TargetExecutionResultSchema, effects: ['db_write'], approvalRisk: 'low', idempotency: 'required',
  },
  {
    key: 'channels.get_target_execution', ownerDomain: 'channels',
    ownerInputPort: 'channels.getTargetExecution',
    description:
      'Read one registration execution by id: the frozen submission payload (options, prices, images, account) as ' +
      'it was sent, its status, and the provider outcome the browser reported. Use it to check whether a submission ' +
      'finished before starting another; it never contacts the marketplace and never changes status.',
    resultSummary: '등록 실행 상태를 조회했습니다.',
    inputSchema: z.object({ executionId: Uuid }).strict(),
    outputSchema: TargetExecutionResultSchema, effects: ['read'], approvalRisk: 'none', idempotency: 'recommended',
  },
  {
    key: 'channels.start_target_execution', ownerDomain: 'channels',
    ownerInputPort: 'channels.startTargetExecution',
    description:
      'Claim a prepared execution for submission and return the same execution with maySubmit set. Provider IO ' +
      '(the browser form fill and submit) is allowed only while maySubmit is true; a repeated call for the same ' +
      'execution returns the existing claim and never grants a second submission. It does not perform the submission ' +
      'itself and does not confirm the listing.',
    resultSummary: '등록 실행의 제출 가능 상태를 확인했습니다.',
    inputSchema: z.object({ executionId: Uuid }).strict(),
    outputSchema: TargetExecutionResultSchema, effects: ['db_write'], approvalRisk: 'medium', idempotency: 'required',
  },
  {
    key: 'channels.report_target_execution', ownerDomain: 'channels',
    ownerInputPort: 'channels.reportTargetExecution',
    description:
      'Record what the browser observed for one execution: the provider outcome, the external ids it saw, and the ' +
      'frozen payload hash and lease that prove the evidence belongs to this submission. The result is the updated ' +
      'execution status. A confirmed outcome with the mall\'s evidence (account, admin URL, listing id) is the only ' +
      'registration confirmation: it links or creates the channel listing. A filled form, a timeout or an unknown ' +
      'result is reported as such, not as confirmation; evidence with a stale hash or lease is refused.',
    resultSummary: '쇼핑몰의 확인 근거를 실행 기록에 반영했습니다.',
    inputSchema: ReportTargetExecutionInputSchema.extend({ executionId: Uuid }).strict(),
    outputSchema: TargetExecutionResultSchema, effects: ['db_write'], approvalRisk: 'medium', idempotency: 'required',
  },
] as const satisfies readonly CapabilityDefinition[];

export type ChannelsCapabilityKey =
  (typeof CHANNELS_CAPABILITIES)[number]["key"];
