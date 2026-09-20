import { DisplayBoard } from '@/features/kitchen/DisplayBoard';

/** Bar display: same operational board, fed only by BAR-routed items (server-side filter). */
export default function BarDisplayPage() {
  return <DisplayBoard location="BAR" />;
}
