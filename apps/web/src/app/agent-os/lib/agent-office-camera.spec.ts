import { describe, expect, it } from 'vitest';
import {
  OFFICE_MAX_ZOOM_MULTIPLIER,
  OFFICE_PAN_OVERSCROLL_RATIO,
  clampOfficeCamera,
  createInitialOfficeCamera,
  getOfficeCameraLimits,
  panOfficeCamera,
  zoomOfficeCameraAt,
} from './agent-office-camera';

const viewport = { width: 800, height: 600 };
const world = { width: 1200, height: 750 };

describe('agent office camera', () => {
  it('centers the full office only for the initial transform', () => {
    expect(createInitialOfficeCamera({ viewport, world })).toEqual({
      x: 0,
      y: 50,
      scale: 2 / 3,
    });
  });

  it('caps zoom at exactly 1.8 times the fitted scale', () => {
    const limits = getOfficeCameraLimits({ viewport, world });

    expect(limits.minScale).toBeCloseTo(2 / 3);
    expect(limits.maxScale).toBeCloseTo(
      (2 / 3) * OFFICE_MAX_ZOOM_MULTIPLIER,
    );
  });

  it('preserves the world point underneath the zoom anchor', () => {
    const transform = createInitialOfficeCamera({ viewport, world });
    const anchor = { x: 600, y: 300 };
    const before = {
      x: (anchor.x - transform.x) / transform.scale,
      y: (anchor.y - transform.y) / transform.scale,
    };
    const zoomed = zoomOfficeCameraAt({
      transform,
      anchor,
      scaleFactor: 1.4,
      viewport,
      world,
    });

    expect((anchor.x - zoomed.x) / zoomed.scale).toBeCloseTo(before.x);
    expect((anchor.y - zoomed.y) / zoomed.scale).toBeCloseTo(before.y);
  });

  it('keeps pan inside the 12 percent viewport overscroll bounds', () => {
    const transform = createInitialOfficeCamera({ viewport, world });
    const panned = panOfficeCamera({
      transform,
      delta: { x: 10_000, y: -10_000 },
      viewport,
      world,
    });

    expect(panned.x).toBe(viewport.width * OFFICE_PAN_OVERSCROLL_RATIO);
    expect(panned.y).toBe(
      50 - viewport.height * OFFICE_PAN_OVERSCROLL_RATIO,
    );
  });

  it('does not recenter when zooming out again at minimum scale', () => {
    const translatedAtMinimum = clampOfficeCamera({
      transform: { x: 72, y: 10, scale: 2 / 3 },
      viewport,
      world,
    });
    const afterExtraZoomOut = zoomOfficeCameraAt({
      transform: translatedAtMinimum,
      anchor: { x: 400, y: 300 },
      scaleFactor: 0.5,
      viewport,
      world,
    });

    expect(afterExtraZoomOut).toEqual(translatedAtMinimum);
    expect(afterExtraZoomOut).not.toEqual(
      createInitialOfficeCamera({ viewport, world }),
    );
  });
});
