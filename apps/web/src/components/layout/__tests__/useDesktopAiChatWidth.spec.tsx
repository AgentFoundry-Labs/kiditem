import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DESKTOP_AI_CHAT_WIDTH,
  DESKTOP_AI_CHAT_WIDTH_STORAGE_KEY,
  useDesktopAiChatWidth,
} from '../useDesktopAiChatWidth';

const originalInnerWidth = window.innerWidth;

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
}

describe('useDesktopAiChatWidth', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setViewportWidth(1536);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: originalInnerWidth,
    });
  });

  it('uses the 352px default when no desktop preference is stored', async () => {
    const { result } = renderHook(() => useDesktopAiChatWidth());

    await waitFor(() => expect(result.current.width).toBe(DEFAULT_DESKTOP_AI_CHAT_WIDTH));
  });

  it('restores an in-range integer desktop preference after mount', async () => {
    window.localStorage.setItem(DESKTOP_AI_CHAT_WIDTH_STORAGE_KEY, '496');

    const { result } = renderHook(() => useDesktopAiChatWidth());

    await waitFor(() => expect(result.current.width).toBe(496));
  });

  it.each(['not-a-number', '319', '641', '400.5', '496.0'])(
    'fails closed to the default for an invalid stored value: %s',
    async (storedWidth) => {
      window.localStorage.setItem(DESKTOP_AI_CHAT_WIDTH_STORAGE_KEY, storedWidth);

      const { result } = renderHook(() => useDesktopAiChatWidth());

      await waitFor(() => expect(result.current.width).toBe(DEFAULT_DESKTOP_AI_CHAT_WIDTH));
    },
  );

  it('previews a drag width without writing the stored preference', async () => {
    window.localStorage.setItem(DESKTOP_AI_CHAT_WIDTH_STORAGE_KEY, '496');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { result } = renderHook(() => useDesktopAiChatWidth());

    await waitFor(() => expect(result.current.width).toBe(496));

    act(() => result.current.previewWidth(544));

    expect(result.current.width).toBe(544);
    expect(window.localStorage.getItem(DESKTOP_AI_CHAT_WIDTH_STORAGE_KEY)).toBe('496');
    expect(setItem).not.toHaveBeenCalled();
  });

  it('commits one valid integer width to local storage', async () => {
    const { result } = renderHook(() => useDesktopAiChatWidth());

    await waitFor(() => expect(result.current.width).toBe(DEFAULT_DESKTOP_AI_CHAT_WIDTH));

    act(() => result.current.commitWidth(528));

    expect(result.current.width).toBe(528);
    expect(window.localStorage.getItem(DESKTOP_AI_CHAT_WIDTH_STORAGE_KEY)).toBe('528');
  });

  it('uses a temporary viewport clamp without overwriting the saved preference', async () => {
    setViewportWidth(480);
    window.localStorage.setItem(DESKTOP_AI_CHAT_WIDTH_STORAGE_KEY, '640');
    const { result } = renderHook(() => useDesktopAiChatWidth());

    await waitFor(() => expect(result.current.width).toBe(480));
    expect(window.localStorage.getItem(DESKTOP_AI_CHAT_WIDTH_STORAGE_KEY)).toBe('640');

    setViewportWidth(440);
    act(() => window.dispatchEvent(new Event('resize')));

    expect(result.current.width).toBe(440);
    expect(window.localStorage.getItem(DESKTOP_AI_CHAT_WIDTH_STORAGE_KEY)).toBe('640');
  });
});
