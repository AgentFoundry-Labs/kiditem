import { fireEvent, render, screen } from '@testing-library/react';
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

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function scaleFrom(transform: string) {
  return Number(transform.match(/scale\(([^)]+)\)/)?.[1]);
}

describe('AgentOfficeCanvas', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      viewportRect,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('frames once and pans after a four-pixel empty-floor threshold', () => {
    render(
      <AgentOfficeCanvas worldSize={{ width: 1200, height: 750 }}>
        <div>floor</div>
      </AgentOfficeCanvas>,
    );
    const viewport = screen.getByTestId('agent-office-canvas');
    const world = screen.getByTestId('agent-office-camera-world');
    const initialTransform = world.style.transform;

    fireEvent.pointerDown(viewport, {
      pointerId: 1,
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(viewport, {
      pointerId: 1,
      clientX: 103,
      clientY: 102,
    });
    expect(world.style.transform).toBe(initialTransform);

    fireEvent.pointerMove(viewport, {
      pointerId: 1,
      clientX: 140,
      clientY: 120,
    });
    expect(world.style.transform).not.toBe(initialTransform);
    expect(viewport).toHaveAttribute('data-dragging', 'true');
  });

  it('does not start camera drag from a scene control', () => {
    render(
      <AgentOfficeCanvas worldSize={{ width: 1200, height: 750 }}>
        <button type="button">employee</button>
      </AgentOfficeCanvas>,
    );
    const viewport = screen.getByTestId('agent-office-canvas');
    const world = screen.getByTestId('agent-office-camera-world');
    const initialTransform = world.style.transform;

    fireEvent.pointerDown(screen.getByRole('button', { name: 'employee' }), {
      pointerId: 2,
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(viewport, {
      pointerId: 2,
      clientX: 180,
      clientY: 180,
    });

    expect(world.style.transform).toBe(initialTransform);
    expect(viewport).toHaveAttribute('data-dragging', 'false');
  });

  it('zooms the complete world around wheel input without rendering controls', () => {
    render(
      <AgentOfficeCanvas worldSize={{ width: 1200, height: 750 }}>
        <div>floor</div>
      </AgentOfficeCanvas>,
    );
    const viewport = screen.getByTestId('agent-office-canvas');
    const world = screen.getByTestId('agent-office-camera-world');
    const initialScale = scaleFrom(world.style.transform);

    fireEvent.wheel(viewport, {
      clientX: 600,
      clientY: 300,
      deltaY: -160,
    });

    expect(scaleFrom(world.style.transform)).toBeGreaterThan(initialScale);
    expect(
      screen.queryByRole('button', { name: /확대|축소|전체 보기/ }),
    ).toBeNull();
  });

  it('ends dragging on pointer cancellation', () => {
    render(
      <AgentOfficeCanvas worldSize={{ width: 1200, height: 750 }}>
        <div>floor</div>
      </AgentOfficeCanvas>,
    );
    const viewport = screen.getByTestId('agent-office-canvas');

    fireEvent.pointerDown(viewport, {
      pointerId: 3,
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(viewport, {
      pointerId: 3,
      clientX: 140,
      clientY: 140,
    });
    fireEvent.pointerCancel(viewport, { pointerId: 3 });

    expect(viewport).toHaveAttribute('data-dragging', 'false');
  });
});
