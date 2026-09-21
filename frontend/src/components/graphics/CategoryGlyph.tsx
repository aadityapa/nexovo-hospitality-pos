import { cn } from '@/utils/cn';

/**
 * MENU CATEGORY GLYPHS
 *
 * One family, drawn to one specification: 24-unit box, 1.5 stroke, round caps and joins, no fill,
 * `currentColor` throughout. The reference board's category cards are carried entirely by these —
 * eight tiles with nothing but an outline mark and a count — so they have to look like eight
 * members of one set rather than eight icons found separately. That is why they are drawn here
 * instead of picked out of the icon pack: the pack has a cloche and a soup bowl, but they are
 * drawn by different hands at different weights and it shows at this size.
 *
 * The mark is chosen from the category's own name. An unrecognised category gets the plate, which
 * is a real mark and not a fallback square.
 */

export type GlyphName =
  | 'starter' | 'main' | 'rice' | 'bread' | 'salad' | 'soup' | 'dessert' | 'drink'
  | 'grill' | 'seafood' | 'pizza' | 'plate';

const RULES: [RegExp, GlyphName][] = [
  [/(starter|appetis|appetiz|snack|small plate|tapas)/i, 'starter'],
  [/(main|entree|entrée|curry|course|special)/i, 'main'],
  [/(rice|biryani|pulao|noodle|pasta|grain)/i, 'rice'],
  [/(bread|naan|roti|baker|loaf)/i, 'bread'],
  [/(salad|greens|raita|side)/i, 'salad'],
  [/(soup|broth|shorba)/i, 'soup'],
  [/(dessert|sweet|ice ?cream|mithai|bake)/i, 'dessert'],
  [/(beverage|drink|coffee|tea|juice|bar|cocktail|mocktail|wine|spirit)/i, 'drink'],
  [/(grill|tandoor|kebab|barbec|bbq|roast)/i, 'grill'],
  [/(seafood|fish|prawn|crab)/i, 'seafood'],
  [/(pizza|italian)/i, 'pizza'],
];

export function glyphFor(categoryName: string): GlyphName {
  for (const [re, name] of RULES) if (re.test(categoryName)) return name;
  return 'plate';
}

/* Each path is drawn on the same 24 grid. Nothing here is filled — a filled mark in a set of
   outline marks is the one that looks like a mistake. */
const PATHS: Record<GlyphName, JSX.Element> = {
  starter: (
    <>
      <path d="M12 3c-3.2 2.4-4.6 5.4-4.2 9 .3 2.9 2.2 5.2 4.2 6.6 2-1.4 3.9-3.7 4.2-6.6.4-3.6-1-6.6-4.2-9Z" />
      <path d="M12 10.5v8.1" />
      <path d="M4 21h16" />
    </>
  ),
  main: (
    <>
      <path d="M3.5 15.5h17" />
      <path d="M5 15.5a7 7 0 0 1 14 0" />
      <path d="M12 5.5v3" />
      <circle cx="12" cy="4.4" r="1.1" />
      <path d="M2.5 19h19" />
    </>
  ),
  rice: (
    <>
      <path d="M3.5 11.5h17a8.5 8.5 0 0 1-8.5 8 8.5 8.5 0 0 1-8.5-8Z" />
      <path d="M8.5 8.2c.9-.8.9-1.9 0-2.7M12 7.6c.9-.8.9-2.3 0-3.1M15.5 8.2c.9-.8.9-1.9 0-2.7" />
      <path d="M2 21h20" />
    </>
  ),
  bread: (
    <>
      <path d="M4 13.2C4 9.8 7.6 7 12 7s8 2.8 8 6.2c0 1-.8 1.8-1.8 1.8H5.8A1.8 1.8 0 0 1 4 13.2Z" />
      <path d="M6.5 19h11" />
      <path d="M9 11.2c.9-.7 2-.7 2.9 0M14 12.4c.6-.5 1.3-.6 2-.3" />
    </>
  ),
  salad: (
    <>
      <path d="M3.5 12.5h17c0 4.1-3.8 7-8.5 7s-8.5-2.9-8.5-7Z" />
      <path d="M8 12.5c-.8-2 .2-4 2-4.7M12.4 12.5c-1.4-1.8-1-4.2.7-5.4M16.2 12.5c-.3-1.7.7-3.2 2.3-3.6" />
      <path d="M12 4.5v3" />
    </>
  ),
  soup: (
    <>
      <path d="M4 12h16a8 8 0 0 1-8 7.5A8 8 0 0 1 4 12Z" />
      <path d="M2.5 12h19" />
      <path d="M9 8.8c1.1-1 .2-2 .9-3.3M14.2 8.8c1.1-1 .2-2 .9-3.3" />
    </>
  ),
  dessert: (
    <>
      <path d="M5 13.5h14v5.2a1.3 1.3 0 0 1-1.3 1.3H6.3A1.3 1.3 0 0 1 5 18.7Z" />
      <path d="M5 13.5c0-3 3.1-5.2 7-5.2s7 2.2 7 5.2" />
      <path d="M12 8.3V5.6" />
      <circle cx="12" cy="4.4" r="1.1" />
      <path d="M8.2 16.6h7.6" />
    </>
  ),
  drink: (
    <>
      <path d="M6 4h12l-1.6 6.6A5 5 0 0 1 12 14a5 5 0 0 1-4.4-3.4Z" />
      <path d="M12 14v5.5" />
      <path d="M8.4 20h7.2" />
      <path d="M6.7 7.2h10.6" />
    </>
  ),
  grill: (
    <>
      <path d="M4.5 9.5h15" />
      <path d="M4.5 14h15" />
      <path d="M8 5.5v13M12 5.5v13M16 5.5v13" />
      <path d="M2.5 19.5h19" />
    </>
  ),
  seafood: (
    <>
      <path d="M3 12c3.4-4 7-6 10.6-6 2.6 0 4.7 1.2 6.4 3.4-1.7 2.2-3.8 3.4-6.4 3.4C10 12.8 6.4 10.8 3 12Z" />
      <path d="M3 12c3.4 4 7 6 10.6 6" />
      <path d="M20 14.6 22 12l-2-2.6" />
      <circle cx="16.4" cy="9.6" r=".9" />
    </>
  ),
  pizza: (
    <>
      <path d="M12 3.5 21 19a24 24 0 0 1-18 0Z" />
      <path d="M5.4 15.4a17 17 0 0 0 13.2 0" />
      <circle cx="12" cy="11" r="1" />
      <circle cx="9.4" cy="15.6" r="1" />
      <circle cx="14.6" cy="15.9" r="1" />
    </>
  ),
  plate: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="4.6" />
    </>
  ),
};

export function CategoryGlyph({ name, className }: { name: GlyphName | string; className?: string }) {
  const key = (name in PATHS ? name : glyphFor(String(name))) as GlyphName;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('h-6 w-6', className)}
      role="presentation"
      aria-hidden
      focusable="false"
    >
      {PATHS[key]}
    </svg>
  );
}
