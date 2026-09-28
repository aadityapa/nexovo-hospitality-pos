# Imagery — sources, licences and the audit

## Where pictures come from, and where they live

Every photograph the product shows is a **local file** under `frontend/public/img/`, served by
Vite at `/img/...`. The running application never requests an image from the internet.

The files are put there by `frontend/scripts/fetch-assets.mjs` from the sources listed in
`frontend/assets.manifest.json`. The script runs automatically at the start of `npm run dev` and
`npm run build` (a Vite plugin in `vite.config.ts`), from the three `.bat` scripts, or by hand
(`npm run assets`, `npm run assets:check`). It is idempotent and never fatal: offline, the slots
render their drawn understudies and the console says which files are missing.

Sources and licences:

| Source | Licence | Attribution |
|---|---|---|
| Pexels | [Pexels License](https://www.pexels.com/license/) — free for commercial use, modification allowed | not required |
| Unsplash | [Unsplash License](https://unsplash.com/license) — free for commercial use, modification allowed | not required |

Google Images and Pinterest were deliberately **not** used as sources: the images they surface
belong to whoever posted them and carry no licence a business can rely on. Both sites were
browsed in the built-in browser only to confirm what a dish should look like.

## What was found when the existing pictures were checked

The seed data already carried 33 hot-linked `images.unsplash.com` URLs. Every one was opened
and compared with the record it was attached to. Nine were wrong or dead:

| Item | What the old picture showed | Now |
|---|---|---|
| Chilli Chicken | Fried rice | Dry chilli chicken (Unsplash) |
| Veg Manchurian | An unrelated noodle dish | Vegetarian manchurian in dark sauce (Pexels) |
| Dal Makhani | A whole thali | Dal makhani in a brass pan (Pexels) |
| Garlic Naan | **Samosas** | Garlic naan (Pexels) |
| Gulab Jamun | **404 — the URL was dead** | Gulab jamun in a brass dish (Pexels) |
| Blue Lagoon | A **red** cocktail | Blue cocktail with lime on black (Pexels) |
| Long Island Iced Tea | Whisky poured into a rocks glass | Tall cola-coloured long drink with lemon (Pexels) |
| House White (glass) | **404 — the URL was dead** | White wine glass in a warm room (Pexels) |
| Single Malt (Glenfiddich 12) | A **Jack Daniel's** bottle | Glenfiddich bottle and glass on black (Pexels) |

Two more were improved rather than wrong (a beef-looking burger as "Chicken Burger" → a crispy
chicken burger; a row of three cocktails as "Virgin Mojito" → one tall mojito), one brand was
made accurate (a generic lager mug as "Kingfisher Premium" → a Kingfisher bottle with its pour),
and three records that had no picture were given one (Mineral Water — unbranded bottles; Grey
Goose 30 ml; the two bottle-service bottles, using the Jack Daniel's photo the seed had
mislabelled and a Grey Goose bottle). The remaining 21 matched their dish and were kept, now as
local files.

Four venue photographs were added: the room (a dark bar under brass pendant globes — login
backdrop, rail venue card, manager/host/club banner) and one per seeded floor (Main Dining, Bar
Area, VIP Lounge).

### Found in the screenshot review (25-09-2026)

The first Jack Daniel's bottle-service picture was reused from the seed. On the rendered bottle
card its label read **Tennessee Honey**, a different product from the "Jack Daniel's 750ml" the
record sells. It was replaced with a classic Old No. 7 bottle photographed on black (Pexels
27393241). A contact sheet of all 42 local files was then checked by eye against their labels;
the rest match.

### Real photos everywhere (25-09-2026, second pass)

15 more photographs (Pexels) take the total to **57**:

- **Stock items (14 new):** chicken breast, brioche bun, cheddar, onion, iceberg lettuce, mayonnaise,
  potato, mint, lime, soda water, craft IPA bottle, butter, chicken curry cut and takeaway box. Jack
  Daniel's, Grey Goose and Kingfisher reuse their bottle photos.
- **Hyderabad branch (1 new):** a warmly lit dining room.
- **Menu categories:** each shows the photo of one of its own dishes (Starters → Paneer Tikka, and
  so on), so a category tile can only ever show something the venue sells.
- **Offers:** each shows a photo of something it actually discounts.
- **Recipes:** each shows its dish's own menu photo.

**The one exception is White rum 750ml, which keeps its drawn bottle.** Every free-licence rum
photograph I could find was a branded golden rum (Contrabando, The Real McCoy), and showing one
would misrepresent what is on the shelf.

## What is still drawn, and why

- **Menu categories** — no photograph is attached to a category; the `CategoryGlyph` tile stands.
- **Offers** — an offer has no image field; the deterministic `DishArt` stands.
- **Guests, staff, suppliers** — record avatars are initials by design; no faces were sourced.
- **Any record created after seeding** without an `imageUrl` — `DishArt`/`BottleArt`.

Every consumer renders through `Photo` (`components/graphics/Photo.tsx`) or `ItemImage`, so a
missing or failed file shows the drawing, never a broken-image glyph.

## Adding or replacing a picture

1. Add an entry to `frontend/assets.manifest.json` with `file`, `source`, `licence` and a
   one-line `depicts` written **after** opening the source and checking it against the record.
2. `npm run assets` (or start the dev server).
3. Point the record at it: seeded menu items use `menuImage('<CODE>')` in
   `services/api/mock/db.ts`; floors are keyed by floor code in `config/imagery.ts`.
