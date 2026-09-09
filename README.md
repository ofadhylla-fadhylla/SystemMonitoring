# V8.6 Grievance Detail Route Fix

Fixes `Case not found` when opening a grievance detail.

The detail page now accepts both:
- Case ID routes such as `/grievances/GRV-0001`
- Supabase UUID routes such as `/grievances/<uuid>`

Upload the `app` folder to the existing GitHub repository and commit.
No SQL/database change is required.
