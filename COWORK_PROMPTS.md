# COWORK PROMPT GUIDE
# =====================
# This file contains the exact prompts to copy-paste into Claude Cowork
# at each stage of setup. Follow them in order.
#
# BEFORE YOU START:
# 1. Download and install Claude Desktop from claude.com/download
# 2. Make sure you have a paid Claude plan (Pro/Max/Team)
# 3. Unzip the invogue-collab-hq.zip to a folder on your desktop
# 4. Open Claude Desktop → click the "Cowork" tab
# 5. Click "Work in a folder" → select the invogue-collab-hq folder
#
# Then copy-paste these prompts one by one:


# ──────────────────────────────────────
# PROMPT 1: Initial Setup
# (Copy everything between the --- lines)
# ──────────────────────────────────────

---
Read the SKILL.md file in this folder. This is an influencer marketing management app for my brand called Invogue. I need your help deploying it as a live web app.

First, help me set up the Supabase project. Open my browser and go to supabase.com. I need to:
1. Create a free account (or sign in if I already have one)
2. Create a new project called "invogue-collab-hq"
3. Set region to Singapore or closest to India
4. Once the project is ready, go to Settings → API and get the Project URL and anon key

Save the Project URL and anon key somewhere safe — I'll need them in the next step.
---


# ──────────────────────────────────────
# PROMPT 2: Create Database Tables
# (After Supabase project is created)
# ──────────────────────────────────────

---
Now I need to create the database tables. In Supabase:
1. Open the SQL Editor (left sidebar)
2. Open the file supabase/schema.sql from our project folder
3. Copy the entire contents and paste it into the Supabase SQL Editor
4. Run it

Then do the same with supabase/seed.sql — this adds sample data (team members, campaigns, influencers).

After both SQL files have run successfully, come back and confirm.
---


# ──────────────────────────────────────
# PROMPT 3: Configure Environment & Install
# ──────────────────────────────────────

---
Now configure the project:
1. Copy .env.local.example to .env.local
2. Put my Supabase Project URL and anon key into .env.local
3. Run npm install to install dependencies
4. Run npm run dev to test locally

Open the browser and check if the app loads at localhost:3000. It should show the login screen.
---


# ──────────────────────────────────────
# PROMPT 4: Wire Up Supabase (IMPORTANT)
# ──────────────────────────────────────

---
The app currently stores data in local browser storage (window.storage). I need you to convert it to use Supabase so that multiple users can access the same data.

In src/app/InvogueCollabHQ.js, replace the loadData and saveData functions and the data loading useEffect to use the Supabase client from src/lib/supabase.js.

Specifically:
- Import supabase from '../lib/supabase'
- The loadData function should fetch from Supabase tables: users, campaigns, deals (with their deliverables, payments, shipments joined), and influencers
- When a deal is created, insert into the deals table and deliverables table
- When a deal is approved/updated, update the deals table
- When a payment is recorded, insert into the payments table
- When a shipment is created, insert into the shipments table
- When audit log entries are created, insert into the audit_log table
- When an influencer is added, insert into the influencers table
- When a user is created, insert into the users table
- When a campaign is created, insert into the campaigns table
- The login should query the users table by email and check the pin

Keep all the existing UI exactly the same. Only change the data layer.

Read the database schema in supabase/schema.sql to understand the exact table and column names. Make sure field names match between the app and the database (e.g., the app uses 'inf' for influencer name but the database column is 'influencer_name', the app uses 'cid' but the database uses 'campaign_id', etc.)

After making changes, run npm run dev and test that the login works and data loads from Supabase.
---


# ──────────────────────────────────────
# PROMPT 5: Deploy to Vercel
# ──────────────────────────────────────

---
The app is working locally. Now deploy it:
1. Create a GitHub repository called "invogue-collab-hq" (make it private)
2. Initialize git in this folder, commit all files, and push to GitHub
3. Go to vercel.com, sign in with GitHub
4. Import the invogue-collab-hq repository
5. Add the environment variables:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
6. Deploy it

Tell me the live URL when it's deployed.
---


# ──────────────────────────────────────
# PROMPT 6: Test Everything
# ──────────────────────────────────────

---
Open the live deployed URL in the browser and test:
1. Login as admin@invogue.in with PIN 1234
2. Check that the admin dashboard loads with data
3. Check the Influencer DB tab
4. Sign out and login as ankit@invogue.in with PIN 1111
5. Check the negotiator dashboard
6. Try creating a new deal
7. Sign out and login as ritu@invogue.in (manager)
8. Check that the pending deal appears in the approval queue

Report back what works and what doesn't so we can fix any issues.
---


# ──────────────────────────────────────
# FUTURE: Making Changes
# ──────────────────────────────────────
# Whenever you want to make changes to the app in the future,
# open Cowork, point it to the same project folder, and type
# your change in plain English. For example:
#
# "Add a field called 'content category' to the deal form with options
#  Fashion, Beauty, Fitness, Lifestyle, Other"
#
# "Change the login to use phone number + OTP instead of email + PIN"
#
# "Add a monthly report page showing total spend per campaign,
#  deliverable completion rate, and top performing influencers"
#
# "Add WhatsApp notification when a deal is approved — send a message
#  to the negotiator's phone number"
#
# After Cowork makes the changes, it will commit to GitHub and
# Vercel auto-deploys within 2 minutes. Your team sees the update
# immediately.
