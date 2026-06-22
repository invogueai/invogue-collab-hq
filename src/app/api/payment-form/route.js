// Invogue Collab HQ — Secure Influencer Payment-Details Form API
//
// PUBLIC endpoint, gated entirely by an unguessable token (no deal IDs in the URL,
// so nobody can reach another influencer's collab by editing the link).
//
//   GET  /api/payment-form?token=<uuid>   → collab summary + deliverables + any saved details
//   POST /api/payment-form  { token, ...details } → saves the influencer's payment details
//
// On submit we store the details on the deal (snapshot for bulk invoice generation),
// mirror bank fields onto the influencer record, and advance the deal to
// 'payment_details_received'. We pay the locked amount — there is no amount matching.

import { createClient } from '@supabase/supabase-js';

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function bad(error, status = 400) { return Response.json({ ok: false, error }, { status }); }

export async function GET(req) {
  try {
    const token = new URL(req.url).searchParams.get('token');
    if (!token || token.length < 10) return bad('Invalid or missing token', 400);
    const db = sb();

    const { data: deal, error } = await db
      .from('deals')
      .select('id, collab_id, influencer_name, influencer_id, amount, status, email, phone, payment_details, payment_details_submitted_at')
      .eq('payment_token', token)
      .single();
    if (error || !deal) return bad('This payment link is invalid or has expired.', 404);

    const { data: dels } = await db
      .from('deliverables').select('type, description').eq('deal_id', deal.id);

    // Prefill from a previous submission or the influencer's stored bank details
    let prefill = deal.payment_details || {};
    if (!deal.payment_details && deal.influencer_id) {
      const { data: inf } = await db
        .from('influencers')
        .select('bank_account_holder, bank_account_number, bank_ifsc, pan_number, upi_id, address')
        .eq('id', deal.influencer_id).single();
      if (inf) prefill = {
        beneficiary: inf.bank_account_holder || '', bank: '', account: inf.bank_account_number || '',
        ifsc: inf.bank_ifsc || '', upi: inf.upi_id || '', pan: inf.pan_number || '',
        address: inf.address || '',
      };
    }

    return Response.json({
      ok: true,
      collabId: deal.collab_id || '',
      influencerName: deal.influencer_name,
      amount: deal.amount,
      email: deal.email || '',
      phone: deal.phone || '',
      deliverables: (dels || []).map(d => ({ type: d.type, description: d.description || '' })),
      submitted: !!deal.payment_details_submitted_at,
      submittedAt: deal.payment_details_submitted_at,
      prefill,
    });
  } catch (e) {
    console.error('payment-form GET error:', e);
    return bad('Something went wrong. Please try again.', 500);
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { token } = body;
    if (!token || token.length < 10) return bad('Invalid or missing token', 400);
    const db = sb();

    const { data: deal, error } = await db
      .from('deals').select('id, influencer_id, influencer_name, status').eq('payment_token', token).single();
    if (error || !deal) return bad('This payment link is invalid or has expired.', 404);

    // Required fields
    const required = ['beneficiary', 'bank', 'account', 'ifsc', 'pan', 'panName'];
    for (const k of required) if (!String(body[k] || '').trim()) return bad(`Missing required field: ${k}`);
    const pan = String(body.pan).toUpperCase().trim();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return bad('Invalid PAN format (e.g. ABCDE1234F)');
    const ifsc = String(body.ifsc).toUpperCase().trim();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return bad('Invalid IFSC format');
    if (body.confirmAccount && String(body.account).trim() !== String(body.confirmAccount).trim())
      return bad("Account numbers don't match");

    const ts = new Date().toISOString();
    const details = {
      beneficiary: String(body.beneficiary).trim(), bank: String(body.bank).trim(),
      account: String(body.account).trim(), ifsc, upi: String(body.upi || '').trim(),
      pan, panName: String(body.panName).trim(), gstNumber: String(body.gstNumber || '').trim().toUpperCase(),
      address: String(body.address || '').trim(), phone: String(body.phone || '').trim(),
      submittedAt: ts,
    };

    // Advance status only from a content-complete / pre-payment state
    const advance = ['live', 'partial_live', 'invoice_ok', 'invoice_pending_approval', 'disputed'].includes(deal.status);
    const dealUpdate = {
      payment_details: details, payment_details_submitted_at: ts,
      pan_number: pan, pan_name: details.panName,
      ...(advance ? { status: 'payment_details_received' } : {}),
    };
    const { error: upErr } = await db.from('deals').update(dealUpdate).eq('id', deal.id);
    if (upErr) { console.error('payment-form deal update failed:', upErr); return bad('Could not save your details. Please try again.', 500); }

    // Mirror bank details onto the influencer record (for future collabs / batch export)
    if (deal.influencer_id) {
      await db.from('influencers').update({
        bank_account_holder: details.beneficiary, bank_account_number: details.account,
        bank_ifsc: details.ifsc, pan_number: details.pan, upi_id: details.upi,
        ...(details.address ? { address: details.address } : {}),
      }).eq('id', deal.influencer_id);
    }

    try {
      await db.from('audit_log').insert({
        deal_id: deal.id, user_name: deal.influencer_name,
        action: 'Payment details submitted', detail: `Bank/PAN/UPI submitted via secure form at ${ts}`, created_at: ts,
      });
    } catch (e) { console.error('audit insert failed (non-fatal):', e); }

    return Response.json({ ok: true });
  } catch (e) {
    console.error('payment-form POST error:', e);
    return bad('Something went wrong. Please try again.', 500);
  }
}
