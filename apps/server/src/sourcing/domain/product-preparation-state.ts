/** Draft lifecycle alone; submitted outcomes are read from the Channels ledger. */
export function blocksCandidateTerminalTransition(input: { status: string }): boolean {
  return input.status === 'draft' || input.status === 'submitting';
}
