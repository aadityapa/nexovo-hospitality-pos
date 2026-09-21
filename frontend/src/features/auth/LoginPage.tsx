import { useState, type CSSProperties } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LogIn, User, ShieldCheck } from 'lucide-react';
import { Button, Input, PasswordInput, Checkbox, InlineError } from '@/components/ui';
import { LoungeScene } from '@/components/graphics';
import { staggerDelay } from '@/components/motion';
import { useAuth } from '@/hooks/useAuth';
import { ApiError } from '@/services/api/client';
import { homeForRoles } from '@/config/roleHome';
import { env } from '@/config/env';
import { useAuthStore } from '@/store/authStore';

const schema = z.object({
  username: z.string().trim().min(1, 'Enter your username or email'),
  password: z.string().min(1, 'Enter your password'),
  rememberMe: z.boolean().default(false),
});
type Form = z.infer<typeof schema>;

/** Demo sign-ins for the in-browser mock backend. Never rendered against a real API. */
const DEMO: [user: string, password: string, label: string][] = [
  ['admin', 'Admin@123', 'Admin'], ['manager', 'Manager@123', 'Manager'], ['waiter1', 'Waiter@123', 'Waiter'],
  ['cashier', 'Cashier@123', 'Cashier'], ['kitchen', 'Kitchen@123', 'Kitchen'], ['host', 'Host@123', 'Host'],
];

/**
 * THE ENTRANCE.
 *
 * The reference board draws this as a two-column composition: a full-bleed image of a dining room
 * on the left, and the form on the right over the deepest charcoal in the product. That is what
 * this is, with one substitution — the image is DRAWN (`LoungeScene`), because this installation
 * has no photography of its own and a generated photograph of a room that does not exist would be
 * a claim rather than a decoration.
 *
 * `/login` is the one surface marked `theatrical` in config/motion.ts, and it is the only one that
 * earns it: nobody here is mid-service, nobody is holding a plate, and a person waiting to sign in
 * is the single audience this product ever gets. So the screen is composed — mark, headline, form,
 * demo block — one capped stagger step apart, rather than dumped.
 *
 * WHAT THE SEQUENCE DELIBERATELY DOES NOT DO: gate anything.
 *
 *   · Every beat is a `both`-filled CSS entrance on an element that is already mounted, already in
 *     the tab order and already submittable. No timer, no state gate, no conditional render, no
 *     `pointer-events: none`.
 *   · `autoFocus` is live on the username field from the first frame. A keystroke at 20 ms lands
 *     in the field; Enter at 40 ms submits exactly as it would at 4 s.
 *   · `opacity` and `transform` do not affect hit testing or focus.
 *   · Nothing re-keys on state, so a failed sign-in re-renders without replaying the entrance and
 *     the error appears immediately in its `role="alert"` region.
 *
 * WHAT THE BOARD SHOWS THAT IS NOT HERE. The reference has an "OR CONTINUE WITH — Google ·
 * Microsoft" block. There is no OAuth client, no identity-provider configuration and no server
 * route behind it; drawing two buttons that cannot sign anyone in would be the most consequential
 * possible place to fake a control. It is omitted. The board also names the venue on this screen —
 * which cannot be known before sign-in, because the branch endpoint is authenticated — so the
 * panel carries the product's own identity instead of inventing a venue name.
 */
const beat = (n: number): CSSProperties => ({ '--d': `${staggerDelay(n)}ms` } as CSSProperties);

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [params] = useSearchParams();
  const expired = !!params.get('expired');
  const [error, setError] = useState<string | null>(expired ? 'Your session expired. Please sign in again.' : null);
  const existing = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '', rememberMe: false },
  });

  if (token && existing && !expired) return <Navigate to={homeForRoles(existing.roles)} replace />;

  const onSubmit = async (v: Form) => {
    setError(null);
    try {
      const user = await login(v);
      const from = loc.state?.from;
      navigate(from && from !== '/login' ? from : homeForRoles(user.roles), { replace: true });
    } catch (e) {
      // Only a real backend response moves the user on — failures stay on this screen.
      setError(ApiError.from(e).message);
    }
  };

  return (
    /* The whole screen is the dark palette whatever the theme: this is the threshold of the
       product, it is the same for everyone, and it is the one composition the boards give a
       full-bleed image. `.chrome-dark` repaints the subtree, so every token below resolves
       against charcoal with no branch. */
    <div className="chrome-dark min-h-dvh bg-surface flex flex-col lg:flex-row">
      {/*
       * IMAGE PANEL. Full-bleed, no padding, no card — the picture runs to three edges of the
       * screen. Decorative, so it is the first thing dropped on a phone.
       */}
      <aside className="relative hidden lg:block lg:w-[46%] xl:w-[52%] overflow-hidden">
        <LoungeScene className="absolute inset-0" />

        {/* The venue's own line, set over the picture. Two rules and a word — the boards set
            this as a plate rather than a paragraph. */}
        <div className="absolute inset-x-0 top-0 p-12 xl:p-14 anim-enter-soft" style={beat(0)}>
          <div className="inline-flex flex-col items-center text-center">
            <span aria-hidden className="h-px w-10 bg-primary-500/70" />
            <p className="mt-4 text-[26px] xl:text-[30px] leading-tight font-semibold tracking-[-0.01em] text-neutral-900">
              {env.appName}
            </p>
            <p className="mt-2 text-[11px] uppercase tracking-[0.22em] text-primary-700">
              Hospitality management
            </p>
            <span aria-hidden className="mt-4 h-px w-10 bg-primary-500/70" />
          </div>
        </div>

        {/* And the line at the foot, which is the only sentence on this half. */}
        <div className="absolute inset-x-0 bottom-0 p-12 xl:p-14 anim-reveal" style={beat(2)}>
          <span aria-hidden className="block h-px w-14 bg-primary-500/70 mb-5" />
          <p className="max-w-[20rem] text-[19px] xl:text-[21px] leading-snug text-neutral-900">
            Great food.<br />Smoother operations.<br />Happier guests.
          </p>
        </div>

        {/* One gold hairline where the picture meets the form. */}
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-px fill-gold opacity-50" />
      </aside>

      {/*
       * FORM PANEL — the deepest surface in the product, and first and full width on a phone.
       * `material-matte` lays the grain over it so the largest plane on the screen reads as a
       * material rather than a flat fill: a static `::after` at the theme's own grain strength,
       * decoration only, `pointer-events: none`, and it does not move.
       */}
      <main className="flex-1 flex items-center justify-center p-6 py-12 bg-surface-sunken material-matte">
        <div className="w-full max-w-[21rem]">
          {/* Beat 0 — the mark, centred above the form exactly as the board sets it. */}
          <div className="anim-reveal flex flex-col items-center text-center" style={beat(0)}>
            <span className="h-11 w-11 rounded-lg fill-gold material-gloss bg-primary-500 text-on-primary grid place-items-center font-bold text-xl ring-1 ring-inset ring-primary-700/50 shadow-gold" aria-hidden>
              N
            </span>
            <span className="mt-3 text-[15px] font-semibold tracking-tight text-neutral-900">{env.appName}</span>
          </div>

          {/* Beat 1 — the headline. */}
          <div className="anim-reveal mt-8 text-center" style={beat(1)}>
            <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-neutral-900">Welcome back</h1>
            <p className="text-[13px] text-neutral-500 mt-1.5">Sign in to continue.</p>
          </div>

          {/*
           * Beat 2 — the form. The wrapper is the FORM ELEMENT itself rather than an extra div, so
           * nothing is introduced between the label, the control and the submit.
           */}
          <form onSubmit={handleSubmit(onSubmit)} className="anim-reveal mt-7 space-y-4" style={beat(2)} noValidate>
            {error && <InlineError message={error} />}
            <Input
              label="Username or email"
              autoComplete="username"
              autoFocus
              leftIcon={<User />}
              error={errors.username?.message}
              {...register('username')}
            />
            <PasswordInput label="Password" autoComplete="current-password" error={errors.password?.message} {...register('password')} />
            <div className="flex items-center justify-between gap-3 pt-0.5">
              <Checkbox label="Remember me" {...register('rememberMe')} />
              <Link to="/forgot-password" className="text-[13px] text-primary-700 hover:underline underline-offset-2 whitespace-nowrap">
                Forgot password?
              </Link>
            </div>
            <Button type="submit" block size="lg" loading={isSubmitting} leftIcon={<LogIn className="h-4 w-4" />} className="mt-1">
              Sign in
            </Button>
          </form>

          {/* Beat 3 — the demo block, last, because it is the least important thing here. The
              `env.isMock` gate is untouched: on a real API this block does not exist at all. */}
          {env.isMock && (
            <div className="anim-reveal mt-8 pt-6 border-t border-neutral-200" style={beat(3)}>
              <p className="text-label text-neutral-500 uppercase mb-1">Demo accounts</p>
              <p className="text-caption text-neutral-500 mb-3">
                This build runs the in-browser demo backend. Select a role to fill the form.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {DEMO.map(([u, p, label]) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => { setValue('username', u, { shouldValidate: false }); setValue('password', p, { shouldValidate: false }); }}
                    className="rounded-md border border-neutral-300 bg-neutral-100 px-2 py-2 text-xs text-left transition-colors duration-control hover:border-primary-500 hover:bg-primary-50 min-h-touch"
                  >
                    <span className="block font-medium text-neutral-800">{label}</span>
                    <span className="block text-neutral-500 font-mono text-[11px] truncate">{u}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Beat 4 — the reassurance line the board puts at the foot of the form. */}
          <p className="anim-reveal mt-8 flex items-center justify-center gap-1.5 text-caption text-neutral-500" style={beat(4)}>
            <ShieldCheck className="h-3.5 w-3.5 text-neutral-400" aria-hidden />
            Secure. Reliable. Built for hospitality.
          </p>
        </div>
      </main>
    </div>
  );
}
