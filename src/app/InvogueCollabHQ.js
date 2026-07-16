'use client';
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from '../lib/supabase';

/* ═══════════════════════════════════════════════════════════════
   INVOGUE COLLAB HQ — Production Build with Persistent Storage
   ═══════════════════════════════════════════════════════════════ */

// ─── API FETCH HELPER WITH AUTH ───
// Wraps fetch() to automatically include the Supabase JWT token in Authorization header
const apiFetch = async (url, options = {}) => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
  });
};

// ─── DESIGN SYSTEM ───
// ─── MAISON design tokens (editorial · Bodoni Moda + Archivo · flat 2px) ───
// Key names are preserved so all existing references keep working; values retuned.
const T = {
  bg: "#F8F6F1", surface: "#FFFFFF", surfaceAlt: "#FBFAF7", brand: "#770A1C", brandDeep: "#5E0815", gold: "#B08D42",
  goldSoft: "#EDE7D6", goldMid: "#D4C49A", champagneSoft: "#F6DFC1",
  border: "#E6E0D4", borderSoft: "#F0EBE0", borderHead: "#ECE6DA", inputBorder: "#D8D1C2",
  text: "#1A1A1A", sub: "#7D766A", faint: "#A39C8F",
  ok: "#1B7A3D", okBg: "#E2F3E8", warn: "#C27A08", warnBg: "#FEF4DD",
  err: "#B42318", errBg: "#FDE8E8", info: "#0F5BA7", infoBg: "#E0EDFA",
  purple: "#6527BE", purpleBg: "#F0E9FB", teal: "#0E7A71", tealBg: "#DDF1EE",
  cardShadow: "0 1px 3px rgba(0,0,0,.08)",
  cardShadowHover: "0 1px 3px rgba(0,0,0,.08)",
  display: "'Bodoni Moda',Georgia,serif", ui: "'Archivo',-apple-system,sans-serif",
  radius: "2px",
};
// Display serif (Bodoni Moda) for headings/figures; Archivo for text/UI.
const DISPLAY = "'Bodoni Moda',Georgia,serif";

const STATUS_CFG = {
  pending:        { l:"Pending Approval", c:T.warn,   bg:T.warnBg,   i:"⏳" },
  renegotiate:    { l:"Renegotiate",      c:T.warn,   bg:T.warnBg,   i:"🔄" },
  manager_approved: { l:"Manager Approved (Awaiting Admin)", c:T.info, bg:T.infoBg, i:"✅" },
  approved:       { l:"Approved",         c:T.ok,     bg:T.okBg,     i:"✅" },
  rejected:       { l:"Rejected",         c:T.err,    bg:T.errBg,    i:"❌" },
  drop_requested: { l:"Drop Requested",   c:T.err,    bg:T.errBg,    i:"🚫" },
  dropped:        { l:"Dropped",          c:T.err,    bg:T.errBg,    i:"🚫" },
  email_sent:     { l:"Email Sent",       c:T.info,   bg:T.infoBg,   i:"📧" },
  acknowledged:   { l:"Acknowledged",    c:"#10b981",bg:"#ecfdf5",   i:"🤝" },
  shipped:        { l:"Shipped",          c:T.purple, bg:T.purpleBg, i:"🚚" },
  delivered_prod: { l:"Product Delivered", c:T.teal,  bg:T.tealBg,   i:"📦" },
  partial_live:   { l:"Partially Live",   c:T.warn,   bg:T.warnBg,   i:"⏳" },
  live:           { l:"All Content Live",  c:T.ok,    bg:T.okBg,     i:"🟢" },
  payment_details_received: { l:"Payment Details Received", c:T.info, bg:T.infoBg, i:"🧾" },
  invoice_pending_approval: { l:"Invoice Pending Approval", c:T.warn, bg:T.warnBg, i:"⏳" },
  invoice_ok:     { l:"Invoice Matched",  c:T.info,   bg:T.infoBg,   i:"✔️" },
  disputed:       { l:"Disputed",         c:T.err,    bg:T.errBg,    i:"⚠️" },
  partial_paid:   { l:"Partially Paid",   c:T.gold,   bg:T.goldSoft, i:"💳" },
  paid:           { l:"Fully Paid",       c:T.brand,  bg:T.goldSoft, i:"⭐" },
  payment_requested: { l:"Payment Requested", c:T.warn, bg:T.warnBg, i:"💸" },
  payment_approved: { l:"Payment Approved", c:T.info, bg:T.infoBg, i:"✅" },
};

const now = () => new Date().toISOString().slice(0,16).replace("T"," ");
const f = n => "₹"+Number(n||0).toLocaleString("en-IN");
// Deal commercial amount: a 0 amount means the collab is a barter (product-only) deal.
const fAmt = n => (Number(n||0)===0 ? "Barter" : f(n));
// Returns today's date in the user's LOCAL timezone as YYYY-MM-DD.
// Never use new Date().toISOString().slice(0,10) for dispatch/delivery dates — it gives UTC date.
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
// Normalize any stored dispatch/delivery value to a YYYY-MM-DD string for comparison.
// Handles both legacy ISO timestamps ("2026-04-10T05:30:00.000Z") and plain dates ("2026-04-10").
const toDateOnly = v => (v||"").slice(0,10);
const uid = () => crypto.randomUUID();
const genCollabId = () => "INV-" + Date.now().toString(36).toUpperCase().slice(-4) + Math.random().toString(36).toUpperCase().slice(2,4);

// ─── INPUT VALIDATION HELPERS ───
const validPhone = v => { const d = (v||'').replace(/[\s\-+]/g,'').replace(/^91/,''); return /^\d{10}$/.test(d); };
const cleanPhone = v => { const d = (v||'').replace(/[\s\-+]/g,'').replace(/^91/,''); return /^\d{10}$/.test(d) ? d : v; };
const validUrl = v => { if(!v) return false; const s = v.trim(); return /^https?:\/\/.+/.test(s) || /^[a-zA-Z0-9][\w\-]*\.[a-zA-Z]{2,}/.test(s); };

// ─── SUPABASE DATA LAYER ───
async function loadFromSupabase() {
  const [usersRes, campaignsRes, influencersRes, dealsRes, deliverablesRes, paymentsRes, shipmentsRes, auditRes] = await Promise.all([
    supabase.from('users').select('*'),
    supabase.from('campaigns').select('*'),
    supabase.from('influencers').select('*'),
    supabase.from('deals').select('*').order('created_at', { ascending: false }),
    supabase.from('deliverables').select('*'),
    supabase.from('payments').select('*'),
    supabase.from('shipments').select('*'),
    supabase.from('audit_log').select('*').order('created_at', { ascending: true }),
  ]);

  const users = (usersRes.data||[]).map(u => ({
    id:u.id, name:u.name, email:u.email,
    role:u.role, status:u.status, avatar:u.avatar||u.name?.slice(0,2).toUpperCase(),
    created:u.created_at?.slice(0,10)||'', monthlyBudget:u.monthly_budget??50000,
  }));

  const campaigns = (campaignsRes.data||[]).map(c => ({
    id:c.id, name:c.name, budget:c.budget, target:c.target_influencers,
    status:c.status, created:c.created_at?.slice(0,10)||'', deadline:c.deadline,
    brief:c.brief||"", deleted:c.deleted||false,
  }));

  const influencers = (influencersRes.data||[]).map(i => ({
    id:i.id, name:i.name, platform:i.platform, handle:i.handle,
    profile:i.profile, followers:i.followers, category:i.category,
    city:i.city, phone:i.phone, email:i.email, address:i.address,
    poc:i.poc, avgRate:i.avg_rate, rating:i.rating, notes:i.notes,
    tags:i.tags||[], added:i.created_at?.slice(0,10)||'',
    bankHolder:i.bank_account_holder||"", bankAccount:i.bank_account_number||"",
    bankIfsc:i.bank_ifsc||"", panNumber:i.pan_number||"", upiId:i.upi_id||"",
    defaultPaymentTerms:i.default_payment_terms||"next_15th",
  }));

  const delsByDeal={}, paysByDeal={}, shipByDeal={}, logsByDeal={};
  (deliverablesRes.data||[]).forEach(dl => {
    if(!delsByDeal[dl.deal_id]) delsByDeal[dl.deal_id]=[];
    delsByDeal[dl.deal_id].push({
      id:dl.id, type:dl.type, desc:dl.description, st:dl.status,
      link:dl.live_link||'',
      feedback:dl.feedback||'',
      submitNote:dl.submit_note||'',
      history:Array.isArray(dl.history)?dl.history:[],
    });
  });
  (paymentsRes.data||[]).forEach(p => {
    if(!paysByDeal[p.deal_id]) paysByDeal[p.deal_id]=[];
    paysByDeal[p.deal_id].push({id:p.id,type:p.type,amount:p.amount,note:p.note||'',date:p.created_at?.slice(0,10)||''});
  });
  (shipmentsRes.data||[]).forEach(s => {
    shipByDeal[s.deal_id]={track:s.tracking_id,carrier:s.carrier,st:s.status,dispAt:s.dispatched_at,dispBy:s.dispatched_by,delAt:s.delivered_at};
  });
  (auditRes.data||[]).forEach(l => {
    if(!l.deal_id) return;
    if(!logsByDeal[l.deal_id]) logsByDeal[l.deal_id]=[];
    logsByDeal[l.deal_id].push({t:l.created_at,u:l.user_name,a:l.action,d:l.detail||''});
  });

  const deals = (dealsRes.data||[]).map(d => ({
    id:d.id, collabId:d.collab_id||("INV-"+d.id.slice(0,6).toUpperCase()),
    inf:d.influencer_name, platform:d.platform, followers:d.followers,
    product:d.product, amount:d.amount, status:d.status, cid:d.campaign_id,
    usage:d.usage_rights, deadline:d.deadline, profile:d.profile_link,
    phone:d.phone, address:d.address, by:d.created_by, at:d.created_at,
    appBy:d.approved_by, appAt:d.approved_at, ackAt:d.acknowledged_at, ackToken:d.acknowledge_token,
    adStatus:d.ad_status||null, usageDays:d.usage_days||null, usageEndDate:d.usage_end_date||null,
    adNotes:d.ad_notes||"", adPlatformLink:d.ad_platform_link||"",
    reuseRequested:d.reuse_requested||false, reuseRequestedAt:d.reuse_requested_at||null, reuseRequestedBy:d.reuse_requested_by||"",
    email:d.email||"", payment_terms:d.payment_terms||"", pan_number:d.pan_number||"", pan_name:d.pan_name||"",
    paymentDueDate:d.payment_due_date||null, tdsRate:d.tds_rate??10, tdsAmount:d.tds_amount||0,
    products:d.products||(d.products_json?JSON.parse(d.products_json):[])||[],
    paymentFormSent:d.payment_form_sent||false, paymentFormSentAt:d.payment_form_sent_at||null,
    payment_token:d.payment_token||null, paymentDetails:d.payment_details||null, paymentDetailsAt:d.payment_details_submitted_at||null,
    agencyManaged:d.agency_managed||false, agencyName:d.agency_name||"", agencyGst:d.agency_gst||"", agencyInvoiceUrl:d.agency_invoice_url||"",
    invoiceGenerated:d.invoice_generated||false, invoiceNumber:d.invoice_number||null, invoiceDate:d.invoice_date||null,
    inv:d.invoice_amount!=null?{amount:d.invoice_amount,match:d.invoice_match,at:d.invoice_at,note:d.invoice_note,link:d.invoice_note}:null,
    shipHistory:d.ship_history||[],
    renegotiationNote:d.renegotiation_note||"",
    managerNote:d.manager_note||"",
    productOnHand:d.no_shipment||false,
    deleted:d.deleted||false,
    dels:delsByDeal[d.id]||[], pays:paysByDeal[d.id]||[],
    ship:shipByDeal[d.id]||null, logs:logsByDeal[d.id]||[],
  }));

  return { users, campaigns, influencers, deals };
}

// Fallback user data (empty — all users come from Supabase; this is only used if the `users` table is unreachable)
const SEED_USERS = [];

// Allowed email domains for sign-in + add-user. Membership in the `users`
// table is still required — this is a lightweight pre-filter for the add-user
// form so typos on the domain don't create unusable rows.
const ALLOWED_DOMAINS = ['invogue.shop', 'kreatikcommerce.com'];
const ALLOWED_DOMAINS_RE = new RegExp(
  '@(' + ALLOWED_DOMAINS.map(d => d.replace(/\./g, '\\.')).join('|') + ')$',
  'i'
);
const ALLOWED_DOMAINS_LABEL = ALLOWED_DOMAINS.map(d => '@' + d).join(' or ');

const ROLE_CFG = {
  admin:      { l:"Admin",      c:"#DC2626", bg:"#FEE2E2", i:"⚙️" },
  negotiator: { l:"Negotiator",  c:T.info,   bg:T.infoBg,  i:"👤" },
  approver:   { l:"Manager",     c:T.ok,     bg:T.okBg,    i:"✅" },
  finance:    { l:"Finance",     c:T.gold,   bg:T.goldSoft, i:"💰" },
  logistics:  { l:"Logistics",   c:T.purple, bg:T.purpleBg, i:"📦" },
  performance_marketer: { l:"Performance Marketer", c:"#0891b2", bg:"#ecfeff", i:"📈" },
  viewer:     { l:"Viewer",      c:T.sub,    bg:"#f0ede8",  i:"👁" },
};

// ─── REUSABLE COMPONENTS (Maison editorial) ───
const Badge = ({s,sm}) => { const x=STATUS_CFG[s]||{l:s,c:T.sub,bg:T.goldSoft}; return <span style={{display:"inline-flex",alignItems:"center",padding:"4px 9px",borderRadius:"2px",fontSize:"9px",fontWeight:700,color:x.c,background:x.bg,whiteSpace:"nowrap",letterSpacing:"1px",textTransform:"uppercase",border:"none",fontFamily:T.ui}}>{x.l}</span>; };
const ensureUrl = (url) => url && !url.match(/^https?:\/\//) ? "https://"+url : url;
const DBadge = ({s}) => { const m={pending:{l:"Pending",c:T.sub,bg:"#F2EEE4"},submitted:{l:"Submitted",c:T.info,bg:T.infoBg},revision_requested:{l:"Revision",c:T.warn,bg:T.warnBg},approved:{l:"Approved",c:T.purple,bg:T.purpleBg},live:{l:"Live",c:T.ok,bg:T.okBg}}; const x=m[s]||m.pending; return <span style={{padding:"4px 9px",borderRadius:"2px",fontSize:"9px",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:x.c,background:x.bg,fontFamily:T.ui}}>{x.l}</span>; };

const Btn = ({children,onClick,v="primary",sm,disabled,sx})=>{
  const vs={
    primary:{bg:T.brand,c:"#fff",border:"none"},
    gold:{bg:T.gold,c:"#fff",border:"none"},
    outline:{bg:"transparent",c:T.text,border:"1px solid #C9C1B2"},
    danger:{bg:"transparent",c:T.err,border:"1px solid #E8C9C6"},
    ok:{bg:T.ok,c:"#fff",border:"none"},
    purple:{bg:T.purple,c:"#fff",border:"none"},
    ghost:{bg:"transparent",c:T.sub,border:"none"}
  };
  const vv=vs[v]||vs.primary;
  return <button onClick={onClick} disabled={disabled} style={{border:disabled?"none":vv.border,borderRadius:"2px",padding:sm?"7px 13px":"10px 18px",fontSize:sm?"10px":"11px",fontWeight:700,cursor:disabled?"not-allowed":"pointer",fontFamily:T.ui,textTransform:"uppercase",letterSpacing:"1.5px",background:disabled?"#C9C1B2":vv.bg,color:disabled?"#fff":vv.c,display:"inline-flex",alignItems:"center",gap:"6px",whiteSpace:"nowrap",transition:"all .15s ease",...sx}}>{children}</button>;
};

const inputStyle = (error,disabled,prefix)=>({width:"100%",padding:"11px 13px",border:`1px solid ${error?T.err:T.inputBorder}`,borderRadius:prefix?"0 2px 2px 0":"2px",fontSize:"13px",fontFamily:T.ui,color:T.text,background:disabled?T.surfaceAlt:T.surface,outline:"none",boxSizing:"border-box",transition:"border-color .15s"});
const Inp = ({value,onChange,type="text",disabled,placeholder,prefix,error})=>(
  <div style={{display:"flex"}}>
    {prefix&&<span style={{padding:"11px 12px",background:T.surfaceAlt,border:`1px solid ${T.inputBorder}`,borderRight:"none",borderRadius:"2px 0 0 2px",fontSize:"13px",color:T.sub,lineHeight:"1.3",fontFamily:T.display}}>{prefix}</span>}
    <input type={type} value={value} onChange={onChange} disabled={disabled} placeholder={placeholder} onFocus={e=>e.target.style.borderColor=T.brand} onBlur={e=>e.target.style.borderColor=error?T.err:T.inputBorder} style={inputStyle(error,disabled,prefix)}/>
  </div>
);

const Textarea = ({value,onChange,disabled,placeholder,rows=3,error})=>(
  <textarea value={value} onChange={onChange} disabled={disabled} placeholder={placeholder} rows={rows} onFocus={e=>e.target.style.borderColor=T.brand} onBlur={e=>e.target.style.borderColor=error?T.err:T.inputBorder} style={{...inputStyle(error,disabled,false),resize:"vertical"}}/>
);

const Sel = ({value,onChange,options})=>(
  <select value={value} onChange={onChange} style={{...inputStyle(false,false,false),cursor:"pointer"}}>
    {options.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
  </select>
);

const Field = ({label,children,span,error,required})=>(<div style={{gridColumn:span?`span ${span}`:undefined,marginBottom:"14px"}}><div style={{fontSize:"10px",fontWeight:700,color:error?T.err:T.sub,textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:"6px"}}>{label}{required&&<span style={{color:T.err}}> *</span>}{error&&<span style={{color:T.err,fontSize:"10px",marginLeft:"6px",textTransform:"none",fontWeight:600,letterSpacing:0}}>{error}</span>}</div>{children}</div>);

const Modal = ({open,onClose,title,children,w=540,bare,noBackdropClose})=>{
  if(!open) return null;
  return <div role="presentation" style={{position:"fixed",inset:0,background:"rgba(26,20,14,.32)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:"16px",animation:"fadeIn .2s ease"}} onClick={noBackdropClose?undefined:onClose}>
    <div role="dialog" aria-modal="true" aria-label={title} onClick={e=>e.stopPropagation()} style={{background:T.surface,borderRadius:"2px",width:`${w}px`,maxWidth:"96vw",minWidth:"280px",maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 10px 40px rgba(0,0,0,.20)",animation:"fadeUp .22s ease",overflow:"hidden"}}>
      {bare ? children : <>
        <div style={{padding:"20px 24px",borderBottom:`1px solid ${T.borderHead}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <span style={{fontWeight:600,fontSize:"20px",color:T.text,fontFamily:T.display}}>{title}</span>
          <button onClick={onClose} style={{background:"transparent",border:"none",fontSize:"20px",cursor:"pointer",color:T.faint,padding:"2px 4px",lineHeight:1}}>×</button>
        </div>
        <div style={{padding:"22px 24px",overflowY:"auto",flex:1}}>{children}</div>
      </>}
    </div>
  </div>;
};

const StatBox = ({l,v,c,sub,gradient})=>(<div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"18px 22px"}}>
  <div style={{fontSize:"10px",fontWeight:600,color:T.sub,textTransform:"uppercase",letterSpacing:"2px",marginBottom:"10px",fontFamily:T.ui}}>{l}</div>
  <div style={{fontSize:"34px",fontWeight:500,color:c||T.text,lineHeight:1,fontFamily:T.display}}>{v}</div>
  {sub&&<div style={{fontSize:"11px",color:c||T.sub,marginTop:"8px",fontFamily:T.ui}}>{sub}</div>}
</div>);

const Section = ({title,icon,children,action})=>(<div style={{marginBottom:"24px"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px",paddingBottom:"12px",borderBottom:`1px solid ${T.border}`}}><span style={{fontSize:"12px",fontWeight:700,color:T.text,textTransform:"uppercase",letterSpacing:"2px",fontFamily:T.ui}}>{title}</span>{action}</div>{children}</div>);

const CONTENT_STAGES = [
  {key:"pending",label:"Not Submitted",c:T.sub,bg:T.goldSoft,i:"⏳"},
  {key:"submitted",label:"Submitted for Review",c:T.info,bg:T.infoBg,i:"📤"},
  {key:"approved",label:"Approved — Pending Go-Live",c:T.ok,bg:T.okBg,i:"✅"},
  {key:"revision_requested",label:"Revision Requested",c:T.err,bg:T.errBg,i:"✏️"},
  {key:"live",label:"Live",c:T.ok,bg:T.okBg,i:"🟢"},
];

// ─── CONTENT DELIVERABLES PIPELINE COMPONENT ───
const ContentPipeline = ({deals:dls, onClickDeal}) => {
  const allDels = [];
  dls.forEach(d=>{
    if(!d.dels) return;
    d.dels.forEach((dl,i)=>{
      if(!["rejected","dropped","pending","renegotiate"].includes(d.status))
        allDels.push({...dl,dealId:d.id,inf:d.inf,product:d.products?d.products.map(p=>p.name).join(", "):d.product,deal:d});
    });
  });
  if(allDels.length===0) return <div style={{fontSize:"13px",color:T.sub,padding:"10px 0"}}>No active deliverables</div>;
  const grouped = {};
  CONTENT_STAGES.forEach(s=>grouped[s.key]=[]);
  allDels.forEach(dl=>{ if(grouped[dl.st]) grouped[dl.st].push(dl); });
  const nonEmpty = CONTENT_STAGES.filter(s=>grouped[s.key].length>0);
  if(nonEmpty.length===0) return null;
  return <div>
    <div style={{display:"flex",gap:"8px",marginBottom:"18px",flexWrap:"wrap"}}>
      {CONTENT_STAGES.map(s=>{const ct=grouped[s.key].length;return <div key={s.key} style={{flex:"1 1 110px",padding:"14px 16px",borderRadius:"2px",background:T.surface,border:`1px solid ${T.border}`,opacity:ct>0?1:.55}}>
        <div style={{fontFamily:T.display,fontSize:"28px",fontWeight:500,lineHeight:1,color:ct>0?s.c:T.sub}}>{ct}</div>
        <div style={{fontSize:"9px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:"1px",lineHeight:"1.3",marginTop:"6px"}}>{s.label}</div>
      </div>;})}
    </div>
    {nonEmpty.map(s=><div key={s.key} style={{marginBottom:"16px"}}>
      <div style={{fontSize:"11px",fontWeight:700,color:T.text,textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:"8px"}}>{s.label} <span style={{color:s.c}}>{grouped[s.key].length}</span></div>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px"}}>
      {grouped[s.key].map((dl,i,arr)=><div key={dl.dealId+"-"+i} onClick={()=>onClickDeal&&onClickDeal(dl.deal)} style={{padding:"12px 16px",borderBottom:i<arr.length-1?`1px solid ${T.borderSoft}`:"none",fontSize:"13px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:onClickDeal?"pointer":"default"}}>
        <div><b style={{fontWeight:600}}>{dl.inf}</b> <span style={{color:T.sub}}>· {dl.type}: {dl.desc||"—"}</span></div>
        <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
          {dl.link&&<a href={dl.link.startsWith("http")?dl.link:"https://"+dl.link} target="_blank" rel="noreferrer" style={{fontSize:"10px",letterSpacing:"0.5px",textTransform:"uppercase",color:T.info,fontWeight:700}} onClick={e=>e.stopPropagation()}>Link</a>}
          <span style={{padding:"4px 9px",borderRadius:"2px",fontSize:"9px",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:s.c,background:s.bg}}>{s.label}</span>
        </div>
      </div>)}
      </div>
    </div>)}
  </div>;
};

export default function InvogueCollabHQ() {
  const [loaded, setLoaded] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [rawDeals, setDeals] = useState([]);
  const [deletedDeals, setDeletedDeals] = useState([]);
  const [deletedCampaigns, setDeletedCampaigns] = useState([]);
  const [users, setUsers] = useState([]);
  const [influencers, setInfluencers] = useState([]);
  const [infProfile, setInfProfile] = useState(null); // selected influencer for profile view
  const [infSearch, setInfSearch] = useState("");
  const [infFilter, setInfFilter] = useState("all"); // all | active
  const [dealTab, setDealTab] = useState("overview"); // overview|deliverables|shipment|payment|activity
  const [anFrom, setAnFrom] = useState(""); const [anTo, setAnTo] = useState(""); const [anCamp, setAnCamp] = useState(""); // analytics filters
  const [mgrNoteEdit, setMgrNoteEdit] = useState(null); // dealId being edited
  const [mgrNoteF, setMgrNoteF] = useState("");
  const [loggedIn, setLoggedIn] = useState(null); // null = login screen, user object = app
  const [loginErr, setLoginErr] = useState("");
  const [authChecking, setAuthChecking] = useState(true); // true while resolving initial Supabase session
  const [authBusy, setAuthBusy] = useState(false);        // true while Google redirect is in flight
  const realRole = loggedIn?.role || "negotiator";
  const [viewAsRole, setViewAsRole] = useState(null); // admin only: preview the app as another role
  const role = (realRole==="admin" && viewAsRole) ? viewAsRole : realRole;
  // Negotiators only ever see their own collabs. This is keyed on the REAL identity,
  // so an admin previewing the negotiator view still sees everything.
  const deals = useMemo(
    () => (realRole==="negotiator" && loggedIn?.name) ? rawDeals.filter(d=>d.by===loggedIn.name) : rawDeals,
    [rawDeals, realRole, loggedIn]
  );
  const [view, setView] = useState("dashboard");
  const [tab, setTab] = useState("all");
  const [campFilter, setCampFilter] = useState("");
  const [pocFilter, setPocFilter] = useState("");
  const [sortOrder, setSortOrder] = useState("newest"); // newest | oldest
  const [sel, setSel] = useState(null);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [selCamp, setSelCamp] = useState(null); // selected campaign for detail modal
  useEffect(()=>{ if(modal==="detail") setDealTab("overview"); }, [modal, sel?.id]);

  // Form states
  const [nDeal, setNDeal] = useState(null);
  const submittingDealRef = useRef(false); // synchronous guard against double-submit
  const [submittingDeal, setSubmittingDeal] = useState(false); // drives button disabled state
  const [editingDealId, setEditingDealId] = useState(null); // non-null = New Deal modal is editing an existing (pre-approval) deal
  const [resendF, setResendF] = useState({dealId:null, email:""}); // resend-confirmation modal (editable recipient)
  const [agencyF, setAgencyF] = useState({name:"",gst:"",beneficiary:"",account:"",ifsc:"",upi:"",pan:"",panName:"",invoiceLink:""}); // agency-managed payout details
  const [agencyFile, setAgencyFile] = useState(null);
  const [agencyUploading, setAgencyUploading] = useState(false);
  const [nCamp, setNCamp] = useState(null);
  const [editingCampId, setEditingCampId] = useState(null);
  const [shipF, setShipF] = useState({track:"",carrier:"DTDC",orderId:""});
  const [payF, setPayF] = useState({type:"advance",amount:"",note:""});
  const [invF, setInvF] = useState("");
  const [linkF, setLinkF] = useState("");
  const [userF, setUserF] = useState({name:"",email:"",role:"negotiator"});
  const [editUser, setEditUser] = useState(null);
  const [nInf, setNInf] = useState({name:"",platform:"Instagram",handle:"",profile:"",followers:"",category:"Fashion & Lifestyle",city:"",phone:"",email:"",address:"",poc:"",avgRate:"",rating:"B+",notes:"",tags:"",bankHolder:"",bankAccount:"",bankIfsc:"",panNumber:"",upiId:"",defaultPaymentTerms:"next_15th"});

  // New state variables for enhanced functionality
  const [confirmAction, setConfirmAction] = useState(null); // {title,msg,onConfirm}
  const [deliveryF, setDeliveryF] = useState({date:"",note:""}); // for marking delivered
  const [reshipDelivF, setReshipDelivF] = useState({date:"",note:"",histIdx:null}); // for marking re-shipment delivered
  // Logistics: Pickup & Re-shipment
  const [pickupF, setPickupF] = useState({reason:"Product Change",note:""});
  const [reshipF, setReshipF] = useState({products:[],note:"",newAddress:""});
  const [reshipShipF, setReshipShipF] = useState({track:"",carrier:"DTDC",orderId:""});
  const [panF, setPanF] = useState({number:"",name:""}); // PAN details
  const [payReqNote, setPayReqNote] = useState(""); // payment request note
  const [contentF, setContentF] = useState({url:"",note:""}); // for marking content live
  const [formErrors, setFormErrors] = useState({}); // validation errors
  const [rejectReasonF, setRejectReasonF] = useState(""); // rejection reason modal
  const [dropReasonF, setDropReasonF] = useState(""); // drop collab reason modal
  const [deliverableLinkF, setDeliverableLinkF] = useState({}); // unique state per deliverable {delId: url}
  const [deliverableNoteF, setDeliverableNoteF] = useState({}); // negotiator's comment on submission {delId: note}
  const [attachmentMode, setAttachmentMode] = useState({}); // {delId: "link"|"attachment"}
  const [attachmentDesc, setAttachmentDesc] = useState({}); // {delId: description}
  const [revisionFeedback, setRevisionFeedback] = useState({}); // {delId: feedback text}

  // Performance Marketer state
  const [adTab, setAdTab] = useState("fresh"); // fresh | running | tested | expiring
  const [financeTab, setFinanceTab] = useState("pay"); // pay | schedule | tds | disputes
  const [batchSelected, setBatchSelected] = useState({}); // deal IDs selected for batch export
  const [batchMode, setBatchMode] = useState(false); // batch export mode toggle
  const [adFilter, setAdFilter] = useState({campaign:"",platform:"",search:""});
  const [editingAdNotes, setEditingAdNotes] = useState(null); // deal id being edited
  const [adNotesF, setAdNotesF] = useState({notes:"",link:""});

  // Product Catalog Management
  const [productCatalog, setProductCatalog] = useState([
    {id:'p1',name:'Essentials Snatched Bodysuit Bodyshaper',sizes:['S','M','L','XL','2XL','3XL'],colors:['Beige','Black']},
    {id:'p2',name:'Strapless Bodysuit Bodyshaper',sizes:['S','M','L','XL'],colors:['Beige','Black']},
    {id:'p3',name:'Essentials Mid Thigh Bodysuit Bodyshaper',sizes:['S','M','L','XL'],colors:['Beige','Black']},
    {id:'p4',name:'Essentials Cap Sleeves Playsuit Bodyshaper',sizes:['S','M','L','XL'],colors:['Beige','Black']},
    {id:'p5',name:'Intense Snatched Bodyshaper',sizes:['XS-S','M-L','XL-2XL','3XL-4XL','5XL-6XL','7XL-8XL'],colors:['Beige','Black','Brown','Red','Y2K Pink']},
    {id:'p6',name:'Intense Mid Thigh Bodyshaper',sizes:['XS-S','M-L','XL-2XL','3XL-4XL','5XL-6XL','7XL-8XL'],colors:['Beige','Black','Brown']},
    {id:'p7',name:'Full Sleeves Bare Bodysuit',sizes:['XS','S','M','L','XL','2XL','3XL'],colors:['Beige','Black','Brown']},
    {id:'p8',name:'Cap Sleeves Bare Bodysuit',sizes:['XS','S','M','L','XL','2XL','3XL'],colors:['Beige','Black','Brown']},
    {id:'p9',name:'Sleeveless Bare Bodysuit',sizes:['XS','S','M','L','XL','2XL','3XL'],colors:['Beige','Black','Brown']},
    {id:'p10',name:'Intense Strapless Bodyshaper',sizes:['S','M','L','XL'],colors:['Beige','Black']},
    {id:'p11',name:'Non Padded Wireless Shaping Bra',sizes:['XS','S','M','L','XL'],colors:['Beige','Black']},
    {id:'p12',name:'Everyday Seamless Lightly Padded Bra',sizes:['S','M','L','XL'],colors:['Pink','Rust']},
    {id:'p13',name:'No-Wire Push Up Bra',sizes:['S','M','L','XL'],colors:['Black','Blush','White']},
    {id:'p14',name:'Essentials Plus Bodysuit Bodyshaper',sizes:['S-M','L-XL','2XL-3XL','4XL-5XL'],colors:['Beige','Black','Cream'],cuts:['Brief Style','Mid Thigh']},
    {id:'p15',name:'Intense High Waisted Shaper Shorts',sizes:['XS','S','M','L','XL'],colors:['Beige','Black']},
    {id:'p16',name:'High Compression Tummy Tucker',sizes:['S','M','L','XL','2XL','3XL'],colors:['Brief Cut - High Rise','Mid Thigh - Mid Rise']},
    {id:'p17',name:'Zipper Shapewear Swimsuit',sizes:['S','M','L','XL','2XL','3XL'],colors:[]},
    {id:'p18',name:'Plunge Neck Shapewear Swimsuit',sizes:['XS','S','M','L','XL','2XL','3XL'],colors:[]},
  ]);
  const [showProductMgmt, setShowProductMgmt] = useState(false);
  const [newProduct, setNewProduct] = useState({name:'',sizes:'',colors:''});
  const [editingProduct, setEditingProduct] = useState(null); // product id being edited
  const [editVariant, setEditVariant] = useState({size:'',color:''}); // new variant inputs for editing

  // Google Drive resource management
  const [driveFiles, setDriveFiles] = useState({deliverables:{}, raw:[]}); // for the currently-open deal
  const [driveUploading, setDriveUploading] = useState({}); // {uploadKey: {progress: 0-100, name: string}}
  const [driveConnStatus, setDriveConnStatus] = useState(null); // {connected, email, connectedAt} or null while loading

  // Payment details collection & Invoice generation
  const [invoiceF, setInvoiceF] = useState({beneficiary:"",bank:"",account:"",ifsc:"",upi:"",pan:"",panName:"",address:"",phone:"",gstNumber:"",notes:"",amount:"",panNumber:""});
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [invoiceUploading, setInvoiceUploading] = useState(false);

  // Feature 1: Analytics & Reports
  const [analyticsData, setAnalyticsData] = useState(null);

  // Feature 2: Influencer Rating & Feedback
  const [ratingF, setRatingF] = useState({stars:{timeliness:0,quality:0,communication:0,professionalism:0},feedback:"",influencerId:null});

  // Feature 3: Bulk Operations
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [bulkSelectAll, setBulkSelectAll] = useState(false);

  // Feature 4: Search & Advanced Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterAmountMin, setFilterAmountMin] = useState("");
  const [filterAmountMax, setFilterAmountMax] = useState("");
  const [filterPlatform, setFilterPlatform] = useState("");
  const [filterStatus, setFilterStatus] = useState([]);
  const [filterNegotiator, setFilterNegotiator] = useState("");
  const [activeFilters, setActiveFilters] = useState([]);

  // Pagination & Date Filters
  const [auditDateFrom, setAuditDateFrom] = useState("");
  const [auditDateTo, setAuditDateTo] = useState("");
  const [auditPage, setAuditPage] = useState(0);
  const [dealsPage, setDealsPage] = useState(0);
  const ITEMS_PER_PAGE = 20;

  // Feature 5: Activity Feed / Notifications
  const [notificationPanel, setNotificationPanel] = useState(false);
  const [lastSeenTime, setLastSeenTime] = useState(new Date().toISOString());

  // Feature 6: Tax Support (GST/TDS)
  const [gstRate, setGstRate] = useState("0");
  const [tdsRate, setTdsRate] = useState("0");
  const [taxCalculation, setTaxCalculation] = useState(null);

  const notify = (msg,type="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null),2800); };

  // ── Load data from Supabase on mount ──
  useEffect(()=>{
    (async()=>{
      try {
        console.log("[AUTH-DEBUG] Loading data from Supabase...");
        const d = await loadFromSupabase();
        console.log("[AUTH-DEBUG] Data loaded — users:", d.users.length, "deals:", d.deals.length);
        setCampaigns(d.campaigns.filter(c=>!c.deleted));
        setDeletedCampaigns(d.campaigns.filter(c=>c.deleted));
        setDeals(d.deals.filter(x=>!x.deleted));
        setDeletedDeals(d.deals.filter(x=>x.deleted));
        setUsers(d.users.length>0?d.users:SEED_USERS);
        setInfluencers(d.influencers);
      } catch(e) {
        console.error("[AUTH-DEBUG] ❌ Supabase load FAILED:", e);
        setUsers(SEED_USERS);
      }
      setLoaded(true);
    })();
  },[]);

  // ── Real-time sync with Supabase ──
  useEffect(() => {
    if(!loaded) return;

    const channel = supabase.channel('collab-hq-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, async () => {
        const {data} = await supabase.from('deals').select('*').order('created_at', { ascending: false });
        if(data) {
          // Re-fetch deliverables, payments, shipments, audit logs for updated deals
          const [delRes, payRes, shipRes, logRes] = await Promise.all([
            supabase.from('deliverables').select('*'),
            supabase.from('payments').select('*'),
            supabase.from('shipments').select('*'),
            supabase.from('audit_log').select('*').order('created_at', { ascending: true }),
          ]);
          const delsByDeal={}, paysByDeal={}, shipByDeal={}, logsByDeal={};
          (delRes.data||[]).forEach(dl => {
            if(!delsByDeal[dl.deal_id]) delsByDeal[dl.deal_id]=[];
            delsByDeal[dl.deal_id].push({
              id:dl.id, type:dl.type, desc:dl.description, st:dl.status,
              link:dl.live_link||'',
              feedback:dl.feedback||'',
              submitNote:dl.submit_note||'',
              history:Array.isArray(dl.history)?dl.history:[],
            });
          });
          (payRes.data||[]).forEach(p => {
            if(!paysByDeal[p.deal_id]) paysByDeal[p.deal_id]=[];
            paysByDeal[p.deal_id].push({id:p.id,type:p.type,amount:p.amount,note:p.note||'',date:p.created_at?.slice(0,10)||''});
          });
          (shipRes.data||[]).forEach(s => {
            shipByDeal[s.deal_id]={track:s.tracking_id,carrier:s.carrier,st:s.status,dispAt:s.dispatched_at,dispBy:s.dispatched_by,delAt:s.delivered_at};
          });
          (logRes.data||[]).forEach(l => {
            if(!l.deal_id) return;
            if(!logsByDeal[l.deal_id]) logsByDeal[l.deal_id]=[];
            logsByDeal[l.deal_id].push({t:l.created_at,u:l.user_name,a:l.action,d:l.detail||''});
          });
          const deals = data.map(d => ({
            id:d.id, inf:d.influencer_name, platform:d.platform, followers:d.followers,
            product:d.product, amount:d.amount, status:d.status, cid:d.campaign_id,
            usage:d.usage_rights, deadline:d.deadline, profile:d.profile_link,
            phone:d.phone, address:d.address, by:d.created_by, at:d.created_at,
            appBy:d.approved_by, appAt:d.approved_at, ackAt:d.acknowledged_at, ackToken:d.acknowledge_token,
    adStatus:d.ad_status||null, usageDays:d.usage_days||null, usageEndDate:d.usage_end_date||null,
    adNotes:d.ad_notes||"", adPlatformLink:d.ad_platform_link||"",
    reuseRequested:d.reuse_requested||false, reuseRequestedAt:d.reuse_requested_at||null, reuseRequestedBy:d.reuse_requested_by||"",
            email:d.email||"", payment_terms:d.payment_terms||"", pan_number:d.pan_number||"", pan_name:d.pan_name||"",
            paymentDueDate:d.payment_due_date||null, tdsRate:d.tds_rate??10, tdsAmount:d.tds_amount||0,
            products:d.products||(d.products_json?JSON.parse(d.products_json):[])||[],
            paymentFormSent:d.payment_form_sent||false, paymentFormSentAt:d.payment_form_sent_at||null,
            payment_token:d.payment_token||null, paymentDetails:d.payment_details||null, paymentDetailsAt:d.payment_details_submitted_at||null,
    agencyManaged:d.agency_managed||false, agencyName:d.agency_name||"", agencyGst:d.agency_gst||"", agencyInvoiceUrl:d.agency_invoice_url||"",
            inv:d.invoice_amount!=null?{amount:d.invoice_amount,match:d.invoice_match,at:d.invoice_at,note:d.invoice_note,link:d.invoice_note}:null,
            shipHistory:d.ship_history||[],
            renegotiationNote:d.renegotiation_note||"",
            managerNote:d.manager_note||"",
            productOnHand:d.no_shipment||false,
            deleted:d.deleted||false,
            dels:delsByDeal[d.id]||[], pays:paysByDeal[d.id]||[],
            ship:shipByDeal[d.id]||null, logs:logsByDeal[d.id]||[],
          }));
          setDeals(deals.filter(x=>!x.deleted));
          setDeletedDeals(deals.filter(x=>x.deleted));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaigns' }, async () => {
        const {data} = await supabase.from('campaigns').select('*');
        if(data){
          const mapped = data.map(c => ({
            id:c.id, name:c.name, budget:c.budget, target:c.target_influencers,
            status:c.status, created:c.created_at?.slice(0,10)||'', deadline:c.deadline,
            brief:c.brief||"", deleted:c.deleted||false,
          }));
          setCampaigns(mapped.filter(c=>!c.deleted));
          setDeletedCampaigns(mapped.filter(c=>c.deleted));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, async () => {
        const {data} = await supabase.from('users').select('*');
        if(data) setUsers(data.map(u => ({
          id:u.id, name:u.name, email:u.email,
          role:u.role, status:u.status, avatar:u.avatar||u.name?.slice(0,2).toUpperCase(),
          created:u.created_at?.slice(0,10)||'', monthlyBudget:u.monthly_budget??50000,
        })));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'influencers' }, async () => {
        const {data} = await supabase.from('influencers').select('*');
        if(data) setInfluencers(data.map(i => ({
          id:i.id, name:i.name, platform:i.platform, handle:i.handle,
          profile:i.profile, followers:i.followers, category:i.category,
          city:i.city, phone:i.phone, email:i.email, address:i.address,
          poc:i.poc, avgRate:i.avg_rate, rating:i.rating, notes:i.notes,
          tags:i.tags||[], added:i.created_at?.slice(0,10)||'',
        })));
      })
      .subscribe((status) => {
        if(status === 'SUBSCRIBED') console.log('Realtime connected');
        if(status === 'CHANNEL_ERROR') console.error('Realtime connection error');
      });

    return () => { supabase.removeChannel(channel); };
  }, [loaded]);

  // ── Reset deals pagination when tab or filter changes ──
  useEffect(()=>{
    setDealsPage(0);
  },[tab,campFilter]);

  // Load Google Drive files whenever the detail modal opens for a different deal.
  // `loadDriveFiles` is referenced but not yet declared here — it's defined further down with useCallback.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{
    if(sel?.id) { loadDriveFiles(sel.id); }
    else setDriveFiles({deliverables:{}, raw:[]});
  },[sel?.id]);

  // Check Drive connection status when user logs in, and listen for OAuth callback postMessage.
  useEffect(()=>{
    if(!loggedIn) { setDriveConnStatus(null); return; }
    let alive = true;
    apiFetch('/api/drive/oauth/status').then(r=>r.json()).then(d=>{
      if(alive && d.ok) setDriveConnStatus({connected:!!d.connected, email:d.email, connectedAt:d.connectedAt});
    }).catch(()=>{});
    const onMsg = e => {
      if(e.data?.type==='drive_oauth_done') {
        apiFetch('/api/drive/oauth/status').then(r=>r.json()).then(d=>{
          if(d.ok) setDriveConnStatus({connected:!!d.connected, email:d.email, connectedAt:d.connectedAt});
        });
      }
    };
    window.addEventListener('message', onMsg);
    return () => { alive = false; window.removeEventListener('message', onMsg); };
  },[loggedIn]);

  const connectGoogleDrive = () => {
    // Open OAuth in a popup — the callback posts a message back and we refresh the status
    const w = 540, h = 680;
    const left = window.screenX + (window.outerWidth - w)/2;
    const top = window.screenY + (window.outerHeight - h)/2;
    window.open('/api/drive/oauth/start', 'drive_oauth', `width=${w},height=${h},left=${left},top=${top}`);
  };

  // ── Auth: sign in with Google ──
  // Supabase Auth handles the full OAuth redirect dance. We allow two Workspace
  // domains (invogue.shop + kreatikcommerce.com). Google's `hd` only supports a
  // single domain, so we drop it and let ALLOWED_DOMAINS + the users-table
  // membership check do the gating below.
  const handleGoogleLogin = async () => {
    setLoginErr("");
    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) {
        setLoginErr(error.message);
        setAuthBusy(false);
      }
      // success → browser navigates away; no further code runs
    } catch (e) {
      setLoginErr(e.message || 'Sign-in failed');
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    try { await supabase.auth.signOut(); } catch {}
    setLoggedIn(null);
    setView("dashboard");
    setLoginErr("");
  };

  // ── Auth: resolve Supabase session on mount + listen for changes ──
  // When a session exists, match the authenticated email against the `users`
  // table and set `loggedIn` to that row. Unknown/inactive emails get an error
  // and are signed out so they can't bypass via a stale session cookie.
  useEffect(() => {
    if (!loaded) return; // wait until users list has been fetched
    let cancelled = false;

    const resolveSession = async (session, source="unknown") => {
      if (cancelled) return;
      console.log(`[AUTH-DEBUG] resolveSession(${source}) — session:`, !!session, "email:", session?.user?.email, "users in memory:", users.length);
      if (!session?.user?.email) {
        console.log(`[AUTH-DEBUG] No session/email — showing login screen`);
        setLoggedIn(null);
        setAuthChecking(false);
        return;
      }
      const email = session.user.email.toLowerCase();
      const u = users.find(x => (x.email||'').toLowerCase() === email);
      console.log(`[AUTH-DEBUG] Looking up "${email}" in users table — found:`, !!u, u ? `(${u.name}, role=${u.role}, status=${u.status})` : "(no match)");
      if (!u) {
        console.error(`[AUTH-DEBUG] ❌ User not found! Users list:`, users.map(x=>x.email));
        setLoginErr(`${session.user.email} is not authorized. Contact your admin to request access.`);
        try { await supabase.auth.signOut(); } catch {}
        setLoggedIn(null);
        setAuthChecking(false);
        return;
      }
      if (u.status === 'inactive') {
        console.error(`[AUTH-DEBUG] ❌ User is inactive`);
        setLoginErr('This account has been deactivated. Contact your admin.');
        try { await supabase.auth.signOut(); } catch {}
        setLoggedIn(null);
        setAuthChecking(false);
        return;
      }
      console.log(`[AUTH-DEBUG] ✅ Login success — ${u.name} (${u.role})`);
      setLoggedIn(u);
      setLoginErr("");
      setAuthChecking(false);
      setAuthBusy(false);
    };

    (async () => {
      console.log("[AUTH-DEBUG] Checking existing session...");
      const { data, error } = await supabase.auth.getSession();
      console.log("[AUTH-DEBUG] getSession result — hasSession:", !!data?.session, "error:", error?.message||"none");
      await resolveSession(data?.session, "getSession");
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log(`[AUTH-DEBUG] onAuthStateChange event: ${_event}`);
      resolveSession(session, `onAuthStateChange(${_event})`);
    });

    return () => { cancelled = true; sub?.subscription?.unsubscribe?.(); };
  }, [loaded, users]);

  // ── Helpers ──
  const upDeal = useCallback((id,patch)=>{
    setDeals(ds=>ds.map(d=>d.id===id?{...d,...patch}:d));
  },[]);

  const addLog = useCallback((id,user,action,detail="")=>{
    const ts = new Date().toISOString();
    setDeals(ds=>ds.map(d=>d.id===id?{...d,logs:[...d.logs,{t:ts,u:user,a:action,d:detail}]}:d));
    supabase.from('audit_log').insert({deal_id:id,user_name:user,action,detail,created_at:ts}).then(({error})=>{if(error) console.error("Audit log insert failed:",error);});
  },[]);

  // ── Admin soft-delete (collabs & campaigns) — hidden from all budgets/analytics, restorable ──
  const deleteCollab = (d) => {
    if(role!=="admin") return;
    setConfirmAction({
      title:"Delete Collab",
      msg:`Remove ${d.inf}'s collab ${d.collabId||""} from all lists, budgets and analytics? It stays restorable from Admin → Deleted.`,
      onConfirm: () => {
        const ts=new Date().toISOString();
        supabase.from('deals').update({deleted:true}).eq('id',d.id).then(({error})=>{if(error){console.error("Delete collab failed:",error);notify("Failed to delete","err");}});
        supabase.from('audit_log').insert({deal_id:d.id,user_name:loggedIn?.name||"Admin",action:"Collab deleted",detail:"",created_at:ts}).then(()=>{});
        setDeals(prev=>prev.filter(x=>x.id!==d.id));
        setDeletedDeals(prev=>[{...d,deleted:true},...prev.filter(x=>x.id!==d.id)]);
        setConfirmAction(null); setModal(null); setSel(null);
        notify("Collab deleted");
      }
    });
  };
  const restoreCollab = (d) => {
    supabase.from('deals').update({deleted:false}).eq('id',d.id).then(({error})=>{if(error){console.error("Restore failed:",error);notify("Failed to restore","err");}});
    setDeletedDeals(prev=>prev.filter(x=>x.id!==d.id));
    setDeals(prev=>[{...d,deleted:false},...prev.filter(x=>x.id!==d.id)]);
    notify("Collab restored");
  };
  const deleteCampaignAdmin = (c) => {
    if(role!=="admin") return;
    const its = deals.filter(d=>d.cid===c.id);
    setConfirmAction({
      title:"Delete Campaign",
      msg:`Delete campaign "${c.name}"${its.length?` and its ${its.length} collab${its.length>1?"s":""}`:""}? Everything is removed from budgets and analytics, and stays restorable from Admin → Deleted.`,
      onConfirm: () => {
        supabase.from('campaigns').update({deleted:true}).eq('id',c.id).then(({error})=>{if(error)console.error("Delete campaign failed:",error);});
        if(its.length) supabase.from('deals').update({deleted:true}).eq('campaign_id',c.id).then(({error})=>{if(error)console.error("Cascade delete collabs failed:",error);});
        setCampaigns(prev=>prev.filter(x=>x.id!==c.id));
        setDeletedCampaigns(prev=>[{...c,deleted:true},...prev.filter(x=>x.id!==c.id)]);
        setDeals(prev=>prev.filter(d=>d.cid!==c.id));
        setDeletedDeals(prev=>[...its.map(d=>({...d,deleted:true})),...prev]);
        setConfirmAction(null);
        notify(`Campaign deleted${its.length?` with ${its.length} collab${its.length>1?"s":""}`:""}`);
      }
    });
  };
  const restoreCampaign = (c) => {
    supabase.from('campaigns').update({deleted:false}).eq('id',c.id).then(({error})=>{if(error)console.error("Restore campaign failed:",error);});
    const its = deletedDeals.filter(d=>d.cid===c.id);
    if(its.length) supabase.from('deals').update({deleted:false}).eq('campaign_id',c.id).then(({error})=>{if(error)console.error(error);});
    setDeletedCampaigns(prev=>prev.filter(x=>x.id!==c.id));
    setCampaigns(prev=>[...prev,{...c,deleted:false}]);
    if(its.length){ setDeletedDeals(prev=>prev.filter(d=>d.cid!==c.id)); setDeals(prev=>[...its.map(d=>({...d,deleted:false})),...prev]); }
    notify(its.length?`Campaign + ${its.length} collab${its.length>1?"s":""} restored`:"Campaign restored");
  };

  // ── Manager directive note (admin/manager) — shown prominently to the executive ──
  const saveManagerNote = (deal, text) => {
    const note = (text||"").trim();
    supabase.from('deals').update({manager_note:note||null}).eq('id',deal.id).then(({error})=>{if(error){console.error("Manager note save failed:",error);notify("Failed to save note","err");}});
    upDeal(deal.id,{managerNote:note});
    if(sel&&sel.id===deal.id) setSel(s=>s?{...s,managerNote:note}:s);
    addLog(deal.id, loggedIn?.name||"Manager", note?"Manager note updated":"Manager note cleared", note);
    setMgrNoteEdit(null);
    notify(note?"Manager note saved":"Manager note cleared");
  };

  // ── Skip shipment: influencer already has the product → bypass dispatch, unlock content ──
  const skipShipment = (deal) => {
    if(!(role==="negotiator"||role==="admin"||role==="logistics")) return;
    setConfirmAction({
      title:"Skip Shipment",
      msg:`Mark ${deal.inf} as already having the product? This bypasses dispatch and immediately unlocks content submission — no shipment will be created.`,
      onConfirm: () => {
        supabase.from('deals').update({status:'delivered_prod', no_shipment:true}).eq('id',deal.id).then(({error})=>{if(error){console.error("Skip shipment failed:",error);notify("Failed to skip shipment","err");}});
        upDeal(deal.id,{status:"delivered_prod", productOnHand:true});
        if(sel&&sel.id===deal.id) setSel(s=>s?{...s,status:"delivered_prod",productOnHand:true}:s);
        addLog(deal.id, loggedIn?.name||"You", "Shipment skipped — influencer already has the product", "");
        setConfirmAction(null);
        notify("Shipment skipped — content can now be submitted");
      }
    });
  };

  // ── Google Drive: resource management layer ──
  // Loads all files uploaded for a given deal, grouped as { deliverables: {[delId]: [rows]}, raw: [rows] }
  const loadDriveFiles = useCallback(async (dealId) => {
    if(!dealId) return;
    try {
      const resp = await apiFetch(`/api/drive/list?dealId=${encodeURIComponent(dealId)}`);
      const data = await resp.json();
      if(!resp.ok || !data.ok) { console.error("loadDriveFiles:", data.error); return; }
      setDriveFiles({deliverables: data.deliverables || {}, raw: data.raw || []});
    } catch(e) { console.error("loadDriveFiles failed:", e); }
  }, []);

  // Resumable upload directly to Google Drive, bypassing Vercel's body size limit.
  // Shows per-upload progress via XHR so the user sees something happening on big video files.
  const uploadDriveFile = useCallback(async ({deal, deliverable, isRaw, file}) => {
    if(!deal || !file) return null;
    const uploadKey = `${deal.id}:${deliverable?.id || 'raw'}:${Date.now()}`;
    const setProgress = pct => setDriveUploading(prev => ({...prev, [uploadKey]: {progress: pct, name: file.name}}));
    const clearProgress = () => setDriveUploading(prev => { const copy = {...prev}; delete copy[uploadKey]; return copy; });
    setProgress(0);
    try {
      const campaign = campaigns.find(c => c.id === deal.cid);
      const productLabel = deal.products ? deal.products.map(p=>p.name).join(", ") : (deal.product || "");
      const initResp = await apiFetch('/api/drive/create-upload-session', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          dealId: deal.id,
          collabId: deal.collabId,
          campaignName: campaign?.name || 'Unassigned Campaign',
          influencerName: deal.inf,
          productLabel,
          deliverableId: deliverable?.id || null,
          deliverableType: deliverable?.type || null,
          isRaw: !!isRaw,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
        }),
      });
      const initData = await initResp.json();
      if(!initResp.ok || !initData.ok) throw new Error(initData.error || 'Could not start upload');

      // PUT the file body directly to Google Drive's resumable URL
      const driveFileId = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', initData.uploadUrl, true);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.upload.onprogress = e => {
          if(e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if(xhr.status >= 200 && xhr.status < 300) {
            try {
              const body = JSON.parse(xhr.responseText);
              resolve(body.id);
            } catch(e) { reject(new Error('Upload succeeded but response was not JSON')); }
          } else reject(new Error(`Upload failed: HTTP ${xhr.status} — ${xhr.responseText?.slice(0,200)}`));
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(file);
      });

      // Persist the row to Supabase
      const finResp = await apiFetch('/api/drive/finalize-upload', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          dealId: deal.id,
          deliverableId: deliverable?.id || null,
          isRaw: !!isRaw,
          version: initData.version,
          driveFileId,
          driveFolderId: initData.parentFolderId,
          fileName: initData.finalFileName,
          originalName: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          uploadedBy: loggedIn?.name || 'Unknown',
        }),
      });
      const finData = await finResp.json();
      if(!finResp.ok || !finData.ok) throw new Error(finData.error || 'Could not save file record');

      notify(isRaw ? `Raw clip uploaded (${file.name})` : `Uploaded ${initData.finalFileName}`);
      clearProgress();
      await loadDriveFiles(deal.id);
      return finData.file;
    } catch(e) {
      console.error('uploadDriveFile error:', e);
      notify('Upload failed: ' + e.message, 'err');
      clearProgress();
      return null;
    }
  }, [campaigns, loggedIn, loadDriveFiles]);

  const totalPaid = d => (d.pays||[]).reduce((s,p)=>s+p.amount,0);
  const remaining = d => d.amount - totalPaid(d);
  // Payment eligibility: required deliverable types (Reels/Videos/etc.) must be live.
  // Stories are optional and don't block payment. If a deal is stories-only, all must be live.
  const STORY_RE = /story|stories/i;
  const isPaymentEligible = (deal) => {
    const dels = deal?.dels || [];
    if(dels.length===0) return false;
    const required = dels.filter(d=>!STORY_RE.test(d.type||""));
    const check = required.length>0 ? required : dels;
    return check.every(d=>d.st==="live");
  };
  const getCamp = id => campaigns.find(c=>c.id===id);
  const campCommitted = cid => deals.filter(d=>d.cid===cid&&!["rejected","pending","renegotiate","dropped"].includes(d.status)).reduce((s,d)=>s+d.amount,0);
  const campPaid = cid => deals.filter(d=>d.cid===cid).reduce((s,d)=>s+totalPaid(d),0);
  const campDeals = cid => deals.filter(d=>d.cid===cid);
  const campLocked = cid => deals.filter(d=>d.cid===cid&&!["rejected","pending","renegotiate","dropped"].includes(d.status)).length;
  const openCampDetail = c => { setSelCamp(c); setModal("campDetail"); };

  // ── Per-member monthly budget (cap defaults to ₹50k; counts a creator's locked, non-barter collabs in a calendar month) ──
  const monthOf = (dateStr) => (dateStr||"").slice(0,7);            // "YYYY-MM"
  const currentMonth = () => new Date().toISOString().slice(0,7);
  const BUDGET_EXCLUDE = ["rejected","pending","renegotiate","dropped","drop_requested"];
  const userMonthlyCap = (name) => { const u=users.find(x=>x.name===name); return (u && u.monthlyBudget!=null) ? Number(u.monthlyBudget) : 50000; };
  const userCommittedMonth = (name, mk, excludeId) => deals.filter(d=>d.by===name && monthOf(d.at)===mk && !BUDGET_EXCLUDE.includes(d.status) && d.id!==excludeId).reduce((s,d)=>s+(d.amount||0),0);

  const pendingDels = useMemo(()=>{
    const arr=[];
    deals.forEach(d=>{
      if(["rejected","pending","renegotiate","dropped"].includes(d.status)) return;
      (d.dels||[]).forEach(dl=>{
        if(dl.st!=="live") arr.push({...dl,dealId:d.id,inf:d.inf,platform:d.platform,deadline:d.deadline,cid:d.cid});
      });
    });
    return arr;
  },[deals]);

  const awaitingReview = useMemo(()=>pendingDels.filter(d=>d.st==="submitted"),[pendingDels]);
  const revisionNeeded = useMemo(()=>pendingDels.filter(d=>d.st==="revision_requested"),[pendingDels]);

  const pendingShip = useMemo(()=>deals.filter(d=>d.status==="acknowledged"&&!d.ship&&!d.productOnHand),[deals]);
  const awaitingAck = useMemo(()=>deals.filter(d=>d.status==="email_sent"),[deals]);
  const inTransit = useMemo(()=>deals.filter(d=>d.ship?.st==="in_transit"),[deals]);

  // Logistics: pickup requests, pending returns, re-shipment queues
  const pickupRequests = useMemo(()=>{
    const arr=[];
    deals.forEach(d=>{
      (d.shipHistory||[]).forEach((h,i)=>{
        if(h.type==="pickup"&&h.status==="pickup_requested") arr.push({...h,histIdx:i,dealId:d.id,inf:d.inf,product:d.product,products:d.products,address:d.address,phone:d.phone});
      });
    });
    return arr;
  },[deals]);
  const pickupsInTransit = useMemo(()=>{
    const arr=[];
    deals.forEach(d=>{
      (d.shipHistory||[]).forEach((h,i)=>{
        if(h.type==="pickup"&&h.status==="pickup_dispatched") arr.push({...h,histIdx:i,dealId:d.id,inf:d.inf,product:d.product,products:d.products});
      });
    });
    return arr;
  },[deals]);
  const reshipPending = useMemo(()=>{
    const arr=[];
    deals.forEach(d=>{
      (d.shipHistory||[]).forEach((h,i)=>{
        if(h.type==="reship"&&h.status==="reship_pending") arr.push({...h,histIdx:i,dealId:d.id,inf:d.inf,address:h.newAddress||d.address,phone:h.phone||d.phone});
      });
    });
    return arr;
  },[deals]);
  const reshipInTransit = useMemo(()=>{
    const arr=[];
    deals.forEach(d=>{
      (d.shipHistory||[]).forEach((h,i)=>{
        if(h.type==="reship"&&h.status==="re_dispatched") arr.push({...h,histIdx:i,dealId:d.id,inf:d.inf});
      });
    });
    return arr;
  },[deals]);

  const filtered = useMemo(()=>{
    let d = deals;
    if(campFilter) d = d.filter(x=>x.cid===campFilter);
    if(pocFilter) d = d.filter(x=>(influencers.find(i=>i.name===x.inf)?.poc||"")===pocFilter);
    if(tab==="pending") d = d.filter(x=>x.status==="pending"||x.status==="renegotiate");
    else if(tab==="active") d = d.filter(x=>["approved","email_sent","acknowledged","shipped","delivered_prod","partial_live","live"].includes(x.status));
    else if(tab==="review") d = d.filter(x=>(x.dels||[]).some(dl=>dl.st==="submitted"));
    else if(tab==="dispatch") d = d.filter(x=>x.status==="acknowledged"&&!x.ship&&!x.productOnHand);
    else if(tab==="transit") d = d.filter(x=>x.ship?.st==="shipped");
    else if(tab==="delivered") d = d.filter(x=>x.status==="delivered_prod"||x.ship?.st==="delivered");
    else if(tab==="live") d = d.filter(x=>["partial_live","live"].includes(x.status));
    else if(tab==="payment") d = d.filter(x=>["invoice_ok","disputed","partial_paid","paid"].includes(x.status));
    else if(tab==="rejected") d = d.filter(x=>x.status==="rejected");
    else if(tab==="dropped") d = d.filter(x=>["dropped","drop_requested"].includes(x.status));
    // Sort by created date
    const sorted = [...d].sort((a,b)=>{
      const ta = new Date(a.at||0).getTime(), tb = new Date(b.at||0).getTime();
      return sortOrder==="oldest" ? ta-tb : tb-ta;
    });
    return sorted;
  },[deals,tab,campFilter,pocFilter,influencers,sortOrder]);

  const stats = useMemo(()=>{
    const active = deals.filter(d=>!["rejected","pending","renegotiate","dropped"].includes(d.status));
    return {
      committed: active.reduce((s,d)=>s+d.amount,0),
      paid: deals.reduce((s,d)=>s+totalPaid(d),0),
      pipeline: deals.reduce((s,d)=>s+d.amount,0),
      pendingN: deals.filter(d=>d.status==="pending"||d.status==="renegotiate").length,
      disputed: deals.filter(d=>d.status==="disputed").length,
      dropped: deals.filter(d=>d.status==="dropped").length,
      pendingDels: pendingDels.length,
      pendingShip: pendingShip.length,
      awaitingReview: awaitingReview.length,
      revisionNeeded: revisionNeeded.length,
      pickupRequests: pickupRequests.length,
      pickupsInTransit: pickupsInTransit.length,
      reshipPending: reshipPending.length,
      reshipInTransit: reshipInTransit.length,
    };
  },[deals,pendingDels,pendingShip,awaitingReview,revisionNeeded,pickupRequests,pickupsInTransit,reshipPending,reshipInTransit]);

  // ── FEATURE 1: ANALYTICS HELPERS ──
  const generateAnalyticsData = () => {
    const monthlySpend = {};
    const campaignPerf = {};
    const influencerStats = {};
    const statusDist = {pending:0, manager_approved:0, approved:0, acknowledged:0, live:0, paid:0, rejected:0, dropped:0};

    deals.forEach(d => {
      const month = d.at?.slice(0,7) || "2026-01";
      monthlySpend[month] = (monthlySpend[month]||0) + d.amount;

      if(d.cid) {
        if(!campaignPerf[d.cid]) campaignPerf[d.cid] = {budget:getCamp(d.cid)?.budget||0, spent:0};
        campaignPerf[d.cid].spent += d.amount;
      }

      influencerStats[d.inf] = (influencerStats[d.inf]||0) + 1;

      if(d.status in statusDist) statusDist[d.status]++;
      else statusDist[d.status] = 1;
    });

    return { monthlySpend, campaignPerf, influencerStats, statusDist };
  };

  const getRecentNotifications = () => {
    const notifs = [];
    deals.forEach(d => {
      if(d.logs) {
        d.logs.forEach(log => {
          notifs.push({
            id: d.id + log.t,
            dealId: d.id,
            inf: d.inf,
            msg: log.a,
            detail: log.d,
            time: log.t,
            icon: getNotificationIcon(log.a)
          });
        });
      }
    });
    return notifs.sort((a,b) => new Date(b.time) - new Date(a.time)).slice(0,20);
  };

  const getNotificationIcon = (action) => {
    if(action.includes("created")) return "✨";
    if(action.includes("Approved")) return "✅";
    if(action.includes("Rejected")) return "❌";
    if(action.includes("paid")) return "💳";
    if(action.includes("live")) return "🟢";
    if(action.includes("Dispatched")) return "🚚";
    return "📝";
  };

  const performSearch = (query) => {
    if(!query.trim()) return null;
    const q = query.toLowerCase();

    const dealMatches = deals.filter(d =>
      d.inf?.toLowerCase().includes(q) ||
      d.product?.toLowerCase().includes(q) ||
      getCamp(d.cid)?.name?.toLowerCase().includes(q)
    ).slice(0,10);

    const infMatches = influencers.filter(i =>
      i.name?.toLowerCase().includes(q) ||
      i.handle?.toLowerCase().includes(q) ||
      i.category?.toLowerCase().includes(q)
    ).slice(0,10);

    const campMatches = campaigns.filter(c =>
      c.name?.toLowerCase().includes(q)
    ).slice(0,10);

    return { dealMatches, infMatches, campMatches };
  };

  const applyFilters = () => {
    let filtered = deals;
    const active = [];

    if(filterDateFrom) {
      filtered = filtered.filter(d => new Date(d.at) >= new Date(filterDateFrom));
      active.push(`From: ${filterDateFrom}`);
    }
    if(filterDateTo) {
      filtered = filtered.filter(d => new Date(d.at) <= new Date(filterDateTo));
      active.push(`To: ${filterDateTo}`);
    }
    if(filterAmountMin) {
      filtered = filtered.filter(d => d.amount >= +filterAmountMin);
      active.push(`Min: ${f(filterAmountMin)}`);
    }
    if(filterAmountMax) {
      filtered = filtered.filter(d => d.amount <= +filterAmountMax);
      active.push(`Max: ${f(filterAmountMax)}`);
    }
    if(filterPlatform) {
      filtered = filtered.filter(d => d.platform === filterPlatform);
      active.push(`Platform: ${filterPlatform}`);
    }
    if(filterStatus.length > 0) {
      filtered = filtered.filter(d => filterStatus.includes(d.status));
      active.push(`Status: ${filterStatus.join(", ")}`);
    }
    if(filterNegotiator) {
      filtered = filtered.filter(d => d.by === filterNegotiator);
      active.push(`Negotiator: ${filterNegotiator}`);
    }

    setActiveFilters(active);
    return filtered;
  };

  const clearFilter = (idx) => {
    const filters = [filterDateFrom, filterDateTo, filterAmountMin, filterAmountMax, filterPlatform, filterStatus, filterNegotiator];
    const filterSetters = [setFilterDateFrom, setFilterDateTo, setFilterAmountMin, setFilterAmountMax, setFilterPlatform, setFilterStatus, setFilterNegotiator];
    if(idx < filterSetters.length) filterSetters[idx]("");
  };

  const calculateTax = (amount) => {
    const base = +amount || 0;
    const gst = base * (parseFloat(gstRate) / 100);
    const tds = base * (parseFloat(tdsRate) / 100);
    return { base, gst, tds, netPayable: base + gst - tds };
  };

  // ── Payment Due Date Calculation ──
  const PAYMENT_TERMS_LABELS = {next_15th:"Next 15th after going live","45_days":"45 days after going live","60_days":"60 days after going live",advance:"Advance (before going live)",immediate:"Immediate (on going live)",custom:"Custom","Net 15 days":"Net 15 days","Net 30 days":"Net 30 days"};
  const ptLabel = (v)=>PAYMENT_TERMS_LABELS[v]||v||"—";
  const calcPaymentDueDate = (deal, liveDate) => {
    // Resolve terms: deal override → influencer default → global default
    const inf = influencers.find(x=>x.name===deal.inf);
    const terms = deal.payment_terms || inf?.defaultPaymentTerms || "next_15th";
    const live = liveDate ? new Date(liveDate) : new Date();
    if(terms==="advance") return null; // already due
    if(terms==="immediate") return live.toISOString().slice(0,10);
    if(terms==="45_days") { const d=new Date(live); d.setDate(d.getDate()+45); return d.toISOString().slice(0,10); }
    if(terms==="60_days") { const d=new Date(live); d.setDate(d.getDate()+60); return d.toISOString().slice(0,10); }
    if(terms==="next_15th") {
      const d=new Date(live); d.setMonth(d.getMonth()+1); d.setDate(15);
      return d.toISOString().slice(0,10);
    }
    return null; // custom — set manually
  };

  // ── TDS Calculation Helpers ──
  const getCurrentFY = () => {
    const now = new Date();
    const yr = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear()-1;
    return { start: `${yr}-04-01`, end: `${yr+1}-03-31`, label: `FY ${yr}-${(yr+1).toString().slice(2)}` };
  };
  const getFYTotalForInfluencer = (infName) => {
    const fy = getCurrentFY();
    return deals.filter(d=>d.inf===infName).reduce((sum,d)=>{
      return sum + (d.pays||[]).filter(p=>{
        const pd = p.date||"";
        return pd >= fy.start && pd <= fy.end;
      }).reduce((s,p)=>s+p.amount,0);
    },0);
  };
  const isTDSApplicable = (infName, additionalAmount) => {
    const fyTotal = getFYTotalForInfluencer(infName);
    return (fyTotal + (additionalAmount||0)) > 50000;
  };
  const calcTDSAmount = (amount, rate) => {
    return Math.round((+amount||0) * ((+rate||10)/100));
  };

  // ── Actions ──
  const createDeal = async () => {
    // Guard against double submission (e.g. a fast double-click creating two deals).
    // Ref is checked synchronously so two clicks in the same tick can't both pass.
    if(submittingDealRef.current) return;
    // Validation
    setFormErrors({});
    const errors = {};

    if(!nDeal.inf) errors.inf = "Influencer name is required";
    if(!nDeal.profile) errors.profile = "Influencer profile is mandatory";
    const hasProduct = (nDeal.products && nDeal.products.some(p=>p.name)) || nDeal.product;
    if(!nDeal.amount) errors.amount = "Amount is required";
    if(!nDeal.deadline) errors.deadline = "Content deadline is required";
    if(!hasProduct) errors.products = "At least one product is required";
    if(!nDeal.email) errors.email = "Email is required";
    if(nDeal.dels.length===0) errors.dels = "Add at least one deliverable";

    // Check deliverables have descriptions
    if(nDeal.dels.some(d=>!d.desc)) errors.dels = "All deliverables must have descriptions";

    // Validate email, phone, and URL formats
    if(nDeal.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nDeal.email)) errors.email = "Invalid email format";
    if(nDeal.phone && !validPhone(nDeal.phone)) errors.phone = "Phone must be 10 digits";
    if(nDeal.profile && !validUrl(nDeal.profile)) errors.profile = "Invalid profile URL";

    // Validate address fields
    if(!nDeal.address?.street) errors.address = "Street address is required";
    if(!nDeal.address?.city) errors.city = "City is required";
    if(!nDeal.address?.pincode) errors.pincode = "Pincode is required";
    if(nDeal.address?.pincode && !/^\d{6}$/.test(nDeal.address.pincode)) errors.pincode = "Pincode must be 6 digits";

    if(Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return notify("Please fix: "+Object.values(errors).join(" · "),"err");
    }

    // Validation passed — lock submission until this attempt finishes.
    submittingDealRef.current = true;
    setSubmittingDeal(true);

    const dealId = uid();
    const collabId = genCollabId();
    const ts = new Date().toISOString();
    const userName = loggedIn?.name||"You";

    // Build product string from products array
    const productStr = nDeal.products?.filter(p=>p.name).map(p=>p.name).join(", ") || nDeal.product;

    try {
    const {error:dealErr} = await supabase.from('deals').insert({
      id:dealId,
      collab_id:collabId,
      influencer_name:nDeal.inf,
      platform:nDeal.platform,
      followers:nDeal.followers,
      product:productStr,
      amount:+nDeal.amount,
      status:'pending',
      campaign_id:nDeal.cid||null,
      usage_rights:nDeal.usage,
      deadline:nDeal.deadline,
      profile_link:nDeal.profile,
      phone:nDeal.phone,
      address: typeof nDeal.address === 'object' ? [nDeal.address.street, nDeal.address.city, nDeal.address.state, nDeal.address.pincode].filter(Boolean).join(', ') : (nDeal.address || ''),
      created_by:userName,
      created_at:ts,
      payment_terms:nDeal.paymentTerms||"Net 15 days",
      email:nDeal.email,
      products_json:JSON.stringify(nDeal.products||[]),
    });
    if(dealErr) { console.error("Deal insert failed:",dealErr); return notify("Failed to save deal: "+dealErr.message,"err"); }

    const dbDels = nDeal.dels.map(dl=>({id:uid(),deal_id:dealId,type:dl.type,description:dl.desc,status:'pending',live_link:null}));
    if(dbDels.length>0) {
      const {error:delErr} = await supabase.from('deliverables').insert(dbDels);
      if(delErr) console.error("Deliverables insert failed:",delErr);
    }

    // Auto-create influencer if not exists
    const existingInf = influencers.find(i=>i.name===nDeal.inf);
    if(!existingInf) {
      const infId = uid();
      const infData = {
        id:infId,
        name:nDeal.inf,
        platform:nDeal.platform,
        handle:nDeal.handle||"",
        profile:nDeal.profile,
        followers:nDeal.followers,
        category:"",
        city:"",
        phone:nDeal.phone||"",
        email:nDeal.email||"",
        address: typeof nDeal.address === 'object' ? [nDeal.address.street, nDeal.address.city, nDeal.address.state, nDeal.address.pincode].filter(Boolean).join(', ') : (nDeal.address || ''),
        poc:userName,
        avg_rate:nDeal.amount,
        rating:"A",
        notes:"Auto-created from deal",
        tags:[],
        created_at:ts
      };
      const {error:infErr} = await supabase.from('influencers').insert(infData);
      if(infErr) console.error("Influencer insert failed:",infErr);
      else setInfluencers(prev=>[{...infData,added:ts.slice(0,10)},...prev]);
    }

    const {error:auditErr} = await supabase.from('audit_log').insert({
      deal_id:dealId,
      user_name:userName,
      action:'Deal created',
      detail:`${f(nDeal.amount)} | ${nDeal.dels.length} deliverables`,
      created_at:ts
    });
    if(auditErr) console.error("Audit log insert failed:",auditErr);

    const d = {
      ...nDeal,
      id:dealId,
      collabId,
      amount:+nDeal.amount,
      status:"pending",
      by:userName,
      at:ts,
      pays:[],
      ship:null,
      inv:null,
      dels:dbDels.map(dl=>({id:dl.id,type:dl.type,desc:dl.description,st:'pending',link:''})),
      logs:[{t:ts,u:userName,a:"Deal created",d:`${f(nDeal.amount)} | ${nDeal.dels.length} deliverables`}]
    };

    setDeals(prev=>[d,...prev]);
    setModal(null);
    setNDeal(null);
    setFormErrors({});
    notify("Deal submitted for approval!");
    } catch(e) { console.error("Deal creation error:",e); notify("Error saving deal. Please try again.","err"); }
    finally { submittingDealRef.current = false; setSubmittingDeal(false); }
  };

  // ─── EDIT A DEAL (only before manager approval) ───
  const EDITABLE_STATUSES = ["pending","renegotiate","manager_approved","approved","email_sent"];
  const openEditDeal = (deal) => {
    if(!(role==="negotiator"||role==="admin")) return notify("Only the negotiator or admin can edit a deal","err");
    if(!EDITABLE_STATUSES.includes(deal.status) || deal.ackAt) return notify("Deals can only be edited before the influencer confirms","err");
    const addr = deal.address;
    const parts = typeof addr==='string' ? addr.split(', ') : [];
    setNDeal({
      inf:deal.inf, email:deal.email||"", platform:deal.platform, followers:deal.followers||"",
      products:(deal.products&&deal.products.length?deal.products:[{name:deal.product||"",color:"",size:"",qty:"1"}]),
      usage:deal.usage||"6 months", deadline:toDateOnly(deal.deadline), profile:deal.profile||"",
      phone:deal.phone||"", amount:String(deal.amount||""),
      address: (typeof addr==='object'&&addr) ? addr : {street:parts[0]||(typeof addr==='string'?addr:"")||"", city:parts[1]||"", state:parts[2]||"", pincode:parts[3]||""},
      paymentTerms:deal.paymentTerms||"Net 15 days",
      cid:deal.cid||campaigns[0]?.id||"",
      dels:(deal.dels||[]).map(dl=>({id:dl.id||uid(),type:dl.type,desc:dl.desc,st:dl.st||'pending',link:dl.link||""})),
    });
    setEditingDealId(deal.id);
    setFormErrors({});
    setModal("newDeal");
  };

  const saveDealEdits = async () => {
    if(submittingDealRef.current) return;
    setFormErrors({});
    const errors = {};
    if(!nDeal.inf) errors.inf = "Influencer name is required";
    if(!nDeal.profile) errors.profile = "Influencer profile is mandatory";
    const hasProduct = (nDeal.products && nDeal.products.some(p=>p.name)) || nDeal.product;
    if(!nDeal.amount) errors.amount = "Amount is required";
    if(!nDeal.deadline) errors.deadline = "Content deadline is required";
    if(!hasProduct) errors.products = "At least one product is required";
    if(!nDeal.email) errors.email = "Email is required";
    if(!nDeal.dels||nDeal.dels.length===0) errors.dels = "Add at least one deliverable";
    if((nDeal.dels||[]).some(d=>!d.desc)) errors.dels = "All deliverables must have descriptions";
    if(nDeal.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nDeal.email)) errors.email = "Invalid email format";
    if(nDeal.phone && !validPhone(nDeal.phone)) errors.phone = "Phone must be 10 digits";
    if(nDeal.profile && !validUrl(nDeal.profile)) errors.profile = "Invalid profile URL";
    if(Object.keys(errors).length > 0) { setFormErrors(errors); return notify("Please fix: "+Object.values(errors).join(" · "),"err"); }

    submittingDealRef.current = true; setSubmittingDeal(true);
    try {
      const ts = new Date().toISOString();
      const userName = loggedIn?.name||"You";
      const productStr = nDeal.products?.filter(p=>p.name).map(p=>p.name).join(", ") || nDeal.product;
      const addressStr = typeof nDeal.address === 'object' ? [nDeal.address.street, nDeal.address.city, nDeal.address.state, nDeal.address.pincode].filter(Boolean).join(', ') : (nDeal.address || '');

      // If the deal was already approved (or the email had gone out), editing it
      // invalidates that approval — revert to pending so a manager must re-approve.
      const priorStatus = deals.find(d=>d.id===editingDealId)?.status;
      const needsReapproval = ["manager_approved","approved","email_sent"].includes(priorStatus);
      const statusReset = needsReapproval ? { status:'pending', approved_by:null, approved_at:null, email_sent_at:null, acknowledge_token:null } : {};

      const {error:updErr} = await supabase.from('deals').update({
        influencer_name:nDeal.inf, platform:nDeal.platform, followers:nDeal.followers,
        product:productStr, amount:+nDeal.amount, campaign_id:nDeal.cid||null,
        usage_rights:nDeal.usage, deadline:nDeal.deadline, profile_link:nDeal.profile,
        phone:nDeal.phone, address:addressStr, email:nDeal.email,
        products_json:JSON.stringify(nDeal.products||[]), payment_terms:nDeal.paymentTerms||"Net 15 days",
        ...statusReset,
      }).eq('id',editingDealId);
      if(updErr){ console.error("Deal update failed:",updErr); return notify("Failed to update deal: "+updErr.message,"err"); }

      // Diff deliverables: update existing, insert new, delete removed
      const existing = (deals.find(d=>d.id===editingDealId)?.dels)||[];
      const keptIds = (nDeal.dels||[]).map(d=>d.id).filter(Boolean);
      const removed = existing.filter(d=>!keptIds.includes(d.id)).map(d=>d.id);
      if(removed.length) { const {error}=await supabase.from('deliverables').delete().in('id',removed); if(error) console.error("Deliverable delete failed:",error); }
      const newDels = [];
      for(const dl of (nDeal.dels||[])){
        const id = dl.id || uid();
        if(existing.find(e=>e.id===dl.id)){
          await supabase.from('deliverables').update({type:dl.type,description:dl.desc}).eq('id',id);
        } else {
          await supabase.from('deliverables').insert({id,deal_id:editingDealId,type:dl.type,description:dl.desc,status:'pending',live_link:null});
        }
        newDels.push({id,type:dl.type,desc:dl.desc,st:dl.st||'pending',link:dl.link||""});
      }

      await supabase.from('audit_log').insert({deal_id:editingDealId,user_name:userName,action:needsReapproval?'Deal edited — reverted to pending for manager re-approval':'Deal edited',detail:`${f(nDeal.amount)} | ${newDels.length} deliverables`,created_at:ts});

      const patch = {inf:nDeal.inf,email:nDeal.email,platform:nDeal.platform,followers:nDeal.followers,products:nDeal.products,product:productStr,amount:+nDeal.amount,cid:nDeal.cid,usage:nDeal.usage,deadline:nDeal.deadline,profile:nDeal.profile,phone:nDeal.phone,address:addressStr,paymentTerms:nDeal.paymentTerms,dels:newDels,...(needsReapproval?{status:'pending',appBy:null,appAt:null,ackToken:null}:{})};
      setDeals(prev=>prev.map(d=>d.id===editingDealId?{...d,...patch}:d));
      setSel(prev=>prev&&prev.id===editingDealId?{...prev,...patch}:prev);
      setModal(null); setNDeal(null); setEditingDealId(null); setFormErrors({});
      notify(needsReapproval?"Deal updated — sent back for manager re-approval.":"Deal updated!");
    } catch(e){ console.error("Deal edit error:",e); notify("Error updating deal. Please try again.","err"); }
    finally { submittingDealRef.current = false; setSubmittingDeal(false); }
  };

  const openEditCampaign = (c) => {
    if(!(role==="admin"||role==="approver"||role==="finance")) return notify("Only admin / manager / finance can edit campaigns","err");
    setNCamp({name:c.name, budget:c.budget!=null?String(c.budget):"", target:String(c.target||""), deadline:c.deadline||"", brief:c.brief||"", status:c.status||"active"});
    setEditingCampId(c.id);
    setModal("newCamp");
  };

  const createCampaign = async () => {
    if(!nCamp.name||!nCamp.target) return notify("Campaign name and target are required","err");
    if(+nCamp.budget < 0) return notify("Budget can't be negative","err");  // 0 = no campaign cap (budgets are per-member)
    if(+nCamp.target <= 0 || !Number.isInteger(+nCamp.target)) return notify("Target must be a positive whole number","err");

    // ── EDIT existing campaign ──
    if(editingCampId){
      const patch = {name:nCamp.name, budget:+nCamp.budget, target_influencers:+nCamp.target, status:nCamp.status||"active", deadline:nCamp.deadline||null, brief:nCamp.brief||null};
      const {error} = await supabase.from('campaigns').update(patch).eq('id',editingCampId);
      if(error){ console.error("Campaign update failed:",error); return notify("Failed to update campaign: "+error.message,"err"); }
      setCampaigns(prev=>prev.map(c=>c.id===editingCampId?{...c,name:nCamp.name,budget:+nCamp.budget,target:+nCamp.target,status:nCamp.status||"active",deadline:nCamp.deadline,brief:nCamp.brief}:c));
      if(selCamp&&selCamp.id===editingCampId) setSelCamp(c=>c?{...c,name:nCamp.name,budget:+nCamp.budget,target:+nCamp.target,status:nCamp.status||"active",deadline:nCamp.deadline,brief:nCamp.brief}:c);
      setModal(null); setNCamp(null); setEditingCampId(null);
      return notify("Campaign updated!");
    }

    const campId = uid();
    try {
      const {error:campErr} = await supabase.from('campaigns').insert({
        id:campId,
        name:nCamp.name,
        budget:+nCamp.budget,
        target_influencers:+nCamp.target,
        status:'active',
        deadline:nCamp.deadline||null,
        brief:nCamp.brief||null
      });
      if(campErr) {
        console.error("Campaign insert failed:",campErr);
        return notify("Failed to create campaign: "+campErr.message,"err");
      }
    } catch(e) {
      console.error("Campaign creation error:",e);
      return notify("Error creating campaign. Please try again.","err");
    }
    setCampaigns(prev=>[...prev,{
      id:campId,
      name:nCamp.name,
      budget:+nCamp.budget,
      target:+nCamp.target,
      status:"active",
      created:new Date().toISOString().slice(0,10),
      deadline:nCamp.deadline,
      brief:nCamp.brief
    }]);
    setModal(null);
    setNCamp(null);
    notify("Campaign created!");
  };

  const approveDeal = d => {
    if(role!=="approver"&&role!=="admin") return notify("Only Manager or Admin can approve deals","err");
    if(d.by === loggedIn?.name) {
      return notify("You cannot approve your own deal — a different manager must approve","err");
    }
    const userName = loggedIn?.name||"You (Manager)";
    const ts = new Date().toISOString();

    // Budget check 1 — campaign hard cap
    const camp = getCamp(d.cid);
    const committed = campCommitted(d.cid);
    if(camp && camp.budget>0 && (committed + d.amount) > camp.budget) {
      return notify(`Campaign budget exceeded — ${camp.name} budget is ${f(camp.budget)}, already committed ${f(committed)}, this collab would add ${fAmt(d.amount)} (total ${f(committed + d.amount)})`,"err");
    }

    // Budget check 2 — creator's monthly personal cap (barter collabs don't count)
    if(d.amount>0){
      const owner = d.by;
      const mk = monthOf(d.at) || currentMonth();
      const cap = userMonthlyCap(owner);
      const usedM = userCommittedMonth(owner, mk, d.id);
      if((usedM + d.amount) > cap){
        return notify(`${owner}'s monthly budget exceeded — ${mk} cap is ${f(cap)}, already committed ${f(usedM)}; this collab adds ${fAmt(d.amount)} (total ${f(usedM + d.amount)}). Raise their cap in Team & Users or reduce the amount.`,"err");
      }
    }

    // Dual approval: deals > ₹50K need both manager AND admin approval
    const needsDualApproval = d.amount > 50000;
    if(needsDualApproval && role === "approver" && d.status !== "manager_approved") {
      // Manager is first approver — move to intermediate state
      supabase.from('deals').update({status:'manager_approved',approved_by:userName,approved_at:ts}).eq('id',d.id).then(({error})=>{if(error){console.error("Manager approve save failed:",error);notify("Couldn't save approval: "+(error.message||"unknown error"),"err");}});
      upDeal(d.id,{status:"manager_approved",appBy:userName,appAt:ts});
      addLog(d.id,userName,"Manager approved — awaiting admin approval (₹50K+ dual approval)",fAmt(d.amount));
      setSel(null);
      setModal(null);
      notify("Manager approved! Awaiting admin approval for "+fAmt(d.amount));
      return;
    }

    // Admin final approval (or single approval for ≤₹50K)
    supabase.from('deals').update({status:'approved',approved_by:userName,approved_at:ts}).eq('id',d.id).then(({error})=>{if(error){console.error("Approve save failed:",error);notify("Couldn't save approval: "+(error.message||"unknown error"),"err");}});
    upDeal(d.id,{status:"approved",appBy:userName,appAt:ts});
    addLog(d.id,userName,needsDualApproval?"Admin approved (dual approval complete) & amount locked":"Approved & amount locked",fAmt(d.amount));
    setSel(null);
    setModal(null);
    notify("Approved! "+fAmt(d.amount)+" locked");
  };

  const rejectDeal = (d, reason) => {
    if(role!=="approver"&&role!=="admin") return notify("Only Manager or Admin can reject deals","err");
    if(!reason || !reason.trim()) return notify("Rejection reason is mandatory","err");
    const userName = loggedIn?.name||"You (Manager)";
    const ts = new Date().toISOString();
    supabase.from('deals').update({status:'rejected',approved_by:userName,approved_at:ts,rejection_reason:reason}).eq('id',d.id).then(({error})=>{if(error) console.error("Reject save failed:",error);});
    upDeal(d.id,{status:"rejected",appBy:userName,appAt:ts,rejectionReason:reason});
    addLog(d.id,userName,"Rejected",`Reason: ${reason}`);
    setSel(null);
    setModal(null);
    setRejectReasonF("");
    notify("Rejected","err");
  };

  // Confirmation wrappers
  const confirmAndApprove = d => {
    setConfirmAction({
      title:"Approve Deal",
      msg:`Approve and lock ${fAmt(d.amount)} for ${d.inf}?`,
      onConfirm:()=>{approveDeal(d);setConfirmAction(null);}
    });
  };

  const openRejectModal = d => {
    setSel(d);
    setModal("reject");
    setRejectReasonF("");
  };

  const confirmAndSendEmail = d => {
    setConfirmAction({
      title:"Send Confirmation Email",
      msg:`Send confirmation email for deal with ${d.inf}?`,
      onConfirm:()=>{sendEmail(d);setConfirmAction(null);}
    });
  };

  const confirmAndResendEmail = d => {
    setResendF({dealId:d.id, email:d.email||""});
    setSel(d);
    setModal("resendEmail");
  };

  const submitResend = () => {
    if(!sel) return;
    const email = (resendF.email||"").trim();
    if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return notify("Enter a valid email address","err");
    sendEmail(sel, true, email);
  };

  const [renegF, setRenegF] = useState(null); // {amount,note,dels} for renegotiation
  const [resubmitF, setResubmitF] = useState(null); // negotiator accepting/revising a renegotiation

  const renegDeal = d => {
    // Open renegotiation modal pre-filled with current deal data
    setRenegF({ dealId:d.id, amount:String(d.amount), note:"", cid:d.cid, products:(d.products&&d.products.length?d.products.map(p=>({...p})):[{name:d.product||"",color:"",size:"",qty:"1"}]), dels:d.dels.map(dl=>({...dl,keep:true})) });
    setSel(d);
    setModal("renegotiate");
  };

  const openResubmitModal = d => {
    // Negotiator opens the resubmit modal to acknowledge manager's renegotiation note and send back with (optionally) revised terms
    setResubmitF({ dealId:d.id, amount:String(d.amount), response:"", dels:d.dels.map(dl=>({...dl,keep:true})) });
    setSel(d);
    setModal("resubmitReneg");
  };

  const submitResubmit = async () => {
    if(!resubmitF) return;
    const keptDels = resubmitF.dels.filter(d=>d.keep!==false);
    if(keptDels.length===0) return notify("Keep at least one deliverable","err");
    if(!resubmitF.response.trim()) return notify("Add a response note for the manager","err");
    if(resubmitF.amount===""||resubmitF.amount==null||+resubmitF.amount < 0||isNaN(+resubmitF.amount)) return notify("Enter a valid amount (use 0 for a barter / product-only collab)","err");
    // Prevent amount inflation — resubmitted amount cannot exceed original
    const originalDeal = deals.find(d=>d.id===resubmitF.dealId);
    if(originalDeal && +resubmitF.amount > originalDeal.amount) {
      return notify(`Resubmitted amount (${fAmt(resubmitF.amount)}) cannot exceed the original deal amount (${fAmt(originalDeal.amount)})`,"err");
    }

    const newDels = keptDels.map(({keep,isNew,...rest})=>rest);
    const userName = loggedIn?.name||"You (Negotiator)";

    const {error:updErr} = await supabase.from('deals').update({
      status:'pending',
      amount:+resubmitF.amount
    }).eq('id',resubmitF.dealId);
    if(updErr) { console.error("Resubmit save failed:",updErr); return notify("Failed to resubmit: "+updErr.message,"err"); }

    // Insert any brand-new deliverables
    const brandNewDels = keptDels.filter(d=>d.isNew);
    if(brandNewDels.length > 0) {
      const dbNew = brandNewDels.map(dl=>({id:dl.id,deal_id:resubmitF.dealId,type:dl.type,description:dl.desc,status:'pending',live_link:null}));
      const {error:newDelErr} = await supabase.from('deliverables').insert(dbNew);
      if(newDelErr) console.error("New deliverables insert failed:",newDelErr);
    }

    // Remove any deliverables the negotiator unchecked
    const keptIds = newDels.map(d=>d.id);
    const currentDeal = deals.find(d=>d.id===resubmitF.dealId);
    const removedIds = (currentDeal?.dels||[]).map(d=>d.id).filter(id=>!keptIds.includes(id));
    if(removedIds.length>0) await supabase.from('deliverables').delete().in('id',removedIds);

    upDeal(resubmitF.dealId,{status:"pending",amount:+resubmitF.amount,dels:newDels});
    addLog(resubmitF.dealId, userName, "Resubmitted after renegotiation", `Amount: ${fAmt(resubmitF.amount)} | ${newDels.length} deliverables | Response: ${resubmitF.response}`);
    setSel(null);
    setModal(null);
    setResubmitF(null);
    notify("Resubmitted to manager for approval","ok");
  };

  const submitReneg = async () => {
    if(!renegF) return;
    const keptDels = renegF.dels.filter(d=>d.keep!==false);
    if(keptDels.length===0) return notify("Keep at least one deliverable","err");
    if(!renegF.note) return notify("Add a note explaining changes","err");

    const newDels = keptDels.map(({keep,isNew,...rest})=>rest);
    const rnProducts = (renegF.products||[]).filter(p=>p.name&&p.name.trim());
    const rnProductStr = rnProducts.map(p=>p.name.trim()).join(", ");

    supabase.from('deals').update({status:'renegotiate',amount:+renegF.amount,renegotiation_note:renegF.note,campaign_id:renegF.cid||null,product:rnProductStr,products_json:JSON.stringify(rnProducts)}).eq('id',renegF.dealId).then(({error})=>{if(error) console.error("Renegotiate save failed:",error);});

    // Insert new deliverables to Supabase
    const brandNewDels = keptDels.filter(d=>d.isNew);
    if(brandNewDels.length > 0) {
      const dbNew = brandNewDels.map(dl=>({id:dl.id,deal_id:renegF.dealId,type:dl.type,description:dl.desc,status:'pending',live_link:null}));
      const {error:newDelErr} = await supabase.from('deliverables').insert(dbNew);
      if(newDelErr) console.error("New deliverables insert failed:",newDelErr);
    }

    // Replace deliverables: delete removed ones
    const keptIds = newDels.map(d=>d.id);
    const currentDeal = deals.find(d=>d.id===renegF.dealId);
    const removedIds = (currentDeal?.dels||[]).map(d=>d.id).filter(id=>!keptIds.includes(id));
    if(removedIds.length>0) supabase.from('deliverables').delete().in('id',removedIds).then(({error})=>{if(error) console.error("Deliverables delete failed:",error);});

    upDeal(renegF.dealId,{status:"renegotiate",amount:+renegF.amount,dels:newDels,cid:renegF.cid,products:rnProducts,product:rnProductStr});
    addLog(renegF.dealId, loggedIn?.name||"Manager", "Sent back for renegotiation", `New amount: ${fAmt(renegF.amount)} | ${rnProductStr||"—"} | ${newDels.length} deliverables | Note: ${renegF.note}`);
    setSel(null);
    setModal(null);
    setRenegF(null);
    notify("Sent back with revised terms","warn");
  };

  const buildConfirmationEmailHTML = (d, ackToken) => {
    const productList = d.products && d.products.length > 0
      ? d.products.map(p=>`${p.name}${[p.color,p.cut,p.size].filter(Boolean).length?` (${[p.color,p.cut,p.size].filter(Boolean).join(", ")})`:""}${p.qty>1?` × ${p.qty}`:""}`).join(", ")
      : (d.product||"—");
    // Deliverables the influencer is expected to provide
    const dels = Array.isArray(d.dels) ? d.dels : [];
    const deliverablesRows = dels.length > 0
      ? dels.map(dl=>`<tr><td style="padding:9px 0;font-size:13px;font-weight:700;color:#770A1C;width:150px;border-bottom:1px solid #f1ece3;vertical-align:top;">${dl.type||"Deliverable"}</td><td style="padding:9px 0;font-size:14px;color:#444;border-bottom:1px solid #f1ece3;">${dl.desc||"—"}</td></tr>`).join("")
      : `<tr><td style="padding:9px 0;font-size:14px;color:#444;" colspan="2">As discussed with your POC.</td></tr>`;
    // Hosted logo URL — GitHub raw URL is always available and works in every email client
    const LOGO_URL = process.env.NEXT_PUBLIC_EMAIL_LOGO_URL || "https://raw.githubusercontent.com/invogueai/invogue-collab-hq/main/public/invogue-logo.png";
    // Try to find the POC assigned to this influencer (from the influencers table)
    const infRecord = influencers.find(x=>x.name===d.inf);
    const pocName = infRecord?.poc || "your collab manager";
    // Resolve payment terms to a friendly, explicit label (default: Next 15th after going live)
    const ptRaw = d.paymentTerms || d.payment_terms || infRecord?.defaultPaymentTerms || "next_15th";
    const PT_LABELS = {next_15th:"Next 15th after going live","45_days":"45 days after going live","60_days":"60 days after going live",advance:"Advance (before going live)",immediate:"Immediate (on going live)",custom:"As agreed"};
    const paymentTermsLabel = PT_LABELS[ptRaw] || (/15/.test(String(ptRaw)) ? "Next 15th after going live" : ptRaw);
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Collaboration Confirmation</title></head>
<body style="margin:0;padding:0;background:#F6F4F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1A1A;">
<div style="max-width:620px;margin:0 auto;background:#fff;">
  <div style="background:#770A1C;padding:32px 32px;text-align:center;">
    <img src="${LOGO_URL}" alt="Invogue" style="max-height:48px;max-width:220px;display:inline-block;margin-bottom:10px;" />
    <div style="color:#fff;font-size:18px;font-weight:600;margin-top:4px;">Collaboration Confirmation</div>
  </div>
  <div style="padding:32px;">
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hi <b>${d.inf}</b>,</p>
    <p style="font-size:14px;line-height:1.65;color:#444;margin:0 0 18px;">Thank you for partnering with <b>Invogue</b>! We're thrilled to have you on board for this collaboration. Below are the confirmed details of our partnership:</p>

    <div style="margin:22px 0 10px;font-size:13px;font-weight:700;color:#770A1C;text-transform:uppercase;letter-spacing:1px;">Collaboration Details</div>
    <table style="width:100%;border-collapse:collapse;margin:8px 0 18px;">
      <tr><td style="padding:9px 0;font-size:12px;color:#777;width:150px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #f1ece3;vertical-align:top;">Collab ID</td><td style="padding:9px 0;font-size:14px;font-weight:700;color:#770A1C;border-bottom:1px solid #f1ece3;">${d.collabId||"—"}</td></tr>
      <tr><td style="padding:9px 0;font-size:12px;color:#777;font-weight:600;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #f1ece3;vertical-align:top;">Product</td><td style="padding:9px 0;font-size:14px;border-bottom:1px solid #f1ece3;">${productList}</td></tr>
      <tr><td style="padding:9px 0;font-size:12px;color:#777;font-weight:600;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #f1ece3;vertical-align:top;">Commercials</td><td style="padding:9px 0;font-size:16px;font-weight:700;color:#770A1C;border-bottom:1px solid #f1ece3;">${fAmt(d.amount)}</td></tr>
      <tr><td style="padding:9px 0;font-size:12px;color:#777;font-weight:600;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #f1ece3;vertical-align:top;">Content Deadline</td><td style="padding:9px 0;font-size:14px;border-bottom:1px solid #f1ece3;">${d.deadline||"—"}</td></tr>
      <tr><td style="padding:9px 0;font-size:12px;color:#777;font-weight:600;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #f1ece3;vertical-align:top;">Usage Rights</td><td style="padding:9px 0;font-size:14px;border-bottom:1px solid #f1ece3;">${d.usage||"—"}</td></tr>
      <tr><td style="padding:9px 0;font-size:12px;color:#777;font-weight:600;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #f1ece3;vertical-align:top;">Payment Terms</td><td style="padding:9px 0;font-size:14px;border-bottom:1px solid #f1ece3;">${paymentTermsLabel}</td></tr>
      <tr><td style="padding:9px 0;font-size:12px;color:#777;font-weight:600;text-transform:uppercase;letter-spacing:.5px;vertical-align:top;">Shipping Address</td><td style="padding:9px 0;font-size:14px;line-height:1.55;">${d.address||"—"}</td></tr>
    </table>

    <div style="margin:22px 0 10px;font-size:13px;font-weight:700;color:#770A1C;text-transform:uppercase;letter-spacing:1px;">Deliverables</div>
    <p style="font-size:14px;line-height:1.65;color:#444;margin:0 0 8px;">As part of this collaboration, we'll need the following content from you:</p>
    <table style="width:100%;border-collapse:collapse;margin:8px 0 18px;">
      ${deliverablesRows}
    </table>

    <div style="margin:22px 0 10px;font-size:13px;font-weight:700;color:#770A1C;text-transform:uppercase;letter-spacing:1px;">Posting Timeline</div>
    <table style="width:100%;border-collapse:collapse;margin:8px 0 18px;">
      <tr><td style="padding:9px 0;font-size:12px;color:#777;width:150px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #f1ece3;vertical-align:top;">1st Draft</td><td style="padding:9px 0;font-size:14px;border-bottom:1px solid #f1ece3;">2–3 days after the delivery of the product</td></tr>
      <tr><td style="padding:9px 0;font-size:12px;color:#777;font-weight:600;text-transform:uppercase;letter-spacing:.5px;vertical-align:top;">2nd Draft</td><td style="padding:9px 0;font-size:14px;">2 days (after editing, if any)</td></tr>
    </table>

    <div style="margin:22px 0 10px;font-size:13px;font-weight:700;color:#770A1C;text-transform:uppercase;letter-spacing:1px;">Usage Rights</div>
    <p style="font-size:14px;line-height:1.65;color:#444;margin:0 0 18px;">Invogue retains full rights to use the content across marketing channels.</p>

    <div style="margin:22px 0 10px;font-size:13px;font-weight:700;color:#770A1C;text-transform:uppercase;letter-spacing:1px;">Brand Guidelines</div>
    <p style="font-size:14px;line-height:1.65;color:#444;margin:0 0 10px;">To maintain brand consistency and quality, please follow the below-mentioned guidelines while shooting:</p>
    <ul style="margin:0 0 18px;padding-left:20px;font-size:13px;color:#444;line-height:1.8;">
      <li>Share a test shot before you begin to shoot to finalize lighting, angles &amp; tone.</li>
      <li>If the video includes a voice-over, please share the script for approval.</li>
      <li>Ensure the content aligns with the approved concept and brief shared.</li>
      <li>Avoid any competitor product mentions in the frame or caption.</li>
      <li>Provide both raw and final edited videos in high resolution.</li>
      <li>Reshoots may be requested if the content does not align with the brand brief.</li>
      <li>All final videos must be approved before going live.</li>
    </ul>

    <div style="margin:28px 0;text-align:center;">
      <p style="font-size:14px;color:#444;margin:0 0 14px;">If the above details look correct, please confirm by clicking the button below:</p>
      <a href="${typeof window!=='undefined'?window.location.origin:(process.env.NEXT_PUBLIC_APP_URL||'https://invogue-collab-hq.vercel.app')}/api/acknowledge?token=${ackToken}" target="_blank" style="display:inline-block;background:#770A1C;color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:6px;letter-spacing:.3px;">I Agree to the Terms</a>
      <p style="font-size:11px;color:#999;margin:10px 0 0;">By clicking the button, you acknowledge and agree to the collaboration terms mentioned above.</p>
    </div>

    <div style="margin-top:28px;padding:14px 16px;background:#F6F4F0;border-left:3px solid #B08D42;border-radius:4px;font-size:12px;color:#6B5B3A;line-height:1.6;">
      <b style="color:#770A1C;">Note:</b> This is an auto-generated email. In case of any confusions or issues, please reach out to your POC, <b>${pocName}</b>, directly.
    </div>

    <p style="font-size:14px;line-height:1.6;margin:24px 0 4px;color:#444;">Looking forward to a successful collaboration!</p>
    <p style="font-size:14px;line-height:1.6;margin:0;"><b>Team Invogue</b></p>
  </div>
  <div style="background:#770A1C;padding:22px 32px;text-align:center;">
    <div style="color:#F6DFC1;font-size:13px;font-weight:600;letter-spacing:1.5px;margin-bottom:6px;">Invogue · Own your Inner Bold</div>
    <div style="color:#F6DFC1;opacity:.75;font-size:11px;"><a href="https://invogue.shop" style="color:#F6DFC1;text-decoration:none;">invogue.shop</a></div>
  </div>
</div>
</body></html>`;
  };

  // Resolve the creator's POC into an email so we can CC them on creator emails.
  // POC may be stored as a team-member name (looked up in users) or already an email.
  const resolvePocEmail = (deal) => {
    const inf = influencers.find(x=>x.name===deal?.inf);
    const poc = (inf?.poc||"").trim();
    if(!poc) return null;
    if(poc.includes("@")) return poc;
    const u = users.find(x=>x.name && x.name.trim().toLowerCase()===poc.toLowerCase());
    return u?.email || null;
  };
  // POC name for a given influencer — so logistics know who to contact about a shipment.
  const pocNameFor = (infName) => (influencers.find(x=>x.name===infName)?.poc || "").trim();

  const sendEmail = async (d, isResend=false, overrideEmail=null) => {
    const toEmail = (overrideEmail || d.email || "").trim();
    if(!toEmail) return notify("Influencer email is missing. Add it to the deal first.","err");
    const userName = loggedIn?.name||"Negotiator";
    // If the recipient was edited at resend time, persist it to the deal so future emails use it too.
    if(overrideEmail && overrideEmail !== d.email){
      supabase.from('deals').update({email:toEmail}).eq('id',d.id).then(({error})=>{if(error) console.error("Email update failed:",error);});
      upDeal(d.id,{email:toEmail});
    }

    // Generate a unique acknowledge token (or reuse existing one on resend)
    const ackToken = d.ackToken || uid();
    const html = buildConfirmationEmailHTML(d, ackToken);
    const subjectPrefix = isResend ? "Collaboration Confirmation (Resent)" : "Collaboration Confirmation";
    const subject = `${subjectPrefix} — Invogue × ${d.inf} (${d.collabId||"New Deal"})`;

    notify(isResend ? "Resending email..." : "Sending email...","info");
    try {
      const resp = await apiFetch('/api/send-email', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ to:toEmail, subject, html, cc:resolvePocEmail(d) })
      });
      const data = await resp.json();
      if(!resp.ok || !data.ok) {
        console.error("Email send failed:", data);
        return notify("Email failed: "+(data.error||"Unknown error"),"err");
      }

      const ts = new Date().toISOString();
      // Only advance status on the FIRST send (from "approved" → "email_sent").
      // On resends from later states (shipped, live, etc.), keep the current status.
      if(!isResend && d.status === "approved") {
        supabase.from('deals').update({status:'email_sent',email_sent_at:ts,acknowledge_token:ackToken}).eq('id',d.id).then(({error})=>{if(error) console.error("Email sent save failed:",error);});
        upDeal(d.id,{status:"email_sent",ackToken});
      } else {
        // Update timestamp + ensure token is stored (in case of resend before first ack)
        supabase.from('deals').update({email_sent_at:ts,acknowledge_token:ackToken}).eq('id',d.id).then(({error})=>{if(error) console.error("Email resend timestamp save failed:",error);});
        if(!d.ackToken) upDeal(d.id,{ackToken});
      }
      addLog(d.id, userName, isResend ? "Confirmation email resent" : "Confirmation email sent", `Sent to ${toEmail} · Resend ID: ${data.id||"—"}`);
      setSel(null);
      setModal(null);
      notify(isResend ? `Email resent to ${toEmail}!` : `Email sent to ${toEmail}!`);
    } catch(e) {
      console.error("Email network error:",e);
      notify("Network error while sending email","err");
    }
  };

  const dispatch = async () => {
    if(!shipF.track) return notify("Enter tracking ID","err");
    if(shipF.track.length < 4) return notify("Tracking ID seems too short","err");
    const userName = loggedIn?.name||"You (Logistics)";
    // Store local DATE only (no time component) so day-of comparisons are trivial and
    // unambiguous — avoids timezone drift between dispatch and delivery checks.
    const ts = todayLocal();
    // Create the shipment record FIRST and confirm it saved. Previously this was fire-and-forget:
    // if the insert failed, the deal was still flipped to 'shipped' with no shipment row, so it
    // got stuck (shipped, but no way to mark delivered). Now we abort on failure.
    const {error:shipErr} = await supabase.from('shipments').insert({deal_id:sel.id,carrier:shipF.carrier,tracking_id:shipF.track,order_id:shipF.orderId||null,status:'in_transit',dispatched_by:userName,dispatched_at:ts});
    if(shipErr){ console.error("Shipment insert failed:",shipErr); return notify("Couldn't save the shipment: "+(shipErr.message||"error")+". Not dispatched — please retry.","err"); }
    const {error:updErr} = await supabase.from('deals').update({status:'shipped'}).eq('id',sel.id);
    if(updErr) console.error("Dispatch status save failed:",updErr);
    upDeal(sel.id,{status:"shipped",ship:{track:shipF.track,carrier:shipF.carrier,orderId:shipF.orderId||"",st:"in_transit",dispAt:ts,dispBy:userName,delAt:null}});
    addLog(sel.id,userName,"Shipment dispatched",`${shipF.carrier}: ${shipF.track}`);
    sendDispatchEmail(sel, {carrier:shipF.carrier, track:shipF.track, orderId:shipF.orderId||""});
    setSel(null);
    setModal(null);
    notify("Dispatched!");
  };

  const buildDeliveryEmailHTML = (d, deliveryDate) => {
    const LOGO_URL = process.env.NEXT_PUBLIC_EMAIL_LOGO_URL || "https://raw.githubusercontent.com/invogueai/invogue-collab-hq/main/public/invogue-logo.png";
    const productList = d.products && d.products.length > 0
      ? d.products.map(p=>`${p.name}${[p.color,p.cut,p.size].filter(Boolean).length?` (${[p.color,p.cut,p.size].filter(Boolean).join(", ")})`:""}${p.qty>1?` × ${p.qty}`:""}`).join(", ")
      : (d.product||"—");
    const infRecord = influencers.find(x=>x.name===d.inf);
    const pocName = infRecord?.poc || "your collab manager";
    const delsList = d.dels.length>0
      ? d.dels.map(dl=>`<li style="margin:4px 0;font-size:13px;">${dl.type}${dl.desc?` — ${dl.desc}`:""}</li>`).join("")
      : "<li style='margin:4px 0;font-size:13px;'>As discussed with your POC</li>";
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Delivery Confirmation</title></head>
<body style="margin:0;padding:0;background:#F6F4F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1A1A;">
<div style="max-width:620px;margin:0 auto;background:#fff;">
  <div style="background:#770A1C;padding:32px 32px;text-align:center;">
    <img src="${LOGO_URL}" alt="Invogue" style="max-height:48px;max-width:220px;display:inline-block;margin-bottom:10px;" />
    <div style="color:#fff;font-size:18px;font-weight:600;margin-top:4px;">Delivery Confirmation</div>
  </div>
  <div style="padding:32px;">
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hi <b>${d.inf}</b>,</p>
    <p style="font-size:14px;line-height:1.65;color:#444;margin:0 0 18px;">Great news! Your product for the collaboration with <b>Invogue</b> has been successfully delivered.</p>

    <div style="margin:22px 0 10px;font-size:13px;font-weight:700;color:#770A1C;text-transform:uppercase;letter-spacing:1px;">Delivery Details</div>
    <table style="width:100%;border-collapse:collapse;margin:8px 0 18px;">
      <tr><td style="padding:9px 0;font-size:12px;color:#777;width:150px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #f1ece3;vertical-align:top;">Collab ID</td><td style="padding:9px 0;font-size:14px;font-weight:700;color:#770A1C;border-bottom:1px solid #f1ece3;">${d.collabId||"—"}</td></tr>
      <tr><td style="padding:9px 0;font-size:12px;color:#777;font-weight:600;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #f1ece3;vertical-align:top;">Product</td><td style="padding:9px 0;font-size:14px;border-bottom:1px solid #f1ece3;">${productList}</td></tr>
      <tr><td style="padding:9px 0;font-size:12px;color:#777;font-weight:600;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #f1ece3;vertical-align:top;">Delivered On</td><td style="padding:9px 0;font-size:14px;font-weight:700;border-bottom:1px solid #f1ece3;">${deliveryDate}</td></tr>
      <tr><td style="padding:9px 0;font-size:12px;color:#777;font-weight:600;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #f1ece3;vertical-align:top;">Carrier</td><td style="padding:9px 0;font-size:14px;border-bottom:1px solid #f1ece3;">${d.ship?.carrier||"—"} · ${d.ship?.track||"—"}</td></tr>
      <tr><td style="padding:9px 0;font-size:12px;color:#777;font-weight:600;text-transform:uppercase;letter-spacing:.5px;vertical-align:top;">Content Deadline</td><td style="padding:9px 0;font-size:14px;font-weight:700;color:#770A1C;">${d.deadline||"—"}</td></tr>
    </table>

    <div style="margin:22px 0 10px;font-size:13px;font-weight:700;color:#770A1C;text-transform:uppercase;letter-spacing:1px;">What's Next?</div>
    <p style="font-size:14px;line-height:1.65;color:#444;margin:0 0 12px;">Now that you've received the product, here's what we need from you:</p>
    <ol style="margin:0 0 18px;padding-left:20px;font-size:13px;color:#444;line-height:1.8;">
      <li>Try out the product and get comfortable with it</li>
      <li>Create the agreed-upon content:</li>
    </ol>
    <ul style="margin:0 0 18px;padding-left:30px;list-style:disc;">${delsList}</ul>
    <p style="font-size:14px;line-height:1.65;color:#444;margin:0 0 12px;">Please ensure the content is posted by <b>${d.deadline||"the agreed deadline"}</b>.</p>

    <div style="margin-top:28px;padding:14px 16px;background:#F6F4F0;border-left:3px solid #B08D42;border-radius:4px;font-size:12px;color:#6B5B3A;line-height:1.6;">
      <b style="color:#770A1C;">Need help?</b> If you have any questions about the product or content requirements, reach out to your POC, <b>${pocName}</b>, directly.
    </div>

    <p style="font-size:14px;line-height:1.6;margin:24px 0 4px;color:#444;">Excited to see your content!</p>
    <p style="font-size:14px;line-height:1.6;margin:0;"><b>Team Invogue</b></p>
  </div>
  <div style="background:#770A1C;padding:22px 32px;text-align:center;">
    <div style="color:#F6DFC1;font-size:13px;font-weight:600;letter-spacing:1.5px;margin-bottom:6px;">Invogue · Own your Inner Bold</div>
    <div style="color:#F6DFC1;opacity:.75;font-size:11px;"><a href="https://invogue.shop" style="color:#F6DFC1;text-decoration:none;">invogue.shop</a></div>
  </div>
</div>
</body></html>`;
  };

  const sendDeliveryEmail = async (d, deliveryDate) => {
    if(!d.email) { console.log("No email for delivery confirmation — skipping"); return; }
    const subject = `Delivery Confirmation — Invogue × ${d.inf} (${d.collabId||"Deal"})`;
    const html = buildDeliveryEmailHTML(d, deliveryDate);
    try {
      const resp = await apiFetch('/api/send-email', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ to:d.email, subject, html, cc:resolvePocEmail(d) })
      });
      const data = await resp.json();
      if(!resp.ok || !data.ok) { console.error("Delivery email failed:", data); return; }
      addLog(d.id, loggedIn?.name||"System", "Delivery confirmation email sent", `Sent to ${d.email}`);
    } catch(e) {
      console.error("Delivery email network error:",e);
    }
  };

  const buildDispatchEmailHTML = (d, ship) => {
    const LOGO_URL = process.env.NEXT_PUBLIC_EMAIL_LOGO_URL || "https://raw.githubusercontent.com/invogueai/invogue-collab-hq/main/public/invogue-logo.png";
    const productList = d.products && d.products.length > 0
      ? d.products.map(p=>`${p.name}${[p.color,p.cut,p.size].filter(Boolean).length?` (${[p.color,p.cut,p.size].filter(Boolean).join(", ")})`:""}${p.qty>1?` × ${p.qty}`:""}`).join(", ")
      : (d.product||"—");
    const infRecord = influencers.find(x=>x.name===d.inf);
    const pocName = infRecord?.poc || "your collab manager";
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Your Invogue Package is on the Way</title></head>
<body style="margin:0;padding:0;background:#F6F4F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1A1A;">
<div style="max-width:620px;margin:0 auto;background:#fff;">
  <div style="background:#770A1C;padding:32px 32px;text-align:center;">
    <img src="${LOGO_URL}" alt="Invogue" style="max-height:48px;max-width:220px;display:inline-block;margin-bottom:10px;" />
    <div style="color:#fff;font-size:18px;font-weight:600;margin-top:4px;">Your Package is on the Way</div>
  </div>
  <div style="padding:32px;">
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hi <b>${d.inf}</b>,</p>
    <p style="font-size:14px;line-height:1.65;color:#444;margin:0 0 18px;">Good news — your product for the collaboration with <b>Invogue</b> has been dispatched and is on its way to you! 🚚</p>

    <div style="margin:22px 0 10px;font-size:13px;font-weight:700;color:#770A1C;text-transform:uppercase;letter-spacing:1px;">Shipment Details</div>
    <table style="width:100%;border-collapse:collapse;margin:8px 0 18px;">
      <tr><td style="padding:9px 0;font-size:12px;color:#777;width:150px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #f1ece3;vertical-align:top;">Collab ID</td><td style="padding:9px 0;font-size:14px;font-weight:700;color:#770A1C;border-bottom:1px solid #f1ece3;">${d.collabId||"—"}</td></tr>
      <tr><td style="padding:9px 0;font-size:12px;color:#777;font-weight:600;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #f1ece3;vertical-align:top;">Product</td><td style="padding:9px 0;font-size:14px;border-bottom:1px solid #f1ece3;">${productList}</td></tr>
      <tr><td style="padding:9px 0;font-size:12px;color:#777;font-weight:600;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #f1ece3;vertical-align:top;">Carrier</td><td style="padding:9px 0;font-size:14px;font-weight:700;border-bottom:1px solid #f1ece3;">${ship?.carrier||"—"}</td></tr>
      <tr><td style="padding:9px 0;font-size:12px;color:#777;font-weight:600;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #f1ece3;vertical-align:top;">Tracking ID</td><td style="padding:9px 0;font-size:14px;font-weight:700;color:#770A1C;border-bottom:1px solid #f1ece3;">${ship?.track||"—"}</td></tr>
      <tr><td style="padding:9px 0;font-size:12px;color:#777;font-weight:600;text-transform:uppercase;letter-spacing:.5px;vertical-align:top;">Shipping To</td><td style="padding:9px 0;font-size:14px;line-height:1.55;">${d.address||"—"}</td></tr>
    </table>

    <p style="font-size:14px;line-height:1.65;color:#444;margin:0 0 12px;">Please keep an eye out for the delivery. Once it arrives, we'll be excited for you to start creating!</p>

    <div style="margin-top:28px;padding:14px 16px;background:#F6F4F0;border-left:3px solid #B08D42;border-radius:4px;font-size:12px;color:#6B5B3A;line-height:1.6;">
      <b style="color:#770A1C;">Note:</b> This is an auto-generated email. For any questions about your shipment, reach out to your POC, <b>${pocName}</b>, directly.
    </div>

    <p style="font-size:14px;line-height:1.6;margin:24px 0 4px;color:#444;">Can't wait to collaborate!</p>
    <p style="font-size:14px;line-height:1.6;margin:0;"><b>Team Invogue</b></p>
  </div>
  <div style="background:#770A1C;padding:22px 32px;text-align:center;">
    <div style="color:#F6DFC1;font-size:13px;font-weight:600;letter-spacing:1.5px;margin-bottom:6px;">Invogue · Own your Inner Bold</div>
    <div style="color:#F6DFC1;opacity:.75;font-size:11px;"><a href="https://invogue.shop" style="color:#F6DFC1;text-decoration:none;">invogue.shop</a></div>
  </div>
</div>
</body></html>`;
  };

  const sendDispatchEmail = async (d, ship) => {
    if(!d.email) { console.log("No email for dispatch confirmation — skipping"); return; }
    const subject = `Your Invogue Package is on the Way — ${d.collabId||"Deal"}`;
    const html = buildDispatchEmailHTML(d, ship);
    try {
      const resp = await apiFetch('/api/send-email', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ to:d.email, subject, html, cc:resolvePocEmail(d) }) });
      const data = await resp.json();
      if(!resp.ok || !data.ok) { console.error("Dispatch email failed:", data); return; }
      addLog(d.id, loggedIn?.name||"System", "Dispatch notification email sent", `Sent to ${d.email}`);
    } catch(e) { console.error("Dispatch email network error:",e); }
  };

  const markDelivered = (d, deliveryDate, deliveryNote) => {
    // deliveryDate arrives as YYYY-MM-DD (local) from the modal. No time component needed.
    const delDate = toDateOnly(deliveryDate) || todayLocal();
    if(delDate > todayLocal()) return notify("Delivery date cannot be in the future","err");
    const dispDate = toDateOnly(d.ship?.dispAt || d.dispatched_at);
    // Simple string compare works because both are YYYY-MM-DD. Same-day delivery is allowed.
    if(dispDate && delDate < dispDate) return notify("Delivery date cannot be before dispatch date","err");
    const userName = loggedIn?.name||"You (Logistics)";
    supabase.from('shipments').update({status:'delivered',delivered_at:delDate}).eq('deal_id',d.id).then(({error})=>{if(error) console.error("Shipment delivered save failed:",error);});
    supabase.from('deals').update({status:'delivered_prod'}).eq('id',d.id).then(({error})=>{if(error) console.error("Delivered prod save failed:",error);});
    upDeal(d.id,{status:"delivered_prod",ship:{...d.ship,st:"delivered",delAt:delDate}});
    addLog(d.id,userName,"Product delivered",deliveryNote||"");
    sendDeliveryEmail(d, delDate);
    notify("Marked delivered!");
  };

  // ─── LOGISTICS: PICKUP & RE-SHIPMENT ───
  const requestPickup = (deal, reason, note) => {
    if(!reason) return notify("Select a reason","err");
    const userName = loggedIn?.name||"You";
    const ts = new Date().toISOString();
    const entry = {type:"pickup",reason,note:note||"",status:"pickup_requested",requestedBy:userName,requestedAt:ts};
    const shipHistory = [...(deal.shipHistory||[]), entry];
    supabase.from('deals').update({ship_history:shipHistory}).eq('id',deal.id).then(({error})=>{if(error) console.error("Pickup request save failed:",error);});
    upDeal(deal.id,{shipHistory});
    addLog(deal.id,userName,"Pickup requested",`Reason: ${reason}${note?" · "+note:""}`);
    setSel(prev=>prev?{...prev,shipHistory}:null);
    setModal(null);
    notify("Pickup request sent to logistics!");
  };

  const arrangePickup = (deal, histIdx, trackingId, carrier) => {
    if(!trackingId) return notify("Enter return tracking ID","err");
    const userName = loggedIn?.name||"You (Logistics)";
    const ts = new Date().toISOString();
    const shipHistory = (deal.shipHistory||[]).map((h,i)=>i===histIdx?{...h,status:"pickup_dispatched",returnTrack:trackingId,returnCarrier:carrier,arrangedBy:userName,arrangedAt:ts}:h);
    supabase.from('deals').update({ship_history:shipHistory}).eq('id',deal.id).then(({error})=>{if(error) console.error("Arrange pickup save failed:",error);});
    upDeal(deal.id,{shipHistory});
    addLog(deal.id,userName,"Return pickup arranged",`${carrier}: ${trackingId}`);
    setSel(prev=>prev?{...prev,shipHistory}:null);
    setModal(null);
    notify("Return pickup arranged!");
  };

  const markProductReturned = (deal, histIdx) => {
    const userName = loggedIn?.name||"You (Logistics)";
    const ts = new Date().toISOString();
    const shipHistory = (deal.shipHistory||[]).map((h,i)=>i===histIdx?{...h,status:"product_returned",returnedAt:ts,returnedBy:userName}:h);
    supabase.from('deals').update({ship_history:shipHistory}).eq('id',deal.id).then(({error})=>{if(error) console.error("Product returned save failed:",error);});
    upDeal(deal.id,{shipHistory});
    addLog(deal.id,userName,"Product returned","Product received back at warehouse");
    setSel(prev=>prev?{...prev,shipHistory}:null);
    notify("Product marked as returned!");
  };

  const skipPickup = (deal, histIdx, note) => {
    const userName = loggedIn?.name||"You";
    const ts = new Date().toISOString();
    const shipHistory = (deal.shipHistory||[]).map((h,i)=>i===histIdx?{...h,status:"pickup_skipped",skippedBy:userName,skippedAt:ts,skipNote:note||"Low-value product / brand decision"}:h);
    supabase.from('deals').update({ship_history:shipHistory}).eq('id',deal.id).then(({error})=>{if(error) console.error("Skip pickup save failed:",error);});
    upDeal(deal.id,{shipHistory});
    addLog(deal.id,userName,"Pickup skipped",note||"No pickup needed");
    setSel(prev=>prev?{...prev,shipHistory}:null);
    notify("Pickup marked as not needed");
  };

  const requestReshipment = (deal, products, note, newAddress, phone) => {
    if(!products||products.length===0||products.every(p=>!p.name)) return notify("Add at least one product","err");
    if(phone && !validPhone(phone)) return notify("Phone must be 10 digits","err");
    const userName = loggedIn?.name||"You";
    const ts = new Date().toISOString();
    const entry = {type:"reship",products,note:note||"",newAddress:newAddress||"",phone:phone||"",status:"reship_pending",requestedBy:userName,requestedAt:ts};
    const shipHistory = [...(deal.shipHistory||[]), entry];
    supabase.from('deals').update({ship_history:shipHistory}).eq('id',deal.id).then(({error})=>{if(error) console.error("Reship request save failed:",error);});
    upDeal(deal.id,{shipHistory});
    addLog(deal.id,userName,"Re-shipment requested",`${products.map(p=>p.name).join(", ")}${newAddress?" · New address: "+newAddress:""}`);
    setSel(prev=>prev?{...prev,shipHistory}:null);
    setModal(null);
    notify("Re-shipment request sent to logistics!");
  };

  const dispatchReship = (deal, histIdx, trackingId, carrier, orderId) => {
    if(!trackingId) return notify("Enter tracking ID","err");
    const userName = loggedIn?.name||"You (Logistics)";
    // Store re-dispatch as local DATE only (matches dispatch() behavior) so re-delivery
    // date comparisons are clean string compares.
    const ts = todayLocal();
    const shipHistory = (deal.shipHistory||[]).map((h,i)=>i===histIdx?{...h,status:"re_dispatched",reTrack:trackingId,reCarrier:carrier,reOrderId:orderId||"",reDispatchedBy:userName,reDispatchedAt:ts}:h);
    supabase.from('deals').update({ship_history:shipHistory}).eq('id',deal.id).then(({error})=>{if(error) console.error("Reship dispatch save failed:",error);});
    upDeal(deal.id,{shipHistory});
    addLog(deal.id,userName,"Re-shipment dispatched",`${carrier}: ${trackingId}`);
    setSel(prev=>prev?{...prev,shipHistory}:null);
    setModal(null);
    notify("Re-shipment dispatched!");
  };

  const markReshipDelivered = (deal, histIdx, deliveryDate, deliveryNote) => {
    const userName = loggedIn?.name||"You (Logistics)";
    // deliveryDate arrives as YYYY-MM-DD (local) from the modal. Simple string compares only.
    const delDate = toDateOnly(deliveryDate) || todayLocal();
    if(delDate > todayLocal()) return notify("Delivery date cannot be in the future","err");
    const reshipEntry = (deal.shipHistory||[])[histIdx];
    const dispAt = toDateOnly(reshipEntry?.reDispatchedAt);
    // Same-day re-delivery is allowed.
    if(dispAt && delDate < dispAt) return notify("Delivery date cannot be before re-dispatch date","err");
    const shipHistory = (deal.shipHistory||[]).map((h,i)=>i===histIdx?{...h,status:"re_delivered",reDeliveredAt:delDate,reDeliveredBy:userName,reDeliveryNote:deliveryNote||""}:h);
    supabase.from('deals').update({ship_history:shipHistory}).eq('id',deal.id).then(({error})=>{if(error) console.error("Reship delivered save failed:",error);});
    upDeal(deal.id,{shipHistory});
    addLog(deal.id,userName,"Re-shipment delivered",deliveryNote||"New product delivered to influencer");
    setSel(prev=>prev?{...prev,shipHistory}:null);
    setModal(null);
    notify("Re-shipment marked as delivered!");
  };

  const markDelLive = (deal,delIdx,contentUrl) => {
    if(!deal.ship || deal.ship.st !== "delivered") {
      return notify("Product must be delivered before content can go live","err");
    }
    const currentDel = deal.dels[delIdx];
    const liveUrl = contentUrl || currentDel?.link;
    if(!liveUrl) return notify("Content URL is required","err");
    if(!validUrl(liveUrl)) return notify("Invalid URL — must be a valid link","err");

    const link = liveUrl;
    const newDels = deal.dels.map((dl,i)=>i===delIdx?{...dl,st:"live",link}:dl);
    const allLive = newDels.every(dl=>dl.st==="live");
    const newStatus = allLive ? "live" : "partial_live";
    const shouldUpdateStatus = ["email_sent","acknowledged","shipped","delivered_prod","partial_live"].includes(deal.status);
    const delId = deal.dels[delIdx].id;

    supabase.from('deliverables').update({status:'live',live_link:link,marked_live_at:new Date().toISOString()}).eq('id',delId).then(({error})=>{if(error) console.error("Mark live save failed:",error);});
    // Auto-set ad_status when deal first goes live; usage_end_date only if usageDays is set
    const dealUpdates = shouldUpdateStatus ? {status:newStatus} : {};
    const localUpdates = {};
    if(newStatus==="live"&&!deal.adStatus) {
      dealUpdates.ad_status = 'fresh';
      localUpdates.adStatus = 'fresh';
      if(deal.usageDays && !deal.usageEndDate && !(deal.usage||"").toLowerCase().includes("perpetual")) {
        const endD = new Date(); endD.setDate(endD.getDate()+deal.usageDays);
        dealUpdates.usage_end_date = endD.toISOString().slice(0,10);
        localUpdates.usageEndDate = dealUpdates.usage_end_date;
      }
    }
    // Auto-calculate payment due date when deal goes fully live
    if(newStatus==="live"&&!deal.paymentDueDate) {
      const dueDate = calcPaymentDueDate(deal, new Date().toISOString());
      if(dueDate) {
        dealUpdates.payment_due_date = dueDate;
        localUpdates.paymentDueDate = dueDate;
      }
    }
    if(shouldUpdateStatus || Object.keys(dealUpdates).length>0) supabase.from('deals').update(dealUpdates).eq('id',deal.id).then(({error})=>{if(error) console.error("Deal status update failed:",error);});

    upDeal(deal.id,{dels:newDels, status:shouldUpdateStatus?newStatus:deal.status, ...localUpdates});
    addLog(deal.id,loggedIn?.name||"You","Deliverable marked live",`${deal.dels[delIdx].type}: ${deal.dels[delIdx].desc}`);
    setSel(prev=>prev?{...prev,dels:newDels,status:shouldUpdateStatus?newStatus:prev.status}:null);
    setLinkF("");
    setContentF({url:"",note:""});
    setDeliverableLinkF(prev=>{const copy={...prev};delete copy[delId];return copy;});
    setAttachmentMode(prev=>{const copy={...prev};delete copy[delId];return copy;});
    setAttachmentDesc(prev=>{const copy={...prev};delete copy[delId];return copy;});
    notify("Deliverable marked live!");
  };

  // ─── CONTENT APPROVAL WORKFLOW ───
  const submitContentForReview = (deal, delIdx, contentUrl, note="") => {
    if(!((deal.ship && deal.ship.st === "delivered") || deal.productOnHand)) return notify("Product must be delivered before content can be submitted","err");
    if(!contentUrl) return notify("Content URL/link is required","err");
    if(!validUrl(contentUrl)) return notify("Invalid URL — must be a valid link","err");
    const dl0 = deal.dels[delIdx];
    const delId = dl0.id;
    const ts = new Date().toISOString();
    const cleanNote = (note||"").trim();
    const newHistory = [...(dl0.history||[]),{action:"submitted",by:loggedIn?.name||"You",at:ts,link:contentUrl,...(cleanNote?{note:cleanNote}:{})}];
    const newDels = deal.dels.map((dl,i)=>i===delIdx?{...dl,st:"submitted",link:contentUrl,submitNote:cleanNote,history:newHistory}:dl);
    supabase.from('deliverables').update({status:'submitted',live_link:contentUrl,submitted_at:ts,submit_note:cleanNote||null,history:newHistory}).eq('id',delId).then(({error})=>{if(error) console.error("Submit content failed:",error);});
    upDeal(deal.id,{dels:newDels});
    addLog(deal.id,loggedIn?.name||"You","Content submitted for review",`${deal.dels[delIdx].type}: ${contentUrl}${cleanNote?` — Note: ${cleanNote}`:""}`);
    setSel(prev=>prev?{...prev,dels:newDels}:null);
    setDeliverableLinkF(prev=>{const copy={...prev};delete copy[delId];return copy;});
    setDeliverableNoteF(prev=>{const copy={...prev};delete copy[delId];return copy;});
    notify("Content submitted for manager review!");
  };

  const approveContent = async (deal, delIdx) => {
    const dl0 = deal.dels[delIdx];
    const delId = dl0.id;
    const ts = new Date().toISOString();
    const newHistory = [...(dl0.history||[]),{action:"approved",by:loggedIn?.name||"You",at:ts}];
    // Persist FIRST and surface any error — previously this update was fire-and-forget,
    // so a failed write (e.g. RLS/permission) silently reverted on refresh and looked
    // like "approval doesn't stick", especially for revised→resubmitted deliverables.
    const {error} = await supabase.from('deliverables').update({status:'approved',approved_at:ts,history:newHistory}).eq('id',delId);
    if(error){ console.error("Approve content failed:",error); return notify("Couldn't approve content: "+error.message,"err"); }
    const newDels = deal.dels.map((dl,i)=>i===delIdx?{...dl,st:"approved",history:newHistory}:dl);
    upDeal(deal.id,{dels:newDels});
    addLog(deal.id,loggedIn?.name||"You","Content approved",`${deal.dels[delIdx].type}: ${deal.dels[delIdx].desc}`);
    setSel(prev=>prev?{...prev,dels:newDels}:null);
    notify("Content approved! Negotiator can now mark it live.");
  };

  const requestRevision = (deal, delIdx, feedback) => {
    if(!feedback) return notify("Please provide feedback for the revision","err");
    const dl0 = deal.dels[delIdx];
    const delId = dl0.id;
    const ts = new Date().toISOString();
    const newHistory = [...(dl0.history||[]),{action:"revision_requested",by:loggedIn?.name||"You",at:ts,feedback}];
    const newDels = deal.dels.map((dl,i)=>i===delIdx?{...dl,st:"revision_requested",feedback,link:"",history:newHistory}:dl);
    supabase.from('deliverables').update({status:'revision_requested',feedback:feedback,revision_requested_at:ts,history:newHistory}).eq('id',delId).then(({error})=>{
      if(error) { console.error("Revision request failed:",error); notify("Failed to save revision: "+error.message,"err"); }
    });
    upDeal(deal.id,{dels:newDels});
    addLog(deal.id,loggedIn?.name||"You","Revision requested",`${deal.dels[delIdx].type}: ${feedback}`);
    setSel(prev=>prev?{...prev,dels:newDels}:null);
    setRevisionFeedback(prev=>{const copy={...prev};delete copy[delId];return copy;});
    notify("Revision requested. Negotiator will be notified.","warn");
  };

  // ─── PERFORMANCE MARKETER FUNCTIONS ───
  const updateAdStatus = (deal, newAdStatus) => {
    const userName = loggedIn?.name||"You";
    const updates = {ad_status:newAdStatus};
    const patch = {adStatus:newAdStatus};
    // Only auto-set usage_end_date if usageDays is set, no end date yet, and rights aren't perpetual
    if(deal.usageDays && !deal.usageEndDate && !(deal.usage||"").toLowerCase().includes("perpetual")) {
      const endD = new Date(); endD.setDate(endD.getDate()+deal.usageDays);
      const endDate = endD.toISOString().slice(0,10);
      updates.usage_end_date = endDate;
      patch.usageEndDate = endDate;
    }
    supabase.from('deals').update(updates).eq('id',deal.id).then(({error})=>{if(error){console.error("Ad status update failed:",error);notify("Failed to update status","err");}});
    upDeal(deal.id,patch);
    addLog(deal.id,userName,`Creative moved to ${newAdStatus}`,"");
    notify(`Creative moved to ${newAdStatus.charAt(0).toUpperCase()+newAdStatus.slice(1)}!`);
  };

  const saveAdNotes = (deal, notes, platformLink) => {
    const updates = {};
    if(notes!==undefined) updates.ad_notes = notes;
    if(platformLink!==undefined) updates.ad_platform_link = platformLink;
    supabase.from('deals').update(updates).eq('id',deal.id).then(({error})=>{if(error){console.error("Ad notes save failed:",error);notify("Failed to save notes","err");}});
    upDeal(deal.id,{adNotes:notes!==undefined?notes:deal.adNotes, adPlatformLink:platformLink!==undefined?platformLink:deal.adPlatformLink});
    setEditingAdNotes(null);
    notify("Notes saved!");
  };

  const requestReuse = (deal) => {
    const userName = loggedIn?.name||"You (Perf Marketer)";
    const ts = new Date().toISOString();
    supabase.from('deals').update({reuse_requested:true, reuse_requested_at:ts, reuse_requested_by:userName}).eq('id',deal.id).then(({error})=>{if(error){console.error("Reuse request failed:",error);notify("Failed to request reuse","err");}});
    upDeal(deal.id,{reuseRequested:true, reuseRequestedAt:ts, reuseRequestedBy:userName});
    addLog(deal.id,userName,"Usage extension requested","Performance marketer requested license renewal");
    notify("Reuse request sent to negotiator!");
  };

  const setUsageEndDate = (deal, dateStr) => {
    if(!dateStr) return;
    supabase.from('deals').update({usage_end_date:dateStr}).eq('id',deal.id).then(({error})=>{if(error){console.error("Usage date update failed:",error);notify("Failed to update","err");}});
    upDeal(deal.id,{usageEndDate:dateStr});
    notify("Usage end date updated!");
  };

  const submitInvoice = (deal) => {
    if(!invF) return notify("Enter invoice amount","err");
    if(+invF <= 0) return notify("Invoice amount must be positive","err");
    const match = +invF === deal.amount;
    const ts = new Date().toISOString();
    const newStatus = match?"invoice_ok":"disputed";
    supabase.from('deals').update({status:newStatus,invoice_amount:+invF,invoice_match:match,invoice_at:ts,invoice_note:match?null:"Invoice mismatch detected by system"}).eq('id',deal.id).then(({error})=>{if(error) console.error("Invoice save failed:",error);});
    upDeal(deal.id,{status:newStatus,inv:{amount:+invF,match,at:ts,note:match?"":"Invoice mismatch detected by system"}});
    addLog(deal.id,loggedIn?.name||"You","Invoice submitted",`${f(invF)} ${match?"— matched ✓":"— MISMATCH ⚠ (approved: "+fAmt(deal.amount)+")"}`);
    setSel(null);
    setModal(null);
    setInvF("");
    if(match) notify("Invoice submitted — matched!"); else notify("MISMATCH — flagged for review!","err");
  };

  // ─── UNIFIED INVOICE SUBMISSION ───
  // Single-step: negotiator uploads invoice + amount + PAN → auto-queued to finance.
  // If amount matches locked amount → status=invoice_ok (ready for finance to pay).
  // If amount mismatches → status=disputed (needs approver/admin resolution).
  const submitInvoiceComplete = async (deal) => {
    if(!invoiceFile && !invoiceF.notes) return notify("Please upload an invoice file","err");
    if(invoiceF.notes && !invoiceFile && !validUrl(invoiceF.notes)) return notify("Invalid invoice URL — must be a valid link","err");
    if(!invoiceF.amount) return notify("Enter the invoice amount","err");
    if(+invoiceF.amount <= 0) return notify("Invoice amount must be positive","err");
    if(!invoiceF.panNumber) return notify("PAN number is mandatory","err");
    if(!invoiceF.panName) return notify("Legal name (as on PAN) is mandatory","err");
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
    if(!panRegex.test(invoiceF.panNumber.toUpperCase())) return notify("Invalid PAN format (e.g. ABCDE1234F)","err");

    // Upload invoice file to Drive if present
    let invoiceLink = invoiceF.notes || '';
    if(invoiceFile) {
      setInvoiceUploading(true);
      try {
        const monthLabel = new Date().toLocaleString('en-IN', {month:'long', year:'numeric'});
        const initResp = await apiFetch('/api/drive/create-upload-session', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            dealId:deal.id,
            invoiceMode:true,
            monthLabel,
            fileName:`INV_${deal.inf.replace(/\s+/g,'_')}_${deal.collabId||deal.id.slice(0,6)}_${invoiceFile.name}`,
            mimeType:invoiceFile.type||'application/octet-stream',
            sizeBytes:invoiceFile.size,
          }),
        });
        const initData = await initResp.json();
        if(!initResp.ok||!initData.ok) throw new Error(initData.error||'Could not start upload');
        const driveFileId = await new Promise((resolve,reject)=>{
          const xhr = new XMLHttpRequest();
          xhr.open('PUT',initData.uploadUrl,true);
          xhr.setRequestHeader('Content-Type',invoiceFile.type||'application/octet-stream');
          xhr.onload = ()=>{
            if(xhr.status>=200&&xhr.status<300){try{resolve(JSON.parse(xhr.responseText).id)}catch(e){reject(new Error('Upload ok but bad response'))}}
            else reject(new Error('Upload failed: HTTP '+xhr.status));
          };
          xhr.onerror = ()=>reject(new Error('Network error'));
          xhr.send(invoiceFile);
        });
        invoiceLink = `https://drive.google.com/file/d/${driveFileId}/view`;
      } catch(e) {
        setInvoiceUploading(false);
        return notify('Invoice upload failed: '+e.message,'err');
      }
      setInvoiceUploading(false);
    }

    const match = +invoiceF.amount === deal.amount;
    const newStatus = match?"invoice_pending_approval":"disputed";
    const ts = new Date().toISOString();
    const invNum = invoiceF.beneficiary || `INV-${deal.collabId||deal.id.slice(0,6)}`;
    const invDate = new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
    const userName = loggedIn?.name||"You";
    const panUpper = invoiceF.panNumber.toUpperCase();

    // Always save the invoice link in invoice_note so Finance can see it.
    // For mismatches, prefix with a dispute marker so it's still human-readable.
    const noteToSave = match ? invoiceLink : `⚠ MISMATCH | LINK: ${invoiceLink}`;

    supabase.from('deals').update({
      status:newStatus,
      invoice_amount:+invoiceF.amount,
      invoice_match:match,
      invoice_at:ts,
      invoice_note:noteToSave,
      invoice_generated:true,
      invoice_number:invNum,
      invoice_date:invDate,
      pan_number:panUpper,
      pan_name:invoiceF.panName
    }).eq('id',deal.id).then(({error})=>{if(error) console.error("Invoice submit failed:",error);});

    upDeal(deal.id,{
      status:newStatus,
      inv:{amount:+invoiceF.amount,match,at:ts,note:noteToSave,link:invoiceLink},
      invoiceGenerated:true,
      invoiceNumber:invNum,
      invoiceDate:invDate,
      pan:{number:panUpper,name:invoiceF.panName}
    });

    addLog(deal.id,userName,match?"Invoice sent to Finance":"Invoice flagged as DISPUTE",
      `${invNum} · ${f(invoiceF.amount)}${match?" ✓ matched":" ⚠ MISMATCH (locked: "+fAmt(deal.amount)+")"} · PAN: ${panUpper}`);

    setSel(null);
    setModal(null);
    setInvoiceF({beneficiary:"",bank:"",account:"",ifsc:"",upi:"",pan:"",panName:"",address:"",phone:"",gstNumber:"",notes:"",amount:"",panNumber:""});
    setInvoiceFile(null);
    setInvoiceUploading(false);

    if(match) notify("Invoice submitted — sent to Manager for approval");
    else notify("MISMATCH — flagged as dispute for manager review","err");
  };

  const approveInvoice = (d) => {
    if(role!=="approver"&&role!=="admin") return notify("Only Manager or Admin can approve invoices","err");
    const userName = loggedIn?.name||"Manager";
    supabase.from('deals').update({status:'invoice_ok'}).eq('id',d.id).then(({error})=>{if(error) console.error("Invoice approval failed:",error);});
    upDeal(d.id,{status:"invoice_ok"});
    addLog(d.id,userName,"Invoice approved — sent to Finance",d.invoiceNumber||"");
    setSel(null);
    setModal(null);
    notify("Invoice approved and sent to Finance!");
  };

  const rejectInvoice = (d) => {
    if(role!=="approver"&&role!=="admin") return notify("Only Manager or Admin can reject invoices","err");
    const userName = loggedIn?.name||"Manager";
    supabase.from('deals').update({status:'live'}).eq('id',d.id).then(({error})=>{if(error) console.error("Invoice rejection failed:",error);});
    upDeal(d.id,{status:"live"});
    addLog(d.id,userName,"Invoice rejected — returned to negotiator","Needs re-submission");
    setSel(null);
    setModal(null);
    notify("Invoice rejected — negotiator will need to resubmit");
  };

  const recordPayment = () => {
    if(role!=="finance"&&role!=="admin") return notify("Only Finance or Admin can record payments","err");
    if(!payF.amount) return notify("Enter amount","err");
    if(+payF.amount <= 0) return notify("Amount must be positive","err");
    const amt = +payF.amount;
    if(["pending","renegotiate","rejected","dropped","drop_requested","disputed"].includes(sel.status)) {
      return notify("Cannot record payment — deal status is "+sel.status,"err");
    }
    if(amt > remaining(sel)) return notify(`Exceeds remaining balance of ${f(remaining(sel))}!`,"err");
    const payId = uid();
    const ts = new Date().toISOString();
    const userName = loggedIn?.name||"You (Finance)";
    supabase.from('payments').insert({id:payId,deal_id:sel.id,type:payF.type,amount:amt,note:payF.note||null,processed_by:userName,created_at:ts}).then(({error})=>{if(error) console.error("Payment insert failed:",error);});
    const newPays = [...sel.pays,{id:payId,type:payF.type,amount:amt,date:ts.slice(0,10),note:payF.note}];
    const tp = newPays.reduce((s,p)=>s+p.amount,0);
    const ns = tp>=sel.amount?"paid":tp>0?"partial_paid":sel.status;
    supabase.from('deals').update({status:ns}).eq('id',sel.id).then(({error})=>{if(error) console.error("Payment status update failed:",error);});
    upDeal(sel.id,{pays:newPays,status:ns});
    addLog(sel.id,userName,`${payF.type} payment`,f(amt)+(payF.note?` — ${payF.note}`:""));
    setSel(prev=>prev?{...prev,pays:newPays,status:ns}:null);
    setPayF({type:"advance",amount:"",note:""});
    setModal("detail");
    notify(`Payment of ${f(amt)} recorded!`);
  };

  const sendForPayment = async (deal, panNumber, panName) => {
    if(!panNumber || !panName) return notify("PAN details are mandatory","err");
    const ts = new Date().toISOString();
    const userName = loggedIn?.name||"You";

    if(role==="negotiator") {
      // Negotiator sends for manager approval first
      supabase.from('deals').update({status:'payment_requested',pan_number:panNumber,pan_name:panName}).eq('id',deal.id).then(({error})=>{if(error) console.error("Payment request save failed:",error);});
      upDeal(deal.id,{status:"payment_requested",pan:{number:panNumber,name:panName}});
      addLog(deal.id,userName,"Requested payment approval",`PAN: ${panNumber} | Name: ${panName}`);
    } else if(role==="approver") {
      // Manager approves and sends to finance
      supabase.from('deals').update({status:'payment_approved',pan_number:panNumber,pan_name:panName}).eq('id',deal.id).then(({error})=>{if(error) console.error("Payment approval save failed:",error);});
      upDeal(deal.id,{status:"payment_approved",pan:{number:panNumber,name:panName}});
      addLog(deal.id,userName,"Approved payment request",`PAN: ${panNumber} | Name: ${panName}`);
    }

    setSel(null);
    setModal(null);
    setPanF({number:"",name:""});
    setPayReqNote("");
    notify(role==="negotiator"?"Sent to manager for approval":"Payment approved for finance!");
  };

  const approvePaymentRequest = d => {
    const userName = loggedIn?.name||"Manager";
    supabase.from('deals').update({status:'payment_approved'}).eq('id',d.id).then(({error})=>{if(error) console.error("Approve payment request failed:",error);});
    upDeal(d.id,{status:"payment_approved"});
    addLog(d.id,userName,"Payment approved","Forwarded to finance");
    setSel(null);
    setModal(null);
    notify("Payment request approved!");
  };

  const denyPaymentRequest = d => {
    const userName = loggedIn?.name||"Manager";
    supabase.from('deals').update({status:'live'}).eq('id',d.id).then(({error})=>{if(error) console.error("Deny payment request failed:",error);});
    upDeal(d.id,{status:"live"});
    addLog(d.id,userName,"Payment request denied","Sent back to negotiator");
    setSel(null);
    setModal(null);
    notify("Payment request denied","warn");
  };

  // ─── SECURE PAYMENT-DETAILS FORM ───
  // The influencer submits bank/PAN/UPI details against an unguessable token —
  // no deal IDs in the URL, so the link can't be edited to reach another collab.
  const ensurePaymentToken = async (deal) => {
    if(deal.payment_token) return deal.payment_token;
    const token = uid();
    const ts = new Date().toISOString();
    const {error} = await supabase.from('deals').update({payment_token:token, payment_token_at:ts}).eq('id',deal.id);
    if(error) console.error("Payment token save failed:",error);
    upDeal(deal.id,{payment_token:token});
    setSel(prev=>prev&&prev.id===deal.id?{...prev,payment_token:token}:prev);
    return token;
  };

  const buildPaymentFormEmailHTML = (d, url) => {
    const LOGO_URL = process.env.NEXT_PUBLIC_EMAIL_LOGO_URL || "https://raw.githubusercontent.com/invogueai/invogue-collab-hq/main/public/invogue-logo.png";
    const infRecord = influencers.find(x=>x.name===d.inf);
    const pocName = infRecord?.poc || "your collab manager";
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Submit Your Payment Details</title></head>
<body style="margin:0;padding:0;background:#F6F4F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1A1A;">
<div style="max-width:620px;margin:0 auto;background:#fff;">
  <div style="background:#770A1C;padding:32px 32px;text-align:center;">
    <img src="${LOGO_URL}" alt="Invogue" style="max-height:48px;max-width:220px;display:inline-block;margin-bottom:10px;" />
    <div style="color:#fff;font-size:18px;font-weight:600;margin-top:4px;">Submit Your Payment Details</div>
  </div>
  <div style="padding:32px;">
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hi <b>${d.inf}</b>,</p>
    <p style="font-size:14px;line-height:1.65;color:#444;margin:0 0 18px;">Your content for collaboration <b>${d.collabId||""}</b> is live — thank you! To process your payment of <b style="color:#770A1C;">${fAmt(d.amount)}</b>, please submit your bank and PAN details securely using the button below.</p>
    <div style="margin:26px 0;text-align:center;">
      <a href="${url}" target="_blank" style="display:inline-block;background:#770A1C;color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:6px;letter-spacing:.3px;">Submit Payment Details</a>
      <p style="font-size:11px;color:#999;margin:10px 0 0;">This is a private, secure link unique to your collaboration. Please don't share it.</p>
    </div>
    <div style="margin-top:24px;padding:14px 16px;background:#F6F4F0;border-left:3px solid #B08D42;border-radius:4px;font-size:12px;color:#6B5B3A;line-height:1.6;">
      <b style="color:#770A1C;">Note:</b> Your deliverables and amount are pre-filled — you only need to add your bank account, IFSC, UPI and PAN. For any questions, reach out to your POC, <b>${pocName}</b>.
    </div>
    <p style="font-size:14px;line-height:1.6;margin:24px 0 4px;color:#444;">Thank you!</p>
    <p style="font-size:14px;line-height:1.6;margin:0;"><b>Team Invogue</b></p>
  </div>
  <div style="background:#770A1C;padding:22px 32px;text-align:center;">
    <div style="color:#F6DFC1;font-size:13px;font-weight:600;letter-spacing:1.5px;margin-bottom:6px;">Invogue · Own your Inner Bold</div>
    <div style="color:#F6DFC1;opacity:.75;font-size:11px;"><a href="https://invogue.shop" style="color:#F6DFC1;text-decoration:none;">invogue.shop</a></div>
  </div>
</div>
</body></html>`;
  };

  const sendPaymentForm = async (deal, method) => {
    const token = await ensurePaymentToken(deal);
    const url = `${window.location.origin}/payment-form?token=${token}`;
    if(method==="copy") {
      navigator.clipboard.writeText(url).then(()=>notify("Secure payment-form link copied!")).catch(()=>notify("Failed to copy link","err"));
    } else if(method==="email") {
      if(!deal.email) return notify("Influencer email is missing. Add it to the deal first.","err");
      notify("Sending payment form…","info");
      try {
        const resp = await apiFetch('/api/send-email', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:deal.email,subject:`Invogue × ${deal.inf} — Submit Your Payment Details (${deal.collabId||""})`,html:buildPaymentFormEmailHTML(deal,url),cc:resolvePocEmail(deal)})});
        const data = await resp.json();
        if(!resp.ok || !data.ok) { console.error("Payment form email failed:", data); return notify("Email failed: "+(data.error||"Unknown error"),"err"); }
      } catch(e) { console.error("Payment form email error:",e); return notify("Network error while sending email","err"); }
    }
    const ts = new Date().toISOString();
    supabase.from('deals').update({payment_form_sent:true,payment_form_sent_at:ts}).eq('id',deal.id).then(({error})=>{if(error) console.error("Payment form sent save failed:",error);});
    upDeal(deal.id,{paymentFormSent:true,paymentFormSentAt:ts});
    addLog(deal.id,loggedIn?.name||"You","Payment details form sent",`${method==="email"?"Via email":"Link copied"} · ${deal.collabId||""}`);
    setSel(prev=>prev?{...prev,paymentFormSent:true,paymentFormSentAt:ts}:null);
    if(method==="email") notify(`Payment form emailed to ${deal.email}!`);
  };

  // ─── AGENCY-MANAGED COLLABS ───
  // Some creators are represented by an agency that raises its own GST invoice.
  // These deals skip the self-service form: we attach the agency invoice + pay the agency.
  const toggleAgencyManaged = async (deal) => {
    const next = !deal.agencyManaged;
    const {error} = await supabase.from('deals').update({agency_managed:next}).eq('id',deal.id);
    if(error) { console.error("Agency toggle failed:",error); return notify("Couldn't update: "+error.message,"err"); }
    upDeal(deal.id,{agencyManaged:next});
    setSel(prev=>prev&&prev.id===deal.id?{...prev,agencyManaged:next}:prev);
    notify(next?"Marked as agency-managed":"Agency flag removed");
  };

  const openAgencyModal = (deal) => {
    const pd = deal.paymentDetails || {};
    setAgencyF({name:deal.agencyName||"", gst:deal.agencyGst||"", beneficiary:pd.beneficiary||"", account:pd.account||"", ifsc:pd.ifsc||"", upi:pd.upi||"", pan:pd.pan||"", panName:pd.panName||"", invoiceLink:deal.agencyInvoiceUrl||""});
    setAgencyFile(null);
    setSel(deal);
    setModal("agencyInvoice");
  };

  const submitAgencyDetails = async (deal) => {
    if(!agencyF.name.trim()) return notify("Agency name is required","err");
    if(!agencyF.beneficiary.trim()||!agencyF.account.trim()||!agencyF.ifsc.trim()) return notify("Agency bank details (beneficiary, account, IFSC) are required","err");
    if(!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(agencyF.ifsc.toUpperCase())) return notify("Invalid IFSC format","err");
    if(agencyF.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(agencyF.pan.toUpperCase())) return notify("Invalid PAN format (e.g. ABCDE1234F)","err");
    if(!agencyFile && !agencyF.invoiceLink.trim()) return notify("Attach the agency GST invoice (upload a file or paste a link)","err");

    let invoiceUrl = agencyF.invoiceLink.trim();
    if(agencyFile){
      setAgencyUploading(true);
      try {
        const monthLabel = new Date().toLocaleString('en-IN',{month:'long',year:'numeric'});
        const initResp = await apiFetch('/api/drive/create-upload-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dealId:deal.id,invoiceMode:true,monthLabel,fileName:`AGENCY_INV_${(agencyF.name||deal.inf).replace(/\s+/g,'_')}_${deal.collabId||deal.id.slice(0,6)}_${agencyFile.name}`,mimeType:agencyFile.type||'application/octet-stream',sizeBytes:agencyFile.size})});
        const initData = await initResp.json();
        if(!initResp.ok||!initData.ok) throw new Error(initData.error||'Could not start upload');
        const driveFileId = await new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('PUT',initData.uploadUrl,true);xhr.setRequestHeader('Content-Type',agencyFile.type||'application/octet-stream');xhr.onload=()=>{if(xhr.status>=200&&xhr.status<300){try{resolve(JSON.parse(xhr.responseText).id)}catch(e){reject(new Error('Upload ok but bad response'))}}else reject(new Error('Upload failed: HTTP '+xhr.status))};xhr.onerror=()=>reject(new Error('Network error'));xhr.send(agencyFile);});
        invoiceUrl = `https://drive.google.com/file/d/${driveFileId}/view`;
      } catch(e){ setAgencyUploading(false); return notify('Agency invoice upload failed: '+e.message,'err'); }
      setAgencyUploading(false);
    }

    const ts = new Date().toISOString();
    const pan = agencyF.pan.toUpperCase().trim();
    const details = {beneficiary:agencyF.beneficiary.trim(),bank:"",account:agencyF.account.trim(),ifsc:agencyF.ifsc.toUpperCase().trim(),upi:agencyF.upi.trim(),pan,panName:agencyF.panName.trim()||agencyF.name.trim(),gstNumber:agencyF.gst.trim().toUpperCase(),agency:true,submittedAt:ts};
    const advance = ["live","partial_live","payment_details_received"].includes(deal.status);
    const {error} = await supabase.from('deals').update({agency_managed:true,agency_name:agencyF.name.trim(),agency_gst:agencyF.gst.trim().toUpperCase(),agency_invoice_url:invoiceUrl,payment_details:details,payment_details_submitted_at:ts,pan_number:pan,pan_name:details.panName,...(advance?{status:'payment_details_received'}:{})}).eq('id',deal.id);
    if(error){ console.error("Agency details save failed:",error); return notify("Couldn't save: "+error.message,"err"); }
    upDeal(deal.id,{agencyManaged:true,agencyName:agencyF.name.trim(),agencyGst:agencyF.gst.trim(),agencyInvoiceUrl:invoiceUrl,paymentDetails:details,paymentDetailsAt:ts,...(advance?{status:'payment_details_received'}:{})});
    addLog(deal.id,loggedIn?.name||"You","Agency invoice attached",`${agencyF.name} · GST: ${agencyF.gst||"—"}`);
    setSel(null); setModal(null);
    notify("Agency invoice & details saved — ready for Finance");
  };

  // generateInvoicePDF kept for admin fallback — generates invoice in a new window
  const generateInvoicePDF = (deal) => {
    const inv = invoiceF;
    const invNumber = `INV-${deal.id.slice(0,6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    const invDate = new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
    const dueDate = new Date(Date.now()+15*86400000).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
    const tax = calculateTax(deal.amount);
    const camp = campaigns.find(c=>c.id===deal.cid);
    const w = window.open("","_blank","width=800,height=1000");
    if(!w) return notify("Pop-up blocked — please allow pop-ups","err");
    w.document.write(`<!DOCTYPE html><html><head><title>Invoice ${invNumber}</title>
<link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..700&family=Archivo:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Archivo,sans-serif;color:#1A1A1A;padding:40px;max-width:800px;margin:0 auto;font-size:13px;line-height:1.6}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #770A1C}
.brand{font-family:Bodoni Moda,serif;font-size:22px;font-weight:800;color:#770A1C;letter-spacing:3px;text-transform:uppercase}
.brand-sub{font-size:10px;color:#7D766A;letter-spacing:1px;font-weight:600}
.invoice-title{font-family:Bodoni Moda,serif;font-size:28px;font-weight:800;color:#770A1C;text-align:right}
.invoice-meta{text-align:right;font-size:12px;color:#7D766A;margin-top:4px}
.invoice-meta b{color:#1A1A1A}
.section{margin-bottom:20px}
.section-title{font-family:Bodoni Moda,serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#770A1C;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #eee}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px}
.info-block{font-size:12px;line-height:1.7}
.info-block b{font-size:13px;display:block;margin-bottom:2px}
table{width:100%;border-collapse:collapse;margin-bottom:20px}
th{background:#770A1C;color:#F6DFC1;padding:8px 12px;text-align:left;font-family:Bodoni Moda,serif;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
td{padding:8px 12px;border-bottom:1px solid #eee;font-size:12px}
.total-row{background:#F6F4F0}
.total-row td{font-weight:700;font-size:13px}
.grand-total td{background:#770A1C;color:#F6DFC1;font-size:15px;font-weight:800;font-family:Bodoni Moda,serif}
.payment-box{background:#F6F4F0;border:1px solid #ddd;border-radius:6px;padding:16px;margin-bottom:20px}
.payment-box .row{display:flex;justify-content:space-between;padding:3px 0;font-size:12px}
.payment-box .row b{color:#1A1A1A}
.footer{margin-top:32px;padding-top:16px;border-top:2px solid #770A1C;text-align:center;font-size:11px;color:#7D766A}
.stamp{display:inline-block;padding:6px 20px;border:2px solid #770A1C;color:#770A1C;font-family:Bodoni Moda,serif;font-weight:800;font-size:14px;text-transform:uppercase;letter-spacing:2px;transform:rotate(-5deg);margin-top:16px}
.note{background:#FEF4DD;border:1px solid #E8D5A3;border-radius:4px;padding:10px;font-size:11px;color:#7D766A;margin-bottom:16px}
@media print{body{padding:20px}button{display:none!important}.no-print{display:none!important}}
</style></head><body>
<div class="no-print" style="text-align:center;margin-bottom:20px">
<button onclick="window.print()" style="background:#770A1C;color:#F6DFC1;border:none;padding:10px 24px;border-radius:4px;font-family:Bodoni Moda,serif;font-weight:700;font-size:14px;cursor:pointer;letter-spacing:1px;text-transform:uppercase">Download / Print Invoice</button>
</div>

<div class="header">
<div>
<div class="brand">INVOGUE</div>
<div class="brand-sub">SHAPEWEAR & LIFESTYLE</div>
<div style="font-size:11px;color:#7D766A;margin-top:8px">invogue.shop<br>contact@invogue.shop</div>
</div>
<div>
<div class="invoice-title">INVOICE</div>
<div class="invoice-meta">
<b>${invNumber}</b><br>
Date: ${invDate}<br>
Due: ${dueDate}<br>
${deal.paymentTerms||"Net 15 days"}
</div>
</div>
</div>

<div class="two-col">
<div class="section">
<div class="section-title">Bill To</div>
<div class="info-block">
<b>${inv.beneficiary || deal.inf}</b>
${inv.address ? inv.address+"<br>" : (deal.address ? deal.address+"<br>" : "")}
${inv.phone ? "Phone: "+inv.phone+"<br>" : (deal.phone ? "Phone: "+deal.phone+"<br>" : "")}
${deal.email ? "Email: "+deal.email : ""}
${inv.pan ? "<br>PAN: "+inv.pan+(inv.panName?" ("+inv.panName+")":"") : ""}
${inv.gstNumber ? "<br>GST: "+inv.gstNumber : ""}
</div>
</div>
<div class="section">
<div class="section-title">Campaign Details</div>
<div class="info-block">
<b>${camp?.name||"—"}</b>
Platform: ${deal.platform}<br>
Usage Rights: ${deal.usage}<br>
Content Deadline: ${deal.deadline}<br>
Followers: ${deal.followers||"—"}
</div>
</div>
</div>

<table>
<thead><tr><th>#</th><th>Deliverable</th><th>Description</th><th>Status</th><th style="text-align:right">Amount</th></tr></thead>
<tbody>
${deal.dels.map((dl,i)=>`<tr><td>${i+1}</td><td>${dl.type}</td><td>${dl.desc||"—"}</td><td>${dl.st==="live"?"✓ Live":"Pending"}</td><td style="text-align:right">${i===0?"₹"+deal.amount.toLocaleString("en-IN"):"—"}</td></tr>`).join("")}
<tr class="total-row"><td colspan="4" style="text-align:right">Subtotal</td><td style="text-align:right">₹${tax.base.toLocaleString("en-IN")}</td></tr>
${+gstRate>0?`<tr><td colspan="4" style="text-align:right">GST (${gstRate}%)</td><td style="text-align:right">₹${tax.gst.toLocaleString("en-IN")}</td></tr>`:""}
${+tdsRate>0?`<tr><td colspan="4" style="text-align:right">TDS Deduction (${tdsRate}%)</td><td style="text-align:right;color:#B42318">-₹${tax.tds.toLocaleString("en-IN")}</td></tr>`:""}
<tr class="grand-total"><td colspan="4" style="text-align:right">NET PAYABLE</td><td style="text-align:right">₹${tax.netPayable.toLocaleString("en-IN")}</td></tr>
</tbody>
</table>

${inv.bank||inv.account||inv.ifsc||inv.upi ? `
<div class="section">
<div class="section-title">Payment Details</div>
<div class="payment-box">
${inv.beneficiary ? `<div class="row"><span>Beneficiary Name</span><b>${inv.beneficiary}</b></div>` : ""}
${inv.bank ? `<div class="row"><span>Bank</span><b>${inv.bank}</b></div>` : ""}
${inv.account ? `<div class="row"><span>Account Number</span><b>${inv.account}</b></div>` : ""}
${inv.ifsc ? `<div class="row"><span>IFSC Code</span><b>${inv.ifsc}</b></div>` : ""}
${inv.upi ? `<div class="row"><span>UPI ID</span><b>${inv.upi}</b></div>` : ""}
</div>
</div>` : ""}

${inv.notes ? `<div class="note"><b>Notes:</b> ${inv.notes}</div>` : ""}

<div style="text-align:right;margin-top:40px">
<div class="stamp">AUTHORIZED</div>
<div style="font-size:11px;color:#7D766A;margin-top:8px">${loggedIn?.name||"Invogue Team"}</div>
</div>

<div class="footer">
<div style="font-family:Bodoni Moda,serif;font-weight:700;color:#770A1C;letter-spacing:2px;margin-bottom:4px">INVOGUE</div>
This is a system-generated invoice from Invogue Collab HQ<br>
invogue.shop · contact@invogue.shop
</div>
</body></html>`);
    w.document.close();
    // Log it
    addLog(deal.id,loggedIn?.name||"You","Invoice generated",`${invNumber} — ₹${tax.netPayable.toLocaleString("en-IN")}`);
    upDeal(deal.id,{invoiceGenerated:true,invoiceNumber:invNumber,invoiceDate:invDate});
    supabase.from('deals').update({invoice_generated:true,invoice_number:invNumber,invoice_date:invDate}).eq('id',deal.id).then(({error})=>{if(error) console.error("Invoice log failed:",error);});
    setSel(prev=>prev?{...prev,invoiceGenerated:true,invoiceNumber:invNumber,invoiceDate:invDate}:null);
    notify("Invoice generated! Use Print/Save as PDF.");
  };

  // ─── BULK INVOICE GENERATION (Finance) ───
  // Generates Invogue invoices for the selected deals from the details the
  // influencer submitted via the secure form. Agency-managed deals are skipped
  // (the agency supplies its own GST invoice).
  const buildOneInvoice = (deal, seq) => {
    const pd = deal.paymentDetails || {};
    const camp = campaigns.find(c=>c.id===deal.cid);
    const invNumber = `INV-${(deal.collabId||deal.id.slice(0,6)).toUpperCase()}-${String(seq+1).padStart(2,'0')}`;
    const invDate = new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
    const tdsApply = isTDSApplicable(deal.inf, deal.amount);
    const tdsAmt = tdsApply ? calcTDSAmount(deal.amount, deal.tdsRate||10) : 0;
    const net = deal.amount - tdsAmt;
    return `<div class="invoice">
      <div class="header">
        <div><div class="brand">INVOGUE</div><div class="brand-sub">SHAPEWEAR & LIFESTYLE</div><div style="font-size:11px;color:#7D766A;margin-top:8px">invogue.shop · contact@invogue.shop</div></div>
        <div><div class="invoice-title">INVOICE</div><div class="invoice-meta"><b>${invNumber}</b><br>Date: ${invDate}<br>${deal.collabId||""}</div></div>
      </div>
      <div class="two-col">
        <div class="section"><div class="section-title">Pay To</div><div class="info-block"><b>${pd.beneficiary||deal.inf}</b>${pd.address?pd.address+"<br>":""}${pd.pan?"PAN: "+pd.pan+(pd.panName?" ("+pd.panName+")":"")+"<br>":""}${pd.gstNumber?"GST: "+pd.gstNumber:""}</div></div>
        <div class="section"><div class="section-title">Campaign</div><div class="info-block"><b>${camp?.name||"—"}</b>Platform: ${deal.platform}<br>Usage: ${deal.usage||"—"}</div></div>
      </div>
      <table>
        <thead><tr><th>#</th><th>Deliverable</th><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>
        ${(deal.dels||[]).map((dl,i)=>`<tr><td>${i+1}</td><td>${dl.type}</td><td>${dl.desc||"—"}</td><td style="text-align:right">${i===0?"₹"+deal.amount.toLocaleString("en-IN"):"—"}</td></tr>`).join("")}
        <tr class="total-row"><td colspan="3" style="text-align:right">Subtotal</td><td style="text-align:right">₹${deal.amount.toLocaleString("en-IN")}</td></tr>
        ${tdsApply?`<tr><td colspan="3" style="text-align:right">TDS (${deal.tdsRate||10}%)</td><td style="text-align:right;color:#B42318">-₹${tdsAmt.toLocaleString("en-IN")}</td></tr>`:""}
        <tr class="grand-total"><td colspan="3" style="text-align:right">NET PAYABLE</td><td style="text-align:right">₹${net.toLocaleString("en-IN")}</td></tr>
        </tbody>
      </table>
      <div class="section"><div class="section-title">Payment Details</div><div class="payment-box">
        ${pd.beneficiary?`<div class="row"><span>Beneficiary</span><b>${pd.beneficiary}</b></div>`:""}
        ${pd.bank?`<div class="row"><span>Bank</span><b>${pd.bank}</b></div>`:""}
        ${pd.account?`<div class="row"><span>Account Number</span><b>${pd.account}</b></div>`:""}
        ${pd.ifsc?`<div class="row"><span>IFSC</span><b>${pd.ifsc}</b></div>`:""}
        ${pd.upi?`<div class="row"><span>UPI ID</span><b>${pd.upi}</b></div>`:""}
      </div></div>
      <div class="footer"><div style="font-family:Bodoni Moda,serif;font-weight:700;color:#770A1C;letter-spacing:2px;margin-bottom:4px">INVOGUE</div>System-generated invoice · invogue.shop</div>
    </div>`;
  };

  const bulkGenerateInvoices = () => {
    const ids = Object.keys(batchSelected).filter(id=>batchSelected[id]);
    const chosen = deals.filter(d=>ids.includes(d.id));
    const eligible = chosen.filter(d=>d.paymentDetails && !d.agencyManaged);
    const skipped = chosen.length - eligible.length;
    if(eligible.length===0) return notify("None of the selected deals have submitted (non-agency) payment details yet","err");
    const w = window.open("","_blank","width=900,height=1100");
    if(!w) return notify("Pop-up blocked — please allow pop-ups","err");
    const bodies = eligible.map((d,i)=>buildOneInvoice(d,i)).join('<div style="page-break-after:always"></div>');
    w.document.write(`<!DOCTYPE html><html><head><title>Invoices (${eligible.length})</title>
<link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..700&family=Archivo:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Archivo,sans-serif;color:#1A1A1A;font-size:13px;line-height:1.6}
.invoice{padding:40px;max-width:800px;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:18px;border-bottom:3px solid #770A1C}
.brand{font-family:Bodoni Moda,serif;font-size:22px;font-weight:800;color:#770A1C;letter-spacing:3px}.brand-sub{font-size:10px;color:#7D766A;letter-spacing:1px;font-weight:600}
.invoice-title{font-family:Bodoni Moda,serif;font-size:26px;font-weight:800;color:#770A1C;text-align:right}.invoice-meta{text-align:right;font-size:12px;color:#7D766A;margin-top:4px}.invoice-meta b{color:#1A1A1A}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:22px}.section-title{font-family:Bodoni Moda,serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#770A1C;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #eee}.info-block{font-size:12px;line-height:1.7}.info-block b{font-size:13px;display:block;margin-bottom:2px}
table{width:100%;border-collapse:collapse;margin-bottom:20px}th{background:#770A1C;color:#F6DFC1;padding:8px 12px;text-align:left;font-family:Bodoni Moda,serif;font-size:11px;text-transform:uppercase}td{padding:8px 12px;border-bottom:1px solid #eee;font-size:12px}.total-row td{font-weight:700;background:#F6F4F0}.grand-total td{background:#770A1C;color:#F6DFC1;font-size:15px;font-weight:800;font-family:Bodoni Moda,serif}
.payment-box{background:#F6F4F0;border:1px solid #ddd;border-radius:6px;padding:16px;margin-bottom:20px}.payment-box .row{display:flex;justify-content:space-between;padding:3px 0;font-size:12px}
.footer{margin-top:28px;padding-top:16px;border-top:2px solid #770A1C;text-align:center;font-size:11px;color:#7D766A}
@media print{.no-print{display:none!important}.invoice{padding:24px}}</style></head><body>
<div class="no-print" style="text-align:center;padding:16px;background:#F6F4F0"><button onclick="window.print()" style="background:#770A1C;color:#F6DFC1;border:none;padding:10px 24px;border-radius:4px;font-family:Bodoni Moda,serif;font-weight:700;cursor:pointer;letter-spacing:1px;text-transform:uppercase">Print / Save all as PDF</button>${skipped?`<div style="font-size:12px;color:#7D766A;margin-top:8px">${skipped} selected deal${skipped>1?"s":""} skipped (agency-managed or no details submitted)</div>`:""}</div>
${bodies}</body></html>`);
    w.document.close();
    notify(`Generated ${eligible.length} invoice${eligible.length>1?"s":""}${skipped?` · ${skipped} skipped`:""}`);
  };

  const dropCollab = (d, reason) => {
    if(!reason || !reason.trim()) return notify("Drop reason is mandatory","err");
    const totalPaidAmount = totalPaid(d);
    if(totalPaidAmount > 0) return notify("Cannot drop a collab with payments already made","err");
    const userName = loggedIn?.name||"You";
    const ts = new Date().toISOString();
    if(role==="admin") {
      // Admin can drop directly
      supabase.from('deals').update({status:'dropped'}).eq('id',d.id).then(({error})=>{if(error) console.error("Drop collab failed:",error);});
      upDeal(d.id,{status:"dropped",dropReason:reason});
      addLog(d.id,userName,"Collab dropped (admin)",`Reason: ${reason}`);
      notify("Collab dropped","warn");
    } else {
      // Negotiator: request drop → needs manager approval
      supabase.from('deals').update({status:'drop_requested',renegotiation_note:reason}).eq('id',d.id).then(({error})=>{if(error) console.error("Drop request failed:",error);});
      upDeal(d.id,{status:"drop_requested",dropReason:reason});
      addLog(d.id,userName,"Drop requested — awaiting manager approval",`Reason: ${reason}`);
      notify("Drop request sent to manager for approval");
    }
    setSel(null);
    setModal(null);
    setDropReasonF("");
  };

  const approveDropRequest = (d) => {
    if(role!=="approver"&&role!=="admin") return notify("Only Manager or Admin can approve drop requests","err");
    const userName = loggedIn?.name||"Manager";
    const ts = new Date().toISOString();
    supabase.from('deals').update({status:'dropped'}).eq('id',d.id).then(({error})=>{if(error) console.error("Drop approval failed:",error);});
    upDeal(d.id,{status:"dropped"});
    addLog(d.id,userName,"Drop approved by manager",d.dropReason?`Original reason: ${d.dropReason}`:"");
    setSel(null);
    setModal(null);
    notify("Collab drop approved","warn");
  };

  const rejectDropRequest = (d) => {
    if(role!=="approver"&&role!=="admin") return notify("Only Manager or Admin can reject drop requests","err");
    const userName = loggedIn?.name||"Manager";
    const prevStatus = d.statusBeforeDrop || "approved";
    supabase.from('deals').update({status:'approved',renegotiation_note:null}).eq('id',d.id).then(({error})=>{if(error) console.error("Drop rejection failed:",error);});
    upDeal(d.id,{status:"approved",dropReason:null});
    addLog(d.id,userName,"Drop request rejected — collab restored","");
    setSel(null);
    setModal(null);
    notify("Drop request rejected — collab restored");
  };

  const openDropModal = d => {
    setSel(d);
    setModal("drop");
    setDropReasonF("");
  };

  // ── FEATURE 2: RATING & FEEDBACK ──
  const rateInfluencer = (deal, rating) => {
    if(!deal || !rating.feedback) return notify("Feedback required","err");
    const overall = (rating.stars.timeliness + rating.stars.quality + rating.stars.communication + rating.stars.professionalism) / 4;
    const infIdx = influencers.findIndex(i => i.name === deal.inf);
    if(infIdx >= 0) {
      const inf = influencers[infIdx];
      inf.rating = overall.toFixed(1);
      inf.feedback = rating.feedback;
      setInfluencers([...influencers]);
    }
    upDeal(deal.id, { rating: rating.stars, feedback: rating.feedback });
    addLog(deal.id, loggedIn?.name || "You", "Influencer rated", `Overall: ${overall.toFixed(1)}/5`);
    setRatingF({stars:{timeliness:0,quality:0,communication:0,professionalism:0},feedback:"",influencerId:null});
    setModal(null);
    notify("Rating submitted!");
  };

  const getInfluencerRating = (infName) => {
    const inf = influencers.find(i => i.name === infName);
    return inf?.rating || 0;
  };

  // ── FEATURE 3: BULK OPERATIONS ──
  const toggleBulkSelect = (id) => {
    const newSet = new Set(bulkSelected);
    if(newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setBulkSelected(newSet);
  };

  const toggleSelectAll = (items) => {
    if(bulkSelectAll) {
      setBulkSelected(new Set());
      setBulkSelectAll(false);
    } else {
      setBulkSelected(new Set(items.map(i => i.id)));
      setBulkSelectAll(true);
    }
  };

  const bulkApprove = () => {
    if(role!=="approver"&&role!=="admin") return notify("Only Manager or Admin can approve deals","err");
    const toApprove = [...bulkSelected].map(id => deals.find(d => d.id === id)).filter(d => d && (d.status === "pending" || d.status === "manager_approved"));
    if(toApprove.length === 0) return notify("No pending deals selected","err");

    const count = toApprove.length;
    setConfirmAction({
      title: "Bulk Approve",
      msg: `Approve ${count} deal${count > 1 ? 's' : ''}?`,
      onConfirm: () => {
        const userName = loggedIn?.name || "Manager";
        const ts = new Date().toISOString();
        // Running budget tallies so multiple collabs in one batch are counted; base excludes the selected set.
        const selIds = new Set(toApprove.map(d=>d.id));
        const campUsed = {}; const ownerUsed = {}; const skipped = [];
        const baseCamp = cid => deals.filter(d=>d.cid===cid && !["rejected","pending","renegotiate","dropped"].includes(d.status) && !selIds.has(d.id)).reduce((s,d)=>s+d.amount,0);
        const baseOwner = (owner,mk) => deals.filter(d=>d.by===owner && monthOf(d.at)===mk && !BUDGET_EXCLUDE.includes(d.status) && !selIds.has(d.id)).reduce((s,d)=>s+d.amount,0);
        let approved = 0;
        toApprove.forEach(d => {
          if(d.amount>0){
            const camp = getCamp(d.cid);
            if(campUsed[d.cid]==null) campUsed[d.cid]=baseCamp(d.cid);
            if(camp && camp.budget>0 && (campUsed[d.cid]+d.amount)>camp.budget){ skipped.push(`${d.inf} — over ${camp.name} budget`); return; }
            const owner=d.by, mk=monthOf(d.at)||currentMonth(), oKey=`${owner}|${mk}`;
            if(ownerUsed[oKey]==null) ownerUsed[oKey]=baseOwner(owner,mk);
            if((ownerUsed[oKey]+d.amount)>userMonthlyCap(owner)){ skipped.push(`${d.inf} — over ${owner}'s ${mk} cap`); return; }
            campUsed[d.cid]+=d.amount; ownerUsed[oKey]+=d.amount;
          }
          const needsDual = d.amount > 50000;
          const isDualPending = d.status === "manager_approved";
          if(needsDual && role === "approver" && !isDualPending) {
            // Manager first approval
            supabase.from('deals').update({status:'manager_approved',approved_by:userName,approved_at:ts}).eq('id',d.id).then(({error})=>{if(error) console.error("Bulk manager-approve failed for "+d.id+":",error);});
            upDeal(d.id, {status:"manager_approved",appBy:userName,appAt:ts});
            addLog(d.id, userName, "Manager approved (bulk) — awaiting admin", fAmt(d.amount));
          } else {
            supabase.from('deals').update({status:'approved',approved_by:userName,approved_at:ts}).eq('id',d.id).then(({error})=>{if(error) console.error("Bulk approve save failed for "+d.id+":",error);});
            upDeal(d.id, {status:"approved",appBy:userName,appAt:ts});
            addLog(d.id, userName, "Bulk approved", fAmt(d.amount));
          }
          approved++;
        });
        setBulkSelected(new Set());
        setBulkSelectAll(false);
        setConfirmAction(null);
        notify(`${approved} collab${approved!==1?'s':''} approved${skipped.length?` · ${skipped.length} skipped (over budget): ${skipped.join("; ")}`:""}`, skipped.length?"warn":"ok");
      }
    });
  };

  const bulkReject = () => {
    if(role!=="approver"&&role!=="admin") return notify("Only Manager or Admin can reject deals","err");
    const toReject = [...bulkSelected].map(id => deals.find(d => d.id === id)).filter(d => d && d.status === "pending");
    if(toReject.length === 0) return notify("No pending deals selected","err");

    const count = toReject.length;
    setConfirmAction({
      title: "Bulk Reject",
      msg: `Reject ${count} deal${count > 1 ? 's' : ''}?`,
      onConfirm: () => {
        const userName = loggedIn?.name || "Manager";
        const ts = new Date().toISOString();
        toReject.forEach(d => {
          supabase.from('deals').update({status:'rejected',approved_by:userName,approved_at:ts}).eq('id',d.id).then(({error})=>{if(error) console.error("Bulk reject save failed for "+d.id+":",error);});
          upDeal(d.id, {status:"rejected",appBy:userName,appAt:ts});
          addLog(d.id, userName, "Bulk rejected", "Batch rejection");
        });
        setBulkSelected(new Set());
        setBulkSelectAll(false);
        setConfirmAction(null);
        notify(`${count} deal${count > 1 ? 's' : ''} rejected!`, "err");
      }
    });
  };

  const bulkExportCSV = () => {
    const toExport = [...bulkSelected].map(id => deals.find(d => d.id === id)).filter(d => d);
    if(toExport.length === 0) return notify("No deals selected","err");

    const csv = "Influencer,Platform,Product,Amount,Status,Created\n" +
      toExport.map(d => `"${d.inf}","${d.platform}","${d.product}",${d.amount},"${d.status}","${d.at}"`).join("\n");

    const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href",url);
    link.setAttribute("download",`deals_export_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility="hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    notify(`Exported ${toExport.length} deals!`);
  };

  const resetData = async () => {
    const d = await loadFromSupabase();
    setCampaigns(d.campaigns);
    setDeals(d.deals);
    setUsers(d.users.length>0?d.users:SEED_USERS);
    setInfluencers(d.influencers);
    notify("Data refreshed from Supabase");
  };

  if(!loaded) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"'DM Sans',sans-serif",background:T.bg,color:T.text,flexDirection:"column",gap:"12px"}}><div style={{width:"40px",height:"40px",borderRadius:"50%",border:"3px solid rgba(255,255,255,.1)",borderTopColor:T.brand,animation:"spin .8s linear infinite"}}/><div style={{fontSize:"13px",fontWeight:600,color:T.sub}}>Loading Invogue Collab HQ...</div><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;
// ═══════════════════════════ LOGIN SCREEN ═══════════════════════════
if(!loggedIn) {
  const rc = (r) => ROLE_CFG[r]||ROLE_CFG.viewer;
  return (
    <div style={{fontFamily:"'Archivo',sans-serif",background:"#F6F4F0",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px",position:"relative",overflow:"hidden"}}>
      <link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..700&family=Archivo:wght@400;500;600&display=swap" rel="stylesheet"/>
      <style>{`
@import url('https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..700&family=Archivo:wght@400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#F6F4F0;color:#1A1A1A;font-family:'Archivo',sans-serif}
::-webkit-scrollbar{width:6px}
::-webkit-scrollbar-track{background:#F6F4F0}
::-webkit-scrollbar-thumb{background:#D4C49A;border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:#B08D42}
::selection{background:#770A1C;color:#F6DFC1}
@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.7}}
button{transition:all .2s ease!important}
button:hover:not(:disabled){transform:translateY(-1px)}
button:active:not(:disabled){transform:translateY(0)}
input:focus,select:focus,textarea:focus{border-color:#770A1C!important;outline:none}
.stat-hover:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.08)!important}
.card-hover:hover{transform:translateY(-1px);border-color:rgba(119,10,28,.2)!important;box-shadow:0 4px 12px rgba(0,0,0,.08)!important}
.row-hover:hover{background:rgba(119,10,28,.02)!important}
@media(max-width:768px){.mobile-grid-1{grid-template-columns:1fr!important}.mobile-hide{display:none!important}.mobile-stack{flex-direction:column!important}.mobile-full{width:100%!important;max-width:100%!important}}
@media(max-width:480px){.mobile-xs-hide{display:none!important}}
`}</style>
      <div style={{width:"100%",maxWidth:"380px",animation:"fadeUp .5s ease"}}>
        {/* Brand Header */}
        <div style={{textAlign:"center",marginBottom:"48px"}}>
          <div style={{fontFamily:"'Bodoni Moda',serif",fontSize:"32px",fontWeight:800,color:"#1A1A1A",letterSpacing:"8px",marginBottom:"4px",textTransform:"uppercase"}}>INVOGUE</div>
          <div style={{fontFamily:"'Bodoni Moda',serif",fontSize:"12px",fontWeight:700,color:"#770A1C",letterSpacing:"4px",marginBottom:"12px",textTransform:"uppercase"}}>COLLAB HQ</div>
          <div style={{width:"30px",height:"2px",background:"#B08D42",margin:"0 auto"}}/>
        </div>

        {/* Login Card */}
        <div style={{background:"#FFFFFF",borderRadius:"2px",padding:"32px",boxShadow:"0 4px 24px rgba(0,0,0,.06)",border:"1px solid rgba(26,26,26,.08)"}}>
          <div style={{fontFamily:"'Bodoni Moda',serif",fontSize:"18px",fontWeight:700,color:"#1A1A1A",marginBottom:"8px",textTransform:"uppercase"}}>Welcome back</div>
          <div style={{fontFamily:"'Archivo',sans-serif",fontSize:"12px",color:"#7D766A",marginBottom:"28px"}}>Sign in with your Invogue Google account</div>

          {/* Checking session spinner */}
          {authChecking && (
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:"10px",padding:"14px",marginBottom:"14px",background:"#F6F4F0",borderRadius:"2px",fontSize:"12px",color:"#7D766A",fontFamily:"'Archivo',sans-serif"}}>
              <div style={{width:"14px",height:"14px",borderRadius:"50%",border:"2px solid rgba(119,10,28,.15)",borderTopColor:"#770A1C",animation:"spin .8s linear infinite"}}/>
              <span>Checking session...</span>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}

          {/* Error */}
          {loginErr && !authChecking && (
            <div style={{padding:"10px 12px",background:"#FEE2E2",borderRadius:"2px",fontSize:"13px",color:"#991B1B",fontWeight:600,marginBottom:"18px",fontFamily:"'Archivo',sans-serif",lineHeight:1.4}}>{loginErr}</div>
          )}

          {/* Google Sign-In Button */}
          <button
            onClick={handleGoogleLogin}
            disabled={authChecking || authBusy}
            style={{
              width:"100%",padding:"12px 16px",
              background: (authChecking||authBusy) ? "#E5E1D8" : "#FFFFFF",
              color:"#1A1A1A",
              border:"1px solid rgba(26,26,26,.20)",borderRadius:"2px",
              fontFamily:"'Archivo',sans-serif",fontSize:"14px",fontWeight:600,
              cursor:(authChecking||authBusy)?"not-allowed":"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",gap:"10px",
              transition:"all .2s",boxSizing:"border-box",
            }}
            onMouseEnter={e=>{ if(!authChecking && !authBusy){ e.currentTarget.style.background="#F6F4F0"; e.currentTarget.style.borderColor="rgba(119,10,28,.3)"; }}}
            onMouseLeave={e=>{ if(!authChecking && !authBusy){ e.currentTarget.style.background="#FFFFFF"; e.currentTarget.style.borderColor="rgba(26,26,26,.20)"; }}}
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            {authBusy ? "Redirecting to Google..." : "Sign in with Google"}
          </button>

          <div style={{marginTop:"14px",fontSize:"11px",color:"#7D766A",textAlign:"center",lineHeight:1.5,fontFamily:"'Archivo',sans-serif"}}>
            Use your <b>@invogue.shop</b> account.
            <br/>Don't have access? Ask your admin.
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════ MAIN APP RENDER ═══════════════════════════
const loggedRC = ROLE_CFG[role]||ROLE_CFG.viewer;
const recentNotifs = getRecentNotifications();
const unreads = recentNotifs.filter(n => new Date(n.time) > new Date(lastSeenTime)).length;
return (
  <div role="application" aria-label="Invogue Collab HQ" style={{fontFamily:"'Archivo',sans-serif",background:T.bg,minHeight:"100vh",color:T.text}}>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..700&family=Archivo:wght@400;500;600&display=swap');*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:#F6F4F0}::-webkit-scrollbar-thumb{background:#D4C49A;border-radius:3px}::-webkit-scrollbar-thumb:hover{background:#B08D42}@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.7}}@media(max-width:768px){.mobile-grid-1{grid-template-columns:1fr!important}.mobile-hide{display:none!important}.mobile-stack{flex-direction:column!important}.mobile-full{width:100%!important;max-width:100%!important}.mobile-small-text{font-size:10px!important}.mobile-pad{padding:10px!important}}@media(max-width:480px){.mobile-xs-hide{display:none!important}}`}</style>

    {/* TOAST */}
    {toast&&<div role="alert" aria-live="assertive" style={{position:"fixed",top:16,right:16,zIndex:2e3,padding:"14px 24px",borderRadius:"2px",fontSize:"13px",fontWeight:600,fontFamily:"Archivo,sans-serif",color:toast.type==="err"?T.err:toast.type==="warn"?T.warn:T.ok,background:toast.type==="err"?T.errBg:toast.type==="warn"?T.warnBg:T.okBg,boxShadow:"0 4px 16px rgba(0,0,0,.08)",animation:"fadeUp .3s ease",borderLeft:`4px solid ${toast.type==="err"?T.err:toast.type==="warn"?T.warn:T.ok}`}}>{toast.msg}</div>}

    {/* ── HEADER ── */}
    <div role="banner" style={{background:"#FFFFFF",borderBottom:`1px solid ${T.borderHead}`,padding:"13px 32px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"12px"}}>
      <div style={{display:"flex",alignItems:"center",gap:"14px"}}>
        <span style={{fontFamily:T.display,fontSize:"20px",fontWeight:600,color:"#1A1A1A",letterSpacing:"4px",textTransform:"uppercase"}}>INVOGUE</span>
        <span style={{width:"1px",height:"22px",background:T.border}}></span>
        <span style={{fontFamily:T.ui,fontSize:"10px",fontWeight:600,color:T.sub,letterSpacing:"2.5px",textTransform:"uppercase"}}>Collab HQ</span>
      </div>

      {/* Feature 4: Global Search */}
      <div style={{flex:1,maxWidth:"400px",margin:"0 10px",minWidth:"150px",position:"relative"}}>
        <input type="text" aria-label="Search deals, influencers, and campaigns" value={searchQuery} onChange={e=>{setSearchQuery(e.target.value);if(e.target.value.trim())setSearchResults(performSearch(e.target.value));else setSearchResults(null)}}
          placeholder="Search deals, influencers, campaigns..."
          style={{width:"100%",padding:"10px 14px",borderRadius:"2px",border:`1px solid ${T.border}`,background:"#FFFFFF",color:"#1A1A1A",fontSize:"13px",fontFamily:"'Archivo',sans-serif",outline:"none"}}/>
        {searchResults&&<div style={{position:"absolute",top:"100%",left:0,right:0,background:"#FFFFFF",borderRadius:"2px",border:"1px solid rgba(26,26,26,.12)",marginTop:"4px",maxHeight:"300px",overflowY:"auto",zIndex:100,boxShadow:"0 2px 8px rgba(0,0,0,.06)"}}>
          {(searchResults.dealMatches?.length||0)>0&&<>
            <div style={{fontSize:"10px",fontWeight:700,color:"#7D766A",padding:"8px 12px",textTransform:"uppercase"}}>Deals</div>
            {searchResults.dealMatches.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail");setSearchQuery("");setSearchResults(null)}} style={{padding:"8px 12px",borderBottom:`1px solid rgba(26,26,26,.08)`,cursor:"pointer",fontSize:"13px",color:"#1A1A1A"}}><b>{d.inf}</b><div style={{fontSize:"10px",color:"#7D766A"}}>{d.product}</div></div>)}
          </>}
          {(searchResults.infMatches?.length||0)>0&&<>
            <div style={{fontSize:"10px",fontWeight:700,color:"#7D766A",padding:"8px 12px",textTransform:"uppercase",marginTop:"4px"}}>Influencers</div>
            {searchResults.infMatches.map(i=><div key={i.id} onClick={()=>{setInfProfile(i);setView("influencers");setSearchQuery("");setSearchResults(null)}} style={{padding:"8px 12px",borderBottom:`1px solid rgba(26,26,26,.08)`,cursor:"pointer",fontSize:"13px",color:"#1A1A1A"}}><b>{i.name}</b><div style={{fontSize:"10px",color:"#7D766A"}}>{i.platform}</div></div>)}
          </>}
          {(searchResults.campMatches?.length||0)>0&&<>
            <div style={{fontSize:"10px",fontWeight:700,color:"#7D766A",padding:"8px 12px",textTransform:"uppercase",marginTop:"4px"}}>Campaigns</div>
            {searchResults.campMatches.map(c=><div key={c.id} onClick={()=>{setCampFilter(c.id);setView("deals");setSearchQuery("");setSearchResults(null)}} style={{padding:"8px 12px",cursor:"pointer",fontSize:"13px",color:"#1A1A1A"}}><b>{c.name}</b><div style={{fontSize:"10px",color:"#7D766A"}}>{f(c.budget)} budget</div></div>)}
          </>}
        </div>}
      </div>

      <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
        {/* Feature 5: Notifications Bell */}
        <div style={{position:"relative"}}>
          <button aria-label={"Notifications"+(unreads>0?", "+unreads+" unread":"")} onClick={()=>{setNotificationPanel(!notificationPanel);if(!notificationPanel)setLastSeenTime(new Date().toISOString())}} style={{background:"none",border:"none",color:"#1A1A1A",fontSize:"20px",cursor:"pointer",position:"relative",padding:"4px"}}>
            🔔
            {unreads>0&&<span style={{position:"absolute",top:-6,right:-6,background:"#770A1C",color:"#FFFFFF",borderRadius:"50%",width:"18px",height:"18px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"10px",fontWeight:800}}>{unreads}</span>}
          </button>
          {notificationPanel&&<div style={{position:"absolute",top:"100%",right:0,background:"#FFFFFF",borderRadius:"2px",marginTop:"8px",width:"320px",maxHeight:"400px",overflowY:"auto",zIndex:100,boxShadow:"0 2px 8px rgba(0,0,0,.06)",border:"1px solid rgba(26,26,26,.08)"}}>
            <div style={{padding:"10px 12px",borderBottom:`1px solid rgba(26,26,26,.08)`,fontWeight:700,fontSize:"12px",color:"#1A1A1A"}}>Notifications</div>
            {recentNotifs.length===0?<div style={{padding:"12px",fontSize:"13px",color:"#7D766A",textAlign:"center"}}>No notifications</div>:recentNotifs.map(n=><div key={n.id} onClick={()=>{const deal=deals.find(x=>x.id===n.dealId);if(deal){setSel(deal);setModal("detail")}}} style={{padding:"10px 12px",borderBottom:`1px solid rgba(26,26,26,.08)`,fontSize:"12px",color:"#1A1A1A",cursor:"pointer"}}>
              <div style={{display:"flex",gap:"6px"}}>
                <span style={{fontSize:"14px"}}>{n.icon}</span>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600}}>{n.msg}</div>
                  <div style={{color:"#7D766A",fontSize:"10px",marginTop:"2px"}}>{n.inf}</div>
                  <div style={{color:"#B5AFA4",fontSize:"10px",marginTop:"2px"}}>{new Date(n.time).toLocaleString()}</div>
                </div>
              </div>
            </div>)}
          </div>}
        </div>

        <div style={{display:"flex",alignItems:"center",gap:"8px",padding:"6px 10px"}}>
          <div style={{width:"30px",height:"30px",borderRadius:"50%",background:T.brand,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",fontWeight:600,fontFamily:T.display}}>{loggedIn.avatar}</div>
          <div>
            <div style={{fontSize:"12px",fontFamily:T.ui,fontWeight:600,color:"#1A1A1A",lineHeight:1.3}}>{loggedIn.name}</div>
            <div style={{fontSize:"9px",fontFamily:T.ui,color:T.gold,fontWeight:600,letterSpacing:"1.5px",textTransform:"uppercase"}}>{loggedRC.l}</div>
          </div>
        </div>
        {realRole==="admin"&&<div style={{display:"flex",alignItems:"center",gap:"5px",padding:"4px 8px",background:viewAsRole?T.brand:"transparent",borderRadius:"4px"}}>
          <span style={{fontSize:"9px",fontFamily:T.ui,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:viewAsRole?"#fff":"#7D766A"}}>View as</span>
          <select value={viewAsRole||""} onChange={e=>{setViewAsRole(e.target.value||null);setView("dashboard")}} style={{border:`1px solid ${viewAsRole?"#fff":T.border}`,background:viewAsRole?"#fff":T.surface,color:"#1A1A1A",borderRadius:"3px",fontSize:"11px",fontWeight:600,fontFamily:T.ui,padding:"3px 6px",cursor:"pointer"}}>
            <option value="">Admin (default)</option>
            {["negotiator","approver","finance","logistics","performance_marketer"].map(r=><option key={r} value={r}>{ROLE_CFG[r].l}</option>)}
          </select>
        </div>}
        <button aria-label="Sign out" onClick={handleLogout} style={{background:"none",border:"none",color:"#7D766A",fontSize:"11px",padding:"5px 10px",cursor:"pointer",fontFamily:"'Archivo',sans-serif",fontWeight:400}}>Sign Out</button>
        <button onClick={resetData} title="Reset to sample data" style={{background:"none",border:"none",color:"#B5AFA4",fontSize:"10px",padding:"3px 6px",cursor:"pointer",fontFamily:"'Archivo',sans-serif",fontWeight:400}}>Reset</button>
      </div>
    </div>

    {/* ── ROLE-AWARE NAV ── */}
    {(()=>{
      const recentNotifs = getRecentNotifications();
      const unreads = recentNotifs.filter(n => new Date(n.time) > new Date(lastSeenTime)).length;

      const navItems = {
        admin: [{k:"dashboard",l:"Admin Dashboard",i:"⚙️"},{k:"creatives",l:"Creative Hub",i:"📈"},{k:"analytics",l:"Analytics",i:"📊"},{k:"users",l:"Team & Users",i:"👥"},{k:"influencers",l:"Influencer DB",i:"⭐"},{k:"deals",l:"All Collabs",i:"📋"},{k:"campaigns",l:"Campaigns",i:"🎯"},{k:"deliverables",l:"Deliverables",i:"📦",n:stats.pendingDels},{k:"shipments",l:"Shipments",i:"🚚",n:stats.pendingShip+inTransit.length},{k:"payments",l:"Payments",i:"💰",n:deals.filter(d=>["invoice_ok","payment_requested","payment_approved","partial_paid"].includes(d.status)&&remaining(d)>0).length},{k:"audit",l:"Audit Log",i:"📜"},{k:"deleted",l:"Deleted",i:"🗑",n:deletedDeals.length+deletedCampaigns.length}],
        negotiator: [{k:"dashboard",l:"My Dashboard",i:"👥"},{k:"influencers",l:"Influencer DB",i:"⭐"},{k:"deals",l:"All Collabs",i:"📋"},{k:"campaigns",l:"Campaigns",i:"🎯"},{k:"dropped",l:"Dropped Collabs",i:"🚫",n:stats.dropped},{k:"deliverables",l:"Deliverables",i:"📦",n:stats.pendingDels}],
        approver: [{k:"dashboard",l:"Command Center",i:"🔵"},{k:"analytics",l:"Analytics",i:"📊"},{k:"influencers",l:"Influencer DB",i:"⭐"},{k:"deals",l:"All Collabs",i:"📋"},{k:"campaigns",l:"Campaigns",i:"🎯"},{k:"deliverables",l:"Deliverables",i:"📦",n:stats.awaitingReview||stats.pendingDels},{k:"shipments",l:"Shipments",i:"🚚",n:stats.pendingShip+inTransit.length}],
        finance: [{k:"dashboard",l:"Payment Center",i:"🔵"},{k:"analytics",l:"Analytics",i:"📊"}],
        logistics: [{k:"dashboard",l:"Shipment Center",i:"🔵"},{k:"shipments",l:"All Shipments",i:"🚚",n:stats.pendingShip+inTransit.length+stats.pickupRequests+stats.reshipPending}],
        performance_marketer: [{k:"dashboard",l:"Creative Hub",i:"📈"},{k:"campaigns",l:"Campaigns",i:"🎯"},{k:"influencers",l:"Influencer DB",i:"⭐"}],
      };
      const items = navItems[role]||navItems.negotiator;
      return <div role="navigation" aria-label="Main navigation" style={{background:T.surfaceAlt,borderBottom:`1px solid ${T.borderHead}`,padding:"0 32px",display:"flex",gap:"28px",overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
        {items.map(n=>(
          <button key={n.k} onClick={()=>setView(n.k)} style={{padding:"16px 0",border:"none",borderBottom:view===n.k?`2px solid ${T.brand}`:"2px solid transparent",background:"transparent",color:view===n.k?T.brand:T.sub,fontWeight:700,fontSize:"11px",cursor:"pointer",fontFamily:T.ui,display:"flex",alignItems:"center",gap:"6px",letterSpacing:"1.5px",textTransform:"uppercase",whiteSpace:"nowrap",transition:"color .2s"}}>
            {n.l}
            {n.n>0&&<span style={{color:T.gold,fontSize:"10px",fontWeight:700,fontFamily:T.display}}>{n.n}</span>}
          </button>
        ))}
      </div>;
    })()}

    <div style={{padding:"20px 28px",maxWidth:"1320px",margin:"0 auto"}}>

      {/* Google Drive connection banner — shows when Drive isn't connected yet.
          Only shows for roles that actually need to upload or review files. */}
      {driveConnStatus && !driveConnStatus.connected && ["admin","negotiator","approver"].includes(role) &&
        <div style={{background:"#3a2a0d",border:"1px solid #78350f",borderLeft:`3px solid ${T.gold}`,borderRadius:"2px",padding:"12px 16px",marginBottom:"14px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:"12px"}}>
          <div style={{flex:1}}>
            <div style={{fontSize:"13px",fontWeight:700,color:T.gold}}>📁 Google Drive not connected</div>
            <div style={{fontSize:"12px",color:"#b6a48b",marginTop:"2px"}}>Connect your @invogue.shop account to upload deliverables and raw clips. You'll only need to do this once.</div>
          </div>
          {role==="admin"&&<Btn v="gold" sm onClick={connectGoogleDrive}>Connect Google Drive</Btn>}
        </div>}

      {/* Google Drive connected — subtle confirmation (only for admin) */}
      {driveConnStatus && driveConnStatus.connected && role==="admin" &&
        <div style={{fontSize:"11px",color:T.sub,marginBottom:"8px",display:"flex",alignItems:"center",gap:"6px"}}>
          <span style={{color:T.ok}}>●</span> Drive connected as <b style={{color:T.text}}>{driveConnStatus.email}</b>
        </div>}

      {/* ═══════════════════════════════════════════════════════
          ADMIN DASHBOARD — Super access, full control
         ═══════════════════════════════════════════════════════ */}
      {view==="dashboard"&&role==="admin"&&(()=>{
        const pendingApproval = deals.filter(d=>d.status==="pending"||d.status==="manager_approved");
        const disputed = deals.filter(d=>d.status==="disputed");
        const needPayment = deals.filter(d=>!["rejected","pending","renegotiate","paid","dropped","drop_requested"].includes(d.status)&&remaining(d)>0);
        const overdueDels = pendingDels.filter(d=>new Date(d.deadline)<new Date());
        const totalOutstanding = deals.filter(d=>!["rejected","pending","renegotiate","paid","dropped","drop_requested"].includes(d.status)).reduce((s,d)=>s+remaining(d),0);
        const activeUsers = users.filter(u=>u.status==="active");
        const byCreator = {};
        deals.forEach(d=>{ byCreator[d.by] = (byCreator[d.by]||0)+1; });
        const activeCount = deals.filter(d=>!["rejected","pending","renegotiate","dropped","drop_requested","paid"].includes(d.status)).length;
        const liveCount = deals.filter(d=>["live","partial_live"].includes(d.status)).length;
        const greeting = (()=>{const h=new Date().getHours();return h<12?"morning":h<17?"afternoon":"evening";})();

        return <>
          {/* Admin header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:"30px",flexWrap:"wrap",gap:"12px"}}>
            <div>
              <div style={{fontSize:"10px",letterSpacing:"3px",textTransform:"uppercase",color:T.gold,fontWeight:600,marginBottom:"10px"}}>Admin · Control Panel</div>
              <div style={{fontFamily:T.display,fontSize:"32px",fontWeight:500,letterSpacing:"-0.5px"}}>Good {greeting}, {(loggedIn?.name||"there").split(" ")[0]}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:"14px"}}>
              <div style={{textAlign:"right",fontSize:"12px",color:T.sub,fontStyle:"italic",fontFamily:T.display}}>{new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
              <Btn v="outline" sm onClick={()=>setView("users")}>Manage Team</Btn>
              <Btn v="ghost" sm onClick={()=>setView("audit")}>Audit</Btn>
            </div>
          </div>

          {/* Hero metrics — editorial strip */}
          <div style={{display:"flex",borderTop:`1px solid ${T.border}`,borderBottom:`1px solid ${T.border}`,marginBottom:"18px",flexWrap:"wrap"}}>
            {[
              {l:"Active Collabs",v:activeCount,c:T.text,sub:`${deals.length} total`},
              {l:"Pending Approval",v:pendingApproval.length,c:pendingApproval.length>0?T.brand:T.text,sub:stats.disputed>0?`${stats.disputed} disputes`:"all clear"},
              {l:"Payments Due",v:f(totalOutstanding),c:T.text,sub:`${needPayment.length} collabs`},
              {l:"Live This Month",v:liveCount,c:T.text,sub:`${campaigns.length} campaigns`},
            ].map((m,i,arr)=><div key={i} style={{flex:"1 1 180px",padding:"20px 24px",borderRight:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
              <div style={{fontSize:"10px",letterSpacing:"2px",textTransform:"uppercase",color:T.sub,marginBottom:"10px"}}>{m.l}</div>
              <div style={{fontFamily:T.display,fontSize:"40px",fontWeight:500,lineHeight:1,color:m.c}}>{m.v}</div>
              <div style={{fontSize:"11px",color:T.sub,marginTop:"8px"}}>{m.sub}</div>
            </div>)}
          </div>
          {/* Secondary metrics */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:"10px",marginBottom:"30px"}}>
            <StatBox l="Total Committed" v={f(stats.committed)}/>
            <StatBox l="Total Paid" v={f(stats.paid)} c={T.ok}/>
            <StatBox l="Total Pipeline" v={f(stats.pipeline)}/>
            <StatBox l="Active Team" v={activeUsers.length} sub={`${users.length} total`}/>
            <StatBox l="Pending Shipments" v={stats.pendingShip}/>
          </div>

          {/* APPROVAL QUEUE — Admin can approve */}
          {pendingApproval.length>0&&<Section title="Approval Queue" action={<span style={{fontSize:"11px",color:T.sub,fontStyle:"italic",fontFamily:T.display}}>{pendingApproval.length} awaiting</span>}>
            {pendingApproval.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"22px 24px",marginBottom:"16px",cursor:"pointer"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div><div style={{fontFamily:T.display,fontSize:"19px",fontWeight:600}}>{d.inf}</div><div style={{fontSize:"11px",color:T.sub,marginTop:"3px"}}>{d.platform} · {d.followers}</div></div>
                <div style={{textAlign:"right"}}><div style={{fontFamily:T.display,fontSize:"24px",fontWeight:600}}>{fAmt(d.amount)}</div><div style={{marginTop:"6px"}}><Badge s={d.status} sm/></div></div>
              </div>
              <div style={{fontSize:"12px",color:T.text,margin:"14px 0 12px",borderTop:`1px solid ${T.borderSoft}`,paddingTop:"12px"}}>{getCamp(d.cid)?.name||"—"} · <span style={{color:T.sub}}>{d.product} · {d.dels.length} deliverables · by {d.by}</span></div>
              {d.amount>50000&&d.status==="pending"&&<div style={{display:"flex",alignItems:"center",background:"#FBF3F2",border:"1px solid #F2DAD7",borderRadius:"2px",padding:"8px 12px",marginBottom:"16px"}}><span style={{fontSize:"11px",color:T.brand,fontWeight:600}}>Dual approval — exceeds ₹50,000, manager sign-off required.</span></div>}
              {d.status==="manager_approved"&&<div style={{display:"flex",alignItems:"center",background:T.infoBg,borderRadius:"2px",padding:"8px 12px",marginBottom:"16px"}}><span style={{fontSize:"11px",color:T.info,fontWeight:600}}>Manager approved — admin final sign-off needed.</span></div>}
              <div onClick={e=>e.stopPropagation()} style={{display:"flex",gap:"10px"}}>
                <Btn v="primary" sm onClick={()=>setConfirmAction({title:"Approve Deal",msg:"Approve and lock "+fAmt(d.amount)+" for "+d.inf+"?",onConfirm:()=>{approveDeal(d);setConfirmAction(null)}})}>Approve</Btn>
                <Btn v="outline" sm onClick={()=>setConfirmAction({title:"Request Renegotiation",msg:"Renegotiate "+d.inf+" deal?",onConfirm:()=>{renegDeal(d);setConfirmAction(null)}})}>Renegotiate</Btn>
                <Btn v="danger" sm onClick={()=>openRejectModal(d)}>Reject</Btn>
              </div>
            </div>)}
          </Section>}

          {/* CONTENT AWAITING REVIEW */}
          {awaitingReview.length>0&&<Section title="Content Awaiting Review" action={<span style={{fontSize:"11px",color:T.info,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase"}}>{awaitingReview.length} to review</span>}>
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px"}}>
              {awaitingReview.map((d,i,arr)=>{const deal=deals.find(x=>x.id===d.dealId);return <div key={i} onClick={()=>{if(deal){setSel(deal);setModal("detail")}}} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",borderBottom:i<arr.length-1?`1px solid ${T.borderSoft}`:"none",cursor:"pointer"}}>
                <div><div style={{fontSize:"13px",fontWeight:600}}>{d.inf} <span style={{color:T.sub,fontWeight:400,fontSize:"11px"}}>· {d.platform}</span></div><div style={{fontSize:"10px",color:T.sub,marginTop:"2px"}}>{d.type}: {d.desc||"—"} · {getCamp(d.cid)?.name||""}{deal?.by?` · by ${deal.by}`:""}</div>{d.link&&<a href={ensureUrl(d.link)} target="_blank" rel="noreferrer" style={{fontSize:"10px",color:T.info,fontWeight:600}} onClick={e=>e.stopPropagation()}>🔗 View content</a>}</div>
                <DBadge s="submitted"/>
              </div>;})}
            </div>
          </Section>}

          {/* DISPUTES */}
          {disputed.length>0&&<Section title="Disputes" action={<span style={{fontSize:"11px",color:T.err,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase"}}>{disputed.length} open</span>}>
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px"}}>
              {disputed.map((d,i,arr)=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",borderBottom:i<arr.length-1?`1px solid ${T.borderSoft}`:"none",cursor:"pointer"}}>
                <div><div style={{fontSize:"13px",fontWeight:600}}>{d.inf}</div><div style={{fontSize:"10px",color:T.sub,marginTop:"2px"}}>{d.inv?.note||"Amount mismatch"} — by {d.by}</div></div>
                <span style={{fontSize:"13px",color:T.err,fontWeight:600,fontFamily:T.display}}>{f(d.inv?.amount)} vs {fAmt(d.amount)}</span>
              </div>)}
            </div>
          </Section>}

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"32px"}}>
            {/* PAYMENTS DUE */}
            <Section title="Payments Due" action={<span style={{fontSize:"11px",color:T.sub,fontStyle:"italic",fontFamily:T.display}}>{f(totalOutstanding)} total</span>}>
              {needPayment.length===0&&<div style={{fontSize:"13px",color:T.sub,padding:"8px 0"}}>All clear</div>}
              {needPayment.length>0&&<div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px"}}>
                {needPayment.slice(0,6).map((d,i,arr)=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",borderBottom:i<arr.length-1?`1px solid ${T.borderSoft}`:"none",cursor:"pointer"}}>
                  <div><div style={{fontSize:"13px",fontWeight:600}}>{d.inf}</div><div style={{fontSize:"10px",color:T.sub,marginTop:"2px"}}>{d.agencyManaged?"Agency · invoice":(d.paymentDetailsAt?"Details in · ready":"Awaiting details")}</div></div>
                  <div style={{textAlign:"right"}}><div style={{fontFamily:T.display,fontSize:"16px",fontWeight:600}}>{f(remaining(d))}</div><div style={{fontSize:"9px",letterSpacing:"1px",textTransform:"uppercase",fontWeight:700,marginTop:"2px",color:d.paymentDueDate&&new Date(d.paymentDueDate)<new Date()?T.err:T.sub}}>{d.paymentDueDate?(new Date(d.paymentDueDate)<new Date()?"Overdue":"Due "+new Date(d.paymentDueDate).toLocaleDateString("en-IN",{day:"numeric",month:"short"})):"Unscheduled"}</div></div>
                </div>)}
              </div>}
            </Section>

            {/* SHIPMENTS */}
            <Section title="Shipments" action={<Btn v="ghost" sm onClick={()=>setView("shipments")}>View all →</Btn>}>
              {pendingShip.length===0&&inTransit.length===0&&<div style={{fontSize:"13px",color:T.sub,padding:"8px 0"}}>All shipped &amp; delivered</div>}
              {(pendingShip.length>0||inTransit.length>0)&&<div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px"}}>
                {pendingShip.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",borderBottom:`1px solid ${T.borderSoft}`,cursor:"pointer"}}><div><div style={{fontSize:"13px",fontWeight:600}}>{d.inf}</div><div style={{fontSize:"10px",color:T.sub,marginTop:"2px"}}>{d.product}</div></div><span style={{fontSize:"9px",letterSpacing:"1px",textTransform:"uppercase",color:T.warn,fontWeight:700}}>Awaiting dispatch</span></div>)}
                {inTransit.map((d,i,arr)=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",borderBottom:i<arr.length-1?`1px solid ${T.borderSoft}`:"none",cursor:"pointer"}}><div><div style={{fontSize:"13px",fontWeight:600}}>{d.inf}</div><div style={{fontSize:"10px",color:T.sub,marginTop:"2px"}}>{d.ship.carrier} · {d.ship.track}</div></div><span style={{fontSize:"9px",letterSpacing:"1px",textTransform:"uppercase",color:T.info,fontWeight:700}}>In transit</span></div>)}
              </div>}
            </Section>
          </div>

          {/* TEAM PERFORMANCE */}
          <Section title="Team Performance" action={<Btn v="ghost" sm onClick={()=>setView("users")}>Manage →</Btn>}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:"10px"}}>
              {activeUsers.map(u=>{
                const uDeals = deals.filter(d=>d.by===u.name||d.by===u.name.split(" ")[0]);
                const uDisputed = uDeals.filter(d=>d.status==="disputed").length;
                const rc = ROLE_CFG[u.role]||ROLE_CFG.viewer;
                return <div key={u.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"16px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"12px"}}>
                    <div style={{width:"34px",height:"34px",borderRadius:"50%",background:T.goldSoft,color:T.brand,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",fontFamily:T.display,flex:"none"}}>{u.avatar}</div>
                    <div style={{minWidth:0}}><div style={{fontWeight:600,fontSize:"13px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{u.name}</div><div style={{fontSize:"10px",color:T.sub,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{u.email}</div></div>
                  </div>
                  <div style={{display:"flex",gap:"8px",alignItems:"center",borderTop:`1px solid ${T.borderSoft}`,paddingTop:"10px"}}>
                    <span style={{fontSize:"9px",letterSpacing:"1px",textTransform:"uppercase",fontWeight:700,color:T.brand,background:T.goldSoft,padding:"3px 8px",borderRadius:"2px"}}>{rc.l}</span>
                    <span style={{fontSize:"11px",color:T.sub}}>{uDeals.length} deals</span>
                    {uDisputed>0&&<span style={{fontSize:"11px",color:T.err,fontWeight:700}}>{uDisputed} disputes</span>}
                  </div>
                </div>;
              })}
            </div>
          </Section>

          {/* OVERDUE DELIVERABLES */}
          {overdueDels.length>0&&<Section title="Overdue Deliverables" action={<span style={{fontSize:"11px",color:T.err,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase"}}>{overdueDels.length} overdue</span>}>
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px"}}>
              {overdueDels.map((d,i,arr)=><div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",borderBottom:i<arr.length-1?`1px solid ${T.borderSoft}`:"none",fontSize:"13px"}}>
                <span><b style={{fontWeight:600}}>{d.inf}</b> <span style={{color:T.sub}}>· {d.type}: {d.desc||"—"}</span></span><span style={{fontSize:"9px",letterSpacing:"1px",textTransform:"uppercase",color:T.err,fontWeight:700}}>Due {d.deadline}</span>
              </div>)}
            </div>
          </Section>}

          {/* CAMPAIGN BUDGETS */}
          <Section title="Campaign Budgets" action={<Btn v="gold" sm onClick={()=>{setEditingCampId(null);setNCamp({name:"",budget:"",target:"",deadline:"",brief:"",status:"active"});setModal("newCamp")}}>+ New Campaign</Btn>}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:"14px"}}>
              {campaigns.map(c=>{const comm=campCommitted(c.id),pct=c.budget>0?Math.round(comm/c.budget*100):0;return <div key={c.id} onClick={()=>openCampDetail(c)} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"18px",cursor:"pointer"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:"10px"}}><span style={{fontWeight:600,fontSize:"14px"}}>{c.name}</span><span style={{fontFamily:T.display,fontSize:"16px",fontWeight:600,color:pct>90?T.err:T.text}}>{pct}%</span></div>
                <div style={{height:"6px",borderRadius:"3px",background:T.goldSoft,overflow:"hidden",marginBottom:"8px"}}><div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:pct>90?T.err:pct>70?T.gold:T.brand,borderRadius:"3px"}}/></div>
                <div style={{fontSize:"11px",color:T.sub}}>{f(comm)} / {f(c.budget)} · {campLocked(c.id)}/{c.target} influencers</div>
              </div>;})}
            </div>
          </Section>

          {/* CONTENT DELIVERABLES PIPELINE */}
          <Section title="Content Pipeline" icon="🎬">
            <ContentPipeline deals={deals} onClickDeal={d=>{setSel(d);setModal("detail")}}/>
          </Section>
        </>;
      })()}

      {/* ═══════════════════════════════════════════════════════
          ADMIN: TEAM & USER MANAGEMENT
         ═══════════════════════════════════════════════════════ */}
      {view==="users"&&role==="admin"&&(()=>{
        const byRole = {};
        users.forEach(u=>{ byRole[u.role] = (byRole[u.role]||0)+1; });

        const handleCreateUser = () => {
          if(!userF.name||!userF.email) { notify("Name and email required","err"); return; }
          if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userF.email)) { notify("Invalid email format","err"); return; }
          if(!ALLOWED_DOMAINS_RE.test(userF.email.trim())) { notify("Email must be "+ALLOWED_DOMAINS_LABEL,"err"); return; }
          if(users.some(u=>u.email.toLowerCase()===userF.email.toLowerCase().trim())) { notify("Email already exists","err"); return; }
          const initials = userF.name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
          const newId = uid();
          const newEmail = userF.email.trim();
          supabase.from('users').insert({id:newId,name:userF.name,email:newEmail,role:userF.role,status:'active',avatar:initials}).then(({error})=>{if(error){console.error("User insert failed:",error);notify("Failed to create user: "+error.message,"err");}});
          setUsers(prev=>[...prev,{id:newId,name:userF.name,email:newEmail,role:userF.role,status:"active",created:new Date().toISOString().slice(0,10),avatar:initials}]);
          // Auto-grant shared Drive access to the new team member (non-fatal if Drive isn't connected)
          apiFetch('/api/drive/grant-access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:newEmail})})
            .then(r=>r.json()).then(d=>{ if(d.ok) notify(`Drive access granted to ${newEmail}`); else console.warn("Drive access not granted:",d.error); })
            .catch(e=>console.warn("Drive grant-access call failed:",e));
          setUserF({name:"",email:"",role:"negotiator"});
          setModal(null);
          notify(`${userF.name} added as ${ROLE_CFG[userF.role]?.l||userF.role}!`);
        };

        const toggleUserStatus = (userId) => {
          const user = users.find(u=>u.id===userId);
          const newStatus = user?.status==="active"?"inactive":"active";
          supabase.from('users').update({status:newStatus}).eq('id',userId).then(({error})=>{if(error) console.error("User status update failed:",error);});
          setUsers(prev=>prev.map(u=>u.id===userId?{...u,status:newStatus}:u));
          notify("User status updated");
        };

        const changeUserRole = (userId,newRole) => {
          supabase.from('users').update({role:newRole}).eq('id',userId).then(({error})=>{if(error) console.error("User role update failed:",error);});
          setUsers(prev=>prev.map(u=>u.id===userId?{...u,role:newRole}:u));
          notify("Role updated");
        };

        const setUserBudget = (userId,val) => {
          const v = Math.max(0, Math.round(+val||0));
          supabase.from('users').update({monthly_budget:v}).eq('id',userId).then(({error})=>{if(error){console.error("Budget update failed:",error);notify("Failed to save budget","err");}});
          setUsers(prev=>prev.map(u=>u.id===userId?{...u,monthlyBudget:v}:u));
          notify("Monthly cap updated");
        };

        return <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
            <div>
              <div style={{fontSize:"30px",fontWeight:500,fontFamily:DISPLAY,letterSpacing:"-0.5px"}}>Team & User Management</div>
              <div style={{fontSize:"13px",color:T.sub}}>Create users, assign roles, manage access</div>
            </div>
            <Btn v="gold" onClick={()=>{setUserF({name:"",email:"",role:"negotiator"});setModal("newUser")}}>+ Add Team Member</Btn>
          </div>

          {/* Role summary */}
          <div style={{display:"flex",gap:"8px",marginBottom:"16px",flexWrap:"wrap"}}>
            {Object.entries(ROLE_CFG).map(([k,v])=>{
              const count = users.filter(u=>u.role===k&&u.status==="active").length;
              if(k==="admin"||k==="viewer") return null;
              return <div key={k} style={{background:v.bg,border:`1px solid ${v.c}22`,borderRadius:"2px",padding:"10px 16px",display:"flex",alignItems:"center",gap:"8px"}}>
                <span style={{fontSize:"18px"}}>{v.i}</span>
                <div><div style={{fontSize:"20px",fontWeight:800,color:v.c}}>{count}</div><div style={{fontSize:"10px",fontWeight:700,color:v.c,textTransform:"uppercase"}}>{v.l}{(v.l.endsWith("s")||v.l==="Finance")?"":"s"}</div></div>
              </div>;
            })}
          </div>

          {/* Team Budgets — per-person monthly cap */}
          <div style={{marginBottom:"20px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px",flexWrap:"wrap",gap:"8px"}}>
              <div style={{fontSize:"11px",letterSpacing:"2px",textTransform:"uppercase",fontWeight:700}}>Team Budgets — {new Date().toLocaleString("en-US",{month:"long",year:"numeric"})}</div>
              <span style={{fontSize:"11px",color:T.sub,fontStyle:"italic",fontFamily:DISPLAY}}>Per-person monthly cap on locked collabs · resets on the 1st · barter excluded</span>
            </div>
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px"}}>
              {(()=>{
                const cm=currentMonth();
                const list=users.filter(u=>u.status!=="inactive"&&(u.role==="negotiator"||userCommittedMonth(u.name,cm)>0)).sort((a,b)=>a.name.localeCompare(b.name));
                if(list.length===0) return <div style={{padding:"16px",fontSize:"12px",color:T.sub}}>No team members with budgets this month yet.</div>;
                return list.map((u,i)=>{
                  const cap=userMonthlyCap(u.name), used=userCommittedMonth(u.name,cm), rem=cap-used, pct=cap>0?Math.round(used/cap*100):0, over=used>cap;
                  return <div key={u.id} style={{padding:"14px 16px",borderBottom:i<list.length-1?`1px solid ${T.borderSoft}`:"none"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px",gap:"12px",flexWrap:"wrap"}}>
                      <div style={{fontSize:"13px",fontWeight:700}}>{u.name} <span style={{fontSize:"11px",color:T.sub,fontWeight:400}}>· {ROLE_CFG[u.role]?.l||u.role}</span></div>
                      <div style={{display:"flex",alignItems:"center",gap:"14px",flexWrap:"wrap"}}>
                        <span style={{fontSize:"12px",color:T.sub}}>Committed <b style={{fontFamily:DISPLAY,color:over?T.err:T.text}}>{f(used)}</b> · Remaining <b style={{fontFamily:DISPLAY,color:over?T.err:rem>0?T.ok:T.warn}}>{f(rem)}</b></span>
                        <label style={{display:"flex",alignItems:"center",gap:"5px",fontSize:"10px",color:T.sub,textTransform:"uppercase",letterSpacing:"0.5px",fontWeight:700}}>Cap ₹
                          <input type="number" defaultValue={cap} onBlur={e=>{if(+e.target.value!==cap) setUserBudget(u.id,e.target.value)}} style={{width:"95px",padding:"5px 8px",border:`1px solid ${T.inputBorder}`,borderRadius:"2px",fontSize:"12px",fontFamily:DISPLAY}}/>
                        </label>
                      </div>
                    </div>
                    <div style={{height:"6px",background:T.goldSoft,borderRadius:"3px",overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:over?T.err:pct>80?T.gold:T.brand}}/></div>
                    {over&&<div style={{fontSize:"10px",color:T.err,marginTop:"4px",fontWeight:700}}>Over cap by {f(used-cap)} — new approvals blocked until the cap is raised or amounts reduced.</div>}
                  </div>;
                });
              })()}
            </div>
          </div>

          {/* Users table */}
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",overflow:"hidden"}}>
            <div style={{display:"grid",gridTemplateColumns:"40px 1.5fr 1.5fr 1fr 0.8fr 1.2fr",padding:"10px 14px",background:T.brand,fontSize:"10px",fontWeight:800,color:"#F6DFC1",textTransform:"uppercase",fontFamily:"Bodoni Moda,serif",letterSpacing:".5px"}}>
              <div></div><div>Name</div><div>Email</div><div>Role</div><div>Status</div><div>Actions</div>
            </div>
            {users.map(u=>{
              const rc = ROLE_CFG[u.role]||ROLE_CFG.viewer;
              return <div key={u.id} style={{display:"grid",gridTemplateColumns:"40px 1.5fr 1.5fr 1fr 0.8fr 1.2fr",padding:"10px 14px",borderBottom:`1px solid ${T.border}`,fontSize:"13px",alignItems:"center",opacity:u.status==="inactive"?.5:1}}>
                <div style={{width:"28px",height:"28px",borderRadius:"50%",background:rc.bg,color:rc.c,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px",fontWeight:800}}>{u.avatar}</div>
                <div style={{fontWeight:700}}>{u.name}</div>
                <div style={{color:T.sub,fontSize:"13px"}}>{u.email}</div>
                <div>
                  <select value={u.role} onChange={e=>changeUserRole(u.id,e.target.value)} style={{padding:"3px 6px",borderRadius:"2px",border:`1px solid ${T.border}`,fontSize:"11px",fontWeight:700,color:rc.c,background:rc.bg,fontFamily:"inherit",cursor:"pointer"}}>
                    <option value="admin">Admin</option>
                    <option value="negotiator">Negotiator</option>
                    <option value="approver">Manager</option>
                    <option value="finance">Finance</option>
                    <option value="logistics">Logistics</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
                <div>
                  <span style={{padding:"2px 7px",borderRadius:"2px",fontSize:"11px",fontWeight:700,color:u.status==="active"?T.ok:T.err,background:u.status==="active"?T.okBg:T.errBg}}>{u.status==="active"?"Active":"Inactive"}</span>
                </div>
                <div style={{display:"flex",gap:"4px"}}>
                  <Btn v={u.status==="active"?"outline":"ok"} sm onClick={()=>toggleUserStatus(u.id)}>{u.status==="active"?"Deactivate":"Activate"}</Btn>
                </div>
              </div>;
            })}
          </div>

          {/* Role Permissions Reference */}
          <div style={{marginTop:"20px"}}>
            <div style={{fontSize:"13px",fontWeight:800,marginBottom:"10px"}}>Role Permissions Reference</div>
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",overflow:"hidden"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr 1fr 1fr",padding:"8px 12px",background:T.brand,fontSize:"10px",fontWeight:800,color:"#F6DFC1",textTransform:"uppercase",fontFamily:"Bodoni Moda,serif",letterSpacing:".4px"}}>
                <div>Permission</div><div>Admin</div><div>Manager</div><div>Finance</div><div>Negotiator</div><div>Logistics</div><div>Viewer</div>
              </div>
              {[
                ["Create deals","✓","—","—","✓","—","—"],
                ["Approve deals","✓","✓","—","—","—","—"],
                ["Create campaigns","✓","✓","✓","—","—","—"],
                ["Record payments","✓","✓","✓","—","—","—"],
                ["Dispatch shipments","✓","—","—","—","✓","—"],
                ["Submit invoices","✓","—","—","✓","—","—"],
                ["Mark deliverables live","✓","—","—","✓","—","—"],
                ["Resolve disputes","✓","—","✓","—","—","—"],
                ["Manage users","✓","—","—","—","—","—"],
                ["View audit logs","✓","✓","✓","—","—","—"],
                ["View financials","✓","✓","✓","—","—","—"],
                ["Override amounts","✓","—","✓","—","—","—"],
              ].map((row,i)=>(
                <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr 1fr 1fr",padding:"6px 12px",borderBottom:`1px solid ${T.border}`,fontSize:"12px"}}>
                  <div style={{fontWeight:600}}>{row[0]}</div>
                  {row.slice(1).map((cell,j)=><div key={j} style={{color:cell==="✓"?T.ok:T.faint,fontWeight:cell==="✓"?800:400,textAlign:"center"}}>{cell}</div>)}
                </div>
              ))}
            </div>
          </div>
        </>;
      })()}

      {/* ═══════════════════════════════════════════════════════
          ADMIN: GLOBAL AUDIT LOG
         ═══════════════════════════════════════════════════════ */}
      {view==="audit"&&role==="admin"&&(()=>{
        const allLogs = [];
        deals.forEach(d=>{
          (d.logs||[]).forEach(lg=>{
            allLogs.push({...lg,inf:d.inf,dealId:d.id,amount:d.amount});
          });
        });
        allLogs.sort((a,b)=>b.t.localeCompare(a.t));

        const filteredLogs = allLogs.filter(lg => {
          if(auditDateFrom && lg.t.slice(0,10) < auditDateFrom) return false;
          if(auditDateTo && lg.t.slice(0,10) > auditDateTo) return false;
          return true;
        });

        return <>
          <div style={{marginBottom:"16px"}}>
            <div style={{fontSize:"30px",fontWeight:500,fontFamily:DISPLAY,letterSpacing:"-0.5px"}}>Global Audit Log</div>
            <div style={{fontSize:"13px",color:T.sub}}>Complete activity trail across all deals and users — {allLogs.length} entries</div>
          </div>
          <div style={{display:"flex",gap:"8px",marginBottom:"12px",alignItems:"center",flexWrap:"wrap"}}>
            <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub}}>From</label><input type="date" value={auditDateFrom} onChange={e=>{setAuditDateFrom(e.target.value);setAuditPage(0)}} style={{padding:"5px 8px",border:`1px solid ${T.border}`,borderRadius:"2px",fontSize:"13px",fontFamily:"inherit",background:T.surface,color:T.text}}/></div>
            <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub}}>To</label><input type="date" value={auditDateTo} onChange={e=>{setAuditDateTo(e.target.value);setAuditPage(0)}} style={{padding:"5px 8px",border:`1px solid ${T.border}`,borderRadius:"2px",fontSize:"13px",fontFamily:"inherit",background:T.surface,color:T.text}}/></div>
            {(auditDateFrom||auditDateTo)&&<Btn v="ghost" sm onClick={()=>{setAuditDateFrom("");setAuditDateTo("");setAuditPage(0)}}>Clear filters</Btn>}
            <span style={{fontSize:"11px",color:T.sub,marginLeft:"auto"}}>{allLogs.length} total entries</span>
          </div>
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",overflow:"hidden"}}>
            <div style={{display:"grid",gridTemplateColumns:"1.2fr 1fr 1.5fr 2fr 0.8fr",padding:"9px 14px",background:T.brand,fontSize:"10px",fontWeight:800,color:"#F6DFC1",textTransform:"uppercase",fontFamily:"Bodoni Moda,serif",letterSpacing:".5px"}}>
              <div>Timestamp</div><div>User</div><div>Action</div><div>Details</div><div>Influencer</div>
            </div>
            {filteredLogs.slice(auditPage * ITEMS_PER_PAGE, (auditPage+1) * ITEMS_PER_PAGE).map((lg,i)=>{
              const isFinancial = lg.a.toLowerCase().includes("payment")||lg.a.toLowerCase().includes("approved")||lg.a.toLowerCase().includes("invoice")||lg.a.toLowerCase().includes("dispute");
              return <div key={i} style={{display:"grid",gridTemplateColumns:"1.2fr 1fr 1.5fr 2fr 0.8fr",padding:"7px 14px",borderBottom:`1px solid ${T.border}`,fontSize:"13px",alignItems:"center",background:isFinancial?T.goldSoft:"transparent"}}>
                <div style={{color:T.sub,fontSize:"11px",fontFamily:"monospace"}}>{lg.t}</div>
                <div style={{fontWeight:600}}>{lg.u}</div>
                <div>
                  <span style={{fontWeight:700}}>{lg.a}</span>
                  {isFinancial&&<span style={{marginLeft:"4px",padding:"1px 4px",borderRadius:"3px",fontSize:"8px",fontWeight:700,background:T.warnBg,color:T.warn}}>₹</span>}
                </div>
                <div style={{color:T.sub,fontSize:"12px"}}>{lg.d||"—"}</div>
                <div style={{fontWeight:600,fontSize:"12px"}}>{lg.inf}</div>
              </div>;
            })}
          </div>
          {filteredLogs.length > ITEMS_PER_PAGE && <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:"8px",padding:"12px"}}>
            <Btn v="outline" sm disabled={auditPage===0} onClick={()=>setAuditPage(p=>p-1)}>← Previous</Btn>
            <span style={{fontSize:"11px",color:T.sub}}>Page {auditPage+1} of {Math.ceil(filteredLogs.length/ITEMS_PER_PAGE)}</span>
            <Btn v="outline" sm disabled={(auditPage+1)*ITEMS_PER_PAGE>=filteredLogs.length} onClick={()=>setAuditPage(p=>p+1)}>Next →</Btn>
          </div>}
        </>;
      })()}

      {/* ═══════════════════════════════════════════════════════
          NEGOTIATOR DASHBOARD — My Collabs, Status Tracker
         ═══════════════════════════════════════════════════════ */}
      {view==="dashboard"&&role==="negotiator"&&(()=>{
        const myDeals = deals; // In production, filter by logged-in user
        const myPending = myDeals.filter(d=>d.status==="pending");
        const myRenegotiations = myDeals.filter(d=>d.status==="renegotiate");
        const myNeedAction = myDeals.filter(d=>
          (d.status==="renegotiate") || // needs review & resubmit
          (d.status==="approved") || // needs email sent
          (d.status==="email_sent"&&!d.ackAt) || // waiting for acknowledgement
          (d.status==="acknowledged"&&!d.ship) || // waiting for logistics
          (["shipped","delivered_prod","email_sent","acknowledged","partial_live"].includes(d.status)&&d.dels.some(dl=>dl.st==="pending")) || // deliverables to mark
          (["live","partial_live"].includes(d.status)&&!d.inv) || // needs invoice
          d.dels.some(dl=>dl.st==="revision_requested") // content needs revision
        );
        const myRevisions = myDeals.filter(d=>d.dels.some(dl=>dl.st==="revision_requested"));
        const myActive = myDeals.filter(d=>!["rejected","paid","pending","renegotiate","dropped"].includes(d.status));
        const myCompleted = myDeals.filter(d=>d.status==="paid");
        const myDropped = myDeals.filter(d=>d.status==="dropped");
        return <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}>
            <div><span style={{fontSize:"20px",fontWeight:800}}>👤 My Dashboard</span><span style={{fontSize:"13px",color:T.sub,marginLeft:"8px"}}>Your collaborations at a glance</span></div>
            <Btn v="gold" sm onClick={()=>{setEditingDealId(null);setNDeal({inf:"",platform:"Instagram",followers:"",product:"",amount:"",usage:"6 months",deadline:"",profile:"",phone:"",address:{street:"",city:"",state:"",pincode:""},cid:campaigns[0]?.id||"c1",dels:[{id:uid(),type:"Reel",desc:"",st:"pending",link:""}]});setModal("newDeal")}}>+ New Deal</Btn>
          </div>
          {(()=>{
            const myName=loggedIn?.name||""; const cap=userMonthlyCap(myName); const used=userCommittedMonth(myName,currentMonth()); const rem=cap-used; const pct=cap>0?Math.round(used/cap*100):0; const over=used>cap;
            return <div style={{background:over?T.errBg:T.surface,border:`1px solid ${over?T.err+"55":T.border}`,borderRadius:"2px",padding:"14px 16px",marginBottom:"14px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px",flexWrap:"wrap",gap:"8px"}}>
                <span style={{fontSize:"11px",letterSpacing:"1.5px",textTransform:"uppercase",fontWeight:700,color:T.sub}}>My budget · {new Date().toLocaleString("en-US",{month:"long"})}</span>
                <span style={{fontSize:"12px",color:T.text}}>Committed <b style={{fontFamily:DISPLAY}}>{f(used)}</b> of <b style={{fontFamily:DISPLAY}}>{f(cap)}</b> · <b style={{color:over?T.err:rem>0?T.ok:T.warn,fontFamily:DISPLAY}}>{f(Math.max(rem,0))} left</b></span>
              </div>
              <div style={{height:"6px",background:T.goldSoft,borderRadius:"3px",overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:over?T.err:pct>80?T.gold:T.brand}}/></div>
              {over&&<div style={{fontSize:"10px",color:T.err,marginTop:"4px",fontWeight:700}}>You're over your monthly cap — new collabs won't be approved until it's raised or amounts are reduced.</div>}
            </div>;
          })()}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:"8px",marginBottom:"16px"}}>
            <StatBox l="Needs My Action" v={myNeedAction.length} c={myNeedAction.length>0?T.warn:T.ok} sub="Do these now"/>
            <StatBox l="Pending Approval" v={myPending.length} c={myPending.length>0?T.warn:T.ok} sub="With manager"/>
            <StatBox l="Active Collabs" v={myActive.length} c={T.info}/>
            <StatBox l="Revisions Needed" v={myRevisions.reduce((s,d)=>s+d.dels.filter(x=>x.st==="revision_requested").length,0)} c={myRevisions.length>0?T.err:T.ok}/>
            <StatBox l="Completed" v={myCompleted.length} c={T.ok}/>
          </div>

          {/* NEEDS ACTION — Priority Queue */}
          {myNeedAction.length>0&&<Section title={`Needs Your Action (${myNeedAction.length})`} icon="⚡">
            {myNeedAction.map(d=>{
              let actionLabel = "";
              let actionColor = T.warn;
              const revCount = d.dels.filter(dl=>dl.st==="revision_requested").length;
              if(revCount>0) { actionLabel=`${revCount} revision${revCount>1?"s":""} requested by manager`; actionColor=T.err; }
              else if(d.status==="renegotiate") { actionLabel="Review & Resubmit to Manager"; actionColor=T.warn; }
              else if(d.status==="approved") { actionLabel="Send Confirmation Email"; actionColor=T.info; }
              else if(d.status==="email_sent"&&!d.ackAt) { actionLabel="Awaiting Influencer Acknowledgement"; actionColor="#f59e0b"; }
              else if(d.status==="acknowledged"&&!d.ship) { actionLabel="Acknowledged ✓ — Awaiting Logistics Dispatch"; actionColor="#10b981"; }
              else if(["shipped","delivered_prod","email_sent","acknowledged","partial_live"].includes(d.status)&&d.dels.some(dl=>dl.st==="pending")) { actionLabel=`${d.dels.filter(dl=>dl.st==="pending").length} deliverables to mark live`; actionColor=T.purple; }
              else if(["live","partial_live"].includes(d.status)&&!d.inv) { actionLabel="Submit Invoice"; actionColor=T.gold; }
              else if(d.status==="payment_requested") { actionLabel="Payment Requested - with Manager"; actionColor=T.info; }
              else { actionLabel="Review needed"; }
              return <div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${actionColor}`,borderRadius:"2px",padding:"10px 12px",marginBottom:"6px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"all .12s"}}
                onMouseEnter={e=>e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.06)"}
                onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                <div>
                  <div style={{fontWeight:700,fontSize:"14px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400,fontSize:"13px"}}>· {d.platform}</span></div>
                  <div style={{fontSize:"11px",color:T.sub}}>{d.product} · {getCamp(d.cid)?.name||""}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:"11px",fontWeight:700,color:actionColor}}>{actionLabel}</div>
                  <Badge s={d.status} sm/>
                </div>
              </div>;
            })}
          </Section>}

          {/* Content Revisions Needed */}
          {myRevisions.length>0&&<Section title={`Content Revisions Needed (${myRevisions.reduce((s,d)=>s+d.dels.filter(x=>x.st==="revision_requested").length,0)})`} icon="✏️" action={<span style={{fontSize:"11px",color:T.err,fontWeight:700,animation:"pulse 1.5s infinite"}}>Revision Required</span>}>
            {myRevisions.map(d=>d.dels.filter(dl=>dl.st==="revision_requested").map((dl,di)=><div key={d.id+"-"+di} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.errBg,border:`1px solid ${T.err}22`,borderLeft:`3px solid ${T.err}`,borderRadius:"2px",padding:"10px 12px",marginBottom:"6px",cursor:"pointer"}}
              onMouseEnter={e=>e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.06)"}
              onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"4px"}}>
                <div style={{fontWeight:700,fontSize:"14px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400,fontSize:"13px"}}>· {dl.type}: {dl.desc||"—"}</span></div>
                <DBadge s="revision_requested"/>
              </div>
              {dl.feedback&&<div style={{fontSize:"13px",color:T.err,marginTop:"2px"}}>💬 "{dl.feedback}"</div>}
            </div>))}
          </Section>}

          {/* Pending Approval */}
          {myPending.length>0&&<Section title={`Awaiting Manager Approval (${myPending.length})`} icon="⏳">
            {myPending.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"10px 12px",marginBottom:"5px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><span style={{fontWeight:700,fontSize:"12px"}}>{d.inf}</span> <span style={{color:T.sub,fontSize:"13px"}}>· {fAmt(d.amount)} · {d.dels.length} deliverables</span></div>
              <Badge s={d.status} sm/>
            </div>)}
          </Section>}

          {/* Renegotiation Requests */}
          {myRenegotiations.length>0&&<Section title={`Renegotiation Requests (${myRenegotiations.length})`} icon="🔄" action={<span style={{fontSize:"11px",color:T.warn,fontWeight:700}}>Action Required</span>}>
            {myRenegotiations.map(d=><div key={d.id} style={{background:T.warnBg,border:`1px solid ${T.warn}33`,borderLeft:`3px solid ${T.warn}`,borderRadius:"2px",padding:"10px 12px",marginBottom:"6px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:d.renegotiationNote?"6px":"0"}}>
                <div><span style={{fontWeight:700,fontSize:"13px"}}>{d.inf}</span> <span style={{color:T.sub,fontSize:"12px"}}>· {fAmt(d.amount)} · {d.dels.length} deliverables</span></div>
                <Badge s={d.status} sm/>
              </div>
              {d.renegotiationNote&&<div style={{fontSize:"12px",color:T.warn,fontStyle:"italic",marginBottom:"6px",padding:"4px 8px",background:"rgba(255,255,255,.5)",borderRadius:"2px"}}>💬 "{d.renegotiationNote}"</div>}
              <div style={{display:"flex",gap:"6px",justifyContent:"flex-end"}}>
                <Btn v="danger" sm onClick={()=>{setSel(d);openDropModal(d)}}>🚫 Drop</Btn>
                <Btn v="gold" sm onClick={()=>openResubmitModal(d)}>↩ Review & Resubmit</Btn>
              </div>
            </div>)}
          </Section>}

          {/* Shipment Tracking */}
          <Section title="📦 My Shipment Tracker" icon="">
            {myDeals.filter(d=>d.ship&&d.ship.st==="in_transit").length===0&&myDeals.filter(d=>["email_sent","acknowledged"].includes(d.status)&&!d.ship).length===0&&<div style={{fontSize:"13px",color:T.sub,padding:"8px 0"}}>No active shipments</div>}
            {myDeals.filter(d=>d.status==="email_sent"&&!d.ackAt).map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:"#fef3c7",border:`1px solid ${T.border}`,borderRadius:"2px",padding:"8px 10px",marginBottom:"4px",fontSize:"13px",display:"flex",justifyContent:"space-between",cursor:"pointer"}}>
              <span><b>{d.inf}</b> · {d.product}</span><span style={{color:"#92400e",fontWeight:700}}>⏳ Awaiting acknowledgement</span>
            </div>)}
            {myDeals.filter(d=>d.status==="acknowledged"&&!d.ship).map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:"#ecfdf5",border:`1px solid ${T.border}`,borderRadius:"2px",padding:"8px 10px",marginBottom:"4px",fontSize:"13px",display:"flex",justifyContent:"space-between",cursor:"pointer"}}>
              <span><b>{d.inf}</b> · {d.product}</span><span style={{color:"#10b981",fontWeight:700}}>🤝 Acknowledged — awaiting dispatch</span>
            </div>)}
            {myDeals.filter(d=>d.ship?.st==="in_transit").map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.purpleBg,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"8px 10px",marginBottom:"4px",fontSize:"13px",display:"flex",justifyContent:"space-between",cursor:"pointer"}}>
              <span><b>{d.inf}</b> · {d.ship.carrier}: <span style={{color:T.info,fontWeight:700}}>{d.ship.track}</span></span><span style={{color:T.purple,fontWeight:700}}>In transit</span>
            </div>)}
          </Section>

          {/* All Active */}
          <Section title={`All Active Collabs (${myActive.length})`} icon="👥" action={<Btn v="ghost" sm onClick={()=>setView("deals")}>View all →</Btn>}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:"8px"}}>
              {myActive.slice(0,6).map(d=>{
                const done=d.dels.filter(x=>x.st==="live").length;
                return <div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"11px",cursor:"pointer",transition:"all .12s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=T.gold}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}><span style={{fontWeight:700,fontSize:"12px"}}>{d.inf}</span><Badge s={d.status} sm/></div>
                  <div style={{fontSize:"11px",color:T.sub,marginBottom:"5px"}}>{d.product} · {getCamp(d.cid)?.name||""}</div>
                  <div style={{display:"flex",gap:"2px",marginBottom:"4px"}}>{d.dels.map((dl,i)=><div key={i} style={{flex:1,height:"3px",borderRadius:"2px",background:dl.st==="live"?T.ok:T.border}}/>)}</div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:"11px"}}><span style={{fontWeight:800,color:T.gold}}>{fAmt(d.amount)}</span><span style={{color:T.sub}}>{done}/{d.dels.length} content</span></div>
                </div>;
              })}
            </div>
          </Section>

          {/* CONTENT DELIVERABLES PIPELINE */}
          <Section title="Content Pipeline" icon="🎬">
            <ContentPipeline deals={myDeals} onClickDeal={d=>{setSel(d);setModal("detail")}}/>
          </Section>

          {/* REUSE REQUESTS FROM PERFORMANCE MARKETER */}
          {(()=>{
            const reuseDeals = deals.filter(d=>d.reuseRequested);
            if(reuseDeals.length===0) return null;
            return <Section title={`Usage Extension Requests (${reuseDeals.length})`} icon="🔄" action={<span style={{fontSize:"11px",color:T.info,fontWeight:700}}>From Performance Marketer</span>}>
              <div style={{fontSize:"12px",color:T.info,background:T.infoBg,padding:"6px 10px",borderRadius:"2px",marginBottom:"8px"}}>The performance marketing team is requesting usage extensions for high-performing creatives. Contact the influencer to negotiate extended rights.</div>
              {reuseDeals.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${T.info}`,borderRadius:"2px",padding:"8px 12px",marginBottom:"4px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><b style={{fontSize:"13px"}}>{d.inf}</b> <span style={{color:T.sub,fontSize:"12px"}}>· {d.product} · Usage ends: {(d.usage||"").toLowerCase().includes("perpetual")?"Perpetual":(d.usageEndDate||"N/A")}</span></div>
                <span style={{fontSize:"11px",color:T.info,fontWeight:700}}>🔄 {d.reuseRequestedBy?`By ${d.reuseRequestedBy}`:"Requested"}</span>
              </div>)}
            </Section>;
          })()}
        </>;
      })()}

      {/* ═══════════════════════════════════════════════════════
          MANAGER / APPROVER DASHBOARD — Bird's Eye View
         ═══════════════════════════════════════════════════════ */}
      {view==="dashboard"&&role==="approver"&&(()=>{
        const pendingApproval = deals.filter(d=>d.status==="pending"||d.status==="manager_approved");
        const disputed = deals.filter(d=>d.status==="disputed");
        const needPayment = deals.filter(d=>!["rejected","pending","renegotiate","paid","dropped","drop_requested"].includes(d.status)&&remaining(d)>0);
        const overdueDels = pendingDels.filter(d=>new Date(d.deadline)<new Date());
        return <>
          <div style={{marginBottom:"14px"}}><span style={{fontSize:"20px",fontWeight:800}}>✅ Command Center</span><span style={{fontSize:"13px",color:T.sub,marginLeft:"8px"}}>Full operational overview</span></div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:"8px",marginBottom:"16px"}}>
            <StatBox l="Committed" v={f(stats.committed)} c={T.gold}/>
            <StatBox l="Paid Out" v={f(stats.paid)} c={T.ok}/>
            <StatBox l="Outstanding" v={f(stats.committed-stats.paid)} c={T.warn}/>
            <StatBox l="Pending Approval" v={stats.pendingN} c={stats.pendingN>0?T.warn:T.ok}/>
            <StatBox l="Content Review" v={stats.awaitingReview} c={stats.awaitingReview>0?T.info:T.ok}/>
            <StatBox l="Disputes" v={stats.disputed} c={stats.disputed>0?T.err:T.ok}/>
            <StatBox l="Overdue Content" v={overdueDels.length} c={overdueDels.length>0?T.err:T.ok}/>
          </div>

          {/* APPROVAL QUEUE */}
          {pendingApproval.length>0&&<Section title={`Approval Queue (${pendingApproval.length})`} icon="⚡" action={<span style={{fontSize:"11px",color:T.err,fontWeight:700,animation:"pulse 1.5s infinite"}}>Action Required</span>}>
            {pendingApproval.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${d.status==="manager_approved"?T.info:T.warn}`,borderRadius:"2px",padding:"10px 12px",marginBottom:"6px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"all .12s"}}
              onMouseEnter={e=>e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.06)"}
              onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
              <div>
                <div style={{fontWeight:700,fontSize:"14px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400,fontSize:"13px"}}>· {d.platform} · {d.followers}</span></div>
                <div style={{fontSize:"11px",color:T.sub}}>{d.product} · {d.dels.length} deliverables · by {d.by} · {getCamp(d.cid)?.name||""}</div>
                <div style={{display:"flex",gap:"3px",marginTop:"4px"}}>{d.dels.map((dl,i)=><span key={i} style={{padding:"1px 5px",borderRadius:"2px",fontSize:"10px",fontWeight:600,background:d.status==="manager_approved"?T.infoBg:T.warnBg,color:d.status==="manager_approved"?T.info:T.warn}}>{dl.type}</span>)}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:"6px"}} onClick={e=>e.stopPropagation()}>
                <span style={{fontWeight:800,fontSize:"14px",color:T.gold}}>{fAmt(d.amount)}</span>
                <Btn v="ok" sm onClick={()=>setConfirmAction({title:"Approve Deal",msg:"Approve and lock "+fAmt(d.amount)+" for "+d.inf+"?",onConfirm:()=>{approveDeal(d);setConfirmAction(null)}})}>✓</Btn>
                <Btn v="outline" sm onClick={()=>setConfirmAction({title:"Request Renegotiation",msg:"Renegotiate "+d.inf+" deal?",onConfirm:()=>{renegDeal(d);setConfirmAction(null)}})}>↩</Btn>
                <Btn v="danger" sm onClick={()=>openRejectModal(d)}>✕</Btn>
              </div>
            </div>)}
          </Section>}

          {/* INVOICES AWAITING APPROVAL */}
          {(()=>{const pendingInvoices=deals.filter(d=>d.status==="invoice_pending_approval");return pendingInvoices.length>0&&<Section title={`Invoices Pending Approval (${pendingInvoices.length})`} icon="🧾" action={<span style={{fontSize:"11px",color:T.gold,fontWeight:700}}>Review Required</span>}>
            {pendingInvoices.map(d=><div key={d.id} style={{background:T.goldSoft,border:`1px solid ${T.gold}33`,borderLeft:`3px solid ${T.gold}`,borderRadius:"2px",padding:"11px 13px",marginBottom:"6px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:"14px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400}}>· {d.platform}</span></div>
                  <div style={{fontSize:"11px",color:T.sub,marginTop:"1px"}}>{d.product} · Invoice: {f(d.inv?.amount||d.amount)} · by {d.by}</div>
                  <div style={{fontSize:"12px",color:T.ok,marginTop:"4px",fontWeight:600}}>✓ Amount matches locked: {fAmt(d.amount)}</div>
                  {d.invoiceNumber&&<div style={{fontSize:"11px",color:T.sub}}>Invoice #: {d.invoiceNumber}</div>}
                </div>
                <div style={{display:"flex",gap:"6px"}}>
                  <Btn v="ok" sm onClick={()=>approveInvoice(d)}>✓ Approve & Send to Finance</Btn>
                  <Btn v="danger" sm onClick={()=>rejectInvoice(d)}>✕ Reject</Btn>
                </div>
              </div>
            </div>)}
          </Section>})()}

          {/* DROP REQUESTS — Manager must approve/reject */}
          {(()=>{const dropRequests=deals.filter(d=>d.status==="drop_requested");return dropRequests.length>0&&<Section title={`Drop Requests (${dropRequests.length})`} icon="🚫" action={<span style={{fontSize:"11px",color:T.warn,fontWeight:700}}>Needs Decision</span>}>
            {dropRequests.map(d=><div key={d.id} style={{background:T.errBg,border:`1px solid ${T.err}33`,borderLeft:`3px solid ${T.err}`,borderRadius:"2px",padding:"11px 13px",marginBottom:"6px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:"14px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400}}>· {d.platform}</span></div>
                  <div style={{fontSize:"11px",color:T.sub,marginTop:"1px"}}>{d.product} · {fAmt(d.amount)} · by {d.by}</div>
                  {(d.dropReason||d.renegotiation_note)&&<div style={{fontSize:"12px",color:T.err,marginTop:"4px",padding:"4px 8px",background:"rgba(180,35,24,.08)",borderRadius:"2px"}}>Reason: {d.dropReason||d.renegotiation_note}</div>}
                </div>
                <div style={{display:"flex",gap:"6px"}}>
                  <Btn v="ok" sm onClick={()=>approveDropRequest(d)}>✓ Approve Drop</Btn>
                  <Btn v="outline" sm onClick={()=>rejectDropRequest(d)}>✕ Reject</Btn>
                </div>
              </div>
            </div>)}
          </Section>})()}

          {/* CONTENT AWAITING REVIEW */}
          {awaitingReview.length>0&&<Section title={`Content Awaiting Review (${awaitingReview.length})`} icon="📤" action={<span style={{fontSize:"11px",color:T.info,fontWeight:700}}>Review Required</span>}>
            {awaitingReview.map((d,i)=>{const deal=deals.find(x=>x.id===d.dealId);return <div key={i} onClick={()=>{if(deal){setSel(deal);setModal("detail")}}} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${T.info}`,borderRadius:"2px",padding:"10px 12px",marginBottom:"6px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700,fontSize:"14px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400,fontSize:"13px"}}>· {d.platform}</span></div>
                <div style={{fontSize:"11px",color:T.sub}}>{d.type}: {d.desc||"—"} · {getCamp(d.cid)?.name||""}</div>
                {d.link&&<a href={ensureUrl(d.link)} target="_blank" rel="noreferrer" style={{fontSize:"11px",color:T.info,fontWeight:600}} onClick={e=>e.stopPropagation()}>🔗 View Content</a>}
              </div>
              <DBadge s="submitted"/>
            </div>;})}
          </Section>}

          {/* DISPUTES */}
          {disputed.length>0&&<Section title={`Active Disputes (${disputed.length})`} icon="⚠">
            {disputed.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.errBg,border:`1px solid ${T.err}33`,borderRadius:"2px",padding:"10px 12px",marginBottom:"5px",cursor:"pointer"}}>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontWeight:700,fontSize:"12px"}}>{d.inf}</span><span style={{fontSize:"13px",color:T.err,fontWeight:700}}>Invoice: {f(d.inv?.amount)} vs Approved: {fAmt(d.amount)}</span></div>
              <div style={{fontSize:"11px",color:T.sub,marginTop:"2px"}}>{d.inv?.note||"Mismatch detected"}</div>
            </div>)}
          </Section>}

          {/* LEGACY: Payment Requests (only shown if any old-flow deals still exist) */}
          {(()=>{
            const payReqs = deals.filter(d=>d.status==="payment_requested");
            return payReqs.length>0 && <Section title={`Legacy Payment Requests (${payReqs.length})`} icon="💸" action={<span style={{fontSize:"11px",color:T.sub,fontWeight:700}}>Auto-forwarded to Finance</span>}>
              <div style={{fontSize:"11px",color:T.sub,padding:"4px 0 8px",fontStyle:"italic"}}>These are from the old flow. They're now visible to Finance directly.</div>
              {payReqs.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${T.info}`,borderRadius:"2px",padding:"10px 12px",marginBottom:"6px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:"14px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400,fontSize:"13px"}}>· {fAmt(d.amount)}</span></div>
                  <div style={{fontSize:"11px",color:T.sub}}>{d.product} · PAN: {d.pan?.number||d.pan_number||"N/A"}</div>
                </div>
                <span style={{fontSize:"11px",color:T.ok,fontWeight:700}}>✓ In Finance Queue</span>
              </div>)}
            </Section>;
          })()}

          {/* PENDING SHIPMENTS */}
          {pendingShip.length>0&&<Section title={`Pending Shipments (${pendingShip.length})`} icon="📦">
            {pendingShip.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"8px 10px",marginBottom:"4px",fontSize:"13px",display:"flex",justifyContent:"space-between",cursor:"pointer"}}>
              <span><b>{d.inf}</b> · {d.product}</span><span style={{color:T.warn,fontWeight:700}}>Awaiting logistics</span>
            </div>)}
          </Section>}

          {/* PAYMENT OVERVIEW */}
          {needPayment.length>0&&<Section title={`Outstanding Payments (${needPayment.length})`} icon="💰" action={<span style={{fontSize:"11px",color:T.sub}}>{f(needPayment.reduce((s,d)=>s+remaining(d),0))} total outstanding</span>}>
            {needPayment.slice(0,8).map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"8px 10px",marginBottom:"4px",fontSize:"13px",display:"flex",justifyContent:"space-between",cursor:"pointer"}}>
              <div><b>{d.inf}</b> <span style={{color:T.sub}}>· {getCamp(d.cid)?.name||""}</span></div>
              <div><span style={{color:T.ok}}>{f(totalPaid(d))}</span> / <b>{fAmt(d.amount)}</b> <span style={{color:T.warn,fontWeight:700,marginLeft:"4px"}}>Due: {f(remaining(d))}</span></div>
            </div>)}
          </Section>}

          {/* OVERDUE DELIVERABLES */}
          {overdueDels.length>0&&<Section title="Overdue Deliverables" action={<span style={{fontSize:"11px",color:T.err,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase"}}>{overdueDels.length} overdue</span>}>
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px"}}>
              {overdueDels.map((d,i,arr)=><div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",borderBottom:i<arr.length-1?`1px solid ${T.borderSoft}`:"none",fontSize:"13px"}}>
                <span><b style={{fontWeight:600}}>{d.inf}</b> <span style={{color:T.sub}}>· {d.type}: {d.desc||"—"}</span></span><span style={{fontSize:"9px",letterSpacing:"1px",textTransform:"uppercase",color:T.err,fontWeight:700}}>Due {d.deadline}</span>
              </div>)}
            </div>
          </Section>}

          {/* CAMPAIGNS SUMMARY */}
          <Section title="🎯 Campaign Overview" icon="" action={<Btn v="ghost" sm onClick={()=>setView("campaigns")}>Manage →</Btn>}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:"14px"}}>
              {campaigns.map(c=>{const comm=campCommitted(c.id),pct=c.budget>0?Math.round(comm/c.budget*100):0;return <div key={c.id} onClick={()=>openCampDetail(c)} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"18px",cursor:"pointer"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:"10px"}}><span style={{fontWeight:600,fontSize:"14px"}}>{c.name}</span><span style={{fontFamily:T.display,fontSize:"16px",fontWeight:600,color:pct>90?T.err:T.text}}>{pct}%</span></div>
                <div style={{height:"6px",borderRadius:"3px",background:T.goldSoft,overflow:"hidden",marginBottom:"8px"}}><div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:pct>90?T.err:pct>70?T.gold:T.brand,borderRadius:"3px"}}/></div>
                <div style={{fontSize:"11px",color:T.sub}}>{f(comm)} / {f(c.budget)} · {campLocked(c.id)}/{c.target} influencers</div>
              </div>;})}
            </div>
          </Section>

          {/* CONTENT PIPELINE */}
          <Section title="Content Pipeline" icon="🎬">
            <ContentPipeline deals={deals} onClickDeal={d=>{setSel(d);setModal("detail")}}/>
          </Section>
        </>;
      })()}

      {/* ═══════════════════════════════════════════════════════
          FINANCE DASHBOARD — Payment Center
         ═══════════════════════════════════════════════════════ */}
      {((view==="dashboard"&&role==="finance")||(view==="payments"&&role==="admin"))&&(()=>{
        const pendingPayments = deals.filter(d=>["invoice_ok","payment_details_received","payment_requested","payment_approved","partial_paid"].includes(d.status)&&remaining(d)>0);
        const disputed = deals.filter(d=>d.status==="disputed");
        const advanceDue = deals.filter(d=>["approved","email_sent","acknowledged","shipped","delivered_prod"].includes(d.status)&&totalPaid(d)===0);
        const recentPaid = deals.filter(d=>d.status==="paid").slice(0,5);
        const totalOutstanding = deals.filter(d=>!["rejected","pending","renegotiate","paid","dropped","drop_requested"].includes(d.status)).reduce((s,d)=>s+remaining(d),0);

        // Payment schedule: group payable deals by due date
        const payableDeals = deals.filter(d=>!["rejected","pending","renegotiate","paid","dropped","drop_requested"].includes(d.status)&&remaining(d)>0);
        const today = new Date().toISOString().slice(0,10);
        const byDueDate = {};
        payableDeals.forEach(d=>{
          const key = d.paymentDueDate || "unscheduled";
          if(!byDueDate[key]) byDueDate[key]=[];
          byDueDate[key].push(d);
        });
        const dueDateKeys = Object.keys(byDueDate).filter(k=>k!=="unscheduled").sort();
        const overdueDates = dueDateKeys.filter(k=>k<today);
        const upcomingDates = dueDateKeys.filter(k=>k>=today);

        // TDS tracker: cumulative FY payments per influencer
        const fy = getCurrentFY();
        const infPayMap = {};
        deals.forEach(d=>{
          const fyPaid = (d.pays||[]).filter(p=>(p.date||"")>=fy.start&&(p.date||"")<=fy.end).reduce((s,p)=>s+p.amount,0);
          const fyCommitted = !["rejected","pending","renegotiate","dropped"].includes(d.status) ? d.amount : 0;
          if(!infPayMap[d.inf]) infPayMap[d.inf]={paid:0,committed:0,deals:0};
          infPayMap[d.inf].paid += fyPaid;
          infPayMap[d.inf].committed += fyCommitted;
          infPayMap[d.inf].deals += 1;
        });
        const tdsInfluencers = Object.entries(infPayMap).filter(([,v])=>v.paid>50000||v.committed>50000).sort((a,b)=>b[1].paid-a[1].paid);
        const nearingTDS = Object.entries(infPayMap).filter(([,v])=>v.paid<=50000&&v.paid>35000).sort((a,b)=>b[1].paid-a[1].paid);

        // Batch export helpers
        const toggleBatch = (id) => setBatchSelected(prev=>({...prev,[id]:!prev[id]}));
        const selectAllInGroup = (dls) => { const obj={}; dls.forEach(d=>{obj[d.id]=true}); setBatchSelected(prev=>({...prev,...obj})); };

        // Export to CSV
        const exportBatchCSV = () => {
          const selectedDeals = deals.filter(d=>batchSelected[d.id]);
          if(selectedDeals.length===0) return notify("No deals selected for export","err");
          const rows = [["Collab ID","Influencer","Platform","Product","Deal Amount","Already Paid","Amount Due","Payment Terms","Due Date","Account Holder","Account Number","IFSC","PAN","UPI ID","FY Total Paid","TDS Applicable","TDS Rate %","TDS Amount","Net Payable"]];
          selectedDeals.forEach(d=>{
            const inf = influencers.find(x=>x.name===d.inf);
            const rem = remaining(d);
            const fyTotal = getFYTotalForInfluencer(d.inf);
            const tdsApply = isTDSApplicable(d.inf, rem);
            const tdsAmt = tdsApply ? calcTDSAmount(rem, d.tdsRate||10) : 0;
            const netPay = rem - tdsAmt;
            const terms = d.payment_terms || inf?.defaultPaymentTerms || "next_15th";
            rows.push([
              d.collabId||d.id.slice(0,8), d.inf, d.platform||"", d.products?d.products.map(p=>p.name).join("+"):d.product,
              d.amount, totalPaid(d), rem, PAYMENT_TERMS_LABELS[terms]||terms, d.paymentDueDate||"Not set",
              inf?.bankHolder||"", inf?.bankAccount||"", inf?.bankIfsc||"", inf?.panNumber||d.pan_number||"",
              inf?.upiId||"", fyTotal, tdsApply?"Yes":"No", tdsApply?(d.tdsRate||10):0, tdsAmt, netPay
            ]);
          });
          const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
          const blob = new Blob(["﻿"+csv],{type:"text/csv;charset=utf-8;"});
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a"); a.href=url; a.download=`payment_batch_${today}.csv`; a.click();
          URL.revokeObjectURL(url);
          notify(`Exported ${selectedDeals.length} deals to CSV!`);
        };

        return <>
          <div style={{marginBottom:"22px",display:"flex",justifyContent:"space-between",alignItems:"flex-end",flexWrap:"wrap",gap:"12px"}}>
            <div>
              <div style={{fontSize:"10px",letterSpacing:"3px",textTransform:"uppercase",color:T.gold,fontWeight:600,marginBottom:"10px"}}>{f(totalOutstanding)} outstanding · {pendingPayments.length} ready to pay</div>
              <div style={{fontFamily:DISPLAY,fontSize:"32px",fontWeight:500,letterSpacing:"-0.5px"}}>Payment Center</div>
            </div>
            <div style={{display:"flex",gap:"8px"}}>
              {batchMode&&<Btn v="ok" sm onClick={exportBatchCSV}>Export {Object.values(batchSelected).filter(Boolean).length} Selected</Btn>}
              {batchMode&&<Btn v="primary" sm onClick={bulkGenerateInvoices}>Generate Invoices ({Object.values(batchSelected).filter(Boolean).length})</Btn>}
              <Btn v={batchMode?"danger":"gold"} sm onClick={()=>{setBatchMode(!batchMode);if(batchMode)setBatchSelected({})}}>{batchMode?"Exit Batch":"Batch Export"}</Btn>
            </div>
          </div>

          {/* Stat strip */}
          <div style={{display:"flex",borderTop:`1px solid ${T.border}`,borderBottom:`1px solid ${T.border}`,marginBottom:"24px",flexWrap:"wrap"}}>
            {[
              {l:"Total Outstanding",v:f(totalOutstanding),c:T.err},
              {l:"Ready to Pay",v:pendingPayments.length,c:pendingPayments.length>0?T.warn:"#C9C1B2"},
              {l:"Disputes",v:disputed.length,c:disputed.length>0?T.err:"#C9C1B2"},
              {l:`TDS · ${fy.label}`,v:tdsInfluencers.length,c:tdsInfluencers.length>0?T.purple:"#C9C1B2"},
              {l:"Overdue",v:overdueDates.reduce((s,k)=>s+byDueDate[k].length,0),c:overdueDates.length>0?T.err:"#C9C1B2"},
            ].map((m,i,arr)=><div key={i} style={{flex:"1 1 140px",padding:"18px 22px",borderRight:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
              <div style={{fontSize:"10px",letterSpacing:"2px",textTransform:"uppercase",color:T.sub,marginBottom:"8px"}}>{m.l}</div>
              <div style={{fontFamily:DISPLAY,fontSize:"32px",fontWeight:500,lineHeight:1,color:m.c}}>{m.v}</div>
            </div>)}
          </div>

          {/* Tab navigation */}
          <div style={{display:"flex",gap:"24px",marginBottom:"22px",borderBottom:`1px solid ${T.border}`}}>
            {[{k:"pay",l:"Pay",n:pendingPayments.length},{k:"schedule",l:"Schedule",n:payableDeals.length},{k:"tds",l:"TDS",n:tdsInfluencers.length},{k:"disputes",l:"Disputes",n:disputed.length}].map(t=>
              <div key={t.k} onClick={()=>setFinanceTab(t.k)} style={{fontSize:"12px",letterSpacing:"1px",textTransform:"uppercase",fontWeight:700,cursor:"pointer",color:financeTab===t.k?T.brand:T.sub,borderBottom:financeTab===t.k?`2px solid ${T.brand}`:"2px solid transparent",paddingBottom:"12px"}}>{t.l}{t.n>0?<span style={{color:T.gold,marginLeft:"5px"}}>{t.n}</span>:""}</div>
            )}
          </div>

          {/* ── TAB: READY TO PAY ── */}
          {financeTab==="pay"&&<>
            {pendingPayments.length===0&&<div style={{fontSize:"13px",color:T.sub,padding:"20px 0",textAlign:"center"}}>No invoices pending payment</div>}
            {batchMode&&pendingPayments.length>0&&<div style={{marginBottom:"12px"}}><Btn v="outline" sm onClick={()=>selectAllInGroup(pendingPayments)}>Select All ({pendingPayments.length})</Btn></div>}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(360px,1fr))",gap:"18px"}}>
              {pendingPayments.map(d=>{
                const paid=totalPaid(d),rem=remaining(d);
                const inf = influencers.find(x=>x.name===d.inf);
                const tdsApply = isTDSApplicable(d.inf, rem);
                const tdsAmt = tdsApply ? calcTDSAmount(rem, d.tdsRate||10) : 0;
                const net = rem - tdsAmt;
                const isAgency = d.agencyManaged;
                const overdue = d.paymentDueDate && d.paymentDueDate < today;
                const panOk = !!((isAgency?d.paymentDetails?.pan:null)||inf?.panNumber||d.pan_number);
                const method = inf?.upiId?`UPI · ${inf.upiId}`:inf?.bankHolder?`Bank · ${inf.bankHolder}`:"Payment details pending";
                return <div key={d.id} style={{background:T.surface,border:`1px solid ${batchSelected[d.id]?T.gold:T.border}`,borderRadius:"2px",padding:"22px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"16px"}}>
                    <div onClick={()=>{setSel(d);setModal("detail")}} style={{cursor:"pointer",display:"flex",gap:"8px",alignItems:"flex-start"}}>
                      {batchMode&&<input type="checkbox" checked={!!batchSelected[d.id]} onChange={e=>{e.stopPropagation();toggleBatch(d.id)}} style={{marginTop:"6px",cursor:"pointer"}}/>}
                      <div>
                        <div style={{fontFamily:DISPLAY,fontSize:"19px",fontWeight:600}}>{d.inf}</div>
                        <div style={{fontSize:"10px",color:T.sub,marginTop:"3px"}}>{d.products?d.products.map(p=>p.name).join(", "):d.product}{isAgency?<> · <span style={{color:T.gold}}>Agency: {d.paymentDetails?.beneficiary||d.agencyName||"agency"}</span></>:` · ${inf?.upiId?"UPI":"Bank"} · ${panOk?"PAN verified":"PAN missing"}`}</div>
                      </div>
                    </div>
                    <span style={{fontSize:"9px",letterSpacing:"1px",textTransform:"uppercase",fontWeight:700,padding:"3px 8px",borderRadius:"2px",flex:"none",...(isAgency?{color:T.gold,background:"#F6DFC1"}:overdue?{color:"#B42318",background:"#FDE8E8"}:{color:T.sub,background:"#F2EEE4"})}}>{isAgency?"Agency":overdue?"Overdue":"Due"}</span>
                  </div>
                  <div style={{display:"flex",borderTop:`1px solid ${T.borderSoft}`,borderBottom:`1px solid ${T.borderSoft}`,marginBottom:"16px"}}>
                    <div style={{flex:1,padding:"12px 0",borderRight:`1px solid ${T.borderSoft}`}}><div style={{fontSize:"9px",letterSpacing:"1px",textTransform:"uppercase",color:T.sub,marginBottom:"4px"}}>Locked</div><div style={{fontFamily:DISPLAY,fontSize:"18px",fontWeight:600}}>{fAmt(d.amount)}</div></div>
                    {isAgency
                      ? <div style={{flex:1,padding:"12px 0 12px 14px",borderRight:`1px solid ${T.borderSoft}`}}><div style={{fontSize:"9px",letterSpacing:"1px",textTransform:"uppercase",color:T.sub,marginBottom:"4px"}}>GST inv.</div>{d.agencyInvoiceUrl?<a href={d.agencyInvoiceUrl} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:"11px",fontWeight:600,color:"#0F5BA7",textDecoration:"none"}}>View invoice</a>:<span style={{fontSize:"11px",color:T.faint}}>—</span>}</div>
                      : <div style={{flex:1,padding:"12px 0 12px 14px",borderRight:`1px solid ${T.borderSoft}`}}><div style={{fontSize:"9px",letterSpacing:"1px",textTransform:"uppercase",color:T.sub,marginBottom:"4px"}}>{tdsApply?`TDS ${d.tdsRate||10}%`:"TDS"}</div><div style={{fontFamily:DISPLAY,fontSize:"18px",fontWeight:600,color:tdsApply?T.text:T.faint}}>{tdsApply?f(tdsAmt):"—"}</div></div>}
                    {isAgency
                      ? <div style={{flex:1,padding:"12px 0 12px 14px"}}><div style={{fontSize:"9px",letterSpacing:"1px",textTransform:"uppercase",color:T.sub,marginBottom:"4px"}}>Pay to</div><div style={{fontSize:"11px",fontWeight:600,marginTop:"4px"}}>{d.paymentDetails?.beneficiary||d.agencyName||"Agency"}</div></div>
                      : <div style={{flex:1,padding:"12px 0 12px 14px"}}><div style={{fontSize:"9px",letterSpacing:"1px",textTransform:"uppercase",color:T.sub,marginBottom:"4px"}}>Net payable</div><div style={{fontFamily:DISPLAY,fontSize:"18px",fontWeight:600,color:T.brand}}>{f(net)}</div></div>}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:"10px"}}>
                    <span style={{fontSize:"11px",color:T.sub,fontFamily:DISPLAY}}>{isAgency?`Due ${d.paymentDueDate?new Date(d.paymentDueDate).toLocaleDateString("en-IN",{day:"numeric",month:"short"}):"—"} · skips form`:method}</span>
                    <span onClick={()=>{setSel(d);setPayF({type:"final",amount:String(rem),note:isAgency?"Paying agency":"Paying on matched invoice"});setModal("payment")}} style={{fontSize:"11px",letterSpacing:"1.5px",textTransform:"uppercase",fontWeight:700,color:"#fff",background:T.brand,padding:"9px 22px",borderRadius:"2px",cursor:"pointer",flex:"none"}}>{isAgency?"Pay Agency":`Pay ${f(net)}`}</span>
                  </div>
                </div>;
              })}
            </div>

            {/* TDS watch banner */}
            {tdsInfluencers.length>0&&<div style={{background:"#FBF7F0",border:"1px solid #E6D9C2",borderRadius:"2px",padding:"16px 20px",marginTop:"18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"12px",flexWrap:"wrap"}}>
              <div style={{fontSize:"12px",color:"#3a342c"}}><b style={{fontFamily:DISPLAY}}>TDS watch · </b>{tdsInfluencers.length} creator{tdsInfluencers.length===1?" has":"s have"} crossed {f(50000)} cumulative this FY — 10% deducted automatically.</div>
              <span onClick={()=>setFinanceTab("tds")} style={{fontSize:"10px",letterSpacing:"1.5px",textTransform:"uppercase",fontWeight:700,color:T.gold,cursor:"pointer"}}>View TDS tracker →</span>
            </div>}

            {/* Advances Due */}
            {advanceDue.length>0&&<Section title={`Advance Payments Pending (${advanceDue.length})`} icon="⏰">
              {advanceDue.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"8px 10px",marginBottom:"4px",fontSize:"13px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
                <div><b>{d.inf}</b> <span style={{color:T.sub}}>· {fAmt(d.amount)} · {d.status==="approved"?"Just approved":d.status==="shipped"?"Product shipped":"In progress"}</span></div>
                <Btn v="outline" sm onClick={(e)=>{e.stopPropagation();setSel(d);setPayF({type:"advance",amount:"",note:""});setModal("payment")}}>Record Advance</Btn>
              </div>)}
            </Section>}

            {/* Recently Completed */}
            <Section title="Recently Completed" icon="✅">
              {recentPaid.length===0&&<div style={{fontSize:"13px",color:T.sub,padding:"8px 0"}}>No completed payments yet</div>}
              {recentPaid.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"8px 10px",marginBottom:"3px",fontSize:"13px",display:"flex",justifyContent:"space-between",opacity:.85,cursor:"pointer"}} onMouseEnter={e=>{e.currentTarget.style.opacity="1"}} onMouseLeave={e=>{e.currentTarget.style.opacity=".85"}}>
                <span><b>{d.inf}</b> · {getCamp(d.cid)?.name||""}</span>
                <span style={{color:T.ok,fontWeight:700}}>⭐ {fAmt(d.amount)} paid</span>
              </div>)}
            </Section>
          </>}

          {/* ── TAB: PAYMENT SCHEDULE ── */}
          {financeTab==="schedule"&&<>
            {batchMode&&payableDeals.length>0&&<div style={{marginBottom:"8px",display:"flex",gap:"6px"}}><Btn v="outline" sm onClick={()=>selectAllInGroup(payableDeals)}>Select All ({payableDeals.length})</Btn></div>}
            {/* Overdue */}
            {overdueDates.map(dateKey=><Section key={dateKey} title={`⚠ OVERDUE — ${new Date(dateKey).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}`} icon="" action={<span style={{fontSize:"11px",color:T.err,fontWeight:700}}>{byDueDate[dateKey].length} deal{byDueDate[dateKey].length>1?"s":""} · {f(byDueDate[dateKey].reduce((s,d)=>s+remaining(d),0))}</span>}>
              {byDueDate[dateKey].map(d=><div key={d.id} style={{background:T.errBg,border:`1px solid ${T.err}22`,borderRadius:"2px",padding:"8px 10px",marginBottom:"4px",fontSize:"13px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}} onClick={()=>{setSel(d);setModal("detail")}}>
                <div style={{display:"flex",alignItems:"center",gap:"6px"}}>{batchMode&&<input type="checkbox" checked={!!batchSelected[d.id]} onChange={e=>{e.stopPropagation();toggleBatch(d.id)}} style={{cursor:"pointer"}}/>}<div><b>{d.inf}</b> <span style={{color:T.sub}}>· {d.product}</span></div></div>
                <div style={{textAlign:"right"}}><span style={{color:T.err,fontWeight:700}}>{f(remaining(d))} due</span></div>
              </div>)}
            </Section>)}
            {/* Upcoming */}
            {upcomingDates.map(dateKey=><Section key={dateKey} title={`📅 ${new Date(dateKey).toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short",year:"numeric"})}`} icon="" action={<span style={{fontSize:"11px",color:T.sub,fontWeight:700}}>{byDueDate[dateKey].length} deal{byDueDate[dateKey].length>1?"s":""} · {f(byDueDate[dateKey].reduce((s,d)=>s+remaining(d),0))}</span>}>
              {byDueDate[dateKey].map(d=>{const inf=influencers.find(x=>x.name===d.inf);return <div key={d.id} style={{background:T.surface,border:`1px solid ${batchSelected[d.id]?T.gold:T.border}`,borderRadius:"2px",padding:"8px 10px",marginBottom:"4px",fontSize:"13px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}} onClick={()=>{setSel(d);setModal("detail")}}>
                <div style={{display:"flex",alignItems:"center",gap:"6px"}}>{batchMode&&<input type="checkbox" checked={!!batchSelected[d.id]} onChange={e=>{e.stopPropagation();toggleBatch(d.id)}} style={{cursor:"pointer"}}/>}<div><b>{d.inf}</b> <span style={{color:T.sub}}>· {d.product} · {PAYMENT_TERMS_LABELS[d.payment_terms||inf?.defaultPaymentTerms||"next_15th"]||""}</span></div></div>
                <div style={{display:"flex",alignItems:"center",gap:"6px"}}><span style={{fontWeight:700}}>{f(remaining(d))}</span>{isTDSApplicable(d.inf,remaining(d))&&<span style={{padding:"1px 5px",borderRadius:"3px",fontSize:"9px",fontWeight:700,background:"#f5f3ff",color:"#7c3aed"}}>TDS</span>}{["invoice_ok","payment_requested","payment_approved","partial_paid"].includes(d.status)&&<Btn v="ok" sm onClick={e=>{e.stopPropagation();setSel(d);setPayF({type:"final",amount:String(remaining(d)),note:"Paid ahead of due date"});setModal("payment")}}>Pay now</Btn>}</div>
              </div>;})}
            </Section>)}
            {/* Unscheduled */}
            {byDueDate.unscheduled&&byDueDate.unscheduled.length>0&&<Section title={`Unscheduled (${byDueDate.unscheduled.length})`} icon="❓" action={<span style={{fontSize:"11px",color:T.sub}}>No due date set</span>}>
              {byDueDate.unscheduled.map(d=><div key={d.id} style={{background:T.surface,border:`1px solid ${batchSelected[d.id]?T.gold:T.border}`,borderRadius:"2px",padding:"8px 10px",marginBottom:"4px",fontSize:"13px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}} onClick={()=>{setSel(d);setModal("detail")}}>
                <div style={{display:"flex",alignItems:"center",gap:"6px"}}>{batchMode&&<input type="checkbox" checked={!!batchSelected[d.id]} onChange={e=>{e.stopPropagation();toggleBatch(d.id)}} style={{cursor:"pointer"}}/>}<div><b>{d.inf}</b> <span style={{color:T.sub}}>· {d.product} · <Badge s={d.status} sm/></span></div></div>
                <span style={{fontWeight:700}}>{f(remaining(d))}</span>
              </div>)}
            </Section>}
            {payableDeals.length===0&&<div style={{fontSize:"13px",color:T.sub,padding:"20px 0",textAlign:"center"}}>No outstanding payments</div>}
          </>}

          {/* ── TAB: TDS TRACKER ── */}
          {financeTab==="tds"&&<>
            <div style={{padding:"10px 12px",background:"#f5f3ff",border:"1px solid #c4b5fd",borderRadius:"2px",marginBottom:"14px",fontSize:"12px",color:"#5b21b6"}}>
              <b>TDS Rule:</b> 10% TDS applies on payments to any creator whose cumulative financial transactions exceed ₹50,000 in {fy.label} (Apr 1 – Mar 31). Rate can be overridden per deal if invoice specifies otherwise.
            </div>

            {tdsInfluencers.length>0&&<Section title={`TDS Applicable — Above ₹50K (${tdsInfluencers.length})`} icon="🏛️">
              {tdsInfluencers.map(([name,data])=>{const inf=influencers.find(x=>x.name===name);return <div key={name} onClick={()=>{if(inf)setInfProfile(inf)}} style={{background:T.surface,border:"1px solid #c4b5fd",borderLeft:"3px solid #7c3aed",borderRadius:"2px",padding:"10px 12px",marginBottom:"6px",cursor:inf?"pointer":"default"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:"14px"}}>{name}</div>
                    <div style={{fontSize:"11px",color:T.sub}}>{data.deals} deals in {fy.label} · PAN: <b style={{fontFamily:"monospace"}}>{inf?.panNumber||"Not on file"}</b></div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:"13px",fontWeight:800,color:"#7c3aed"}}>{f(data.paid)} paid</div>
                    <div style={{fontSize:"11px",color:T.sub}}>Committed: {f(data.committed)}</div>
                  </div>
                </div>
                {!inf?.panNumber&&<div style={{fontSize:"10px",color:T.err,marginTop:"4px",fontWeight:700}}>⚠ PAN missing — required for TDS deduction</div>}
              </div>;})}
            </Section>}

            {nearingTDS.length>0&&<Section title={`Nearing Threshold — ₹35K-50K (${nearingTDS.length})`} icon="⚡" action={<span style={{fontSize:"11px",color:T.warn,fontWeight:700}}>Watch list</span>}>
              {nearingTDS.map(([name,data])=>{const inf=influencers.find(x=>x.name===name);const pct=Math.round(data.paid/50000*100);return <div key={name} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"8px 10px",marginBottom:"4px",fontSize:"13px"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}><b>{name}</b><span style={{color:T.warn,fontWeight:700}}>{f(data.paid)} / {f(50000)} ({pct}%)</span></div>
                <div style={{height:"4px",borderRadius:"2px",background:T.border}}><div style={{height:"100%",width:`${pct}%`,background:pct>90?"#ef4444":"#f59e0b",borderRadius:"2px"}}/></div>
              </div>;})}
            </Section>}

            {tdsInfluencers.length===0&&nearingTDS.length===0&&<div style={{fontSize:"13px",color:T.sub,padding:"20px 0",textAlign:"center"}}>No influencers have crossed or are nearing the ₹50K TDS threshold in {fy.label}</div>}
          </>}

          {/* ── TAB: DISPUTES ── */}
          {financeTab==="disputes"&&<>
            {disputed.length===0&&<div style={{fontSize:"13px",color:T.sub,padding:"20px 0",textAlign:"center"}}>No active disputes</div>}
            {disputed.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.errBg,border:`1px solid ${T.err}33`,borderLeft:`3px solid ${T.err}`,borderRadius:"2px",padding:"11px 13px",marginBottom:"6px",cursor:"pointer"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:"14px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400}}>· {d.platform}</span></div>
                  <div style={{fontSize:"11px",color:T.sub,marginTop:"1px"}}>{d.product} · {getCamp(d.cid)?.name||""}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:"11px",color:T.err,fontWeight:700}}>Invoice: {f(d.inv?.amount)}</div>
                  <div style={{fontSize:"11px",color:T.ok,fontWeight:700}}>Approved: {fAmt(d.amount)}</div>
                  <div style={{fontSize:"11px",color:T.err}}>Δ {f(Math.abs((d.inv?.amount||0)-d.amount))}</div>
                </div>
              </div>
              {d.inv?.note&&<div style={{fontSize:"11px",color:T.err,marginTop:"4px",fontStyle:"italic"}}>{d.inv.note}</div>}
            </div>)}
          </>}

        </>;
      })()}

      {/* ═══════════════════════════════════════════════════════
          LOGISTICS DASHBOARD — Shipment Center
         ═══════════════════════════════════════════════════════ */}
      {view==="dashboard"&&role==="logistics"&&(()=>{
        const delivered = deals.filter(d=>d.ship?.st==="delivered");
        const totalActions = pendingShip.length + pickupRequests.length + reshipPending.length;
        return <>
          <div style={{marginBottom:"14px"}}><span style={{fontSize:"30px",fontWeight:500,fontFamily:DISPLAY,letterSpacing:"-0.5px"}}>Shipment Center</span><span style={{fontSize:"13px",color:T.sub,marginLeft:"8px"}}>Dispatch, track, pickups & re-shipments</span></div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:"8px",marginBottom:"16px"}}>
            <StatBox l="Awaiting Ack" v={awaitingAck.length} c={awaitingAck.length>0?"#f59e0b":T.ok} sub="Influencer must confirm"/>
            <StatBox l="Ready to Ship" v={pendingShip.length} c={pendingShip.length>0?T.err:T.ok} sub="Ship these now"/>
            <StatBox l="In Transit" v={inTransit.length} c={inTransit.length>0?T.purple:T.ok}/>
            <StatBox l="Pickup Requests" v={pickupRequests.length} c={pickupRequests.length>0?T.warn:T.ok} sub="Arrange returns"/>
            <StatBox l="Re-ship Pending" v={reshipPending.length} c={reshipPending.length>0?T.err:T.ok} sub="New products to send"/>
            <StatBox l="Delivered" v={delivered.length} c={T.ok}/>
          </div>

          {/* AWAITING ACKNOWLEDGEMENT */}
          {awaitingAck.length>0&&<Section title={`Awaiting Acknowledgement (${awaitingAck.length})`} icon="⏳">
            <div style={{fontSize:"12px",color:"#92400e",background:"#fef3c7",padding:"8px 10px",borderRadius:"2px",marginBottom:"8px"}}>These influencers haven't confirmed via email yet. Dispatch is blocked until they click "I Agree to the Terms".</div>
            {awaitingAck.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:"3px solid #f59e0b",borderRadius:"2px",padding:"8px 12px",marginBottom:"4px",fontSize:"13px",display:"flex",justifyContent:"space-between",cursor:"pointer"}}>
              <span><b>{d.inf}</b> · {d.product} · {getCamp(d.cid)?.name||""}</span>
              <span style={{color:"#92400e",fontWeight:700,fontSize:"11px"}}>⏳ Pending</span>
            </div>)}
          </Section>}

          {/* DISPATCH QUEUE */}
          <Section title={`Ready to Dispatch (${pendingShip.length})`} icon="⚡" action={pendingShip.length>0?<span style={{fontSize:"11px",color:T.err,fontWeight:700,animation:"pulse 1.5s infinite"}}>Action Required</span>:null}>
            {pendingShip.length===0&&<div style={{fontSize:"13px",color:T.sub,padding:"10px 0"}}>All products dispatched!</div>}
            {pendingShip.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${T.err}`,borderRadius:"2px",padding:"12px 14px",marginBottom:"7px",cursor:"pointer"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"6px"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:"13px"}}>{d.inf}</div>
                  <div style={{fontSize:"13px",color:T.sub,marginTop:"2px"}}>📦 <b>{d.products?d.products.map(p=>p.name).join(", "):d.product}</b></div>
                </div>
                <Btn v="purple" onClick={(e)=>{e.stopPropagation();setSel(d);setShipF({track:"",carrier:"DTDC",orderId:""});setModal("ship")}}>📦 Dispatch Now</Btn>
              </div>
              <div style={{padding:"8px 10px",background:T.purpleBg,borderRadius:"2px",fontSize:"12px",color:T.purple}}>
                <div>📍 <b>Ship to:</b> {d.address||"Address not provided"}</div>
                <div style={{marginTop:"2px"}}>📱 <b>Phone:</b> {d.phone||"Not provided"}</div>
                {pocNameFor(d.inf)&&<div style={{marginTop:"2px"}}>🧑‍💼 <b>POC:</b> {pocNameFor(d.inf)}</div>}
              </div>
              <div style={{fontSize:"11px",color:T.sub,marginTop:"4px"}}>Approved: {d.appAt} · Deadline: {d.deadline}</div>
            </div>)}
          </Section>

          {/* PICKUP REQUESTS */}
          {pickupRequests.length>0&&<Section title={`Pickup Requests (${pickupRequests.length})`} icon="🔄" action={<span style={{fontSize:"11px",color:T.warn,fontWeight:700}}>Arrange Returns</span>}>
            {pickupRequests.map((h,idx)=>{
              const deal = deals.find(d=>d.id===h.dealId);
              return <div key={h.dealId+"-"+h.histIdx} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${T.warn}`,borderRadius:"2px",padding:"12px 14px",marginBottom:"7px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"6px"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:"13px"}}>{h.inf} <span style={{fontSize:"11px",fontWeight:400,color:T.sub}}>· Pickup</span></div>
                    <div style={{fontSize:"12px",color:T.warn,fontWeight:600,marginTop:"2px"}}>Reason: {h.reason}</div>
                    {h.note&&<div style={{fontSize:"12px",color:T.sub,marginTop:"1px"}}>{h.note}</div>}
                    <div style={{fontSize:"13px",color:T.sub,marginTop:"2px"}}>📦 {h.products?h.products.map(p=>p.name).join(", "):h.product}</div>
                  </div>
                  <Btn v="gold" onClick={()=>{setSel(deal);setShipF({track:"",carrier:"DTDC",orderId:""});setModal("arrangePickup-"+h.histIdx)}}>🔄 Arrange Pickup</Btn>
                </div>
                <div style={{padding:"8px 10px",background:T.warnBg,borderRadius:"2px",fontSize:"12px",color:T.warn}}>
                  <div>📍 <b>Pickup from:</b> {h.address||"Address not provided"}</div>
                  <div style={{marginTop:"2px"}}>📱 <b>Phone:</b> {h.phone||"Not provided"}</div>
                </div>
                <div style={{fontSize:"11px",color:T.sub,marginTop:"4px"}}>Requested by {h.requestedBy} · {new Date(h.requestedAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
              </div>;
            })}
          </Section>}

          {/* PICKUPS IN TRANSIT */}
          {pickupsInTransit.length>0&&<Section title={`Return Pickups In Transit (${pickupsInTransit.length})`} icon="📮">
            {pickupsInTransit.map(h=>{
              const deal = deals.find(d=>d.id===h.dealId);
              return <div key={h.dealId+"-"+h.histIdx} style={{background:T.warnBg,border:`1px solid ${T.warn}22`,borderRadius:"2px",padding:"11px 13px",marginBottom:"6px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:"14px"}}>{h.inf} <span style={{color:T.sub,fontWeight:400}}>· Return</span></div>
                  <div style={{fontSize:"13px",marginTop:"2px"}}>{h.returnCarrier}: <span style={{color:T.info,fontWeight:700}}>{h.returnTrack}</span></div>
                  <div style={{fontSize:"11px",color:T.sub}}>Arranged: {new Date(h.arrangedAt).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</div>
                </div>
                <Btn v="ok" onClick={()=>{markProductReturned(deal,h.histIdx)}}>✓ Product Returned</Btn>
              </div>;
            })}
          </Section>}

          {/* RE-SHIPMENT PENDING */}
          {reshipPending.length>0&&<Section title={`Re-shipments Pending (${reshipPending.length})`} icon="📦" action={<span style={{fontSize:"11px",color:T.err,fontWeight:700,animation:"pulse 1.5s infinite"}}>Ship New Products</span>}>
            {reshipPending.map(h=>{
              const deal = deals.find(d=>d.id===h.dealId);
              return <div key={h.dealId+"-"+h.histIdx} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${T.purple}`,borderRadius:"2px",padding:"12px 14px",marginBottom:"7px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"6px"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:"13px"}}>{h.inf} <span style={{fontSize:"11px",fontWeight:400,color:T.sub}}>· Re-shipment</span></div>
                    <div style={{fontSize:"13px",color:T.sub,marginTop:"2px"}}>📦 <b>{(h.products||[]).map(p=>p.name).join(", ")}</b></div>
                    {h.note&&<div style={{fontSize:"12px",color:T.sub,marginTop:"1px"}}>{h.note}</div>}
                  </div>
                  <Btn v="purple" onClick={()=>{setSel(deal);setReshipShipF({track:"",carrier:"DTDC",orderId:""});setModal("reshipDispatch-"+h.histIdx)}}>📦 Dispatch</Btn>
                </div>
                <div style={{padding:"8px 10px",background:T.purpleBg,borderRadius:"2px",fontSize:"12px",color:T.purple}}>
                  <div>📍 <b>Ship to:</b> {h.address||"Address not provided"}</div>
                  <div style={{marginTop:"2px"}}>📱 <b>Phone:</b> {h.phone||"Not provided"}</div>
                </div>
                {(h.products||[]).length>0&&<div style={{marginTop:"6px",padding:"8px",background:T.surfaceAlt,borderRadius:"2px",fontSize:"11px"}}>
                  <div style={{fontWeight:700,marginBottom:"4px"}}>Items to pack & ship:</div>
                  {h.products.map((p,i)=><div key={i}><b>{p.name}</b>{p.color?" · "+p.color:""}{p.cut?" · "+p.cut:""}{p.size?" · "+p.size:""}{p.qty?" · Qty: "+p.qty:""}</div>)}
                </div>}
                <div style={{fontSize:"11px",color:T.sub,marginTop:"4px"}}>Requested by {h.requestedBy} · {new Date(h.requestedAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
              </div>;
            })}
          </Section>}

          {/* RE-SHIPMENTS IN TRANSIT */}
          {reshipInTransit.length>0&&<Section title={`Re-shipments In Transit (${reshipInTransit.length})`} icon="🚚">
            {reshipInTransit.map(h=>{
              const deal = deals.find(d=>d.id===h.dealId);
              return <div key={h.dealId+"-"+h.histIdx} style={{background:T.purpleBg,border:`1px solid ${T.purple}22`,borderRadius:"2px",padding:"11px 13px",marginBottom:"6px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:"14px"}}>{h.inf} <span style={{color:T.sub,fontWeight:400}}>· Re-shipment</span></div>
                  <div style={{fontSize:"13px",marginTop:"2px"}}>{h.reCarrier}: <span style={{color:T.info,fontWeight:700}}>{h.reTrack}</span></div>
                  <div style={{fontSize:"11px",color:T.sub}}>Dispatched: {new Date(h.reDispatchedAt).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</div>
                </div>
                <Btn v="ok" onClick={()=>{setSel(deal);setReshipDelivF({date:todayLocal(),note:"",histIdx:h.histIdx});setModal("markReshipDelivered")}}>✓ Mark Delivered</Btn>
              </div>;
            })}
          </Section>}

          {/* IN TRANSIT (original shipments) */}
          <Section title={`In Transit (${inTransit.length})`} icon="🚚">
            {inTransit.length===0&&<div style={{fontSize:"13px",color:T.sub,padding:"8px 0"}}>Nothing in transit</div>}
            {inTransit.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.purpleBg,border:`1px solid ${T.purple}22`,borderRadius:"2px",padding:"11px 13px",marginBottom:"6px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
              <div>
                <div style={{fontWeight:700,fontSize:"14px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400}}>· {d.products?d.products.map(p=>p.name).join(", "):d.product}</span></div>
                <div style={{fontSize:"13px",marginTop:"2px"}}>{d.ship.carrier}: <span style={{color:T.info,fontWeight:700}}>{d.ship.track}</span></div>
                <div style={{fontSize:"11px",color:T.sub}}>Dispatched: {d.ship.dispAt}{pocNameFor(d.inf)?` · POC: ${pocNameFor(d.inf)}`:""}</div>
              </div>
              <Btn v="ok" onClick={(e)=>{e.stopPropagation();setSel(d);setDeliveryF({date:todayLocal(),note:""});setModal("markDelivered")}}>✓ Mark Delivered</Btn>
            </div>)}
          </Section>

          {/* DELIVERED */}
          <Section title={`Delivered (${delivered.length})`} icon="✅">
            {delivered.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"8px 10px",marginBottom:"3px",fontSize:"13px",display:"flex",justifyContent:"space-between",opacity:.65,cursor:"pointer"}}>
              <span><b>{d.inf}</b> · {d.products?d.products.map(p=>p.name).join(", "):d.product} · {d.ship.carrier}: {d.ship.track}</span>
              <span style={{color:T.ok}}>✓ {d.ship.delAt}</span>
            </div>)}
          </Section>

          {/* PRODUCT CATALOG MANAGEMENT */}
          <Section title="Product Catalog" icon="📦" action={(role==='logistics'||role==='admin')&&<Btn v="gold" sm onClick={()=>{setShowProductMgmt(!showProductMgmt);setEditingProduct(null)}}>{showProductMgmt?"Close":"⚙ Manage Products"}</Btn>}>
            {showProductMgmt&&<div style={{background:T.surfaceAlt,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"14px",marginBottom:"12px"}}>
              <div style={{fontSize:"12px",fontWeight:700,marginBottom:"8px"}}>Add New Product</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr auto",gap:"6px",alignItems:"end"}}>
                <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub}}>Name</label><Inp value={newProduct.name} onChange={e=>setNewProduct({...newProduct,name:e.target.value})} placeholder="Product name"/></div>
                <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub}}>Sizes (comma-sep)</label><Inp value={newProduct.sizes} onChange={e=>setNewProduct({...newProduct,sizes:e.target.value})} placeholder="XS,S,M,L,XL"/></div>
                <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub}}>Colors (comma-sep)</label><Inp value={newProduct.colors} onChange={e=>setNewProduct({...newProduct,colors:e.target.value})} placeholder="Black,Beige"/></div>
                <Btn v="ok" sm onClick={()=>{
                  if(!newProduct.name) return notify("Product name required","err");
                  if(productCatalog.some(x=>x.name.toLowerCase()===newProduct.name.trim().toLowerCase())) return notify("Product already exists","err");
                  const p = {id:uid(),name:newProduct.name.trim(),sizes:newProduct.sizes.split(',').map(s=>s.trim()).filter(Boolean),colors:newProduct.colors.split(',').map(s=>s.trim()).filter(Boolean)};
                  setProductCatalog(prev=>[...prev,p]);
                  setNewProduct({name:'',sizes:'',colors:''});
                  notify("Product added!");
                }}>+ Add</Btn>
              </div>
            </div>}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:"8px"}}>
              {productCatalog.map(p=><div key={p.id} style={{background:T.surface,border:`1px solid ${editingProduct===p.id?T.gold:T.border}`,borderRadius:"2px",padding:"10px",transition:"border-color 0.2s"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontWeight:700,fontSize:"13px"}}>{p.name}</div>
                  {showProductMgmt&&<div style={{display:"flex",gap:"4px"}}>
                    <Btn v="gold" sm onClick={()=>{setEditingProduct(editingProduct===p.id?null:p.id);setEditVariant({size:'',color:''})}}>{editingProduct===p.id?"Done":"Edit"}</Btn>
                    <Btn v="danger" sm onClick={()=>{if(confirm("Remove "+p.name+"?"))setProductCatalog(prev=>prev.filter(x=>x.id!==p.id))}}>✕</Btn>
                  </div>}
                </div>
                <div style={{fontSize:"11px",color:T.sub,marginTop:"4px"}}>
                  <span style={{fontWeight:600}}>Sizes:</span> {p.sizes.length?p.sizes.map((s,i)=><span key={s} style={{display:"inline-block",background:T.surfaceAlt,borderRadius:"3px",padding:"1px 5px",margin:"1px 2px",fontSize:"10px"}}>{s}{editingProduct===p.id&&<span onClick={()=>{if(p.sizes.length<=1) return notify("Need at least 1 size","err");setProductCatalog(prev=>prev.map(x=>x.id===p.id?{...x,sizes:x.sizes.filter((_,j)=>j!==i)}:x))}} style={{cursor:"pointer",color:T.err,marginLeft:"3px",fontWeight:700}}>×</span>}</span>):<span style={{color:T.sub,fontStyle:"italic"}}>None</span>}
                </div>
                <div style={{fontSize:"11px",color:T.sub,marginTop:"2px"}}>
                  <span style={{fontWeight:600}}>Colors:</span> {p.colors.length?p.colors.map((c,i)=><span key={c} style={{display:"inline-block",background:T.surfaceAlt,borderRadius:"3px",padding:"1px 5px",margin:"1px 2px",fontSize:"10px"}}>{c}{editingProduct===p.id&&<span onClick={()=>{setProductCatalog(prev=>prev.map(x=>x.id===p.id?{...x,colors:x.colors.filter((_,j)=>j!==i)}:x))}} style={{cursor:"pointer",color:T.err,marginLeft:"3px",fontWeight:700}}>×</span>}</span>):<span style={{color:T.sub,fontStyle:"italic"}}>None</span>}
                </div>
                {((p.cuts&&p.cuts.length)||editingProduct===p.id)?<div style={{fontSize:"11px",color:T.sub,marginTop:"2px"}}>
                  <span style={{fontWeight:600}}>Cuts:</span> {(p.cuts&&p.cuts.length)?p.cuts.map((c,i)=><span key={c} style={{display:"inline-block",background:T.surfaceAlt,borderRadius:"3px",padding:"1px 5px",margin:"1px 2px",fontSize:"10px"}}>{c}{editingProduct===p.id&&<span onClick={()=>{setProductCatalog(prev=>prev.map(x=>x.id===p.id?{...x,cuts:(x.cuts||[]).filter((_,j)=>j!==i)}:x))}} style={{cursor:"pointer",color:T.err,marginLeft:"3px",fontWeight:700}}>×</span>}</span>):<span style={{color:T.sub,fontStyle:"italic"}}>None</span>}
                </div>:null}
                <div style={{fontSize:"10px",color:T.sub,marginTop:"2px"}}>{p.sizes.length*(p.colors.length||1)*((p.cuts&&p.cuts.length)||1)} variant{p.sizes.length*(p.colors.length||1)*((p.cuts&&p.cuts.length)||1)!==1?'s':''}</div>
                {editingProduct===p.id&&<div style={{marginTop:"8px",padding:"8px",background:T.surfaceAlt,borderRadius:"2px",border:`1px dashed ${T.gold}`}}>
                  <div style={{fontSize:"11px",fontWeight:700,marginBottom:"6px",color:T.gold}}>Add Variants</div>
                  <div style={{display:"flex",gap:"6px",alignItems:"end",flexWrap:"wrap"}}>
                    <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub}}>New Size</label><Inp value={editVariant.size} onChange={e=>setEditVariant({...editVariant,size:e.target.value})} placeholder="e.g. 4XL" style={{width:"100px"}}/></div>
                    <Btn v="ok" sm onClick={()=>{
                      const s=editVariant.size.trim();if(!s) return notify("Enter a size","err");
                      if(p.sizes.some(x=>x.toLowerCase()===s.toLowerCase())) return notify("Size already exists","err");
                      setProductCatalog(prev=>prev.map(x=>x.id===p.id?{...x,sizes:[...x.sizes,s]}:x));
                      setEditVariant({...editVariant,size:''});notify("Size "+s+" added!");
                    }}>+ Size</Btn>
                    <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub}}>New Color</label><Inp value={editVariant.color} onChange={e=>setEditVariant({...editVariant,color:e.target.value})} placeholder="e.g. White" style={{width:"100px"}}/></div>
                    <Btn v="ok" sm onClick={()=>{
                      const c=editVariant.color.trim();if(!c) return notify("Enter a color","err");
                      if(p.colors.some(x=>x.toLowerCase()===c.toLowerCase())) return notify("Color already exists","err");
                      setProductCatalog(prev=>prev.map(x=>x.id===p.id?{...x,colors:[...x.colors,c]}:x));
                      setEditVariant({...editVariant,color:''});notify("Color "+c+" added!");
                    }}>+ Color</Btn>
                    <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub}}>New Cut</label><Inp value={editVariant.cut||''} onChange={e=>setEditVariant({...editVariant,cut:e.target.value})} placeholder="e.g. Brief Style" style={{width:"120px"}}/></div>
                    <Btn v="ok" sm onClick={()=>{
                      const c=(editVariant.cut||'').trim();if(!c) return notify("Enter a cut","err");
                      if((p.cuts||[]).some(x=>x.toLowerCase()===c.toLowerCase())) return notify("Cut already exists","err");
                      setProductCatalog(prev=>prev.map(x=>x.id===p.id?{...x,cuts:[...(x.cuts||[]),c]}:x));
                      setEditVariant({...editVariant,cut:''});notify("Cut "+c+" added!");
                    }}>+ Cut</Btn>
                  </div>
                  <div style={{display:"flex",gap:"6px",alignItems:"end",flexWrap:"wrap",marginTop:"6px"}}>
                    <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub}}>Bulk Sizes (comma-sep)</label><Inp value={editVariant.bulkSizes||''} onChange={e=>setEditVariant({...editVariant,bulkSizes:e.target.value})} placeholder="XS,S,M,L,XL" style={{width:"200px"}}/></div>
                    <Btn v="ok" sm onClick={()=>{
                      const raw=editVariant.bulkSizes||'';const arr=raw.split(',').map(s=>s.trim()).filter(Boolean);if(!arr.length) return notify("Enter sizes","err");
                      const existing=new Set(p.sizes.map(s=>s.toLowerCase()));const fresh=arr.filter(s=>!existing.has(s.toLowerCase()));
                      if(!fresh.length) return notify("All sizes already exist","err");
                      setProductCatalog(prev=>prev.map(x=>x.id===p.id?{...x,sizes:[...x.sizes,...fresh]}:x));
                      setEditVariant({...editVariant,bulkSizes:''});notify(fresh.length+" size(s) added!");
                    }}>+ Bulk Add</Btn>
                    <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub}}>Bulk Colors (comma-sep)</label><Inp value={editVariant.bulkColors||''} onChange={e=>setEditVariant({...editVariant,bulkColors:e.target.value})} placeholder="Black,Beige,Brown" style={{width:"200px"}}/></div>
                    <Btn v="ok" sm onClick={()=>{
                      const raw=editVariant.bulkColors||'';const arr=raw.split(',').map(s=>s.trim()).filter(Boolean);if(!arr.length) return notify("Enter colors","err");
                      const existing=new Set(p.colors.map(c=>c.toLowerCase()));const fresh=arr.filter(c=>!existing.has(c.toLowerCase()));
                      if(!fresh.length) return notify("All colors already exist","err");
                      setProductCatalog(prev=>prev.map(x=>x.id===p.id?{...x,colors:[...x.colors,...fresh]}:x));
                      setEditVariant({...editVariant,bulkColors:''});notify(fresh.length+" color(s) added!");
                    }}>+ Bulk Add</Btn>
                  </div>
                </div>}
              </div>)}
            </div>
          </Section>

        </>;
      })()}

      {/* ═══════════════════════════════════════════════════════
          PERFORMANCE MARKETER DASHBOARD — Creative Hub
         ═══════════════════════════════════════════════════════ */}
      {((view==="dashboard"&&role==="performance_marketer")||(view==="creatives"&&role==="admin"))&&(()=>{
        // All live/completed creatives for the performance marketer
        const liveStatuses = ["partial_live","live","invoice_ok","invoice_pending_approval","payment_requested","payment_approved","partial_paid","paid"];
        const allCreatives = deals.filter(d=>liveStatuses.includes(d.status));

        const freshCreatives = allCreatives.filter(d=>d.adStatus==="fresh"||!d.adStatus);
        const runningCreatives = allCreatives.filter(d=>d.adStatus==="running");
        const testedCreatives = allCreatives.filter(d=>d.adStatus==="tested");

        // Perpetual usage rights never expire — ignore any stray usage window on them.
        const isPerpetual = (d) => (d.usage||"").toLowerCase().includes("perpetual");
        // Expiring: within 7 days of usage_end_date or past it
        const today = new Date();
        const expiringCreatives = allCreatives.filter(d=>{
          if(isPerpetual(d)||!d.usageEndDate) return false;
          const end = new Date(d.usageEndDate);
          const daysLeft = Math.ceil((end-today)/(1000*60*60*24));
          return daysLeft <= 7;
        });
        const expiredCreatives = allCreatives.filter(d=>{
          if(isPerpetual(d)||!d.usageEndDate) return false;
          return new Date(d.usageEndDate) < today;
        });

        const getDaysLeft = (d) => {
          if(isPerpetual(d)||!d.usageEndDate) return null;
          return Math.ceil((new Date(d.usageEndDate)-today)/(1000*60*60*24));
        };

        // Quick filter logic
        let filtered = adTab==="fresh"?freshCreatives:adTab==="running"?runningCreatives:adTab==="tested"?testedCreatives:expiringCreatives;
        if(adFilter.campaign) filtered = filtered.filter(d=>d.cid===adFilter.campaign);
        if(adFilter.platform) filtered = filtered.filter(d=>d.platform===adFilter.platform);
        if(adFilter.search) {
          const q = adFilter.search.toLowerCase();
          filtered = filtered.filter(d=>d.inf.toLowerCase().includes(q)||d.product.toLowerCase().includes(q)||(getCamp(d.cid)?.name||"").toLowerCase().includes(q));
        }

        // Unique platforms and campaigns for filter dropdowns
        const platforms = [...new Set(allCreatives.map(d=>d.platform).filter(Boolean))];
        const campIds = [...new Set(allCreatives.map(d=>d.cid).filter(Boolean))];

        const CreativeCard = ({d}) => {
          const daysLeft = getDaysLeft(d);
          const isExpiring = daysLeft!==null && daysLeft<=7;
          const isExpired = daysLeft!==null && daysLeft<=0;
          const isEditing = editingAdNotes===d.id;
          // status pill (exact mockup palette)
          const st = isExpired?{l:"Expired",c:"#B42318",bg:"#FDE8E8"}
            : isExpiring?{l:"Expiring",c:"#B42318",bg:"#FDE8E8"}
            : d.adStatus==="running"?{l:"Running",c:"#0F5BA7",bg:"#E0EDFA"}
            : d.adStatus==="tested"?{l:"Tested",c:T.teal,bg:T.tealBg}
            : {l:"Fresh",c:"#1B7A3D",bg:"#E2F3E8"};
          const fmt = d.platform==="YouTube"?"video · 16:9":"reel · vertical 9:16";
          const usageStr = isPerpetual(d)?"Perpetual":(daysLeft!==null?(isExpired?`Expired ${Math.abs(daysLeft)}d`:`${daysLeft} day${daysLeft===1?"":"s"}`):(d.usageDays?`${d.usageDays} days`:"Perpetual"));
          // single contextual action (preserves existing handlers)
          const action = d.reuseRequested ? {l:"Reuse sent",fill:false,fn:null}
            : isExpiring ? {l:"Request reuse",fill:true,fn:()=>requestReuse(d)}
            : d.adStatus==="running" ? {l:"Ad notes",fill:false,fn:()=>{setEditingAdNotes(d.id);setAdNotesF({notes:d.adNotes||"",link:d.adPlatformLink||""})}}
            : d.adStatus==="tested" ? {l:"Re-run",fill:false,fn:()=>updateAdStatus(d,"running")}
            : {l:"Start running",fill:false,fn:()=>updateAdStatus(d,"running")};
          return <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",overflow:"hidden"}}>
            {/* Preview band */}
            <div onClick={()=>{setSel(d);setModal("detail")}} style={{height:"120px",background:"repeating-linear-gradient(135deg,#EDE7D6,#EDE7D6 9px,#F4EFE3 9px,#F4EFE3 18px)",display:"flex",alignItems:"center",justifyContent:"center",borderBottom:`1px solid ${T.border}`,cursor:"pointer"}}>
              <span style={{fontSize:"10px",letterSpacing:"1px",textTransform:"uppercase",color:T.faint,fontFamily:"monospace"}}>{fmt}</span>
            </div>
            <div style={{padding:"16px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{fontSize:"13px",fontWeight:700}}>{d.inf}</div>
                <span style={{fontSize:"9px",letterSpacing:"1px",textTransform:"uppercase",color:st.c,background:st.bg,padding:"3px 7px",borderRadius:"2px",fontWeight:700}}>{st.l}</span>
              </div>
              <div style={{fontSize:"10px",color:T.sub,margin:"4px 0 12px"}}>{d.platform} · {d.product}</div>
              {isEditing
                ? <div onClick={e=>e.stopPropagation()} style={{borderTop:`1px solid ${T.borderSoft}`,paddingTop:"12px"}}>
                    <Inp value={adNotesF.link} onChange={e=>setAdNotesF({...adNotesF,link:e.target.value})} placeholder="Meta/Google ad link..." />
                    <textarea value={adNotesF.notes} onChange={e=>setAdNotesF({...adNotesF,notes:e.target.value})} placeholder="Performance notes, ROAS, observations..." rows={2} style={{width:"100%",padding:"6px 8px",border:`1px solid ${T.border}`,borderRadius:"2px",fontSize:"12px",marginTop:"4px",fontFamily:T.ui,resize:"vertical",boxSizing:"border-box"}}/>
                    <div style={{display:"flex",gap:"4px",marginTop:"6px"}}>
                      <Btn v="ok" sm onClick={()=>saveAdNotes(d,adNotesF.notes,adNotesF.link)}>Save</Btn>
                      <Btn v="ghost" sm onClick={()=>setEditingAdNotes(null)}>Cancel</Btn>
                    </div>
                  </div>
                : <div style={{display:"flex",justifyContent:"space-between",borderTop:`1px solid ${T.borderSoft}`,paddingTop:"12px"}}>
                    <div>
                      <div style={{fontSize:"9px",letterSpacing:"1px",textTransform:"uppercase",color:T.sub}}>Usage left</div>
                      <div style={{fontFamily:DISPLAY,fontSize:"16px",fontWeight:600,color:(isExpired||isExpiring)?"#B42318":T.text}}>{usageStr}</div>
                    </div>
                    {action.fill
                      ? <span onClick={action.fn} style={{fontSize:"10px",letterSpacing:"1px",textTransform:"uppercase",fontWeight:700,color:"#fff",background:T.brand,padding:"7px 12px",borderRadius:"2px",alignSelf:"flex-end",cursor:"pointer"}}>{action.l}</span>
                      : <span onClick={action.fn||undefined} style={{fontSize:"10px",letterSpacing:"1px",textTransform:"uppercase",fontWeight:700,color:action.fn?T.brand:T.faint,alignSelf:"flex-end",cursor:action.fn?"pointer":"default"}}>{action.l}</span>}
                  </div>}
            </div>
          </div>;
        };

        return <>
          {/* Header */}
          <div style={{marginBottom:"22px"}}>
            <div style={{fontSize:"10px",letterSpacing:"3px",textTransform:"uppercase",color:T.gold,fontWeight:600,marginBottom:"10px"}}>{allCreatives.length} live creative{allCreatives.length===1?"":"s"} · {expiringCreatives.length} usage window{expiringCreatives.length===1?"":"s"} closing</div>
            <div style={{fontFamily:DISPLAY,fontSize:"32px",fontWeight:500,letterSpacing:"-0.5px"}}>Creative Hub</div>
          </div>

          {/* Stat strip */}
          <div style={{display:"flex",borderTop:`1px solid ${T.border}`,borderBottom:`1px solid ${T.border}`,marginBottom:"24px",flexWrap:"wrap"}}>
            {[
              {l:"Total Creatives",v:allCreatives.length,c:T.text},
              {l:"Fresh",v:freshCreatives.length,c:freshCreatives.length>0?T.ok:"#C9C1B2"},
              {l:"Running",v:runningCreatives.length,c:runningCreatives.length>0?T.info:"#C9C1B2"},
              {l:"Tested",v:testedCreatives.length,c:testedCreatives.length>0?T.text:"#C9C1B2"},
              {l:"Expiring",v:expiringCreatives.length,c:expiringCreatives.length>0?T.warn:"#C9C1B2"},
              {l:"Expired",v:expiredCreatives.length,c:expiredCreatives.length>0?T.err:"#C9C1B2"},
            ].map((m,i,arr)=><div key={i} style={{flex:"1 1 120px",padding:"18px 22px",borderRight:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
              <div style={{fontSize:"10px",letterSpacing:"2px",textTransform:"uppercase",color:T.sub,marginBottom:"8px"}}>{m.l}</div>
              <div style={{fontFamily:DISPLAY,fontSize:"32px",fontWeight:500,lineHeight:1,color:m.c}}>{m.v}</div>
            </div>)}
          </div>

          {/* Expiring alerts */}
          {expiringCreatives.length>0&&<div style={{background:"#fef3c7",border:"1px solid #f59e0b33",borderRadius:"2px",padding:"10px 14px",marginBottom:"14px"}}>
            <div style={{fontSize:"12px",fontWeight:700,color:"#92400e",marginBottom:"4px"}}>⚠️ EXPIRING CREATIVES ({expiringCreatives.length})</div>
            {expiringCreatives.slice(0,3).map(d=>{const dl=getDaysLeft(d);return <div key={d.id} style={{fontSize:"12px",color:"#92400e",padding:"2px 0"}}>
              <b>{d.inf}</b> — {d.product} — {dl<=0?<span style={{color:T.err,fontWeight:700}}>EXPIRED</span>:<span>{dl} day{dl!==1?"s":""} left</span>}
              {!d.reuseRequested&&<span onClick={()=>requestReuse(d)} style={{marginLeft:"8px",color:T.info,cursor:"pointer",fontWeight:600,fontSize:"11px"}}>🔄 Request Reuse</span>}
            </div>;})}
            {expiringCreatives.length>3&&<div style={{fontSize:"11px",color:"#92400e",marginTop:"2px"}}>+ {expiringCreatives.length-3} more — switch to Expiring tab to see all</div>}
          </div>}

          {/* Reuse requests pending (visible to negotiator/admin too) */}
          {allCreatives.filter(d=>d.reuseRequested).length>0&&<div style={{background:T.infoBg,border:`1px solid ${T.info}22`,borderRadius:"2px",padding:"10px 14px",marginBottom:"14px"}}>
            <div style={{fontSize:"12px",fontWeight:700,color:T.info,marginBottom:"2px"}}>🔄 REUSE REQUESTS ({allCreatives.filter(d=>d.reuseRequested).length})</div>
            <div style={{fontSize:"11px",color:T.info}}>These creatives have pending usage extension requests sent to the negotiation team.</div>
          </div>}

          {/* Tab navigation */}
          <div style={{display:"flex",gap:"24px",marginBottom:"18px",borderBottom:`1px solid ${T.border}`}}>
            {[{k:"fresh",l:"Fresh",n:freshCreatives.length,exp:false},{k:"running",l:"Running",n:runningCreatives.length,exp:false},{k:"tested",l:"Tested",n:testedCreatives.length,exp:false},{k:"expiring",l:"Expiring",n:expiringCreatives.length,exp:true}].map(t=>{
              const active=adTab===t.k; const accent=t.exp?T.err:active?T.brand:T.sub;
              return <button key={t.k} onClick={()=>setAdTab(t.k)} style={{padding:"0 0 12px",border:"none",borderBottom:active?`2px solid ${t.exp?T.err:T.brand}`:"2px solid transparent",background:"transparent",color:t.exp?T.err:active?T.brand:T.sub,fontWeight:700,fontSize:"12px",cursor:"pointer",fontFamily:T.ui,textTransform:"uppercase",letterSpacing:"1px"}}>
                {t.l} <span style={{color:active?T.gold:(t.exp?T.err:"#C9C1B2"),marginLeft:"5px"}}>{t.n}</span>
              </button>;
            })}
          </div>

          {/* Quick filters */}
          <div style={{display:"flex",gap:"8px",marginBottom:"14px",flexWrap:"wrap",alignItems:"center"}}>
            <div style={{flex:"0 0 200px"}}><Inp value={adFilter.search} onChange={e=>setAdFilter({...adFilter,search:e.target.value})} placeholder="🔍 Search influencer, product..."/></div>
            <select value={adFilter.campaign} onChange={e=>setAdFilter({...adFilter,campaign:e.target.value})} style={{padding:"8px 10px",border:`1px solid ${T.border}`,borderRadius:"2px",fontSize:"12px",fontFamily:"Archivo,sans-serif",color:T.text,background:T.surface}}>
              <option value="">All Campaigns</option>
              {campIds.map(cid=><option key={cid} value={cid}>{getCamp(cid)?.name||cid}</option>)}
            </select>
            <select value={adFilter.platform} onChange={e=>setAdFilter({...adFilter,platform:e.target.value})} style={{padding:"8px 10px",border:`1px solid ${T.border}`,borderRadius:"2px",fontSize:"12px",fontFamily:"Archivo,sans-serif",color:T.text,background:T.surface}}>
              <option value="">All Platforms</option>
              {platforms.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            {(adFilter.search||adFilter.campaign||adFilter.platform)&&<Btn v="ghost" sm onClick={()=>setAdFilter({campaign:"",platform:"",search:""})}>✕ Clear</Btn>}
          </div>

          {/* Creative cards */}
          {filtered.length===0&&<div style={{padding:"30px 20px",textAlign:"center",color:T.sub,fontSize:"13px"}}>
            {adTab==="fresh"?"No fresh creatives — they'll appear here when collabs go live.":adTab==="running"?"No creatives currently running. Move fresh creatives here when you start testing.":adTab==="tested"?"No tested creatives yet.":"No creatives expiring soon — all good!"}
          </div>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"18px"}}>
            {filtered.map(d=><CreativeCard key={d.id} d={d}/>)}
          </div>
        </>;
      })()}

        {/* ═══ INFLUENCER DATABASE ═══ */}
        {view==="influencers"&&(()=>{
          const getInfDeals = (inf) => deals.filter(d=>d.inf===inf.name);
          const getInfTotalSpend = (inf) => getInfDeals(inf).reduce((s,d)=>s+(d.pays||[]).reduce((ps,p)=>ps+p.amount,0),0);
          const getInfTotalCommitted = (inf) => getInfDeals(inf).filter(d=>!["rejected","pending","renegotiate"].includes(d.status)).reduce((s,d)=>s+d.amount,0);

          const ACTIVE_NOT = ["rejected","paid","dropped","drop_requested","pending","renegotiate"];
          return <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:"24px",flexWrap:"wrap",gap:"12px"}}>
              <div>
                <div style={{fontSize:"10px",letterSpacing:"3px",textTransform:"uppercase",color:T.gold,fontWeight:600,marginBottom:"10px"}}>{influencers.length} creators on the roster</div>
                <div style={{fontFamily:DISPLAY,fontSize:"32px",fontWeight:500,letterSpacing:"-0.5px"}}>Influencer Database</div>
              </div>
              {(role==="negotiator"||role==="admin")&&<Btn v="primary" onClick={()=>setModal("newInfluencer")}>Add Influencer</Btn>}
            </div>

            {/* Stat strip */}
            <div style={{display:"flex",borderTop:`1px solid ${T.border}`,borderBottom:`1px solid ${T.border}`,marginBottom:"24px",flexWrap:"wrap"}}>
              {[
                {l:"Total Influencers",v:influencers.length,c:T.text},
                {l:"Active Collabs",v:deals.filter(d=>!ACTIVE_NOT.includes(d.status)).length,c:T.brand},
                {l:"Total Committed",v:f(influencers.reduce((s,inf)=>s+getInfTotalCommitted(inf),0)),c:T.text},
                {l:"Total Paid",v:f(influencers.reduce((s,inf)=>s+getInfTotalSpend(inf),0)),c:T.ok},
              ].map((m,i,arr)=><div key={i} style={{flex:"1 1 160px",padding:"18px 22px",borderRight:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                <div style={{fontSize:"10px",letterSpacing:"2px",textTransform:"uppercase",color:T.sub,marginBottom:"10px"}}>{m.l}</div>
                <div style={{fontFamily:DISPLAY,fontSize:"34px",fontWeight:500,lineHeight:1,color:m.c}}>{m.v}</div>
              </div>)}
            </div>

            {/* Search + filters */}
            <div style={{display:"flex",alignItems:"center",gap:"14px",marginBottom:"18px",flexWrap:"wrap"}}>
              <div style={{flex:1,maxWidth:"320px",minWidth:"180px"}}><input value={infSearch} onChange={e=>setInfSearch(e.target.value)} placeholder="Search name, handle, POC…" style={{width:"100%",border:"none",borderBottom:`1px solid ${T.border}`,background:"transparent",padding:"7px 0",fontSize:"13px",fontFamily:T.ui,color:T.text,outline:"none"}}/></div>
              <div style={{marginLeft:"auto",display:"flex",gap:"7px"}}>
                {[{k:"all",l:"All"},{k:"active",l:"Active"}].map(t=><button key={t.k} onClick={()=>setInfFilter(t.k)} style={{fontSize:"10px",letterSpacing:"0.5px",textTransform:"uppercase",fontWeight:700,color:infFilter===t.k?"#fff":T.sub,background:infFilter===t.k?T.brand:T.surface,border:`1px solid ${infFilter===t.k?T.brand:T.border}`,padding:"6px 12px",borderRadius:"2px",cursor:"pointer",fontFamily:T.ui}}>{t.l}</button>)}
              </div>
            </div>

            {/* Card grid */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:"16px"}}>
              {influencers.filter(inf=>{
                const q=infSearch.trim().toLowerCase();
                if(q && !(`${inf.name} ${inf.handle||""} ${inf.poc||""}`.toLowerCase().includes(q))) return false;
                if(infFilter==="active" && getInfDeals(inf).filter(d=>!ACTIVE_NOT.includes(d.status)).length===0) return false;
                return true;
              }).map(inf=>{
                const infDeals = getInfDeals(inf);
                const totalCollabs = infDeals.length;
                const activeCollabs = infDeals.filter(d=>!ACTIVE_NOT.includes(d.status)).length;
                const totalSpend = getInfTotalSpend(inf);
                return <div key={inf.id} onClick={()=>setInfProfile(inf)} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"18px",cursor:"pointer"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"16px"}}>
                    <div style={{width:"42px",height:"42px",borderRadius:"50%",background:T.goldSoft,color:T.brand,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:DISPLAY,fontSize:"16px",flex:"none"}}>{(inf.name||"?").trim()[0]}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:"14px",fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{inf.name}</div>
                      <div style={{fontSize:"10px",color:T.sub,marginTop:"1px"}}>{inf.platform} · {inf.followers} followers</div>
                    </div>
                    <span title={activeCollabs>0?"active collab":"no active collab"} style={{width:"7px",height:"7px",borderRadius:"50%",background:activeCollabs>0?T.ok:"#C9C1B2",flex:"none"}}/>
                  </div>
                  <div style={{fontSize:"10px",color:T.sub,borderTop:`1px solid ${T.borderSoft}`,paddingTop:"12px",marginBottom:"12px"}}>POC · {inf.poc||"—"}</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                    <span style={{fontSize:"11px",color:T.sub}}>{totalCollabs} collab{totalCollabs===1?"":"s"} <span style={{color:activeCollabs>0?T.ok:T.faint,fontWeight:activeCollabs>0?600:400}}>· {activeCollabs} active</span></span>
                    <span style={{fontFamily:DISPLAY,fontSize:"14px",fontWeight:600,color:totalSpend>0?T.gold:T.faint}}>{f(totalSpend)}<span style={{fontSize:"9px",letterSpacing:"0.5px",textTransform:"uppercase",color:T.faint,fontFamily:T.ui,fontWeight:700}}> paid</span></span>
                  </div>
                </div>;
              })}
            </div>
          </>;
        })()}

        {/* ═══ INFLUENCER PROFILE MODAL ═══ */}
        {infProfile&&<Modal open={!!infProfile} onClose={()=>setInfProfile(null)} title={infProfile.name} w={680}>
          {(()=>{
            const inf = infProfile;
            const infDeals = deals.filter(d=>d.inf===inf.name);
            const totalCommitted = infDeals.filter(d=>!["rejected","pending","renegotiate"].includes(d.status)).reduce((s,d)=>s+d.amount,0);
            const totalPaidAmt = infDeals.reduce((s,d)=>s+(d.pays||[]).reduce((ps,p)=>ps+p.amount,0),0);
            const totalDels = infDeals.reduce((s,d)=>s+d.dels.length,0);
            const doneDels = infDeals.reduce((s,d)=>s+d.dels.filter(x=>x.st==="live").length,0);
            const ratingColor = inf.rating==="A+"?T.ok:inf.rating==="A"?T.info:inf.rating==="B+"?T.warn:T.sub;

            return <>
              {/* Header */}
              <div style={{display:"flex",gap:"14px",alignItems:"center",marginBottom:"16px"}}>
                <div style={{width:"48px",height:"48px",borderRadius:"50%",background:`linear-gradient(135deg,${T.goldSoft},${T.goldMid})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"20px",fontWeight:800,color:T.gold}}>{inf.name.split(" ").map(w=>w[0]).join("")}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:800,fontSize:"20px"}}>{inf.name} <span style={{padding:"2px 7px",borderRadius:"2px",fontSize:"11px",fontWeight:800,color:ratingColor,background:ratingColor+"18",marginLeft:"6px"}}>{inf.rating}</span></div>
                  <div style={{fontSize:"13px",color:T.sub}}>{inf.handle} · {inf.platform} · {inf.followers} · {inf.city}</div>
                  <div style={{fontSize:"11px",color:T.gold,fontWeight:600}}>{inf.category}</div>
                </div>
              </div>

              {/* Contact & Details */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginBottom:"14px"}}>
                {[["📱 Phone",inf.phone],["📧 Email",inf.email],["👤 POC",inf.poc],["🔗 Profile",inf.profile],["📍 Address",inf.address],["📅 Added",inf.added]].map(([l,v])=><div key={l} style={{padding:"7px 10px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px"}}><div style={{fontSize:"10px",fontWeight:700,color:T.sub,textTransform:"uppercase"}}>{l}</div><div style={{fontSize:"13px",marginTop:"2px"}}>{v||"—"}</div></div>)}
              </div>

              {/* Financial Summary */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:"8px",marginBottom:"14px"}}>
                <StatBox l="Total Collabs" v={infDeals.length} c={T.brand}/>
                <StatBox l="Committed" v={f(totalCommitted)} c={T.gold}/>
                <StatBox l="Total Paid" v={f(totalPaidAmt)} c={T.ok}/>
                <StatBox l="Deliverables" v={`${doneDels}/${totalDels}`} c={T.purple}/>
              </div>

              {/* Bank & Payment Details */}
              {(inf.bankHolder||inf.bankAccount||inf.panNumber||inf.upiId)&&<div style={{padding:"10px 12px",background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:"2px",marginBottom:"14px"}}>
                <div style={{fontSize:"11px",fontWeight:700,color:"#0284c7",textTransform:"uppercase",letterSpacing:".5px",marginBottom:"6px"}}>💳 Bank & Payment Details</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px"}}>
                  {[["Account Holder",inf.bankHolder],["Account Number",inf.bankAccount],["IFSC",inf.bankIfsc],["PAN",inf.panNumber],["UPI ID",inf.upiId],["Default Terms",{next_15th:"15th of Next Month","45_days":"45 Days","60_days":"60 Days",advance:"Advance",immediate:"Immediate",custom:"Custom"}[inf.defaultPaymentTerms]||inf.defaultPaymentTerms]].filter(([,v])=>v).map(([l,v])=><div key={l} style={{padding:"4px 8px",background:"#fff",borderRadius:"2px",fontSize:"12px"}}><span style={{fontWeight:700,color:T.sub,fontSize:"10px"}}>{l}:</span> {v}</div>)}
                </div>
              </div>}
              {!(inf.bankHolder||inf.bankAccount||inf.panNumber||inf.upiId)&&(role==="finance"||role==="admin")&&<div style={{padding:"10px 12px",background:T.warnBg,border:`1px solid ${T.warn}33`,borderRadius:"2px",marginBottom:"14px",fontSize:"12px",color:T.warn}}>
                ⚠ No bank details on file. Ask the negotiator to update this influencer's profile with bank details for payment processing.
              </div>}

              {/* Tags */}
              <div style={{display:"flex",gap:"4px",marginBottom:"14px",flexWrap:"wrap"}}>
                {(inf.tags||[]).map((tag,i)=><span key={i} style={{padding:"2px 8px",borderRadius:"2px",fontSize:"11px",fontWeight:600,background:T.goldSoft,color:T.gold}}>#{tag}</span>)}
              </div>

              {/* Notes */}
              {inf.notes&&<div style={{padding:"10px 12px",background:T.warnBg,borderRadius:"2px",marginBottom:"14px",fontSize:"13px",color:T.warn}}>
                <div style={{fontWeight:700,marginBottom:"2px"}}>📝 Notes</div>{inf.notes}
              </div>}

              {/* Avg Rate & Overall Rating */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginBottom:"14px"}}>
                <div style={{padding:"8px 10px",background:T.goldSoft,borderRadius:"2px",fontSize:"13px"}}>
                  <span style={{fontWeight:700,color:T.brand}}>Average Rate</span>
                  <div style={{fontWeight:800,color:T.gold,fontSize:"13px",marginTop:"2px"}}>{f(inf.avgRate)}</div>
                </div>
                {typeof inf.rating==="number"&&<div style={{padding:"8px 10px",background:T.okBg,borderRadius:"2px",fontSize:"13px"}}>
                  <span style={{fontWeight:700,color:T.ok}}>Overall Rating</span>
                  <div style={{fontWeight:800,color:T.ok,fontSize:"13px",marginTop:"2px"}}>{inf.rating.toFixed(1)}/5 ⭐</div>
                </div>}
              </div>

              {/* Collaboration History */}
              <Section title={`Collaboration History (${infDeals.length})`} icon="📜">
                {infDeals.length===0&&<div style={{fontSize:"13px",color:T.sub,padding:"8px 0"}}>No collaborations yet</div>}
                {infDeals.map(d=>{
                  const paid = (d.pays||[]).reduce((s,p)=>s+p.amount,0);
                  const delDone = d.dels.filter(x=>x.st==="live").length;
                  return <div key={d.id} onClick={()=>{setSel(d);setInfProfile(null);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"10px 12px",marginBottom:"6px",cursor:"pointer",transition:"all .12s"}}
                    onMouseEnter={e=>e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.04)"}
                    onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"4px"}}>
                      <div>
                        <span style={{fontWeight:700,fontSize:"12px"}}>{d.product}</span>
                        <span style={{fontSize:"11px",color:T.sub,marginLeft:"6px"}}>{getCamp(d.cid)?.name||""}</span>
                      </div>
                      <Badge s={d.status} sm/>
                    </div>
                    <div style={{display:"flex",gap:"2px",marginBottom:"4px"}}>{d.dels.map((dl,i)=><div key={i} style={{flex:1,height:"3px",borderRadius:"2px",background:dl.st==="live"?T.ok:T.border}}/>)}</div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:"11px",color:T.sub}}>
                      <span>{fAmt(d.amount)} · {delDone}/{d.dels.length} content · {d.at.split(" ")[0]}</span>
                      <span style={{color:T.ok,fontWeight:600}}>{paid>0?f(paid)+" paid":"Unpaid"}</span>
                    </div>
                  </div>;
                })}
              </Section>
            </>;
          })()}
        </Modal>}

        {/* ═══ NEW INFLUENCER MODAL ═══ */}
        <Modal open={modal==="newInfluencer"} onClose={()=>setModal(null)} title="Add Influencer to Database" w={540}>
          <>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 10px"}}>
                <Field label="Name *"><Inp value={nInf.name} onChange={e=>setNInf({...nInf,name:e.target.value})} placeholder="Priya Sharma"/></Field>
                <Field label="Handle"><Inp value={nInf.handle} onChange={e=>setNInf({...nInf,handle:e.target.value})} placeholder="@priyasharma"/></Field>
                <Field label="Platform"><Sel value={nInf.platform} onChange={e=>setNInf({...nInf,platform:e.target.value})} options={[{v:"Instagram",l:"Instagram"},{v:"YouTube",l:"YouTube"},{v:"Other",l:"Other"}]}/></Field>
                <Field label="Followers"><Inp value={nInf.followers} onChange={e=>setNInf({...nInf,followers:e.target.value})} placeholder="125K"/></Field>
                <Field label="Category"><Sel value={nInf.category} onChange={e=>setNInf({...nInf,category:e.target.value})} options={[{v:"Fashion & Lifestyle",l:"Fashion & Lifestyle"},{v:"Beauty & Fashion",l:"Beauty & Fashion"},{v:"Fashion",l:"Fashion"},{v:"Fitness",l:"Fitness"},{v:"Fashion & Fitness",l:"Fashion & Fitness"},{v:"Lifestyle",l:"Lifestyle"},{v:"Other",l:"Other"}]}/></Field>
                <Field label="City"><Inp value={nInf.city} onChange={e=>setNInf({...nInf,city:e.target.value})} placeholder="Mumbai"/></Field>
                <Field label="Phone *"><Inp value={nInf.phone} onChange={e=>setNInf({...nInf,phone:e.target.value})} placeholder="+91 98765 43210"/></Field>
                <Field label="Email"><Inp value={nInf.email} onChange={e=>setNInf({...nInf,email:e.target.value})} placeholder="priya@gmail.com"/></Field>
                <Field label="Profile Link"><Inp value={nInf.profile} onChange={e=>setNInf({...nInf,profile:e.target.value})} placeholder="instagram.com/handle"/></Field>
                <Field label="Avg Rate"><Inp value={nInf.avgRate} onChange={e=>setNInf({...nInf,avgRate:e.target.value})} type="number" prefix="₹"/></Field>
                <Field label="Rating"><Sel value={nInf.rating} onChange={e=>setNInf({...nInf,rating:e.target.value})} options={[{v:"A+",l:"A+ (Premium)"},{v:"A",l:"A (Excellent)"},{v:"B+",l:"B+ (Good)"},{v:"B",l:"B (Average)"},{v:"C",l:"C (Below Avg)"}]}/></Field>
                <Field label="POC"><Inp value={nInf.poc} onChange={e=>setNInf({...nInf,poc:e.target.value})} placeholder="Who manages this influencer?"/></Field>
              </div>
              <Field label="Address" span={2}><Inp value={nInf.address} onChange={e=>setNInf({...nInf,address:e.target.value})} placeholder="Full shipping address"/></Field>
              <Field label="Tags (comma separated)"><Inp value={nInf.tags} onChange={e=>setNInf({...nInf,tags:e.target.value})} placeholder="fashion, lifestyle, mumbai"/></Field>
              <Field label="Notes"><Inp value={nInf.notes} onChange={e=>setNInf({...nInf,notes:e.target.value})} placeholder="Any important notes about this influencer..."/></Field>
              <div style={{marginTop:"10px",padding:"10px",background:T.surfaceAlt,borderRadius:"2px",border:`1px solid ${T.border}`}}>
                <div style={{fontSize:"11px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:".5px",marginBottom:"8px"}}>💳 Bank & Payment Details (optional)</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 10px"}}>
                  <Field label="Account Holder Name"><Inp value={nInf.bankHolder} onChange={e=>setNInf({...nInf,bankHolder:e.target.value})} placeholder="As per bank records"/></Field>
                  <Field label="Account Number"><Inp value={nInf.bankAccount} onChange={e=>setNInf({...nInf,bankAccount:e.target.value})} placeholder="1234567890"/></Field>
                  <Field label="IFSC Code"><Inp value={nInf.bankIfsc} onChange={e=>setNInf({...nInf,bankIfsc:e.target.value})} placeholder="SBIN0001234"/></Field>
                  <Field label="PAN Number"><Inp value={nInf.panNumber} onChange={e=>setNInf({...nInf,panNumber:e.target.value})} placeholder="ABCPD1234E"/></Field>
                  <Field label="UPI ID"><Inp value={nInf.upiId} onChange={e=>setNInf({...nInf,upiId:e.target.value})} placeholder="name@upi"/></Field>
                  <Field label="Default Payment Terms"><Sel value={nInf.defaultPaymentTerms} onChange={e=>setNInf({...nInf,defaultPaymentTerms:e.target.value})} options={[{v:"next_15th",l:"15th of Next Month"},{v:"45_days",l:"45 Days from Live"},{v:"60_days",l:"60 Days from Live"},{v:"advance",l:"Advance (on approval)"},{v:"immediate",l:"Immediate (on live)"},{v:"custom",l:"Custom"}]}/></Field>
                </div>
              </div>
              <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"14px",paddingTop:"12px",borderTop:`1px solid ${T.border}`}}>
                <Btn v="outline" onClick={()=>setModal(null)}>Cancel</Btn>
                <Btn v="gold" onClick={()=>{
                  if(!nInf.name||!nInf.phone) { notify("Name and phone required","err"); return; }
                  if(!validPhone(nInf.phone)) { notify("Phone must be exactly 10 digits","err"); return; }
                  if(nInf.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nInf.email)) { notify("Invalid email format","err"); return; }
                  if(nInf.profile && !validUrl(nInf.profile)) { notify("Invalid profile URL","err"); return; }
                  const infId = uid();
                  const parsedTags = nInf.tags?nInf.tags.split(",").map(t=>t.trim().toLowerCase()).filter(Boolean):[];
                  supabase.from('influencers').insert({id:infId,name:nInf.name,platform:nInf.platform,handle:nInf.handle,profile:nInf.profile,followers:nInf.followers,category:nInf.category,city:nInf.city,phone:nInf.phone,email:nInf.email,address:nInf.address,poc:nInf.poc,avg_rate:+nInf.avgRate||0,rating:nInf.rating,notes:nInf.notes,tags:parsedTags,bank_account_holder:nInf.bankHolder||null,bank_account_number:nInf.bankAccount||null,bank_ifsc:nInf.bankIfsc||null,pan_number:nInf.panNumber||null,upi_id:nInf.upiId||null,default_payment_terms:nInf.defaultPaymentTerms||'next_15th'}).then(({error})=>{if(error){console.error("Add influencer failed:",error);notify("Failed to save: "+error.message,"err");}});
                  setInfluencers(prev=>[...prev,{id:infId,name:nInf.name,platform:nInf.platform,handle:nInf.handle,profile:nInf.profile,followers:nInf.followers,category:nInf.category,city:nInf.city,phone:nInf.phone,email:nInf.email,address:nInf.address,poc:nInf.poc,avgRate:+nInf.avgRate||0,rating:nInf.rating,notes:nInf.notes,tags:parsedTags,added:new Date().toISOString().slice(0,10),bankHolder:nInf.bankHolder||"",bankAccount:nInf.bankAccount||"",bankIfsc:nInf.bankIfsc||"",panNumber:nInf.panNumber||"",upiId:nInf.upiId||"",defaultPaymentTerms:nInf.defaultPaymentTerms||"next_15th"}]);
                  setModal(null);
                  setNInf({name:"",platform:"Instagram",handle:"",profile:"",followers:"",category:"",city:"",phone:"",email:"",address:"",poc:"",avgRate:"",rating:"B+",notes:"",tags:""});
                  notify(`${nInf.name} added to database!`);
                }}>Add Influencer</Btn>
              </div>
          </>
        </Modal>

        {/* ═══ FEATURE 1: ANALYTICS & REPORTS VIEW ═══ */}
        {view==="analytics"&&(()=>{
          const LIVE_SET = ["partial_live","live","invoice_ok","invoice_pending_approval","payment_details_received","payment_requested","payment_approved","partial_paid","paid"];
          const PAYWAIT = ["invoice_ok","invoice_pending_approval","payment_details_received","payment_requested","payment_approved","partial_paid","disputed"];
          const inrC = (n)=> n>=1e7?["₹"+(n/1e7).toFixed(1),"Cr"]:n>=1e5?["₹"+(n/1e5).toFixed(1),"L"]:n>=1e3?["₹"+Math.round(n/1e3),"k"]:["₹"+n,""];
          const moneyCell = (n)=>{const [m,u]=inrC(n); return <>{m}<span style={{fontSize:"18px"}}>{u}</span></>;};

          // ── Filter (creation date range + campaign) ──
          const inRange=(d)=>{const day=(d.at||"").slice(0,10); if(anFrom&&day<anFrom) return false; if(anTo&&day>anTo) return false; return true;};
          const fdeals = deals.filter(d=>(!anCamp||d.cid===anCamp)&&inRange(d));
          const REAL = fdeals.filter(d=>!["rejected","dropped","drop_requested"].includes(d.status));   // real pipeline
          const committed = REAL.filter(d=>!["pending","renegotiate","manager_approved"].includes(d.status)); // locked
          const liveDeals = fdeals.filter(d=>LIVE_SET.includes(d.status));
          const inProgress = fdeals.filter(d=>["approved","email_sent","acknowledged","shipped","delivered_prod"].includes(d.status));
          const paidClosed = fdeals.filter(d=>d.status==="paid");

          const totalSpend = fdeals.reduce((s,d)=>s+totalPaid(d),0);
          const committedVal = committed.reduce((s,d)=>s+d.amount,0);
          const outstanding = committed.reduce((s,d)=>s+remaining(d),0);
          const commercial = committed.filter(d=>d.amount>0);
          const avgDeal = commercial.length>0?Math.round(commercial.reduce((s,d)=>s+d.amount,0)/commercial.length):0;
          const goLiveRate = committed.length>0?Math.round(liveDeals.length/committed.length*100):0;
          const isVideo=(t)=>/reel|video|short/i.test(t||"");
          const videosLive = fdeals.flatMap(d=>(d.dels||[])).filter(x=>x.st==="live"&&isVideo(x.type)).length;
          const uniqueCreators = new Set(REAL.map(d=>d.inf)).size;
          const barterCount = committed.filter(d=>d.amount===0).length;
          // avg days to live
          const ttlArr = fdeals.map(d=>{const lds=(d.dels||[]).filter(x=>x.st==="live"&&x.liveAt).map(x=>new Date(x.liveAt));const st=d.at?new Date(d.at):null;if(!st||lds.length===0)return null;const fst=new Date(Math.min(...lds.map(x=>x.getTime())));const dd=Math.round((fst-st)/(864e5));return dd>=0?dd:null;}).filter(x=>x!==null);
          const avgTTL = ttlArr.length>0?Math.round(ttlArr.reduce((s,x)=>s+x,0)/ttlArr.length):null;

          // ── Stage breakdown ──
          const stages=[
            {l:"Pending approval",c:T.warn,n:fdeals.filter(d=>["pending","renegotiate","manager_approved"].includes(d.status)).length},
            {l:"Approved · prep",c:T.info,n:fdeals.filter(d=>["approved","email_sent","acknowledged"].includes(d.status)).length},
            {l:"Shipping · production",c:T.purple,n:fdeals.filter(d=>["shipped","delivered_prod"].includes(d.status)).length},
            {l:"Live",c:T.brand,n:fdeals.filter(d=>["partial_live","live"].includes(d.status)).length},
            {l:"Awaiting payment",c:T.teal,n:fdeals.filter(d=>PAYWAIT.includes(d.status)).length},
            {l:"Paid · closed",c:T.gold,n:paidClosed.length},
          ];
          const stageTotal=stages.reduce((s,b)=>s+b.n,0)||1;
          const rejectedN = fdeals.filter(d=>d.status==="rejected").length;
          const droppedN = fdeals.filter(d=>["dropped","drop_requested"].includes(d.status)).length;

          // ── Top executives (deal creators) ── "Money spent" = committed value of their approved/active collabs (any payment stage)
          const execMap={};
          REAL.forEach(d=>{const o=d.by||"—"; if(!execMap[o])execMap[o]={name:o,closed:0,spent:0,videosLive:0,liveDeals:0}; const locked=!["pending","renegotiate","manager_approved"].includes(d.status); if(locked){execMap[o].closed++; execMap[o].spent+=(d.amount||0);} execMap[o].videosLive+=(d.dels||[]).filter(x=>x.st==="live"&&isVideo(x.type)).length; if(LIVE_SET.includes(d.status))execMap[o].liveDeals++;});
          const execs=Object.values(execMap).map(e=>({...e,goLive:e.closed>0?Math.round(e.liveDeals/e.closed*100):0})).sort((a,b)=>b.closed-a.closed||b.spent-a.spent);

          // ── Monthly gone-live (last 6 months, filtered) ──
          const now=new Date(); const monthKeys=[];
          for(let i=5;i>=0;i--){const dt=new Date(now.getFullYear(),now.getMonth()-i,1);monthKeys.push(dt.toISOString().slice(0,7));}
          const liveByMonth={}; fdeals.forEach(d=>{if(LIVE_SET.includes(d.status)&&d.at){const k=d.at.slice(0,7); if(monthKeys.includes(k))liveByMonth[k]=(liveByMonth[k]||0)+1;}});
          const monthVals=monthKeys.map(k=>liveByMonth[k]||0); const maxMonth=Math.max(1,...monthVals); const peakIdx=monthVals.indexOf(Math.max(...monthVals.slice(0,5)));

          const countCells=[
            {l:"Total deals",v:REAL.length,c:T.text},
            {l:"Live deals",v:liveDeals.length,c:T.brand},
            {l:"In progress",v:inProgress.length,c:T.info},
            {l:"Paid · closed",v:paidClosed.length,c:T.ok},
          ];
          const moneyCells=[
            {l:"Money spent",v:moneyCell(committedVal)},
            {l:"Paid out",v:moneyCell(totalSpend)},
            {l:"Outstanding",v:moneyCell(outstanding)},
            {l:"Avg deal value",v:commercial.length>0?moneyCell(avgDeal):"—"},
            {l:"Go-live rate",v:<>{goLiveRate}<span style={{fontSize:"18px"}}>%</span></>},
            {l:"Avg time to live",v:avgTTL!==null?<>{avgTTL}<span style={{fontSize:"18px"}}> days</span></>:"—"},
          ];
          const Strip=({cells})=> <div style={{display:"flex",borderTop:`1px solid ${T.border}`,borderBottom:`1px solid ${T.border}`,marginBottom:"24px",flexWrap:"wrap"}}>
            {cells.map((m,i,arr)=><div key={i} style={{flex:"1 1 140px",padding:"18px 22px",borderRight:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
              <div style={{fontSize:"10px",letterSpacing:"2px",textTransform:"uppercase",color:T.sub,marginBottom:"8px"}}>{m.l}</div>
              <div style={{fontFamily:DISPLAY,fontSize:"32px",fontWeight:500,lineHeight:1,color:m.c||T.text}}>{m.v}</div>
            </div>)}
          </div>;

          return <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:"22px",flexWrap:"wrap",gap:"12px"}}>
              <div>
                <div style={{fontSize:"10px",letterSpacing:"3px",textTransform:"uppercase",color:T.gold,fontWeight:600,marginBottom:"10px"}}>{anFrom||anTo?`${anFrom||"start"} → ${anTo||"now"}`:`${getCurrentFY().label} · to date`}{anCamp?` · ${getCamp(anCamp)?.name||""}`:""}</div>
                <div style={{fontFamily:DISPLAY,fontSize:"32px",fontWeight:500,letterSpacing:"-0.5px"}}>Analytics</div>
              </div>
            </div>

            {/* Filters */}
            <div style={{display:"flex",alignItems:"flex-end",gap:"12px",marginBottom:"24px",flexWrap:"wrap"}}>
              <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:"1px"}}>From</label><Inp type="date" value={anFrom} onChange={e=>setAnFrom(e.target.value)}/></div>
              <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:"1px"}}>To</label><Inp type="date" value={anTo} onChange={e=>setAnTo(e.target.value)}/></div>
              <div style={{minWidth:"180px"}}><label style={{fontSize:"10px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:"1px"}}>Campaign</label><Sel value={anCamp} onChange={e=>setAnCamp(e.target.value)} options={[{v:"",l:"All campaigns"},...campaigns.map(c=>({v:c.id,l:c.name}))]}/></div>
              {(anFrom||anTo||anCamp)&&<Btn v="outline" sm onClick={()=>{setAnFrom("");setAnTo("");setAnCamp("")}}>Clear</Btn>}
              <span style={{marginLeft:"auto",fontSize:"11px",color:T.sub,fontStyle:"italic",fontFamily:DISPLAY}}>Filtered by collab creation date</span>
            </div>

            {/* Headline counts */}
            <Strip cells={countCells}/>

            {/* Stage breakdown */}
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"22px",marginBottom:"24px"}}>
              <div style={{fontSize:"11px",letterSpacing:"1.5px",textTransform:"uppercase",fontWeight:700,marginBottom:"18px"}}>Pipeline by stage</div>
              <div style={{display:"flex",height:"14px",borderRadius:"2px",overflow:"hidden",marginBottom:"18px",background:T.goldSoft}}>
                {stages.filter(b=>b.n>0).map((b,i)=><div key={i} style={{width:`${b.n/stageTotal*100}%`,background:b.c}} title={`${b.l}: ${b.n}`}/>)}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:"12px"}}>
                {stages.map((b,i)=><div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"8px"}}>
                  <span style={{display:"flex",alignItems:"center",gap:"8px",fontSize:"12px"}}><span style={{width:"10px",height:"10px",borderRadius:"2px",background:b.c,flex:"none"}}/>{b.l}</span>
                  <span style={{fontFamily:DISPLAY,fontSize:"15px",fontWeight:600}}>{b.n}</span>
                </div>)}
              </div>
              {(rejectedN>0||droppedN>0)&&<div style={{marginTop:"16px",paddingTop:"14px",borderTop:`1px solid ${T.borderSoft}`,display:"flex",gap:"24px",fontSize:"12px",color:T.sub}}>
                <span style={{display:"flex",alignItems:"center",gap:"8px"}}><span style={{width:"10px",height:"10px",borderRadius:"2px",background:T.err,flex:"none"}}/>Rejected <b style={{color:T.text,fontFamily:DISPLAY}}>{rejectedN}</b></span>
                <span style={{display:"flex",alignItems:"center",gap:"8px"}}><span style={{width:"10px",height:"10px",borderRadius:"2px",background:T.faint,flex:"none"}}/>Dropped <b style={{color:T.text,fontFamily:DISPLAY}}>{droppedN}</b></span>
                <span style={{color:T.faint,fontStyle:"italic",fontFamily:DISPLAY}}>not counted in pipeline / money</span>
              </div>}
            </div>

            {/* Money / efficiency */}
            <Strip cells={moneyCells}/>

            {/* Content output micro-strip */}
            <div style={{display:"flex",gap:"20px",flexWrap:"wrap",fontSize:"12px",color:T.sub,marginBottom:"28px"}}>
              <span>Videos live · <b style={{color:T.text,fontFamily:DISPLAY}}>{videosLive}</b></span>
              <span>Unique creators · <b style={{color:T.text,fontFamily:DISPLAY}}>{uniqueCreators}</b></span>
              <span>Barter collabs · <b style={{color:T.text,fontFamily:DISPLAY}}>{barterCount}</b></span>
            </div>

            {/* Top Executives */}
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",marginBottom:"28px",overflow:"hidden"}}>
              <div style={{padding:"16px 18px 0"}}><div style={{fontSize:"11px",letterSpacing:"1.5px",textTransform:"uppercase",fontWeight:700}}>Top executives</div></div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1.2fr 1fr 1fr",padding:"12px 18px",fontSize:"9px",letterSpacing:"1px",textTransform:"uppercase",color:T.sub,fontWeight:700,borderBottom:`1px solid ${T.borderSoft}`}}>
                <span>Executive</span><span style={{textAlign:"right"}}>Deals closed</span><span style={{textAlign:"right"}}>Money spent</span><span style={{textAlign:"right"}}>Videos live</span><span style={{textAlign:"right"}}>Go-live</span>
              </div>
              {execs.length===0&&<div style={{padding:"16px 18px",fontSize:"12px",color:T.sub}}>No collabs in this range.</div>}
              {execs.map((e,i)=><div key={e.name} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1.2fr 1fr 1fr",padding:"13px 18px",fontSize:"13px",alignItems:"center",borderBottom:i<execs.length-1?`1px solid ${T.borderSoft}`:"none"}}>
                <span style={{fontWeight:700}}>{i===0&&e.closed>0?"🏆 ":""}{e.name}</span>
                <span style={{textAlign:"right",fontFamily:DISPLAY,fontSize:"15px",fontWeight:600}}>{e.closed}</span>
                <span style={{textAlign:"right",fontFamily:DISPLAY,color:T.gold,fontWeight:600}}>{f(e.spent)}</span>
                <span style={{textAlign:"right",fontFamily:DISPLAY,fontSize:"15px",fontWeight:600}}>{e.videosLive}</span>
                <span style={{textAlign:"right",fontWeight:700,color:e.goLive>=70?T.ok:e.goLive>=40?T.warn:T.sub}}>{e.goLive}%</span>
              </div>)}
            </div>

            {/* Monthly gone-live bars */}
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"22px",marginBottom:"28px"}}>
              <div style={{fontSize:"11px",letterSpacing:"1.5px",textTransform:"uppercase",fontWeight:700,marginBottom:"24px"}}>Collabs gone live · monthly</div>
              <div style={{display:"flex",alignItems:"flex-end",gap:"18px",height:"150px",borderBottom:`1px solid ${T.border}`}}>
                {monthVals.map((v,i)=>{const h=Math.round(v/maxMonth*100); const isLast=i===monthVals.length-1; const col=isLast?T.brand:(i===peakIdx&&v>0)?T.gold:"#EDE7D6"; return <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}} title={`${v} live`}><div style={{width:"100%",maxWidth:"46px",height:`${Math.max(h,2)}%`,background:col,borderRadius:"2px 2px 0 0"}}/></div>;})}
              </div>
              <div style={{display:"flex",gap:"18px",marginTop:"10px"}}>
                {monthKeys.map((k,i)=><span key={k} style={{flex:1,textAlign:"center",fontSize:"10px",letterSpacing:"1px",color:i===monthKeys.length-1?T.text:T.sub,fontWeight:i===monthKeys.length-1?700:400}}>{new Date(k+"-01").toLocaleDateString("en-US",{month:"short"}).toUpperCase()}</span>)}
              </div>
            </div>

            {/* Campaign Performance (filtered) */}
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"22px",marginBottom:"28px"}}>
              <div style={{fontSize:"11px",letterSpacing:"1.5px",textTransform:"uppercase",fontWeight:700,marginBottom:"16px"}}>Campaign performance</div>
              {campaigns.filter(c=>!anCamp||c.id===anCamp).map(c=>{
                const cf=fdeals.filter(d=>d.cid===c.id); const spent=cf.reduce((s,d)=>s+totalPaid(d),0); const comm=cf.filter(d=>!["rejected","dropped","drop_requested","pending","renegotiate"].includes(d.status)).reduce((s,d)=>s+d.amount,0);
                const pct=c.budget>0?Math.round(comm/c.budget*100):0;
                return <div key={c.id} style={{marginBottom:"12px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:"5px",fontSize:"12px"}}><span style={{fontWeight:600}}>{c.name} <span style={{color:T.sub,fontWeight:400}}>· {cf.length} collabs</span></span><span style={{color:T.sub}}>committed <b style={{color:T.text}}>{f(comm)}</b>{c.budget>0?` / ${f(c.budget)}`:" · no cap"} · paid {f(spent)}</span></div>
                  {c.budget>0&&<div style={{height:"6px",background:T.goldSoft,borderRadius:"3px",overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:pct>90?T.err:pct>70?T.gold:T.brand}}/></div>}
                </div>;
              })}
            </div>

            {/* Top Influencers (filtered) */}
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"22px",marginBottom:"28px"}}>
              <div style={{fontSize:"11px",letterSpacing:"1.5px",textTransform:"uppercase",fontWeight:700,marginBottom:"16px"}}>Top influencers</div>
              {(()=>{
                const byCount={}, byAmt={};
                REAL.forEach(d=>{byCount[d.inf]=(byCount[d.inf]||0)+1; byAmt[d.inf]=(byAmt[d.inf]||0)+d.amount;});
                return <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"24px"}}>
                  <div><div style={{fontSize:"10px",color:T.sub,marginBottom:"8px",textTransform:"uppercase",letterSpacing:"0.5px"}}>By collab count</div>{Object.entries(byCount).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([inf,c])=><div key={inf} style={{fontSize:"12px",padding:"5px 0",display:"flex",justifyContent:"space-between",borderBottom:`1px solid ${T.borderSoft}`}}><span>{inf}</span><span style={{color:T.gold,fontWeight:700}}>{c}</span></div>)}{Object.keys(byCount).length===0&&<div style={{fontSize:"12px",color:T.sub}}>—</div>}</div>
                  <div><div style={{fontSize:"10px",color:T.sub,marginBottom:"8px",textTransform:"uppercase",letterSpacing:"0.5px"}}>By total value</div>{Object.entries(byAmt).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([inf,a])=><div key={inf} style={{fontSize:"12px",padding:"5px 0",display:"flex",justifyContent:"space-between",borderBottom:`1px solid ${T.borderSoft}`}}><span>{inf}</span><span style={{color:T.gold,fontWeight:700,fontFamily:DISPLAY}}>{fAmt(a)}</span></div>)}{Object.keys(byAmt).length===0&&<div style={{fontSize:"12px",color:T.sub}}>—</div>}</div>
                </div>;
              })()}
            </div>

            {/* Export */}
            <div style={{textAlign:"right"}}>
              <Btn v="gold" onClick={()=>{
                const rows=[["Metric","Value"],["Range",`${anFrom||"start"} to ${anTo||"now"}`],["Campaign",anCamp?(getCamp(anCamp)?.name||anCamp):"All"],["Total deals",REAL.length],["Live deals",liveDeals.length],["In progress",inProgress.length],["Paid/closed",paidClosed.length],["Total spend",totalSpend],["Committed value",committedVal],["Outstanding",outstanding],["Avg deal value",avgDeal],["Go-live rate %",goLiveRate],["Videos live",videosLive],["Unique creators",uniqueCreators],[],["Executive","Deals closed","Money spent","Videos live","Go-live %"],...execs.map(e=>[e.name,e.closed,e.spent,e.videosLive,e.goLive])];
                const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
                const blob=new Blob(["﻿"+csv],{type:"text/csv;charset=utf-8;"}); const link=document.createElement("a"); link.href=URL.createObjectURL(blob); link.download=`analytics_${new Date().toISOString().slice(0,10)}.csv`; link.click();
                notify("Report exported!");
              }}>📥 Export Report</Btn>
            </div>
          </>;
        })()}

        {/* ═══ ALL COLLABORATIONS VIEW (shared, accessible from all roles) ═══ */}
        {view==="deals"&&<>
          {/* Header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:"24px",flexWrap:"wrap",gap:"12px"}}>
            <div>
              <div style={{fontSize:"10px",letterSpacing:"3px",textTransform:"uppercase",color:T.gold,fontWeight:600,marginBottom:"10px"}}>{deals.length} collaborations</div>
              <div style={{fontFamily:T.display,fontSize:"32px",fontWeight:500,letterSpacing:"-0.5px"}}>All Collabs</div>
            </div>
            {(role==="negotiator"||role==="admin")&&<Btn v="primary" onClick={()=>{setEditingDealId(null);setNDeal({inf:"",email:"",platform:"Instagram",followers:"",products:[],usage:"6 months",deadline:"",profile:"",phone:"",address:{street:"",city:"",state:"",pincode:""},paymentTerms:"next_15th",cid:campaigns[0]?.id||"c1",dels:[{id:uid(),type:"Reel",desc:"",st:"pending",link:""}]});setModal("newDeal")}}>New Collab</Btn>}
          </div>

          {/* Campaign filter */}
          <div style={{display:"flex",gap:"7px",marginBottom:"12px",flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:"10px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:"1px",marginRight:"4px"}}>Campaign</span>
            <button onClick={()=>setCampFilter("")} style={{padding:"5px 11px",border:`1px solid ${!campFilter?T.brand:T.border}`,borderRadius:"2px",background:!campFilter?T.brand:T.surface,color:!campFilter?"#fff":T.sub,fontSize:"10px",fontWeight:700,letterSpacing:"0.5px",textTransform:"uppercase",cursor:"pointer",fontFamily:T.ui}}>All</button>
            {campaigns.map(c=><button key={c.id} onClick={()=>setCampFilter(c.id)} style={{padding:"5px 11px",border:`1px solid ${campFilter===c.id?T.brand:T.border}`,borderRadius:"2px",background:campFilter===c.id?T.brand:T.surface,color:campFilter===c.id?"#fff":T.sub,fontSize:"10px",fontWeight:700,letterSpacing:"0.5px",textTransform:"uppercase",cursor:"pointer",fontFamily:T.ui}}>{c.name} ({campDeals(c.id).length})</button>)}
          </div>

          {/* Feature 4: Filter Controls */}
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"16px",marginBottom:"14px"}}>
            <div style={{fontSize:"11px",fontWeight:700,marginBottom:"12px",textTransform:"uppercase",letterSpacing:"1.5px",color:T.sub}}>Filters</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:"8px",marginBottom:"8px"}}>
              <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub}}>Date From</label><Inp type="date" value={filterDateFrom} onChange={e=>setFilterDateFrom(e.target.value)}/></div>
              <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub}}>Date To</label><Inp type="date" value={filterDateTo} onChange={e=>setFilterDateTo(e.target.value)}/></div>
              <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub}}>Min Amount</label><Inp type="number" value={filterAmountMin} onChange={e=>setFilterAmountMin(e.target.value)} placeholder="0"/></div>
              <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub}}>Max Amount</label><Inp type="number" value={filterAmountMax} onChange={e=>setFilterAmountMax(e.target.value)} placeholder="999999"/></div>
              <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub}}>Platform</label><Sel value={filterPlatform} onChange={e=>setFilterPlatform(e.target.value)} options={[{v:"",l:"All"},{v:"Instagram",l:"Instagram"},{v:"YouTube",l:"YouTube"},{v:"TikTok",l:"TikTok"}]}/></div>
              <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub}}>Negotiator</label><Sel value={filterNegotiator} onChange={e=>setFilterNegotiator(e.target.value)} options={[{v:"",l:"All"},...users.filter(u=>u.role==="negotiator").map(u=>({v:u.name,l:u.name}))]}/></div>
              <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub}}>POC</label><Sel value={pocFilter} onChange={e=>setPocFilter(e.target.value)} options={[{v:"",l:"All POCs"},...[...new Set(influencers.map(i=>i.poc).filter(Boolean))].sort().map(p=>({v:p,l:p}))]}/></div>
              <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub}}>Sort by Date</label><Sel value={sortOrder} onChange={e=>setSortOrder(e.target.value)} options={[{v:"newest",l:"Newest first"},{v:"oldest",l:"Oldest first"}]}/></div>
            </div>
            {pocFilter&&<div style={{marginBottom:"8px",fontSize:"11px",color:T.brand,fontWeight:700}}>Filtering by POC · {pocFilter}</div>}
            <div style={{display:"flex",gap:"6px"}}>
              <Btn v="gold" sm onClick={()=>{const filtered=applyFilters();setTab("all")}}>Apply Filters</Btn>
              <Btn v="outline" sm onClick={()=>{setFilterDateFrom("");setFilterDateTo("");setFilterAmountMin("");setFilterAmountMax("");setFilterPlatform("");setFilterNegotiator("");setFilterStatus([]);setActiveFilters([]);setPocFilter("");setSortOrder("newest")}}>Clear All</Btn>
            </div>
            {activeFilters.length>0&&<div style={{marginTop:"8px",display:"flex",gap:"4px",flexWrap:"wrap"}}>
              {activeFilters.map((f,i)=><span key={i} style={{display:"inline-flex",alignItems:"center",gap:"4px",background:T.goldSoft,color:T.brand,padding:"4px 8px",borderRadius:"2px",fontSize:"10px",fontWeight:700}}>
                {f}<button onClick={()=>clearFilter(i)} style={{background:"none",border:"none",color:T.brand,cursor:"pointer",fontSize:"12px",padding:"0",lineHeight:1}}>✕</button>
              </span>)}
            </div>}
          </div>

          {/* Tabs + Action */}
          {(()=>{
            const tc = {
              all: deals.length,
              pending: deals.filter(x=>["pending","renegotiate"].includes(x.status)).length,
              active: deals.filter(x=>["approved","email_sent","acknowledged","shipped","delivered_prod","partial_live","live","payment_details_received"].includes(x.status)).length,
              review: deals.filter(x=>(x.dels||[]).some(dl=>dl.st==="submitted")).length,
              dispatch: deals.filter(x=>x.status==="acknowledged"&&!x.ship&&!x.productOnHand).length,
              transit: deals.filter(x=>x.ship?.st==="shipped").length,
              delivered: deals.filter(x=>x.status==="delivered_prod"||x.ship?.st==="delivered").length,
              live: deals.filter(x=>["partial_live","live"].includes(x.status)).length,
              payment: deals.filter(x=>["invoice_ok","disputed","partial_paid","paid","payment_details_received","payment_requested","payment_approved"].includes(x.status)).length,
              rejected: deals.filter(x=>x.status==="rejected").length,
              dropped: deals.filter(x=>["dropped","drop_requested"].includes(x.status)).length,
            };
            return <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${T.border}`,marginBottom:"20px",flexWrap:"wrap",gap:"8px"}}>
              <div style={{display:"flex",gap:"22px",flexWrap:"wrap"}}>
                {[{k:"all",l:"All"},{k:"pending",l:"Pending"},{k:"active",l:"Active"},{k:"review",l:"Content Review"},{k:"dispatch",l:"Awaiting Dispatch"},{k:"transit",l:"In Transit"},{k:"delivered",l:"Delivered"},{k:"live",l:"Live"},{k:"payment",l:"Payments"},{k:"rejected",l:"Rejected"},{k:"dropped",l:"Dropped"}].map(t=>(
                  <button key={t.k} onClick={()=>setTab(t.k)} style={{padding:"12px 0",border:"none",borderBottom:tab===t.k?`2px solid ${T.brand}`:"2px solid transparent",background:"none",color:tab===t.k?T.brand:T.sub,fontWeight:700,fontSize:"12px",letterSpacing:"1px",textTransform:"uppercase",cursor:"pointer",fontFamily:T.ui,whiteSpace:"nowrap"}}>{t.l} <span style={{color:tab===t.k?T.gold:T.faint,fontFamily:T.display}}>{tc[t.k]}</span></button>
                ))}
              </div>
              <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
                {bulkSelected.size>0?<>
                  {(role==="approver"||role==="admin")&&<Btn v="ok" sm onClick={bulkApprove}>Approve ({bulkSelected.size})</Btn>}
                  {(role==="approver"||role==="admin")&&<Btn v="danger" sm onClick={bulkReject}>Reject ({bulkSelected.size})</Btn>}
                  <Btn v="outline" sm onClick={bulkExportCSV}>Export ({bulkSelected.size})</Btn>
                </>:<span style={{fontSize:"11px",color:T.sub,fontStyle:"italic",fontFamily:T.display,paddingBottom:"12px"}}>Bulk select · export CSV</span>}
              </div>
            </div>;
          })()}

          {/* Bulk Select */}
          <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"14px",padding:"10px 14px",background:T.surfaceAlt,border:`1px solid ${T.border}`,borderRadius:"2px"}}>
            <input type="checkbox" checked={bulkSelectAll} onChange={()=>toggleSelectAll(filtered)} style={{cursor:"pointer"}} title="Select all deals"/>
            <span style={{fontSize:"11px",color:T.sub,fontWeight:600,letterSpacing:"0.5px",textTransform:"uppercase"}}>{bulkSelectAll?`All ${filtered.length} selected`:`Select all (${filtered.length})`}</span>
            {bulkSelected.size>0&&<span style={{fontSize:"11px",color:T.brand,fontWeight:700,marginLeft:"auto"}}>{bulkSelected.size} selected</span>}
          </div>

          {/* Cards */}
          {(()=>{
            const pagedDeals = filtered.slice(dealsPage * ITEMS_PER_PAGE, (dealsPage+1) * ITEMS_PER_PAGE);
            return <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(265px,1fr))",gap:"16px"}}>
                {pagedDeals.map(d=>{
                  const paid=totalPaid(d);
                  // deliverables grouped by type → "1 Reel · 2 Stories"
                  const delCounts={}; (d.dels||[]).forEach(x=>{const t=x.type||"Deliverable"; delCounts[t]=(delCounts[t]||0)+1;});
                  const plural=(t,n)=> n===1?t:(t.endsWith("y")?t.slice(0,-1)+"ies":t+"s");
                  const delSummary=Object.entries(delCounts).map(([t,n])=>`${n} ${plural(t,n)}`).join(" · ")||"No deliverables";
                  return <div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${bulkSelected.has(d.id)?T.brand:T.border}`,borderRadius:"2px",padding:"18px",cursor:"pointer",animation:"fadeUp .3s ease"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"14px"}}>
                      <div style={{display:"flex",alignItems:"flex-start",gap:"9px"}}>
                        <input type="checkbox" checked={bulkSelected.has(d.id)} onClick={e=>e.stopPropagation()} onChange={e=>{e.stopPropagation();toggleBulkSelect(d.id)}} style={{cursor:"pointer",marginTop:"5px",accentColor:T.brand}}/>
                        <div>
                          <div style={{fontFamily:T.display,fontSize:"17px",fontWeight:600}}>{d.inf}{d.managerNote&&<span title="Management note" style={{marginLeft:"6px",fontSize:"12px",verticalAlign:"middle"}}>📌</span>}</div>
                          <div style={{fontSize:"10px",color:T.sub,marginTop:"3px"}}>{d.platform} · {d.followers}</div>
                        </div>
                      </div>
                      <Badge s={d.status} sm/>
                    </div>
                    <div style={{fontSize:"12px",color:"#3a342c",borderTop:`1px solid ${T.borderSoft}`,paddingTop:"12px"}}>{d.products?d.products.map(p=>p.name).join(", "):d.product}{d.agencyManaged&&<span style={{fontSize:"9px",color:T.gold,textTransform:"uppercase",letterSpacing:"0.5px"}}> · Agency</span>}</div>
                    <div style={{fontSize:"10px",color:T.sub,marginTop:"3px"}}>{delSummary}</div>
                    <div style={{fontFamily:T.display,fontSize:"20px",fontWeight:600,marginTop:"14px",color:Number(d.amount)===0?T.gold:undefined}}>{fAmt(d.amount)}</div>
                    {paid>0&&paid<d.amount&&<div style={{marginTop:"8px",height:"2.5px",borderRadius:"2px",background:T.goldSoft,overflow:"hidden"}}><div style={{height:"100%",width:`${(paid/d.amount)*100}%`,background:T.ok}}/></div>}
                  </div>;
                })}
              </div>
              {filtered.length===0&&<div style={{textAlign:"center",padding:"50px",color:T.sub,fontSize:"12px"}}>No collabs in this view</div>}
              {filtered.length > ITEMS_PER_PAGE && <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:"24px"}}>
                <span style={{fontSize:"11px",color:T.sub}}>Showing {dealsPage*ITEMS_PER_PAGE+1}–{Math.min(filtered.length,(dealsPage+1)*ITEMS_PER_PAGE)} of {filtered.length}</span>
                <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
                  <Btn v="outline" sm disabled={dealsPage===0} onClick={()=>setDealsPage(p=>p-1)}>‹</Btn>
                  <span style={{fontSize:"11px",color:T.sub,fontFamily:T.display}}>Page {dealsPage+1} of {Math.ceil(filtered.length/ITEMS_PER_PAGE)}</span>
                  <Btn v="outline" sm disabled={(dealsPage+1)*ITEMS_PER_PAGE>=filtered.length} onClick={()=>setDealsPage(p=>p+1)}>›</Btn>
                </div>
              </div>}
            </>;
          })()}
        </>}

        {/* ═══ DROPPED COLLABS (Negotiator view) ═══ */}
        {view==="dropped"&&role==="negotiator"&&(()=>{
          const droppedDeals = deals.filter(d=>d.status==="dropped");
          return <>
            <div style={{marginBottom:"14px"}}>
              <span style={{fontSize:"30px",fontWeight:500,fontFamily:DISPLAY,letterSpacing:"-0.5px"}}>Dropped Collabs</span>
              <span style={{fontSize:"13px",color:T.sub,marginLeft:"8px"}}>({droppedDeals.length} total)</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(295px,1fr))",gap:"9px"}}>
              {droppedDeals.map(d=>(
                <div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.errBg,border:`1px solid ${T.err}33`,borderRadius:"2px",padding:"13px",cursor:"pointer",transition:"all .12s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=T.err}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=`${T.err}33`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"5px"}}>
                    <div><div style={{fontWeight:800,fontSize:"14px"}}>{d.inf}</div><div style={{fontSize:"11px",color:T.sub}}>{d.platform} · {d.followers}</div></div>
                    <Badge s={d.status} sm/>
                  </div>
                  <div style={{fontSize:"12px",color:T.sub,marginBottom:"6px"}}>{d.product}</div>
                  <div style={{fontSize:"11px",color:T.err,fontWeight:600,padding:"6px",background:"rgba(180,35,24,.1)",borderRadius:"2px",marginBottom:"6px"}}>Dropped by {d.logs?.find(l=>l.a==="Collab dropped")?.u||"Unknown"}</div>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    <span style={{fontWeight:800,fontSize:"14px",color:T.gold}}>{fAmt(d.amount)}</span>
                    <span style={{fontSize:"11px",color:T.sub}}>{d.dels.length} deliverables</span>
                  </div>
                </div>
              ))}
            </div>
            {droppedDeals.length===0&&<div style={{textAlign:"center",padding:"40px",color:T.sub,fontSize:"12px"}}>No dropped collabs yet</div>}
          </>;
        })()}

        {/* ═══ CAMPAIGNS ═══ */}
        {view==="campaigns"&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:"24px",flexWrap:"wrap",gap:"12px"}}>
            <div>
              <div style={{fontSize:"10px",letterSpacing:"3px",textTransform:"uppercase",color:T.gold,fontWeight:600,marginBottom:"10px"}}>{campaigns.filter(c=>c.status==="active").length} active · {f(campaigns.reduce((s,c)=>s+campCommitted(c.id),0))} committed</div>
              <div style={{fontFamily:DISPLAY,fontSize:"32px",fontWeight:500,letterSpacing:"-0.5px"}}>Campaigns</div>
            </div>
            {(role==="approver"||role==="finance"||role==="admin")&&<Btn v="gold" onClick={()=>{setEditingCampId(null);setNCamp({name:"",budget:"",target:"",deadline:"",brief:"",status:"active"});setModal("newCamp")}}>+ New Campaign</Btn>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:"18px"}}>
            {campaigns.map(c=>{
              const comm=campCommitted(c.id),pd=campPaid(c.id),pct=c.budget>0?Math.round(comm/c.budget*100):0,lk=campLocked(c.id);
              const over=comm>c.budget&&c.budget>0;
              return <div key={c.id} onClick={()=>openCampDetail(c)} style={{background:T.surface,border:`1px solid ${over?"#E8C9C6":T.border}`,borderTop:over?`2px solid ${T.err}`:undefined,borderRadius:"2px",padding:"22px",cursor:"pointer"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"6px"}}>
                  <div style={{fontFamily:DISPLAY,fontSize:"20px",fontWeight:600,lineHeight:1.15}}>{c.name}</div>
                  <span style={{fontSize:"9px",letterSpacing:"1px",textTransform:"uppercase",fontWeight:700,padding:"3px 8px",borderRadius:"2px",whiteSpace:"nowrap",color:c.status==="active"?T.ok:c.status==="planning"?T.warn:T.sub,background:c.status==="active"?T.okBg:c.status==="planning"?T.warnBg:"#F2EEE4"}}>{c.status}</span>
                </div>
                <div style={{fontSize:"10px",color:c.deadline?T.sub:T.faint,marginBottom:"18px",fontStyle:c.deadline?"normal":"italic",fontFamily:c.deadline?T.ui:DISPLAY}}>{c.deadline?`Deadline · ${c.deadline}`:"No deadline set"}</div>
                <div style={{display:"flex",borderTop:`1px solid ${T.borderSoft}`,borderBottom:`1px solid ${T.borderSoft}`,marginBottom:"14px"}}>
                  <div style={{flex:1,padding:"12px 0"}}><div style={{fontSize:"9px",letterSpacing:"1px",textTransform:"uppercase",color:T.sub,marginBottom:"4px"}}>Budget</div><div style={{fontFamily:DISPLAY,fontSize:"16px",fontWeight:600}}>{f(c.budget)}</div></div>
                  <div style={{flex:1,padding:"12px 0"}}><div style={{fontSize:"9px",letterSpacing:"1px",textTransform:"uppercase",color:T.sub,marginBottom:"4px"}}>Committed</div><div style={{fontFamily:DISPLAY,fontSize:"16px",fontWeight:600,color:over?T.err:comm>0?T.gold:T.faint}}>{f(comm)}</div></div>
                  <div style={{flex:1,padding:"12px 0"}}><div style={{fontSize:"9px",letterSpacing:"1px",textTransform:"uppercase",color:T.sub,marginBottom:"4px"}}>Paid</div><div style={{fontFamily:DISPLAY,fontSize:"16px",fontWeight:600,color:pd>0?T.ok:T.faint}}>{f(pd)}</div></div>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:"10px",marginBottom:"6px"}}><span style={{color:T.sub}}>Budget used</span><span style={{color:over?T.err:T.sub,fontWeight:700}}>{pct}%</span></div>
                <div style={{height:"6px",background:T.goldSoft,borderRadius:"3px",overflow:"hidden",marginBottom:over?"12px":"24px"}}><div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:over?T.err:pct>70?T.gold:T.brand}}/></div>
                {over&&<div style={{display:"flex",alignItems:"center",gap:"7px",background:T.errBg,borderRadius:"2px",padding:"7px 10px",marginBottom:"14px"}}><span style={{fontSize:"10px",color:"#8a1a12",fontWeight:600}}>Over budget by {f(comm-c.budget)} — review before locking more.</span></div>}
                {(()=>{const goalPct=c.target>0?Math.round(lk/c.target*100):0;const met=c.target>0&&lk>=c.target;return <div style={{marginBottom:"16px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:"10px",marginBottom:"6px"}}><span style={{color:T.sub}}>Goal · influencers locked</span><span style={{color:met?T.ok:T.sub,fontWeight:700}}>{lk}/{c.target}{c.target>0?` · ${goalPct}%`:""}</span></div>
                  <div style={{height:"6px",background:T.goldSoft,borderRadius:"3px",overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(goalPct,100)}%`,background:met?T.ok:T.brand}}/></div>
                </div>;})()}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:"8px"}}>
                  <div style={{fontSize:"11px",color:T.sub}}>{lk}/{c.target} influencers locked · <b style={{color:T.text}}>{campDeals(c.id).length} deals</b></div>
                  <div style={{display:"flex",gap:"10px",flex:"none"}}>
                    {(role==="admin"||role==="approver"||role==="finance")&&<span onClick={(e)=>{e.stopPropagation();openEditCampaign(c)}} style={{fontSize:"10px",letterSpacing:"0.5px",textTransform:"uppercase",fontWeight:700,color:T.brand,cursor:"pointer"}}>✎ Edit</span>}
                    {role==="admin"&&<span onClick={(e)=>{e.stopPropagation();deleteCampaignAdmin(c)}} style={{fontSize:"10px",letterSpacing:"0.5px",textTransform:"uppercase",fontWeight:700,color:T.err,cursor:"pointer"}}>🗑 Delete</span>}
                  </div>
                </div>
              </div>;})}
          </div>
        </>}

        {/* ═══ DELETED (admin restore) ═══ */}
        {view==="deleted"&&role==="admin"&&<>
          <div style={{marginBottom:"24px"}}>
            <div style={{fontSize:"10px",letterSpacing:"3px",textTransform:"uppercase",color:T.gold,fontWeight:600,marginBottom:"10px"}}>{deletedCampaigns.length} campaign{deletedCampaigns.length===1?"":"s"} · {deletedDeals.length} collab{deletedDeals.length===1?"":"s"} archived</div>
            <div style={{fontFamily:DISPLAY,fontSize:"32px",fontWeight:500,letterSpacing:"-0.5px"}}>Deleted</div>
            <div style={{fontSize:"12px",color:T.sub,marginTop:"6px"}}>Hidden from every budget, analytic and list. Restore brings an item back exactly as it was.</div>
          </div>

          <div style={{fontSize:"11px",letterSpacing:"2px",textTransform:"uppercase",fontWeight:700,marginBottom:"14px"}}>Campaigns</div>
          {deletedCampaigns.length===0&&<div style={{fontSize:"12px",color:T.sub,marginBottom:"30px"}}>No deleted campaigns.</div>}
          {deletedCampaigns.length>0&&<div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",marginBottom:"30px"}}>
            {deletedCampaigns.map((c,i,arr)=><div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",borderBottom:i<arr.length-1?`1px solid ${T.borderSoft}`:"none"}}>
              <div><div style={{fontFamily:DISPLAY,fontSize:"16px",fontWeight:600}}>{c.name}</div><div style={{fontSize:"11px",color:T.sub,marginTop:"2px"}}>{f(c.budget)} budget · {deletedDeals.filter(d=>d.cid===c.id).length} collab(s) archived with it</div></div>
              <Btn v="outline" sm onClick={()=>restoreCampaign(c)}>↩ Restore</Btn>
            </div>)}
          </div>}

          <div style={{fontSize:"11px",letterSpacing:"2px",textTransform:"uppercase",fontWeight:700,marginBottom:"14px"}}>Collabs</div>
          {deletedDeals.length===0&&<div style={{fontSize:"12px",color:T.sub}}>No deleted collabs.</div>}
          {deletedDeals.length>0&&<div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px"}}>
            {deletedDeals.map((d,i,arr)=>{const camp=[...campaigns,...deletedCampaigns].find(c=>c.id===d.cid);const campGone=camp&&camp.deleted;return <div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",borderBottom:i<arr.length-1?`1px solid ${T.borderSoft}`:"none"}}>
              <div><div style={{fontSize:"13px",fontWeight:700}}>{d.inf} <span style={{fontSize:"11px",color:T.sub,fontWeight:400}}>· {d.collabId||""}</span></div><div style={{fontSize:"11px",color:T.sub,marginTop:"3px",display:"flex",alignItems:"center",gap:"6px"}}>{fAmt(d.amount)} · {camp?.name||"—"} <Badge s={d.status} sm/>{campGone&&<span style={{color:T.faint,fontStyle:"italic"}}>· restore its campaign first</span>}</div></div>
              <Btn v="outline" sm disabled={campGone} onClick={()=>restoreCollab(d)}>↩ Restore</Btn>
            </div>;})}
          </div>}
        </>}

        {/* ═══ DELIVERABLES BANK ═══ */}
        {view==="deliverables"&&<>
          <div style={{marginBottom:"24px"}}>
            <div style={{fontSize:"10px",letterSpacing:"3px",textTransform:"uppercase",color:T.gold,fontWeight:600,marginBottom:"10px"}}>{pendingDels.length} deliverable{pendingDels.length===1?"":"s"} in flight</div>
            <div style={{fontFamily:DISPLAY,fontSize:"32px",fontWeight:500,letterSpacing:"-0.5px"}}>Deliverables Bank</div>
          </div>
          {/* Workflow summary strip */}
          <div style={{display:"flex",borderTop:`1px solid ${T.border}`,borderBottom:`1px solid ${T.border}`,marginBottom:"26px",flexWrap:"wrap"}}>
            {[
              {l:"Pending",v:pendingDels.filter(d=>d.st==="pending").length,c:T.warn},
              {l:"Submitted",v:awaitingReview.length,c:T.info},
              {l:"Revision Needed",v:revisionNeeded.length,c:T.err},
              {l:"Approved / Live",v:pendingDels.filter(d=>d.st==="approved").length,c:T.ok},
            ].map((m,i,arr)=><div key={i} style={{flex:"1 1 150px",padding:"18px 22px",borderRight:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
              <div style={{fontSize:"10px",letterSpacing:"2px",textTransform:"uppercase",color:T.sub,marginBottom:"8px"}}>{m.l}</div>
              <div style={{fontFamily:DISPLAY,fontSize:"34px",fontWeight:500,lineHeight:1,color:m.v>0?m.c:"#C9C1B2"}}>{m.v}</div>
            </div>)}
          </div>
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",overflow:"hidden",marginBottom:"20px"}}>
            <div style={{display:"grid",gridTemplateColumns:"1.8fr 1.5fr 1.2fr 0.8fr 0.8fr 0.7fr",padding:"8px 12px",background:T.brand,fontSize:"10px",fontWeight:800,color:"#F6DFC1",textTransform:"uppercase",fontFamily:"Bodoni Moda,serif",letterSpacing:".5px"}}>
              <div>Influencer</div><div>Deliverable</div><div>Campaign</div><div>Platform</div><div>Deadline</div><div>Status</div>
            </div>
            {pendingDels.length===0&&<div style={{padding:"24px",textAlign:"center",color:T.sub,fontSize:"12px"}}>{deals.some(d=>!["rejected","pending","renegotiate","dropped"].includes(d.status))?"All deliverables fulfilled! 🎉":"No approved deals with pending deliverables yet"}</div>}
            {pendingDels.map((d,i)=>{
              const overdue = d.st==="pending"&&new Date(d.deadline)<new Date();
              return <div key={i} style={{display:"grid",gridTemplateColumns:"1.8fr 1.5fr 1.2fr 0.8fr 0.8fr 0.7fr",padding:"8px 12px",borderBottom:`1px solid ${T.border}`,fontSize:"13px",alignItems:"center",background:overdue?T.errBg:d.st==="revision_requested"?"#FFF5F5":"transparent"}}>
                <div style={{fontWeight:700}}>{d.inf}</div>
                <div><span style={{color:T.sub}}>{d.type}</span> — {d.desc||"—"}{d.link?<a href={ensureUrl(d.link)} target="_blank" rel="noreferrer" style={{marginLeft:"4px",fontSize:"11px",color:T.info}}>🔗</a>:null}</div>
                <div style={{fontSize:"11px",color:T.gold,fontWeight:700}}>{getCamp(d.cid)?.name||"—"}</div>
                <div>{d.platform}</div>
                <div style={{color:overdue?T.err:T.text,fontWeight:overdue?700:400}}>{d.deadline}{overdue?" ⚠":""}</div>
                <DBadge s={d.st}/>
              </div>;
            })}
          </div>

          {/* By Deliverable Type — the "bank" grouped by type (all pending Stories, all pending Reels, etc.) */}
          <div style={{fontSize:"13px",fontWeight:800,marginBottom:"10px"}}>By Deliverable Type</div>
          {(()=>{
            const byType={};
            pendingDels.forEach(d=>{(byType[d.type]=byType[d.type]||[]).push(d);});
            const types=Object.keys(byType).sort();
            if(types.length===0) return <div style={{color:T.sub,fontSize:"12px",marginBottom:"20px"}}>No active deliverables.</div>;
            const chip=(n,label,c,bg)=>n>0&&<span style={{padding:"2px 7px",borderRadius:"2px",fontSize:"10px",fontWeight:700,color:c,background:bg}}>{n} {label}</span>;
            return <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))",gap:"10px",marginBottom:"22px"}}>
              {types.map(type=>{
                const list=byType[type]; const cnt=st=>list.filter(d=>d.st===st).length;
                return <div key={type} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"12px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
                    <span style={{fontWeight:800,fontSize:"14px"}}>{type}</span>
                    <span style={{fontSize:"12px",fontWeight:800,color:T.purple}}>{list.length}</span>
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:"4px",marginBottom:"8px"}}>
                    {chip(cnt("pending"),"pending",T.warn,T.warnBg)}
                    {chip(cnt("submitted"),"submitted",T.info,T.infoBg)}
                    {chip(cnt("revision_requested"),"revision",T.err,T.errBg)}
                    {chip(cnt("approved"),"approved",T.ok,T.okBg)}
                  </div>
                  <div style={{maxHeight:"170px",overflow:"auto"}}>
                    {list.map((d,i)=><div key={i} onClick={()=>{const deal=deals.find(x=>x.id===d.dealId);if(deal){setSel(deal);setModal("detail")}}} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:"6px",padding:"5px 0",borderBottom:`1px dashed ${T.border}`,fontSize:"12px",cursor:"pointer"}}>
                      <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}><b>{d.inf}</b> <span style={{color:T.sub}}>· {getCamp(d.cid)?.name||"—"}</span></span>
                      <DBadge s={d.st}/>
                    </div>)}
                  </div>
                </div>;
              })}
            </div>;
          })()}

          <div style={{fontSize:"13px",fontWeight:800,marginBottom:"10px"}}>By Influencer</div>
          {deals.filter(d=>!["rejected"].includes(d.status)&&d.dels.length>0).map(d=>{
            const done=d.dels.filter(x=>x.st==="live").length;
            const stColor={pending:T.warn,submitted:T.info,revision_requested:T.err,approved:T.ok,live:T.ok};
            const stIcon={pending:"⏳",submitted:"📤",revision_requested:"✏️",approved:"✅",live:"✓"};
            return <div key={d.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"10px 12px",marginBottom:"6px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"4px"}}>
                <div><span style={{fontWeight:800,fontSize:"12px"}}>{d.inf}</span> <span style={{fontSize:"11px",color:T.sub}}>· {d.platform} · {getCamp(d.cid)?.name||""}</span></div>
                <span style={{fontSize:"13px",fontWeight:800,color:done===d.dels.length?T.ok:T.warn}}>{done}/{d.dels.length} live</span>
              </div>
              <div style={{display:"flex",gap:"4px",flexWrap:"wrap"}}>
                {d.dels.map((dl,i)=><span key={i} style={{padding:"3px 8px",borderRadius:"2px",fontSize:"11px",fontWeight:700,background:dl.st==="live"?T.okBg:dl.st==="submitted"?T.infoBg:dl.st==="revision_requested"?T.errBg:dl.st==="approved"?T.okBg:T.warnBg,color:stColor[dl.st]||T.warn}}>{dl.type} {stIcon[dl.st]||"⏳"}</span>)}
              </div>
            </div>;
          })}
        </>}

        {/* ═══ SHIPMENTS (full view) ═══ */}
        {view==="shipments"&&<>
          <div style={{marginBottom:"24px"}}>
            <div style={{fontSize:"10px",letterSpacing:"3px",textTransform:"uppercase",color:T.gold,fontWeight:600,marginBottom:"10px"}}>{pickupsInTransit.length} return pickup{pickupsInTransit.length===1?"":"s"} · {inTransit.length} in transit · {deals.filter(d=>d.ship?.st==="delivered").length} delivered</div>
            <div style={{fontFamily:DISPLAY,fontSize:"32px",fontWeight:500,letterSpacing:"-0.5px"}}>All Shipments</div>
          </div>
          {awaitingAck.length>0&&<Section title={`Awaiting Acknowledgement (${awaitingAck.length})`} icon="⏳">
            {awaitingAck.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:"3px solid #f59e0b",borderRadius:"2px",padding:"10px 12px",marginBottom:"6px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
              <div><div style={{fontWeight:700,fontSize:"12px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400}}>· {d.products?d.products.map(p=>p.name).join(", "):d.product}</span></div><div style={{fontSize:"11px",color:T.sub}}>Email sent · Deadline: {d.deadline}{pocNameFor(d.inf)?` · POC: ${pocNameFor(d.inf)}`:""}</div></div>
              <span style={{fontSize:"11px",color:"#92400e",fontWeight:700}}>⏳ Awaiting influencer confirmation</span>
            </div>)}
          </Section>}
          {pendingShip.length>0&&<Section title={`Ready to Dispatch (${pendingShip.length})`} icon="📋">
            {pendingShip.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"10px 12px",marginBottom:"6px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
              <div><div style={{fontWeight:700,fontSize:"12px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400}}>· {d.products?d.products.map(p=>p.name).join(", "):d.product}</span></div><div style={{fontSize:"11px",color:T.sub}}>Acknowledged: {d.ackAt?new Date(d.ackAt).toLocaleDateString("en-IN",{day:"numeric",month:"short"}):"—"} · Deadline: {d.deadline}{pocNameFor(d.inf)?` · POC: ${pocNameFor(d.inf)}`:""}</div></div>
              {(role==="logistics"||role==="admin")?<Btn v="purple" sm onClick={(e)=>{e.stopPropagation();setSel(d);setShipF({track:"",carrier:"DTDC",orderId:""});setModal("ship")}}>📦 Dispatch</Btn>:<span style={{fontSize:"11px",color:T.warn,fontWeight:700}}>Awaiting logistics</span>}
            </div>)}
          </Section>}

          {/* Pickup Requests */}
          {pickupRequests.length>0&&<Section title={`Pickup Requests (${pickupRequests.length})`} icon="🔄">
            {pickupRequests.map(h=>{
              const deal = deals.find(d=>d.id===h.dealId);
              return <div key={h.dealId+"-"+h.histIdx} onClick={()=>{if(deal){setSel(deal);setModal("detail")}}} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${T.warn}`,borderRadius:"2px",padding:"10px 12px",marginBottom:"6px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
                <div><div style={{fontWeight:700,fontSize:"12px"}}>{h.inf} <span style={{color:T.warn,fontWeight:600}}>· Return ({h.reason})</span></div><div style={{fontSize:"11px",color:T.sub}}>📍 {h.address||"—"} · Requested: {new Date(h.requestedAt).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}{pocNameFor(h.inf)?` · POC: ${pocNameFor(h.inf)}`:""}</div></div>
                {(role==="logistics"||role==="admin")&&<Btn v="gold" sm onClick={(e)=>{e.stopPropagation();setSel(deal);setShipF({track:"",carrier:"DTDC",orderId:""});setModal("arrangePickup-"+h.histIdx)}}>🔄 Arrange</Btn>}
              </div>;
            })}
          </Section>}

          {/* Pickups In Transit */}
          {pickupsInTransit.length>0&&<div style={{marginBottom:"30px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"14px"}}>
              <span style={{fontSize:"11px",letterSpacing:"2px",textTransform:"uppercase",fontWeight:700}}>Return Pickups in Transit</span>
              <span style={{fontSize:"10px",fontWeight:700,color:T.brand,background:"#EDE7D6",padding:"2px 8px",borderRadius:"10px"}}>{pickupsInTransit.length}</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:"14px"}}>
              {pickupsInTransit.map(h=>{
                const deal = deals.find(d=>d.id===h.dealId);
                return <div key={h.dealId+"-"+h.histIdx} onClick={()=>{if(deal){setSel(deal);setModal("detail")}}} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"16px 18px",display:"flex",alignItems:"center",gap:"14px",cursor:"pointer"}}>
                  <span style={{width:"34px",height:"34px",borderRadius:"50%",background:"#E0EDFA",color:"#0F5BA7",display:"flex",alignItems:"center",justifyContent:"center",flex:"none"}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg></span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}><span style={{fontSize:"13px",fontWeight:700}}>{h.inf}</span><span style={{fontSize:"9px",letterSpacing:"1px",textTransform:"uppercase",color:"#0F5BA7",background:"#E0EDFA",padding:"3px 7px",borderRadius:"2px",fontWeight:700}}>Return in transit</span></div>
                    <div style={{fontSize:"10px",color:T.sub,marginTop:"4px"}}>{h.returnCarrier} · <span style={{fontFamily:DISPLAY,letterSpacing:"0.5px",color:"#3a342c"}}>{h.returnTrack}</span>{pocNameFor(h.inf)?` · POC: ${pocNameFor(h.inf)}`:""}</div>
                  </div>
                  {(role==="logistics"||role==="admin")
                    ? <span onClick={(e)=>{e.stopPropagation();markProductReturned(deal,h.histIdx)}} style={{fontSize:"10px",letterSpacing:"1px",textTransform:"uppercase",fontWeight:700,color:T.brand,flex:"none",cursor:"pointer"}}>Mark returned →</span>
                    : <span style={{fontSize:"10px",letterSpacing:"1px",textTransform:"uppercase",fontWeight:700,color:T.brand,flex:"none"}}>Track →</span>}
                </div>;
              })}
            </div>
          </div>}

          {/* Re-shipments Pending */}
          {reshipPending.length>0&&<Section title={`Re-shipments Pending (${reshipPending.length})`} icon="📦">
            {reshipPending.map(h=>{
              const deal = deals.find(d=>d.id===h.dealId);
              return <div key={h.dealId+"-"+h.histIdx} onClick={()=>{if(deal){setSel(deal);setModal("detail")}}} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${T.purple}`,borderRadius:"2px",padding:"10px 12px",marginBottom:"6px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
                <div><div style={{fontWeight:700,fontSize:"12px"}}>{h.inf} <span style={{color:T.purple,fontWeight:600}}>· New Shipment</span></div><div style={{fontSize:"11px",color:T.sub}}>📦 {(h.products||[]).map(p=>p.name).join(", ")} · 📍 {h.address||"—"}{pocNameFor(h.inf)?` · POC: ${pocNameFor(h.inf)}`:""}</div></div>
                {(role==="logistics"||role==="admin")&&<Btn v="purple" sm onClick={(e)=>{e.stopPropagation();setSel(deal);setReshipShipF({track:"",carrier:"DTDC",orderId:""});setModal("reshipDispatch-"+h.histIdx)}}>📦 Dispatch</Btn>}
              </div>;
            })}
          </Section>}

          {/* Re-shipments In Transit */}
          {reshipInTransit.length>0&&<Section title={`Re-shipments In Transit (${reshipInTransit.length})`} icon="🚚">
            {reshipInTransit.map(h=>{
              const deal = deals.find(d=>d.id===h.dealId);
              return <div key={h.dealId+"-"+h.histIdx} onClick={()=>{if(deal){setSel(deal);setModal("detail")}}} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"10px 12px",marginBottom:"6px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
                <div><div style={{fontWeight:700,fontSize:"12px"}}>{h.inf} <span style={{color:T.purple,fontWeight:600}}>· Re-shipment</span></div><div style={{fontSize:"11px",color:T.sub}}>{h.reCarrier}: <span style={{color:T.info,fontWeight:700}}>{h.reTrack}</span></div></div>
                {(role==="logistics"||role==="admin")&&<Btn v="ok" sm onClick={(e)=>{e.stopPropagation();setSel(deal);setReshipDelivF({date:todayLocal(),note:"",histIdx:h.histIdx});setModal("markReshipDelivered")}}>✓ Delivered</Btn>}
              </div>;
            })}
          </Section>}

          {/* In Transit */}
          <div style={{marginBottom:"30px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"14px"}}>
              <span style={{fontSize:"11px",letterSpacing:"2px",textTransform:"uppercase",fontWeight:700}}>In Transit</span>
              <span style={{fontSize:"10px",fontWeight:700,color:inTransit.length>0?T.brand:T.sub,background:inTransit.length>0?"#EDE7D6":"#F2EEE4",padding:"2px 8px",borderRadius:"10px"}}>{inTransit.length}</span>
            </div>
            {inTransit.length===0
              ? <div style={{background:T.surface,border:`1px dashed ${T.inputBorder}`,borderRadius:"2px",padding:"30px",textAlign:"center"}}>
                  <div style={{fontSize:"13px",fontWeight:600,color:T.sub}}>Nothing in transit right now</div>
                  <div style={{fontSize:"11px",color:T.faint,marginTop:"4px"}}>Dispatched orders will appear here with live tracking.</div>
                </div>
              : <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px"}}>
                  {inTransit.map((d,i,arr)=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",borderBottom:i<arr.length-1?`1px solid ${T.borderSoft}`:"none",cursor:"pointer"}}>
                    <div><div style={{fontWeight:700,fontSize:"13px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400}}>· {d.products?d.products.map(p=>p.name).join(", "):d.product}</span></div><div style={{fontSize:"10px",color:T.sub,marginTop:"3px"}}>{d.ship.carrier} · <span style={{fontFamily:DISPLAY,letterSpacing:"0.5px",color:T.text}}>{d.ship.track}</span> · {d.ship.dispAt}{pocNameFor(d.inf)?` · POC: ${pocNameFor(d.inf)}`:""}</div></div>
                    {(role==="logistics"||role==="admin")&&<Btn v="ok" sm onClick={(e)=>{e.stopPropagation();setSel(d);setDeliveryF({date:todayLocal(),note:""});setModal("markDelivered")}}>Delivered</Btn>}
                  </div>)}
                </div>}
          </div>

          {/* Delivered */}
          <div>
            <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"14px"}}>
              <span style={{fontSize:"11px",letterSpacing:"2px",textTransform:"uppercase",fontWeight:700}}>Delivered</span>
              <span style={{fontSize:"10px",fontWeight:700,color:T.teal,background:T.tealBg,padding:"2px 8px",borderRadius:"10px"}}>{deals.filter(d=>d.ship?.st==="delivered").length}</span>
            </div>
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px"}}>
              {deals.filter(d=>d.ship?.st==="delivered").length===0&&<div style={{padding:"20px",textAlign:"center",color:T.sub,fontSize:"12px"}}>No deliveries yet</div>}
              {deals.filter(d=>d.ship?.st==="delivered").map((d,i,arr)=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{display:"flex",alignItems:"center",gap:"13px",padding:"14px 18px",borderBottom:i<arr.length-1?`1px solid ${T.borderSoft}`:"none",cursor:"pointer"}}>
                <span style={{width:"22px",height:"22px",borderRadius:"50%",background:T.tealBg,color:T.teal,display:"flex",alignItems:"center",justifyContent:"center",flex:"none"}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
                <span style={{flex:1,fontSize:"13px"}}><b>{d.inf}</b> <span style={{color:T.sub}}>· {d.products?d.products.map(p=>p.name).join(", "):d.product}</span></span>
                <span style={{fontSize:"11px",color:T.sub,fontFamily:DISPLAY}}>Delivered {d.ship.delAt}</span>
              </div>)}
            </div>
          </div>
        </>}
      </div>

      {/* ═══════════════ MODALS ═══════════════ */}

      {/* NEW DEAL */}
      <Modal open={modal==="newDeal"&&nDeal} onClose={()=>{setModal(null);setEditingDealId(null)}} title={editingDealId?"Edit Collaboration":"New Collaboration"} w={580} noBackdropClose>
        {nDeal&&<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 10px"}}>
            <Field label="Campaign *"><Sel value={nDeal.cid} onChange={e=>setNDeal({...nDeal,cid:e.target.value})} options={campaigns.map(c=>({v:c.id,l:c.name}))}/></Field>
            <Field label="Influencer *"><Inp value={nDeal.inf} onChange={e=>setNDeal({...nDeal,inf:e.target.value})} placeholder="Priya Sharma" error={formErrors.inf}/></Field>
            <Field label="Influencer Email" required><Inp value={nDeal.email} onChange={e=>setNDeal({...nDeal,email:e.target.value})} placeholder="influencer@gmail.com" error={formErrors.email}/></Field>
            <Field label="Profile" required><Inp value={nDeal.profile} onChange={e=>setNDeal({...nDeal,profile:e.target.value})} placeholder="instagram.com/handle" error={formErrors.profile}/></Field>
            <Field label="Platform"><Sel value={nDeal.platform} onChange={e=>setNDeal({...nDeal,platform:e.target.value})} options={[{v:"Instagram",l:"Instagram"},{v:"YouTube",l:"YouTube"},{v:"Other",l:"Other"}]}/></Field>
            <Field label="Followers"><Inp value={nDeal.followers} onChange={e=>setNDeal({...nDeal,followers:e.target.value})} placeholder="125K"/></Field>
            <Field label="Usage Rights"><Sel value={nDeal.usage} onChange={e=>setNDeal({...nDeal,usage:e.target.value})} options={[{v:"3 months",l:"3 months"},{v:"6 months",l:"6 months"},{v:"12 months",l:"12 months"},{v:"Perpetual",l:"Perpetual"}]}/></Field>
            <Field label="Deadline *"><Inp value={nDeal.deadline} onChange={e=>setNDeal({...nDeal,deadline:e.target.value})} type="date" error={formErrors.deadline}/></Field>
            <Field label="Phone *"><Inp value={nDeal.phone} onChange={e=>setNDeal({...nDeal,phone:e.target.value})} placeholder="+91 98765 43210" error={formErrors.phone}/></Field>
            <Field label="Street Address *"><Inp value={nDeal.address?.street||""} onChange={e=>setNDeal({...nDeal,address:{...nDeal.address,street:e.target.value}})} placeholder="House/Flat, Building, Street" error={formErrors.address}/></Field>
            <Field label="City *"><Inp value={nDeal.address?.city||""} onChange={e=>setNDeal({...nDeal,address:{...nDeal.address,city:e.target.value}})} placeholder="City" error={formErrors.city}/></Field>
            <Field label="State *"><Inp value={nDeal.address?.state||""} onChange={e=>setNDeal({...nDeal,address:{...nDeal.address,state:e.target.value}})} placeholder="State"/></Field>
            <Field label="Pincode *"><Inp value={nDeal.address?.pincode||""} onChange={e=>setNDeal({...nDeal,address:{...nDeal.address,pincode:e.target.value}})} placeholder="6-digit pincode" error={formErrors.pincode}/></Field>
          </div>

          {/* Historical rates for returning influencer */}
          {nDeal.inf && nDeal.inf.length > 2 && (()=>{
            const pastDeals = deals.filter(d => d.inf?.toLowerCase() === nDeal.inf?.toLowerCase() && d.status !== 'rejected' && d.status !== 'dropped');
            if(pastDeals.length === 0) return null;
            const avgRate = Math.round(pastDeals.reduce((s,d)=>s+d.amount,0)/pastDeals.length);
            return <div style={{padding:"10px 12px",background:T.infoBg,border:`1px solid ${T.info}33`,borderRadius:"2px",marginBottom:"8px",fontSize:"12px"}}>
              <div style={{fontWeight:800,fontSize:"11px",color:T.info,textTransform:"uppercase",letterSpacing:".5px",marginBottom:"6px"}}>📊 Previous Collaborations with {nDeal.inf} ({pastDeals.length})</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"4px 12px",marginBottom:"4px"}}>
                {pastDeals.slice(0,6).map((pd,idx)=><div key={idx} style={{display:"flex",justifyContent:"space-between",padding:"3px 6px",background:"rgba(255,255,255,.05)",borderRadius:"2px"}}>
                  <span style={{color:T.sub}}>{pd.at?.slice(0,7)||"—"}</span>
                  <span style={{fontWeight:700,color:T.gold}}>{f(pd.amount)}</span>
                </div>)}
              </div>
              <div style={{marginTop:"6px",paddingTop:"6px",borderTop:`1px solid ${T.info}22`,display:"flex",gap:"16px"}}>
                <span><b style={{color:T.info}}>Avg Rate:</b> <b style={{color:T.gold}}>{f(avgRate)}</b></span>
                <span><b style={{color:T.info}}>Last:</b> <b style={{color:T.gold}}>{f(pastDeals[0]?.amount)}</b> ({pastDeals[0]?.at?.slice(0,7)||"—"})</span>
                <span><b style={{color:T.info}}>Range:</b> <b style={{color:T.gold}}>{f(Math.min(...pastDeals.map(d=>d.amount)))} – {f(Math.max(...pastDeals.map(d=>d.amount)))}</b></span>
              </div>
            </div>;
          })()}

          {/* Products */}
          <div style={{marginTop:"8px",padding:"12px",background:T.surfaceAlt,borderRadius:"2px",marginBottom:"8px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
              <span style={{fontSize:"11px",fontWeight:800,color:T.brand,textTransform:"uppercase",letterSpacing:".5px"}}>📦 Products ({nDeal.products?.length||0})</span>
              <Btn v="outline" sm onClick={()=>setNDeal({...nDeal,products:[...(nDeal.products||[]),{id:uid(),name:"",color:"",size:"",qty:"1"}]})}>+ Add Product</Btn>
            </div>
            {(nDeal.products||[]).map((p,idx)=>{
              const cat = productCatalog.find(c=>c.name===p.name);
              const cuts = cat?.cuts || [];
              return <div key={idx} style={{display:"grid",gridTemplateColumns:cuts.length?"1fr 72px 80px 72px 48px 20px":"1fr 80px 80px 60px 24px",gap:"5px",marginBottom:"4px",alignItems:"center"}}>
              <Sel value={p.name} onChange={e=>{const updated=[...(nDeal.products||[])];updated[idx].name=e.target.value;const c2=productCatalog.find(c=>c.name===e.target.value);if(c2){updated[idx].color=c2.colors[0]||'';updated[idx].size=c2.sizes[0]||'';updated[idx].cut=(c2.cuts&&c2.cuts[0])||''}setNDeal({...nDeal,products:updated})}} options={[{v:'',l:'Select product...'},...productCatalog.map(c=>({v:c.name,l:c.name}))]} error={formErrors.products&&!p.name}/>
              <Sel value={p.color||''} onChange={e=>{const updated=[...(nDeal.products||[])];updated[idx].color=e.target.value;setNDeal({...nDeal,products:updated})}} options={[{v:'',l:'Color'},...(cat?.colors||[]).map(c=>({v:c,l:c}))]}/>
              {cuts.length>0&&<Sel value={p.cut||''} onChange={e=>{const updated=[...(nDeal.products||[])];updated[idx].cut=e.target.value;setNDeal({...nDeal,products:updated})}} options={[{v:'',l:'Cut'},...cuts.map(c=>({v:c,l:c}))]}/>}
              <Sel value={p.size||''} onChange={e=>{const updated=[...(nDeal.products||[])];updated[idx].size=e.target.value;setNDeal({...nDeal,products:updated})}} options={[{v:'',l:'Size'},...(cat?.sizes||[]).map(s=>({v:s,l:s}))]}/>
              <Inp value={p.qty} onChange={e=>{const ps=[...(nDeal.products||[])];ps[idx]={...ps[idx],qty:e.target.value};setNDeal({...nDeal,products:ps})}} placeholder="Qty" type="number"/>
              {(nDeal.products||[]).length>1&&<button onClick={()=>setNDeal({...nDeal,products:(nDeal.products||[]).filter((_,j)=>j!==idx)})} style={{background:"none",border:"none",color:T.err,cursor:"pointer",fontSize:"13px",padding:0}}>✕</button>}
            </div>;})}
            {formErrors.products&&<div style={{fontSize:"10px",color:T.err,marginTop:"4px"}}>At least one product name is required</div>}
          </div>

          <Field label="Amount (INR) *"><Inp value={nDeal.amount} onChange={e=>setNDeal({...nDeal,amount:e.target.value})} type="number" prefix="₹" error={formErrors.amount}/></Field>
          <Field label="Payment Terms"><Sel value={nDeal.paymentTerms||"next_15th"} onChange={e=>setNDeal({...nDeal,paymentTerms:e.target.value})} options={[{v:"next_15th",l:"Next 15th after going live"},{v:"45_days",l:"45 days after going live"},{v:"60_days",l:"60 days after going live"},{v:"immediate",l:"Immediate (on going live)"},{v:"advance",l:"Advance (before going live)"},{v:"custom",l:"Custom"}]}/></Field>

          {/* Deliverables */}
          <div style={{marginTop:"12px",padding:"12px",background:formErrors.dels?T.errBg:T.goldSoft,borderRadius:"2px",border:formErrors.dels?`1px solid ${T.err}`:"none"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
              <span style={{fontSize:"11px",fontWeight:800,color:T.brand,textTransform:"uppercase",letterSpacing:".5px"}}>📋 Deliverables ({nDeal.dels.length})</span>
              <Btn v="outline" sm onClick={()=>setNDeal({...nDeal,dels:[...nDeal.dels,{id:uid(),type:"Reel",desc:"",st:"pending",link:""}]})}>+ Add</Btn>
            </div>
            {nDeal.dels.map((dl,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"110px 1fr 24px",gap:"6px",marginBottom:"5px",alignItems:"center"}}>
              <Sel value={dl.type} onChange={e=>{const ds=[...nDeal.dels];ds[i]={...ds[i],type:e.target.value};setNDeal({...nDeal,dels:ds})}} options={[{v:"Reel",l:"Reel"},{v:"Story",l:"Story"},{v:"Dedicated Video",l:"Video"},{v:"Shorts",l:"Shorts"},{v:"Static Post",l:"Static"},{v:"Carousel",l:"Carousel"},{v:"Community Post",l:"Post"}]}/>
              <Inp value={dl.desc} onChange={e=>{const ds=[...nDeal.dels];ds[i]={...ds[i],desc:e.target.value};setNDeal({...nDeal,dels:ds})}} placeholder="Brief description" error={formErrors.delsDes&&!dl.desc}/>
              {nDeal.dels.length>1&&<button onClick={()=>setNDeal({...nDeal,dels:nDeal.dels.filter((_,j)=>j!==i)})} style={{background:"none",border:"none",color:T.err,cursor:"pointer",fontSize:"13px",padding:0}}>✕</button>}
            </div>)}
            {formErrors.delsDes&&<div style={{fontSize:"10px",color:T.err,marginTop:"4px"}}>Deliverable description is required</div>}
          </div>

          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"14px",paddingTop:"12px",borderTop:`1px solid ${T.border}`}}>
            <Btn v="outline" onClick={()=>{setModal(null);setEditingDealId(null)}}>Cancel</Btn>
            <Btn v="gold" disabled={submittingDeal} onClick={editingDealId?saveDealEdits:createDeal}>{submittingDeal?(editingDealId?"Saving…":"Submitting…"):(editingDealId?"Save Changes":"Submit for Approval")}</Btn>
          </div>
          <div style={{marginTop:"7px",padding:"6px 10px",background:T.infoBg,borderRadius:"2px",fontSize:"11px",color:T.info}}>🔒 Amount and deliverable list lock after manager approval. Email auto-generates from locked data.</div>
        </>}
      </Modal>

      {/* NEW / EDIT CAMPAIGN */}
      <Modal open={modal==="newCamp"&&nCamp} onClose={()=>{setModal(null);setEditingCampId(null);setNCamp(null)}} title={editingCampId?"Edit Campaign":"Create Campaign"} w={420} noBackdropClose>
        {nCamp&&<>
          <Field label="Campaign Name *"><Inp value={nCamp.name} onChange={e=>setNCamp({...nCamp,name:e.target.value})} placeholder="Summer Sculpt Launch"/></Field>
          <Field label="Budget (optional)"><Inp value={nCamp.budget} onChange={e=>setNCamp({...nCamp,budget:e.target.value})} type="number" prefix="₹"/><div style={{fontSize:"11px",color:T.sub,marginTop:"4px"}}>Leave 0 for no campaign cap — budgets are enforced per team member.</div></Field>
          <Field label="Target Influencers *"><Inp value={nCamp.target} onChange={e=>setNCamp({...nCamp,target:e.target.value})} type="number"/></Field>
          <Field label="Status"><Sel value={nCamp.status||"active"} onChange={e=>setNCamp({...nCamp,status:e.target.value})} options={[{v:"active",l:"Active"},{v:"planning",l:"Planning"},{v:"completed",l:"Completed"}]}/></Field>
          <Field label="Deadline"><Inp value={nCamp.deadline} onChange={e=>setNCamp({...nCamp,deadline:e.target.value})} type="date"/></Field>
          <Field label="Campaign Brief"><Textarea value={nCamp.brief} onChange={e=>setNCamp({...nCamp,brief:e.target.value})} placeholder="Describe the campaign objectives, target audience, key messages..." rows={4}/></Field>
          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"12px"}}><Btn v="outline" onClick={()=>{setModal(null);setEditingCampId(null);setNCamp(null)}}>Cancel</Btn><Btn v="gold" onClick={createCampaign}>{editingCampId?"Save Changes":"Create"}</Btn></div>
        </>}
      </Modal>

      {/* CAMPAIGN DETAIL */}
      <Modal open={modal==="campDetail"&&selCamp} onClose={()=>{setModal(null);setSelCamp(null)}} title={`🎯 ${selCamp?.name||"Campaign"}`} w={680}>
        {selCamp&&(()=>{
          const cd = campDeals(selCamp.id);
          const comm = campCommitted(selCamp.id);
          const pd = campPaid(selCamp.id);
          const pct = selCamp.budget>0?Math.round(comm/selCamp.budget*100):0;
          const lk = campLocked(selCamp.id);
          // Status breakdown
          const byStatus = {};
          cd.forEach(d=>{const s=STATUS_CFG[d.status]?.l||d.status;byStatus[s]=(byStatus[s]||0)+1;});
          // Group by meaningful categories
          const pending = cd.filter(d=>["pending","renegotiate","manager_approved"].includes(d.status));
          const locked = cd.filter(d=>["approved","email_sent","acknowledged"].includes(d.status));
          const shipped = cd.filter(d=>["shipped","delivered_prod"].includes(d.status));
          const live = cd.filter(d=>["partial_live","live"].includes(d.status));
          const payment = cd.filter(d=>["invoice_ok","invoice_pending_approval","payment_requested","payment_approved","partial_paid","paid","disputed"].includes(d.status));
          const dropped = cd.filter(d=>["dropped","drop_requested","rejected"].includes(d.status));

          return <>
            {(role==="admin"||role==="approver"||role==="finance")&&<div style={{display:"flex",justifyContent:"flex-end",gap:"6px",marginBottom:"12px"}}>
              <Btn v="outline" sm onClick={()=>openEditCampaign(selCamp)}>✎ Edit Campaign</Btn>
              {role==="admin"&&<Btn v="danger" sm onClick={()=>{const c=selCamp;setModal(null);setSelCamp(null);deleteCampaignAdmin(c);}}>🗑 Delete</Btn>}
            </div>}
            {/* Budget overview */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:"8px",marginBottom:"14px"}}>
              <div style={{background:T.surfaceAlt,borderRadius:"2px",padding:"10px",textAlign:"center"}}><div style={{fontSize:"10px",color:T.sub,fontWeight:700}}>BUDGET</div><div style={{fontSize:"16px",fontWeight:800}}>{f(selCamp.budget)}</div></div>
              <div style={{background:T.surfaceAlt,borderRadius:"2px",padding:"10px",textAlign:"center"}}><div style={{fontSize:"10px",color:T.sub,fontWeight:700}}>COMMITTED</div><div style={{fontSize:"16px",fontWeight:800,color:T.gold}}>{f(comm)}</div></div>
              <div style={{background:T.surfaceAlt,borderRadius:"2px",padding:"10px",textAlign:"center"}}><div style={{fontSize:"10px",color:T.sub,fontWeight:700}}>PAID OUT</div><div style={{fontSize:"16px",fontWeight:800,color:T.ok}}>{f(pd)}</div></div>
              <div style={{background:T.surfaceAlt,borderRadius:"2px",padding:"10px",textAlign:"center"}}><div style={{fontSize:"10px",color:T.sub,fontWeight:700}}>REMAINING</div><div style={{fontSize:"16px",fontWeight:800,color:pct>90?T.err:T.brand}}>{f(Math.max(0,selCamp.budget-comm))}</div></div>
            </div>
            <div style={{marginBottom:"14px"}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:"11px",color:T.sub,marginBottom:"3px"}}><span>{lk}/{selCamp.target} influencers locked</span><span style={{color:pct>90?T.err:T.sub}}>{pct}% budget used</span></div>
              <div style={{height:"6px",borderRadius:"2px",background:T.border,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:pct>90?T.err:pct>70?T.warn:T.ok,borderRadius:"2px",transition:"width .3s"}}/></div>
            </div>
            {selCamp.brief&&<div style={{padding:"10px 12px",background:T.surfaceAlt,borderRadius:"2px",marginBottom:"14px",fontSize:"12px",color:T.sub,lineHeight:1.6}}><b style={{color:T.text}}>Brief:</b> {selCamp.brief}</div>}
            {selCamp.deadline&&<div style={{fontSize:"12px",color:T.sub,marginBottom:"14px"}}>Deadline: <b>{selCamp.deadline}</b></div>}

            {/* Status breakdown pills */}
            <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"14px"}}>
              {pending.length>0&&<span style={{padding:"3px 10px",borderRadius:"2px",fontSize:"11px",fontWeight:700,background:T.warnBg,color:T.warn}}>⏳ {pending.length} Pending</span>}
              {locked.length>0&&<span style={{padding:"3px 10px",borderRadius:"2px",fontSize:"11px",fontWeight:700,background:T.infoBg,color:T.info}}>🔒 {locked.length} Locked</span>}
              {shipped.length>0&&<span style={{padding:"3px 10px",borderRadius:"2px",fontSize:"11px",fontWeight:700,background:T.purpleBg,color:T.purple}}>📦 {shipped.length} Shipped/Delivered</span>}
              {live.length>0&&<span style={{padding:"3px 10px",borderRadius:"2px",fontSize:"11px",fontWeight:700,background:T.okBg,color:T.ok}}>🔴 {live.length} Live</span>}
              {payment.length>0&&<span style={{padding:"3px 10px",borderRadius:"2px",fontSize:"11px",fontWeight:700,background:T.goldSoft,color:T.brand}}>💰 {payment.length} Payment</span>}
              {dropped.length>0&&<span style={{padding:"3px 10px",borderRadius:"2px",fontSize:"11px",fontWeight:700,background:T.errBg,color:T.err}}>🚫 {dropped.length} Dropped</span>}
              {cd.length===0&&<span style={{fontSize:"12px",color:T.sub}}>No deals in this campaign yet</span>}
            </div>

            {/* Creator list */}
            {cd.length>0&&<div style={{border:`1px solid ${T.border}`,borderRadius:"2px",overflow:"hidden"}}>
              <div style={{display:"grid",gridTemplateColumns:"1.6fr 1fr 0.8fr 0.8fr 1.2fr",padding:"8px 12px",background:T.brand,fontSize:"10px",fontWeight:800,color:"#F6DFC1",textTransform:"uppercase",letterSpacing:".5px"}}>
                <div>Creator</div><div>Platform</div><div>Amount</div><div>Paid</div><div>Status</div>
              </div>
              <div style={{maxHeight:"320px",overflowY:"auto"}}>
                {cd.map(d=>{
                  const sc = STATUS_CFG[d.status]||{l:d.status,c:T.sub,bg:T.surfaceAlt,i:"?"};
                  const paidAmt = totalPaid(d);
                  return <div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{display:"grid",gridTemplateColumns:"1.6fr 1fr 0.8fr 0.8fr 1.2fr",padding:"8px 12px",borderBottom:`1px solid ${T.border}`,fontSize:"12px",cursor:"pointer",transition:"background .1s",alignItems:"center"}} onMouseEnter={e=>e.currentTarget.style.background=T.surfaceAlt} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div><div style={{fontWeight:700}}>{d.inf}</div><div style={{fontSize:"10px",color:T.sub}}>{d.collabId}</div></div>
                    <div style={{color:T.sub}}>{d.platform}</div>
                    <div style={{fontWeight:700}}>{fAmt(d.amount)}</div>
                    <div style={{color:paidAmt>0?T.ok:T.sub,fontWeight:paidAmt>0?700:400}}>{paidAmt>0?f(paidAmt):"—"}</div>
                    <div><span style={{padding:"2px 8px",borderRadius:"2px",fontSize:"10px",fontWeight:700,background:sc.bg,color:sc.c}}>{sc.i} {sc.l}</span></div>
                  </div>;
                })}
              </div>
            </div>}
          </>;
        })()}
      </Modal>

      {/* DISPATCH */}
      <Modal open={modal==="ship"} onClose={()=>setModal(null)} title={`Dispatch to ${sel?.inf}`} w={440}>
        {sel&&<>
          <div style={{padding:"12px",background:T.purpleBg,borderRadius:"2px",marginBottom:"14px",fontSize:"13px",color:T.purple}}>
            <div style={{fontWeight:800,fontSize:"13px",marginBottom:"6px"}}>📦 {sel.products?sel.products.map(p=>p.name).join(", "):sel.product}</div>
            {sel.products && sel.products.length>0 && <div style={{marginTop:"8px",padding:"8px",background:T.surfaceAlt,borderRadius:"2px",fontSize:"11px"}}>
              <div style={{fontWeight:700,marginBottom:"4px"}}>Items to pack & ship:</div>
              {sel.products.map((p,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"6px",marginBottom:"3px"}}>
                <span><b>{p.name}</b></span>
                <span>{p.color&&`Color: ${p.color}`} {p.cut&&`Cut: ${p.cut}`} {p.size&&`Size: ${p.size}`}</span>
                <span>{p.qty&&`Qty: ${p.qty}`}</span>
              </div>)}
            </div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr",gap:"4px",marginTop:"8px"}}>
              <div><span style={{fontWeight:700}}>📍 Ship to:</span> {sel.address||"Address not provided"}</div>
              <div><span style={{fontWeight:700}}>📱 Phone:</span> {sel.phone||"Not provided"}</div>
              <div><span style={{fontWeight:700}}>👤 Influencer:</span> {sel.inf} · {sel.platform}</div>
              {pocNameFor(sel.inf)&&<div><span style={{fontWeight:700}}>🧑‍💼 POC:</span> {pocNameFor(sel.inf)} <span style={{color:T.sub}}>— contact for any issues</span></div>}
            </div>
          </div>
          <Field label="Carrier"><Sel value={shipF.carrier} onChange={e=>setShipF({...shipF,carrier:e.target.value})} options={[{v:"DTDC",l:"DTDC"},{v:"Delhivery",l:"Delhivery"},{v:"Shiprocket",l:"Shiprocket"},{v:"BlueDart",l:"BlueDart"},{v:"India Post",l:"India Post"}]}/></Field>
          <Field label="Order ID"><Inp value={shipF.orderId} onChange={e=>setShipF({...shipF,orderId:e.target.value})} placeholder="e.g. ORD-12345"/></Field>
          <Field label="Tracking ID *"><Inp value={shipF.track} onChange={e=>setShipF({...shipF,track:e.target.value})} placeholder="DTDC-12345678"/></Field>
          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"10px"}}><Btn v="outline" onClick={()=>setModal(null)}>Cancel</Btn><Btn v="purple" onClick={dispatch}>📦 Dispatch</Btn></div>
        </>}
      </Modal>

      {/* PAYMENT */}
      <Modal open={modal==="payment"} onClose={()=>setModal("detail")} title={`Payment — ${sel?.inf}`} w={460}>
        {sel&&<>
          {/* Invoice Details — Prominent for Finance */}
          {sel.inv&&<div style={{padding:"10px 12px",background:sel.inv.match===false?T.errBg:T.okBg,border:`1px solid ${sel.inv.match===false?T.err:T.ok}33`,borderRadius:"2px",marginBottom:"10px",fontSize:"12px"}}>
            <div style={{fontSize:"10px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:".5px",marginBottom:"4px",fontFamily:"Bodoni Moda,serif"}}>🧾 Invoice Details</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px 10px"}}>
              <div><span style={{color:T.sub}}>Invoice #:</span> <b>{sel.invoiceNumber||"—"}</b></div>
              <div><span style={{color:T.sub}}>Date:</span> <b>{sel.invoiceDate||"—"}</b></div>
              <div><span style={{color:T.sub}}>Invoice Amt:</span> <b style={{color:sel.inv.match===false?T.err:T.ok}}>{f(sel.inv.amount)}{sel.inv.match===false?" ⚠":" ✓"}</b></div>
              <div><span style={{color:T.sub}}>Locked Amt:</span> <b>{fAmt(sel.amount)}</b></div>
            </div>
            {(sel.inv.link||sel.inv.note)&&<div style={{marginTop:"4px"}}><span style={{color:T.sub}}>Link:</span> <a href={ensureUrl(sel.inv.link||sel.inv.note)} target="_blank" rel="noopener noreferrer" style={{color:T.info,fontWeight:700,wordBreak:"break-all"}}>🔗 {sel.inv.link||sel.inv.note}</a></div>}
          </div>}

          {/* Deal Context */}
          <div style={{padding:"10px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",marginBottom:"12px",fontSize:"13px"}}>
            <div style={{fontWeight:700,marginBottom:"6px",fontSize:"12px"}}>📋 Deal Terms</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px"}}>
              <div><span style={{color:T.sub}}>Product:</span> <b>{sel.products?sel.products.map(p=>p.name).join(", "):sel.product}</b></div>
              <div><span style={{color:T.sub}}>Usage:</span> <b>{sel.usage}</b></div>
              <div><span style={{color:T.sub}}>Deadline:</span> <b>{sel.deadline}</b></div>
              <div><span style={{color:T.sub}}>Payment Terms:</span> <b>{ptLabel(sel.paymentTerms||"next_15th")}</b></div>
            </div>
            {(sel.pan||sel.pan_number)&&<div style={{marginTop:"4px",padding:"4px 6px",background:T.infoBg,borderRadius:"2px"}}><span style={{color:T.info,fontWeight:600}}>PAN:</span> {sel.pan?.number||sel.pan_number} ({sel.pan?.name||sel.pan_name})</div>}
            <div style={{marginTop:"6px",fontWeight:700,fontSize:"11px",color:T.sub}}>Deliverables:</div>
            {sel.dels.map((dl,i)=><div key={i} style={{fontSize:"11px",padding:"2px 0"}}>{dl.type}: {dl.desc} — <span style={{color:dl.st==="live"?T.ok:T.warn,fontWeight:600}}>{dl.st==="live"?"Live":"Pending"}</span></div>)}
          </div>

          <div style={{padding:"10px",background:T.goldSoft,borderRadius:"2px",marginBottom:"12px",fontSize:"13px"}}>
            <div style={{display:"flex",justifyContent:"space-between"}}><span>Locked:</span><b>{fAmt(sel.amount)}</b></div>
            <div style={{display:"flex",justifyContent:"space-between"}}><span>Paid:</span><b style={{color:T.ok}}>{f(totalPaid(sel))}</b></div>
            <div style={{display:"flex",justifyContent:"space-between",borderTop:`1px solid ${T.border}`,marginTop:"4px",paddingTop:"4px"}}><b>Remaining:</b><b style={{color:remaining(sel)>0?T.err:T.ok}}>{f(remaining(sel))}</b></div>
          </div>
          <Field label="Type"><Sel value={payF.type} onChange={e=>setPayF({...payF,type:e.target.value})} options={[{v:"advance",l:"Advance"},{v:"partial",l:"Part Payment"},{v:"final",l:"Final Settlement"}]}/></Field>
          <Field label="Amount *"><Inp value={payF.amount} onChange={e=>setPayF({...payF,amount:e.target.value})} type="number" prefix="₹" placeholder={String(remaining(sel))}/></Field>
          <Field label="Note"><Inp value={payF.note} onChange={e=>setPayF({...payF,note:e.target.value})} placeholder="Advance on lock / Post content live"/></Field>
          {+payF.amount>remaining(sel)&&remaining(sel)>0&&<div style={{padding:"5px 8px",background:T.errBg,borderRadius:"2px",fontSize:"11px",color:T.err,marginBottom:"6px"}}>⚠ Exceeds remaining balance!</div>}
          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"8px"}}><Btn v="outline" onClick={()=>setModal("detail")}>Back</Btn><Btn v="ok" onClick={recordPayment} disabled={!payF.amount}>Record Payment</Btn></div>
        </>}
      </Modal>

      {/* INVOICE */}
      <Modal open={modal==="invoice"} onClose={()=>setModal("detail")} title={`Submit Invoice — ${sel?.inf}`} w={420}>
        {sel&&<>
          <div style={{padding:"10px",background:T.goldSoft,borderRadius:"2px",marginBottom:"12px",fontSize:"12px"}}>
            <div>🔒 <b>Approved amount:</b> <span style={{fontSize:"20px",fontWeight:800,color:T.gold}}>{fAmt(sel.amount)}</span></div>
            <div style={{fontSize:"11px",color:T.sub,marginTop:"4px"}}>Enter the exact amount shown on the influencer's invoice. The system will compare it to the locked amount.</div>
          </div>
          <Field label="Invoice Amount *"><Inp value={invF} onChange={e=>setInvF(e.target.value)} type="number" prefix="₹" placeholder={String(sel.amount)}/></Field>
          {invF&&+invF!==sel.amount&&<div style={{padding:"6px 8px",background:T.errBg,borderRadius:"2px",fontSize:"11px",color:T.err,marginTop:"4px"}}>⚠ MISMATCH: Invoice {f(invF)} ≠ Approved {fAmt(sel.amount)}. This will be flagged as a dispute.</div>}
          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"10px"}}><Btn v="outline" onClick={()=>{setModal("detail");setInvF("")}}>Back</Btn><Btn v="gold" onClick={()=>submitInvoice(sel)} disabled={!invF}>Submit Invoice</Btn></div>
        </>}
      </Modal>

      {/* NEW USER */}
      <Modal open={modal==="newUser"} onClose={()=>setModal(null)} title="Add Team Member" w={440} noBackdropClose>
        <Field label="Full Name *"><Inp value={userF.name} onChange={e=>setUserF({...userF,name:e.target.value})} placeholder="Priya Mehta"/></Field>
        <Field label="Email *"><Inp value={userF.email} onChange={e=>setUserF({...userF,email:e.target.value})} placeholder="priya@invogue.shop" type="email"/></Field>
        <Field label="Role *">
          <Sel value={userF.role} onChange={e=>setUserF({...userF,role:e.target.value})} options={[
            {v:"negotiator",l:"👤 Negotiator — Creates deals, marks deliverables, submits invoices"},
            {v:"approver",l:"✅ Manager — Approves deals, creates campaigns, views all"},
            {v:"finance",l:"💰 Finance — Processes payments, resolves disputes"},
            {v:"logistics",l:"📦 Logistics — Dispatches shipments, no financial access"},
            {v:"performance_marketer",l:"📈 Performance Marketer — Manages creatives for paid ads"},
            {v:"viewer",l:"👁 Viewer — Read-only access to dashboards"},
          ]}/>
        </Field>
        <div style={{marginTop:"8px",padding:"8px 10px",background:T.infoBg,borderRadius:"2px",fontSize:"11px",color:T.info}}>
          {userF.role==="negotiator"&&"Negotiators can create deals with deliverables, send confirmation emails, mark content as live, and submit invoices. They cannot approve deals or process payments."}
          {userF.role==="approver"&&"Managers can approve/reject deals, create campaigns with budgets, record advance payments, and see the full bird's-eye view of all operations."}
          {userF.role==="finance"&&"Finance can process all payment types (advance, partial, final), resolve invoice disputes, view complete audit trails, and override amounts with logged reasons."}
          {userF.role==="logistics"&&"Logistics can dispatch shipments and mark deliveries. They have ZERO visibility into financial data — they only see product names and shipping info."}
          {userF.role==="performance_marketer"&&"Performance Marketers see live/completed creatives and manage them through Fresh → Running → Tested stages. They can add ad platform links, notes, and request usage extensions. No deal creation or financial access."}
          {userF.role==="viewer"&&"Viewers get read-only access to dashboards and reports. They cannot create, edit, or approve anything."}
        </div>
        <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"14px",paddingTop:"12px",borderTop:`1px solid ${T.border}`}}>
          <Btn v="outline" onClick={()=>setModal(null)}>Cancel</Btn>
          <Btn v="gold" onClick={()=>{
            if(!userF.name||!userF.email) { notify("Name and email required","err"); return; }
            if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userF.email)) { notify("Invalid email format","err"); return; }
            if(!ALLOWED_DOMAINS_RE.test(userF.email.trim())) { notify("Email must be "+ALLOWED_DOMAINS_LABEL,"err"); return; }
            if(users.some(u=>u.email.toLowerCase()===userF.email.toLowerCase().trim())) { notify("Email already exists","err"); return; }
            const initials = userF.name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
            const newId = uid();
            supabase.from('users').insert({id:newId,name:userF.name,email:userF.email,role:userF.role,status:'active',avatar:initials}).then(({error})=>{if(error){console.error("User insert failed:",error);notify("Failed to create user: "+error.message,"err");}});
            setUsers(prev=>[...prev,{id:newId,name:userF.name,email:userF.email,role:userF.role,status:"active",created:new Date().toISOString().slice(0,10),avatar:initials}]);
            setUserF({name:"",email:"",role:"negotiator"});
            setModal(null);
            notify(`${userF.name} added!`);
          }}>Add Team Member</Btn>
        </div>
      </Modal>

      {/* RENEGOTIATE */}
      <Modal open={modal==="renegotiate"&&!!renegF} onClose={()=>{setModal(null);setRenegF(null)}} title={`Renegotiate — ${sel?.inf}`} w={540}>
        {renegF&&sel&&<>
          <div style={{padding:"10px 12px",background:T.warnBg,borderRadius:"2px",marginBottom:"14px",fontSize:"13px",color:T.warn}}>
            <b>Current terms:</b> {fAmt(sel.amount)} · {sel.dels.length} deliverables · by {sel.by}
          </div>

          <Field label="Revised Commercial Amount *">
            <Inp value={renegF.amount} onChange={e=>setRenegF({...renegF,amount:e.target.value})} type="number" prefix="₹"/>
          </Field>
          {+renegF.amount!==sel.amount&&<div style={{fontSize:"11px",color:T.info,marginBottom:"8px",marginTop:"-2px"}}>Changed from {fAmt(sel.amount)} → {f(renegF.amount)} ({+renegF.amount>sel.amount?"↑ increase":"↓ decrease"})</div>}

          <Field label="Campaign">
            <Sel value={renegF.cid} onChange={e=>setRenegF({...renegF,cid:e.target.value})} options={campaigns.map(c=>({v:c.id,l:c.name}))}/>
          </Field>

          <div style={{marginBottom:"14px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}>
              <span style={{fontSize:"11px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:".5px"}}>Products</span>
              <Btn v="outline" sm onClick={()=>setRenegF({...renegF,products:[...(renegF.products||[]),{name:"",color:"",size:"",qty:"1"}]})}>+ Add Product</Btn>
            </div>
            {(renegF.products||[]).map((p,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"1fr 24px",gap:"6px",marginBottom:"4px",alignItems:"center"}}>
              <Inp value={p.name} onChange={e=>{const ps=[...renegF.products];ps[i]={...ps[i],name:e.target.value};setRenegF({...renegF,products:ps})}} placeholder="Product name"/>
              <button onClick={()=>setRenegF({...renegF,products:renegF.products.filter((_,j)=>j!==i)})} style={{background:"none",border:"none",color:T.err,cursor:"pointer",fontSize:"14px",padding:0}}>✕</button>
            </div>)}
            {(renegF.products||[]).length===0&&<div style={{fontSize:"11px",color:T.sub}}>No products set.</div>}
          </div>

          <div style={{marginBottom:"14px"}}>
            <div style={{fontSize:"11px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:".5px",marginBottom:"6px"}}>Select Deliverables to Keep</div>
            {renegF.dels.map((dl,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:"8px",padding:"7px 10px",background:dl.keep?T.surface:T.surfaceAlt,border:`1px solid ${dl.keep?T.border:T.border}`,borderRadius:"2px",marginBottom:"4px",opacity:dl.keep?1:.5}}>
                <input type="checkbox" checked={dl.keep} onChange={()=>{
                  const ds=[...renegF.dels]; ds[i]={...ds[i],keep:!ds[i].keep}; setRenegF({...renegF,dels:ds});
                }} style={{accentColor:T.gold,width:"16px",height:"16px"}}/>
                <div style={{flex:1}}>
                  <span style={{fontSize:"13px",fontWeight:700}}>{dl.type}</span>
                  <span style={{fontSize:"12px",color:T.sub,marginLeft:"5px"}}>{dl.desc}</span>
                </div>
                {!dl.keep&&<span style={{fontSize:"10px",color:T.err,fontWeight:700}}>REMOVED</span>}
              </div>
            ))}
            <div style={{fontSize:"11px",color:T.sub,marginTop:"4px"}}>{renegF.dels.filter(d=>d.keep).length} of {renegF.dels.length} deliverables kept</div>
          </div>

          <div style={{marginTop:"8px",borderTop:`1px dashed ${T.border}`,paddingTop:"8px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}>
              <span style={{fontSize:"11px",fontWeight:700,color:T.info}}>Add New Deliverables</span>
              <Btn v="outline" sm onClick={()=>setRenegF({...renegF,dels:[...renegF.dels,{id:uid(),type:"Reel",desc:"",st:"pending",link:"",keep:true,isNew:true}]})}>+ Add New</Btn>
            </div>
            {renegF.dels.filter(d=>d.isNew).map((dl,idx)=>{
              const i = renegF.dels.indexOf(dl);
              return <div key={i} style={{display:"grid",gridTemplateColumns:"110px 1fr 24px",gap:"6px",marginBottom:"4px",alignItems:"center"}}>
                <Sel value={dl.type} onChange={e=>{const ds=[...renegF.dels];ds[i]={...ds[i],type:e.target.value};setRenegF({...renegF,dels:ds})}} options={[{v:"Reel",l:"Reel"},{v:"Story",l:"Story"},{v:"Dedicated Video",l:"Video"},{v:"Shorts",l:"Shorts"},{v:"Static Post",l:"Static"},{v:"Carousel",l:"Carousel"},{v:"Community Post",l:"Post"}]}/>
                <Inp value={dl.desc} onChange={e=>{const ds=[...renegF.dels];ds[i]={...ds[i],desc:e.target.value};setRenegF({...renegF,dels:ds})}} placeholder="Description of new deliverable"/>
                <button onClick={()=>setRenegF({...renegF,dels:renegF.dels.filter((_,j)=>j!==i)})} style={{background:"none",border:"none",color:T.err,cursor:"pointer",fontSize:"13px",padding:0}}>✕</button>
              </div>;
            })}
          </div>

          <Field label="Renegotiation Note *" style={{marginTop:"12px"}}>
            <Inp value={renegF.note} onChange={e=>setRenegF({...renegF,note:e.target.value})} placeholder="e.g., Amount too high for follower count. Reduce to ₹12,000 with 2 reels only."/>
          </Field>

          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"14px",paddingTop:"12px",borderTop:`1px solid ${T.border}`}}>
            <Btn v="outline" onClick={()=>{setModal("detail");setRenegF(null)}}>Cancel</Btn>
            <Btn v="gold" onClick={submitReneg}>↩ Send Back with Revised Terms</Btn>
          </div>
        </>}
      </Modal>

      {/* ═══════════════ NEGOTIATOR RESUBMIT AFTER RENEGOTIATION ═══════════════ */}
      <Modal open={modal==="resubmitReneg"&&!!resubmitF} onClose={()=>{setModal(null);setResubmitF(null)}} title={`Review & Resubmit — ${sel?.inf}`} w={560}>
        {resubmitF&&sel&&<>
          {sel.renegotiationNote&&<div style={{padding:"12px 14px",background:T.warnBg,border:`1px solid ${T.warn}33`,borderLeft:`3px solid ${T.warn}`,borderRadius:"2px",marginBottom:"14px"}}>
            <div style={{fontSize:"10px",fontWeight:800,color:T.warn,textTransform:"uppercase",letterSpacing:".5px",marginBottom:"4px"}}>📝 Manager's Note</div>
            <div style={{fontSize:"13px",color:T.text,lineHeight:1.5}}>{sel.renegotiationNote}</div>
          </div>}

          <div style={{padding:"10px 12px",background:T.infoBg,borderRadius:"2px",marginBottom:"14px",fontSize:"12px",color:T.info,lineHeight:1.5}}>
            💡 Adjust the terms (if needed) based on the manager's feedback and add a response. Resubmitting sends this deal back to the manager for re-approval.
          </div>

          <Field label="Revised Commercial Amount *">
            <Inp value={resubmitF.amount} onChange={e=>setResubmitF({...resubmitF,amount:e.target.value})} type="number" prefix="₹"/>
            <div style={{fontSize:"11px",color:T.sub,marginTop:"4px"}}>Enter <b>0</b> for a barter / product-only collab.</div>
          </Field>
          {+resubmitF.amount!==sel.amount&&<div style={{fontSize:"11px",color:T.info,marginBottom:"8px",marginTop:"-2px"}}>Changed from {fAmt(sel.amount)} → {fAmt(resubmitF.amount)} ({+resubmitF.amount>sel.amount?"↑ increase":"↓ decrease"})</div>}

          <div style={{marginBottom:"14px"}}>
            <div style={{fontSize:"11px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:".5px",marginBottom:"6px"}}>Deliverables</div>
            {resubmitF.dels.map((dl,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:"8px",padding:"7px 10px",background:dl.keep?T.surface:T.surfaceAlt,border:`1px solid ${T.border}`,borderRadius:"2px",marginBottom:"4px",opacity:dl.keep?1:.5}}>
                <input type="checkbox" checked={dl.keep} onChange={()=>{
                  const ds=[...resubmitF.dels]; ds[i]={...ds[i],keep:!ds[i].keep}; setResubmitF({...resubmitF,dels:ds});
                }} style={{accentColor:T.gold,width:"16px",height:"16px"}}/>
                <div style={{flex:1}}>
                  <span style={{fontSize:"13px",fontWeight:700}}>{dl.type}</span>
                  <span style={{fontSize:"12px",color:T.sub,marginLeft:"5px"}}>{dl.desc}</span>
                </div>
                {!dl.keep&&<span style={{fontSize:"10px",color:T.err,fontWeight:700}}>REMOVED</span>}
              </div>
            ))}
            <div style={{fontSize:"11px",color:T.sub,marginTop:"4px"}}>{resubmitF.dels.filter(d=>d.keep).length} of {resubmitF.dels.length} deliverables kept</div>
          </div>

          <div style={{marginTop:"8px",borderTop:`1px dashed ${T.border}`,paddingTop:"8px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}>
              <span style={{fontSize:"11px",fontWeight:700,color:T.info}}>Add New Deliverables</span>
              <Btn v="outline" sm onClick={()=>setResubmitF({...resubmitF,dels:[...resubmitF.dels,{id:uid(),type:"Reel",desc:"",st:"pending",link:"",keep:true,isNew:true}]})}>+ Add New</Btn>
            </div>
            {resubmitF.dels.filter(d=>d.isNew).map((dl,idx)=>{
              const i = resubmitF.dels.indexOf(dl);
              return <div key={i} style={{display:"grid",gridTemplateColumns:"110px 1fr 24px",gap:"6px",marginBottom:"4px",alignItems:"center"}}>
                <Sel value={dl.type} onChange={e=>{const ds=[...resubmitF.dels];ds[i]={...ds[i],type:e.target.value};setResubmitF({...resubmitF,dels:ds})}} options={[{v:"Reel",l:"Reel"},{v:"Story",l:"Story"},{v:"Dedicated Video",l:"Video"},{v:"Shorts",l:"Shorts"},{v:"Static Post",l:"Static"},{v:"Carousel",l:"Carousel"},{v:"Community Post",l:"Post"}]}/>
                <Inp value={dl.desc} onChange={e=>{const ds=[...resubmitF.dels];ds[i]={...ds[i],desc:e.target.value};setResubmitF({...resubmitF,dels:ds})}} placeholder="Description of new deliverable"/>
                <button onClick={()=>setResubmitF({...resubmitF,dels:resubmitF.dels.filter((_,j)=>j!==i)})} style={{background:"none",border:"none",color:T.err,cursor:"pointer",fontSize:"13px",padding:0}}>✕</button>
              </div>;
            })}
          </div>

          <Field label="Response to Manager *" style={{marginTop:"12px"}}>
            <Textarea value={resubmitF.response} onChange={e=>setResubmitF({...resubmitF,response:e.target.value})} placeholder="e.g., Spoke to influencer, she agreed to ₹12,000 with 2 reels. Ready for re-approval." rows={3}/>
          </Field>

          <div style={{display:"flex",gap:"7px",justifyContent:"space-between",alignItems:"center",marginTop:"14px",paddingTop:"12px",borderTop:`1px solid ${T.border}`}}>
            <Btn v="danger" sm onClick={()=>{setModal(null);setResubmitF(null);openDropModal(sel)}}>🚫 Drop Collab Instead</Btn>
            <div style={{display:"flex",gap:"7px"}}>
              <Btn v="outline" onClick={()=>{setModal("detail");setResubmitF(null)}}>Cancel</Btn>
              <Btn v="gold" onClick={submitResubmit}>↩ Resubmit to Manager</Btn>
            </div>
          </div>
        </>}
      </Modal>

      {/* ═══════════════ DEAL DETAIL ═══════════════ */}
      <Modal open={modal==="detail"&&!!sel} onClose={()=>{setModal(null);setSel(null)}} title={sel?.inf||""} w={680} bare>
        {sel&&(()=>{
          const camp=getCamp(sel.cid), paid=totalPaid(sel), rem=remaining(sel), done=sel.dels.filter(x=>x.st==="live").length;
          const infRec=influencers.find(x=>x.name===sel.inf);
          const subline=[sel.platform, infRec?.handle, sel.followers, infRec?.city].filter(Boolean).join(" · ");
          const lastLog=(sel.logs||[])[(sel.logs||[]).length-1];
          const locked=["approved","email_sent","acknowledged","shipped","delivered_prod","partial_live","live","invoice_ok","disputed","partial_paid","paid"].includes(sel.status);
          const steps=[{label:"Content Live",done:isPaymentEligible(sel)},{label:sel.agencyManaged?"Agency Inv.":"Form Sent",done:sel.agencyManaged?!!sel.agencyInvoiceUrl:!!sel.paymentFormSent},{label:"Details In",done:!!sel.paymentDetailsAt},{label:"Paid",done:sel.status==="paid"}];
          const commercials=[["Campaign",camp?.name||"—"],["Usage Rights",sel.usage||"—"],["Payment Terms",ptLabel(sel.paymentTerms||"next_15th")],["Deadline",sel.deadline||"—"],["Product",sel.products?sel.products.map(p=>p.name).join(", "):sel.product||"—"],["Platform",`${sel.platform||"—"}${sel.followers?` · ${sel.followers}`:""}`],["Phone",sel.phone||"—"],["Email",sel.email||"Not provided"]];
          const TABS=[{k:"overview",l:"Overview"},{k:"deliverables",l:"Deliverables"},{k:"shipment",l:"Shipment"},{k:"payment",l:"Payment"},{k:"activity",l:"Activity"}];
          return <>
            {/* Drawer header */}
            <div style={{padding:"24px 28px 0",background:"#FBFAF7",borderBottom:`1px solid ${T.borderHead}`,flexShrink:0}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"6px"}}>
                <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
                  <span style={{fontSize:"10px",letterSpacing:"2.5px",textTransform:"uppercase",color:T.gold,fontWeight:600}}>Collab · {sel.collabId||"—"}</span>
                  {infRec&&<span onClick={()=>{setModal(null);setSel(null);setInfProfile(infRec)}} style={{fontSize:"10px",letterSpacing:"1px",textTransform:"uppercase",color:T.sub,cursor:"pointer",fontWeight:700}}>★ Profile</span>}
                </div>
                <button onClick={()=>{setModal(null);setSel(null)}} style={{background:"transparent",border:"none",fontSize:"18px",cursor:"pointer",color:T.faint,lineHeight:1}}>×</button>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:"16px",gap:"12px"}}>
                <div>
                  <div style={{fontFamily:T.display,fontSize:"28px",fontWeight:500,letterSpacing:"-0.5px",lineHeight:1.1}}>{sel.inf}</div>
                  <div style={{fontSize:"11px",color:T.sub,marginTop:"5px"}}>{subline}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontFamily:T.display,fontSize:"24px",fontWeight:600,color:Number(sel.amount)===0?T.gold:undefined}}>{fAmt(sel.amount)}</div>
                  <div style={{fontSize:"9px",letterSpacing:"1px",textTransform:"uppercase",color:T.sub,marginTop:"2px"}}>{Number(sel.amount)===0?"Product-only collab":(locked?"Amount Locked":"Proposed")}{paid>0?` · ${f(paid)} paid`:""}</div>
                </div>
              </div>
              <div style={{display:"flex",gap:"22px",flexWrap:"wrap"}}>
                {TABS.map(t=><span key={t.k} onClick={()=>setDealTab(t.k)} style={{fontSize:"11px",letterSpacing:"1px",textTransform:"uppercase",fontWeight:dealTab===t.k?700:400,color:dealTab===t.k?T.brand:T.sub,borderBottom:dealTab===t.k?`2px solid ${T.brand}`:"2px solid transparent",paddingBottom:"12px",cursor:"pointer"}}>{t.l}</span>)}
              </div>
            </div>

            {/* Scrollable content */}
            <div style={{padding:"24px 28px",overflowY:"auto",flex:1,minHeight:0}}>

            {dealTab==="overview"&&<>
              {(()=>{
                const canEditNote = role==="admin"||role==="approver";
                if(mgrNoteEdit===sel.id) return <div style={{border:`1px solid ${T.gold}`,background:T.goldSoft,borderRadius:"2px",padding:"14px 16px",marginBottom:"22px"}}>
                  <div style={{fontSize:"10px",letterSpacing:"1.5px",textTransform:"uppercase",fontWeight:700,color:T.brand,marginBottom:"8px"}}>📌 Management Note</div>
                  <textarea value={mgrNoteF} onChange={e=>setMgrNoteF(e.target.value)} rows={3} placeholder="What does management want on this collab? (e.g., push for one extra reel, cap at ₹15k, prioritise go-live before 30 Jun)" style={{width:"100%",padding:"8px 10px",border:`1px solid ${T.inputBorder}`,borderRadius:"2px",fontSize:"13px",fontFamily:T.ui,resize:"vertical",boxSizing:"border-box"}}/>
                  <div style={{display:"flex",gap:"6px",marginTop:"8px"}}><Btn v="gold" sm onClick={()=>saveManagerNote(sel,mgrNoteF)}>Save Note</Btn><Btn v="ghost" sm onClick={()=>setMgrNoteEdit(null)}>Cancel</Btn></div>
                </div>;
                if(sel.managerNote) return <div style={{borderLeft:`3px solid ${T.brand}`,background:T.goldSoft,borderRadius:"2px",padding:"14px 16px",marginBottom:"22px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"10px"}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:"10px",letterSpacing:"1.5px",textTransform:"uppercase",fontWeight:700,color:T.brand,marginBottom:"6px"}}>📌 Management Note</div>
                      <div style={{fontSize:"13px",color:T.text,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{sel.managerNote}</div>
                    </div>
                    {canEditNote&&<span onClick={()=>{setMgrNoteF(sel.managerNote||"");setMgrNoteEdit(sel.id)}} style={{fontSize:"10px",letterSpacing:"0.5px",textTransform:"uppercase",fontWeight:700,color:T.brand,cursor:"pointer",flex:"none"}}>Edit</span>}
                  </div>
                </div>;
                if(canEditNote) return <div style={{marginBottom:"20px"}}><Btn v="outline" sm onClick={()=>{setMgrNoteF("");setMgrNoteEdit(sel.id)}}>📌 Add Management Note</Btn></div>;
                return null;
              })()}
              <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"22px",flexWrap:"wrap"}}>
                <Badge s={sel.status}/>
                {lastLog&&<span style={{fontSize:"11px",color:T.sub,fontStyle:"italic",fontFamily:T.display}}>{lastLog.a} · {lastLog.u} · {lastLog.t}</span>}
              </div>
              {sel.status==="renegotiate"&&sel.renegotiationNote&&<div style={{padding:"10px 12px",background:T.warnBg,border:`1px solid ${T.warn}33`,borderLeft:`3px solid ${T.warn}`,borderRadius:"2px",marginBottom:"20px",fontSize:"13px"}}><div style={{fontSize:"10px",fontWeight:800,color:T.warn,textTransform:"uppercase",letterSpacing:".5px",marginBottom:"3px"}}>Manager's Renegotiation Note</div><div style={{color:T.text,lineHeight:1.5}}>{sel.renegotiationNote}</div></div>}
              <div style={{fontSize:"11px",letterSpacing:"2px",textTransform:"uppercase",fontWeight:700,marginBottom:"14px"}}>Commercials</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",borderTop:`1px solid ${T.border}`,marginBottom:"20px"}}>
                {commercials.map(([l,v],i)=>{const left=i%2===0;return <div key={l} style={{padding:left?"14px 20px 14px 0":"14px 0 14px 20px",borderBottom:`1px solid ${T.borderSoft}`,borderRight:left?`1px solid ${T.borderSoft}`:"none"}}><div style={{fontSize:"10px",letterSpacing:"1px",textTransform:"uppercase",color:T.sub,marginBottom:"5px"}}>{l}</div><div style={{fontSize:"13px",fontWeight:600,wordBreak:"break-word"}}>{v}</div></div>;})}
              </div>
              {sel.profile&&<div style={{fontSize:"12px",marginBottom:"12px"}}><span style={{color:T.sub}}>Profile · </span><a href={ensureUrl(sel.profile)} target="_blank" rel="noreferrer" style={{color:T.info,wordBreak:"break-all"}}>{sel.profile}</a></div>}
              {sel.address&&<div style={{padding:"10px 12px",background:T.infoBg,borderRadius:"2px",marginBottom:"20px",fontSize:"13px"}}><span style={{fontWeight:700,color:T.info}}>📍 Address:</span> {sel.address}</div>}
              <div style={{fontSize:"11px",letterSpacing:"2px",textTransform:"uppercase",fontWeight:700,marginBottom:"18px"}}>Payment Workflow</div>
              <div style={{display:"flex",alignItems:"flex-start",marginBottom:"28px"}}>
                {steps.map((s,i)=><div key={i} style={{flex:1,textAlign:"center",position:"relative"}}>
                  <div style={{width:"26px",height:"26px",borderRadius:"50%",margin:"0 auto 8px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px",...(s.done?{background:T.brand,color:"#fff"}:{background:"#fff",border:`1.5px solid ${T.inputBorder}`,color:T.faint})}}>{s.done?"✓":i+1}</div>
                  <div style={{fontSize:"10px",fontWeight:700,color:s.done?T.text:T.sub}}>{s.label}</div>
                  {i<steps.length-1&&<div style={{position:"absolute",top:"13px",left:"62%",right:"-38%",height:"1px",background:T.border}}/>}
                </div>)}
              </div>
              <div style={{fontSize:"11px",letterSpacing:"2px",textTransform:"uppercase",fontWeight:700,marginBottom:"14px"}}>Deliverables</div>
              <div style={{borderTop:`1px solid ${T.border}`}}>
                {sel.dels.map((dl,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 0",borderBottom:i<sel.dels.length-1?`1px solid ${T.borderSoft}`:"none"}}><span style={{fontSize:"13px",fontWeight:600}}>{dl.type}{dl.desc&&<span style={{fontSize:"11px",color:T.sub,fontWeight:400}}> · {dl.desc}</span>}</span><DBadge s={dl.st}/></div>)}
              </div>
            </>}

            {dealTab==="payment"&&<>
              <div style={{background:T.goldSoft,border:`1px dashed ${T.goldMid}`,borderRadius:"2px",padding:"12px",marginBottom:"16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
                  <div><div style={{fontSize:"10px",fontWeight:800,color:T.sub,textTransform:"uppercase"}}>{Number(sel.amount)===0?"Barter (product-only)":(locked?"🔒 Locked Amount":"Proposed Amount")}</div><div style={{fontSize:"22px",fontWeight:900,color:T.gold,fontFamily:T.display}}>{fAmt(sel.amount)}</div></div>
                  <div style={{textAlign:"right"}}><div style={{fontSize:"11px",color:T.ok,fontWeight:700}}>Paid: {f(paid)}</div><div style={{fontSize:"11px",color:rem>0?T.warn:T.ok,fontWeight:700}}>Remaining: {f(rem)}</div></div>
                </div>
                {paid>0&&<div style={{height:"4px",borderRadius:"3px",background:T.border,marginTop:"8px"}}><div style={{height:"100%",width:`${Math.min(paid/sel.amount*100,100)}%`,background:T.ok,borderRadius:"3px"}}/></div>}
                {sel.inv&&!sel.inv.match&&<div style={{marginTop:"8px",padding:"6px 8px",background:T.errBg,borderRadius:"2px",fontSize:"11px",color:T.err}}>⚠ Invoice: {f(sel.inv.amount)} vs Locked: {fAmt(sel.amount)} — Difference: {f(Math.abs(sel.inv.amount-sel.amount))}</div>}
              </div>

            {/* Payments */}
            {sel.pays.length>0&&<Section title="Payment History" icon="💰">
              {sel.pays.map((p,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 9px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",marginBottom:"3px",fontSize:"13px"}}>
                <div><span style={{fontWeight:700,textTransform:"capitalize"}}>{p.type}</span> <span style={{color:T.sub}}>· {p.note}</span></div>
                <div><b style={{color:T.ok}}>{f(p.amount)}</b> <span style={{color:T.sub,fontSize:"11px"}}>· {p.date}</span></div>
              </div>)}
            </Section>}

            </>}

            {dealTab==="deliverables"&&<>
            {/* Deliverables — Content Approval Workflow */}
            <Section title={`Deliverables (${done}/${sel.dels.length})`} icon="📋">
              {sel.dels.map((dl,i)=>{
                const url = deliverableLinkF[dl.id] || "";
                const productDelivered = (sel.ship && sel.ship.st === "delivered") || sel.productOnHand;
                const canSubmit = (role==="negotiator"||role==="admin") && (dl.st==="pending"||dl.st==="revision_requested") && productDelivered && !["pending","renegotiate","rejected"].includes(sel.status);
                const canReview = (role==="approver"||role==="admin") && dl.st==="submitted";
                const canEditSubmission = (role==="negotiator"||role==="admin") && dl.st==="submitted";
                const canMarkLive = (role==="negotiator"||role==="admin") && dl.st==="approved";
                const delFiles = driveFiles.deliverables?.[dl.id] || [];
                const latestFile = delFiles[0]; // already sorted version desc
                const activeUploads = Object.entries(driveUploading).filter(([k])=>k.startsWith(`${sel.id}:${dl.id}:`));
                return <div key={i} style={{background:T.surface,border:`1px solid ${dl.st==="revision_requested"?T.err+"33":T.border}`,borderRadius:"2px",padding:"12px",marginBottom:"8px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:canSubmit||canReview||canMarkLive||canEditSubmission?"10px":"0"}}>
                    <div style={{flex:1}}>
                      <span style={{fontSize:"14px",fontWeight:700}}>{dl.type}</span>
                      <span style={{fontSize:"13px",color:T.sub,marginLeft:"6px"}}>{dl.desc}</span>
                      {dl.link&&dl.st!=="revision_requested"&&<div style={{fontSize:"12px",color:T.info,marginTop:"3px"}}>🔗 <a href={ensureUrl(dl.link)} target="_blank" rel="noopener noreferrer" style={{color:T.info}}>{dl.link}</a></div>}
                    </div>
                    <DBadge s={dl.st}/>
                  </div>

                  {/* Revision feedback banner */}
                  {dl.st==="revision_requested"&&dl.feedback&&<div style={{background:T.errBg,border:`1px solid ${T.err}22`,borderRadius:"2px",padding:"10px 12px",marginBottom:"10px",fontSize:"13px"}}>
                    <div style={{fontWeight:700,color:T.err,fontSize:"11px",textTransform:"uppercase",letterSpacing:".5px",marginBottom:"4px",fontFamily:"Bodoni Moda,serif"}}>Manager Feedback</div>
                    <div style={{color:T.text,whiteSpace:"pre-wrap"}}>{dl.feedback}</div>
                  </div>}

                  {/* Feedback & revision trail */}
                  {dl.history&&dl.history.length>0&&<div style={{marginBottom:"10px",borderLeft:`2px solid ${T.border}`,paddingLeft:"10px"}}>
                    <div style={{fontSize:"10px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:".5px",marginBottom:"6px",fontFamily:"Bodoni Moda,serif"}}>Activity Trail</div>
                    {dl.history.map((h,hi)=>{
                      const icon = h.action==="submitted"?"📤":h.action==="approved"?"✅":h.action==="revision_requested"?"✏️":"📋";
                      const label = h.action==="submitted"?"Content submitted":h.action==="approved"?"Content approved":h.action==="revision_requested"?"Revision requested":"Action";
                      const color = h.action==="submitted"?T.info:h.action==="approved"?T.ok:h.action==="revision_requested"?T.err:T.sub;
                      return <div key={hi} style={{marginBottom:"6px",fontSize:"12px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                          <span>{icon}</span>
                          <span style={{fontWeight:700,color}}>{label}</span>
                          <span style={{color:T.sub}}>by {h.by}</span>
                          <span style={{color:T.faint,fontSize:"11px"}}>{new Date(h.at).toLocaleDateString("en-IN",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</span>
                        </div>
                        {h.link&&<div style={{fontSize:"11px",color:T.info,marginLeft:"22px",marginTop:"1px"}}>🔗 <a href={ensureUrl(h.link)} target="_blank" rel="noopener noreferrer" style={{color:T.info}}>{h.link}</a></div>}
                        {h.note&&<div style={{fontSize:"12px",color:T.text,marginLeft:"22px",marginTop:"1px",fontStyle:"italic",whiteSpace:"pre-wrap"}}>💬 "{h.note}"</div>}
                        {h.feedback&&<div style={{fontSize:"12px",color:T.err,marginLeft:"22px",marginTop:"1px",fontStyle:"italic",whiteSpace:"pre-wrap"}}>"{h.feedback}"</div>}
                      </div>;
                    })}
                  </div>}

                  {/* Files & Versions — shows all uploaded versions for this deliverable */}
                  {(delFiles.length>0||activeUploads.length>0)&&<div style={{background:T.surfaceAlt,borderRadius:"2px",padding:"10px 12px",marginBottom:"8px"}}>
                    <div style={{fontSize:"11px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:".5px",marginBottom:"6px",fontFamily:"Bodoni Moda,serif"}}>Uploaded Files ({delFiles.length} version{delFiles.length===1?"":"s"})</div>
                    {delFiles.map(ff=><div key={ff.id} style={{display:"flex",alignItems:"center",gap:"8px",padding:"4px 0",fontSize:"12px",borderBottom:`1px dashed ${T.border}`}}>
                      <span style={{background:T.info+"22",color:T.info,fontSize:"10px",fontWeight:800,padding:"2px 6px",borderRadius:"2px"}}>v{ff.version}</span>
                      <span style={{flex:1,fontFamily:"ui-monospace,monospace",color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ff.file_name}</span>
                      <span style={{color:T.faint,fontSize:"10px"}}>{ff.size_bytes?(ff.size_bytes/1048576).toFixed(1)+" MB":""}</span>
                      {ff.web_view_link&&<a href={ff.web_view_link} target="_blank" rel="noopener noreferrer" style={{color:T.info,fontSize:"11px",fontWeight:700,textDecoration:"none"}}>Open ↗</a>}
                    </div>)}
                    {activeUploads.map(([k,u])=><div key={k} style={{padding:"4px 0",fontSize:"12px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"3px"}}><span style={{color:T.sub}}>⏫ {u.name}</span><span style={{color:T.info,fontWeight:700}}>{u.progress}%</span></div>
                      <div style={{height:"4px",background:T.border,borderRadius:"2px",overflow:"hidden"}}><div style={{height:"100%",width:u.progress+"%",background:T.info,transition:"width .2s"}}/></div>
                    </div>)}
                  </div>}

                  {/* Negotiator: Submit content for review */}
                  {canSubmit&&<div style={{background:T.surfaceAlt,borderRadius:"2px",padding:"10px 12px"}}>
                    <div style={{fontSize:"11px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:".5px",marginBottom:"6px",fontFamily:"Bodoni Moda,serif"}}>{dl.st==="revision_requested"?"Resubmit Revised Content":"Submit Content for Review"}</div>
                    <div style={{display:"flex",gap:"6px",alignItems:"center",marginBottom:"6px"}}>
                      <div style={{flex:1}}><Inp value={url} onChange={e=>setDeliverableLinkF({...deliverableLinkF,[dl.id]:e.target.value})} placeholder="Content URL (Instagram, Drive link, etc.) *"/></div>
                      <Btn v="primary" sm onClick={()=>submitContentForReview(sel,i,url||latestFile?.web_view_link||"",deliverableNoteF[dl.id]||"")}>Submit for Review</Btn>
                    </div>
                    <Textarea value={deliverableNoteF[dl.id]||""} onChange={e=>setDeliverableNoteF({...deliverableNoteF,[dl.id]:e.target.value})} placeholder="Add a comment for the manager (optional) — context, what changed, things to note…" rows={2}/>
                    <label style={{display:"inline-block",cursor:"pointer"}}>
                      <input type="file" style={{display:"none"}} accept="image/*,video/*,.mp4,.mov,.jpg,.jpeg,.png,.gif,.webp,.mkv,.webm" onChange={async e=>{
                        const file = e.target.files?.[0]; e.target.value='';
                        if(!file) return;
                        const uploaded = await uploadDriveFile({deal:sel, deliverable:dl, isRaw:false, file});
                        if(uploaded?.web_view_link) setDeliverableLinkF({...deliverableLinkF,[dl.id]:uploaded.web_view_link});
                      }}/>
                      <span style={{fontSize:"11px",color:T.info,fontWeight:700,textDecoration:"underline",cursor:"pointer"}}>⬆ Upload {delFiles.length>0?`v${(delFiles[0]?.version||0)+1}`:"file"} to Drive</span>
                    </label>
                    <span style={{fontSize:"10px",color:T.faint,marginLeft:"10px"}}>Files go to Drive → Campaign → Influencer → {sel.collabId||"Collab"}. Keeps all versions.</span>
                  </div>}

                  {/* Negotiator/admin: edit the submission before the manager gives feedback */}
                  {canEditSubmission&&<div style={{background:T.surfaceAlt,borderRadius:"2px",padding:"10px 12px",marginBottom:canReview?"8px":"0"}}>
                    <div style={{fontSize:"11px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:".5px",marginBottom:"6px",fontFamily:"Bodoni Moda,serif"}}>Edit submission <span style={{color:T.faint,fontWeight:400,textTransform:"none",letterSpacing:0}}>· editable until the manager reviews</span></div>
                    <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
                      <div style={{flex:1}}><Inp value={deliverableLinkF[dl.id]!==undefined?deliverableLinkF[dl.id]:(dl.link||"")} onChange={e=>setDeliverableLinkF({...deliverableLinkF,[dl.id]:e.target.value})} placeholder="Updated content URL"/></div>
                      <Btn v="outline" sm onClick={()=>{const u=deliverableLinkF[dl.id]!==undefined?deliverableLinkF[dl.id]:dl.link; const n=deliverableNoteF[dl.id]!==undefined?deliverableNoteF[dl.id]:(dl.submitNote||""); submitContentForReview(sel,i,u,n);}}>Update</Btn>
                    </div>
                    <Textarea value={deliverableNoteF[dl.id]!==undefined?deliverableNoteF[dl.id]:(dl.submitNote||"")} onChange={e=>setDeliverableNoteF({...deliverableNoteF,[dl.id]:e.target.value})} placeholder="Comment for the manager (optional)" rows={2}/>
                  </div>}

                  {/* Manager: Review & approve or request revision */}
                  {canReview&&<div style={{background:T.purpleBg,borderRadius:"2px",padding:"10px 12px"}}>
                    <div style={{fontSize:"11px",fontWeight:700,color:T.purple,textTransform:"uppercase",letterSpacing:".5px",marginBottom:"6px",fontFamily:"Bodoni Moda,serif"}}>Review Content</div>
                    {dl.submitNote&&<div style={{fontSize:"12px",color:T.text,marginBottom:"8px",padding:"7px 9px",background:T.surface,borderLeft:`3px solid ${T.purple}`,borderRadius:"2px",whiteSpace:"pre-wrap"}}><b style={{color:T.purple}}>💬 Negotiator's note:</b> {dl.submitNote}</div>}
                    {dl.link&&<div style={{fontSize:"12px",color:T.info,marginBottom:"6px"}}>🔗 <a href={ensureUrl(dl.link)} target="_blank" rel="noopener noreferrer" style={{color:T.info}}>{dl.link}</a></div>}
                    {latestFile&&<div style={{fontSize:"12px",marginBottom:"8px",padding:"6px 8px",background:T.surface,borderRadius:"2px"}}>📁 Latest upload: <b>{latestFile.file_name}</b>{latestFile.web_view_link&&<a href={latestFile.web_view_link} target="_blank" rel="noopener noreferrer" style={{color:T.info,marginLeft:"8px",fontWeight:700}}>Download ↗</a>}</div>}
                    <div style={{display:"flex",gap:"6px",marginBottom:"8px"}}>
                      <Btn v="ok" sm onClick={()=>approveContent(sel,i)}>✅ Approve Content</Btn>
                      <Btn v="danger" sm onClick={()=>{const fb=revisionFeedback[dl.id];if(!fb){notify("Enter feedback before requesting revision","err");return;}requestRevision(sel,i,fb)}}>↩ Request Revision</Btn>
                    </div>
                    <Textarea value={revisionFeedback[dl.id]||""} onChange={e=>setRevisionFeedback({...revisionFeedback,[dl.id]:e.target.value})} rows={3} placeholder="Feedback for revision (required if requesting changes)"/>
                  </div>}

                  {/* Negotiator: Mark approved content as live */}
                  {canMarkLive&&<div style={{background:T.okBg,borderRadius:"2px",padding:"10px 12px"}}>
                    <div style={{fontSize:"11px",fontWeight:700,color:T.ok,textTransform:"uppercase",letterSpacing:".5px",marginBottom:"6px",fontFamily:"Bodoni Moda,serif"}}>Content Approved — Ready to Go Live</div>
                    <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
                      <div style={{flex:1}}><Inp value={url} onChange={e=>setDeliverableLinkF({...deliverableLinkF,[dl.id]:e.target.value})} placeholder="Final live URL (if different)"/></div>
                      <Btn v="ok" sm onClick={()=>markDelLive(sel,i,url||dl.link)}>Mark Live</Btn>
                    </div>
                  </div>}

                  {/* Awaiting delivery message */}
                  {(role==="negotiator"||role==="admin")&&dl.st==="pending"&&!productDelivered&&!["pending","renegotiate","rejected"].includes(sel.status)&&
                    <div style={{fontSize:"12px",color:T.sub,fontStyle:"italic",marginTop:"6px"}}>📦 Awaiting product delivery before content can be submitted</div>}
                </div>;
              })}
            </Section>

            {/* RAW Clips — optional raw footage from influencer, organized in Drive RAW/ subfolder */}
            {(role==="negotiator"||role==="admin"||role==="approver")&&sel.ship?.st==="delivered"&&<Section title={`Raw Clips (${driveFiles.raw.length})`} icon="🎞">
              <div style={{fontSize:"12px",color:T.sub,marginBottom:"8px",lineHeight:1.5}}>Optional raw footage the influencer shared. Saved to the <code style={{background:T.surfaceAlt,padding:"1px 5px",borderRadius:"3px"}}>RAW/</code> subfolder in Drive — separate from the approved deliverables.</div>
              {driveFiles.raw.length>0&&<div style={{background:T.surfaceAlt,borderRadius:"2px",padding:"8px 12px",marginBottom:"8px"}}>
                {driveFiles.raw.map(ff=><div key={ff.id} style={{display:"flex",alignItems:"center",gap:"8px",padding:"5px 0",fontSize:"12px",borderBottom:`1px dashed ${T.border}`}}>
                  <span style={{background:T.gold+"22",color:T.gold,fontSize:"10px",fontWeight:800,padding:"2px 6px",borderRadius:"2px"}}>RAW</span>
                  <span style={{flex:1,fontFamily:"ui-monospace,monospace",color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ff.file_name}</span>
                  <span style={{color:T.faint,fontSize:"10px"}}>{ff.size_bytes?(ff.size_bytes/1048576).toFixed(1)+" MB":""}</span>
                  {ff.web_view_link&&<a href={ff.web_view_link} target="_blank" rel="noopener noreferrer" style={{color:T.info,fontSize:"11px",fontWeight:700}}>Open ↗</a>}
                </div>)}
              </div>}
              {Object.entries(driveUploading).filter(([k])=>k.startsWith(`${sel.id}:raw:`)).map(([k,u])=><div key={k} style={{padding:"4px 0",fontSize:"12px",marginBottom:"4px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"3px"}}><span style={{color:T.sub}}>⏫ {u.name}</span><span style={{color:T.gold,fontWeight:700}}>{u.progress}%</span></div>
                <div style={{height:"4px",background:T.border,borderRadius:"2px",overflow:"hidden"}}><div style={{height:"100%",width:u.progress+"%",background:T.gold,transition:"width .2s"}}/></div>
              </div>)}
              {(role==="negotiator"||role==="admin")&&<label style={{display:"inline-block",cursor:"pointer"}}>
                <input type="file" multiple style={{display:"none"}} accept="video/*,image/*,.mp4,.mov,.mkv,.webm,.jpg,.jpeg,.png" onChange={async e=>{
                  const files = Array.from(e.target.files||[]); e.target.value='';
                  for(const file of files) { await uploadDriveFile({deal:sel, deliverable:null, isRaw:true, file}); }
                }}/>
                <span style={{padding:"6px 12px",background:T.gold,color:"#1a1a22",borderRadius:"2px",fontSize:"12px",fontWeight:700}}>⬆ Upload Raw Clip(s)</span>
              </label>}
            </Section>}
            </>}

            {dealTab==="shipment"&&<>
            {sel.productOnHand&&!sel.ship&&<div style={{padding:"12px 14px",background:T.okBg,border:`1px solid ${T.ok}33`,borderLeft:`3px solid ${T.ok}`,borderRadius:"2px",marginBottom:"16px",fontSize:"13px"}}><b style={{color:T.ok}}>⏭ Shipment skipped</b> — the influencer already had the product, so dispatch was bypassed and content submission was unlocked directly.</div>}
            {/* Shipment & Logistics History */}
            {(sel.ship||(sel.shipHistory||[]).length>0)&&<Section title="Shipment & Logistics" icon="📦">
              {/* Original shipment */}
              {sel.ship&&<div style={{padding:"8px 10px",background:T.purpleBg,borderRadius:"2px",fontSize:"13px",marginBottom:"8px"}}>
                <div style={{fontWeight:700,fontSize:"11px",color:T.purple,textTransform:"uppercase",letterSpacing:".5px",marginBottom:"4px",fontFamily:"Bodoni Moda,serif"}}>Original Shipment</div>
                <div><b>{sel.ship.carrier}:</b> <span style={{color:T.info,fontWeight:700}}>{sel.ship.track}</span></div>
                <div style={{color:T.sub,marginTop:"1px"}}>Dispatched: {sel.ship.dispAt} by {sel.ship.dispBy}</div>
                {sel.ship.delAt&&<div style={{color:T.ok,marginTop:"1px"}}>✓ Delivered: {sel.ship.delAt}</div>}
              </div>}

              {/* Shipment History Timeline */}
              {(sel.shipHistory||[]).length>0&&<div style={{borderLeft:`2px solid ${T.border}`,paddingLeft:"12px",marginTop:"8px"}}>
                <div style={{fontSize:"10px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:".5px",marginBottom:"8px",fontFamily:"Bodoni Moda,serif"}}>Logistics History</div>
                {(sel.shipHistory||[]).map((h,hi)=>{
                  const isPickup = h.type==="pickup";
                  const isReship = h.type==="reship";
                  const icon = isPickup?"🔄":"📦";
                  const statusLabels = {
                    pickup_requested:"Pickup Requested",pickup_dispatched:"Return In Transit",product_returned:"Product Returned",pickup_skipped:"Pickup Skipped",
                    reship_pending:"Re-shipment Pending",re_dispatched:"Re-shipped",re_delivered:"Re-delivery Confirmed"
                  };
                  const statusColors = {
                    pickup_requested:T.warn,pickup_dispatched:T.info,product_returned:T.ok,pickup_skipped:T.sub,
                    reship_pending:T.warn,re_dispatched:T.purple,re_delivered:T.ok
                  };
                  return <div key={hi} style={{marginBottom:"10px",fontSize:"12px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                      <span>{icon}</span>
                      <span style={{fontWeight:700,color:statusColors[h.status]||T.sub}}>{statusLabels[h.status]||h.status}</span>
                      {isPickup&&h.reason&&<span style={{fontSize:"11px",color:T.sub}}>({h.reason})</span>}
                    </div>
                    {isPickup&&h.returnTrack&&<div style={{fontSize:"11px",color:T.info,marginLeft:"22px",marginTop:"1px"}}>{h.returnCarrier}: {h.returnTrack}</div>}
                    {isReship&&h.reTrack&&<div style={{fontSize:"11px",color:T.info,marginLeft:"22px",marginTop:"1px"}}>{h.reCarrier}: {h.reTrack}</div>}
                    {isReship&&(h.products||[]).length>0&&<div style={{fontSize:"11px",color:T.sub,marginLeft:"22px",marginTop:"1px"}}>Products: {h.products.map(p=>p.name).join(", ")}</div>}
                    {h.newAddress&&<div style={{fontSize:"11px",color:T.sub,marginLeft:"22px",marginTop:"1px"}}>New address: {h.newAddress}</div>}
                    {h.note&&<div style={{fontSize:"11px",color:T.sub,marginLeft:"22px",fontStyle:"italic"}}>{h.note}</div>}
                    {h.skipNote&&<div style={{fontSize:"11px",color:T.sub,marginLeft:"22px",fontStyle:"italic"}}>{h.skipNote}</div>}
                    <div style={{fontSize:"10px",color:T.faint,marginLeft:"22px",marginTop:"1px"}}>
                      {h.requestedBy&&`Requested by ${h.requestedBy}`}
                      {h.arrangedBy&&` · Arranged by ${h.arrangedBy}`}
                      {h.returnedBy&&` · Returned by ${h.returnedBy}`}
                      {h.reDispatchedBy&&` · Dispatched by ${h.reDispatchedBy}`}
                      {h.reDeliveredBy&&` · Delivered by ${h.reDeliveredBy}`}
                      {h.skippedBy&&` · Skipped by ${h.skippedBy}`}
                    </div>
                  </div>;
                })}
              </div>}

              {/* Negotiator actions: Request Pickup / Request Re-shipment */}
              {(role==="negotiator"||role==="admin")&&sel.ship?.st==="delivered"&&<div style={{display:"flex",gap:"6px",marginTop:"8px"}}>
                <Btn v="gold" sm onClick={()=>{setPickupF({reason:"Product Change",note:""});setModal("pickupRequest")}}>🔄 Request Pickup</Btn>
                <Btn v="purple" sm onClick={()=>{setReshipF({products:[{name:"",color:"",size:"",qty:"1"}],note:"",newAddress:"",phone:""});setModal("reshipRequest")}}>📦 Request New Shipment</Btn>
              </div>}
            </Section>}

            {/* Email preview */}
            {/* Acknowledgement status banner */}
            {sel.status==="email_sent"&&!sel.ackAt&&<div style={{background:"#fef3c7",border:"1px solid #f59e0b",borderRadius:"2px",padding:"10px 14px",marginBottom:"10px",fontSize:"13px",color:"#92400e"}}>
              <b>⏳ Awaiting Influencer Acknowledgement</b> — The confirmation email has been sent. Dispatch will be unlocked once the influencer clicks "I Agree to the Terms" in their email.
            </div>}
            {(sel.status==="acknowledged"||(sel.ackAt&&sel.status!=="email_sent"))&&<div style={{background:"#ecfdf5",border:"1px solid #10b981",borderRadius:"2px",padding:"10px 14px",marginBottom:"10px",fontSize:"13px",color:"#065f46"}}>
              <b>🤝 Influencer Acknowledged</b> — {sel.inf} agreed to the collaboration terms on {sel.ackAt?new Date(sel.ackAt).toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—"}.{sel.status==="acknowledged"?" Logistics can now dispatch the products.":""}
            </div>}
            </>}

            {dealTab==="activity"&&<>
            {["email_sent","acknowledged","shipped","delivered_prod","partial_live","live","invoice_ok","disputed","partial_paid","paid"].includes(sel.status)&&
            <Section title="Confirmation Email (System-Generated)" icon="✉">
              <div style={{background:T.surfaceAlt,border:`1px solid ${T.border}`,borderRadius:"2px",padding:"12px",fontSize:"13px",lineHeight:1.7,color:T.text}}>
                Dear {sel.inf},<br/><br/>
                Thank you for partnering with <b>Invogue</b>! Confirmed terms:<br/><br/>
                <b>Product:</b> {sel.products?sel.products.map(p=>p.name).join(", "):sel.product}<br/>
                <b>Amount:</b> <span style={{color:T.gold,fontWeight:800}}>{fAmt(sel.amount)}</span><br/>
                <b>Deliverables:</b> {sel.dels.map(d=>d.type).join(", ")} ({sel.dels.length} total)<br/>
                <b>Usage Rights:</b> {sel.usage}<br/>
                <b>Deadline:</b> {sel.deadline}<br/>
                <b>Payment:</b> {sel.paymentTerms||"Net 15 days from content live"}<br/>
                <b>To:</b> {sel.email || 'No email captured'}<br/><br/>
                <em style={{color:T.sub,fontSize:"11px"}}>System-generated. Terms auto-populated from approved record and cannot be altered.</em>
              </div>
            </Section>}

            {/* Audit Log */}
            <Section title="Audit Trail" icon="📜">
              {(sel.logs||[]).map((lg,i)=><div key={i} style={{display:"flex",gap:"8px",marginBottom:"6px",paddingLeft:"2px"}}>
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:"14px"}}>
                  <div style={{width:"5px",height:"5px",borderRadius:"50%",background:T.gold,marginTop:"4px"}}/>
                  {i<sel.logs.length-1&&<div style={{width:"1px",flexGrow:1,background:T.border,marginTop:"2px"}}/>}
                </div>
                <div>
                  <div style={{fontSize:"13px"}}><b>{lg.a}</b> <span style={{color:T.sub,fontWeight:400}}>by {lg.u}</span></div>
                  {lg.d&&<div style={{fontSize:"11px",color:T.sub}}>{lg.d}</div>}
                  <div style={{fontSize:"10px",color:T.faint}}>{lg.t}</div>
                </div>
              </div>)}
            </Section>
            </>}
            </div>

            {/* Actions footer */}
            <div style={{display:"flex",gap:"8px",flexWrap:"wrap",alignItems:"center",padding:"16px 28px",borderTop:`1px solid ${T.borderHead}`,background:"#FBFAF7",flexShrink:0,maxHeight:"34vh",overflowY:"auto"}}>
              {(role==="negotiator"||role==="admin")&&EDITABLE_STATUSES.includes(sel.status)&&!sel.ackAt&&<Btn v="outline" sm onClick={()=>openEditDeal(sel)}>✎ Edit Details</Btn>}
              {(role==="approver"||role==="admin")&&(sel.status==="pending"||sel.status==="renegotiate"||(sel.status==="manager_approved"&&role==="admin"))&&<>
                <Btn v="ok" onClick={()=>approveDeal(sel)}>✓ Approve & Lock</Btn>
                <Btn v="outline" onClick={()=>renegDeal(sel)}>↩ Renegotiate</Btn>
                <Btn v="danger" sm onClick={()=>openRejectModal(sel)}>✕ Reject</Btn>
              </>}
              {(role==="negotiator"||role==="admin")&&sel.status==="renegotiate"&&<>
                <Btn v="gold" onClick={()=>openResubmitModal(sel)}>↩ Review & Resubmit</Btn>
              </>}
              {(role==="negotiator"||role==="admin")&&sel.status==="approved"&&<Btn v="gold" onClick={()=>sendEmail(sel)}>✉ Send Confirmation Email</Btn>}
              {(role==="negotiator"||role==="admin")&&["email_sent","acknowledged","shipped","delivered_prod","partial_live","live","invoice_ok","disputed"].includes(sel.status)&&<Btn v="ghost" sm onClick={()=>confirmAndResendEmail(sel)}>🔁 Resend Confirmation Email</Btn>}
              {(role==="negotiator"||role==="admin")&&["pending","renegotiate","approved","manager_approved","email_sent","acknowledged","shipped","delivered_prod","partial_live"].includes(sel.status)&&totalPaid(sel)===0&&<Btn v="danger" sm onClick={()=>openDropModal(sel)}>🚫 Drop Collab</Btn>}
              {(role==="logistics"||role==="admin")&&sel.status==="acknowledged"&&!sel.ship&&<Btn v="purple" onClick={()=>{setShipF({track:"",carrier:"DTDC",orderId:""});setModal("ship")}}>📦 Dispatch</Btn>}
              {(role==="negotiator"||role==="logistics"||role==="admin")&&sel.status==="acknowledged"&&!sel.ship&&!sel.productOnHand&&<Btn v="outline" sm onClick={()=>skipShipment(sel)}>⏭ Already has product — skip shipment</Btn>}
              {(role==="logistics"||role==="admin")&&sel.status==="email_sent"&&!sel.ship&&<div style={{padding:"8px 12px",background:"#fef3c7",border:"1px solid #f59e0b",borderRadius:"2px",fontSize:"12px",color:"#92400e"}}>⏳ Awaiting influencer acknowledgement before dispatch</div>}
              {(role==="negotiator"||role==="admin")&&["partial_live","live"].includes(sel.status)&&!isPaymentEligible(sel)&&!sel.paymentDetailsAt&&<div style={{fontSize:"12px",color:T.warn,fontWeight:600,padding:"6px 10px",background:T.warnBg,borderRadius:"2px"}}>⏳ Payment opens once all required (non-Story) content is live. Stories are optional.</div>}
              {(role==="negotiator"||role==="admin")&&["live","partial_live","payment_details_received"].includes(sel.status)&&isPaymentEligible(sel)&&!sel.paymentDetailsAt&&<label style={{display:"inline-flex",alignItems:"center",gap:"6px",fontSize:"12px",color:T.sub,cursor:"pointer",padding:"6px 10px",background:sel.agencyManaged?T.goldSoft:"transparent",border:`1px solid ${sel.agencyManaged?T.gold:T.border}`,borderRadius:"2px"}}><input type="checkbox" checked={!!sel.agencyManaged} onChange={()=>toggleAgencyManaged(sel)} style={{cursor:"pointer"}}/>🏢 Agency-managed (agency raises GST invoice)</label>}
              {(role==="negotiator"||role==="admin")&&["live","partial_live","payment_details_received"].includes(sel.status)&&isPaymentEligible(sel)&&!sel.paymentDetailsAt&&!sel.agencyManaged&&<Btn v="primary" onClick={()=>setModal("collectPayment")}>{sel.paymentFormSent?"✅ Form Sent — Resend":"📩 Send Payment Details Form"}</Btn>}
              {(role==="negotiator"||role==="admin")&&["live","partial_live","payment_details_received"].includes(sel.status)&&isPaymentEligible(sel)&&!sel.paymentDetailsAt&&sel.agencyManaged&&<Btn v="gold" onClick={()=>openAgencyModal(sel)}>🏢 Attach Agency Invoice &amp; Details</Btn>}
              {sel.paymentDetailsAt&&sel.status!=="paid"&&(role==="negotiator"||role==="admin"||role==="approver")&&<div style={{fontSize:"12px",color:T.ok,fontWeight:700,padding:"6px 10px",background:T.okBg,borderRadius:"2px"}}>{sel.agencyManaged?`🏢 Agency invoice attached (${sel.agencyName||"agency"}) — ready for Finance`:"🧾 Payment details received — ready for Finance to pay"}</div>}
              {sel.status==="manager_approved"&&<div style={{fontSize:"12px",color:T.info,fontWeight:700,padding:"6px 10px",background:T.infoBg,borderRadius:"2px"}}>✅ Manager approved — awaiting admin final approval (₹50K+ deal)</div>}
              {sel.status==="drop_requested"&&(role==="approver"||role==="admin")&&<div style={{display:"flex",gap:"6px"}}><Btn v="ok" sm onClick={()=>approveDropRequest(sel)}>✓ Approve Drop</Btn><Btn v="outline" sm onClick={()=>rejectDropRequest(sel)}>✕ Reject Drop</Btn></div>}
              {sel.status==="drop_requested"&&role==="negotiator"&&<div style={{fontSize:"12px",color:T.warn,fontWeight:700,padding:"6px 10px",background:T.warnBg,borderRadius:"2px"}}>⏳ Drop request pending manager approval</div>}
              {(role==="finance"||role==="admin")&&!["pending","renegotiate","rejected","dropped"].includes(sel.status)&&rem>0&&<Btn v="ok" onClick={()=>{setPayF({type:paid===0?"advance":"partial",amount:"",note:""});setModal("payment")}}>💰 Record Payment</Btn>}
              {(role==="finance"||role==="admin")&&sel.status==="disputed"&&<>
                <Btn v="ok" sm onClick={()=>{setPayF({type:"final",amount:String(sel.amount-paid),note:"Paying approved amount per dispute resolution"});setModal("payment")}}>Pay Approved Amount</Btn>
                <Btn v="danger" sm onClick={()=>notify("Escalated to founder","warn")}>Escalate</Btn>
              </>}
              {["paid","live"].includes(sel.status)&&(role==="negotiator"||role==="admin")&&<Btn v="gold" sm onClick={()=>{setRatingF({stars:{timeliness:0,quality:0,communication:0,professionalism:0},feedback:"",influencerId:sel.id});setModal("rate")}}>⭐ Rate Influencer</Btn>}
              {role==="finance"&&<Btn v="purple" sm onClick={()=>{setGstRate("0");setTdsRate("0");setModal("taxCalculator")}}>🧮 Tax Info</Btn>}
              {sel.status==="pending"&&role==="negotiator"&&<div style={{fontSize:"12px",color:T.sub,fontStyle:"italic",padding:"4px 0"}}>⏳ Awaiting manager approval</div>}
              {role==="admin"&&<Btn v="danger" sm onClick={()=>deleteCollab(sel)}>🗑 Delete Collab</Btn>}
              {role==="admin"&&<div style={{fontSize:"11px",color:T.sub,fontStyle:"italic",padding:"4px 0",borderTop:`1px dashed ${T.border}`,marginTop:"4px",paddingTop:"6px",width:"100%"}}>⚙ Admin: All actions available regardless of status · deleting moves the collab to Admin → Deleted</div>}
            </div>
          </>;
        })()}
      </Modal>

      {/* CONFIRMATION MODAL */}
      <Modal open={!!confirmAction} onClose={()=>setConfirmAction(null)} title={confirmAction?.title||"Confirm"} w={400}>
        {confirmAction&&<>
          <div style={{padding:"16px 0",fontSize:"13px",color:T.text,lineHeight:1.6}}>{confirmAction.msg}</div>
          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",paddingTop:"12px",borderTop:`1px solid ${T.border}`}}>
            <Btn v="outline" onClick={()=>setConfirmAction(null)}>Cancel</Btn>
            <Btn v="gold" onClick={confirmAction.onConfirm}>Confirm</Btn>
          </div>
        </>}
      </Modal>

      {/* MARK DELIVERED MODAL */}
      <Modal open={modal==="markDelivered"} onClose={()=>setModal(null)} title={`Mark Delivered — ${sel?.inf}`} w={420}>
        {sel&&<>
          <div style={{padding:"10px",background:T.purpleBg,borderRadius:"2px",marginBottom:"12px",fontSize:"13px"}}>
            <div><b>Product:</b> {sel.product}</div>
            <div><b>Carrier:</b> {sel.ship?.carrier}: {sel.ship?.track}</div>
          </div>
          <Field label="Delivery Date *"><input value={deliveryF.date} onChange={e=>setDeliveryF({...deliveryF,date:e.target.value})} type="date" min={toDateOnly(sel.ship?.dispAt)} max={todayLocal()} style={{width:"100%",padding:"10px 12px",border:`1px solid ${T.border}`,borderRadius:"2px",fontSize:"14px",fontFamily:"Archivo,sans-serif",color:T.text,outline:"none"}}/></Field>
          <Field label="Note (optional)"><Inp value={deliveryF.note} onChange={e=>setDeliveryF({...deliveryF,note:e.target.value})} placeholder="Any delivery notes..."/></Field>
          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"10px"}}>
            <Btn v="outline" onClick={()=>setModal(null)}>Cancel</Btn>
            <Btn v="ok" onClick={()=>{if(!deliveryF.date){notify("Delivery date required","err");return;}markDelivered(sel,deliveryF.date,deliveryF.note);setModal(null)}}>✅ Mark Delivered</Btn>
          </div>
        </>}
      </Modal>

      {/* MARK RE-SHIPMENT DELIVERED MODAL */}
      <Modal open={modal==="markReshipDelivered"} onClose={()=>setModal(null)} title={`Mark Re-shipment Delivered — ${sel?.inf}`} w={440}>
        {sel&&reshipDelivF.histIdx!=null&&(()=>{
          const reship = (sel.shipHistory||[])[reshipDelivF.histIdx];
          const reDispDate = toDateOnly(reship?.reDispatchedAt);
          return <>
            <div style={{padding:"10px",background:T.purpleBg,borderRadius:"2px",marginBottom:"12px",fontSize:"13px"}}>
              <div style={{fontWeight:700,color:T.purple,fontSize:"11px",textTransform:"uppercase",letterSpacing:".5px",marginBottom:"4px",fontFamily:"Bodoni Moda,serif"}}>📦 Re-shipment Info</div>
              <div><b>Carrier:</b> {reship?.reCarrier}: {reship?.reTrack}</div>
              {(reship?.products||[]).length>0&&<div><b>Products:</b> {reship.products.map(p=>p.name).join(", ")}</div>}
              {reship?.newAddress&&<div><b>New Address:</b> {reship.newAddress}</div>}
              <div style={{fontSize:"11px",color:T.sub,marginTop:"2px"}}>Re-dispatched: {reDispDate}</div>
            </div>
            <Field label="Delivery Date *">
              <input value={reshipDelivF.date} onChange={e=>setReshipDelivF({...reshipDelivF,date:e.target.value})} type="date" min={reDispDate} max={todayLocal()} style={{width:"100%",padding:"10px 12px",border:`1px solid ${T.border}`,borderRadius:"2px",fontSize:"14px",fontFamily:"Archivo,sans-serif",color:T.text,outline:"none"}}/>
            </Field>
            <Field label="Note (optional)"><Inp value={reshipDelivF.note} onChange={e=>setReshipDelivF({...reshipDelivF,note:e.target.value})} placeholder="Any delivery notes..."/></Field>
            <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"10px"}}>
              <Btn v="outline" onClick={()=>setModal(null)}>Cancel</Btn>
              <Btn v="ok" onClick={()=>{if(!reshipDelivF.date){notify("Delivery date required","err");return;}markReshipDelivered(sel,reshipDelivF.histIdx,reshipDelivF.date,reshipDelivF.note)}}>✅ Mark Delivered</Btn>
            </div>
          </>;
        })()}
      </Modal>

      {/* PICKUP REQUEST MODAL — Negotiator requests product pickup */}
      <Modal open={modal==="pickupRequest"} onClose={()=>setModal("detail")} title={`Request Pickup — ${sel?.inf}`} w={460}>
        {sel&&<>
          <div style={{padding:"10px",background:T.warnBg,borderRadius:"2px",marginBottom:"12px",fontSize:"13px"}}>
            <div style={{fontWeight:700,color:T.warn,marginBottom:"4px"}}>🔄 Request Product Return</div>
            <div>Product will be picked up from the influencer and returned to warehouse.</div>
          </div>
          <Field label="Reason for Pickup *">
            <Sel value={pickupF.reason} onChange={e=>setPickupF({...pickupF,reason:e.target.value})} options={[{v:"Product Change",l:"Product Change"},{v:"Collab Dropped",l:"Collab Dropped"},{v:"Defective/Wrong Product",l:"Defective / Wrong Product"},{v:"Other",l:"Other"}]}/>
          </Field>
          <Field label="Note for Logistics (optional)"><Textarea value={pickupF.note} onChange={e=>setPickupF({...pickupF,note:e.target.value})} placeholder="Any special instructions for pickup..." rows={2}/></Field>
          <div style={{padding:"8px 10px",background:T.surfaceAlt,borderRadius:"2px",marginBottom:"10px",fontSize:"12px",color:T.sub}}>
            <div>📍 <b>Pickup from:</b> {sel.address||"Address not provided"}</div>
            <div>📱 <b>Phone:</b> {sel.phone||"Not provided"}</div>
          </div>
          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end"}}>
            <Btn v="outline" onClick={()=>setModal("detail")}>Cancel</Btn>
            <Btn v="ghost" sm onClick={()=>{const sh=[...(sel.shipHistory||[]),{type:"pickup",reason:pickupF.reason,note:pickupF.note,status:"pickup_skipped",skippedBy:loggedIn?.name||"You",skippedAt:new Date().toISOString(),skipNote:"No pickup needed"}];supabase.from('deals').update({ship_history:sh}).eq('id',sel.id);upDeal(sel.id,{shipHistory:sh});addLog(sel.id,loggedIn?.name||"You","Pickup skipped","No pickup needed");setSel(prev=>prev?{...prev,shipHistory:sh}:null);setModal("detail");notify("Marked as no pickup needed")}}>Skip — No Pickup Needed</Btn>
            <Btn v="gold" onClick={()=>requestPickup(sel,pickupF.reason,pickupF.note)}>🔄 Send to Logistics</Btn>
          </div>
        </>}
      </Modal>

      {/* ARRANGE PICKUP MODAL — Logistics arranges return courier */}
      {(sel&&modal&&modal.startsWith("arrangePickup-"))&&(()=>{
        const histIdx = parseInt(modal.split("-")[1]);
        return <Modal open={true} onClose={()=>setModal(null)} title={`Arrange Return Pickup — ${sel?.inf}`} w={440}>
          <div style={{padding:"10px",background:T.warnBg,borderRadius:"2px",marginBottom:"12px",fontSize:"13px"}}>
            <div style={{fontWeight:700,color:T.warn,marginBottom:"4px"}}>🔄 Return Pickup Details</div>
            <div>Reason: <b>{(sel.shipHistory||[])[histIdx]?.reason||"—"}</b></div>
            {(sel.shipHistory||[])[histIdx]?.note&&<div style={{marginTop:"2px",fontStyle:"italic"}}>{(sel.shipHistory||[])[histIdx].note}</div>}
          </div>
          <div style={{padding:"8px 10px",background:T.surfaceAlt,borderRadius:"2px",marginBottom:"10px",fontSize:"12px"}}>
            <div>📍 <b>Pickup from:</b> {sel.address||"—"}</div>
            <div>📱 <b>Phone:</b> {sel.phone||"—"}</div>
          </div>
          <Field label="Return Carrier"><Sel value={shipF.carrier} onChange={e=>setShipF({...shipF,carrier:e.target.value})} options={[{v:"DTDC",l:"DTDC"},{v:"Delhivery",l:"Delhivery"},{v:"Shiprocket",l:"Shiprocket"},{v:"BlueDart",l:"BlueDart"},{v:"India Post",l:"India Post"}]}/></Field>
          <Field label="Return Tracking ID *"><Inp value={shipF.track} onChange={e=>setShipF({...shipF,track:e.target.value})} placeholder="Return tracking number"/></Field>
          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"10px"}}>
            <Btn v="outline" onClick={()=>setModal(null)}>Cancel</Btn>
            <Btn v="gold" onClick={()=>arrangePickup(sel,histIdx,shipF.track,shipF.carrier)}>🔄 Arrange Pickup</Btn>
          </div>
        </Modal>;
      })()}

      {/* REQUEST RE-SHIPMENT MODAL — Negotiator requests new product shipment */}
      <Modal open={modal==="resendEmail"} onClose={()=>setModal("detail")} title={`Resend Confirmation — ${sel?.inf}`} w={460}>
        {sel&&<>
          <div style={{padding:"10px 12px",background:T.infoBg,borderRadius:"2px",marginBottom:"12px",fontSize:"13px",color:T.info}}>
            Resend the collaboration confirmation. You can correct the recipient's email below — the new address is saved to the deal for future emails.
          </div>
          <Field label="Recipient Email"><Inp value={resendF.email} onChange={e=>setResendF({...resendF,email:e.target.value})} placeholder="influencer@email.com"/></Field>
          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"10px"}}>
            <Btn v="outline" onClick={()=>setModal("detail")}>Cancel</Btn>
            <Btn v="gold" onClick={submitResend}>🔁 Resend Email</Btn>
          </div>
        </>}
      </Modal>

      <Modal open={modal==="reshipRequest"} onClose={()=>setModal("detail")} title={`Request New Shipment — ${sel?.inf}`} w={520}>
        {sel&&<>
          <div style={{padding:"10px",background:T.purpleBg,borderRadius:"2px",marginBottom:"12px",fontSize:"13px",color:T.purple}}>
            <div style={{fontWeight:700,marginBottom:"4px"}}>📦 New Product Shipment</div>
            <div>Logistics will dispatch the new product to the influencer.</div>
          </div>
          <div style={{padding:"12px",background:T.surfaceAlt,borderRadius:"2px",marginBottom:"10px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
              <span style={{fontSize:"11px",fontWeight:800,color:T.brand,textTransform:"uppercase",letterSpacing:".5px"}}>📦 New Products ({reshipF.products?.length||0})</span>
              <Btn v="outline" sm onClick={()=>setReshipF({...reshipF,products:[...(reshipF.products||[]),{name:"",color:"",size:"",qty:"1"}]})}>+ Add</Btn>
            </div>
            {(reshipF.products||[]).map((p,i)=>{
              const cat = productCatalog.find(pc=>pc.name===p.name);
              const upd = patch=>{const ps=[...(reshipF.products||[])];ps[i]={...ps[i],...patch};setReshipF({...reshipF,products:ps})};
              const rCuts = cat?.cuts || [];
              return <div key={i} style={{display:"grid",gridTemplateColumns:rCuts.length?"1fr 72px 80px 72px 48px 20px":"1fr 80px 80px 60px 24px",gap:"5px",marginBottom:"4px",alignItems:"center"}}>
              <Sel value={p.name} onChange={e=>upd({name:e.target.value,color:"",size:"",cut:""})} options={[{v:"",l:"Select product…"},...productCatalog.map(pc=>({v:pc.name,l:pc.name}))]}/>
              {cat&&cat.colors&&cat.colors.length>0
                ? <Sel value={p.color} onChange={e=>upd({color:e.target.value})} options={[{v:"",l:"Color"},...cat.colors.map(c=>({v:c,l:c}))]}/>
                : <Inp value={p.color} onChange={e=>upd({color:e.target.value})} placeholder="Color"/>}
              {rCuts.length>0&&<Sel value={p.cut||''} onChange={e=>upd({cut:e.target.value})} options={[{v:"",l:"Cut"},...rCuts.map(c=>({v:c,l:c}))]}/>}
              {cat&&cat.sizes&&cat.sizes.length>0
                ? <Sel value={p.size} onChange={e=>upd({size:e.target.value})} options={[{v:"",l:"Size"},...cat.sizes.map(s=>({v:s,l:s}))]}/>
                : <Inp value={p.size} onChange={e=>upd({size:e.target.value})} placeholder="Size"/>}
              <Inp value={p.qty} onChange={e=>upd({qty:e.target.value})} placeholder="Qty" type="number"/>
              {(reshipF.products||[]).length>1&&<button onClick={()=>setReshipF({...reshipF,products:(reshipF.products||[]).filter((_,j)=>j!==i)})} style={{background:"none",border:"none",color:T.err,cursor:"pointer",fontSize:"13px",padding:0}}>✕</button>}
            </div>;})}
          </div>
          <Field label="Updated Shipping Address (if changed)"><Inp value={reshipF.newAddress} onChange={e=>setReshipF({...reshipF,newAddress:e.target.value})} placeholder={sel.address||"Same as original address"}/></Field>
          <Field label="Updated Phone (if changed)"><Inp value={reshipF.phone} onChange={e=>setReshipF({...reshipF,phone:e.target.value})} placeholder={sel.phone||"Same as original phone"}/></Field>
          <Field label="Note for Logistics"><Textarea value={reshipF.note} onChange={e=>setReshipF({...reshipF,note:e.target.value})} placeholder="Reason for new shipment, special instructions..." rows={2}/></Field>
          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"10px"}}>
            <Btn v="outline" onClick={()=>setModal("detail")}>Cancel</Btn>
            <Btn v="purple" onClick={()=>requestReshipment(sel,reshipF.products,reshipF.note,reshipF.newAddress,reshipF.phone)}>📦 Send to Logistics</Btn>
          </div>
        </>}
      </Modal>

      {/* RE-SHIP DISPATCH MODAL — Logistics dispatches re-shipment */}
      {(sel&&modal&&modal.startsWith("reshipDispatch-"))&&(()=>{
        const histIdx = parseInt(modal.split("-")[1]);
        const h = (sel.shipHistory||[])[histIdx];
        return <Modal open={true} onClose={()=>setModal(null)} title={`Dispatch Re-shipment — ${sel?.inf}`} w={440}>
          <div style={{padding:"10px",background:T.purpleBg,borderRadius:"2px",marginBottom:"12px",fontSize:"13px",color:T.purple}}>
            <div style={{fontWeight:700,marginBottom:"4px"}}>📦 Re-shipment Products</div>
            {(h?.products||[]).map((p,i)=><div key={i}><b>{p.name}</b>{p.color?" · "+p.color:""}{p.cut?" · "+p.cut:""}{p.size?" · "+p.size:""}{p.qty?" · Qty: "+p.qty:""}</div>)}
          </div>
          <div style={{padding:"8px 10px",background:T.surfaceAlt,borderRadius:"2px",marginBottom:"10px",fontSize:"12px"}}>
            <div>📍 <b>Ship to:</b> {h?.newAddress||sel.address||"—"}</div>
            <div>📱 <b>Phone:</b> {h?.phone||sel.phone||"—"}</div>
          </div>
          <Field label="Carrier"><Sel value={reshipShipF.carrier} onChange={e=>setReshipShipF({...reshipShipF,carrier:e.target.value})} options={[{v:"DTDC",l:"DTDC"},{v:"Delhivery",l:"Delhivery"},{v:"Shiprocket",l:"Shiprocket"},{v:"BlueDart",l:"BlueDart"},{v:"India Post",l:"India Post"}]}/></Field>
          <Field label="Order ID"><Inp value={reshipShipF.orderId} onChange={e=>setReshipShipF({...reshipShipF,orderId:e.target.value})} placeholder="e.g. ORD-12345"/></Field>
          <Field label="Tracking ID *"><Inp value={reshipShipF.track} onChange={e=>setReshipShipF({...reshipShipF,track:e.target.value})} placeholder="Tracking number"/></Field>
          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"10px"}}>
            <Btn v="outline" onClick={()=>setModal(null)}>Cancel</Btn>
            <Btn v="purple" onClick={()=>dispatchReship(sel,histIdx,reshipShipF.track,reshipShipF.carrier,reshipShipF.orderId)}>📦 Dispatch</Btn>
          </div>
        </Modal>;
      })()}

      {/* SEND FOR PAYMENT MODAL */}
      {/* COLLECT PAYMENT DETAILS MODAL */}
      <Modal open={modal==="agencyInvoice"} onClose={()=>setModal("detail")} title={`Agency Invoice & Details — ${sel?.inf}`} w={540}>
        {sel&&<>
          <div style={{padding:"10px 12px",background:T.goldSoft,borderRadius:"2px",marginBottom:"12px",fontSize:"12px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>Locked Amount: <b style={{fontSize:"18px",color:T.gold}}>{fAmt(sel.amount)}</b></div>
              <span style={{fontSize:"12px",fontWeight:700,color:T.brand,background:"#fff",padding:"3px 10px",borderRadius:"2px"}}>{sel.collabId||"—"}</span>
            </div>
            <div style={{fontSize:"11px",color:T.sub,marginTop:"3px"}}>This creator is agency-managed — attach the agency's GST invoice and payout details. Finance pays the agency the locked amount.</div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
            <Field label="Agency Name" required><Inp value={agencyF.name} onChange={e=>setAgencyF({...agencyF,name:e.target.value})} placeholder="e.g. Creator Co. Talent"/></Field>
            <Field label="Agency GST Number"><Inp value={agencyF.gst} onChange={e=>setAgencyF({...agencyF,gst:e.target.value.toUpperCase()})} placeholder="GSTIN (optional)"/></Field>
            <Field label="Beneficiary Name" required><Inp value={agencyF.beneficiary} onChange={e=>setAgencyF({...agencyF,beneficiary:e.target.value})} placeholder="Name on agency bank account"/></Field>
            <Field label="Account Number" required><Inp value={agencyF.account} onChange={e=>setAgencyF({...agencyF,account:e.target.value})} placeholder="Account number"/></Field>
            <Field label="IFSC Code" required><Inp value={agencyF.ifsc} onChange={e=>setAgencyF({...agencyF,ifsc:e.target.value.toUpperCase()})} placeholder="HDFC0001234"/></Field>
            <Field label="UPI ID"><Inp value={agencyF.upi} onChange={e=>setAgencyF({...agencyF,upi:e.target.value})} placeholder="Optional"/></Field>
            <Field label="Agency PAN"><Inp value={agencyF.pan} onChange={e=>setAgencyF({...agencyF,pan:e.target.value.toUpperCase()})} placeholder="ABCDE1234F (optional)"/></Field>
            <Field label="Name on PAN"><Inp value={agencyF.panName} onChange={e=>setAgencyF({...agencyF,panName:e.target.value})} placeholder="Defaults to agency name"/></Field>
          </div>

          <div style={{fontSize:"11px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:".5px",margin:"10px 0 6px",fontFamily:"Bodoni Moda,serif"}}>📄 Agency GST Invoice</div>
          <div style={{border:`2px dashed ${agencyFile?T.ok:T.border}`,borderRadius:"2px",padding:"14px",textAlign:"center",marginBottom:"8px",background:agencyFile?T.okBg:"transparent",cursor:"pointer"}} onClick={()=>document.getElementById('agencyFileInput')?.click()}>
            <input id="agencyFileInput" type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" style={{display:"none"}} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)setAgencyFile(file);}}/>
            {agencyFile?<div style={{fontSize:"13px",fontWeight:700,color:T.ok}}>📄 {agencyFile.name} <span style={{fontSize:"11px",color:T.sub,fontWeight:400}}>· click to change</span></div>:<div><div style={{fontSize:"22px",marginBottom:"2px"}}>📤</div><div style={{fontSize:"12px",color:T.sub}}>Click to upload the agency's GST invoice (PDF/JPG/PNG)</div></div>}
          </div>
          <Field label="…or paste an invoice link"><Inp value={agencyF.invoiceLink} onChange={e=>setAgencyF({...agencyF,invoiceLink:e.target.value})} placeholder="https://drive.google.com/…"/></Field>
          {agencyUploading&&<div style={{padding:"8px",background:T.infoBg,borderRadius:"2px",marginBottom:"8px",fontSize:"12px",color:T.info,fontWeight:600}}>⏳ Uploading invoice to Drive…</div>}

          <div style={{display:"flex",gap:"8px",justifyContent:"flex-end",marginTop:"12px",paddingTop:"12px",borderTop:`1px solid ${T.border}`}}>
            <Btn v="outline" onClick={()=>setModal("detail")}>Cancel</Btn>
            <Btn v="gold" disabled={agencyUploading} onClick={()=>submitAgencyDetails(sel)}>{agencyUploading?"Uploading…":"💸 Save & Send to Finance"}</Btn>
          </div>
        </>}
      </Modal>

      <Modal open={modal==="collectPayment"} onClose={()=>setModal("detail")} title={`Send Payment Details Form — ${sel?.inf}`} w={520}>
        {sel&&<>
          <div style={{padding:"12px",background:T.goldSoft,borderRadius:"2px",marginBottom:"12px",fontSize:"12px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>Amount: <b style={{fontSize:"20px",color:T.gold}}>{fAmt(sel.amount)}</b></div>
              <span style={{fontSize:"12px",fontWeight:700,color:T.brand,background:"#fff",padding:"3px 10px",borderRadius:"2px",fontFamily:"Bodoni Moda,serif",letterSpacing:".5px"}}>{sel.collabId||"—"}</span>
            </div>
            <div style={{fontSize:"11px",color:T.sub,marginTop:"2px"}}>{sel.products?sel.products.map(p=>p.name).join(", "):sel.product} · {sel.dels.filter(d=>d.st==="live").length}/{sel.dels.length} live</div>
          </div>
          <div style={{padding:"10px",background:T.infoBg,borderRadius:"2px",marginBottom:"14px",fontSize:"12px",color:T.info}}>
            <b>🔒 Secure form:</b> The influencer opens a private, token-protected link (no one else can access their collab) and submits their bank, PAN and UPI details. The details come straight back into the deal — no PDF to chase, no amount to match.
          </div>

          {sel.paymentFormSent&&<div style={{padding:"8px 10px",background:T.okBg,borderRadius:"2px",marginBottom:"10px",fontSize:"12px",color:T.ok}}>
            ✅ Form already sent on {sel.paymentFormSentAt?new Date(sel.paymentFormSentAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"—"}
          </div>}

          {/* How it works */}
          <div style={{padding:"10px 12px",background:T.surfaceAlt,border:`1px solid ${T.border}`,borderRadius:"2px",marginBottom:"14px",fontSize:"12px"}}>
            <div style={{fontWeight:700,marginBottom:"6px",fontSize:"10px",color:T.sub,textTransform:"uppercase",letterSpacing:".5px"}}>How it works</div>
            <div style={{display:"flex",gap:"8px",alignItems:"flex-start",marginBottom:"4px"}}><span style={{fontSize:"14px"}}>1️⃣</span><span>You send the secure payment-details link (deliverables &amp; amount are pre-filled, read-only)</span></div>
            <div style={{display:"flex",gap:"8px",alignItems:"flex-start",marginBottom:"4px"}}><span style={{fontSize:"14px"}}>2️⃣</span><span>Influencer fills in bank account, IFSC, UPI &amp; PAN and submits</span></div>
            <div style={{display:"flex",gap:"8px",alignItems:"flex-start"}}><span style={{fontSize:"14px"}}>3️⃣</span><span>Details land on the deal — Finance pays the locked amount and bulk-generates the invoice</span></div>
          </div>

          {/* Email Preview */}
          <div style={{padding:"10px 12px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:"2px",marginBottom:"14px",fontSize:"11px"}}>
            <div style={{fontWeight:700,marginBottom:"4px",fontSize:"10px",color:T.sub,textTransform:"uppercase",letterSpacing:".5px"}}>Email Preview</div>
            <div><b>To:</b> {sel.email||"—"}</div>
            <div><b>Subject:</b> Invogue × {sel.inf} — Submit Your Payment Details ({sel.collabId||""})</div>
            <div style={{marginTop:"4px",color:T.sub}}>A branded email with a secure button to the payment-details form.</div>
          </div>

          <div style={{display:"flex",gap:"8px",justifyContent:"flex-end",paddingTop:"12px",borderTop:`1px solid ${T.border}`}}>
            <Btn v="outline" onClick={()=>setModal("detail")}>Back</Btn>
            <Btn v="outline" onClick={()=>sendPaymentForm(sel,"copy")}>📋 Copy Secure Link</Btn>
            <Btn v="gold" onClick={()=>sendPaymentForm(sel,"email")}>✉ Send Email</Btn>
          </div>
        </>}
      </Modal>

      {/* GENERATE INVOICE MODAL */}
      <Modal open={modal==="uploadInvoice"} onClose={()=>setModal("detail")} title={`Upload Invoice & Send to Finance — ${sel?.inf}`} w={520}>
        {sel&&<>
          <div style={{padding:"12px",background:T.goldSoft,borderRadius:"2px",marginBottom:"12px",fontSize:"12px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>🔒 Locked Amount: <b style={{fontSize:"20px",color:T.gold}}>{fAmt(sel.amount)}</b></div>
              <span style={{fontSize:"12px",fontWeight:700,color:T.brand,fontFamily:"Bodoni Moda,serif"}}>{sel.collabId||"—"}</span>
            </div>
            <div style={{fontSize:"11px",color:T.sub,marginTop:"4px"}}>{sel.products?sel.products.map(p=>p.name).join(", "):sel.product} · {sel.dels.length} deliverables · {ptLabel(sel.paymentTerms||"next_15th")}</div>
          </div>

          <div style={{padding:"10px",background:T.infoBg,borderRadius:"2px",marginBottom:"14px",fontSize:"12px",color:T.info,lineHeight:1.5}}>
            <b>One-step submission.</b> Fill in all fields below. On submit, the invoice goes directly to Finance for payment. If the amount matches the locked amount, Finance can pay immediately. If it doesn't match, it will be flagged as a dispute for manager review.
          </div>

          <div style={{fontSize:"11px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:".5px",marginBottom:"6px",fontFamily:"Bodoni Moda,serif"}}>📄 Invoice Document</div>
          <div style={{border:`2px dashed ${invoiceFile?T.ok:T.border}`,borderRadius:"2px",padding:"16px",textAlign:"center",marginBottom:"10px",background:invoiceFile?T.okBg:"transparent",cursor:"pointer",transition:"all .2s"}} onClick={()=>document.getElementById('invoiceFileInput')?.click()}>
            <input id="invoiceFileInput" type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" style={{display:"none"}} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file){setInvoiceFile(file);if(!invoiceF.notes)setInvoiceF(prev=>({...prev,notes:file.name}))}}}/>
            {invoiceFile?<div><div style={{fontSize:"14px",fontWeight:700,color:T.ok}}>📄 {invoiceFile.name}</div><div style={{fontSize:"11px",color:T.sub,marginTop:"4px"}}>{(invoiceFile.size/1024).toFixed(1)} KB · Click to change</div></div>:<div><div style={{fontSize:"24px",marginBottom:"4px"}}>📤</div><div style={{fontSize:"13px",fontWeight:600,color:T.sub}}>Click to upload invoice</div><div style={{fontSize:"11px",color:T.sub,marginTop:"2px"}}>PDF, JPG, PNG, DOC accepted</div></div>}
          </div>
          {invoiceUploading&&<div style={{padding:"8px",background:T.infoBg,borderRadius:"2px",marginBottom:"8px",fontSize:"12px",color:T.info,fontWeight:600}}>⏳ Uploading invoice to Google Drive...</div>}
          <Field label="Invoice Number (from the PDF)">
            <Inp value={invoiceF.beneficiary} onChange={e=>setInvoiceF({...invoiceF,beneficiary:e.target.value})} placeholder="e.g. INV-A3F2XK-ABCD (auto-filled if blank)"/>
          </Field>

          <div style={{fontSize:"11px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:".5px",marginTop:"10px",marginBottom:"6px",fontFamily:"Bodoni Moda,serif"}}>💰 Amount</div>
          <Field label="Invoice Amount *">
            <Inp value={invoiceF.amount} onChange={e=>setInvoiceF({...invoiceF,amount:e.target.value})} type="number" prefix="₹" placeholder={String(sel.amount)}/>
          </Field>
          {invoiceF.amount&&+invoiceF.amount!==sel.amount&&<div style={{padding:"6px 8px",background:T.errBg,borderRadius:"2px",fontSize:"11px",color:T.err,marginTop:"-4px",marginBottom:"8px"}}>⚠ MISMATCH: Invoice {f(invoiceF.amount)} ≠ Locked {fAmt(sel.amount)}. Will be flagged as dispute for manager review.</div>}
          {invoiceF.amount&&+invoiceF.amount===sel.amount&&<div style={{padding:"6px 8px",background:T.okBg,borderRadius:"2px",fontSize:"11px",color:T.ok,marginTop:"-4px",marginBottom:"8px"}}>✓ Matches locked amount — Finance can pay immediately.</div>}

          <div style={{fontSize:"11px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:".5px",marginTop:"10px",marginBottom:"6px",fontFamily:"Bodoni Moda,serif"}}>🪪 PAN Details (required for payment)</div>
          <Field label="PAN Number *">
            <Inp value={invoiceF.panNumber} onChange={e=>setInvoiceF({...invoiceF,panNumber:e.target.value.toUpperCase()})} placeholder="ABCDE1234F"/>
          </Field>
          <Field label="Legal Name (as on PAN) *">
            <Inp value={invoiceF.panName} onChange={e=>setInvoiceF({...invoiceF,panName:e.target.value})} placeholder="Full legal name"/>
          </Field>

          <div style={{display:"flex",gap:"8px",justifyContent:"flex-end",marginTop:"14px",paddingTop:"12px",borderTop:`1px solid ${T.border}`}}>
            <Btn v="outline" onClick={()=>setModal("detail")}>Cancel</Btn>
            <Btn v="ok" onClick={()=>submitInvoiceComplete(sel)} disabled={(!invoiceFile&&!invoiceF.notes)||!invoiceF.amount||!invoiceF.panNumber||!invoiceF.panName||invoiceUploading}>{invoiceUploading?"⏳ Uploading...":"💸 Submit & Send to Manager"}</Btn>
          </div>
        </>}
      </Modal>

      <Modal open={modal==="sendForPayment"} onClose={()=>setModal(null)} title={`Send for Payment — ${sel?.inf}`} w={460}>
        {sel&&<>
          <div style={{padding:"10px",background:T.goldSoft,borderRadius:"2px",marginBottom:"12px",fontSize:"12px"}}>
            <div>Amount: <b style={{fontSize:"20px",color:T.gold}}>{fAmt(sel.amount)}</b></div>
            <div style={{fontSize:"11px",color:T.sub,marginTop:"2px"}}>{sel.products?sel.products.map(p=>p.name).join(", "):sel.product} · {sel.dels.length} deliverables</div>
          </div>
          <div style={{padding:"10px",background:T.warnBg,borderRadius:"2px",marginBottom:"12px",fontSize:"11px",color:T.warn}}>
            <b>PAN details are mandatory</b> for payment processing. Please enter the creator's PAN information below.
          </div>
          <Field label="Creator's PAN Number *" required><Inp value={panF.number} onChange={e=>setPanF({...panF,number:e.target.value.toUpperCase()})} placeholder="ABCDE1234F"/></Field>
          <Field label="Legal Name (as on PAN) *" required><Inp value={panF.name} onChange={e=>setPanF({...panF,name:e.target.value})} placeholder="Full legal name"/></Field>
          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"14px",paddingTop:"12px",borderTop:`1px solid ${T.border}`}}>
            <Btn v="outline" onClick={()=>setModal("detail")}>Cancel</Btn>
            <Btn v="gold" onClick={()=>{if(!panF.number||!panF.name){notify("PAN number and name are mandatory","err");return;}setConfirmAction({title:"Send for Payment",msg:`Send ${fAmt(sel.amount)} payment request for ${sel.inf} to manager for approval?`,onConfirm:()=>{sendForPayment(sel,panF.number,panF.name);setConfirmAction(null)}})}}>💸 Send for Payment</Btn>
          </div>
        </>}
      </Modal>

      {/* REJECT DEAL MODAL */}
      <Modal open={modal==="reject"} onClose={()=>setModal(null)} title={`Reject Deal — ${sel?.inf}`} w={420}>
        {sel&&<>
          <div style={{padding:"10px",background:T.errBg,borderRadius:"2px",marginBottom:"12px",fontSize:"12px"}}>
            <div style={{color:T.err,fontWeight:700}}>Amount: {fAmt(sel.amount)}</div>
            <div style={{fontSize:"11px",color:T.err,marginTop:"2px"}}>{sel.product} · {sel.dels.length} deliverables</div>
          </div>
          <Field label="Reason for Rejection *" required error={rejectReasonF.trim()===""?"Required":""}>
            <Textarea value={rejectReasonF} onChange={e=>setRejectReasonF(e.target.value)} placeholder="Explain why this deal is being rejected..." rows={4}/>
          </Field>
          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"14px",paddingTop:"12px",borderTop:`1px solid ${T.border}`}}>
            <Btn v="outline" onClick={()=>setModal(null)}>Cancel</Btn>
            <Btn v="danger" onClick={()=>rejectDeal(sel,rejectReasonF)}>❌ Reject Deal</Btn>
          </div>
        </>}
      </Modal>

      {/* DROP COLLAB MODAL */}
      <Modal open={modal==="drop"} onClose={()=>setModal(null)} title={`Drop Collab — ${sel?.inf}`} w={420}>
        {sel&&<>
          <div style={{padding:"10px",background:T.errBg,borderRadius:"2px",marginBottom:"12px",fontSize:"12px"}}>
            <div style={{color:T.err,fontWeight:700}}>Amount: {fAmt(sel.amount)}</div>
            <div style={{fontSize:"11px",color:T.sub,marginTop:"2px"}}>Status: {sel.status}</div>
            <div style={{fontSize:"11px",color:T.err,marginTop:"4px",fontWeight:600}}>⚠ Can only drop if NO payments made (Current paid: {f(totalPaid(sel))})</div>
          </div>
          {totalPaid(sel)>0&&<div style={{padding:"10px",background:T.errBg,borderRadius:"2px",marginBottom:"12px",fontSize:"13px",color:T.err}}>
            ❌ Cannot drop: Payment(s) already recorded. Contact manager to handle this collab.
          </div>}
          {totalPaid(sel)===0&&<>
            <Field label="Reason for Dropping *" required error={dropReasonF.trim()===""?"Required":""}>
              <Textarea value={dropReasonF} onChange={e=>setDropReasonF(e.target.value)} placeholder="Explain why you're dropping this collaboration..." rows={4}/>
            </Field>
            <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"14px",paddingTop:"12px",borderTop:`1px solid ${T.border}`}}>
              <Btn v="outline" onClick={()=>setModal(null)}>Cancel</Btn>
              <Btn v="danger" onClick={()=>dropCollab(sel,dropReasonF)}>🚫 Drop Collab</Btn>
            </div>
          </>}
        </>}
      </Modal>

      {/* ═══ FEATURE 2: RATING MODAL ═══ */}
      <Modal open={modal==="rate"} onClose={()=>setModal(null)} title={`Rate Influencer — ${sel?.inf}`} w={480}>
        {sel&&<>
          <div style={{padding:"10px",background:T.goldSoft,borderRadius:"2px",marginBottom:"12px",fontSize:"12px"}}>
            <div>Collab: <b>{sel.product}</b></div>
            <div style={{fontSize:"11px",color:T.sub,marginTop:"2px"}}>Status: {sel.status} · Amount: {fAmt(sel.amount)}</div>
          </div>
          <div style={{marginBottom:"12px"}}>
            <div style={{fontSize:"13px",fontWeight:700,marginBottom:"8px"}}>Rate on these dimensions:</div>
            {["timeliness","quality","communication","professionalism"].map(dim=><div key={dim} style={{marginBottom:"8px"}}>
              <div style={{fontSize:"11px",fontWeight:600,marginBottom:"4px",textTransform:"capitalize"}}>{dim}</div>
              <div style={{display:"flex",gap:"4px"}}>
                {[1,2,3,4,5].map(n=><button key={n} onClick={()=>setRatingF({...ratingF,stars:{...ratingF.stars,[dim]:n}})} style={{width:"32px",height:"32px",border:"1px solid "+T.border,borderRadius:"2px",cursor:"pointer",background:ratingF.stars[dim]>=n?T.gold:T.surface,color:ratingF.stars[dim]>=n?"#fff":T.sub,fontWeight:700,fontSize:"14px"}}>⭐</button>)}
              </div>
            </div>)}
          </div>
          <Field label="Feedback (Required)" required error={!ratingF.feedback?"Required":""}>
            <Textarea value={ratingF.feedback} onChange={e=>setRatingF({...ratingF,feedback:e.target.value})} placeholder="Share your feedback about working with this influencer..." rows={4}/>
          </Field>
          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"14px",paddingTop:"12px",borderTop:`1px solid ${T.border}`}}>
            <Btn v="outline" onClick={()=>setModal(null)}>Cancel</Btn>
            <Btn v="gold" onClick={()=>rateInfluencer(sel,ratingF)}>⭐ Submit Rating</Btn>
          </div>
        </>}
      </Modal>

      {/* ═══ FEATURE 2: VIEW INFLUENCER RATING ═══ */}
      <Modal open={modal==="infRating"} onClose={()=>setModal(null)} title={`Influencer Rating — ${sel?.inf}`} w={420}>
        {sel&&<>
          <div style={{padding:"10px",background:T.goldSoft,borderRadius:"2px",marginBottom:"12px"}}>
            <div style={{fontSize:"12px",fontWeight:700}}>{sel.inf}</div>
            <div style={{fontSize:"11px",color:T.sub,marginTop:"2px"}}>{sel.platform} · {sel.followers} followers</div>
          </div>
          {sel.rating?<>
            <div style={{marginBottom:"12px"}}>
              <div style={{fontSize:"13px",fontWeight:700,marginBottom:"8px"}}>Overall Rating</div>
              <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                <div style={{fontSize:"32px"}}>⭐⭐⭐⭐⭐</div>
                <div style={{fontSize:"18px",fontWeight:700,color:T.gold}}>{typeof sel.rating==="object"?((sel.rating.timeliness+sel.rating.quality+sel.rating.communication+sel.rating.professionalism)/4).toFixed(1):sel.rating}/5</div>
              </div>
            </div>
            <div style={{padding:"10px",background:T.bg,borderRadius:"2px",marginBottom:"12px",fontSize:"11px",lineHeight:1.5}}>
              <div style={{fontWeight:700,marginBottom:"4px"}}>Feedback:</div>
              {sel.feedback||"No feedback provided"}
            </div>
          </>:<div style={{fontSize:"13px",color:T.sub,padding:"12px",textAlign:"center"}}>No rating yet</div>}
        </>}
      </Modal>

      {/* ═══ FEATURE 6: TAX CALCULATION MODAL ═══ */}
      <Modal open={modal==="taxCalculator"} onClose={()=>setModal(null)} title="Tax Calculator (GST/TDS)" w={460}>
        {sel&&<>
          <div style={{padding:"10px",background:T.goldSoft,borderRadius:"2px",marginBottom:"12px",fontSize:"12px"}}>
            <div><b>{sel.inf}</b> · {sel.product}</div>
            <div style={{fontSize:"11px",color:T.sub,marginTop:"2px"}}>Base Amount: <b>{fAmt(sel.amount)}</b></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"14px"}}>
            <Field label="GST Rate (%)"><Sel value={gstRate} onChange={e=>setGstRate(e.target.value)} options={[{v:"0",l:"No GST (0%)"},{v:"5",l:"5%"},{v:"12",l:"12%"},{v:"18",l:"18%"},{v:"28",l:"28%"}]}/></Field>
            <Field label="TDS Rate (%)"><Sel value={tdsRate} onChange={e=>setTdsRate(e.target.value)} options={[{v:"0",l:"No TDS (0%)"},{v:"1",l:"1%"},{v:"2",l:"2%"},{v:"5",l:"5%"},{v:"10",l:"10%"}]}/></Field>
          </div>
          {(() => {
            const tax = calculateTax(sel.amount);
            return <div style={{padding:"10px",background:T.bg,borderRadius:"2px",marginBottom:"14px",fontSize:"13px"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}>
                <span>Base Amount</span>
                <span style={{fontWeight:700}}>{f(tax.base)}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}>
                <span>GST Amount ({gstRate}%)</span>
                <span style={{color:T.warn,fontWeight:700}}>+{f(tax.gst)}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:"8px"}}>
                <span>TDS Deduction ({tdsRate}%)</span>
                <span style={{color:T.err,fontWeight:700}}>-{f(tax.tds)}</span>
              </div>
              <div style={{borderTop:`1px solid ${T.border}`,paddingTop:"8px",display:"flex",justifyContent:"space-between"}}>
                <span style={{fontWeight:700}}>Net Payable</span>
                <span style={{fontSize:"13px",color:T.gold,fontWeight:800}}>{f(tax.netPayable)}</span>
              </div>
            </div>;
          })()}
          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end"}}>
            <Btn v="outline" onClick={()=>setModal(null)}>Close</Btn>
            <Btn v="gold" onClick={()=>{setGstRate("0");setTdsRate("0");setModal("detail")}}>Apply to Payment</Btn>
          </div>
        </>}
      </Modal>

      {/* ═══ BULK CONFIRMATION MODAL (already handled by confirmAction) ═══ */}
    </div>
  );
}
