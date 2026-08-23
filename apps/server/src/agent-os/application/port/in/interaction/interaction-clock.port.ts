/** Injectable wall clock for durable interaction timestamps and approval expiry. */
export type InteractionClock = () => Date;
export const INTERACTION_CLOCK = Symbol("INTERACTION_CLOCK");
