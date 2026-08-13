# Current Home — Employee Referral Portal

Internal web app for employee referrals: submit referrals, track them through the hiring funnel, earn points, and compete on the leaderboard.

**Stack:** Next.js on Vercel · Firestore · Google sign-in (currenthome.com accounts) · Gmail for notifications · daily Vercel cron for milestone points.

**Status:** project setup — v1 in development.

## Roles & access

- **Employee** — submit referrals, track their own referrals, earnings, prizes, and the leaderboard.
- **Manager** — everything an employee has, plus the Manage screens: update referral stages, people, scoring, prizes, hires, pipeline, and reporting.
- **Manager visibility** — on Update Referrals a manager sees candidates referred *for* their department (workable) **and** referrals their department's people sent to other departments (view-only, with points earned — the hiring department owns the stage moves). Reporting has two views once a department is picked — "Jobs in [dept]" (candidates referred for that department's jobs) or "Referred by [dept]" (everything that department's people referred, anywhere) — and every manager can pick any department or company-wide. On Company-wide the toggle is hidden because both views are the same there. Team matching uses each referrer's *current* department.
- **Admin** — everything a manager has, plus:
  - Grant or revoke any role, including admin (managers can't touch admin accounts).
  - **View as**: open the app exactly as another user sees it (People → "View as").

### View as (admin only)

- Strictly **read-only**, enforced on the server: while viewing as someone, any action that would change data is blocked.
- An orange banner shows who you're viewing as; Exit returns you to your own account.
- Every view-as session start and exit is written to the audit log.

Roles live on the user record in Firestore (`users.role`: `employee` | `manager` | `admin`). The `ADMIN_EMAILS` env var only bootstraps first-login manager access; it never downgrades an admin.
