import { useState, type CSSProperties } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LogIn, User, ShieldCheck } from 'lucide-react';
import { Button, Input, PasswordInput, Checkbox, InlineError } from '@/components/ui';
import { LoungeScene, Photo } from '@/components/graphics';
import { VENUE_IMG } from '@/config/imagery';
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
 * The luxury concept draws this as one cinematic frame: a full-bleed night-time dining room, the
 * lights coming up on it, and the form floating over it in a dark glass card. That is what this
 * is. The room is a licensed photograph shipped as a LOCAL file (`config/imagery.ts`,
 * `assets.manifest.json`: a dark bar under brass pendant globes), with the drawn `LoungeScene`
 * as its understudy — shown while the file loads and standing in if it is absent, so the screen
 * never depends on a network image and never shows a broken frame.
 *
 * THE LIGHTING REVEAL. `.anim-light-reveal` on the scene brings it up from dim and slightly
 * desaturated to full over ~900 ms with a settle in scale — the "lights up" moment the brief asks
 * for, and the one place in the product a cue that long is allowed. It runs once, on mount, on a
 * decorative layer; it does not replay on a failed sign-in (nothing re-keys) and it collapses to
 * nothing under `prefers-reduced-motion`.
 *
 * `/login` is the one surface marked `theatrical` in config/motion.ts, and it is the only one that
 * earns it: nobody here is mid-service, nobody is holding a plate, and a person waiting to sign in
 * is the single audience this product ever gets. So the card is composed — mark, headline, form,
 * demo block — one capped stagger step apart, rather than dumped.
 *
 * NO AUTHENTICATED NAVIGATION. This screen renders outside the application shell: there is no
 * rail, no header, no bottom nav and no branch name, because none of those can be known before
 * sign-in and the brief is explicit that none may be shown. A signed-in user who lands here is
 * redirected to their role's home before anything paints.
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
       product, it is the same for everyone, and it is the one composition the concept gives a
       full-bleed image. `.chrome-dark` repaints the subtree, so every token below resolves
       against obsidian with no branch. `isolate` keeps the scene's stacking under the card. */
    <div className="chrome-dark relative isolate min-h-dvh bg-surface overflow-hidden">
      {/*
       * THE ROOM. Full-bleed behind everything at every width — on a phone it is the ground the
       * card floats over, on a desktop it is most of the frame. Decorative: `aria-hidden` on the
       * SVG, `pointer-events-none` on the layer, and the light-reveal runs on this layer only so
       * the form is never dimmed or scaled with it.
       */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        {/* The venue photograph (a local file, see config/imagery.ts) with the drawn room as its
            understudy: the drawing shows while the file loads and stands in if it is absent.
            The light-reveal runs on the wrapper, so photo and drawing come up together. */}
        <Photo src={VENUE_IMG.hero} fallback={<LoungeScene className="absolute inset-0" />} priority className="absolute inset-0 anim-light-reveal" />
        {/* The scrim: darker where the card sits, near-clear where the room shows. Two gradients,
            no blur, no movement. On phones the card is centred, so the scrim is a vignette. */}
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_100%,rgba(11,14,17,0.55),transparent_60%)] lg:bg-[linear-gradient(90deg,rgba(11,14,17,0.15)_0%,rgba(11,14,17,0.35)_45%,rgba(11,14,17,0.78)_100%)]" />
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-surface/70 to-transparent" />
      </div>

      <div className="min-h-dvh flex flex-col lg:flex-row">
        {/*
         * THE VENUE LINE — set over the room on desktops, above the card on phones. Two rules and
         * a word, then the serif sentence: the one editorial moment before sign-in.
         */}
        <aside className="relative flex flex-col justify-between p-6 pt-8 lg:flex-1 lg:p-12 xl:p-16">
          <div className="anim-enter-soft" style={beat(0)}>
            <div className="inline-flex flex-col items-start">
              <span aria-hidden className="h-px w-10 bg-primary-500/70" />
              <p className="mt-3 text-[13px] font-semibold tracking-[0.2em] uppercase text-neutral-900">{env.appName}</p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.22em] text-primary-700">Hospitality management</p>
            </div>
          </div>

          <div className="hidden lg:block anim-reveal" style={beat(2)}>
            <p className="font-serif max-w-[22rem] text-[40px] xl:text-[48px] leading-[1.05] tracking-[-0.01em] text-neutral-900">
              The evening,<br />
              <em className="not-italic text-primary-700">perfectly</em> served.
            </p>
            <span aria-hidden className="mt-6 block h-px w-14 bg-primary-500/70" />
            <p className="mt-4 max-w-[24rem] text-[14px] leading-relaxed text-neutral-600">
              Ordering, kitchen routing, billing and inventory for the room you run — from the floor to the books.
            </p>
          </div>
        </aside>

        {/*
         * THE CARD. A dark glass card, bronze hairline, layered shadow — floating over the room
         * rather than sitting in a column. `backdrop-blur` is a static filter (no motion), and the
         * fill is opaque enough (raised surface at 88%) that the form's contrast never depends on
         * what the room happens to be behind it.
         */}
        <main className="flex flex-1 items-center justify-center p-4 pb-10 sm:p-6 lg:flex-none lg:w-[46%] xl:w-[42%] lg:p-12 xl:p-16">
          <div className="w-full max-w-[22.5rem] rounded-xl border border-bronze/40 bg-surface-raised/[.88] shadow-modal backdrop-blur-md p-6 sm:p-8 anim-reveal" style={beat(1)}>
            {/* Beat 1 — the mark, centred above the form. */}
            <div className="flex flex-col items-center text-center">
              <span className="h-12 w-12 rounded-lg fill-gold material-gloss bg-primary-500 text-on-primary grid place-items-center font-serif font-semibold text-[26px] leading-none ring-1 ring-inset ring-primary-700/50 shadow-gold" aria-hidden>
                N
              </span>
            </div>

            {/* Beat 2 — the headline, in the serif: this is the welcome the brief reserves it for. */}
            <div className="anim-reveal mt-6 text-center" style={beat(2)}>
              <h1 className="font-serif text-[34px] leading-none tracking-[-0.01em] text-neutral-900">Welcome back</h1>
              <p className="text-[13px] text-neutral-500 mt-2.5">Sign in to continue.</p>
            </div>

            {/*
             * Beat 3 — the form. The wrapper is the FORM ELEMENT itself rather than an extra div,
             * so nothing is introduced between the label, the control and the submit.
             */}
            <form onSubmit={handleSubmit(onSubmit)} className="anim-reveal mt-7 space-y-4" style={beat(3)} noValidate>
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

            {/* Beat 4 — the demo block, last, because it is the least important thing here. The
                `env.isMock` gate is untouched: on a real API this block does not exist at all. */}
            {env.isMock && (
              <div className="anim-reveal mt-7 pt-5 border-t border-neutral-200" style={beat(4)}>
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

            {/* Beat 5 — the reassurance line at the foot of the card. */}
            <p className="anim-reveal mt-6 flex items-center justify-center gap-1.5 text-caption text-neutral-500" style={beat(5)}>
              <ShieldCheck className="h-3.5 w-3.5 text-neutral-400" aria-hidden />
              Secure. Reliable. Built for hospitality.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
