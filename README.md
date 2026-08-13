# Current Home — Employee Referral Portal

Internal web app for employee referrals: submit referrals, track them through the hiring funnel, earn points, and compete on the leaderboard.

**Stack:** Next.js on Vercel · Firestore · Google sign-in (currenthome.com accounts) · Gmail for notifications · daily Vercel cron for milestone points.

**Status:** project setup — v1 in development.

## Roles & access

- **Employee** — submit referrals, track their own referrals, earnings, prizes, and the leaderboard.
- **Manager** — everything an employee has, plus the Manage screens: update referral stages, people, scoring, prizes, hires, pipeline, and reporting.
- **Visibility rule** — a referral is always visible to the person who made it and to their department's managers, with its points, no matter which department the candidate was referred to. The candidate's department is who *works* the referral (stage moves, delete); everyone else connected simply sees it. This is default behavior on every screen — there are no toggles or filters for it. A department's report covers everything connected to that department: candidates for its jobs and referrals its people made anywhere. Every manager can view any department or company-wide. Team matching uses each referrer's current department. Team matching uses each referrer's *current* department.
- **Admin** — everything a manager has, plus:
  - Grant or revoke any role, including admin (managers can't touch admin accounts).
  - **View as**: open the app exactly as another user sees it (People → "View as").

### View as (admin only)

- Strictly **read-only**, enforced on the server: while viewing as someone, any action that would change data is blocked.
- An orange banner shows who you're viewing as; Exit returns you to your own account.
- Every view-as session start and exit is written to the audit log.

Roles live on the user record in Firestore (`users.role`: `employee` | `manager` | `admin`). The `ADMIN_EMAILS` env var only bootstraps first-login manager access; it never downgrades an admin.
