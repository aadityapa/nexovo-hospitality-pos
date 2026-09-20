/** Client-side CSV export of a flat row array (report tables). RFC 4180 quoting. */
export function downloadCsv<T extends object>(name: string, data: T[]): void {
  if (!data.length) return;
  const rows = data as unknown as Record<string, unknown>[];
  const head = Object.keys(rows[0]).filter((h) => typeof rows[0][h] !== 'object' || rows[0][h] === null);
  const cell = (v: unknown) => (v == null ? '' : typeof v === 'number' ? String(v) : `"${String(v).replace(/"/g, '""')}"`);
  const csv = [head.join(','), ...rows.map((r) => head.map((h) => cell(r[h])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
