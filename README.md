# Rizal Life

Rizal Life is a role-based course workspace for managing learning tasks, student evidence, teacher reviews, and verified progress. It uses Supabase Auth, PostgreSQL, and private Supabase Storage, with a small Node.js server that keeps administrative credentials out of the browser.

## Requirements

- Node.js 22 or newer
- A Supabase project

## 1. Create the Supabase database

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** in the project dashboard.
3. Create a new query, paste the entire contents of `supabase/schema.sql`, and run it.

This creates profiles, classes, enrollments, tasks, submissions, indexes, and Row Level Security policies. After signing in, the teacher creates classes, adds students to each class, and creates tasks for the selected class.

If the project was set up before class support was added, run `supabase/sections-migration.sql` once in the SQL Editor instead of rerunning the complete schema. The database keeps the internal table name `sections`, while the application consistently uses “Class” for users.

For an existing project, also run `supabase/security-hardening.sql` after the class migration. It removes overly broad Row Level Security policies and prevents teachers from reading or changing records outside their own classes.

Run `supabase/storage-migration.sql` once to create the private image-evidence bucket. The server issues short-lived signed URLs; the bucket is never public.

For an existing project, run `supabase/quest-card-migration.sql` once before deploying the Quest Card feature. It assigns every existing quest a stable slot from 1–24 within its class and prevents duplicate slots.

## 2. Configure local environment variables

Create a local `.env` file. In the Supabase dashboard, open **Project Settings > Data API** and copy the project URL and publishable key. Then open **Project Settings > API Keys** and create or copy a server secret key.

Fill in `.env`:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SECRET_KEY=your-secret-key
APP_URL=https://your-production-domain.example
PORT=8765
```

Never expose or commit `SUPABASE_SECRET_KEY`. It bypasses Row Level Security and is used only by the Node server.

### Configure student invitations

RizLife generates a one-time Supabase invitation and opens a prepared Outlook Web message for the teacher to send from their APC account. No custom SMTP provider is required.

1. Under **Authentication > URL Configuration**, set the Site URL to the production application URL and allow `https://your-production-domain.example/accept-invite` as a Redirect URL.
2. Set `APP_URL` to the same production origin in Vercel. Do not include a trailing slash.

The prepared message uses a confirmation page before the real verification URL is opened. This reduces the chance that automated email link scanners consume the one-time invitation link.

Each invitation records the teacher-selected section in both the student enrollment and email metadata. Visiting `/accept-invite` without the signed invitation parameters does not activate an account or enroll a student; it displays an invalid-invitation message. Only the latest valid one-time Supabase invitation can establish the invitation session.

### Bulk student import

Teachers can preview and import CSV or Excel rosters from the Students page. Required columns are `Student Name` and `Student Email`; `Student ID` and `Section` are optional. Before enabling this feature on an existing database, run `supabase/student-number-migration.sql` once in the Supabase SQL Editor. Imports are limited to 500 rows and 2.5 MB, are validated again on the server, and only target sections owned by the signed-in teacher.

Teachers can also use **Add student** for manual, one-at-a-time enrollment. The manual form accepts the same name, email, and optional Student ID fields. Existing accounts are linked to the selected section; new accounts receive a prepared Outlook invitation.

### Join codes and student self-registration

For an existing database, run `supabase/join-codes-migration.sql`, `supabase/join-code-recovery-migration.sql`, and `supabase/pending-registration-migration.sql` once in the SQL Editor. Each section has at most one active join code. The code remains valid until its teacher replaces or revokes it, and it stays visible and copyable after refresh. Codes created before the recovery migration were stored as hashes only; they still work but must be replaced once before they can be displayed again.

Students without accounts may register using their full name, official `@student.apc.edu.ph` address, Student ID, password, and a valid join code. Because email delivery is not configured, this does not prove ownership of the Outlook mailbox. The account remains inactive until the teacher compares the submitted details with the official roster and approves it. Rejected, unapproved accounts are removed so corrected details can be submitted again.

## 3. Install dependencies

```powershell
npm install
```

## 4. Create the first accounts

Create a teacher:

```powershell
npm run create-user -- teacher@example.edu "ChangeThisPassword!" "Professor Name" teacher
```

Create a student:

```powershell
npm run create-user -- student@example.edu "ChangeThisPassword!" "Student Name" student
```

The script creates a confirmed Supabase Auth user and the matching secured profile. It is intended for local administrator setup only; do not place real passwords in shell history, documentation, issues, or commits.

## 5. Run the application

```powershell
npm start
```

Open `http://127.0.0.1:8765`.

## Security model

- Supabase Auth verifies email and password accounts.
- Students can submit evidence and read only their own submission records.
- Students cannot approve work or change verification fields.
- Teachers can manage quests and review submissions.
- Every exposed table has Row Level Security enabled.
- The Supabase secret key stays on the server and is excluded by `.gitignore`.
- Student proof images are stored in a private Supabase Storage bucket with a 5 MB limit and short-lived signed URLs.

## Project structure

```text
public/               Browser interface served by Node
src/server/           HTTP server, routes, auth, and utilities
scripts/              Local administration utilities
supabase/             Database schema and migrations
serve.mjs             Small application entry point
.env                  Local-only environment configuration (ignored by Git)
```

## Useful commands

```powershell
npm run check
npm start
npm run create-user -- <email> <password> "<full name>" <student|teacher>
```
