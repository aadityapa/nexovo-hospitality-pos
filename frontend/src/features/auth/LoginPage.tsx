import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LogIn, User, UtensilsCrossed, ChefHat, Receipt } from 'lucide-react';
import { Button, Input, PasswordInput, Checkbox, InlineError } from '@/components/ui';
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

const HIGHLIGHTS = [
  { icon: UtensilsCrossed, title: 'One order per table', body: 'Waiters build a single master order; the kitchen and bar receive only their own lines.' },
  { icon: ChefHat, title: 'Live preparation status', body: 'Tickets move through new, preparing and ready with timers everyone can see.' },
  { icon: Receipt, title: 'Billing that adds up', body: 'Offers, discounts, taxes, service charge and split payments handled by one engine.' },
];

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
    <div className="min-h-dvh bg-surface flex flex-col lg:flex-row">
      {/* Brand panel — decorative, so it is the first thing dropped on small screens. */}
      <aside className="hidden lg:flex lg:w-[44%] xl:w-[40%] bg-neutral-900 text-white flex-col justify-between p-12 xl:p-14">
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 rounded-md bg-primary-600 flex items-center justify-center font-bold text-lg" aria-hidden>N</span>
          <span className="text-lg font-semibold tracking-tight">{env.appName}</span>
        </div>

        <div className="max-w-md">
          <h1 className="text-[2rem] xl:text-[2.25rem] font-semibold leading-[1.2] tracking-[-0.02em]">
            Everything the floor needs,<br />in one calm place.
          </h1>
          <ul className="mt-9 space-y-6">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3.5">
                <span className="h-9 w-9 rounded-md bg-white/10 flex items-center justify-center shrink-0" aria-hidden>
                  <Icon className="h-[18px] w-[18px] text-primary-300" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-[0.9375rem]">{title}</span>
                  <span className="block text-sm text-neutral-400 mt-0.5 leading-relaxed">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-caption text-neutral-500">© {new Date().getFullYear()} Nexovo Hospitality</p>
      </aside>

      {/* Form panel — first and full width on mobile. */}
      <main className="flex-1 flex items-center justify-center p-6 py-10">
        <div className="w-full max-w-[22rem]">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <span className="h-10 w-10 rounded-md bg-primary-600 text-white flex items-center justify-center font-bold text-lg" aria-hidden>N</span>
            <span className="text-lg font-semibold tracking-tight">{env.appName}</span>
          </div>

          <h2 className="text-heading text-neutral-900">Sign in</h2>
          <p className="text-sm text-neutral-500 mt-1.5">Use your staff account to continue.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-4" noValidate>
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
            <div className="flex items-center justify-between gap-3 pt-1">
              <Checkbox label="Remember me" {...register('rememberMe')} />
              <Link to="/forgot-password" className="text-sm text-primary-700 hover:underline underline-offset-2 whitespace-nowrap">
                Forgot password?
              </Link>
            </div>
            <Button type="submit" block size="lg" loading={isSubmitting} leftIcon={<LogIn className="h-4 w-4" />} className="mt-2">
              Sign in
            </Button>
          </form>

          {env.isMock && (
            <div className="mt-10 pt-6 border-t border-neutral-200">
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
                    className="rounded-sm border border-neutral-200 bg-white px-2 py-2 text-xs text-left transition-colors hover:border-primary-300 hover:bg-primary-50 min-h-touch"
                  >
                    <span className="block font-medium text-neutral-800">{label}</span>
                    <span className="block text-neutral-500 font-mono text-[11px] truncate">{u}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
