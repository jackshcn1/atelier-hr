/**
 * app/api/customers/feedback/route.js — the customer feedback form, on the
 * floor.
 *
 * ## The sheet is the record
 *
 * This is the **same arrangement as the accountant's expense entry form**, and
 * for the same reason: there is one place a response is written down, and one
 * way into the books.
 *
 * 1. The form writes a row into the **Customer Feedback Form** sheet.
 * 2. The sheet is pulled into the books — the same pull the nightly run does.
 *
 * So a response is in the books the moment it is saved, and a row typed into
 * the sheet by hand is picked up by the night's run.
 *
 * ## Who may fill it in
 *
 * **Any signed-in member of staff.** The form is filled in on the floor, by
 * the person who asked the question, and a captain or a cashier is not going
 * to be given an admin account to do it with. So the check is that the caller
 * is signed in — and the person who signed in is written into the sheet's
 * **Recorded By** column, so the response can be traced back to the hands
 * that wrote it.
 *
 * The waiter — the person who *served* the table — is a different thing, and
 * is asked for separately. The two are never mixed up: a captain may serve a
 * table and the manager may write the response down.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabase } from '../../../../lib/supabaseServer.js';
import {
  FEEDBACK_QUESTIONS,
  FEEDBACK_SCALE,
  FEEDBACK_TAGS,
  cleanFeedbackResponse,
} from '../../../../lib/customerParsers.js';
import {
  FEEDBACK_SHEET_ID,
  FEEDBACK_SHEET_NAME,
  FEEDBACK_SHEET_RANGE,
  alreadyInSheet,
  feedbackOutcome,
  nextSerial,
  parseFeedbackSheet,
  sheetDate,
  syncFeedback,
} from '../../../../lib/feedbackSheet.js';
import {
  appendGoogleSheetRowByHeading,
  fetchGoogleSheetsData,
  googleSheetsConfigured,
} from '../../../../lib/googleSheetsService.js';
import { todayInIST } from '../../../../lib/financePeriod.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The signed-in member of staff, or null.
 *
 * The token comes from the browser's Supabase session. It is checked against
 * Supabase itself — never decoded and believed — so a token that is not
 * genuine cannot pass.
 */
async function signedInStaff(request) {
  const header = request.headers.get('Authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) return null;

  const user = data.user;
  const name =
    user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'Signed in';

  return { id: user.id, email: user.email || '', name: String(name) };
}

/** The rows already in the sheet. */
async function readSheet() {
  const rows = await fetchGoogleSheetsData({
    spreadsheetId: FEEDBACK_SHEET_ID,
    sheetName: FEEDBACK_SHEET_NAME,
    range: FEEDBACK_SHEET_RANGE,
  });
  const parsed = parseFeedbackSheet(rows);
  return parsed.ok ? parsed.responses : [];
}

/**
 * GET — everything the form needs to draw itself.
 *
 * The staff list comes from the employees table, so the waiter is picked from
 * the restaurant's own list of people and is always spelled the same way. A
 * guest's feedback about a captain is only as good as the name on it.
 *
 * With `?bill=25319` it also finds the order that bill names, so the person
 * filling the form in can see they have the right bill before they answer
 * anything.
 */
export async function GET(request) {
  try {
    const staff = await signedInStaff(request);
    if (!staff) {
      return NextResponse.json(
        { success: false, error: 'Sign in to record feedback.' },
        { status: 401 },
      );
    }

    const supabase = getSupabase();
    const { data: employees, error } = await supabase
      .from('employees')
      .select('name, department, designation, status')
      .is('deleted_at', null)
      .eq('status', 'active');
    if (error) throw new Error(error.message);

    // The floor first — the service department is who usually gets asked —
    // then everyone else, each group by name.
    const waiters = (employees || [])
      .map((employee) => ({
        name: String(employee.name || '').trim(),
        department: String(employee.department || '').trim(),
        designation: String(employee.designation || '').trim(),
      }))
      .filter((employee) => employee.name)
      .sort((a, b) => {
        const floor = (employee) => (employee.department === 'Service' ? 0 : 1);
        return floor(a) - floor(b) || a.name.localeCompare(b.name);
      });

    const bill = String(new URL(request.url).searchParams.get('bill') || '').trim();
    let orders = null;
    if (bill) {
      const { data: found, error: ordersError } = await supabase
        .from('customer_orders')
        .select('order_no, order_date, amount, channel, items, phone')
        .eq('order_no', bill)
        .order('order_date', { ascending: false })
        .limit(10);
      if (ordersError) throw new Error(ordersError.message);
      orders = found || [];
    }

    return NextResponse.json({
      success: true,
      data: {
        questions: FEEDBACK_QUESTIONS,
        scale: FEEDBACK_SCALE,
        tags: FEEDBACK_TAGS,
        waiters,
        today: todayInIST(),
        enteredBy: staff.name,
        orders,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || 'The form could not be loaded.' },
      { status: 500 },
    );
  }
}

/**
 * POST — one response, recorded.
 */
export async function POST(request) {
  try {
    const staff = await signedInStaff(request);
    if (!staff) {
      return NextResponse.json(
        { success: false, error: 'Sign in to record feedback.' },
        { status: 401 },
      );
    }
    if (!googleSheetsConfigured()) {
      return NextResponse.json(
        { success: false, error: 'The feedback sheet is not set up on the server yet.' },
        { status: 503 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const today = todayInIST();

    const cleaned = cleanFeedbackResponse(body, { today });
    if (!cleaned.ok) {
      return NextResponse.json({ success: false, error: cleaned.error }, { status: 400 });
    }
    const response = cleaned.response;

    // 1. Is this response already in the sheet? It must not be entered twice.
    const existing = await readSheet();
    const duplicate = alreadyInSheet(existing, response);
    if (duplicate) {
      return NextResponse.json(
        {
          success: false,
          error:
            `This bill already has feedback recorded for ${sheetDate(response.response_date)}` +
            ` — entered by ${duplicate.entered_by || 'somebody'}. ` +
            'Check the sheet before entering it again.',
        },
        { status: 409 },
      );
    }

    // 2. The row goes into the sheet. The sheet is the record.
    const word = (value) =>
      FEEDBACK_SCALE.find((step) => step.value === Number(value))?.label || '';

    await appendGoogleSheetRowByHeading({
      spreadsheetId: FEEDBACK_SHEET_ID,
      sheetName: FEEDBACK_SHEET_NAME,
      fields: {
        Date: sheetDate(response.response_date),
        'Feedback Sl No.': String(nextSerial(existing)),
        'Bill Number': response.bill_number,
        Waiter: response.waiter,
        'Overall Experience': word(response.overall),
        'Food Quality': word(response.food_quality),
        'Taste of the food': word(response.taste),
        Service: word(response.service),
        'Staff Hospitality': word(response.hospitality),
        'Waiting Time': word(response.waiting_time),
        'Would you visit Atelier again?': response.would_visit_again,
        'What can we improve': response.improvement_tags.join(', '),
        Comment: response.comment,
        'Recorded By': staff.name,
      },
      required: ['Date', 'Bill Number', 'Waiter', 'Overall Experience', 'Recorded By'],
    });

    // 3. The sheet is pulled into the books — the same pull the nightly run
    //    does, so there is one way into the books and not two.
    const supabase = getSupabase();
    const rows = await fetchGoogleSheetsData({
      spreadsheetId: FEEDBACK_SHEET_ID,
      sheetName: FEEDBACK_SHEET_NAME,
      range: FEEDBACK_SHEET_RANGE,
    });
    const parsed = parseFeedbackSheet(rows);
    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: `The sheet could not be read back: ${parsed.error}` },
        { status: 500 },
      );
    }
    const result = await syncFeedback(supabase, parsed.responses);

    // What became of **this** response — read back from the row it wrote.
    // The counts in `result` are the whole sheet's, so they cannot answer a
    // question about one response.
    const outcome = await feedbackOutcome(supabase, response);

    return NextResponse.json({
      success: true,
      data: {
        bill_number: response.bill_number,
        response_date: response.response_date,
        waiter: response.waiter,
        // Whether it reached its order: the response is attached when the
        // order is already in the books. Today's orders are not, until the
        // night's pull brings them in.
        is_linked: outcome.is_linked,
        // Whether the guest is a customer of ours. A customer is a person
        // whose order carried a real contact number — so an order with no
        // number on it does not make one, and the page says so.
        has_phone: outcome.has_phone,
        written: result,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || 'The feedback could not be recorded.' },
      { status: 500 },
    );
  }
}
