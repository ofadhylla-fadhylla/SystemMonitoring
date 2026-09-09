# System Monitoring V8.3 — Edit & Delete

Adds:
- Audit Monitoring: edit from calendar or table, delete audit, replace audit report while editing.
- Certification Monitoring: edit and delete controls.
- Deleting a certification keeps existing audit rows (certification_id becomes null) because the database FK uses ON DELETE SET NULL.

No SQL changes are required. Upload the `app` folder to GitHub and commit.
