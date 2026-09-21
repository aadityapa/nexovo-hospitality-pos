import { useEffect, useState } from 'react';

/**
 * A media query as React state.
 *
 * The initial value is read synchronously in the state initialiser rather than in an effect, so
 * the first paint is already correct — a layout that decided its surface in an effect would
 * render charcoal for one frame and then flip to ivory, which is exactly the flash this system
 * exists to avoid.
 *
 * `matchMedia` is optional: the test environment does not always provide it, and neither does a
 * very old browser. Both fall back to `false`, which is the desktop-last branch everywhere it is
 * used, so nothing depends on the query existing.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    // Re-read on subscribe: the query may have changed between render and effect.
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** `lg` in the Tailwind config — the width at which the rail replaces the bottom navigation. */
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
