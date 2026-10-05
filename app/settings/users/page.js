'use client';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { createClient } from '../../../lib/supabaseClient';

const PERMISSION_DEFINITIONS = [
  {
    category: 'Employees & Personal Data',
    items: [
      { key: 'view_employees', label: 'View Employee Profiles', desc: 'See employee list, DOJ, designation, and basic profile' },
      { key: 'edit_employees', label: 'Edit Employee Details', desc: 'Update phone, address, emergency contact, personal info' },
      { key: 'view_sensitive_info', label: 'View Sensitive Info (Bank & ID Proofs)', desc: 'Access bank details, ID proof numbers, ID photo scans', highSecurity: true },
      { key: 'view_salary', label: 'View Salaries & Salary History', desc: 'See current fixed/variable salaries and salary change logs', highSecurity: true },
      { key: 'edit_salary', label: 'Edit / Record Salary Changes', desc: 'Add new salary revisions and calculate split updates' }
    ]
  },
  {
    category: 'Team & Department Management',
    items: [
      { key: 'manage_track_record', label: 'Manage Track Record (Notes/Warnings)', desc: 'Add and view performance notes, warnings, and merits' },
      { key: 'manage_training', label: 'Manage Training Tracker', desc: 'Assign courses and mark training modules completed' },
      { key: 'manage_documents', label: 'Manage Employee Documents', desc: 'Upload contracts, view uploaded employee documents' }
    ]
  },
  {
    category: 'Payroll & Bank Payouts',
    items: [
      { key: 'view_payroll', label: 'View Payroll Calculations', desc: 'Access monthly attendance calculation table' },
      { key: 'finalize_payroll', label: 'Finalize Payroll & Adjustments', desc: 'Edit variable %, bonuses, deductions, and save payroll' },
      { key: 'process_payments', label: 'Process Bank Payments', desc: 'Access Salary Processing page to copy bank narration & log UTRs' },
      { key: 'view_all_payslips', label: 'View All Company Payslips', desc: 'Access company-wide Payslips Directory (vs own payslips only)' }
    ]
  },
  {
    category: 'Administration & Security',
    items: [
      { key: 'manage_settings', label: 'Manage Settings & Policies', desc: 'Edit deposit amounts, onboarding guidelines, doc templates' },
      { key: 'export_data', label: 'Export Data (CSV)', desc: 'Download bulk employee and salary spreadsheets' },
      { key: 'manage_users', label: 'User & Access Management', desc: 'Add users, assign permissions, revoke/reactivate accounts', highSecurity: true },
      { key: 'delete_employee', label: 'Delete Employees (Admin only)', desc: 'Soft-delete or permanently remove employees', adminOnly: true },
      { key: 'reactivate_user', label: 'Reactivate Inactive Accounts', desc: 'Restore login access for exited or revoked users', adminOnly: true },
      { key: 'edit_locked_bank_details', label: 'Edit Locked Bank Details', desc: 'Override bank account numbers once locked', adminOnly: true }
    ]
  }
];

const PRESETS = {
  employee: {
    label: 'Regular Employee (Default)',
    desc: 'View own payslips only (no management access)',
    scope: 'own_department',
    role: 'employee',
    perms: {}
  },
  department_head: {
    label: 'Department Head',
    desc: 'Manage team notes, training & docs for own department; no salary/bank/payroll',
    scope: 'own_department',
    role: 'department_head',
    perms: {
      view_employees: true,
      manage_track_record: true,
      manage_training: true,
      manage_documents: true
    }
  },
  hr_manager: {
    label: 'HR / Finance Manager',
    desc: 'Manage all staff, payroll, bank processing & payslips (no super-admin rights)',
    scope: 'all_departments',
    role: 'hr_manager',
    perms: {
      view_employees: true,
      edit_employees: true,
      view_sensitive_info: true,
      view_salary: true,
      edit_salary: true,
      manage_track_record: true,
      manage_training: true,
      manage_documents: true,
      view_payroll: true,
      finalize_payroll: true,
      process_payments: true,
      view_all_payslips: true,
      export_data: true
    }
  },
  super_admin: {
    label: 'Super Admin',
    desc: 'Full unrestricted access across all system modules',
    scope: 'all_departments',
    role: 'super_admin',
    perms: {
      view_employees: true,
      edit_employees: true,
      view_sensitive_info: true,
      view_salary: true,
      edit_salary: true,
      manage_track_record: true,
      manage_training: true,
      manage_documents: true,
      view_payroll: true,
      finalize_payroll: true,
      process_payments: true,
      view_all_payslips: true,
      manage_settings: true,
      export_data: true,
      manage_users: true,
      delete_employee: true,
      reactivate_user: true,
      edit_locked_bank_details: true
    }
  }
};

function UserManagementContent() {
  const supabase = createClient();

  const [profiles, setProfiles] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'inactive'
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Create new user form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPreset, setNewUserPreset] = useState('employee');
  const [newUserScope, setNewUserScope] = useState('own_department');
  const [newUserMakeSuper, setNewUserMakeSuper] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);

  // Editing state per user: { [userId]: { scope, perms, role } }
  const [editState, setEditState] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError('');

    // 1. Current user
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: myProfile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      setCurrentUserProfile(myProfile);
    }

    // 2. Fetch all profiles
    const { data: profileList, error: pErr } = await supabase
      .from('profiles')
      .select('*')
      .order('is_super_admin', { ascending: false });

    if (pErr) setError(pErr.message);

    // 3. Fetch all employees
    const { data: empList } = await supabase
      .from('employees')
      .select('employee_id, name, email, phone, designation, department, status, date_of_leaving, deleted_at');

    setProfiles(profileList || []);
    setEmployees(empList || []);

    // Initialise edit state
    const initialEdits = {};
    (profileList || []).forEach(p => {
      initialEdits[p.id] = {
        scope: p.department_scope || 'own_department',
        role: p.role || 'employee',
        perms: p.permissions || {}
      };
    });
    setEditState(initialEdits);

    setLoading(false);
  }

  const empMap = useMemo(() => {
    const map = {};
    employees.forEach(e => {
      if (e.employee_id) map[e.employee_id] = e;
      if (e.email) map[e.email.toLowerCase()] = e;
    });
    return map;
  }, [employees]);

  // Determine if account is effectively inactive (exited employee or revoked)
  function isAccountInactive(profile) {
    if (profile.access_status === 'revoked' || profile.access_status === 'inactive') return true;

    // Check linked employee exit status
    const emp = profile.employee_id ? empMap[profile.employee_id] : profile.email ? empMap[profile.email.toLowerCase()] : null;
    if (emp) {
      if (emp.status === 'exited' || emp.deleted_at) return true;
      if (emp.date_of_leaving) {
        const today = new Date().toISOString().slice(0, 10);
        if (emp.date_of_leaving < today) return true;
      }
    }
    return false;
  }

  // Count active permission toggles
  function countActivePerms(perms) {
    if (!perms) return 0;
    return Object.values(perms).filter(Boolean).length;
  }

  // Handle preset application
  function applyPreset(userId, presetKey) {
    const preset = PRESETS[presetKey];
    if (!preset) return;

    setEditState(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        scope: preset.scope,
        role: preset.role,
        perms: { ...preset.perms }
      }
    }));
  }

  // Toggle individual permission
  function togglePermission(userId, permKey) {
    setEditState(prev => {
      const currentPerms = prev[userId]?.perms || {};
      return {
        ...prev,
        [userId]: {
          ...prev[userId],
          perms: {
            ...currentPerms,
            [permKey]: !currentPerms[permKey]
          }
        }
      };
    });
  }

  function setScope(userId, scopeVal) {
    setEditState(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        scope: scopeVal
      }
    }));
  }

  // Create new user via admin backend API
  async function handleCreateUser(e) {
    e.preventDefault();
    if (!newUserEmail || !newUserEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!newUserPassword || newUserPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setCreatingUser(true);
    setError('');
    setMessage('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const preset = PRESETS[newUserPreset] || PRESETS.employee;

      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          email: newUserEmail.trim(),
          password: newUserPassword,
          display_name: newUserName.trim() || undefined,
          role: newUserMakeSuper ? 'super_admin' : preset.role,
          department_scope: newUserScope,
          is_super_admin: newUserMakeSuper,
          permissions: preset.perms || {}
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create user account.');
      }

      setMessage(`✓ User account ${newUserEmail} created successfully.`);
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserName('');
      setNewUserPreset('employee');
      setNewUserMakeSuper(false);
      setShowCreateForm(false);
      await loadData();
    } catch (err) {
      setError(err.message || 'Error creating user');
    } finally {
      setCreatingUser(false);
    }
  }

  // Save permission changes
  async function handleSavePermissions(profile) {
    if (profile.is_super_admin && currentUserProfile?.id !== profile.id) {
      setError('Cannot modify the primary Super Admin permissions.');
      return;
    }

    setSavingId(profile.id);
    setError('');
    setMessage('');

    const currentEdits = editState[profile.id] || {};
    const perms = currentEdits.perms || {};
    const scope = currentEdits.scope || 'own_department';

    // Auto-compute role label if not super_admin
    let role = currentEdits.role || 'employee';
    if (!profile.is_super_admin) {
      if (perms.manage_users) role = 'admin';
      else if (perms.view_payroll || perms.process_payments) role = 'hr_manager';
      else if (perms.manage_track_record || perms.view_employees) role = 'department_head';
      else role = 'employee';
    }

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        permissions: perms,
        department_scope: scope,
        role,
        updated_at: new Date().toISOString()
      })
      .eq('id', profile.id);

    setSavingId(null);
    if (updateErr) {
      setError(`Failed to save permissions: ${updateErr.message}`);
    } else {
      setMessage(`✓ Permissions successfully updated for ${profile.display_name || profile.email}`);
      setTimeout(() => setMessage(''), 4000);
      setExpandedUserId(null);
      loadData();
    }
  }

  // Promote user to super admin
  async function handlePromoteToSuperAdmin(profile) {
    if (!currentUserProfile?.is_super_admin) {
      setError('Only an existing Super Admin can promote accounts.');
      return;
    }
    if (!window.confirm(`Promote ${profile.display_name || profile.email} to Super Admin? They will receive full unrestricted access.`)) {
      return;
    }

    setSavingId(profile.id);
    setError('');
    setMessage('');

    const { error: err } = await supabase.from('profiles').update({
      is_super_admin: true,
      role: 'super_admin',
      permissions: { ...PRESETS.super_admin.perms },
      updated_at: new Date().toISOString()
    }).eq('id', profile.id);

    setSavingId(null);
    if (err) {
      setError(err.message);
    } else {
      setMessage(`✓ Promoted ${profile.display_name || profile.email} to Super Admin.`);
      loadData();
    }
  }

  // Revoke Access
  async function handleRevokeAccess(profile) {
    if (profile.is_super_admin) {
      setError('Cannot revoke access for the primary Super Admin account.');
      return;
    }

    if (!window.confirm(`Revoke all platform access for ${profile.display_name || profile.email}? They will immediately be logged out.`)) return;

    setSavingId(profile.id);
    const { error: err } = await supabase
      .from('profiles')
      .update({ access_status: 'revoked', updated_at: new Date().toISOString() })
      .eq('id', profile.id);

    setSavingId(null);
    if (err) setError(err.message);
    else {
      setMessage(`Access revoked for ${profile.display_name || profile.email}`);
      loadData();
    }
  }

  // Reactivate Account
  async function handleReactivate(profile) {
    setSavingId(profile.id);
    const { error: err } = await supabase
      .from('profiles')
      .update({ access_status: 'active', updated_at: new Date().toISOString() })
      .eq('id', profile.id);

    setSavingId(null);
    if (err) setError(err.message);
    else {
      setMessage(`✓ Account reactivated for ${profile.display_name || profile.email}`);
      loadData();
    }
  }

  // Categorise and sort profiles
  const { activeUsersList, inactiveUsersList } = useMemo(() => {
    const active = [];
    const inactive = [];

    profiles.forEach(p => {
      const isInactive = isAccountInactive(p);
      if (isInactive) inactive.push(p);
      else active.push(p);
    });

    // Sort Active: Super Admin & Elevated Permissions at the top
    active.sort((a, b) => {
      if (a.is_super_admin) return -1;
      if (b.is_super_admin) return 1;

      const countA = countActivePerms(a.permissions);
      const countB = countActivePerms(b.permissions);

      if (countA > 0 && countB === 0) return -1;
      if (countB > 0 && countA === 0) return 1;
      return countB - countA;
    });

    return { activeUsersList: active, inactiveUsersList: inactive };
  }, [profiles, empMap]);

  // Filter current tab by search
  const displayedUsers = useMemo(() => {
    const list = activeTab === 'active' ? activeUsersList : inactiveUsersList;
    if (!searchQuery.trim()) return list;

    const q = searchQuery.toLowerCase();
    return list.filter(p => {
      const emp = p.employee_id ? empMap[p.employee_id] : p.email ? empMap[p.email.toLowerCase()] : null;
      return (
        (p.email || '').toLowerCase().includes(q) ||
        (p.display_name || '').toLowerCase().includes(q) ||
        (p.employee_id || '').toLowerCase().includes(q) ||
        (p.department || '').toLowerCase().includes(q) ||
        (emp?.name || '').toLowerCase().includes(q) ||
        (emp?.designation || '').toLowerCase().includes(q)
      );
    });
  }, [activeTab, activeUsersList, inactiveUsersList, searchQuery, empMap]);

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Users & access control</h1>
          <p className="page-purpose">
            Create accounts, assign permission presets, configure scopes, and manage access status.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateForm(o => !o)}
            className="btn-primary"
          >
            {showCreateForm ? 'Cancel' : '+ Add new user'}
          </button>
          <a href="/settings" className="btn-secondary">
            Settings
          </a>
        </div>
      </div>

      {/* Notifications */}
      {message && (
        <div className="mb-6 rounded-card border border-good/30 bg-good-wash px-4 py-3 text-sm text-good">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-6 rounded-card border border-bad/30 bg-bad-wash px-4 py-3 text-sm text-bad">
          {error}
        </div>
      )}

      {/* Create User Form Drawer/Modal Panel */}
      {showCreateForm && (
        <form onSubmit={handleCreateUser} className="panel panel-body mb-8 animate-settle">
          <div className="flex items-baseline justify-between border-b border-rule-soft pb-4 mb-6">
            <h2 className="panel-title">Add user account</h2>
            <span className="text-xs text-ink-muted">Creates both login credentials and access profile</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <div>
              <label className="field-label">Email address *</label>
              <input
                type="email"
                required
                value={newUserEmail}
                onChange={e => setNewUserEmail(e.target.value)}
                placeholder="colleague@atelier.com"
                className="field"
              />
            </div>

            <div>
              <label className="field-label">Password * (min 6 chars)</label>
              <input
                type="text"
                required
                value={newUserPassword}
                onChange={e => setNewUserPassword(e.target.value)}
                placeholder="Temporary login password"
                className="field"
              />
            </div>

            <div>
              <label className="field-label">Display name</label>
              <input
                type="text"
                value={newUserName}
                onChange={e => setNewUserName(e.target.value)}
                placeholder="e.g. John Doe"
                className="field"
              />
            </div>

            <div>
              <label className="field-label">Role preset</label>
              <select
                value={newUserPreset}
                onChange={e => setNewUserPreset(e.target.value)}
                className="field"
              >
                {Object.entries(PRESETS).map(([k, p]) => (
                  <option key={k} value={k}>{p.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label">Department access scope</label>
              <select
                value={newUserScope}
                onChange={e => setNewUserScope(e.target.value)}
                className="field"
              >
                <option value="own_department">Own Department Only</option>
                <option value="all_departments">All Departments (Company-wide)</option>
              </select>
            </div>

            {currentUserProfile?.is_super_admin && (
              <div className="flex items-center pt-6">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-accent">
                  <input
                    type="checkbox"
                    checked={newUserMakeSuper}
                    onChange={e => setNewUserMakeSuper(e.target.checked)}
                    className="rounded border-rule text-accent focus:ring-accent"
                  />
                  <span>Make Super Admin (Full master rights)</span>
                </label>
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t border-rule-soft pt-4">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creatingUser}
              className="btn-primary"
            >
              {creatingUser ? 'Creating user...' : 'Create user account'}
            </button>
          </div>
        </form>
      )}

      {/* Stats Summary Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="panel p-4">
          <div className="text-2xs font-medium uppercase tracking-wide text-ink-muted">Active Users</div>
          <div className="text-2xl font-serif mt-1 text-ink">{activeUsersList.length}</div>
        </div>

        <div className="panel p-4">
          <div className="text-2xs font-medium uppercase tracking-wide text-accent">Elevated / Managers</div>
          <div className="text-2xl font-serif mt-1 text-accent">
            {activeUsersList.filter(p => p.is_super_admin || countActivePerms(p.permissions) > 0).length}
          </div>
        </div>

        <div className="panel p-4">
          <div className="text-2xs font-medium uppercase tracking-wide text-ink-muted">Standard Employees</div>
          <div className="text-2xl font-serif mt-1 text-ink">
            {activeUsersList.filter(p => !p.is_super_admin && countActivePerms(p.permissions) === 0).length}
          </div>
        </div>

        <div className="panel p-4">
          <div className="text-2xs font-medium uppercase tracking-wide text-bad">Inactive / Revoked</div>
          <div className="text-2xl font-serif mt-1 text-bad">{inactiveUsersList.length}</div>
        </div>
      </div>

      {/* Tabs & Search Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('active')}
            className={activeTab === 'active' ? 'btn-primary text-xs' : 'btn-secondary text-xs'}
          >
            Active Users ({activeUsersList.length})
          </button>
          <button
            onClick={() => setActiveTab('inactive')}
            className={activeTab === 'inactive' ? 'btn-danger text-xs' : 'btn-secondary text-xs'}
          >
            Inactive & Revoked ({inactiveUsersList.length})
          </button>
        </div>

        <div className="w-full sm:w-auto min-w-[16rem]">
          <input
            type="text"
            placeholder="Search name, email, department..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="field text-xs py-1.5"
          />
        </div>
      </div>

      {/* Users List */}
      {loading ? (
        <div className="panel panel-body text-center py-16">
          <p className="text-sm text-ink-muted">Loading user accounts…</p>
        </div>
      ) : displayedUsers.length === 0 ? (
        <div className="note text-center py-12">
          <p className="text-ink">No user accounts found in this category.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {displayedUsers.map(profile => {
            const emp = profile.employee_id ? empMap[profile.employee_id] : profile.email ? empMap[profile.email.toLowerCase()] : null;
            const isSuperAdmin = profile.is_super_admin;
            const isInactive = isAccountInactive(profile);
            const activePermCount = countActivePerms(profile.permissions);
            const hasElevated = isSuperAdmin || activePermCount > 0;
            const isExpanded = expandedUserId === profile.id;
            const currentEdit = editState[profile.id] || { scope: 'own_department', perms: {} };

            return (
              <div
                key={profile.id}
                className={`panel overflow-hidden transition-colors ${
                  isSuperAdmin
                    ? 'border-accent/40 bg-surface'
                    : isInactive
                    ? 'opacity-70 bg-page'
                    : 'bg-surface'
                }`}
              >
                {/* User Row Header */}
                <div
                  onClick={() => setExpandedUserId(isExpanded ? null : profile.id)}
                  className="flex flex-wrap items-center justify-between gap-4 p-4 cursor-pointer hover:bg-page/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-[16rem]">
                    {/* Badge */}
                    <div>
                      {isSuperAdmin ? (
                        <span className="pill-good font-semibold">Super Admin</span>
                      ) : isInactive ? (
                        <span className="pill-bad">Inactive / Revoked</span>
                      ) : hasElevated ? (
                        <span className="pill-warn">
                          {profile.role ? profile.role.replace('_', ' ').toUpperCase() : 'MANAGEMENT'} ({activePermCount} perms)
                        </span>
                      ) : (
                        <span className="pill-quiet">Employee (Slips only)</span>
                      )}
                    </div>

                    {/* Name & Details */}
                    <div>
                      <div className="text-sm font-medium text-ink">
                        {profile.display_name || emp?.name || profile.email}
                        {profile.employee_id && (
                          <span className="text-xs text-ink-muted ml-2 font-normal">
                            (ID: {profile.employee_id})
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-ink-muted mt-0.5">
                        {profile.email} · {profile.department || emp?.department || 'All Depts'}
                        {profile.department_scope === 'all_departments' && (
                          <span className="text-accent ml-2 font-medium">[Scope: All Depts]</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    {!isInactive && !isSuperAdmin && (
                      <button
                        type="button"
                        onClick={() => handleRevokeAccess(profile)}
                        disabled={savingId === profile.id}
                        className="btn-quiet text-bad hover:bg-bad-wash text-xs px-2.5 py-1"
                      >
                        Revoke access
                      </button>
                    )}

                    {currentUserProfile?.is_super_admin && !isSuperAdmin && (
                      <button
                        type="button"
                        onClick={() => handlePromoteToSuperAdmin(profile)}
                        disabled={savingId === profile.id}
                        className="btn-secondary text-accent text-xs px-2.5 py-1"
                      >
                        Make Super Admin
                      </button>
                    )}

                    {isInactive && (
                      <button
                        type="button"
                        onClick={() => handleReactivate(profile)}
                        disabled={savingId === profile.id}
                        className="btn-secondary text-good text-xs px-2.5 py-1"
                      >
                        Reactivate
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setExpandedUserId(isExpanded ? null : profile.id)}
                      className={isExpanded ? 'btn-primary text-xs py-1' : 'btn-secondary text-xs py-1'}
                    >
                      {isExpanded ? 'Hide' : 'Permissions'}
                    </button>
                  </div>
                </div>

                {/* Expanded Permission Configurator */}
                {isExpanded && (
                  <div className="border-t border-rule-soft bg-page p-6">
                    {isSuperAdmin ? (
                      <div className="note">
                        <p className="font-medium text-ink">Super Admin Account</p>
                        <p className="mt-1">
                          This account holds unrestricted master access across all company databases, payroll, settings, and user permissions.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Department Scope */}
                        <div className="panel panel-body">
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-3">
                            Department Access Scope
                          </h3>
                          <div className="flex flex-wrap gap-6 text-sm text-ink">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`scope-${profile.id}`}
                                value="own_department"
                                checked={currentEdit.scope !== 'all_departments'}
                                onChange={() => setScope(profile.id, 'own_department')}
                                className="text-ink focus:ring-accent"
                              />
                              <span><strong>Own Department Only</strong> ({profile.department || emp?.department || 'Assigned Department'})</span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`scope-${profile.id}`}
                                value="all_departments"
                                checked={currentEdit.scope === 'all_departments'}
                                onChange={() => setScope(profile.id, 'all_departments')}
                                className="text-ink focus:ring-accent"
                              />
                              <span><strong>All Departments</strong> (Company-Wide Access)</span>
                            </label>
                          </div>
                        </div>

                        {/* 1-Click Presets */}
                        <div className="panel panel-body">
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-3">
                            Apply Role Preset
                          </h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            {Object.entries(PRESETS).map(([key, preset]) => (
                              <button
                                key={key}
                                type="button"
                                onClick={() => applyPreset(profile.id, key)}
                                className="text-left p-3 rounded-control border border-rule bg-surface hover:bg-page transition-colors"
                              >
                                <div className="text-xs font-semibold text-ink">{preset.label}</div>
                                <div className="text-2xs text-ink-muted mt-1 leading-snug">{preset.desc}</div>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Custom Toggles */}
                        <div className="panel panel-body">
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-4">
                            Custom Permission Toggles
                          </h3>

                          <div className="space-y-6">
                            {PERMISSION_DEFINITIONS.map(cat => (
                              <div key={cat.category}>
                                <div className="text-2xs font-medium uppercase tracking-wide text-ink-muted mb-2">
                                  {cat.category}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  {cat.items.map(item => {
                                    const isChecked = !!currentEdit.perms?.[item.key];
                                    return (
                                      <label
                                        key={item.key}
                                        className={`flex items-start gap-2.5 p-2.5 rounded-control border cursor-pointer transition-colors ${
                                          isChecked
                                            ? 'border-accent/40 bg-accent/5'
                                            : 'border-rule bg-surface hover:bg-page'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() => togglePermission(profile.id, item.key)}
                                          className="mt-0.5 rounded border-rule text-ink focus:ring-accent"
                                        />
                                        <div>
                                          <div className="text-xs font-medium text-ink">
                                            {item.label}
                                            {item.highSecurity && (
                                              <span className="text-bad ml-1.5 text-2xs font-normal">[High Security]</span>
                                            )}
                                          </div>
                                          <div className="text-2xs text-ink-muted mt-0.5">{item.desc}</div>
                                        </div>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Save Actions */}
                        <div className="flex justify-end gap-3 pt-2">
                          <button
                            type="button"
                            onClick={() => setExpandedUserId(null)}
                            className="btn-secondary"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSavePermissions(profile)}
                            disabled={savingId === profile.id}
                            className="btn-primary"
                          >
                            {savingId === profile.id ? 'Saving…' : 'Save permissions'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function UserManagementPage() {
  return (
    <Suspense fallback={<div className="py-24 text-center text-sm text-ink-muted">Loading user management portal…</div>}>
      <UserManagementContent />
    </Suspense>
  );
}
