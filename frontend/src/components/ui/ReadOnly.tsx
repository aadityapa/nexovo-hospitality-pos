import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAuthStore } from '@/store/authStore';
import type { Permission } from '@/config/permissions';

/**
 * READ-ONLY PRESENTATION
 * ======================
 *
 * The manager boards show Settings and Branches as screens you can read but not change. That is
 * not a manager-specific design decision — it is what the permission model already says: the
 * seeded MANAGER role holds `settings:view` and `branches:view` and does **not** hold
 * `settings:manage` or `branches:manage`.
 *
 * So the treatment below is driven by the permission, never by the workspace. An admin opening
 * the same screen holds `settings:manage` and gets the editable form; a manager gets this. If the
 * policy ever changes on the server, the screen follows it without anybody editing a component —
 * which is the only version of this that cannot drift into a lie.
 *
 * It is a presentation of a restriction that already exists, not the restriction itself. The
 * server rejects the write regardless of what is rendered.
 */

/** True when the signed-in role can look at this area but not change it. */
export function useReadOnly(managePermission: Permission): boolean {
  return !useAuthStore((s) => s.hasPermission(managePermission));
}

/**
 * The chip that sits beside a page title. Small, and it says the word — a padlock on its own is
 * a decoration that half the people who need it will not decode.
 */
export function ReadOnlyPill({ className }: { className?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-md border border-primary-500/35 bg-primary-500/12 px-2.5 h-8 text-[13px] font-medium text-primary-700',
      className,
    )}>
      <Lock className="h-3.5 w-3.5" aria-hidden />
      Read only
    </span>
  );
}

/**
 * The banner above a read-only form.
 *
 * Two sentences, and the second one is the useful half: it says who *can* make the change, so the
 * reader knows what to do next instead of only what they cannot do. `managedBy` names that person
 * or team; it defaults to the administrator, which is who the permission model actually points at.
 */
export function ReadOnlyBanner({ title, managedBy = 'your system administrator', children, className }: {
  title: string;
  managedBy?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('well flex items-start gap-3 p-3.5', className)} role="note">
      <span className="h-8 w-8 shrink-0 rounded-md grid place-items-center bg-primary-500/12 ring-1 ring-inset ring-primary-500/30" aria-hidden>
        <Lock className="h-4 w-4 text-primary-700" />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-neutral-900">{title}</p>
        <p className="text-caption text-neutral-500 mt-0.5 leading-relaxed">
          {children ?? <>You can view the configuration below. Changes are made by {managedBy}.</>}
        </p>
      </div>
    </div>
  );
}

/**
 * A read-only field. Renders the VALUE, not a disabled input.
 *
 * A greyed-out `<input>` is the usual shortcut here and it is worse in three ways: the text is
 * dimmed exactly where it most needs to be legible, the control still takes a tab stop on some
 * browsers, and it invites a click that does nothing. A value on a quiet ground reads better and
 * lies about nothing.
 */
export function ReadOnlyField({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-label text-neutral-500 uppercase">{label}</p>
      <div className="mt-1.5 well px-3 py-2 text-[13px] text-neutral-900 min-h-control flex items-center break-words">
        {value === '' || value == null ? <span className="text-neutral-400">Not set</span> : value}
      </div>
    </div>
  );
}
