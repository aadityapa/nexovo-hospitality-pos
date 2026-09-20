import { useState } from 'react';
import { UtensilsCrossed, Wine } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Menu photography with a graceful fallback.
 *
 * Venues rarely photograph the whole menu, and a broken image icon on a guest-facing
 * screen looks careless — so a missing or failed image becomes a neutral tile with the
 * station's icon, keeping the grid rhythm intact.
 */
export function ItemImage({ src, alt, prepLocation, className, rounded = 'rounded-sm' }: {
  src?: string | null;
  alt: string;
  prepLocation?: 'KITCHEN' | 'BAR';
  className?: string;
  rounded?: string;
}) {
  const [failed, setFailed] = useState(false);
  const Icon = prepLocation === 'BAR' ? Wine : UtensilsCrossed;

  if (!src || failed) {
    return (
      <div className={cn('bg-neutral-100 flex items-center justify-center text-neutral-300', rounded, className)} aria-hidden>
        <Icon className="h-1/3 w-1/3 max-h-8 max-w-8 min-h-4 min-w-4" />
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
      className={cn('object-cover bg-neutral-100', rounded, className)}
    />
  );
}
