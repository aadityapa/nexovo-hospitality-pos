import { Link, useNavigate } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { homeForRoles } from '@/config/roleHome';

/**
 * A wrong turn, stated once. The same tile the shared empty state draws, one serif line — the only
 * one this screen takes — and the two ways out that actually exist: back, or the home the signed-in
 * roles resolve to (the sign-in screen when nobody is). No scenery: nobody arrives here on purpose.
 */
export default function NotFoundPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const home = user ? homeForRoles(user.roles) : '/login';
  return (
    <div className="min-h-dvh flex items-center justify-center bg-surface p-6">
      <div className="w-full max-w-sm flex flex-col items-center text-center anim-enter">
        <span
          className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-high fill-surface text-neutral-500 ring-1 ring-inset ring-neutral-200"
          aria-hidden
        >
          <Compass className="h-6 w-6" />
        </span>
        <h1 className="font-serif text-[34px] leading-none tracking-[-0.01em] text-neutral-900">Page not found</h1>
        <p className="text-sm text-neutral-500 mt-3 leading-relaxed">
          This page doesn't exist, has moved, or isn't part of your role's workspace.
        </p>
        <div className="mt-6 flex flex-wrap gap-2 justify-center">
          <Button variant="outline" onClick={() => navigate(-1)}>Go back</Button>
          <Link to={home}><Button>{user ? 'My dashboard' : 'Sign in'}</Button></Link>
        </div>
      </div>
    </div>
  );
}
