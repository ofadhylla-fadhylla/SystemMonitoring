# V8.14 Login - System Monitoring

Adds a real Supabase Auth login page with four approved users:
- Ochtoryano Fadhylla
- Winengku Pamartajati
- Shafiyah Mutiara
- Nicky Sudarmantoro

The login page shows a user dropdown and password field. Internally it maps each user to a synthetic Supabase Auth email. Passwords are created only in Supabase and are never stored in GitHub/source code.

## Install order
1. Supabase > Authentication > Users > Add user. Create all four internal email accounts listed in the SQL/instructions and choose passwords. Auto Confirm User = ON.
2. Run SUPABASE-LOGIN-V8-14.sql in SQL Editor.
3. Upload app/layout.js, app/login/, components/AuthGate.*, and lib/systemUsers.js to GitHub.
4. Wait for Vercel deployment, then Ctrl+F5.

All four users have the same full application access in V8.14. Per-user roles can be added later.
