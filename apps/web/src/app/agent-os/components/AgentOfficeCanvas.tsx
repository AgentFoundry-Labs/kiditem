'use client';

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';
import type { OfficeSize } from '../lib/agent-office-camera';

function getLargestOfficeScale(viewport: OfficeSize, world: OfficeSize) {
  return Math.max(
    viewport.width / world.width,
    viewport.height / world.height,
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
  const [scale, setScale] = useState(1);
  const scaledWidth = worldSize.width * scale;
  const scaledHeight = worldSize.height * scale;

  const measureViewport = useCallback(
    (viewport: OfficeSize) => {
      if (viewport.width <= 0 || viewport.height <= 0) return;
      setScale(getLargestOfficeScale(viewport, worldSize));
    },
    [worldSize],
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

  useLayoutEffect(() => {
    const viewportElement = viewportRef.current;
    if (!viewportElement) return;

    viewportElement.scrollLeft = Math.max(
      0,
      (scaledWidth - viewportElement.clientWidth) / 2,
    );
    viewportElement.scrollTop = Math.max(
      0,
      (scaledHeight - viewportElement.clientHeight) / 2,
    );
  }, [scaledHeight, scaledWidth]);

  return (
    <div
      ref={viewportRef}
      data-testid="agent-office-canvas"
      className={cn(
        'relative h-full w-full overflow-auto bg-slate-100',
        className,
      )}
    >
      <div
        data-testid="agent-office-scroll-world"
        className="relative"
        style={{
          width: `${scaledWidth}px`,
          height: `${scaledHeight}px`,
        }}
      >
        <div
          data-testid="agent-office-camera-world"
          className="absolute left-0 top-0"
          style={{
            width: `${worldSize.width}px`,
            height: `${worldSize.height}px`,
            transform: `scale(${scale})`,
            transformOrigin: '0 0',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
