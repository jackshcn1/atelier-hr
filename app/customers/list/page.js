'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  money, count, rating, ratingPill, formatDate, platformLabel, customerName,
} from '../../../lib/customerFormat';

/**
 * app/customers/list/page.js — every customer, in one table.
 *
 * The search takes a name or a contact number, because that is how the floor
 * knows a customer: by the name they gave or the number they dialled. The
 * table is sorted by what they are worth by default, because that is the
 * first question anyone asks about a customer.
 *
 * The number is shown masked here. The full number is on the customer's own
 * page, which is the only place it is needed.
 */

const SORTS = [
  { value: 'spend', label: 'What they have spent' },
  { value: 'last_order', label: 'When they last came' },
  { value: 'orders', label: 'How many times' },
  { value: 'rating', label: 'How they rated us' },
];

export default function CustomerListPage() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('spend');
  const [platform, setPlatform] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ view: 'list', sort });
      if (search.trim()) params.set('search', search.trim());
      if (platform) params.set('platform', platform);

      const res = await fetch(`/api/customers?${params.toString()}`);
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'The customer list could not be loaded.');
        return;
      }
      setRows(json.data || []);
      setTotal(json.total || 0);
    } catch (err) {
      setError('The customer list could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [search, sort, platform]);

  useEffect(() => {
    load();
  }, [load]);

  const platforms = useMemo(() => {
    const seen = new Set(rows.map((row) => row.platform));
    return [...seen].filter(Boolean);
  }, [rows]);

  return (
    <main className="min-h-screen bg-page text-ink">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/customers" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Back to Customers
          </Link>
          <span className="text-ink-muted text-sm">Customers / All Customers</span>
        </div>

        <div className="page-head">
          <div>
            <h1 className="page-title">All customers</h1>
            <p className="page-purpose">
              Everyone whose order carried a real contact number. The number is what makes them
              one person — so nobody is counted twice.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link href="/customers/overview" className="btn-secondary">Overview</Link>
            <Link href="/customers/list" className="btn-secondary">All customers</Link>
            <Link href="/customers/reviews" className="btn-secondary">Reviews</Link>
            <Link href="/customers/feedback" className="btn-secondary">Feedback</Link>
          </div>
        </div>

        {/* ---- The controls ---------------------------------------------- */}
        <div className="panel mb-6">
          <div className="panel-body grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="md:col-span-2">
              <label className="field-label" htmlFor="customer-search">Search by name or number</label>
              <input
                id="customer-search"
                className="field"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, or the last digits of a number"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="customer-sort">Sort by</label>
              <select
                id="customer-sort"
                className="field"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="customer-platform">Where they order</label>
              <select
                id="customer-platform"
                className="field"
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
              >
                <option value="">Everyone</option>
                {platforms.map((key) => (
                  <option key={key} value={key}>{platformLabel(key)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error ? <div className="note mb-6">{error}</div> : null}

        {/* ---- The table ------------------------------------------------- */}
        <section className="panel">
          <div className="panel-body">
            <div className="flex items-center justify-between gap-4 mb-4">
              <h2 className="panel-title">The list</h2>
              <p className="text-sm text-ink-muted">
                {loading ? 'Loading…' : `${count(total)} customer${total === 1 ? '' : 's'}`}
              </p>
            </div>

            {rows.length === 0 && !loading ? (
              <p className="note">
                No customer matches that. Try a different name, or clear the search.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[52rem]">
                  <thead>
                    <tr>
                      <th className="table-head">Customer</th>
                      <th className="table-head">Number</th>
                      <th className="table-head">Orders</th>
                      <th className="table-head">Spent</th>
                      <th className="table-head">Average order</th>
                      <th className="table-head">Last came</th>
                      <th className="table-head">Where</th>
                      <th className="table-head">Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.phone}>
                        <td className="table-cell">
                          <Link href={`/customers/${row.phone}`} className="text-ink hover:text-accent">
                            {customerName(row.name)}
                          </Link>
                          {row.feedback_count > 0 ? (
                            <span className="text-xs text-ink-muted block">
                              {row.feedback_count} feedback response{row.feedback_count === 1 ? '' : 's'}
                            </span>
                          ) : null}
                        </td>
                        <td className="table-cell tnum">{row.maskedPhone}</td>
                        <td className="table-cell tnum">{count(row.order_count)}</td>
                        <td className="table-cell tnum">{money(row.total_spend)}</td>
                        <td className="table-cell tnum">{money(row.avg_order_value)}</td>
                        <td className="table-cell whitespace-nowrap">{formatDate(row.last_order_at)}</td>
                        <td className="table-cell">{platformLabel(row.platform)}</td>
                        <td className="table-cell">
                          {row.avg_rating ? (
                            <span className={`pill ${ratingPill(row.avg_rating)}`}>
                              {rating(row.avg_rating)}
                            </span>
                          ) : (
                            <span className="text-ink-muted text-xs">No review</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
