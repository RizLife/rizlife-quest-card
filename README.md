# RizLife Quest Card

RizLife is a role-based course workspace for managing learning quests, student evidence, teacher reviews, and verified progress. It uses Supabase Auth and PostgreSQL, with a small Node.js server that keeps administrative credentials out of the browser.

## Requirements

- Node.js 22 or newer
- A Supabase project

## 1. Create the Supabase database

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** in the project dashboard.
3. Create a new query, paste the entire contents of `supabase/schema.sql`, and run it.

This creates profiles, classes, enrollments, tasks, submissions, indexes, and Row Level Security policies. After signing in, the teacher creates classes, adds students to each class, and creates tasks for the selected class.

If the project was set up before class support was added, run `supabase/sections-migration.sql` once in the SQL Editor instead of rerunning the complete schema. The database keeps the internal table name `sections`, while the application consistently uses “Class” for users.

## 2. Configure local environment variables

Copy `.env.example` to `.env`:

```powershell
Copy-Item .env.example .env
```

In the Supabase dashboard, open **Project Settings > Data API** and copy the project URL and publishable key. Then open **Project Settings > API Keys** and create or copy a server secret key.

Fill in `.env`:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SECRET_KEY=your-secret-key
PORT=8765
```

Never expose or commit `SUPABASE_SECRET_KEY`. It bypasses Row Level Security and is used only by the Node server.

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

The script creates a confirmed Supabase Auth user and the matching secured profile. Use unique, strong passwords and send credentials privately.

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
- Large media remains on external learning platforms; RizLife stores lightweight links or text evidence.

## Project structure

```text
dist/                 Browser interface
scripts/create-user.mjs  Account creation utility
supabase/schema.sql   Database schema and security policies
serve.mjs             Node API and static-file server
.env.example          Environment variable template
```

## Useful commands

```powershell
npm run check
npm start
npm run create-user -- <email> <password> "<full name>" <student|teacher>
```
