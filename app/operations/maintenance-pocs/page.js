'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const SPECIALITY_OPTIONS = [
  'Carpenter', 'Electrician', 'Plumber', 'AC Technician', 'Appliance Repair', 'Masonry', 'Painter', 'General Contractor', 'Other'
];

export default function MaintenancePOCsPage() {
  const [pocs, setPocs] = useState([
    {
      id: 'POC-001',
      name: 'Ramesh Kumar',
      speciality: 'Electrician',
      contact: '+91 98471 23456',
      alternateContact: '+91 94470 11111',
      reference: 'Recommended by Chef Thomas',
      notes: 'Reliable for emergency electrical failures. Available 24/7.',
      rating: 5,
      serviceHistory: [
        { jobId: 'MNT-101', date: '2026-09-15', description: 'Main kitchen fuse board repair', cost: '₹2,500' }
      ],
      attachments: ['invoice_remesh_sep.pdf']
    },
    {
      id: 'POC-002',
      name: 'Suresh Menon',
      speciality: 'Carpenter',
      contact: '+91 98952 88888',
      alternateContact: '',
      reference: 'Old restaurant supplier',
      notes: 'Specializes in custom restaurant wooden furniture and doors.',
      rating: 4,
      serviceHistory: [
        { jobId: 'MNT-088', date: '2026-08-10', description: 'Bakery counter door hinge replacement', cost: '₹1,800' }
      ],
      attachments: []
    },
    {
      id: 'POC-003',
      name: 'CoolBreeze HVAC Services',
      speciality: 'AC Technician',
      contact: '+91 484 2356789',
      alternateContact: '+91 98460 33333',
      reference: 'Vendor contract',
      notes: 'Quarterly AMC provider for chillers and AC units.',
      rating: 5,
      serviceHistory: [
        { jobId: 'MNT-095', date: '2026-09-01', description: 'Kitchen Chiller compressor service', cost: '₹6,500' }
      ],
      attachments: ['amc_contract_2026.pdf']
    }
  ]);

  const [showForm, setShowForm] = useState(false);
  const [filterSpeciality, setFilterSpeciality] = useState('All');
  const [selectedPOC, setSelectedPOC] = useState(null);

  const [form, setForm] = useState({
    name: '',
    speciality: 'Electrician',
    contact: '',
    alternateContact: '',
    reference: '',
    notes: '',
    rating: 5,
    attachments: ''
  });

  useEffect(() => {
    fetch('/api/maintenance/pocs').then(r => r.json()).then(d => {
      if (d.pocs) setPocs(d.pocs);
    }).catch(() => {});
  }, []);

  const handleAddPOC = (e) => {
    e.preventDefault();
    if (!form.name || !form.contact) return;
    fetch('/api/maintenance/pocs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        speciality: form.speciality,
        contact_primary: form.contact,
        contact_alternate: form.alternateContact || null,
        reference: form.reference || null,
        notes: form.notes || null,
        star_rating: form.rating,
        attachment_url: form.attachments || null
      })
    }).then(r => r.json()).then(d => {
      if (d.poc) setPocs([d.poc, ...pocs]);
    }).catch(() => {});
    setForm({ name: '', speciality: 'Electrician', contact: '', alternateContact: '', reference: '', notes: '', rating: 5, attachments: '' });
    setShowForm(false);
  };

  const filteredPocs = filterSpeciality === 'All'
    ? pocs
    : pocs.filter(p => p.speciality === filterSpeciality);

  return (
    <main className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-6xl mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="btn-secondary text-xs px-3 py-1.5">← Home</Link>
          <span className="text-[#8b6f4e] text-sm">Operations / Maintenance POCs</span>
        </div>
        <div className="page-head mb-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="page-title font-serif text-4xl lg:text-5xl">Maintenance POCs</h1>
            <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-2">Verified directory of technicians, vendors, electricians, plumbers, and contractors</p>
          </div>
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm px-5 py-2.5 self-start">+ Add Maintenance POC</button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <span className="text-xs font-medium text-[#6b635c]">Filter Speciality:</span>
          {['All', ...SPECIALITY_OPTIONS].map(spec => (
            <button
              key={spec}
              onClick={() => setFilterSpeciality(spec)}
              className={`text-xs px-3 py-1.5 rounded-control transition-colors ${filterSpeciality === spec ? 'bg-[#1e1812] text-white font-medium' : 'bg-white border border-[#ebe8e4] text-[#6b635c] hover:text-[#1e1812]'}`}
            >
              {spec}
            </button>
          ))}
        </div>

        {/* Add POC Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-card shadow-2xl max-w-lg mx-4 p-8 border border-[#ebe8e4] w-full max-h-[90vh] overflow-y-auto">
              <h3 className="font-serif text-2xl mb-4">Add New Maintenance POC</h3>
              <form onSubmit={handleAddPOC} className="space-y-4 text-sm">
                <div>
                  <label className="text-xs font-medium text-[#6b635c] mb-1 block">POC / Vendor Name *</label>
                  <input required className="field text-sm w-full" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Ramesh Kumar" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#6b635c] mb-1 block">Speciality *</label>
                  <select className="field text-sm w-full bg-white" value={form.speciality} onChange={e => setForm({...form, speciality: e.target.value})}>
                    {SPECIALITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-[#6b635c] mb-1 block">Primary Contact *</label>
                    <input required className="field text-sm w-full" value={form.contact} onChange={e => setForm({...form, contact: e.target.value})} placeholder="+91 98765 43210" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#6b635c] mb-1 block">Alternate Contact</label>
                    <input className="field text-sm w-full" value={form.alternateContact} onChange={e => setForm({...form, alternateContact: e.target.value})} placeholder="+91 98765 43211" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#6b635c] mb-1 block">Reference / Source</label>
                  <input className="field text-sm w-full" value={form.reference} onChange={e => setForm({...form, reference: e.target.value})} placeholder="e.g. Recommended by Chef" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#6b635c] mb-1 block">Star Rating (1 to 5)</label>
                  <select className="field text-sm w-full bg-white" value={form.rating} onChange={e => setForm({...form, rating: Number(e.target.value)})}>
                    <option value={5}>5 Stars - Excellent</option>
                    <option value={4}>4 Stars - Very Good</option>
                    <option value={3}>3 Stars - Average</option>
                    <option value={2}>2 Stars - Below Average</option>
                    <option value={1}>1 Star - Poor</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#6b635c] mb-1 block">Notes & Comments</label>
                  <textarea rows={2} className="field text-sm w-full" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Availability, reliability, hourly rates..." />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#6b635c] mb-1 block">Attachment</label>
                  <input
                    type="file"
                    className="field text-sm w-full bg-white p-1"
                    accept=".pdf,.jpg,.png"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) {
                        alert('File selected: ' + file.name + '. In production, this uploads to a shared Google Drive folder (not Supabase).');
                        setForm({...form, attachments: file.name});
                      }
                    }}
                  />
                </div>
                <div className="flex gap-3 pt-4 border-t border-[#ebe8e4]">
                  <button type="submit" className="btn-primary text-sm px-5 py-2">Save POC</button>
                  <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm px-5 py-2">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* POC Directory Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPocs.map(poc => (
            <div key={poc.id} className="panel bg-white border border-[#ebe8e4] rounded-card shadow-sm p-6 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-serif text-xl text-[#1e1812]">{poc.name}</h3>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-[#f6f4f2] text-[#8b6f4e] text-xs font-medium">{poc.speciality}</span>
                  </div>
                  <div className="text-amber-500 font-bold text-sm" title={`${poc.rating} / 5 stars`}>
                    {'★'.repeat(poc.rating)}{'☆'.repeat(5 - poc.rating)}
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-[#6b635c] mb-4">
                  <p><strong className="text-[#1e1812]">Contact:</strong> {poc.contact}</p>
                  {poc.alternateContact && <p><strong className="text-[#1e1812]">Alt Contact:</strong> {poc.alternateContact}</p>}
                  {poc.reference && <p><strong className="text-[#1e1812]">Reference:</strong> {poc.reference}</p>}
                  {poc.notes && <p className="italic bg-[#f6f4f2] p-2 rounded mt-2">{poc.notes}</p>}
                </div>
              </div>

              <div className="pt-4 border-t border-[#ebe8e4]">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#8b6f4e] font-medium">{poc.serviceHistory.length} Service Records</span>
                  <button onClick={() => setSelectedPOC(selectedPOC === poc.id ? null : poc.id)} className="btn-secondary text-xs px-2.5 py-1">
                    {selectedPOC === poc.id ? 'Hide History' : 'View History'}
                  </button>
                </div>

                {selectedPOC === poc.id && (
                  <div className="mt-3 pt-3 border-t border-dashed border-[#ebe8e4] space-y-2 text-xs">
                    {poc.serviceHistory.length > 0 ? (
                      poc.serviceHistory.map((sh, idx) => (
                        <div key={idx} className="bg-[#f6f4f2] p-2 rounded">
                          <div className="flex justify-between font-medium text-[#1e1812]">
                            <span>{sh.jobId} ({sh.date})</span>
                            <span className="text-[#8b6f4e]">{sh.cost}</span>
                          </div>
                          <p className="text-[#6b635c] mt-0.5">{sh.description}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-400 italic">No past service records logged.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
