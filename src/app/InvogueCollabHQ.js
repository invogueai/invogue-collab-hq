'use client';
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from '../lib/supabase';

/* ═══════════════════════════════════════════════════════════════
   INVOGUE COLLAB HQ — Production Build with Persistent Storage
   ═══════════════════════════════════════════════════════════════ */

// ─── DESIGN SYSTEM ───
const T = {
  bg: "#F6F4F0", surface: "#FFFFFF", brand: "#141824", gold: "#B08D42",
  goldSoft: "#EDE7D6", goldMid: "#D4C49A", border: "#E2DDD3",
  text: "#141824", sub: "#7D766A", faint: "#B5AFA4",
  ok: "#1B7A3D", okBg: "#E2F3E8", warn: "#C27A08", warnBg: "#FEF4DD",
  err: "#B42318", errBg: "#FDE8E8", info: "#0F5BA7", infoBg: "#E0EDFA",
  purple: "#6527BE", purpleBg: "#EFE4FF", teal: "#0E7A71", tealBg: "#E0F5F3",
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
    id:d.id, inf:d.influencer_name, platform:d.platform, followers:d.followers,
    product:d.product, amount:d.amount, status:d.status, cid:d.campaign_id,
    usage:d.usage_rights, deadline:d.deadline, profile:d.profile_link,
    phone:d.phone, address:d.address, by:d.created_by, at:d.created_at,
    appBy:d.approved_by, appAt:d.approved_at,
    email:d.email||"", payment_terms:d.payment_terms||"", pan_number:d.pan_number||"", pan_name:d.pan_name||"",
    products:d.products||[],
    inv:d.invoice_amount!=null?{amount:d.invoice_amount,match:d.invoice_match,at:d.invoice_at,note:d.invoice_note}:null,
    dels:delsByDeal[d.id]||[], pays:paysByDeal[d.id]||[],
    ship:shipByDeal[d.id]||null, logs:logsByDeal[d.id]||[],
  }));

  return { users, campaigns, influencers, deals };
}

const SEED_CAMPAIGNS = [
  { id:"c1", name:"Summer Sculpt Launch", budget:500000, target:25, status:"active", created:"2026-03-15", deadline:"2026-05-30" },
  { id:"c2", name:"Monsoon Comfort Edit", budget:300000, target:15, status:"planning", created:"2026-04-01", deadline:"2026-06-30" },
  { id:"c3", name:"Wedding Season Push", budget:800000, target:40, status:"active", created:"2026-02-01", deadline:"2026-04-30" },
];

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

const SEED_DEALS = [
  { id:"d1", inf:"Priya Sharma", platform:"Instagram", followers:"125K", product:"Sculpt Bodysuit - Black", amount:18000, status:"pending", by:"Ankit", at:"2026-04-01 10:30", profile:"instagram.com/priyasharma", cid:"c1", usage:"6 months", deadline:"2026-04-15", phone:"+91 98765 43210", address:"42 MG Road, Indiranagar, Bangalore 560038",
    dels:[{id:"dl1",type:"Reel",desc:"Product showcase reel",st:"pending",link:""},{id:"dl2",type:"Story",desc:"Unboxing story set (3 frames)",st:"pending",link:""},{id:"dl3",type:"Story",desc:"Review + swipe-up story",st:"pending",link:""}],
    pays:[], ship:null, inv:null, logs:[{t:"2026-04-01 10:30",u:"Ankit",a:"Deal created",d:"Amount: ₹18,000 | 3 deliverables"}] },
  { id:"d2", inf:"Neha Verma", platform:"YouTube", followers:"450K", product:"Seamless Shaper - Nude", amount:45000, status:"shipped", by:"Megha", at:"2026-03-28 14:15", appBy:"Ritu", appAt:"2026-03-28 16:00", profile:"youtube.com/@nehaverma", cid:"c1", usage:"12 months", deadline:"2026-04-10", phone:"+91 87654 32109", address:"B-12 Sector 62, Noida, UP 201301",
    dels:[{id:"dl1",type:"Dedicated Video",desc:"Full review video (8-12 min)",st:"pending",link:""},{id:"dl2",type:"Community Post",desc:"Announcement post",st:"pending",link:""}],
    pays:[{id:"py1",type:"advance",amount:15000,date:"2026-03-29",note:"30% advance on lock"}],
    ship:{track:"DTDC-98234567",carrier:"DTDC",st:"in_transit",dispAt:"2026-03-30 11:00",dispBy:"Raj (Logistics)",delAt:null},
    inv:null, logs:[{t:"2026-03-28 14:15",u:"Megha",a:"Deal created",d:"₹45,000 | 2 deliverables"},{t:"2026-03-28 16:00",u:"Ritu",a:"Approved & locked",d:""},{t:"2026-03-28 16:05",u:"System",a:"Confirmation email sent",d:""},{t:"2026-03-29 10:00",u:"Finance",a:"Advance payment",d:"₹15,000"},{t:"2026-03-30 11:00",u:"Raj (Logistics)",a:"Shipment dispatched",d:"DTDC-98234567"}] },
  { id:"d3", inf:"Aisha Khan", platform:"Instagram", followers:"89K", product:"High-Waist Shorts - Beige", amount:12000, status:"partial_live", by:"Ankit", at:"2026-03-25 09:00", appBy:"Ritu", appAt:"2026-03-25 11:30", profile:"instagram.com/aishakhan", cid:"c3", usage:"3 months", deadline:"2026-04-08", phone:"+91 76543 21098", address:"15 Turner Road, Bandra West, Mumbai 400050",
    dels:[{id:"dl1",type:"Reel",desc:"GRWM with product",st:"live",link:"instagram.com/reel/abc1"},{id:"dl2",type:"Story",desc:"Poll story",st:"live",link:"instagram.com/stories/abc2"},{id:"dl3",type:"Story",desc:"Discount code story",st:"pending",link:""},{id:"dl4",type:"Reel",desc:"Before/after reel",st:"pending",link:""}],
    pays:[], ship:{track:"SHIPROCKET-45678",carrier:"Shiprocket",st:"delivered",dispAt:"2026-03-26 09:00",dispBy:"Raj (Logistics)",delAt:"2026-03-28 14:00"},
    inv:null, logs:[{t:"2026-03-25 09:00",u:"Ankit",a:"Deal created",d:"₹12,000 | 4 deliverables"},{t:"2026-03-25 11:30",u:"Ritu",a:"Approved & locked",d:""},{t:"2026-03-25 12:00",u:"System",a:"Email sent",d:""},{t:"2026-03-26 09:00",u:"Raj (Logistics)",a:"Dispatched",d:"Shiprocket-45678"},{t:"2026-03-28 14:00",u:"Raj (Logistics)",a:"Product delivered",d:""},{t:"2026-03-30 10:00",u:"Ankit",a:"Deliverable live",d:"Reel: GRWM"},{t:"2026-03-31 11:00",u:"Ankit",a:"Deliverable live",d:"Story: Poll"}] },
  { id:"d4", inf:"Ritika Nair", platform:"Instagram", followers:"210K", product:"Full Body Shaper - Cocoa", amount:25000, status:"live", by:"Sneha", at:"2026-03-20 11:00", appBy:"Ritu", appAt:"2026-03-20 13:00", profile:"instagram.com/ritikanair", cid:"c3", usage:"6 months", deadline:"2026-04-01", phone:"+91 65432 10987", address:"23 Boat Club Road, RA Puram, Chennai 600028",
    dels:[{id:"dl1",type:"Reel",desc:"Styling reel",st:"live",link:"instagram.com/reel/xyz1"},{id:"dl2",type:"Story",desc:"Review + link (3 frames)",st:"live",link:"instagram.com/stories/xyz2"},{id:"dl3",type:"Story",desc:"Giveaway story",st:"live",link:"instagram.com/stories/xyz3"}],
    pays:[{id:"py1",type:"advance",amount:10000,date:"2026-03-21",note:"Advance payment"}],
    ship:{track:"DELHIVERY-78901",carrier:"Delhivery",st:"delivered",dispAt:"2026-03-21 10:00",dispBy:"Raj (Logistics)",delAt:"2026-03-23 15:00"},
    inv:null, logs:[{t:"2026-03-20 11:00",u:"Sneha",a:"Deal created",d:"₹25,000 | 3 deliverables"},{t:"2026-03-20 13:00",u:"Ritu",a:"Approved",d:""},{t:"2026-03-21 10:00",u:"Raj",a:"Dispatched",d:"DELHIVERY-78901"},{t:"2026-03-23 15:00",u:"Raj",a:"Delivered",d:""},{t:"2026-03-28 18:00",u:"Sneha",a:"All 3 deliverables marked live",d:""}] },
  { id:"d5", inf:"Divya Menon", platform:"YouTube", followers:"680K", product:"Sculpt Bodysuit - Nude", amount:55000, status:"partial_paid", by:"Megha", at:"2026-03-15 10:00", appBy:"Ritu", appAt:"2026-03-15 14:00", profile:"youtube.com/@divyamenon", cid:"c3", usage:"12 months", deadline:"2026-03-28", phone:"+91 54321 09876", address:"7A Jubilee Hills, Road No. 36, Hyderabad 500033",
    dels:[{id:"dl1",type:"Dedicated Video",desc:"Full review + try-on",st:"live",link:"youtube.com/watch?v=xyz789"},{id:"dl2",type:"Shorts",desc:"Quick transformation",st:"live",link:"youtube.com/shorts/abc123"}],
    pays:[{id:"py1",type:"advance",amount:20000,date:"2026-03-16",note:"Advance on lock"},{id:"py2",type:"partial",amount:20000,date:"2026-04-01",note:"Post content live"}],
    ship:{track:"BLUEDART-11223",carrier:"BlueDart",st:"delivered",dispAt:"2026-03-16 09:00",dispBy:"Raj (Logistics)",delAt:"2026-03-18 12:00"},
    inv:{amount:55000,match:true,at:"2026-04-01"}, logs:[{t:"2026-03-15 10:00",u:"Megha",a:"Deal created",d:""},{t:"2026-03-15 14:00",u:"Ritu",a:"Approved",d:""},{t:"2026-03-16 09:00",u:"Raj",a:"Dispatched",d:""},{t:"2026-03-18 12:00",u:"Raj",a:"Delivered",d:""},{t:"2026-03-27 20:00",u:"Megha",a:"All live",d:""},{t:"2026-04-01",u:"Megha",a:"Invoice submitted",d:"₹55,000 — matched ✓"},{t:"2026-03-16",u:"Finance",a:"Advance ₹20,000",d:""},{t:"2026-04-01",u:"Finance",a:"Part payment ₹20,000",d:""}] },
  { id:"d6", inf:"Tanya Gupta", platform:"Instagram", followers:"95K", product:"Waist Trainer - Black", amount:15000, status:"disputed", by:"Ankit", at:"2026-03-10 09:30", appBy:"Ritu", appAt:"2026-03-10 12:00", profile:"instagram.com/tanyagupta", cid:"c3", usage:"3 months", deadline:"2026-03-25", phone:"+91 43210 98765", address:"56 Hauz Khas Village, New Delhi 110016",
    dels:[{id:"dl1",type:"Reel",desc:"Workout reel",st:"live",link:"instagram.com/reel/def456"},{id:"dl2",type:"Story",desc:"Review story",st:"live",link:"instagram.com/stories/def789"}],
    pays:[], ship:{track:"DTDC-33445",carrier:"DTDC",st:"delivered",dispAt:"2026-03-11 10:00",dispBy:"Raj (Logistics)",delAt:"2026-03-13 16:00"},
    inv:{amount:22000,match:false,at:"2026-03-26",note:"Claims verbal agreement for ₹22,000"}, logs:[{t:"2026-03-10 09:30",u:"Ankit",a:"Deal created",d:"₹15,000"},{t:"2026-03-10 12:00",u:"Ritu",a:"Approved",d:""},{t:"2026-03-26",u:"Ankit",a:"Invoice submitted — MISMATCH",d:"Invoice: ₹22,000 vs Approved: ₹15,000"}] },
  { id:"d7", inf:"Kavya Reddy", platform:"Instagram", followers:"310K", product:"Sculpt Bodysuit - Mocha", amount:30000, status:"paid", by:"Sneha", at:"2026-03-05 08:00", appBy:"Ritu", appAt:"2026-03-05 10:00", profile:"instagram.com/kavyareddy", cid:"c3", usage:"6 months", deadline:"2026-03-20", phone:"+91 32109 87654", address:"18 Koramangala 4th Block, Bangalore 560034",
    dels:[{id:"dl1",type:"Reel",desc:"OOTD reel",st:"live",link:"instagram.com/reel/ghi789"},{id:"dl2",type:"Story",desc:"Swipe-up story",st:"live",link:"instagram.com/stories/ghi101"}],
    pays:[{id:"py1",type:"final",amount:30000,date:"2026-03-22",note:"Full payment"}],
    ship:{track:"SHIPROCKET-99887",carrier:"Shiprocket",st:"delivered",dispAt:"2026-03-06 09:00",dispBy:"Raj (Logistics)",delAt:"2026-03-08 13:00"},
    inv:{amount:30000,match:true,at:"2026-03-21"}, logs:[{t:"2026-03-05 08:00",u:"Sneha",a:"Created",d:""},{t:"2026-03-05 10:00",u:"Ritu",a:"Approved",d:""},{t:"2026-03-22",u:"Finance",a:"Full payment ₹30,000",d:""}] },
];

const SEED_INFLUENCERS = [
  { id:"i1", name:"Priya Sharma", platform:"Instagram", handle:"@priyasharma", profile:"instagram.com/priyasharma", followers:"125K", category:"Fashion & Lifestyle", city:"Bangalore", phone:"+91 98765 43210", email:"priya.sharma@gmail.com", address:"42 MG Road, Indiranagar, Bangalore 560038", poc:"Ankit", avgRate:18000, rating:"A", notes:"Very responsive. Delivers on time. Prefers advance payment.", tags:["fashion","lifestyle","bangalore"], added:"2026-01-20" },
  { id:"i2", name:"Neha Verma", platform:"YouTube", handle:"@nehaverma", profile:"youtube.com/@nehaverma", followers:"450K", category:"Beauty & Fashion", city:"Noida", phone:"+91 87654 32109", email:"neha.v@gmail.com", address:"B-12 Sector 62, Noida, UP 201301", poc:"Megha", avgRate:45000, rating:"A+", notes:"Top-tier creator. Long-form only. Manager handles comms: Rohit (+91 99887 76655).", tags:["beauty","youtube","premium"], added:"2026-01-15" },
  { id:"i3", name:"Aisha Khan", platform:"Instagram", handle:"@aishakhan", profile:"instagram.com/aishakhan", followers:"89K", category:"Fashion", city:"Mumbai", phone:"+91 76543 21098", email:"aisha.k@outlook.com", address:"15 Turner Road, Bandra West, Mumbai 400050", poc:"Ankit", avgRate:12000, rating:"B+", notes:"Good engagement rate for follower count. Sometimes delays on stories.", tags:["fashion","mumbai","micro"], added:"2026-02-10" },
  { id:"i4", name:"Ritika Nair", platform:"Instagram", handle:"@ritikanair", profile:"instagram.com/ritikanair", followers:"210K", category:"Fashion & Fitness", city:"Chennai", phone:"+91 65432 10987", email:"ritika.nair@gmail.com", address:"23 Boat Club Road, RA Puram, Chennai 600028", poc:"Sneha", avgRate:25000, rating:"A", notes:"Creates high-quality reels. Great for body-positive messaging.", tags:["fitness","fashion","chennai"], added:"2026-01-25" },
  { id:"i5", name:"Divya Menon", platform:"YouTube", handle:"@divyamenon", profile:"youtube.com/@divyamenon", followers:"680K", category:"Fashion & Lifestyle", city:"Hyderabad", phone:"+91 54321 09876", email:"divya.m@gmail.com", address:"7A Jubilee Hills, Road No. 36, Hyderabad 500033", poc:"Megha", avgRate:55000, rating:"A+", notes:"Premium creator. 500K+ avg views. Requires 50% advance. Manager: Preethi.", tags:["premium","youtube","lifestyle"], added:"2026-01-10" },
  { id:"i6", name:"Tanya Gupta", platform:"Instagram", handle:"@tanyagupta", profile:"instagram.com/tanyagupta", followers:"95K", category:"Fitness", city:"Delhi", phone:"+91 43210 98765", email:"tanya.g@gmail.com", address:"56 Hauz Khas Village, New Delhi 110016", poc:"Ankit", avgRate:15000, rating:"B", notes:"⚠ Had invoice dispute in March 2026. Claimed higher verbal agreement. Be careful with terms.", tags:["fitness","delhi","caution"], added:"2026-02-05" },
  { id:"i7", name:"Kavya Reddy", platform:"Instagram", handle:"@kavyareddy", profile:"instagram.com/kavyareddy", followers:"310K", category:"Fashion & Beauty", city:"Bangalore", phone:"+91 32109 87654", email:"kavya.r@gmail.com", address:"18 Koramangala 4th Block, Bangalore 560034", poc:"Sneha", avgRate:30000, rating:"A", notes:"Reliable. Always delivers on time. Open to long-term partnerships.", tags:["fashion","beauty","bangalore","reliable"], added:"2026-01-18" },
];

// ─── REUSABLE COMPONENTS ───
const Badge = ({s,sm}) => { const x=STATUS_CFG[s]||{l:s,c:T.sub,bg:"#eee",i:"?"}; return <span style={{display:"inline-flex",alignItems:"center",gap:"3px",padding:sm?"2px 6px":"3px 9px",borderRadius:"14px",fontSize:sm?"9.5px":"10.5px",fontWeight:700,color:x.c,background:x.bg,whiteSpace:"nowrap",letterSpacing:".2px"}}>{x.i} {x.l}</span>; };
const DBadge = ({s}) => { const m={pending:{l:"Pending",c:T.warn,bg:T.warnBg},live:{l:"Delivered",c:T.ok,bg:T.okBg}}; const x=m[s]||m.pending; return <span style={{padding:"2px 6px",borderRadius:"8px",fontSize:"9.5px",fontWeight:700,color:x.c,background:x.bg}}>{x.l}</span>; };

const Btn = ({children,onClick,v="primary",sm,disabled,sx})=>{
  const vs={primary:{bg:T.brand,c:"#fff"},gold:{bg:T.gold,c:"#fff"},outline:{bg:"transparent",c:T.brand,border:`1px solid ${T.border}`},danger:{bg:T.err,c:"#fff"},ok:{bg:T.ok,c:"#fff"},purple:{bg:T.purple,c:"#fff"},ghost:{bg:"transparent",c:T.sub}};
  const vv=vs[v]||vs.primary;
  return <button onClick={onClick} disabled={disabled} style={{border:vv.border||"none",borderRadius:"6px",padding:sm?"5px 9px":"7px 14px",fontSize:sm?"10.5px":"11.5px",fontWeight:700,cursor:disabled?"not-allowed":"pointer",fontFamily:"inherit",opacity:disabled?.4:1,background:vv.bg,color:vv.c,display:"inline-flex",alignItems:"center",gap:"4px",whiteSpace:"nowrap",transition:"all .12s",letterSpacing:".2px",...sx}}>{children}</button>;
};

const Inp = ({value,onChange,type="text",disabled,placeholder,prefix,error})=>(
  <div style={{display:"flex"}}>
    {prefix&&<span style={{padding:"7px 8px",background:T.goldSoft,border:`1px solid ${T.border}`,borderRight:"none",borderRadius:"5px 0 0 5px",fontSize:"11px",color:T.sub,lineHeight:"1.3"}}>{prefix}</span>}
    <input type={type} value={value} onChange={onChange} disabled={disabled} placeholder={placeholder} style={{width:"100%",padding:"7px 10px",border:`1px solid ${error?T.err:T.border}`,borderRadius:prefix?"0 5px 5px 0":"5px",fontSize:"11.5px",fontFamily:"inherit",color:T.text,background:disabled?"#f3f1ed":"#fff",outline:"none",boxSizing:"border-box"}}/>
  </div>
);

const Textarea = ({value,onChange,disabled,placeholder,rows=3,error})=>(
  <textarea value={value} onChange={onChange} disabled={disabled} placeholder={placeholder} rows={rows} style={{width:"100%",padding:"7px 10px",border:`1px solid ${error?T.err:T.border}`,borderRadius:"5px",fontSize:"11.5px",fontFamily:"inherit",color:T.text,background:disabled?"#f3f1ed":"#fff",outline:"none",boxSizing:"border-box",resize:"vertical"}}/>
);

const Sel = ({value,onChange,options})=>(
  <select value={value} onChange={onChange} style={{width:"100%",padding:"7px 10px",border:`1px solid ${T.border}`,borderRadius:"5px",fontSize:"11.5px",fontFamily:"inherit",color:T.text,background:"#fff",outline:"none",boxSizing:"border-box"}}>
    {options.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
  </select>
);

const Field = ({label,children,span,error,required})=>(<div style={{gridColumn:span?`span ${span}`:undefined,marginBottom:"4px"}}><div style={{fontSize:"9.5px",fontWeight:700,color:error?T.err:T.sub,textTransform:"uppercase",letterSpacing:".6px",marginBottom:"4px"}}>{label}{required&&<span style={{color:T.err}}> *</span>}{error&&<span style={{color:T.err,fontSize:"8px",marginLeft:"4px",textTransform:"none",fontWeight:600}}>{error}</span>}</div>{children}</div>);

const Modal = ({open,onClose,title,children,w=540})=>{
  if(!open) return null;
  return <div style={{position:"fixed",inset:0,background:"rgba(10,10,20,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:"12px"}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:T.bg,borderRadius:"12px",width:`${w}px`,maxWidth:"96vw",maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,.2)"}}>
      <div style={{padding:"13px 18px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <span style={{fontWeight:800,fontSize:"14px",color:T.brand,letterSpacing:".2px"}}>{title}</span>
        <button onClick={onClose} style={{background:"none",border:"none",fontSize:"16px",cursor:"pointer",color:T.sub,padding:"2px 5px",lineHeight:1}}>✕</button>
      </div>
      <div style={{padding:"18px",overflowY:"auto",flex:1}}>{children}</div>
    </div>
  </div>;
};

const StatBox = ({l,v,c,sub})=>(<div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"8px",padding:"11px 13px"}}><div style={{fontSize:"9px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:".5px"}}>{l}</div><div style={{fontSize:"19px",fontWeight:800,color:c||T.brand,marginTop:"1px",fontFamily:"inherit"}}>{v}</div>{sub&&<div style={{fontSize:"9.5px",color:T.sub,marginTop:"1px"}}>{sub}</div>}</div>);

const Section = ({title,icon,children,action})=>(<div style={{marginBottom:"14px"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"7px"}}><span style={{fontSize:"10px",fontWeight:800,color:T.sub,textTransform:"uppercase",letterSpacing:".6px"}}>{icon} {title}</span>{action}</div>{children}</div>);
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
  const [panF, setPanF] = useState({number:"",name:""}); // PAN details
  const [payReqNote, setPayReqNote] = useState(""); // payment request note
  const [contentF, setContentF] = useState({url:"",note:""}); // for marking content live
  const [formErrors, setFormErrors] = useState({}); // validation errors
  const [rejectReasonF, setRejectReasonF] = useState(""); // rejection reason modal
  const [dropReasonF, setDropReasonF] = useState(""); // drop collab reason modal
  const [deliverableLinkF, setDeliverableLinkF] = useState({}); // unique state per deliverable {delId: url}
  const [attachmentMode, setAttachmentMode] = useState({}); // {delId: "link"|"attachment"}
  const [attachmentDesc, setAttachmentDesc] = useState({}); // {delId: description}

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

  // ── Login handler ──
  const handleLogin = () => {
    setLoginErr("");
    const u = users.find(x=>x.email.toLowerCase()===loginEmail.toLowerCase().trim());
    if(!u) { setLoginErr("No account found with this email"); return; }
    if(u.status==="inactive") { setLoginErr("This account has been deactivated. Contact admin."); return; }
    if(u.pin && u.pin !== loginPin) { setLoginErr("Incorrect PIN"); return; }
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
    supabase.from('audit_log').insert({deal_id:id,user_name:user,action,detail,created_at:ts});
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
        if(dl.st==="pending") arr.push({...dl,dealId:d.id,inf:d.inf,platform:d.platform,deadline:d.deadline,cid:d.cid});
      });
    });
    return arr;
  },[deals]);

  const pendingShip = useMemo(()=>deals.filter(d=>["approved","email_sent"].includes(d.status)&&!d.ship),[deals]);
  const inTransit = useMemo(()=>deals.filter(d=>d.ship?.st==="in_transit"),[deals]);

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
      pendingN: deals.filter(d=>d.status==="pending"||d.status==="renegotiate").length,
      disputed: deals.filter(d=>d.status==="disputed").length,
      dropped: deals.filter(d=>d.status==="dropped").length,
      pendingDels: pendingDels.length,
      pendingShip: pendingShip.length,
    };
  },[deals,pendingDels,pendingShip]);

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
    const ts = new Date().toISOString();
    const userName = loggedIn?.name||"You";

    // Build product string from products array
    const productStr = nDeal.products?.filter(p=>p.name).map(p=>p.name).join(", ") || nDeal.product;

    await supabase.from('deals').insert({
      id:dealId,
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

    const dbDels = nDeal.dels.map(dl=>({id:uid(),deal_id:dealId,type:dl.type,description:dl.desc,status:'pending',live_link:null}));
    if(dbDels.length>0) await supabase.from('deliverables').insert(dbDels);

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
        tags:"[]",
        created_at:ts
      };
      await supabase.from('influencers').insert(infData);
      setInfluencers(prev=>[{...infData,tags:[],...infData,added:ts.slice(0,10)},...prev]);
    }

    await supabase.from('audit_log').insert({
      deal_id:dealId,
      user_name:userName,
      action:'Deal created',
      detail:`${f(nDeal.amount)} | ${nDeal.dels.length} deliverables`,
      created_at:ts
    });

    const d = {
      ...nDeal,
      id:dealId,
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
  };

  const createCampaign = async () => {
    if(!nCamp.name||!nCamp.budget||!nCamp.target) return notify("Fill all fields","err");
    const campId = uid();
    await supabase.from('campaigns').insert({
      id:campId,
      name:nCamp.name,
      budget:+nCamp.budget,
      target_influencers:+nCamp.target,
      status:'active',
      deadline:nCamp.deadline||null,
      brief:nCamp.brief||null
    });
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
    supabase.from('deals').update({status:'approved',approved_by:userName,approved_at:ts}).eq('id',d.id);
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
    supabase.from('deals').update({status:'rejected',approved_by:userName,approved_at:ts,rejection_reason:reason}).eq('id',d.id);
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

    supabase.from('deals').update({status:'renegotiate',amount:+renegF.amount,renegotiation_note:renegF.note}).eq('id',renegF.dealId);

    // Insert new deliverables to Supabase
    const brandNewDels = keptDels.filter(d=>d.isNew);
    if(brandNewDels.length > 0) {
      const dbNew = brandNewDels.map(dl=>({id:dl.id,deal_id:renegF.dealId,type:dl.type,description:dl.desc,status:'pending',live_link:null}));
      await supabase.from('deliverables').insert(dbNew);
    }

    // Replace deliverables: delete removed ones
    const keptIds = newDels.map(d=>d.id);
    const currentDeal = deals.find(d=>d.id===renegF.dealId);
    const removedIds = (currentDeal?.dels||[]).map(d=>d.id).filter(id=>!keptIds.includes(id));
    if(removedIds.length>0) supabase.from('deliverables').delete().in('id',removedIds);

    upDeal(renegF.dealId,{status:"renegotiate",amount:+renegF.amount,dels:newDels});
    addLog(renegF.dealId, loggedIn?.name||"Manager", "Sent back for renegotiation", `New amount: ${f(renegF.amount)} | ${newDels.length} deliverables | Note: ${renegF.note}`);
    setSel(null);
    setModal(null);
    setRenegF(null);
    notify("Sent back with revised terms","warn");
  };

  const sendEmail = d => {
    supabase.from('deals').update({status:'email_sent',email_sent_at:new Date().toISOString()}).eq('id',d.id);
    upDeal(d.id,{status:"email_sent"});
    addLog(d.id,"System","Confirmation email sent","Auto-generated from locked data");
    setSel(null);
    setModal(null);
    notify("Confirmation email sent!");
  };

  const dispatch = () => {
    if(!shipF.track) return notify("Enter tracking ID","err");
    const userName = loggedIn?.name||"You (Logistics)";
    const ts = new Date().toISOString();
    supabase.from('shipments').insert({deal_id:sel.id,carrier:shipF.carrier,tracking_id:shipF.track,status:'in_transit',dispatched_by:userName,dispatched_at:ts});
    supabase.from('deals').update({status:'shipped'}).eq('id',sel.id);
    upDeal(sel.id,{status:"shipped",ship:{track:shipF.track,carrier:shipF.carrier,st:"in_transit",dispAt:ts,dispBy:userName,delAt:null}});
    addLog(sel.id,userName,"Shipment dispatched",`${shipF.carrier}: ${shipF.track}`);
    setSel(null);
    setModal(null);
    notify("Dispatched!");
  };

  const markDelivered = (d, deliveryDate, deliveryNote) => {
    const ts = deliveryDate || new Date().toISOString();
    const userName = loggedIn?.name||"You (Logistics)";
    supabase.from('shipments').update({status:'delivered',delivered_at:ts}).eq('deal_id',d.id);
    supabase.from('deals').update({status:'delivered_prod'}).eq('id',d.id);
    upDeal(d.id,{status:"delivered_prod",ship:{...d.ship,st:"delivered",delAt:ts}});
    addLog(d.id,userName,"Product delivered",deliveryNote||"");
    notify("Marked delivered!");
  };

  const markDelLive = (deal,delIdx,contentUrl) => {
    if(!deal.ship || deal.ship.st !== "delivered") {
      return notify("Product must be delivered before content can go live","err");
    }
    if(!contentUrl) return notify("Content URL is required","err");

    const link = contentUrl;
    const newDels = deal.dels.map((dl,i)=>i===delIdx?{...dl,st:"live",link}:dl);
    const allLive = newDels.every(dl=>dl.st==="live");
    const newStatus = allLive ? "live" : "partial_live";
    const shouldUpdateStatus = ["email_sent","shipped","delivered_prod","partial_live"].includes(deal.status);
    const delId = deal.dels[delIdx].id;

    supabase.from('deliverables').update({status:'live',live_link:link,marked_live_at:new Date().toISOString()}).eq('id',delId);
    if(shouldUpdateStatus) supabase.from('deals').update({status:newStatus}).eq('id',deal.id);

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

  const submitInvoice = (deal) => {
    if(!invF) return notify("Enter invoice amount","err");
    const match = +invF === deal.amount;
    const ts = new Date().toISOString();
    const newStatus = match?"invoice_ok":"disputed";
    supabase.from('deals').update({status:newStatus,invoice_amount:+invF,invoice_match:match,invoice_at:ts,invoice_note:match?null:"Invoice mismatch detected by system"}).eq('id',deal.id);
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
    const amt = +payF.amount;
    if(amt > remaining(sel) && amt !== sel.amount) return notify("Exceeds remaining balance!","err");
    const payId = uid();
    const ts = new Date().toISOString();
    const userName = loggedIn?.name||"You (Finance)";
    supabase.from('payments').insert({id:payId,deal_id:sel.id,type:payF.type,amount:amt,note:payF.note||null,processed_by:userName,created_at:ts});
    const newPays = [...sel.pays,{id:payId,type:payF.type,amount:amt,date:ts.slice(0,10),note:payF.note}];
    const tp = newPays.reduce((s,p)=>s+p.amount,0);
    const ns = tp>=sel.amount?"paid":tp>0?"partial_paid":sel.status;
    supabase.from('deals').update({status:ns}).eq('id',sel.id);
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
      supabase.from('deals').update({status:'payment_requested',pan_number:panNumber,pan_name:panName}).eq('id',deal.id);
      upDeal(deal.id,{status:"payment_requested",pan:{number:panNumber,name:panName}});
      addLog(deal.id,userName,"Requested payment approval",`PAN: ${panNumber} | Name: ${panName}`);
    } else if(role==="approver") {
      // Manager approves and sends to finance
      supabase.from('deals').update({status:'payment_approved',pan_number:panNumber,pan_name:panName}).eq('id',deal.id);
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
    supabase.from('deals').update({status:'payment_approved'}).eq('id',d.id);
    upDeal(d.id,{status:"payment_approved"});
    addLog(d.id,userName,"Payment approved","Forwarded to finance");
    setSel(null);
    setModal(null);
    notify("Payment request approved!");
  };

  const denyPaymentRequest = d => {
    const userName = loggedIn?.name||"Manager";
    supabase.from('deals').update({status:'live'}).eq('id',d.id);
    upDeal(d.id,{status:"live"});
    addLog(d.id,userName,"Payment request denied","Sent back to negotiator");
    setSel(null);
    setModal(null);
    notify("Payment request denied","warn");
  };

  const dropCollab = (d, reason) => {
    if(!reason || !reason.trim()) return notify("Drop reason is mandatory","err");
    const totalPaidAmount = totalPaid(d);
    if(totalPaidAmount > 0) return notify("Cannot drop a collab with payments already made","err");
    const userName = loggedIn?.name||"You (Negotiator)";
    const ts = new Date().toISOString();
    supabase.from('deals').update({status:'dropped'}).eq('id',d.id);
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

  const resetData = async () => {
    const d = await loadFromSupabase();
    setCampaigns(d.campaigns);
    setDeals(d.deals);
    setUsers(d.users.length>0?d.users:SEED_USERS);
    setInfluencers(d.influencers);
    notify("Data refreshed from Supabase");
  };

  if(!loaded) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"'Newsreader',Georgia,serif",color:T.sub}}>Loading Invogue Collab HQ...</div>;
// ═══════════════════════════ LOGIN SCREEN ═══════════════════════════
if(!loggedIn) {
  const rc = (r) => ROLE_CFG[r]||ROLE_CFG.viewer;
  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:T.brand,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=Newsreader:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box}@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}`}</style>
      <div style={{width:"100%",maxWidth:"400px",animation:"fadeUp .5s ease"}}>
        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:"32px"}}>
          <div style={{fontFamily:"'Newsreader',serif",fontSize:"28px",fontWeight:700,color:"#fff",letterSpacing:"6px",marginBottom:"6px"}}>INVOGUE</div>
          <div style={{fontSize:"10px",color:T.gold,fontWeight:800,letterSpacing:"4px"}}>COLLAB HQ</div>
          <div style={{width:"40px",height:"2px",background:T.gold,margin:"14px auto 0",borderRadius:"2px"}}/>
        </div>

        {/* Login Card */}
        <div style={{background:T.surface,borderRadius:"14px",padding:"28px 24px",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
          <div style={{fontSize:"16px",fontWeight:800,color:T.brand,marginBottom:"4px"}}>Welcome back</div>
          <div style={{fontSize:"11.5px",color:T.sub,marginBottom:"20px"}}>Sign in to your workspace</div>

          {/* Email */}
          <div style={{marginBottom:"14px"}}>
            <label style={{display:"block",fontSize:"10px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:".5px",marginBottom:"5px"}}>Email</label>
            <input type="email" value={loginEmail} onChange={e=>{setLoginEmail(e.target.value);setLoginErr("")}}
              onKeyDown={e=>e.key==="Enter"&&handleLogin()}
              placeholder="your@invogue.in"
              style={{width:"100%",padding:"11px 14px",border:`1.5px solid ${loginErr?T.err:T.border}`,borderRadius:"8px",fontSize:"13px",fontFamily:"inherit",color:T.text,outline:"none",background:"#fff",transition:"border .15s",boxSizing:"border-box"}}/>
          </div>

          {/* PIN */}
          <div style={{marginBottom:"18px"}}>
            <label style={{display:"block",fontSize:"10px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:".5px",marginBottom:"5px"}}>PIN</label>
            <input type="password" value={loginPin} onChange={e=>{setLoginPin(e.target.value);setLoginErr("")}}
              onKeyDown={e=>e.key==="Enter"&&handleLogin()}
              placeholder="••••" maxLength={6}
              style={{width:"100%",padding:"11px 14px",border:`1.5px solid ${loginErr?T.err:T.border}`,borderRadius:"8px",fontSize:"13px",fontFamily:"inherit",color:T.text,outline:"none",background:"#fff",letterSpacing:"4px",transition:"border .15s",boxSizing:"border-box"}}/>
          </div>

          {/* Error */}
          {loginErr&&<div style={{padding:"8px 12px",background:T.errBg,borderRadius:"6px",fontSize:"11px",color:T.err,fontWeight:600,marginBottom:"14px"}}>{loginErr}</div>}

          {/* Login Button */}
          <button onClick={handleLogin} style={{width:"100%",padding:"12px",background:T.gold,color:"#fff",border:"none",borderRadius:"8px",fontSize:"13px",fontWeight:800,cursor:"pointer",fontFamily:"inherit",letterSpacing:".5px",transition:"all .15s",boxShadow:"0 4px 12px rgba(176,141,66,.3)"}}>Sign In</button>
        </div>

        {/* Quick login cards */}
        <div style={{marginTop:"24px"}}>
          <div style={{fontSize:"10px",color:"rgba(255,255,255,.35)",textAlign:"center",fontWeight:700,textTransform:"uppercase",letterSpacing:"1px",marginBottom:"10px"}}>Quick Access (Demo)</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px"}}>
            {users.filter(u=>u.status==="active").map(u=>{
              const r = rc(u.role);
              return <button key={u.id} onClick={()=>{setLoggedIn(u);setView("dashboard")}}
                style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.08)",borderRadius:"8px",padding:"10px 12px",cursor:"pointer",textAlign:"left",transition:"all .15s",fontFamily:"inherit"}}
                onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,.12)";e.currentTarget.style.borderColor="rgba(255,255,255,.15)"}}
                onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.06)";e.currentTarget.style.borderColor="rgba(255,255,255,.08)"}}>
                <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                  <div style={{width:"26px",height:"26px",borderRadius:"50%",background:r.bg,color:r.c,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"9px",fontWeight:800}}>{u.avatar}</div>
                  <div>
                    <div style={{fontSize:"11px",fontWeight:700,color:"#fff"}}>{u.name}</div>
                    <div style={{fontSize:"9px",color:r.c,fontWeight:600}}>{r.i} {r.l}</div>
                  </div>
                </div>
              </button>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════ MAIN APP RENDER ═══════════════════════════
const loggedRC = ROLE_CFG[role]||ROLE_CFG.viewer;
return (
  <div style={{fontFamily:"'DM Sans',sans-serif",background:T.bg,minHeight:"100vh",color:T.text}}>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=Newsreader:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet"/>
    <style>{`*{box-sizing:border-box}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px}@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}`}</style>

    {/* TOAST */}
    {toast&&<div style={{position:"fixed",top:14,right:14,zIndex:2e3,padding:"9px 16px",borderRadius:"7px",fontSize:"11.5px",fontWeight:700,color:"#fff",background:toast.type==="err"?T.err:toast.type==="warn"?T.warn:T.ok,boxShadow:"0 8px 20px rgba(0,0,0,.15)",animation:"fadeUp .25s ease",letterSpacing:".2px"}}>{toast.msg}</div>}

    {/* ── HEADER ── */}
    <div style={{background:T.brand,padding:"10px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div style={{display:"flex",alignItems:"baseline",gap:"8px"}}>
        <span style={{fontFamily:"'Newsreader',serif",fontSize:"17px",fontWeight:700,color:"#fff",letterSpacing:"2px"}}>INVOGUE</span>
        <span style={{fontSize:"9px",color:T.gold,fontWeight:800,letterSpacing:"2px"}}>COLLAB HQ</span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"7px",padding:"4px 10px",borderRadius:"8px",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.08)"}}>
          <div style={{width:"22px",height:"22px",borderRadius:"50%",background:loggedRC.bg,color:loggedRC.c,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"8px",fontWeight:800}}>{loggedIn.avatar}</div>
          <div>
            <div style={{fontSize:"10.5px",fontWeight:700,color:"#fff",lineHeight:1.2}}>{loggedIn.name}</div>
            <div style={{fontSize:"8.5px",color:loggedRC.c,fontWeight:700}}>{loggedRC.i} {loggedRC.l}</div>
          </div>
        </div>
        <button onClick={handleLogout} style={{background:"none",border:"1px solid rgba(255,255,255,.1)",borderRadius:"5px",color:"rgba(255,255,255,.5)",fontSize:"9.5px",padding:"4px 8px",cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>Sign Out</button>
        <button onClick={resetData} title="Reset to sample data" style={{background:"none",border:"1px solid rgba(255,255,255,.08)",borderRadius:"4px",color:"rgba(255,255,255,.3)",fontSize:"8px",padding:"3px 6px",cursor:"pointer",fontFamily:"inherit"}}>Reset</button>
      </div>
    </div>

    {/* ── ROLE-AWARE NAV ── */}
    {(()=>{
      const navItems = {
        admin: [{k:"dashboard",l:"Admin Dashboard",i:"⚙️"},{k:"users",l:"Team & Users",i:"👥"},{k:"influencers",l:"Influencer DB",i:"⭐"},{k:"deals",l:"All Collabs",i:"📋"},{k:"campaigns",l:"Campaigns",i:"🎯"},{k:"deliverables",l:"Deliverables",i:"📦",n:stats.pendingDels},{k:"shipments",l:"Shipments",i:"🚚",n:stats.pendingShip+inTransit.length},{k:"audit",l:"Audit Log",i:"📜"}],
        negotiator: [{k:"dashboard",l:"My Dashboard",i:"👥"},{k:"influencers",l:"Influencer DB",i:"⭐"},{k:"deals",l:"All Collabs",i:"📋"},{k:"dropped",l:"Dropped Collabs",i:"🚫",n:stats.dropped},{k:"deliverables",l:"Deliverables",i:"📦",n:stats.pendingDels}],
        approver: [{k:"dashboard",l:"Command Center",i:"🔵"},{k:"influencers",l:"Influencer DB",i:"⭐"},{k:"deals",l:"All Collabs",i:"📋"},{k:"campaigns",l:"Campaigns",i:"🎯"},{k:"deliverables",l:"Deliverables",i:"📦",n:stats.pendingDels},{k:"shipments",l:"Shipments",i:"🚚",n:stats.pendingShip+inTransit.length}],
        finance: [{k:"dashboard",l:"Payment Center",i:"🔵"}],
        logistics: [{k:"dashboard",l:"Shipment Center",i:"🔵"},{k:"shipments",l:"All Shipments",i:"🚚",n:stats.pendingShip+inTransit.length}],
      };
      const items = navItems[role]||navItems.negotiator;
      return <div style={{background:T.surface,borderBottom:`1px solid ${T.border}`,padding:"0 20px",display:"flex",gap:"2px",overflowX:"auto"}}>
        {items.map(n=>(
          <button key={n.k} onClick={()=>setView(n.k)} style={{padding:"10px 13px",border:"none",borderBottom:view===n.k?`2px solid ${T.gold}`:"2px solid transparent",background:"none",color:view===n.k?T.brand:T.sub,fontWeight:view===n.k?800:500,fontSize:"11px",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:"4px",letterSpacing:".2px"}}>
            {n.i} {n.l}
            {n.n>0&&<span style={{background:T.err,color:"#fff",borderRadius:"7px",padding:"0 5px",fontSize:"9px",fontWeight:800,lineHeight:"15px"}}>{n.n}</span>}
          </button>
        ))}
      </div>;
    })()}

    <div style={{padding:"16px 20px",maxWidth:"1120px",margin:"0 auto"}}>

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
          <div style={{background:"linear-gradient(135deg,#141824 0%,#2D1F4E 100%)",borderRadius:"10px",padding:"16px 20px",marginBottom:"16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:"17px",fontWeight:800,color:"#fff"}}>⚙️ Admin Control Panel</div>
              <div style={{fontSize:"11px",color:"rgba(255,255,255,.5)",marginTop:"2px"}}>Super access — all roles, all data, all controls</div>
            </div>
            <div style={{display:"flex",gap:"6px"}}>
              <Btn v="gold" sm onClick={()=>setView("users")}>Manage Team</Btn>
              <Btn v="outline" sm sx={{borderColor:"rgba(255,255,255,.2)",color:"rgba(255,255,255,.7)"}} onClick={()=>setView("audit")}>Audit Logs</Btn>
            </div>
          </div>

          {/* Key Metrics */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:"8px",marginBottom:"16px"}}>
            <StatBox l="Total Committed" v={f(stats.committed)} c={T.gold}/>
            <StatBox l="Total Paid" v={f(stats.paid)} c={T.ok}/>
            <StatBox l="Outstanding" v={f(totalOutstanding)} c={T.err}/>
            <StatBox l="Pending Approval" v={stats.pendingN} c={stats.pendingN>0?T.warn:T.ok}/>
            <StatBox l="Active Disputes" v={stats.disputed} c={stats.disputed>0?T.err:T.ok}/>
            <StatBox l="Active Team" v={activeUsers.length} c={T.info} sub={`${users.length} total`}/>
            <StatBox l="Total Deals" v={deals.length} c={T.brand}/>
            <StatBox l="Pending Shipments" v={stats.pendingShip} c={stats.pendingShip>0?T.purple:T.ok}/>
          </div>

          {/* APPROVAL QUEUE — Admin can approve */}
          {pendingApproval.length>0&&<Section title={`Approval Queue (${pendingApproval.length})`} icon="⚡" action={<span style={{fontSize:"10px",color:T.err,fontWeight:700,animation:"pulse 1.5s infinite"}}>Action Required</span>}>
            {pendingApproval.map(d=><div key={d.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${T.warn}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"6px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700,fontSize:"12.5px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400,fontSize:"11px"}}>· {d.platform} · {d.followers}</span></div>
                <div style={{fontSize:"10px",color:T.sub}}>{d.product} · {d.dels.length} deliverables · by {d.by} · {getCamp(d.cid)?.name||""}</div>
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
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontWeight:700}}>{d.inf}</span><span style={{fontSize:"11px",color:T.err,fontWeight:700}}>Invoice: {f(d.inv?.amount)} vs Approved: {f(d.amount)}</span></div>
              <div style={{fontSize:"10px",color:T.sub,marginTop:"2px"}}>{d.inv?.note||""} — by {d.by}</div>
            </div>)}
          </Section>}

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
            {/* PAYMENTS DUE */}
            <Section title={`Payments Due (${needPayment.length})`} icon="💰" action={<span style={{fontSize:"10px",color:T.sub}}>{f(totalOutstanding)} total</span>}>
              {needPayment.length===0&&<div style={{fontSize:"11px",color:T.sub,padding:"8px 0"}}>All clear</div>}
              {needPayment.slice(0,6).map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"6px",padding:"7px 10px",marginBottom:"3px",fontSize:"11px",display:"flex",justifyContent:"space-between",cursor:"pointer"}}>
                <span><b>{d.inf}</b></span>
                <span><span style={{color:T.ok}}>{f(totalPaid(d))}</span>/<b>{f(d.amount)}</b> <span style={{color:T.warn,fontWeight:700}}>Due {f(remaining(d))}</span></span>
              </div>)}
            </Section>

            {/* SHIPMENTS */}
            <Section title={`Shipments`} icon="📦" action={<Btn v="ghost" sm onClick={()=>setView("shipments")}>View all →</Btn>}>
              {pendingShip.length===0&&inTransit.length===0&&<div style={{fontSize:"11px",color:T.sub,padding:"8px 0"}}>All shipped & delivered</div>}
              {pendingShip.map(d=><div key={d.id} style={{background:T.warnBg,border:`1px solid ${T.border}`,borderRadius:"6px",padding:"6px 10px",marginBottom:"3px",fontSize:"11px",display:"flex",justifyContent:"space-between"}}>
                <span><b>{d.inf}</b> · {d.product}</span><span style={{color:T.warn,fontWeight:700}}>Awaiting dispatch</span>
              </div>)}
              {inTransit.map(d=><div key={d.id} style={{background:T.purpleBg,border:`1px solid ${T.border}`,borderRadius:"6px",padding:"6px 10px",marginBottom:"3px",fontSize:"11px",display:"flex",justifyContent:"space-between"}}>
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
                      <div style={{width:"28px",height:"28px",borderRadius:"50%",background:rc.bg,color:rc.c,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"10px",fontWeight:800}}>{u.avatar}</div>
                      <div><div style={{fontWeight:700,fontSize:"12px"}}>{u.name}</div><div style={{fontSize:"9.5px",color:T.sub}}>{u.email}</div></div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:"4px",alignItems:"center"}}>
                    <span style={{padding:"2px 6px",borderRadius:"8px",fontSize:"9px",fontWeight:700,color:rc.c,background:rc.bg}}>{rc.i} {rc.l}</span>
                    <span style={{fontSize:"9.5px",color:T.sub}}>{uDeals.length} deals</span>
                    {uDisputed>0&&<span style={{fontSize:"9.5px",color:T.err,fontWeight:700}}>{uDisputed} disputes</span>}
                  </div>
                </div>;
              })}
            </div>
          </Section>

          {/* OVERDUE DELIVERABLES */}
          {overdueDels.length>0&&<Section title={`Overdue Deliverables (${overdueDels.length})`} icon="🚨">
            {overdueDels.map((d,i)=><div key={i} style={{background:"#FFF8F5",border:`1px solid ${T.err}22`,borderRadius:"6px",padding:"7px 10px",marginBottom:"3px",fontSize:"11px",display:"flex",justifyContent:"space-between"}}>
              <span><b>{d.inf}</b> · {d.type}: {d.desc||"—"}</span><span style={{color:T.err,fontWeight:700}}>Due: {d.deadline}</span>
            </div>)}
          </Section>}

          {/* CAMPAIGN BUDGETS */}
          <Section title="🎯 Campaign Budgets" icon="" action={<Btn v="gold" sm onClick={()=>{setNCamp({name:"",budget:"",target:"",deadline:""});setModal("newCamp")}}>+ New Campaign</Btn>}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:"8px"}}>
              {campaigns.map(c=>{const comm=campCommitted(c.id),pct=c.budget>0?Math.round(comm/c.budget*100):0;return <div key={c.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"7px",padding:"11px"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:"5px"}}><span style={{fontWeight:700,fontSize:"12px"}}>{c.name}</span><span style={{fontSize:"10px",fontWeight:700,color:pct>90?T.err:T.ok}}>{pct}%</span></div>
                <div style={{height:"4px",borderRadius:"3px",background:T.border,overflow:"hidden",marginBottom:"5px"}}><div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:pct>90?T.err:pct>70?T.warn:T.ok,borderRadius:"3px"}}/></div>
                <div style={{fontSize:"10px",color:T.sub}}>{f(comm)} / {f(c.budget)} · {campLocked(c.id)}/{c.target} influencers</div>
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
          if(users.some(u=>u.email===userF.email)) { notify("Email already exists","err"); return; }
          const initials = userF.name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
          const newId = uid();
          supabase.from('users').insert({id:newId,name:userF.name,email:userF.email,role:userF.role,status:'active',avatar:initials,pin:'1111'});
          setUsers(prev=>[...prev,{id:newId,name:userF.name,email:userF.email,role:userF.role,status:"active",created:new Date().toISOString().slice(0,10),avatar:initials,pin:"1111"}]);
          setUserF({name:"",email:"",role:"negotiator"});
          setModal(null);
          notify(`${userF.name} added as ${ROLE_CFG[userF.role]?.l||userF.role}!`);
        };

        const toggleUserStatus = (userId) => {
          const user = users.find(u=>u.id===userId);
          const newStatus = user?.status==="active"?"inactive":"active";
          supabase.from('users').update({status:newStatus}).eq('id',userId);
          setUsers(prev=>prev.map(u=>u.id===userId?{...u,status:newStatus}:u));
          notify("User status updated");
        };

        const changeUserRole = (userId,newRole) => {
          supabase.from('users').update({role:newRole}).eq('id',userId);
          setUsers(prev=>prev.map(u=>u.id===userId?{...u,role:newRole}:u));
          notify("Role updated");
        };

        return <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
            <div>
              <div style={{fontSize:"16px",fontWeight:800}}>👥 Team & User Management</div>
              <div style={{fontSize:"11px",color:T.sub}}>Create users, assign roles, manage access</div>
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
                <div><div style={{fontSize:"16px",fontWeight:800,color:v.c}}>{count}</div><div style={{fontSize:"9px",fontWeight:700,color:v.c,textTransform:"uppercase"}}>{v.l}s</div></div>
              </div>;
            })}
          </div>

          {/* Users table */}
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"9px",overflow:"hidden"}}>
            <div style={{display:"grid",gridTemplateColumns:"40px 1.5fr 1.5fr 1fr 0.8fr 1.2fr",padding:"10px 14px",background:T.brand,fontSize:"9px",fontWeight:800,color:"rgba(255,255,255,.6)",textTransform:"uppercase",letterSpacing:".5px"}}>
              <div></div><div>Name</div><div>Email</div><div>Role</div><div>Status</div><div>Actions</div>
            </div>
            {users.map(u=>{
              const rc = ROLE_CFG[u.role]||ROLE_CFG.viewer;
              return <div key={u.id} style={{display:"grid",gridTemplateColumns:"40px 1.5fr 1.5fr 1fr 0.8fr 1.2fr",padding:"10px 14px",borderBottom:`1px solid ${T.border}`,fontSize:"11.5px",alignItems:"center",opacity:u.status==="inactive"?.5:1}}>
                <div style={{width:"28px",height:"28px",borderRadius:"50%",background:rc.bg,color:rc.c,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"10px",fontWeight:800}}>{u.avatar}</div>
                <div style={{fontWeight:700}}>{u.name}</div>
                <div style={{color:T.sub,fontSize:"11px"}}>{u.email}</div>
                <div>
                  <select value={u.role} onChange={e=>changeUserRole(u.id,e.target.value)} style={{padding:"3px 6px",borderRadius:"4px",border:`1px solid ${T.border}`,fontSize:"10px",fontWeight:700,color:rc.c,background:rc.bg,fontFamily:"inherit",cursor:"pointer"}}>
                    <option value="negotiator">Negotiator</option>
                    <option value="approver">Manager</option>
                    <option value="finance">Finance</option>
                    <option value="logistics">Logistics</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
                <div>
                  <span style={{padding:"2px 7px",borderRadius:"8px",fontSize:"9.5px",fontWeight:700,color:u.status==="active"?T.ok:T.err,background:u.status==="active"?T.okBg:T.errBg}}>{u.status==="active"?"Active":"Inactive"}</span>
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
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr 1fr 1fr",padding:"8px 12px",background:T.brand,fontSize:"8.5px",fontWeight:800,color:"rgba(255,255,255,.6)",textTransform:"uppercase",letterSpacing:".4px"}}>
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
                <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr 1fr 1fr",padding:"6px 12px",borderBottom:`1px solid ${T.border}`,fontSize:"10.5px"}}>
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

        return <>
          <div style={{marginBottom:"16px"}}>
            <div style={{fontSize:"16px",fontWeight:800}}>📜 Global Audit Log</div>
            <div style={{fontSize:"11px",color:T.sub}}>Complete activity trail across all deals and users — {allLogs.length} entries</div>
          </div>
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"9px",overflow:"hidden"}}>
            <div style={{display:"grid",gridTemplateColumns:"1.2fr 1fr 1.5fr 2fr 0.8fr",padding:"9px 14px",background:T.brand,fontSize:"9px",fontWeight:800,color:"rgba(255,255,255,.6)",textTransform:"uppercase",letterSpacing:".5px"}}>
              <div>Timestamp</div><div>User</div><div>Action</div><div>Details</div><div>Influencer</div>
            </div>
            {allLogs.slice(0,50).map((lg,i)=>{
              const isFinancial = lg.a.toLowerCase().includes("payment")||lg.a.toLowerCase().includes("approved")||lg.a.toLowerCase().includes("invoice")||lg.a.toLowerCase().includes("dispute");
              return <div key={i} style={{display:"grid",gridTemplateColumns:"1.2fr 1fr 1.5fr 2fr 0.8fr",padding:"7px 14px",borderBottom:`1px solid ${T.border}`,fontSize:"11px",alignItems:"center",background:isFinancial?"#FFFDF5":"transparent"}}>
                <div style={{color:T.sub,fontSize:"10px",fontFamily:"monospace"}}>{lg.t}</div>
                <div style={{fontWeight:600}}>{lg.u}</div>
                <div>
                  <span style={{fontWeight:700}}>{lg.a}</span>
                  {isFinancial&&<span style={{marginLeft:"4px",padding:"1px 4px",borderRadius:"3px",fontSize:"8px",fontWeight:700,background:T.warnBg,color:T.warn}}>₹</span>}
                </div>
                <div style={{color:T.sub,fontSize:"10.5px"}}>{lg.d||"—"}</div>
                <div style={{fontWeight:600,fontSize:"10.5px"}}>{lg.inf}</div>
              </div>;
            })}
          </div>
          {allLogs.length>50&&<div style={{textAlign:"center",padding:"12px",fontSize:"11px",color:T.sub}}>Showing 50 of {allLogs.length} entries</div>}
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
          (["live","partial_live"].includes(d.status)&&!d.inv) // needs invoice
        );
        const myActive = myDeals.filter(d=>!["rejected","paid","pending","renegotiate","dropped"].includes(d.status));
        const myCompleted = myDeals.filter(d=>d.status==="paid");
        const myDropped = myDeals.filter(d=>d.status==="dropped");
        return <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}>
            <div><span style={{fontSize:"16px",fontWeight:800}}>👤 My Dashboard</span><span style={{fontSize:"11px",color:T.sub,marginLeft:"8px"}}>Your collaborations at a glance</span></div>
            <Btn v="gold" sm onClick={()=>{setNDeal({inf:"",platform:"Instagram",followers:"",product:"",amount:"",usage:"6 months",deadline:"",profile:"",phone:"",address:"",cid:campaigns[0]?.id||"c1",dels:[{id:uid(),type:"Reel",desc:"",st:"pending",link:""}]});setModal("newDeal")}}>+ New Deal</Btn>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:"8px",marginBottom:"16px"}}>
            <StatBox l="Needs My Action" v={myNeedAction.length} c={myNeedAction.length>0?T.warn:T.ok} sub="Do these now"/>
            <StatBox l="Pending Approval" v={myPending.length} c={myPending.length>0?T.warn:T.ok} sub="With manager"/>
            <StatBox l="Active Collabs" v={myActive.length} c={T.info}/>
            <StatBox l="Content Pending" v={myDeals.reduce((s,d)=>s+d.dels.filter(x=>x.st==="pending").length,0)} c={T.purple}/>
            <StatBox l="Completed" v={myCompleted.length} c={T.ok}/>
          </div>

          {/* NEEDS ACTION — Priority Queue */}
          {myNeedAction.length>0&&<Section title={`Needs Your Action (${myNeedAction.length})`} icon="⚡">
            {myNeedAction.map(d=>{
              let actionLabel = "";
              let actionColor = T.warn;
              if(d.status==="approved") { actionLabel="Send Confirmation Email"; actionColor=T.info; }
              else if(["shipped","delivered_prod","email_sent","partial_live"].includes(d.status)&&d.dels.some(dl=>dl.st==="pending")) { actionLabel=`${d.dels.filter(dl=>dl.st==="pending").length} deliverables to mark live`; actionColor=T.purple; }
              else if(["live","partial_live"].includes(d.status)&&!d.inv) { actionLabel="Submit Invoice"; actionColor=T.gold; }
              else if(d.status==="payment_requested") { actionLabel="Payment Requested - with Manager"; actionColor=T.info; }
              else { actionLabel="Review needed"; }
              return <div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${actionColor}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"6px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"all .12s"}}
                onMouseEnter={e=>e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.06)"}
                onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                <div>
                  <div style={{fontWeight:700,fontSize:"12.5px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400,fontSize:"11px"}}>· {d.platform}</span></div>
                  <div style={{fontSize:"10px",color:T.sub}}>{d.product} · {getCamp(d.cid)?.name||""}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:"10px",fontWeight:700,color:actionColor}}>{actionLabel}</div>
                  <Badge s={d.status} sm/>
                </div>
              </div>;
            })}
          </Section>}

          {/* Pending Approval */}
          {myPending.length>0&&<Section title={`Awaiting Manager Approval (${myPending.length})`} icon="⏳">
            {myPending.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"5px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><span style={{fontWeight:700,fontSize:"12px"}}>{d.inf}</span> <span style={{color:T.sub,fontSize:"11px"}}>· {f(d.amount)} · {d.dels.length} deliverables</span></div>
              <Badge s={d.status} sm/>
            </div>)}
          </Section>}

          {/* Renegotiation Requests */}
          {myRenegotiations.length>0&&<Section title={`Renegotiation Requests (${myRenegotiations.length})`} icon="🔄">
            {myRenegotiations.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:"#fff8f0",border:`1px solid ${T.warnBg}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"5px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><span style={{fontWeight:700,fontSize:"12px"}}>{d.inf}</span> <span style={{color:T.sub,fontSize:"11px"}}>· {f(d.amount)} · {d.dels.length} deliverables</span></div>
              <Badge s={d.status} sm/>
            </div>)}
          </Section>}

          {/* Shipment Tracking */}
          <Section title="📦 My Shipment Tracker" icon="">
            {myDeals.filter(d=>d.ship&&d.ship.st==="in_transit").length===0&&myDeals.filter(d=>["approved","email_sent"].includes(d.status)&&!d.ship).length===0&&<div style={{fontSize:"11px",color:T.sub,padding:"8px 0"}}>No active shipments</div>}
            {myDeals.filter(d=>["approved","email_sent"].includes(d.status)&&!d.ship).map(d=><div key={d.id} style={{background:T.warnBg,border:`1px solid ${T.border}`,borderRadius:"6px",padding:"8px 10px",marginBottom:"4px",fontSize:"11px",display:"flex",justifyContent:"space-between"}}>
              <span><b>{d.inf}</b> · {d.product}</span><span style={{color:T.warn,fontWeight:700}}>Awaiting dispatch</span>
            </div>)}
            {myDeals.filter(d=>d.ship?.st==="in_transit").map(d=><div key={d.id} style={{background:T.purpleBg,border:`1px solid ${T.border}`,borderRadius:"6px",padding:"8px 10px",marginBottom:"4px",fontSize:"11px",display:"flex",justifyContent:"space-between"}}>
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
                  <div style={{fontSize:"10px",color:T.sub,marginBottom:"5px"}}>{d.product} · {getCamp(d.cid)?.name||""}</div>
                  <div style={{display:"flex",gap:"2px",marginBottom:"4px"}}>{d.dels.map((dl,i)=><div key={i} style={{flex:1,height:"3px",borderRadius:"2px",background:dl.st==="live"?T.ok:T.border}}/>)}</div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:"10px"}}><span style={{fontWeight:800,color:T.gold}}>{f(d.amount)}</span><span style={{color:T.sub}}>{done}/{d.dels.length} content</span></div>
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
          <div style={{marginBottom:"14px"}}><span style={{fontSize:"16px",fontWeight:800}}>✅ Command Center</span><span style={{fontSize:"11px",color:T.sub,marginLeft:"8px"}}>Full operational overview</span></div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:"8px",marginBottom:"16px"}}>
            <StatBox l="Committed" v={f(stats.committed)} c={T.gold}/>
            <StatBox l="Paid Out" v={f(stats.paid)} c={T.ok}/>
            <StatBox l="Outstanding" v={f(stats.committed-stats.paid)} c={T.warn}/>
            <StatBox l="Pending Approval" v={stats.pendingN} c={stats.pendingN>0?T.warn:T.ok}/>
            <StatBox l="Disputes" v={stats.disputed} c={stats.disputed>0?T.err:T.ok}/>
            <StatBox l="Overdue Content" v={overdueDels.length} c={overdueDels.length>0?T.err:T.ok}/>
          </div>

          {/* APPROVAL QUEUE */}
          {pendingApproval.length>0&&<Section title={`Approval Queue (${pendingApproval.length})`} icon="⚡" action={<span style={{fontSize:"10px",color:T.err,fontWeight:700,animation:"pulse 1.5s infinite"}}>Action Required</span>}>
            {pendingApproval.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${T.warn}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"6px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"all .12s"}}
              onMouseEnter={e=>e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.06)"}
              onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
              <div>
                <div style={{fontWeight:700,fontSize:"12.5px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400,fontSize:"11px"}}>· {d.platform} · {d.followers}</span></div>
                <div style={{fontSize:"10px",color:T.sub}}>{d.product} · {d.dels.length} deliverables · by {d.by} · {getCamp(d.cid)?.name||""}</div>
                <div style={{display:"flex",gap:"3px",marginTop:"4px"}}>{d.dels.map((dl,i)=><span key={i} style={{padding:"1px 5px",borderRadius:"4px",fontSize:"9px",fontWeight:600,background:T.warnBg,color:T.warn}}>{dl.type}</span>)}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:"6px"}} onClick={e=>e.stopPropagation()}>
                <span style={{fontWeight:800,fontSize:"14px",color:T.gold}}>{f(d.amount)}</span>
                <Btn v="ok" sm onClick={()=>setConfirmAction({title:"Approve Deal",msg:"Approve and lock "+f(d.amount)+" for "+d.inf+"?",onConfirm:()=>{approveDeal(d);setConfirmAction(null)}})}>✓</Btn>
                <Btn v="outline" sm onClick={()=>setConfirmAction({title:"Request Renegotiation",msg:"Renegotiate "+d.inf+" deal?",onConfirm:()=>{renegDeal(d);setConfirmAction(null)}})}>↩</Btn>
                <Btn v="danger" sm onClick={()=>openRejectModal(d)}>✕</Btn>
              </div>
            </div>)}
          </Section>}

          {/* DISPUTES */}
          {disputed.length>0&&<Section title={`Active Disputes (${disputed.length})`} icon="⚠">
            {disputed.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.errBg,border:`1px solid ${T.err}33`,borderRadius:"7px",padding:"10px 12px",marginBottom:"5px",cursor:"pointer"}}>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontWeight:700,fontSize:"12px"}}>{d.inf}</span><span style={{fontSize:"11px",color:T.err,fontWeight:700}}>Invoice: {f(d.inv?.amount)} vs Approved: {f(d.amount)}</span></div>
              <div style={{fontSize:"10px",color:T.sub,marginTop:"2px"}}>{d.inv?.note||"Mismatch detected"}</div>
            </div>)}
          </Section>}

          {/* PAYMENT REQUESTS */}
          {(()=>{
            const payReqs = deals.filter(d=>d.status==="payment_requested");
            return payReqs.length>0 && <Section title={`Payment Requests (${payReqs.length})`} icon="💸" action={<span style={{fontSize:"10px",color:T.warn,fontWeight:700}}>Review Required</span>}>
              {payReqs.map(d=><div key={d.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${T.info}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"6px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:"12.5px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400,fontSize:"11px"}}>· {f(d.amount)}</span></div>
                  <div style={{fontSize:"10px",color:T.sub}}>{d.product} · PAN: {d.pan?.number||"N/A"}</div>
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
            {pendingShip.map(d=><div key={d.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"6px",padding:"8px 10px",marginBottom:"4px",fontSize:"11px",display:"flex",justifyContent:"space-between"}}>
              <span><b>{d.inf}</b> · {d.product}</span><span style={{color:T.warn,fontWeight:700}}>Awaiting logistics</span>
            </div>)}
          </Section>}

          {/* PAYMENT OVERVIEW */}
          {needPayment.length>0&&<Section title={`Outstanding Payments (${needPayment.length})`} icon="💰" action={<span style={{fontSize:"10px",color:T.sub}}>{f(needPayment.reduce((s,d)=>s+remaining(d),0))} total outstanding</span>}>
            {needPayment.slice(0,8).map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"6px",padding:"8px 10px",marginBottom:"4px",fontSize:"11px",display:"flex",justifyContent:"space-between",cursor:"pointer"}}>
              <div><b>{d.inf}</b> <span style={{color:T.sub}}>· {getCamp(d.cid)?.name||""}</span></div>
              <div><span style={{color:T.ok}}>{f(totalPaid(d))}</span> / <b>{f(d.amount)}</b> <span style={{color:T.warn,fontWeight:700,marginLeft:"4px"}}>Due: {f(remaining(d))}</span></div>
            </div>)}
          </Section>}

          {/* OVERDUE DELIVERABLES */}
          {overdueDels.length>0&&<Section title={`Overdue Deliverables (${overdueDels.length})`} icon="🚨">
            {overdueDels.map((d,i)=><div key={i} style={{background:"#FFF8F5",border:`1px solid ${T.err}22`,borderRadius:"6px",padding:"7px 10px",marginBottom:"3px",fontSize:"11px",display:"flex",justifyContent:"space-between"}}>
              <span><b>{d.inf}</b> · {d.type}: {d.desc||"—"}</span><span style={{color:T.err,fontWeight:700}}>Due: {d.deadline}</span>
            </div>)}
          </Section>}

          {/* CAMPAIGNS SUMMARY */}
          <Section title="🎯 Campaign Overview" icon="" action={<Btn v="ghost" sm onClick={()=>setView("campaigns")}>Manage →</Btn>}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:"8px"}}>
              {campaigns.map(c=>{const comm=campCommitted(c.id),pct=c.budget>0?Math.round(comm/c.budget*100):0;return <div key={c.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"7px",padding:"11px"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:"5px"}}><span style={{fontWeight:700,fontSize:"12px"}}>{c.name}</span><span style={{fontSize:"10px",fontWeight:700,color:pct>90?T.err:T.ok}}>{pct}%</span></div>
                <div style={{height:"4px",borderRadius:"3px",background:T.border,overflow:"hidden",marginBottom:"5px"}}><div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:pct>90?T.err:pct>70?T.warn:T.ok,borderRadius:"3px"}}/></div>
                <div style={{fontSize:"10px",color:T.sub}}>{f(comm)} / {f(c.budget)} · {campLocked(c.id)}/{c.target} influencers</div>
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
          <div style={{marginBottom:"14px"}}><span style={{fontSize:"16px",fontWeight:800}}>💰 Payment Center</span><span style={{fontSize:"11px",color:T.sub,marginLeft:"8px"}}>All payment operations</span></div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:"8px",marginBottom:"16px"}}>
            <StatBox l="Total Outstanding" v={f(totalOutstanding)} c={T.err} sub="Across all deals"/>
            <StatBox l="Ready to Pay" v={pendingPayments.length} c={pendingPayments.length>0?T.warn:T.ok} sub="Invoice matched"/>
            <StatBox l="Disputes" v={disputed.length} c={disputed.length>0?T.err:T.ok} sub="Need resolution"/>
            <StatBox l="Advances Due" v={advanceDue.length} c={advanceDue.length>0?T.info:T.ok} sub="No payment yet"/>
            <StatBox l="Total Paid" v={f(stats.paid)} c={T.ok} sub="This period"/>
          </div>

          {/* DISPUTES — TOP PRIORITY */}
          {disputed.length>0&&<Section title={`⚠ Disputes — Resolve First (${disputed.length})`} icon="" action={<span style={{fontSize:"10px",color:T.err,fontWeight:700,animation:"pulse 1.5s infinite"}}>Urgent</span>}>
            {disputed.map(d=><div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.errBg,border:`1px solid ${T.err}33`,borderLeft:`3px solid ${T.err}`,borderRadius:"7px",padding:"11px 13px",marginBottom:"6px",cursor:"pointer"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:"12.5px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400}}>· {d.platform}</span></div>
                  <div style={{fontSize:"10px",color:T.sub,marginTop:"1px"}}>{d.product} · {getCamp(d.cid)?.name||""}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:"10px",color:T.err,fontWeight:700}}>Invoice: {f(d.inv?.amount)}</div>
                  <div style={{fontSize:"10px",color:T.ok,fontWeight:700}}>Approved: {f(d.amount)}</div>
                  <div style={{fontSize:"10px",color:T.err}}>Δ {f(Math.abs((d.inv?.amount||0)-d.amount))}</div>
                </div>
              </div>
              {d.inv?.note&&<div style={{fontSize:"10px",color:T.err,marginTop:"4px",fontStyle:"italic"}}>{d.inv.note}</div>}
            </div>)}
          </Section>}

          {/* READY TO PAY — Invoice Matched */}
          <Section title={`Ready to Pay (${pendingPayments.length})`} icon="💳" action={<span style={{fontSize:"10px",color:T.sub}}>{f(pendingPayments.reduce((s,d)=>s+remaining(d),0))} total</span>}>
            {pendingPayments.length===0&&<div style={{fontSize:"11px",color:T.sub,padding:"8px 0"}}>No invoices pending payment</div>}
            {pendingPayments.map(d=>{
              const paid=totalPaid(d),rem=remaining(d);
              return <div key={d.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"5px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:"12px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400,fontSize:"11px"}}>· {getCamp(d.cid)?.name||""}</span></div>
                  <div style={{fontSize:"10px",color:T.sub}}>Locked: {f(d.amount)} · Paid: {f(paid)} · <b style={{color:T.warn}}>Due: {f(rem)}</b></div>
                  {paid>0&&<div style={{height:"3px",borderRadius:"2px",background:T.border,marginTop:"4px",width:"120px"}}><div style={{height:"100%",width:`${(paid/d.amount)*100}%`,background:T.ok,borderRadius:"2px"}}/></div>}
                </div>
                <Btn v="ok" sm onClick={()=>{setSel(d);setPayF({type:paid===0?"advance":"final",amount:String(rem),note:""});setModal("payment")}}>Pay {f(rem)}</Btn>
              </div>;
            })}
          </Section>

          {/* ADVANCES DUE */}
          {advanceDue.length>0&&<Section title={`Advance Payments Pending (${advanceDue.length})`} icon="⏰">
            {advanceDue.map(d=><div key={d.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"6px",padding:"8px 10px",marginBottom:"4px",fontSize:"11px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><b>{d.inf}</b> <span style={{color:T.sub}}>· {f(d.amount)} · {d.status==="approved"?"Just approved":d.status==="shipped"?"Product shipped":"In progress"}</span></div>
              <Btn v="outline" sm onClick={()=>{setSel(d);setPayF({type:"advance",amount:"",note:""});setModal("payment")}}>Record Advance</Btn>
            </div>)}
          </Section>}

          {/* RECENT PAYMENTS */}
          <Section title="Recently Completed" icon="✅">
            {recentPaid.length===0&&<div style={{fontSize:"11px",color:T.sub,padding:"8px 0"}}>No completed payments yet</div>}
            {recentPaid.map(d=><div key={d.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"6px",padding:"8px 10px",marginBottom:"3px",fontSize:"11px",display:"flex",justifyContent:"space-between",opacity:.7}}>
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
        return <>
          <div style={{marginBottom:"14px"}}><span style={{fontSize:"16px",fontWeight:800}}>📦 Shipment Center</span><span style={{fontSize:"11px",color:T.sub,marginLeft:"8px"}}>Dispatch and track all shipments</span></div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:"8px",marginBottom:"16px"}}>
            <StatBox l="Awaiting Dispatch" v={pendingShip.length} c={pendingShip.length>0?T.err:T.ok} sub="Ship these now"/>
            <StatBox l="In Transit" v={inTransit.length} c={inTransit.length>0?T.purple:T.ok}/>
            <StatBox l="Delivered" v={delivered.length} c={T.ok}/>
            <StatBox l="Total Shipments" v={deals.filter(d=>d.ship).length} c={T.brand}/>
          </div>

          {/* DISPATCH QUEUE */}
          <Section title={`Awaiting Dispatch (${pendingShip.length})`} icon="⚡" action={pendingShip.length>0?<span style={{fontSize:"10px",color:T.err,fontWeight:700,animation:"pulse 1.5s infinite"}}>Action Required</span>:null}>
            {pendingShip.length===0&&<div style={{fontSize:"11px",color:T.sub,padding:"10px 0"}}>All products dispatched! 🎉</div>}
            {pendingShip.map(d=><div key={d.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${T.err}`,borderRadius:"7px",padding:"12px 14px",marginBottom:"7px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"6px"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:"13px"}}>{d.inf}</div>
                  <div style={{fontSize:"11px",color:T.sub,marginTop:"2px"}}>📦 <b>{d.product}</b></div>
                </div>
                <Btn v="purple" onClick={()=>{setSel(d);setShipF({track:"",carrier:"DTDC"});setModal("ship")}}>📦 Dispatch Now</Btn>
              </div>
              <div style={{padding:"8px 10px",background:T.purpleBg,borderRadius:"5px",fontSize:"10.5px",color:T.purple}}>
                <div>📍 <b>Ship to:</b> {d.address||"Address not provided"}</div>
                <div style={{marginTop:"2px"}}>📱 <b>Phone:</b> {d.phone||"Not provided"}</div>
              </div>
              <div style={{fontSize:"10px",color:T.sub,marginTop:"4px"}}>Approved: {d.appAt} · Deadline: {d.deadline}</div>
            </div>)}
          </Section>

          {/* IN TRANSIT */}
          <Section title={`In Transit (${inTransit.length})`} icon="🚚">
            {inTransit.length===0&&<div style={{fontSize:"11px",color:T.sub,padding:"8px 0"}}>Nothing in transit</div>}
            {inTransit.map(d=><div key={d.id} style={{background:T.purpleBg,border:`1px solid ${T.purple}22`,borderRadius:"7px",padding:"11px 13px",marginBottom:"6px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700,fontSize:"12.5px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400}}>· {d.product}</span></div>
                <div style={{fontSize:"11px",marginTop:"2px"}}>{d.ship.carrier}: <span style={{color:T.info,fontWeight:700}}>{d.ship.track}</span></div>
                <div style={{fontSize:"10px",color:T.sub}}>Dispatched: {d.ship.dispAt}</div>
              </div>
              <Btn v="ok" onClick={()=>{setSel(d);setDeliveryF({date:new Date().toISOString().slice(0,10),note:""});setModal("markDelivered")}}>✓ Mark Delivered</Btn>
            </div>)}
          </Section>

          {/* DELIVERED */}
          <Section title={`Delivered (${delivered.length})`} icon="✅">
            {delivered.map(d=><div key={d.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"6px",padding:"8px 10px",marginBottom:"3px",fontSize:"11px",display:"flex",justifyContent:"space-between",opacity:.65}}>
              <span><b>{d.inf}</b> · {d.product} · {d.ship.carrier}: {d.ship.track}</span>
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
              <div><span style={{fontSize:"16px",fontWeight:800}}>⭐ Influencer Database</span><span style={{fontSize:"11px",color:T.sub,marginLeft:"8px"}}>{influencers.length} influencers</span></div>
              {(role==="negotiator"||role==="admin")&&<Btn v="gold" sm onClick={()=>setModal("newInfluencer")}>+ Add Influencer</Btn>}
            </div>

            {/* Stats */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:"8px",marginBottom:"14px"}}>
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
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=T.gold;e.currentTarget.style.boxShadow="0 3px 12px rgba(0,0,0,.05)"}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.boxShadow="none"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"8px"}}>
                    <div style={{display:"flex",gap:"10px",alignItems:"center"}}>
                      <div style={{width:"36px",height:"36px",borderRadius:"50%",background:`linear-gradient(135deg,${T.goldSoft},${T.goldMid})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"13px",fontWeight:800,color:T.gold}}>{inf.name.split(" ").map(w=>w[0]).join("")}</div>
                      <div>
                        <div style={{fontWeight:800,fontSize:"13px"}}>{inf.name}</div>
                        <div style={{fontSize:"10px",color:T.sub}}>{inf.platform} · {inf.followers} · {inf.city}</div>
                      </div>
                    </div>
                    <span style={{padding:"2px 7px",borderRadius:"8px",fontSize:"10px",fontWeight:800,color:ratingColor,background:ratingColor+"18"}}>{inf.rating}</span>
                  </div>
                  <div style={{fontSize:"10px",color:T.sub,marginBottom:"6px"}}>{inf.category} · POC: {inf.poc}</div>
                  <div style={{display:"flex",gap:"4px",marginBottom:"8px",flexWrap:"wrap"}}>
                    {(inf.tags||[]).slice(0,4).map((tag,i)=><span key={i} style={{padding:"1px 6px",borderRadius:"4px",fontSize:"9px",fontWeight:600,background:T.goldSoft,color:T.gold}}>#{tag}</span>)}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:"6px",borderTop:`1px solid ${T.border}`,fontSize:"10.5px"}}>
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
                <div style={{width:"48px",height:"48px",borderRadius:"50%",background:`linear-gradient(135deg,${T.goldSoft},${T.goldMid})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"16px",fontWeight:800,color:T.gold}}>{inf.name.split(" ").map(w=>w[0]).join("")}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:800,fontSize:"16px"}}>{inf.name} <span style={{padding:"2px 7px",borderRadius:"8px",fontSize:"10px",fontWeight:800,color:ratingColor,background:ratingColor+"18",marginLeft:"6px"}}>{inf.rating}</span></div>
                  <div style={{fontSize:"11px",color:T.sub}}>{inf.handle} · {inf.platform} · {inf.followers} · {inf.city}</div>
                  <div style={{fontSize:"10px",color:T.gold,fontWeight:600}}>{inf.category}</div>
                </div>
              </div>

              {/* Contact & Details */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginBottom:"14px"}}>
                {[["📱 Phone",inf.phone],["📧 Email",inf.email],["👤 POC",inf.poc],["🔗 Profile",inf.profile],["📍 Address",inf.address],["📅 Added",inf.added]].map(([l,v])=><div key={l} style={{padding:"7px 10px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:"5px"}}><div style={{fontSize:"8.5px",fontWeight:700,color:T.sub,textTransform:"uppercase"}}>{l}</div><div style={{fontSize:"11px",marginTop:"2px"}}>{v||"—"}</div></div>)}
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
                {(inf.tags||[]).map((tag,i)=><span key={i} style={{padding:"2px 8px",borderRadius:"5px",fontSize:"10px",fontWeight:600,background:T.goldSoft,color:T.gold}}>#{tag}</span>)}
              </div>

              {/* Notes */}
              {inf.notes&&<div style={{padding:"10px 12px",background:T.warnBg,borderRadius:"6px",marginBottom:"14px",fontSize:"11px",color:T.warn}}>
                <div style={{fontWeight:700,marginBottom:"2px"}}>📝 Notes</div>{inf.notes}
              </div>}

              {/* Avg Rate */}
              <div style={{padding:"8px 10px",background:T.goldSoft,borderRadius:"6px",marginBottom:"14px",fontSize:"11px",display:"flex",justifyContent:"space-between"}}>
                <span style={{fontWeight:700,color:T.brand}}>Average Rate</span>
                <span style={{fontWeight:800,color:T.gold}}>{f(inf.avgRate)}</span>
              </div>

              {/* Collaboration History */}
              <Section title={`Collaboration History (${infDeals.length})`} icon="📜">
                {infDeals.length===0&&<div style={{fontSize:"11px",color:T.sub,padding:"8px 0"}}>No collaborations yet</div>}
                {infDeals.map(d=>{
                  const paid = (d.pays||[]).reduce((s,p)=>s+p.amount,0);
                  const delDone = d.dels.filter(x=>x.st==="live").length;
                  return <div key={d.id} onClick={()=>{setSel(d);setInfProfile(null);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"6px",cursor:"pointer",transition:"all .12s"}}
                    onMouseEnter={e=>e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.04)"}
                    onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"4px"}}>
                      <div>
                        <span style={{fontWeight:700,fontSize:"12px"}}>{d.product}</span>
                        <span style={{fontSize:"10px",color:T.sub,marginLeft:"6px"}}>{getCamp(d.cid)?.name||""}</span>
                      </div>
                      <Badge s={d.status} sm/>
                    </div>
                    <div style={{display:"flex",gap:"2px",marginBottom:"4px"}}>{d.dels.map((dl,i)=><div key={i} style={{flex:1,height:"3px",borderRadius:"2px",background:dl.st==="live"?T.ok:T.border}}/>)}</div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:"10px",color:T.sub}}>
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
                  supabase.from('influencers').insert({id:infId,name:nInf.name,platform:nInf.platform,handle:nInf.handle,profile:nInf.profile,followers:nInf.followers,category:nInf.category,city:nInf.city,phone:nInf.phone,email:nInf.email,address:nInf.address,poc:nInf.poc,avg_rate:+nInf.avgRate||0,rating:nInf.rating,notes:nInf.notes,tags:parsedTags});
                  setInfluencers(prev=>[...prev,{id:infId,name:nInf.name,platform:nInf.platform,handle:nInf.handle,profile:nInf.profile,followers:nInf.followers,category:nInf.category,city:nInf.city,phone:nInf.phone,email:nInf.email,address:nInf.address,poc:nInf.poc,avgRate:+nInf.avgRate||0,rating:nInf.rating,notes:nInf.notes,tags:parsedTags,added:new Date().toISOString().slice(0,10)}]);
                  setModal(null);
                  notify(`${nInf.name} added to database!`);
                }}>Add Influencer</Btn>
              </div>
          </>
        </Modal>

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
            <span style={{fontSize:"9px",fontWeight:800,color:T.sub,textTransform:"uppercase",letterSpacing:".6px",marginRight:"2px"}}>Campaign:</span>
            <button onClick={()=>setCampFilter("")} style={{padding:"4px 10px",border:`1px solid ${!campFilter?T.gold:T.border}`,borderRadius:"14px",background:!campFilter?T.goldSoft:"transparent",color:!campFilter?T.brand:T.sub,fontSize:"10.5px",fontWeight:!campFilter?700:500,cursor:"pointer",fontFamily:"inherit"}}>All</button>
            {campaigns.map(c=><button key={c.id} onClick={()=>setCampFilter(c.id)} style={{padding:"4px 10px",border:`1px solid ${campFilter===c.id?T.gold:T.border}`,borderRadius:"14px",background:campFilter===c.id?T.goldSoft:"transparent",color:campFilter===c.id?T.brand:T.sub,fontSize:"10.5px",fontWeight:campFilter===c.id?700:500,cursor:"pointer",fontFamily:"inherit"}}>{c.name} ({campDeals(c.id).length})</button>)}
          </div>

          {/* Tabs + Action */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${T.border}`,marginBottom:"12px"}}>
            <div style={{display:"flex",gap:"2px"}}>
              {[{k:"all",l:"All"},{k:"pending",l:"Pending"},{k:"active",l:"Active"},{k:"payment",l:"Payments"}].map(t=>(
                <button key={t.k} onClick={()=>setTab(t.k)} style={{padding:"7px 12px",border:"none",borderBottom:tab===t.k?`2px solid ${T.gold}`:"2px solid transparent",background:"none",color:tab===t.k?T.brand:T.sub,fontWeight:tab===t.k?800:500,fontSize:"11px",cursor:"pointer",fontFamily:"inherit"}}>{t.l}</button>
              ))}
            </div>
            {(role==="negotiator"||role==="admin")&&<Btn v="gold" sm onClick={()=>{setNDeal({inf:"",email:"",platform:"Instagram",followers:"",products:[],usage:"6 months",deadline:"",profile:"",phone:"",address:"",paymentTerms:"Net 15 days",cid:campaigns[0]?.id||"c1",dels:[{id:uid(),type:"Reel",desc:"",st:"pending",link:""}]});setModal("newDeal")}}>+ New Deal</Btn>}
          </div>

          {/* Cards */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(295px,1fr))",gap:"9px"}}>
            {filtered.map(d=>{
              const camp=getCamp(d.cid);
              const paid=totalPaid(d);
              const done=d.dels.filter(x=>x.st==="live").length;
              return <div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"9px",padding:"13px",cursor:"pointer",transition:"all .12s",animation:"fadeUp .3s ease"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=T.gold;e.currentTarget.style.boxShadow="0 3px 12px rgba(0,0,0,.05)"}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.boxShadow="none"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"5px"}}>
                  <div><div style={{fontWeight:800,fontSize:"12.5px"}}>{d.inf}</div><div style={{fontSize:"10px",color:T.sub}}>{d.platform} · {d.followers}</div></div>
                  <Badge s={d.status} sm/>
                </div>
                {camp&&<div style={{fontSize:"9.5px",color:T.gold,fontWeight:700,marginBottom:"3px"}}>🎯 {camp.name}</div>}
                <div style={{fontSize:"10.5px",color:T.sub,marginBottom:"6px"}}>{d.products?d.products.map(p=>p.name).join(", "):d.product}</div>
                <div style={{display:"flex",gap:"2px",marginBottom:"6px"}}>{d.dels.map((dl,i)=><div key={i} title={`${dl.type}: ${dl.st}`} style={{flex:1,height:"3px",borderRadius:"2px",background:dl.st==="live"?T.ok:T.border}}/>)}</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontWeight:800,fontSize:"14px",color:T.gold}}>{f(d.amount)}</span>
                  <span style={{fontSize:"9.5px",color:T.sub}}>{done}/{d.dels.length} content · {d.by}</span>
                </div>
                {paid>0&&paid<d.amount&&<div style={{marginTop:"4px",height:"2.5px",borderRadius:"2px",background:T.border,overflow:"hidden"}}><div style={{height:"100%",width:`${(paid/d.amount)*100}%`,background:T.ok,borderRadius:"2px"}}/></div>}
              </div>;
            })}
          </div>
          {filtered.length===0&&<div style={{textAlign:"center",padding:"40px",color:T.sub,fontSize:"12px"}}>No deals in this view</div>}
        </>}

        {/* ═══ DROPPED COLLABS (Negotiator view) ═══ */}
        {view==="dropped"&&role==="negotiator"&&(()=>{
          const droppedDeals = deals.filter(d=>d.status==="dropped");
          return <>
            <div style={{marginBottom:"14px"}}>
              <span style={{fontSize:"16px",fontWeight:800}}>🚫 Dropped Collabs</span>
              <span style={{fontSize:"11px",color:T.sub,marginLeft:"8px"}}>({droppedDeals.length} total)</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(295px,1fr))",gap:"9px"}}>
              {droppedDeals.map(d=>(
                <div key={d.id} onClick={()=>{setSel(d);setModal("detail")}} style={{background:T.errBg,border:`1px solid ${T.err}33`,borderRadius:"9px",padding:"13px",cursor:"pointer",transition:"all .12s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=T.err}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=`${T.err}33`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"5px"}}>
                    <div><div style={{fontWeight:800,fontSize:"12.5px"}}>{d.inf}</div><div style={{fontSize:"10px",color:T.sub}}>{d.platform} · {d.followers}</div></div>
                    <Badge s={d.status} sm/>
                  </div>
                  <div style={{fontSize:"10.5px",color:T.sub,marginBottom:"6px"}}>{d.product}</div>
                  <div style={{fontSize:"10px",color:T.err,fontWeight:600,padding:"6px",background:"rgba(180,35,24,.1)",borderRadius:"4px",marginBottom:"6px"}}>Dropped by {d.logs?.find(l=>l.a==="Collab dropped")?.u||"Unknown"}</div>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    <span style={{fontWeight:800,fontSize:"14px",color:T.gold}}>{f(d.amount)}</span>
                    <span style={{fontSize:"9.5px",color:T.sub}}>{d.dels.length} deliverables</span>
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
            <span style={{fontSize:"15px",fontWeight:800}}>🎯 Campaigns</span>
            {(role==="approver"||role==="finance"||role==="admin")&&<Btn v="gold" sm onClick={()=>{setNCamp({name:"",budget:"",target:"",deadline:"",brief:""});setModal("newCamp")}}>+ New Campaign</Btn>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(330px,1fr))",gap:"10px"}}>
            {campaigns.map(c=>{
              const comm=campCommitted(c.id),pd=campPaid(c.id),pct=c.budget>0?Math.round(comm/c.budget*100):0,lk=campLocked(c.id);
              return <div key={c.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"9px",padding:"16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:"10px"}}>
                  <div><div style={{fontWeight:800,fontSize:"14px"}}>{c.name}</div><div style={{fontSize:"10px",color:T.sub,marginTop:"1px"}}>Deadline: {c.deadline}</div></div>
                  <span style={{padding:"2px 7px",borderRadius:"8px",fontSize:"9.5px",fontWeight:700,color:c.status==="active"?T.ok:T.warn,background:c.status==="active"?T.okBg:T.warnBg}}>{c.status}</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px",marginBottom:"10px"}}>
                  <div><div style={{fontSize:"9px",color:T.sub,fontWeight:700}}>BUDGET</div><div style={{fontSize:"15px",fontWeight:800}}>{f(c.budget)}</div></div>
                  <div><div style={{fontSize:"9px",color:T.sub,fontWeight:700}}>COMMITTED</div><div style={{fontSize:"15px",fontWeight:800,color:T.gold}}>{f(comm)}</div></div>
                  <div><div style={{fontSize:"9px",color:T.sub,fontWeight:700}}>PAID</div><div style={{fontSize:"15px",fontWeight:800,color:T.ok}}>{f(pd)}</div></div>
                </div>
                <div style={{marginBottom:"6px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:"9px",color:T.sub,marginBottom:"2px"}}><span>Budget used</span><span style={{color:pct>90?T.err:T.sub}}>{pct}%</span></div>
                  <div style={{height:"4px",borderRadius:"3px",background:T.border,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:pct>90?T.err:pct>70?T.warn:T.ok,borderRadius:"3px"}}/></div>
                </div>
                <div style={{fontSize:"10px",color:T.sub}}>{lk}/{c.target} influencers locked · {campDeals(c.id).length} total deals</div>
              </div>;})}
          </div>
        </>}

        {/* ═══ DELIVERABLES BANK ═══ */}
        {view==="deliverables"&&<>
          <div style={{fontSize:"15px",fontWeight:800,marginBottom:"14px"}}>📋 Deliverables Bank — <span style={{color:T.purple}}>{pendingDels.length} Pending</span></div>
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"9px",overflow:"hidden",marginBottom:"20px"}}>
            <div style={{display:"grid",gridTemplateColumns:"1.8fr 1.5fr 1.2fr 0.8fr 0.8fr 0.7fr",padding:"8px 12px",background:T.brand,fontSize:"9px",fontWeight:800,color:"rgba(255,255,255,.6)",textTransform:"uppercase",letterSpacing:".5px"}}>
              <div>Influencer</div><div>Deliverable</div><div>Campaign</div><div>Platform</div><div>Deadline</div><div>Status</div>
            </div>
            {pendingDels.length===0&&<div style={{padding:"24px",textAlign:"center",color:T.sub,fontSize:"12px"}}>All deliverables fulfilled! 🎉</div>}
            {pendingDels.map((d,i)=>{
              const overdue = new Date(d.deadline)<new Date();
              return <div key={i} style={{display:"grid",gridTemplateColumns:"1.8fr 1.5fr 1.2fr 0.8fr 0.8fr 0.7fr",padding:"8px 12px",borderBottom:`1px solid ${T.border}`,fontSize:"11px",alignItems:"center",background:overdue?"#FFF8F5":"transparent"}}>
                <div style={{fontWeight:700}}>{d.inf}</div>
                <div><span style={{color:T.sub}}>{d.type}</span> — {d.desc||"—"}</div>
                <div style={{fontSize:"10px",color:T.gold,fontWeight:700}}>{getCamp(d.cid)?.name||"—"}</div>
                <div>{d.platform}</div>
                <div style={{color:overdue?T.err:T.text,fontWeight:overdue?700:400}}>{d.deadline}{overdue?" ⚠":""}</div>
                <DBadge s={d.st}/>
              </div>;
            })}
          </div>

          <div style={{fontSize:"13px",fontWeight:800,marginBottom:"10px"}}>By Influencer</div>
          {deals.filter(d=>!["rejected"].includes(d.status)&&d.dels.length>0).map(d=>{
            const done=d.dels.filter(x=>x.st==="live").length;
            return <div key={d.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"6px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"4px"}}>
                <div><span style={{fontWeight:800,fontSize:"12px"}}>{d.inf}</span> <span style={{fontSize:"10px",color:T.sub}}>· {d.platform} · {getCamp(d.cid)?.name||""}</span></div>
                <span style={{fontSize:"11px",fontWeight:800,color:done===d.dels.length?T.ok:T.warn}}>{done}/{d.dels.length}</span>
              </div>
              <div style={{display:"flex",gap:"4px",flexWrap:"wrap"}}>
                {d.dels.map((dl,i)=><span key={i} style={{padding:"3px 8px",borderRadius:"5px",fontSize:"10px",fontWeight:700,background:dl.st==="live"?T.okBg:T.warnBg,color:dl.st==="live"?T.ok:T.warn}}>{dl.type} {dl.st==="live"?"✓":"⏳"}</span>)}
              </div>
            </div>;
          })}
        </>}

        {/* ═══ SHIPMENTS (full view) ═══ */}
        {view==="shipments"&&<>
          <div style={{fontSize:"15px",fontWeight:800,marginBottom:"14px"}}>🚚 All Shipments</div>
          {pendingShip.length>0&&<Section title={`Awaiting Dispatch (${pendingShip.length})`} icon="📋">
            {pendingShip.map(d=><div key={d.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"6px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><div style={{fontWeight:700,fontSize:"12px"}}>{d.inf} <span style={{color:T.sub,fontWeight:400}}>· {d.product}</span></div><div style={{fontSize:"10px",color:T.sub}}>Approved: {d.appAt} · Deadline: {d.deadline}</div></div>
              {role==="logistics"?<Btn v="purple" sm onClick={()=>{setSel(d);setShipF({track:"",carrier:"DTDC"});setModal("ship")}}>📦 Dispatch</Btn>:<span style={{fontSize:"10px",color:T.warn,fontWeight:700}}>Awaiting logistics</span>}
            </div>)}
          </Section>}
          <Section title={`In Transit (${inTransit.length})`} icon="🚚">
            {inTransit.length===0&&<div style={{fontSize:"11px",color:T.sub,padding:"12px"}}>None in transit</div>}
            {inTransit.map(d=><div key={d.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"7px",padding:"10px 12px",marginBottom:"6px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><div style={{fontWeight:700,fontSize:"12px"}}>{d.inf} · {d.product}</div><div style={{fontSize:"10px",color:T.sub}}>📦 {d.ship.carrier}: <span style={{fontWeight:700,color:T.info}}>{d.ship.track}</span> · {d.ship.dispAt}</div></div>
              {role==="logistics"&&<Btn v="ok" sm onClick={()=>{setSel(d);setModal("markDelivered")}}>✓ Delivered</Btn>}
            </div>)}
          </Section>
          <Section title="Delivered" icon="✓">
            {deals.filter(d=>d.ship?.st==="delivered").map(d=><div key={d.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"7px",padding:"8px 12px",marginBottom:"4px",display:"flex",justifyContent:"space-between",alignItems:"center",opacity:.6}}>
              <span style={{fontSize:"11px"}}><b>{d.inf}</b> · {d.product}</span>
              <span style={{fontSize:"10px",color:T.ok}}>✓ {d.ship.delAt}</span>
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
          <div style={{marginTop:"8px",padding:"12px",background:"#f8f6f2",borderRadius:"7px",marginBottom:"8px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
              <span style={{fontSize:"10px",fontWeight:800,color:T.brand,textTransform:"uppercase",letterSpacing:".5px"}}>📦 Products ({nDeal.products?.length||0})</span>
              <Btn v="outline" sm onClick={()=>setNDeal({...nDeal,products:[...(nDeal.products||[]),{id:uid(),name:"",color:"",size:"",qty:"1"}]})}>+ Add Product</Btn>
            </div>
            {(nDeal.products||[]).map((p,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"1fr 80px 80px 60px 24px",gap:"5px",marginBottom:"4px",alignItems:"center"}}>
              <Inp value={p.name} onChange={e=>{const ps=[...(nDeal.products||[])];ps[i]={...ps[i],name:e.target.value};setNDeal({...nDeal,products:ps})}} placeholder="Product name" error={formErrors.products&&!p.name}/>
              <Inp value={p.color} onChange={e=>{const ps=[...(nDeal.products||[])];ps[i]={...ps[i],color:e.target.value};setNDeal({...nDeal,products:ps})}} placeholder="Color"/>
              <Inp value={p.size} onChange={e=>{const ps=[...(nDeal.products||[])];ps[i]={...ps[i],size:e.target.value};setNDeal({...nDeal,products:ps})}} placeholder="Size"/>
              <Inp value={p.qty} onChange={e=>{const ps=[...(nDeal.products||[])];ps[i]={...ps[i],qty:e.target.value};setNDeal({...nDeal,products:ps})}} placeholder="Qty" type="number"/>
              {(nDeal.products||[]).length>1&&<button onClick={()=>setNDeal({...nDeal,products:(nDeal.products||[]).filter((_,j)=>j!==i)})} style={{background:"none",border:"none",color:T.err,cursor:"pointer",fontSize:"13px",padding:0}}>✕</button>}
            </div>)}
            {formErrors.products&&<div style={{fontSize:"9px",color:T.err,marginTop:"4px"}}>At least one product name is required</div>}
          </div>

          <Field label="Amount (INR) *"><Inp value={nDeal.amount} onChange={e=>setNDeal({...nDeal,amount:e.target.value})} type="number" prefix="₹"/></Field>
          <Field label="Payment Terms"><Sel value={nDeal.paymentTerms||"Net 15 days"} onChange={e=>setNDeal({...nDeal,paymentTerms:e.target.value})} options={[{v:"Net 15 days",l:"Net 15 days"},{v:"Net 30 days",l:"Net 30 days"},{v:"50% Advance + 50% on delivery",l:"50% Advance + 50% on delivery"},{v:"100% Advance",l:"100% Advance"},{v:"100% Post Content",l:"100% Post Content"},{v:"Custom",l:"Custom"}]}/></Field>

          {/* Deliverables */}
          <div style={{marginTop:"12px",padding:"12px",background:formErrors.dels?T.errBg:T.goldSoft,borderRadius:"7px",border:formErrors.dels?`1px solid ${T.err}`:"none"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
              <span style={{fontSize:"10px",fontWeight:800,color:T.brand,textTransform:"uppercase",letterSpacing:".5px"}}>📋 Deliverables ({nDeal.dels.length})</span>
              <Btn v="outline" sm onClick={()=>setNDeal({...nDeal,dels:[...nDeal.dels,{id:uid(),type:"Reel",desc:"",st:"pending",link:""}]})}>+ Add</Btn>
            </div>
            {nDeal.dels.map((dl,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"110px 1fr 24px",gap:"6px",marginBottom:"5px",alignItems:"center"}}>
              <Sel value={dl.type} onChange={e=>{const ds=[...nDeal.dels];ds[i]={...ds[i],type:e.target.value};setNDeal({...nDeal,dels:ds})}} options={[{v:"Reel",l:"Reel"},{v:"Story",l:"Story"},{v:"Dedicated Video",l:"Video"},{v:"Shorts",l:"Shorts"},{v:"Static Post",l:"Static"},{v:"Carousel",l:"Carousel"},{v:"Community Post",l:"Post"}]}/>
              <Inp value={dl.desc} onChange={e=>{const ds=[...nDeal.dels];ds[i]={...ds[i],desc:e.target.value};setNDeal({...nDeal,dels:ds})}} placeholder="Brief description" error={formErrors.delsDes&&!dl.desc}/>
              {nDeal.dels.length>1&&<button onClick={()=>setNDeal({...nDeal,dels:nDeal.dels.filter((_,j)=>j!==i)})} style={{background:"none",border:"none",color:T.err,cursor:"pointer",fontSize:"13px",padding:0}}>✕</button>}
            </div>)}
            {formErrors.delsDes&&<div style={{fontSize:"9px",color:T.err,marginTop:"4px"}}>Deliverable description is required</div>}
          </div>

          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"14px",paddingTop:"12px",borderTop:`1px solid ${T.border}`}}>
            <Btn v="outline" onClick={()=>setModal(null)}>Cancel</Btn>
            <Btn v="gold" onClick={createDeal}>Submit for Approval</Btn>
          </div>
          <div style={{marginTop:"7px",padding:"6px 10px",background:T.infoBg,borderRadius:"5px",fontSize:"9.5px",color:T.info}}>🔒 Amount and deliverable list lock after manager approval. Email auto-generates from locked data.</div>
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
          <div style={{padding:"12px",background:T.purpleBg,borderRadius:"7px",marginBottom:"14px",fontSize:"11.5px",color:T.purple}}>
            <div style={{fontWeight:800,fontSize:"13px",marginBottom:"6px"}}>📦 {sel.products?sel.products.map(p=>p.name).join(", "):sel.product}</div>
            {sel.products && sel.products.length>0 && <div style={{marginTop:"8px",padding:"8px",background:"rgba(255,255,255,.1)",borderRadius:"4px",fontSize:"10px"}}>
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
          <div style={{padding:"10px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:"6px",marginBottom:"12px",fontSize:"11px"}}>
            <div style={{fontWeight:700,marginBottom:"6px",fontSize:"12px"}}>📋 Deal Terms</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px"}}>
              <div><span style={{color:T.sub}}>Product:</span> <b>{sel.products?sel.products.map(p=>p.name).join(", "):sel.product}</b></div>
              <div><span style={{color:T.sub}}>Usage:</span> <b>{sel.usage}</b></div>
              <div><span style={{color:T.sub}}>Deadline:</span> <b>{sel.deadline}</b></div>
              <div><span style={{color:T.sub}}>Payment Terms:</span> <b>{sel.paymentTerms||"Net 15 days"}</b></div>
            </div>
            {sel.pan&&<div style={{marginTop:"4px",padding:"4px 6px",background:T.infoBg,borderRadius:"4px"}}><span style={{color:T.info,fontWeight:600}}>PAN:</span> {sel.pan.number} ({sel.pan.name})</div>}
            <div style={{marginTop:"6px",fontWeight:700,fontSize:"10px",color:T.sub}}>Deliverables:</div>
            {sel.dels.map((dl,i)=><div key={i} style={{fontSize:"10px",padding:"2px 0"}}>{dl.type}: {dl.desc} — <span style={{color:dl.st==="live"?T.ok:T.warn,fontWeight:600}}>{dl.st==="live"?"Live":"Pending"}</span></div>)}
          </div>

          <div style={{padding:"10px",background:T.goldSoft,borderRadius:"6px",marginBottom:"12px",fontSize:"11px"}}>
            <div style={{display:"flex",justifyContent:"space-between"}}><span>Locked:</span><b>{f(sel.amount)}</b></div>
            <div style={{display:"flex",justifyContent:"space-between"}}><span>Paid:</span><b style={{color:T.ok}}>{f(totalPaid(sel))}</b></div>
            <div style={{display:"flex",justifyContent:"space-between",borderTop:`1px solid ${T.border}`,marginTop:"4px",paddingTop:"4px"}}><b>Remaining:</b><b style={{color:remaining(sel)>0?T.err:T.ok}}>{f(remaining(sel))}</b></div>
          </div>
          <Field label="Type"><Sel value={payF.type} onChange={e=>setPayF({...payF,type:e.target.value})} options={[{v:"advance",l:"Advance"},{v:"partial",l:"Part Payment"},{v:"final",l:"Final Settlement"}]}/></Field>
          <Field label="Amount *"><Inp value={payF.amount} onChange={e=>setPayF({...payF,amount:e.target.value})} type="number" prefix="₹" placeholder={String(remaining(sel))}/></Field>
          <Field label="Note"><Inp value={payF.note} onChange={e=>setPayF({...payF,note:e.target.value})} placeholder="Advance on lock / Post content live"/></Field>
          {+payF.amount>remaining(sel)&&remaining(sel)>0&&<div style={{padding:"5px 8px",background:T.errBg,borderRadius:"4px",fontSize:"10px",color:T.err,marginBottom:"6px"}}>⚠ Exceeds remaining balance!</div>}
          <div style={{display:"flex",gap:"7px",justifyContent:"flex-end",marginTop:"8px"}}><Btn v="outline" onClick={()=>setModal("detail")}>Back</Btn><Btn v="ok" onClick={recordPayment} disabled={!payF.amount}>Record Payment</Btn></div>
        </>}
      </Modal>

      {/* INVOICE */}
      <Modal open={modal==="invoice"} onClose={()=>setModal("detail")} title={`Submit Invoice — ${sel?.inf}`} w={420}>
        {sel&&<>
          <div style={{padding:"10px",background:T.goldSoft,borderRadius:"6px",marginBottom:"12px",fontSize:"12px"}}>
            <div>🔒 <b>Approved amount:</b> <span style={{fontSize:"16px",fontWeight:800,color:T.gold}}>{f(sel.amount)}</span></div>
            <div style={{fontSize:"10px",color:T.sub,marginTop:"4px"}}>Enter the exact amount shown on the influencer's invoice. The system will compare it to the locked amount.</div>
          </div>
          <Field label="Invoice Amount *"><Inp value={invF} onChange={e=>setInvF(e.target.value)} type="number" prefix="₹" placeholder={String(sel.amount)}/></Field>
          {invF&&+invF!==sel.amount&&<div style={{padding:"6px 8px",background:T.errBg,borderRadius:"4px",fontSize:"10px",color:T.err,marginTop:"4px"}}>⚠ MISMATCH: Invoice {f(invF)} ≠ Approved {f(sel.amount)}. This will be flagged as a dispute.</div>}
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
        <div style={{marginTop:"8px",padding:"8px 10px",background:T.infoBg,borderRadius:"5px",fontSize:"10px",color:T.info}}>
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
            supabase.from('users').insert({id:newId,name:userF.name,email:userF.email,role:userF.role,status:'active',avatar:initials,pin:'1111'});
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
          <div style={{padding:"10px 12px",background:T.warnBg,borderRadius:"6px",marginBottom:"14px",fontSize:"11px",color:T.warn}}>
            <b>Current terms:</b> {f(sel.amount)} · {sel.dels.length} deliverables · by {sel.by}
          </div>

          <Field label="Revised Commercial Amount *">
            <Inp value={renegF.amount} onChange={e=>setRenegF({...renegF,amount:e.target.value})} type="number" prefix="₹"/>
          </Field>
          {+renegF.amount!==sel.amount&&<div style={{fontSize:"10px",color:T.info,marginBottom:"8px",marginTop:"-2px"}}>Changed from {f(sel.amount)} → {f(renegF.amount)} ({+renegF.amount>sel.amount?"↑ increase":"↓ decrease"})</div>}

          <div style={{marginBottom:"14px"}}>
            <div style={{fontSize:"10px",fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:".5px",marginBottom:"6px"}}>Select Deliverables to Keep</div>
            {renegF.dels.map((dl,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:"8px",padding:"7px 10px",background:dl.keep?T.surface:"#f8f6f2",border:`1px solid ${dl.keep?T.border:"#e8e4dc"}`,borderRadius:"6px",marginBottom:"4px",opacity:dl.keep?1:.5}}>
                <input type="checkbox" checked={dl.keep} onChange={()=>{
                  const ds=[...renegF.dels]; ds[i]={...ds[i],keep:!ds[i].keep}; setRenegF({...renegF,dels:ds});
                }} style={{accentColor:T.gold,width:"16px",height:"16px"}}/>
                <div style={{flex:1}}>
                  <span style={{fontSize:"11.5px",fontWeight:700}}>{dl.type}</span>
                  <span style={{fontSize:"10.5px",color:T.sub,marginLeft:"5px"}}>{dl.desc}</span>
                </div>
                {!dl.keep&&<span style={{fontSize:"9px",color:T.err,fontWeight:700}}>REMOVED</span>}
              </div>
            ))}
            <div style={{fontSize:"10px",color:T.sub,marginTop:"4px"}}>{renegF.dels.filter(d=>d.keep).length} of {renegF.dels.length} deliverables kept</div>
          </div>

          <div style={{marginTop:"8px",borderTop:`1px dashed ${T.border}`,paddingTop:"8px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}>
              <span style={{fontSize:"10px",fontWeight:700,color:T.info}}>Add New Deliverables</span>
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
              <div style={{display:"flex",gap:"5px",alignItems:"center"}}><Badge s={sel.status}/>{camp&&<span style={{fontSize:"10px",color:T.gold,fontWeight:700}}>🎯 {camp.name}</span>}</div>
              <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                {(()=>{const inf=influencers.find(x=>x.name===sel.inf); return inf?<Btn v="ghost" sm onClick={()=>{setModal(null);setSel(null);setInfProfile(inf)}}>⭐ View Profile</Btn>:null;})()}
                <span style={{fontSize:"9px",color:T.sub}}>#{sel.id} · {sel.by} · {sel.at}</span>
              </div>
            </div>

            {/* Info grid */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px",marginBottom:"12px"}}>
              {[["Platform",`${sel.platform} · ${sel.followers}`],["Product",sel.products?sel.products.map(p=>p.name).join(", "):sel.product],["Usage",sel.usage],["Deadline",sel.deadline],["Profile",sel.profile],["Phone",sel.phone||"—"],["Email",sel.email||"Not provided"]].map(([l,v])=><div key={l}><div style={{fontSize:"8.5px",fontWeight:800,color:T.sub,textTransform:"uppercase"}}>{l}</div><div style={{fontSize:"11.5px",marginTop:"1px"}}>{v}</div></div>)}
            </div>
            {sel.paymentTerms&&<div style={{padding:"8px 10px",background:T.infoBg,borderRadius:"5px",marginBottom:"12px",fontSize:"11px"}}><span style={{fontWeight:700,color:T.info}}>💳 Payment Terms:</span> {sel.paymentTerms}</div>}
            {sel.address&&<div style={{padding:"8px 10px",background:T.infoBg,borderRadius:"5px",marginBottom:"12px",fontSize:"11px"}}><span style={{fontWeight:700,color:T.info}}>📍 Address:</span> {sel.address}</div>}

            {/* Amount box */}
            <div style={{background:T.goldSoft,border:`1px dashed ${T.goldMid}`,borderRadius:"7px",padding:"12px",marginBottom:"12px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
                <div>
                  <div style={{fontSize:"8.5px",fontWeight:800,color:T.sub,textTransform:"uppercase"}}>{["approved","email_sent","shipped","delivered_prod","partial_live","live","invoice_ok","disputed","partial_paid","paid"].includes(sel.status)?"🔒 Locked Amount":"Proposed Amount"}</div>
                  <div style={{fontSize:"22px",fontWeight:900,color:T.gold}}>{f(sel.amount)}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:"10px",color:T.ok,fontWeight:700}}>Paid: {f(paid)}</div>
                  <div style={{fontSize:"10px",color:rem>0?T.warn:T.ok,fontWeight:700}}>Remaining: {f(rem)}</div>
                </div>
              </div>
              {paid>0&&<div style={{height:"4px",borderRadius:"3px",background:T.border,marginTop:"8px"}}><div style={{height:"100%",width:`${Math.min(paid/sel.amount*100,100)}%`,background:T.ok,borderRadius:"3px"}}/></div>}
              {sel.inv&&!sel.inv.match&&<div style={{marginTop:"8px",padding:"6px 8px",background:T.errBg,borderRadius:"5px",fontSize:"10px",color:T.err}}>⚠ Invoice: {f(sel.inv.amount)} vs Locked: {f(sel.amount)} — Difference: {f(Math.abs(sel.inv.amount-sel.amount))}</div>}
            </div>

            {/* Payments */}
            {sel.pays.length>0&&<Section title="Payment History" icon="💰">
              {sel.pays.map((p,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 9px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:"5px",marginBottom:"3px",fontSize:"11px"}}>
                <div><span style={{fontWeight:700,textTransform:"capitalize"}}>{p.type}</span> <span style={{color:T.sub}}>· {p.note}</span></div>
                <div><b style={{color:T.ok}}>{f(p.amount)}</b> <span style={{color:T.sub,fontSize:"9.5px"}}>· {p.date}</span></div>
              </div>)}
            </Section>}

            {/* Deliverables */}
            <Section title={`Deliverables (${done}/${sel.dels.length})`} icon="📋">
              {sel.dels.map((dl,i)=>{
                const url = deliverableLinkF[dl.id] || "";
                const isAttachment = attachmentMode[dl.id] === "attachment";
                return <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"7px 9px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:"5px",marginBottom:"3px"}}>
                  <div style={{flex:1}}>
                    <span style={{fontSize:"11.5px",fontWeight:700}}>{dl.type}</span>
                    <span style={{fontSize:"10.5px",color:T.sub,marginLeft:"5px"}}>{dl.desc}</span>
                    {dl.link&&<div style={{fontSize:"9.5px",color:T.info,marginTop:"1px"}}>🔗 {dl.link}</div>}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:"5px"}}>
                    <DBadge s={dl.st}/>
                    {(role==="negotiator"||role==="admin")&&dl.st==="pending"&&!["pending","renegotiate","rejected","approved"].includes(sel.status)&&
                      <div style={{display:"flex",flexDirection:"column",gap:"3px",alignItems:"flex-end",width:"160px"}}>
                        <label style={{display:"flex",gap:"4px",fontSize:"9.5px",fontWeight:600,color:T.sub}}>
                          <input type="radio" name={`mode-${dl.id}`} checked={!isAttachment} onChange={()=>{setAttachmentMode(p=>({...p,[dl.id]:"link"}))}} style={{cursor:"pointer"}}/>
                          Live Link
                        </label>
                        <label style={{display:"flex",gap:"4px",fontSize:"9.5px",fontWeight:600,color:T.sub}}>
                          <input type="radio" name={`mode-${dl.id}`} checked={isAttachment} onChange={()=>{setAttachmentMode(p=>({...p,[dl.id]:"attachment"}))}} style={{cursor:"pointer"}}/>
                          Custom Attachment
                        </label>
                        {!isAttachment?
                          <div style={{display:"flex",gap:"3px",width:"100%"}}>
                            <Inp value={url} onChange={e=>setDeliverableLinkF({...deliverableLinkF,[dl.id]:e.target.value})} placeholder="URL *" sx={{width:"110px"}}/>
                            <Btn v="ok" sm onClick={()=>{if(!url){notify("Content URL required","err");return;}markDelLive(sel,i,url)}}>✅</Btn>
                          </div>
                        :
                          <div style={{display:"flex",gap:"3px",width:"100%"}}>
                            <Inp value={attachmentDesc[dl.id]||""} onChange={e=>setAttachmentDesc({...attachmentDesc,[dl.id]:e.target.value})} placeholder="File desc *" sx={{width:"110px"}}/>
                            <Btn v="ok" sm onClick={()=>{const desc=attachmentDesc[dl.id];if(!desc){notify("Description required","err");return;}markDelLive(sel,i,desc)}}>✅</Btn>
                          </div>
                        }
                      </div>}
                    {(role==="negotiator"||role==="admin")&&dl.st==="pending"&&(!sel.ship||sel.ship.st!=="delivered")&&
                      <span style={{fontSize:"9px",color:T.sub,fontStyle:"italic"}}>Awaiting delivery</span>}
                  </div>
                </div>;
              })}
            </Section>

            {/* Shipment */}
            {sel.ship&&<Section title="Shipment" icon="📦">
              <div style={{padding:"8px 10px",background:T.purpleBg,borderRadius:"5px",fontSize:"11px"}}>
                <div><b>{sel.ship.carrier}:</b> <span style={{color:T.info,fontWeight:700}}>{sel.ship.track}</span></div>
                <div style={{color:T.sub,marginTop:"1px"}}>Dispatched: {sel.ship.dispAt} by {sel.ship.dispBy}</div>
                {sel.ship.delAt&&<div style={{color:T.ok,marginTop:"1px"}}>✓ Delivered: {sel.ship.delAt}</div>}
              </div>
            </Section>}

            {/* Email preview */}
            {["email_sent","shipped","delivered_prod","partial_live","live","invoice_ok","disputed","partial_paid","paid"].includes(sel.status)&&
            <Section title="Confirmation Email (System-Generated)" icon="✉">
              <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:"6px",padding:"12px",fontSize:"11px",lineHeight:1.7}}>
                Dear {sel.inf},<br/><br/>
                Thank you for partnering with <b>Invogue</b>! Confirmed terms:<br/><br/>
                <b>Product:</b> {sel.products?sel.products.map(p=>p.name).join(", "):sel.product}<br/>
                <b>Amount:</b> <span style={{color:T.gold,fontWeight:800}}>{f(sel.amount)}</span><br/>
                <b>Deliverables:</b> {sel.dels.map(d=>d.type).join(", ")} ({sel.dels.length} total)<br/>
                <b>Usage Rights:</b> {sel.usage}<br/>
                <b>Deadline:</b> {sel.deadline}<br/>
                <b>Payment:</b> {sel.paymentTerms||"Net 15 days from content live"}<br/>
                <b>To:</b> {sel.email || 'No email captured'}<br/><br/>
                <em style={{color:T.sub,fontSize:"10px"}}>System-generated. Terms auto-populated from approved record and cannot be altered.</em>
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
                  <div style={{fontSize:"11px"}}><b>{lg.a}</b> <span style={{color:T.sub,fontWeight:400}}>by {lg.u}</span></div>
                  {lg.d&&<div style={{fontSize:"10px",color:T.sub}}>{lg.d}</div>}
                  <div style={{fontSize:"9px",color:T.faint}}>{lg.t}</div>
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
              {(role==="negotiator"||role==="admin")&&["live","partial_live"].includes(sel.status)&&!sel.inv&&<Btn v="gold" onClick={()=>{setInvF("");setModal("invoice")}}>🧾 Submit Invoice</Btn>}
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
              {(sel.status==="pending"||sel.status==="renegotiate")&&role==="negotiator"&&<div style={{fontSize:"10.5px",color:T.sub,fontStyle:"italic",padding:"4px 0"}}>⏳ Awaiting manager approval</div>}
              {role==="admin"&&<div style={{fontSize:"9.5px",color:T.sub,fontStyle:"italic",padding:"4px 0",borderTop:`1px dashed ${T.border}`,marginTop:"4px",paddingTop:"6px",width:"100%"}}>⚙ Admin: All actions available regardless of status</div>}
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
          <div style={{padding:"10px",background:T.purpleBg,borderRadius:"6px",marginBottom:"12px",fontSize:"11px"}}>
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

      {/* SEND FOR PAYMENT MODAL */}
      <Modal open={modal==="sendForPayment"} onClose={()=>setModal(null)} title={`Send for Payment — ${sel?.inf}`} w={460}>
        {sel&&<>
          <div style={{padding:"10px",background:T.goldSoft,borderRadius:"6px",marginBottom:"12px",fontSize:"12px"}}>
            <div>Amount: <b style={{fontSize:"16px",color:T.gold}}>{f(sel.amount)}</b></div>
            <div style={{fontSize:"10px",color:T.sub,marginTop:"2px"}}>{sel.products?sel.products.map(p=>p.name).join(", "):sel.product} · {sel.dels.length} deliverables</div>
          </div>
          <div style={{padding:"10px",background:T.warnBg,borderRadius:"6px",marginBottom:"12px",fontSize:"10px",color:T.warn}}>
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
            <div style={{fontSize:"10px",color:T.err,marginTop:"2px"}}>{sel.product} · {sel.dels.length} deliverables</div>
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
            <div style={{fontSize:"10px",color:T.sub,marginTop:"2px"}}>Status: {sel.status}</div>
            <div style={{fontSize:"10px",color:T.err,marginTop:"4px",fontWeight:600}}>⚠ Can only drop if NO payments made (Current paid: {f(totalPaid(sel))})</div>
          </div>
          {totalPaid(sel)>0&&<div style={{padding:"10px",background:T.errBg,borderRadius:"6px",marginBottom:"12px",fontSize:"11px",color:T.err}}>
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
    </div>
  );
}
