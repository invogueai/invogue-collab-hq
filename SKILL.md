# INVOGUE COLLAB HQ — Cowork Setup & Deployment Guide

## What This Is
A complete influencer marketing management system for Invogue (shapewear brand). Manages the full lifecycle: campaign planning, influencer outreach, deal approval, product shipment, content delivery, invoice matching, and payment processing. Built for a team of 5-10 people with role-based access.

## Tech Stack
- **Frontend**: Next.js 14 (React) — app code in `src/`
- **Backend/Database**: Supabase (free tier) — PostgreSQL + auth
- **Hosting**: Vercel (free tier) — auto-deploys from GitHub
- **Auth**: Google OAuth (Supabase Auth, Google provider). Sign-in is domain-locked — only Google Workspace accounts ending in `@invogue.shop` or `@kreatikcommerce.com` are accepted, and the email must match an `active` row in the `users` table. Role is looked up from that row.

## USER ROLES
| Role | Can Do | Cannot Do |
|------|--------|-----------|
| Admin | Everything — has access to ALL features from every role | Nothing restricted |
| Negotiator | Create deals, mark deliverables live, submit invoices | Approve deals, process payments, dispatch shipments |
| Manager/Approver | Approve deals, create campaigns, record payments | Create deals |
| Finance | Process payments, resolve disputes, override amounts | Create deals, dispatch shipments |
| Logistics | Dispatch shipments, mark deliveries | See financial data |
| Performance Marketer | Manage live creatives (Fresh/Running/Tested), add ad notes/links, request usage extensions | Create deals, approve, payments, dispatch |
| Viewer | Read-only access | Edit anything |

**CRITICAL RULE: Admin always gets every feature.** Whenever a new role-specific feature, dashboard, or view is added, it MUST also be accessible to the admin role — either as a dedicated nav tab or within the admin dashboard. Admin is the super-user and must have visibility into every part of the system. Never ship a role-specific feature without also wiring it into admin.

## SETUP STEPS

### Step 1: Supabase Project
1. Go to https://supabase.com, create account, click "New Project"
2. Name: `invogue-collab-hq`, Region: Singapore, set DB password
3. After creation, go to Settings, then API, copy **Project URL** and **anon public key**

### Step 2: Database
1. In Supabase, open SQL Editor, click New Query
2. Paste contents of `supabase/schema.sql`, click Run
3. New Query, paste contents of `supabase/seed.sql`, click Run

### Step 3: Environment
1. Copy `.env.local.example` to `.env.local`
2. Fill in the environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL` — Supabase → Settings → API (Project URL)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase → Settings → API (anon public key)
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase → Settings → API (service_role secret). **Server-side only** — used by the auth helper and the public `/api/acknowledge` endpoint. Never expose this to the browser / never prefix it with `NEXT_PUBLIC_`.
   - `RESEND_API_KEY` — Resend dashboard. Required for sending confirmation/delivery emails via `/api/send-email`.
   - `EMAIL_FROM` (optional) — sender shown on outgoing email, e.g. `Invogue Collabs <sm@invogue.shop>`. Defaults to that if unset.
3. Run `npm install` then `npm run dev`

### Step 4: Supabase Integration
The app in `src/app/InvogueCollabHQ.js` currently uses `window.storage` (browser local storage). It needs to be converted to use Supabase for multi-user access.

**DATA MAPPING (App state to Supabase tables):**

App field `deals[].inf` maps to database column `deals.influencer_name`
App field `deals[].cid` maps to database column `deals.campaign_id`
App field `deals[].by` maps to database column `deals.created_by`
App field `deals[].at` maps to database column `deals.created_at`
App field `deals[].appBy` maps to database column `deals.approved_by`
App field `deals[].appAt` maps to database column `deals.approved_at`
App field `deals[].usage` maps to database column `deals.usage_rights`
App field `deals[].profile` maps to database column `deals.profile_link`
App field `deals[].adStatus` maps to database column `deals.ad_status` (fresh/running/tested)
App field `deals[].usageDays` maps to database column `deals.usage_days` (default NULL = perpetual)
App field `deals[].usageEndDate` maps to database column `deals.usage_end_date`
App field `deals[].adNotes` maps to database column `deals.ad_notes`
App field `deals[].adPlatformLink` maps to database column `deals.ad_platform_link`
App field `deals[].reuseRequested` maps to database column `deals.reuse_requested`
App field `deals[].reuseRequestedAt` maps to database column `deals.reuse_requested_at`
App field `deals[].reuseRequestedBy` maps to database column `deals.reuse_requested_by`
App field `deals[].paymentDueDate` maps to database column `deals.payment_due_date`
App field `deals[].tdsRate` maps to database column `deals.tds_rate` (default 10%)
App field `deals[].tdsAmount` maps to database column `deals.tds_amount`

Influencer field `bankHolder` maps to `influencers.bank_account_holder`
Influencer field `bankAccount` maps to `influencers.bank_account_number`
Influencer field `bankIfsc` maps to `influencers.bank_ifsc`
Influencer field `panNumber` maps to `influencers.pan_number`
Influencer field `upiId` maps to `influencers.upi_id`
Influencer field `defaultPaymentTerms` maps to `influencers.default_payment_terms` (next_15th | 45_days | 60_days | advance | immediate | custom)
App field `deals[].ackAt` maps to database column `deals.acknowledged_at`
App field `deals[].ackToken` maps to database column `deals.acknowledge_token`
App field `deals[].inv.amount` maps to database column `deals.invoice_amount`
App field `deals[].inv.match` maps to database column `deals.invoice_match`
App field `deals[].inv.at` maps to database column `deals.invoice_at`
App field `deals[].inv.note` maps to database column `deals.invoice_note`

App field `deals[].dels[]` maps to table `deliverables` joined by `deal_id`
  - `dels[].st` maps to `deliverables.status`
  - `dels[].desc` maps to `deliverables.description`
  - `dels[].link` maps to `deliverables.live_link`

App field `deals[].pays[]` maps to table `payments` joined by `deal_id`

App field `deals[].ship` maps to table `shipments` joined by `deal_id`
  - `ship.track` maps to `shipments.tracking_id`
  - `ship.st` maps to `shipments.status`
  - `ship.dispAt` maps to `shipments.dispatched_at`
  - `ship.dispBy` maps to `shipments.dispatched_by`
  - `ship.delAt` maps to `shipments.delivered_at`

App field `deals[].logs[]` maps to table `audit_log` joined by `deal_id`
  - `logs[].t` maps to `audit_log.created_at`
  - `logs[].u` maps to `audit_log.user_name`
  - `logs[].a` maps to `audit_log.action`
  - `logs[].d` maps to `audit_log.detail`

App field `campaigns[].target` maps to `campaigns.target_influencers`
App field `influencers[].avgRate` maps to `influencers.avg_rate`
App field `influencers[].tags` is a TEXT[] array in Postgres

**APPROACH:** Replace `loadData()` to fetch from all Supabase tables on mount, joining deals with their deliverables, payments, shipments, and audit_logs. Replace each mutation (create deal, approve deal, record payment, etc.) with individual Supabase insert/update calls instead of the batch saveData approach. Keep all UI code exactly the same, only change the data layer.

### Step 5: GitHub + Vercel Deploy
1. Create private GitHub repo `invogue-collab-hq`
2. `git init && git add . && git commit -m "Initial" && git push`
3. Vercel, import repo, add ALL env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, and optionally `EMAIL_FROM`), Deploy. Missing `SUPABASE_SERVICE_ROLE_KEY` breaks login + acknowledgement; missing `RESEND_API_KEY` breaks email sending.

### Step 6: Test
Click "Sign in with Google" and authenticate with the admin's `@invogue.shop` (or `@kreatikcommerce.com`) Workspace account — the same email you seeded as `admin` in `seed.sql` / migration 004. Verify all views load with data.

## MAKING FUTURE CHANGES
1. Open Claude Desktop, switch to Cowork, point to this folder
2. Describe the change in plain English
3. Cowork edits code
4. Run `git add . && git commit -m "description" && git push`
5. Vercel auto-deploys in about 2 minutes

## PROJECT STRUCTURE
```
invogue-collab-hq/
  SKILL.md                    Instructions for Cowork (this file)
  COWORK_PROMPTS.md           Step-by-step prompts to paste into Cowork
  README.md                   Project overview
  package.json                Dependencies
  next.config.js              Next.js config
  .env.local.example          Environment template (copy to .env.local)
  .gitignore                  Git ignore rules
  supabase/
    schema.sql                Database table definitions
    seed.sql                  Sample data (users, campaigns, influencers)
  src/
    app/
      layout.js               Root layout with fonts
      page.js                 Entry point, imports InvogueCollabHQ
      InvogueCollabHQ.js      THE MAIN APP (all UI, logic, state)
      globals.css             Global styles
    lib/
      supabase.js             Supabase client config
```

## KEY BUSINESS RULES (Never break these when making changes)
1. Commercial amount LOCKS after manager approval, immutable except admin override (which is logged)
2. Confirmation email auto-generates from locked data, commercial terms are non-editable in email
3. Invoice amount must match approved amount or deal is flagged as disputed
4. Total payments can never exceed locked amount without admin override
5. Logistics role has ZERO visibility into financial data
6. The person who creates a deal cannot approve their own deal
7. Every single action is logged in the audit_log table
8. Deliverable list (count and types) locks after approval
9. Campaign budget tracked in real-time, warning at 80%, blocked at 100%
10. Admin role must have access to EVERY feature — any new role-specific view/tab/action must also be wired into admin's nav and render conditions
11. Influencer must acknowledge collab terms (via email link) before logistics can dispatch
12. Usage end date auto-sets when a deal goes fully live (today + usage_days), performance marketer can request extensions
13. Payment due date auto-calculates when deal goes live, based on per-influencer default terms (overridable per deal): next_15th, 45_days, 60_days, advance, immediate, custom
14. TDS at 10% applies when cumulative FY payments to an influencer exceed ₹50,000 (Apr 1 – Mar 31). Rate overridable per deal if invoice specifies otherwise
15. Finance batch export: CSV download with bank details, payment amounts, TDS applicable/amount, net payable for selected deals
