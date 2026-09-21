import { Outlet } from 'react-router-dom';
import { ChefHat, Wine, LogOut, Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useRealtime';
import { useBranch } from '@/components/layout/Shell';
import { ConnectionStatus } from '@/components/layout/ConnectionStatus';
import { IconButton } from '@/components/ui';

/**
 * Full-bleed shell for Kitchen / Bar displays.
 *
 * Designed to be read across a hot, busy line: dark chrome to cut glare, oversized clock,
 * almost no management navigation, and an honest live-connection indicator — a stale board
 * that looks live is worse than one that admits it is stale.
 */
export default function DisplayLayout({ variant }: { variant: 'kitchen' | 'bar' }) {
  const { user, logout } = useAuth();
  const now = useNow(1000);
  const { data: branch } = useBranch();
  const [isFull, setIsFull] = useState(false);
  const Icon = variant === 'kitchen' ? ChefHat : Wine;

  useEffect(() => {
    const onChange = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  };

  return (
    /*
     * The board sits on `surface-board` — the deepest value in the system. A kitchen line is
     * usually under hot, bright light, and the darkest possible ground is what keeps the ticket
     * cards themselves the brightest thing in the room.
     */
    <div className="chrome-dark min-h-dvh flex flex-col bg-surface-board text-neutral-900">
      {/* The header is the only chrome the display has, so on a phone it gives up padding and
          the branch line before it gives up the station name or the connection indicator. */}
      <header className="h-16 bg-surface-board flex items-center gap-2 sm:gap-4 px-3 sm:px-6 border-b border-neutral-200 shrink-0">
        <span className="h-10 w-10 rounded-md bg-gold-sheen bg-primary-500 text-on-primary ring-1 ring-inset ring-primary-700/50 flex items-center justify-center shrink-0" aria-hidden>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="font-semibold leading-tight tracking-tight truncate">{variant === 'kitchen' ? 'Kitchen' : 'Bar'}<span className="hidden xs:inline"> Display</span></h1>
          <p className="text-[11px] text-neutral-500 truncate">{branch?.businessName} · {user?.fullName}</p>
        </div>
        <div className="flex-1" />
        <ConnectionStatus onDark />
        <time className="text-xl font-semibold tabular-nums tracking-tight hidden sm:block" dateTime={now.toISOString()}>
          {format(now, 'HH:mm')}
          {/* Seconds are deliberately quieter than minutes — the line reads the clock at a
              glance from across the pass, and a full-weight seconds counter pulls the eye. */}
          <span className="text-neutral-500 text-base">:{format(now, 'ss')}</span>
        </time>
        <IconButton label={isFull ? 'Exit fullscreen' : 'Enter fullscreen'} onDark variant="ghost" onClick={fullscreen}>
          {isFull ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
        </IconButton>
        <IconButton label="Sign out" onDark variant="ghost" onClick={() => void logout()}>
          <LogOut className="h-5 w-5" />
        </IconButton>
      </header>
      <main className="flex-1 p-3 sm:p-4 bg-surface-board overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
