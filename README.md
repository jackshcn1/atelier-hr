# Atelier HR — Phase 1 (Employee records + org chart + login)

## What's in this phase
- Login (accounts created by you in Supabase directly, no public sign-up)
- Employee list + add employee
- Employee detail page: edit, salary history log, track record (notes/warnings/merits)
- Org chart (auto-generated from each employee's manager)
- Department-scoped access already enforced at the database level

## Deploy steps

### 1. Supabase (the database)
1. Go to supabase.com, sign up free, create a new project.
2. Open the **SQL Editor** tab → New query → paste in the entire contents of `supabase-schema.sql` from this project → Run.
3. Go to **Project Settings → API** — copy the **Project URL** and the **anon public** key. You'll need these in step 3.
4. Go to **Authentication → Users → Add user** to create your own login (and later, one per department head).
5. Go to the **Table Editor → profiles** table and add a row for yourself: `id` = your new user's ID (copy from the Users list), `role` = `admin`.
6. In **Table Editor → departments**, add your department names (e.g. Kitchen, Service, Accounts) — employees can't be assigned to a department that doesn't exist here yet.

### 2. GitHub (to hand the code to Vercel)
1. Go to github.com, sign up free, create a new repository (e.g. `atelier-hr`).
2. On the repo page, use "Add file → Upload files" and drag in every file and folder from this project, keeping the folder structure intact.
3. Commit.

### 3. Vercel (hosting)
1. Go to vercel.com, sign up free (you can sign up with your GitHub account directly).
2. New Project → import the `atelier-hr` repo.
3. Before deploying, open **Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL from Supabase
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon key from Supabase
4. Click Deploy. You'll get a live link like `atelier-hr.vercel.app`.

### 4. Try it
- Open the live link → Log in with the account you created in step 1.4.
- Add a department head: create their login in Supabase Authentication, then add their `profiles` row with `role = department_head` and their `department` filled in. They'll only see employees in that department.

If anything errors, copy the exact message (or a screenshot) back into the chat and I'll send you an updated file to re-upload.
