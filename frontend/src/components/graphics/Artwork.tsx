import { cn } from '@/utils/cn';

/**
 * ORIGINAL ARTWORK
 * ================
 *
 * The reference boards are image-led — a menu grid, a recipe list, a bottle shelf and a row of
 * venue cards are mostly picture. This installation has no photography of its own, and the brief
 * is explicit that generated dishes must not be passed off as product photographs. So none of
 * this pretends to be a photograph: every tile below is drawn, in flat warm pigment, and reads as
 * an illustration at any size.
 *
 * Three properties make them usable as a photography substitute rather than as placeholders:
 *
 *   DETERMINISTIC — the variant is chosen by a hash of the item's own name, so Butter Chicken is
 *   the same picture on the menu grid, in the recipe list and on the order line, every session.
 *   A random tile would make the same dish look like three different dishes.
 *
 *   TYPED — a bowl for a curry, a flat plate for a grill, a glass for a drink, a slice for a
 *   dessert. The type comes from the station and the category the item actually carries, so the
 *   picture never contradicts the record.
 *
 *   FREE — no network request, no layout shift, no failure mode. An `<img>` that 404s leaves a
 *   hole in a grid; this cannot.
 *
 * Pigments come from the `--art-*` tokens (styles/index.css), which sit outside the interface
 * palette and do not follow the theme: saffron is saffron in both.
 */

/** Small, stable string hash. Deterministic across sessions and machines. */
export function seedOf(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const art = (name: string, alpha?: number) => `rgb(var(--art-${name})${alpha != null ? ` / ${alpha}` : ''})`;

export type DishKind = 'bowl' | 'plate' | 'grill' | 'bread' | 'dessert' | 'drink' | 'salad';

/** Which drawing suits this item, from what the record actually says about it. */
export function dishKindFor(name: string, opts?: { prepLocation?: 'KITCHEN' | 'BAR' | null; category?: string | null; isVeg?: boolean | null }): DishKind {
  const hay = `${name} ${opts?.category ?? ''}`.toLowerCase();
  if (opts?.prepLocation === 'BAR') return 'drink';
  if (/(coffee|tea|chai|juice|lassi|soda|water|mocktail|cocktail|shake|beer|wine|whisky|vodka|gin|rum)/.test(hay)) return 'drink';
  if (/(cake|dessert|ice ?cream|kulfi|brownie|pudding|halwa|gulab|pastry|tart)/.test(hay)) return 'dessert';
  if (/(naan|roti|bread|paratha|kulcha|baguette|bun|pizza|sandwich|burger|wrap)/.test(hay)) return 'bread';
  if (/(salad|slaw|greens|sprout)/.test(hay)) return 'salad';
  if (/(curry|masala|dal|gravy|soup|stew|korma|butter|makhani|rasam|sambar|ramen|noodle)/.test(hay)) return 'bowl';
  if (/(tikka|kebab|tandoor|grill|roast|steak|chop|seekh|BBQ|barbec)/i.test(hay)) return 'grill';
  return 'plate';
}

/* ------------------------------------------------------------------ the drawings */

function Ground({ seed }: { seed: number }) {
  /* Three warm grounds, rotated by seed, so a grid of twelve tiles is not twelve identical
     backgrounds. Each is a two-stop wash, dark enough that the food reads on top of it. */
  const g = seed % 3;
  const from = g === 0 ? art('char') : g === 1 ? art('shade') : art('sauce', 0.55);
  const to = g === 0 ? art('shade') : g === 1 ? art('char') : art('char');
  return (
    <>
      <defs>
        <linearGradient id={`g${seed}`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
        <radialGradient id={`l${seed}`} cx="0.3" cy="0.05" r="0.9">
          <stop offset="0" stopColor={art('crust', 0.3)} />
          <stop offset="1" stopColor="transparent" />
        </radialGradient>
      </defs>
      <rect width="160" height="120" fill={`url(#g${seed})`} />
      <rect width="160" height="120" fill={`url(#l${seed})`} />
    </>
  );
}

/** A plate or bowl, seen at a slight angle. */
function Vessel({ deep, seed }: { deep?: boolean; seed: number }) {
  return (
    <>
      <ellipse cx="80" cy="74" rx="47" ry="26" fill={art('shade', 0.45)} />
      <ellipse cx="80" cy="70" rx="46" ry="25" fill={art('plate')} />
      <ellipse cx="80" cy="70" rx="46" ry="25" fill="none" stroke={art('char', 0.25)} strokeWidth="1" />
      {deep
        ? <ellipse cx="80" cy="70" rx="33" ry="17" fill={art('char', 0.18)} />
        : <ellipse cx="80" cy="70" rx="35" ry="18" fill="none" stroke={art('char', 0.14)} strokeWidth="1" />}
      {/* One highlight on the rim, always from the same direction as the interface's gloss. */}
      <path d="M42 62 A 46 25 0 0 1 84 46" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="1.5" strokeLinecap="round" />
      <ellipse cx="80" cy="70" rx="46" ry="25" fill="none" stroke="#000" strokeOpacity="0.04" strokeWidth="6" />
      <text x="0" y="0" opacity="0" aria-hidden>{seed}</text>
    </>
  );
}

function Steam({ x }: { x: number }) {
  return (
    <path
      d={`M${x} 44 c 4 -6 -4 -9 0 -15 c 4 -6 -3 -9 0 -13`}
      fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="2" strokeLinecap="round"
    />
  );
}

function DishBody({ kind, seed }: { kind: DishKind; seed: number }) {
  const tilt = (seed % 5) - 2;
  switch (kind) {
    case 'bowl':
      return (
        <g>
          <Vessel deep seed={seed} />
          <ellipse cx="80" cy="69" rx="30" ry="15" fill={art('sauce')} />
          <ellipse cx="74" cy="66" rx="9" ry="4.5" fill={art('cream', 0.85)} />
          <circle cx="88" cy="71" r="4" fill={art('crust')} />
          <circle cx="94" cy="66" r="3" fill={art('crust', 0.8)} />
          <path d="M66 73 q 6 -4 12 0" stroke={art('herb')} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <Steam x={72} /><Steam x={90} />
        </g>
      );
    case 'grill':
      return (
        <g>
          <Vessel seed={seed} />
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`rotate(${tilt + i * 6} 80 70)`}>
              <rect x={58 + i * 15} y={60} width="13" height="20" rx="5" fill={art('char')} />
              <rect x={58 + i * 15} y={60} width="13" height="20" rx="5" fill={art('sauce', 0.55)} />
              <path d={`M${58 + i * 15} 66 h 13 M${58 + i * 15} 73 h 13`} stroke={art('shade', 0.55)} strokeWidth="1.5" />
            </g>
          ))}
          <path d="M62 80 q 8 -5 16 0" stroke={art('herb')} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'bread':
      return (
        <g>
          <Vessel seed={seed} />
          <g transform={`rotate(${tilt} 80 70)`}>
            <path d="M54 70 q 26 -20 52 0 q -26 14 -52 0 z" fill={art('crust')} />
            <path d="M60 68 q 20 -12 40 0" fill="none" stroke={art('char', 0.35)} strokeWidth="1.5" />
            <circle cx="72" cy="64" r="1.6" fill={art('char', 0.5)} />
            <circle cx="88" cy="66" r="1.4" fill={art('char', 0.5)} />
          </g>
          <path d="M100 76 q 6 -4 12 -1" stroke={art('herb')} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'dessert':
      return (
        <g>
          <Vessel seed={seed} />
          <path d="M64 72 l 8 -22 h 16 l 8 22 z" fill={art('cream')} />
          <path d="M64 72 l 8 -22 h 16 l 8 22 z" fill={art('char', 0.12)} />
          <path d="M70 58 h 20 l 2 6 h -24 z" fill={art('sauce', 0.8)} />
          <circle cx="80" cy="48" r="4" fill={art('wine')} />
          <path d="M80 44 q 3 -4 6 -3" stroke={art('herb')} strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'salad':
      return (
        <g>
          <Vessel deep seed={seed} />
          {[0, 1, 2, 3, 4].map((i) => (
            <ellipse key={i} cx={64 + i * 8} cy={68 + ((i + seed) % 3) * 2} rx="8" ry="5"
              fill={art('herb', 0.55 + ((i + seed) % 3) * 0.15)} transform={`rotate(${(i * 37 + seed) % 60 - 30} ${64 + i * 8} 68)`} />
          ))}
          <circle cx="74" cy="66" r="3.5" fill={art('sauce')} />
          <circle cx="90" cy="70" r="3" fill={art('sauce', 0.8)} />
          <circle cx="82" cy="63" r="2.5" fill={art('cream')} />
        </g>
      );
    case 'drink':
      return (
        <g>
          <ellipse cx="80" cy="96" rx="26" ry="8" fill={art('shade', 0.5)} />
          <path d="M66 36 h 28 l -3 50 h -22 z" fill={art('glass', 0.28)} />
          <path d="M68 52 h 24 l -2.5 34 h -19 z" fill={art('crust', 0.85)} />
          <path d="M66 36 h 28 l -3 50 h -22 z" fill="none" stroke={art('glass', 0.7)} strokeWidth="1.5" />
          <rect x="72" y="86" width="16" height="4" rx="2" fill={art('glass', 0.5)} />
          <ellipse cx="80" cy="36" rx="14" ry="4" fill={art('glass', 0.55)} />
          <circle cx="75" cy="62" r="2" fill="#fff" fillOpacity="0.35" />
          <circle cx="86" cy="70" r="1.5" fill="#fff" fillOpacity="0.3" />
          <path d="M92 30 q 8 -6 14 -2" stroke={art('herb')} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </g>
      );
    default:
      return (
        <g>
          <Vessel seed={seed} />
          <ellipse cx="74" cy="68" rx="14" ry="9" fill={art('crust')} transform={`rotate(${tilt} 74 68)`} />
          <ellipse cx="94" cy="72" rx="9" ry="6" fill={art('herb', 0.8)} />
          <ellipse cx="88" cy="63" rx="7" ry="4.5" fill={art('sauce')} />
          <Steam x={80} />
        </g>
      );
  }
}

/**
 * A drawn dish tile. `name` is the item's own name and seeds the variation, so the same dish is
 * the same picture wherever it appears.
 */
export function DishArt({ name, kind, className }: { name: string; kind?: DishKind; className?: string }) {
  const seed = seedOf(name) % 997;
  const k = kind ?? dishKindFor(name);
  return (
    <svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice" className={cn('block h-full w-full', className)} role="presentation" aria-hidden focusable="false">
      <Ground seed={seed} />
      <DishBody kind={k} seed={seed} />
    </svg>
  );
}

/** A bottle, typed by what the record says it is. Used by bottle service and the bar. */
export function BottleArt({ name, category, className }: { name: string; category?: string | null; className?: string }) {
  const seed = seedOf(name) % 997;
  const hay = `${name} ${category ?? ''}`.toLowerCase();
  const sparkling = /(champagne|prosecco|cava|sparkl)/.test(hay);
  const clear = /(vodka|gin|tequila|white rum)/.test(hay);
  const body = sparkling ? art('herb', 0.55) : clear ? art('glass', 0.45) : /wine/.test(hay) ? art('wine') : art('char');
  const liquid = clear ? art('glass', 0.8) : sparkling ? art('crust', 0.9) : art('crust');
  return (
    <svg viewBox="0 0 120 200" preserveAspectRatio="xMidYMid meet" className={cn('block h-full w-full', className)} role="presentation" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`b${seed}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={body} stopOpacity="0.95" />
          <stop offset="0.35" stopColor={body} stopOpacity="0.65" />
          <stop offset="1" stopColor={body} stopOpacity="1" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="190" rx="30" ry="6" fill={art('shade', 0.35)} />
      {/* One silhouette: neck, shoulder, body. The shoulder curve is what makes a bottle a
          bottle, so it is a real cubic rather than a chamfer. */}
      <path
        d={sparkling
          ? 'M52 24 h16 v34 c 14 10 18 24 18 40 v70 a 10 10 0 0 1 -10 10 h-32 a 10 10 0 0 1 -10 -10 v-70 c 0 -16 4 -30 18 -40 z'
          : 'M52 26 h16 v30 c 16 6 20 20 20 36 v72 a 8 8 0 0 1 -8 8 h-40 a 8 8 0 0 1 -8 -8 v-72 c 0 -16 4 -30 20 -36 z'}
        fill={`url(#b${seed})`}
      />
      <path d="M40 120 h40 v48 a 6 6 0 0 1 -6 6 h-28 a 6 6 0 0 1 -6 -6 z" fill={liquid} opacity="0.55" />
      {/* Label — blank on purpose. It is a drawing of a bottle, not a counterfeit of a brand. */}
      <rect x="36" y="112" width="48" height="44" rx="3" fill={art('cream')} opacity="0.92" />
      <rect x="42" y="122" width="36" height="3" rx="1.5" fill={art('char', 0.45)} />
      <rect x="46" y="130" width="28" height="2.5" rx="1.25" fill={art('char', 0.28)} />
      <rect x="50" y="142" width="20" height="2.5" rx="1.25" fill={art('crust')} />
      <rect x="50" y="18" width="20" height="10" rx="2" fill={art('crust')} />
      <path d="M46 70 v90" stroke="#fff" strokeOpacity="0.25" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A venue interior — arches, pendants, a banquette. Used on branch and floor-area cards, where
 * the reference shows a photograph of the room.
 */
export function VenueArt({ name, className }: { name: string; className?: string }) {
  const seed = seedOf(name) % 997;
  const arches = 3 + (seed % 2);
  return (
    <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" className={cn('block h-full w-full', className)} role="presentation" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`v${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={art('char')} />
          <stop offset="1" stopColor={art('shade')} />
        </linearGradient>
        <radialGradient id={`vp${seed}`} cx="0.5" cy="0" r="1">
          <stop offset="0" stopColor={art('crust', 0.55)} />
          <stop offset="1" stopColor="transparent" />
        </radialGradient>
      </defs>
      <rect width="320" height="180" fill={`url(#v${seed})`} />
      {/* Back wall: a run of arched openings, warm behind them. */}
      {Array.from({ length: arches }).map((_, i) => {
        const w = 320 / arches;
        const x = i * w + w * 0.18;
        const aw = w * 0.64;
        return (
          <g key={i}>
            <path d={`M${x} 118 v-42 a ${aw / 2} ${aw / 2} 0 0 1 ${aw} 0 v42 z`} fill={art('crust', 0.16)} />
            <path d={`M${x} 118 v-42 a ${aw / 2} ${aw / 2} 0 0 1 ${aw} 0 v42`} fill="none" stroke={art('crust', 0.4)} strokeWidth="1.5" />
          </g>
        );
      })}
      {/* Pendants — the one thing that makes a drawn room read as a dining room. */}
      {[70, 160, 250].map((x, i) => (
        <g key={x}>
          <path d={`M${x} 0 v${22 + i * 6}`} stroke={art('crust', 0.5)} strokeWidth="1.5" />
          <path d={`M${x - 11} ${34 + i * 6} q 11 -16 22 0 z`} fill={art('crust')} />
          <circle cx={x} cy={44 + i * 6} r="18" fill={`url(#vp${seed})`} />
        </g>
      ))}
      {/* Banquette and table line across the foreground. */}
      <rect x="0" y="118" width="320" height="10" fill={art('wine', 0.55)} />
      <rect x="0" y="128" width="320" height="52" fill={art('shade')} />
      {[46, 136, 226].map((x) => (
        <g key={x}>
          <ellipse cx={x + 24} cy="150" rx="30" ry="9" fill={art('plate', 0.14)} />
          <rect x={x + 20} y="150" width="8" height="24" fill={art('char')} />
        </g>
      ))}
      <rect width="320" height="180" fill={art('shade', 0.25)} />
    </svg>
  );
}

/**
 * The login panel. The same room, drawn wide and lit — the one decorative full-bleed surface in
 * the product, and the only screen where nobody is mid-service.
 */
export function LoungeScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 640 900" preserveAspectRatio="xMidYMid slice" className={cn('block h-full w-full', className)} role="presentation" aria-hidden focusable="false">
      <defs>
        <linearGradient id="ls-room" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="rgb(32 22 16)" />
          <stop offset="0.55" stopColor="rgb(20 14 11)" />
          <stop offset="1" stopColor="rgb(12 9 8)" />
        </linearGradient>
        <radialGradient id="ls-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={art('crust', 0.85)} />
          <stop offset="0.45" stopColor={art('crust', 0.25)} />
          <stop offset="1" stopColor="transparent" />
        </radialGradient>
        <linearGradient id="ls-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgb(255 255 255 / 0.30)" />
          <stop offset="1" stopColor="rgb(255 255 255 / 0.06)" />
        </linearGradient>
      </defs>

      <rect width="640" height="900" fill="url(#ls-room)" />

      {/* Deep background: a run of arched windows with evening behind them. */}
      {[60, 240, 420].map((x) => (
        <g key={x}>
          <path d={`M${x} 470 v-190 a 80 80 0 0 1 160 0 v190 z`} fill={art('crust', 0.07)} />
          <path d={`M${x} 470 v-190 a 80 80 0 0 1 160 0 v190`} fill="none" stroke={art('crust', 0.22)} strokeWidth="2" />
          <path d={`M${x + 80} 200 v270 M${x} 330 h160`} stroke={art('crust', 0.14)} strokeWidth="1.5" />
        </g>
      ))}

      {/* Pendant lights at three depths — the bokeh of the reference photograph, drawn. */}
      {[[150, 250, 64], [330, 175, 92], [510, 285, 54]].map(([x, y, r]) => (
        <g key={`${x}-${y}`}>
          <path d={`M${x} 0 v${y - 34}`} stroke={art('crust', 0.35)} strokeWidth="2" />
          <path d={`M${x - 26} ${y - 2} q 26 -40 52 0 z`} fill={art('crust', 0.9)} />
          <circle cx={x} cy={y + 8} r={r} fill="url(#ls-glow)" />
          <circle cx={x} cy={y + 2} r="5" fill="rgb(255 244 222)" />
        </g>
      ))}

      {/* Banquette, then the table the composition sits on. */}
      <rect x="0" y="470" width="640" height="26" fill={art('wine', 0.5)} />
      <rect x="0" y="496" width="640" height="404" fill="rgb(16 11 9)" />
      <ellipse cx="320" cy="620" rx="330" ry="78" fill="rgb(38 26 19)" />
      <ellipse cx="320" cy="612" rx="326" ry="74" fill="rgb(52 36 26)" />

      {/* A laid table: two glasses, a folded napkin, a small vase, a candle. */}
      {[[210, 0], [268, 1]].map(([x, i]) => (
        <g key={x} transform={`translate(${x} 0)`}>
          <path d="M0 520 q 4 44 26 52 l 0 30 h -22 v8 h 52 v-8 h -22 l 0 -30 q 22 -8 26 -52 z" fill="url(#ls-glass)" />
          <path d="M4 556 q 22 16 48 0 l -4 -12 q -20 12 -40 0 z" fill={art('wine', i ? 0.75 : 0.55)} />
          <path d="M2 522 q 6 34 24 44" fill="none" stroke="rgb(255 255 255 / 0.45)" strokeWidth="2" strokeLinecap="round" />
        </g>
      ))}

      <g transform="translate(360 0)">
        <rect x="0" y="556" width="26" height="70" rx="4" fill={art('cream', 0.22)} />
        <path d="M13 556 q 18 -30 0 -62 q -18 32 0 62 z" fill={art('herb', 0.55)} />
        <path d="M13 500 v56" stroke={art('herb', 0.8)} strokeWidth="2" />
      </g>

      <g transform="translate(430 0)">
        <rect x="0" y="566" width="30" height="58" rx="6" fill={art('cream', 0.18)} />
        <circle cx="15" cy="560" r="11" fill="url(#ls-glow)" />
        <path d="M15 548 q 7 9 0 15 q -7 -6 0 -15z" fill="rgb(255 226 170)" />
      </g>

      {/* A folded napkin with a gold band — the one place the brand colour appears here. */}
      <g transform="translate(120 0)">
        <path d="M0 600 l 60 -14 l 8 28 l -60 14 z" fill={art('cream', 0.3)} />
        <path d="M18 592 l 60 -14" stroke={art('crust', 0.9)} strokeWidth="4" />
      </g>

      {/* Foreground vignette, so the form beside it stays the lit half of the composition. */}
      <rect width="640" height="900" fill="url(#ls-vig)" />
      <defs>
        <radialGradient id="ls-vig" cx="0.45" cy="0.4" r="0.85">
          <stop offset="0.35" stopColor="transparent" />
          <stop offset="1" stopColor="rgb(8 6 5 / 0.85)" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/**
 * Botanical corner ornament for the membership card. Drawn once, mirrored — a card that is the
 * same on both corners reads as printed rather than assembled.
 */
export function CardFiligree({ className }: { className?: string }) {
  const sprig = (
    <g fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <path d="M4 60 C 18 46 26 30 28 8" />
      {[10, 20, 30, 40].map((t, i) => (
        <g key={t}>
          <path d={`M${6 + i * 5.5} ${56 - i * 11} q 10 -6 16 -2 q -8 8 -16 2 z`} />
          <path d={`M${6 + i * 5.5} ${56 - i * 11} q -8 -8 -14 -6 q 6 9 14 6 z`} />
        </g>
      ))}
      <circle cx="28" cy="6" r="2.5" />
    </g>
  );
  return (
    <svg viewBox="0 0 320 120" className={cn('block h-full w-full', className)} role="presentation" aria-hidden focusable="false">
      <g transform="translate(6 52)">{sprig}</g>
      <g transform="translate(314 52) scale(-1 1)">{sprig}</g>
      <path d="M92 18 h136" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <path d="M92 102 h136" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <path d="M160 10 l 5 8 l -5 8 l -5 -8 z" fill="currentColor" opacity="0.7" />
      <path d="M160 94 l 5 8 l -5 8 l -5 -8 z" fill="currentColor" opacity="0.7" />
    </svg>
  );
}
