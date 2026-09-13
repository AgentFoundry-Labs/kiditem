import "reflect-metadata";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ChannelsFinalCapabilityAdapter } from "../../channels/adapter/in/agent/channels-final-capability.adapter";
import { ChannelsCapabilityCompositionAdapter } from "../../channels/adapter/in/agent/channels-capability-composition.adapter";
import { ChannelsFinalCapabilityModule } from "../../channels/channels-final-capability.module";
import { CHANNELS_FINAL_CAPABILITY_PORT } from "../../channels/application/port/in/capability/channels-final-capability.port";
import { CHANNELS_CAPABILITY_COMPOSITION_PORT } from "../../channels/application/port/in/capability/channels-capability-composition.port";
import { SourcingFinalCapabilityAdapter } from "../adapter/in/agent/sourcing-final-capability.adapter";
import { SourcingCapabilityCompositionAdapter } from "../adapter/in/agent/sourcing-capability-composition.adapter";
import { SourcingFinalDiscoveryCapabilityAdapter } from "../adapter/in/agent/sourcing-final-discovery-capability.adapter";
import { SourcingScrapeSnapshotAdmissionGuard } from "../adapter/in/agent/sourcing-scrape-snapshot-admission.guard";
import { SourcingScrapeUrlService } from "../application/service/sourcing-scrape-url.service";
import { SOURCING_FINAL_CAPABILITY_PORT } from "../application/port/in/capability/sourcing-final-capability.port";
import { SOURCING_CAPABILITY_COMPOSITION_PORT } from "../application/port/in/capability/sourcing-capability-composition.port";
import { SOURCING_FINAL_DISCOVERY_CAPABILITY_PORT } from "../application/port/in/capability/sourcing-final-discovery-capability.port";
import { SourcingModule } from "../sourcing.module";

const PROVIDERS_KEY = "providers";

function providers(module: object): Array<unknown> {
  return Reflect.getMetadata(PROVIDERS_KEY, module) ?? [];
}

function binding(
  entries: Array<unknown>,
  token: symbol,
): { provide: symbol; useExisting: unknown } | undefined {
  return entries.find(
    (entry): entry is { provide: symbol; useExisting: unknown } =>
      Boolean(entry) &&
      typeof entry === "object" &&
      "provide" in entry &&
      (entry as { provide?: unknown }).provide === token,
  );
}

describe("Sourcing final capability wiring", () => {
  it("registers direct URL collection in its source owner", () => {
    expect(providers(SourcingModule)).toContain(SourcingScrapeUrlService);
  });
  it("binds the final Sourcing capability port to Sourcing-owned incoming adapters", () => {
    const entries = providers(SourcingModule);

    expect(entries).toContain(SourcingFinalCapabilityAdapter);
    expect(entries).toContain(SourcingCapabilityCompositionAdapter);
    expect(entries).toContain(SourcingFinalDiscoveryCapabilityAdapter);
    expect(binding(entries, SOURCING_FINAL_CAPABILITY_PORT)).toEqual({
      provide: SOURCING_FINAL_CAPABILITY_PORT,
      useExisting: SourcingFinalCapabilityAdapter,
    });
    expect(binding(entries, SOURCING_CAPABILITY_COMPOSITION_PORT)).toEqual({
      provide: SOURCING_CAPABILITY_COMPOSITION_PORT,
      useExisting: SourcingCapabilityCompositionAdapter,
    });
    expect(binding(entries, SOURCING_FINAL_DISCOVERY_CAPABILITY_PORT)).toEqual({
      provide: SOURCING_FINAL_DISCOVERY_CAPABILITY_PORT,
      useExisting: SourcingFinalDiscoveryCapabilityAdapter,
    });
  });

  it("constructs bounded scrape-snapshot admission state through the Sourcing composition root", () => {
    const entries = providers(SourcingModule);
    const registration = entries.find(
      (entry): entry is {
        provide: typeof SourcingScrapeSnapshotAdmissionGuard;
        useFactory: () => SourcingScrapeSnapshotAdmissionGuard;
      } =>
        Boolean(entry) &&
        typeof entry === "object" &&
        "provide" in entry &&
        (entry as { provide?: unknown }).provide ===
          SourcingScrapeSnapshotAdmissionGuard,
    );

    expect(registration).toBeDefined();
    expect(registration?.useFactory()).toBeInstanceOf(
      SourcingScrapeSnapshotAdmissionGuard,
    );
  });

  it("keeps the Sourcing composition Adapter on its incoming port rather than concrete services or runtime handlers", () => {
    const finalAdapter = readFileSync(
      new URL(
        "../adapter/in/agent/sourcing-final-capability.adapter.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const composition = readFileSync(
      new URL(
        "../adapter/in/agent/sourcing-capability-composition.adapter.ts",
        import.meta.url,
      ),
      "utf8",
    );

    expect(finalAdapter).not.toContain("agent-os/application/service");
    expect(composition).toContain("SOURCING_FINAL_CAPABILITY_PORT");
    expect(composition).not.toContain("agent-os/application/service");
    expect(composition).not.toContain("SourcingService");
    expect(composition).not.toContain("SourcingPlaywrightRuntimeHandler");
    expect(composition).not.toContain("PrismaService");
  });

  it("keeps canonical Channels mutations behind the Channels-owned final port", () => {
    const channelsEntries = providers(ChannelsFinalCapabilityModule);
    const sourcingEntries = providers(SourcingModule);

    expect(channelsEntries).toContain(ChannelsFinalCapabilityAdapter);
    expect(channelsEntries).toContain(ChannelsCapabilityCompositionAdapter);
    expect(binding(channelsEntries, CHANNELS_FINAL_CAPABILITY_PORT)).toEqual({
      provide: CHANNELS_FINAL_CAPABILITY_PORT,
      useExisting: ChannelsFinalCapabilityAdapter,
    });
    expect(binding(channelsEntries, CHANNELS_CAPABILITY_COMPOSITION_PORT)).toEqual({
      provide: CHANNELS_CAPABILITY_COMPOSITION_PORT,
      useExisting: ChannelsCapabilityCompositionAdapter,
    });
    expect(sourcingEntries).not.toContain(ChannelsFinalCapabilityAdapter);
    expect(
      binding(sourcingEntries, CHANNELS_FINAL_CAPABILITY_PORT),
    ).toBeUndefined();
  });
});
