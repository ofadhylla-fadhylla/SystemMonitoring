# System Monitoring V7 — Supabase Integration

V7 moves the Grievance Tracker from browser-only Local Storage / IndexedDB to Supabase.

## What becomes shared
- Grievances → `public.grievances`
- Timeline updates → `public.grievance_updates`
- Action plans → `public.grievance_actions`
- Evidence metadata → `public.grievance_evidence`
- Closure / reopen records → `public.grievance_closures`
- Evidence files → private Supabase Storage bucket `grievance-evidence`

## Before uploading V7
Vercel must already contain these Production Environment Variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

The Supabase tables from the V1 SQL must already exist.

For evidence uploads, confirm Supabase Storage contains a PRIVATE bucket named exactly:
`grievance-evidence`

If the bucket does not exist, create it and its development RLS policies before testing evidence upload.

## Upload to GitHub
Extract the ZIP. Upload/replace these paths at the repository root:
- `app/`
- `components/`
- `lib/`
- `package.json`

Suggested commit message:
`Connect grievance tracker to Supabase`

Vercel will install `@supabase/supabase-js` during the build. No local Node.js installation is required.

## Important migration note
Existing V1–V6 dummy records stored only in your browser are NOT automatically migrated to Supabase.
After V7 deploys, create a NEW dummy grievance to test the shared database.

## Test order
1. Add a new dummy grievance.
2. Refresh the page and confirm the grievance remains.
3. Open the same URL in another browser/device and confirm the same grievance appears.
4. Add Update.
5. Add Action.
6. Upload Evidence.
7. View / Download the evidence.
8. Complete all actions and test Close Grievance.
9. Test Reopen Grievance.

## Security warning
The current SQL policies are DEVELOPMENT policies that allow anon/authenticated access. Do not enter validated company data yet. The next security stage should add Supabase Auth and role-based RLS, then remove the temporary `dev_*` policies.
