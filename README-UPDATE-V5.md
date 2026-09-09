# System Monitoring Update V5

## Evidence & Documents

This update activates Evidence & Documents on each grievance detail page.

Included:
- Upload evidence files from the browser
- Evidence ID generation (EVD-001, EVD-002, ...)
- Evidence category, date, uploader and notes
- Link evidence to an Action Plan item
- View and download saved files
- Delete evidence
- Evidence summary: total files, linked actions, browser storage size, latest evidence
- Maximum 10 MB per file in starter mode

## Starter-mode storage

Metadata is saved in Local Storage. The actual file blob is saved in IndexedDB in the same browser. This is still a browser-only prototype: evidence is not shared between devices or users. Supabase Storage will be used in a later stage for centralized evidence storage.

## Install

Upload the `app` folder to the existing GitHub `SystemMonitoring` repository, commit the changes, wait for Vercel deployment, then hard-refresh the grievance detail page.
