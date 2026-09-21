/**
 * Original Nexovo graphics — illustration, floor shapes and data marks.
 *
 * One barrel so a page imports art the same way it imports UI:
 *   import { EmptyPlate, StockLevel } from '@/components/graphics';
 *
 * Everything in here is drawn in this repository. No raster assets, no icon packs, no external
 * dependencies — inline SVG only, toned with `currentColor` so the art follows the theme.
 */
export {
  HospitalityScene,
  EmptyPlate, EmptyTable, EmptyBox, EmptyReceipt, EmptySearch, EmptyChart, EmptyGuest, EmptyBottle,
} from './Illustrations';

export { TableShape, tableShapeFor } from './TableShape';
export type { TableShapeProps, TableShapeKind } from './TableShape';

export { StockLevel, Sparkline, ProgressMeter } from './Indicators';
export type { StockLevelProps, SparklineProps, ProgressMeterProps } from './Indicators';

export { DishArt, BottleArt, VenueArt, LoungeScene, CardFiligree, dishKindFor, seedOf } from './Artwork';
export type { DishKind } from './Artwork';

export { CategoryGlyph, glyphFor } from './CategoryGlyph';
export type { GlyphName } from './CategoryGlyph';
