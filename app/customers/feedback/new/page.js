'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '../../../../lib/supabaseClient';

/**
 * app/customers/feedback/new/page.js — the customer feedback form, filled in
 * on the floor.
 *
 * The form used to be a paper register. It is now this page, and it works
 * exactly like the **expense entry form**: the response is written into the
 * **Customer Feedback Form** sheet, and the sheet is then pulled into the
 * books. One place a response is written down, and one way into the books.
 *
 * ## What the platform can do that paper could not
 *
 * - **The bill number finds the order.** Type the number printed on the
 *   guest's bill and the order is looked up, so it is certain which meal the
 *   guest is talking about.
 * - **The waiter is picked, not spelled.** The name comes from the
 *   restaurant's own list of people, so "Chingkab" is always written the
 *   same way and a captain's ratings add up.
 * - **It is signed.** The sheet's **Recorded By** column says who wrote the
 *   row down, so a response can always be traced back.
 * - **The guest's phone comes from the order.** The form never asks for it.
 *
 * ## What it cannot do, and does not pretend to
 *
 * The order behind a bill filled in today is **not in the books yet** —
 * Petpooja's orders are pulled once a night. So a response given today is
 * kept, and the night's run attaches it to its order once the order has
 * arrived. The page says so, plainly, rather than showing a link that is
 * not there yet.
 *
 * ## It is quick on purpose
 *
 * This is filled in on a phone, on the floor, while the next table is
 * waiting. Everything is a tap: one number, one name, and the questions.
 * Only the overall rating and "would you visit again" are required — the
 * five detail questions may be left out, and the page reports how many were
 * answered, so an average is never taken over more people than there were.
 */

const inputClass =
  'w-full px-3 py-2.5 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e] bg-white';

/**
 * A fetch that carries the signed-in member of staff.
 *
 * The server checks the session itself — the token is verified against
 * Supabase, not decoded and believed — so this is what makes the form know
 * who is filling it in.
 */
async function authFetch(url, options = {}) {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

/** The questions that are not required. */
const OPTIONAL = ['food_quality', 'taste', 'service', 'hospitality', 'waiting_time'];

function Field({ label, hint, children, required }) {
  return (
    <div>
      <p className="text-sm font-medium text-ink mb-1.5">
        {label}
        {required ? <span className="text-accent ml-1">*</span> : null}
      </p>
      {hint ? <p className="text-xs text-ink-muted mb-2">{hint}</p> : null}
      {children}
    </div>
  );
}

export default function RecordFeedbackPage() {
  const [form, setForm] = useState({
    bill_number: '',
    waiter: '',
    other_waiter: '',
    ratings: {},
    would_visit_again: '',
    improvement_tags: [],
    other_tag: '',
    comment: '',
    response_date: '',
  });
  const [config, setConfig] = useState(null);
  const [orders, setOrders] = useState(null);
  const [looking, setLooking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null);

  // The form's own vocabulary: the questions, the scale, the tags the
  // restaurant already uses, and the list of people who can be named.
  useEffect(() => {
    let alive = true;
    authFetch('/api/customers/feedback')
      .then((res) => res.json())
      .then((json) => {
        if (!alive) return;
        if (!json.success) {
          setError(json.error || 'The form could not be loaded.');
          return;
        }
        setConfig(json.data);
        setForm((current) => ({ ...current, response_date: json.data.today }));
      })
      .catch(() => {
        if (alive) setError('The form could not be loaded.');
      });
    return () => { alive = false; };
  }, []);

  // The bill number looks the order up. It is looked up again when it
  // changes, so the person filling the form in can see they have the right
  // bill before they answer anything.
  useEffect(() => {
    const bill = form.bill_number.trim();
    if (!bill) {
      setOrders(null);
      return;
    }
    let alive = true;
    setLooking(true);
    const timer = setTimeout(() => {
      authFetch(`/api/customers/feedback?bill=${encodeURIComponent(bill)}`)
        .then((res) => res.json())
        .then((json) => {
          if (alive && json.success) setOrders(json.data.orders || []);
        })
        .catch(() => {
          if (alive) setOrders([]);
        })
        .finally(() => {
          if (alive) setLooking(false);
        });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [form.bill_number]);

  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  const setRating = (field, value) =>
    setForm((current) => ({
      ...current,
      ratings: { ...current.ratings, [field]: value },
    }));

  const toggleTag = (tag) =>
    setForm((current) => ({
      ...current,
      improvement_tags: current.improvement_tags.includes(tag)
        ? current.improvement_tags.filter((item) => item !== tag)
        : [...current.improvement_tags, tag],
    }));

  const answered = OPTIONAL.filter((field) => form.ratings[field]).length;
  const missing = OPTIONAL.length - answered;

  async function submit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const res = await authFetch('/api/customers/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          waiter: form.waiter === '__other__' ? form.other_waiter : form.waiter,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'The feedback could not be recorded.');
        return;
      }
      setSaved(json.data);
      setMessage(
        (json.data.is_linked
          ? json.data.has_phone
            ? 'Recorded, and attached to the order — this guest is now a customer of ours.'
            : 'Recorded, and attached to the order. That order has no phone number on it, so it is not counted as a customer of ours.'
          : 'Recorded. It will be attached to the order once tonight’s orders are in.') +
          ' It is in the feedback sheet.',
      );
    } catch {
      setError('The feedback could not be recorded.');
    } finally {
      setBusy(false);
    }
  }

  if (!config) {
    return (
      <main className="min-h-screen bg-page text-ink">
        <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
          {error ? <p className="note">{error}</p> : <p className="text-ink-muted">Loading the form…</p>}
        </div>
      </main>
    );
  }

  if (saved) {
    return (
      <main className="min-h-screen bg-page text-ink">
        <div className="max-w-shell mx-auto px-6 py-16 lg:py-24 max-w-2xl">
          <div className="panel">
            <div className="panel-body">
              <h1 className="page-title text-2xl mb-3">Thank you — it is recorded</h1>
              <p className="text-sm text-ink mb-6">{message}</p>
              <div className="hairline-list mb-6">
                <div className="py-2 flex items-center justify-between gap-3">
                  <span className="text-sm text-ink-muted">Bill</span>
                  <span className="text-sm text-ink tnum">{saved.bill_number}</span>
                </div>
                <div className="py-2 flex items-center justify-between gap-3">
                  <span className="text-sm text-ink-muted">Served by</span>
                  <span className="text-sm text-ink">{saved.waiter}</span>
                </div>
                <div className="py-2 flex items-center justify-between gap-3">
                  <span className="text-sm text-ink-muted">Recorded on</span>
                  <span className="text-sm text-ink">{saved.response_date}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    setSaved(null);
                    setMessage('');
                    setForm({
                      bill_number: '',
                      waiter: '',
                      other_waiter: '',
                      ratings: {},
                      would_visit_again: '',
                      improvement_tags: [],
                      other_tag: '',
                      comment: '',
                      response_date: config.today,
                    });
                  }}
                >
                  Record another
                </button>
                <Link href="/customers/feedback" className="btn-secondary">See all feedback</Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-page text-ink">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24 max-w-3xl">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/customers/feedback" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Back to Feedback
          </Link>
          <span className="text-ink-muted text-sm">Customers / Record Feedback</span>
        </div>

        <div className="page-head mb-10">
          <h1 className="page-title">Record Feedback</h1>
          <p className="page-purpose">
            What the guest said, while they are still at the table. It goes into the feedback
            sheet and the books as soon as you press save.
          </p>
        </div>

        {error ? <div className="note mb-6">{error}</div> : null}
        {message ? <div className="note mb-6">{message}</div> : null}

        <form onSubmit={submit} className="space-y-8">
          {/* ---- The bill ------------------------------------------------ */}
          <section className="panel">
            <div className="panel-body">
              <Field
                label="Bill number"
                hint="The number printed on the guest’s bill."
                required
              >
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="e.g. 25319"
                  value={form.bill_number}
                  onChange={(event) => set({ bill_number: event.target.value.replace(/[^\d]/g, '') })}
                  className={inputClass}
                />
              </Field>

              {looking ? (
                <p className="text-xs text-ink-muted mt-3">Looking for the bill…</p>
              ) : orders && orders.length > 0 ? (
                <div className="mt-4 space-y-2">
                  <p className="text-xs text-ink-muted">
                    {orders.length === 1
                      ? 'This is the bill:'
                      : 'This number names more than one bill. Check which one:'}
                  </p>
                  {orders.map((order) => (
                    <div key={`${order.order_no}-${order.order_date}`} className="border border-rule-soft rounded-card px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-ink tnum">
                          #{order.order_no} · {order.order_date}
                        </span>
                        <span className="text-ink-muted tnum">₹{Number(order.amount || 0).toLocaleString('en-IN')}</span>
                      </div>
                      {order.items ? (
                        <p className="text-xs text-ink-muted mt-1 line-clamp-2">{order.items}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : orders && form.bill_number.trim().length >= 2 ? (
                <p className="text-xs text-ink-muted mt-3">
                  No order for this bill yet — it may be too recent. The response is still recorded,
                  and it will be attached once the order is in the books.
                </p>
              ) : null}
            </div>
          </section>

          {/* ---- Who served ---------------------------------------------- */}
          <section className="panel">
            <div className="panel-body">
              <Field label="Who served the table" required>
                <select
                  value={form.waiter}
                  onChange={(event) => set({ waiter: event.target.value })}
                  className={inputClass}
                >
                  <option value="">Choose…</option>
                  {config.waiters.map((person) => (
                    <option key={person.name} value={person.name}>
                      {person.name}
                      {person.department ? ` — ${person.department}` : ''}
                    </option>
                  ))}
                  <option value="__other__">Someone else…</option>
                </select>
              </Field>
              {form.waiter === '__other__' ? (
                <div className="mt-3">
                  <input
                    type="text"
                    placeholder="Their name"
                    value={form.other_waiter}
                    onChange={(event) => set({ other_waiter: event.target.value })}
                    className={inputClass}
                  />
                </div>
              ) : null}
            </div>
          </section>

          {/* ---- The questions ------------------------------------------- */}
          <section className="panel">
            <div className="panel-body">
              <h2 className="panel-title mb-1">How they rated it</h2>
              <p className="text-sm text-ink-muted mb-5">
                Tap one for each. The overall rating and “would you visit again” are needed; the
                rest are optional — {missing === 0 ? 'all answered.' : `${missing} still unanswered.`}
              </p>

              <div className="space-y-6">
                {config.questions.map((question) => (
                  <div key={question.field}>
                    <p className="text-sm font-medium text-ink mb-2">
                      {question.heading}
                      {question.field === 'overall' ? <span className="text-accent ml-1">*</span> : null}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {config.scale.map((step) => {
                        const active = form.ratings[question.field] === step.value;
                        return (
                          <button
                            key={step.value}
                            type="button"
                            onClick={() => setRating(question.field, step.value)}
                            className={`px-3 py-2 rounded-control border text-sm transition-colors ${
                              active
                                ? 'border-accent bg-accent text-white'
                                : 'border-[#ebe8e4] bg-white text-ink hover:border-[#8b6f4e]'
                            }`}
                          >
                            {step.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-5 border-t border-rule-soft">
                <p className="text-sm font-medium text-ink mb-2">
                  Would you visit Atelier again?
                  <span className="text-accent ml-1">*</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {config.scale.map((step) => {
                    const active = String(form.would_visit_again) === String(step.value);
                    return (
                      <button
                        key={step.value}
                        type="button"
                        onClick={() => set({ would_visit_again: String(step.value) })}
                        className={`px-3 py-2 rounded-control border text-sm transition-colors ${
                          active
                            ? 'border-accent bg-accent text-white'
                            : 'border-[#ebe8e4] bg-white text-ink hover:border-[#8b6f4e]'
                        }`}
                      >
                        {step.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* ---- What could be better ------------------------------------ */}
          <section className="panel">
            <div className="panel-body">
              <h2 className="panel-title mb-1">What could we improve?</h2>
              <p className="text-sm text-ink-muted mb-4">
                Tap everything they named. If they said something that is not here, write it below —
                it is counted as its own tag.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {config.tags.map((tag) => {
                  const active = form.improvement_tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`px-3 py-1.5 rounded-pill border text-sm transition-colors ${
                        active
                          ? 'border-accent bg-accent text-white'
                          : 'border-[#ebe8e4] bg-white text-ink hover:border-[#8b6f4e]'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4">
                <input
                  type="text"
                  placeholder="Something else they said"
                  value={form.other_tag}
                  onChange={(event) => set({ other_tag: event.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          {/* ---- In their own words -------------------------------------- */}
          <section className="panel">
            <div className="panel-body">
              <Field label="Anything else they said" hint="Exactly as they said it, if you can.">
                <textarea
                  rows={4}
                  value={form.comment}
                  onChange={(event) => set({ comment: event.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>
          </section>

          {/* ---- Save ----------------------------------------------------- */}
          <section className="panel">
            <div className="panel-body">
              <div className="flex flex-wrap items-center gap-4">
                <button type="submit" className="btn-primary" disabled={busy}>
                  {busy ? 'Saving…' : 'Save the feedback'}
                </button>
                <label className="text-sm text-ink-muted flex items-center gap-2">
                  Asked on
                  <input
                    type="date"
                    value={form.response_date}
                    max={config.today}
                    onChange={(event) => set({ response_date: event.target.value })}
                    className="px-2 py-1 border border-[#ebe8e4] rounded-control text-sm"
                  />
                </label>
              </div>
              <p className="note mt-4">
                Signed in as <strong>{config.enteredBy}</strong>. The waiter above is who served the
                table; this is who wrote it down.
              </p>
            </div>
          </section>
        </form>
      </div>
    </main>
  );
}
