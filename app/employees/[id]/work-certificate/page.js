'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '../../../../lib/supabaseClient';

export default function WorkCertificate() {
  const { id } = useParams();
  const supabase = createClient();
  const [employee, setEmployee] = useState(null);

  useEffect(() => {
    supabase.from('employees').select('*').eq('employee_id', id).single().then(({ data }) => setEmployee(data));
  }, [id]);

  if (!employee) return <p>Loading…</p>;

  const period = employee.date_of_leaving
    ? `from ${employee.date_of_joining} to ${employee.date_of_leaving}`
    : `since ${employee.date_of_joining}`;

  return (
    <div>
      <div className="no-print" style={{ marginBottom: 16 }}>
        <a href={`/employees/${id}`}>← Back to employee</a>{' '}
        <button onClick={() => window.print()} style={{ marginLeft: 16, padding: '6px 14px' }}>Print</button>
      </div>

      <div style={{ background: 'white', padding: 32, maxWidth: 700, margin: '0 auto' }}>
        <h1 style={{ textAlign: 'center' }}>Atelier</h1>
        <h2 style={{ textAlign: 'center', fontWeight: 'normal' }}>Certificate of Employment</h2>

        <p style={{ marginTop: 40, lineHeight: 1.8 }}>
          This is to certify that <strong>{employee.name}</strong> was employed with Atelier
          as <strong>{employee.designation}</strong> in the {employee.department} department,
          {' '}{period}.
        </p>

        <p style={{ lineHeight: 1.8 }}>
          During this period, {employee.name.split(' ')[0]}'s conduct and performance were found to be satisfactory.
          We wish them the very best in their future endeavors.
        </p>

        <p style={{ marginTop: 60 }}>Date: _____________________</p>

        <div style={{ marginTop: 60 }}>
          _____________________<br />
          Authorized signatory, Atelier
        </div>
      </div>

      <style jsx global>{`
        @media print {
          nav, .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}
