'use client';

import { useCallback, useEffect, useState } from 'react';

export const DESKTOP_AI_CHAT_WIDTH_STORAGE_KEY = 'kiditem.ai-chat.desktop-width';
export const DEFAULT_DESKTOP_AI_CHAT_WIDTH = 352;
export const MIN_DESKTOP_AI_CHAT_WIDTH = 320;
export const MAX_DESKTOP_AI_CHAT_WIDTH = 640;

export interface DesktopAiChatWidthController {
  width: number;
  previewWidth(width: number): void;
  commitWidth(width: number): void;
  cancelPreview(): void;
}

function isValidDesktopAiChatWidth(width: number): boolean {
  return Number.isInteger(width)
    && width >= MIN_DESKTOP_AI_CHAT_WIDTH
    && width <= MAX_DESKTOP_AI_CHAT_WIDTH;
}

export function clampDesktopAiChatWidth(width: number): number | null {
  if (!Number.isFinite(width)) return null;
  return Math.min(
    MAX_DESKTOP_AI_CHAT_WIDTH,
    Math.max(MIN_DESKTOP_AI_CHAT_WIDTH, Math.round(width)),
  );
}

function readStoredWidth(): number {
  try {
    const storedWidth = window.localStorage.getItem(DESKTOP_AI_CHAT_WIDTH_STORAGE_KEY);
    if (storedWidth === null || !/^\d+$/.test(storedWidth)) {
      return DEFAULT_DESKTOP_AI_CHAT_WIDTH;
    }
    const parsedWidth = Number(storedWidth);
    return isValidDesktopAiChatWidth(parsedWidth)
      ? parsedWidth
      : DEFAULT_DESKTOP_AI_CHAT_WIDTH;
  } catch {
    return DEFAULT_DESKTOP_AI_CHAT_WIDTH;
  }
}

function clampToViewport(width: number, viewportWidth: number | null): number {
  if (viewportWidth === null) return width;
  return Math.min(width, Math.max(0, viewportWidth));
}

/** Browser-local desktop AI chat width preference and transient drag preview. */
export function useDesktopAiChatWidth(): DesktopAiChatWidthController {
  const [preferredWidth, setPreferredWidth] = useState(DEFAULT_DESKTOP_AI_CHAT_WIDTH);
  const [preview, setPreview] = useState<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState<number | null>(null);

  useEffect(() => {
    const syncViewportWidth = () => setViewportWidth(window.innerWidth);
    syncViewportWidth();
    setPreferredWidth(readStoredWidth());
    window.addEventListener('resize', syncViewportWidth);
    return () => window.removeEventListener('resize', syncViewportWidth);
  }, []);

  const previewWidth = useCallback((nextWidth: number) => {
    const clampedWidth = clampDesktopAiChatWidth(nextWidth);
    if (clampedWidth !== null) setPreview(clampedWidth);
  }, []);

  const commitWidth = useCallback((nextWidth: number) => {
    const clampedWidth = clampDesktopAiChatWidth(nextWidth);
    if (clampedWidth === null) return;

    setPreferredWidth(clampedWidth);
    setPreview(null);
    try {
      window.localStorage.setItem(DESKTOP_AI_CHAT_WIDTH_STORAGE_KEY, String(clampedWidth));
    } catch {
      // The active session can still use the width when browser storage is unavailable.
    }
  }, []);

  const cancelPreview = useCallback(() => setPreview(null), []);
  const width = clampToViewport(preview ?? preferredWidth, viewportWidth);

  return { width, previewWidth, commitWidth, cancelPreview };
}
