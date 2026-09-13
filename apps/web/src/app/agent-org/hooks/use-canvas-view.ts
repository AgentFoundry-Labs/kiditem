'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * 캔버스처럼 줄이고 · 키우고 · 끌어서 옮기는 보기.
 *
 * - 캔버스는 화면 가운데 칸을 꽉 채운다. 양옆에 떠 있는 패널(에이전트 · 실시간 활동)이 가리는
 *   만큼을 `insets` 로 받아, 처음에는 그 빈자리에 그림 전체를 담는다. 사람이 손대기 전에는
 *   칸 크기나 패널 접기가 바뀔 때마다 다시 맞추고, 한 번 손대면 그 보기를 지킨다.
 * - 에이전트를 고르면 그 묶음을 빈자리 가운데로 당겨 크게 본다(`focus`).
 * - ⌘/Ctrl + 스크롤(트랙패드 핀치 포함)은 커서 자리를 기준으로 확대 · 축소한다. 그냥
 *   스크롤은 가로채지 않는다.
 * - 끌어서 옮긴다. 조금이라도 끌었으면 손을 뗀 자리의 박스로 넘어가지 않는다.
 */
export interface CanvasView {
  scale: number;
  x: number;
  y: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export interface CanvasRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 캔버스 가장자리에서 떠 있는 패널이 가리는 폭. */
export interface CanvasInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const NO_CANVAS_INSETS: CanvasInsets = { left: 0, right: 0, top: 0, bottom: 0 };

export const CANVAS_MIN_ZOOM = 0.2;
export const CANVAS_MAX_ZOOM = 2;
/** 처음 맞출 때 이보다 크게 키우지 않는다 — 넓은 화면에서 한 줄이 넘친다. */
const FIT_MAX = 1.2;
const FIT_PADDING = 24;
/** 에이전트 하나를 볼 때의 크기 범위. 글자를 읽을 수 있는 크기부터. */
const FOCUS_MIN = 0.5;
const FOCUS_MAX = 1.1;
/** 이만큼 움직여야 '끌기'로 본다. 그 전에 손을 떼면 그냥 누른 것이다. */
const DRAG_THRESHOLD = 4;
export const CANVAS_ZOOM_STEP = 1.2;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function freeArea(viewport: CanvasSize, insets: CanvasInsets) {
  return {
    left: insets.left + FIT_PADDING,
    top: insets.top + FIT_PADDING,
    width: Math.max(1, viewport.width - insets.left - insets.right - FIT_PADDING * 2),
    height: Math.max(1, viewport.height - insets.top - insets.bottom - FIT_PADDING * 2),
  };
}

/** 패널이 가리지 않는 빈자리에 그림 전체를 담는다. 남는 쪽은 가운데로. */
export function fitCanvasView(viewport: CanvasSize, content: CanvasSize, insets: CanvasInsets = NO_CANVAS_INSETS): CanvasView {
  const area = freeArea(viewport, insets);
  const scale = clamp(Math.min(area.width / content.width, area.height / content.height), CANVAS_MIN_ZOOM, FIT_MAX);
  return {
    scale,
    x: area.left + (area.width - content.width * scale) / 2,
    y: area.top + Math.max(0, (area.height - content.height * scale) / 2),
  };
}

/** 사각형 하나(에이전트 묶음)를 빈자리 가운데로 당겨 크게 본다. */
export function focusCanvasView(viewport: CanvasSize, rect: CanvasRect, insets: CanvasInsets = NO_CANVAS_INSETS): CanvasView {
  const area = freeArea(viewport, insets);
  const scale = clamp(Math.min(area.width / rect.w, area.height / rect.h), FOCUS_MIN, FOCUS_MAX);
  return {
    scale,
    x: area.left + area.width / 2 - (rect.x + rect.w / 2) * scale,
    y: area.top + area.height / 2 - (rect.y + rect.h / 2) * scale,
  };
}

/** `point`(보기 안 좌표)를 제자리에 둔 채 `factor` 만큼 확대 · 축소한다. */
export function zoomCanvasViewAt(view: CanvasView, factor: number, point: { x: number; y: number }): CanvasView {
  const scale = clamp(view.scale * factor, CANVAS_MIN_ZOOM, CANVAS_MAX_ZOOM);
  const ratio = scale / view.scale;
  return {
    scale,
    x: point.x - (point.x - view.x) * ratio,
    y: point.y - (point.y - view.y) * ratio,
  };
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function useCanvasView(
  viewportRef: React.RefObject<HTMLDivElement | null>,
  content: CanvasSize,
  insets: CanvasInsets = NO_CANVAS_INSETS,
) {
  const [view, setView] = useState<CanvasView>({ scale: 0.4, x: 0, y: FIT_PADDING });
  const [dragging, setDragging] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const insetsRef = useRef(insets);
  insetsRef.current = insets;
  const touched = useRef(false);
  const suppressClick = useRef(false);
  const drag = useRef<{ id: number; startX: number; startY: number; x: number; y: number; moved: boolean } | null>(null);
  const { width: contentWidth, height: contentHeight } = content;

  const viewportSize = useCallback((): CanvasSize | null => {
    const element = viewportRef.current;
    if (!element || element.clientWidth === 0 || element.clientHeight === 0) return null;
    return { width: element.clientWidth, height: element.clientHeight };
  }, [viewportRef]);

  const applyFit = useCallback(() => {
    const size = viewportSize();
    if (size) setView(fitCanvasView(size, { width: contentWidth, height: contentHeight }, insetsRef.current));
  }, [contentHeight, contentWidth, viewportSize]);

  const fit = useCallback(() => {
    touched.current = false;
    applyFit();
  }, [applyFit]);

  const focus = useCallback(
    (rect: CanvasRect) => {
      const size = viewportSize();
      if (!size) return;
      touched.current = true;
      setView(focusCanvasView(size, rect, insetsRef.current));
    },
    [viewportSize],
  );

  useIsomorphicLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    let last = '';
    const refit = () => {
      const key = `${element.clientWidth}x${element.clientHeight}`;
      if (element.clientWidth === 0 || key === last) return;
      last = key;
      if (!touched.current) applyFit();
    };
    refit();
    const observer = new ResizeObserver(refit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [applyFit, viewportRef]);

  // 패널을 접고 펴면 빈자리가 달라진다. 손대기 전이면 새 빈자리에 다시 맞춘다.
  const { left, right, top, bottom } = insets;
  useIsomorphicLayoutEffect(() => {
    if (!touched.current) applyFit();
  }, [applyFit, left, right, top, bottom]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    // React 의 onWheel 은 passive 라 preventDefault 가 먹지 않는다. 직접 붙인다.
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      touched.current = true;
      setView((current) =>
        zoomCanvasViewAt(current, Math.exp(-event.deltaY * 0.0022), {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        }),
      );
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [viewportRef]);

  const zoomBy = useCallback(
    (factor: number) => {
      const size = viewportSize() ?? { width: 0, height: 0 };
      touched.current = true;
      setView((current) => zoomCanvasViewAt(current, factor, { x: size.width / 2, y: size.height / 2 }));
    },
    [viewportSize],
  );

  const handlers = {
    onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
      if (event.button !== 0) return;
      drag.current = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: viewRef.current.x,
        y: viewRef.current.y,
        moved: false,
      };
    },
    onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
      const current = drag.current;
      if (!current || current.id !== event.pointerId) return;
      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      if (!current.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        current.moved = true;
        setDragging(true);
        // 끌기로 확정된 뒤에만 포인터를 붙잡는다 — 그냥 누른 박스 링크는 평소처럼 열린다.
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
      touched.current = true;
      setView((view) => ({ ...view, x: current.x + dx, y: current.y + dy }));
    },
    onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
      const current = drag.current;
      if (!current || current.id !== event.pointerId) return;
      drag.current = null;
      if (current.moved) {
        suppressClick.current = true;
        setDragging(false);
      }
    },
    onPointerCancel() {
      drag.current = null;
      setDragging(false);
    },
    onClickCapture(event: React.MouseEvent<HTMLDivElement>) {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
      if (event.target !== event.currentTarget) return;
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        zoomBy(CANVAS_ZOOM_STEP);
      } else if (event.key === '-') {
        event.preventDefault();
        zoomBy(1 / CANVAS_ZOOM_STEP);
      } else if (event.key === '0') {
        event.preventDefault();
        fit();
      }
    },
  };

  return {
    view,
    dragging,
    handlers,
    fit,
    focus,
    zoomIn: () => zoomBy(CANVAS_ZOOM_STEP),
    zoomOut: () => zoomBy(1 / CANVAS_ZOOM_STEP),
    actualSize: () => zoomBy(1 / viewRef.current.scale),
  };
}
