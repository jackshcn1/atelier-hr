'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '../../../lib/supabaseClient';

const CRITERIA = [
  { key: 'knowledge', label: 'Technical Knowledge & Skills', desc: 'Practical capability and competence for the role' },
  { key: 'communication', label: 'Communication & Language', desc: 'Clarity, listening skills, and language suitability' },
  { key: 'confidence', label: 'Confidence & Professionalism', desc: 'Demeanor, attitude, and personal presentation' },
  { key: 'culture_fit', label: 'Culture Fit & Work Ethic', desc: 'Team readiness, adaptability, and guest-first mindset' },
  { key: 'reliability', label: 'Reliability & Punctuality', desc: 'Attendance, past track record, and commitment' }
];

export default function PublicInterviewEvaluationPage() {
  const { token } = useParams();
  const supabase = createClient();

  const [candidate, setCandidate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [interviewerName, setInterviewerName] = useState('');
  const [ratings, setRatings] = useState({
    knowledge: 3,
    communication: 3,
    confidence: 3,
    culture_fit: 3,
    reliability: 3
  });
  const [expectedSalary, setExpectedSalary] = useState('');
  const [currentSalary, setCurrentSalary] = useState('');
  const [recommendation, setRecommendation] = useState('hire');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    async function loadCandidate() {
      if (!token) return;
      setLoading(true);
      setError('');

      const { data, error: err } = await supabase
        .from('candidates')
        .select('id, serial, first_name, last_name, source, interview_date')
        .eq('public_token', token)
        .maybeSingle();

      if (err || !data) {
        setError('Interview record not found or link has expired.');
      } else {
        setCandidate(data);
      }
      setLoading(false);
    }

    loadCandidate();
  }, [token]);

  function handleRatingChange(key, value) {
    setRatings(prev => ({ ...prev, [key]: Number(value) }));
  }

  const averageScore = (
    Object.values(ratings).reduce((sum, v) => sum + Number(v), 0) / CRITERIA.length
  ).toFixed(1);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!interviewerName.trim()) {
      setError('Please enter your name as the interviewer.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const overall = Number(averageScore);

      const { error: insertErr } = await supabase
        .from('interview_evaluations')
        .insert([{
          candidate_id: candidate.id,
          interviewer_name: interviewerName.trim(),
          ratings,
          overall_score: overall,
          expected_salary: expectedSalary ? Number(expectedSalary) : null,
          current_salary: currentSalary ? Number(currentSalary) : null,
          recommendation,
          notes: notes.trim() || null
        }]);

      if (insertErr) throw insertErr;

      // Update candidate expected/current salary if provided
      if (expectedSalary || currentSalary) {
        await supabase
          .from('candidates')
          .update({
            expected_fixed_salary: expectedSalary ? Number(expectedSalary) : undefined,
            current_salary: currentSalary ? Number(currentSalary) : undefined
          })
          .eq('id', candidate.id);
      }

      setSubmitted(true);
    } catch (err) {
      setError(`Failed to submit evaluation: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-page text-ink flex items-center justify-center p-6">
        <p className="text-sm text-ink-muted">Loading interview evaluation sheet…</p>
      </div>
    );
  }

  if (error && !candidate) {
    return (
      <div className="min-h-screen bg-page text-ink flex items-center justify-center p-6">
        <div className="panel panel-body max-w-md w-full text-center">
          <h1 className="font-serif text-2xl text-ink">Interview link not found</h1>
          <p className="text-sm text-ink-muted mt-2">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-page text-ink flex items-center justify-center p-6">
        <div className="panel panel-body max-w-lg w-full text-center py-12 animate-settle">
          <div className="w-12 h-12 rounded-full bg-good-wash text-good flex items-center justify-center mx-auto text-xl font-bold">
            ✓
          </div>
          <h1 className="font-serif text-3xl text-ink mt-4">Evaluation Submitted</h1>
          <p className="text-sm text-ink-muted mt-2">
            Thank you, <strong>{interviewerName}</strong>. Your feedback for{' '}
            <strong>{candidate.first_name} {candidate.last_name || ''}</strong> has been securely
            recorded and sent to HR for final review.
          </p>
          <div className="mt-8 pt-6 border-t border-rule-soft text-2xs text-ink-muted uppercase tracking-wider">
            Atelier HR · Recruitment & Talent Pipeline
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page text-ink py-10 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-xs uppercase tracking-widest text-ink-muted font-medium">
            Atelier Interview Assessment
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl text-ink mt-1.5">
            {candidate.first_name} {candidate.last_name || ''}
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Candidate ID: <span className="font-mono text-ink">{candidate.serial}</span> · Source: {candidate.source}
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-card border border-bad/30 bg-bad-wash px-4 py-3 text-sm text-bad">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="panel panel-body space-y-8">
          {/* Section 1: Interviewer Identification */}
          <div>
            <label className="field-label">Your Name (Interviewer) *</label>
            <input
              type="text"
              required
              value={interviewerName}
              onChange={e => setInterviewerName(e.target.value)}
              placeholder="e.g. Chef Anand / Rishi"
              className="field"
            />
            <p className="text-2xs text-ink-muted mt-1">
              Your feedback will be attributed to this name on the candidate evaluation report.
            </p>
          </div>

          {/* Section 2: Rating Criteria */}
          <div className="space-y-5 pt-4 border-t border-rule-soft">
            <div className="flex items-baseline justify-between">
              <h2 className="font-serif text-lg text-ink">Evaluation Criteria</h2>
              <div className="text-xs text-ink-muted">
                Score: <strong className="text-ink text-sm">{averageScore}</strong> / 5.0
              </div>
            </div>

            <div className="divide-y divide-rule-soft">
              {CRITERIA.map(c => (
                <div key={c.key} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                    <div>
                      <div className="text-sm font-medium text-ink">{c.label}</div>
                      <div className="text-2xs text-ink-muted">{c.desc}</div>
                    </div>
                    <span className="text-xs font-semibold text-accent">
                      {ratings[c.key]} / 5
                    </span>
                  </div>

                  {/* 1-5 Radio button selector */}
                  <div className="grid grid-cols-5 gap-2">
                    {[1, 2, 3, 4, 5].map(star => {
                      const isSelected = ratings[c.key] === star;
                      return (
                        <button
                          key={star}
                          type="button"
                          onClick={() => handleRatingChange(c.key, star)}
                          className={`py-2 rounded-control text-xs font-semibold border transition-all ${
                            isSelected
                              ? 'border-ink bg-ink text-white'
                              : 'border-rule bg-surface text-ink-muted hover:text-ink hover:bg-page'
                          }`}
                        >
                          {star}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Salary Expectations & Current */}
          <div className="space-y-4 pt-4 border-t border-rule-soft">
            <h2 className="font-serif text-lg text-ink">Compensation Disclosed</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="field-label">Expected Salary (₹ / month)</label>
                <input
                  type="number"
                  value={expectedSalary}
                  onChange={e => setExpectedSalary(e.target.value)}
                  placeholder="e.g. 25000"
                  className="field"
                />
              </div>

              <div>
                <label className="field-label">Current / Last Drawn Salary (₹ / month)</label>
                <input
                  type="number"
                  value={currentSalary}
                  onChange={e => setCurrentSalary(e.target.value)}
                  placeholder="e.g. 20000"
                  className="field"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Recommendation & Notes */}
          <div className="space-y-4 pt-4 border-t border-rule-soft">
            <h2 className="font-serif text-lg text-ink">Overall Hiring Recommendation</h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { key: 'strongly_hire', label: 'Strong Hire', pill: 'border-good/50 text-good' },
                { key: 'hire', label: 'Hire', pill: 'border-good/30 text-good' },
                { key: 'talent_pool', label: 'Talent Pool', pill: 'border-accent/40 text-accent' },
                { key: 'reject', label: 'Do Not Hire', pill: 'border-bad/40 text-bad' }
              ].map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setRecommendation(opt.key)}
                  className={`py-2.5 px-3 rounded-control text-xs font-semibold border transition-colors ${
                    recommendation === opt.key
                      ? 'border-ink bg-ink text-white shadow-xs'
                      : `bg-surface hover:bg-page ${opt.pill}`
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div>
              <label className="field-label">Interview Notes & Observations</label>
              <textarea
                rows={4}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Specific strengths, trial feedback, language observations, or trial kitchen results..."
                className="field font-sans"
              />
            </div>
          </div>

          {/* Submit Action */}
          <div className="pt-4 border-t border-rule-soft">
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full justify-center py-3 text-sm font-semibold"
            >
              {submitting ? 'Submitting Evaluation…' : 'Submit Evaluation to HR'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
