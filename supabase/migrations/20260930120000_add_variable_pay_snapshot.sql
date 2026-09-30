-- Migration: Variable Pay Attainment Snapshots
-- Created: 2026-09-30
--
-- Purpose: freeze a pay cycle's attainment figures the moment the cycle closes
-- on the 19th, so historical cycles ("Aug 20 - Sep 19") can never be changed by
-- a later edit or re-sync. The admin can regenerate a snapshot on demand.
--
-- Design: one row per employee per metric. Team-scoped metrics are stored with
-- employee_id = the specific employee, because attainment is computed against
-- that employee's own variable salary pool. The team aggregate itself lives in
-- variable_metric_inputs and is copied into source_detail for reference.

-- 1. Snapshot table -------------------------------------------------------
create table if not exists public.variable_pay_snapshot (
  id bigint generated always as identity primary key,
  period_id bigint not null references public.variable_pay_periods(id) on delete cascade,
  employee_id text not null references public.employees(employee_id) on update cascade on delete cascade,
  scheme_name text not null,
  scheme_display_name text,
  metric_id text not null,
  metric_name text,
  metric_type text,
  metric_direction text,
  metric_scope text,
  metric_unit text,
  weight numeric,
  target_value numeric,
  floor_value numeric,
  ceiling_value numeric,
  actual_value numeric,
  attainment_rate numeric,
  attainment_pct numeric,
  payout_amount numeric,
  variable_pool numeric,
  source_type text,
  source_filename text,
  source_detail jsonb default '{}'::jsonb,
  snapshot_at timestamptz not null default now(),
  generated_by text
);

-- Regenerating a snapshot for the same period must replace cleanly, not duplicate.
create unique index if not exists variable_pay_snapshot_unique
  on public.variable_pay_snapshot (period_id, employee_id, metric_id);

create index if not exists variable_pay_snapshot_period_idx
  on public.variable_pay_snapshot (period_id);

create index if not exists variable_pay_snapshot_employee_idx
  on public.variable_pay_snapshot (employee_id, period_id);

-- 2. Track snapshot state on the period itself ----------------------------
alter table public.variable_pay_periods
  add column if not exists snapshot_at timestamptz,
  add column if not exists snapshot_generated_by text;

-- 3. Row Level Security ---------------------------------------------------
alter table public.variable_pay_snapshot enable row level security;

drop policy if exists "vps_select" on public.variable_pay_snapshot;
-- Employees read only their own frozen figures. Admins/managers read all.
create policy "vps_select" on public.variable_pay_snapshot for select
  using (
    is_admin()
    or has_permission('view_payroll')
    or employee_id = my_employee_id()
  );

-- Only the admin service path writes snapshots. No client-side writes.
drop policy if exists "vps_write" on public.variable_pay_snapshot;
create policy "vps_write" on public.variable_pay_snapshot for all
  using (is_admin() or has_permission('view_payroll'))
  with check (is_admin() or has_permission('view_payroll'));

-- 4. Snapshot builder -----------------------------------------------------
-- Computes and stores attainment for every employee on every active scheme.
-- Idempotent: wipes the period's existing snapshot before rewriting, so the
-- admin "re-generate" button can be pressed any number of times.
create or replace function public.generate_variable_pay_snapshot(p_period_id bigint, p_generated_by text default 'system')
returns integer as $$
declare
  v_period public.variable_pay_periods;
  v_emp record;
  v_metric jsonb;
  v_inputs jsonb;
  v_rows integer := 0;
  v_period_start date;
  v_period_end date;
  v_actual numeric;
  v_target numeric := 0;
  v_floor numeric;
  v_ceiling numeric;
  v_weight numeric;
  v_type text;
  v_direction text;
  v_attainment numeric := 0;
  v_weight_frac numeric := 0;
  v_payout numeric := 0;
  v_pool numeric;
  v_source_type text;
  v_source_filename text;
  v_source_detail jsonb;
begin
  select * into v_period from public.variable_pay_periods where id = p_period_id;
  if v_period is null then
    raise exception 'Period % not found', p_period_id;
  end if;

  v_period_start := v_period.period_start;
  v_period_end := v_period.period_end;

  -- Clear any previous snapshot for this period so this is a clean rebuild.
  delete from public.variable_pay_snapshot where period_id = p_period_id;

  -- One pass per employee who has a scheme. Employees with no variable salary
  -- pool are included on purpose: their attainment percentages are still
  -- meaningful, and excluding them would hide them from the admin dashboard
  -- and drop them out of any closed cycle's history.
  for v_emp in
    select e.employee_id,
           e.name,
           e.variable_pay_scheme,
           coalesce(e.current_variable_salary, 0) as pool
    from public.employees e
    where e.deleted_at is null
      and e.variable_pay_scheme is not null
    order by e.employee_id
  loop
    for v_metric in
      select m
      from public.variable_pay_schemes s,
           lateral jsonb_array_elements(s.metrics) m
      where s.name = v_emp.variable_pay_scheme
        and s.is_active = true
    loop
      v_weight    := coalesce((v_metric->>'weight')::numeric, 0);
      v_target    := coalesce((v_metric->>'target')::numeric, 0);
      v_floor     := nullif(v_metric->>'floor', '')::numeric;
      v_ceiling   := nullif(v_metric->>'ceiling', '')::numeric;
      v_type      := coalesce(v_metric->>'type', 'binary');
      v_direction := coalesce(v_metric->>'direction', 'higher');
      v_pool      := v_emp.pool;
      v_actual    := 0;
      v_attainment := 0;
      v_payout    := 0;
      v_source_type := null;
      v_source_filename := null;
      v_source_detail := '{}'::jsonb;

      -- Individual metrics prefer this employee's own row; team metrics
      -- (employee_id is null) are the fallback for everyone on the scheme.
      -- These must be scalar targets — selecting several columns into one
      -- jsonb variable silently yields nulls.
      select mi.actual_value, mi.source_type, mi.source_filename, mi.source_detail
        into v_actual, v_source_type, v_source_filename, v_source_detail
      from public.variable_metric_inputs mi
      where mi.period_id = p_period_id
        and mi.metric_id = v_metric->>'id'
        and (mi.employee_id = v_emp.employee_id or mi.employee_id is null)
      order by (mi.employee_id is not null) desc
      limit 1;

      if not found then
        v_actual := 0;
        v_source_type := null;
        v_source_filename := null;
        v_source_detail := '{}'::jsonb;
      else
        v_actual := coalesce(v_actual, 0);
        v_source_detail := coalesce(v_source_detail, '{}'::jsonb);
      end if;

      -- Attainment mirrors lib/variablePayCalculator.js exactly.
      if v_type = 'binary' then
        if v_direction = 'higher' then
          v_attainment := case when v_actual >= v_target then 1.0 else 0.0 end;
        else
          v_attainment := case when v_actual <= v_target then 1.0 else 0.0 end;
        end if;
      else
        if v_direction = 'higher' then
          if v_floor is not null and v_actual < v_floor then
            v_attainment := 0.0;
          else
            v_attainment := case
              when v_ceiling is not null and v_actual > v_ceiling then v_ceiling / nullif(v_target, 0)
              else v_actual / nullif(v_target, 0)
            end;
          end if;
        else
          if v_floor is not null and v_actual > v_floor then
            v_attainment := 0.0;
          else
            v_attainment := case
              when v_ceiling is not null and v_actual < v_ceiling then v_target / nullif(v_ceiling, 0)
              else case when v_actual > 0 then v_target / v_actual else 1.0 end
            end;
          end if;
        end if;
      end if;

      -- Mirror lib/variablePayCalculator.js exactly, including its two-step
      -- rounding: attainment to 4dp, then earned-weight-fraction to 4dp, and
      -- only then multiplied by the pool. Rounding in one step instead would
      -- drift by a rupee against the live dashboard.
      v_attainment := round(v_attainment * 10000) / 10000;
      v_weight_frac := round(v_attainment * v_weight * 10000) / 10000;
      v_payout := round(v_weight_frac * v_pool);

      insert into public.variable_pay_snapshot (
        period_id, employee_id, scheme_name, scheme_display_name,
        metric_id, metric_name, metric_type, metric_direction, metric_scope, metric_unit,
        weight, target_value, floor_value, ceiling_value,
        actual_value, attainment_rate, attainment_pct, payout_amount, variable_pool,
        source_type, source_filename, source_detail, generated_by
      ) values (
        p_period_id, v_emp.employee_id, v_emp.variable_pay_scheme,
        (select s.display_name from public.variable_pay_schemes s where s.name = v_emp.variable_pay_scheme),
        v_metric->>'id', v_metric->>'name', v_type, v_direction, v_metric->>'scope', v_metric->>'unit',
        v_weight, v_target, v_floor, v_ceiling,
        v_actual, v_attainment, round(v_attainment * 1000) / 10, v_payout, v_pool,
        v_source_type, v_source_filename, v_source_detail, p_generated_by
      );
      v_rows := v_rows + 1;
    end loop;
  end loop;

  update public.variable_pay_periods
    set snapshot_at = now(),
        snapshot_generated_by = p_generated_by
    where id = p_period_id;

  return v_rows;
end;
$$ language plpgsql security definer;

revoke all on function public.generate_variable_pay_snapshot(bigint, text) from public, anon;
grant execute on function public.generate_variable_pay_snapshot(bigint, text) to service_role;

notify pgrst, 'reload schema';