import { chromium } from 'playwright';
import { describe, expect, it, vi } from 'vitest';
import {
  openCdpAbortableBrowserSession,
} from './abortable-browser-session';

vi.mock('playwright', () => ({
  chromium: {
    connectOverCDP: vi.fn(),
    launchPersistentContext: vi.fn(),
    launch: vi.fn(),
  },
}));

describe('openCdpAbortableBrowserSession', () => {
  it('uses the existing host context and closes only its owned page and client connection', async () => {
    const ownedPage = { close: vi.fn().mockResolvedValue(undefined) };
    const unrelatedPage = { close: vi.fn() };
    const context = { newPage: vi.fn().mockResolvedValue(ownedPage), pages: () => [unrelatedPage] };
    const browser = {
      contexts: () => [context],
      newContext: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(browser as never);

    const session = await openCdpAbortableBrowserSession({
      cdpEndpoint: 'ws://kiditem-office:9444/devtools/browser/test',
      cdpConnectTimeoutMs: 1_000,
    });
    await session.close();

    expect(context.newPage).toHaveBeenCalledOnce();
    expect(browser.newContext).not.toHaveBeenCalled();
    expect(ownedPage.close).toHaveBeenCalledOnce();
    expect(unrelatedPage.close).not.toHaveBeenCalled();
    expect(browser.close).toHaveBeenCalledOnce();
    expect(chromium.launchPersistentContext).not.toHaveBeenCalled();
    expect(chromium.launch).not.toHaveBeenCalled();
  });

  it('fails closed when CDP has no existing browser context', async () => {
    const browser = {
      contexts: () => [],
      newContext: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(browser as never);

    await expect(openCdpAbortableBrowserSession({
      cdpEndpoint: 'http://kiditem-office:9444',
      cdpConnectTimeoutMs: 1_000,
    })).rejects.toThrow('browser_context_unavailable');

    expect(browser.newContext).not.toHaveBeenCalled();
    expect(browser.close).toHaveBeenCalledOnce();
  });
});
