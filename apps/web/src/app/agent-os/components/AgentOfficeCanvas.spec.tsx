import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentOfficeCanvas } from './AgentOfficeCanvas';

const viewportRect = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 800,
  bottom: 600,
  width: 800,
  height: 600,
  toJSON: () => ({}),
};

let resizeObserverCallback: ResizeObserverCallback | null = null;

class ResizeObserverMock {
  constructor(callback: ResizeObserverCallback) {
    resizeObserverCallback = callback;
  }

  observe() {}
  unobserve() {}
  disconnect() {}
}

function resizeViewport(width: number, height: number) {
  act(() => {
    resizeObserverCallback?.(
      [{ contentRect: { width, height } } as ResizeObserverEntry],
      {} as ResizeObserver,
    );
  });
}

describe('AgentOfficeCanvas', () => {
  beforeEach(() => {
    resizeObserverCallback = null;
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      viewportRect,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps the largest-ratio office fixed when camera gestures occur', () => {
    render(
      <AgentOfficeCanvas worldSize={{ width: 1200, height: 750 }}>
        <div>floor</div>
      </AgentOfficeCanvas>,
    );
    const viewport = screen.getByTestId('agent-office-canvas');
    const world = screen.getByTestId('agent-office-camera-world');
    const initialTransform = world.style.transform;

    expect(initialTransform).toBe('scale(0.8)');

    fireEvent.pointerDown(viewport, {
      pointerId: 1,
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(viewport, {
      pointerId: 1,
      clientX: 140,
      clientY: 120,
    });

    fireEvent.wheel(viewport, {
      clientX: 600,
      clientY: 300,
      deltaY: -160,
    });

    expect(world.style.transform).toBe(initialTransform);
    expect(viewport.className).toContain('overflow-auto');
    expect(viewport.className).not.toContain('overflow-hidden');
    expect(viewport.className).not.toContain('cursor-grab');
    expect(viewport).not.toHaveAttribute('data-dragging');
  });

  it('uses the larger viewport ratio and exposes overflow for scrolling', () => {
    render(
      <AgentOfficeCanvas worldSize={{ width: 1200, height: 750 }}>
        <div>floor</div>
      </AgentOfficeCanvas>,
    );
    const world = screen.getByTestId('agent-office-camera-world');
    const scrollWorld = screen.getByTestId('agent-office-scroll-world');

    resizeViewport(600, 400);

    expect(world.style.transform).toBe('scale(0.5333333333333333)');
    expect(scrollWorld.style.width).toBe('640px');
    expect(scrollWorld.style.height).toBe('400px');
  });
});
