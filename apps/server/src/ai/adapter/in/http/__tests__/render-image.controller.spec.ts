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
    addStyleTag: vi.fn(),
  };
  const browser = {
    newPage: vi.fn(),
    close: vi.fn(),
  };

  beforeEach(() => {
    vi.mocked(puppeteer.launch).mockResolvedValue(browser as never);
    browser.newPage.mockResolvedValue(page as never);
    page.evaluate.mockResolvedValue(null);
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
    expect(page.addStyleTag).toHaveBeenCalledWith({
      content: expect.stringContaining('background: #fff !important'),
    });
    expect(page.screenshot).toHaveBeenCalledWith(expect.objectContaining({
      fullPage: true,
      omitBackground: false,
    }));
    expect(res.send).toHaveBeenCalledWith(Buffer.from('png'));
  });

  it('uses renderScale as device scale without changing the CSS viewport width', async () => {
    const controller = new RenderImageController();
    const res = {
      setHeader: vi.fn(),
      send: vi.fn(),
    };

    await controller.render(
      {
        html: '<main><h1>scaled render</h1></main>',
        viewportWidth: 860,
        renderScale: 2,
      },
      res as never,
    );

    expect(page.setViewport).toHaveBeenCalledWith(expect.objectContaining({
      width: 860,
      deviceScaleFactor: 2,
    }));
  });

  it('clips screenshots to the measured content bounds when available', async () => {
    page.evaluate
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ x: 0, y: 0, width: 720, height: 2400 });
    const controller = new RenderImageController();
    const res = {
      setHeader: vi.fn(),
      send: vi.fn(),
    };

    await controller.render(
      {
        html: '<main><h1>content only</h1></main>',
      },
      res as never,
    );

    expect(page.screenshot).toHaveBeenCalledWith(expect.objectContaining({
      clip: { x: 0, y: 0, width: 720, height: 2400 },
    }));
    expect(page.screenshot).toHaveBeenCalledWith(expect.not.objectContaining({
      fullPage: true,
    }));
  });
});
