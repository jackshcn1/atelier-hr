'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';

export default function Home() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function routeUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, is_super_admin, permissions')
        .eq('id', user.id)
        .maybeSingle();

      const isManagement = profile?.is_super_admin ||
        profile?.role === 'admin' ||
        profile?.role === 'super_admin' ||
        profile?.role === 'hr_manager' ||
        profile?.role === 'department_head' ||
        profile?.permissions?.manage_users ||
        profile?.permissions?.view_employees ||
        profile?.permissions?.view_payroll;

      if (isManagement) {
        router.push('/payroll');
      } else {
        router.push('/my-payslips');
      }
    }
    routeUser();
  }, []);

  return (
    <div style={{ padding: 60, textAlign: 'center', color: '#6b7280' }}>
      Loading Atelier HR...
    </div>
  );
}
