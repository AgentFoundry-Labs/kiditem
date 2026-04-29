// apps/server/src/products/util/cursor.ts
interface CursorPayload {
  createdAt: string;
  id: string;
}

export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorPayload {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as CursorPayload;
    if (!parsed.createdAt || !parsed.id) throw new Error('invalid cursor shape');
    return parsed;
  } catch {
    throw new Error(`invalid cursor: ${cursor}`);
  }
}
