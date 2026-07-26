const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FONT_READY_TIMEOUT_MS = 2_000;

export function isRenderIntentId(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function sanitizeClientRenderDocument(source: string): string {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  doc.querySelectorAll('script, noscript, iframe, object, embed').forEach((node) => {
    node.remove();
  });
  doc.querySelectorAll('meta[http-equiv]').forEach((node) => {
    if (node.getAttribute('http-equiv')?.toLowerCase() === 'refresh') node.remove();
  });
  doc.querySelectorAll('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (
        name.startsWith('on') ||
        name === 'srcdoc' ||
        ((name === 'href' || name === 'src' || name === 'xlink:href') &&
          value.startsWith('javascript:'))
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  });
  doc.querySelectorAll('img').forEach((image) => {
    image.setAttribute('loading', 'eager');
    image.setAttribute('decoding', 'sync');
  });
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}

export function measureRenderContentHeight(doc: Document): number {
  return Math.max(
    1,
    Math.ceil(doc.documentElement.scrollHeight),
    Math.ceil(doc.documentElement.offsetHeight),
    Math.ceil(doc.body?.scrollHeight ?? 0),
    Math.ceil(doc.body?.offsetHeight ?? 0),
  );
}

export async function waitForRenderDocument(doc: Document): Promise<number> {
  const images = [...doc.images];
  await Promise.all(images.map(waitForImage));
  await waitForFonts(doc);
  await waitForRenderTurn();
  await waitForRenderTurn();
  return measureRenderContentHeight(doc);
}

async function waitForFonts(doc: Document): Promise<void> {
  if (!doc.fonts?.ready) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      resolve();
    };

    timeoutId = setTimeout(finish, FONT_READY_TIMEOUT_MS);
    void doc.fonts.ready.then(finish, finish);
  });
}

async function waitForImage(image: HTMLImageElement): Promise<void> {
  image.loading = 'eager';
  image.decoding = 'sync';
  if (!image.complete) {
    await new Promise<void>((resolve, reject) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener(
        'error',
        () => reject(new Error(`상세페이지 이미지 로드 실패: ${image.currentSrc || image.src}`)),
        { once: true },
      );
    });
  }
  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    throw new Error(`상세페이지 이미지가 비어 있습니다: ${image.currentSrc || image.src}`);
  }
  if (typeof image.decode === 'function') await image.decode();
}

/**
 * Hidden renderer tabs may have requestAnimationFrame fully suspended by Chrome.
 * Keep the paint-aligned fast path, but guarantee progress through a short timer.
 */
export function waitForRenderTurn(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let frameId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (frameId !== undefined && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(frameId);
      }
      resolve();
    };

    timeoutId = setTimeout(finish, 50);
    if (typeof requestAnimationFrame === 'function') {
      frameId = requestAnimationFrame(finish);
    }
  });
}
