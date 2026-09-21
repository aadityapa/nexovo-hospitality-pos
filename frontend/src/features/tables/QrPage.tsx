import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { Download, Printer, RefreshCw, ExternalLink, Copy, TriangleAlert } from 'lucide-react';
import { useFloors, useTables, useTableMutations } from './hooks';
import { usePermission } from '@/hooks/useAuth';
import { useBranch } from '@/components/layout/Shell';
import { PageHeader, Button, IconButton, ConfirmDialog, LoadingState, ErrorState, EmptyState, Card, SearchInput, SegmentedControl, Badge } from '@/components/ui';
import { env } from '@/config/env';
import { toast } from '@/store/uiStore';
import type { DiningTable } from '@/types';

/**
 * Public menu URL — uses the opaque publicCode, never the DB id (Section 12).
 *
 * This is the value every QR on this page encodes, unchanged: the configured public application
 * address, the REAL branch code from `useBranch()`, and the table's own real `publicCode`. Nothing
 * on this screen draws a decorative pattern, and nothing shortens or rewrites this URL.
 */
export const menuUrlFor = (branchCode: string, t: DiningTable) => `${env.publicAppUrl}/menu/${branchCode}/${t.publicCode}`;

/** A phone on the venue's Wi-Fi cannot resolve localhost / 127.0.0.1 — it would hit the phone itself. */
const isLoopback = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url);

function ReachabilityNotice() {
  if (!isLoopback(env.publicAppUrl)) return null;
  return (
    <div className="mb-4 flex items-start gap-3 rounded-md border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700">
      <TriangleAlert className="h-5 w-5 shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold">These QR codes only work on this computer</p>
        <p className="mt-0.5">
          They point at <code className="font-mono">{env.publicAppUrl}</code>, and on a phone “localhost” means the phone itself.
          Open this app using your computer's network address instead — e.g. <code className="font-mono">http://192.168.1.5:5173</code>
          {' '}(run <code className="font-mono">ipconfig</code> to find it, or read it from the start.bat window) — then print the codes from there.
          A fixed public address can be set with <code className="font-mono">VITE_PUBLIC_APP_URL</code> in <code className="font-mono">frontend/.env</code>.
        </p>
      </div>
    </div>
  );
}

function QrCard({ table, branchCode, businessName, canManage, onRegenerate }: { table: DiningTable; branchCode: string; businessName: string; canManage: boolean; onRegenerate: () => void }) {
  const url = menuUrlFor(branchCode, table);
  const canvasRef = useRef<HTMLDivElement>(null);
  const download = () => {
    const canvas = canvasRef.current?.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = `qr-${table.number}.png`; a.click();
  };
  const print = () => {
    const w = window.open('', '_blank', 'width=480,height=640'); if (!w) return;
    const svg = canvasRef.current?.querySelector('svg')?.outerHTML ?? '';
    // Standalone print document — it cannot reach the app's stylesheet, so the tokens are inlined.
    // These hex values are DELIBERATELY light-theme: this window goes to a printer and ends up
    // as a card on a table, so it must stay dark ink on white paper regardless of the screen
    // theme. Do not "fix" them to the dark palette — that would print a black rectangle.
    w.document.write(`<html><head><title>QR ${table.name}</title><style>
      body{font-family:Inter,system-ui,Arial,sans-serif;text-align:center;padding:28px;color:#182230}
      h1{font-size:30px;margin:10px 0;letter-spacing:-0.02em}
      p{color:#667085;margin:4px 0}
      .venue{font-weight:600;color:#182230;letter-spacing:0.02em;text-transform:uppercase;font-size:13px}
      .cta{margin-top:14px;font-size:15px;color:#182230;font-weight:500}
      .url{font-size:10px;word-break:break-all;color:#98A2B3;margin-top:10px}
      svg{width:280px;height:280px}
    </style></head><body><p class="venue">${businessName}</p><h1>${table.name}</h1>${svg}<p class="cta">Scan to view our menu</p><p class="url">${url}</p><script>window.onload=()=>{window.print();window.close();}</script></body></html>`);
    w.document.close();
  };
  return (
    /* A printable card: the code, the table it belongs to, and the one instruction a guest needs. */
    <Card padded={false} className="h-full flex flex-col p-3 text-center min-w-0">
      {/*
        A QR code is dark-on-light or it does not scan, so the swatch behind it is the fixed
        `paper` token rather than a theme surface — stated explicitly so a future palette change
        cannot quietly break every printed code in the venue. This page is ivory, but the tile
        would be white on charcoal too.
      */}
      <div ref={canvasRef} className="w-full bg-paper rounded-md border border-neutral-200 p-2">
        <QRCodeSVG value={url} size={128} level="M" includeMargin={false} className="block h-auto w-full" />
        <div className="hidden"><QRCodeCanvas value={url} size={640} level="M" includeMargin /></div>
      </div>

      <h3 className="mt-2.5 font-semibold text-neutral-900 leading-tight break-words">{table.name}</h3>
      <p className="text-caption text-neutral-500">Scan to view menu</p>
      <p className="text-caption text-neutral-400 truncate">{table.floorName}</p>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-0.5">
        <IconButton size="sm" label={`Download the QR code for ${table.name} as a PNG`} onClick={download}>
          <Download className="h-4 w-4" />
        </IconButton>
        <IconButton size="sm" label={`Print the QR card for ${table.name}`} onClick={print}>
          <Printer className="h-4 w-4" />
        </IconButton>
        <IconButton size="sm" label={`Copy the menu link for ${table.name}`} onClick={() => { void navigator.clipboard?.writeText(url); toast.info('Link copied'); }}>
          <Copy className="h-4 w-4" />
        </IconButton>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open the public menu for ${table.name} in a new tab`}
          className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors duration-control touch-target"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
        {canManage && (
          <IconButton size="sm" className="text-warning-700" label={`Regenerate the QR code for ${table.name}`} onClick={onRegenerate}>
            <RefreshCw className="h-4 w-4" />
          </IconButton>
        )}
      </div>

      <div className="mt-2 pt-2 border-t border-neutral-200">
        <Badge size="sm">v{table.qrVersion}</Badge>
        <p className="mt-1 text-[11px] leading-tight text-neutral-500 break-all">{url}</p>
      </div>
    </Card>
  );
}

export default function QrPage() {
  const canManage = usePermission('qr:manage');
  const { data: branch } = useBranch();
  const floors = useFloors();
  const [params] = useSearchParams();
  const [floorId, setFloorId] = useState<number | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const tables = useTables({ floorId: floorId === 'ALL' ? undefined : floorId });
  const { regenerateQr } = useTableMutations();
  const [regen, setRegen] = useState<DiningTable | null>(null);
  const focus = Number(params.get('table'));
  const list = useMemo(() => (tables.data ?? []).filter((t) => (!focus || t.id === focus) && (!search || t.name.toLowerCase().includes(search.toLowerCase()) || t.number.toLowerCase().includes(search.toLowerCase()))), [tables.data, search, focus]);
  const printAll = () => window.print();

  return (
    <div>
      <PageHeader
        title="QR codes"
        subtitle="One unique code per table opens the public menu with the table pre-selected"
        actions={<Button variant="outline" leftIcon={<Printer className="h-4 w-4" />} onClick={printAll}>Print page</Button>}
      >
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          {/* Area tabs, counted from the branch's real area sizes. */}
          <SegmentedControl
            size="sm"
            ariaLabel="Filter QR codes by area"
            value={String(floorId)}
            onChange={(v) => setFloorId(v === 'ALL' ? 'ALL' : Number(v))}
            options={[
              { value: 'ALL', label: 'All areas', count: (floors.data ?? []).reduce((n, f) => n + (f.tableCount ?? 0), 0) || undefined },
              ...(floors.data ?? []).map((f) => ({ value: String(f.id), label: f.name, count: f.tableCount })),
            ]}
          />
          <SearchInput value={search} onChange={setSearch} placeholder="Find table" className="lg:w-56" />
        </div>
      </PageHeader>

      <ReachabilityNotice />

      {tables.isLoading && <LoadingState variant="cards" rows={3} />}
      {tables.isError && <ErrorState error={tables.error} onRetry={() => void tables.refetch()} />}

      {tables.data && branch && (list.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            compact
            title={search ? 'No tables match' : 'No tables in this area'}
            description="Every active table gets its own code as soon as it is created."
            action={search ? <Button variant="outline" onClick={() => setSearch('')}>Clear search</Button> : undefined}
          />
        </Card>
      ) : (
        <>
          <p className="mb-3 text-sm text-neutral-600">
            <span className="font-semibold text-neutral-900 tabular-nums">{list.length}</span> printable code{list.length === 1 ? '' : 's'}
          </p>
          {/* The reference sheet: two across on a phone, six on a wide screen. Every track is an
              explicit `grid-cols-N`, which Tailwind compiles to `repeat(N, minmax(0,1fr))`. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {list.map((t) => (
              <QrCard key={t.id} table={t} branchCode={branch.code} businessName={branch.businessName} canManage={canManage} onRegenerate={() => setRegen(t)} />
            ))}
          </div>
        </>
      ))}

      <ConfirmDialog open={!!regen} onClose={() => setRegen(null)} variant="warning" title={`Regenerate QR for ${regen?.name}?`} message="A new public code is issued. Previously printed QR codes for this table will stop working immediately." confirmLabel="Regenerate" loading={regenerateQr.isPending} onConfirm={async () => { if (regen) { try { await regenerateQr.mutateAsync(regen.id); } finally { setRegen(null); } } }} />
    </div>
  );
}
