'use client';

import { useState, useEffect, useMemo } from 'react';

// The supplier, as a type-ahead.
//
// Start typing and the suppliers that match come up from the supplier list.
// A name that is not on the list can be added there and then — and it is on
// the list for every entry after it.
//
// The list is fetched once, and filtered as you type, so the matches come up
// without a round trip.

export default function SupplierPicker({
  value,
  onChange,
  label = 'Supplier',
  placeholder = 'Start typing the name…',
  required = true,
  id = 'supplier',
}) {
  const [vendors, setVendors] = useState([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/finance/vendors')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) setVendors(d.data || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const typed = String(value || '').trim().toLowerCase();

  const matches = useMemo(() => {
    if (!typed) return [];
    return vendors.filter((v) => v.name.toLowerCase().includes(typed)).slice(0, 8);
  }, [typed, vendors]);

  // A name that is not on the list yet.
  const isNew = Boolean(typed) && !vendors.some((v) => v.name.toLowerCase() === typed);

  const pick = (name) => {
    onChange(name);
    setOpen(false);
    setNote('');
  };

  const add = async () => {
    const name = String(value || '').trim();
    if (!name) return;
    setAdding(true);
    setNote('');
    try {
      const response = await fetch('/api/finance/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const result = await response.json();

      if (result.success) {
        // It is on the list now — for this entry and for every entry after it.
        setVendors((prev) =>
          [...prev, result.data].sort((a, b) => a.name.localeCompare(b.name)),
        );
        setOpen(false);
        setNote(`${name} added to the supplier list.`);
      } else {
        setNote(`Could not add ${name}: ${result.error}`);
      }
    } catch (error) {
      setNote(`Could not add ${name}.`);
    } finally {
      setAdding(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 border border-[#ebe8e4] rounded-control focus:outline-none focus:border-[#8b6f4e]';

  return (
    <div className="field">
      <label htmlFor={id} className="field-label block text-sm font-medium mb-2">{label}</label>
      <input
        id={id}
        type="text"
        name="vendor_name"
        value={value || ''}
        onChange={(e) => {
          onChange(e.target.value);
          setNote('');
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        className={inputClass}
      />

      {open && matches.length > 0 && (
        <div className="mt-1 border border-[#ebe8e4] rounded-control bg-white overflow-hidden">
          {matches.map((vendor) => (
            <button
              key={vendor.id ?? vendor.name}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(vendor.name)}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-[#f6f4f2]"
            >
              {vendor.name}
            </button>
          ))}
        </div>
      )}

      {isNew && (
        <button
          type="button"
          onClick={add}
          disabled={adding}
          className="btn-secondary text-xs px-3 py-1.5 mt-2 inline-flex items-center gap-1.5"
        >
          {adding ? 'Adding…' : `+ Add “${String(value || '').trim()}” as a new supplier`}
        </button>
      )}

      {note && <p className="text-xs text-[#6b635c] mt-1.5">{note}</p>}

      <p className="text-xs text-[#6b635c] mt-1.5">
        Start typing and the suppliers that match come up. A name that is not on
        the list can be added here, and it is on the list for next time.
      </p>
    </div>
  );
}
