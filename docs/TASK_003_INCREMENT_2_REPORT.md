# Task 003, Increment 2 — Authentication and Owner Onboarding

## Baseline and scope

Started from clean `main` at merge `869fbe9`, containing approved commit `05097db0a5c37e3d4308e1f29ad5a5b5240023df`. Increment 1 migrations, tenant policies and read-only runtime table grants are retained. No provider, production database, deployment, paid service, catalogue, inventory, GST or billing implementation is introduced.

## Implementation

- First-party email/password registration and login, using Node 24's Argon2id implementation (64 MiB, three passes, one lane, random 16-byte salt, 32-byte output). Passwords are 12–128 characters. Constant-time derived-key comparison and equal-cost unknown-account verification. Node currently marks its crypto Argon2 API experimental; pinned Linux and Windows CI exercise it.
- Opaque random 256-bit session tokens; only SHA-256 hashes reach PostgreSQL. Sessions expire after eight hours. Login checks the verified credential hash again under an account lock to prevent password-reset races. Logout revokes the global session; resetting a password revokes every session for that identity. Disabled identities, suspended memberships/tenants and expired/revoked membership sessions remain rejected by Increment 1's resolver.
- `__Host-` HttpOnly, Secure, SameSite=Strict, Path=/ cookies, including the CSRF cookie. CSRF bootstrap returns a random token to in-memory frontend state; mutations require an allowed local Origin and matching header/cookie. No browser local/session storage for secrets. Cross-site Fetch Metadata is rejected. Browser-supplied identity/membership/permission claims are rejected by strict input schemas; business reads always resolve server membership in a transaction with existing FORCE RLS.
- Persistent atomic PostgreSQL throttle buckets enforce five attempts per account/operation and forty per source IP/operation per fifteen minutes, including successful attempts. Login, registration, recovery and reset are throttled. Forwarded-IP headers are not trusted. Throttling is conservative: a user may have to wait after repeated successful logins. No in-process-only limiter.
- Recovery tokens are random 256-bit secrets, stored hashed, single-use, twenty-minute expiry. Issuing another invalidates previous tokens. Account locking serialises password reset, recovery issuance and onboarding. Concurrent reset replay permits only one success. Reset links carry tokens in the fragment and remove them from the address bar, keeping tokens out of HTTP request URLs and referrers.
- Local-only recovery delivery writes ignored, exclusive files under `work/local-mailbox/`, directory mode 0700/files 0600 where supported. It never sends mail, returns the token through HTTP, or logs it. In local development, open the matching mailbox JSON privately and follow `resetUrl`. Treat these files as credentials and remove them after use. Windows relies on the workspace's inherited user ACLs, because POSIX modes do not implement Windows ACL isolation. Production delivery and account-email verification remain separate approval decisions.
- Registration authenticates an identity before tenant setup. Setup collects only business name and owner display name, preserving INR/Asia-Kolkata defaults. One definer function creates the tenant, owner membership, role catalogue, owner role and membership session atomically. An account lock and existing membership check prevent concurrent/duplicate first-business setup. No shop or branch is invented. Failed business setup rolls back fully and can be retried.
- Mobile screens cover registration, sign-in, recovery, reset, business setup and sign-out; include disabled/loading controls, native input validation, live error messages and minimum touch-target sizes. Existing health UI remains available.

## Database/security contract

Forward migration: `20261103000100_owner_authentication.sql` adds nullable credential hash (legacy synthetic identities remain possible), `auth.password_resets`, and `auth.attempt_buckets`. Auth tables have no PUBLIC/runtime table privileges. No existing table ownership, RLS policy or role privilege is changed.

Nine new functions: `throttle`, `credentials`, `login`, `register_owner`, `session_info`, `onboard`, `logout`, `request_reset`, `reset_password`. Each uses an explicit `pg_catalog` search path, fully qualified application tables, no dynamic client SQL, dedicated migrator ownership, and explicit runtime EXECUTE only. Runtime is still unable to write tenant tables, read global credential/session/reset tables, create schema objects or assume the migrator role. The API is the trusted credential-verification boundary; a compromised runtime credential can invoke its explicitly allowed authentication commands, so runtime DB credentials must remain server-only.

The security manifest records exact function body hashes, signatures, languages and volatility. Readiness requires the new schema and exact allowlist. Provisioning can still inspect the immutable earlier baseline to allow its forward migration, but never repairs privilege drift. Existing policies and all eight FORCE RLS requirements are checked as before.

## Verification

Automated suites cover Argon2 verification, generic login/recovery/registration results, CSRF failures, secure cookies, session rotation/logout/expiry, password reset expiry and concurrent replay, full session revocation, concurrent duplicate onboarding, transactional rollback, strict identity-claim rejection, protected reads, and the existing two-tenant/cashier isolation and context-cleanup cases. Privilege mutation scenarios also cover grants on the new auth tables, a changed onboarding function and PUBLIC reset execution. Browser tests exercise the full mobile lifecycle with synthetic data, real PostgreSQL and the local delivery adapter. Owner-flow traces are disabled to avoid serialising credentials into trace artifacts.

Linux and native Windows use the existing CI jobs, Node/npm pins and isolated PostgreSQL setup. No Docker requirement is added to application code or Windows CI. Results and review commit are reported in the PR and conversation after execution.

## Remaining decisions/limits

External delivery, email ownership verification, MFA, production HTTPS origins and transport, account-retention rules, and throttle/session housekeeping need later review before production. Development permits only four explicit loopback origins (Vite/API, localhost/127.0.0.1). Secure cookies are tested on Chromium's trusted loopback context; other local browsers may require HTTPS. The local mailbox is a development substitute for a delivery provider, not a production recovery channel. Bucket/reset/session retention is not yet scheduled; a maintenance policy is needed before production. Existing synthetic identities without credentials cannot sign in until registered through the approved flow or handled by a later reviewed migration. No default identities or passwords are seeded.

Stop after the PR for Project Manager review. Do not merge or begin another increment.

## Actual local results

- `npm run verify`: passed lint, workspace type checks/builds, 27/27 unit tests, 79/79 PostgreSQL integration/security tests, and generated OpenAPI drift checks.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`: 4/4 passed, including full mobile onboarding and reset lifecycle. System Chromium was used because the managed runtime cannot elevate to install Playwright system dependencies.
- `npm run ci:check`: passed workflow validation for Linux and native Windows PostgreSQL.
- `git diff --check`: passed.
- `npm audit --json`: 18 moderate findings, zero high/critical. These are inherited from the unchanged dependency lockfile, chiefly glob/minimatch and their dependency chains; npm's suggested fixes include major downgrades. No dependency/provider changes are made in this increment. Dependency remediation needs a separately tested maintenance change before production.
