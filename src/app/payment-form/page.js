"use client";
import { useState, useEffect } from "react";

const T = {
  bg: "#F6F4F0", surface: "#FFFFFF", brand: "#770A1C", gold: "#B08D42",
  goldSoft: "#EDE7D6", border: "rgba(26,26,26,.12)",
  text: "#1A1A1A", sub: "#7D766A", faint: "#B5AFA4",
  ok: "#1B7A3D", okBg: "#E2F3E8", warn: "#C27A08", warnBg: "#FEF4DD",
  err: "#B42318", errBg: "#FDE8E8", info: "#0F5BA7", infoBg: "#E0EDFA",
};

// Module scope — must NOT be defined inside the component, or every keystroke
// remounts the input and focus is lost after one character.
const Field = ({ label, required, error, children, span }) => (
  <div style={{ marginBottom: "10px", gridColumn: span ? "1/-1" : undefined }}>
    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: T.sub, marginBottom: "4px", textTransform: "uppercase", letterSpacing: ".3px", fontFamily: "'Bodoni Moda',serif" }}>
      {label} {required && <span style={{ color: T.err }}>*</span>}
    </label>
    {children}
    {error && <div style={{ fontSize: "11px", color: T.err, marginTop: "2px" }}>{error}</div>}
  </div>
);

const Inp = ({ value, onChange, placeholder, type, disabled }) => (
  <input value={value} onChange={onChange} placeholder={placeholder} type={type || "text"} disabled={disabled}
    style={{ width: "100%", padding: "10px 12px", border: `1px solid ${T.border}`, borderRadius: "2px", fontSize: "14px", fontFamily: "Archivo,sans-serif", color: T.text, background: disabled ? "#f0f0f0" : T.surface, outline: "none" }}
    onFocus={e => e.target.style.borderColor = T.brand}
    onBlur={e => e.target.style.borderColor = "rgba(26,26,26,.12)"} />
);

const f = n => "₹" + Number(n || 0).toLocaleString("en-IN");

export default function PaymentForm() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null);     // { collabId, influencerName, amount, deliverables[] }
  const [loadErr, setLoadErr] = useState("");
  const [form, setForm] = useState({
    beneficiary: "", bank: "", account: "", confirmAccount: "", ifsc: "", upi: "",
    pan: "", panName: "", gstNumber: "", address: "", phone: "",
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = new URLSearchParams(window.location.search).get("token") || "";
    setToken(t);
    if (!t) { setLoadErr("This link is missing its access token."); setLoading(false); return; }
    fetch(`/api/payment-form?token=${encodeURIComponent(t)}`)
      .then(r => r.json())
      .then(d => {
        if (!d.ok) { setLoadErr(d.error || "Could not load this collaboration."); }
        else {
          setInfo(d);
          if (d.submitted) setDone(true);
          if (d.prefill) setForm(prev => ({ ...prev, ...d.prefill, confirmAccount: d.prefill.account || "" }));
          if (d.phone) setForm(prev => ({ ...prev, phone: prev.phone || d.phone }));
        }
      })
      .catch(() => setLoadErr("Could not reach the server. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const validate = () => {
    const e = {};
    if (!form.beneficiary.trim()) e.beneficiary = "Required";
    if (!form.bank.trim()) e.bank = "Required";
    if (!form.account.trim()) e.account = "Required";
    if (form.account && form.confirmAccount && form.account.trim() !== form.confirmAccount.trim()) e.confirmAccount = "Account numbers don't match";
    if (!form.ifsc.trim()) e.ifsc = "Required";
    else if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.ifsc.toUpperCase())) e.ifsc = "Invalid IFSC format";
    if (!form.pan.trim()) e.pan = "Required";
    else if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.pan.toUpperCase())) e.pan = "Invalid PAN (e.g. ABCDE1234F)";
    if (!form.panName.trim()) e.panName = "Required";
    // The bank account holder and the PAN holder must be the same person.
    const norm = s => (s || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (form.beneficiary.trim() && form.panName.trim() && norm(form.beneficiary) !== norm(form.panName))
      e.panName = "Name on PAN must match the beneficiary (bank account) name";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const r = await fetch("/api/payment-form", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...form }),
      });
      const d = await r.json();
      if (!d.ok) { setErrors({ submit: d.error || "Submission failed." }); }
      else setDone(true);
    } catch (e) {
      setErrors({ submit: "Could not reach the server. Please try again." });
    } finally { setSubmitting(false); }
  };

  const Header = () => (
    <div style={{ background: T.brand, padding: "20px 0", textAlign: "center" }}>
      <div style={{ fontFamily: "'Bodoni Moda',serif", fontSize: "14px", fontWeight: 700, color: "#F6DFC1", letterSpacing: "3px", textTransform: "uppercase" }}>INVOGUE</div>
      <div style={{ fontFamily: "'Bodoni Moda',serif", fontSize: "24px", fontWeight: 800, color: "#fff", marginTop: "4px", letterSpacing: "1px" }}>Payment Details</div>
      <div style={{ fontSize: "13px", color: "#F6DFC199", marginTop: "4px" }}>Submit your bank details to receive your collaboration payment</div>
    </div>
  );

  if (loading) return <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Archivo',sans-serif" }}><Header /><div style={{ textAlign: "center", padding: "60px 20px", color: T.sub }}>Loading your collaboration…</div></div>;

  if (loadErr) return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Archivo',sans-serif" }}><Header />
      <div style={{ maxWidth: "520px", margin: "40px auto", padding: "0 20px", textAlign: "center" }}>
        <div style={{ fontSize: "44px", marginBottom: "12px" }}>⚠️</div>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: "2px", padding: "28px", fontSize: "14px", color: T.text }}>{loadErr}</div>
      </div>
    </div>
  );

  if (done) return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Archivo',sans-serif" }}><Header />
      <div style={{ maxWidth: "520px", margin: "40px auto", padding: "0 20px", textAlign: "center" }}>
        <div style={{ fontSize: "52px", marginBottom: "12px" }}>🎉</div>
        <div style={{ background: T.surface, border: `1px solid ${T.ok}33`, borderRadius: "2px", padding: "28px" }}>
          <h1 style={{ fontSize: "20px", color: T.brand, marginBottom: "8px" }}>Thank you, {info?.influencerName}!</h1>
          <p style={{ fontSize: "14px", color: T.sub, lineHeight: 1.6 }}>Your payment details for <b>{info?.collabId}</b> have been received securely. Our finance team will process your payment of <b style={{ color: T.gold }}>{f(info?.amount)}</b> shortly.</p>
          <p style={{ fontSize: "12px", color: T.faint, marginTop: "14px" }}>You can close this page now. Need a correction? Reach out to your collab manager.</p>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Archivo',sans-serif" }}>
      <Header />
      <div style={{ maxWidth: "720px", margin: "0 auto", padding: "24px 20px" }}>
        {/* Collab summary (read-only, auto-fetched) */}
        <div style={{ background: T.goldSoft, border: `1px solid ${T.gold}44`, borderRadius: "2px", padding: "14px 16px", marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
            <div>
              <div style={{ fontSize: "12px", color: T.sub, fontWeight: 600 }}>Collaboration</div>
              <div style={{ fontSize: "16px", fontWeight: 800, color: T.brand, fontFamily: "'Bodoni Moda',serif", letterSpacing: "1px" }}>{info?.collabId || "—"}</div>
              <div style={{ fontSize: "13px", color: T.text, marginTop: "2px" }}>{info?.influencerName}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "12px", color: T.sub }}>Amount Payable</div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: T.gold }}>{f(info?.amount)}</div>
            </div>
          </div>
          {info?.deliverables?.length > 0 && (
            <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: `1px solid ${T.gold}33` }}>
              <div style={{ fontSize: "11px", color: T.sub, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: "4px" }}>Deliverables</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {info.deliverables.map((d, i) => <span key={i} style={{ background: "#fff", borderRadius: "2px", padding: "3px 9px", fontSize: "12px", color: T.text }}>{d.type}{d.description ? ` — ${d.description}` : ""}</span>)}
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: "8px 12px", background: T.infoBg, borderRadius: "2px", marginBottom: "14px", fontSize: "12px", color: T.info }}>
          🔒 Your details are submitted securely over an encrypted connection and used only to process this payment.
        </div>

        {/* Bank details */}
        <div style={{ background: T.surface, borderRadius: "2px", border: `1px solid ${T.border}`, padding: "24px", marginBottom: "16px" }}>
          <div style={{ fontFamily: "'Bodoni Moda',serif", fontSize: "13px", fontWeight: 700, color: T.brand, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "14px", paddingBottom: "8px", borderBottom: `2px solid ${T.brand}` }}>Bank Details</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
            <Field label="Beneficiary Name" required error={errors.beneficiary}><Inp value={form.beneficiary} onChange={e => set("beneficiary", e.target.value)} placeholder="Name as on bank account" /></Field>
            <Field label="Bank Name" required error={errors.bank}><Inp value={form.bank} onChange={e => set("bank", e.target.value)} placeholder="HDFC Bank" /></Field>
            <Field label="Account Number" required error={errors.account}><Inp value={form.account} onChange={e => set("account", e.target.value)} placeholder="Account number" /></Field>
            <Field label="Confirm Account Number" error={errors.confirmAccount}><Inp value={form.confirmAccount} onChange={e => set("confirmAccount", e.target.value)} placeholder="Re-enter account number" /></Field>
            <Field label="IFSC Code" required error={errors.ifsc}><Inp value={form.ifsc} onChange={e => set("ifsc", e.target.value.toUpperCase())} placeholder="HDFC0001234" /></Field>
            <Field label="UPI ID"><Inp value={form.upi} onChange={e => set("upi", e.target.value)} placeholder="name@upi (optional)" /></Field>
          </div>
        </div>

        {/* Tax + contact */}
        <div style={{ background: T.surface, borderRadius: "2px", border: `1px solid ${T.border}`, padding: "24px", marginBottom: "20px" }}>
          <div style={{ fontFamily: "'Bodoni Moda',serif", fontSize: "13px", fontWeight: 700, color: T.brand, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "14px", paddingBottom: "8px", borderBottom: `2px solid ${T.brand}` }}>Tax & Contact</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
            <Field label="PAN Number" required error={errors.pan}><Inp value={form.pan} onChange={e => set("pan", e.target.value.toUpperCase())} placeholder="ABCDE1234F" /></Field>
            <Field label="Name on PAN" required error={errors.panName}><Inp value={form.panName} onChange={e => set("panName", e.target.value)} placeholder="Exact name as on PAN card" /></Field>
            <Field label="GST Number"><Inp value={form.gstNumber} onChange={e => set("gstNumber", e.target.value.toUpperCase())} placeholder="Optional" /></Field>
            <Field label="Phone"><Inp value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+91 98765 43210" /></Field>
            <Field label="Mailing Address" span><Inp value={form.address} onChange={e => set("address", e.target.value)} placeholder="Your full mailing address" /></Field>
          </div>
        </div>

        {errors.submit && <div style={{ background: T.errBg, color: T.err, borderRadius: "2px", padding: "12px 16px", marginBottom: "12px", fontSize: "13px" }}>{errors.submit}</div>}

        <button onClick={submit} disabled={submitting} style={{
          width: "100%", padding: "16px", background: T.brand, color: "#F6DFC1", border: "none",
          borderRadius: "2px", fontSize: "16px", fontWeight: 800, cursor: submitting ? "not-allowed" : "pointer",
          fontFamily: "'Bodoni Moda',serif", letterSpacing: "2px", textTransform: "uppercase", opacity: submitting ? .6 : 1,
        }}>{submitting ? "Submitting…" : "Submit Payment Details"}</button>

        <div style={{ textAlign: "center", padding: "20px 0", fontSize: "11px", color: T.faint }}>
          <span style={{ fontFamily: "'Bodoni Moda',serif", fontWeight: 700, color: T.brand, letterSpacing: "2px" }}>INVOGUE</span>
          <span style={{ margin: "0 6px" }}>·</span>invogue.shop
        </div>
      </div>
    </div>
  );
}
