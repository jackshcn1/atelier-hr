'use client';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';

const SOURCES = ['Indeed', 'OLX', 'LinkedIn', 'Instagram', 'Newspaper', 'Walk-in', 'Internal referral', 'Other'];
const PLATFORMS = ['Indeed', 'OLX', 'Instagram', 'Newspaper'];
const HARD_REJECT_REASONS = ['Language', 'No-show', 'Not Competent', 'Salary Mismatch', 'Other'];
const STAGES = [
  { id: 'applied', label: 'Applied', tone: 'pill-quiet' },
  { id: 'interview_scheduled', label: 'Interview Scheduled', tone: 'pill-warn' },
  { id: 'interview_completed', label: 'Interview Completed', tone: 'pill bg-accent/15 text-accent' },
  { id: 'offered', label: 'Offer Extended', tone: 'pill-good' },
  { id: 'accepted', label: 'Accepted / Hired', tone: 'pill-good font-bold' },
  { id: 'talent_pool', label: 'Talent Pool', tone: 'pill bg-purple-100 text-purple-800' },
  { id: 'rejected', label: 'Rejected', tone: 'pill-bad' }
];

function RecruitmentContent() {
  const supabase = createClient();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState('pipeline'); // 'pipeline' | 'listings' | 'talent_pool' | 'rejected'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Data
  const [jobListings, setJobListings] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [offers, setOffers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [jdTemplates, setJdTemplates] = useState([]);

  // Filters
  const [selectedListingFilter, setSelectedListingFilter] = useState('all');
  const [selectedStageFilter, setSelectedStageFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Drawers
  const [showCandidateModal, setShowCandidateModal] = useState(false);
  const [showListingModal, setShowListingModal] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Forms
  const [newCandidateForm, setNewCandidateForm] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    source: 'Indeed',
    source_details: '',
    referred_by_employee_id: '',
    interview_date: '',
    mapped_listing_ids: [],
    expected_salary: '',
    current_salary: ''
  });
  const [newListingForm, setNewListingForm] = useState({
    department: '',
    designation: '',
    job_description_title: '',
    job_description_text: '',
    offered_fixed_salary: '',
    offered_variable_salary: '',
    max_fixed_salary: '',
    max_variable_salary: '',
    platforms_tagged: ['Indeed']
  });
  const [rejectForm, setRejectForm] = useState({
    candidate_id: null,
    reason: 'Not Competent',
    notes: ''
  });
  const [offerForm, setOfferForm] = useState({
    candidate_id: null,
    job_listing_id: null,
    fixed_salary: '',
    variable_salary: '',
    revision_reason: 'Initial Offer'
  });
  const [cvFile, setCvFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadAllRecruitmentData();
  }, []);

  async function loadAllRecruitmentData() {
    setLoading(true);
    setError('');

    try {
      const fetchSafe = async (fn) => {
        try {
          const timeout = new Promise(resolve => setTimeout(() => resolve({ data: [] }), 8000));
          const res = await Promise.race([fn(), timeout]);
          return res?.data || [];
        } catch {
          return [];
        }
      };

      const [
        listingsData,
        candidatesData,
        mappingsData,
        evalsData,
        offersData,
        deptsData,
        desigsData,
        empsData,
        jdData
      ] = await Promise.all([
        fetchSafe(() => supabase.from('job_listings').select('*').order('id', { ascending: false })),
        fetchSafe(() => supabase.from('candidates').select('*').order('id', { ascending: false })),
        fetchSafe(() => supabase.from('candidate_job_mapping').select('*')),
        fetchSafe(() => supabase.from('interview_evaluations').select('*').order('created_at', { ascending: false })),
        fetchSafe(() => supabase.from('offers').select('*').order('id', { ascending: false })),
        fetchSafe(() => supabase.from('departments').select('name').order('name')),
        fetchSafe(() => supabase.from('designations').select('name, department').order('name')),
        fetchSafe(() => supabase.from('employees').select('employee_id, name').is('deleted_at', null).order('name')),
        fetchSafe(() => supabase.from('job_description_templates').select('*'))
      ]);

      setJobListings(Array.isArray(listingsData) ? listingsData : []);
      setCandidates(Array.isArray(candidatesData) ? candidatesData : []);
      setMappings(Array.isArray(mappingsData) ? mappingsData : []);
      setEvaluations(Array.isArray(evalsData) ? evalsData : []);
      setOffers(Array.isArray(offersData) ? offersData : []);
      setDepartments(Array.isArray(deptsData) ? deptsData.map(d => d.name).filter(Boolean) : []);
      setDesignations(Array.isArray(desigsData) ? desigsData : []);
      setEmployees(Array.isArray(empsData) ? empsData : []);
      setJdTemplates(Array.isArray(jdData) ? jdData : []);
    } catch (err) {
      setError(`Notice: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  // Create Job Listing (One row = One Headcount)
  async function handleCreateListing(e) {
    e.preventDefault();
    if (!newListingForm.designation) {
      setError('Please select a designation for the headcount listing.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // Generate serial: JL0001, JL0002...
      const nextNum = (jobListings.length + 1).toString().padStart(4, '0');
      const serial = `JL${nextNum}`;

      const payload = {
        serial,
        department: newListingForm.department || null,
        designation: newListingForm.designation,
        job_description_title: newListingForm.job_description_title || `${newListingForm.designation} (${serial})`,
        job_description_text: newListingForm.job_description_text || null,
        offered_fixed_salary: Number(newListingForm.offered_fixed_salary || 0),
        offered_variable_salary: Number(newListingForm.offered_variable_salary || 0),
        max_fixed_salary: Number(newListingForm.max_fixed_salary || newListingForm.offered_fixed_salary || 0),
        max_variable_salary: Number(newListingForm.max_variable_salary || newListingForm.offered_variable_salary || 0),
        platforms_tagged: newListingForm.platforms_tagged,
        status: 'open',
        listing_date: new Date().toISOString().slice(0, 10)
      };

      const { error: insErr } = await supabase.from('job_listings').insert([payload]);
      if (insErr) throw insErr;

      setMessage(`✓ Headcount listing ${serial} (${newListingForm.designation}) created.`);
      setShowListingModal(false);
      setNewListingForm({
        department: '',
        designation: '',
        job_description_title: '',
        job_description_text: '',
        offered_fixed_salary: '',
        offered_variable_salary: '',
        max_fixed_salary: '',
        max_variable_salary: '',
        platforms_tagged: ['Indeed']
      });
      await loadAllRecruitmentData();
    } catch (err) {
      setError(`Failed to create listing: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  // Create Candidate
  async function handleCreateCandidate(e) {
    e.preventDefault();
    if (!newCandidateForm.first_name.trim()) {
      setError('Candidate first name is required.');
      return;
    }
    if (newCandidateForm.source === 'Internal referral' && !newCandidateForm.referred_by_employee_id) {
      setError('Pick which employee referred this candidate — an internal referral without a name is just "walk-in".');
      return;
    }
    if (newCandidateForm.source === 'Other' && !newCandidateForm.source_details.trim()) {
      setError('Name the channel so the source stays useful for reporting later.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // 1. Upload CV if provided
      let cvPath = null;
      if (cvFile) {
        const ext = cvFile.name.split('.').pop();
        const uploadPath = `resumes/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { data: uploadData, error: upErr } = await supabase.storage
          .from('documents')
          .upload(uploadPath, cvFile, { upsert: true });

        if (upErr) throw upErr;
        cvPath = uploadData.path;
      }

      // 2. Generate sequential serial CAN0001, CAN0002...
      const nextNum = (candidates.length + 1).toString().padStart(4, '0');
      const serial = `CAN${nextNum}`;

      const candidatePayload = {
        serial,
        first_name: newCandidateForm.first_name.trim(),
        last_name: newCandidateForm.last_name.trim() || null,
        phone: newCandidateForm.phone.trim() || null,
        email: newCandidateForm.email.trim() || null,
        source: newCandidateForm.source,
        source_details: newCandidateForm.source.trim() === 'Other'
          ? (newCandidateForm.source_details.trim() || null)
          : null,
        referred_by_employee_id: newCandidateForm.source === 'Internal referral'
          ? (newCandidateForm.referred_by_employee_id || null)
          : null,
        interview_date: newCandidateForm.interview_date || null,
        expected_fixed_salary: newCandidateForm.expected_salary ? Number(newCandidateForm.expected_salary) : null,
        current_salary: newCandidateForm.current_salary ? Number(newCandidateForm.current_salary) : null,
        cv_url: cvPath,
        status: 'active'
      };

      const { data: createdCand, error: insErr } = await supabase
        .from('candidates')
        .insert([candidatePayload])
        .select()
        .single();

      if (insErr) throw insErr;

      // 3. Map to chosen Job Listings
      if (newCandidateForm.mapped_listing_ids?.length > 0) {
        const mappingRows = newCandidateForm.mapped_listing_ids.map(lid => ({
          candidate_id: createdCand.id,
          job_listing_id: Number(lid),
          stage: newCandidateForm.interview_date ? 'interview_scheduled' : 'applied'
        }));

        const { error: mapErr } = await supabase.from('candidate_job_mapping').insert(mappingRows);
        if (mapErr) throw mapErr;
      }

      setMessage(`✓ Candidate ${serial} (${createdCand.first_name}) added to pipeline.`);
      setShowCandidateModal(false);
      setCvFile(null);
      setNewCandidateForm({
        first_name: '',
        last_name: '',
        phone: '',
        email: '',
        source: 'Indeed',
        source_details: '',
        referred_by_employee_id: '',
        interview_date: '',
        mapped_listing_ids: [],
        expected_salary: '',
        current_salary: ''
      });
      await loadAllRecruitmentData();
    } catch (err) {
      setError(`Failed to create candidate: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  // Stage transition
  async function handleUpdateStage(candidateId, listingId, nextStage) {
    setError('');
    setMessage('');

    try {
      // Check if moving to 'offered' without CV -> Prompt alert
      const cand = candidates.find(c => c.id === candidateId);
      if (nextStage === 'offered' && !cand?.cv_url) {
        if (!window.confirm('Notice: This candidate does not have a CV uploaded yet. Do you want to proceed with extending the offer?')) {
          return;
        }
      }

      const { error: updErr } = await supabase
        .from('candidate_job_mapping')
        .update({ stage: nextStage, updated_at: new Date().toISOString() })
        .match({ candidate_id: candidateId, job_listing_id: listingId });

      if (updErr) throw updErr;

      setMessage(`✓ Candidate stage updated to "${nextStage.replace('_', ' ')}".`);
      await loadAllRecruitmentData();
      if (selectedCandidate && selectedCandidate.id === candidateId) {
        const updated = candidates.find(c => c.id === candidateId);
        setSelectedCandidate(updated || null);
      }
    } catch (err) {
      setError(`Stage update failed: ${err.message}`);
    }
  }

  // Accept & Onboard candidate
  async function handleAcceptAndOnboard(candidate, listing) {
    if (!window.confirm(
      `Accept ${candidate.first_name} ${candidate.last_name || ''} for listing ${listing.serial} (${listing.designation})?\n\n` +
      `• This will mark listing ${listing.serial} as Filled.\n` +
      `• Other candidates mapped ONLY to this listing will automatically move to Talent Pool.\n` +
      `• A new onboarding draft employee record will be pre-filled.`
    )) return;

    setSubmitting(true);
    setError('');

    try {
      const today = new Date().toISOString().slice(0, 10);

      // 1. Mark mapping accepted & candidate hired
      await supabase
        .from('candidate_job_mapping')
        .update({ stage: 'accepted', updated_at: new Date().toISOString() })
        .match({ candidate_id: candidate.id, job_listing_id: listing.id });

      await supabase
        .from('candidates')
        .update({ status: 'hired', updated_at: new Date().toISOString() })
        .eq('id', candidate.id);

      // 2. Mark job listing as Filled
      await supabase
        .from('job_listings')
        .update({ status: 'filled', hired_date: today, updated_at: new Date().toISOString() })
        .eq('id', listing.id);

      // 3. Move other candidates mapped ONLY to this listing to Talent Pool
      const otherMappingsForListing = mappings.filter(
        m => m.job_listing_id === listing.id && m.candidate_id !== candidate.id && m.stage !== 'accepted' && m.stage !== 'rejected'
      );

      for (const m of otherMappingsForListing) {
        // Check if candidate is mapped to other open listings
        const otherOpenMappings = mappings.filter(
          x => x.candidate_id === m.candidate_id && x.job_listing_id !== listing.id && x.stage !== 'rejected' && x.stage !== 'talent_pool'
        );

        if (otherOpenMappings.length === 0) {
          // Move mapping and candidate to talent pool
          await supabase
            .from('candidate_job_mapping')
            .update({ stage: 'talent_pool', updated_at: new Date().toISOString() })
            .eq('id', m.id);

          await supabase
            .from('candidates')
            .update({ status: 'talent_pool', updated_at: new Date().toISOString() })
            .eq('id', m.candidate_id);
        }
      }

      // 4. Look up latest offer or default listing salary
      const candOffer = offers.find(o => o.candidate_id === candidate.id && o.job_listing_id === listing.id);
      const acceptedFixed = candOffer?.offered_fixed_salary || listing.offered_fixed_salary || 0;
      const acceptedVar = candOffer?.offered_variable_salary || listing.offered_variable_salary || 0;

      // 5. Pre-fill Onboarding / Employees record
      // Check if employee ID exists or create next EMP ID
      const { data: allEmps } = await supabase.from('employees').select('employee_id');
      const nextEmpNum = ((allEmps?.length || 0) + 1).toString().padStart(4, '0');
      const newEmpId = `EMP-${nextEmpNum}`;

      const employeePayload = {
        employee_id: newEmpId,
        name: `${candidate.first_name} ${candidate.last_name || ''}`.trim(),
        phone: candidate.phone,
        email: candidate.email,
        department: listing.department || 'Service',
        designation: listing.designation || 'Staff',
        employment_type: 'full-time',
        date_of_joining: today,
        status: 'active',
        current_fixed_salary: acceptedFixed,
        current_variable_salary: acceptedVar,
        created_at: new Date().toISOString()
      };

      const { data: createdEmp, error: empErr } = await supabase
        .from('employees')
        .insert([employeePayload])
        .select()
        .single();

      if (empErr) {
        // If insert errors due to employee_id conflict or constraint, report notice
        setMessage(`✓ Candidate accepted and listing marked filled. (Manual onboarding step: ${empErr.message})`);
      } else {
        // Record starting salary history entry
        await supabase.from('salary_history').insert([{
          employee_id: createdEmp.employee_id,
          fixed: acceptedFixed,
          variable: acceptedVar,
          effective_from: today,
          reason: 'Initial Hire from Recruitment'
        }]);

        setMessage(`✓ ${candidate.first_name} accepted! Employee record ${createdEmp.employee_id} initialized.`);
        router.push(`/employees/${createdEmp.employee_id}`);
        return;
      }

      setSelectedCandidate(null);
      await loadAllRecruitmentData();
    } catch (err) {
      setError(`Handoff failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  // Hard Reject
  async function handleHardReject(e) {
    e.preventDefault();
    if (!rejectForm.candidate_id) return;

    setSubmitting(true);
    try {
      await supabase
        .from('candidates')
        .update({
          status: 'rejected',
          hard_reject_reason: rejectForm.reason,
          hard_reject_notes: rejectForm.notes.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', rejectForm.candidate_id);

      await supabase
        .from('candidate_job_mapping')
        .update({ stage: 'rejected', updated_at: new Date().toISOString() })
        .eq('candidate_id', rejectForm.candidate_id);

      setMessage(`✓ Candidate marked as Hard Rejected (${rejectForm.reason}).`);
      setShowRejectModal(false);
      setSelectedCandidate(null);
      await loadAllRecruitmentData();
    } catch (err) {
      setError(`Reject failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  // Record / Revise Offer
  async function handleSaveOffer(e) {
    e.preventDefault();
    if (!offerForm.candidate_id || !offerForm.job_listing_id) return;

    setSubmitting(true);
    setError('');

    try {
      const fixed = Number(offerForm.fixed_salary || 0);
      const variable = Number(offerForm.variable_salary || 0);
      const reason = offerForm.revision_reason.trim() || 'Salary Revision';
      const today = new Date().toISOString().slice(0, 10);

      const existingOffer = offers.find(
        o => o.candidate_id === offerForm.candidate_id && o.job_listing_id === offerForm.job_listing_id
      );

      let history = existingOffer?.revision_history || [];
      const newRevEntry = {
        revision_number: history.length + 1,
        date: today,
        fixed_salary: fixed,
        variable_salary: variable,
        reason
      };
      history = [...history, newRevEntry];

      if (existingOffer) {
        await supabase
          .from('offers')
          .update({
            offered_fixed_salary: fixed,
            offered_variable_salary: variable,
            revision_history: history,
            status: 'negotiating',
            updated_at: new Date().toISOString()
          })
          .eq('id', existingOffer.id);
      } else {
        await supabase.from('offers').insert([{
          candidate_id: offerForm.candidate_id,
          job_listing_id: offerForm.job_listing_id,
          offered_fixed_salary: fixed,
          offered_variable_salary: variable,
          revision_history: history,
          status: 'sent'
        }]);
      }

      // Also set mapping stage to 'offered' if not already
      await supabase
        .from('candidate_job_mapping')
        .update({ stage: 'offered', updated_at: new Date().toISOString() })
        .match({ candidate_id: offerForm.candidate_id, job_listing_id: offerForm.job_listing_id });

      setMessage(`✓ Offer revision logged (₹${fixed.toLocaleString('en-IN')} fixed + ₹${variable.toLocaleString('en-IN')} variable).`);
      setShowOfferModal(false);
      await loadAllRecruitmentData();
    } catch (err) {
      setError(`Failed to save offer: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  // Move to Talent Pool
  async function handleMoveToTalentPool(candidate) {
    if (!window.confirm(`Move ${candidate.first_name} to Talent Pool for future roles?`)) return;

    try {
      await supabase
        .from('candidates')
        .update({ status: 'talent_pool', updated_at: new Date().toISOString() })
        .eq('id', candidate.id);

      await supabase
        .from('candidate_job_mapping')
        .update({ stage: 'talent_pool', updated_at: new Date().toISOString() })
        .eq('candidate_id', candidate.id);

      setMessage(`✓ ${candidate.first_name} moved to Talent Pool.`);
      setSelectedCandidate(null);
      await loadAllRecruitmentData();
    } catch (err) {
      setError(`Failed to update status: ${err.message}`);
    }
  }

  function copyInterviewerLink(token) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/interview/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  }

  // Picking a role pulls in whatever description that role already has in the
  // Settings library. It stays editable — a particular vacancy may genuinely
  // need different wording from the standing one for the role.
  function applyJobDescriptionTemplate(designationName) {
    const tpl = jdTemplates.find(t => t.designation === designationName);

    setNewListingForm(prev => ({
      ...prev,
      designation: designationName,
      job_description_title: tpl?.job_description_title || prev.job_description_title,
      job_description_text: tpl?.job_description_text || ''
    }));
  }

  // Filtered lists
  const filteredCandidates = useMemo(() => {
    let list = candidates;

    if (activeTab === 'talent_pool') {
      list = list.filter(c => c.status === 'talent_pool');
    } else if (activeTab === 'rejected') {
      list = list.filter(c => c.status === 'rejected');
    } else {
      // Active pipeline
      list = list.filter(c => c.status === 'active');
    }

    if (selectedListingFilter !== 'all') {
      const listingId = Number(selectedListingFilter);
      const mappedCandIds = mappings.filter(m => m.job_listing_id === listingId).map(m => m.candidate_id);
      list = list.filter(c => mappedCandIds.includes(c.id));
    }

    if (selectedStageFilter !== 'all') {
      const stageCandIds = mappings.filter(m => m.stage === selectedStageFilter).map(m => m.candidate_id);
      list = list.filter(c => stageCandIds.includes(c.id));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c =>
        c.first_name?.toLowerCase().includes(q) ||
        c.last_name?.toLowerCase().includes(q) ||
        c.serial?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.source?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [candidates, activeTab, selectedListingFilter, selectedStageFilter, searchQuery, mappings]);

  // Statistics
  const stats = useMemo(() => {
    const openListings = jobListings.filter(l => l.status === 'open').length;
    const activeCands = candidates.filter(c => c.status === 'active').length;
    const talentPoolCount = candidates.filter(c => c.status === 'talent_pool').length;
    const offeredCount = mappings.filter(m => m.stage === 'offered').length;
    return { openListings, activeCands, talentPoolCount, offeredCount };
  }, [jobListings, candidates, mappings]);

  if (loading) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-ink-muted">Loading recruitment pipeline…</p>
      </div>
    );
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Recruitment & pipeline</h1>
          <p className="page-purpose">
            Track headcount needs, manage candidate stages, collect interviewer ratings, and log salary negotiations.
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <a href="/settings/job-descriptions" className="btn-quiet text-xs">
            Job descriptions
          </a>
          <button
            onClick={() => setShowCandidateModal(true)}
            className="btn-primary"
          >
            + Add candidate
          </button>
          <button
            onClick={() => setShowListingModal(true)}
            className="btn-secondary"
          >
            + New headcount need
          </button>
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

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="panel p-4">
          <div className="text-2xs font-medium uppercase tracking-wide text-ink-muted">Open Headcount</div>
          <div className="text-2xl font-serif mt-1 text-ink">{stats.openListings}</div>
        </div>
        <div className="panel p-4">
          <div className="text-2xs font-medium uppercase tracking-wide text-accent">Active in Pipeline</div>
          <div className="text-2xl font-serif mt-1 text-accent">{stats.activeCands}</div>
        </div>
        <div className="panel p-4">
          <div className="text-2xs font-medium uppercase tracking-wide text-good">Offers Pending</div>
          <div className="text-2xl font-serif mt-1 text-good">{stats.offeredCount}</div>
        </div>
        <div className="panel p-4">
          <div className="text-2xs font-medium uppercase tracking-wide text-ink-muted">Talent Pool (Retained)</div>
          <div className="text-2xl font-serif mt-1 text-ink">{stats.talentPoolCount}</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule pb-4 mb-6">
        <div className="flex gap-2">
          {[
            { id: 'pipeline', label: `Active Pipeline (${stats.activeCands})` },
            { id: 'listings', label: `Headcount Needs (${jobListings.length})` },
            { id: 'talent_pool', label: `Talent Pool (${stats.talentPoolCount})` },
            { id: 'rejected', label: 'Rejected Candidates' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={activeTab === tab.id ? 'btn-primary text-xs' : 'btn-secondary text-xs'}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        {activeTab !== 'listings' && (
          <div className="w-full sm:w-auto min-w-[14rem]">
            <input
              type="text"
              placeholder="Search candidate name, ID, phone..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="field text-xs py-1.5"
            />
          </div>
        )}
      </div>

      {/* TAB 1: PIPELINE & CANDIDATES */}
      {activeTab === 'pipeline' && (
        <div className="space-y-6">
          {/* Filters Bar */}
          <div className="panel p-3.5 flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-muted font-medium">Headcount:</span>
              <select
                value={selectedListingFilter}
                onChange={e => setSelectedListingFilter(e.target.value)}
                className="field w-auto min-w-[12rem] text-xs py-1"
              >
                <option value="all">All Open Positions</option>
                {jobListings.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.serial} — {l.designation} ({l.department || 'All'})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-muted font-medium">Stage:</span>
              <select
                value={selectedStageFilter}
                onChange={e => setSelectedStageFilter(e.target.value)}
                className="field w-auto min-w-[10rem] text-xs py-1"
              >
                <option value="all">All Stages</option>
                {STAGES.filter(s => s.id !== 'talent_pool' && s.id !== 'rejected').map(s => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {filteredCandidates.length === 0 ? (
            <div className="note text-center py-16">
              <p className="text-ink">No candidates in this view.</p>
              <p className="mt-1">Add candidates or post a new headcount need above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCandidates.map(cand => {
                const candMappings = mappings.filter(m => m.candidate_id === cand.id);
                const candEvals = evaluations.filter(e => e.candidate_id === cand.id);
                const avgScore = candEvals.length > 0
                  ? (candEvals.reduce((s, e) => s + Number(e.overall_score), 0) / candEvals.length).toFixed(1)
                  : null;

                return (
                  <div
                    key={cand.id}
                    onClick={() => setSelectedCandidate(cand)}
                    className="panel p-5 cursor-pointer hover:border-accent/40 transition-colors flex flex-col justify-between"
                  >
                    <div>
                      {/* Top serial + source badge */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-mono text-2xs text-ink-muted">{cand.serial}</span>
                        <span className="pill-quiet text-2xs font-medium">
                        {cand.source === 'Internal referral'
                          ? `Referred by ${employees.find(e => e.employee_id === cand.referred_by_employee_id)?.name || 'staff member'}`
                          : cand.source === 'Other' && cand.source_details
                          ? `Other — ${cand.source_details}`
                          : cand.source}
                      </span>
                      </div>

                      {/* Name */}
                      <h3 className="font-serif text-lg text-ink font-semibold">
                        {cand.first_name} {cand.last_name || ''}
                      </h3>
                      <div className="text-xs text-ink-muted mt-0.5">
                        {cand.phone || 'No phone'} · {cand.email || 'No email'}
                      </div>

                      {/* Mapped Headcount Listings */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {candMappings.map(m => {
                          const listing = jobListings.find(l => l.id === m.job_listing_id);
                          const stageObj = STAGES.find(s => s.id === m.stage);
                          return (
                            <div key={m.id} className="text-2xs rounded border border-rule px-2 py-1 bg-page flex items-center gap-1.5">
                              <span className="font-medium text-ink">{listing?.designation || 'Position'}</span>
                              <span className={stageObj?.tone || 'pill-quiet'}>{stageObj?.label || m.stage}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Footer score & interview status */}
                    <div className="mt-5 pt-3 border-t border-rule-soft flex items-center justify-between text-xs">
                      <div>
                        {avgScore ? (
                          <span className="pill-good font-semibold">★ {avgScore} / 5.0</span>
                        ) : (
                          <span className="text-2xs text-ink-muted">No evaluations yet</span>
                        )}
                      </div>
                      <span className="text-accent font-medium hover:underline text-2xs uppercase tracking-wide">
                        View Details →
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: HEADCOUNT & JOB LISTINGS */}
      {activeTab === 'listings' && (
        <div className="space-y-6">
          <div className="panel overflow-hidden">
            <div className="p-4 border-b border-rule bg-page/40 flex justify-between items-center">
              <h2 className="font-serif text-lg text-ink">Headcount Positions (One row = One Need)</h2>
              <span className="text-xs text-ink-muted">Total Positions: {jobListings.length}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-rule bg-page/50">
                    {['Serial', 'Designation', 'Department', 'Offered Budget', 'Max Ceiling', 'Platforms', 'Status', 'Candidates', 'Opened On'].map(h => (
                      <th key={h} className="table-head">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule-soft">
                  {jobListings.map(listing => {
                    const mappedCount = mappings.filter(m => m.job_listing_id === listing.id).length;
                    const isFilled = listing.status === 'filled';
                    const isInactive = listing.status === 'inactive';

                    return (
                      <tr key={listing.id} className="hover:bg-page/40 transition-colors">
                        <td className="table-cell font-mono font-medium text-ink">{listing.serial}</td>
                        <td className="table-cell font-semibold text-ink">{listing.designation}</td>
                        <td className="table-cell text-ink-muted">{listing.department || 'All'}</td>
                        <td className="table-cell whitespace-nowrap text-ink">
                          ₹{Number(listing.offered_fixed_salary || 0).toLocaleString('en-IN')}
                          {Number(listing.offered_variable_salary || 0) > 0 && ` + ₹${Number(listing.offered_variable_salary).toLocaleString('en-IN')} var`}
                        </td>
                        <td className="table-cell whitespace-nowrap text-ink-muted">
                          ₹{Number(listing.max_fixed_salary || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="table-cell">
                          <div className="flex flex-wrap gap-1">
                            {(Array.isArray(listing.platforms_tagged) ? listing.platforms_tagged : []).map(p => (
                              <span key={p} className="pill-quiet text-2xs py-0.5">{p}</span>
                            ))}
                          </div>
                        </td>
                        <td className="table-cell">
                          {isFilled ? (
                            <span className="pill-good">Filled ({listing.hired_date || 'Done'})</span>
                          ) : isInactive ? (
                            <span className="pill-bad">Inactive</span>
                          ) : (
                            <span className="pill-warn">Open</span>
                          )}
                        </td>
                        <td className="table-cell font-semibold text-ink">{mappedCount}</td>
                        <td className="table-cell text-ink-muted">{listing.listing_date}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3 & 4: TALENT POOL & REJECTED */}
      {(activeTab === 'talent_pool' || activeTab === 'rejected') && (
        <div className="space-y-4">
          <div className="panel overflow-hidden">
            <div className="p-4 border-b border-rule bg-page/40 flex justify-between items-center">
              <h2 className="font-serif text-lg text-ink">
                {activeTab === 'talent_pool' ? 'Talent Pool (Runner-ups & Future Leads)' : 'Hard Rejected Candidates'}
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-rule bg-page/50">
                    {['Serial', 'Candidate Name', 'Source', 'Phone', 'Avg Score', 'Expected Salary', activeTab === 'rejected' ? 'Reject Reason' : 'Action'].map(h => (
                      <th key={h} className="table-head">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule-soft">
                  {filteredCandidates.map(cand => {
                    const candEvals = evaluations.filter(e => e.candidate_id === cand.id);
                    const avgScore = candEvals.length > 0
                      ? (candEvals.reduce((s, e) => s + Number(e.overall_score), 0) / candEvals.length).toFixed(1)
                      : '—';

                    return (
                      <tr
                        key={cand.id}
                        onClick={() => setSelectedCandidate(cand)}
                        className="hover:bg-page/40 transition-colors cursor-pointer"
                      >
                        <td className="table-cell font-mono text-ink-muted">{cand.serial}</td>
                        <td className="table-cell font-semibold text-ink">{cand.first_name} {cand.last_name || ''}</td>
                        <td className="table-cell text-ink-muted">{cand.source}</td>
                        <td className="table-cell text-ink">{cand.phone || '—'}</td>
                        <td className="table-cell font-semibold text-accent">{avgScore}</td>
                        <td className="table-cell text-ink">
                          {cand.expected_fixed_salary ? `₹${Number(cand.expected_fixed_salary).toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="table-cell">
                          {activeTab === 'rejected' ? (
                            <span className="pill-bad">{cand.hard_reject_reason || 'Rejected'}</span>
                          ) : (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedCandidate(cand);
                              }}
                              className="btn-secondary text-2xs py-1"
                            >
                              Open Profile
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD HEADCOUNT NEED (JOB LISTING) */}
      {showListingModal && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="panel panel-body max-w-lg w-full bg-surface shadow-2xl animate-settle max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-baseline border-b border-rule-soft pb-3 mb-5">
              <h2 className="panel-title">Add Headcount Position</h2>
              <button onClick={() => setShowListingModal(false)} className="text-ink-muted hover:text-ink">✕</button>
            </div>

            <form onSubmit={handleCreateListing} className="space-y-4">
              {designations.length === 0 && (
                <div className="note text-xs">
                  <p className="text-ink">No roles exist yet.</p>
                  <p className="mt-1">
                    Add departments and roles under Settings &rarr; Departments &amp;
                    Designations first — a headcount listing is always for a specific role.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Department *</label>
                  <select
                    value={newListingForm.department}
                    onChange={e => setNewListingForm(prev => ({ ...prev, department: e.target.value }))}
                    className="field text-xs"
                    required
                  >
                    <option value="">Select department</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>

                <div>
                  <label className="field-label">Designation / Role *</label>
                  <select
                    value={newListingForm.designation}
                    onChange={e => applyJobDescriptionTemplate(e.target.value)}
                    className="field text-xs"
                    required
                  >
                    <option value="">Select designation</option>
                    {designations
                      .filter(d => !newListingForm.department || d.department === newListingForm.department)
                      .map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                  </select>
                  {newListingForm.designation && (
                    <p className="mt-1 text-2xs text-ink-muted">
                      {jdTemplates.some(t => t.designation === newListingForm.designation)
                        ? 'Description filled in from Settings → Job descriptions. Edit freely below.'
                        : 'No saved description for this role yet — write one below, or add it in Settings.'}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Target Fixed (₹/mo) *</label>
                  <input
                    type="number"
                    required
                    value={newListingForm.offered_fixed_salary}
                    onChange={e => setNewListingForm(prev => ({ ...prev, offered_fixed_salary: e.target.value }))}
                    placeholder="e.g. 20000"
                    className="field text-xs"
                  />
                </div>
                <div>
                  <label className="field-label">Target Variable (₹/mo)</label>
                  <input
                    type="number"
                    value={newListingForm.offered_variable_salary}
                    onChange={e => setNewListingForm(prev => ({ ...prev, offered_variable_salary: e.target.value }))}
                    placeholder="e.g. 4000"
                    className="field text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Max Negotiation Ceiling (₹ Fixed)</label>
                  <input
                    type="number"
                    value={newListingForm.max_fixed_salary}
                    onChange={e => setNewListingForm(prev => ({ ...prev, max_fixed_salary: e.target.value }))}
                    placeholder="e.g. 24000"
                    className="field text-xs"
                  />
                </div>
                <div>
                  <label className="field-label">Max Negotiation Ceiling (₹ Var)</label>
                  <input
                    type="number"
                    value={newListingForm.max_variable_salary}
                    onChange={e => setNewListingForm(prev => ({ ...prev, max_variable_salary: e.target.value }))}
                    placeholder="e.g. 5000"
                    className="field text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="field-label">Platforms Tagged</label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {PLATFORMS.map(p => {
                    const isChecked = newListingForm.platforms_tagged.includes(p);
                    return (
                      <label key={p} className="flex items-center gap-1.5 text-xs text-ink cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setNewListingForm(prev => ({
                              ...prev,
                              platforms_tagged: isChecked
                                ? prev.platforms_tagged.filter(x => x !== p)
                                : [...prev.platforms_tagged, p]
                            }));
                          }}
                          className="rounded border-rule text-ink focus:ring-accent"
                        />
                        <span>{p}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="field-label">
                  Job Description / Requirements
                  <span className="ml-2 font-normal text-ink-muted">
                    {newListingForm.designation ? 'Pre-filled from the saved description for this role' : 'Select a role first to pre-fill'}
                  </span>
                </label>
                <textarea
                  rows={8}
                  value={newListingForm.job_description_text}
                  onChange={e => setNewListingForm(prev => ({ ...prev, job_description_text: e.target.value }))}
                  placeholder={'Key responsibilities, shift timings, experience required…\n\nLeave blank and paste your own if you prefer.'}
                  className="field text-xs leading-relaxed"
                />
                <a
                  href="/settings/job-descriptions"
                  className="mt-1.5 inline-block text-2xs text-accent hover:underline"
                >
                  Edit the standing description for each role in Settings →
                </a>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-rule-soft">
                <button type="button" onClick={() => setShowListingModal(false)} className="btn-secondary text-xs">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary text-xs">
                  {submitting ? 'Creating…' : 'Create Headcount'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD CANDIDATE */}
      {showCandidateModal && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="panel panel-body max-w-lg w-full bg-surface shadow-2xl animate-settle max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-baseline border-b border-rule-soft pb-3 mb-5">
              <h2 className="panel-title">Add Candidate to Pipeline</h2>
              <button onClick={() => setShowCandidateModal(false)} className="text-ink-muted hover:text-ink">✕</button>
            </div>

            <form onSubmit={handleCreateCandidate} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">First Name *</label>
                  <input
                    type="text"
                    required
                    value={newCandidateForm.first_name}
                    onChange={e => setNewCandidateForm(prev => ({ ...prev, first_name: e.target.value }))}
                    placeholder="e.g. Rahul"
                    className="field text-xs"
                  />
                </div>
                <div>
                  <label className="field-label">Last Name</label>
                  <input
                    type="text"
                    value={newCandidateForm.last_name}
                    onChange={e => setNewCandidateForm(prev => ({ ...prev, last_name: e.target.value }))}
                    placeholder="e.g. Sharma"
                    className="field text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Phone Number</label>
                  <input
                    type="tel"
                    value={newCandidateForm.phone}
                    onChange={e => setNewCandidateForm(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="+91 9876543210"
                    className="field text-xs"
                  />
                </div>
                <div>
                  <label className="field-label">Email Address</label>
                  <input
                    type="email"
                    value={newCandidateForm.email}
                    onChange={e => setNewCandidateForm(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="rahul@example.com"
                    className="field text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Source Channel *</label>
                  <select
                    value={newCandidateForm.source}
                    onChange={e => setNewCandidateForm(prev => ({ ...prev, source: e.target.value }))}
                    className="field text-xs"
                  >
                    {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">Interview Date (Optional)</label>
                  <input
                    type="date"
                    value={newCandidateForm.interview_date}
                    onChange={e => setNewCandidateForm(prev => ({ ...prev, interview_date: e.target.value }))}
                    className="field text-xs"
                  />
                </div>
              </div>

              {/* An internal referral is only useful if we know who sent them —
                  that employee is the one we'd thank, and whose hires turn out
                  well is worth knowing later. */}
              {newCandidateForm.source === 'Internal referral' && (
                <div>
                  <label className="field-label">Referred by (employee) *</label>
                  <select
                    value={newCandidateForm.referred_by_employee_id}
                    onChange={e => setNewCandidateForm(prev => ({ ...prev, referred_by_employee_id: e.target.value }))}
                    className="field text-xs"
                  >
                    <option value="">Select the employee who referred them</option>
                    {employees.map(emp => (
                      <option key={emp.employee_id} value={emp.employee_id}>
                        {emp.name} — {emp.employee_id}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {newCandidateForm.source === 'Other' && (
                <div>
                  <label className="field-label">Which channel? *</label>
                  <input
                    type="text"
                    value={newCandidateForm.source_details}
                    onChange={e => setNewCandidateForm(prev => ({ ...prev, source_details: e.target.value }))}
                    placeholder="e.g. WhatsApp group, hotel placement agency, walk-in sign-up sheet"
                    className="field text-xs"
                  />
                </div>
              )}

              {/* Mapped Open Listings */}
              <div>
                <label className="field-label">Consider for Open Headcount Need(s)</label>
                <div className="space-y-1.5 max-h-32 overflow-y-auto border border-rule rounded-control p-2.5 bg-page">
                  {jobListings.filter(l => l.status === 'open').map(listing => {
                    const isChecked = newCandidateForm.mapped_listing_ids.includes(listing.id);
                    return (
                      <label key={listing.id} className="flex items-center gap-2 text-xs text-ink cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setNewCandidateForm(prev => ({
                              ...prev,
                              mapped_listing_ids: isChecked
                                ? prev.mapped_listing_ids.filter(id => id !== listing.id)
                                : [...prev.mapped_listing_ids, listing.id]
                            }));
                          }}
                          className="rounded border-rule text-ink focus:ring-accent"
                        />
                        <span><strong>{listing.serial}</strong> · {listing.designation} ({listing.department})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* CV Upload */}
              <div>
                <label className="field-label">Attach Resume / CV (Optional)</label>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={e => setCvFile(e.target.files?.[0] || null)}
                  className="field text-xs py-1"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-rule-soft">
                <button type="button" onClick={() => setShowCandidateModal(false)} className="btn-secondary text-xs">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary text-xs">
                  {submitting ? 'Saving…' : 'Add Candidate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DRAWER / MODAL: CANDIDATE PROFILE, EVALUATIONS & OFFERS */}
      {selectedCandidate && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="panel panel-body max-w-3xl w-full bg-surface shadow-2xl animate-settle max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-rule-soft pb-4 mb-5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-ink-muted">{selectedCandidate.serial}</span>
                  <span className="pill-quiet text-2xs">
                    {selectedCandidate.source === 'Internal referral'
                      ? `Internal referral — ${employees.find(e => e.employee_id === selectedCandidate.referred_by_employee_id)?.name || 'staff member'}`
                      : selectedCandidate.source === 'Other' && selectedCandidate.source_details
                      ? `Other — ${selectedCandidate.source_details}`
                      : selectedCandidate.source}
                  </span>
                </div>
                <h2 className="font-serif text-2xl text-ink font-semibold mt-1">
                  {selectedCandidate.first_name} {selectedCandidate.last_name || ''}
                </h2>
                <div className="text-xs text-ink-muted mt-0.5">
                  Phone: {selectedCandidate.phone || '—'} · Email: {selectedCandidate.email || '—'}
                </div>
              </div>
              <button
                onClick={() => setSelectedCandidate(null)}
                className="text-ink-muted hover:text-ink text-sm px-2 py-1"
              >
                ✕ Close
              </button>
            </div>

            <div className="space-y-6 text-xs">
              {/* Shareable Evaluation Link Box */}
              <div className="panel p-4 bg-page border-rule">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-ink">Shareable Interviewer Evaluation Form</div>
                    <div className="text-2xs text-ink-muted mt-0.5">
                      Send to chefs or outside evaluators. No login required to submit ratings.
                    </div>
                  </div>
                  <button
                    onClick={() => copyInterviewerLink(selectedCandidate.public_token)}
                    className="btn-secondary text-xs"
                  >
                    {copiedLink ? '✓ Link Copied' : '🔗 Copy Evaluation Link'}
                  </button>
                </div>
              </div>

              {/* Mappings & Stage Progression */}
              <div>
                <h3 className="font-serif text-base text-ink mb-2.5">Mapped Headcount Positions</h3>
                <div className="space-y-3">
                  {mappings.filter(m => m.candidate_id === selectedCandidate.id).map(m => {
                    const listing = jobListings.find(l => l.id === m.job_listing_id);
                    const stageObj = STAGES.find(s => s.id === m.stage);

                    return (
                      <div key={m.id} className="panel p-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-sm text-ink">
                            {listing?.designation} <span className="text-ink-muted font-normal">({listing?.serial})</span>
                          </div>
                          <div className="text-2xs text-ink-muted mt-0.5">
                            Offered: ₹{Number(listing?.offered_fixed_salary || 0).toLocaleString('en-IN')} ·
                            Ceiling: ₹{Number(listing?.max_fixed_salary || 0).toLocaleString('en-IN')}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={stageObj?.tone || 'pill-quiet'}>{stageObj?.label || m.stage}</span>

                          {m.stage !== 'accepted' && (
                            <select
                              value={m.stage}
                              onChange={e => handleUpdateStage(selectedCandidate.id, m.job_listing_id, e.target.value)}
                              className="field w-auto text-xs py-1"
                            >
                              <option value="applied">Applied</option>
                              <option value="interview_scheduled">Interview Scheduled</option>
                              <option value="interview_completed">Interview Completed</option>
                              <option value="offered">Offered</option>
                            </select>
                          )}

                          {m.stage !== 'accepted' && listing?.status === 'open' && (
                            <button
                              onClick={() => handleAcceptAndOnboard(selectedCandidate, listing)}
                              className="btn-primary text-xs py-1"
                            >
                              Accept & Onboard →
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Interview Evaluations Scorecard */}
              <div>
                <div className="flex items-baseline justify-between mb-2.5">
                  <h3 className="font-serif text-base text-ink">Interview Evaluations</h3>
                  {evaluations.filter(e => e.candidate_id === selectedCandidate.id).length > 0 && (
                    <div className="text-xs">
                      Average Score:{' '}
                      <strong className="text-good font-semibold">
                        {(
                          evaluations.filter(e => e.candidate_id === selectedCandidate.id)
                            .reduce((s, e) => s + Number(e.overall_score), 0) /
                          evaluations.filter(e => e.candidate_id === selectedCandidate.id).length
                        ).toFixed(1)} / 5.0
                      </strong>
                    </div>
                  )}
                </div>

                {evaluations.filter(e => e.candidate_id === selectedCandidate.id).length === 0 ? (
                  <div className="note py-6 text-center">
                    <p className="text-ink">No interviewer submissions yet.</p>
                    <p className="mt-1 text-2xs">Share the link above with the interview panel to collect scores.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {evaluations.filter(e => e.candidate_id === selectedCandidate.id).map(ev => (
                      <div key={ev.id} className="panel p-3.5 space-y-2">
                        <div className="flex justify-between items-baseline">
                          <span className="font-semibold text-ink text-xs">{ev.interviewer_name}</span>
                          <span className="pill-good font-semibold">★ {ev.overall_score} / 5.0</span>
                        </div>
                        {ev.notes && (
                          <div className="text-2xs text-ink bg-page p-2 rounded border border-rule-soft">
                            &ldquo;{ev.notes}&rdquo;
                          </div>
                        )}
                        <div className="flex justify-between text-2xs text-ink-muted">
                          <span>Recommendation: <strong>{ev.recommendation?.replace('_', ' ')}</strong></span>
                          <span>{new Date(ev.created_at).toLocaleDateString('en-IN')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Offer & Negotiation Revision Tracker */}
              <div>
                <div className="flex justify-between items-baseline mb-2.5">
                  <h3 className="font-serif text-base text-ink">Salary Offers & Negotiation Audit Trail</h3>
                  <button
                    onClick={() => {
                      const firstMap = mappings.find(m => m.candidate_id === selectedCandidate.id);
                      setOfferForm({
                        candidate_id: selectedCandidate.id,
                        job_listing_id: firstMap?.job_listing_id || jobListings[0]?.id,
                        fixed_salary: '',
                        variable_salary: '',
                        revision_reason: 'Revision'
                      });
                      setShowOfferModal(true);
                    }}
                    className="btn-secondary text-2xs py-1"
                  >
                    + Log Salary Revision
                  </button>
                </div>

                {offers.filter(o => o.candidate_id === selectedCandidate.id).length === 0 ? (
                  <div className="note py-4 text-center">
                    <p className="text-ink">No offer logged yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {offers.filter(o => o.candidate_id === selectedCandidate.id).map(off => (
                      <div key={off.id} className="panel p-3.5">
                        <div className="flex justify-between items-baseline mb-2">
                          <span className="font-semibold text-ink">Current Offer:</span>
                          <span className="font-bold text-good">
                            ₹{Number(off.offered_fixed_salary).toLocaleString('en-IN')} Fixed + ₹{Number(off.offered_variable_salary).toLocaleString('en-IN')} Var
                          </span>
                        </div>

                        {/* History */}
                        <div className="divide-y divide-rule-soft mt-2 pt-2 border-t border-rule-soft">
                          {(Array.isArray(off.revision_history) ? off.revision_history : []).map((rev, idx) => (
                            <div key={idx} className="py-1.5 flex justify-between text-2xs text-ink-muted">
                              <span>Rev #{rev.revision_number}: {rev.reason} ({rev.date})</span>
                              <span className="text-ink font-medium">₹{Number(rev.fixed_salary).toLocaleString('en-IN')} fixed</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bottom Candidate Actions */}
              <div className="pt-4 border-t border-rule-soft flex justify-between items-center">
                <div className="flex gap-2">
                  <button
                    onClick={() => handleMoveToTalentPool(selectedCandidate)}
                    className="btn-secondary text-xs text-purple-700"
                  >
                    Move to Talent Pool
                  </button>
                  <button
                    onClick={() => {
                      setRejectForm({ candidate_id: selectedCandidate.id, reason: 'Not Competent', notes: '' });
                      setShowRejectModal(true);
                    }}
                    className="btn-quiet text-bad text-xs"
                  >
                    Hard Reject
                  </button>
                </div>
                <button
                  onClick={() => setSelectedCandidate(null)}
                  className="btn-secondary text-xs"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: HARD REJECT WITH STRUCTURED REASON */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="panel panel-body max-w-md w-full bg-surface shadow-2xl animate-settle">
            <h2 className="panel-title text-bad">Confirm Hard Rejection</h2>
            <p className="text-xs text-ink-muted mt-1 mb-4">
              Hard rejection removes the candidate permanently from consideration and logs a structured reason.
            </p>

            <form onSubmit={handleHardReject} className="space-y-4 text-xs">
              <div>
                <label className="field-label">Rejection Reason *</label>
                <select
                  value={rejectForm.reason}
                  onChange={e => setRejectForm(prev => ({ ...prev, reason: e.target.value }))}
                  className="field text-xs"
                >
                  {HARD_REJECT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div>
                <label className="field-label">Notes</label>
                <textarea
                  rows={2}
                  value={rejectForm.notes}
                  onChange={e => setRejectForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Optional context for this decision..."
                  className="field text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-rule-soft">
                <button type="button" onClick={() => setShowRejectModal(false)} className="btn-secondary text-xs">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-danger text-xs">
                  {submitting ? 'Rejecting…' : 'Confirm Hard Reject'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SALARY REVISION */}
      {showOfferModal && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="panel panel-body max-w-md w-full bg-surface shadow-2xl animate-settle">
            <h2 className="panel-title">Log Offer Revision</h2>
            <p className="text-xs text-ink-muted mt-1 mb-4">
              Maintains an audit trail of negotiation revisions for this candidate.
            </p>

            <form onSubmit={handleSaveOffer} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Fixed Salary (₹/mo) *</label>
                  <input
                    type="number"
                    required
                    value={offerForm.fixed_salary}
                    onChange={e => setOfferForm(prev => ({ ...prev, fixed_salary: e.target.value }))}
                    placeholder="e.g. 22000"
                    className="field text-xs"
                  />
                </div>
                <div>
                  <label className="field-label">Variable Pay (₹/mo)</label>
                  <input
                    type="number"
                    value={offerForm.variable_salary}
                    onChange={e => setOfferForm(prev => ({ ...prev, variable_salary: e.target.value }))}
                    placeholder="e.g. 3000"
                    className="field text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="field-label">Revision Reason / Context *</label>
                <input
                  type="text"
                  required
                  value={offerForm.revision_reason}
                  onChange={e => setOfferForm(prev => ({ ...prev, revision_reason: e.target.value }))}
                  placeholder="e.g. Countered from initial ₹20k offer"
                  className="field text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-rule-soft">
                <button type="button" onClick={() => setShowOfferModal(false)} className="btn-secondary text-xs">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary text-xs">
                  {submitting ? 'Saving…' : 'Save Offer Revision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RecruitmentPage() {
  return (
    <Suspense fallback={<div className="py-24 text-center text-sm text-ink-muted">Loading recruitment portal…</div>}>
      <RecruitmentContent />
    </Suspense>
  );
}
