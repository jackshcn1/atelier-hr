'use client';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { createClient } from '../../lib/supabaseClient';

const CATEGORIES = [
  { id: 'all', label: 'All Resources', icon: '📚' },
  { id: 'sop', label: 'SOPs & Workflows', icon: '🧑‍🍳' },
  { id: 'policy', label: 'Company Policies', icon: '📋' },
  { id: 'food_safety', label: 'Food Safety & Hygiene', icon: '🛡️' },
  { id: 'training', label: 'Training Materials', icon: '🎓' },
  { id: 'targets', label: 'Department Targets', icon: '🎯' }
];

function DocumentsHubContent() {
  const supabase = createClient();

  const [documents, setDocuments] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [canManageDocs, setCanManageDocs] = useState(false);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedDept, setSelectedDept] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Upload/Create Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingDocId, setEditingDocId] = useState(null);
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState('sop');
  const [formDept, setFormDept] = useState('');
  const [formType, setFormType] = useState('article'); // 'article' | 'pdf'
  const [formDescription, setFormDescription] = useState('');
  const [formContent, setFormContent] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadUserAndDocs();
  }, []);

  async function loadUserAndDocs() {
    setLoading(true);
    setError('');

    // 1. User & permissions
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      setCurrentUserProfile(profile);
      const isPrivileged = profile?.is_super_admin || profile?.role === 'admin' || profile?.permissions?.manage_documents;
      setCanManageDocs(!!isPrivileged);
    }

    // 2. Fetch departments
    const { data: depts } = await supabase.from('departments').select('name').order('name');
    setDepartments((depts || []).map(d => d.name));

    // 3. Fetch documents
    const { data: docs, error: docsErr } = await supabase
      .from('company_documents')
      .select('*')
      .order('id', { ascending: false });

    if (docsErr) setError(docsErr.message);
    else setDocuments(docs || []);

    setLoading(false);
  }

  function handleOpenCreateModal(doc = null) {
    if (doc) {
      setEditingDocId(doc.id);
      setFormTitle(doc.title);
      setFormCategory(doc.category);
      setFormDept(doc.department || '');
      setFormType(doc.doc_type);
      setFormDescription(doc.description || '');
      setFormContent(doc.content_html || '');
      setSelectedFile(null);
    } else {
      setEditingDocId(null);
      setFormTitle('');
      setFormCategory('sop');
      setFormDept('');
      setFormType('article');
      setFormDescription('');
      setFormContent('');
      setSelectedFile(null);
    }
    setShowModal(true);
    setError('');
    setMessage('');
  }

  async function handleSaveDocument(e) {
    e.preventDefault();
    if (!formTitle.trim()) {
      setError('Please enter a document title.');
      return;
    }

    setUploading(true);
    setError('');

    let fileUrl = null;
    let fileName = null;

    // Handle PDF upload if chosen
    if (formType === 'pdf' && selectedFile) {
      const ext = selectedFile.name.split('.').pop();
      const path = `company_docs/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('documents')
        .upload(path, selectedFile, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadErr) {
        setError(`Failed to upload PDF: ${uploadErr.message}`);
        setUploading(false);
        return;
      }
      fileUrl = uploadData.path;
      fileName = selectedFile.name;
    }

    const payload = {
      title: formTitle.trim(),
      category: formCategory,
      department: formDept || null,
      doc_type: formType,
      description: formDescription.trim(),
      content_html: formType === 'article' ? formContent : null,
      updated_at: new Date().toISOString()
    };

    if (fileUrl) {
      payload.file_url = fileUrl;
      payload.file_name = fileName;
    }

    if (editingDocId) {
      // Update existing
      const { error: updateErr } = await supabase
        .from('company_documents')
        .update(payload)
        .eq('id', editingDocId);

      if (updateErr) setError(updateErr.message);
      else {
        setMessage('✓ Document updated successfully.');
        setShowModal(false);
        loadUserAndDocs();
      }
    } else {
      // Create new
      payload.created_by = currentUser?.email || 'admin';
      const { error: insertErr } = await supabase
        .from('company_documents')
        .insert([payload]);

      if (insertErr) setError(insertErr.message);
      else {
        setMessage('✓ Document published successfully.');
        setShowModal(false);
        loadUserAndDocs();
      }
    }
    setUploading(false);
  }

  async function handleDeleteDocument(doc) {
    if (!window.confirm(`Delete document "${doc.title}"? This cannot be undone.`)) return;

    const { error: delErr } = await supabase
      .from('company_documents')
      .delete()
      .eq('id', doc.id);

    if (delErr) setError(delErr.message);
    else {
      setMessage('✓ Document removed.');
      loadUserAndDocs();
    }
  }

  // Filtered documents list
  const filteredDocs = useMemo(() => {
    return documents.filter(doc => {
      // Category filter
      if (selectedCategory !== 'all' && doc.category !== selectedCategory) return false;

      // Department filter
      if (selectedDept !== 'all') {
        if (selectedDept === 'company_wide' && doc.department !== null) return false;
        if (selectedDept !== 'company_wide' && doc.department !== selectedDept && doc.department !== null) return false;
      }

      // Search query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        doc.title.toLowerCase().includes(q) ||
        (doc.description || '').toLowerCase().includes(q) ||
        (doc.department || '').toLowerCase().includes(q) ||
        doc.category.toLowerCase().includes(q)
      );
    });
  }, [documents, selectedCategory, selectedDept, searchQuery]);

  return (
    <div>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0' }}>Training Materials & SOPs</h1>
          <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
            Official restaurant workflows, standard operating procedures, hygiene protocols, and company policies.
          </p>
        </div>

        {canManageDocs && (
          <button
            onClick={() => handleOpenCreateModal()}
            style={{
              background: '#059669', color: 'white', border: 'none', padding: '10px 18px',
              borderRadius: 6, fontWeight: 'bold', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            ➕ Upload / Create Document
          </button>
        )}
      </div>

      {/* Notifications */}
      {message && (
        <div style={{ background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', padding: '10px 16px', borderRadius: 6, marginBottom: 16, fontWeight: 500 }}>
          {message}
        </div>
      )}
      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', padding: '10px 16px', borderRadius: 6, marginBottom: 16, fontWeight: 500 }}>
          {error}
        </div>
      )}

      {/* Category Tabs (Mobile Scrollable) */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 16, scrollbarWidth: 'none' }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            style={{
              padding: '8px 14px',
              borderRadius: 20,
              border: selectedCategory === cat.id ? 'none' : '1px solid #d1d5db',
              background: selectedCategory === cat.id ? '#111827' : 'white',
              color: selectedCategory === cat.id ? 'white' : '#374151',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <span>{cat.icon}</span>
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Department Filter & Search Bar */}
      <div style={{ background: 'white', padding: 14, borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <input
          type="text"
          placeholder="🔍 Search SOPs, guidelines, policies..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ flex: 1, minWidth: 240, padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
        />

        <select
          value={selectedDept}
          onChange={e => setSelectedDept(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, background: 'white' }}
        >
          <option value="all">All Departments Scope</option>
          <option value="company_wide">Company-Wide (All Staff)</option>
          {departments.map(d => (
            <option key={d} value={d}>{d} Department Only</option>
          ))}
        </select>
      </div>

      {/* Documents Grid */}
      {loading ? (
        <div style={{ background: 'white', padding: 40, textAlign: 'center', borderRadius: 8, color: '#6b7280' }}>
          Loading training materials and SOPs...
        </div>
      ) : filteredDocs.length === 0 ? (
        <div style={{ background: 'white', padding: 48, textAlign: 'center', borderRadius: 8, border: '1px solid #e5e7eb', color: '#6b7280' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📚</div>
          <div style={{ fontWeight: 600, color: '#374151', fontSize: 16 }}>No documents found</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            Try selecting another category or clear your search query.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {filteredDocs.map(doc => {
            const catInfo = CATEGORIES.find(c => c.id === doc.category) || { label: doc.category, icon: '📄' };
            const isPdf = doc.doc_type === 'pdf';

            return (
              <div
                key={doc.id}
                style={{
                  background: 'white',
                  borderRadius: 10,
                  border: '1px solid #e5e7eb',
                  padding: '16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                }}
              >
                <div>
                  {/* Category Pill & Dept Scope */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, background: '#f3f4f6', color: '#374151', padding: '3px 8px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {catInfo.icon} {catInfo.label}
                    </span>

                    <span style={{ fontSize: 11, fontWeight: 600, color: doc.department ? '#7c3aed' : '#047857', background: doc.department ? '#f5f3ff' : '#ecfdf5', padding: '2px 8px', borderRadius: 4 }}>
                      {doc.department ? `${doc.department}` : '🌐 All Staff'}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 style={{ margin: '0 0 6px 0', fontSize: 16, fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>
                    {doc.title}
                  </h3>

                  {/* Description */}
                  {doc.description && (
                    <p style={{ margin: '0 0 14px 0', fontSize: 13, color: '#6b7280', lineHeight: 1.4 }}>
                      {doc.description}
                    </p>
                  )}
                </div>

                {/* Footer & Action Buttons */}
                <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#9ca3af', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {isPdf ? '📎 PDF Document' : '📝 Standard SOP'}
                  </span>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {canManageDocs && (
                      <button
                        onClick={() => handleOpenCreateModal(doc)}
                        style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
                      >
                        ✏️ Edit
                      </button>
                    )}

                    <a
                      href={`/documents/${doc.id}`}
                      style={{
                        background: '#111827',
                        color: 'white',
                        padding: '6px 14px',
                        borderRadius: 6,
                        textDecoration: 'none',
                        fontSize: 12,
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      📖 Open →
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload & Create Document Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 12, maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#111827' }}>
                {editingDocId ? 'Edit Document' : 'Upload / Create Company Document'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveDocument} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                  Document Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Kitchen Station Closing SOP"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                    Category
                  </label>
                  <select
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, background: 'white' }}
                  >
                    <option value="sop">🧑‍🍳 SOPs & Workflows</option>
                    <option value="policy">📋 Company Policies</option>
                    <option value="food_safety">🛡️ Food Safety & Hygiene</option>
                    <option value="training">🎓 Training Material</option>
                    <option value="targets">🎯 Department Targets</option>
                    <option value="other">📄 Other Resource</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                    Department Scope
                  </label>
                  <select
                    value={formDept}
                    onChange={e => setFormDept(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, background: 'white' }}
                  >
                    <option value="">🌐 All Departments (Company-Wide)</option>
                    {departments.map(d => (
                      <option key={d} value={d}>{d} Department Only</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                  Brief Summary / Description
                </label>
                <input
                  type="text"
                  placeholder="One sentence explaining what this SOP or policy covers"
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              {/* Format Toggle: In-App Article vs PDF Upload */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Document Format
                </label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="format"
                      value="article"
                      checked={formType === 'article'}
                      onChange={() => setFormType('article')}
                    />
                    <span>📝 <strong>Write in App (HTML / Text SOP)</strong> — Editable anytime</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="format"
                      value="pdf"
                      checked={formType === 'pdf'}
                      onChange={() => setFormType('pdf')}
                    />
                    <span>📎 <strong>Upload PDF File</strong></span>
                  </label>
                </div>
              </div>

              {formType === 'pdf' ? (
                <div style={{ background: '#f9fafb', padding: 16, borderRadius: 6, border: '1px dashed #d1d5db' }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                    Select PDF Document from Computer
                  </label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                    style={{ fontSize: 13 }}
                  />
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
                    PDFs are protected with non-downloadable viewer and dynamic forensic watermark.
                  </div>
                </div>
              ) : (
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                    SOP / Policy Content (HTML / Text)
                  </label>
                  <textarea
                    rows={10}
                    placeholder="<h2>1. Overview</h2><p>Describe the standard procedure here...</p><h2>2. Step-by-step Instructions</h2><p>Step 1: ...</p>"
                    value={formContent}
                    onChange={e => setFormContent(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, fontFamily: 'monospace', boxSizing: 'border-box' }}
                  />
                  <span style={{ fontSize: 11, color: '#6b7280', marginTop: 3, display: 'block' }}>
                    Supports HTML tags like &lt;h2&gt;, &lt;p&gt;, &lt;ul&gt;, &lt;li&gt;, &lt;strong&gt;.
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                {editingDocId ? (
                  <button
                    type="button"
                    onClick={() => {
                      const doc = documents.find(d => d.id === editingDocId);
                      if (doc) handleDeleteDocument(doc);
                    }}
                    style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Delete Document
                  </button>
                ) : <div />}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: 'white', color: '#4b5563', cursor: 'pointer', fontSize: 13 }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploading}
                    style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: '#059669', color: 'white', fontWeight: 'bold', cursor: 'pointer', fontSize: 13 }}
                  >
                    {uploading ? 'Saving Document...' : editingDocId ? 'Save Changes' : 'Publish Document'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DocumentsHubPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading training portal...</div>}>
      <DocumentsHubContent />
    </Suspense>
  );
}
