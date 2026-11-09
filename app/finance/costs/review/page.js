'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function ExpenseReviewDashboard() {
  const [expenses, setExpenses] = useState([]);
  const [filterStatus, setFilterStatus] = useState('pending');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchExpenses = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/finance/expenses?status=' + filterStatus);
        const data = await response.json();
        if (data.success) {
          setExpenses(data.data);
        }
      } catch (error) {
        console.error('Error fetching expenses:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchExpenses();
  }, [filterStatus]);

  const handleStatusChange = (e) => {
    setFilterStatus(e.target.value);
  };

  const handleApprove = async (id) => {
    try {
      await fetch(`/api/finance/expenses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      const response = await fetch('/api/finance/expenses?status=' + filterStatus);
      const data = await response.json();
      if (data.success) {
        setExpenses(data.data);
      }
    } catch (error) {
      console.error('Error approving expense:', error);
    }
  };

  const handleReject = async (id) => {
    try {
      await fetch(`/api/finance/expenses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' }),
      });
      const response = await fetch('/api/finance/expenses?status=' + filterStatus);
      const data = await response.json();
      if (data.success) {
        setExpenses(data.data);
      }
    } catch (error) {
      console.error('Error rejecting expense:', error);
    }
  };

  const statusOptions = [
    { value: 'pending', label: 'Pending Review' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' }
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
        <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
          <div className="flex items-center gap-3 mb-6">
            <Link href="/finance/costs/entry" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
              ← Back to Entry
            </Link>
            <span className="text-[#8b6f4e] text-sm">Finance / Costs & Expenses / Review</span>
          </div>
          <div className="page-head mb-8">
            <h1 className="page-title font-serif text-4xl lg:text-5xl">Expense Review Dashboard</h1>
            <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">
              View, approve, or reject pending expenses
            </p>
          </div>
          <div className="flex items-center gap-3 mb-6">
            <select
              value={filterStatus}
              onChange={handleStatusChange}
              className="px-3 py-2 border border-[#ebe8e4] rounded-control"
            >
              <option value="pending">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <button
              onClick={() => setFilterStatus('pending')}
              className="btn-primary px-3 py-2"
            >
              Refresh
            </button>
          </div>
          <div className="expenses-grid">
            <div className="text-center py-8">
              <p className="text-[#8b6f4e] text-sm">Loading...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f4f2] text-[#1e1812]">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/finance/costs/entry" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            ← Back to Entry
          </Link>
          <span className="text-[#8b6f4e] text-sm">Finance / Costs & Expenses / Review</span>
        </div>
        <div className="page-head mb-8">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Expense Review Dashboard</h1>
          <p className="page-purpose text-[#6b635c] text-base lg:text-lg mt-3">
            View, approve, or reject pending expenses
          </p>
        </div>
        <div className="flex items-center gap-3 mb-6">
          <select
            value={filterStatus}
            onChange={handleStatusChange}
            className="px-3 py-2 border border-[#ebe8e4] rounded-control"
          >
            <option value="pending">Pending Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <button
            onClick={() => setFilterStatus('pending')}
            className="btn-primary px-3 py-2"
          >
            Refresh
          </button>
        </div>
        <div className="expenses-grid">
          {expenses.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-[#8b6f4e] text-sm">No expenses to review</p>
              <p className="text-sm text-[#6b635c]">Select a status filter to see pending items</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-1/4">
                  <h2 className="text-lg font-medium text-[#1e1812] mb-2">Status</h2>
                  {statusOptions.map(option => (
                    <div key={option.value} className="mb-2">
                      <input
                        type="radio"
                        name="statusFilter"
                        value={option.value}
                        checked={filterStatus === option.value}
                        onChange={handleStatusChange}
                        className="mr-2"
                      />
                      <span className="text-sm">{option.label}</span>
                    </div>
                  ))}
                </div>
                <div className="w-3/4">
                  <h2 className="text-lg font-medium text-[#1e1812] mb-2">Expenses</h2>
                  <div className="space-y-3">
                    {expenses.length === 0 ? (
                      <p className="text-[#8b6f4e] text-sm">No expenses match current filter</p>
                    ) : (
                      <div className="space-y-2">
                        {expenses.map(expense => (
                          <div key={expense.id} className="flex items-start border-b border-[#ebe8e4] pb-4 mb-4 p-4">
                            <div className="w-1/3">
                              <p className="text-lg font-medium text-[#1e1812]">{expense.category}</p>
                              <p className="text-[#8b6f4e] text-sm">{expense.cost_type} Cost</p>
                              <p className="text-sm">{expense.vendor_name}</p>
                            </div>
                            <div className="w-2/3">
                              <p className="text-sm">₹{expense.amount.toLocaleString('en-IN')}</p>
                              <p className="text-sm">Status: {expense.status}</p>
                              {expense.status === 'pending' && (
                                <div className="mt-2 flex justify-between">
                                  <button
                                    onClick={() => handleApprove(expense.id)}
                                    className="btn-primary btn-sm"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleReject(expense.id)}
                                    className="btn-danger btn-sm"
                                  >
                                    Reject
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}