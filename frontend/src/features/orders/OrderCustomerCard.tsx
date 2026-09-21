import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, UserMinus, Star, ExternalLink, Search, Lock, Phone, RotateCw } from 'lucide-react';
import { useCustomers, useLoyaltyAccount, useCrmMutations } from '@/features/p2/hooks';
import { CustomerForm } from '@/features/crm/CustomersPage';
import { usePermission } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useRealtime';
import { Card, CardHeader, Button, SearchInput, Avatar, Badge, LoadingState, ErrorState, Skeleton } from '@/components/ui';
import { money } from '@/utils/money';
import type { Order, Customer } from '@/types';

/**
 * Attach / detach a CRM customer on an order (waiter, cashier, manager).
 *
 * Linked, the card answers the two things staff act on: who the guest is, and whether their
 * points are usable on this bill. Unlinked, it says what linking buys and offers the one
 * control that does it. Everything shown comes from data this card already loads.
 */
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

  const acct = loyalty.data;
  const shortBy = acct ? Math.max(0, acct.minRedeemPoints - acct.pointsBalance) : 0;

  return (
    <Card padded={false}>
      <CardHeader
        className="p-4 pb-0 mb-0"
        title={<span className="text-sm font-semibold text-neutral-900">Guest</span>}
        action={!locked && order.customerId
          ? <Button size="sm" variant="ghost" className="min-h-touch" leftIcon={<UserMinus className="h-4 w-4" />} loading={attachToOrder.isPending} onClick={() => void attach(null)}>Unlink</Button>
          : undefined}
      />

      <div className="px-4 pb-4 mt-3">
        {order.customerId ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Avatar name={order.customerName ?? 'Guest'} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-neutral-900 truncate">{order.customerName ?? `Customer #${order.customerId}`}</p>
                {acct && (
                  <p className="text-caption text-neutral-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                    {/* Violet is reserved for VIP classification; a loyalty tier is emphasis,
                        so it takes the gold `primary` tone. */}
                    <Badge tone="primary" size="sm" icon={<Star className="h-3 w-3" aria-hidden />}>{acct.tier}</Badge>
                    <span className="tnum">{acct.pointsBalance} pts</span>
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="min-h-touch"
                aria-label={`Open profile for ${order.customerName ?? 'this guest'}`}
                onClick={() => navigate(`/admin/customers/${order.customerId}`)}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>

            {loyalty.isLoading && <Skeleton className="h-16" />}

            {loyalty.isError && (
              <p className="flex items-center justify-between gap-2 text-caption text-neutral-500">
                <span>Loyalty balance could not be loaded.</span>
                <Button size="sm" variant="ghost" className="min-h-touch" leftIcon={<RotateCw className="h-3.5 w-3.5" />} onClick={() => void loyalty.refetch()}>Retry</Button>
              </p>
            )}

            {acct && (
              <div className="well px-3 py-2.5">
                <p className="flex items-baseline justify-between gap-2">
                  <span className="text-label uppercase text-neutral-500">Points balance</span>
                  <span className="font-semibold tnum text-neutral-900">{acct.pointsBalance}</span>
                </p>
                <p className="flex items-baseline justify-between gap-2 mt-1">
                  <span className="text-caption text-neutral-500">Worth</span>
                  <span className="text-caption tnum text-neutral-700">{money(acct.balanceValue)}</span>
                </p>
                <p className="mt-2 text-caption leading-relaxed">
                  {shortBy === 0
                    ? <span className="text-success-700 font-medium">Redeemable on this bill — up to {acct.maxRedeemPercent}% of the total.</span>
                    : <span className="text-neutral-500">{shortBy} more point{shortBy === 1 ? '' : 's'} needed before they can redeem ({acct.minRedeemPoints} minimum).</span>}
                </p>
              </div>
            )}

            <p className="text-caption text-neutral-500 leading-relaxed">
              {locked ? 'This order is closed — the guest link can no longer be changed.' : 'Points are credited when the cashier closes the bill.'}
            </p>
          </div>
        ) : locked ? (
          <p className="text-sm text-neutral-500 flex items-start gap-2">
            <Lock className="h-4 w-4 mt-0.5 shrink-0 text-neutral-400" aria-hidden />
            <span>No guest was linked, and this order is closed.</span>
          </p>
        ) : picking ? (
          <div>
            <SearchInput autoFocus value={search} onChange={setSearch} placeholder="Name or phone" />
            <div className="mt-2 max-h-56 overflow-y-auto border border-neutral-200 rounded-sm">
              {results.isLoading ? (
                <div className="p-3"><LoadingState rows={2} /></div>
              ) : results.isError ? (
                <ErrorState compact error={results.error} onRetry={() => void results.refetch()} title="Guest search failed" />
              ) : (results.data ?? []).length === 0 ? (
                <p className="p-3 text-sm text-neutral-500">
                  {dq ? `No guest matches “${search}”.` : 'Start typing a name or phone number.'}
                  {canManage && dq ? ' Create a new profile below.' : ''}
                </p>
              ) : (
                <ul className="divide-y divide-neutral-200">
                  {(results.data ?? []).map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => void attach(c)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm min-h-touch hover:bg-neutral-100 transition-colors duration-control"
                      >
                        <Avatar name={c.fullName} size="sm" />
                        <span className="flex-1 min-w-0">
                          <span className="block font-medium truncate text-neutral-900">{c.fullName}</span>
                          <span className="block text-caption text-neutral-500 truncate">
                            <Phone className="inline h-3 w-3 -mt-0.5 mr-0.5" aria-hidden />{c.phone} · {c.totalVisits} visit{c.totalVisits === 1 ? '' : 's'} · {c.loyaltyPoints} pts
                          </span>
                        </span>
                        {c.loyaltyTier && <Badge tone="primary" size="sm">{c.loyaltyTier}</Badge>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {canManage && <Button size="sm" variant="outline" className="min-h-touch" leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setCreating(true)}>New guest</Button>}
              <Button size="sm" variant="ghost" className="min-h-touch" onClick={() => { setPicking(false); setSearch(''); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-neutral-600 mb-3 leading-relaxed">
              Link the guest to credit loyalty points when the bill closes, let them redeem on this visit, and keep their history.
            </p>
            <Button variant="outline" block className="min-h-touch" leftIcon={<Search className="h-4 w-4" />} onClick={() => setPicking(true)}>Find guest</Button>
          </div>
        )}
      </div>

      {creating && <CustomerForm editing={null} initialName={search} onClose={() => setCreating(false)} onSaved={(c) => void attach(c)} />}
    </Card>
  );
}
