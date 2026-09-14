/**
 * The extension's answer to the page's `getCollectionSession` check: once an
 * extension takes a web-opened attempt it holds a collection session for it.
 * Returns undefined for any other message, so a spec can fall through to its
 * own replies (an extension run answers only when its collection ends).
 */
export function extensionSessionReply(
  message: unknown,
  producer = 'orders.sellpia_sales',
): Record<string, unknown> | undefined {
  const { action, attemptId } = (message ?? {}) as { action?: unknown; attemptId?: unknown };
  if (action !== 'getCollectionSession' || typeof attemptId !== 'string') return undefined;
  return {
    attemptId,
    producer,
    progress: { current: 0, total: 0, completed: 0, failed: 0, label: null },
    attention: null,
  };
}
