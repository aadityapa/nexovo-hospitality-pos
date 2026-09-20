import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MailCheck, ArrowLeft, KeyRound } from 'lucide-react';
import { Button, Input, InlineError } from '@/components/ui';
import { authApi } from '@/services/api/endpoints';
import { ApiError } from '@/services/api/client';
import { env } from '@/config/env';

const schema = z.object({ email: z.string().trim().email('Enter a valid email address') });
type Form = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, getValues, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = async (v: Form) => {
    setError(null);
    try {
      await authApi.forgotPassword(v.email);
      setSent(true);
    } catch (e) {
      const err = ApiError.from(e);
      // Deliberately neutral on "unknown address" so the form cannot be used to discover which
      // emails have accounts — but a genuine transport failure is reported, never disguised as success.
      if (err.isNetworkError || err.status >= 500) setError(err.message);
      else setSent(true);
    }
  };

  return (
    <div className="min-h-dvh bg-surface flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="card p-8">
          {sent ? (
            <div className="text-center">
              <span className="mx-auto h-12 w-12 rounded-full bg-success-50 text-success-600 flex items-center justify-center mb-4" aria-hidden>
                <MailCheck className="h-6 w-6" />
              </span>
              <h1 className="text-heading text-neutral-900">Check your inbox</h1>
              <p className="text-sm text-neutral-500 mt-2 leading-relaxed">
                If an account exists for <span className="font-medium text-neutral-700 break-all">{getValues('email')}</span>,
                reset instructions are on their way.
              </p>
              {env.isMock && (
                <p className="text-caption text-neutral-500 mt-4 rounded-sm bg-neutral-50 border border-neutral-200 px-3 py-2">
                  Demo backend: no email is actually sent. Ask an administrator to set a new password from the Users page.
                </p>
              )}
              <Link to="/login" className="inline-flex items-center gap-1.5 mt-6 text-sm text-primary-700 hover:underline underline-offset-2">
                <ArrowLeft className="h-4 w-4" aria-hidden />Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <span className="h-11 w-11 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center mb-4" aria-hidden>
                <KeyRound className="h-5 w-5" />
              </span>
              <h1 className="text-heading text-neutral-900">Reset password</h1>
              <p className="text-sm text-neutral-500 mt-1.5">
                Enter the email on your staff account and we'll send reset instructions.
              </p>
              <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
                {error && <InlineError message={error} />}
                <Input label="Email" type="email" autoComplete="email" autoFocus error={errors.email?.message} {...register('email')} />
                <Button type="submit" block loading={isSubmitting}>Send instructions</Button>
                <Link to="/login" className="flex items-center justify-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900 min-h-touch">
                  <ArrowLeft className="h-4 w-4" aria-hidden />Back to sign in
                </Link>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
