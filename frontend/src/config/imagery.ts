/**
 * PHOTOGRAPHY — where each picture lives.
 *
 * Every photograph the product shows is a LOCAL file under `public/img/`, put there by
 * `scripts/fetch-assets.mjs` from the sources recorded in `assets.manifest.json`. Nothing at
 * runtime reaches for an image on the internet: an outage, a rate limit or a changed URL at a
 * stock-photo host can therefore never blank a menu tile mid-service.
 *
 * Every consumer of these paths renders through a component with a drawn fallback (`ItemImage`
 * → `DishArt`; `Photo` → `VenueArt`, `LoungeScene` or `BottleArt`), so a missing file — a
 * checkout where the fetch script has not run yet — degrades to the artwork, never to a
 * broken-image glyph.
 *
 * Paths are built on `BASE_URL` so a deployment under a sub-path keeps working.
 */
const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');

/** Venue photographs, by their role. */
export const VENUE_IMG = {
  /** The room itself: login backdrop, the rail's venue card, the branch. */
  hero: `${base}img/venue/hero.jpg`,
} as const;

/** Floor photographs by floor CODE (the seed's `MAIN`, `BAR`, `VIP`). Unknown codes get none. */
const FLOOR_IMG: Record<string, string> = {
  MAIN: `${base}img/venue/main-dining.jpg`,
  BAR: `${base}img/venue/bar-area.jpg`,
  VIP: `${base}img/venue/vip-lounge.jpg`,
};

export function floorImage(code?: string | null): string | undefined {
  return code ? FLOOR_IMG[code.toUpperCase()] : undefined;
}

/**
 * Branch photographs by branch CODE. The flagship is the room on the login screen; the second
 * seeded branch (Hyderabad) has its own dining room. Unknown codes get none, and the card falls
 * back to the drawn room keyed off the branch's name.
 */
const BRANCH_IMG: Record<string, string> = {
  MAIN: `${base}img/venue/hero.jpg`,
  HYD: `${base}img/venue/hyderabad.jpg`,
};

export function branchImage(code?: string | null): string | undefined {
  return code ? BRANCH_IMG[code.toUpperCase()] : undefined;
}

/**
 * Stock-item photographs by inventory CODE. Items the venue also sells as a bottle reuse that
 * bottle's picture, so the same bottle looks the same on the shelf and on the menu.
 *
 * `RUM-WHT` (white rum) is deliberately ABSENT. Every free-licence rum photograph found showed a
 * branded golden rum, and showing one would misstate what is on the shelf, so that row keeps its
 * drawn bottle. Record the gap rather than fill it: see docs/IMAGERY.md.
 */
const STOCK_IMG: Record<string, string> = {
  'CHK-BRST': `${base}img/stock/chk-brst.jpg`,
  'BUN-BRIO': `${base}img/stock/bun-brio.jpg`,
  'CHS-SLC': `${base}img/stock/chs-slc.jpg`,
  ONION: `${base}img/stock/onion.jpg`,
  LETTUCE: `${base}img/stock/lettuce.jpg`,
  MAYO: `${base}img/stock/mayo.jpg`,
  POTATO: `${base}img/stock/potato.jpg`,
  MINT: `${base}img/stock/mint.jpg`,
  LIME: `${base}img/stock/lime.jpg`,
  SODA: `${base}img/stock/soda.jpg`,
  'JD-750': `${base}img/bottles/bs-jd.jpg`,
  'VODKA-GG': `${base}img/bottles/bs-gg.jpg`,
  'KF-650': `${base}img/menu/br01.jpg`,
  'IPA-330': `${base}img/stock/ipa-330.jpg`,
  BUTTER: `${base}img/stock/butter.jpg`,
  'CHK-CURRY': `${base}img/stock/chk-curry.jpg`,
  'BOX-TKA': `${base}img/stock/box-tka.jpg`,
};

export function stockImage(code?: string | null): string | undefined {
  return code ? STOCK_IMG[code.toUpperCase()] : undefined;
}

/** A menu item's photograph, keyed by its code — `ST01` → `/img/menu/st01.jpg`. */
export const menuImage = (code: string) => `${base}img/menu/${code.toLowerCase()}.jpg`;

/** A bottle-service bottle, keyed by its menu-item code — `BS-JD` → `/img/bottles/bs-jd.jpg`. */
export const bottleImage = (code: string) => `${base}img/bottles/${code.toLowerCase()}.jpg`;
