/**
 * app/api/customers/feedback/route.js — the customer feedback form, in the app.
 *
 * ## Where a response comes from
 *
 * The form used to be a Google Sheet. It is now filled in here, on the floor,
 * and a response is written straight into `customer_feedback` when it is
 * submitted. There is no sheet and no nightly pull of one.
 *
 * ## Who may fill it in
 *
 * **Any signed-in member of staff.** The form is filled in on the floor, by
 * the person who asked the question, and a captain or a cashier is not going
 * to be given an admin account to do it with. So the check is that the
 * caller is signed in — and the person who signed in is written down, so the
 * response can be traced back to the hands that wrote it.
 *
 * The waiter — the person who *served* the table — is a different thing, and
 * is asked for separately. The two are never mixed up: a captain may serve a
 * table and the manager may write the response down.
 *
 * ## The order it is about
 *
 * A response names the bill it is about. When that bill is already in the
 * books, the response is attached to its order straight away and the guest
 * is counted as a customer of ours. When it is not — which is the usual case,
 * because today's orders arrive with the night's pull — the response is kept
 * and the night's run attaches it then.
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
import { recordFeedback } from '../../../../lib/customerSync.js';
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

    const body = await request.json().catch(() => ({}));
    const today = todayInIST();

    const cleaned = cleanFeedbackResponse(
      { ...body, entered_by: staff.name },
      { today },
    );
    if (!cleaned.ok) {
      return NextResponse.json(
        { success: false, error: cleaned.error },
        { status: 400 },
      );
    }

    const supabase = getSupabase();
    const saved = await recordFeedback(supabase, cleaned.response);

    return NextResponse.json({ success: true, data: saved });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || 'The feedback could not be recorded.' },
      { status: 500 },
    );
  }
}
