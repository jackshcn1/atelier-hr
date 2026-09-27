'use client';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { createClient } from '../../lib/supabaseClient';
import { syncChecklistRuns, formatDelayString } from '../../lib/checklistScheduler';

function ChecklistsHubContent() {
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'approvals' | 'history' | 'templates'
  const [templates, setTemplates] = useState([]);
  const [runs, setRuns] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [currentEmployee, setCurrentEmployee] = useState(null);
  const [isManager, setIsManager] = useState(false);

  // Active execution state
  const [selectedRun, setSelectedRun] = useState(null);
  const [runResponses, setRunResponses] = useState({});
  const [uploadingPhotoKey, setUploadingPhotoKey] = useState(null);
  const [submittingRunId, setSubmittingRunId] = useState(null);

  // Approval state
  const [reviewingRun, setReviewingRun] = useState(null);
  const [recheckNote, setRecheckNote] = useState('');
  const [approvingId, setApprovingId] = useState(null);

  // Template Builder state
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [templateForm, setTemplateForm] = useState({
    title: '',
    description: '',
    department: '',
    cadence: 'daily_once',
    scheduleTimesText: '23:00',
    rollover_if_missed: true,
    assigned_type: 'department', // 'all_staff' | 'department' | 'individual' | 'group'
    assigned_department: '',
    assigned_employee_id: '',
    assigned_employee_ids: [],
    requires_approval: true,
    approver_role: 'manager',
    items: []
  });

  // UI state
  const [dismissedBanners, setDismissedBanners] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadAllData();
  }, []);

  async function loadAllData() {
    setLoading(true);
    setError('');

    // 1. Current user
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);

    if (user) {
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      setCurrentUserProfile(profile);

      const privileged = profile?.is_super_admin || profile?.role === 'admin' || profile?.role === 'super_admin' || profile?.role === 'department_head' || profile?.role === 'hr_manager' || profile?.permissions?.manage_track_record || profile?.permissions?.manage_documents;
      setIsManager(!!privileged);

      const { data: emp } = await supabase.from('employees').select('*').ilike('email', user.email).maybeSingle();
      setCurrentEmployee(emp);
    }

    // 2. Fetch departments & employees
    const { data: depts } = await supabase.from('departments').select('name').order('name');
    setDepartments((depts || []).map(d => d.name));

    const { data: emps } = await supabase.from('employees').select('employee_id, name, department, designation').eq('status', 'active');
    setEmployees(emps || []);

    // 3. Sync & generate runs
    await syncChecklistRuns(supabase);

    // 4. Fetch templates & runs
    const { data: tmpls } = await supabase.from('checklist_templates').select('*').order('id', { ascending: false });
    setTemplates(tmpls || []);

    const { data: runList } = await supabase
      .from('checklist_runs')
      .select('*, checklist_templates(*)')
      .order('due_at', { ascending: false });
    setRuns(runList || []);

    setLoading(false);
  }

  // Active runs matching current user / department
  const activeRuns = useMemo(() => {
    return runs.filter(r => {
      if (!['pending', 'overdue', 'recheck_requested'].includes(r.status)) return false;

      // If user is regular employee, filter strictly to what is assigned to them
      if (!isManager && currentEmployee) {
        const tmpl = r.checklist_templates;
        if (tmpl) {
          if (tmpl.assigned_type === 'individual' && tmpl.assigned_employee_id !== currentEmployee.employee_id) return false;
          if (tmpl.assigned_type === 'group' && Array.isArray(tmpl.assigned_employee_ids) && !tmpl.assigned_employee_ids.includes(currentEmployee.employee_id)) return false;
          if (tmpl.assigned_type === 'department' && tmpl.assigned_department && tmpl.assigned_department !== currentEmployee.department) return false;
        }
      }

      // Department filter dropdown
      if (selectedDeptFilter !== 'all') {
        if (selectedDeptFilter === 'company_wide' && r.department !== null) return false;
        if (selectedDeptFilter !== 'company_wide' && r.department !== selectedDeptFilter) return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return r.title.toLowerCase().includes(q) || (r.department || '').toLowerCase().includes(q);
    });
  }, [runs, selectedDeptFilter, isManager, currentEmployee, searchQuery]);

  // Runs pending manager approval
  const pendingApprovalRuns = useMemo(() => {
    return runs.filter(r => r.status === 'pending_approval');
  }, [runs]);

  // Historical completed/missed runs
  const historyRuns = useMemo(() => {
    return runs.filter(r => {
      if (!['completed', 'missed'].includes(r.status)) return false;

      // If user is regular employee, filter to their assigned scope or department
      if (!isManager && currentEmployee) {
        const tmpl = r.checklist_templates;
        if (tmpl) {
          if (tmpl.assigned_type === 'individual' && tmpl.assigned_employee_id !== currentEmployee.employee_id) return false;
          if (tmpl.assigned_type === 'group' && Array.isArray(tmpl.assigned_employee_ids) && !tmpl.assigned_employee_ids.includes(currentEmployee.employee_id)) return false;
          if (tmpl.assigned_type === 'department' && tmpl.assigned_department && tmpl.assigned_department !== currentEmployee.department) return false;
        }
      }
      return true;
    });
  }, [runs, isManager, currentEmployee]);

  // Overdue count for alert banner
  const overdueRuns = useMemo(() => {
    return runs.filter(r => r.status === 'overdue' && !dismissedBanners.has(r.id));
  }, [runs, dismissedBanners]);

  // Open checklist execution sheet
  function handleOpenRun(run) {
    setSelectedRun(run);
    setRunResponses(run.responses || {});
    setError('');
    setMessage('');
  }

  // Update a single task/subtask response
  function handleResponseChange(key, value) {
    setRunResponses(prev => ({
      ...prev,
      [key]: value
    }));
  }

  // Direct Mobile Camera capture and upload for Photo Proof
  async function handlePhotoCapture(taskKey, file) {
    if (!file) return;
    setUploadingPhotoKey(taskKey);

    const ext = file.name.split('.').pop() || 'jpg';
    const path = `checklist_photos/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;

    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(path, file, { cacheControl: '3600', upsert: true });

    setUploadingPhotoKey(null);

    if (uploadErr) {
      setError(`Photo upload failed: ${uploadErr.message}`);
    } else {
      const { data: signed } = await supabase.storage.from('documents').createSignedUrl(uploadData.path, 31536000); // 1 yr
      handleResponseChange(taskKey, {
        photo_url: signed?.signedUrl || uploadData.path,
        captured_at: new Date().toISOString()
      });
    }
  }

  // Submit Completed Checklist
  async function handleSubmitRun(run) {
    const tmpl = run.checklist_templates;
    const items = tmpl?.items || [];

    // Verify required items
    let missingRequired = false;
    items.forEach(section => {
      (section.subtasks || []).forEach(st => {
        if (st.required) {
          const resp = runResponses[st.id];
          if (!resp) missingRequired = true;
          else if (st.type === 'checkbox' && !resp) missingRequired = true;
          else if (st.type === 'photo' && !resp?.photo_url) missingRequired = true;
          else if (st.type === 'temperature' && (resp === '' || resp === undefined)) missingRequired = true;
        }
      });
    });

    if (missingRequired) {
      if (!window.confirm('Some required tasks or photos have not been completed. Do you still want to submit this checklist?')) {
        return;
      }
    }

    setSubmittingRunId(run.id);
    setError('');

    const now = new Date();
    const dueTime = new Date(run.due_at).getTime();
    const delaySec = Math.max(0, Math.round((now.getTime() - dueTime) / 1000));
    const isDelayed = delaySec > 0;

    const submitterName = currentEmployee?.name || currentUserProfile?.display_name || currentUser?.email?.split('@')[0] || 'Staff';

    const requiresApproval = tmpl?.requires_approval ?? true;
    const newStatus = requiresApproval ? 'pending_approval' : 'completed';

    const updates = {
      responses: runResponses,
      status: newStatus,
      submitted_by: currentUser?.id,
      submitted_by_name: submitterName,
      submitted_at: now.toISOString(),
      delay_seconds: delaySec,
      is_overdue: isDelayed,
      updated_at: now.toISOString()
    };

    const { error: updateErr } = await supabase
      .from('checklist_runs')
      .update(updates)
      .eq('id', run.id);

    setSubmittingRunId(null);

    if (updateErr) {
      setError(`Failed to submit checklist: ${updateErr.message}`);
    } else {
      setMessage(requiresApproval
        ? `✓ Checklist submitted for Manager Approval (${isDelayed ? `Delayed by ${formatDelayString(delaySec)}` : 'On time'})`
        : `✓ Checklist marked Completed (${isDelayed ? `Delayed by ${formatDelayString(delaySec)}` : 'On time'})`);
      setSelectedRun(null);
      loadAllData();
    }
  }

  // Manager Approval Actions
  async function handleApprove(run) {
    setApprovingId(run.id);
    const now = new Date();
    const approverName = currentEmployee?.name || currentUserProfile?.display_name || currentUser?.email?.split('@')[0] || 'Manager';

    const { error: appErr } = await supabase
      .from('checklist_runs')
      .update({
        status: 'completed',
        approved_by: currentUser?.id,
        approved_by_name: approverName,
        approved_at: now.toISOString(),
        updated_at: now.toISOString()
      })
      .eq('id', run.id);

    setApprovingId(null);
    if (appErr) setError(appErr.message);
    else {
      setMessage(`✓ Checklist approved & signed off by ${approverName}.`);
      setReviewingRun(null);
      loadAllData();
    }
  }

  async function handleRequestRecheck(run) {
    if (!recheckNote.trim()) {
      setError('Please enter a note explaining what needs to be re-checked or cleaned.');
      return;
    }

    setApprovingId(run.id);
    const { error: rErr } = await supabase
      .from('checklist_runs')
      .update({
        status: 'recheck_requested',
        recheck_notes: recheckNote.trim(),
        updated_at: new Date().toISOString()
      })
      .eq('id', run.id);

    setApprovingId(null);
    if (rErr) setError(rErr.message);
    else {
      setMessage(`⚠️ Re-check requested with note: "${recheckNote.trim()}"`);
      setReviewingRun(null);
      setRecheckNote('');
      loadAllData();
    }
  }

  // Template Builder Save
  async function handleSaveTemplate(e) {
    e.preventDefault();
    if (!templateForm.title.trim()) {
      setError('Checklist title is required.');
      return;
    }

    setLoading(true);
    setError('');

    const timesArray = templateForm.scheduleTimesText
      .split(',')
      .map(t => t.trim())
      .filter(t => /^\d{1,2}:\d{2}$/.test(t));

    const payload = {
      title: templateForm.title.trim(),
      description: templateForm.description.trim(),
      department: templateForm.department || templateForm.assigned_department || null,
      cadence: templateForm.cadence,
      schedule_times: timesArray.length > 0 ? timesArray : ['23:00'],
      rollover_if_missed: templateForm.rollover_if_missed,
      assigned_type: templateForm.assigned_type,
      assigned_department: templateForm.assigned_type === 'department' ? (templateForm.assigned_department || null) : null,
      assigned_employee_id: templateForm.assigned_type === 'individual' ? (templateForm.assigned_employee_id || null) : null,
      assigned_employee_ids: templateForm.assigned_type === 'group' ? (templateForm.assigned_employee_ids || []) : [],
      requires_approval: templateForm.requires_approval,
      items: templateForm.items,
      updated_at: new Date().toISOString()
    };

    if (editingTemplateId) {
      const { error: upErr } = await supabase.from('checklist_templates').update(payload).eq('id', editingTemplateId);
      if (upErr) setError(upErr.message);
      else {
        setMessage('✓ Checklist template updated.');
        setShowTemplateModal(false);
        loadAllData();
      }
    } else {
      payload.created_by = currentUser?.email || 'admin';
      const { error: insErr } = await supabase.from('checklist_templates').insert([payload]);
      if (insErr) setError(insErr.message);
      else {
        setMessage('✓ New checklist template created.');
        setShowTemplateModal(false);
        loadAllData();
      }
    }
    setLoading(false);
  }

  function handleOpenTemplateBuilder(tmpl = null) {
    if (tmpl) {
      setEditingTemplateId(tmpl.id);
      setTemplateForm({
        title: tmpl.title,
        description: tmpl.description || '',
        department: tmpl.department || '',
        cadence: tmpl.cadence || 'daily_once',
        scheduleTimesText: (tmpl.schedule_times || ['23:00']).join(', '),
        rollover_if_missed: tmpl.rollover_if_missed ?? true,
        assigned_type: tmpl.assigned_type || 'department',
        assigned_department: tmpl.assigned_department || tmpl.department || '',
        assigned_employee_id: tmpl.assigned_employee_id || '',
        assigned_employee_ids: Array.isArray(tmpl.assigned_employee_ids) ? tmpl.assigned_employee_ids : [],
        requires_approval: tmpl.requires_approval ?? true,
        approver_role: tmpl.approver_role || 'manager',
        items: tmpl.items || []
      });
    } else {
      setEditingTemplateId(null);
      setTemplateForm({
        title: '',
        description: '',
        department: '',
        cadence: 'daily_once',
        scheduleTimesText: '23:00',
        rollover_if_missed: true,
        assigned_type: 'department',
        assigned_department: '',
        assigned_employee_id: '',
        assigned_employee_ids: [],
        requires_approval: true,
        approver_role: 'manager',
        items: [
          {
            id: `sec_${Date.now()}`,
            title: 'Station Cleanliness & Setup',
            type: 'heading',
            subtasks: [
              { id: `st_${Date.now()}_1`, title: 'Verify station is thoroughly cleaned and sanitized', type: 'checkbox', required: true },
              { id: `st_${Date.now()}_2`, title: 'Photo: Station Overview Proof', type: 'photo', required: true }
            ]
          }
        ]
      });
    }
    setShowTemplateModal(true);
    setError('');
  }

  // Template task tree helpers
  function addSection() {
    setTemplateForm(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          id: `sec_${Date.now()}`,
          title: 'New Section',
          type: 'heading',
          subtasks: [
            { id: `st_${Date.now()}`, title: 'New Task', type: 'checkbox', required: true }
          ]
        }
      ]
    }));
  }

  function addSubtask(secIndex) {
    setTemplateForm(prev => {
      const updated = [...prev.items];
      updated[secIndex].subtasks.push({
        id: `st_${Date.now()}`,
        title: 'New Check / Subtask',
        type: 'checkbox',
        required: true
      });
      return { ...prev, items: updated };
    });
  }

  function removeSubtask(secIndex, subIndex) {
    setTemplateForm(prev => {
      const updated = [...prev.items];
      updated[secIndex].subtasks.splice(subIndex, 1);
      return { ...prev, items: updated };
    });
  }

  // CSV Export for Compliance
  function exportChecklistHistoryCSV() {
    if (historyRuns.length === 0) return;

    const headers = ['Run ID', 'Checklist Title', 'Department', 'Scheduled Due Date', 'Status', 'Submitted By', 'Submitted At', 'Delay', 'Approved By', 'Approved At'];
    const rows = historyRuns.map(r => [
      r.id,
      `"${r.title.replace(/"/g, '""')}"`,
      r.department || 'All Departments',
      r.due_at ? new Date(r.due_at).toLocaleString('en-IN') : '—',
      r.status.toUpperCase(),
      `"${(r.submitted_by_name || '—').replace(/"/g, '""')}"`,
      r.submitted_at ? new Date(r.submitted_at).toLocaleString('en-IN') : '—',
      r.delay_seconds > 0 ? formatDelayString(r.delay_seconds) : 'On Time',
      `"${(r.approved_by_name || '—').replace(/"/g, '""')}"`,
      r.approved_at ? new Date(r.approved_at).toLocaleString('en-IN') : '—'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Atelier_Checklist_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: 40 }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0' }}>Daily & Shift Checklists</h1>
          <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
            Digital mobile checklists, photo proof verification, temperature logs, and manager sign-offs.
          </p>
        </div>

        {isManager && (
          <button
            onClick={() => handleOpenTemplateBuilder()}
            style={{
              background: '#059669', color: 'white', border: 'none', padding: '10px 18px',
              borderRadius: 6, fontWeight: 'bold', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            ➕ Configure Checklist Template
          </button>
        )}
      </div>

      {/* Dismissible Overdue Alert Banner for Managers */}
      {isManager && overdueRuns.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #f87171', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div>
              <strong style={{ color: '#991b1b', fontSize: 14 }}>
                {overdueRuns.length} Operational Checklist{overdueRuns.length > 1 ? 's' : ''} Currently Overdue!
              </strong>
              <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 2 }}>
                {overdueRuns.map(r => `${r.title} (${r.department || 'All Staff'})`).join(' • ')}
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              const newDismissed = new Set(dismissedBanners);
              overdueRuns.forEach(r => newDismissed.add(r.id));
              setDismissedBanners(newDismissed);
            }}
            style={{ background: 'none', border: '1px solid #fca5a5', color: '#991b1b', padding: '4px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
          >
            ✕ Dismiss Alert
          </button>
        </div>
      )}

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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '2px solid #e5e7eb', marginBottom: 18, overflowX: 'auto' }}>
        <button
          onClick={() => setActiveTab('active')}
          style={{
            padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700,
            color: activeTab === 'active' ? '#059669' : '#6b7280',
            borderBottom: activeTab === 'active' ? '3px solid #059669' : 'none',
            whiteSpace: 'nowrap'
          }}
        >
          📋 Active Shift Tasks ({activeRuns.length})
        </button>

        {isManager && (
          <button
            onClick={() => setActiveTab('approvals')}
            style={{
              padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700,
              color: activeTab === 'approvals' ? '#7c3aed' : '#6b7280',
              borderBottom: activeTab === 'approvals' ? '3px solid #7c3aed' : 'none',
              whiteSpace: 'nowrap'
            }}
          >
            ⏳ Pending Approvals ({pendingApprovalRuns.length})
          </button>
        )}

        <button
          onClick={() => setActiveTab('history')}
          style={{
            padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700,
            color: activeTab === 'history' ? '#1f2937' : '#6b7280',
            borderBottom: activeTab === 'history' ? '3px solid #1f2937' : 'none',
            whiteSpace: 'nowrap'
          }}
        >
          📜 History & Compliance ({historyRuns.length})
        </button>

        {isManager && (
          <button
            onClick={() => setActiveTab('templates')}
            style={{
              padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700,
              color: activeTab === 'templates' ? '#2563eb' : '#6b7280',
              borderBottom: activeTab === 'templates' ? '3px solid #2563eb' : 'none',
              whiteSpace: 'nowrap'
            }}
          >
            ⚙️ Templates ({templates.length})
          </button>
        )}
      </div>

      {/* TAB 1: ACTIVE SHIFT TASKS */}
      {activeTab === 'active' && (
        <div>
          {/* Department Filter */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 13, color: '#6b7280' }}>
              Showing scheduled checklists for current shift
            </div>

            <select
              value={selectedDeptFilter}
              onChange={e => setSelectedDeptFilter(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, background: 'white' }}
            >
              <option value="all">All Departments</option>
              <option value="company_wide">Company-Wide Checks</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {activeRuns.length === 0 ? (
            <div style={{ background: 'white', padding: 48, textAlign: 'center', borderRadius: 10, border: '1px solid #e5e7eb', color: '#6b7280' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
              <div style={{ fontWeight: 700, color: '#111827', fontSize: 16 }}>All shift checklists up to date!</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                Upcoming shift checklists will appear here automatically when due.
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
              {activeRuns.map(run => {
                const isOverdue = run.status === 'overdue';
                const isRecheck = run.status === 'recheck_requested';
                const dueTimeStr = new Date(run.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                const tmpl = run.checklist_templates;
                const assignmentLabel =
                  tmpl?.assigned_type === 'individual' ? `👤 Assigned to Specific Staff` :
                  tmpl?.assigned_type === 'group' ? `👥 Assigned to Group (${(tmpl.assigned_employee_ids || []).length} Staff)` :
                  tmpl?.assigned_type === 'department' ? `🏢 ${tmpl.assigned_department || run.department || 'Department'}` :
                  '🌐 All Staff (Company-Wide)';

                return (
                  <div
                    key={run.id}
                    style={{
                      background: 'white',
                      borderRadius: 10,
                      border: isOverdue ? '1.5px solid #f87171' : isRecheck ? '1.5px solid #f59e0b' : '1px solid #e5e7eb',
                      padding: 16,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 12
                    }}
                  >
                    <div>
                      {/* Top Badges */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                        <span
                          style={{
                            fontSize: 11, fontWeight: 'bold', padding: '3px 8px', borderRadius: 12,
                            background: isOverdue ? '#fee2e2' : isRecheck ? '#fef3c7' : '#ecfdf5',
                            color: isOverdue ? '#991b1b' : isRecheck ? '#92400e' : '#065f46'
                          }}
                        >
                          {isOverdue ? '⚠️ Overdue' : isRecheck ? '🔄 Re-check Needed' : '⏳ Due for Current Shift'}
                        </span>

                        <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>
                          Due by {dueTimeStr}
                        </span>
                      </div>

                      {/* Title & Assignment */}
                      <h3 style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 700, color: '#111827' }}>
                        {run.title}
                      </h3>
                      <div style={{ fontSize: 12, color: '#0369a1', fontWeight: 600 }}>
                        {assignmentLabel}
                      </div>

                      {isRecheck && run.recheck_notes && (
                        <div style={{ marginTop: 8, background: '#fffbeb', border: '1px solid #fde68a', padding: 8, borderRadius: 6, fontSize: 12, color: '#92400e' }}>
                          <strong>Manager Note:</strong> {run.recheck_notes}
                        </div>
                      )}
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={() => handleOpenRun(run)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        borderRadius: 6,
                        border: 'none',
                        background: isOverdue ? '#dc2626' : '#059669',
                        color: 'white',
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }}
                    >
                      <span>📝 Start / Complete Checklist →</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PENDING APPROVALS (MANAGER ONLY) */}
      {activeTab === 'approvals' && (
        <div>
          {pendingApprovalRuns.length === 0 ? (
            <div style={{ background: 'white', padding: 48, textAlign: 'center', borderRadius: 10, border: '1px solid #e5e7eb', color: '#6b7280' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
              <div style={{ fontWeight: 700, color: '#111827', fontSize: 16 }}>No pending manager approvals</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                Submitted checklists from kitchen and service staff will appear here for your sign-off.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pendingApprovalRuns.map(run => (
                <div
                  key={run.id}
                  style={{
                    background: 'white',
                    borderRadius: 10,
                    border: '1px solid #ddd6fe',
                    padding: 16,
                    boxShadow: '0 2px 6px rgba(124, 58, 237, 0.06)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 'bold', background: '#f3e8ff', color: '#7c3aed' }}>
                        ⏳ Awaiting Approval
                      </span>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>
                        Submitted by <strong>{run.submitted_by_name || 'Staff'}</strong> at {new Date(run.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <h3 style={{ margin: '0 0 2px 0', fontSize: 16, fontWeight: 700, color: '#111827' }}>
                      {run.title}
                    </h3>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      {run.department || 'All Staff'} • {run.is_overdue ? <span style={{ color: '#dc2626' }}>Completed {formatDelayString(run.delay_seconds)} late</span> : <span style={{ color: '#059669' }}>Submitted On Time</span>}
                    </div>
                  </div>

                  <button
                    onClick={() => setReviewingRun(run)}
                    style={{
                      background: '#7c3aed', color: 'white', border: 'none', padding: '8px 18px',
                      borderRadius: 6, fontWeight: 'bold', fontSize: 13, cursor: 'pointer'
                    }}
                  >
                    🔍 Inspect & Sign Off →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: HISTORY & COMPLIANCE */}
      {activeTab === 'history' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 13, color: '#6b7280' }}>
              Historical audit log of all completed & missed shift checklists
            </div>

            <button
              onClick={exportChecklistHistoryCSV}
              style={{
                background: '#1f2937', color: 'white', border: 'none', padding: '6px 14px',
                borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
              }}
            >
              📥 Export Report (CSV)
            </button>
          </div>

          <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e5e7eb', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                  <th style={{ padding: '10px 12px' }}>Checklist</th>
                  <th>Department</th>
                  <th>Scheduled Date</th>
                  <th>Submitted By</th>
                  <th>Timing</th>
                  <th>Approver</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {historyRuns.map(run => {
                  const isCompleted = run.status === 'completed';
                  return (
                    <tr key={run.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#111827' }}>
                        {run.title}
                      </td>
                      <td style={{ color: '#4b5563' }}>{run.department || 'All Staff'}</td>
                      <td style={{ color: '#4b5563' }}>{new Date(run.due_at).toLocaleDateString()}</td>
                      <td style={{ color: '#111827' }}>{run.submitted_by_name || '—'}</td>
                      <td>
                        {run.is_overdue ? (
                          <span style={{ color: '#dc2626', fontSize: 12 }}>+{formatDelayString(run.delay_seconds)} late</span>
                        ) : (
                          <span style={{ color: '#059669', fontSize: 12 }}>On time</span>
                        )}
                      </td>
                      <td style={{ color: '#4b5563' }}>{run.approved_by_name || '—'}</td>
                      <td>
                        <span
                          style={{
                            padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 'bold',
                            background: isCompleted ? '#dcfce7' : '#fee2e2',
                            color: isCompleted ? '#15803d' : '#991b1b'
                          }}
                        >
                          {isCompleted ? '✓ Completed' : '✕ Missed'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: TEMPLATES CONFIGURATION (ADMIN / MANAGER) */}
      {activeTab === 'templates' && isManager && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {templates.map(tmpl => {
            const assignmentLabel =
              tmpl.assigned_type === 'individual' && tmpl.assigned_employee_id ? `👤 Individual (${employees.find(e => e.employee_id === tmpl.assigned_employee_id)?.name || tmpl.assigned_employee_id})` :
              tmpl.assigned_type === 'group' ? `👥 Group of ${(tmpl.assigned_employee_ids || []).length} Staff Members` :
              tmpl.assigned_type === 'department' ? `🏢 ${tmpl.assigned_department || tmpl.department || 'Department'}` :
              '🌐 All Staff (Company-Wide)';

            return (
              <div
                key={tmpl.id}
                style={{
                  background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', padding: 16,
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', padding: '2px 8px', borderRadius: 4 }}>
                      {tmpl.cadence.replace('_', ' ').toUpperCase()}
                    </span>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>
                      {(tmpl.schedule_times || []).join(', ')}
                    </span>
                  </div>

                  <h3 style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 700, color: '#111827' }}>
                    {tmpl.title}
                  </h3>
                  <p style={{ margin: '0 0 8px 0', fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>
                    {tmpl.description || 'No description provided.'}
                  </p>

                  <div style={{ fontSize: 12, color: '#0369a1', fontWeight: 600, marginTop: 4 }}>
                    {assignmentLabel}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    Rollover: <strong>{tmpl.rollover_if_missed ? 'Yes (Overdue)' : 'No (Expires)'}</strong> • Approval: <strong>{tmpl.requires_approval ? 'Required' : 'No'}</strong>
                  </div>
                </div>

                <button
                  onClick={() => handleOpenTemplateBuilder(tmpl)}
                  style={{
                    width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #d1d5db',
                    background: '#f9fafb', color: '#111827', fontWeight: 600, fontSize: 12, cursor: 'pointer'
                  }}
                >
                  ✏️ Edit Structure, Assignees & Tasks
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* FULLSCREEN / MODAL: ACTIVE CHECKLIST EXECUTION */}
      {selectedRun && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
          <div style={{ background: 'white', borderRadius: 12, maxWidth: 680, width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: '24px 20px', boxSizing: 'border-box' }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e5e7eb', paddingBottom: 14, marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>
                  Active Operational Routine
                </span>
                <h2 style={{ margin: '2px 0 2px 0', fontSize: 20, fontWeight: 800, color: '#111827' }}>
                  {selectedRun.title}
                </h2>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  {selectedRun.department || 'All Staff'} • Due by {new Date(selectedRun.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>

              <button
                onClick={() => setSelectedRun(null)}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#6b7280', padding: 0 }}
              >
                ✕
              </button>
            </div>

            {/* Checklist Tree Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {(selectedRun.checklist_templates?.items || []).map((section, secIdx) => (
                <div key={section.id || secIdx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 10, borderBottom: '1px solid #e2e8f0', paddingBottom: 4 }}>
                    {section.title}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(section.subtasks || []).map(st => {
                      const resp = runResponses[st.id];

                      return (
                        <div
                          key={st.id}
                          style={{
                            background: 'white',
                            border: '1px solid #cbd5e1',
                            borderRadius: 6,
                            padding: '10px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                              {st.title} {st.required && <span style={{ color: '#dc2626' }}>*</span>}
                            </span>

                            {st.type === 'temperature' && (
                              <span style={{ fontSize: 11, color: '#0369a1', background: '#e0f2fe', padding: '2px 6px', borderRadius: 4 }}>
                                Target: {st.min_val}°C to {st.max_val}°C
                              </span>
                            )}
                          </div>

                          {/* Input Type: Checkbox */}
                          {st.type === 'checkbox' && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#334151' }}>
                              <input
                                type="checkbox"
                                checked={!!resp}
                                onChange={e => handleResponseChange(st.id, e.target.checked)}
                                style={{ width: 18, height: 18, cursor: 'pointer' }}
                              />
                              <span>{resp ? '✓ Marked as Completed' : 'Tap to mark done'}</span>
                            </label>
                          )}

                          {/* Input Type: Temperature / Numeric Reading */}
                          {st.type === 'temperature' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <input
                                type="number"
                                placeholder="Enter reading in °C"
                                value={resp || ''}
                                onChange={e => handleResponseChange(st.id, e.target.value)}
                                style={{ width: 140, padding: '6px 10px', borderRadius: 4, border: '1px solid #94a3b8', fontSize: 14 }}
                              />
                              {resp !== '' && resp !== undefined && (
                                <span style={{
                                  fontSize: 12, fontWeight: 700,
                                  color: (Number(resp) >= (st.min_val ?? -999) && Number(resp) <= (st.max_val ?? 999)) ? '#059669' : '#dc2626'
                                }}>
                                  {(Number(resp) >= (st.min_val ?? -999) && Number(resp) <= (st.max_val ?? 999)) ? '✓ Safe Temperature Range' : '⚠️ OUT OF SAFE RANGE'}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Input Type: Mobile Direct Camera / Photo Proof */}
                          {st.type === 'photo' && (
                            <div>
                              {resp?.photo_url ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                  <img src={resp.photo_url} alt="Proof" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid #ccc' }} />
                                  <div>
                                    <div style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>✓ Photo Proof Uploaded</div>
                                    <label style={{ fontSize: 11, color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }}>
                                      Retake Photo
                                      <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        onChange={e => handlePhotoCapture(st.id, e.target.files?.[0])}
                                        style={{ display: 'none' }}
                                      />
                                    </label>
                                  </div>
                                </div>
                              ) : (
                                <label style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f1f5f9',
                                  border: '1px solid #94a3b8', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600
                                }}>
                                  <span>📷 {uploadingPhotoKey === st.id ? 'Uploading Photo...' : 'Capture Photo with Camera'}</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    disabled={uploadingPhotoKey === st.id}
                                    onChange={e => handlePhotoCapture(st.id, e.target.files?.[0])}
                                    style={{ display: 'none' }}
                                  />
                                </label>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Actions */}
            <div style={{ marginTop: 20, borderTop: '1px solid #e5e7eb', paddingTop: 14, display: 'flex', justifyContent: 'space-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setSelectedRun(null)}
                style={{ padding: '9px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: 'white', color: '#4b5563', cursor: 'pointer', fontSize: 13 }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => handleSubmitRun(selectedRun)}
                disabled={submittingRunId === selectedRun.id}
                style={{
                  padding: '9px 24px', borderRadius: 6, border: 'none', background: '#059669', color: 'white',
                  fontWeight: 700, fontSize: 14, cursor: 'pointer'
                }}
              >
                {submittingRunId === selectedRun.id ? 'Submitting...' : '✓ Submit Completed Checklist'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MANAGER INSPECTION & SIGN-OFF */}
      {reviewingRun && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
          <div style={{ background: 'white', borderRadius: 12, maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 24, boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>
                  Manager Quality Verification
                </span>
                <h2 style={{ margin: '2px 0 2px 0', fontSize: 18, fontWeight: 800, color: '#111827' }}>
                  {reviewingRun.title}
                </h2>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  Submitted by <strong>{reviewingRun.submitted_by_name}</strong> • {new Date(reviewingRun.submitted_at).toLocaleString('en-IN')}
                </div>
              </div>

              <button
                onClick={() => setReviewingRun(null)}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#6b7280' }}
              >
                ✕
              </button>
            </div>

            {/* Inspect Answers & Photos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
              {(reviewingRun.checklist_templates?.items || []).map((section, sIdx) => (
                <div key={sIdx} style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>{section.title}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(section.subtasks || []).map(st => {
                      const val = reviewingRun.responses?.[st.id];

                      return (
                        <div key={st.id} style={{ background: 'white', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}>
                          <div style={{ fontWeight: 600, color: '#334151' }}>{st.title}</div>
                          <div style={{ marginTop: 4 }}>
                            {st.type === 'checkbox' && (
                              <span style={{ color: val ? '#059669' : '#dc2626', fontWeight: 600 }}>
                                {val ? '✓ Done' : '✕ Not done'}
                              </span>
                            )}
                            {st.type === 'temperature' && (
                              <span style={{ fontWeight: 700, color: '#0369a1' }}>
                                Reading: {val}°C (Safe: {st.min_val}°C - {st.max_val}°C)
                              </span>
                            )}
                            {st.type === 'photo' && val?.photo_url && (
                              <div style={{ marginTop: 4 }}>
                                <img src={val.photo_url} alt="Proof" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 6, border: '1px solid #ccc' }} />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Recheck Feedback Note */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                Feedback Note (if requesting re-clean/re-check):
              </label>
              <input
                type="text"
                placeholder="e.g. Fryer section needs further degreasing before signoff"
                value={recheckNote}
                onChange={e => setRecheckNote(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>

            {/* Manager Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => handleRequestRecheck(reviewingRun)}
                disabled={approvingId === reviewingRun.id}
                style={{
                  background: '#f59e0b', color: 'white', border: 'none', padding: '9px 16px',
                  borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer'
                }}
              >
                ⚠️ Request Re-check
              </button>

              <button
                type="button"
                onClick={() => handleApprove(reviewingRun)}
                disabled={approvingId === reviewingRun.id}
                style={{
                  background: '#059669', color: 'white', border: 'none', padding: '9px 24px',
                  borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer'
                }}
              >
                {approvingId === reviewingRun.id ? 'Signing off...' : '✓ Approve & Sign Off'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TEMPLATE BUILDER MODAL */}
      {showTemplateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
          <div style={{ background: 'white', borderRadius: 12, maxWidth: 680, width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: 24, boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#111827' }}>
                {editingTemplateId ? 'Edit Checklist Template' : 'Create Checklist Template'}
              </h2>
              <button
                onClick={() => setShowTemplateModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                  Checklist Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Kitchen Night Closing Protocol"
                  value={templateForm.title}
                  onChange={e => setTemplateForm({ ...templateForm, title: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                  Brief Description
                </label>
                <input
                  type="text"
                  placeholder="e.g. Daily station cleaning, temperature logs, and closing checks."
                  value={templateForm.description}
                  onChange={e => setTemplateForm({ ...templateForm, description: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                    Cadence / Frequency
                  </label>
                  <select
                    value={templateForm.cadence}
                    onChange={e => setTemplateForm({ ...templateForm, cadence: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, background: 'white' }}
                  >
                    <option value="daily_once">Daily Once</option>
                    <option value="daily_multiple">Daily Multiple Shifts</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                    Schedule Due Times (comma separated)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 15:30, 23:00"
                    value={templateForm.scheduleTimesText}
                    onChange={e => setTemplateForm({ ...templateForm, scheduleTimesText: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Assignment Controls */}
              <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
                  👥 Who is Assigned to Complete this Checklist?
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="assigned_type"
                      value="department"
                      checked={templateForm.assigned_type === 'department'}
                      onChange={() => setTemplateForm({ ...templateForm, assigned_type: 'department' })}
                    />
                    <span>🏢 By Department</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="assigned_type"
                      value="group"
                      checked={templateForm.assigned_type === 'group'}
                      onChange={() => setTemplateForm({ ...templateForm, assigned_type: 'group' })}
                    />
                    <span>👥 Group of Staff</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="assigned_type"
                      value="individual"
                      checked={templateForm.assigned_type === 'individual'}
                      onChange={() => setTemplateForm({ ...templateForm, assigned_type: 'individual' })}
                    />
                    <span>👤 Single Employee</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="assigned_type"
                      value="all_staff"
                      checked={templateForm.assigned_type === 'all_staff'}
                      onChange={() => setTemplateForm({ ...templateForm, assigned_type: 'all_staff' })}
                    />
                    <span>🌐 All Staff</span>
                  </label>
                </div>

                {/* Sub-selector based on assignment type */}
                {templateForm.assigned_type === 'department' && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                      Select Department (Any on-duty staff member in this department can complete)
                    </label>
                    <select
                      value={templateForm.assigned_department}
                      onChange={e => setTemplateForm({ ...templateForm, assigned_department: e.target.value, department: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, background: 'white' }}
                    >
                      <option value="">-- Choose Department --</option>
                      {departments.map(d => (
                        <option key={d} value={d}>{d} Department</option>
                      ))}
                    </select>
                  </div>
                )}

                {templateForm.assigned_type === 'individual' && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                      Select Designated Employee
                    </label>
                    <select
                      value={templateForm.assigned_employee_id}
                      onChange={e => setTemplateForm({ ...templateForm, assigned_employee_id: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, background: 'white' }}
                    >
                      <option value="">-- Choose Employee --</option>
                      {employees.map(emp => (
                        <option key={emp.employee_id} value={emp.employee_id}>
                          {emp.name} (ID: {emp.employee_id} • {emp.department} • {emp.designation})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {templateForm.assigned_type === 'group' && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                      Select Group Members (Any of the checked staff can complete this checklist):
                    </label>
                    <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: 6, padding: 8, background: 'white', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6 }}>
                      {employees.map(emp => {
                        const isChecked = (templateForm.assigned_employee_ids || []).includes(emp.employee_id);
                        return (
                          <label key={emp.employee_id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#334151', cursor: 'pointer', padding: '3px 4px' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={e => {
                                const current = new Set(templateForm.assigned_employee_ids || []);
                                if (e.target.checked) current.add(emp.employee_id);
                                else current.delete(emp.employee_id);
                                setTemplateForm({ ...templateForm, assigned_employee_ids: Array.from(current) });
                              }}
                            />
                            <span>{emp.name} <small style={{ color: '#64748b' }}>({emp.department})</small></span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Rollover & Approval Toggles */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                    <input
                      type="checkbox"
                      checked={templateForm.rollover_if_missed}
                      onChange={e => setTemplateForm({ ...templateForm, rollover_if_missed: e.target.checked })}
                    />
                    <span>Carry forward if missed (Overdue)</span>
                  </label>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                    Uncheck for grooming/daily point-in-time checks so missed instances expire.
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                    <input
                      type="checkbox"
                      checked={templateForm.requires_approval}
                      onChange={e => setTemplateForm({ ...templateForm, requires_approval: e.target.checked })}
                    />
                    <span>Requires Manager Approval</span>
                  </label>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                    Queues completed runs in the Approvals tab for manager sign-off.
                  </div>
                </div>
              </div>

              {/* Task Tree Builder */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
                    Tasks & Photographic Checks
                  </label>
                  <button
                    type="button"
                    onClick={addSection}
                    style={{ background: '#e0f2fe', color: '#0369a1', border: 'none', padding: '4px 10px', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    + Add Section
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {templateForm.items.map((sec, sIdx) => (
                    <div key={sec.id || sIdx} style={{ background: '#f1f5f9', padding: 12, borderRadius: 8 }}>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <input
                          type="text"
                          value={sec.title}
                          onChange={e => {
                            const updated = [...templateForm.items];
                            updated[sIdx].title = e.target.value;
                            setTemplateForm({ ...templateForm, items: updated });
                          }}
                          placeholder="Section Title (e.g. Prep Station Cleanliness)"
                          style={{ flex: 1, padding: '6px 10px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 13, fontWeight: 700 }}
                        />
                        <button
                          type="button"
                          onClick={() => addSubtask(sIdx)}
                          style={{ background: '#059669', color: 'white', border: 'none', padding: '4px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
                        >
                          + Add Check
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(sec.subtasks || []).map((st, subIdx) => (
                          <div key={st.id || subIdx} style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'white', padding: '6px 10px', borderRadius: 4, border: '1px solid #cbd5e1' }}>
                            <input
                              type="text"
                              value={st.title}
                              onChange={e => {
                                const updated = [...templateForm.items];
                                updated[sIdx].subtasks[subIdx].title = e.target.value;
                                setTemplateForm({ ...templateForm, items: updated });
                              }}
                              placeholder="Task or Photo requirement"
                              style={{ flex: 1, border: 'none', fontSize: 12 }}
                            />
                            <select
                              value={st.type}
                              onChange={e => {
                                const updated = [...templateForm.items];
                                updated[sIdx].subtasks[subIdx].type = e.target.value;
                                setTemplateForm({ ...templateForm, items: updated });
                              }}
                              style={{ fontSize: 11, padding: '2px 6px', border: '1px solid #ccc', borderRadius: 4 }}
                            >
                              <option value="checkbox">Checkbox</option>
                              <option value="photo">📷 Photo Proof</option>
                              <option value="temperature">🌡️ Temp (°C)</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => removeSubtask(sIdx, subIdx)}
                              style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(false)}
                  style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: 'white', color: '#4b5563', cursor: 'pointer', fontSize: 13 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: '#059669', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
                >
                  Save Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChecklistsHubPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading checklists...</div>}>
      <ChecklistsHubContent />
    </Suspense>
  );
}
