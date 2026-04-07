'use client';
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from '../lib/supabase';

/* ═══════════════════════════════════════════════════════════════
   INVOGUE COLLAB HQ — Production Build with Persistent Storage
   ═══════════════════════════════════════════════════════════════ */

// ─── DESIGN SYSTEM ───
const T = {
  bg: "#F6F4F0", surface: "#FFFFFF", surfaceAlt: "#FAF9F7", brand: "#770A1C", gold: "#B08D42",
  goldSoft: "#EDE7D6", goldMid: "#D4C49A", border: "rgba(26,26,26,.12)",
  text: "#1A1A1A", sub: "#7D766A", faint: "#B5AFA4",
  ok: "#1B7A3D", okBg: "#E2F3E8", warn: "#C27A08", warnBg: "#FEF4DD",
  err: "#B42318", errBg: "#FDE8E8", info: "#0F5BA7", infoBg: "#E0EDFA",
  purple: "#6527BE", purpleBg: "#EFE4FF", teal: "#0E7A71", tealBg: "#E0F5F3",
  cardShadow: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)",
  cardShadowHover: "0 4px 12px rgba(0,0,0,.08)",
};

const STATUS_CFG = {
  pending:        { l:"Pending Approval", c:T.warn,   bg:T.warnBg,   i:"⏳" },
  renegotiate:    { l:"Renegotiate",      c:T.warn,   bg:T.warnBg,   i:"🔄" },
  approved:       { l:"Approved",         c:T.ok,     bg:T.okBg,     i:"✅" },
  rejected:       { l:"Rejected",         c:T.err,    bg:T.errBg,    i:"❌" },
  dropped:        { l:"Dropped",          c:T.err,    bg:T.errBg,    i:"🚫" },
  email_sent:     { l:"Email Sent",       c:T.info,   bg:T.infoBg,   i:"📧" },
  shipped:        { l:"Shipped",          c:T.purple, bg:T.purpleBg, i:"🚚" },
  delivered_prod: { l:"Product Delivered", c:T.teal,  bg:T.tealBg,   i:"📦" },
  partial_live:   { l:"Partially Live",   c:T.warn,   bg:T.warnBg,   i:"⏳" },
  live:           { l:"All Content Live",  c:T.ok,    bg:T.okBg,     i:"🟢" },
  invoice_ok:     { l:"Invoice Matched",  c:T.info,   bg:T.infoBg,   i:"✔️" },
  disputed:       { l:"Disputed",         c:T.err,    bg:T.errBg,    i:"⚠️" },
  partial_paid:   { l:"Partially Paid",   c:T.gold,   bg:T.goldSoft, i:"💳" },
  paid:           { l:"Fully Paid",       c:T.brand,  bg:T.goldSoft, i:"⭐" },
  payment_requested: { l:"Payment Requested", c:T.warn, bg:T.warnBg, i:"💸" },
  payment_approved: { l:"Payment Approved", c:T.info, bg:T.infoBg, i:"✅" },
};

const now = () => new Date().toISOString().slice(0,16).replace("T"," ");
const f = n => "₹"+Number(n||0).toLocaleString("en-IN");
const uid = () => crypto.randomUUID();
const genCollabId = () => "INV-" + Date.now().toString(36).toUpperCase().slice(-4) + Math.random().toString(36).toUpperCase().slice(2,4);

// ─── Simple PIN hashing (SHA-256) ───
const hashPin = async (pin) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + "invogue-salt-2026");
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
};

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
    id:u.id, name:u.name, email:u.email, pin:u.pin||'1111',
    role:u.role, status:u.status, avatar:u.avatar||u.name?.slice(0,2).toUpperCase(),
    created:u.created_at?.slice(0,10)||'',
  }));

  const campaigns = (campaignsRes.data||[]).map(c => ({
    id:c.id, name:c.name, budget:c.budget, target:c.target_influencers,
    status:c.status, created:c.created_at?.slice(0,10)||'', deadline:c.deadline,
    brief:c.brief||"",
  }));

  const influencers = (influencersRes.data||[]).map(i => ({
    id:i.id, name:i.name, platform:i.platform, handle:i.handle,
    profile:i.profile, followers:i.followers, category:i.category,
    city:i.city, phone:i.phone, email:i.email, address:i.address,
    poc:i.poc, avgRate:i.avg_rate, rating:i.rating, notes:i.notes,
    tags:i.tags||[], added:i.created_at?.slice(0,10)||'',
  }));

  const delsByDeal={}, paysByDeal={}, shipByDeal={}, logsByDeal={};
  (deliverablesRes.data||[]).forEach(dl => {
    if(!delsByDeal[dl.deal_id]) delsByDeal[dl.deal_id]=[];
    delsByDeal[dl.deal_id].push({id:dl.id,type:dl.type,desc:dl.description,st:dl.status,link:dl.live_link||''});
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
    appBy:d.approved_by, appAt:d.approved_at,
    email:d.email||"", payment_terms:d.payment_terms||"", pan_number:d.pan_number||"", pan_name:d.pan_name||"",
    products:d.products||(d.products_json?JSON.parse(d.products_json):[])||[],
    paymentFormSent:d.payment_form_sent||false, paymentFormSentAt:d.payment_form_sent_at||null,
    invoiceGenerated:d.invoice_generated||false, invoiceNumber:d.invoice_number||null, invoiceDate:d.invoice_date||null,
    inv:d.invoice_amount!=null?{amount:d.invoice_amount,match:d.invoice_match,at:d.invoice_at,note:d.invoice_note}:null,
    shipHistory:d.ship_history||[],
    dels:delsByDeal[d.id]||[], pays:paysByDeal[d.id]||[],
    ship:shipByDeal[d.id]||null, logs:logsByDeal[d.id]||[],
  }));

  return { users, campaigns, influencers, deals };
}

// Fallback user data for when Supabase is unavailable
const SEED_USERS = [
  { id:"u0", name:"Invogue Admin", email:"admin@invogue.in", role:"admin", status:"active", created:"2026-01-01", avatar:"IA", pin:"1234" },
  { id:"u1", name:"Ankit Mehta", email:"ankit@invogue.in", role:"negotiator", status:"active", created:"2026-01-15", avatar:"AM", pin:"1111" },
  { id:"u2", name:"Megha Joshi", email:"megha@invogue.in", role:"negotiator", status:"active", created:"2026-01-15", avatar:"MJ", pin:"1111" },
  { id:"u3", name:"Sneha Pillai", email:"sneha@invogue.in", role:"negotiator", status:"active", created:"2026-02-01", avatar:"SP", pin:"1111" },
  { id:"u4", name:"Ritu Kapoor", email:"ritu@invogue.in", role:"approver", status:"active", created:"2026-01-10", avatar:"RK", pin:"1111" },
  { id:"u5", name:"Raj Kumar", email:"raj@invogue.in", role:"logistics", status:"active", created:"2026-01-20", avatar:"RJ", pin:"1111" },
  { id:"u6", name:"Pooja Sharma", email:"pooja@invogue.in", role:"finance", status:"active", created:"2026-01-10", avatar:"PS", pin:"1111" },
  { id:"u7", name:"Vikram Nair", email:"vikram@invogue.in", role:"negotiator", status:"inactive", created:"2026-01-15", avatar:"VN", pin:"1111" },
];

const ROLE_CFG = {
  admin:      { l:"Admin",      c:"#DC2626", bg:"#FEE2E2", i:"⚙️" },
  negotiator: { l:"Negotiator",  c:T.info,   bg:T.infoBg,  i:"👤" },
  approver:   { l:"Manager",     c:T.ok,     bg:T.okBg,    i:"✅" },
  finance:    { l:"Finance",     c:T.gold,   bg:T.goldSoft, i:"💰" },
  logistics:  { l:"Logistics",   c:T.purple, bg:T.purpleBg, i:"📦" },
  viewer:     { l:"Viewer",      c:T.sub,    bg:"#f0ede8",  i:"👁" },
};

// ─── REUSABLE COMPONENTS ───
const Badge = ({s,sm}) => { const x=STATUS_CFG[s]||{l:s,c:T.sub,bg:T.goldSoft,i:"?"}; return <span style={{display:"inline-flex",alignItems:"center",gap:"4px",padding:sm?"3px 8px":"4px 12px",borderRadius:"4px",fontSize:sm?"10px":"11px",fontWeight:600,color:x.c,background:x.bg,whiteSpace:"nowrap",letterSpacing:".5px",textTransform:"uppercase",border:"none",fontFamily:"Barlow,sans-serif"}}>{x.i} {x.l}</span>; };
const ensureUrl = (url) => url && !url.match(/^https?:\/\//) ? "https://"+url : url;
const DBadge = ({s}) => { const m={pending:{l:"Pending",c:T.warn,bg:T.warnBg},submitted:{l:"Submitted",c:T.info,bg:T.infoBg},under_review:{l:"Under Review",c:T.purple,bg:T.purpleBg},revision_requested:{l:"Revision Needed",c:T.err,bg:T.errBg},approved:{l:"Approved",c:T.ok,bg:T.okBg},live:{l:"Live",c:T.ok,bg:T.okBg}}; const x=m[s]||m.pending; return <span style={{padding:"2px 8px",borderRadius:"8px",fontSize:"11px",fontWeight:700,color:x.c,background:x.bg}}>{x.l}</span>; };

const Btn = ({children,onClick,v="primary",sm,disabled,sx})=>{
  const vs={
    primary:{bg:T.brand,c:"#F6DFC1",border:"none"},
    gold:{bg:T.gold,c:"#fff",border:"none"},
    outline:{bg:"transparent",c:T.text,border:`1px solid ${T.border}`},
    danger:{bg:T.err,c:"#fff",border:"none"},
    ok:{bg:T.ok,c:"#fff",border:"none"},
    purple:{bg:T.purple,c:"#fff",border:"none"},
    ghost:{bg:"transparent",c:T.sub,border:"none"}
  };
  const vv=vs[v]||vs.primary;
  return <button onClick={onClick} disabled={disabled} style={{border:vv.border,borderRadius:"4px",padding:sm?"7px 14px":"10px 20px",fontSize:sm?"11px":"12px",fontWeight:600,cursor:disabled?"not-allowed":"pointer",fontFamily:"Barlow,sans-serif",textTransform:"uppercase",letterSpacing:"0.5px",opacity:disabled?.5:1,background:vv.bg,color:vv.c,display:"inline-flex",alignItems:"center",gap:"5px",whiteSpace:"nowrap",transition:"all .2s ease",...sx}}>{children}</button>;
};

const Inp = ({value,onChange,type="text",disabled,placeholder,prefix,error})=>(
  <div style={{display:"flex"}}>
    {prefix&&<span style={{padding:"9px 10px",background:T.surfaceAlt,border:`1px solid ${T.border}`,borderRight:"none",borderRadius:"4px 0 0 4px",fontSize:"13px",color:T.sub,lineHeight:"1.3",fontFamily:"Archivo,sans-serif"}}>{prefix}</span>}
    <input type={type} value={value} onChange={onChange} disabled={disabled} placeholder={placeholder} style={{width:"100%",padding:"10px 14px",border:`1px solid ${error?T.err:T.border}`,borderRadius:prefix?"0 4px 4px 0":"4px",fontSize:"13px",fontFamily:"Archivo,sans-serif",color:T.text,background:disabled?T.surfaceAlt:T.surface,outline:"none",boxSizing:"border-box",transition:"all .2s"}}/>
  </div>
);

const Textarea = ({value,onChange,disabled,placeholder,rows=3,error})=>(
  <textarea value={value} onChange={onChange} disabled={disabled} placeholder={placeholder} rows={rows} style={{width:"100%",padding:"9px 12px",border:`1px solid ${error?T.err:T.border}`,borderRadius:"4px",fontSize:"12px",fontFamily:"Archivo,sans-serif",color:T.text,background:disabled?T.surfaceAlt:T.surface,outline:"none",boxSizing:"border-box",resize:"vertical",transition:"all .2s"}}/>
);

const Sel = ({value,onChange,options})=>(
  <select value={value} onChange={onChange} style={{width:"100%",padding:"9px 12px",border:`1px solid ${T.border}`,borderRadius:"4px",fontSize:"12px",fontFamily:"Archivo,sans-serif",color:T.text,background:T.surface,outline:"none",boxSizing:"border-box",cursor:"pointer",transition:"all .2s"}}>
    {options.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
  </select>
);

const Field = ({label,children,span,error,required})=>(<div style={{gridColumn:span?`span ${span}`:undefined,marginBottom:"6px"}}><div style={{fontSize:"11px",fontWeight:700,color:error?T.err:T.sub,textTransform:"uppercase",letterSpacing:".8px",marginBottom:"5px"}}>{label}{required&&<span style={{color:T.err}}> *</span>}{error&&<span style={{color:T.err,fontSize:"10px",marginLeft:"4px",textTransform:"none",fontWeight:600}}>{error}</span>}</div>{children}</div>);

const Modal = ({open,onClose,title,children,w=540})=>{
  if(!open) return null;
  return <div role="presentation" style={{position:"fixed",inset:0,background:"rgba(0,0,0,.25)",backdropFilter:"none",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:"12px",animation:"fadeIn .2s ease"}} onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-label={title} onClick={e=>e.stopPropagation()} style={{background:T.surface,borderRadius:"8px",width:`${w}px`,maxWidth:"96vw",minWidth:"280px",maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 25px 50px rgba(0,0,0,.12)",border:`1px solid ${T.border}`,animation:"fadeUp .25s ease"}}>
      <div style={{padding:"16px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <span style={{fontWeight:700,fontSize:"18px",color:T.text,letterSpacing:".5px",fontFamily:"Barlow,sans-serif",textTransform:"uppercase"}}>{title}</span>
        <button onClick={onClose} style={{background:T.surfaceAlt,border:`1px solid ${T.border}`,borderRadius:"4px",fontSize:"14px",cursor:"pointer",color:T.sub,padding:"4px 8px",lineHeight:1,transition:"all .15s"}}>✕</button>
      </div>
      <div style={{padding:"20px",overflowY:"auto",flex:1}}>{children}</div>
    </div>
  </div>;
};

const StatBox = ({l,v,c,sub,gradient})=>(<div className="stat-hover" style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"6px",padding:"18px 20px",position:"relative",overflow:"hidden",transition:"all .25s ease",cursor:"default",borderLeft:`3px solid ${c||T.brand}`}}>
  <div style={{fontSize:"13px",fontWeight:600,color:T.sub,textTransform:"uppercase",letterSpacing:"1px",marginBottom:"8px",fontFamily:"Barlow,sans-serif"}}>{l}</div>
  <div style={{fontSize:"24px",fontWeight:700,color:c||T.text,lineHeight:1.1,fontFamily:"Barlow,sans-serif"}}>{v}</div>
  {sub&&<div style={{fontSize:"12px",color:T.sub,marginTop:"6px",fontFamily:"Archivo,sans-serif"}}>{sub}</div>}
</div>);

const Section = ({title,icon,children,action})=>(<div style={{marginBottom:"20px"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px",paddingBottom:"10px",borderBottom:`1px solid ${T.border}`}}><span style={{fontSize:"13px",fontWeight:700,color:T.text,textTransform:"uppercase",letterSpacing:"1px",fontFamily:"Barlow,sans-serif"}}>{icon} {title}</span>{action}</div>{children}</div>);
export default function InvogueCollabHQ() {
  const [loaded, setLoaded] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [deals, setDeals] = useState([]);
  const [users, setUsers] = useState([]);
  const [influencers, setInfluencers] = useState([]);
  const [infProfile, setInfProfile] = useState(null); // selected influencer for profile view
  const [loggedIn, setLoggedIn] = useState(null); // null = login screen, user object = app
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPin, setLoginPin] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const role = loggedIn?.role || "negotiator";
  const [view, setView] = useState("dashboard");
  const [tab, setTab] = useState("all");
  const [campFilter, setCampFilter] = useState("");
  const [sel, setSel] = useState(null);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);

  // Form states
  const [nDeal, setNDeal] = useState(null);
  const [nCamp, setNCamp] = useState(null);
  const [shipF, setShipF] = useState({track:"",carrier:"DTDC"});
  const [payF, setPayF] = useState({type:"advance",amount:"",note:""});
  const [invF, setInvF] = useState("");
  const [linkF, setLinkF] = useState("");
  const [userF, setUserF] = useState({name:"",email:"",role:"negotiator"});
  const [editUser, setEditUser] = useState(null);
  const [nInf, setNInf] = useState({name:"",platform:"Instagram",handle:"",profile:"",followers:"",category:"Fashion & Lifestyle",city:"",phone:"",email:"",address:"",poc:"",avgRate:"",rating:"B+",notes:"",tags:""});

  // New state variables for enhanced functionality
  const [confirmAction, setConfirmAction] = useState(null); // {title,msg,onConfirm}
  const [deliveryF, setDeliveryF] = useState({date:"",note:""}); // for marking delivered
  // Logistics: Pickup & Re-shipment
  const [pickupF, setPickupF] = useState({reason:"Product Change",note:""});
  const [reshipF, setReshipF] = useState({products:[],note:"",newAddress:""});
  const [reshipShipF, setReshipShipF] = useState({track:"",carrier:"DTDC"});
  const [panF, setPanF] = useState({number:"",name:""}); // PAN details
  const [payReqNote, setPayReqNote] = useState(""); // payment request note
  const [contentF, setContentF] = useState({url:"",note:""}); // for marking content live
  const [formErrors, setFormErrors] = useState({}); // validation errors
  const [rejectReasonF, setRejectReasonF] = useState(""); // rejection reason modal
  const [dropReasonF, setDropReasonF] = useState(""); // drop collab reason modal
  const [deliverableLinkF, setDeliverableLinkF] = useState({}); // unique state per deliverable {delId: url}
  const [attachmentMode, setAttachmentMode] = useState({}); // {delId: "link"|"attachment"}
  const [attachmentDesc, setAttachmentDesc] = useState({}); // {delId: description}
  const [revisionFeedback, setRevisionFeedback] = useState({}); // {delId: feedback text}

  // Payment details collection & Invoice generation
  const [invoiceF, setInvoiceF] = useState({beneficiary:"",bank:"",account:"",ifsc:"",upi:"",pan:"",panName:"",address:"",phone:"",gstNumber:"",notes:""});

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
        const d = await loadFromSupabase();
        setCampaigns(d.campaigns);
        setDeals(d.deals);
        setUsers(d.users.length>0?d.users:SEED_USERS);
        setInfluencers(d.influencers);
      } catch(e) {
        console.error("Supabase load failed:", e);
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
            delsByDeal[dl.deal_id].push({id:dl.id,type:dl.type,desc:dl.description,st:dl.status,link:dl.live_link||''});
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
            appBy:d.approved_by, appAt:d.approved_at,
            email:d.email||"", payment_terms:d.payment_terms||"", pan_number:d.pan_number||"", pan_name:d.pan_name||"",
            products:d.products||(d.products_json?JSON.parse(d.products_json):[])||[],
            inv:d.invoice_amount!=null?{amount:d.invoice_amount,match:d.invoice_match,at:d.invoice_at,note:d.invoice_note}:null,
            shipHistory:d.ship_history||[],
            dels:delsByDeal[d.id]||[], pays:paysByDeal[d.id]||[],
            ship:shipByDeal[d.id]||null, logs:logsByDeal[d.id]||[],
          }));
          setDeals(deals);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaigns' }, async () => {
        const {data} = await supabase.from('campaigns').select('*');
        if(data) setCampaigns(data.map(c => ({
          id:c.id, name:c.name, budget:c.budget, target:c.target_influencers,
          status:c.status, created:c.created_at?.slice(0,10)||'', deadline:c.deadline,
          brief:c.brief||"",
        })));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, async () => {
        const {data} = await supabase.from('users').select('*');
        if(data) setUsers(data.map(u => ({
          id:u.id, name:u.name, email:u.email, pin:u.pin||'1111',
          role:u.role, status:u.status, avatar:u.avatar||u.name?.slice(0,2).toUpperCase(),
          created:u.created_at?.slice(0,10)||'',
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

  // ── Login handler ──
  const handleLogin = async () => {
    setLoginErr("");
    if(!loginEmail.trim()) { setLoginErr("Email is required"); return; }
    if(!loginPin.trim()) { setLoginErr("PIN is required"); return; }
    const u = users.find(x=>x.email.toLowerCase()===loginEmail.toLowerCase().trim());
    if(!u) { setLoginErr("No account found with this email"); return; }
    if(u.status==="inactive") { setLoginErr("This account has been deactivated. Contact admin."); return; }
    // Support both hashed and plain-text PINs for backward compatibility
    if(u.pin) {
      const hashed = await hashPin(loginPin);
      if(u.pin !== loginPin && u.pin !== hashed) { setLoginErr("Incorrect PIN"); return; }
    }
    setLoggedIn(u);
    setView("dashboard");
    setLoginEmail("");
    setLoginPin("");
  };

  const handleLogout = () => {
    setLoggedIn(null);
    setView("dashboard");
    setLoginEmail("");
    setLoginPin("");
  };

  // ── Helpers ──
  const upDeal = useCallback((id,patch)=>{
    setDeals(ds=>ds.map(d=>d.id===id?{...d,...patch}:d));
  },[]);

  const addLog = useCallback((id,user,action,detail="")=>{
    const ts = new Date().toISOString();
    setDeals(ds=>ds.map(d=>d.id===id?{...d,logs:[...d.logs,{t:ts,u:user,a:action,d:detail}]}:d));
    supabase.from('audit_log').insert({deal_id:id,user_name:user,action,detail,created_at:ts}).then(({error})=>{if(error) console.error("Audit log insert failed:",error);});
  },[]);

  const totalPaid = d => (d.pays||[]).reduce((s,p)=>s+p.amount,0);
  const remaining = d => d.amount - totalPaid(d);
  const getCamp = id => campaigns.find(c=>c.id===id);
  const campCommitted = cid => deals.filter(d=>d.cid===cid&&!["rejected","pending","renegotiate","dropped"].includes(d.status)).reduce((s,d)=>s+d.amount,0);
  const campPaid = cid => deals.filter(d=>d.cid===cid).reduce((s,d)=>s+totalPaid(d),0);
  const campDeals = cid => deals.filter(d=>d.cid===cid);
  const campLocked = cid => deals.filter(d=>d.cid===cid&&!["rejected","pending","renegotiate","dropped"].includes(d.status)).length;

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

  const pendingShip = useMemo(()=>deals.filter(d=>["approved","email_sent"].includes(d.status)&&!d.ship),[deals]);
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
        if(h.type==="reship"&&h.status==="reship_pending") arr.push({...h,histIdx:i,dealId:d.id,inf:d.inf,address:h.newAddress||d.address,phone:d.phone});
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
    if(tab==="all") return d;
    if(tab==="pending") return d.filter(x=>x.status==="pending"||x.status==="renegotiate");
    if(tab==="active") return d.filter(x=>["approved","email_sent","shipped","delivered_prod","partial_live","live"].includes(x.status));
    if(tab==="payment") return d.filter(x=>["invoice_ok","disputed","partial_paid","paid"].includes(x.status));
    return d;
  },[deals,tab,campFilter]);

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
    const statusDist = {pending:0, approved:0, live:0, paid:0, rejected:0, dropped:0};

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

  // ── Actions ──
  const createDeal = async () => {
    // Validation
    setFormErrors({});
    const errors = {};

    if(!nDeal.profile) errors.profile = "Influencer profile is mandatory";
    const hasProduct = (nDeal.products && nDeal.products.some(p=>p.name)) || nDeal.product;
    if(!nDeal.inf||!nDeal.amount||!nDeal.deadline) errors.general = "Fill all required fields";
    if(!hasProduct) errors.products = "At least one product is required";
    if(!nDeal.email) errors.email = "Email is required";
    if(nDeal.dels.length===0) errors.dels = "Add at least one deliverable";

    // Check deliverables have descriptions
    if(nDeal.dels.some(d=>!d.desc)) errors.dels = "All deliverables must have descriptions";

    if(Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return notify("Please fix validation errors","err");
    }

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
      address:nDeal.address,
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
        address:nDeal.address||"",
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
  };

  const createCampaign = async () => {
    if(!nCamp.name||!nCamp.budget||!nCamp.target) return notify("Fill all fields","err");
    if(+nCamp.budget <= 0) return notify("Budget must be positive","err");
    if(+nCamp.target <= 0 || !Number.isInteger(+nCamp.target)) return notify("Target must be a positive whole number","err");
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
    const userName = loggedIn?.name||"You (Manager)";
    const ts = new Date().toISOString();
    supabase.from('deals').update({status:'approved',approved_by:userName,approved_at:ts}).eq('id',d.id).then(({error})=>{if(error){console.error("Approve save failed:",error);notify("Failed to save approval","err");}});
    upDeal(d.id,{status:"approved",appBy:userName,appAt:ts});
    addLog(d.id,userName,"Approved & amount locked",f(d.amount));

    // Budget check
    const camp = getCamp(d.cid);
    const committed = campCommitted(d.cid);
    const remaining = camp ? camp.budget - committed : 0;
    const budgetPct = camp ? Math.round((committed / camp.budget) * 100) : 0;
    let budgetMsg = "";
    if(camp) {
      budgetMsg = remaining < 0 ? ` ⚠ OVERBUDGET by ${f(Math.abs(remaining))}!` : remaining < (camp.budget * 0.2) ? ` ⚠ LOW budget (${budgetPct}% used)` : "";
    }

    setSel(null);
    setModal(null);
    notify("Approved! "+f(d.amount)+" locked"+budgetMsg);
  };

  const rejectDeal = (d, reason) => {
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
      msg:`Approve and lock ${f(d.amount)} for ${d.inf}?`,
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

  const [renegF, setRenegF] = useState(null); // {amount,note,dels} for renegotiation

  const renegDeal = d => {
    // Open renegotiation modal pre-filled with current deal data
    setRenegF({ dealId:d.id, amount:String(d.amount), note:"", dels:d.dels.map(dl=>({...dl,keep:true})) });
    setSel(d);
    setModal("renegotiate");
  };

  const submitReneg = async () => {
    if(!renegF) return;
    const keptDels = renegF.dels.filter(d=>d.keep!==false);
    if(keptDels.length===0) return notify("Keep at least one deliverable","err");
    if(!renegF.note) return notify("Add a note explaining changes","err");

    const newDels = keptDels.map(({keep,isNew,...rest})=>rest);

    supabase.from('deals').update({status:'renegotiate',amount:+renegF.amount,renegotiation_note:renegF.note}).eq('id',renegF.dealId).then(({error})=>{if(error) console.error("Renegotiate save failed:",error);});

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

    upDeal(renegF.dealId,{status:"renegotiate",amount:+renegF.amount,dels:newDels});
    addLog(renegF.dealId, loggedIn?.name||"Manager", "Sent back for renegotiation", `New amount: ${f(renegF.amount)} | ${newDels.length} deliverables | Note: ${renegF.note}`);
    setSel(null);
    setModal(null);
    setRenegF(null);
    notify("Sent back with revised terms","warn");
  };

  const sendEmail = d => {
    supabase.from('deals').update({status:'email_sent',email_sent_at:new Date().toISOString()}).eq('id',d.id).then(({error})=>{if(error) console.error("Email sent save failed:",error);});
    upDeal(d.id,{status:"email_sent"});
    addLog(d.id,"System","Confirmation email sent","Auto-generated from locked data");
    setSel(null);
    setModal(null);
    notify("Confirmation email sent!");
  };

  const dispatch = () => {
    if(!shipF.track) return notify("Enter tracking ID","err");
    if(shipF.track.length < 4) return notify("Tracking ID seems too short","err");
    const userName = loggedIn?.name||"You (Logistics)";
    const ts = new Date().toISOString();
    supabase.from('shipments').insert({deal_id:sel.id,carrier:shipF.carrier,tracking_id:shipF.track,status:'in_transit',dispatched_by:userName,dispatched_at:ts}).then(({error})=>{if(error) console.error("Shipment insert failed:",error);});
    supabase.from('deals').update({status:'shipped'}).eq('id',sel.id).then(({error})=>{if(error) console.error("Dispatch save failed:",error);});
    upDeal(sel.id,{status:"shipped",ship:{track:shipF.track,carrier:shipF.carrier,st:"in_transit",dispAt:ts,dispBy:userName,delAt:null}});
    addLog(sel.id,userName,"Shipment dispatched",`${shipF.carrier}: ${shipF.track}`);
    setSel(null);
    setModal(null);
    notify("Dispatched!");
  };

  const markDelivered = (d, deliveryDate, deliveryNote) => {
    const ts = deliveryDate || new Date().toISOString();
    if(deliveryDate && new Date(deliveryDate) > new Date()) return notify("Delivery date cannot be in the future","err");
    if(d.ship?.dispAt && deliveryDate && new Date(deliveryDate).toISOString().slice(0,10) < new Date(d.ship.dispAt).toISOString().slice(0,10)) return notify("Delivery date cannot be before dispatch date","err");
    const userName = loggedIn?.name||"You (Logistics)";
    supabase.from('shipments').update({status:'delivered',delivered_at:ts}).eq('deal_id',d.id).then(({error})=>{if(error) console.error("Shipment delivered save failed:",error);});
    supabase.from('deals').update({status:'delivered_prod'}).eq('id',d.id).then(({error})=>{if(error) console.error("Delivered prod save failed:",error);});
    upDeal(d.id,{status:"delivered_prod",ship:{...d.ship,st:"delivered",delAt:ts}});
    addLog(d.id,userName,"Product delivered",deliveryNote||"");
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

  const requestReshipment = (deal, products, note, newAddress) => {
    if(!products||products.length===0||products.every(p=>!p.name)) return notify("Add at least one product","err");
    const userName = loggedIn?.name||"You";
    const ts = new Date().toISOString();
    const entry = {type:"reship",products,note:note||"",newAddress:newAddress||"",status:"reship_pending",requestedBy:userName,requestedAt:ts};
    const shipHistory = [...(deal.shipHistory||[]), entry];
    supabase.from('deals').update({ship_history:shipHistory}).eq('id',deal.id).then(({error})=>{if(error) console.error("Reship request save failed:",error);});
    upDeal(deal.id,{shipHistory});
    addLog(deal.id,userName,"Re-shipment requested",`${products.map(p=>p.name).join(", ")}${newAddress?" · New address: "+newAddress:""}`);
    setSel(prev=>prev?{...prev,shipHistory}:null);
    setModal(null);
    notify("Re-shipment request sent to logistics!");
  };

  const dispatchReship = (deal, histIdx, trackingId, carrier) => {
    if(!trackingId) return notify("Enter tracking ID","err");
    const userName = loggedIn?.name||"You (Logistics)";
    const ts = new Date().toISOString();
    const shipHistory = (deal.shipHistory||[]).map((h,i)=>i===histIdx?{...h,status:"re_dispatched",reTrack:trackingId,reCarrier:carrier,reDispatchedBy:userName,reDispatchedAt:ts}:h);
    supabase.from('deals').update({ship_history:shipHistory}).eq('id',deal.id).then(({error})=>{if(error) console.error("Reship dispatch save failed:",error);});
    upDeal(deal.id,{shipHistory});
    addLog(deal.id,userName,"Re-shipment dispatched",`${carrier}: ${trackingId}`);
    setSel(prev=>prev?{...prev,shipHistory}:null);
    setModal(null);
    notify("Re-shipment dispatched!");
  };

  const markReshipDelivered = (deal, histIdx) => {
    const userName = loggedIn?.name||"You (Logistics)";
    const ts = new Date().toISOString();
    const shipHistory = (deal.shipHistory||[]).map((h,i)=>i===histIdx?{...h,status:"re_delivered",reDeliveredAt:ts,reDeliveredBy:userName}:h);
    supabase.from('deals').update({ship_history:shipHistory}).eq('id',deal.id).then(({error})=>{if(error) console.error("Reship delivered save failed:",error);});
    upDeal(deal.id,{shipHistory});
    addLog(deal.id,userName,"Re-shipment delivered","New product delivered to influencer");
    setSel(prev=>prev?{...prev,shipHistory}:null);
    notify("Re-shipment marked as delivered!");
  };

  const markDelLive = (deal,delIdx,contentUrl) => {
    if(!deal.ship || deal.ship.st !== "delivered") {
      return notify("Product must be delivered before content can go live","err");
    }
    const currentDel = deal.dels[delIdx];
    const liveUrl = contentUrl || currentDel?.link;
    if(!liveUrl) return notify("Content URL is required","err");

    const link = liveUrl;
    const newDels = deal.dels.map((dl,i)=>i===delIdx?{...dl,st:"live",link}:dl);
    const allLive = newDels.every(dl=>dl.st==="live");
    const newStatus = allLive ? "live" : "partial_live";
    const shouldUpdateStatus = ["email_sent","shipped","delivered_prod","partial_live"].includes(deal.status);
    const delId = deal.dels[delIdx].id;

    supabase.from('deliverables').update({status:'live',live_link:link,marked_live_at:new Date().toISOString()}).eq('id',delId).then(({error})=>{if(error) console.error("Mark live save failed:",error);});
    if(shouldUpdateStatus) supabase.from('deals').update({status:newStatus}).eq('id',deal.id).then(({error})=>{if(error) console.error("Deal status update failed:",error);});

    upDeal(deal.id,{dels:newDels, status:shouldUpdateStatus?newStatus:deal.status});
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
  const submitContentForReview = (deal, delIdx, contentUrl) => {
    if(!deal.ship || deal.ship.st !== "delivered") return notify("Product must be delivered before content can be submitted","err");
    if(!contentUrl) return notify("Content URL/link is required","err");
    const delId = deal.dels[delIdx].id;
    const ts = new Date().toISOString();
    const newDels = deal.dels.map((dl,i)=>i===delIdx?{...dl,st:"submitted",link:contentUrl,history:[...(dl.history||[]),{action:"submitted",by:loggedIn?.name||"You",at:ts,link:contentUrl}]}:dl);
    supabase.from('deliverables').update({status:'submitted',live_link:contentUrl,submitted_at:ts}).eq('id',delId).then(({error})=>{if(error) console.error("Submit content failed:",error);});
    upDeal(deal.id,{dels:newDels});
    addLog(deal.id,loggedIn?.name||"You","Content submitted for review",`${deal.dels[delIdx].type}: ${contentUrl}`);
    setSel(prev=>prev?{...prev,dels:newDels}:null);
    setDeliverableLinkF(prev=>{const copy={...prev};delete copy[delId];return copy;});
    notify("Content submitted for manager review!");
  };

  const approveContent = (deal, delIdx) => {
    const delId = deal.dels[delIdx].id;
    const ts = new Date().toISOString();
    const newDels = deal.dels.map((dl,i)=>i===delIdx?{...dl,st:"approved",history:[...(dl.history||[]),{action:"approved",by:loggedIn?.name||"You",at:ts}]}:dl);
    supabase.from('deliverables').update({status:'approved',approved_at:ts}).eq('id',delId).then(({error})=>{if(error) console.error("Approve content failed:",error);});
    upDeal(deal.id,{dels:newDels});
    addLog(deal.id,loggedIn?.name||"You","Content approved",`${deal.dels[delIdx].type}: ${deal.dels[delIdx].desc}`);
    setSel(prev=>prev?{...prev,dels:newDels}:null);
    notify("Content approved! Negotiator can now mark it live.");
  };

  const requestRevision = (deal, delIdx, feedback) => {
    if(!feedback) return notify("Please provide feedback for the revision","err");
    const delId = deal.dels[delIdx].id;
    const ts = new Date().toISOString();
    const newDels = deal.dels.map((dl,i)=>i===delIdx?{...dl,st:"revision_requested",feedback,link:"",history:[...(dl.history||[]),{action:"revision_requested",by:loggedIn?.name||"You",at:ts,feedback}]}:dl);
    supabase.from('deliverables').update({status:'revision_requested',feedback:feedback,revision_requested_at:ts}).eq('id',delId).then(({error})=>{if(error) console.error("Revision request failed:",error);});
    upDeal(deal.id,{dels:newDels});
    addLog(deal.id,loggedIn?.name||"You","Revision requested",`${deal.dels[delIdx].type}: ${feedback}`);
    setSel(prev=>prev?{...prev,dels:newDels}:null);
    setRevisionFeedback(prev=>{const copy={...prev};delete copy[delId];return copy;});
    notify("Revision requested. Negotiator will be notified.","warn");
  };

  const submitInvoice = (deal) => {
    if(!invF) return notify("Enter invoice amount","err");
    if(+invF <= 0) return notify("Invoice amount must be positive","err");
    const match = +invF === deal.amount;
    const ts = new Date().toISOString();
    const newStatus = match?"invoice_ok":"disputed";
    supabase.from('deals').update({status:newStatus,invoice_amount:+invF,invoice_match:match,invoice_at:ts,invoice_note:match?null:"Invoice mismatch detected by system"}).eq('id',deal.id).then(({error})=>{if(error) console.error("Invoice save failed:",error);});
    upDeal(deal.id,{status:newStatus,inv:{amount:+invF,match,at:ts,note:match?"":"Invoice mismatch detected by system"}});
    addLog(deal.id,loggedIn?.name||"You","Invoice submitted",`${f(invF)} ${match?"— matched ✓":"— MISMATCH ⚠ (approved: "+f(deal.amount)+")"}`);
    setSel(null);
    setModal(null);
    setInvF("");
    if(match) notify("Invoice submitted — matched!"); else notify("MISMATCH — flagged for review!","err");
  };

  const recordPayment = () => {
    if(role!=="finance") return notify("Only Finance role can record payments","err");
    if(!payF.amount) return notify("Enter amount","err");
    if(+payF.amount <= 0) return notify("Amount must be positive","err");
    const amt = +payF.amount;
    if(amt > remaining(sel) && amt !== sel.amount) return notify("Exceeds remaining balance!","err");
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

  // ─── PAYMENT DETAILS COLLECTION & INVOICE ───
  const sendPaymentForm = (deal, method) => {
    const invoiceUrl = getInvoiceCreatorUrl(deal);
    if(method==="copy") {
      navigator.clipboard.writeText(invoiceUrl).then(()=>notify("Invoice creator link copied!")).catch(()=>notify("Failed to copy link","err"));
    } else if(method==="email") {
      const subject = encodeURIComponent(`Invogue x ${deal.inf} — Please Generate Your Invoice [${deal.collabId||""}]`);
      const body = encodeURIComponent(
`Hi ${deal.inf},

Thank you for the amazing collaboration with Invogue!

Your content is now live and we'd like to process your payment of ₹${deal.amount.toLocaleString("en-IN")}.

Please generate your invoice using the link below — it's pre-filled with your collaboration details:

${invoiceUrl}

Your Collaboration ID: ${deal.collabId||"N/A"}

On the invoice creator page, you'll need to fill in:
• Your name & contact details
• Bank account, IFSC code & UPI ID
• PAN card details
• Mailing address

Your bank details are processed entirely in your browser and are never stored on any server.

Once generated, please save the invoice as PDF and share it with us.

Warm regards,
${loggedIn?.name || "Team Invogue"}
Invogue · invogue.shop`
      );
      window.open(`mailto:${deal.email}?subject=${subject}&body=${body}`,"_blank");
    }
    const ts = new Date().toISOString();
    supabase.from('deals').update({payment_form_sent:true,payment_form_sent_at:ts}).eq('id',deal.id).then(({error})=>{if(error) console.error("Invoice link sent save failed:",error);});
    upDeal(deal.id,{paymentFormSent:true,paymentFormSentAt:ts});
    addLog(deal.id,loggedIn?.name||"You","Invoice creator link sent",`${method==="email"?"Via email":"Link copied"} · ${deal.collabId||""}`);
    setSel(prev=>prev?{...prev,paymentFormSent:true,paymentFormSentAt:ts}:null);
    if(method==="email") notify("Email client opened with invoice creator link!");
  };

  const getInvoiceCreatorUrl = (deal) => {
    const base = window.location.origin + "/invoice-creator";
    const params = new URLSearchParams();
    if(deal.collabId) params.set("collab", deal.collabId);
    if(deal.inf) params.set("name", deal.inf);
    if(deal.email) params.set("email", deal.email);
    if(deal.amount) params.set("amount", deal.amount);
    const dels = deal.dels.map(d=>d.type).join(", ");
    if(dels) params.set("deliverables", dels);
    return base + "?" + params.toString();
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
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@600;700;800&family=Archivo:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Archivo,sans-serif;color:#1A1A1A;padding:40px;max-width:800px;margin:0 auto;font-size:13px;line-height:1.6}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #770A1C}
.brand{font-family:Barlow,sans-serif;font-size:22px;font-weight:800;color:#770A1C;letter-spacing:3px;text-transform:uppercase}
.brand-sub{font-size:10px;color:#7D766A;letter-spacing:1px;font-weight:600}
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
.total-row{background:#F6F4F0}
.total-row td{font-weight:700;font-size:13px}
.grand-total td{background:#770A1C;color:#F6DFC1;font-size:15px;font-weight:800;font-family:Barlow,sans-serif}
.payment-box{background:#F6F4F0;border:1px solid #ddd;border-radius:6px;padding:16px;margin-bottom:20px}
.payment-box .row{display:flex;justify-content:space-between;padding:3px 0;font-size:12px}
.payment-box .row b{color:#1A1A1A}
.footer{margin-top:32px;padding-top:16px;border-top:2px solid #770A1C;text-align:center;font-size:11px;color:#7D766A}
.stamp{display:inline-block;padding:6px 20px;border:2px solid #770A1C;color:#770A1C;font-family:Barlow,sans-serif;font-weight:800;font-size:14px;text-transform:uppercase;letter-spacing:2px;transform:rotate(-5deg);margin-top:16px}
.note{background:#FEF4DD;border:1px solid #E8D5A3;border-radius:4px;padding:10px;font-size:11px;color:#7D766A;margin-bottom:16px}
@media print{body{padding:20px}button{display:none!important}.no-print{display:none!important}}
</style></head><body>
<div class="no-print" style="text-align:center;margin-bottom:20px">
<button onclick="window.print()" style="background:#770A1C;color:#F6DFC1;border:none;padding:10px 24px;border-radius:4px;font-family:Barlow,sans-serif;font-weight:700;font-size:14px;cursor:pointer;letter-spacing:1px;text-transform:uppercase">Download / Print Invoice</button>
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
<div style="font-family:Barlow,sans-serif;font-weight:700;color:#770A1C;letter-spacing:2px;margin-bottom:4px">INVOGUE</div>
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

  const dropCollab = (d, reason) => {
    if(!reason || !reason.trim()) return notify("Drop reason is mandatory","err");
    const totalPaidAmount = totalPaid(d);
    if(totalPaidAmount > 0) return notify("Cannot drop a collab with payments already made","err");
    const userName = loggedIn?.name||"You (Negotiator)";
    const ts = new Date().toISOString();
    supabase.from('deals').update({status:'dropped'}).eq('id',d.id).then(({error})=>{if(error) console.error("Drop collab failed:",error);});
    upDeal(d.id,{status:"dropped"});
    addLog(d.id,userName,"Collab dropped",`Reason: ${reason}`);
    setSel(null);
    setModal(null);
    setDropReasonF("");
    notify("Collab dropped","warn");
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
    const toApprove = [...bulkSelected].map(id => deals.find(d => d.id === id)).filter(d => d && d.status === "pending");
    if(toApprove.length === 0) return notify("No pending deals selected","err");

    const count = toApprove.length;
    setConfirmAction({
      title: "Bulk Approve",
      msg: `Approve ${count} deal${count > 1 ? 's' : ''}?`,
      onConfirm: () => {
        const userName = loggedIn?.name || "Manager";
        const ts = new Date().toISOString();
        toApprove.forEach(d => {
          supabase.from('deals').update({status:'approved',approved_by:userName,approved_at:ts}).eq('id',d.id).then(({error})=>{if(error) console.error("Bulk approve save failed for "+d.id+":",error);});
          upDeal(d.id, {status:"approved",appBy:userName,appAt:ts});
          addLog(d.id, userName, "Bulk approved", f(d.amount));
        });
        setBulkSelected(new Set());
        setBulkSelectAll(false);
        setConfirmAction(null);
        notify(`${count} deal${count > 1 ? 's' : ''} approved!`);
      }
    });
  };

  const bulkReject = () => {
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
      <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@600;700;800&family=Archivo:wght@400;500;600&display=swap" rel="stylesheet"/>
      <style>{`
@import url('https://fonts.googleapis.com/css2?family=Barlow:wght@600;700;800&family=Archivo:wght@400;500;600&display=swap');
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
          <div style={{fontFamily:"'Barlow',sans-serif",fontSize:"32px",fontWeight:800,color:"#1A1A1A",letterSpacing:"8px",marginBottom:"4px",textTransform:"uppercase"}}>INVOGUE</div>
          <div style={{fontFamily:"'Barlow',sans-serif",fontSize:"12px",fontWeight:700,color:"#770A1C",letterSpacing:"4px",marginBottom:"12px",textTransform:"uppercase"}}>COLLAB HQ</div>
          <div style={{width:"30px",height:"2px",background:"#B08D42",margin:"0 auto"}}/>
        </div>

        {/* Login Card */}
        <div style={{background:"#FFFFFF",borderRadius:"8px",padding:"32px",boxShadow:"0 4px 24px rgba(0,0,0,.06)",border:"1px solid rgba(26,26,26,.08)"}}>
          <div style={{fontFamily:"'Barlow',sans-serif",fontSize:"18px",fontWeight:700,color:"#1A1A1A",marginBottom:"8px",textTransform:"uppercase"}}>Welcome back</div>
          <div style={{fontFamily:"'Archivo',sans-serif",fontSize:"12px",color:"#7D766A",marginBottom:"28px"}}>Sign in to your workspace</div>

          {/* Email */}
          <div style={{marginBottom:"18px"}}>
            <label style={{fontFamily:"'Barlow',sans-serif",display:"block",fontSize:"10px",fontWeight:600,color:"#7D766A",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"8px"}}>Email</label>
            <input type="email" aria-label="Email address" value={loginEmail} onChange={e=>{setLoginEmail(e.target.value);setLoginErr("")}}
              onKeyDown={e=>e.key==="Enter"&&handleLogin()}
              placeholder="your@invogue.in"
              style={{width:"100%",padding:"12px 14px",border:"1px solid rgba(26,26,26,.12)",borderRadius:"4px",fontSize:"13px",fontFamily:"'Archivo',sans-serif",color:"#1A1A1A",outline:"none",background:"#FFFFFF",transition:"border .2s",boxSizing:"border-box"}}/>
          </div>

          {/* PIN */}
          <div style={{marginBottom:"22px"}}>
            <label style={{fontFamily:"'Barlow',sans-serif",display:"block",fontSize:"10px",fontWeight:600,color:"#7D766A",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"8px"}}>PIN</label>
            <input type="password" aria-label="PIN" value={loginPin} onChange={e=>{setLoginPin(e.target.value);setLoginErr("")}}
              onKeyDown={e=>e.key==="Enter"&&handleLogin()}
              placeholder="••••" maxLength={6}
              style={{width:"100%",padding:"12px 14px",border:"1px solid rgba(26,26,26,.12)",borderRadius:"4px",fontSize:"13px",fontFamily:"'Archivo',sans-serif",color:"#1A1A1A",outline:"none",background:"#FFFFFF",letterSpacing:"4px",transition:"border .2s",boxSizing:"border-box"}}/>
          </div>

          {/* Error */}
          {loginErr&&<div style={{padding:"10px 12px",background:"#FEE2E2",borderRadius:"4px",fontSize:"13px",color:"#991B1B",fontWeight:600,marginBottom:"18px",fontFamily:"'Archivo',sans-serif"}}>{loginErr}</div>}

          {/* Login Button */}
          <button onClick={handleLogin} style={{width:"100%",padding:"12px 16px",background:"#770A1C",color:"#F6DFC1",border:"none",borderRadius:"4px",fontFamily:"'Barlow',sans-serif",fontSize:"12px",fontWeight:700,cursor:"pointer",letterSpacing:"1px",textTransform:"uppercase",transition:"all .2s",boxSizing:"border-box"}} onMouseEnter={e=>{e.currentTarget.style.background="#5A0814"}} onMouseLeave={e=>{e.currentTarget.style.background="#770A1C"}}>Sign In</button>
        </div>

        {/* Demo access toggle */}
        <div style={{marginTop:"28px",textAlign:"center"}}>
          <button onClick={()=>setDemoMode(!demoMode)} style={{background:"none",border:"none",color:"#770A1C",fontSize:"11px",fontWeight:700,cursor:"pointer",fontFamily:"'Barlow',sans-serif",letterSpacing:"1px",textTransform:"uppercase",transition:"all .2s",padding:"0"}}>
            {demoMode ? "Hide Demo Access" : "Show Demo Access"}
          </button>
          {demoMode && <>
            <div style={{fontSize:"11px",color:"#7D766A",fontWeight:700,textTransform:"uppercase",letterSpacing:"1px",marginTop:"14px",marginBottom:"12px",fontFamily:"'Barlow',sans-serif"}}>Quick Access (Demo)</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
              {users.filter(u=>u.status==="active").map(u=>{
                const r = rc(u.role);
                return <button key={u.id} onClick={()=>{setLoggedIn(u);setView("dashboard")}}
                  style={{background:"#FFFFFF",border:"1px solid rgba(26,26,26,.08)",borderRadius:"6px",padding:"12px 12px",cursor:"pointer",textAlign:"left",transition:"all .15s",fontFamily:"'Archivo',sans-serif",boxSizing:"border-box"}}
                  onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.06)";e.currentTarget.style.borderColor="rgba(119,10,28,.15)"}}
                  onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.borderColor="rgba(26,26,26,.08)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                    <div style={{width:"28px",height:"28px",borderRadius:"50%",background:"#B08D42",color:"#770A1C",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px",fontWeight:800,flexShrink:0}}>{u.avatar}</div>
                    <div style={{minWidth:0}}>
                      <div style={{fontFamily:"'Barlow',sans-serif",fontSize:"13px",fontWeight:700,color:"#1A1A1A",lineHeight:"1.2"}}>{u.name}</div>
                      <div style={{fontSize:"10px",color:"#7D766A",fontWeight:500}}>{r.i} {r.l}</div>
                    </div>
                  </div>
                </button>;
              })}
            </div>
          </>}
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
    <style>{`@import url('https://fonts.googleapis.com/css2?family=Barlow:wght@600;700;800&family=Archivo:wght@400;500;600&display=swap');*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:#F6F4F0}::-webkit-scrollbar-thumb{background:#D4C49A;border-radius:3px}::-webkit-scrollbar-thumb:hover{background:#B08D42}@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.7}}@media(max-width:768px){.mobile-grid-1{grid-template-columns:1fr!important}.mobile-hide{display:none!important}.mobile-stack{flex-direction:column!important}.mobile-full{width:100%!important;max-width:100%!important}.mobile-small-text{font-size:10px!important}.mobile-pad{padding:10px!important}}@media(max-width:480px){.mobile-xs-hide{display:none!important}}`}</style>

    {/* TOAST */}
    {toast&&<div role="alert" aria-live="assertive" style={{position:"fixed",top:16,right:16,zIndex:2e3,padding:"14px 24px",borderRadius:"6px",fontSize:"13px",fontWeight:600,fontFamily:"Archivo,sans-serif",color:toast.type==="err"?T.err:toast.type==="warn"?T.warn:T.ok,background:toast.type==="err"?T.errBg:toast.type==="warn"?T.warnBg:T.okBg,boxShadow:"0 4px 16px rgba(0,0,0,.08)",animation:"fadeUp .3s ease",borderLeft:`4px solid ${toast.type==="err"?T.err:toast.type==="warn"?T.warn:T.ok}`}}>{toast.msg}</div>}

    {/* ── HEADER ── */}
    <div role="banner" style={{background:"#FFFFFF",borderBottom:"1px solid rgba(26,26,26,.08)",padding:"16px 28px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"12px"}}>
      <div style={{display:"flex",alignItems:"baseline",gap:"6px"}}>
        <span style={{fontFamily:"'Barlow',sans-serif",fontSize:"20px",fontWeight:800,color:"#1A1A1A",letterSpacing:"4px",textTransform:"uppercase"}}>INVOGUE</span>
        <span style={{fontFamily:"'Barlow',sans-serif",fontSize:"12px",fontWeight:700,color:"#770A1C",letterSpacing:"2px",textTransform:"uppercase",marginLeft:"6px"}}>COLLAB HQ</span>
      </div>

      {/* Feature 4: Global Search */}
      <div style={{flex:1,maxWidth:"400px",margin:"0 10px",minWidth:"150px",position:"relative"}}>
        <input type="text" aria-label="Search deals, influencers, and campaigns" value={searchQuery} onChange={e=>{setSearchQuery(e.target.value);if(e.target.value.trim())setSearchResults(performSearch(e.target.value));else setSearchResults(null)}}
          placeholder="Search deals, influencers, campaigns..."
          style={{width:"100%",padding:"10px 16px",borderRadius:"4px",border:"1px solid rgba(26,26,26,.12)",background:"#FFFFFF",color:"#1A1A1A",fontSize:"13px",fontFamily:"'Archivo',sans-serif",outline:"none"}}/>
        {searchResults&&<div style={{position:"absolute",top:"100%",left:0,right:0,background:"#FFFFFF",borderRadius:"4px",border:"1px solid rgba(26,26,26,.12)",marginTop:"4px",maxHeight:"300px",overflowY:"auto",zIndex:100,boxShadow:"0 2px 8px rgba(0,0,0,.06)"}}>
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
          {notificationPanel&&<div style={{position:"absolute",top:"100%",right:0,background:"#FFFFFF",borderRadius:"4px",marginTop:"8px",width:"320px",maxHeight:"400px",overflowY:"auto",zIndex:100,boxShadow:"0 2px 8px rgba(0,0,0,.06)",border:"1px solid rgba(26,26,26,.08)"}}>
            <div style={{padding:"10px 12px",borderBottom:`1px solid rgba(26,26,26,.08)`,fontWeight:700,fontSize:"12px",color:"#1A1A1A"}}>Notifications</div>
            {recentNotifs.length===0?<div style={{padding:"12px",fontSize:"13px",color:"#7D766A",textAlign:"center"}}>No notifications</div>:recentNotifs.map(n=><div key={n.id} style={{padding:"10px 12px",borderBottom:`1px solid rgba(26,26,26,.08)`,fontSize:"12px",color:"#1A1A1A"}}>
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
          <div style={{width:"30px",height:"30px",borderRadius:"50%",background:"#F6DFC1",color:"#770A1C",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"13px",fontWeight:800}}>{loggedIn.avatar}</div>
          <div>
            <div style={{fontSize:"12px",fontFamily:"'Barlow',sans-serif",fontWeight:700,color:"#1A1A1A",lineHeight:1.2}}>{loggedIn.name}</div>
            <div style={{fontSize:"13px",fontFamily:"'Archivo',sans-serif",color:"#7D766A",fontWeight:400}}>{loggedRC.i} {loggedRC.l}</div>
          </div>
        </div>
        <button aria-label="Sign out" onClick={handleLogout} style={{background:"none",border:"none",color:"#7D766A",fontSize:"11px",padding:"5px 10px",cursor:"pointer",fontFamily:"'Archivo',sans-serif",fontWeight:400}}>Sign Out</button>
        <button onClick={resetData} title="Reset to sample data" style={{background:"none",border:"none",color:"#B5AFA4",fontSize:"10px",padding:"3px 6px",cursor:"pointer",fontFamily:"'Archivo',sans-serif",fontWeight:400}}>Reset</button>
      </div>
    </div>

    {/* ── ROLE-AWARE NAV ── */}
    {(()=>{
      const recentNotifs = getRecentNotifications();
      const unreads = recentNotifs.filter(n => new Date(n.time) > new Date(lastSeenTime)).length;

      const navItems = {
        admin: [{k:"dashboard",l:"Admin Dashboard",i:"⚙️"},{k:"analytics",l:"Analytics",i:"📊"},{k:"users",l:"Team & Users",i:"👥"},{k:"influencers",l:"Influencer DB",i:"⭐"},{k:"deals",l:"All Collabs",i:"📋"},{k:"campaigns",l:"Campaigns",i:"🎯"},{k:"deliverables",l:"Deliverables",i:"📦",n:stats.pendingDels},{k:"shipments",l:"Shipments",i:"🚚",n:stats.pendingShip+inTransit.length},{k:"audit",l:"Audit Log",i:"📜"}],
        negotiator: [{k:"dashboard",l:"My Dashboard",i:"👥"},{k:"influencers",l:"Influencer DB",i:"⭐"},{k:"deals",l:"All Collabs",i:"📋"},{k:"dropped",l:"Dropped Collabs",i:"🚫",n:stats.dropped},{k:"deliverables",l:"Deliverables",i:"📦",n:stats.pendingDels}],
        approver: [{k:"dashboard",l:"Command Center",i:"🔵"},{k:"analytics",l:"Analytics",i:"📊"},{k:"influencers",l:"Influencer DB",i:"⭐"},{k:"deals",l:"All Collabs",i:"📋"},{k:"campaigns",l:"Campaigns",i:"🎯"},{k:"deliverables",l:"Deliverables",i:"📦",n:stats.awaitingReview||stats.pendingDels},{k:"shipments",l:"Shipments",i:"🚚",n:stats.pendingShip+inTransit.length}],
        finance: [{k:"dashboard",l:"Payment Center",i:"🔵"},{k:"analytics",l:"Analytics",i:"📊"}],
        logistics: [{k:"dashboard",l:"Shipment Center",i:"🔵"},{k:"shipments",l:"All Shipments",i:"🚚",n:stats.pendingShip+inTransit.length+stats.pickupRequests+stats.reshipPending}],
      };
      const items = navItems[role]||navItems.negotiator;
      return <div role="navigation" aria-label="Main navigation" style={{background:"#FFFFFF",borderBottom:"1px solid rgba(26,26,26,.08)",padding:"0 28px",display:"flex",gap:"8px",overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
        {items.map(n=>(
          <button key={n.k} onClick={()=>setView(n.k)} style={{padding:"14px 8px",border:"none",borderBottom:view===n.k?"2px solid #770A1C":"2px solid transparent",background:"transparent",color:view===n.k?"#770A1C":"#7D766A",fontWeight:view===n.k?700:600,fontSize:"13px",cursor:"pointer",fontFamily:"'Barlow',sans-serif",display:"flex",alignItems:"center",gap:"5px",letterSpacing:"0.8px",textTransform:"uppercase",transition:"all .2s"}}>
            {n.i} {n.l}
            {n.n>0&&<span style={{background:"#770A1C",color:"#FFFFFF",borderRadius:"50%",width:"16px",height:"16px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"8px",fontWeight:800,lineHeight:"16px"}}>{n.n}</span>}
          </button>
        ))}
      </div>;
    })()}

    <div style={{padding:"20px 28px",maxWidth:"1320px",margin:"0 auto"}}>

      {/* ═══════════════════════════════════════════════════════
          ADMIN DASHBOARD — Super access, full control
         ═══════════════════════════════════════════════════════ */}
      {view==="dashboard"&&role==="admin"&&(()=>{
        const pendingApproval = deals.filter(d=>d.status==="pending");
        const disputed = deals.filter(d=>d.status==="disputed");
        const needPayment = deals.filter(d=>!["rejected","pending","renegotiate","paid"].includes(d.status)&&remaining(d)>0);
        const overdueDels = pendingDels.filter(d=>new Date(d.deadline)<new Date());
        const totalOutstanding = deals.filter(d=>!["rejected","pending","renegotiate","paid"].includes(d.status)).reduce((s,d)=>s+remaining(d),0);
        const activeUsers = users.filter(u=>u.status==="active");
        const byCreator = {};
        deals.forEach(d=>{ byCreator[d.by] = (byCreator[d.by]||0)+1; });

        return <>
          {/* Admin header band */}
          <div style={{background:T.brand,borderRadius:"6px",padding:"16px 20px",marginBottom:"16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:"20px",fontWeight:800,color:"#F6DFC1",fontFamily:"Barlow,sans-serif",textTransform:"uppercase",letterSpacing:"1.5px"}}>⚙️ Admin Control Panel</div>
              <div style={{fontSize:"13px",color:"rgba(246,223,193,.6)",marginTop:"2px"}}>Super access — all roles, all data, all controls</div>
            </div>
            <div style={{display:"flex",gap:"6px"}}>
              <Btn v="gold" sm onClick={()=>setView("users")}>Manage Team</Btn>
              <Btn v="outline" sm sx={{borderColor:"rgba(246,223,193,.3)",color:"#F6DFC1"}} onClick={()=>setView("audit")}>Audit Logs</Btn>
            </div>
          </div>

          {/* Key Metrics */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:"8px",marginBottom:"16px"}}>
            <StatBox l="Total Committed" v={f(stats.committed)} c={T.gold}/>
            <StatBox l="Total Paid" v={f(stats.paid)} c={T.ok}/>
            <StatBox l="Outstanding" v={f(totalOutstanding)} c={T.err}/>
            <StatBox l="Pending Approval" v={stats.pendingN} c={stats.pendingN>0?T.warn:T.ok}/>
            <StatBox l="Active Disputes" v={stats.disputed} c={stats.disputed>0?T.err:T.ok}/>
            <StatBox l="Active Team" v={activeUsers.length} c={T.info} sub={`${users.length} total`}/>
            <StatBox l="Total Deals" v={deals.length} c={T.brand}/>
            <StatBox l="Total Pipeline" v={f(stats.pipeline)} c={T.brand} sub="All deals"/>
            <StatBox l="Pending Shipments" v={stats.pendingShip} c={stats.pendingShip>0?T.purple:T.ok}/>
          </div>

          {/* APPROVAL QUEUE — Admin can approve */}
          {pendingApproval.length>0&&<Section title={`Approval Queue (${pendingApproval.length})`} icon="⚡" action={<span style={{fontSize:"11px",color:T.err,fontWeight:700,animation:"pulse 1.5s infinite"}}>Action Required</span>}>
            {pendingApproval.map(d=><div key={d.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${T.warn}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"6px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700,fontSize:"14px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400,fontSize:"13px"}}>· {d.platform} · {d.followers}</span></div>
                <div style={{fontSize:"11px",color:T.sub}}>{d.product} · {d.dels.length} deliverables · by {d.by} · {getCamp(d.cid)?.name||""}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                <span style={{fontWeight:800,fontSize:"14px",color:T.gold}}>{f(d.amount)}</span>
                <Btn v="ok" sm onClick={()=>setConfirmAction({title:"Approve Deal",msg:"Approve and lock "+f(d.amount)+" for "+d.inf+"?",onConfirm:()=>{approveDeal(d);setConfirmAction(null)}})}>✓</Btn>
                <Btn v="outline" sm onClick={()=>setConfirmAction({title:"Request Renegotiation",msg:"Renegotiate "+d.inf+" deal?",onConfirm:()=>{renegDeal(d);setConfirmAction(null)}})}>↩</Btn>
                <Btn v="danger" sm onClick={()=>openRejectModal(d)}>✕</Btn>
              </div>
            </div>)}
          </Section>}

          {/* DISPUTES */}
          {disputed.length>0&&<Section title={`Disputes (${disputed.length})`} icon="⚠">
            {disputed.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.errBg,border:`1px solid ${T.err}33`,borderRadius:"7px",padding:"10px 12px",marginBottom:"5px",cursor:"pointer"}}>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontWeight:700}}>{d.inf}</span><span style={{fontSize:"13px",color:T.err,fontWeight:700}}>Invoice: {f(d.inv?.amount)} vs Approved: {f(d.amount)}</span></div>
              <div style={{fontSize:"11px",color:T.sub,marginTop:"2px"}}>{d.inv?.note||""} — by {d.by}</div>
            </div>)}
          </Section>}

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
            {/* PAYMENTS DUE */}
            <Section title={`Payments Due (${needPayment.length})`} icon="💰" action={<span style={{fontSize:"11px",color:T.sub}}>{f(totalOutstanding)} total</span>}>
              {needPayment.length===0&&<div style={{fontSize:"13px",color:T.sub,padding:"8px 0"}}>All clear</div>}
              {needPayment.slice(0,6).map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"6px",padding:"7px 10px",marginBottom:"3px",fontSize:"13px",display:"flex",justifyContent:"space-between",cursor:"pointer"}}>
                <span><b>{d.inf}</b></span>
                <span><span style={{color:T.ok}}>{f(totalPaid(d))}</span>/<b>{f(d.amount)}</b> <span style={{color:T.warn,fontWeight:700}}>Due {f(remaining(d))}</span></span>
              </div>)}
            </Section>

            {/* SHIPMENTS */}
            <Section title={`Shipments`} icon="📦" action={<Btn v="ghost" sm onClick={()=>setView("shipments")}>View all →</Btn>}>
              {pendingShip.length===0&&inTransit.length===0&&<div style={{fontSize:"13px",color:T.sub,padding:"8px 0"}}>All shipped & delivered</div>}
              {pendingShip.map(d=><div key={d.id} style={{background:T.warnBg,border:`1px solid ${T.border}`,borderRadius:"6px",padding:"6px 10px",marginBottom:"3px",fontSize:"13px",display:"flex",justifyContent:"space-between"}}>
                <span><b>{d.inf}</b> · {d.product}</span><span style={{color:T.warn,fontWeight:700}}>Awaiting dispatch</span>
              </div>)}
              {inTransit.map(d=><div key={d.id} style={{background:T.purpleBg,border:`1px solid ${T.border}`,borderRadius:"6px",padding:"6px 10px",marginBottom:"3px",fontSize:"13px",display:"flex",justifyContent:"space-between"}}>
                <span><b>{d.inf}</b> · {d.ship.carrier}: {d.ship.track}</span><span style={{color:T.purple,fontWeight:700}}>In transit</span>
              </div>)}
            </Section>
          </div>

          {/* TEAM PERFORMANCE */}
          <Section title="👥 Team Performance" icon="" action={<Btn v="ghost" sm onClick={()=>setView("users")}>Manage →</Btn>}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:"8px"}}>
              {activeUsers.map(u=>{
                const uDeals = deals.filter(d=>d.by===u.name||d.by===u.name.split(" ")[0]);
                const uPending = uDeals.filter(d=>d.status==="pending"||d.status==="renegotiate").length;
                const uDisputed = uDeals.filter(d=>d.status==="disputed").length;
                const rc = ROLE_CFG[u.role]||ROLE_CFG.viewer;
                return <div key={u.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"8px",padding:"11px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"7px"}}>
                      <div style={{width:"28px",height:"28px",borderRadius:"50%",background:rc.bg,color:rc.c,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px",fontWeight:800}}>{u.avatar}</div>
                      <div><div style={{fontWeight:700,fontSize:"12px"}}>{u.name}</div><div style={{fontSize:"11px",color:T.sub}}>{u.email}</div></div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:"4px",alignItems:"center"}}>
                    <span style={{padding:"2px 6px",borderRadius:"8px",fontSize:"10px",fontWeight:700,color:rc.c,background:rc.bg}}>{rc.i} {rc.l}</span>
                    <span style={{fontSize:"11px",color:T.sub}}>{uDeals.length} deals</span>
                    {uDisputed>0&&<span style={{fontSize:"11px",color:T.err,fontWeight:700}}>{uDisputed} disputes</span>}
                  </div>
                </div>;
              })}
            </div>
          </Section>

          {/* OVERDUE DELIVERABLES */}
          {overdueDels.length>0&&<Section title={`Overdue Deliverables (${overdueDels.length})`} icon="🚨">
            {overdueDels.map((d,i)=><div key={i} style={{background:T.errBg,border:`1px solid ${T.err}22`,borderRadius:"6px",padding:"7px 10px",marginBottom:"3px",fontSize:"13px",display:"flex",justifyContent:"space-between"}}>
              <span><b>{d.inf}</b> · {d.type}: {d.desc||"—"}</span><span style={{color:T.err,fontWeight:700}}>Due: {d.deadline}</span>
            </div>)}
          </Section>}

          {/* CAMPAIGN BUDGETS */}
          <Section title="🎯 Campaign Budgets" icon="" action={<Btn v="gold" sm onClick={()=>{setNCamp({name:"",budget:"",target:"",deadline:""});setModal("newCamp")}}>+ New Campaign</Btn>}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:"8px"}}>
              {campaigns.map(c=>{const comm=campCommitted(c.id),pct=c.budget>0?Math.round(comm/c.budget*100):0;return <div key={c.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"7px",padding:"11px"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:"5px"}}><span style={{fontWeight:700,fontSize:"12px"}}>{c.name}</span><span style={{fontSize:"11px",fontWeight:700,color:pct>90?T.err:T.ok}}>{pct}%</span></div>
                <div style={{height:"4px",borderRadius:"3px",background:T.border,overflow:"hidden",marginBottom:"5px"}}><div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:pct>90?T.err:pct>70?T.warn:T.ok,borderRadius:"3px"}}/></div>
                <div style={{fontSize:"11px",color:T.sub}}>{f(comm)} / {f(c.budget)} · {campLocked(c.id)}/{c.target} influencers</div>
              </div>;})}
            </div>
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
          if(users.some(u=>u.email===userF.email)) { notify("Email already exists","err"); return; }
          const initials = userF.name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
          const newId = uid();
          // TODO: Hash PIN before storing: const hashedPin = await hashPin('1111');
          supabase.from('users').insert({id:newId,name:userF.name,email:userF.email,role:userF.role,status:'active',avatar:initials,pin:'1111'}).then(({error})=>{if(error){console.error("User insert failed:",error);notify("Failed to create user: "+error.message,"err");}});
          setUsers(prev=>[...prev,{id:newId,name:userF.name,email:userF.email,role:userF.role,status:"active",created:new Date().toISOString().slice(0,10),avatar:initials,pin:"1111"}]);
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

        return <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
            <div>
              <div style={{fontSize:"20px",fontWeight:800}}>👥 Team & User Management</div>
              <div style={{fontSize:"13px",color:T.sub}}>Create users, assign roles, manage access</div>
            </div>
            <Btn v="gold" onClick={()=>{setUserF({name:"",email:"",role:"negotiator"});setModal("newUser")}}>+ Add Team Member</Btn>
          </div>

          {/* Role summary */}
          <div style={{display:"flex",gap:"8px",marginBottom:"16px",flexWrap:"wrap"}}>
            {Object.entries(ROLE_CFG).map(([k,v])=>{
              const count = users.filter(u=>u.role===k&&u.status==="active").length;
              if(k==="admin"||k==="viewer") return null;
              return <div key={k} style={{background:v.bg,border:`1px solid ${v.c}22`,borderRadius:"8px",padding:"10px 16px",display:"flex",alignItems:"center",gap:"8px"}}>
                <span style={{fontSize:"18px"}}>{v.i}</span>
                <div><div style={{fontSize:"20px",fontWeight:800,color:v.c}}>{count}</div><div style={{fontSize:"10px",fontWeight:700,color:v.c,textTransform:"uppercase"}}>{v.l}{(v.l.endsWith("s")||v.l==="Finance")?"":"s"}</div></div>
              </div>;
            })}
          </div>

          {/* Users table */}
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"9px",overflow:"hidden"}}>
            <div style={{display:"grid",gridTemplateColumns:"40px 1.5fr 1.5fr 1fr 0.8fr 1.2fr",padding:"10px 14px",background:T.brand,fontSize:"10px",fontWeight:800,color:"#F6DFC1",textTransform:"uppercase",fontFamily:"Barlow,sans-serif",letterSpacing:".5px"}}>
              <div></div><div>Name</div><div>Email</div><div>Role</div><div>Status</div><div>Actions</div>
            </div>
            {users.map(u=>{
              const rc = ROLE_CFG[u.role]||ROLE_CFG.viewer;
              return <div key={u.id} style={{display:"grid",gridTemplateColumns:"40px 1.5fr 1.5fr 1fr 0.8fr 1.2fr",padding:"10px 14px",borderBottom:`1px solid ${T.border}`,fontSize:"13px",alignItems:"center",opacity:u.status==="inactive"?.5:1}}>
                <div style={{width:"28px",height:"28px",borderRadius:"50%",background:rc.bg,color:rc.c,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px",fontWeight:800}}>{u.avatar}</div>
                <div style={{fontWeight:700}}>{u.name}</div>
                <div style={{color:T.sub,fontSize:"13px"}}>{u.email}</div>
                <div>
                  <select value={u.role} onChange={e=>changeUserRole(u.id,e.target.value)} style={{padding:"3px 6px",borderRadius:"4px",border:`1px solid ${T.border}`,fontSize:"11px",fontWeight:700,color:rc.c,background:rc.bg,fontFamily:"inherit",cursor:"pointer"}}>
                    <option value="admin">Admin</option>
                    <option value="negotiator">Negotiator</option>
                    <option value="approver">Manager</option>
                    <option value="finance">Finance</option>
                    <option value="logistics">Logistics</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
                <div>
                  <span style={{padding:"2px 7px",borderRadius:"8px",fontSize:"11px",fontWeight:700,color:u.status==="active"?T.ok:T.err,background:u.status==="active"?T.okBg:T.errBg}}>{u.status==="active"?"Active":"Inactive"}</span>
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
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"9px",overflow:"hidden"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr 1fr 1fr",padding:"8px 12px",background:T.brand,fontSize:"10px",fontWeight:800,color:"#F6DFC1",textTransform:"uppercase",fontFamily:"Barlow,sans-serif",letterSpacing:".4px"}}>
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
            <div style={{fontSize:"20px",fontWeight:800}}>📜 Global Audit Log</div>
            <div style={{fontSize:"13px",color:T.sub}}>Complete activity trail across all deals and users — {allLogs.length} entries</div>
          </div>
          <div style={{display:"flex",gap:"8px",marginBottom:"12px",alignItems:"center",flexWrap:"wrap"}}>
            <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub}}>From</label><input type="date" value={auditDateFrom} onChange={e=>{setAuditDateFrom(e.target.value);setAuditPage(0)}} style={{padding:"5px 8px",border:`1px solid ${T.border}`,borderRadius:"5px",fontSize:"13px",fontFamily:"inherit",background:T.surface,color:T.text}}/></div>
            <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub}}>To</label><input type="date" value={auditDateTo} onChange={e=>{setAuditDateTo(e.target.value);setAuditPage(0)}} style={{padding:"5px 8px",border:`1px solid ${T.border}`,borderRadius:"5px",fontSize:"13px",fontFamily:"inherit",background:T.surface,color:T.text}}/></div>
            {(auditDateFrom||auditDateTo)&&<Btn v="ghost" sm onClick={()=>{setAuditDateFrom("");setAuditDateTo("");setAuditPage(0)}}>Clear filters</Btn>}
            <span style={{fontSize:"11px",color:T.sub,marginLeft:"auto"}}>{allLogs.length} total entries</span>
          </div>
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"9px",overflow:"hidden"}}>
            <div style={{display:"grid",gridTemplateColumns:"1.2fr 1fr 1.5fr 2fr 0.8fr",padding:"9px 14px",background:T.brand,fontSize:"10px",fontWeight:800,color:"#F6DFC1",textTransform:"uppercase",fontFamily:"Barlow,sans-serif",letterSpacing:".5px"}}>
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
          (d.status==="approved") || // needs email sent
          (d.status==="email_sent"&&!d.ship) || // waiting for logistics
          (["shipped","delivered_prod","email_sent","partial_live"].includes(d.status)&&d.dels.some(dl=>dl.st==="pending")) || // deliverables to mark
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
            <Btn v="gold" sm onClick={()=>{setNDeal({inf:"",platform:"Instagram",followers:"",product:"",amount:"",usage:"6 months",deadline:"",profile:"",phone:"",address:"",cid:campaigns[0]?.id||"c1",dels:[{id:uid(),type:"Reel",desc:"",st:"pending",link:""}]});setModal("newDeal")}}>+ New Deal</Btn>
          </div>
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
              else if(d.status==="approved") { actionLabel="Send Confirmation Email"; actionColor=T.info; }
              else if(["shipped","delivered_prod","email_sent","partial_live"].includes(d.status)&&d.dels.some(dl=>dl.st==="pending")) { actionLabel=`${d.dels.filter(dl=>dl.st==="pending").length} deliverables to mark live`; actionColor=T.purple; }
              else if(["live","partial_live"].includes(d.status)&&!d.inv) { actionLabel="Submit Invoice"; actionColor=T.gold; }
              else if(d.status==="payment_requested") { actionLabel="Payment Requested - with Manager"; actionColor=T.info; }
              else { actionLabel="Review needed"; }
              return <div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${actionColor}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"6px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"all .12s"}}
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
            {myRevisions.map(d=>d.dels.filter(dl=>dl.st==="revision_requested").map((dl,di)=><div key={d.id+"-"+di} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.errBg,border:`1px solid ${T.err}22`,borderLeft:`3px solid ${T.err}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"6px",cursor:"pointer"}}
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
            {myPending.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"5px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><span style={{fontWeight:700,fontSize:"12px"}}>{d.inf}</span> <span style={{color:T.sub,fontSize:"13px"}}>· {f(d.amount)} · {d.dels.length} deliverables</span></div>
              <Badge s={d.status} sm/>
            </div>)}
          </Section>}

          {/* Renegotiation Requests */}
          {myRenegotiations.length>0&&<Section title={`Renegotiation Requests (${myRenegotiations.length})`} icon="🔄">
            {myRenegotiations.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.warnBg,border:`1px solid ${T.warnBg}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"5px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><span style={{fontWeight:700,fontSize:"12px"}}>{d.inf}</span> <span style={{color:T.sub,fontSize:"13px"}}>· {f(d.amount)} · {d.dels.length} deliverables</span></div>
              <Badge s={d.status} sm/>
            </div>)}
          </Section>}

          {/* Shipment Tracking */}
          <Section title="📦 My Shipment Tracker" icon="">
            {myDeals.filter(d=>d.ship&&d.ship.st==="in_transit").length===0&&myDeals.filter(d=>["approved","email_sent"].includes(d.status)&&!d.ship).length===0&&<div style={{fontSize:"13px",color:T.sub,padding:"8px 0"}}>No active shipments</div>}
            {myDeals.filter(d=>["approved","email_sent"].includes(d.status)&&!d.ship).map(d=><div key={d.id} style={{background:T.warnBg,border:`1px solid ${T.border}`,borderRadius:"6px",padding:"8px 10px",marginBottom:"4px",fontSize:"13px",display:"flex",justifyContent:"space-between"}}>
              <span><b>{d.inf}</b> · {d.product}</span><span style={{color:T.warn,fontWeight:700}}>Awaiting dispatch</span>
            </div>)}
            {myDeals.filter(d=>d.ship?.st==="in_transit").map(d=><div key={d.id} style={{background:T.purpleBg,border:`1px solid ${T.border}`,borderRadius:"6px",padding:"8px 10px",marginBottom:"4px",fontSize:"13px",display:"flex",justifyContent:"space-between"}}>
              <span><b>{d.inf}</b> · {d.ship.carrier}: <span style={{color:T.info,fontWeight:700}}>{d.ship.track}</span></span><span style={{color:T.purple,fontWeight:700}}>In transit</span>
            </div>)}
          </Section>

          {/* All Active */}
          <Section title={`All Active Collabs (${myActive.length})`} icon="👥" action={<Btn v="ghost" sm onClick={()=>setView("deals")}>View all →</Btn>}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:"8px"}}>
              {myActive.slice(0,6).map(d=>{
                const done=d.dels.filter(x=>x.st==="live").length;
                return <div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"8px",padding:"11px",cursor:"pointer",transition:"all .12s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=T.gold}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}><span style={{fontWeight:700,fontSize:"12px"}}>{d.inf}</span><Badge s={d.status} sm/></div>
                  <div style={{fontSize:"11px",color:T.sub,marginBottom:"5px"}}>{d.product} · {getCamp(d.cid)?.name||""}</div>
                  <div style={{display:"flex",gap:"2px",marginBottom:"4px"}}>{d.dels.map((dl,i)=><div key={i} style={{flex:1,height:"3px",borderRadius:"2px",background:dl.st==="live"?T.ok:T.border}}/>)}</div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:"11px"}}><span style={{fontWeight:800,color:T.gold}}>{f(d.amount)}</span><span style={{color:T.sub}}>{done}/{d.dels.length} content</span></div>
                </div>;
              })}
            </div>
          </Section>
        </>;
      })()}

      {/* ═══════════════════════════════════════════════════════
          MANAGER / APPROVER DASHBOARD — Bird's Eye View
         ═══════════════════════════════════════════════════════ */}
      {view==="dashboard"&&role==="approver"&&(()=>{
        const pendingApproval = deals.filter(d=>d.status==="pending");
        const disputed = deals.filter(d=>d.status==="disputed");
        const needPayment = deals.filter(d=>!["rejected","pending","renegotiate","paid"].includes(d.status)&&remaining(d)>0);
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
            {pendingApproval.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${T.warn}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"6px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"all .12s"}}
              onMouseEnter={e=>e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.06)"}
              onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
              <div>
                <div style={{fontWeight:700,fontSize:"14px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400,fontSize:"13px"}}>· {d.platform} · {d.followers}</span></div>
                <div style={{fontSize:"11px",color:T.sub}}>{d.product} · {d.dels.length} deliverables · by {d.by} · {getCamp(d.cid)?.name||""}</div>
                <div style={{display:"flex",gap:"3px",marginTop:"4px"}}>{d.dels.map((dl,i)=><span key={i} style={{padding:"1px 5px",borderRadius:"4px",fontSize:"10px",fontWeight:600,background:T.warnBg,color:T.warn}}>{dl.type}</span>)}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:"6px"}} onClick={e=>e.stopPropagation()}>
                <span style={{fontWeight:800,fontSize:"14px",color:T.gold}}>{f(d.amount)}</span>
                <Btn v="ok" sm onClick={()=>setConfirmAction({title:"Approve Deal",msg:"Approve and lock "+f(d.amount)+" for "+d.inf+"?",onConfirm:()=>{approveDeal(d);setConfirmAction(null)}})}>✓</Btn>
                <Btn v="outline" sm onClick={()=>setConfirmAction({title:"Request Renegotiation",msg:"Renegotiate "+d.inf+" deal?",onConfirm:()=>{renegDeal(d);setConfirmAction(null)}})}>↩</Btn>
                <Btn v="danger" sm onClick={()=>openRejectModal(d)}>✕</Btn>
              </div>
            </div>)}
          </Section>}

          {/* CONTENT AWAITING REVIEW */}
          {awaitingReview.length>0&&<Section title={`Content Awaiting Review (${awaitingReview.length})`} icon="📤" action={<span style={{fontSize:"11px",color:T.info,fontWeight:700}}>Review Required</span>}>
            {awaitingReview.map((d,i)=>{const deal=deals.find(x=>x.id===d.dealId);return <div key={i} onClick={()=>{if(deal){setSel(deal);setModal("detail")}}} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${T.info}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"6px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
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
            {disputed.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.errBg,border:`1px solid ${T.err}33`,borderRadius:"7px",padding:"10px 12px",marginBottom:"5px",cursor:"pointer"}}>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontWeight:700,fontSize:"12px"}}>{d.inf}</span><span style={{fontSize:"13px",color:T.err,fontWeight:700}}>Invoice: {f(d.inv?.amount)} vs Approved: {f(d.amount)}</span></div>
              <div style={{fontSize:"11px",color:T.sub,marginTop:"2px"}}>{d.inv?.note||"Mismatch detected"}</div>
            </div>)}
          </Section>}

          {/* PAYMENT REQUESTS */}
          {(()=>{
            const payReqs = deals.filter(d=>d.status==="payment_requested");
            return payReqs.length>0 && <Section title={`Payment Requests (${payReqs.length})`} icon="💸" action={<span style={{fontSize:"11px",color:T.warn,fontWeight:700}}>Review Required</span>}>
              {payReqs.map(d=><div key={d.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${T.info}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"6px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:"14px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400,fontSize:"13px"}}>· {f(d.amount)}</span></div>
                  <div style={{fontSize:"11px",color:T.sub}}>{d.product} · PAN: {d.pan?.number||"N/A"}</div>
                </div>
                <div style={{display:"flex",gap:"5px"}}>
                  <Btn v="ok" sm onClick={()=>setConfirmAction({title:"Approve Payment",msg:`Approve payment request of ${f(d.amount)} for ${d.inf}? This will forward to finance.`,onConfirm:()=>{approvePaymentRequest(d);setConfirmAction(null)}})}>✅ Approve</Btn>
                  <Btn v="danger" sm onClick={()=>setConfirmAction({title:"Deny Payment",msg:`Deny payment request for ${d.inf}?`,onConfirm:()=>{denyPaymentRequest(d);setConfirmAction(null)}})}>❌ Deny</Btn>
                </div>
              </div>)}
            </Section>;
          })()}

          {/* PENDING SHIPMENTS */}
          {pendingShip.length>0&&<Section title={`Pending Shipments (${pendingShip.length})`} icon="📦">
            {pendingShip.map(d=><div key={d.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"6px",padding:"8px 10px",marginBottom:"4px",fontSize:"13px",display:"flex",justifyContent:"space-between"}}>
              <span><b>{d.inf}</b> · {d.product}</span><span style={{color:T.warn,fontWeight:700}}>Awaiting logistics</span>
            </div>)}
          </Section>}

          {/* PAYMENT OVERVIEW */}
          {needPayment.length>0&&<Section title={`Outstanding Payments (${needPayment.length})`} icon="💰" action={<span style={{fontSize:"11px",color:T.sub}}>{f(needPayment.reduce((s,d)=>s+remaining(d),0))} total outstanding</span>}>
            {needPayment.slice(0,8).map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"6px",padding:"8px 10px",marginBottom:"4px",fontSize:"13px",display:"flex",justifyContent:"space-between",cursor:"pointer"}}>
              <div><b>{d.inf}</b> <span style={{color:T.sub}}>· {getCamp(d.cid)?.name||""}</span></div>
              <div><span style={{color:T.ok}}>{f(totalPaid(d))}</span> / <b>{f(d.amount)}</b> <span style={{color:T.warn,fontWeight:700,marginLeft:"4px"}}>Due: {f(remaining(d))}</span></div>
            </div>)}
          </Section>}

          {/* OVERDUE DELIVERABLES */}
          {overdueDels.length>0&&<Section title={`Overdue Deliverables (${overdueDels.length})`} icon="🚨">
            {overdueDels.map((d,i)=><div key={i} style={{background:T.errBg,border:`1px solid ${T.err}22`,borderRadius:"6px",padding:"7px 10px",marginBottom:"3px",fontSize:"13px",display:"flex",justifyContent:"space-between"}}>
              <span><b>{d.inf}</b> · {d.type}: {d.desc||"—"}</span><span style={{color:T.err,fontWeight:700}}>Due: {d.deadline}</span>
            </div>)}
          </Section>}

          {/* CAMPAIGNS SUMMARY */}
          <Section title="🎯 Campaign Overview" icon="" action={<Btn v="ghost" sm onClick={()=>setView("campaigns")}>Manage →</Btn>}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:"8px"}}>
              {campaigns.map(c=>{const comm=campCommitted(c.id),pct=c.budget>0?Math.round(comm/c.budget*100):0;return <div key={c.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"7px",padding:"11px"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:"5px"}}><span style={{fontWeight:700,fontSize:"12px"}}>{c.name}</span><span style={{fontSize:"11px",fontWeight:700,color:pct>90?T.err:T.ok}}>{pct}%</span></div>
                <div style={{height:"4px",borderRadius:"3px",background:T.border,overflow:"hidden",marginBottom:"5px"}}><div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:pct>90?T.err:pct>70?T.warn:T.ok,borderRadius:"3px"}}/></div>
                <div style={{fontSize:"11px",color:T.sub}}>{f(comm)} / {f(c.budget)} · {campLocked(c.id)}/{c.target} influencers</div>
              </div>;})}
            </div>
          </Section>
        </>;
      })()}

      {/* ═══════════════════════════════════════════════════════
          FINANCE DASHBOARD — Payment Center
         ═══════════════════════════════════════════════════════ */}
      {view==="dashboard"&&role==="finance"&&(()=>{
        const pendingPayments = deals.filter(d=>["payment_approved","invoice_ok","partial_paid"].includes(d.status)&&remaining(d)>0);
        const disputed = deals.filter(d=>d.status==="disputed");
        const advanceDue = deals.filter(d=>["approved","email_sent","shipped","delivered_prod"].includes(d.status)&&totalPaid(d)===0);
        const recentPaid = deals.filter(d=>d.status==="paid").slice(0,5);
        const totalOutstanding = deals.filter(d=>!["rejected","pending","renegotiate","paid"].includes(d.status)).reduce((s,d)=>s+remaining(d),0);
        return <>
          <div style={{marginBottom:"14px"}}><span style={{fontSize:"20px",fontWeight:800}}>💰 Payment Center</span><span style={{fontSize:"13px",color:T.sub,marginLeft:"8px"}}>All payment operations</span></div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:"8px",marginBottom:"16px"}}>
            <StatBox l="Total Outstanding" v={f(totalOutstanding)} c={T.err} sub="Across all deals"/>
            <StatBox l="Ready to Pay" v={pendingPayments.length} c={pendingPayments.length>0?T.warn:T.ok} sub="Invoice matched"/>
            <StatBox l="Disputes" v={disputed.length} c={disputed.length>0?T.err:T.ok} sub="Need resolution"/>
            <StatBox l="Advances Due" v={advanceDue.length} c={advanceDue.length>0?T.info:T.ok} sub="No payment yet"/>
            <StatBox l="Total Paid" v={f(stats.paid)} c={T.ok} sub="This period"/>
          </div>

          {/* DISPUTES — TOP PRIORITY */}
          {disputed.length>0&&<Section title={`⚠ Disputes — Resolve First (${disputed.length})`} icon="" action={<span style={{fontSize:"11px",color:T.err,fontWeight:700,animation:"pulse 1.5s infinite"}}>Urgent</span>}>
            {disputed.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.errBg,border:`1px solid ${T.err}33`,borderLeft:`3px solid ${T.err}`,borderRadius:"7px",padding:"11px 13px",marginBottom:"6px",cursor:"pointer"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:"14px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400}}>· {d.platform}</span></div>
                  <div style={{fontSize:"11px",color:T.sub,marginTop:"1px"}}>{d.product} · {getCamp(d.cid)?.name||""}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:"11px",color:T.err,fontWeight:700}}>Invoice: {f(d.inv?.amount)}</div>
                  <div style={{fontSize:"11px",color:T.ok,fontWeight:700}}>Approved: {f(d.amount)}</div>
                  <div style={{fontSize:"11px",color:T.err}}>Δ {f(Math.abs((d.inv?.amount||0)-d.amount))}</div>
                </div>
              </div>
              {d.inv?.note&&<div style={{fontSize:"11px",color:T.err,marginTop:"4px",fontStyle:"italic"}}>{d.inv.note}</div>}
            </div>)}
          </Section>}

          {/* READY TO PAY — Invoice Matched */}
          <Section title={`Ready to Pay (${pendingPayments.length})`} icon="💳" action={<span style={{fontSize:"11px",color:T.sub}}>{f(pendingPayments.reduce((s,d)=>s+remaining(d),0))} total</span>}>
            {pendingPayments.length===0&&<div style={{fontSize:"13px",color:T.sub,padding:"8px 0"}}>No invoices pending payment</div>}
            {pendingPayments.map(d=>{
              const paid=totalPaid(d),rem=remaining(d);
              return <div key={d.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"5px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:"12px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400,fontSize:"13px"}}>· {getCamp(d.cid)?.name||""}</span></div>
                  <div style={{fontSize:"11px",color:T.sub}}>Locked: {f(d.amount)} · Paid: {f(paid)} · <b style={{color:T.warn}}>Due: {f(rem)}</b></div>
                  {paid>0&&<div style={{height:"3px",borderRadius:"2px",background:T.border,marginTop:"4px",width:"120px"}}><div style={{height:"100%",width:`${(paid/d.amount)*100}%`,background:T.ok,borderRadius:"2px"}}/></div>}
                </div>
                <Btn v="ok" sm onClick={()=>{setSel(d);setPayF({type:paid===0?"advance":"final",amount:String(rem),note:""});setModal("payment")}}>Pay {f(rem)}</Btn>
              </div>;
            })}
          </Section>

          {/* ADVANCES DUE */}
          {advanceDue.length>0&&<Section title={`Advance Payments Pending (${advanceDue.length})`} icon="⏰">
            {advanceDue.map(d=><div key={d.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"6px",padding:"8px 10px",marginBottom:"4px",fontSize:"13px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><b>{d.inf}</b> <span style={{color:T.sub}}>· {f(d.amount)} · {d.status==="approved"?"Just approved":d.status==="shipped"?"Product shipped":"In progress"}</span></div>
              <Btn v="outline" sm onClick={()=>{setSel(d);setPayF({type:"advance",amount:"",note:""});setModal("payment")}}>Record Advance</Btn>
            </div>)}
          </Section>}

          {/* RECENT PAYMENTS */}
          <Section title="Recently Completed" icon="✅">
            {recentPaid.length===0&&<div style={{fontSize:"13px",color:T.sub,padding:"8px 0"}}>No completed payments yet</div>}
            {recentPaid.map(d=><div key={d.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"6px",padding:"8px 10px",marginBottom:"3px",fontSize:"13px",display:"flex",justifyContent:"space-between",opacity:.7}}>
              <span><b>{d.inf}</b> · {getCamp(d.cid)?.name||""}</span>
              <span style={{color:T.ok,fontWeight:700}}>⭐ {f(d.amount)} paid</span>
            </div>)}
          </Section>
        </>;
      })()}

      {/* ═══════════════════════════════════════════════════════
          LOGISTICS DASHBOARD — Shipment Center
         ═══════════════════════════════════════════════════════ */}
      {view==="dashboard"&&role==="logistics"&&(()=>{
        const delivered = deals.filter(d=>d.ship?.st==="delivered");
        const totalActions = pendingShip.length + pickupRequests.length + reshipPending.length;
        return <>
          <div style={{marginBottom:"14px"}}><span style={{fontSize:"20px",fontWeight:800}}>📦 Shipment Center</span><span style={{fontSize:"13px",color:T.sub,marginLeft:"8px"}}>Dispatch, track, pickups & re-shipments</span></div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:"8px",marginBottom:"16px"}}>
            <StatBox l="Awaiting Dispatch" v={pendingShip.length} c={pendingShip.length>0?T.err:T.ok} sub="Ship these now"/>
            <StatBox l="In Transit" v={inTransit.length} c={inTransit.length>0?T.purple:T.ok}/>
            <StatBox l="Pickup Requests" v={pickupRequests.length} c={pickupRequests.length>0?T.warn:T.ok} sub="Arrange returns"/>
            <StatBox l="Re-ship Pending" v={reshipPending.length} c={reshipPending.length>0?T.err:T.ok} sub="New products to send"/>
            <StatBox l="Delivered" v={delivered.length} c={T.ok}/>
            <StatBox l="Total Shipments" v={deals.filter(d=>d.ship).length} c={T.brand}/>
          </div>

          {/* DISPATCH QUEUE */}
          <Section title={`Awaiting Dispatch (${pendingShip.length})`} icon="⚡" action={pendingShip.length>0?<span style={{fontSize:"11px",color:T.err,fontWeight:700,animation:"pulse 1.5s infinite"}}>Action Required</span>:null}>
            {pendingShip.length===0&&<div style={{fontSize:"13px",color:T.sub,padding:"10px 0"}}>All products dispatched!</div>}
            {pendingShip.map(d=><div key={d.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${T.err}`,borderRadius:"7px",padding:"12px 14px",marginBottom:"7px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"6px"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:"13px"}}>{d.inf}</div>
                  <div style={{fontSize:"13px",color:T.sub,marginTop:"2px"}}>📦 <b>{d.products?d.products.map(p=>p.name).join(", "):d.product}</b></div>
                </div>
                <Btn v="purple" onClick={()=>{setSel(d);setShipF({track:"",carrier:"DTDC"});setModal("ship")}}>📦 Dispatch Now</Btn>
              </div>
              <div style={{padding:"8px 10px",background:T.purpleBg,borderRadius:"5px",fontSize:"12px",color:T.purple}}>
                <div>📍 <b>Ship to:</b> {d.address||"Address not provided"}</div>
                <div style={{marginTop:"2px"}}>📱 <b>Phone:</b> {d.phone||"Not provided"}</div>
              </div>
              <div style={{fontSize:"11px",color:T.sub,marginTop:"4px"}}>Approved: {d.appAt} · Deadline: {d.deadline}</div>
            </div>)}
          </Section>

          {/* PICKUP REQUESTS */}
          {pickupRequests.length>0&&<Section title={`Pickup Requests (${pickupRequests.length})`} icon="🔄" action={<span style={{fontSize:"11px",color:T.warn,fontWeight:700}}>Arrange Returns</span>}>
            {pickupRequests.map((h,idx)=>{
              const deal = deals.find(d=>d.id===h.dealId);
              return <div key={h.dealId+"-"+h.histIdx} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${T.warn}`,borderRadius:"7px",padding:"12px 14px",marginBottom:"7px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"6px"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:"13px"}}>{h.inf} <span style={{fontSize:"11px",fontWeight:400,color:T.sub}}>· Pickup</span></div>
                    <div style={{fontSize:"12px",color:T.warn,fontWeight:600,marginTop:"2px"}}>Reason: {h.reason}</div>
                    {h.note&&<div style={{fontSize:"12px",color:T.sub,marginTop:"1px"}}>{h.note}</div>}
                    <div style={{fontSize:"13px",color:T.sub,marginTop:"2px"}}>📦 {h.products?h.products.map(p=>p.name).join(", "):h.product}</div>
                  </div>
                  <Btn v="gold" onClick={()=>{setSel(deal);setShipF({track:"",carrier:"DTDC"});setModal("arrangePickup-"+h.histIdx)}}>🔄 Arrange Pickup</Btn>
                </div>
                <div style={{padding:"8px 10px",background:T.warnBg,borderRadius:"5px",fontSize:"12px",color:T.warn}}>
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
              return <div key={h.dealId+"-"+h.histIdx} style={{background:T.warnBg,border:`1px solid ${T.warn}22`,borderRadius:"7px",padding:"11px 13px",marginBottom:"6px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
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
              return <div key={h.dealId+"-"+h.histIdx} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${T.purple}`,borderRadius:"7px",padding:"12px 14px",marginBottom:"7px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"6px"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:"13px"}}>{h.inf} <span style={{fontSize:"11px",fontWeight:400,color:T.sub}}>· Re-shipment</span></div>
                    <div style={{fontSize:"13px",color:T.sub,marginTop:"2px"}}>📦 <b>{(h.products||[]).map(p=>p.name).join(", ")}</b></div>
                    {h.note&&<div style={{fontSize:"12px",color:T.sub,marginTop:"1px"}}>{h.note}</div>}
                  </div>
                  <Btn v="purple" onClick={()=>{setSel(deal);setReshipShipF({track:"",carrier:"DTDC"});setModal("reshipDispatch-"+h.histIdx)}}>📦 Dispatch</Btn>
                </div>
                <div style={{padding:"8px 10px",background:T.purpleBg,borderRadius:"5px",fontSize:"12px",color:T.purple}}>
                  <div>📍 <b>Ship to:</b> {h.address||"Address not provided"}</div>
                  <div style={{marginTop:"2px"}}>📱 <b>Phone:</b> {h.phone||"Not provided"}</div>
                </div>
                {(h.products||[]).length>0&&<div style={{marginTop:"6px",padding:"8px",background:T.surfaceAlt,borderRadius:"4px",fontSize:"11px"}}>
                  <div style={{fontWeight:700,marginBottom:"4px"}}>Items to pack & ship:</div>
                  {h.products.map((p,i)=><div key={i}><b>{p.name}</b>{p.color?" · "+p.color:""}{p.size?" · "+p.size:""}{p.qty?" · Qty: "+p.qty:""}</div>)}
                </div>}
                <div style={{fontSize:"11px",color:T.sub,marginTop:"4px"}}>Requested by {h.requestedBy} · {new Date(h.requestedAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
              </div>;
            })}
          </Section>}

          {/* RE-SHIPMENTS IN TRANSIT */}
          {reshipInTransit.length>0&&<Section title={`Re-shipments In Transit (${reshipInTransit.length})`} icon="🚚">
            {reshipInTransit.map(h=>{
              const deal = deals.find(d=>d.id===h.dealId);
              return <div key={h.dealId+"-"+h.histIdx} style={{background:T.purpleBg,border:`1px solid ${T.purple}22`,borderRadius:"7px",padding:"11px 13px",marginBottom:"6px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:"14px"}}>{h.inf} <span style={{color:T.sub,fontWeight:400}}>· Re-shipment</span></div>
                  <div style={{fontSize:"13px",marginTop:"2px"}}>{h.reCarrier}: <span style={{color:T.info,fontWeight:700}}>{h.reTrack}</span></div>
                  <div style={{fontSize:"11px",color:T.sub}}>Dispatched: {new Date(h.reDispatchedAt).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</div>
                </div>
                <Btn v="ok" onClick={()=>{markReshipDelivered(deal,h.histIdx)}}>✓ Mark Delivered</Btn>
              </div>;
            })}
          </Section>}

          {/* IN TRANSIT (original shipments) */}
          <Section title={`In Transit (${inTransit.length})`} icon="🚚">
            {inTransit.length===0&&<div style={{fontSize:"13px",color:T.sub,padding:"8px 0"}}>Nothing in transit</div>}
            {inTransit.map(d=><div key={d.id} style={{background:T.purpleBg,border:`1px solid ${T.purple}22`,borderRadius:"7px",padding:"11px 13px",marginBottom:"6px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700,fontSize:"14px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400}}>· {d.products?d.products.map(p=>p.name).join(", "):d.product}</span></div>
                <div style={{fontSize:"13px",marginTop:"2px"}}>{d.ship.carrier}: <span style={{color:T.info,fontWeight:700}}>{d.ship.track}</span></div>
                <div style={{fontSize:"11px",color:T.sub}}>Dispatched: {d.ship.dispAt}</div>
              </div>
              <Btn v="ok" onClick={()=>{setSel(d);setDeliveryF({date:new Date().toISOString().slice(0,10),note:""});setModal("markDelivered")}}>✓ Mark Delivered</Btn>
            </div>)}
          </Section>

          {/* DELIVERED */}
          <Section title={`Delivered (${delivered.length})`} icon="✅">
            {delivered.map(d=><div key={d.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"6px",padding:"8px 10px",marginBottom:"3px",fontSize:"13px",display:"flex",justifyContent:"space-between",opacity:.65}}>
              <span><b>{d.inf}</b> · {d.products?d.products.map(p=>p.name).join(", "):d.product} · {d.ship.carrier}: {d.ship.track}</span>
              <span style={{color:T.ok}}>✓ {d.ship.delAt}</span>
            </div>)}
          </Section>
        </>;
      })()}

        {/* ═══ INFLUENCER DATABASE ═══ */}
        {view==="influencers"&&(()=>{
          const getInfDeals = (inf) => deals.filter(d=>d.inf===inf.name);
          const getInfTotalSpend = (inf) => getInfDeals(inf).reduce((s,d)=>s+(d.pays||[]).reduce((ps,p)=>ps+p.amount,0),0);
          const getInfTotalCommitted = (inf) => getInfDeals(inf).filter(d=>!["rejected","pending","renegotiate"].includes(d.status)).reduce((s,d)=>s+d.amount,0);

          return <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}>
              <div><span style={{fontSize:"20px",fontWeight:800}}>⭐ Influencer Database</span><span style={{fontSize:"13px",color:T.sub,marginLeft:"8px"}}>{influencers.length} influencers</span></div>
              {(role==="negotiator"||role==="admin")&&<Btn v="gold" sm onClick={()=>setModal("newInfluencer")}>+ Add Influencer</Btn>}
            </div>

            {/* Stats */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:"8px",marginBottom:"14px"}}>
              <StatBox l="Total Influencers" v={influencers.length} c={T.brand}/>
              <StatBox l="Active Collabs" v={deals.filter(d=>!["rejected","paid"].includes(d.status)).length} c={T.info}/>
              <StatBox l="Total Committed" v={f(influencers.reduce((s,inf)=>s+getInfTotalCommitted(inf),0))} c={T.gold}/>
              <StatBox l="Total Paid" v={f(influencers.reduce((s,inf)=>s+getInfTotalSpend(inf),0))} c={T.ok}/>
            </div>

            {/* Influencer Cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:"10px"}}>
              {influencers.map(inf=>{
                const infDeals = getInfDeals(inf);
                const totalCollabs = infDeals.length;
                const activeCollabs = infDeals.filter(d=>!["rejected","paid"].includes(d.status)).length;
                const totalSpend = getInfTotalSpend(inf);
                const ratingColor = inf.rating==="A+"?T.ok:inf.rating==="A"?T.info:inf.rating==="B+"?T.warn:T.sub;
                return <div key={inf.id} onClick={()=>setInfProfile(inf)} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"10px",padding:"14px",cursor:"pointer",transition:"all .12s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=T.gold;e.currentTarget.style.boxShadow=T.cardShadowHover}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.boxShadow="none"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"8px"}}>
                    <div style={{display:"flex",gap:"10px",alignItems:"center"}}>
                      <div style={{width:"36px",height:"36px",borderRadius:"50%",background:`linear-gradient(135deg,${T.goldSoft},${T.goldMid})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"13px",fontWeight:800,color:T.gold}}>{inf.name.split(" ").map(w=>w[0]).join("")}</div>
                      <div>
                        <div style={{fontWeight:800,fontSize:"13px"}}>{inf.name}</div>
                        <div style={{fontSize:"11px",color:T.sub}}>{inf.platform} · {inf.followers} · {inf.city}</div>
                      </div>
                    </div>
                    <span style={{padding:"2px 7px",borderRadius:"8px",fontSize:"11px",fontWeight:800,color:ratingColor,background:ratingColor+"18"}}>{inf.rating}</span>
                  </div>
                  <div style={{fontSize:"11px",color:T.sub,marginBottom:"6px"}}>{inf.category} · POC: {inf.poc}</div>
                  <div style={{display:"flex",gap:"4px",marginBottom:"8px",flexWrap:"wrap"}}>
                    {(inf.tags||[]).slice(0,4).map((tag,i)=><span key={i} style={{padding:"1px 6px",borderRadius:"4px",fontSize:"10px",fontWeight:600,background:T.goldSoft,color:T.gold}}>#{tag}</span>)}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:"6px",borderTop:`1px solid ${T.border}`,fontSize:"12px"}}>
                    <span style={{color:T.sub}}>{totalCollabs} collabs ({activeCollabs} active)</span>
                    <span style={{fontWeight:700,color:T.gold}}>{f(totalSpend)} paid</span>
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
                  <div style={{fontWeight:800,fontSize:"20px"}}>{inf.name} <span style={{padding:"2px 7px",borderRadius:"8px",fontSize:"11px",fontWeight:800,color:ratingColor,background:ratingColor+"18",marginLeft:"6px"}}>{inf.rating}</span></div>
                  <div style={{fontSize:"13px",color:T.sub}}>{inf.handle} · {inf.platform} · {inf.followers} · {inf.city}</div>
                  <div style={{fontSize:"11px",color:T.gold,fontWeight:600}}>{inf.category}</div>
                </div>
              </div>

              {/* Contact & Details */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginBottom:"14px"}}>
                {[["📱 Phone",inf.phone],["📧 Email",inf.email],["👤 POC",inf.poc],["🔗 Profile",inf.profile],["📍 Address",inf.address],["📅 Added",inf.added]].map(([l,v])=><div key={l} style={{padding:"7px 10px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:"5px"}}><div style={{fontSize:"10px",fontWeight:700,color:T.sub,textTransform:"uppercase"}}>{l}</div><div style={{fontSize:"13px",marginTop:"2px"}}>{v||"—"}</div></div>)}
              </div>

              {/* Financial Summary */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:"8px",marginBottom:"14px"}}>
                <StatBox l="Total Collabs" v={infDeals.length} c={T.brand}/>
                <StatBox l="Committed" v={f(totalCommitted)} c={T.gold}/>
                <StatBox l="Total Paid" v={f(totalPaidAmt)} c={T.ok}/>
                <StatBox l="Deliverables" v={`${doneDels}/${totalDels}`} c={T.purple}/>
              </div>

              {/* Tags */}
              <div style={{display:"flex",gap:"4px",marginBottom:"14px",flexWrap:"wrap"}}>
                {(inf.tags||[]).map((tag,i)=><span key={i} style={{padding:"2px 8px",borderRadius:"5px",fontSize:"11px",fontWeight:600,background:T.goldSoft,color:T.gold}}>#{tag}</span>)}
              </div>

              {/* Notes */}
              {inf.notes&&<div style={{padding:"10px 12px",background:T.warnBg,borderRadius:"6px",marginBottom:"14px",fontSize:"13px",color:T.warn}}>
                <div style={{fontWeight:700,marginBottom:"2px"}}>📝 Notes</div>{inf.notes}
              </div>}

              {/* Avg Rate & Overall Rating */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginBottom:"14px"}}>
                <div style={{padding:"8px 10px",background:T.goldSoft,borderRadius:"6px",fontSize:"13px"}}>
                  <span style={{fontWeight:700,color:T.brand}}>Average Rate</span>
                  <div style={{fontWeight:800,color:T.gold,fontSize:"13px",marginTop:"2px"}}>{f(inf.avgRate)}</div>
                </div>
                {typeof inf.rating==="number"&&<div style={{padding:"8px 10px",background:T.okBg,borderRadius:"6px",fontSize:"13px"}}>
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
                  return <div key={d.id} onClick={()=>{setSel(d);setInfProfile(null);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"6px",cursor:"pointer",transition:"all .12s"}}
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
                      <span>{f(d.amount)} · {delDone}/{d.dels.length} content · {d.at.split(" ")[0]}</span>
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
              <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"14px",paddingTop:"12px",borderTop:`1px solid ${T.border}`}}>
                <Btn v="outline" onClick={()=>setModal(null)}>Cancel</Btn>
                <Btn v="gold" onClick={()=>{
                  if(!nInf.name||!nInf.phone) { notify("Name and phone required","err"); return; }
                  const infId = uid();
                  const parsedTags = nInf.tags?nInf.tags.split(",").map(t=>t.trim().toLowerCase()).filter(Boolean):[];
                  supabase.from('influencers').insert({id:infId,name:nInf.name,platform:nInf.platform,handle:nInf.handle,profile:nInf.profile,followers:nInf.followers,category:nInf.category,city:nInf.city,phone:nInf.phone,email:nInf.email,address:nInf.address,poc:nInf.poc,avg_rate:+nInf.avgRate||0,rating:nInf.rating,notes:nInf.notes,tags:parsedTags}).then(({error})=>{if(error){console.error("Add influencer failed:",error);notify("Failed to save: "+error.message,"err");}});
                  setInfluencers(prev=>[...prev,{id:infId,name:nInf.name,platform:nInf.platform,handle:nInf.handle,profile:nInf.profile,followers:nInf.followers,category:nInf.category,city:nInf.city,phone:nInf.phone,email:nInf.email,address:nInf.address,poc:nInf.poc,avgRate:+nInf.avgRate||0,rating:nInf.rating,notes:nInf.notes,tags:parsedTags,added:new Date().toISOString().slice(0,10)}]);
                  setModal(null);
                  setNInf({name:"",platform:"Instagram",handle:"",profile:"",followers:"",category:"",city:"",phone:"",email:"",address:"",poc:"",avgRate:"",rating:"B+",notes:"",tags:""});
                  notify(`${nInf.name} added to database!`);
                }}>Add Influencer</Btn>
              </div>
          </>
        </Modal>

        {/* ═══ FEATURE 1: ANALYTICS & REPORTS VIEW ═══ */}
        {view==="analytics"&&(()=>{
          const analytics = generateAnalyticsData();
          const months = Object.keys(analytics.monthlySpend).sort().slice(-6);
          const maxSpend = Math.max(...months.map(m => analytics.monthlySpend[m]||0));
          return <>
            <h2 style={{fontSize:"20px",fontWeight:800,marginBottom:"14px"}}>📊 Analytics & Reports</h2>

            {/* ROI Metrics Section */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:"8px",marginBottom:"16px"}}>
              <StatBox l="Total Deal Value" v={f(deals.reduce((s,d)=>s+d.amount,0))} c={T.gold}/>
              <StatBox l="Total Paid Out" v={f(deals.reduce((s,d)=>s+totalPaid(d),0))} c={T.ok}/>
              <StatBox l="Avg Deal Size" v={f(deals.length>0?Math.round(deals.reduce((s,d)=>s+d.amount,0)/deals.length):0)} c={T.info}/>
              <StatBox l="Completion Rate" v={deals.length>0?Math.round(deals.filter(d=>d.status==="paid").length/deals.length*100)+"%":"0%"} c={T.purple}/>
              <StatBox l="Active Deals" v={deals.filter(d=>!["rejected","dropped","paid"].includes(d.status)).length} c={T.warn}/>
              <StatBox l="Dispute Rate" v={deals.length>0?Math.round(deals.filter(d=>d.status==="disputed").length/deals.length*100)+"%":"0%"} c={T.err}/>
            </div>

            {/* Monthly Spend Chart */}
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"8px",padding:"14px",marginBottom:"14px"}}>
              <div style={{fontSize:"12px",fontWeight:700,marginBottom:"10px"}}>Monthly Spend Trend</div>
              <div style={{display:"flex",alignItems:"flex-end",gap:"6px",height:"160px",justifyContent:"space-around",paddingBottom:"8px"}}>
                {months.map(m => {
                  const val = analytics.monthlySpend[m]||0;
                  const h = (val/maxSpend)*120 || 10;
                  const monthLabel = m.slice(5);
                  return <div key={m} style={{display:"flex",flexDirection:"column",alignItems:"center",flex:1,justifyContent:"flex-end",gap:"0"}}>
                    <div style={{fontSize:"8px",color:T.faint,marginBottom:"2px",height:"12px",lineHeight:"12px"}}>{f(val)}</div>
                    <div style={{background:T.gold,width:"100%",height:`${h}px`,borderRadius:"3px",transition:"all .2s",minHeight:"8px"}}/>
                    <div style={{fontSize:"11px",fontWeight:600,color:T.sub,marginTop:"6px",textAlign:"center"}}>{monthLabel}</div>
                  </div>;
                })}
              </div>
            </div>

            {/* Campaign Performance */}
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"8px",padding:"14px",marginBottom:"14px"}}>
              <div style={{fontSize:"12px",fontWeight:700,marginBottom:"10px"}}>Campaign Performance (Budget vs Spent)</div>
              {campaigns.map(c => {
                const perf = analytics.campaignPerf[c.id] || {budget:c.budget,spent:0};
                const pct = c.budget > 0 ? (perf.spent / c.budget * 100) : 0;
                return <div key={c.id} style={{marginBottom:"10px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px",fontSize:"11px"}}>
                    <span style={{fontWeight:600}}>{c.name}</span>
                    <span>{f(perf.spent)}/{f(perf.budget)}</span>
                  </div>
                  <div style={{height:"6px",background:T.border,borderRadius:"3px",overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:pct>90?T.err:pct>70?T.warn:T.ok}}/>
                  </div>
                </div>;
              })}
            </div>

            {/* Top Influencers */}
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"8px",padding:"14px",marginBottom:"14px"}}>
              <div style={{fontSize:"12px",fontWeight:700,marginBottom:"10px"}}>Top Influencers</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
                <div>
                  <div style={{fontSize:"11px",color:T.sub,marginBottom:"6px"}}>By Deal Count</div>
                  {Object.entries(analytics.influencerStats).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([inf,count])=><div key={inf} style={{fontSize:"11px",padding:"4px 0",display:"flex",justifyContent:"space-between"}}>
                    <span>{inf}</span><span style={{color:T.gold,fontWeight:700}}>{count} deals</span>
                  </div>)}
                </div>
                <div>
                  <div style={{fontSize:"11px",color:T.sub,marginBottom:"6px"}}>By Total Amount</div>
                  {deals.reduce((acc,d)=>{acc[d.inf]=(acc[d.inf]||0)+d.amount;return acc;},{})&&Object.entries(deals.reduce((acc,d)=>{acc[d.inf]=(acc[d.inf]||0)+d.amount;return acc;},{})).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([inf,amt])=><div key={inf} style={{fontSize:"11px",padding:"4px 0",display:"flex",justifyContent:"space-between"}}>
                    <span>{inf}</span><span style={{color:T.gold,fontWeight:700}}>{f(amt)}</span>
                  </div>)}
                </div>
              </div>
            </div>

            {/* Status Distribution Pie */}
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"8px",padding:"14px",marginBottom:"14px"}}>
              <div style={{fontSize:"12px",fontWeight:700,marginBottom:"10px"}}>Deal Status Distribution</div>
              {(()=>{
                const total = Object.values(analytics.statusDist).reduce((s,v)=>s+v,0);
                if(total===0) return <div style={{fontSize:"13px",color:T.sub,padding:"12px"}}>No deals yet</div>;
                const colors = {pending:T.warn,approved:T.ok,live:T.teal,paid:T.brand,rejected:T.err,dropped:T.faint};
                const entries = Object.entries(analytics.statusDist).filter(([,v])=>v>0);
                let startAngle = 0;
                const slices = entries.map(([status,count])=>{
                  const pct = count/total;
                  const angle = pct * 360;
                  const endAngle = startAngle + angle;
                  const largeArc = angle > 180 ? 1 : 0;
                  const x1 = 80 + 70 * Math.cos((startAngle-90)*Math.PI/180);
                  const y1 = 80 + 70 * Math.sin((startAngle-90)*Math.PI/180);
                  const x2 = 80 + 70 * Math.cos((endAngle-90)*Math.PI/180);
                  const y2 = 80 + 70 * Math.sin((endAngle-90)*Math.PI/180);
                  const path = entries.length===1
                    ? `M80,10 A70,70 0 1,1 79.99,10 Z`
                    : `M80,80 L${x1},${y1} A70,70 0 ${largeArc},1 ${x2},${y2} Z`;
                  startAngle = endAngle;
                  return {status,count,pct,path,color:colors[status]||T.sub};
                });
                return <div style={{display:"flex",alignItems:"center",gap:"24px",padding:"12px"}}>
                  <svg width="160" height="160" viewBox="0 0 160 160">
                    {slices.map((s,i)=><path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth="2"/>)}
                  </svg>
                  <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
                    {slices.map((s,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:"8px",fontSize:"13px"}}>
                      <div style={{width:"10px",height:"10px",borderRadius:"2px",background:s.color,flexShrink:0}}/>
                      <span style={{fontWeight:600,textTransform:"capitalize"}}>{s.status}</span>
                      <span style={{color:T.sub}}>{s.count} ({Math.round(s.pct*100)}%)</span>
                    </div>)}
                  </div>
                </div>;
              })()}
            </div>

            {/* Deliverables Completion */}
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"9px",padding:"14px",marginBottom:"14px"}}>
              <div style={{fontWeight:800,fontSize:"13px",marginBottom:"10px"}}>Deliverables Completion</div>
              {(()=>{
                const allDels = deals.flatMap(d=>d.dels||[]);
                const live = allDels.filter(d=>d.st==="live").length;
                const pending = allDels.filter(d=>d.st==="pending").length;
                const total = allDels.length;
                const pct = total>0?Math.round(live/total*100):0;
                return <>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:"13px",marginBottom:"5px"}}>
                    <span>{live} of {total} deliverables completed</span>
                    <span style={{fontWeight:700,color:pct>80?T.ok:pct>50?T.warn:T.err}}>{pct}%</span>
                  </div>
                  <div style={{height:"8px",borderRadius:"4px",background:T.border,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,background:pct>80?T.ok:pct>50?T.warn:T.err,borderRadius:"4px",transition:"width .3s"}}/>
                  </div>
                  <div style={{display:"flex",gap:"16px",marginTop:"8px",fontSize:"11px",color:T.sub}}>
                    <span>Live: {live}</span><span>Pending: {pending}</span>
                  </div>
                </>;
              })()}
            </div>

            {/* Export Button */}
            <div style={{textAlign:"right"}}>
              <Btn v="gold" onClick={()=>{
                const csv = "Metric,Value\nTotal Committed,"+stats.committed+"\nTotal Paid,"+stats.paid+"\nPending Approval,"+stats.pendingN+"\nDisputes,"+stats.disputed+"\nPending Deliverables,"+stats.pendingDels;
                const blob = new Blob([csv],{type:"text/csv"});
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = `analytics_${new Date().toISOString().slice(0,10)}.csv`;
                link.click();
                notify("Report exported!");
              }}>📥 Export Report</Btn>
            </div>
          </>;
        })()}

        {/* ═══ ALL COLLABORATIONS VIEW (shared, accessible from all roles) ═══ */}
        {view==="deals"&&<>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:"8px",marginBottom:"14px"}}>
            <StatBox l="Committed" v={f(stats.committed)} c={T.gold}/>
            <StatBox l="Paid Out" v={f(stats.paid)} c={T.ok}/>
            <StatBox l="Outstanding" v={f(stats.committed-stats.paid)} c={T.warn}/>
            <StatBox l="Pending" v={stats.pendingN} c={stats.pendingN>0?T.warn:T.ok}/>
            <StatBox l="Disputes" v={stats.disputed} c={stats.disputed>0?T.err:T.ok}/>
            <StatBox l="Pending Content" v={stats.pendingDels} c={T.purple}/>
          </div>

          {/* Campaign filter */}
          <div style={{display:"flex",gap:"5px",marginBottom:"10px",flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:"10px",fontWeight:800,color:T.sub,textTransform:"uppercase",letterSpacing:".6px",marginRight:"2px"}}>Campaign:</span>
            <button onClick={()=>setCampFilter("")} style={{padding:"4px 10px",border:`1px solid ${!campFilter?T.gold:T.border}`,borderRadius:"14px",background:!campFilter?T.goldSoft:"transparent",color:!campFilter?T.brand:T.sub,fontSize:"12px",fontWeight:!campFilter?700:500,cursor:"pointer",fontFamily:"inherit"}}>All</button>
            {campaigns.map(c=><button key={c.id} onClick={()=>setCampFilter(c.id)} style={{padding:"4px 10px",border:`1px solid ${campFilter===c.id?T.gold:T.border}`,borderRadius:"14px",background:campFilter===c.id?T.goldSoft:"transparent",color:campFilter===c.id?T.brand:T.sub,fontSize:"12px",fontWeight:campFilter===c.id?700:500,cursor:"pointer",fontFamily:"inherit"}}>{c.name} ({campDeals(c.id).length})</button>)}
          </div>

          {/* Feature 4: Filter Controls */}
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"8px",padding:"12px",marginBottom:"12px"}}>
            <div style={{fontSize:"13px",fontWeight:700,marginBottom:"8px"}}>Filters</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:"8px",marginBottom:"8px"}}>
              <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub}}>Date From</label><Inp type="date" value={filterDateFrom} onChange={e=>setFilterDateFrom(e.target.value)}/></div>
              <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub}}>Date To</label><Inp type="date" value={filterDateTo} onChange={e=>setFilterDateTo(e.target.value)}/></div>
              <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub}}>Min Amount</label><Inp type="number" value={filterAmountMin} onChange={e=>setFilterAmountMin(e.target.value)} placeholder="0"/></div>
              <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub}}>Max Amount</label><Inp type="number" value={filterAmountMax} onChange={e=>setFilterAmountMax(e.target.value)} placeholder="999999"/></div>
              <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub}}>Platform</label><Sel value={filterPlatform} onChange={e=>setFilterPlatform(e.target.value)} options={[{v:"",l:"All"},{v:"Instagram",l:"Instagram"},{v:"YouTube",l:"YouTube"},{v:"TikTok",l:"TikTok"}]}/></div>
              <div><label style={{fontSize:"10px",fontWeight:700,color:T.sub}}>Negotiator</label><Sel value={filterNegotiator} onChange={e=>setFilterNegotiator(e.target.value)} options={[{v:"",l:"All"},...users.filter(u=>u.role==="negotiator").map(u=>({v:u.name,l:u.name}))]}/></div>
            </div>
            <div style={{display:"flex",gap:"6px"}}>
              <Btn v="gold" sm onClick={()=>{const filtered=applyFilters();setTab("all")}}>Apply Filters</Btn>
              <Btn v="outline" sm onClick={()=>{setFilterDateFrom("");setFilterDateTo("");setFilterAmountMin("");setFilterAmountMax("");setFilterPlatform("");setFilterNegotiator("");setFilterStatus([]);setActiveFilters([])}}>Clear All</Btn>
            </div>
            {activeFilters.length>0&&<div style={{marginTop:"8px",display:"flex",gap:"4px",flexWrap:"wrap"}}>
              {activeFilters.map((f,i)=><span key={i} style={{display:"inline-flex",alignItems:"center",gap:"4px",background:T.goldSoft,color:T.brand,padding:"4px 8px",borderRadius:"4px",fontSize:"10px",fontWeight:700}}>
                {f}<button onClick={()=>clearFilter(i)} style={{background:"none",border:"none",color:T.brand,cursor:"pointer",fontSize:"12px",padding:"0",lineHeight:1}}>✕</button>
              </span>)}
            </div>}
          </div>

          {/* Tabs + Action */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${T.border}`,marginBottom:"12px"}}>
            <div style={{display:"flex",gap:"2px"}}>
              {[{k:"all",l:"All"},{k:"pending",l:"Pending"},{k:"active",l:"Active"},{k:"payment",l:"Payments"}].map(t=>(
                <button key={t.k} onClick={()=>setTab(t.k)} style={{padding:"7px 12px",border:"none",borderBottom:tab===t.k?`2px solid ${T.gold}`:"2px solid transparent",background:"none",color:tab===t.k?T.brand:T.sub,fontWeight:tab===t.k?800:500,fontSize:"13px",cursor:"pointer",fontFamily:"inherit"}}>{t.l}</button>
              ))}
            </div>
            <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
              {(role==="negotiator"||role==="admin")&&<Btn v="gold" sm onClick={()=>{setNDeal({inf:"",email:"",platform:"Instagram",followers:"",products:[],usage:"6 months",deadline:"",profile:"",phone:"",address:"",paymentTerms:"Net 15 days",cid:campaigns[0]?.id||"c1",dels:[{id:uid(),type:"Reel",desc:"",st:"pending",link:""}]});setModal("newDeal")}}>+ New Deal</Btn>}
              {bulkSelected.size>0&&<>
                <Btn v="ok" sm onClick={bulkApprove}>✓ Approve ({bulkSelected.size})</Btn>
                <Btn v="danger" sm onClick={bulkReject}>✕ Reject ({bulkSelected.size})</Btn>
                <Btn v="gold" sm onClick={bulkExportCSV}>📥 Export ({bulkSelected.size})</Btn>
              </>}
            </div>
          </div>

          {/* Feature 3: Bulk Select Checkbox */}
          <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"10px",padding:"8px",background:T.goldSoft,borderRadius:"6px"}}>
            <input type="checkbox" checked={bulkSelectAll} onChange={()=>toggleSelectAll(filtered)} style={{cursor:"pointer"}} title="Select all deals"/>
            <span style={{fontSize:"11px",color:T.brand,fontWeight:700}}>{bulkSelectAll?`All ${filtered.length} selected`:`Select All (${filtered.length})`}</span>
            {bulkSelected.size>0&&<span style={{fontSize:"11px",color:T.brand,marginLeft:"auto"}}>{bulkSelected.size} selected</span>}
          </div>

          {/* Cards */}
          {(()=>{
            const pagedDeals = filtered.slice(dealsPage * ITEMS_PER_PAGE, (dealsPage+1) * ITEMS_PER_PAGE);
            return <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(295px,1fr))",gap:"9px"}}>
                {pagedDeals.map(d=>{
                  const camp=getCamp(d.cid);
                  const paid=totalPaid(d);
                  const done=d.dels.filter(x=>x.st==="live").length;
                  return <div key={d.id} style={{background:T.surface,border:bulkSelected.has(d.id)?`2px solid ${T.gold}`:(`1px solid ${T.border}`),borderRadius:"9px",padding:"13px",cursor:"pointer",transition:"all .12s",animation:"fadeUp .3s ease"}}
                    onMouseEnter={e=>{if(!bulkSelected.has(d.id)){e.currentTarget.style.borderColor=T.gold;e.currentTarget.style.boxShadow=T.cardShadowHover}}}
                    onMouseLeave={e=>{if(!bulkSelected.has(d.id)){e.currentTarget.style.borderColor=T.border;e.currentTarget.style.boxShadow="none"}}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"5px"}}>
                      <div style={{display:"flex",alignItems:"flex-start",gap:"6px"}}>
                        <input type="checkbox" checked={bulkSelected.has(d.id)} onChange={e=>{e.stopPropagation();toggleBulkSelect(d.id)}} style={{cursor:"pointer",marginTop:"2px"}}/>
                        <div onClick={()=>{setSel(d);setModal("detail")}} style={{cursor:"pointer"}}>
                          <div style={{fontWeight:800,fontSize:"14px"}}>{d.inf}</div>
                          <div style={{fontSize:"11px",color:T.sub}}>{d.platform} · {d.followers}</div>
                        </div>
                      </div>
                      <Badge s={d.status} sm/>
                    </div>
                    {camp&&<div style={{fontSize:"11px",color:T.gold,fontWeight:700,marginBottom:"3px"}}>🎯 {camp.name}</div>}
                    <div style={{fontSize:"12px",color:T.sub,marginBottom:"6px"}}>{d.products?d.products.map(p=>p.name).join(", "):d.product}</div>
                    <div style={{display:"flex",gap:"2px",marginBottom:"6px"}}>{d.dels.map((dl,i)=><div key={i} title={`${dl.type}: ${dl.st}`} style={{flex:1,height:"3px",borderRadius:"2px",background:dl.st==="live"?T.ok:T.border}}/>)}</div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontWeight:800,fontSize:"14px",color:T.gold}}>{f(d.amount)}</span>
                      <span style={{fontSize:"11px",color:T.sub}}>{done}/{d.dels.length} content · {d.by}</span>
                    </div>
                    {paid>0&&paid<d.amount&&<div style={{marginTop:"4px",height:"2.5px",borderRadius:"2px",background:T.border,overflow:"hidden"}}><div style={{height:"100%",width:`${(paid/d.amount)*100}%`,background:T.ok,borderRadius:"2px"}}/></div>}
                  </div>;
                })}
              </div>
              {filtered.length===0&&<div style={{textAlign:"center",padding:"40px",color:T.sub,fontSize:"12px"}}>No deals in this view</div>}
              {filtered.length > ITEMS_PER_PAGE && <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:"8px",padding:"12px",marginTop:"12px"}}>
                <Btn v="outline" sm disabled={dealsPage===0} onClick={()=>setDealsPage(p=>p-1)}>← Previous</Btn>
                <span style={{fontSize:"11px",color:T.sub}}>Page {dealsPage+1} of {Math.ceil(filtered.length/ITEMS_PER_PAGE)}</span>
                <Btn v="outline" sm disabled={(dealsPage+1)*ITEMS_PER_PAGE>=filtered.length} onClick={()=>setDealsPage(p=>p+1)}>Next →</Btn>
              </div>}
            </>;
          })()}
        </>}

        {/* ═══ DROPPED COLLABS (Negotiator view) ═══ */}
        {view==="dropped"&&role==="negotiator"&&(()=>{
          const droppedDeals = deals.filter(d=>d.status==="dropped");
          return <>
            <div style={{marginBottom:"14px"}}>
              <span style={{fontSize:"20px",fontWeight:800}}>🚫 Dropped Collabs</span>
              <span style={{fontSize:"13px",color:T.sub,marginLeft:"8px"}}>({droppedDeals.length} total)</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(295px,1fr))",gap:"9px"}}>
              {droppedDeals.map(d=>(
                <div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.errBg,border:`1px solid ${T.err}33`,borderRadius:"9px",padding:"13px",cursor:"pointer",transition:"all .12s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=T.err}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=`${T.err}33`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"5px"}}>
                    <div><div style={{fontWeight:800,fontSize:"14px"}}>{d.inf}</div><div style={{fontSize:"11px",color:T.sub}}>{d.platform} · {d.followers}</div></div>
                    <Badge s={d.status} sm/>
                  </div>
                  <div style={{fontSize:"12px",color:T.sub,marginBottom:"6px"}}>{d.product}</div>
                  <div style={{fontSize:"11px",color:T.err,fontWeight:600,padding:"6px",background:"rgba(180,35,24,.1)",borderRadius:"4px",marginBottom:"6px"}}>Dropped by {d.logs?.find(l=>l.a==="Collab dropped")?.u||"Unknown"}</div>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    <span style={{fontWeight:800,fontSize:"14px",color:T.gold}}>{f(d.amount)}</span>
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
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}>
            <span style={{fontSize:"18px",fontWeight:800}}>🎯 Campaigns</span>
            {(role==="approver"||role==="finance"||role==="admin")&&<Btn v="gold" sm onClick={()=>{setNCamp({name:"",budget:"",target:"",deadline:"",brief:""});setModal("newCamp")}}>+ New Campaign</Btn>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(330px,1fr))",gap:"10px"}}>
            {campaigns.map(c=>{
              const comm=campCommitted(c.id),pd=campPaid(c.id),pct=c.budget>0?Math.round(comm/c.budget*100):0,lk=campLocked(c.id);
              return <div key={c.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"9px",padding:"16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:"10px"}}>
                  <div><div style={{fontWeight:800,fontSize:"14px"}}>{c.name}</div><div style={{fontSize:"11px",color:T.sub,marginTop:"1px"}}>Deadline: {c.deadline}</div></div>
                  <span style={{padding:"2px 7px",borderRadius:"8px",fontSize:"11px",fontWeight:700,color:c.status==="active"?T.ok:T.warn,background:c.status==="active"?T.okBg:T.warnBg}}>{c.status}</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px",marginBottom:"10px"}}>
                  <div><div style={{fontSize:"10px",color:T.sub,fontWeight:700}}>BUDGET</div><div style={{fontSize:"18px",fontWeight:800}}>{f(c.budget)}</div></div>
                  <div><div style={{fontSize:"10px",color:T.sub,fontWeight:700}}>COMMITTED</div><div style={{fontSize:"18px",fontWeight:800,color:T.gold}}>{f(comm)}</div></div>
                  <div><div style={{fontSize:"10px",color:T.sub,fontWeight:700}}>PAID</div><div style={{fontSize:"18px",fontWeight:800,color:T.ok}}>{f(pd)}</div></div>
                </div>
                <div style={{marginBottom:"6px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:"10px",color:T.sub,marginBottom:"2px"}}><span>Budget used</span><span style={{color:pct>90?T.err:T.sub}}>{pct}%</span></div>
                  <div style={{height:"4px",borderRadius:"3px",background:T.border,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:pct>90?T.err:pct>70?T.warn:T.ok,borderRadius:"3px"}}/></div>
                </div>
                <div style={{fontSize:"11px",color:T.sub}}>{lk}/{c.target} influencers locked · {campDeals(c.id).length} total deals</div>
              </div>;})}
          </div>
        </>}

        {/* ═══ DELIVERABLES BANK ═══ */}
        {view==="deliverables"&&<>
          <div style={{fontSize:"18px",fontWeight:800,marginBottom:"14px"}}>📋 Deliverables Bank — <span style={{color:T.purple}}>{pendingDels.length} Active</span></div>
          {/* Workflow summary cards */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:"8px",marginBottom:"16px"}}>
            <div style={{background:T.warnBg,border:`1px solid ${T.border}`,borderRadius:"8px",padding:"10px 14px"}}>
              <div style={{fontSize:"11px",color:T.warn,fontWeight:700,textTransform:"uppercase"}}>Pending</div>
              <div style={{fontSize:"20px",fontWeight:800,color:T.warn}}>{pendingDels.filter(d=>d.st==="pending").length}</div>
            </div>
            <div style={{background:T.infoBg,border:`1px solid ${T.border}`,borderRadius:"8px",padding:"10px 14px"}}>
              <div style={{fontSize:"11px",color:T.info,fontWeight:700,textTransform:"uppercase"}}>Submitted</div>
              <div style={{fontSize:"20px",fontWeight:800,color:T.info}}>{awaitingReview.length}</div>
            </div>
            <div style={{background:T.errBg,border:`1px solid ${T.border}`,borderRadius:"8px",padding:"10px 14px"}}>
              <div style={{fontSize:"11px",color:T.err,fontWeight:700,textTransform:"uppercase"}}>Revision Needed</div>
              <div style={{fontSize:"20px",fontWeight:800,color:T.err}}>{revisionNeeded.length}</div>
            </div>
            <div style={{background:T.okBg,border:`1px solid ${T.border}`,borderRadius:"8px",padding:"10px 14px"}}>
              <div style={{fontSize:"11px",color:T.ok,fontWeight:700,textTransform:"uppercase"}}>Approved</div>
              <div style={{fontSize:"20px",fontWeight:800,color:T.ok}}>{pendingDels.filter(d=>d.st==="approved").length}</div>
            </div>
          </div>
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"9px",overflow:"hidden",marginBottom:"20px"}}>
            <div style={{display:"grid",gridTemplateColumns:"1.8fr 1.5fr 1.2fr 0.8fr 0.8fr 0.7fr",padding:"8px 12px",background:T.brand,fontSize:"10px",fontWeight:800,color:"#F6DFC1",textTransform:"uppercase",fontFamily:"Barlow,sans-serif",letterSpacing:".5px"}}>
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

          <div style={{fontSize:"13px",fontWeight:800,marginBottom:"10px"}}>By Influencer</div>
          {deals.filter(d=>!["rejected"].includes(d.status)&&d.dels.length>0).map(d=>{
            const done=d.dels.filter(x=>x.st==="live").length;
            const stColor={pending:T.warn,submitted:T.info,revision_requested:T.err,approved:T.ok,live:T.ok};
            const stIcon={pending:"⏳",submitted:"📤",revision_requested:"✏️",approved:"✅",live:"✓"};
            return <div key={d.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"6px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"4px"}}>
                <div><span style={{fontWeight:800,fontSize:"12px"}}>{d.inf}</span> <span style={{fontSize:"11px",color:T.sub}}>· {d.platform} · {getCamp(d.cid)?.name||""}</span></div>
                <span style={{fontSize:"13px",fontWeight:800,color:done===d.dels.length?T.ok:T.warn}}>{done}/{d.dels.length} live</span>
              </div>
              <div style={{display:"flex",gap:"4px",flexWrap:"wrap"}}>
                {d.dels.map((dl,i)=><span key={i} style={{padding:"3px 8px",borderRadius:"5px",fontSize:"11px",fontWeight:700,background:dl.st==="live"?T.okBg:dl.st==="submitted"?T.infoBg:dl.st==="revision_requested"?T.errBg:dl.st==="approved"?T.okBg:T.warnBg,color:stColor[dl.st]||T.warn}}>{dl.type} {stIcon[dl.st]||"⏳"}</span>)}
              </div>
            </div>;
          })}
        </>}

        {/* ═══ SHIPMENTS (full view) ═══ */}
        {view==="shipments"&&<>
          <div style={{fontSize:"18px",fontWeight:800,marginBottom:"14px"}}>🚚 All Shipments</div>
          {pendingShip.length>0&&<Section title={`Awaiting Dispatch (${pendingShip.length})`} icon="📋">
            {pendingShip.map(d=><div key={d.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"6px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><div style={{fontWeight:700,fontSize:"12px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400}}>· {d.products?d.products.map(p=>p.name).join(", "):d.product}</span></div><div style={{fontSize:"11px",color:T.sub}}>Approved: {d.appAt} · Deadline: {d.deadline}</div></div>
              {role==="logistics"?<Btn v="purple" sm onClick={()=>{setSel(d);setShipF({track:"",carrier:"DTDC"});setModal("ship")}}>📦 Dispatch</Btn>:<span style={{fontSize:"11px",color:T.warn,fontWeight:700}}>Awaiting logistics</span>}
            </div>)}
          </Section>}

          {/* Pickup Requests */}
          {pickupRequests.length>0&&<Section title={`Pickup Requests (${pickupRequests.length})`} icon="🔄">
            {pickupRequests.map(h=>{
              const deal = deals.find(d=>d.id===h.dealId);
              return <div key={h.dealId+"-"+h.histIdx} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${T.warn}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"6px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><div style={{fontWeight:700,fontSize:"12px"}}>{h.inf} <span style={{color:T.warn,fontWeight:600}}>· Return ({h.reason})</span></div><div style={{fontSize:"11px",color:T.sub}}>📍 {h.address||"—"} · Requested: {new Date(h.requestedAt).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</div></div>
                {role==="logistics"&&<Btn v="gold" sm onClick={()=>{setSel(deal);setShipF({track:"",carrier:"DTDC"});setModal("arrangePickup-"+h.histIdx)}}>🔄 Arrange</Btn>}
              </div>;
            })}
          </Section>}

          {/* Pickups In Transit */}
          {pickupsInTransit.length>0&&<Section title={`Return Pickups In Transit (${pickupsInTransit.length})`} icon="📮">
            {pickupsInTransit.map(h=>{
              const deal = deals.find(d=>d.id===h.dealId);
              return <div key={h.dealId+"-"+h.histIdx} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"6px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><div style={{fontWeight:700,fontSize:"12px"}}>{h.inf} <span style={{color:T.info,fontWeight:600}}>· Return In Transit</span></div><div style={{fontSize:"11px",color:T.sub}}>{h.returnCarrier}: <span style={{color:T.info,fontWeight:700}}>{h.returnTrack}</span></div></div>
                {role==="logistics"&&<Btn v="ok" sm onClick={()=>markProductReturned(deal,h.histIdx)}>✓ Product Returned</Btn>}
              </div>;
            })}
          </Section>}

          {/* Re-shipments Pending */}
          {reshipPending.length>0&&<Section title={`Re-shipments Pending (${reshipPending.length})`} icon="📦">
            {reshipPending.map(h=>{
              const deal = deals.find(d=>d.id===h.dealId);
              return <div key={h.dealId+"-"+h.histIdx} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${T.purple}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"6px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><div style={{fontWeight:700,fontSize:"12px"}}>{h.inf} <span style={{color:T.purple,fontWeight:600}}>· New Shipment</span></div><div style={{fontSize:"11px",color:T.sub}}>📦 {(h.products||[]).map(p=>p.name).join(", ")} · 📍 {h.address||"—"}</div></div>
                {role==="logistics"&&<Btn v="purple" sm onClick={()=>{setSel(deal);setReshipShipF({track:"",carrier:"DTDC"});setModal("reshipDispatch-"+h.histIdx)}}>📦 Dispatch</Btn>}
              </div>;
            })}
          </Section>}

          {/* Re-shipments In Transit */}
          {reshipInTransit.length>0&&<Section title={`Re-shipments In Transit (${reshipInTransit.length})`} icon="🚚">
            {reshipInTransit.map(h=>{
              const deal = deals.find(d=>d.id===h.dealId);
              return <div key={h.dealId+"-"+h.histIdx} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"6px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><div style={{fontWeight:700,fontSize:"12px"}}>{h.inf} <span style={{color:T.purple,fontWeight:600}}>· Re-shipment</span></div><div style={{fontSize:"11px",color:T.sub}}>{h.reCarrier}: <span style={{color:T.info,fontWeight:700}}>{h.reTrack}</span></div></div>
                {role==="logistics"&&<Btn v="ok" sm onClick={()=>markReshipDelivered(deal,h.histIdx)}>✓ Delivered</Btn>}
              </div>;
            })}
          </Section>}

          <Section title={`In Transit (${inTransit.length})`} icon="🚚">
            {inTransit.length===0&&<div style={{fontSize:"13px",color:T.sub,padding:"12px"}}>None in transit</div>}
            {inTransit.map(d=><div key={d.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"6px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><div style={{fontWeight:700,fontSize:"12px"}}>{d.inf} · {d.products?d.products.map(p=>p.name).join(", "):d.product}</div><div style={{fontSize:"11px",color:T.sub}}>📦 {d.ship.carrier}: <span style={{fontWeight:700,color:T.info}}>{d.ship.track}</span> · {d.ship.dispAt}</div></div>
              {role==="logistics"&&<Btn v="ok" sm onClick={()=>{setSel(d);setModal("markDelivered")}}>✓ Delivered</Btn>}
            </div>)}
          </Section>
          <Section title="Delivered" icon="✓">
            {deals.filter(d=>d.ship?.st==="delivered").map(d=><div key={d.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"7px",padding:"8px 12px",marginBottom:"4px",display:"flex",justifyContent:"space-between",alignItems:"center",opacity:.6}}>
              <span style={{fontSize:"13px"}}><b>{d.inf}</b> · {d.products?d.products.map(p=>p.name).join(", "):d.product}</span>
              <span style={{fontSize:"11px",color:T.ok}}>✓ {d.ship.delAt}</span>
            </div>)}
          </Section>
        </>}
      </div>

      {/* ═══════════════ MODALS ═══════════════ */}

      {/* NEW DEAL */}
      <Modal open={modal==="newDeal"&&nDeal} onClose={()=>setModal(null)} title="New Collaboration" w={580}>
        {nDeal&&<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 10px"}}>
            <Field label="Campaign *"><Sel value={nDeal.cid} onChange={e=>setNDeal({...nDeal,cid:e.target.value})} options={campaigns.map(c=>({v:c.id,l:c.name}))}/></Field>
            <Field label="Influencer *"><Inp value={nDeal.inf} onChange={e=>setNDeal({...nDeal,inf:e.target.value})} placeholder="Priya Sharma"/></Field>
            <Field label="Influencer Email" required><Inp value={nDeal.email} onChange={e=>setNDeal({...nDeal,email:e.target.value})} placeholder="influencer@gmail.com" error={formErrors.email}/></Field>
            <Field label="Profile" required><Inp value={nDeal.profile} onChange={e=>setNDeal({...nDeal,profile:e.target.value})} placeholder="instagram.com/handle" error={formErrors.profile}/></Field>
            <Field label="Platform"><Sel value={nDeal.platform} onChange={e=>setNDeal({...nDeal,platform:e.target.value})} options={[{v:"Instagram",l:"Instagram"},{v:"YouTube",l:"YouTube"},{v:"Other",l:"Other"}]}/></Field>
            <Field label="Followers"><Inp value={nDeal.followers} onChange={e=>setNDeal({...nDeal,followers:e.target.value})} placeholder="125K"/></Field>
            <Field label="Usage Rights"><Sel value={nDeal.usage} onChange={e=>setNDeal({...nDeal,usage:e.target.value})} options={[{v:"3 months",l:"3 months"},{v:"6 months",l:"6 months"},{v:"12 months",l:"12 months"},{v:"Perpetual",l:"Perpetual"}]}/></Field>
            <Field label="Deadline *"><Inp value={nDeal.deadline} onChange={e=>setNDeal({...nDeal,deadline:e.target.value})} type="date"/></Field>
            <Field label="Phone *"><Inp value={nDeal.phone} onChange={e=>setNDeal({...nDeal,phone:e.target.value})} placeholder="+91 98765 43210"/></Field>
            <Field label="Shipping Address *" span={2}><Inp value={nDeal.address} onChange={e=>setNDeal({...nDeal,address:e.target.value})} placeholder="Full address for product dispatch"/></Field>
          </div>

          {/* Products */}
          <div style={{marginTop:"8px",padding:"12px",background:T.surfaceAlt,borderRadius:"7px",marginBottom:"8px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
              <span style={{fontSize:"11px",fontWeight:800,color:T.brand,textTransform:"uppercase",letterSpacing:".5px"}}>📦 Products ({nDeal.products?.length||0})</span>
              <Btn v="outline" sm onClick={()=>setNDeal({...nDeal,products:[...(nDeal.products||[]),{id:uid(),name:"",color:"",size:"",qty:"1"}]})}>+ Add Product</Btn>
            </div>
            {(nDeal.products||[]).map((p,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"1fr 80px 80px 60px 24px",gap:"5px",marginBottom:"4px",alignItems:"center"}}>
              <Inp value={p.name} onChange={e=>{const ps=[...(nDeal.products||[])];ps[i]={...ps[i],name:e.target.value};setNDeal({...nDeal,products:ps})}} placeholder="Product name" error={formErrors.products&&!p.name}/>
              <Inp value={p.color} onChange={e=>{const ps=[...(nDeal.products||[])];ps[i]={...ps[i],color:e.target.value};setNDeal({...nDeal,products:ps})}} placeholder="Color"/>
              <Inp value={p.size} onChange={e=>{const ps=[...(nDeal.products||[])];ps[i]={...ps[i],size:e.target.value};setNDeal({...nDeal,products:ps})}} placeholder="Size"/>
              <Inp value={p.qty} onChange={e=>{const ps=[...(nDeal.products||[])];ps[i]={...ps[i],qty:e.target.value};setNDeal({...nDeal,products:ps})}} placeholder="Qty" type="number"/>
              {(nDeal.products||[]).length>1&&<button onClick={()=>setNDeal({...nDeal,products:(nDeal.products||[]).filter((_,j)=>j!==i)})} style={{background:"none",border:"none",color:T.err,cursor:"pointer",fontSize:"13px",padding:0}}>✕</button>}
            </div>)}
            {formErrors.products&&<div style={{fontSize:"10px",color:T.err,marginTop:"4px"}}>At least one product name is required</div>}
          </div>

          <Field label="Amount (INR) *"><Inp value={nDeal.amount} onChange={e=>setNDeal({...nDeal,amount:e.target.value})} type="number" prefix="₹"/></Field>
          <Field label="Payment Terms"><Sel value={nDeal.paymentTerms||"Net 15 days"} onChange={e=>setNDeal({...nDeal,paymentTerms:e.target.value})} options={[{v:"Net 15 days",l:"Net 15 days"},{v:"Net 30 days",l:"Net 30 days"},{v:"50% Advance + 50% on delivery",l:"50% Advance + 50% on delivery"},{v:"100% Advance",l:"100% Advance"},{v:"100% Post Content",l:"100% Post Content"},{v:"Custom",l:"Custom"}]}/></Field>

          {/* Deliverables */}
          <div style={{marginTop:"12px",padding:"12px",background:formErrors.dels?T.errBg:T.goldSoft,borderRadius:"7px",border:formErrors.dels?`1px solid ${T.err}`:"none"}}>
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
            <Btn v="outline" onClick={()=>setModal(null)}>Cancel</Btn>
            <Btn v="gold" onClick={createDeal}>Submit for Approval</Btn>
          </div>
          <div style={{marginTop:"7px",padding:"6px 10px",background:T.infoBg,borderRadius:"5px",fontSize:"11px",color:T.info}}>🔒 Amount and deliverable list lock after manager approval. Email auto-generates from locked data.</div>
        </>}
      </Modal>

      {/* NEW CAMPAIGN */}
      <Modal open={modal==="newCamp"&&nCamp} onClose={()=>setModal(null)} title="Create Campaign" w={420}>
        {nCamp&&<>
          <Field label="Campaign Name *"><Inp value={nCamp.name} onChange={e=>setNCamp({...nCamp,name:e.target.value})} placeholder="Summer Sculpt Launch"/></Field>
          <Field label="Budget *"><Inp value={nCamp.budget} onChange={e=>setNCamp({...nCamp,budget:e.target.value})} type="number" prefix="₹"/></Field>
          <Field label="Target Influencers *"><Inp value={nCamp.target} onChange={e=>setNCamp({...nCamp,target:e.target.value})} type="number"/></Field>
          <Field label="Deadline"><Inp value={nCamp.deadline} onChange={e=>setNCamp({...nCamp,deadline:e.target.value})} type="date"/></Field>
          <Field label="Campaign Brief"><Textarea value={nCamp.brief} onChange={e=>setNCamp({...nCamp,brief:e.target.value})} placeholder="Describe the campaign objectives, target audience, key messages..." rows={4}/></Field>
          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"12px"}}><Btn v="outline" onClick={()=>setModal(null)}>Cancel</Btn><Btn v="gold" onClick={createCampaign}>Create</Btn></div>
        </>}
      </Modal>

      {/* DISPATCH */}
      <Modal open={modal==="ship"} onClose={()=>setModal(null)} title={`Dispatch to ${sel?.inf}`} w={440}>
        {sel&&<>
          <div style={{padding:"12px",background:T.purpleBg,borderRadius:"7px",marginBottom:"14px",fontSize:"13px",color:T.purple}}>
            <div style={{fontWeight:800,fontSize:"13px",marginBottom:"6px"}}>📦 {sel.products?sel.products.map(p=>p.name).join(", "):sel.product}</div>
            {sel.products && sel.products.length>0 && <div style={{marginTop:"8px",padding:"8px",background:T.surfaceAlt,borderRadius:"4px",fontSize:"11px"}}>
              <div style={{fontWeight:700,marginBottom:"4px"}}>Items to pack & ship:</div>
              {sel.products.map((p,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"6px",marginBottom:"3px"}}>
                <span><b>{p.name}</b></span>
                <span>{p.color&&`Color: ${p.color}`} {p.size&&`Size: ${p.size}`}</span>
                <span>{p.qty&&`Qty: ${p.qty}`}</span>
              </div>)}
            </div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr",gap:"4px",marginTop:"8px"}}>
              <div><span style={{fontWeight:700}}>📍 Ship to:</span> {sel.address||"Address not provided"}</div>
              <div><span style={{fontWeight:700}}>📱 Phone:</span> {sel.phone||"Not provided"}</div>
              <div><span style={{fontWeight:700}}>👤 Influencer:</span> {sel.inf} · {sel.platform}</div>
            </div>
          </div>
          <Field label="Carrier"><Sel value={shipF.carrier} onChange={e=>setShipF({...shipF,carrier:e.target.value})} options={[{v:"DTDC",l:"DTDC"},{v:"Delhivery",l:"Delhivery"},{v:"Shiprocket",l:"Shiprocket"},{v:"BlueDart",l:"BlueDart"},{v:"India Post",l:"India Post"}]}/></Field>
          <Field label="Tracking ID *"><Inp value={shipF.track} onChange={e=>setShipF({...shipF,track:e.target.value})} placeholder="DTDC-12345678"/></Field>
          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"10px"}}><Btn v="outline" onClick={()=>setModal(null)}>Cancel</Btn><Btn v="purple" onClick={dispatch}>📦 Dispatch</Btn></div>
        </>}
      </Modal>

      {/* PAYMENT */}
      <Modal open={modal==="payment"} onClose={()=>setModal("detail")} title={`Payment — ${sel?.inf}`} w={420}>
        {sel&&<>
          {/* Deal Context */}
          <div style={{padding:"10px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:"6px",marginBottom:"12px",fontSize:"13px"}}>
            <div style={{fontWeight:700,marginBottom:"6px",fontSize:"12px"}}>📋 Deal Terms</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px"}}>
              <div><span style={{color:T.sub}}>Product:</span> <b>{sel.products?sel.products.map(p=>p.name).join(", "):sel.product}</b></div>
              <div><span style={{color:T.sub}}>Usage:</span> <b>{sel.usage}</b></div>
              <div><span style={{color:T.sub}}>Deadline:</span> <b>{sel.deadline}</b></div>
              <div><span style={{color:T.sub}}>Payment Terms:</span> <b>{sel.paymentTerms||"Net 15 days"}</b></div>
            </div>
            {sel.pan&&<div style={{marginTop:"4px",padding:"4px 6px",background:T.infoBg,borderRadius:"4px"}}><span style={{color:T.info,fontWeight:600}}>PAN:</span> {sel.pan.number} ({sel.pan.name})</div>}
            <div style={{marginTop:"6px",fontWeight:700,fontSize:"11px",color:T.sub}}>Deliverables:</div>
            {sel.dels.map((dl,i)=><div key={i} style={{fontSize:"11px",padding:"2px 0"}}>{dl.type}: {dl.desc} — <span style={{color:dl.st==="live"?T.ok:T.warn,fontWeight:600}}>{dl.st==="live"?"Live":"Pending"}</span></div>)}
          </div>

          <div style={{padding:"10px",background:T.goldSoft,borderRadius:"6px",marginBottom:"12px",fontSize:"13px"}}>
            <div style={{display:"flex",justifyContent:"space-between"}}><span>Locked:</span><b>{f(sel.amount)}</b></div>
            <div style={{display:"flex",justifyContent:"space-between"}}><span>Paid:</span><b style={{color:T.ok}}>{f(totalPaid(sel))}</b></div>
            <div style={{display:"flex",justifyContent:"space-between",borderTop:`1px solid ${T.border}`,marginTop:"4px",paddingTop:"4px"}}><b>Remaining:</b><b style={{color:remaining(sel)>0?T.err:T.ok}}>{f(remaining(sel))}</b></div>
          </div>
          <Field label="Type"><Sel value={payF.type} onChange={e=>setPayF({...payF,type:e.target.value})} options={[{v:"advance",l:"Advance"},{v:"partial",l:"Part Payment"},{v:"final",l:"Final Settlement"}]}/></Field>
          <Field label="Amount *"><Inp value={payF.amount} onChange={e=>setPayF({...payF,amount:e.target.value})} type="number" prefix="₹" placeholder={String(remaining(sel))}/></Field>
          <Field label="Note"><Inp value={payF.note} onChange={e=>setPayF({...payF,note:e.target.value})} placeholder="Advance on lock / Post content live"/></Field>
          {+payF.amount>remaining(sel)&&remaining(sel)>0&&<div style={{padding:"5px 8px",background:T.errBg,borderRadius:"4px",fontSize:"11px",color:T.err,marginBottom:"6px"}}>⚠ Exceeds remaining balance!</div>}
          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"8px"}}><Btn v="outline" onClick={()=>setModal("detail")}>Back</Btn><Btn v="ok" onClick={recordPayment} disabled={!payF.amount}>Record Payment</Btn></div>
        </>}
      </Modal>

      {/* INVOICE */}
      <Modal open={modal==="invoice"} onClose={()=>setModal("detail")} title={`Submit Invoice — ${sel?.inf}`} w={420}>
        {sel&&<>
          <div style={{padding:"10px",background:T.goldSoft,borderRadius:"6px",marginBottom:"12px",fontSize:"12px"}}>
            <div>🔒 <b>Approved amount:</b> <span style={{fontSize:"20px",fontWeight:800,color:T.gold}}>{f(sel.amount)}</span></div>
            <div style={{fontSize:"11px",color:T.sub,marginTop:"4px"}}>Enter the exact amount shown on the influencer's invoice. The system will compare it to the locked amount.</div>
          </div>
          <Field label="Invoice Amount *"><Inp value={invF} onChange={e=>setInvF(e.target.value)} type="number" prefix="₹" placeholder={String(sel.amount)}/></Field>
          {invF&&+invF!==sel.amount&&<div style={{padding:"6px 8px",background:T.errBg,borderRadius:"4px",fontSize:"11px",color:T.err,marginTop:"4px"}}>⚠ MISMATCH: Invoice {f(invF)} ≠ Approved {f(sel.amount)}. This will be flagged as a dispute.</div>}
          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"10px"}}><Btn v="outline" onClick={()=>{setModal("detail");setInvF("")}}>Back</Btn><Btn v="gold" onClick={()=>submitInvoice(sel)} disabled={!invF}>Submit Invoice</Btn></div>
        </>}
      </Modal>

      {/* NEW USER */}
      <Modal open={modal==="newUser"} onClose={()=>setModal(null)} title="Add Team Member" w={440}>
        <Field label="Full Name *"><Inp value={userF.name} onChange={e=>setUserF({...userF,name:e.target.value})} placeholder="Priya Mehta"/></Field>
        <Field label="Email *"><Inp value={userF.email} onChange={e=>setUserF({...userF,email:e.target.value})} placeholder="priya@invogue.in" type="email"/></Field>
        <Field label="Role *">
          <Sel value={userF.role} onChange={e=>setUserF({...userF,role:e.target.value})} options={[
            {v:"negotiator",l:"👤 Negotiator — Creates deals, marks deliverables, submits invoices"},
            {v:"approver",l:"✅ Manager — Approves deals, creates campaigns, views all"},
            {v:"finance",l:"💰 Finance — Processes payments, resolves disputes"},
            {v:"logistics",l:"📦 Logistics — Dispatches shipments, no financial access"},
            {v:"viewer",l:"👁 Viewer — Read-only access to dashboards"},
          ]}/>
        </Field>
        <div style={{marginTop:"8px",padding:"8px 10px",background:T.infoBg,borderRadius:"5px",fontSize:"11px",color:T.info}}>
          {userF.role==="negotiator"&&"Negotiators can create deals with deliverables, send confirmation emails, mark content as live, and submit invoices. They cannot approve deals or process payments."}
          {userF.role==="approver"&&"Managers can approve/reject deals, create campaigns with budgets, record advance payments, and see the full bird's-eye view of all operations."}
          {userF.role==="finance"&&"Finance can process all payment types (advance, partial, final), resolve invoice disputes, view complete audit trails, and override amounts with logged reasons."}
          {userF.role==="logistics"&&"Logistics can dispatch shipments and mark deliveries. They have ZERO visibility into financial data — they only see product names and shipping info."}
          {userF.role==="viewer"&&"Viewers get read-only access to dashboards and reports. They cannot create, edit, or approve anything."}
        </div>
        <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"14px",paddingTop:"12px",borderTop:`1px solid ${T.border}`}}>
          <Btn v="outline" onClick={()=>setModal(null)}>Cancel</Btn>
          <Btn v="gold" onClick={()=>{
            if(!userF.name||!userF.email) { notify("Name and email required","err"); return; }
            if(users.some(u=>u.email===userF.email)) { notify("Email already exists","err"); return; }
            const initials = userF.name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
            const newId = uid();
            supabase.from('users').insert({id:newId,name:userF.name,email:userF.email,role:userF.role,status:'active',avatar:initials,pin:'1111'}).then(({error})=>{if(error){console.error("User insert failed:",error);notify("Failed to create user: "+error.message,"err");}});
            setUsers(prev=>[...prev,{id:newId,name:userF.name,email:userF.email,role:userF.role,status:"active",created:new Date().toISOString().slice(0,10),avatar:initials,pin:"1111"}]);
            setUserF({name:"",email:"",role:"negotiator"});
            setModal(null);
            notify(`${userF.name} added!`);
          }}>Add Team Member</Btn>
        </div>
      </Modal>

      {/* RENEGOTIATE */}
      <Modal open={modal==="renegotiate"&&!!renegF} onClose={()=>{setModal(null);setRenegF(null)}} title={`Renegotiate — ${sel?.inf}`} w={540}>
        {renegF&&sel&&<>
          <div style={{padding:"10px 12px",background:T.warnBg,borderRadius:"6px",marginBottom:"14px",fontSize:"13px",color:T.warn}}>
            <b>Current terms:</b> {f(sel.amount)} · {sel.dels.length} deliverables · by {sel.by}
          </div>

          <Field label="Revised Commercial Amount *">
            <Inp value={renegF.amount} onChange={e=>setRenegF({...renegF,amount:e.target.value})} type="number" prefix="₹"/>
          </Field>
          {+renegF.amount!==sel.amount&&<div style={{fontSize:"11px",color:T.info,marginBottom:"8px",marginTop:"-2px"}}>Changed from {f(sel.amount)} → {f(renegF.amount)} ({+renegF.amount>sel.amount?"↑ increase":"↓ decrease"})</div>}

          <div style={{marginBottom:"14px"}}>
            <div style={{fontSize:"11px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:".5px",marginBottom:"6px"}}>Select Deliverables to Keep</div>
            {renegF.dels.map((dl,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:"8px",padding:"7px 10px",background:dl.keep?T.surface:T.surfaceAlt,border:`1px solid ${dl.keep?T.border:T.border}`,borderRadius:"6px",marginBottom:"4px",opacity:dl.keep?1:.5}}>
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

      {/* ═══════════════ DEAL DETAIL ═══════════════ */}
      <Modal open={modal==="detail"&&!!sel} onClose={()=>{setModal(null);setSel(null)}} title={sel?.inf||""} w={680}>
        {sel&&(()=>{
          const camp=getCamp(sel.cid), paid=totalPaid(sel), rem=remaining(sel), done=sel.dels.filter(x=>x.st==="live").length;
          return <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"}}>
              <div style={{display:"flex",gap:"5px",alignItems:"center"}}><Badge s={sel.status}/>{camp&&<span style={{fontSize:"11px",color:T.gold,fontWeight:700}}>🎯 {camp.name}</span>}</div>
              <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                {(()=>{const inf=influencers.find(x=>x.name===sel.inf); return inf?<Btn v="ghost" sm onClick={()=>{setModal(null);setSel(null);setInfProfile(inf)}}>⭐ View Profile</Btn>:null;})()}
                <span style={{fontSize:"11px",fontWeight:700,color:T.brand,background:T.goldSoft,padding:"2px 8px",borderRadius:"4px",fontFamily:"Barlow,sans-serif",letterSpacing:".5px"}}>{sel.collabId||"—"}</span>
                <span style={{fontSize:"10px",color:T.sub}}>{sel.by} · {sel.at}</span>
              </div>
            </div>

            {/* Info grid */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px",marginBottom:"12px"}}>
              {[["Platform",`${sel.platform} · ${sel.followers}`],["Product",sel.products?sel.products.map(p=>p.name).join(", "):sel.product],["Usage",sel.usage],["Deadline",sel.deadline],["Profile",sel.profile],["Phone",sel.phone||"—"],["Email",sel.email||"Not provided"]].map(([l,v])=><div key={l}><div style={{fontSize:"10px",fontWeight:800,color:T.sub,textTransform:"uppercase"}}>{l}</div><div style={{fontSize:"13px",marginTop:"1px"}}>{v}</div></div>)}
            </div>
            {sel.paymentTerms&&<div style={{padding:"8px 10px",background:T.infoBg,borderRadius:"5px",marginBottom:"12px",fontSize:"13px"}}><span style={{fontWeight:700,color:T.info}}>💳 Payment Terms:</span> {sel.paymentTerms}</div>}
            {sel.address&&<div style={{padding:"8px 10px",background:T.infoBg,borderRadius:"5px",marginBottom:"12px",fontSize:"13px"}}><span style={{fontWeight:700,color:T.info}}>📍 Address:</span> {sel.address}</div>}

            {/* Amount box */}
            <div style={{background:T.goldSoft,border:`1px dashed ${T.goldMid}`,borderRadius:"7px",padding:"12px",marginBottom:"12px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
                <div>
                  <div style={{fontSize:"10px",fontWeight:800,color:T.sub,textTransform:"uppercase"}}>{["approved","email_sent","shipped","delivered_prod","partial_live","live","invoice_ok","disputed","partial_paid","paid"].includes(sel.status)?"🔒 Locked Amount":"Proposed Amount"}</div>
                  <div style={{fontSize:"22px",fontWeight:900,color:T.gold}}>{f(sel.amount)}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:"11px",color:T.ok,fontWeight:700}}>Paid: {f(paid)}</div>
                  <div style={{fontSize:"11px",color:rem>0?T.warn:T.ok,fontWeight:700}}>Remaining: {f(rem)}</div>
                </div>
              </div>
              {paid>0&&<div style={{height:"4px",borderRadius:"3px",background:T.border,marginTop:"8px"}}><div style={{height:"100%",width:`${Math.min(paid/sel.amount*100,100)}%`,background:T.ok,borderRadius:"3px"}}/></div>}
              {sel.inv&&!sel.inv.match&&<div style={{marginTop:"8px",padding:"6px 8px",background:T.errBg,borderRadius:"5px",fontSize:"11px",color:T.err}}>⚠ Invoice: {f(sel.inv.amount)} vs Locked: {f(sel.amount)} — Difference: {f(Math.abs(sel.inv.amount-sel.amount))}</div>}
            </div>

            {/* Payments */}
            {sel.pays.length>0&&<Section title="Payment History" icon="💰">
              {sel.pays.map((p,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 9px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:"5px",marginBottom:"3px",fontSize:"13px"}}>
                <div><span style={{fontWeight:700,textTransform:"capitalize"}}>{p.type}</span> <span style={{color:T.sub}}>· {p.note}</span></div>
                <div><b style={{color:T.ok}}>{f(p.amount)}</b> <span style={{color:T.sub,fontSize:"11px"}}>· {p.date}</span></div>
              </div>)}
            </Section>}

            {/* Payment Workflow Tracker */}
            {["live","partial_live","invoice_ok","payment_requested","payment_approved","partial_paid","paid"].includes(sel.status)&&(role==="negotiator"||role==="admin"||role==="approver"||role==="finance")&&<Section title="Payment Workflow" icon="💸">
              <div style={{display:"flex",gap:"4px",alignItems:"center",marginBottom:"4px"}}>
                {[
                  {label:"Link Sent",done:!!sel.paymentFormSent,icon:"📩"},
                  {label:"Invoice Received",done:!!sel.invoiceGenerated,icon:"📄"},
                  {label:"Amount Verified",done:!!sel.inv,icon:"🧾"},
                  {label:"Sent to Finance",done:["payment_requested","payment_approved","partial_paid","paid"].includes(sel.status),icon:"💸"},
                  {label:"Paid",done:sel.status==="paid",icon:"✅"},
                ].map((step,si)=><div key={si} style={{display:"contents"}}>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",flex:1}}>
                    <div style={{width:"28px",height:"28px",borderRadius:"50%",background:step.done?T.ok:T.border,color:step.done?"#fff":T.sub,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"13px",fontWeight:700}}>{step.done?"✓":si+1}</div>
                    <div style={{fontSize:"9px",fontWeight:700,color:step.done?T.ok:T.sub,textAlign:"center",marginTop:"3px",textTransform:"uppercase",letterSpacing:".3px"}}>{step.label}</div>
                  </div>
                  {si<4&&<div style={{flex:0,width:"20px",height:"2px",background:step.done?T.ok:T.border,marginBottom:"16px"}}/>}
                </div>)}
              </div>
              {sel.invoiceNumber&&<div style={{fontSize:"11px",color:T.sub,marginTop:"6px"}}>Invoice: <b style={{color:T.text}}>{sel.invoiceNumber}</b> · {sel.invoiceDate}</div>}
            </Section>}

            {/* Deliverables — Content Approval Workflow */}
            <Section title={`Deliverables (${done}/${sel.dels.length})`} icon="📋">
              {sel.dels.map((dl,i)=>{
                const url = deliverableLinkF[dl.id] || "";
                const productDelivered = sel.ship && sel.ship.st === "delivered";
                const canSubmit = (role==="negotiator"||role==="admin") && (dl.st==="pending"||dl.st==="revision_requested") && productDelivered && !["pending","renegotiate","rejected"].includes(sel.status);
                const canReview = (role==="approver"||role==="admin") && dl.st==="submitted";
                const canMarkLive = (role==="negotiator"||role==="admin") && dl.st==="approved";
                return <div key={i} style={{background:T.surface,border:`1px solid ${dl.st==="revision_requested"?T.err+"33":T.border}`,borderRadius:"6px",padding:"12px",marginBottom:"8px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:canSubmit||canReview||canMarkLive?"10px":"0"}}>
                    <div style={{flex:1}}>
                      <span style={{fontSize:"14px",fontWeight:700}}>{dl.type}</span>
                      <span style={{fontSize:"13px",color:T.sub,marginLeft:"6px"}}>{dl.desc}</span>
                      {dl.link&&dl.st!=="revision_requested"&&<div style={{fontSize:"12px",color:T.info,marginTop:"3px"}}>🔗 <a href={ensureUrl(dl.link)} target="_blank" rel="noopener noreferrer" style={{color:T.info}}>{dl.link}</a></div>}
                    </div>
                    <DBadge s={dl.st}/>
                  </div>

                  {/* Revision feedback banner */}
                  {dl.st==="revision_requested"&&dl.feedback&&<div style={{background:T.errBg,border:`1px solid ${T.err}22`,borderRadius:"4px",padding:"10px 12px",marginBottom:"10px",fontSize:"13px"}}>
                    <div style={{fontWeight:700,color:T.err,fontSize:"11px",textTransform:"uppercase",letterSpacing:".5px",marginBottom:"4px",fontFamily:"Barlow,sans-serif"}}>Manager Feedback</div>
                    <div style={{color:T.text}}>{dl.feedback}</div>
                  </div>}

                  {/* Feedback & revision trail */}
                  {dl.history&&dl.history.length>0&&<div style={{marginBottom:"10px",borderLeft:`2px solid ${T.border}`,paddingLeft:"10px"}}>
                    <div style={{fontSize:"10px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:".5px",marginBottom:"6px",fontFamily:"Barlow,sans-serif"}}>Activity Trail</div>
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
                        {h.feedback&&<div style={{fontSize:"12px",color:T.err,marginLeft:"22px",marginTop:"1px",fontStyle:"italic"}}>"{h.feedback}"</div>}
                      </div>;
                    })}
                  </div>}

                  {/* Negotiator: Submit content for review */}
                  {canSubmit&&<div style={{background:T.surfaceAlt,borderRadius:"4px",padding:"10px 12px"}}>
                    <div style={{fontSize:"11px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:".5px",marginBottom:"6px",fontFamily:"Barlow,sans-serif"}}>{dl.st==="revision_requested"?"Resubmit Revised Content":"Submit Content for Review"}</div>
                    <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
                      <div style={{flex:1}}><Inp value={url} onChange={e=>setDeliverableLinkF({...deliverableLinkF,[dl.id]:e.target.value})} placeholder="Content URL or link *"/></div>
                      <Btn v="primary" sm onClick={()=>submitContentForReview(sel,i,url)}>Submit for Review</Btn>
                    </div>
                  </div>}

                  {/* Manager: Review & approve or request revision */}
                  {canReview&&<div style={{background:T.purpleBg,borderRadius:"4px",padding:"10px 12px"}}>
                    <div style={{fontSize:"11px",fontWeight:700,color:T.purple,textTransform:"uppercase",letterSpacing:".5px",marginBottom:"6px",fontFamily:"Barlow,sans-serif"}}>Review Content</div>
                    {dl.link&&<div style={{fontSize:"12px",color:T.info,marginBottom:"8px"}}>🔗 <a href={ensureUrl(dl.link)} target="_blank" rel="noopener noreferrer" style={{color:T.info}}>{dl.link}</a></div>}
                    <div style={{display:"flex",gap:"6px",marginBottom:"8px"}}>
                      <Btn v="ok" sm onClick={()=>approveContent(sel,i)}>✅ Approve Content</Btn>
                      <Btn v="danger" sm onClick={()=>{const fb=revisionFeedback[dl.id];if(!fb){notify("Enter feedback before requesting revision","err");return;}requestRevision(sel,i,fb)}}>↩ Request Revision</Btn>
                    </div>
                    <Inp value={revisionFeedback[dl.id]||""} onChange={e=>setRevisionFeedback({...revisionFeedback,[dl.id]:e.target.value})} placeholder="Feedback for revision (required if requesting changes)"/>
                  </div>}

                  {/* Negotiator: Mark approved content as live */}
                  {canMarkLive&&<div style={{background:T.okBg,borderRadius:"4px",padding:"10px 12px"}}>
                    <div style={{fontSize:"11px",fontWeight:700,color:T.ok,textTransform:"uppercase",letterSpacing:".5px",marginBottom:"6px",fontFamily:"Barlow,sans-serif"}}>Content Approved — Ready to Go Live</div>
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

            {/* Shipment & Logistics History */}
            {(sel.ship||(sel.shipHistory||[]).length>0)&&<Section title="Shipment & Logistics" icon="📦">
              {/* Original shipment */}
              {sel.ship&&<div style={{padding:"8px 10px",background:T.purpleBg,borderRadius:"5px",fontSize:"13px",marginBottom:"8px"}}>
                <div style={{fontWeight:700,fontSize:"11px",color:T.purple,textTransform:"uppercase",letterSpacing:".5px",marginBottom:"4px",fontFamily:"Barlow,sans-serif"}}>Original Shipment</div>
                <div><b>{sel.ship.carrier}:</b> <span style={{color:T.info,fontWeight:700}}>{sel.ship.track}</span></div>
                <div style={{color:T.sub,marginTop:"1px"}}>Dispatched: {sel.ship.dispAt} by {sel.ship.dispBy}</div>
                {sel.ship.delAt&&<div style={{color:T.ok,marginTop:"1px"}}>✓ Delivered: {sel.ship.delAt}</div>}
              </div>}

              {/* Shipment History Timeline */}
              {(sel.shipHistory||[]).length>0&&<div style={{borderLeft:`2px solid ${T.border}`,paddingLeft:"12px",marginTop:"8px"}}>
                <div style={{fontSize:"10px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:".5px",marginBottom:"8px",fontFamily:"Barlow,sans-serif"}}>Logistics History</div>
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
                <Btn v="purple" sm onClick={()=>{setReshipF({products:[{name:"",color:"",size:"",qty:"1"}],note:"",newAddress:""});setModal("reshipRequest")}}>📦 Request New Shipment</Btn>
              </div>}
            </Section>}

            {/* Email preview */}
            {["email_sent","shipped","delivered_prod","partial_live","live","invoice_ok","disputed","partial_paid","paid"].includes(sel.status)&&
            <Section title="Confirmation Email (System-Generated)" icon="✉">
              <div style={{background:T.surfaceAlt,border:`1px solid ${T.border}`,borderRadius:"6px",padding:"12px",fontSize:"13px",lineHeight:1.7,color:T.text}}>
                Dear {sel.inf},<br/><br/>
                Thank you for partnering with <b>Invogue</b>! Confirmed terms:<br/><br/>
                <b>Product:</b> {sel.products?sel.products.map(p=>p.name).join(", "):sel.product}<br/>
                <b>Amount:</b> <span style={{color:T.gold,fontWeight:800}}>{f(sel.amount)}</span><br/>
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

            {/* Actions */}
            <div style={{display:"flex",gap:"5px",flexWrap:"wrap",paddingTop:"10px",borderTop:`1px solid ${T.border}`}}>
              {(role==="approver"||role==="admin")&&(sel.status==="pending"||sel.status==="renegotiate")&&<>
                <Btn v="ok" onClick={()=>approveDeal(sel)}>✓ Approve & Lock</Btn>
                <Btn v="outline" onClick={()=>renegDeal(sel)}>↩ Renegotiate</Btn>
                <Btn v="danger" sm onClick={()=>openRejectModal(sel)}>✕ Reject</Btn>
              </>}
              {(role==="negotiator"||role==="admin")&&sel.status==="approved"&&<Btn v="gold" onClick={()=>sendEmail(sel)}>✉ Send Confirmation Email</Btn>}
              {(role==="negotiator"||role==="admin")&&["pending","approved","email_sent","shipped","delivered_prod","partial_live"].includes(sel.status)&&totalPaid(sel)===0&&<Btn v="danger" sm onClick={()=>openDropModal(sel)}>🚫 Drop Collab</Btn>}
              {(role==="logistics"||role==="admin")&&["approved","email_sent"].includes(sel.status)&&!sel.ship&&<Btn v="purple" onClick={()=>{setShipF({track:"",carrier:"DTDC"});setModal("ship")}}>📦 Dispatch</Btn>}
              {(role==="negotiator"||role==="admin")&&["live","partial_live"].includes(sel.status)&&<Btn v="primary" onClick={()=>setModal("collectPayment")}>{sel.paymentFormSent?"✅ Link Sent — Resend":"📩 Send Invoice Creator"}</Btn>}
              {(role==="negotiator"||role==="admin")&&["live","partial_live"].includes(sel.status)&&<Btn v="gold" onClick={()=>{setInvoiceF({beneficiary:"",bank:"",account:"",ifsc:"",upi:"",pan:"",panName:"",address:"",phone:"",gstNumber:"",notes:""});setModal("uploadInvoice")}}>{sel.invoiceGenerated?"✅ Invoice Received":"📄 Upload Invoice"}</Btn>}
              {(role==="negotiator"||role==="admin")&&["live","partial_live"].includes(sel.status)&&!sel.inv&&<Btn v="gold" onClick={()=>{setInvF("");setModal("invoice")}}>🧾 Submit Invoice Amount</Btn>}
              {role==="finance"&&!["pending","renegotiate","rejected","dropped"].includes(sel.status)&&rem>0&&<Btn v="ok" onClick={()=>{setPayF({type:paid===0?"advance":"partial",amount:"",note:""});setModal("payment")}}>💰 Record Payment</Btn>}
              {(role==="negotiator"||role==="admin")&&["live","invoice_ok","payment_requested"].includes(sel.status)&&<Btn v="gold" onClick={()=>{setPanF({number:"",name:""});setModal("sendForPayment")}}>💸 Send for Payment</Btn>}
              {(role==="approver"||role==="admin")&&sel.status==="payment_requested"&&<>
                <Btn v="ok" sm onClick={()=>{sendForPayment(sel,sel.pan_number,sel.pan_name)}}>✓ Approve Payment</Btn>
                <Btn v="outline" sm onClick={()=>notify("Sent back to negotiator","warn")}>↩ Request Changes</Btn>
              </>}
              {(role==="finance"||role==="admin")&&sel.status==="disputed"&&<>
                <Btn v="ok" sm onClick={()=>{setPayF({type:"final",amount:String(sel.amount-paid),note:"Paying approved amount per dispute resolution"});setModal("payment")}}>Pay Approved Amount</Btn>
                <Btn v="danger" sm onClick={()=>notify("Escalated to founder","warn")}>Escalate</Btn>
              </>}
              {["paid","live"].includes(sel.status)&&(role==="negotiator"||role==="admin")&&<Btn v="gold" sm onClick={()=>{setRatingF({stars:{timeliness:0,quality:0,communication:0,professionalism:0},feedback:"",influencerId:sel.id});setModal("rate")}}>⭐ Rate Influencer</Btn>}
              {role==="finance"&&<Btn v="purple" sm onClick={()=>{setGstRate("0");setTdsRate("0");setModal("taxCalculator")}}>🧮 Tax Info</Btn>}
              {(sel.status==="pending"||sel.status==="renegotiate")&&role==="negotiator"&&<div style={{fontSize:"12px",color:T.sub,fontStyle:"italic",padding:"4px 0"}}>⏳ Awaiting manager approval</div>}
              {role==="admin"&&<div style={{fontSize:"11px",color:T.sub,fontStyle:"italic",padding:"4px 0",borderTop:`1px dashed ${T.border}`,marginTop:"4px",paddingTop:"6px",width:"100%"}}>⚙ Admin: All actions available regardless of status</div>}
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
          <div style={{padding:"10px",background:T.purpleBg,borderRadius:"6px",marginBottom:"12px",fontSize:"13px"}}>
            <div><b>Product:</b> {sel.product}</div>
            <div><b>Carrier:</b> {sel.ship?.carrier}: {sel.ship?.track}</div>
          </div>
          <Field label="Delivery Date *"><Inp value={deliveryF.date} onChange={e=>setDeliveryF({...deliveryF,date:e.target.value})} type="date"/></Field>
          <Field label="Note (optional)"><Inp value={deliveryF.note} onChange={e=>setDeliveryF({...deliveryF,note:e.target.value})} placeholder="Any delivery notes..."/></Field>
          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"10px"}}>
            <Btn v="outline" onClick={()=>setModal(null)}>Cancel</Btn>
            <Btn v="ok" onClick={()=>{if(!deliveryF.date){notify("Delivery date required","err");return;}markDelivered(sel,deliveryF.date+"T12:00:00",deliveryF.note);setModal(null)}}>✅ Mark Delivered</Btn>
          </div>
        </>}
      </Modal>

      {/* PICKUP REQUEST MODAL — Negotiator requests product pickup */}
      <Modal open={modal==="pickupRequest"} onClose={()=>setModal("detail")} title={`Request Pickup — ${sel?.inf}`} w={460}>
        {sel&&<>
          <div style={{padding:"10px",background:T.warnBg,borderRadius:"6px",marginBottom:"12px",fontSize:"13px"}}>
            <div style={{fontWeight:700,color:T.warn,marginBottom:"4px"}}>🔄 Request Product Return</div>
            <div>Product will be picked up from the influencer and returned to warehouse.</div>
          </div>
          <Field label="Reason for Pickup *">
            <Sel value={pickupF.reason} onChange={e=>setPickupF({...pickupF,reason:e.target.value})} options={[{v:"Product Change",l:"Product Change"},{v:"Collab Dropped",l:"Collab Dropped"},{v:"Defective/Wrong Product",l:"Defective / Wrong Product"},{v:"Other",l:"Other"}]}/>
          </Field>
          <Field label="Note for Logistics (optional)"><Textarea value={pickupF.note} onChange={e=>setPickupF({...pickupF,note:e.target.value})} placeholder="Any special instructions for pickup..." rows={2}/></Field>
          <div style={{padding:"8px 10px",background:T.surfaceAlt,borderRadius:"5px",marginBottom:"10px",fontSize:"12px",color:T.sub}}>
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
          <div style={{padding:"10px",background:T.warnBg,borderRadius:"6px",marginBottom:"12px",fontSize:"13px"}}>
            <div style={{fontWeight:700,color:T.warn,marginBottom:"4px"}}>🔄 Return Pickup Details</div>
            <div>Reason: <b>{(sel.shipHistory||[])[histIdx]?.reason||"—"}</b></div>
            {(sel.shipHistory||[])[histIdx]?.note&&<div style={{marginTop:"2px",fontStyle:"italic"}}>{(sel.shipHistory||[])[histIdx].note}</div>}
          </div>
          <div style={{padding:"8px 10px",background:T.surfaceAlt,borderRadius:"5px",marginBottom:"10px",fontSize:"12px"}}>
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
      <Modal open={modal==="reshipRequest"} onClose={()=>setModal("detail")} title={`Request New Shipment — ${sel?.inf}`} w={520}>
        {sel&&<>
          <div style={{padding:"10px",background:T.purpleBg,borderRadius:"6px",marginBottom:"12px",fontSize:"13px",color:T.purple}}>
            <div style={{fontWeight:700,marginBottom:"4px"}}>📦 New Product Shipment</div>
            <div>Logistics will dispatch the new product to the influencer.</div>
          </div>
          <div style={{padding:"12px",background:T.surfaceAlt,borderRadius:"7px",marginBottom:"10px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
              <span style={{fontSize:"11px",fontWeight:800,color:T.brand,textTransform:"uppercase",letterSpacing:".5px"}}>📦 New Products ({reshipF.products?.length||0})</span>
              <Btn v="outline" sm onClick={()=>setReshipF({...reshipF,products:[...(reshipF.products||[]),{name:"",color:"",size:"",qty:"1"}]})}>+ Add</Btn>
            </div>
            {(reshipF.products||[]).map((p,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"1fr 80px 80px 60px 24px",gap:"5px",marginBottom:"4px",alignItems:"center"}}>
              <Inp value={p.name} onChange={e=>{const ps=[...(reshipF.products||[])];ps[i]={...ps[i],name:e.target.value};setReshipF({...reshipF,products:ps})}} placeholder="Product name *"/>
              <Inp value={p.color} onChange={e=>{const ps=[...(reshipF.products||[])];ps[i]={...ps[i],color:e.target.value};setReshipF({...reshipF,products:ps})}} placeholder="Color"/>
              <Inp value={p.size} onChange={e=>{const ps=[...(reshipF.products||[])];ps[i]={...ps[i],size:e.target.value};setReshipF({...reshipF,products:ps})}} placeholder="Size"/>
              <Inp value={p.qty} onChange={e=>{const ps=[...(reshipF.products||[])];ps[i]={...ps[i],qty:e.target.value};setReshipF({...reshipF,products:ps})}} placeholder="Qty" type="number"/>
              {(reshipF.products||[]).length>1&&<button onClick={()=>setReshipF({...reshipF,products:(reshipF.products||[]).filter((_,j)=>j!==i)})} style={{background:"none",border:"none",color:T.err,cursor:"pointer",fontSize:"13px",padding:0}}>✕</button>}
            </div>)}
          </div>
          <Field label="Updated Shipping Address (if changed)"><Inp value={reshipF.newAddress} onChange={e=>setReshipF({...reshipF,newAddress:e.target.value})} placeholder={sel.address||"Same as original address"}/></Field>
          <Field label="Note for Logistics"><Textarea value={reshipF.note} onChange={e=>setReshipF({...reshipF,note:e.target.value})} placeholder="Reason for new shipment, special instructions..." rows={2}/></Field>
          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"10px"}}>
            <Btn v="outline" onClick={()=>setModal("detail")}>Cancel</Btn>
            <Btn v="purple" onClick={()=>requestReshipment(sel,reshipF.products,reshipF.note,reshipF.newAddress)}>📦 Send to Logistics</Btn>
          </div>
        </>}
      </Modal>

      {/* RE-SHIP DISPATCH MODAL — Logistics dispatches re-shipment */}
      {(sel&&modal&&modal.startsWith("reshipDispatch-"))&&(()=>{
        const histIdx = parseInt(modal.split("-")[1]);
        const h = (sel.shipHistory||[])[histIdx];
        return <Modal open={true} onClose={()=>setModal(null)} title={`Dispatch Re-shipment — ${sel?.inf}`} w={440}>
          <div style={{padding:"10px",background:T.purpleBg,borderRadius:"6px",marginBottom:"12px",fontSize:"13px",color:T.purple}}>
            <div style={{fontWeight:700,marginBottom:"4px"}}>📦 Re-shipment Products</div>
            {(h?.products||[]).map((p,i)=><div key={i}><b>{p.name}</b>{p.color?" · "+p.color:""}{p.size?" · "+p.size:""}{p.qty?" · Qty: "+p.qty:""}</div>)}
          </div>
          <div style={{padding:"8px 10px",background:T.surfaceAlt,borderRadius:"5px",marginBottom:"10px",fontSize:"12px"}}>
            <div>📍 <b>Ship to:</b> {h?.newAddress||sel.address||"—"}</div>
            <div>📱 <b>Phone:</b> {sel.phone||"—"}</div>
          </div>
          <Field label="Carrier"><Sel value={reshipShipF.carrier} onChange={e=>setReshipShipF({...reshipShipF,carrier:e.target.value})} options={[{v:"DTDC",l:"DTDC"},{v:"Delhivery",l:"Delhivery"},{v:"Shiprocket",l:"Shiprocket"},{v:"BlueDart",l:"BlueDart"},{v:"India Post",l:"India Post"}]}/></Field>
          <Field label="Tracking ID *"><Inp value={reshipShipF.track} onChange={e=>setReshipShipF({...reshipShipF,track:e.target.value})} placeholder="Tracking number"/></Field>
          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"10px"}}>
            <Btn v="outline" onClick={()=>setModal(null)}>Cancel</Btn>
            <Btn v="purple" onClick={()=>dispatchReship(sel,histIdx,reshipShipF.track,reshipShipF.carrier)}>📦 Dispatch</Btn>
          </div>
        </Modal>;
      })()}

      {/* SEND FOR PAYMENT MODAL */}
      {/* COLLECT PAYMENT DETAILS MODAL */}
      <Modal open={modal==="collectPayment"} onClose={()=>setModal("detail")} title={`Send Invoice Creator — ${sel?.inf}`} w={520}>
        {sel&&<>
          <div style={{padding:"12px",background:T.goldSoft,borderRadius:"6px",marginBottom:"12px",fontSize:"12px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>Amount: <b style={{fontSize:"20px",color:T.gold}}>{f(sel.amount)}</b></div>
              <span style={{fontSize:"12px",fontWeight:700,color:T.brand,background:"#fff",padding:"3px 10px",borderRadius:"4px",fontFamily:"Barlow,sans-serif",letterSpacing:".5px"}}>{sel.collabId||"—"}</span>
            </div>
            <div style={{fontSize:"11px",color:T.sub,marginTop:"2px"}}>{sel.products?sel.products.map(p=>p.name).join(", "):sel.product} · {sel.dels.filter(d=>d.st==="live").length}/{sel.dels.length} live</div>
          </div>
          <div style={{padding:"10px",background:T.infoBg,borderRadius:"6px",marginBottom:"14px",fontSize:"12px",color:T.info}}>
            <b>🔒 Secure Process:</b> The influencer generates their own invoice with bank details using our Invoice Creator tool. Their details are processed entirely in their browser and are <b>never stored</b> on any server. They send the PDF back to you.
          </div>

          {sel.paymentFormSent&&<div style={{padding:"8px 10px",background:T.okBg,borderRadius:"5px",marginBottom:"10px",fontSize:"12px",color:T.ok}}>
            ✅ Link already sent on {sel.paymentFormSentAt?new Date(sel.paymentFormSentAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"—"}
          </div>}

          {/* How it works */}
          <div style={{padding:"10px 12px",background:T.surfaceAlt,border:`1px solid ${T.border}`,borderRadius:"6px",marginBottom:"14px",fontSize:"12px"}}>
            <div style={{fontWeight:700,marginBottom:"6px",fontSize:"10px",color:T.sub,textTransform:"uppercase",letterSpacing:".5px"}}>How it works</div>
            <div style={{display:"flex",gap:"8px",alignItems:"flex-start",marginBottom:"4px"}}><span style={{fontSize:"14px"}}>1️⃣</span><span>You send the Invoice Creator link to the influencer (pre-filled with their collab details)</span></div>
            <div style={{display:"flex",gap:"8px",alignItems:"flex-start",marginBottom:"4px"}}><span style={{fontSize:"14px"}}>2️⃣</span><span>Influencer fills in their bank details, PAN, and address — generates a PDF invoice</span></div>
            <div style={{display:"flex",gap:"8px",alignItems:"flex-start"}}><span style={{fontSize:"14px"}}>3️⃣</span><span>Influencer sends you the invoice PDF — you upload it and submit to finance</span></div>
          </div>

          {/* Email Preview */}
          <div style={{padding:"10px 12px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:"6px",marginBottom:"14px",fontSize:"11px"}}>
            <div style={{fontWeight:700,marginBottom:"4px",fontSize:"10px",color:T.sub,textTransform:"uppercase",letterSpacing:".5px"}}>Email Preview</div>
            <div><b>To:</b> {sel.email||"—"}</div>
            <div><b>Subject:</b> Invogue x {sel.inf} — Please Generate Your Invoice [{sel.collabId||""}]</div>
            <div style={{marginTop:"4px",color:T.sub}}>Includes: invoice creator link (pre-filled), collab ID, amount, deliverables list</div>
          </div>

          <div style={{display:"flex",gap:"8px",justifyContent:"flex-end",paddingTop:"12px",borderTop:`1px solid ${T.border}`}}>
            <Btn v="outline" onClick={()=>setModal("detail")}>Back</Btn>
            <Btn v="outline" onClick={()=>sendPaymentForm(sel,"copy")}>📋 Copy Link</Btn>
            <Btn v="gold" onClick={()=>sendPaymentForm(sel,"email")}>✉ Send Email</Btn>
          </div>
        </>}
      </Modal>

      {/* GENERATE INVOICE MODAL */}
      <Modal open={modal==="uploadInvoice"} onClose={()=>setModal("detail")} title={`Upload Invoice — ${sel?.inf}`} w={480}>
        {sel&&<>
          <div style={{padding:"12px",background:T.goldSoft,borderRadius:"6px",marginBottom:"12px",fontSize:"12px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>Amount: <b style={{fontSize:"20px",color:T.gold}}>{f(sel.amount)}</b></div>
              <span style={{fontSize:"12px",fontWeight:700,color:T.brand,fontFamily:"Barlow,sans-serif"}}>{sel.collabId||"—"}</span>
            </div>
          </div>

          {sel.invoiceGenerated&&<div style={{padding:"8px 10px",background:T.okBg,borderRadius:"5px",marginBottom:"10px",fontSize:"12px",color:T.ok}}>
            ✅ Invoice received · #{sel.invoiceNumber} · {sel.invoiceDate}
          </div>}

          <div style={{padding:"10px",background:T.infoBg,borderRadius:"6px",marginBottom:"14px",fontSize:"12px",color:T.info}}>
            Upload the invoice PDF received from <b>{sel.inf}</b>. The invoice should have been generated using the Invoice Creator tool with collab ID <b>{sel.collabId||"—"}</b>.
          </div>

          <Field label="Invoice Link or Reference *">
            <Inp value={invoiceF.notes} onChange={e=>setInvoiceF({...invoiceF,notes:e.target.value})} placeholder="Paste the invoice URL (Google Drive, email link, etc.)"/>
          </Field>
          <Field label="Invoice Number (from the PDF)">
            <Inp value={invoiceF.beneficiary} onChange={e=>setInvoiceF({...invoiceF,beneficiary:e.target.value})} placeholder="e.g. INV-A3F2XK-ABCD"/>
          </Field>

          <div style={{display:"flex",gap:"8px",justifyContent:"flex-end",marginTop:"14px",paddingTop:"12px",borderTop:`1px solid ${T.border}`}}>
            <Btn v="outline" onClick={()=>setModal("detail")}>Back</Btn>
            <Btn v="ok" onClick={()=>{
              if(!invoiceF.notes) return notify("Please enter the invoice link or reference","err");
              const invNum = invoiceF.beneficiary || `INV-${sel.collabId||sel.id.slice(0,6)}`;
              const invDate = new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
              addLog(sel.id,loggedIn?.name||"You","Invoice uploaded",`${invNum} · ${invoiceF.notes}`);
              upDeal(sel.id,{invoiceGenerated:true,invoiceNumber:invNum,invoiceDate:invDate});
              supabase.from('deals').update({invoice_generated:true,invoice_number:invNum,invoice_date:invDate}).eq('id',sel.id).then(({error})=>{if(error) console.error("Invoice log failed:",error);});
              setSel(prev=>prev?{...prev,invoiceGenerated:true,invoiceNumber:invNum,invoiceDate:invDate}:null);
              setInvoiceF({beneficiary:"",bank:"",account:"",ifsc:"",upi:"",pan:"",panName:"",address:"",phone:"",gstNumber:"",notes:""});
              setModal("detail");
              notify("Invoice recorded! You can now submit the invoice amount.");
            }}>✅ Confirm Invoice Received</Btn>
          </div>
        </>}
      </Modal>

      <Modal open={modal==="sendForPayment"} onClose={()=>setModal(null)} title={`Send for Payment — ${sel?.inf}`} w={460}>
        {sel&&<>
          <div style={{padding:"10px",background:T.goldSoft,borderRadius:"6px",marginBottom:"12px",fontSize:"12px"}}>
            <div>Amount: <b style={{fontSize:"20px",color:T.gold}}>{f(sel.amount)}</b></div>
            <div style={{fontSize:"11px",color:T.sub,marginTop:"2px"}}>{sel.products?sel.products.map(p=>p.name).join(", "):sel.product} · {sel.dels.length} deliverables</div>
          </div>
          <div style={{padding:"10px",background:T.warnBg,borderRadius:"6px",marginBottom:"12px",fontSize:"11px",color:T.warn}}>
            <b>PAN details are mandatory</b> for payment processing. Please enter the creator's PAN information below.
          </div>
          <Field label="Creator's PAN Number *" required><Inp value={panF.number} onChange={e=>setPanF({...panF,number:e.target.value.toUpperCase()})} placeholder="ABCDE1234F"/></Field>
          <Field label="Legal Name (as on PAN) *" required><Inp value={panF.name} onChange={e=>setPanF({...panF,name:e.target.value})} placeholder="Full legal name"/></Field>
          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"14px",paddingTop:"12px",borderTop:`1px solid ${T.border}`}}>
            <Btn v="outline" onClick={()=>setModal("detail")}>Cancel</Btn>
            <Btn v="gold" onClick={()=>{if(!panF.number||!panF.name){notify("PAN number and name are mandatory","err");return;}setConfirmAction({title:"Send for Payment",msg:`Send ${f(sel.amount)} payment request for ${sel.inf} to manager for approval?`,onConfirm:()=>{sendForPayment(sel,panF.number,panF.name);setConfirmAction(null)}})}}>💸 Send for Payment</Btn>
          </div>
        </>}
      </Modal>

      {/* REJECT DEAL MODAL */}
      <Modal open={modal==="reject"} onClose={()=>setModal(null)} title={`Reject Deal — ${sel?.inf}`} w={420}>
        {sel&&<>
          <div style={{padding:"10px",background:T.errBg,borderRadius:"6px",marginBottom:"12px",fontSize:"12px"}}>
            <div style={{color:T.err,fontWeight:700}}>Amount: {f(sel.amount)}</div>
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
          <div style={{padding:"10px",background:T.errBg,borderRadius:"6px",marginBottom:"12px",fontSize:"12px"}}>
            <div style={{color:T.err,fontWeight:700}}>Amount: {f(sel.amount)}</div>
            <div style={{fontSize:"11px",color:T.sub,marginTop:"2px"}}>Status: {sel.status}</div>
            <div style={{fontSize:"11px",color:T.err,marginTop:"4px",fontWeight:600}}>⚠ Can only drop if NO payments made (Current paid: {f(totalPaid(sel))})</div>
          </div>
          {totalPaid(sel)>0&&<div style={{padding:"10px",background:T.errBg,borderRadius:"6px",marginBottom:"12px",fontSize:"13px",color:T.err}}>
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
          <div style={{padding:"10px",background:T.goldSoft,borderRadius:"6px",marginBottom:"12px",fontSize:"12px"}}>
            <div>Collab: <b>{sel.product}</b></div>
            <div style={{fontSize:"11px",color:T.sub,marginTop:"2px"}}>Status: {sel.status} · Amount: {f(sel.amount)}</div>
          </div>
          <div style={{marginBottom:"12px"}}>
            <div style={{fontSize:"13px",fontWeight:700,marginBottom:"8px"}}>Rate on these dimensions:</div>
            {["timeliness","quality","communication","professionalism"].map(dim=><div key={dim} style={{marginBottom:"8px"}}>
              <div style={{fontSize:"11px",fontWeight:600,marginBottom:"4px",textTransform:"capitalize"}}>{dim}</div>
              <div style={{display:"flex",gap:"4px"}}>
                {[1,2,3,4,5].map(n=><button key={n} onClick={()=>setRatingF({...ratingF,stars:{...ratingF.stars,[dim]:n}})} style={{width:"32px",height:"32px",border:"1px solid "+T.border,borderRadius:"4px",cursor:"pointer",background:ratingF.stars[dim]>=n?T.gold:T.surface,color:ratingF.stars[dim]>=n?"#fff":T.sub,fontWeight:700,fontSize:"14px"}}>⭐</button>)}
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
          <div style={{padding:"10px",background:T.goldSoft,borderRadius:"6px",marginBottom:"12px"}}>
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
            <div style={{padding:"10px",background:T.bg,borderRadius:"6px",marginBottom:"12px",fontSize:"11px",lineHeight:1.5}}>
              <div style={{fontWeight:700,marginBottom:"4px"}}>Feedback:</div>
              {sel.feedback||"No feedback provided"}
            </div>
          </>:<div style={{fontSize:"13px",color:T.sub,padding:"12px",textAlign:"center"}}>No rating yet</div>}
        </>}
      </Modal>

      {/* ═══ FEATURE 6: TAX CALCULATION MODAL ═══ */}
      <Modal open={modal==="taxCalculator"} onClose={()=>setModal(null)} title="Tax Calculator (GST/TDS)" w={460}>
        {sel&&<>
          <div style={{padding:"10px",background:T.goldSoft,borderRadius:"6px",marginBottom:"12px",fontSize:"12px"}}>
            <div><b>{sel.inf}</b> · {sel.product}</div>
            <div style={{fontSize:"11px",color:T.sub,marginTop:"2px"}}>Base Amount: <b>{f(sel.amount)}</b></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"14px"}}>
            <Field label="GST Rate (%)"><Sel value={gstRate} onChange={e=>setGstRate(e.target.value)} options={[{v:"0",l:"No GST (0%)"},{v:"5",l:"5%"},{v:"12",l:"12%"},{v:"18",l:"18%"},{v:"28",l:"28%"}]}/></Field>
            <Field label="TDS Rate (%)"><Sel value={tdsRate} onChange={e=>setTdsRate(e.target.value)} options={[{v:"0",l:"No TDS (0%)"},{v:"1",l:"1%"},{v:"2",l:"2%"},{v:"5",l:"5%"},{v:"10",l:"10%"}]}/></Field>
          </div>
          {(() => {
            const tax = calculateTax(sel.amount);
            return <div style={{padding:"10px",background:T.bg,borderRadius:"6px",marginBottom:"14px",fontSize:"13px"}}>
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
