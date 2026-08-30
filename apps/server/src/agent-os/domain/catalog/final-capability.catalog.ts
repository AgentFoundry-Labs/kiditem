import type { CapabilityDefinition } from '../../../common/capability-definition';
import { AI_CAPABILITIES } from '../../../ai/domain/capability/ai.capabilities';
import { ANALYTICS_CAPABILITIES } from '../../../analytics/domain/capability/analytics.capabilities';
import { CHANNELS_CAPABILITIES } from '../../../channels/domain/capability/channels.capabilities';
import { PRODUCTS_CAPABILITIES } from '../../../products/domain/capability/products.capabilities';
import { SOURCING_CAPABILITIES } from '../../../sourcing/domain/capability/sourcing.capabilities';
import { SUPPLY_CAPABILITIES } from '../../../supply/domain/capability/supply.capabilities';

/** Agent OS aggregates owner-domain definitions without redefining their contracts. */
export const FINAL_CAPABILITY_DEFINITIONS: readonly CapabilityDefinition[] =
  Object.freeze([
    ...AI_CAPABILITIES,
    ...ANALYTICS_CAPABILITIES,
    ...CHANNELS_CAPABILITIES,
    ...PRODUCTS_CAPABILITIES,
    ...SOURCING_CAPABILITIES,
    ...SUPPLY_CAPABILITIES,
  ].sort((left, right) => left.key.localeCompare(right.key)));
