# INVOGUE COLLAB HQ — Cowork Setup & Deployment Guide

## What This Is
A complete influencer marketing management system for Invogue (shapewear brand). Manages the full lifecycle: campaign planning, influencer outreach, deal approval, product shipment, content delivery, invoice matching, and payment processing. Built for a team of 5-10 people with role-based access.

## Tech Stack
- **Frontend**: Next.js 14 (React) — app code in `src/`
- **Backend/Database**: Supabase (free tier) — PostgreSQL + auth
- **Hosting**: Vercel (free tier) — auto-deploys from GitHub
- **Auth**: Custom PIN-based login using Supabase `users` table

## USER ROLES
| Role | Can Do | Cannot Do |
|------|--------|-----------|
| Admin | Everything | Nothing restricted |
| Negotiator | Create deals, mark deliverables live, submit invoices | Approve deals, process payments, dispatch shipments |
| Manager/Approver | Approve deals, create campaigns, record payments | Create deals |
| Finance | Process payments, resolve disputes, override amounts | Create deals, dispatch shipments |
| Logistics | Dispatch shipments, mark deliveries | See financial data |
| Viewer | Read-only access | Edit anything |

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
2. Fill in Supabase URL and anon key
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
3. Vercel, import repo, add env vars (NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY), Deploy

### Step 6: Test
Login as admin@invogue.in with PIN 1234. Verify all views load with data.

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
