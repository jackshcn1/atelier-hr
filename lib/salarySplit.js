// Computes the basic+DA / HRA / other-allowances split for a given fixed
// salary, using the CURRENT payroll settings. Called only at the moment a
// salary_history row is created, then the result is stored — never
// recomputed later, so changing settings never rewrites past history.
export function computeSalarySplit(fixedSalary, settings) {
  const fixed = Number(fixedSalary) || 0;
  const floor = Number(settings?.basic_da_floor) || 18000;
  const hraPct = Number(settings?.hra_split_percent) ?? 50;

  if (fixed <= floor) {
    return { basic_da: fixed, hra: 0, other_allowances: 0 };
  }
  const remainder = fixed - floor;
  const hra = Math.round(remainder * (hraPct / 100));
  const other = remainder - hra;
  return { basic_da: floor, hra, other_allowances: other };
}
