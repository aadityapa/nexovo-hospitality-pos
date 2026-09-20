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
    <div className="chrome-dark min-h-dvh flex flex-col bg-neutral-900">
      <header className="h-16 bg-neutral-900 text-white flex items-center gap-3 sm:gap-4 px-4 sm:px-6 border-b border-white/10 shrink-0">
        <span className="h-10 w-10 rounded-md bg-primary-600 flex items-center justify-center shrink-0" aria-hidden>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="font-semibold leading-tight tracking-tight">{variant === 'kitchen' ? 'Kitchen Display' : 'Bar Display'}</h1>
          <p className="text-[11px] text-neutral-400 truncate">{branch?.businessName} · {user?.fullName}</p>
        </div>
        <div className="flex-1" />
        <ConnectionStatus onDark />
        <time className="text-xl font-semibold tabular-nums tracking-tight hidden sm:block" dateTime={now.toISOString()}>
          {format(now, 'HH:mm')}
          <span className="text-neutral-500 text-base">:{format(now, 'ss')}</span>
        </time>
        <IconButton label={isFull ? 'Exit fullscreen' : 'Enter fullscreen'} onDark variant="ghost" onClick={fullscreen}>
          {isFull ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
        </IconButton>
        <IconButton label="Sign out" onDark variant="ghost" onClick={() => void logout()}>
          <LogOut className="h-5 w-5" />
        </IconButton>
      </header>
      <main className="flex-1 p-3 sm:p-4 bg-neutral-900 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
