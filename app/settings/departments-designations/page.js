'use client';
import { useState, useEffect, Suspense } from 'react';
import { createClient } from '../../../lib/supabaseClient';

function DeptsAndDesignationsContent() {
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState('departments'); // 'departments' | 'designations'
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [allEmployees, setAllEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Department Modal State
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [editingDept, setEditingDept] = useState(null); // null for new, { name, head_employee_id, description }
  const [deptForm, setDeptForm] = useState({ name: '', head_employee_id: '', description: '' });

  // Designation Modal State
  const [showDesigModal, setShowDesigModal] = useState(false);
  const [editingDesig, setEditingDesig] = useState(null);
  const [desigForm, setDesigForm] = useState({ name: '', department: '', description: '' });

  // Filter for designations tab
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('all');

  useEffect(() => {
    loadAllData();
  }, []);

  async function loadAllData() {
    setLoading(true);
    setError('');

    const [deptRes, desigRes, empRes] = await Promise.all([
      supabase.from('departments').select('*').order('name'),
      supabase.from('designations').select('*').order('name'),
      supabase.from('employees').select('employee_id, name, department, designation, status').is('deleted_at', null)
    ]);

    if (deptRes.error) setError(deptRes.error.message);
    else setDepartments(deptRes.data || []);

    if (desigRes.error) setError(desigRes.error.message);
    else setDesignations(desigRes.data || []);

    setAllEmployees(empRes.data || []);
    setLoading(false);
  }

  // --- DEPARTMENT HANDLERS ---
  function handleOpenAddDept() {
    setEditingDept(null);
    setDeptForm({ name: '', head_employee_id: '', description: '' });
    setShowDeptModal(true);
    setError('');
    setMessage('');
  }

  function handleOpenEditDept(dept) {
    setEditingDept(dept);
    setDeptForm({
      name: dept.name,
      head_employee_id: dept.head_employee_id || '',
      description: dept.description || ''
    });
    setShowDeptModal(true);
    setError('');
    setMessage('');
  }

  async function handleSaveDepartment(e) {
    e.preventDefault();
    const cleanName = deptForm.name.trim();
    if (!cleanName) { setError('Department name cannot be empty.'); return; }

    setSaving(true);
    setError('');
    setMessage('');

    if (editingDept) {
      // If renamed, update name
      const isRenamed = editingDept.name !== cleanName;
      const { error: upErr } = await supabase
        .from('departments')
        .update({
          name: cleanName,
          head_employee_id: deptForm.head_employee_id || null,
          description: deptForm.description.trim() || null
        })
        .eq('name', editingDept.name);

      if (upErr) {
        setError(`Failed to update department: ${upErr.message}`);
        setSaving(false);
        return;
      }

      // If renamed, update employees that were in this department
      if (isRenamed) {
        await supabase.from('employees').update({ department: cleanName }).eq('department', editingDept.name);
        await supabase.from('designations').update({ department: cleanName }).eq('department', editingDept.name);
      }

      setMessage(`✓ Department "${cleanName}" updated successfully.`);
    } else {
      // Check for duplicate
      if (departments.some(d => d.name.toLowerCase() === cleanName.toLowerCase())) {
        setError(`A department named "${cleanName}" already exists.`);
        setSaving(false);
        return;
      }

      const { error: insErr } = await supabase
        .from('departments')
        .insert([{
          name: cleanName,
          head_employee_id: deptForm.head_employee_id || null,
          description: deptForm.description.trim() || null
        }]);

      if (insErr) {
        setError(`Failed to create department: ${insErr.message}`);
        setSaving(false);
        return;
      }

      setMessage(`✓ Department "${cleanName}" created successfully.`);
    }

    setShowDeptModal(false);
    setSaving(false);
    loadAllData();
  }

  async function handleDeleteDepartment(dept) {
    const assignedCount = allEmployees.filter(e => e.department === dept.name).length;
    if (assignedCount > 0) {
      if (!window.confirm(`Warning: There are currently ${assignedCount} employee(s) assigned to the "${dept.name}" department.\n\nDeleting this department will unassign their department field. Are you sure you want to proceed?`)) {
        return;
      }
    } else {
      if (!window.confirm(`Are you sure you want to delete the "${dept.name}" department?`)) {
        return;
      }
    }

    setSaving(true);
    setError('');
    setMessage('');

    const { error: delErr } = await supabase
      .from('departments')
      .delete()
      .eq('name', dept.name);

    setSaving(false);
    if (delErr) {
      setError(`Failed to delete department: ${delErr.message}`);
    } else {
      setMessage(`✓ Department "${dept.name}" removed.`);
      loadAllData();
    }
  }

  // --- DESIGNATION HANDLERS ---
  function handleOpenAddDesig() {
    setEditingDesig(null);
    setDesigForm({
      name: '',
      department: departments.length > 0 ? departments[0].name : '',
      description: ''
    });
    setShowDesigModal(true);
    setError('');
    setMessage('');
  }

  function handleOpenEditDesig(desig) {
    setEditingDesig(desig);
    setDesigForm({
      name: desig.name,
      department: desig.department || '',
      description: desig.description || ''
    });
    setShowDesigModal(true);
    setError('');
    setMessage('');
  }

  async function handleSaveDesignation(e) {
    e.preventDefault();
    const cleanName = desigForm.name.trim();
    if (!cleanName) { setError('Designation title cannot be empty.'); return; }

    setSaving(true);
    setError('');
    setMessage('');

    if (editingDesig) {
      const isRenamed = editingDesig.name !== cleanName;
      const { error: upErr } = await supabase
        .from('designations')
        .update({
          name: cleanName,
          department: desigForm.department || null,
          description: desigForm.description.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingDesig.id);

      if (upErr) {
        setError(`Failed to update designation: ${upErr.message}`);
        setSaving(false);
        return;
      }

      if (isRenamed) {
        await supabase.from('employees').update({ designation: cleanName }).eq('designation', editingDesig.name);
      }

      setMessage(`✓ Designation "${cleanName}" updated successfully.`);
    } else {
      if (designations.some(d => d.name.toLowerCase() === cleanName.toLowerCase())) {
        setError(`A designation named "${cleanName}" already exists.`);
        setSaving(false);
        return;
      }

      const { error: insErr } = await supabase
        .from('designations')
        .insert([{
          name: cleanName,
          department: desigForm.department || null,
          description: desigForm.description.trim() || null
        }]);

      if (insErr) {
        setError(`Failed to create designation: ${insErr.message}`);
        setSaving(false);
        return;
      }

      setMessage(`✓ Designation "${cleanName}" created successfully.`);
    }

    setShowDesigModal(false);
    setSaving(false);
    loadAllData();
  }

  async function handleDeleteDesignation(desig) {
    const assignedCount = allEmployees.filter(e => e.designation === desig.name).length;
    if (assignedCount > 0) {
      if (!window.confirm(`Warning: There are currently ${assignedCount} employee(s) with the "${desig.name}" designation.\n\nDeleting this designation will remove it from future dropdown selections. Existing employees will keep their title. Are you sure you want to proceed?`)) {
        return;
      }
    } else {
      if (!window.confirm(`Are you sure you want to delete the "${desig.name}" designation?`)) {
        return;
      }
    }

    setSaving(true);
    setError('');
    setMessage('');

    const { error: delErr } = await supabase
      .from('designations')
      .delete()
      .eq('id', desig.id);

    setSaving(false);
    if (delErr) {
      setError(`Failed to delete designation: ${delErr.message}`);
    } else {
      setMessage(`✓ Designation "${desig.name}" removed.`);
      loadAllData();
    }
  }

  const filteredDesignations = selectedDeptFilter === 'all'
    ? designations
    : designations.filter(d => d.department === selectedDeptFilter);

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', paddingBottom: 50 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0' }}>Departments & Designations</h1>
          <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
            Configure organization departments, role designations, and department heads for dropdown menus across onboarding and employee profiles.
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

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '2px solid #e5e7eb', marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab('departments')}
          style={{
            background: 'none', border: 'none',
            padding: '10px 18px', fontSize: 14, fontWeight: 700,
            color: activeTab === 'departments' ? '#2563eb' : '#6b7280',
            borderBottom: activeTab === 'departments' ? '2.5px solid #2563eb' : '2.5px solid transparent',
            marginBottom: -2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
          }}
        >
          🏢 Departments ({departments.length})
        </button>
        <button
          onClick={() => setActiveTab('designations')}
          style={{
            background: 'none', border: 'none',
            padding: '10px 18px', fontSize: 14, fontWeight: 700,
            color: activeTab === 'designations' ? '#2563eb' : '#6b7280',
            borderBottom: activeTab === 'designations' ? '2.5px solid #2563eb' : '2.5px solid transparent',
            marginBottom: -2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
          }}
        >
          💼 Designations ({designations.length})
        </button>
      </div>

      {/* TAB 1: DEPARTMENTS */}
      {activeTab === 'departments' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>
                Configured Company Departments
              </h2>
              <span style={{ fontSize: 12, color: '#6b7280' }}>
                These appear as primary department choices during onboarding and checklist scheduling.
              </span>
            </div>
            <button
              onClick={handleOpenAddDept}
              style={{
                background: '#2563eb', color: 'white', border: 'none',
                padding: '8px 16px', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer'
              }}
            >
              + Add New Department
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {departments.map(dept => {
              const staffCount = allEmployees.filter(e => e.department === dept.name).length;
              const headEmp = allEmployees.find(e => e.employee_id === dept.head_employee_id);
              const deptDesigs = designations.filter(d => d.department === dept.name);

              return (
                <div
                  key={dept.name}
                  style={{
                    background: 'white', border: '1px solid #e5e7eb', borderRadius: 8,
                    padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#111827' }}>
                        {dept.name}
                      </h3>
                      <span style={{
                        background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 12,
                        fontSize: 11, fontWeight: 700, border: '1px solid #bfdbfe'
                      }}>
                        {staffCount} Staff Member{staffCount !== 1 ? 's' : ''}
                      </span>
                    </div>

                    <p style={{ fontSize: 12, color: '#4b5563', margin: '0 0 10px 0', minHeight: 32 }}>
                      {dept.description || 'No description provided.'}
                    </p>

                    <div style={{ fontSize: 11, color: '#6b7280', borderTop: '1px solid #f3f4f6', paddingTop: 8, marginBottom: 12 }}>
                      <div>
                        👤 Department Head:{' '}
                        {headEmp ? (
                          <strong style={{ color: '#1e293b' }}>{headEmp.name} ({headEmp.designation || 'Lead'})</strong>
                        ) : (
                          <span style={{ fontStyle: 'italic', color: '#9ca3af' }}>Unassigned</span>
                        )}
                      </div>
                      <div style={{ marginTop: 3 }}>
                        💼 Linked Designations: <strong>{deptDesigs.length} configured</strong>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #f3f4f6', paddingTop: 10 }}>
                    <button
                      onClick={() => handleOpenEditDept(dept)}
                      style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', padding: '4px 10px', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => handleDeleteDepartment(dept)}
                      style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '4px 8px' }}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: DESIGNATIONS */}
      {activeTab === 'designations' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>
                Configured Role Designations
              </h2>
              <span style={{ fontSize: 12, color: '#6b7280' }}>
                These appear in the designation dropdown when adding or updating employees.
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <select
                value={selectedDeptFilter}
                onChange={e => setSelectedDeptFilter(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, background: 'white' }}
              >
                <option value="all">All Departments ({designations.length})</option>
                {departments.map(d => (
                  <option key={d.name} value={d.name}>{d.name}</option>
                ))}
              </select>

              <button
                onClick={handleOpenAddDesig}
                style={{
                  background: '#059669', color: 'white', border: 'none',
                  padding: '8px 16px', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer'
                }}
              >
                + Add New Designation
              </button>
            </div>
          </div>

          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb', background: '#f9fafb', color: '#6b7280', fontSize: 12, textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 14px' }}>Designation Title</th>
                  <th>Department</th>
                  <th>Description / Responsibilities</th>
                  <th>Staff Count</th>
                  <th style={{ textAlign: 'right', paddingRight: 14 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDesignations.map(desig => {
                  const staffCount = allEmployees.filter(e => e.designation === desig.name).length;

                  return (
                    <tr key={desig.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: '#111827' }}>
                        {desig.name}
                      </td>
                      <td>
                        <span style={{ background: '#f1f5f9', color: '#334155', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                          {desig.department || 'All Departments'}
                        </span>
                      </td>
                      <td style={{ color: '#4b5563', fontSize: 12 }}>
                        {desig.description || '—'}
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: staffCount > 0 ? '#059669' : '#9ca3af' }}>
                          {staffCount} {staffCount === 1 ? 'employee' : 'employees'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', paddingRight: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                          <button
                            onClick={() => handleOpenEditDesig(desig)}
                            style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, cursor: 'pointer', fontSize: 12 }}
                          >
                            ✏️ Edit
                          </button>
                          <button
                            onClick={() => handleDeleteDesignation(desig)}
                            style={{ background: 'none', border: 'none', color: '#dc2626', fontWeight: 600, cursor: 'pointer', fontSize: 12 }}
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredDesignations.length === 0 && (
              <div style={{ padding: 30, textAlign: 'center', color: '#6b7280' }}>
                No designations configured for this filter.
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT DEPARTMENT */}
      {showDeptModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <div style={{
            background: 'white', borderRadius: 8, padding: 24,
            maxWidth: 500, width: '100%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #e5e7eb', paddingBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#111827' }}>
                {editingDept ? `Edit Department: ${editingDept.name}` : '+ Add New Department'}
              </h3>
              <button
                type="button"
                onClick={() => setShowDeptModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 18, color: '#9ca3af', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveDepartment} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Department Name *
                <input
                  type="text"
                  required
                  placeholder="e.g. Service, Kitchen, Bar, Admin"
                  value={deptForm.name}
                  onChange={e => setDeptForm({ ...deptForm, name: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Department Head (Manager)
                <select
                  value={deptForm.head_employee_id}
                  onChange={e => setDeptForm({ ...deptForm, head_employee_id: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, background: 'white', boxSizing: 'border-box' }}
                >
                  <option value="">None / Unassigned</option>
                  {allEmployees.map(emp => (
                    <option key={emp.employee_id} value={emp.employee_id}>
                      {emp.name} ({emp.designation || 'Staff'} • {emp.department || 'General'})
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Description / Operational Scope
                <textarea
                  placeholder="Brief summary of functions managed by this department"
                  value={deptForm.description}
                  onChange={e => setDeptForm({ ...deptForm, description: e.target.value })}
                  rows={3}
                  style={{ width: '100%', padding: '8px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowDeptModal(false)}
                  style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', padding: '8px 16px', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ background: '#2563eb', color: 'white', border: 'none', padding: '8px 20px', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  {saving ? 'Saving...' : '💾 Save Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT DESIGNATION */}
      {showDesigModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <div style={{
            background: 'white', borderRadius: 8, padding: 24,
            maxWidth: 500, width: '100%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #e5e7eb', paddingBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#111827' }}>
                {editingDesig ? `Edit Designation: ${editingDesig.name}` : '+ Add New Designation'}
              </h3>
              <button
                type="button"
                onClick={() => setShowDesigModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 18, color: '#9ca3af', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveDesignation} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Designation Title *
                <input
                  type="text"
                  required
                  placeholder="e.g. Captain, Line Cook, Barista"
                  value={desigForm.name}
                  onChange={e => setDesigForm({ ...desigForm, name: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Associated Department
                <select
                  value={desigForm.department}
                  onChange={e => setDesigForm({ ...desigForm, department: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, background: 'white', boxSizing: 'border-box' }}
                >
                  <option value="">General / All Departments</option>
                  {departments.map(d => (
                    <option key={d.name} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </label>

              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Role Description / Notes
                <textarea
                  placeholder="Responsibilities or level description"
                  value={desigForm.description}
                  onChange={e => setDesigForm({ ...desigForm, description: e.target.value })}
                  rows={3}
                  style={{ width: '100%', padding: '8px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, boxSizing: 'border-box' }}
                />
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowDesigModal(false)}
                  style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', padding: '8px 16px', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ background: '#059669', color: 'white', border: 'none', padding: '8px 20px', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  {saving ? 'Saving...' : '💾 Save Designation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DepartmentsDesignationsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading departments & designations...</div>}>
      <DeptsAndDesignationsContent />
    </Suspense>
  );
}
