import { money } from '@/utils/money';
import { fmtDate, fmtTime } from '@/utils/date';
import { PAYMENT_METHOD_LABELS } from '@/config/statuses';
import type { Receipt } from '@/types';

/**
 * Thermal-printer friendly receipt (80 mm). Rendered inside #receipt-print so the print
 * stylesheet in styles/index.css isolates it. Printer integration is abstracted (PrinterAdapter).
 */
export function ReceiptView({ receipt, id = 'receipt-print' }: { receipt: Receipt; id?: string }) {
  const { business, bill } = receipt;
  const line = (l: string, r: string, bold = false) => <div className={`flex justify-between gap-2 ${bold ? 'font-bold' : ''}`}><span>{l}</span><span className="tabular-nums whitespace-nowrap">{r}</span></div>;
  const m = (n: number) => money(n, { decimals: true }).replace('₹', 'Rs ');
  return (
    <div
      id={id}
      /* On screen this is a paper preview; the print stylesheet strips the frame and shadow. */
      className="mx-auto w-[80mm] max-w-full bg-white text-neutral-900 font-mono text-[12px] leading-[1.35] p-4 border border-neutral-200 rounded-sm shadow-card"
    >
      <div className="text-center">
        <p className="text-base font-bold uppercase tracking-wide">{business.name}</p>
        {business.branchName && <p>{business.branchName}</p>}
        {business.address && <p>{business.address}</p>}
        {business.phone && <p>Ph: {business.phone}</p>}
        {business.gstNumber && <p>GSTIN: {business.gstNumber}</p>}
      </div>
      <hr className="my-2 border-dashed border-neutral-400" />
      <p className="text-center font-bold">TAX INVOICE</p>
      {line('Bill No', bill.billNumber)}
      {line('Order', bill.orderNumber)}
      {line('Date', `${fmtDate(bill.finalizedAt ?? bill.createdAt)} ${fmtTime(bill.finalizedAt ?? bill.createdAt)}`)}
      {line('Table', bill.tableName)}
      {line('Waiter', bill.waiterName)}
      {line('Cashier', bill.cashierName)}
      {bill.customerName && line('Guest', bill.customerName)}
      <hr className="my-2 border-dashed border-neutral-400" />
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 font-bold"><span>Item</span><span className="text-right">Qty</span><span className="text-right">Amount</span></div>
      {bill.items.map((it) => (
        <div key={it.id} className="grid grid-cols-[1fr_auto_auto] gap-x-2">
          <span className="break-words">{it.itemName}<span className="block text-[10px] text-neutral-600">@ {m(it.unitPrice)}{it.discountAmount > 0 ? ` (offer −${m(it.discountAmount)})` : ''}</span></span>
          <span className="text-right tabular-nums">{it.quantity}</span><span className="text-right tabular-nums">{m(it.lineTotal)}</span>
        </div>
      ))}
      <hr className="my-2 border-dashed border-neutral-400" />
      {line('Subtotal', m(bill.subtotal))}
      {bill.itemDiscountTotal > 0 && line('Offer discount', `-${m(bill.itemDiscountTotal)}`)}
      {bill.orderDiscountTotal > 0 && line('Discount', `-${m(bill.orderDiscountTotal)}`)}
      {bill.serviceChargeAmount > 0 && line(`Service charge ${bill.serviceChargePercent}%`, m(bill.serviceChargeAmount))}
      {bill.taxLines.map((t) => <div key={`${t.code}${t.percent}`}>{line(`${t.name} @${t.percent}%`, m(t.amount))}</div>)}
      {(bill.minSpendShortfall ?? 0) > 0 && line('Min spend shortfall', m(bill.minSpendShortfall!))}
      {bill.roundOff !== 0 && line('Round off', m(bill.roundOff))}
      <hr className="my-2 border-dashed border-neutral-400" />
      <div className="text-base">{line('GRAND TOTAL', m(bill.grandTotal), true)}</div>
      <hr className="my-2 border-dashed border-neutral-400" />
      {bill.payments.filter((p) => p.status === 'SUCCESS').map((p) => <div key={p.id}>{line(`${PAYMENT_METHOD_LABELS[p.method]}${p.reference ? ` (${p.reference})` : ''}`, m(p.amount))}</div>)}
      {bill.paidAmount === 0 && line('Payment', 'UNPAID')}
      {bill.balanceDue > 0 && line('Balance due', m(bill.balanceDue), true)}
      {(bill.loyaltyPointsEarned ?? 0) > 0 && (
        <>
          <hr className="my-2 border-dashed border-neutral-400" />
          <p className="text-center">You earned {bill.loyaltyPointsEarned} loyalty points</p>
        </>
      )}
      <hr className="my-2 border-dashed border-neutral-400" />
      <p className="text-center">{business.footer ?? 'Thank you!'}</p>
      <p className="text-center text-[10px] text-neutral-500 mt-1">Printed {fmtDate(receipt.printedAt)} {fmtTime(receipt.printedAt)}</p>
    </div>
  );
}

/** Abstraction for future ESC/POS / network printer integration. */
export interface PrinterAdapter { print(receipt: Receipt): Promise<void> }
export const browserPrinter: PrinterAdapter = { print: async () => { window.print(); } };
