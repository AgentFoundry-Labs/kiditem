/** A deterministic local title keeps first-send creation free from model work. */
export function conversationTitleFromMessage(message: string): string {
  const normalized = message.trim().replace(/\s+/gu, ' ');
  if (!normalized) throw new Error('conversation_title_required');

  const codePoints = Array.from(normalized);
  return codePoints.length <= 48
    ? normalized
    : `${codePoints.slice(0, 47).join('')}…`;
}
