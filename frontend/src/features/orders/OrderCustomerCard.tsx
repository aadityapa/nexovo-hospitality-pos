import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, UserMinus, Star, ExternalLink, Search } from 'lucide-react';
import { useCustomers, useLoyaltyAccount, useCrmMutations } from '@/features/p2/hooks';
import { CustomerForm } from '@/features/crm/CustomersPage';
import { usePermission } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useRealtime';
import { Card, CardHeader, Button, SearchInput, Avatar, Badge, LoadingState } from '@/components/ui';
import { money } from '@/utils/money';
import type { Order, Customer } from '@/types';

/** Attach / detach a CRM customer on an order (waiter, cashier, manager). Loyalty balance is shown once linked. */
export function OrderCustomerCard({ order }: { order: Order }) {
  const navigate = useNavigate();
  const canView = usePermission('customers:view');
  const canManage = usePermission('customers:manage');
  const { attachToOrder } = useCrmMutations();
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 250);
  const [picking, setPicking] = useState(false);
  const [creating, setCreating] = useState(false);
  const results = useCustomers({ search: dq || undefined, limit: 8 });
  const loyalty = useLoyaltyAccount(order.customerId);
  const locked = ['PAID', 'COMPLETED', 'CANCELLED'].includes(order.status);
  if (!canView) return null;
  const attach = async (c: Customer | null) => { await attachToOrder.mutateAsync({ orderId: order.id, customerId: c?.id ?? null }); setPicking(false); setSearch(''); };
  return (
    <Card padded={false}>
      <CardHeader className="p-4 pb-0" title="Customer" action={!locked && order.customerId ? <Button size="sm" variant="ghost" leftIcon={<UserMinus className="h-4 w-4" />} loading={attachToOrder.isPending} onClick={() => void attach(null)}>Unlink</Button> : undefined} />
      <div className="px-4 pb-4 mt-2">
        {order.customerId ? (
          <div className="flex items-center gap-3">
            <Avatar name={order.customerName ?? 'Guest'} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{order.customerName ?? `Customer #${order.customerId}`}</p>
              {loyalty.data && <p className="text-caption text-neutral-500 flex items-center gap-1"><Star className="h-3 w-3 text-warning-500" />{loyalty.data.pointsBalance} pts (≈ {money(loyalty.data.balanceValue)}) · <Badge size="sm" tone="warning">{loyalty.data.tier}</Badge></p>}
            </div>
            <Button size="sm" variant="ghost" aria-label="Open profile" onClick={() => navigate(`/admin/customers/${order.customerId}`)}><ExternalLink className="h-4 w-4" /></Button>
          </div>
        ) : locked ? <p className="text-sm text-neutral-500">No customer linked.</p> : picking ? (
          <div>
            <SearchInput autoFocus value={search} onChange={setSearch} placeholder="Name or phone" />
            <div className="mt-2 max-h-56 overflow-y-auto divide-y divide-neutral-100 border border-neutral-200 rounded-sm">
              {results.isLoading ? <div className="p-3"><LoadingState rows={2} /></div> : (results.data ?? []).length === 0 ? <p className="p-3 text-sm text-neutral-500">No match{canManage ? ' — create a new profile below.' : '.'}</p> : (results.data ?? []).map((c) => (
                <button key={c.id} type="button" onClick={() => void attach(c)} className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50"><Avatar name={c.fullName} size="sm" /><span className="flex-1 min-w-0"><span className="block font-medium truncate">{c.fullName}</span><span className="text-caption text-neutral-500">{c.phone} · {c.totalVisits} visits · {c.loyaltyPoints} pts</span></span></button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">{canManage && <Button size="sm" variant="outline" leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setCreating(true)}>New customer</Button>}<Button size="sm" variant="ghost" onClick={() => { setPicking(false); setSearch(''); }}>Cancel</Button></div>
          </div>
        ) : (
          <div><p className="text-sm text-neutral-500 mb-2">Link a guest to earn loyalty points and build visit history.</p><Button size="sm" variant="outline" leftIcon={<Search className="h-4 w-4" />} onClick={() => setPicking(true)}>Find customer</Button></div>
        )}
      </div>
      {creating && <CustomerForm editing={null} initialName={search} onClose={() => setCreating(false)} onSaved={(c) => void attach(c)} />}
    </Card>
  );
}
