export const CONFIRMED_CHANNEL_COMPONENT_REFERENCE_PORT = Symbol(
  'CONFIRMED_CHANNEL_COMPONENT_REFERENCE_PORT',
);

export interface ConfirmedChannelComponentReferencePort {
  listReferencedSellpiaProductCodes(organizationId: string): Promise<string[]>;
}
