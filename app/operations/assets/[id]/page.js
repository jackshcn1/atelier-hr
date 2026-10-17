'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

// Mock API simulation - replace with real API calls in production
const mockAssetData = {
  'KICH00001': {
    id: 'KICH00001',
    name: 'Chiller',
    category: 'Kitchen Equipment',
    type: 'Chiller',
    brand: 'Hoshizaki',
    model: 'FM-300U',
    serial: 'KICH00001',
    vendor: 'Thomson',
    purchaseDate: '2025-03-10',
    newOrUsed: 'Brand New',
    condition: 'Brand New',
    status: 'Available',
    location: 'Kitchen',
    assignedEmployee: '',
    warrantyMonths: 12,
    warrantyContact: '+91 98765 43210',
    extendedWarranty: false,
    extendedWarrantyMonths: 12,
    buyingPrice: '85000',
    notes: 'Main kitchen chiller — keep clean.',
    previousData: null,
  },
  'KICH00002': {
    id: 'KICH00002',
    name: 'Chiller',
    category: 'Kitchen Equipment',
    type: 'Chiller',
    brand: 'Hoshizaki',
    model: 'FM-300U',
    serial: 'KICH00002',
    vendor: 'Thomson',
    purchaseDate: '2025-03-10',
    newOrUsed: 'Brand New',
    condition: 'Good',
    status: 'In-use',
    location: 'Bakery',
    assignedEmployee: 'John Doe',
    warrantyMonths: 12,
    warrantyContact: '+91 98765 43210',
    extendedWarranty: false,
    extendedWarrantyMonths: 12,
    buyingPrice: '85000',
    notes: 'Used in bakery for refrigeration.',
    previousData: null,
  },
};

// Mock audit log data
const mockAuditLog = {
  'KICH00001': [
    { timestamp: '2026-10-15 14:30', action: 'created', user: 'System', details: 'Created asset KICH00001 — Chiller (Kitchen Equipment, Kitchen)', comment: null },
    { timestamp: '2026-10-15 15:45', action: 'updated', user: 'Sarah Miller', details: 'Location changed from Kitchen to Bakery', comment: 'Moved for renovation work' },
    { timestamp: '2026-10-15 16:00', action: 'updated', user: 'Sarah Miller', details: 'Condition updated from Brand New to Good', comment: null },
    { timestamp: '2026-10-15 16:15', action: 'updated', user: 'Tom Wilson', details: 'Status changed from Available to In-use', comment: 'Assigned to Bakery team' },
  ],
  'KICH00002': [
    { timestamp: '2026-10-15 10:15', action: 'created', user: 'System', details: 'Created asset KICH00002 — Chiller (Kitchen Equipment, Bakery)', comment: null },
    { timestamp: '2026-10-15 11:00', action: 'updated', user: 'John Doe', details: 'Assigned to John Doe', comment: 'Staff assignment' },
    { timestamp: '2026-10-15 14:30', action: 'updated', user: 'Sarah Miller', details: 'Condition updated from Brand New to Good', comment: 'Minor scratch on unit' },
  ],
};

export default function AssetDetailPage() {
  const params = useParams();
  const assetId = params?.id || '';

  const [form, setForm] = useState({
    name: '',
    category: '',
    type: '',
    brand: '',
    model: '',
    serial: '',
    vendor: '',
    purchaseDate: '',
    newOrUsed: 'Brand New',
    condition: 'Brand New',
    status: 'Available',
    location: '',
    assignedEmployee: '',
    warrantyMonths: 0,
    warrantyContact: '',
    extendedWarranty: false,
    extendedWarrantyMonths: 0,
    buyingPrice: '',
    notes: '',
  });

  const [originalData, setOriginalData] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCommentDialog, setShowCommentDialog] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(null);

  // Fetch asset data based on assetId
  useEffect(() => {
    const fetchAssetData = async () => {
      setLoading(true);
      try {
        // Simulate API call - replace with real fetch in production
        await new Promise(resolve => setTimeout(resolve, 500));

        const assetData = mockAssetData[assetId];
        if (assetData) {
          setOriginalData(assetData);
          setForm({
            name: assetData.name,
            category: assetData.category,
            type: assetData.type,
            brand: assetData.brand,
            model: assetData.model,
            serial: assetData.serial,
            vendor: assetData.vendor,
            purchaseDate: assetData.purchaseDate,
            newOrUsed: assetData.newOrUsed,
            condition: assetData.condition,
            status: assetData.status,
            location: assetData.location,
            assignedEmployee: assetData.assignedEmployee || '',
            warrantyMonths: assetData.warrantyMonths,
            warrantyContact: assetData.warrantyContact,
            extendedWarranty: assetData.extendedWarranty,
            extendedWarrantyMonths: assetData.extendedWarrantyMonths,
            buyingPrice: assetData.buyingPrice,
            notes: assetData.notes,
          });
          setAuditLog(mockAuditLog[assetId] || []);
        } else {
          // Handle case where asset is not found
          console.error('Asset not found:', assetId);
          // Set default empty state
          setOriginalData({ serial: assetId });
        }
      } catch (error) {
        console.error('Error fetching asset data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (assetId) {
      fetchAssetData();
    }
  }, [assetId]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value });
  };

  const detectChanges = () => {
    if (!originalData) return [];
    const changes = [];
    const formKeys = Object.keys(form);

    for (const key of formKeys) {
      if (form[key] !== originalData[key]) {
        changes.push({
          field: key,
          oldValue: originalData[key],
          newValue: form[key],
        });
      }
    }
    return changes;
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const changes = detectChanges();

    if (changes.length > 0) {
      // Show comment dialog instead of immediately recording changes
      setPendingChanges(changes);
      setShowCommentDialog(true);
    } else {
      alert('No changes to save');
    }
  };

  const handleCommentSubmit = (comment) => {
    // Record changes to audit log with comment
    const currentTime = new Date().toLocaleTimeString('en-US', { hour12: false }) + ' ' + new Date().toLocaleDateString();

    const newAuditEntries = pendingChanges.map(change => ({
      timestamp: currentTime,
      action: 'updated',
      user: 'Current User', // Replace with actual current user in production
      details: generateChangeDetails(change),
      comment: comment || null,
    }));

    setAuditLog(prev => [...prev, ...newAuditEntries]);
    console.log('Changes recorded to audit log:', newAuditEntries);

    setSaved(true);
    setTimeout(() => setSaved(false), 2500);

    // Simulate API call to save changes
    const saveChanges = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        // In production, this would be: await fetch('/api/assets/update', { method: 'POST', body: JSON.stringify({ ...form, id: assetId }) })
        console.log('Changes saved to database:', { ...form, id: assetId });

        // Update original data with new values
        setOriginalData({ ...originalData, ...form });
      } catch (error) {
        console.error('Error saving changes:', error);
      }
    };

    saveChanges();

    // Close dialog and reset
    setShowCommentDialog(false);
    setPendingChanges(null);
  };

  const handleCommentDialogClose = () => {
    setShowCommentDialog(false);
    setPendingChanges(null);
  };

  // Helper function to generate human-readable change details
  const generateChangeDetails = (change) => {
    const fieldNames = {
      name: 'Asset Name',
      category: 'Category',
      type: 'Type',
      brand: 'Brand',
      model: 'Model',
      serial: 'Serial',
      vendor: 'Vendor',
      purchaseDate: 'Purchase Date',
      newOrUsed: 'New/Used Status',
      condition: 'Condition',
      status: 'Status',
      location: 'Location',
      assignedEmployee: 'Assigned Employee',
      warrantyMonths: 'Warranty Period',
      warrantyContact: 'Warranty Contact',
      extendedWarranty: 'Extended Warranty',
      extendedWarrantyMonths: 'Extended Warranty Period',
      buyingPrice: 'Buying Price',
      notes: 'Notes',
    };

    const fieldName = fieldNames[change.field] || change.field;

    if (change.field === 'location' && change.oldValue && change.newValue) {
      return `Location changed from ${change.oldValue} to ${change.newValue}`;
    } else if (change.field === 'condition' && change.oldValue && change.newValue) {
      return `Condition updated from ${change.oldValue} to ${change.newValue}`;
    } else if (change.field === 'status' && change.oldValue && change.newValue) {
      return `Status changed from ${change.oldValue} to ${change.newValue}`;
    } else if (change.oldValue === null && change.newValue !== null) {
      return `${fieldName} set to ${change.newValue}`;
    } else if (change.oldValue !== null && change.newValue === null) {
      return `${fieldName} removed`;
    } else {
      return `${fieldName} changed from "${change.oldValue}" to "${change.newValue}"`;
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
        <div className="max-w-3xl mx-auto px-6 py-16 lg:py-24 text-center">
          <div className="text-lg">Loading asset details...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-3xl mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/operations/assets" className="btn-secondary text-xs px-3 py-1.5">← Assets</Link>
        </div>
        <div className="page-head mb-8">
          <h1 className="font-serif text-3xl text-[#1e1812]">Asset Details</h1>
          <p className="text-xs text-[#6b635c] mt-1">Locked ID: {assetId}</p>
        </div>

        <form onSubmit={handleSubmit} className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm">
          <div className="panel-body p-6 lg:p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <label className="block">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Asset #</span>
                <input className="field text-sm bg-[#f6f4f2] text-[#8b6f4e]" disabled value={form.serial} />
                <span className="text-xs text-[#8b6f4e] mt-1 block">Locked — cannot edit</span>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Asset Name</span>
                <input name="name" value={form.name} onChange={handleChange} className="field text-sm" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Brand</span>
                <input name="brand" value={form.brand} onChange={handleChange} className="field text-sm" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Model Number</span>
                <input name="model" value={form.model} onChange={handleChange} className="field text-sm" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Category</span>
                <select name="category" value={form.category} onChange={handleChange} className="field text-sm bg-white">
                  <option>Kitchen Equipment</option><option>Furniture</option><option>Uniform</option><option>Electronics</option><option>Cleaning Supplies</option><option>Packaging</option><option>Other</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Type of Asset</span>
                <select name="type" value={form.type} onChange={handleChange} className="field text-sm bg-white">
                  <option>Chiller</option><option>Freezer</option><option>Oven</option><option>Grill</option><option>Table</option><option>Chair</option><option>Stool</option><option>Lamp</option><option>TV</option><option>AC</option><option>Uniform Top</option><option>Uniform Bottom</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Condition</span>
                <select name="condition" value={form.condition} onChange={handleChange} className="field text-sm bg-white">
                  <option>Brand New</option><option>Good</option><option>Requires Maintenance</option><option>Bad</option><option>Damaged/Unusable</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Status</span>
                <select name="status" value={form.status} onChange={handleChange} className="field text-sm bg-white">
                  <option>Available</option><option>In-use</option><option>Employee-assigned</option><option>Maintenance</option><option>Returned</option><option>Discarded</option><option>Transferred</option><option>Sold</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Location</span>
                <select name="location" value={form.location} onChange={handleChange} className="field text-sm bg-white">
                  <option>Kitchen</option><option>Restaurant</option><option>Office</option><option>Sales Counter</option><option>Employee</option><option>Storage</option><option>Outside Outlet</option><option>Other</option>
                </select>
              </label>
              {form.location === 'Employee' && (
                <label className="block">
                  <span className="text-xs font-medium text-[#6b635c] mb-1 block">Assigned Employee</span>
                  <input name="assignedEmployee" value={form.assignedEmployee} onChange={handleChange} className="field text-sm" />
                </label>
              )}
              <label className="block">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Date of Purchase / Transfer</span>
                <input name="purchaseDate" type="date" value={form.purchaseDate} onChange={handleChange} className="field text-sm" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Brand New / Used</span>
                <select name="newOrUsed" value={form.newOrUsed} onChange={handleChange} className="field text-sm bg-white">
                  <option>Brand New</option><option>Used</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Vendor</span>
                <input name="vendor" value={form.vendor} onChange={handleChange} className="field text-sm" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Invoice Number</span>
                <input name="invoiceNumber" value={form.invoiceNumber || ''} onChange={handleChange} className="field text-sm" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Warranty Period (months)</span>
                <input name="warrantyMonths" type="number" value={form.warrantyMonths === 0 ? '' : form.warrantyMonths} onChange={handleChange} className="field text-sm" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Extended Warranty</span>
                <div className="flex items-center gap-2">
                  <input type="checkbox" name="extendedWarranty" checked={form.extendedWarranty} onChange={handleChange} className="h-4 w-4" />
                  <span>Yes</span>
                  {form.extendedWarranty && (
                    <input name="extendedWarrantyMonths" type="number" placeholder="Months" value={form.extendedWarrantyMonths} onChange={handleChange} className="field text-sm w-24 ml-2" />
                  )}
                </div>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Warranty Contact Number</span>
                <input name="warrantyContact" value={form.warrantyContact} onChange={handleChange} className="field text-sm" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Buying Price (₹)</span>
                <input name="buyingPrice" value={form.buyingPrice} onChange={handleChange} className="field text-sm" />
              </label>
              <label className="block md:col-span-3">
                <span className="text-xs font-medium text-[#6b635c] mb-1 block">Notes (comments on changes)</span>
                <textarea name="notes" value={form.notes} onChange={handleChange} rows={3} className="field text-sm w-full" placeholder="Record any changes, comments, or issues here..." />
              </label>
            </div>

            {/* Comment Dialog Popup - shown when changes detected */}
            {showCommentDialog && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <div className="bg-white rounded-card shadow-2xl max-w-md mx-4 p-6 border border-[#ebe8e4]">
                  <h3 className="font-serif text-xl mb-2">Document Change</h3>
                  <div className="text-sm text-[#6b635c] mb-4">
                    <p className="font-medium mb-1">Changes detected:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {pendingChanges?.map((change, i) => (
                        <li key={i}>{generateChangeDetails(change)}</li>
                      ))}
                    </ul>
                  </div>
                  <label className="block">
                    <span className="text-xs font-medium text-[#6b635c] mb-1 block">Change Comments</span>
                    <textarea
                      id="commentText"
                      rows={3}
                      className="field text-sm w-full"
                      placeholder="Document any changes made, reasons for changes, or additional context..."
                      autoFocus
                      defaultValue=""
                    />
                  </label>
                  <div className="flex gap-3 mt-5">
                    <button
                      onClick={() => {
                        const comment = document.getElementById('commentText')?.value || '';
                        handleCommentSubmit(comment);
                      }}
                      className="btn-primary text-sm px-4 py-2"
                    >
                      Save with Comment
                    </button>
                    <button
                      onClick={() => handleCommentSubmit('')}
                      className="btn-secondary text-sm px-4 py-2"
                    >
                      Save (No Comment)
                    </button>
                    <button
                      onClick={handleCommentDialogClose}
                      className="btn-quiet text-sm px-4 py-2"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Audit Log Section */}
            <div className="mt-8 pt-6 border-t border-[#ebe8e4]">
              <h2 className="font-serif text-xl mb-4">Audit Log</h2>
              <div className="space-y-3 text-xs">
                {auditLog.length > 0 ? (
                  auditLog.map((entry, index) => (
                    <div key={index} className="flex gap-2">
                      <span className="text-[#8b6f4e] whitespace-nowrap">{entry.timestamp}</span>
                      <span className="text-[#1e1812]">
                        {entry.action === 'created' ? 'Created' : 'Updated'} asset {assetId} — {entry.details}
                        {entry.comment && (
                          <>
                            {' '}<br />
                            <span className="text-[#6b635c] italic">Comment: {entry.comment}</span>
                          </>
                        )}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-[#8b6f4e] text-center py-4">
                    No audit entries available for this asset.
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6 pt-6 border-t border-[#ebe8e4]">
              <button type="submit" className="btn-primary text-sm px-5">Save Changes</button>
              <Link href="/operations/assets" className="btn-secondary text-sm px-5">Back</Link>
            </div>
          </div>
        </form>
        {saved && <div className="mt-3 text-sm text-green-700 font-medium">Changes saved successfully.</div>}
      </div>
    </main>
  );
}
