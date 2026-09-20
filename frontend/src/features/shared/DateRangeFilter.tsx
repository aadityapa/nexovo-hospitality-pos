import { useMemo, useState } from 'react';
import { SegmentedControl } from '@/components/ui';
import { rangeForPreset, todayInput } from '@/utils/date';
import type { DashboardPreset, DateRange } from '@/types';

export function useDateRange(initial: DashboardPreset = 'today') {
  const [preset, setPreset] = useState<DashboardPreset>(initial);
  const [custom, setCustom] = useState({ from: todayInput(), to: todayInput() });
  const range: DateRange = useMemo(() => rangeForPreset(preset, custom), [preset, custom]);
  return { preset, setPreset, custom, setCustom, range };
}

const OPTIONS: { value: DashboardPreset; label: string }[] = [
  { value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }, { value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }, { value: 'custom', label: 'Custom' },
];

export function DateRangeFilter({ state }: { state: ReturnType<typeof useDateRange> }) {
  const { preset, setPreset, custom, setCustom } = state;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl options={OPTIONS} value={preset} onChange={setPreset} size="sm" />
      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            aria-label="From date"
            value={custom.from}
            max={custom.to}
            onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
            className="input-base h-9 min-h-0 w-auto text-sm"
          />
          <span className="text-neutral-400 text-sm shrink-0">to</span>
          <input
            type="date"
            aria-label="To date"
            value={custom.to}
            min={custom.from}
            onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
            className="input-base h-9 min-h-0 w-auto text-sm"
          />
        </div>
      )}
    </div>
  );
}
