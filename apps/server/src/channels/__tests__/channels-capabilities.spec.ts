import { describe, expect, it } from "vitest";
import { CHANNELS_CAPABILITIES } from "../domain/capability/channels.capabilities";

describe("Channels final capability definitions", () => {
  it("owns target execution and representative-image capabilities with strict schemas", () => {
    expect(CHANNELS_CAPABILITIES.map((capability) => capability.key)).toEqual([
      "channels.submit_representative_image",
      'channels.prepare_target_execution',
      'channels.get_target_execution',
      'channels.start_target_execution',
      'channels.report_target_execution',
    ]);
    for (const capability of CHANNELS_CAPABILITIES) {
      expect(capability.ownerDomain).toBe("channels");
      expect(
        capability.inputSchema.safeParse({ organizationId: "forged" }).success,
      ).toBe(false);
      expect(capability.outputSchema.safeParse({}).success).toBe(false);
      if (capability.effects.some(effect => effect === 'db_write')) expect(capability.idempotency).toBe("required");
    }
  });

  /** KID-321: 등록 확인은 `report_target_execution` 의 `confirmed` 하나다 — 따로 선 확인 capability 가 없다. */
  it("confirms a registration only through report_target_execution", () => {
    const keys = CHANNELS_CAPABILITIES.map((capability) => capability.key as string);
    expect(keys).not.toContain("channels.register_confirmed_listing");
    expect(keys).toContain("channels.report_target_execution");
  });
});
