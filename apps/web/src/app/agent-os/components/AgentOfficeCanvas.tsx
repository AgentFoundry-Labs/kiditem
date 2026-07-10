'use client';

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { cn } from '@/lib/utils';
import {
  clampOfficeCamera,
  createInitialOfficeCamera,
  panOfficeCamera,
  zoomOfficeCameraAt,
  type OfficeCameraTransform,
  type OfficeSize,
} from '../lib/agent-office-camera';

const DRAG_THRESHOLD_PX = 4;
const WHEEL_ZOOM_SENSITIVITY = 0.0015;

interface DragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startCamera: OfficeCameraTransform;
  active: boolean;
}

function isCameraControl(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest(
      'button, a, input, textarea, select, [role="button"], [data-office-camera-control]',
    ) !== null
  );
}

export function AgentOfficeCanvas({
  children,
  worldSize,
  className,
}: {
  children: ReactNode;
  worldSize: OfficeSize;
  className?: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const viewportSizeRef = useRef<OfficeSize>({ width: 0, height: 0 });
  const initializedRef = useRef(false);
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);
  const [camera, setCamera] = useState<OfficeCameraTransform>({
    x: 0,
    y: 0,
    scale: 1,
  });
  const cameraRef = useRef(camera);

  const updateCamera = useCallback((next: OfficeCameraTransform) => {
    cameraRef.current = next;
    setCamera(next);
  }, []);

  const measureViewport = useCallback(
    (viewport: OfficeSize) => {
      if (viewport.width <= 0 || viewport.height <= 0) return;
      viewportSizeRef.current = viewport;

      if (!initializedRef.current) {
        initializedRef.current = true;
        updateCamera(createInitialOfficeCamera({ viewport, world: worldSize }));
        return;
      }

      updateCamera(
        clampOfficeCamera({
          transform: cameraRef.current,
          viewport,
          world: worldSize,
        }),
      );
    },
    [updateCamera, worldSize],
  );

  useLayoutEffect(() => {
    const viewportElement = viewportRef.current;
    if (!viewportElement) return;

    const rect = viewportElement.getBoundingClientRect();
    measureViewport({ width: rect.width, height: rect.height });

    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      measureViewport({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(viewportElement);

    return () => observer.disconnect();
  }, [measureViewport]);

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      dragRef.current = null;
      setDragging(false);
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
    },
    [],
  );

  return (
    <div
      ref={viewportRef}
      data-testid="agent-office-canvas"
      data-dragging={dragging ? 'true' : 'false'}
      className={cn(
        'relative h-full w-full select-none overflow-hidden bg-slate-100',
        dragging ? 'cursor-grabbing' : 'cursor-grab',
        className,
      )}
      style={{ touchAction: 'none' }}
      onPointerDown={(event) => {
        if (event.button !== 0 || isCameraControl(event.target)) return;

        dragRef.current = {
          pointerId: event.pointerId,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startCamera: cameraRef.current,
          active: false,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;

        const delta = {
          x: event.clientX - drag.startClientX,
          y: event.clientY - drag.startClientY,
        };
        if (!drag.active && Math.hypot(delta.x, delta.y) < DRAG_THRESHOLD_PX) {
          return;
        }

        drag.active = true;
        setDragging(true);
        event.preventDefault();
        updateCamera(
          panOfficeCamera({
            transform: drag.startCamera,
            delta,
            viewport: viewportSizeRef.current,
            world: worldSize,
          }),
        );
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={(event) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        dragRef.current = null;
        setDragging(false);
      }}
      onWheel={(event: ReactWheelEvent<HTMLDivElement>) => {
        const viewport = viewportSizeRef.current;
        if (viewport.width <= 0 || viewport.height <= 0) return;

        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        updateCamera(
          zoomOfficeCameraAt({
            transform: cameraRef.current,
            anchor: {
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
            },
            scaleFactor: Math.exp(
              -event.deltaY * WHEEL_ZOOM_SENSITIVITY,
            ),
            viewport,
            world: worldSize,
          }),
        );
      }}
    >
      <div
        data-testid="agent-office-camera-world"
        className="absolute left-0 top-0"
        style={{
          width: `${worldSize.width}px`,
          height: `${worldSize.height}px`,
          transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`,
          transformOrigin: '0 0',
        }}
      >
        {children}
      </div>
    </div>
  );
}
