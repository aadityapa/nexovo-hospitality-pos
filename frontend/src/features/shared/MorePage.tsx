import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, LogOut, UserCircle, RotateCcw, SearchX } from 'lucide-react';
import { ADMIN_NAV } from '@/config/navigation';
import { useAuthStore } from '@/store/authStore';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useSurface';
import { PageHeader, Card, Avatar, Button, ConfirmDialog, SearchInput, EmptyState } from '@/components/ui';
import { Reveal, staggerDelay } from '@/components/motion';
import { ROLE_LABELS } from '@/config/permissions';
import { env } from '@/config/env';
import { resetDb } from '@/services/api/mock/db';

/**
 * "MORE" — the phone directory of every destination this account may reach.
 *
 * The list is DERIVED from `ADMIN_NAV`, which is itself derived from the rail, so a screen added
 * to the navigation appears here without anyone editing this file. Each item is then filtered by
 * the permission it declares: a destination the server would refuse is never drawn.
 *
 * Layout notes:
 *   • Two tiles per row from `xs` (420 px) up, one below — an explicit `minmax(0,1fr)` pair, never
 *     an implicit `auto` track, which sizes to min-content and pushes a tile past the viewport.
 *   • Every row is at least `min-h-touch` (44 px) tall; this screen is used one-handed.
 *   • The container carries `.pb-nav`, the shared rule, because this page sits directly above the
 *     bottom navigation. No hand-matched padding anywhere.
 */
/**
 * ONE LINE PER DESTINATION.
 *
 * The manager board draws each entry in this directory as a card carrying what the screen is for,
 * not just its name. That sentence is page copy, not data — there is no description field on a
 * navigation entry — so it lives here, keyed by the route it describes.
 *
 * It is a LOOKUP, never a second list: the directory itself is still derived from `ADMIN_NAV`, so
 * a screen added to the rail still appears here automatically. A route with no line here simply
 * shows its label, exactly as it does today.
 */
const SCREEN_NOTE: Record<string, string> = {
  '/admin': 'Today’s takings, covers and the trend behind them',
  '/host': 'Seat arrivals, work the waitlist and watch table availability',
  '/manager/live': 'Every open order with its own kitchen and bar progress',
  '/admin/orders': 'Every order raised, with its state and its total',
  '/admin/tables': 'The floor plan, who is sitting where and what they have ordered',
  '/admin/floors': 'Areas and floors, and how full each one is',
  '/kitchen': 'The kitchen ticket board — new, preparing, ready',
  '/bar': 'The bar ticket board — new, preparing, ready',
  '/cashier': 'Generate bills, take payment and close tables',
  '/admin/menu/items': 'Dishes and drinks, their prices and their availability',
  '/admin/menu/categories': 'How the menu is grouped, and the order it is shown in',
  '/admin/offers': 'Discounts and promotions, their schedule and their redemptions',
  '/admin/recipes': 'Ingredients per dish, food cost and the margin it leaves',
  '/admin/qr': 'Table QR codes for the guest menu',
  '/admin/inventory': 'Stock value, what is low and what has moved',
  '/admin/inventory/items': 'Every stock item, its level and its reorder point',
  '/admin/inventory/movements': 'The audit trail behind every stock change',
  '/admin/suppliers': 'Who you buy from, and what is still owed to them',
  '/admin/purchases': 'Purchase orders from draft through goods received',
  '/admin/customers': 'Guest records, visits, spend and notes',
  '/admin/reservations': 'Bookings by day, with a seat action on each',
  '/admin/loyalty': 'The points programme, its rules and its outstanding balance',
  '/admin/club': 'Door entries tonight, guests in house and evening revenue',
  '/admin/vip': 'VIP tables, their minimum spend and tonight’s service',
  '/admin/bottle-service': 'Bottles opened, held and returned to the cellar',
  '/admin/room-charges': 'Post a bill to a hotel room, and what is outstanding',
  '/admin/reports': 'Sales, payments, orders and item sales for a date range',
  '/admin/reports/advanced': 'Cross-period, cross-branch, inventory and profitability analysis',
  '/admin/branches': 'The organization, its branches and the outlets inside them',
  '/admin/users': 'Staff accounts, their roles and the branches they reach',
  '/admin/roles': 'What each role is allowed to do',
  '/admin/audit': 'Who changed what, and when',
  '/admin/notifications': 'Alerts raised by the system, and the thresholds behind them',
  '/admin/settings': 'Branch profile, billing rules and tax configuration',
};

export default function MorePage() {
  const can = useAuthStore((s) => s.hasPermission);
  const ws = useWorkspace();
  const { user, role, logout } = useAuth();
  const [resetOpen, setResetOpen] = useState(false);
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();
  const sections = useMemo(() => ADMIN_NAV
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => {
        // Permission first, and never relaxed by the search: the server enforces these.
        if (i.permission && !can(i.permission)) return false;
        if (!q) return true;
        return i.label.toLowerCase().includes(q) || (s.title ?? '').toLowerCase().includes(q);
      }),
    }))
    .filter((s) => s.items.length), [can, q]);

  const total = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="max-w-2xl pb-nav">
      <PageHeader title="More" subtitle="Everything your role can reach, plus account actions" />

      {user && (
        <Card className="flex items-center gap-3 mb-4">
          {/* The one gold avatar in the product belongs to whoever is signed in. */}
          <Avatar name={user.fullName} />
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">{user.fullName}</p>
            <p className="text-caption text-neutral-500">{role ? ROLE_LABELS[role] : ''}</p>
          </div>
          <Link to="/profile"><Button variant="outline" size="sm" leftIcon={<UserCircle className="h-4 w-4" />}>Profile</Button></Link>
        </Card>
      )}

      <div className="mb-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Find a screen"
          aria-label="Find a screen in this list"
        />
        {q && (
          <p className="text-caption text-neutral-500 mt-1.5 tabular-nums" aria-live="polite">
            {total} screen{total === 1 ? '' : 's'} matching “{search.trim()}”
          </p>
        )}
      </div>

      {sections.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            compact
            icon={<SearchX className="h-6 w-6" />}
            title="No screen matches"
            description={`Nothing you can reach is called “${search.trim()}”.`}
            action={<Button variant="outline" onClick={() => setSearch('')}>Clear the search</Button>}
          />
        </Card>
      ) : sections.map((s, i) => (
        <Reveal as="section" key={s.title ?? i} delay={staggerDelay(i)} className="mb-5">
          {s.title && <p className="text-label text-neutral-500 uppercase mb-2">{s.title}</p>}
          {/* The manager board gives each destination a line of its own, which needs the width of
              a full row on a phone; the admin board's two-up row of labels is unchanged. */}
          {ws === 'manager' ? (
            <ul className="grid grid-cols-1 md:grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
              {s.items.map((it) => (
                <li key={it.to} className="min-w-0">
                  <Link
                    to={it.to}
                    className="card p-0 flex items-start gap-3 px-3.5 py-3 min-h-touch text-sm transition-[background-color,border-color] duration-control hover:bg-neutral-100 hover:border-neutral-300"
                  >
                    <span className="shrink-0 h-9 w-9 rounded-md flex items-center justify-center bg-neutral-100 text-neutral-600 ring-1 ring-inset ring-neutral-200" aria-hidden>
                      <it.icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-neutral-900 truncate">{it.label}</span>
                      {SCREEN_NOTE[it.to] && <span className="block text-caption text-neutral-500 leading-snug">{SCREEN_NOTE[it.to]}</span>}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400 mt-1" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
          <ul className="grid grid-cols-1 xs:grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
            {s.items.map((it) => (
              <li key={it.to} className="min-w-0">
                <Link
                  to={it.to}
                  className="card p-0 flex items-center gap-3 px-3 py-2 min-h-touch text-sm transition-[background-color,border-color] duration-control hover:bg-neutral-100 hover:border-neutral-300"
                >
                  <span className="shrink-0 h-9 w-9 rounded-md flex items-center justify-center bg-neutral-100 text-neutral-600 ring-1 ring-inset ring-neutral-200" aria-hidden>
                    <it.icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-neutral-900">{it.label}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          )}
        </Reveal>
      ))}

      <div className="flex flex-col gap-2 pt-1">
        <Button variant="outline" leftIcon={<LogOut className="h-4 w-4" />} onClick={() => void logout()}>Sign out</Button>
        {env.isMock && (
          <Button variant="ghost" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={() => setResetOpen(true)}>Reset demo data</Button>
        )}
      </div>

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        variant="danger"
        title="Reset all demo data?"
        message="Every order, bill, customer and stock movement created in this browser is deleted and the original sample data is restored. This cannot be undone."
        confirmLabel="Reset and sign out"
        onConfirm={() => { resetDb(); window.location.assign('/login'); }}
      />
    </div>
  );
}
