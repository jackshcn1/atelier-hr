-- Migration: Add policy_guidelines and terms to variable_pay_schemes
-- ===================================================================

alter table public.variable_pay_schemes
  add column if not exists policy_guidelines text default '• Measurement Period: Variable performance cycles run monthly from the 20th of the previous month to the 19th of the current month.\n• Data Verification & Disbursal: Metrics are synced directly from Petpooja POS and management audits. Monthly payouts are disbursed alongside the monthly salary following attendance review.\n• Attendance Floor: Payout eligibility requires satisfactory attendance during the designated cycle. Unexcused absences or disciplinary actions may result in forfeiture.';

alter table public.variable_pay_schemes
  add column if not exists terms_and_conditions text default 'I acknowledge and understand the performance criteria, weighted allocation, and target metrics specified in this policy document. I understand that variable incentives are calculated based on verifiable operational metrics and attendance.';

notify pgrst, 'reload schema';
