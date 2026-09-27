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
    label: '👤 Regular Employee (Default)',
    desc: 'View own payslips only (no management access)',
    scope: 'own_department',
    role: 'employee',
    perms: {}
  },
  department_head: {
    label: '👨‍🍳 Department Head',
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
    label: '💼 HR / Finance Manager',
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
    label: '👑 Super Admin',
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

  // Revoke Access
  async function handleRevokeAccess(profile) {
    if (profile.is_super_admin) {
      setError('Cannot revoke access for the primary Super Admin account.');
      return;
    }

    if (!window.confirm(`Revoke all platform access for ${profile.display_name || profile.email}? They will immediately be logged out and unable to sign in.`)) return;

    setSavingId(profile.id);
    const { error: err } = await supabase
      .from('profiles')
      .update({ access_status: 'revoked', updated_at: new Date().toISOString() })
      .eq('id', profile.id);

    setSavingId(null);
    if (err) setError(err.message);
    else {
      setMessage(`🚫 Access revoked for ${profile.display_name || profile.email}`);
      loadData();
    }
  }

  // Reactivate Account (Admin Only)
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

    // Sort Active: Super Admin & Elevated Permissions ALWAYS at the TOP
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
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0' }}>User Management & Access Control</h1>
          <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
            Assign custom permission toggles, department scopes, manage role presets, and handle access revocations.
          </p>
        </div>
        <a
          href="/settings"
          style={{
            background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db',
            padding: '8px 16px', borderRadius: 6, textDecoration: 'none', fontWeight: 600, fontSize: 13
          }}
        >
          ← Back to Settings
        </a>
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

      {/* Stats Summary Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div style={{ background: 'white', padding: 14, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Active Users</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginTop: 2 }}>{activeUsersList.length}</div>
        </div>

        <div style={{ background: '#fdf4ff', padding: 14, borderRadius: 8, border: '1px solid #f0abfc', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#a21caf', textTransform: 'uppercase' }}>Elevated / Managers</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#86198f', marginTop: 2 }}>
            {activeUsersList.filter(p => p.is_super_admin || countActivePerms(p.permissions) > 0).length}
          </div>
        </div>

        <div style={{ background: 'white', padding: 14, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Standard Employees</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginTop: 2 }}>
            {activeUsersList.filter(p => !p.is_super_admin && countActivePerms(p.permissions) === 0).length}
          </div>
        </div>

        <div style={{ background: '#fef2f2', padding: 14, borderRadius: 8, border: '1px solid #fecaca', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#991b1b', textTransform: 'uppercase' }}>Inactive / Exited</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#b91c1c', marginTop: 2 }}>{inactiveUsersList.length}</div>
        </div>
      </div>

      {/* Tabs & Search Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setActiveTab('active')}
            style={{
              padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: activeTab === 'active' ? '#1f2937' : '#e5e7eb', color: activeTab === 'active' ? 'white' : '#374151'
            }}
          >
            Active Users ({activeUsersList.length})
          </button>
          <button
            onClick={() => setActiveTab('inactive')}
            style={{
              padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: activeTab === 'inactive' ? '#dc2626' : '#e5e7eb', color: activeTab === 'inactive' ? 'white' : '#374151'
            }}
          >
            🚫 Inactive & Revoked ({inactiveUsersList.length})
          </button>
        </div>

        <input
          type="text"
          placeholder="🔍 Search name, email, employee ID, role..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #d1d5db', width: 280, fontSize: 13 }}
        />
      </div>

      {/* Users List Accordion */}
      {loading ? (
        <div style={{ background: 'white', padding: 40, textAlign: 'center', borderRadius: 8, color: '#6b7280' }}>
          Loading user accounts...
        </div>
      ) : displayedUsers.length === 0 ? (
        <div style={{ background: 'white', padding: 40, textAlign: 'center', borderRadius: 8, color: '#6b7280' }}>
          No user accounts found in this category.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                style={{
                  background: isInactive ? '#fafafa' : hasElevated ? '#ffffff' : '#ffffff',
                  border: isSuperAdmin ? '2px solid #7c3aed' : hasElevated ? '1px solid #c084fc' : isInactive ? '1px solid #e5e7eb' : '1px solid #e5e7eb',
                  borderRadius: 10,
                  boxShadow: hasElevated ? '0 2px 6px rgba(124, 58, 237, 0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
                  overflow: 'hidden'
                }}
              >
                {/* User Row Header */}
                <div
                  onClick={() => setExpandedUserId(isExpanded ? null : profile.id)}
                  style={{
                    padding: '14px 18px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    userSelect: 'none',
                    background: isSuperAdmin ? '#faf5ff' : hasElevated ? '#fdf4ff' : 'white',
                    flexWrap: 'wrap',
                    gap: 10
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 260 }}>
                    {/* Role / Elevation Badge */}
                    <div>
                      {isSuperAdmin ? (
                        <span style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 'bold', background: '#7c3aed', color: 'white' }}>
                          👑 Super Admin
                        </span>
                      ) : isInactive ? (
                        <span style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 'bold', background: '#fee2e2', color: '#991b1b' }}>
                          🚫 Inactive / Revoked
                        </span>
                      ) : hasElevated ? (
                        <span style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 'bold', background: '#f3e8ff', color: '#7c3aed' }}>
                          ⚡ {profile.role ? profile.role.replace('_', ' ').toUpperCase() : 'MANAGEMENT'} ({activePermCount} perms)
                        </span>
                      ) : (
                        <span style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 'bold', background: '#f3f4f6', color: '#4b5563' }}>
                          👤 Employee (Slips only)
                        </span>
                      )}
                    </div>

                    {/* Name & Details */}
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: 15, color: isInactive ? '#6b7280' : '#111827' }}>
                        {profile.display_name || emp?.name || profile.email}
                        {profile.employee_id && (
                          <span style={{ fontWeight: 'normal', fontSize: 12, color: '#6b7280', marginLeft: 8 }}>
                            (ID: {profile.employee_id})
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>
                        {profile.email} • {profile.department || emp?.department || 'All Depts'}
                        {profile.department_scope === 'all_departments' && <span style={{ color: '#7c3aed', fontWeight: 600, marginLeft: 6 }}>[Scope: All Depts]</span>}
                      </div>
                    </div>
                  </div>

                  {/* Actions & Chevron */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} onClick={e => e.stopPropagation()}>
                    {!isInactive && !isSuperAdmin && (
                      <button
                        type="button"
                        onClick={() => handleRevokeAccess(profile)}
                        disabled={savingId === profile.id}
                        style={{
                          background: 'transparent', color: '#dc2626', border: '1px solid #fecaca',
                          padding: '4px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: 500
                        }}
                      >
                        Revoke Access
                      </button>
                    )}

                    {isInactive && (
                      <button
                        type="button"
                        onClick={() => handleReactivate(profile)}
                        disabled={savingId === profile.id}
                        style={{
                          background: '#059669', color: 'white', border: 'none',
                          padding: '4px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: 600
                        }}
                      >
                        ✓ Reactivate
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setExpandedUserId(isExpanded ? null : profile.id)}
                      style={{
                        background: isExpanded ? '#1f2937' : '#e5e7eb',
                        color: isExpanded ? 'white' : '#374151',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {isExpanded ? '▲ Hide Settings' : '🎛️ Permissions'}
                    </button>
                  </div>
                </div>

                {/* Expanded Permission Configurator */}
                {isExpanded && (
                  <div style={{ padding: 20, borderTop: '1px solid #e5e7eb', background: '#fafafa' }}>
                    {isSuperAdmin ? (
                      <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', padding: 14, borderRadius: 8, color: '#5b21b6', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 20 }}>👑</span>
                        <div>
                          <strong>Protected Primary Super Admin Account</strong>
                          <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#6d28d9' }}>
                            This account holds unrestricted master access across all company databases, payroll, settings, and user permissions. For security, it cannot be revoked.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Section 1: Department Scope Toggle */}
                        <div style={{ background: 'white', padding: 14, borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 16 }}>
                          <div style={{ fontSize: 13, fontWeight: 'bold', color: '#111827', marginBottom: 6 }}>
                            🏢 Department Access Scope
                          </div>
                          <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name={`scope-${profile.id}`}
                                value="own_department"
                                checked={currentEdit.scope !== 'all_departments'}
                                onChange={() => setScope(profile.id, 'own_department')}
                              />
                              <span><strong>Own Department Only</strong> ({profile.department || emp?.department || 'Assigned Department'})</span>
                            </label>

                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name={`scope-${profile.id}`}
                                value="all_departments"
                                checked={currentEdit.scope === 'all_departments'}
                                onChange={() => setScope(profile.id, 'all_departments')}
                              />
                              <span><strong>All Departments</strong> (Company-Wide Access)</span>
                            </label>
                          </div>
                        </div>

                        {/* Section 2: 1-Click Role Presets */}
                        <div style={{ background: 'white', padding: 14, borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 16 }}>
                          <div style={{ fontSize: 13, fontWeight: 'bold', color: '#111827', marginBottom: 8 }}>
                            ⚡ Apply 1-Click Role Preset
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
                            {Object.entries(PRESETS).map(([key, preset]) => (
                              <button
                                key={key}
                                type="button"
                                onClick={() => applyPreset(profile.id, key)}
                                style={{
                                  textAlign: 'left',
                                  padding: '8px 12px',
                                  borderRadius: 6,
                                  border: '1px solid #d1d5db',
                                  background: '#f9fafb',
                                  cursor: 'pointer'
                                }}
                              >
                                <div style={{ fontWeight: 'bold', fontSize: 12, color: '#111827' }}>{preset.label}</div>
                                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{preset.desc}</div>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Section 3: Detailed Permission Toggles */}
                        <div style={{ background: 'white', padding: 16, borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 16 }}>
                          <div style={{ fontSize: 14, fontWeight: 'bold', color: '#111827', marginBottom: 12 }}>
                            🎛️ Custom Permission Toggles
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {PERMISSION_DEFINITIONS.map(cat => (
                              <div key={cat.category}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>
                                  {cat.category}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 8 }}>
                                  {cat.items.map(item => {
                                    const isChecked = !!currentEdit.perms?.[item.key];
                                    return (
                                      <label
                                        key={item.key}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'flex-start',
                                          gap: 10,
                                          padding: '8px 10px',
                                          borderRadius: 6,
                                          border: isChecked ? '1px solid #c084fc' : '1px solid #f3f4f6',
                                          background: isChecked ? '#faf5ff' : '#ffffff',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() => togglePermission(profile.id, item.key)}
                                          style={{ marginTop: 2 }}
                                        />
                                        <div>
                                          <div style={{ fontSize: 13, fontWeight: 600, color: isChecked ? '#7c3aed' : '#1f2937' }}>
                                            {item.label}
                                            {item.highSecurity && <span style={{ fontSize: 10, color: '#dc2626', marginLeft: 4 }}>[High Security]</span>}
                                          </div>
                                          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{item.desc}</div>
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
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                          <button
                            type="button"
                            onClick={() => setExpandedUserId(null)}
                            style={{
                              padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db',
                              background: 'white', color: '#4b5563', cursor: 'pointer', fontSize: 13
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSavePermissions(profile)}
                            disabled={savingId === profile.id}
                            style={{
                              padding: '8px 20px', borderRadius: 6, border: 'none',
                              background: '#7c3aed', color: 'white', fontWeight: 'bold', cursor: 'pointer', fontSize: 13
                            }}
                          >
                            {savingId === profile.id ? 'Saving...' : '💾 Save Permission Changes'}
                          </button>
                        </div>
                      </>
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
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading user management portal...</div>}>
      <UserManagementContent />
    </Suspense>
  );
}
