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
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.role === 'admin') {
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
