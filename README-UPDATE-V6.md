# System Monitoring Update V6

V6 adds **Closure & Verification** and **Reopen Grievance** to the Grievance Tracker.

## New functions
- Closure readiness checks
- Cannot close while any action plan is not `Completed`
- At least one evidence file is required before closure
- Closure date, verifier, verification method, outcome, primary evidence, and closure summary
- Closing automatically sets case status to `Closed` and progress to `100%`
- Closure is automatically written into the case timeline
- Reopen a closed grievance with reason, person, date, new progress, due date, and next action
- Reopen history is preserved

## Browser-only starter mode
All records still use Local Storage / IndexedDB. Do not use final confidential production data yet. Supabase will replace browser storage later.

## Install
Upload the `app` folder from this update to the root of the existing GitHub repository and commit the changes. Vercel will redeploy automatically.
