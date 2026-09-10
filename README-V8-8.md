# System Monitoring V8.8 — Real Data Dashboard & Weekly Report

## What changes
- Executive Dashboard now reads live Supabase data from Certification, Audit, Grievance, Action Monitoring, Company Master and NDPE Implementation.
- Weekly Report button is renamed to **Build Draft from Live Data**.
- Weekly report uses real grievance received/submitted dates when available.
- Real certification and audit source records remain editable before Word generation.
- No new SQL migration is required if V8.7 is already installed.

## Install
Upload these paths to GitHub and replace existing files:
- `app/page.js`
- `app/weekly-report/page.js`
- `app/globals.css`

Commit example: `Add real data executive dashboard and weekly report`
Wait for Vercel deployment to become Ready, then Ctrl+F5.
