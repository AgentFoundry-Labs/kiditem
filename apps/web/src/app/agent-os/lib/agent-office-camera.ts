export interface OfficeSize {
  width: number;
  height: number;
}

export interface OfficeCameraPoint {
  x: number;
  y: number;
}

export interface OfficeCameraTransform extends OfficeCameraPoint {
  scale: number;
}

export interface OfficeCameraLimits {
  minScale: number;
  maxScale: number;
}

export const OFFICE_MAX_ZOOM_MULTIPLIER = 1.8 as const;
export const OFFICE_PAN_OVERSCROLL_RATIO = 0.12 as const;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function axisBounds(input: {
  viewportLength: number;
  worldLength: number;
  scale: number;
}) {
  const scaledWorldLength = input.worldLength * input.scale;
  const centered = (input.viewportLength - scaledWorldLength) / 2;
  const halfOverflow = Math.max(
    0,
    (scaledWorldLength - input.viewportLength) / 2,
  );
  const travel =
    halfOverflow + input.viewportLength * OFFICE_PAN_OVERSCROLL_RATIO;

  return {
    minimum: centered - travel,
    maximum: centered + travel,
  };
}

export function getOfficeCameraLimits({
  viewport,
  world,
}: {
  viewport: OfficeSize;
  world: OfficeSize;
}): OfficeCameraLimits {
  if (
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    world.width <= 0 ||
    world.height <= 0
  ) {
    return { minScale: 1, maxScale: OFFICE_MAX_ZOOM_MULTIPLIER };
  }

  const minScale = Math.min(
    viewport.width / world.width,
    viewport.height / world.height,
  );

  return {
    minScale,
    maxScale: minScale * OFFICE_MAX_ZOOM_MULTIPLIER,
  };
}

export function createInitialOfficeCamera({
  viewport,
  world,
}: {
  viewport: OfficeSize;
  world: OfficeSize;
}): OfficeCameraTransform {
  const { minScale } = getOfficeCameraLimits({ viewport, world });

  return {
    x: (viewport.width - world.width * minScale) / 2,
    y: (viewport.height - world.height * minScale) / 2,
    scale: minScale,
  };
}

export function clampOfficeCamera({
  transform,
  viewport,
  world,
}: {
  transform: OfficeCameraTransform;
  viewport: OfficeSize;
  world: OfficeSize;
}): OfficeCameraTransform {
  const limits = getOfficeCameraLimits({ viewport, world });
  const scale = clamp(transform.scale, limits.minScale, limits.maxScale);
  const xBounds = axisBounds({
    viewportLength: viewport.width,
    worldLength: world.width,
    scale,
  });
  const yBounds = axisBounds({
    viewportLength: viewport.height,
    worldLength: world.height,
    scale,
  });

  return {
    x: clamp(transform.x, xBounds.minimum, xBounds.maximum),
    y: clamp(transform.y, yBounds.minimum, yBounds.maximum),
    scale,
  };
}

export function panOfficeCamera({
  transform,
  delta,
  viewport,
  world,
}: {
  transform: OfficeCameraTransform;
  delta: OfficeCameraPoint;
  viewport: OfficeSize;
  world: OfficeSize;
}): OfficeCameraTransform {
  return clampOfficeCamera({
    transform: {
      x: transform.x + delta.x,
      y: transform.y + delta.y,
      scale: transform.scale,
    },
    viewport,
    world,
  });
}

export function zoomOfficeCameraAt({
  transform,
  anchor,
  scaleFactor,
  viewport,
  world,
}: {
  transform: OfficeCameraTransform;
  anchor: OfficeCameraPoint;
  scaleFactor: number;
  viewport: OfficeSize;
  world: OfficeSize;
}): OfficeCameraTransform {
  const limits = getOfficeCameraLimits({ viewport, world });
  const nextScale = clamp(
    transform.scale * scaleFactor,
    limits.minScale,
    limits.maxScale,
  );

  if (nextScale === transform.scale) return transform;

  const worldAnchor = {
    x: (anchor.x - transform.x) / transform.scale,
    y: (anchor.y - transform.y) / transform.scale,
  };

  return clampOfficeCamera({
    transform: {
      x: anchor.x - worldAnchor.x * nextScale,
      y: anchor.y - worldAnchor.y * nextScale,
      scale: nextScale,
    },
    viewport,
    world,
  });
}
