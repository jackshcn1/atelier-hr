'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabaseClient';

export default function DocumentReaderPage() {
  const params = useParams();
  const docId = params?.id;
  const router = useRouter();
  const supabase = createClient();

  const [document, setDocument] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [employeeProfile, setEmployeeProfile] = useState(null);
  const [pdfSignedUrl, setPdfSignedUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Intercept and block print/save keyboard shortcuts
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P' || e.key === 's' || e.key === 'S' || e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (docId) loadDocument(docId);
  }, [docId]);

  async function loadDocument(id) {
    setLoading(true);
    setError('');

    // 1. Get current user & employee record for dynamic watermark
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);

    if (user) {
      const { data: emp } = await supabase
        .from('employees')
        .select('name, employee_id, department, designation')
        .ilike('email', user.email)
        .maybeSingle();

      setEmployeeProfile(emp);
    }

    // 2. Fetch company document
    const { data: doc, error: docErr } = await supabase
      .from('company_documents')
      .select('*')
      .eq('id', id)
      .single();

    if (docErr || !doc) {
      setError('Document not found or access restricted.');
      setLoading(false);
      return;
    }

    setDocument(doc);

    // If PDF, generate a signed URL from storage bucket
    if (doc.doc_type === 'pdf' && doc.file_url) {
      const { data: signedData, error: signedErr } = await supabase.storage
        .from('documents')
        .createSignedUrl(doc.file_url, 3600); // 1 hour temporary access

      if (!signedErr && signedData) {
        setPdfSignedUrl(signedData.signedUrl);
      }
    }

    setLoading(false);
  }

  // Dynamic forensic watermark text
  const viewerName = employeeProfile?.name || currentUser?.email?.split('@')[0] || 'User';
  const viewerId = employeeProfile?.employee_id ? `ID: ${employeeProfile.employee_id}` : '';
  const timestamp = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const watermarkText = `CONFIDENTIAL • ATELIER RESTAURANT • ${viewerName.toUpperCase()} ${viewerId} • ${timestamp}`;

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#6b7280' }}>
        Loading document in protected viewer...
      </div>
    );
  }

  if (error || !document) {
    return (
      <div style={{ padding: 30, maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', padding: 16, borderRadius: 8 }}>
          {error || 'Document not found.'}
        </div>
        <div style={{ marginTop: 16 }}>
          <a href="/documents" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
            ← Back to Training & SOPs Hub
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      onContextMenu={e => e.preventDefault()}
      style={{
        position: 'relative',
        minHeight: '85vh',
        maxWidth: 900,
        margin: '0 auto',
        userSelect: 'none',
        WebkitUserSelect: 'none'
      }}
    >
      {/* Top Reader Navigation Bar */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#111827',
          color: 'white',
          padding: '12px 18px',
          borderRadius: 8,
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 10
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a
            href="/documents"
            style={{ color: '#93c5fd', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}
          >
            ← Back
          </a>
          <span style={{ color: '#4b5563' }}>|</span>
          <span style={{ fontSize: 12, background: '#374151', padding: '2px 8px', borderRadius: 4 }}>
            {document.category.toUpperCase()}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#f3f4f6' }}>
            {document.title}
          </span>
        </div>

        <div style={{ fontSize: 11, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>🔒 Protected Reader</span>
          <span>•</span>
          <span>Viewing as: {viewerName}</span>
        </div>
      </div>

      {/* Reader Container with Forensic Watermark Overlay */}
      <div
        style={{
          position: 'relative',
          background: 'white',
          borderRadius: 10,
          border: '1px solid #d1d5db',
          boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
          overflow: 'hidden',
          padding: document.doc_type === 'article' ? '32px 28px' : '0'
        }}
      >
        {/* Repeating Dynamic Forensic Watermark Shield */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 20,
            opacity: 0.07,
            display: 'flex',
            flexWrap: 'wrap',
            alignContent: 'space-around',
            justifyContent: 'space-around',
            padding: 20,
            overflow: 'hidden'
          }}
        >
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              style={{
                transform: 'rotate(-28deg)',
                fontSize: 13,
                fontWeight: 900,
                color: '#000000',
                letterSpacing: 2,
                whiteSpace: 'nowrap',
                margin: '25px 20px',
                userSelect: 'none'
              }}
            >
              {watermarkText}
            </div>
          ))}
        </div>

        {/* Content Type 1: In-App Authored Article / SOP */}
        {document.doc_type === 'article' ? (
          <div style={{ position: 'relative', zIndex: 10 }}>
            <div style={{ borderBottom: '2px solid #111827', paddingBottom: 14, marginBottom: 20 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>
                Atelier Restaurant Standard Operating Procedure
              </span>
              <h1 style={{ margin: '6px 0 6px 0', fontSize: 24, fontWeight: 800, color: '#111827' }}>
                {document.title}
              </h1>
              {document.description && (
                <p style={{ margin: 0, fontSize: 14, color: '#4b5563', lineHeight: 1.5 }}>
                  {document.description}
                </p>
              )}
            </div>

            {/* Rendered HTML Content */}
            <div
              style={{
                fontSize: 15,
                lineHeight: 1.7,
                color: '#1f2937'
              }}
              dangerouslySetInnerHTML={{ __html: document.content_html || '<p>No content added yet.</p>' }}
            />
          </div>
        ) : (
          /* Content Type 2: Embedded Protected PDF Viewer */
          <div style={{ position: 'relative', height: '80vh', width: '100%' }}>
            {pdfSignedUrl ? (
              <iframe
                src={`${pdfSignedUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                title={document.title}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  display: 'block'
                }}
              />
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
                Generating secure document link...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Strict Anti-Print CSS */}
      <style jsx global>{`
        @media print {
          body {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
