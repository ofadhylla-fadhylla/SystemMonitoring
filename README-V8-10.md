# V8.10 — Penawaran Harga + Vendor Decision Insight

1. Run `SUPABASE-QUOTATION-V8-10.sql` in Supabase SQL Editor.
2. Upload to GitHub preserving paths:
   - `app/quotations/page.js`
   - `app/quotations/page.module.css`
   - `components/Sidebar.js`
3. Commit: `Add quotation comparison and vendor insight`
4. Wait for Vercel Ready, then Ctrl+F5.

The module follows the uploaded `Form Perbandingan Harga.xlsx` structure: per-unit initial/final quotations, total audit cost, system fee, travel/lodging/meals, payment terms, offer validity, legal/contact information, and technical/operational questionnaire.

The "AI Insight" in this version is a local rule-based decision-support score (0–100). It does not send vendor data to an external AI service. It compares price, negotiation savings, certificate lead time, weekend availability, operational completeness and admin completeness.
