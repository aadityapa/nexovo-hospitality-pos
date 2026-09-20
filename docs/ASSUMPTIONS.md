# Documented assumptions

1. **Single branch in Phase 1** (`BRANCH_ID = 1`, code `MAIN`). Schema is multi-branch ready.
2. **Currency INR**, amounts stored as `NUMBER(12,2)`; grand total rounded to nearest rupee (`ROUNDING_MODE = NEAREST`, configurable per branch: `NEAREST | UP | DOWN | NONE`).
3. **Tax**: item tax groups (e.g. `GST5` = CGST 2.5 % + SGST 2.5 %, `GST18`, `LIQUOR_VAT` 20 %). Service charge default 5 %, taxable = false by default (branch setting `TAX_ON_SERVICE_CHARGE`).
4. **Auth**: opaque session tokens issued by `SEC_PKG.login` (24 h, 30 d with remember-me), stored hashed in `USER_SESSIONS`. Passwords hashed SHA-512 + salt (10 000 iterations) via `DBMS_CRYPTO`. No external IdP.
5. **Manager approval in the mock backend** uses the manager's 4-digit approval PIN (seeded `1234`). In ORDS the same field is validated against `USERS.APPROVAL_PIN_HASH`.
6. **Real-time** in mock mode = `BroadcastChannel` (works across tabs of the same browser). ORDS mode = polling `/events` every 5 s; SSE/WebSocket can be plugged in later.
7. **QR codes** are generated client-side (`qrcode` npm package) from `PUBLIC_APP_URL + /menu/{branchCode}/{publicCode}`; `publicCode` is a random 12-char token, regenerable.
8. **Images**: item images are URLs (seed uses Unsplash). Upload in mock mode converts file → data URL; ORDS mode expects an object-storage URL (upload endpoint left as integration point `POST /uploads`).
9. **Printing** is browser `window.print()` with an 80 mm thermal stylesheet; `PrinterAdapter` interface allows ESC/POS integration later.
10. **One active order per table** (`BRANCHES.ALLOW_MULTIPLE_ORDERS_PER_TABLE = 'N'`).
11. **Timezone**: Asia/Kolkata; all API timestamps ISO-8601 UTC.
12. Demo credentials are seed data only and must be rotated before production.
