# SIMS V1 — Sustainability Assessment, Action Plan & Compliance Level

This update adds the SIMS workflow requested for KPN System Monitoring.

## What is included

- Sustainability Assessment
  - mandatory Company / PT filter from existing `companies` master
  - standard and assessment year filter
  - Principle > Criterion > Indicator hierarchy
  - assessment status, explanation, evidence upload
  - verifier status and notes
  - automatic gap creation when an indicator is `Not Fulfilled`
- Sustainability Action Plan
  - corrective action, PIC, priority, deadline, status
  - completion evidence
  - verifier status and notes
  - overdue indicator
- Sustainability Compliance Level
  - compliance only counts `Fulfilled + Verified`
  - overall company compliance
  - compliance by Principle and Criterion
  - company ranking for the same standard and year
- Master import from the original KPN Excel workbook
  - button: `Sustainability Assessment > Import Master Excel`
  - choose the source sheet
  - the app reads Principle / Criterion / Indicator / Object Evidence and upserts the master to Supabase

## Installation

### 1. Supabase

Open Supabase > SQL Editor and run:

1. `SUPABASE-SIMS-V1.sql`
2. `SIMS-ISPO-PERMENTAN33-IMPORT.sql`

The first script creates the SIMS tables, private evidence bucket and authenticated policies. The second adds a reusable JSON import helper. The application itself can import the Excel workbook directly from the browser.

### 2. Deploy application

This update is on branch `sims-v1`.

Files added / changed:

- `app/sims/page.js`
- `app/sims/assessment/page.js`
- `app/sims/action-plan/page.js`
- `app/sims/compliance/page.js`
- `app/sims/sims.module.css`
- `components/SimsContextBar.js`
- `components/Sidebar.js`
- `package.json` (`xlsx` dependency)
- `SUPABASE-SIMS-V1.sql`
- `SIMS-ISPO-PERMENTAN33-IMPORT.sql`

Merge the branch or PR into `main`. Vercel will deploy automatically from the existing project configuration.

### 3. Import the KPN master workbook

After deployment:

1. Sign in to System Monitoring.
2. Open `Sustainability Assessment`.
3. Select `ISPO Permentan 33/2025`.
4. Click `Import Master Excel`.
5. Upload the original workbook `SIMS - KPN - NDPE - ISPO Permentan 33 2025.xlsx`.
6. Select the ISPO / Draft sheet that contains the Permentan 33/2025 hierarchy.
7. Review the detected indicator count and preview.
8. Click `Import Master`.
9. Select PT + Standard + Year, then `Open Assessment`.

The importer preserves source wording from the workbook. It does not generate or rewrite indicator requirements.

## Compliance rule

`Compliance % = Verified Fulfilled indicators / total active master indicators × 100`

Self-assessment marked `Fulfilled` but still `Pending` is shown as `Need Verification` and is not counted as compliant yet.

## Workflow

`PT + Standard + Year > Assessment > Evidence > Verification > Gap > Action Plan > Completion Evidence > Verifier Closure > Compliance Level`

## Notes

- All currently authenticated System Monitoring users have SIMS access in V1, matching the current application access model.
- Evidence files are private in the `sims-evidence` Supabase Storage bucket.
- Existing Master Company & Site data is reused. SIMS does not create a second company master.
