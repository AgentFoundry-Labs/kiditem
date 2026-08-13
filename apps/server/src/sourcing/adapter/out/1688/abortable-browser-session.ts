import { mkdir } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';

export interface AbortableBrowserSession {
  page: Page;
  close: () => Promise<void>;
}

export async function openAbortableBrowserSession(input: {
  cdpEndpoint: string | null;
  cdpConnectTimeoutMs: number;
  userDataDir: string;
  executablePath: string | undefined;
  headless: boolean;
  signal?: AbortSignal;
}): Promise<AbortableBrowserSession> {
  input.signal?.throwIfAborted();
  if (input.cdpEndpoint) {
    const browser = await abortableBrowserStep(
      chromium.connectOverCDP(input.cdpEndpoint, {
        timeout: input.cdpConnectTimeoutMs,
      }),
      input.signal,
      (connectedBrowser) => connectedBrowser.close(),
    );
    try {
      input.signal?.throwIfAborted();
      const context = browser.contexts()[0] ?? await abortableBrowserStep(
        browser.newContext(),
        input.signal,
      );
      const page = await abortableBrowserStep(context.newPage(), input.signal);
      await abortableBrowserStep(
        page.setViewportSize({ width: 1440, height: 1000 }).catch(() => undefined),
        input.signal,
      );
      return {
        page,
        close: async () => {
          await page.close().catch(() => undefined);
          await browser.close().catch(() => undefined);
        },
      };
    } catch (error) {
      await browser.close().catch(() => undefined);
      input.signal?.throwIfAborted();
      throw error;
    }
  }

  await mkdir(input.userDataDir, { recursive: true });
  input.signal?.throwIfAborted();
  const context = await abortableBrowserStep(
    chromium.launchPersistentContext(input.userDataDir, {
      ...(input.executablePath ? { executablePath: input.executablePath } : {}),
      headless: input.headless,
      viewport: { width: 1440, height: 1000 },
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    }),
    input.signal,
    (launchedContext) => launchedContext.close(),
  );
  try {
    return {
      page: context.pages()[0] ?? await abortableBrowserStep(
        context.newPage(),
        input.signal,
      ),
      close: async () => {
        await context.close().catch(() => undefined);
      },
    };
  } catch (error) {
    await context.close().catch(() => undefined);
    input.signal?.throwIfAborted();
    throw error;
  }
}

export function abortableBrowserStep<T>(
  step: Promise<T>,
  signal?: AbortSignal,
  disposeAfterAbort?: (value: T) => Promise<unknown> | unknown,
): Promise<T> {
  if (!signal) return step;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      cleanup();
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    void step.then(
      (value) => {
        cleanup();
        if (signal.aborted) {
          void Promise.resolve(disposeAfterAbort?.(value)).catch(() => undefined);
          return;
        }
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}
