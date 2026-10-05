// Phase 3: Client-side acknowledgment PDF generator (merge-field templating)
// Merges clause templates + employee data into one printable PDF
// Uses native browser window.print() + structured HTML for simplicity (no external lib needed)

export function generateAcknowledgmentPacket(employee, clauses, templates) {
  // clauses: array of selected clause names; templates: onboarding_doc_templates rows
  const names = (clauses || []).map(c => typeof c === 'string' ? c : (c.name || 'Clause'));
  const body = names.map(name => {
    const t = templates.find(x => x.name === name);
    let text = t ? (t.clause_text || '') : '';
    // Simple placeholder substitution (merge-field logic)
    const replacements = {
      '{{name}}': employee.name || '',
      '{{doj}}': employee.date_of_joining || '',
      '{{designation}}': employee.designation || '',
      '{{department}}': employee.department || '',
      '{{fixed_salary}}': '₹' + Number(employee.current_fixed_salary || 0).toLocaleString('en-IN'),
      '{{variable_scheme}}': employee.variable_pay_scheme || '',
      '{{assets_list}}': (employee.assets || []).map(a => `${a.name} (${a.asset_number || '—'})`).join(', ') || 'None',
      '{{pf_esi}}': (employee.pf_applicable ? 'PF applicable' : 'PF not applicable') + '; ' + (employee.esi_applicable ? 'ESI applicable' : 'ESI not applicable'),
    };
    Object.entries(replacements).forEach(([k, v]) => { text = text.replace(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), v); });
    return `<h3>${name}</h3><p>${text}</p>`;
  }).join('');

  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>Acknowledgment</title><style>body{font-family:serif;max-width:700px;margin:40px auto;padding:20px;line-height:1.6;color:#111}h1{font-family:sans-serif;border-bottom:3px solid #1e3a8a;padding-bottom:10px}</style></head><body><h1>Onboarding Acknowledgment — ${employee.name || ''}</h1><div>${body}</div><p style="margin-top:40px;border-top:1px solid #ccc;padding-top:10px;font-size:12px;color:#666">Signed: ${new Date().toISOString().split('T')[0]} — Employee &amp; HR signatures required.</p></body></html>`);
  win.document.close();
  win.focus();
  win.print();
  return true;
}
