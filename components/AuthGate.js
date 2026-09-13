'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import NotificationCenter from './NotificationCenter';
import { supabase, getSupabaseConfigError } from '../lib/supabaseClient';
import { canAccessPath, getRoleLabel, getSystemUserByEmail } from '../lib/systemUsers';
import styles from './AuthGate.module.css';

export default function AuthGate({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === '/login';

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const configError = getSupabaseConfigError();

    if (configError || !supabase) {
      setError(configError || 'Supabase belum terkonfigurasi.');
      setLoading(false);
      return;
    }

    async function hydrate(currentSession) {
      if (!active) return;
      setSession(currentSession || null);
      setLoading(false);

      if (!currentSession?.user) {
        if (!isLogin) router.replace('/login');
        return;
      }

      const allowed = getSystemUserByEmail(currentSession.user.email);
      if (!allowed) {
        await supabase.auth.signOut();
        setSession(null);
        if (!isLogin) router.replace('/login?unauthorized=1');
        return;
      }

      if (isLogin) router.replace('/');
    }

    supabase.auth.getSession().then(({ data }) => hydrate(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setLoading(true);
      hydrate(nextSession);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [isLogin, router]);

  const currentUser = useMemo(
    () => getSystemUserByEmail(session?.user?.email),
    [session]
  );

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (isLogin) return children;

  if (loading) {
    return (
      <div className={styles.centerScreen}>
        <div className={styles.loadingCard}>
          <div className={styles.logo}>SMD</div>
          <strong>System Monitoring Dashboard</strong>
          <span>Memeriksa sesi login…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.centerScreen}>
        <div className={styles.errorCard}>
          <h2>Login belum dapat digunakan</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!session?.user || !currentUser) return null;

  const initials = currentUser.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');
  const roleLabel = getRoleLabel(currentUser.role);
  const allowedPath = canAccessPath(currentUser.role, pathname);

  return (
    <div className="app-shell">
      <Sidebar currentUser={currentUser} />
      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="eyebrow">SUSTAINABILITY & COMPLIANCE</div>
            <strong>System Monitoring</strong>
          </div>
          <div className={styles.accountArea}>
            <NotificationCenter />
            <div className={styles.accountCopy}>
              <strong>{currentUser.name}</strong>
              <span>{roleLabel}</span>
            </div>
            <div className={styles.userChip}>{initials || 'SM'}</div>
            <button type="button" className={styles.signOutButton} onClick={signOut}>
              Sign out
            </button>
          </div>
        </header>
        {allowedPath ? children : (
          <div className="page-wrap">
            <div className="panel" style={{maxWidth:720,margin:'40px auto',textAlign:'center',padding:32}}>
              <div className="eyebrow">ACCESS CONTROL</div>
              <h1 style={{margin:'8px 0'}}>Access restricted</h1>
              <p style={{color:'#718179'}}>Role <strong>{roleLabel}</strong> does not have access to this module.</p>
              <button className="primary-btn" onClick={()=>router.replace('/')}>Back to Dashboard</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
