# Neon production backend

Production uses Vercel + Neon Postgres + Neon Auth + private Vercel Blob.
The Supabase implementation is retained for rollback; DATABASE_URL selects Neon.
No previous Supabase users, works, files or SMTP credentials were copied. Old
accounts must register again. The paused Supabase project was not deleted.

## Environment (server only)

- DATABASE_URL: provisioned by the Vercel Neon integration.
- NEON_AUTH_BASE_URL: provisioned by the same integration.
- NEON_AUTH_COOKIE_SECRET: random secret of at least 32 characters, stored as
  a sensitive production environment variable. Never publish its value.
- BLOB_READ_WRITE_TOKEN: provisioned by the private Blob store integration.

Create application tables in a fresh database with
`node --env-file=.env.neon.local scripts/migrate-neon.mjs`. This is transactional
and deliberately aborts if tables already exist; it is not a destructive reset.

Neon Auth: allow https://unfinished-project-eta.vercel.app, enable email sign-up,
email sign-in and verification at sign-up. Application name is
誰かの未完成プロジェクト. Verification uses a six-digit email OTP. Confirming the
OTP creates an HttpOnly session and the UI opens the feed. Resend is available
in the registration and confirmation dialogs. Email delivery currently uses
Neon's shared sender, auth@mail.myneon.app, rather than the old Resend SMTP.
Password recovery retains a dedicated callback page; the reset token is removed
from the address bar and held in memory only.

All application data queries go through the Node API. Browser users receive no
database credentials. Existing ownership/visibility checks are reused. Application
tables have RLS enabled with no public client policies. Upload tokens are limited
to one randomized pathname, size, type and ten minutes. Uploaded bytes are checked
before moving to the verified path. Download URLs are issued only after checking
the referencing work's visibility and expire in one minute.

## Verification and release

- `npm test`: existing tests plus PostgreSQL-backed adapter/permission tests.
- `npm run check:neon-auth`: temporary synthetic account, live login, OTP,
  single-use verification, private posting, session and logout; no email sent.
- `npm run check:neon-storage`: temporary upload, actual byte validation,
  private access denial, owner download. Temporary records and files are removed.
- `npm run build:vercel`, then a scoped Vercel production deployment.

The live checks require the Neon environment locally and intentionally mutate only
uniquely generated QA records. Never log tokens, passwords or signed download URLs.
A real confirmation/reset email receipt remains a separate user-operated check.
