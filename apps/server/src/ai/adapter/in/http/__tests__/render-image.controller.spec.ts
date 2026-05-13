import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import puppeteer from 'puppeteer';
import { RenderImageController } from '../render-image.controller';

vi.mock('puppeteer', () => ({
  default: {
    launch: vi.fn(),
  },
}));

describe('RenderImageController', () => {
  const page = {
    setDefaultNavigationTimeout: vi.fn(),
    setDefaultTimeout: vi.fn(),
    setViewport: vi.fn(),
    goto: vi.fn(),
    setContent: vi.fn(),
    evaluate: vi.fn(),
    screenshot: vi.fn(),
  };
  const browser = {
    newPage: vi.fn(),
    close: vi.fn(),
  };

  beforeEach(() => {
    vi.mocked(puppeteer.launch).mockResolvedValue(browser as never);
    browser.newPage.mockResolvedValue(page as never);
    page.screenshot.mockResolvedValue(Buffer.from('png'));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not navigate to a request-controlled baseUrl before rendering HTML', async () => {
    const controller = new RenderImageController();
    const res = {
      setHeader: vi.fn(),
      send: vi.fn(),
    };

    await controller.render(
      {
        html: '<main><h1>safe render</h1></main>',
        baseUrl: 'http://127.0.0.1:4000/internal',
      },
      res as never,
    );

    expect(page.goto).not.toHaveBeenCalled();
    expect(page.setContent).toHaveBeenCalledWith(
      '<main><h1>safe render</h1></main>',
      expect.any(Object),
    );
    expect(res.send).toHaveBeenCalledWith(Buffer.from('png'));
  });
});
