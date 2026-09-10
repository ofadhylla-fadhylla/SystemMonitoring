# System Monitoring V8.9 — Weekly Report Baseline + Live Merge

This fixes an important gap in the previous live-only report builder. A weekly progress report is a rolling management report, so it should carry forward the last report and then apply current monitoring changes.

## Install
1. Run `SUPABASE-WEEKLY-BASELINE-28-AUG-2026.sql` in Supabase SQL Editor.
2. Upload `app/weekly-report/page.js` and `app/globals.css` to GitHub using the same paths.
3. Commit and wait for Vercel to redeploy.
4. Open Weekly Report, choose a date after 28 Aug 2026, and click **Build Weekly Draft**.

## What changes
- Seeds the real 28 Aug 2026 Word report as the first baseline.
- Current week automatically carries forward the latest report if the selected date has no manual content.
- Live Audit / Certification data updates matching carried rows rather than starting from an empty report.
- New grievances during the reporting period are still inserted automatically.
- ISPO Certification Plan is carried forward and updated when Stage I / II audit events exist.
- Editing an AUTO/CARRY row converts it to manual so later syncs preserve the user's wording.
