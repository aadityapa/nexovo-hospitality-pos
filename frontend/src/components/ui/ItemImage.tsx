import { useState } from 'react';
import { cn } from '@/utils/cn';
import { DishArt, dishKindFor, type DishKind } from '@/components/graphics';

/**
 * Menu photography, with a drawing behind it.
 *
 * Venues rarely photograph the whole menu, and the reference boards are image-led: the menu grid,
 * the offers list, the recipe table and the order lines are all carried by a picture. A grey tile
 * with a fork glyph in it — which is what this used to fall back to — turns those screens back
 * into a spreadsheet.
 *
 * So a missing or broken image becomes a DRAWING of the dish rather than an absence: typed by the
 * item's station and category, varied deterministically by its name, and identical everywhere the
 * item appears. It is unmistakably an illustration, so nothing here is passed off as a photograph
 * of this venue's food.
 *
 * A real `imageUrl` always wins. When one is set and then fails to load, the drawing takes over
 * with no layout shift, because both occupy the same box.
 */
export function ItemImage({ src, alt, prepLocation, category, kind, className, rounded = 'rounded-sm' }: {
  src?: string | null;
  alt: string;
  prepLocation?: 'KITCHEN' | 'BAR' | null;
  /** The item's category name, which sharpens the drawing (a "Breads" item gets bread). */
  category?: string | null;
  /** Force a drawing, when the caller knows better than the name does. */
  kind?: DishKind;
  className?: string;
  rounded?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={cn('overflow-hidden bg-neutral-100 ring-1 ring-inset ring-neutral-200', rounded, className)} aria-hidden>
        <DishArt name={alt} kind={kind ?? dishKindFor(alt, { prepLocation, category })} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      /* The same tile colour sits behind the photo, so a slow or transparent image never flashes
         a bright rectangle on the dark grid. */
      className={cn('object-cover bg-neutral-100', rounded, className)}
    />
  );
}
