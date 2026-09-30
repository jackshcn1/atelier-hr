'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

// The exit clearance page moved to /exit-clearance?id=<employee_id>, where it
// became a working checklist rather than a print-only document. This route
// stays so any saved link to the old path keeps working.
export default function ExitClearanceRedirect() {
  const { id } = useParams();
  const router = useRouter();

  useEffect(() => {
    if (id) router.replace(`/exit-clearance?id=${id}`);
  }, [id, router]);

  return (
    <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
      Redirecting to the exit clearance workspace…
    </div>
  );
}