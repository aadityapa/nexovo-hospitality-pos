# Security

## Reporting a vulnerability

**Report privately to the repository owner. Do not open a public issue, and do not include working
exploit details in any public channel.**

This repository does not publish a security contact address, and none is invented here. Reports
should go to the owner of this repository through whatever private channel the owner designates.

> **`<SECURITY CONTACT — TO BE SET BY THE REPOSITORY OWNER>`**
>
> The owner must replace this placeholder with a real private channel before this file is useful
> to an outside reporter — for example a monitored mailbox, a private security advisory on the
> hosting platform, or a named internal contact. Until then, a reporter who does not already know
> how to reach the owner has no route, and that is a gap, not a policy.

If you have found something and have no designated channel, contact the person or organisation who
gave you access to this repository. Do not guess at an address.

When you report, please include: what you found, the steps to reproduce it, which mode you were
running (`mock` or `ords`), and what an attacker could do with it. There is no bounty programme and
no published response-time commitment.

## Security posture

What the system actually does. Everything in this section was read from the code; see
[`ARCHITECTURE.md` §5](ARCHITECTURE.md#5-authentication-authorisation-and-branch-isolation).

### Permissions are enforced on the server

Authorisation is a data model — permission codes granted to roles, roles granted to users — and it
is enforced inside every ORDS handler by `SEC_PKG.assert_permission`, which raises 401 when there is
no authenticated user and 403 when the user lacks the code.

The frontend's `frontend/src/config/permissions.ts` is a **mirror** of the same matrix, used to
guard routes and hide affordances that would fail anyway. It is a user-experience convenience, not
a security control. Removing a guard in the client grants nothing: the handler still refuses.

Financial limits work the same way. A user's maximum discount comes from `roles.max_discount_pct`
on the server; anything above a user's cap requires PIN approval from someone holding
`orders:approve-discount`.

### Branch isolation is server-side

In a multi-branch deployment the active branch travels as an `X-Branch-Id` header declared on the
ORDS module, and queries scope to `api_pkg.current_branch_id`. The router states the rule in its own
comment: the branch context switch is *enforced server-side, never trusted from the UI alone*. A
user cannot read another branch's data by changing a header, because their access is checked against
their branch grants. `SUPER_ADMIN` is checked against the branch list rather than waved through.

### Sessions are opaque bearer tokens

Tokens are 32 random bytes from `DBMS_CRYPTO.RANDOMBYTES`, hex-encoded. They are **not** JWTs and
carry no claims — they are meaningless outside the session table.

Only the **SHA-256 hash** of a token is stored, in `user_sessions`, with an expiry. Passwords are
stored as a salted `HASH_SH512` digest with a per-user 32-byte random salt; no password is ever
stored or logged in plaintext. The client sends the token as a bearer header, and on a 401 clears
the session and redirects to `/login?expired=1`.

Sessions expire. The client also treats an expired session as unauthenticated before making a
request, so a stale tab does not sit on a dead token.

### Transactions are atomic

The business packages contain no `COMMIT` and no `ROLLBACK`. The router commits once on success and
rolls back in its exception handler. A partially applied financial operation — payment recorded but
bill not closed, stock deducted but order not confirmed — is therefore not a state the database can
be left in by a failed request.

### Auditing

Privileged and financial actions write to an audit log, and server errors record a backtrace.
Manual stock deduction is audited explicitly as `STOCK_DEDUCTED_MANUAL`.

---

## The mock backend is for local demonstration only

> **`VITE_API_MODE=mock` must never be used in production, on a shared host, or on any address
> reachable by someone other than the person running it.**

The mock backend (`frontend/src/services/api/mock/`) is an in-browser implementation of the API. It
exists so the product can be demonstrated and developed with no database. It is not a server, and
it is not a security boundary:

- **It runs entirely in the user's browser.** Every rule it enforces — permissions, discount caps,
  branch scoping — runs on the attacker's own machine, in code they can read and modify. None of it
  is authorisation in any meaningful sense.
- **It ships seeded credentials.** The demo accounts are published in this repository's README and
  are pre-filled by buttons on the login screen.
- **It stores everything in `localStorage`**, unencrypted, per browser. There is no server, so
  there is nothing to attack and nothing to protect the data.

For any real deployment set `VITE_API_MODE=ords` and point `VITE_API_BASE_URL` at a real ORDS
instance, where `SEC_PKG` enforces permissions on a server the user does not control.

## Deployment notes

- **Rotate every seeded credential** before any deployment. They are public — they are printed in
  `README.md` and in `frontend/src/features/auth/LoginPage.tsx`.
- **Serve over TLS.** Bearer tokens are sent in a header; without TLS they are readable in transit.
- **No `VITE_*` variable is a secret.** Every one is compiled into the client bundle and shipped to
  the browser. Never put a password, key or token in `.env`. `frontend/.env` is git-ignored, but
  that protects the repository, not the bundle.
- **Tighten CORS.** `database/06_ords_modules.sql` allows
  `http://localhost:5173,http://localhost:4173` — the dev server and the preview port. Change
  `ORDS.SET_MODULE_ORIGINS_ALLOWED` to your real origin and remove the localhost entries.
- **Grant the schema owner only what it needs**, including `EXECUTE ON DBMS_CRYPTO`, which the
  password and token hashing depends on.
- **The public QR menu is unauthenticated by design** (`/menu/<branchCode>/<publicCode>`). Treat
  table public codes as guessable identifiers, not secrets.

## Unverified areas

These are not claims of safety. They are the parts nobody has tested, which is where unknown issues
would be.

- The Oracle/ORDS integration has **not** been exercised against a live server in this environment,
  so its authentication, authorisation and branch-isolation behaviour is unverified in practice
  even though it is implemented in the SQL.
- No dependency vulnerability scan, SAST run or penetration test has been performed on this
  repository, and no such tooling is configured. CI runs typecheck, tests and build only.
- There is no rate limiting, account lockout or brute-force protection documented or implemented at
  the application layer.
- External payment providers are not integrated, so no cardholder data flows through this system
  today. That also means nothing here has been assessed against PCI DSS or any comparable standard.

See the [Known limitations](README.md#known-limitations) section of the README for the wider list.
