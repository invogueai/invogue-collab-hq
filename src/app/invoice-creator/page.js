"use client";
import { useState, useEffect } from "react";

const T = {
  bg: "#F6F4F0", surface: "#FFFFFF", brand: "#770A1C", gold: "#B08D42",
  goldSoft: "#EDE7D6", border: "rgba(26,26,26,.12)",
  text: "#1A1A1A", sub: "#7D766A", faint: "#B5AFA4",
  ok: "#1B7A3D", okBg: "#E2F3E8", warn: "#C27A08", warnBg: "#FEF4DD",
  err: "#B42318", errBg: "#FDE8E8", info: "#0F5BA7", infoBg: "#E0EDFA",
};

export default function InvoiceCreator() {
  const [form, setForm] = useState({
    collabId: "", influencerName: "", email: "", phone: "", address: "",
    pan: "", panName: "", gstNumber: "",
    bank: "", account: "", confirmAccount: "", ifsc: "", upi: "",
    beneficiary: "",
    invoiceNumber: "", invoiceDate: new Date().toISOString().slice(0,10),
    amount: "", description: "", deliverables: "",
    notes: "",
  });
  const [errors, setErrors] = useState({});
  const [generated, setGenerated] = useState(false);

  // Pre-fill from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const updates = {};
    if(params.get("collab")) updates.collabId = params.get("collab");
    if(params.get("name")) updates.influencerName = params.get("name");
    if(params.get("email")) updates.email = params.get("email");
    if(params.get("amount")) updates.amount = params.get("amount");
    if(params.get("deliverables")) updates.deliverables = params.get("deliverables");
    if(Object.keys(updates).length) setForm(f => ({...f, ...updates}));
  }, []);

  const set = (k, v) => setForm(f => ({...f, [k]: v}));

  const validate = () => {
    const e = {};
    if(!form.influencerName.trim()) e.influencerName = "Required";
    if(!form.pan.trim()) e.pan = "Required";
    if(!form.panName.trim()) e.panName = "Required";
    if(!form.beneficiary.trim()) e.beneficiary = "Required";
    if(!form.bank.trim()) e.bank = "Required";
    if(!form.account.trim()) e.account = "Required";
    if(!form.ifsc.trim()) e.ifsc = "Required";
    if(!form.amount || +form.amount <= 0) e.amount = "Required";
    if(form.account && form.confirmAccount && form.account !== form.confirmAccount) e.confirmAccount = "Account numbers don't match";
    if(form.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.pan.toUpperCase())) e.pan = "Invalid PAN format (e.g. ABCDE1234F)";
    if(form.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.ifsc.toUpperCase())) e.ifsc = "Invalid IFSC format";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const generatePDF = () => {
    if(!validate()) return;
    const invNum = form.invoiceNumber || `INV-${form.collabId || Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
    const invDate = form.invoiceDate || new Date().toISOString().slice(0,10);
    const formattedDate = new Date(invDate).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
    const amt = +form.amount;
    const w = window.open("","_blank","width=800,height=1000");
    if(!w) { alert("Pop-up blocked — please allow pop-ups for this site"); return; }
    w.document.write(`<!DOCTYPE html><html><head><title>Invoice ${invNum}</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@600;700;800&family=Archivo:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Archivo,sans-serif;color:#1A1A1A;padding:40px;max-width:800px;margin:0 auto;font-size:13px;line-height:1.6}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #770A1C}
.brand{font-family:Barlow,sans-serif;font-size:14px;font-weight:700;color:#770A1C;letter-spacing:2px;text-transform:uppercase}
.invoice-title{font-family:Barlow,sans-serif;font-size:28px;font-weight:800;color:#770A1C;text-align:right}
.invoice-meta{text-align:right;font-size:12px;color:#7D766A;margin-top:4px}
.invoice-meta b{color:#1A1A1A}
.section{margin-bottom:20px}
.section-title{font-family:Barlow,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#770A1C;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #eee}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px}
.info-block{font-size:12px;line-height:1.7}
.info-block b{font-size:13px;display:block;margin-bottom:2px}
table{width:100%;border-collapse:collapse;margin-bottom:20px}
th{background:#770A1C;color:#F6DFC1;padding:8px 12px;text-align:left;font-family:Barlow,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
td{padding:8px 12px;border-bottom:1px solid #eee;font-size:12px}
.grand-total td{background:#770A1C;color:#F6DFC1;font-size:15px;font-weight:800;font-family:Barlow,sans-serif}
.payment-box{background:#F6F4F0;border:1px solid #ddd;border-radius:6px;padding:16px;margin-bottom:20px}
.payment-box .row{display:flex;justify-content:space-between;padding:3px 0;font-size:12px}
.payment-box .row b{color:#1A1A1A}
.footer{margin-top:32px;padding-top:16px;border-top:2px solid #770A1C;text-align:center;font-size:11px;color:#7D766A}
.collab-id{font-family:Barlow,sans-serif;font-size:11px;color:#770A1C;font-weight:700;letter-spacing:1px;background:#EDE7D6;padding:3px 10px;border-radius:4px;display:inline-block}
@media print{body{padding:20px}button,.no-print{display:none!important}}
</style></head><body>
<div class="no-print" style="text-align:center;margin-bottom:20px">
<button onclick="window.print()" style="background:#770A1C;color:#F6DFC1;border:none;padding:10px 24px;border-radius:4px;font-family:Barlow,sans-serif;font-weight:700;font-size:14px;cursor:pointer;letter-spacing:1px;text-transform:uppercase;margin-right:8px">Save as PDF / Print</button>
<button onclick="window.close()" style="background:#fff;color:#770A1C;border:2px solid #770A1C;padding:10px 24px;border-radius:4px;font-family:Barlow,sans-serif;font-weight:700;font-size:14px;cursor:pointer;letter-spacing:1px;text-transform:uppercase">Close</button>
</div>

<div class="header">
<div>
<div style="font-size:12px;color:#7D766A;margin-bottom:4px">Invoice From</div>
<div class="info-block">
<b>${form.influencerName}</b>
${form.address||""}<br>
${form.phone ? "Phone: "+form.phone+"<br>" : ""}
${form.email ? "Email: "+form.email : ""}
${form.pan ? "<br>PAN: "+form.pan.toUpperCase() : ""}
${form.gstNumber ? "<br>GST: "+form.gstNumber.toUpperCase() : ""}
</div>
</div>
<div>
<div class="invoice-title">INVOICE</div>
<div class="invoice-meta">
<b>${invNum}</b><br>
Date: ${formattedDate}<br>
${form.collabId ? `<span class="collab-id">${form.collabId}</span>` : ""}
</div>
</div>
</div>

<div class="section">
<div class="section-title">Bill To</div>
<div class="info-block">
<b>Invogue</b>
invogue.shop<br>
contact@invogue.shop
</div>
</div>

<table>
<thead><tr><th>Description</th><th>Deliverables</th><th style="text-align:right">Amount</th></tr></thead>
<tbody>
<tr>
<td>${form.description || "Influencer marketing collaboration"}</td>
<td>${form.deliverables || "As per agreement"}</td>
<td style="text-align:right;font-weight:700">₹${amt.toLocaleString("en-IN")}</td>
</tr>
<tr class="grand-total"><td colspan="2" style="text-align:right">TOTAL PAYABLE</td><td style="text-align:right">₹${amt.toLocaleString("en-IN")}</td></tr>
</tbody>
</table>

<div class="section">
<div class="section-title">Payment Details</div>
<div class="payment-box">
<div class="row"><span>Beneficiary Name</span><b>${form.beneficiary}</b></div>
<div class="row"><span>Bank</span><b>${form.bank}</b></div>
<div class="row"><span>Account Number</span><b>${form.account}</b></div>
<div class="row"><span>IFSC Code</span><b>${form.ifsc.toUpperCase()}</b></div>
${form.upi ? `<div class="row"><span>UPI ID</span><b>${form.upi}</b></div>` : ""}
</div>
</div>

${form.notes ? `<div style="background:#FEF4DD;border:1px solid #E8D5A3;border-radius:4px;padding:10px;font-size:11px;color:#7D766A;margin-bottom:16px"><b>Notes:</b> ${form.notes}</div>` : ""}

<div style="text-align:right;margin-top:40px">
<div style="font-size:12px;color:#7D766A;margin-bottom:4px">Authorized Signatory</div>
<div style="font-family:Barlow,sans-serif;font-weight:800;font-size:16px;color:#1A1A1A">${form.influencerName}</div>
${form.pan ? `<div style="font-size:11px;color:#7D766A">PAN: ${form.pan.toUpperCase()}</div>` : ""}
</div>

<div class="footer">
This invoice was generated using the Invogue Invoice Creator<br>
${form.collabId ? `Collaboration ID: ${form.collabId} · ` : ""}invogue.shop
</div>
</body></html>`);
    w.document.close();
    setGenerated(true);
  };

  const Field = ({label, required, error, children, span}) => (
    <div style={{marginBottom:"10px", gridColumn: span ? "1/-1" : undefined}}>
      <label style={{display:"block",fontSize:"11px",fontWeight:700,color:T.sub,marginBottom:"4px",textTransform:"uppercase",letterSpacing:".3px",fontFamily:"'Barlow',sans-serif"}}>
        {label} {required && <span style={{color:T.err}}>*</span>}
      </label>
      {children}
      {error && <div style={{fontSize:"11px",color:T.err,marginTop:"2px"}}>{error}</div>}
    </div>
  );

  const Inp = ({value, onChange, placeholder, type, disabled}) => (
    <input value={value} onChange={onChange} placeholder={placeholder} type={type||"text"} disabled={disabled}
      style={{width:"100%",padding:"10px 12px",border:`1px solid ${T.border}`,borderRadius:"4px",fontSize:"14px",
        fontFamily:"Archivo,sans-serif",color:T.text,background:disabled?"#f0f0f0":T.surface,outline:"none"}}
      onFocus={e=>e.target.style.borderColor=T.brand}
      onBlur={e=>e.target.style.borderColor="rgba(26,26,26,.12)"}
    />
  );

  return (
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:"'Archivo',sans-serif"}}>
      {/* Header */}
      <div style={{background:T.brand,padding:"20px 0",textAlign:"center"}}>
        <div style={{fontFamily:"'Barlow',sans-serif",fontSize:"14px",fontWeight:700,color:"#F6DFC1",letterSpacing:"3px",textTransform:"uppercase"}}>INVOGUE</div>
        <div style={{fontFamily:"'Barlow',sans-serif",fontSize:"24px",fontWeight:800,color:"#fff",marginTop:"4px",letterSpacing:"1px"}}>Invoice Creator</div>
        <div style={{fontSize:"13px",color:"#F6DFC199",marginTop:"4px"}}>Generate your invoice for Invogue collaborations</div>
      </div>

      <div style={{maxWidth:"720px",margin:"0 auto",padding:"24px 20px"}}>
        {/* Collab ID banner */}
        {form.collabId && (
          <div style={{background:T.goldSoft,border:`1px solid ${T.gold}44`,borderRadius:"8px",padding:"12px 16px",marginBottom:"20px",display:"flex",alignItems:"center",gap:"10px"}}>
            <span style={{fontSize:"20px"}}>🤝</span>
            <div>
              <div style={{fontSize:"12px",color:T.sub,fontWeight:600}}>Collaboration ID</div>
              <div style={{fontSize:"16px",fontWeight:800,color:T.brand,fontFamily:"'Barlow',sans-serif",letterSpacing:"1px"}}>{form.collabId}</div>
            </div>
            {form.amount && <div style={{marginLeft:"auto",textAlign:"right"}}>
              <div style={{fontSize:"12px",color:T.sub}}>Amount</div>
              <div style={{fontSize:"18px",fontWeight:800,color:T.gold}}>₹{(+form.amount).toLocaleString("en-IN")}</div>
            </div>}
          </div>
        )}

        {generated && (
          <div style={{background:T.okBg,border:`1px solid ${T.ok}33`,borderRadius:"8px",padding:"14px 16px",marginBottom:"20px",fontSize:"13px",color:T.ok}}>
            ✅ <b>Invoice generated!</b> Save it as PDF using the button in the new window, then share it with the Invogue team.
          </div>
        )}

        <div style={{background:T.surface,borderRadius:"10px",border:`1px solid ${T.border}`,padding:"24px",marginBottom:"16px"}}>
          {/* Your Details */}
          <div style={{fontFamily:"'Barlow',sans-serif",fontSize:"13px",fontWeight:700,color:T.brand,textTransform:"uppercase",letterSpacing:"1px",marginBottom:"14px",paddingBottom:"8px",borderBottom:`2px solid ${T.brand}`}}>Your Details</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
            <Field label="Your Name / Business Name" required error={errors.influencerName}>
              <Inp value={form.influencerName} onChange={e=>set("influencerName",e.target.value)} placeholder="Your full name or business name"/>
            </Field>
            <Field label="Email">
              <Inp value={form.email} onChange={e=>set("email",e.target.value)} placeholder="your@email.com"/>
            </Field>
            <Field label="Phone">
              <Inp value={form.phone} onChange={e=>set("phone",e.target.value)} placeholder="+91 98765 43210"/>
            </Field>
            <Field label="PAN Number" required error={errors.pan}>
              <Inp value={form.pan} onChange={e=>set("pan",e.target.value.toUpperCase())} placeholder="ABCDE1234F"/>
            </Field>
            <Field label="Name on PAN" required error={errors.panName}>
              <Inp value={form.panName} onChange={e=>set("panName",e.target.value)} placeholder="Exact name as on PAN card"/>
            </Field>
            <Field label="GST Number">
              <Inp value={form.gstNumber} onChange={e=>set("gstNumber",e.target.value.toUpperCase())} placeholder="Optional"/>
            </Field>
            <Field label="Address" span>
              <Inp value={form.address} onChange={e=>set("address",e.target.value)} placeholder="Your full mailing address"/>
            </Field>
          </div>
        </div>

        <div style={{background:T.surface,borderRadius:"10px",border:`1px solid ${T.border}`,padding:"24px",marginBottom:"16px"}}>
          {/* Bank Details */}
          <div style={{fontFamily:"'Barlow',sans-serif",fontSize:"13px",fontWeight:700,color:T.brand,textTransform:"uppercase",letterSpacing:"1px",marginBottom:"14px",paddingBottom:"8px",borderBottom:`2px solid ${T.brand}`}}>Bank Details</div>
          <div style={{padding:"8px 12px",background:T.infoBg,borderRadius:"6px",marginBottom:"14px",fontSize:"12px",color:T.info}}>
            🔒 Your bank details are <b>only used to generate this invoice</b>. They are not stored on any server.
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
            <Field label="Beneficiary Name" required error={errors.beneficiary}>
              <Inp value={form.beneficiary} onChange={e=>set("beneficiary",e.target.value)} placeholder="Name as on bank account"/>
            </Field>
            <Field label="Bank Name" required error={errors.bank}>
              <Inp value={form.bank} onChange={e=>set("bank",e.target.value)} placeholder="HDFC Bank"/>
            </Field>
            <Field label="Account Number" required error={errors.account}>
              <Inp value={form.account} onChange={e=>set("account",e.target.value)} placeholder="Account number" type="text"/>
            </Field>
            <Field label="Confirm Account Number" error={errors.confirmAccount}>
              <Inp value={form.confirmAccount} onChange={e=>set("confirmAccount",e.target.value)} placeholder="Re-enter account number"/>
            </Field>
            <Field label="IFSC Code" required error={errors.ifsc}>
              <Inp value={form.ifsc} onChange={e=>set("ifsc",e.target.value.toUpperCase())} placeholder="HDFC0001234"/>
            </Field>
            <Field label="UPI ID">
              <Inp value={form.upi} onChange={e=>set("upi",e.target.value)} placeholder="name@upi (optional)"/>
            </Field>
          </div>
        </div>

        <div style={{background:T.surface,borderRadius:"10px",border:`1px solid ${T.border}`,padding:"24px",marginBottom:"20px"}}>
          {/* Invoice Details */}
          <div style={{fontFamily:"'Barlow',sans-serif",fontSize:"13px",fontWeight:700,color:T.brand,textTransform:"uppercase",letterSpacing:"1px",marginBottom:"14px",paddingBottom:"8px",borderBottom:`2px solid ${T.brand}`}}>Invoice Details</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
            <Field label="Collab ID">
              <Inp value={form.collabId} onChange={e=>set("collabId",e.target.value)} placeholder="e.g. INV-A3F2XK" disabled={!!new URLSearchParams(window.location.search).get("collab")}/>
            </Field>
            <Field label="Invoice Date">
              <Inp value={form.invoiceDate} onChange={e=>set("invoiceDate",e.target.value)} type="date"/>
            </Field>
            <Field label="Amount (₹)" required error={errors.amount}>
              <Inp value={form.amount} onChange={e=>set("amount",e.target.value)} placeholder="25000" type="number" disabled={!!new URLSearchParams(window.location.search).get("amount")}/>
            </Field>
            <Field label="Invoice Number">
              <Inp value={form.invoiceNumber} onChange={e=>set("invoiceNumber",e.target.value)} placeholder="Auto-generated if empty"/>
            </Field>
            <Field label="Description" span>
              <Inp value={form.description} onChange={e=>set("description",e.target.value)} placeholder="e.g. Instagram Reel + Story for Invogue Shapewear"/>
            </Field>
            <Field label="Deliverables" span>
              <Inp value={form.deliverables} onChange={e=>set("deliverables",e.target.value)} placeholder="e.g. 1 Reel, 2 Stories, 1 Static Post"/>
            </Field>
            <Field label="Notes" span>
              <Inp value={form.notes} onChange={e=>set("notes",e.target.value)} placeholder="Any additional notes (optional)"/>
            </Field>
          </div>
        </div>

        {/* Generate Button */}
        <button onClick={generatePDF} style={{
          width:"100%",padding:"16px",background:T.brand,color:"#F6DFC1",border:"none",
          borderRadius:"8px",fontSize:"16px",fontWeight:800,cursor:"pointer",
          fontFamily:"'Barlow',sans-serif",letterSpacing:"2px",textTransform:"uppercase",
          transition:"opacity .2s"
        }}
          onMouseEnter={e=>e.target.style.opacity="0.9"}
          onMouseLeave={e=>e.target.style.opacity="1"}
        >
          📄 Generate Invoice PDF
        </button>

        <div style={{textAlign:"center",margin:"20px 0",fontSize:"12px",color:T.sub}}>
          After generating, use your browser's <b>Print → Save as PDF</b> to download.<br/>
          Then share the PDF with the Invogue team.
        </div>

        {/* Footer */}
        <div style={{textAlign:"center",padding:"20px 0",borderTop:`1px solid ${T.border}`,fontSize:"11px",color:T.faint}}>
          <span style={{fontFamily:"'Barlow',sans-serif",fontWeight:700,color:T.brand,letterSpacing:"2px"}}>INVOGUE</span>
          <span style={{margin:"0 6px"}}>·</span>
          invogue.shop
          <div style={{marginTop:"4px"}}>Your bank details are processed entirely in your browser and are never sent to any server.</div>
        </div>
      </div>
    </div>
  );
}
