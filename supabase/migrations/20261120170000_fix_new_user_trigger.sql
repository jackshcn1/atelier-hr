-- Fix the new-user trigger: it could not find the tables it reads.
--
-- ## What was broken
--
-- `public.handle_new_user()` runs AFTER INSERT on `auth.users` and creates the
-- profile row for a new sign-up. It is `SECURITY DEFINER`, and it had **no
-- `search_path` of its own** — so it inherited the caller's.
--
-- GoTrue inserts into `auth.users` with an **empty** `search_path`. The
-- trigger therefore looked for an unqualified `employees` and an unqualified
-- `profiles`, and Postgres said:
--
--     ERROR: relation "employees" does not exist
--
-- The whole INSERT failed, so **creating a user failed** — every time, for
-- everybody. The app's own "Add user" drawer (`POST /api/admin/create-user`,
-- which calls `auth.admin.createUser`) answered with a 500 and the same
-- error, and a new sign-up answered "Database error saving new user".
--
-- Verified on 20 Nov 2026: the same INSERT succeeded when run with
-- `search_path = public`, and failed without it.
--
-- ## The fix
--
-- The tables are named in full — `public.employees`, `public.profiles` — and
-- the function is given `search_path = ''`, so it reads exactly the two
-- tables it means and cannot be walked into another schema by whoever
-- happens to be calling it.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
DECLARE
  matching_emp record;
BEGIN
  SELECT * INTO matching_emp
  FROM public.employees
  WHERE lower(email) = lower(new.email)
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.profiles (
      id, employee_id, email, display_name, department, role,
      department_scope, access_status, permissions
    )
    VALUES (
      new.id,
      matching_emp.employee_id,
      new.email,
      matching_emp.name,
      matching_emp.department,
      'employee',
      'own_department',
      'active',
      '{}'::jsonb
    )
    ON CONFLICT (id) DO UPDATE
    SET
      email = new.email,
      employee_id = matching_emp.employee_id,
      display_name = matching_emp.name,
      department = matching_emp.department;
  ELSE
    -- No employee record with that email: a plain account.
    INSERT INTO public.profiles (
      id, email, role, department_scope, access_status, permissions
    )
    VALUES (
      new.id,
      new.email,
      'employee',
      'own_department',
      'active',
      '{}'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET email = new.email;
  END IF;

  RETURN new;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Creates the profile row for a new sign-up. The tables are named in full because this function runs with an empty search_path - GoTrue sets one - and an unqualified name would not be found.';
