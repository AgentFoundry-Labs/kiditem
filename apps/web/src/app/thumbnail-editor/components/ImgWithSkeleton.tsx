'use client';

import { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  src: string;
  alt: string;
  className?: string;
  /** object-fit on the actual <img>. */
  fit?: 'cover' | 'contain';
  /** Prioritize fetch for above-the-fold images (result panel, product slot). */
  priority?: boolean;
  /** Native lazy loading. Applied only when priority=false. */
  lazy?: boolean;
  /** Hint for responsive sizing. */
  sizes?: string;
  referrerPolicy?: 'no-referrer' | 'origin' | 'unsafe-url';
  draggable?: boolean;
  onClick?: (e: React.MouseEvent<HTMLImageElement>) => void;
}

/**
 * <img> + shimmer skeleton + error fallback.
 *
 * - While decoding: animated shimmer overlay covers the image.
 * - On load: fades in (opacity 0 → 1, 150ms).
 * - On error: shows an "image unavailable" placeholder.
 * - Cached hits: skeleton skipped (image `complete && naturalHeight > 0` on mount).
 */
export function ImgWithSkeleton({
  src,
  alt,
  className,
  fit = 'cover',
  priority = false,
  lazy = true,
  sizes,
  referrerPolicy = 'no-referrer',
  draggable = false,
  onClick,
}: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  // Reset state whenever the src changes.
  useEffect(() => {
    setState('loading');
  }, [src]);

  // If the browser already has the image cached, onLoad may fire before we attach
  // the listener. Check `complete` on mount.
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.complete && img.naturalHeight > 0) {
      setState('ready');
    }
  }, [src]);

  if (state === 'error') {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center w-full h-full bg-slate-100 text-slate-400',
          className,
        )}
      >
        <ImageOff size={20} className="mb-1 opacity-60" />
        <span className="text-[10px]">불러오기 실패</span>
      </div>
    );
  }

  return (
    <div className={cn('relative w-full h-full overflow-hidden bg-slate-100', className)}>
      {state === 'loading' && (
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 bg-[length:200%_100%] animate-[shimmer_1.4s_ease-in-out_infinite]"
        />
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        sizes={sizes}
        loading={priority ? 'eager' : lazy ? 'lazy' : 'eager'}
        decoding="async"
        // fetchpriority is valid on modern browsers; React passes it through as `fetchPriority` (camelCase).
        // `any` cast to quiet TS for older RN types; runtime is fine.
        fetchPriority={priority ? 'high' : 'auto'}
        referrerPolicy={referrerPolicy}
        draggable={draggable}
        onClick={onClick}
        onLoad={() => setState('ready')}
        onError={() => setState('error')}
        className={cn(
          'w-full h-full transition-opacity duration-150',
          fit === 'cover' ? 'object-cover' : 'object-contain',
          state === 'ready' ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
}
