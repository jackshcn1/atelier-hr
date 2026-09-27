'use client';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { createClient } from '../../lib/supabaseClient';
import { syncChecklistRuns, formatDelayString } from '../../lib/checklistScheduler';

function TasksAndChecklistsContent() {
  const supabase = createClient();

  // Hub Main View: 'tasks' | 'checklists'
  const [hubSection, setHubSection] = useState('tasks');

  // Tasks Specific State
  const [tasks, setTasks] = useState([]);
  const [taskFilter, setTaskFilter] = useState('all'); // 'all' | 'my' | 'overdue' | 'completed'
  const [taskPriorityFilter, setTaskPriorityFilter] = useState('all');
  const [taskSearch, setTaskSearch] = useState('');
  const [expandedTaskId, setExpandedTaskId] = useState(null);

  // Active Task Actions state
  const [selectedTaskComments, setSelectedTaskComments] = useState([]);
  const [selectedTaskAudit, setSelectedTaskAudit] = useState([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [uploadingProofKey, setUploadingProofKey] = useState(null);
  const [editingDeadlineTask, setEditingDeadlineTask] = useState(null);
  const [newDeadlineDate, setNewDeadlineDate] = useState('');
  const [newDeadlineTime, setNewDeadlineTime] = useState('18:00');
  const [reopenReason, setReopenReason] = useState('');

  // Task Creation Modal state
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    priority: 'normal',
    cadence: 'adhoc',
    due_date: new Date().toISOString().slice(0, 10),
    due_time: '18:00',
    assigned_type: 'individual',
    assigned_employee_id: '',
    assigned_employee_ids: [],
    assigned_department: '',
    subtasks: [{ id: 'sub_1', title: '', completed: false }],
    mandatory_proofs: []
  });

  // Checklists State
  const [runs, setRuns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [runResponses, setRunResponses] = useState({});
  const [uploadingChecklistPhoto, setUploadingChecklistPhoto] = useState(null);
  const [reviewingRun, setReviewingRun] = useState(null);
  const [recheckNote, setRecheckNote] = useState('');

  // Common Context
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [currentEmployee, setCurrentEmployee] = useState(null);
  const [isManager, setIsManager] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadAllData();
  }, []);

  async function loadAllData() {
    setLoading(true);
    setError('');

    // 1. User profile
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);

    if (user) {
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      setCurrentUserProfile(profile);

      const privileged = profile?.is_super_admin || profile?.role === 'admin' || profile?.role === 'super_admin' || profile?.role === 'department_head' || profile?.role === 'hr_manager' || profile?.permissions?.manage_users || profile?.permissions?.view_employees;
      setIsManager(!!privileged);

      const { data: emp } = await supabase.from('employees').select('*').ilike('email', user.email).maybeSingle();
      setCurrentEmployee(emp);
    }

    // 2. Fetch departments & employees
    const { data: depts } = await supabase.from('departments').select('name').order('name');
    setDepartments((depts || []).map(d => d.name));

    const { data: emps } = await supabase.from('employees').select('employee_id, name, department, designation').eq('status', 'active');
    setEmployees(emps || []);

    // 3. Sync & load checklists
    await syncChecklistRuns(supabase);

    const { data: runList } = await supabase
      .from('checklist_runs')
      .select('*, checklist_templates(*)')
      .order('due_at', { ascending: false });
    setRuns(runList || []);

    const { data: tmpls } = await supabase.from('checklist_templates').select('*').order('id', { ascending: false });
    setTemplates(tmpls || []);

    // 4. Load tasks & evaluate overdue status
    await evaluateAndLoadTasks();

    setLoading(false);
  }

  async function evaluateAndLoadTasks() {
    const { data: taskList, error: tErr } = await supabase
      .from('tasks')
      .select('*')
      .order('due_date', { ascending: true })
      .order('due_time', { ascending: true });

    if (tErr) {
      setError(tErr.message);
      return;
    }

    const now = new Date();
    const updatedTasks = [];

    for (const t of taskList || []) {
      const dueDateTime = new Date(`${t.due_date}T${t.due_time || '23:59:00'}`);
      const isPast = now.getTime() > dueDateTime.getTime();

      if (isPast && t.status !== 'completed' && t.status !== 'overdue') {
        await supabase.from('tasks').update({ status: 'overdue', is_overdue: true }).eq('id', t.id);
        t.status = 'overdue';
        t.is_overdue = true;
      }
      updatedTasks.push(t);
    }

    setTasks(updatedTasks);
  }

  // Load task comments & audit log on expand
  async function handleExpandTask(taskId) {
    if (expandedTaskId === taskId) {
      setExpandedTaskId(null);
      return;
    }

    setExpandedTaskId(taskId);
    setError('');

    const { data: comments } = await supabase
      .from('task_comments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
    setSelectedTaskComments(comments || []);

    const { data: audit } = await supabase
      .from('task_audit_logs')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });
    setSelectedTaskAudit(audit || []);
  }

  // Send a comment in task thread
  async function handleSendComment(taskId) {
    if (!newCommentText.trim()) return;

    setSendingComment(true);
    const author = currentEmployee?.name || currentUserProfile?.display_name || currentUser?.email?.split('@')[0] || 'User';
    const role = isManager ? 'Management' : 'Staff';

    const { data: newComm, error: cErr } = await supabase
      .from('task_comments')
      .insert([{
        task_id: taskId,
        user_id: currentUser?.id,
        author_name: author,
        author_role: role,
        message: newCommentText.trim()
      }])
      .select()
      .single();

    setSendingComment(false);
    if (!cErr && newComm) {
      setSelectedTaskComments(prev => [...prev, newComm]);
      setNewCommentText('');
    }
  }

  // Check off or uncheck subtask
  async function handleToggleSubtask(task, subtaskId) {
    if (task.status === 'completed' && !isManager) return;

    const actor = currentEmployee?.name || currentUserProfile?.display_name || currentUser?.email?.split('@')[0] || 'User';
    const now = new Date().toISOString();

    const updatedSubtasks = (task.subtasks || []).map(st => {
      if (st.id === subtaskId) {
        const nextState = !st.completed;
        return {
          ...st,
          completed: nextState,
          completed_by_id: nextState ? (currentEmployee?.employee_id || currentUser?.id) : null,
          completed_by_name: nextState ? actor : null,
          completed_at: nextState ? now : null
        };
      }
      return st;
    });

    const { error: upErr } = await supabase
      .from('tasks')
      .update({ subtasks: updatedSubtasks, updated_at: now })
      .eq('id', task.id);

    if (!upErr) {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, subtasks: updatedSubtasks } : t));

      // Log subtask action
      const changedSt = updatedSubtasks.find(s => s.id === subtaskId);
      await supabase.from('task_audit_logs').insert([{
        task_id: task.id,
        actor_name: actor,
        action: changedSt?.completed ? 'Checked subtask' : 'Unchecked subtask',
        details: `"${changedSt?.title}" marked ${changedSt?.completed ? 'Done' : 'Incomplete'}`
      }]);

      const { data: audit } = await supabase.from('task_audit_logs').select('*').eq('task_id', task.id).order('created_at', { ascending: false });
      setSelectedTaskAudit(audit || []);
    }
  }

  // Upload mandatory deliverable / proof (PDF scan or Camera photo)
  async function handleUploadTaskProof(task, proofId, file) {
    if (!file) return;
    setUploadingProofKey(proofId);

    const ext = file.name.split('.').pop() || 'file';
    const path = `task_deliverables/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;

    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(path, file, { cacheControl: '3600', upsert: true });

    setUploadingProofKey(null);

    if (uploadErr) {
      setError(`Failed to upload deliverable: ${uploadErr.message}`);
      return;
    }

    const { data: signed } = await supabase.storage.from('documents').createSignedUrl(uploadData.path, 31536000);
    const actor = currentEmployee?.name || currentUserProfile?.display_name || currentUser?.email?.split('@')[0] || 'User';
    const now = new Date().toISOString();

    const updatedProofs = (task.mandatory_proofs || []).map(p => {
      if (p.id === proofId) {
        return {
          ...p,
          file_url: signed?.signedUrl || uploadData.path,
          file_name: file.name,
          submitted_by_name: actor,
          submitted_at: now
        };
      }
      return p;
    });

    const { error: upErr } = await supabase
      .from('tasks')
      .update({ mandatory_proofs: updatedProofs, updated_at: now })
      .eq('id', task.id);

    if (!upErr) {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, mandatory_proofs: updatedProofs } : t));

      await supabase.from('task_audit_logs').insert([{
        task_id: task.id,
        actor_name: actor,
        action: 'Uploaded deliverable',
        details: `Attached file "${file.name}" for deliverable item`
      }]);

      const { data: audit } = await supabase.from('task_audit_logs').select('*').eq('task_id', task.id).order('created_at', { ascending: false });
      setSelectedTaskAudit(audit || []);
    }
  }

  // Start Task (Move to in_progress)
  async function handleStartTask(task) {
    const actor = currentEmployee?.name || currentUserProfile?.display_name || currentUser?.email?.split('@')[0] || 'User';
    const now = new Date().toISOString();

    const { error: upErr } = await supabase
      .from('tasks')
      .update({ status: 'in_progress', updated_at: now })
      .eq('id', task.id);

    if (!upErr) {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'in_progress' } : t));
      await supabase.from('task_audit_logs').insert([{
        task_id: task.id,
        actor_name: actor,
        action: 'Started task',
        details: 'Moved status to In Progress'
      }]);
    }
  }

  // Complete Task
  async function handleCompleteTask(task) {
    // Verify mandatory proofs
    const missingProofs = (task.mandatory_proofs || []).filter(p => p.required && !p.file_url);
    if (missingProofs.length > 0) {
      setError(`Cannot complete task: Please attach required mandatory deliverable(s): ${missingProofs.map(p => p.title).join(', ')}`);
      return;
    }

    const actor = currentEmployee?.name || currentUserProfile?.display_name || currentUser?.email?.split('@')[0] || 'User';
    const now = new Date();
    const dueDateTime = new Date(`${task.due_date}T${task.due_time || '23:59:00'}`);
    const delaySec = Math.max(0, Math.round((now.getTime() - dueDateTime.getTime()) / 1000));
    const isDelayed = delaySec > 0;

    const { error: upErr } = await supabase
      .from('tasks')
      .update({
        status: 'completed',
        completed_at: now.toISOString(),
        completed_by: currentUser?.id,
        completed_by_name: actor,
        delay_seconds: delaySec,
        is_overdue: isDelayed,
        updated_at: now.toISOString()
      })
      .eq('id', task.id);

    if (!upErr) {
      setMessage(`✓ Task marked completed! ${isDelayed ? `(Completed with delay of ${formatDelayString(delaySec)})` : '(Completed on time)'}`);
      setTasks(prev => prev.map(t => t.id === task.id ? {
        ...t,
        status: 'completed',
        completed_at: now.toISOString(),
        completed_by_name: actor,
        delay_seconds: delaySec,
        is_overdue: isDelayed
      } : t));

      await supabase.from('task_audit_logs').insert([{
        task_id: task.id,
        actor_name: actor,
        action: 'Completed task',
        details: isDelayed ? `Completed with delay of ${formatDelayString(delaySec)}` : 'Completed on schedule'
      }]);
    }
  }

  // Admin: Reopen Task
  async function handleReopenTask(task) {
    const reason = prompt('Enter reason / feedback for reopening this task:', 'Revisions needed');
    if (reason === null) return;

    const actor = currentEmployee?.name || currentUserProfile?.display_name || currentUser?.email?.split('@')[0] || 'Admin';
    const now = new Date().toISOString();

    const { error: upErr } = await supabase
      .from('tasks')
      .update({
        status: 'in_progress',
        completed_at: null,
        completed_by: null,
        completed_by_name: null,
        updated_at: now
      })
      .eq('id', task.id);

    if (!upErr) {
      setMessage(`🔄 Task reopened for revisions.`);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'in_progress', completed_at: null } : t));

      await supabase.from('task_audit_logs').insert([{
        task_id: task.id,
        actor_name: actor,
        action: 'Reopened task',
        details: `Reason: ${reason}`
      }]);
    }
  }

  // Admin: Edit Deadline
  async function handleSaveDeadline(e) {
    e.preventDefault();
    if (!editingDeadlineTask) return;

    const actor = currentEmployee?.name || currentUserProfile?.display_name || currentUser?.email?.split('@')[0] || 'Admin';
    const now = new Date().toISOString();

    const { error: upErr } = await supabase
      .from('tasks')
      .update({
        due_date: newDeadlineDate,
        due_time: newDeadlineTime || '23:59:00',
        status: 'in_progress',
        is_overdue: false,
        updated_at: now
      })
      .eq('id', editingDeadlineTask.id);

    if (!upErr) {
      setMessage(`✓ Deadline updated to ${newDeadlineDate} ${newDeadlineTime}`);
      setTasks(prev => prev.map(t => t.id === editingDeadlineTask.id ? { ...t, due_date: newDeadlineDate, due_time: newDeadlineTime, is_overdue: false } : t));

      await supabase.from('task_audit_logs').insert([{
        task_id: editingDeadlineTask.id,
        actor_name: actor,
        action: 'Extended deadline',
        details: `New deadline set to ${newDeadlineDate} ${newDeadlineTime}`
      }]);

      setEditingDeadlineTask(null);
    }
  }

  // Create / Save Delegated Task
  async function handleSaveNewTask(e) {
    e.preventDefault();
    if (!taskForm.title.trim()) {
      setError('Task title is required.');
      return;
    }

    setLoading(true);
    setError('');

    const payload = {
      title: taskForm.title.trim(),
      description: taskForm.description.trim(),
      priority: taskForm.priority,
      cadence: taskForm.cadence,
      due_date: taskForm.due_date,
      due_time: taskForm.due_time || '18:00:00',
      assigned_type: taskForm.assigned_type,
      assigned_department: taskForm.assigned_type === 'department' ? (taskForm.assigned_department || null) : null,
      assigned_employee_id: taskForm.assigned_type === 'individual' ? (taskForm.assigned_employee_id || null) : null,
      assigned_employee_ids: taskForm.assigned_type === 'group' ? (taskForm.assigned_employee_ids || []) : [],
      subtasks: taskForm.subtasks.filter(s => s.title.trim()),
      mandatory_proofs: taskForm.mandatory_proofs.filter(p => p.title.trim()),
      created_by: currentUser?.email || 'admin',
      updated_at: new Date().toISOString()
    };

    const { data: created, error: insErr } = await supabase
      .from('tasks')
      .insert([payload])
      .select()
      .single();

    setLoading(false);
    if (insErr) {
      setError(insErr.message);
    } else {
      setMessage('✓ Delegated task assigned successfully.');
      setShowTaskModal(false);

      await supabase.from('task_audit_logs').insert([{
        task_id: created.id,
        actor_name: currentUserProfile?.display_name || currentUser?.email || 'Admin',
        action: 'Created task',
        details: `Assigned task with deadline ${created.due_date}`
      }]);

      loadAllData();
    }
  }

  // Chronologically Sorted Tasks
  const sortedAndFilteredTasks = useMemo(() => {
    let list = tasks.filter(t => {
      // User assignment filter for non-managers
      if (!isManager && currentEmployee) {
        if (t.assigned_type === 'individual' && t.assigned_employee_id !== currentEmployee.employee_id) return false;
        if (t.assigned_type === 'group' && Array.isArray(t.assigned_employee_ids) && !t.assigned_employee_ids.includes(currentEmployee.employee_id)) return false;
        if (t.assigned_type === 'department' && t.assigned_department && t.assigned_department !== currentEmployee.department) return false;
      }

      // Tab filter
      if (taskFilter === 'my' && currentEmployee) {
        const isAssigned = (t.assigned_type === 'individual' && t.assigned_employee_id === currentEmployee.employee_id) ||
          (t.assigned_type === 'group' && (t.assigned_employee_ids || []).includes(currentEmployee.employee_id));
        if (!isAssigned) return false;
      }
      if (taskFilter === 'overdue' && t.status !== 'overdue') return false;
      if (taskFilter === 'completed' && t.status !== 'completed') return false;
      if (taskFilter === 'all' && t.status === 'completed') return true;

      // Priority filter
      if (taskPriorityFilter !== 'all' && t.priority !== taskPriorityFilter) return false;

      // Search query
      if (!taskSearch.trim()) return true;
      const q = taskSearch.toLowerCase();
      return t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q) || (t.assigned_department || '').toLowerCase().includes(q);
    });

    // Chronological Sort:
    // 1. Overdue on top
    // 2. Assigned / In Progress / Reopened sorted by earliest due date
    // 3. Completed at the bottom
    list.sort((a, b) => {
      if (a.status === 'overdue' && b.status !== 'overdue') return -1;
      if (b.status === 'overdue' && a.status !== 'overdue') return 1;

      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (b.status === 'completed' && a.status !== 'completed') return -1;

      const dateA = new Date(`${a.due_date}T${a.due_time || '23:59:00'}`).getTime();
      const dateB = new Date(`${b.due_date}T${b.due_time || '23:59:00'}`).getTime();
      return dateA - dateB;
    });

    return list;
  }, [tasks, taskFilter, taskPriorityFilter, taskSearch, isManager, currentEmployee]);

  // Overall Today's Action Summary (Requirement #12)
  const todayStr = new Date().toISOString().slice(0, 10);
  const tasksDueToday = tasks.filter(t => t.due_date === todayStr && t.status !== 'completed').length;
  const checklistsDueToday = runs.filter(r => ['pending', 'recheck_requested'].includes(r.status)).length;
  const totalOverdueItems = tasks.filter(t => t.status === 'overdue').length + runs.filter(r => r.status === 'overdue').length;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: 40 }}>
      {/* Top Main Navigation / Bifurcation Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0' }}>Operations & Accountability Hub</h1>
          <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
            Manage delegated tasks, compliance licenses, and daily shift operational checklists.
          </p>
        </div>

        {isManager && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowTaskModal(true)}
              style={{
                background: '#1f2937', color: 'white', border: 'none', padding: '9px 16px',
                borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
              }}
            >
              ➕ Delegate New Task
            </button>
          </div>
        )}
      </div>

      {/* Requirement #12: Top Quick Action Summary Banner */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>📊</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>
              Today's Action Summary
            </div>
            <div style={{ fontSize: 13, color: '#4b5563', marginTop: 2 }}>
              <strong>{tasksDueToday}</strong> Delegated Task{tasksDueToday !== 1 ? 's' : ''} & <strong>{checklistsDueToday}</strong> Shift Checklist{checklistsDueToday !== 1 ? 's' : ''} Due Today
            </div>
          </div>
        </div>

        <div>
          {totalOverdueItems > 0 ? (
            <span style={{ padding: '6px 14px', borderRadius: 20, background: '#fee2e2', color: '#991b1b', fontWeight: 'bold', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              ⚠️ {totalOverdueItems} Past Due / Overdue
            </span>
          ) : (
            <span style={{ padding: '6px 14px', borderRadius: 20, background: '#dcfce7', color: '#15803d', fontWeight: 'bold', fontSize: 13 }}>
              ✓ All Schedules on Track
            </span>
          )}
        </div>
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

      {/* Main Section Switcher: Delegated Tasks vs Shift Checklists */}
      <div style={{ display: 'flex', gap: 10, background: '#e5e7eb', padding: 4, borderRadius: 8, marginBottom: 20 }}>
        <button
          onClick={() => setHubSection('tasks')}
          style={{
            flex: 1, padding: '10px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700,
            background: hubSection === 'tasks' ? '#111827' : 'transparent',
            color: hubSection === 'tasks' ? 'white' : '#4b5563',
            transition: 'all 0.15s ease'
          }}
        >
          📋 Delegated Action Tasks ({tasks.filter(t => t.status !== 'completed').length})
        </button>

        <button
          onClick={() => setHubSection('checklists')}
          style={{
            flex: 1, padding: '10px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700,
            background: hubSection === 'checklists' ? '#111827' : 'transparent',
            color: hubSection === 'checklists' ? 'white' : '#4b5563',
            transition: 'all 0.15s ease'
          }}
        >
          ✅ Shift Checklists ({runs.filter(r => ['pending', 'overdue', 'recheck_requested'].includes(r.status)).length})
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: DELEGATED TASKS & ACCOUNTABILITY                               */}
      {/* ========================================================================= */}
      {hubSection === 'tasks' && (
        <div>
          {/* Task Filters & Search */}
          <div style={{ background: 'white', padding: 14, borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 18, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                onClick={() => setTaskFilter('all')}
                style={{
                  padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: taskFilter === 'all' ? '#1f2937' : '#f3f4f6', color: taskFilter === 'all' ? 'white' : '#4b5563'
                }}
              >
                All Tasks
              </button>
              <button
                onClick={() => setTaskFilter('my')}
                style={{
                  padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: taskFilter === 'my' ? '#2563eb' : '#f3f4f6', color: taskFilter === 'my' ? 'white' : '#4b5563'
                }}
              >
                Assigned to Me
              </button>
              <button
                onClick={() => setTaskFilter('overdue')}
                style={{
                  padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: taskFilter === 'overdue' ? '#dc2626' : '#f3f4f6', color: taskFilter === 'overdue' ? 'white' : '#4b5563'
                }}
              >
                ⚠️ Overdue
              </button>
              <button
                onClick={() => setTaskFilter('completed')}
                style={{
                  padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: taskFilter === 'completed' ? '#059669' : '#f3f4f6', color: taskFilter === 'completed' ? 'white' : '#4b5563'
                }}
              >
                ✓ Completed
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, maxWidth: 400, minWidth: 240 }}>
              <input
                type="text"
                placeholder="🔍 Search tasks, subtasks..."
                value={taskSearch}
                onChange={e => setTaskSearch(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
              />
              <select
                value={taskPriorityFilter}
                onChange={e => setTaskPriorityFilter(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12, background: 'white' }}
              >
                <option value="all">All Priorities</option>
                <option value="urgent">🔴 Urgent</option>
                <option value="high">🟠 High</option>
                <option value="normal">🔵 Normal</option>
              </select>
            </div>
          </div>

          {/* Chronological Tasks List */}
          {loading ? (
            <div style={{ background: 'white', padding: 40, textAlign: 'center', borderRadius: 8, color: '#6b7280' }}>
              Loading delegated tasks...
            </div>
          ) : sortedAndFilteredTasks.length === 0 ? (
            <div style={{ background: 'white', padding: 48, textAlign: 'center', borderRadius: 10, border: '1px solid #e5e7eb', color: '#6b7280' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
              <div style={{ fontWeight: 700, color: '#111827', fontSize: 16 }}>No pending delegated tasks!</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>All action items are up to date.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {sortedAndFilteredTasks.map(task => {
                const isOverdue = task.status === 'overdue';
                const isCompleted = task.status === 'completed';
                const isExpanded = expandedTaskId === task.id;

                const subtasksList = task.subtasks || [];
                const completedSubtasksCount = subtasksList.filter(s => s.completed).length;
                const progressPct = subtasksList.length > 0 ? Math.round((completedSubtasksCount / subtasksList.length) * 100) : isCompleted ? 100 : 0;

                // Priority color
                const priorityBadge =
                  task.priority === 'urgent' ? { bg: '#fee2e2', text: '#991b1b', label: '🔴 URGENT' } :
                  task.priority === 'high' ? { bg: '#ffedd5', text: '#c2410c', label: '🟠 HIGH' } :
                  { bg: '#e0f2fe', text: '#0369a1', label: '🔵 NORMAL' };

                // Assignment Label
                const assigneeText =
                  task.assigned_type === 'individual' && task.assigned_employee_id ? `👤 ${employees.find(e => e.employee_id === task.assigned_employee_id)?.name || task.assigned_employee_id}` :
                  task.assigned_type === 'group' ? `👥 Group (${(task.assigned_employee_ids || []).length} Staff)` :
                  task.assigned_type === 'department' ? `🏢 ${task.assigned_department || 'Department'}` :
                  '🌐 All Staff';

                return (
                  <div
                    key={task.id}
                    style={{
                      background: isCompleted ? '#f9fafb' : isOverdue ? '#fff5f5' : 'white',
                      border: isOverdue ? '1.5px solid #f87171' : isCompleted ? '1px solid #e5e7eb' : '1px solid #cbd5e1',
                      borderRadius: 10,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      overflow: 'hidden',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {/* Task Card Header (Click to Expand) */}
                    <div
                      onClick={() => handleExpandTask(task.id)}
                      style={{
                        padding: '14px 18px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 12,
                        userSelect: 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 260 }}>
                        <div style={{ marginTop: 2 }}>
                          <span style={{ padding: '3px 8px', borderRadius: 12, fontSize: 10, fontWeight: 800, background: priorityBadge.bg, color: priorityBadge.text }}>
                            {priorityBadge.label}
                          </span>
                        </div>

                        <div>
                          <div style={{ fontWeight: 800, fontSize: 15, color: isCompleted ? '#6b7280' : '#111827', textDecoration: isCompleted ? 'line-through' : 'none' }}>
                            {task.title}
                          </div>
                          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2, display: 'flex', gap: 10, alignItems: 'center' }}>
                            <span>{assigneeText}</span>
                            <span>•</span>
                            <span style={{ color: isOverdue ? '#dc2626' : isCompleted ? '#059669' : '#374151', fontWeight: 600 }}>
                              {isOverdue ? `⚠️ Overdue (Due ${task.due_date})` : isCompleted ? `✓ Done on ${task.completed_at ? new Date(task.completed_at).toLocaleDateString() : '—'}` : `Due by ${task.due_date} ${task.due_time || ''}`}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Progress Bar & Subtasks summary */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        {subtasksList.length > 0 && (
                          <div style={{ minWidth: 120, textAlign: 'right' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#4b5563', marginBottom: 3 }}>
                              {completedSubtasksCount} / {subtasksList.length} subtasks ({progressPct}%)
                            </div>
                            <div style={{ width: 120, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${progressPct}%`, height: '100%', background: progressPct === 100 ? '#059669' : '#3b82f6', transition: 'width 0.2s' }} />
                            </div>
                          </div>
                        )}

                        <span style={{ fontSize: 12, color: '#9ca3af', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                          ▼
                        </span>
                      </div>
                    </div>

                    {/* Task Expanded Body */}
                    {isExpanded && (
                      <div style={{ padding: '0 18px 18px 18px', borderTop: '1px solid #f3f4f6' }}>
                        {/* Description */}
                        {task.description && (
                          <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, fontSize: 13, color: '#334151', marginTop: 12, lineHeight: 1.5 }}>
                            {task.description}
                          </div>
                        )}

                        {/* Subtasks Interactive Checklist */}
                        {subtasksList.length > 0 && (
                          <div style={{ marginTop: 14 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
                              Subtasks & Milestones:
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {subtasksList.map(st => (
                                <label
                                  key={st.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '8px 10px',
                                    borderRadius: 6,
                                    background: st.completed ? '#f0fdf4' : 'white',
                                    border: st.completed ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                                    cursor: isCompleted && !isManager ? 'default' : 'pointer'
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={!!st.completed}
                                    disabled={isCompleted && !isManager}
                                    onChange={() => handleToggleSubtask(task, st.id)}
                                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                                  />
                                  <div style={{ flex: 1 }}>
                                    <span style={{ fontSize: 13, color: st.completed ? '#15803d' : '#1e293b', textDecoration: st.completed ? 'line-through' : 'none', fontWeight: 500 }}>
                                      {st.title}
                                    </span>
                                    {st.completed_by_name && (
                                      <span style={{ fontSize: 11, color: '#059669', marginLeft: 8 }}>
                                        (✓ Completed by {st.completed_by_name} at {new Date(st.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                                      </span>
                                    )}
                                  </div>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Mandatory Deliverables & Proofs */}
                        {(task.mandatory_proofs || []).length > 0 && (
                          <div style={{ marginTop: 14, background: '#f8fafc', border: '1px solid #e2e8f0', padding: 12, borderRadius: 8 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
                              📎 Mandatory Deliverables / Proof Attachments:
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {(task.mandatory_proofs || []).map(proof => (
                                <div key={proof.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }}>
                                  <div>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                                      {proof.title} {proof.required && <span style={{ color: '#dc2626' }}>*</span>}
                                    </span>
                                    {proof.file_name && (
                                      <div style={{ fontSize: 11, color: '#059669', marginTop: 2 }}>
                                        ✓ Attached: <strong>{proof.file_name}</strong> (by {proof.submitted_by_name})
                                      </div>
                                    )}
                                  </div>

                                  <div>
                                    {proof.file_url ? (
                                      <a
                                        href={proof.file_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: 4, textDecoration: 'none', fontSize: 12, fontWeight: 600, color: '#0369a1' }}
                                      >
                                        View File →
                                      </a>
                                    ) : (
                                      <label style={{ background: '#0284c7', color: 'white', padding: '5px 12px', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                        {uploadingProofKey === proof.id ? 'Uploading...' : proof.proof_type === 'photo' ? '📷 Capture Photo' : 'Upload PDF / File'}
                                        <input
                                          type="file"
                                          accept={proof.proof_type === 'pdf' ? '.pdf' : 'image/*'}
                                          capture={proof.proof_type === 'photo' ? 'environment' : undefined}
                                          disabled={uploadingProofKey === proof.id}
                                          onChange={e => handleUploadTaskProof(task, proof.id, e.target.files?.[0])}
                                          style={{ display: 'none' }}
                                        />
                                      </label>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Comments & Discussion Thread */}
                        <div style={{ marginTop: 16, borderTop: '1px solid #e5e7eb', paddingTop: 14 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
                            💬 Discussion & Updates:
                          </div>

                          <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                            {selectedTaskComments.length === 0 ? (
                              <div style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>No comments yet. Type a message below.</div>
                            ) : (
                              selectedTaskComments.map(c => (
                                <div key={c.id} style={{ background: '#f8fafc', padding: '6px 10px', borderRadius: 6, fontSize: 12 }}>
                                  <span style={{ fontWeight: 700, color: c.author_role === 'Management' ? '#7c3aed' : '#0369a1' }}>
                                    {c.author_name} ({c.author_role}):
                                  </span>{' '}
                                  <span style={{ color: '#1f2937' }}>{c.message}</span>
                                  <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 8 }}>
                                    {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>

                          <div style={{ display: 'flex', gap: 8 }}>
                            <input
                              type="text"
                              placeholder="Write a comment or status note..."
                              value={newCommentText}
                              onChange={e => setNewCommentText(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleSendComment(task.id); }}
                              style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                            />
                            <button
                              type="button"
                              onClick={() => handleSendComment(task.id)}
                              disabled={sendingComment || !newCommentText.trim()}
                              style={{ background: '#1f2937', color: 'white', border: 'none', padding: '7px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                            >
                              Send
                            </button>
                          </div>
                        </div>

                        {/* Activity Audit Log */}
                        {selectedTaskAudit.length > 0 && (
                          <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px dashed #e2e8f0' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
                              📜 Activity Audit Trail
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b', display: 'flex', flexDirection: 'column', gap: 2 }}>
                              {selectedTaskAudit.slice(0, 4).map(a => (
                                <div key={a.id}>
                                  • {new Date(a.created_at).toLocaleDateString()} {new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — <strong>{a.actor_name}</strong>: {a.action} {a.details ? `(${a.details})` : ''}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Bottom Action Buttons */}
                        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                          <div>
                            {isManager && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingDeadlineTask(task);
                                  setNewDeadlineDate(task.due_date);
                                  setNewDeadlineTime(task.due_time?.slice(0, 5) || '18:00');
                                }}
                                style={{ background: 'none', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: 6, fontSize: 12, color: '#475569', cursor: 'pointer', fontWeight: 600 }}
                              >
                                📅 Edit Deadline
                              </button>
                            )}
                          </div>

                          <div style={{ display: 'flex', gap: 8 }}>
                            {task.status === 'assigned' && (
                              <button
                                type="button"
                                onClick={() => handleStartTask(task)}
                                style={{ background: '#2563eb', color: 'white', border: 'none', padding: '8px 18px', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                              >
                                ▶ Start Task (In Progress)
                              </button>
                            )}

                            {(task.status === 'in_progress' || task.status === 'assigned' || task.status === 'overdue' || task.status === 'reopened') && (
                              <button
                                type="button"
                                onClick={() => handleCompleteTask(task)}
                                style={{ background: '#059669', color: 'white', border: 'none', padding: '8px 20px', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                              >
                                ✓ Mark as Completed
                              </button>
                            )}

                            {isCompleted && isManager && (
                              <button
                                type="button"
                                onClick={() => handleReopenTask(task)}
                                style={{ background: '#f59e0b', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                              >
                                🔄 Reopen Task for Revisions
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: SHIFT CHECKLISTS (INTEGRATED)                                  */}
      {/* ========================================================================= */}
      {hubSection === 'checklists' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
              Active Station & Shift Checklists
            </div>
            <a
              href="/checklists"
              style={{ color: '#2563eb', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
            >
              Open Dedicated Checklists View →
            </a>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 12 }}>
            {runs.filter(r => ['pending', 'overdue', 'recheck_requested'].includes(r.status)).map(run => (
              <div
                key={run.id}
                style={{
                  background: 'white',
                  borderRadius: 10,
                  border: run.status === 'overdue' ? '1.5px solid #f87171' : '1px solid #e5e7eb',
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 12
                }}
              >
                <div>
                  <span style={{ fontSize: 11, fontWeight: 'bold', padding: '2px 8px', borderRadius: 12, background: run.status === 'overdue' ? '#fee2e2' : '#ecfdf5', color: run.status === 'overdue' ? '#991b1b' : '#065f46' }}>
                    {run.status === 'overdue' ? '⚠️ Overdue' : '⏳ Current Shift'}
                  </span>
                  <h3 style={{ margin: '6px 0 2px 0', fontSize: 15, fontWeight: 700, color: '#111827' }}>
                    {run.title}
                  </h3>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    {run.department || 'All Staff'} • Due {new Date(run.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                <a
                  href="/checklists"
                  style={{
                    background: run.status === 'overdue' ? '#dc2626' : '#059669',
                    color: 'white',
                    padding: '8px',
                    borderRadius: 6,
                    textAlign: 'center',
                    textDecoration: 'none',
                    fontWeight: 700,
                    fontSize: 13
                  }}
                >
                  Start Checklist →
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: CREATE DELEGATED TASK */}
      {showTaskModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
          <div style={{ background: 'white', borderRadius: 12, maxWidth: 640, width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: 24, boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#111827' }}>
                Delegate New Task
              </h2>
              <button
                onClick={() => setShowTaskModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNewTask} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                  Task Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Renew FSSAI License & Display Board"
                  value={taskForm.title}
                  onChange={e => setTaskForm({ ...taskForm, title: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                  Detailed Description & Instructions
                </label>
                <textarea
                  rows={3}
                  placeholder="Provide any instructions, requirements, or reference details..."
                  value={taskForm.description}
                  onChange={e => setTaskForm({ ...taskForm, description: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                    Priority
                  </label>
                  <select
                    value={taskForm.priority}
                    onChange={e => setTaskForm({ ...taskForm, priority: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, background: 'white' }}
                  >
                    <option value="urgent">🔴 Urgent</option>
                    <option value="high">🟠 High</option>
                    <option value="normal">🔵 Normal</option>
                    <option value="low">⚪ Low</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                    Due Date *
                  </label>
                  <input
                    type="date"
                    value={taskForm.due_date}
                    onChange={e => setTaskForm({ ...taskForm, due_date: e.target.value })}
                    required
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                    Due Time
                  </label>
                  <input
                    type="time"
                    value={taskForm.due_time}
                    onChange={e => setTaskForm({ ...taskForm, due_time: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Assignment Controls */}
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
                  👥 Assign Task To
                </label>

                <div style={{ display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="task_assigned_type"
                      value="individual"
                      checked={taskForm.assigned_type === 'individual'}
                      onChange={() => setTaskForm({ ...taskForm, assigned_type: 'individual' })}
                    />
                    <span>👤 Single Employee</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="task_assigned_type"
                      value="group"
                      checked={taskForm.assigned_type === 'group'}
                      onChange={() => setTaskForm({ ...taskForm, assigned_type: 'group' })}
                    />
                    <span>👥 Group of Staff</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="task_assigned_type"
                      value="department"
                      checked={taskForm.assigned_type === 'department'}
                      onChange={() => setTaskForm({ ...taskForm, assigned_type: 'department' })}
                    />
                    <span>🏢 Department</span>
                  </label>
                </div>

                {taskForm.assigned_type === 'individual' && (
                  <select
                    value={taskForm.assigned_employee_id}
                    onChange={e => setTaskForm({ ...taskForm, assigned_employee_id: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, background: 'white' }}
                  >
                    <option value="">-- Choose Employee --</option>
                    {employees.map(e => (
                      <option key={e.employee_id} value={e.employee_id}>{e.name} ({e.department} • {e.designation})</option>
                    ))}
                  </select>
                )}

                {taskForm.assigned_type === 'department' && (
                  <select
                    value={taskForm.assigned_department}
                    onChange={e => setTaskForm({ ...taskForm, assigned_department: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, background: 'white' }}
                  >
                    <option value="">-- Choose Department --</option>
                    {departments.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                )}

                {taskForm.assigned_type === 'group' && (
                  <div style={{ maxHeight: 130, overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: 6, padding: 8, background: 'white', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 6 }}>
                    {employees.map(emp => {
                      const isChecked = (taskForm.assigned_employee_ids || []).includes(emp.employee_id);
                      return (
                        <label key={emp.employee_id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={e => {
                              const current = new Set(taskForm.assigned_employee_ids || []);
                              if (e.target.checked) current.add(emp.employee_id);
                              else current.delete(emp.employee_id);
                              setTaskForm({ ...taskForm, assigned_employee_ids: Array.from(current) });
                            }}
                          />
                          <span>{emp.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Subtasks Builder */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
                    Subtasks / Milestone Steps
                  </label>
                  <button
                    type="button"
                    onClick={() => setTaskForm({
                      ...taskForm,
                      subtasks: [...taskForm.subtasks, { id: `sub_${Date.now()}`, title: '', completed: false }]
                    })}
                    style={{ background: '#e0f2fe', color: '#0369a1', border: 'none', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                  >
                    + Add Step
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {taskForm.subtasks.map((st, i) => (
                    <div key={st.id || i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder={`Step ${i + 1} (e.g. FSSAI state license scan)`}
                        value={st.title}
                        onChange={e => {
                          const updated = [...taskForm.subtasks];
                          updated[i].title = e.target.value;
                          setTaskForm({ ...taskForm, subtasks: updated });
                        }}
                        style={{ flex: 1, padding: '6px 10px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 12 }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...taskForm.subtasks];
                          updated.splice(i, 1);
                          setTaskForm({ ...taskForm, subtasks: updated });
                        }}
                        style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mandatory Deliverables Builder */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
                    Mandatory Proofs / Deliverables (PDFs / Photos)
                  </label>
                  <button
                    type="button"
                    onClick={() => setTaskForm({
                      ...taskForm,
                      mandatory_proofs: [...taskForm.mandatory_proofs, { id: `proof_${Date.now()}`, title: '', proof_type: 'pdf', required: true }]
                    })}
                    style={{ background: '#ecfdf5', color: '#059669', border: 'none', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                  >
                    + Add Required File
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {taskForm.mandatory_proofs.map((pr, i) => (
                    <div key={pr.id || i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="Deliverable Name (e.g. FSSAI Certificate Scan)"
                        value={pr.title}
                        onChange={e => {
                          const updated = [...taskForm.mandatory_proofs];
                          updated[i].title = e.target.value;
                          setTaskForm({ ...taskForm, mandatory_proofs: updated });
                        }}
                        style={{ flex: 1, padding: '6px 10px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 12 }}
                      />
                      <select
                        value={pr.proof_type}
                        onChange={e => {
                          const updated = [...taskForm.mandatory_proofs];
                          updated[i].proof_type = e.target.value;
                          setTaskForm({ ...taskForm, mandatory_proofs: updated });
                        }}
                        style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11, background: 'white' }}
                      >
                        <option value="pdf">📎 PDF Document</option>
                        <option value="photo">📷 Camera Photo</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...taskForm.mandatory_proofs];
                          updated.splice(i, 1);
                          setTaskForm({ ...taskForm, mandatory_proofs: updated });
                        }}
                        style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowTaskModal(false)}
                  style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: 'white', color: '#4b5563', cursor: 'pointer', fontSize: 13 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: '#1f2937', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
                >
                  Delegate Task →
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT DEADLINE */}
      {editingDeadlineTask && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
          <div style={{ background: 'white', borderRadius: 12, maxWidth: 400, width: '100%', padding: 24, boxSizing: 'border-box' }}>
            <h2 style={{ margin: '0 0 10px 0', fontSize: 16, fontWeight: 800, color: '#111827' }}>
              Edit Task Deadline
            </h2>
            <p style={{ margin: '0 0 14px 0', fontSize: 13, color: '#6b7280' }}>
              {editingDeadlineTask.title}
            </p>

            <form onSubmit={handleSaveDeadline} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                  New Due Date
                </label>
                <input
                  type="date"
                  value={newDeadlineDate}
                  onChange={e => setNewDeadlineDate(e.target.value)}
                  required
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                  New Due Time
                </label>
                <input
                  type="time"
                  value={newDeadlineTime}
                  onChange={e => setNewDeadlineTime(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setEditingDeadlineTask(null)}
                  style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #d1d5db', background: 'white', color: '#4b5563', cursor: 'pointer', fontSize: 12 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: '#2563eb', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}
                >
                  Save New Deadline
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TasksAndChecklistsHubPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading tasks and checklists...</div>}>
      <TasksAndChecklistsContent />
    </Suspense>
  );
}
