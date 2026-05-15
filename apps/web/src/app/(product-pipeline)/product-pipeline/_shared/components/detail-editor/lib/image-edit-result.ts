function parseJsonMaybe(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function readPath(source: unknown, path: string[]): unknown {
  let cursor = parseJsonMaybe(source);
  for (const key of path) {
    if (!cursor || typeof cursor !== 'object' || !(key in cursor)) return null;
    cursor = parseJsonMaybe((cursor as Record<string, unknown>)[key]);
  }
  return cursor;
}

function readStringPath(source: unknown, path: string[]): string | null {
  const cursor = readPath(source, path);
  return typeof cursor === 'string' && cursor.trim() ? cursor : null;
}

function firstStringFromArray(source: unknown, path: string[]): string | null {
  const value = path.length === 0 ? parseJsonMaybe(source) : readPath(source, path);
  if (!Array.isArray(value) || value.length === 0) return null;
  const first = parseJsonMaybe(value[0]);
  if (typeof first === 'string' && first.trim()) return first;
  if (first && typeof first === 'object') {
    return (
      readStringPath(first, ['url']) ??
      readStringPath(first, ['image_url']) ??
      readStringPath(first, ['imageUrl'])
    );
  }
  return null;
}

export function extractEditedImageUrl(output: unknown): string | null {
  const parsed = parseJsonMaybe(output);
  return (
    readStringPath(parsed, ['image_url']) ??
    readStringPath(parsed, ['imageUrl']) ??
    readStringPath(parsed, ['url']) ??
    readStringPath(parsed, ['result_url']) ??
    readStringPath(parsed, ['resultUrl']) ??
    readStringPath(parsed, ['output', 'image_url']) ??
    readStringPath(parsed, ['output', 'imageUrl']) ??
    readStringPath(parsed, ['output', 'url']) ??
    readStringPath(parsed, ['result', 'image_url']) ??
    readStringPath(parsed, ['result', 'imageUrl']) ??
    readStringPath(parsed, ['result', 'url']) ??
    firstStringFromArray(parsed, ['images']) ??
    firstStringFromArray(parsed, ['image_urls']) ??
    firstStringFromArray(parsed, ['imageUrls']) ??
    firstStringFromArray(parsed, ['color_images']) ??
    firstStringFromArray(parsed, ['colorImages']) ??
    firstStringFromArray(parsed, ['output', 'images']) ??
    firstStringFromArray(parsed, ['output', 'color_images'])
  );
}
