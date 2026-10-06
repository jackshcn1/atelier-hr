-- =====================================================================
-- Migration: Seed Standard Onboarding Clause Templates & Policies
-- =====================================================================

insert into public.onboarding_doc_templates (name, clause_text, default_applicable, default_condition, is_active)
values
  (
    '1. Offer Letter & Employment Terms',
    'We are pleased to confirm your appointment at Atelier as {{designation}} in the {{department}} department, commencing on {{doj}}. Your employment is on a {{employment_type}} basis with standard daily operational hours of 10 hours per shift. You agree to perform the duties assigned to your role diligently and adhere to all operational guidelines.',
    'employment_type',
    'all',
    true
  ),
  (
    '2. Compensation Structure & Statutory Payment Plan',
    'Your monthly compensation is set at a Fixed Gross CTC of {{fixed_salary}} per month. In addition, you are eligible for the Variable Incentive Scheme ({{variable_scheme}}). Statutory Kerala payroll allocations apply as follows: {{salary_split}}. Statutory coverage: {{pf_esi_status}}. Salaries are disbursed monthly following attendance verification.',
    'employment_type',
    'all',
    true
  ),
  (
    '3. Code of Conduct, Punctuality & Attendance Policy',
    'Atelier maintains high standards of guest hospitality and hygiene. Punctual attendance for scheduled shifts is mandatory. Any planned leave must be requested at least 7 days in advance. Unexcused absence or absconding without notice will result in disciplinary action and forfeiting of accrued variable incentives.',
    'department',
    'all',
    true
  ),
  (
    '4. Prevention of Sexual Harassment (POSH) Policy',
    'Atelier is committed to providing a safe, respectful, and dignified work environment for all employees. Harassment of any nature—verbal, physical, or psychological—will not be tolerated and is subject to immediate disciplinary termination and legal reporting under the POSH Act, 2013.',
    'department',
    'all',
    true
  ),
  (
    '5. Asset Allocation, Uniforms & Security Deposits',
    'The company has issued the following assets and equipment for your operational duties: {{assets_list}}. You are required to maintain all items in clean, undamaged condition. In the event of loss or willful damage, repair/replacement charges will be deducted from your deposit or final salary clearance.',
    'assets_assigned',
    'assets_assigned',
    true
  ),
  (
    '6. Company Accommodation & Facility Guidelines',
    'Staff utilizing company accommodation agree to maintain cleanliness, adhere to quiet hours, respect fellow residents, and safeguard all room keys and furnishings. The accommodation deposit of {{assets_list}} is refundable upon exit handover in good order.',
    'assets_assigned',
    'accommodation',
    true
  ),
  (
    '7. Confidentiality, Food Safety & Non-Disclosure',
    'All recipes, culinary preparation methods, vendor pricing, guest details, and financial metrics of Atelier are strictly proprietary. You agree not to disclose, replicate, or share any trade secrets or proprietary workflows with external third parties during or after your tenure.',
    'department',
    'all',
    true
  )
on conflict do nothing;

notify pgrst, 'reload schema';
