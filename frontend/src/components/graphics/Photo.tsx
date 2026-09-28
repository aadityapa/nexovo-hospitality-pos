import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

/**
 * A PHOTOGRAPH WITH A DRAWN UNDERSTUDY.
 *
 * Renders `src` as a cover-fit picture; if the file is missing or fails to load, renders the
 * `fallback` (a `VenueArt`, a `LoungeScene`, a `BottleArt`) in its place — never a broken-image
 * glyph, never a blank. That is the contract every photograph in the product is shown under:
 * the pictures live in `public/img/` (see `config/imagery.ts`) and a checkout where the fetch
 * script has not run yet still looks composed.
 *
 * `fallback` is rendered UNDER the image while it loads, so the artwork is what shows for the
 * first few frames on a slow disk and the photo fades over it; the fade is 240 ms opacity only
 * and does not replay once loaded.
 */
export function Photo({ src, alt = '', fallback, className, imgClassName, priority }: {
  src?: string;
  alt?: string;
  fallback: ReactNode;
  className?: string;
  imgClassName?: string;
  /** Above-the-fold pictures (the login backdrop) load eagerly; everything else is lazy. */
  priority?: boolean;
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>(src ? 'loading' : 'failed');
  /* A new `src` is a new picture: start it loading again rather than keep the previous verdict
     (a card that gains a photo after mounting, or swaps to one that is missing). */
  useEffect(() => { setState(src ? 'loading' : 'failed'); }, [src]);
  return (
    <div className={cn('relative overflow-hidden', className)}>
      {state !== 'ready' && <div className="absolute inset-0">{fallback}</div>}
      {src && state !== 'failed' && (
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setState('ready')}
          onError={() => setState('failed')}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-overlay',
            state === 'ready' ? 'opacity-100' : 'opacity-0',
            imgClassName,
          )}
        />
      )}
    </div>
  );
}
