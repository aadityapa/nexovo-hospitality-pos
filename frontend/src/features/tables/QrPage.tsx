import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { Download, Printer, RefreshCw, ExternalLink, Copy, TriangleAlert } from 'lucide-react';
import { useFloors, useTables, useTableMutations } from './hooks';
import { usePermission } from '@/hooks/useAuth';
import { useBranch } from '@/components/layout/Shell';
import { PageHeader, Button, ConfirmDialog, LoadingState, ErrorState, Card, SearchInput, SegmentedControl, Badge } from '@/components/ui';
import { env } from '@/config/env';
import { toast } from '@/store/uiStore';
import type { DiningTable } from '@/types';

/** Public menu URL — uses the opaque publicCode, never the DB id (Section 12). */
export const menuUrlFor = (branchCode: string, t: DiningTable) => `${env.publicAppUrl}/menu/${branchCode}/${t.publicCode}`;

/** A phone on the venue's Wi-Fi cannot resolve localhost / 127.0.0.1 — it would hit the phone itself. */
const isLoopback = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url);

function ReachabilityNotice() {
  if (!isLoopback(env.publicAppUrl)) return null;
  return (
    <div className="mb-4 flex items-start gap-3 rounded-md border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800">
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
    <Card className="flex flex-col items-center text-center">
      <p className="text-caption text-neutral-500">{table.floorName}</p>
      <h3 className="text-subheading">{table.name}</h3>
      <div ref={canvasRef} className="mt-3 p-3 bg-white rounded-md border border-neutral-200">
        <QRCodeSVG value={url} size={160} level="M" includeMargin={false} />
        <div className="hidden"><QRCodeCanvas value={url} size={640} level="M" includeMargin /></div>
      </div>
      <p className="mt-2 text-caption text-neutral-500 break-all max-w-[220px]">{url}</p>
      <Badge size="sm" className="mt-1">v{table.qrVersion}</Badge>
      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
        <Button size="sm" variant="outline" leftIcon={<Download className="h-4 w-4" />} onClick={download}>PNG</Button>
        <Button size="sm" variant="outline" leftIcon={<Printer className="h-4 w-4" />} onClick={print}>Print</Button>
        <Button size="sm" variant="outline" leftIcon={<Copy className="h-4 w-4" />} onClick={() => { void navigator.clipboard?.writeText(url); toast.info('Link copied'); }}>Copy</Button>
        <a href={url} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost" leftIcon={<ExternalLink className="h-4 w-4" />}>Open</Button></a>
        {canManage && <Button size="sm" variant="ghost" className="text-warning-700" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={onRegenerate}>Regenerate</Button>}
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
      <PageHeader title="QR codes" subtitle="One unique code per table opens the public menu with the table pre-selected" actions={<Button variant="outline" leftIcon={<Printer className="h-4 w-4" />} onClick={printAll}>Print page</Button>}>
        <div className="flex flex-col lg:flex-row gap-3">
          <SegmentedControl size="sm" value={String(floorId)} onChange={(v) => setFloorId(v === 'ALL' ? 'ALL' : Number(v))} options={[{ value: 'ALL', label: 'All areas' }, ...(floors.data ?? []).map((f) => ({ value: String(f.id), label: f.name }))]} />
          <SearchInput value={search} onChange={setSearch} placeholder="Find table" className="lg:w-56" />
        </div>
      </PageHeader>
      <ReachabilityNotice />
      {tables.isLoading && <LoadingState variant="cards" rows={3} />}
      {tables.isError && <ErrorState error={tables.error} onRetry={() => void tables.refetch()} />}
      {tables.data && branch && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((t) => <QrCard key={t.id} table={t} branchCode={branch.code} businessName={branch.businessName} canManage={canManage} onRegenerate={() => setRegen(t)} />)}
        </div>
      )}
      <ConfirmDialog open={!!regen} onClose={() => setRegen(null)} variant="warning" title={`Regenerate QR for ${regen?.name}?`} message="A new public code is issued. Previously printed QR codes for this table will stop working immediately." confirmLabel="Regenerate" loading={regenerateQr.isPending} onConfirm={async () => { if (regen) { try { await regenerateQr.mutateAsync(regen.id); } finally { setRegen(null); } } }} />
    </div>
  );
}
