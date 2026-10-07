'use client';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';

const BASE_CATEGORIES = [
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
  const [clauseTemplates, setClauseTemplates] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [employeeRecord, setEmployeeRecord] = useState(null);
  const [canManageDocs, setCanManageDocs] = useState(false);

  const searchParams = useSearchParams();
  const catQuery = searchParams.get('category');

  // Filters
  const [selectedCategory, setSelectedCategory] = useState(catQuery || 'all');
  const [selectedDept, setSelectedDept] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Upload/Create Document Modal state
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

  // Clause Template Modal state
  const [showClauseModal, setShowClauseModal] = useState(false);
  const [editingClauseId, setEditingClauseId] = useState(null);
  const [clauseName, setClauseName] = useState('');
  const [clauseText, setClauseText] = useState('');
  const [clauseApplicable, setClauseApplicable] = useState('department');
  const [clauseCondition, setClauseCondition] = useState('all');
  const [savingClause, setSavingClause] = useState(false);

  useEffect(() => {
    if (catQuery && (BASE_CATEGORIES.some(c => c.id === catQuery) || catQuery === 'all' || catQuery === 'onboarding_documentation')) {
      setSelectedCategory(catQuery);
    }
  }, [catQuery]);

  useEffect(() => {
    loadUserAndDocs();
  }, []);

  async function loadUserAndDocs() {
    setLoading(true);
    setError('');

    // 1. User & permissions
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);

    let isPrivileged = false;
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      setCurrentUserProfile(profile);
      isPrivileged = !!(profile?.is_super_admin || profile?.role === 'admin' || profile?.role === 'hr_manager' || profile?.permissions?.manage_documents);
      setCanManageDocs(isPrivileged);

      // Fetch linked employee record
      if (user.email || profile?.employee_id) {
        const { data: emp } = await supabase
          .from('employees')
          .select('employee_id, name, designation, department, variable_pay_scheme, current_fixed_salary, current_variable_salary')
          .or(`email.ilike.${user.email || ''},employee_id.eq.${profile?.employee_id || '0'}`)
          .maybeSingle();
        setEmployeeRecord(emp || null);
      }
    }

    // 2. Fetch departments
    const { data: depts } = await supabase.from('departments').select('name').order('name');
    setDepartments((depts || []).map(d => d.name));

    // 3. Fetch company documents
    const { data: docs, error: docsErr } = await supabase
      .from('company_documents')
      .select('*')
      .order('id', { ascending: false });

    if (docsErr) setError(docsErr.message);
    else setDocuments(docs || []);

    // 4. If admin/HR, fetch onboarding clause templates
    if (isPrivileged) {
      const { data: clauses } = await supabase
        .from('onboarding_doc_templates')
        .select('*')
        .order('id');
      setClauseTemplates(clauses || []);
    }

    setLoading(false);
  }

  const categories = useMemo(() => {
    if (canManageDocs) {
      return [
        ...BASE_CATEGORIES,
        { id: 'onboarding_documentation', label: 'Onboarding Terms & Clauses', icon: '📝' }
      ];
    }
    return BASE_CATEGORIES;
  }, [canManageDocs]);

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

  // Clause Template CRUD
  function handleOpenClauseModal(clause = null) {
    if (clause) {
      setEditingClauseId(clause.id);
      setClauseName(clause.name);
      setClauseText(clause.clause_text);
      setClauseApplicable(clause.default_applicable || 'department');
      setClauseCondition(clause.default_condition || 'all');
    } else {
      setEditingClauseId(null);
      setClauseName('');
      setClauseText('');
      setClauseApplicable('department');
      setClauseCondition('all');
    }
    setShowClauseModal(true);
  }

  async function handleSaveClause(e) {
    e.preventDefault();
    if (!clauseName.trim() || !clauseText.trim()) return;
    setSavingClause(true);
    setError('');

    const payload = {
      name: clauseName.trim(),
      clause_text: clauseText.trim(),
      default_applicable: clauseApplicable,
      default_condition: clauseCondition.trim() || 'all',
      is_active: true,
      updated_at: new Date().toISOString()
    };

    if (editingClauseId) {
      const { error: upErr } = await supabase
        .from('onboarding_doc_templates')
        .update(payload)
        .eq('id', editingClauseId);
      if (upErr) setError(upErr.message);
      else {
        setMessage('✓ Onboarding clause template updated.');
        setShowClauseModal(false);
        loadUserAndDocs();
      }
    } else {
      const { error: insErr } = await supabase
        .from('onboarding_doc_templates')
        .insert([payload]);
      if (insErr) setError(insErr.message);
      else {
        setMessage('✓ Onboarding clause template created.');
        setShowClauseModal(false);
        loadUserAndDocs();
      }
    }
    setSavingClause(false);
  }

  async function handleDeleteClause(id) {
    if (!window.confirm('Delete this standing onboarding clause template?')) return;
    const { error: delErr } = await supabase.from('onboarding_doc_templates').delete().eq('id', id);
    if (delErr) setError(delErr.message);
    else {
      setMessage('✓ Clause template removed.');
      loadUserAndDocs();
    }
  }

  // Filtered documents list
  const filteredDocs = useMemo(() => {
    return documents.filter(doc => {
      if (selectedCategory !== 'all' && doc.category !== selectedCategory) return false;

      if (selectedDept !== 'all') {
        if (selectedDept === 'company_wide' && doc.department !== null) return false;
        if (selectedDept !== 'company_wide' && doc.department !== selectedDept && doc.department !== null) return false;
      }

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
    <div className="pb-16 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-ink mb-1">
            {selectedCategory === 'onboarding_documentation' ? 'Onboarding Terms & Clause Templates' : 'Training Materials & SOPs'}
          </h1>
          <p className="text-xs text-ink-muted">
            {selectedCategory === 'onboarding_documentation'
              ? 'Manage standing clauses, statutory terms, POSH policies, and merge-field rules that compile into the new hire onboarding packet.'
              : 'Official restaurant workflows, standard operating procedures, hygiene protocols, and company policies.'}
          </p>
        </div>

        {canManageDocs && (
          <div>
            {selectedCategory === 'onboarding_documentation' ? (
              <button
                type="button"
                onClick={() => handleOpenClauseModal()}
                className="btn-primary text-xs"
              >
                + Add Clause Template
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleOpenCreateModal()}
                className="btn-primary text-xs"
              >
                ➕ Upload / Create Document
              </button>
            )}
          </div>
        )}
      </div>

      {/* Notifications */}
      {message && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-control text-xs flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage('')} className="text-emerald-600 font-bold ml-2">✕</button>
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-control text-xs flex items-center justify-between">
          <span>⚠️ {error}</span>
          <button onClick={() => setError('')} className="text-red-600 font-bold ml-2">✕</button>
        </div>
      )}

      {/* Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-6 scrollbar-none">
        {categories.map(cat => {
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-full border transition-all whitespace-nowrap ${
                isSelected
                  ? 'bg-ink text-white border-ink shadow-xs'
                  : 'bg-surface text-ink border-rule hover:bg-page'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* =========================================================================
          VIEW A: ONBOARDING CLAUSE TEMPLATES MANAGER (ADMIN ONLY)
          ========================================================================= */}
      {selectedCategory === 'onboarding_documentation' && canManageDocs ? (
        <div className="space-y-6">
          <div className="panel panel-body bg-surface">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-rule-soft">
              <div>
                <h2 className="panel-title text-base font-bold text-ink">Standing Onboarding Clause Templates</h2>
                <p className="text-xs text-ink-muted">
                  These clause templates automatically merge with new hire data on the employee onboarding page.
                </p>
              </div>
              <span className="text-2xs font-bold bg-page px-2.5 py-1 rounded border border-rule-soft">
                {clauseTemplates.length} Templates Active
              </span>
            </div>

            {/* Merge Fields Cheat-sheet */}
            <div className="mb-6 p-4 bg-amber-50/70 border border-amber-200 rounded-control text-xs text-amber-950">
              <div className="font-bold text-xs mb-1.5 flex items-center gap-1.5">
                <span>⚡ Available Merge Field Placeholders:</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-3xs font-mono">
                <div><strong className="text-ink">{'{{name}}'}</strong>: Candidate Name</div>
                <div><strong className="text-ink">{'{{designation}}'}</strong>: Role / Title</div>
                <div><strong className="text-ink">{'{{department}}'}</strong>: Department</div>
                <div><strong className="text-ink">{'{{doj}}'}</strong>: Date of Joining</div>
                <div><strong className="text-ink">{'{{fixed_salary}}'}</strong>: Monthly Fixed CTC</div>
                <div><strong className="text-ink">{'{{variable_scheme}}'}</strong>: Incentive Scheme</div>
                <div><strong className="text-ink">{'{{salary_split}}'}</strong>: Statutory Split</div>
                <div><strong className="text-ink">{'{{assets_list}}'}</strong>: Issued Assets & Keys</div>
                <div><strong className="text-ink">{'{{pf_esi_status}}'}</strong>: PF/ESI Coverage</div>
                <div><strong className="text-ink">{'{{emergency_contact}}'}</strong>: Emergency Contact</div>
              </div>
            </div>

            {/* Clause Templates List */}
            {clauseTemplates.length === 0 ? (
              <div className="p-8 text-center text-ink-muted bg-page rounded-control border border-rule-soft">
                <p className="text-sm font-semibold text-ink">No custom clause templates found.</p>
                <p className="text-xs text-ink-muted mt-1">Default standard appointment terms will be used.</p>
                <button
                  type="button"
                  onClick={() => handleOpenClauseModal()}
                  className="btn-primary text-xs mt-3 inline-block"
                >
                  + Add First Clause Template
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {clauseTemplates.map(clause => (
                  <div key={clause.id} className="p-4 border border-rule rounded-control bg-surface shadow-2xs">
                    <div className="flex justify-between items-start gap-4 mb-2">
                      <div>
                        <h3 className="font-serif text-sm font-bold text-ink">{clause.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-3xs uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-page border border-rule-soft text-ink-muted">
                            Rule: {clause.default_applicable} ({clause.default_condition})
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenClauseModal(clause)}
                          className="btn-secondary text-2xs py-1"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteClause(clause.id)}
                          className="btn-quiet text-2xs py-1 text-red-600 hover:text-red-800"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-ink-muted bg-page/40 p-3 rounded border border-rule-soft font-mono leading-relaxed whitespace-pre-wrap">
                      {clause.clause_text}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* =========================================================================
            VIEW B: STANDARD COMPANY DOCUMENTS & SOPS GRID
            ========================================================================= */
        <div>
          {/* Department Filter & Search Bar */}
          <div className="panel panel-body bg-surface mb-6 flex gap-3 flex-wrap items-center justify-between p-3.5">
            <input
              type="text"
              placeholder="🔍 Search SOPs, guidelines, policies..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="field flex-1 min-w-[240px] text-xs"
            />

            <select
              value={selectedDept}
              onChange={e => setSelectedDept(e.target.value)}
              className="field w-auto text-xs bg-surface"
            >
              <option value="all">All Departments Scope</option>
              <option value="company_wide">Company-Wide (All Staff)</option>
              {departments.map(d => (
                <option key={d} value={d}>{d} Department Only</option>
              ))}
            </select>
          </div>

          {/* Documents Grid */}
          {/* Admin Master Variable Pay Policy Overview (Visible to Admins / Managers in Targets or All category) */}
          {(selectedCategory === 'targets' || selectedCategory === 'all') && canManageDocs && (
            <div className="mb-6 p-5 sm:p-6 bg-gradient-to-br from-indigo-50/90 via-blue-50/40 to-surface border-2 border-indigo-200 rounded-card shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-3xs font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                      👑 Admin Executive Master
                    </span>
                    <span className="text-3xs font-medium text-ink-muted">
                      All Schemes, Metrics & Formulas in 1 Live Master Document
                    </span>
                  </div>
                  <h3 className="font-serif text-lg sm:text-xl font-bold text-ink">
                    Master Variable Pay Policy & Schemes Directory
                  </h3>
                  <p className="text-xs text-ink-muted mt-1 max-w-2xl">
                    Executive reference document compiling all role-based variable incentive schemes (Captains, Kitchen, B2B, Delivery), metric weight allocations, benchmark qualification floors, and legal governance guidelines.
                  </p>
                </div>

                <div className="shrink-0 w-full sm:w-auto">
                  <a
                    href="/documents/master-variable-pay-policy"
                    className="btn-secondary text-xs w-full sm:w-auto justify-center shadow-xs flex items-center gap-1.5"
                  >
                    <span>📑</span> Open Master Document →
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Personalized Variable Pay Target Policy Card (Featured for Targets or All category) */}
          {(selectedCategory === 'targets' || selectedCategory === 'all') && (
            <div className="mb-6 p-5 sm:p-6 bg-gradient-to-br from-amber-50/90 via-orange-50/40 to-surface border-2 border-accent/40 rounded-card shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-3xs font-bold uppercase tracking-wider bg-accent/15 text-accent px-2 py-0.5 rounded-full">
                      ⭐ Personalized Employee Policy
                    </span>
                    <span className="text-3xs font-medium text-ink-muted">
                      Real-time Compensation & Scheme Sync
                    </span>
                  </div>
                  <h3 className="font-serif text-lg sm:text-xl font-bold text-ink">
                    My Variable Pay Target & Incentive Breakdown Document
                  </h3>
                  <p className="text-xs text-ink-muted mt-1 max-w-2xl">
                    {employeeRecord ? (
                      <>
                        Tailored for <strong className="text-ink">{employeeRecord.name}</strong> ({employeeRecord.designation || 'Staff'} · {employeeRecord.department || 'General'}). Includes live Fixed vs Variable split ratio, assigned scheme metrics (<strong>{employeeRecord.variable_pay_scheme || 'Standard Scheme'}</strong>), target pool of <strong>₹{Number(employeeRecord.current_variable_salary || 0).toLocaleString('en-IN')}/mo</strong>, and benchmark rules.
                      </>
                    ) : (
                      'View and print your customized variable incentive policy document showing exact percentage weights, maximum rupee earnings per metric, benchmark targets, and governance guidelines.'
                    )}
                  </p>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0 w-full sm:w-auto">
                  <a
                    href={employeeRecord ? `/documents/my-variable-pay-target?employee_id=${employeeRecord.employee_id}` : '/documents/my-variable-pay-target'}
                    className="btn-primary text-xs w-full sm:w-auto justify-center shadow-xs"
                  >
                    📄 Open Policy Document →
                  </a>
                  {canManageDocs && (
                    <span className="text-3xs text-ink-muted hidden sm:inline">
                      Managers can switch staff inside viewer
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="panel panel-body bg-surface text-center p-12 text-ink-muted">
              Loading training materials and SOPs...
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="panel panel-body bg-surface text-center p-12 border border-rule">
              <div className="text-3xl mb-2">📚</div>
              <div className="font-bold text-ink text-base">No documents found</div>
              <div className="text-xs text-ink-muted mt-1">
                Try selecting another category or clear your search query.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDocs.map(doc => {
                const catInfo = BASE_CATEGORIES.find(c => c.id === doc.category) || { label: doc.category, icon: '📄' };
                const isPdf = doc.doc_type === 'pdf';

                return (
                  <div
                    key={doc.id}
                    className="panel panel-body bg-surface flex flex-col justify-between hover:shadow-md transition-shadow"
                  >
                    <div>
                      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                        <span className="text-3xs font-bold bg-page text-ink px-2.5 py-1 rounded-full border border-rule-soft flex items-center gap-1.5">
                          {catInfo.icon} {catInfo.label}
                        </span>
                        <span className="text-3xs font-semibold px-2 py-0.5 rounded bg-page text-ink-muted border border-rule-soft">
                          {doc.department ? `${doc.department}` : '🌐 All Staff'}
                        </span>
                      </div>

                      <h3 className="font-serif text-base font-bold text-ink mb-1.5 leading-snug">
                        {doc.title}
                      </h3>

                      {doc.description && (
                        <p className="text-xs text-ink-muted mb-4 line-clamp-2">
                          {doc.description}
                        </p>
                      )}
                    </div>

                    <div className="pt-3 border-t border-rule-soft flex justify-between items-center">
                      <span className="text-3xs text-ink-muted font-medium">
                        {isPdf ? '📎 PDF Document' : '📝 Standard SOP'}
                      </span>
                      <div className="flex gap-2 items-center">
                        {canManageDocs && (
                          <button
                            type="button"
                            onClick={() => handleOpenCreateModal(doc)}
                            className="text-xs text-accent font-semibold hover:underline"
                          >
                            ✏️ Edit
                          </button>
                        )}
                        <a
                          href={`/documents/${doc.id}`}
                          className="btn-secondary text-2xs py-1"
                        >
                          View Document →
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          MODAL: CREATE / EDIT ONBOARDING CLAUSE TEMPLATE
          ========================================================================= */}
      {showClauseModal && (
        <div className="fixed inset-0 bg-ink/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-settle">
          <div className="panel panel-body max-w-xl w-full bg-surface shadow-2xl">
            <div className="flex justify-between items-center pb-3 mb-4 border-b border-rule-soft">
              <h3 className="font-serif text-lg font-bold text-ink">
                {editingClauseId ? 'Edit Onboarding Clause Template' : 'Add Onboarding Clause Template'}
              </h3>
              <button
                type="button"
                onClick={() => setShowClauseModal(false)}
                className="text-ink-muted hover:text-ink text-sm p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveClause} className="space-y-4">
              <div>
                <label className="field-label">Clause Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Asset Allocation & Key Liability Terms"
                  value={clauseName}
                  onChange={e => setClauseName(e.target.value)}
                  className="field text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Default Applicability Rule</label>
                  <select
                    value={clauseApplicable}
                    onChange={e => setClauseApplicable(e.target.value)}
                    className="field text-xs bg-surface"
                  >
                    <option value="department">Department Specific</option>
                    <option value="employment_type">Employment Contract Type</option>
                    <option value="assets_assigned">Assets or Keys Assigned</option>
                    <option value="pf_esi_applicable">PF / ESI Statutory Applicable</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Condition Value</label>
                  <input
                    type="text"
                    placeholder="e.g. all / Kitchen / accommodation"
                    value={clauseCondition}
                    onChange={e => setClauseCondition(e.target.value)}
                    className="field text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="field-label">Clause Content (with merge fields) *</label>
                <textarea
                  rows={6}
                  required
                  placeholder="The company agrees to employ {{name}} as {{designation}}..."
                  value={clauseText}
                  onChange={e => setClauseText(e.target.value)}
                  className="field text-xs font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-rule-soft">
                <button
                  type="button"
                  onClick={() => setShowClauseModal(false)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingClause}
                  className="btn-primary text-xs"
                >
                  {savingClause ? 'Saving…' : 'Save Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: UPLOAD / CREATE STANDARD COMPANY DOCUMENT
          ========================================================================= */}
      {showModal && (
        <div className="fixed inset-0 bg-ink/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-settle">
          <div className="panel panel-body max-w-2xl w-full bg-surface shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 mb-4 border-b border-rule-soft">
              <h3 className="font-serif text-lg font-bold text-ink">
                {editingDocId ? 'Edit Document' : 'Upload or Publish New Document'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-ink-muted hover:text-ink text-sm p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveDocument} className="space-y-4">
              <div>
                <label className="field-label">Document Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kitchen Opening & Hygiene Protocol"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  className="field text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Resource Category</label>
                  <select
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value)}
                    className="field text-xs bg-surface"
                  >
                    <option value="sop">🧑‍🍳 SOPs & Workflows</option>
                    <option value="policy">📋 Company Policies</option>
                    <option value="food_safety">🛡️ Food Safety & Hygiene</option>
                    <option value="training">🎓 Training Materials</option>
                    <option value="targets">🎯 Department Targets</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Department Scope</label>
                  <select
                    value={formDept}
                    onChange={e => setFormDept(e.target.value)}
                    className="field text-xs bg-surface"
                  >
                    <option value="">🌐 All Departments (Company-Wide)</option>
                    {departments.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="field-label">Short Description</label>
                <input
                  type="text"
                  placeholder="Brief 1-sentence summary of this document..."
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  className="field text-xs"
                />
              </div>

              <div>
                <label className="field-label">Document Format</label>
                <div className="flex gap-4 text-xs text-ink">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="docFormat"
                      checked={formType === 'article'}
                      onChange={() => setFormType('article')}
                    />
                    <span>📝 Write In-App Article / SOP</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="docFormat"
                      checked={formType === 'pdf'}
                      onChange={() => setFormType('pdf')}
                    />
                    <span>📎 Upload PDF File</span>
                  </label>
                </div>
              </div>

              {formType === 'pdf' ? (
                <div className="p-4 bg-page border border-dashed border-rule rounded-control">
                  <label className="field-label">Select PDF File from Computer</label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                    className="field text-xs py-1 bg-surface"
                  />
                </div>
              ) : (
                <div>
                  <label className="field-label">SOP / Policy Content (HTML or formatted text)</label>
                  <textarea
                    rows={8}
                    placeholder="Enter full workflow instructions, guidelines, and rules..."
                    value={formContent}
                    onChange={e => setFormContent(e.target.value)}
                    className="field text-xs font-mono"
                  />
                </div>
              )}

              <div className="flex justify-between items-center pt-3 border-t border-rule-soft">
                {editingDocId ? (
                  <button
                    type="button"
                    onClick={() => {
                      const doc = documents.find(d => d.id === editingDocId);
                      if (doc) handleDeleteDocument(doc);
                    }}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Delete Document
                  </button>
                ) : <div />}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="btn-secondary text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploading}
                    className="btn-primary text-xs"
                  >
                    {uploading ? 'Publishing…' : 'Publish Document'}
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

export default function DocumentsPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-ink-muted">Loading documents…</div>}>
      <DocumentsHubContent />
    </Suspense>
  );
}
