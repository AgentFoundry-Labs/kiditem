import { describe, expect, it } from 'vitest';
import {
  CANVAS_MAX_ZOOM,
  CANVAS_MIN_ZOOM,
  fitCanvasView,
  focusCanvasView,
  zoomCanvasViewAt,
} from './use-canvas-view';

const CONTENT = { width: 2400, height: 1800 };
const VIEWPORT = { width: 1600, height: 700 };
const PANELS = { left: 332, right: 352, top: 0, bottom: 0 };

describe('캔버스 보기 계산', () => {
  it('⭐ 처음에는 양옆 패널이 가리지 않는 빈자리에 그림 전체를 담는다', () => {
    const view = fitCanvasView(VIEWPORT, CONTENT, PANELS);
    const freeWidth = 1600 - 332 - 352 - 48;
    const freeHeight = 700 - 48;
    expect(view.scale).toBeCloseTo(Math.min(freeWidth / 2400, freeHeight / 1800), 5);
    // 그림 전체가 빈자리 안에 든다.
    expect(view.x).toBeGreaterThanOrEqual(332 + 24 - 0.001);
    expect(view.x + 2400 * view.scale).toBeLessThanOrEqual(1600 - 352 - 24 + 0.001);
    expect(view.y).toBeGreaterThanOrEqual(24);
    expect(view.y + 1800 * view.scale).toBeLessThanOrEqual(700 - 24 + 0.001);
  });

  it('패널을 접으면 빈자리가 넓어져 더 크게 담긴다', () => {
    const open = fitCanvasView(VIEWPORT, CONTENT, PANELS);
    const folded = fitCanvasView(VIEWPORT, CONTENT, { left: 60, right: 60, top: 0, bottom: 0 });
    expect(folded.scale).toBeGreaterThanOrEqual(open.scale);
  });

  it('아주 넓은 화면에서도 1.2배를 넘기지 않는다', () => {
    expect(fitCanvasView({ width: 9000, height: 9000 }, CONTENT).scale).toBe(1.2);
  });

  it('⭐ 에이전트를 고르면 그 묶음이 빈자리 한가운데로 온다', () => {
    const rect = { x: 713, y: 374, w: 974, h: 294 };
    const view = focusCanvasView(VIEWPORT, rect, PANELS);
    const freeCenterX = 332 + 24 + (1600 - 332 - 352 - 48) / 2;
    const freeCenterY = 24 + (700 - 48) / 2;
    expect(view.x + (rect.x + rect.w / 2) * view.scale).toBeCloseTo(freeCenterX, 5);
    expect(view.y + (rect.y + rect.h / 2) * view.scale).toBeCloseTo(freeCenterY, 5);
    // 글자를 읽을 수 있는 크기보다 작게 당기지 않는다.
    expect(view.scale).toBeGreaterThanOrEqual(0.5);
  });

  it('⭐ 확대 · 축소는 가리킨 자리를 제자리에 둔다', () => {
    const before = { scale: 0.5, x: 100, y: 40 };
    const point = { x: 600, y: 400 };
    const after = zoomCanvasViewAt(before, 2, point);
    const worldX = (point.x - before.x) / before.scale;
    const worldY = (point.y - before.y) / before.scale;
    expect(after.scale).toBe(1);
    expect(after.x + worldX * after.scale).toBeCloseTo(point.x, 6);
    expect(after.y + worldY * after.scale).toBeCloseTo(point.y, 6);
  });

  it('확대 · 축소에는 한계가 있다', () => {
    expect(zoomCanvasViewAt({ scale: 1.9, x: 0, y: 0 }, 5, { x: 0, y: 0 }).scale).toBe(CANVAS_MAX_ZOOM);
    expect(zoomCanvasViewAt({ scale: 0.25, x: 0, y: 0 }, 0.1, { x: 0, y: 0 }).scale).toBe(CANVAS_MIN_ZOOM);
  });
});
