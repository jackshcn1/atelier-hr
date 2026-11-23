/**
 * lib/feedbackSheet.js — the customer feedback sheet, and the pull that
 * brings it into the books.
 *
 * ## The sheet is the record
 *
 * This is the same arrangement as the accountant's invoice sheet, and for
 * the same reason: **there is one place a response is written down, and one
 * way into the books.**
 *
 * - The **form** in the app (`/customers/feedback/new`) writes a row into the
 *   sheet, then pulls it in — so a response is in the books the moment it is
 *   given, not the next morning.
 * - The **nightly run** pulls the same sheet, so a row typed into the sheet
 *   by hand is picked up too.
 *
 * ## The sheet's columns
 *
 * The columns are found **by heading**, so a question can be added to the
 * sheet without shifting the others into the wrong column.
 *
 * | Heading | What it holds |
 * |---|---|
 * | Date | the day the response was given |
 * | Feedback Sl No. | the sheet's own serial number |
 * | Bill Number | the bill it is about — this is how it finds its order |
 * | Waiter | who served the table |
 * | Overall Experience | the rating |
 * | Food Quality … Waiting Time | the five detail ratings |
 * | Would you visit Atelier again? | answered on the same scale |
 * | What can we improve | the tags, separated by commas |
 * | Comment | what they said, in their own words |
 * | Recorded By | who wrote it down — added 23 Nov 2026 |
 */

import { findHeaderRow, parseDate, ratingScore, splitTags } from './customerParsers.js';
import { FEEDBACK_QUESTIONS } from './customerParsers.js';
import { linkFeedback } from './customerSync.js';

export const FEEDBACK_SHEET_ID =
  process.env.CUSTOMER_FEEDBACK_SPREADSHEET_ID || '1M0jVGEh1aekFYnMtVkHSA4oobZq5Pg1i3-D6TenF9kU';
export const FEEDBACK_SHEET_NAME = process.env.CUSTOMER_FEEDBACK_SHEET_NAME || 'Sheet1';

// The whole tab, not a slice of it. The columns are found **by heading**, so
// a range that stopped one column short would lose that column quietly.
export const FEEDBACK_SHEET_RANGE = 'A:AZ';

/** Where a response in the books came from. */
export const FEEDBACK_SOURCE = 'google_sheet:customer_feedback_form';

/**
 * The sheet's own serial number, in the form it is written there.
 *
 * "September 29, 2026" — the shape the sheet's date column already uses.
 */
export function sheetDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return text;
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${months[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
}

/**
 * Read the feedback sheet.
 *
 * The columns are found **by heading**, because the form may add a question
 * and the sheet's columns move when it does.
 *
 * @param {Array<Array<any>>} rows
 * @returns {{ok: boolean, responses: Array<object>, error?: string}}
 */
export function parseFeedbackSheet(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: 'The feedback sheet is empty.' };
  }
  const headerIndex = findHeaderRow(rows, ['Bill Number', 'Food Quality']);
  if (headerIndex === -1) {
    return { ok: false, error: 'Could not find the "Bill Number / Food Quality" header row.' };
  }

  const header = (rows[headerIndex] || []).map((c) => String(c ?? '').trim());
  const idx = (name) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());

  const billNumber = idx('Bill Number');
  const date = idx('Date');
  const serial = idx('Feedback Sl No.');
  const waiter = idx('Waiter');
  const again = header.findIndex((h) => h.toLowerCase().includes('visit'));
  const improve = header.findIndex((h) => h.toLowerCase().includes('improve'));
  const comment = header.findIndex((h) => h.toLowerCase() === 'comment');
  const recordedBy = header.findIndex((h) => h.toLowerCase() === 'recorded by');

  if (billNumber === -1) {
    return { ok: false, error: 'The feedback sheet has no "Bill Number" column.' };
  }

  const responses = [];
  const skipped = [];
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const bill = String(row[billNumber] ?? '').trim();
    const anyFilled = row.some((c) => String(c ?? '').trim() !== '');
    if (!anyFilled) continue;

    const responseDate = parseDate(date >= 0 ? row[date] : '');

    // A response is identified by the **bill it is about and the day it was
    // given**. A row that is missing either cannot be identified — and a
    // blank date is *not equal to itself* in a unique index, so such a row
    // would be written again on every pull, and the table would quietly grow
    // by one row a night. So it is refused here, and it is reported.
    const line = i + 1; // the sheet's own line number
    if (!bill) {
      skipped.push({ line, reason: 'no bill number' });
      continue;
    }
    if (!responseDate) {
      skipped.push({ line, reason: 'no date, or a date that could not be read' });
      continue;
    }

    const record = {
      bill_number: bill,
      response_date: responseDate,
      serial: serial >= 0 ? String(row[serial] ?? '').trim() : '',
      waiter: waiter >= 0 ? String(row[waiter] ?? '').trim() : '',
      would_visit_again: again >= 0 ? String(row[again] ?? '').trim() : '',
      improvement_tags: splitTags(improve >= 0 ? row[improve] : ''),
      comment: comment >= 0 ? String(row[comment] ?? '').trim() : '',
      // Who wrote it down. A row typed into the sheet by hand has none.
      entered_by: recordedBy >= 0 ? String(row[recordedBy] ?? '').trim() : '',
      source: FEEDBACK_SOURCE,
    };

    for (const question of FEEDBACK_QUESTIONS) {
      const at = idx(question.heading);
      record[question.field] = at >= 0 ? ratingScore(row[at]) : null;
    }

    responses.push(record);
  }

  return { ok: true, responses, skipped };
}

/**
 * The next serial number, so the sheet's own numbering keeps going.
 *
 * @param {Array<object>} responses the rows already in the sheet
 * @returns {number}
 */
export function nextSerial(responses) {
  let highest = 0;
  for (const response of responses || []) {
    const value = Number(response.serial);
    if (Number.isFinite(value) && value > highest) highest = value;
  }
  return highest + 1;
}

/**
 * Is this response already in the sheet?
 *
 * A response is identified by the **bill it is about and the day it was
 * given** — the same pair the books are keyed on. A bill number on its own
 * is not an identity, because Petpooja restarts its numbering.
 *
 * @param {Array<object>} responses the rows already in the sheet
 * @param {object} row the response about to be written
 * @returns {object|null} the response that is already there, or null
 */
export function alreadyInSheet(responses, row) {
  const bill = String(row.bill_number || '').trim();
  const day = String(row.response_date || '').trim();
  return (
    (responses || []).find((response) => {
      if (String(response.bill_number || '').trim() !== bill) return false;
      return String(response.response_date || '').trim() === day;
    }) || null
  );
}

/**
 * Write the sheet's responses into the books.
 *
 * The sheet is the record, so a response is an **upsert** on (bill number,
 * response date): a row that is already in the books is updated rather than
 * added a second time, and the nightly pull and the form's own pull are the
 * same code — one way into the books.
 *
 * The responses are then attached to the orders their bill numbers name, and
 * each customer's count is kept in step. Both of those are **one statement**
 * each — the old pull rewrote all 515 customers one request at a time, which
 * took 126 seconds and made the nightly run fail for two nights running.
 *
 * @param {object} supabase a service-role client
 * @param {Array<object>} responses from parseFeedbackSheet()
 */
export async function syncFeedback(supabase, responses) {
  const now = new Date().toISOString();

  // One row per response — an upsert cannot carry the same key twice in one
  // request.
  const unique = new Map();
  for (const response of responses || []) {
    const key = `${response.bill_number}|${response.response_date}`;
    unique.set(key, response);
  }
  const distinct = [...unique.values()];

  const BATCH = 200;
  for (let i = 0; i < distinct.length; i += BATCH) {
    const payload = distinct.slice(i, i + BATCH).map((response) => ({
      bill_number: response.bill_number || '',
      response_date: response.response_date,
      waiter: response.waiter || '',
      overall: response.overall ?? null,
      food_quality: response.food_quality ?? null,
      taste: response.taste ?? null,
      service: response.service ?? null,
      hospitality: response.hospitality ?? null,
      waiting_time: response.waiting_time ?? null,
      would_visit_again: response.would_visit_again || '',
      improvement_tags: response.improvement_tags || [],
      comment: response.comment || '',
      entered_by: response.entered_by || '',
      source: FEEDBACK_SOURCE,
      synced_at: now,
      updated_at: now,
    }));
    const { error } = await supabase
      .from('customer_feedback')
      .upsert(payload, { onConflict: 'bill_number,response_date' });
    if (error) throw new Error(error.message);
  }

  // Attach each response to the order its bill names, and keep each
  // customer's count in step.
  const linked = await linkFeedback(supabase);

  return {
    responses: distinct.length,
    linked: linked.linked,
    unlinked: linked.unlinked,
  };
}

/**
 * What became of **one** response — did it reach its order, and does that
 * order carry a phone number?
 *
 * The counts that `syncFeedback()` returns are **the whole sheet's**, so they
 * cannot answer a question about one response: a sheet holding one linked and
 * one unlinked response would say "linked" about both. So the row that this
 * particular response wrote is read back and the answer comes from it.
 *
 * ## Why the phone number matters
 *
 * A **customer is a person whose order carried a real contact number**. A
 * response attached to an order with no number on it is kept and counted, but
 * it does not make anybody a customer — so the page says so, rather than
 * telling a captain that a guest is now a customer of ours when they are not.
 *
 * @param {object} supabase a service-role client
 * @param {object} response from cleanFeedbackResponse()
 * @returns {Promise<{is_linked: boolean, has_phone: boolean, phone: string}>}
 */
export async function feedbackOutcome(supabase, response) {
  const { data, error } = await supabase
    .from('customer_feedback')
    .select('order_no, phone, is_linked')
    .eq('bill_number', response.bill_number || '')
    .eq('response_date', response.response_date)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const row = data || {};
  return {
    is_linked: Boolean(row.is_linked),
    phone: String(row.phone || ''),
    has_phone: Boolean(String(row.phone || '').trim()),
  };
}
