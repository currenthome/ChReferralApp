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

## Phone and desktop

One breakpoint, at 900px. Below it, the app is exactly what it always was — a 460px column with the nav in a bar pinned to the bottom. Nothing in the desktop work touches it.

Above it:

- The nav moves into the dark header on every page, including the manager and recruiting screens, which previously had none. The bottom bar is hidden.
- Manager and recruiting screens (`<Shell wide>`) run to 1240px, 1400px past a 1500px window.
- Keyboard focus outlines apply at **every** width — tabbing with no visible focus was a defect, and an outline that only shows while tabbing can't affect a touch screen.

Reading, form and list pages run to 880px, and their content fills it: every repeating list of cards is wrapped in a `.cardlist` that lays out two across above the breakpoint and does nothing below it. Hub tiles go two across and slimmer. Short fields pair up inside an `.f2desk`. That pairing matters — a wider column on its own just stretches the phone layout, which is what the first attempt got wrong.

**Home has two layouts, not one that stretches.** Both are in the page; `.mobonly` and `.deskonly` switch between them at the breakpoint. The desktop one is a four-figure strip (rank, points this month, referrals in play, cash paid), the standings as a table with hires beside points, and one column with the single real button plus quiet links. The phone one is the original hero, bar chart and tiles.

That pattern — a second layout rather than a wider one — is the approach for any other screen that needs a desktop design. Widening the phone layout was tried first and pulled back: two columns of phone components reads as a wide phone, not a desktop page.

To check a desktop layout without signing in, screenshot the real markup against the real stylesheet rather than guessing; the Playwright runtime at `~/.claude/.sf-docs-runtime/venv` can do it against a static harness.

## Recruiting access (v2)

The recruiting side — classes, candidates, interviews and scorecards, reporting, forecast — lives under `/recruiting` and has its own access, separate from the referral roles above.

- **Where it lives** — `users.v2Access`: `exec` | `recruiter` | `dept-manager`, or empty for no access. It's independent of `users.role`: a referral-side manager gets nothing here without a level, and a recruiter needs no referral-side role.
- **exec** — everything, across every department, including the shared settings (cost categories, separation reasons).
- **recruiter** — everything day to day across every department: candidates, scoring, classes, reports, ATS entry. Not the shared settings.
- **dept-manager** — the same work, limited to their own `users.dept`. A department manager with no department set sees nothing, on purpose.
- **Hidden until launch** — while `V2_ENABLED` is not `"true"`, only emails in `V2_PREVIEW_EMAILS` can reach recruiting, and they still need a level. At launch, set `V2_ENABLED=true` and the allow-list stops mattering.
- **Enforcement** — `requireV2()` in `lib/server.js`, called by every recruiting API route. `V2Guard` and the hidden nav are convenience only; the server decides.

Access is set in one place for both sides of the app: **Manage → People**. To set it from the command line — useful before the People screen carries recruiting access — use `node scripts/set-recruiting-access.mjs <email> <exec|recruiter|dept-manager|none>`. The person needs to have signed in once so a record exists.

### What's built

- **Classes** (`/recruiting/classes`) — request a class (department, role, date, location, headcount) and watch it fill. Seats are worked out from the candidates pointing at the class, never stored, so the count can't drift. A class is one record that later gains its roster and outcome fields once its date passes — it never becomes a second "past class" record.
- **Fixing mistakes** — a class can be edited or deleted from the same form that requests it. Date, location and size always change; department and role only while nobody is attached, since changing either would strand them. A class with anyone still pointing at it won't delete, and says who's in the way. On the candidate panel, a Class control moves someone between classes for their role or takes them out of one, and Delete candidate removes an entry made by mistake — never once they're hired, because their class report counts them and a referral may be paying out on them.
- **Pipeline** (`/recruiting/pipeline`) — every active candidate by stage: Interviewing → Offer extended → Offer accepted → Hired. On hold and rejected sit off to the side. Open anyone to schedule an interview, move them, or hire them.
- **Adding a candidate** — one form, because it's one phone call: name, mobile, which class they're for, resume, pre-screen notes, and the first interview. Candidates are only added after a pre-screen, which is how the team actually works. The class comes before the department and role and sets both, since "put them in that class" is how the work is actually described; department and role stay editable for a hire with no class.
- **Hiring** asks for the person's first day, pre-filled with their class date. Every retention milestone counts from that date, and it's the date handed to the referral side so the referrer's points start on the right day.
- **Sub-roles per department** live in `config/roles` (editable by execs), falling back to the defaults in `lib/recruiting.js`.
- **Scorecards** (`/recruiting/scorecards`) — one form per department, role, and interview type. Build your own sections and add any mix of graded (1–10), yes/no, and Custom Question items. Every question type takes an optional note, yes/no included — the stored type for a Custom Question is still `note`, so nothing needs migrating. Publishing locks the form; reopening it for edits only affects interviews scored from then on. Recruiters and execs build any department's forms; a department manager builds their own.
- **Scoring an interview** — the matching form loads itself, with a panel of what earlier interviewers said so nobody scores in a vacuum. The score is the average of the graded questions, rounded. Saving writes a copy of the completed form onto that interview, so later edits to the form never rewrite what someone was scored on. An interview is scored once.
- **Start from a referral** — the Add candidate form opens with a search across referrals employees have already submitted: by name, or by any three digits of a phone number, showing up to eight matches. Picking one fills in the name, phone and department, carries any resume across, and links the two by id, so the referrer gets paid regardless of how the phone number was typed. Referrals already in the pipeline, marked not moving forward, or hired aren't offered, and one referral can only be started once. Department managers only see referrals to their own department.
- **Referral matching** — for candidates typed in by hand, their mobile number is checked against the referrals already in the system. Exactly one match links them and the candidate shows "Referred by [name] · [department]"; the referrer's department is read fresh from their user record, so it follows them if they move teams. No match means they're simply a job-board applicant. Two or more referrals on the same number link nobody and raise a note on the candidate for a person to sort out — guessing would eventually pay the wrong employee. Either way the link only records who referred them; the referral itself isn't touched until they're hired.

- **Reports** (`/recruiting/reports`) — three views off one set of numbers:
  - *By class* — how one class turned out: hired, started, graduated, still here, what it cost all in, cost per hire and per person still here, and the whole run from applicant to a year on the job. The roster is the people hired into that class; tap anyone to record whether they showed up, graduated, or left.
  - *By month* — every class in a month added up. Pick several months to compare, with per-month averages.
  - *Who left* — how many, why, average time before leaving, by department, and turnover per class worst-first.
- **Costs** — categories are editable, each one either *per class* (entered on the class, e.g. ad spend) or *monthly* (entered once a month and split across that month's classes by how many people each hired, e.g. payroll and tools). The shares add up to the whole pool, so nothing goes missing or gets double counted. A month with no hires shows its overhead but can't split it.
- **Retention** counts each person from their own first day, and a milestone stays blank until enough time has passed to judge it — someone hired last week isn't a one-year failure.
- **Forecast** (`/recruiting/forecast`) — set a team size and a date and it works backwards through your own history to the hires, interviews, prescreens, applicants and ad spend it would take, plus a month-by-month ramp. Volume is spread evenly; it doesn't model the lag between sourcing someone and them starting, which the build spec leaves out of launch on purpose.
- **Separation dates recorded here are for recruiting's own reporting.** They are not written back to the referral side — a manager still records a termination in Manage → Hires exactly as they do today. That's out of scope for launch by decision.

- **Activity** (`/recruiting/activity`) — who changed what, newest first, in plain sentences. It reads the audit trail the app already writes; nothing extra is recorded for it. People see only their own department's activity unless they're a recruiter or exec; shared-settings changes are visible to those two only.
- **Hire write-back** — the one place recruiting writes into the referral side, and it writes exactly two things: advance the referral to Hired, and set the start date. The daily job then pays the referrer on that date and again at day 30, exactly as it does for a hire a manager records by hand. It never touches points or the awarded flags.
  - Payroll, recruiting and Skip get the same hire email they get when a manager advances a referral by hand, carrying the person's actual first day. Only on the run that actually advances the referral, so it can't send twice. Email failures can never undo the hire.
  - Safe to run twice: a referral already at Hired gets no second timeline entry, and an existing start date is never overwritten.
  - The timeline gets one entry marked as coming from recruiting, rather than inventing the stages in between.
  - A referral marked "not moving forward" is left alone and the recruiter is told why — the daily job ignores those anyway, so advancing it would look paid and never pay. A manager reopens it.
  - Nothing is written when the match was ambiguous, because no link was ever made.

- **Demo data for UAT** — `node scripts/seed-recruiting-demo.mjs` fills the recruiting side with a year of classes, candidates, interviews, costs and published scorecard forms so every report and the forecast have something to show. Dates are worked out from the day it runs, so nothing looks stale. Every record carries `demo: true`.
  - Demo phone numbers sit in a fake range and are checked against the real referrals before anything is written — the script refuses to run if one would collide, because hiring a demo candidate that matched a real referral would advance it and email payroll.
  - Clear it from inside the app: **Recruiting → Purge demo data** (executives only, type PURGE to confirm), or `node scripts/seed-recruiting-demo.mjs purge`. The purge only ever matches `demo: true`, and is audited.
  - The banner and the button disappear once there's no demo data left.

**Launch sequence:** Skip approves in UAT → purge the demo data → set real recruiting access on live users → set `V2_ENABLED=true`.
