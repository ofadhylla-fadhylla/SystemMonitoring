'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase, getSupabaseConfigError } from '../../lib/supabaseClient';
import { SYSTEM_USERS } from '../../lib/systemUsers';
import styles from './page.module.css';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [selectedUsername, setSelectedUsername] = useState(SYSTEM_USERS[0].username);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selectedUser = useMemo(
    () => SYSTEM_USERS.find(user => user.username === selectedUsername) || SYSTEM_USERS[0],
    [selectedUsername]
  );

  useEffect(() => {
    if (searchParams.get('unauthorized') === '1') {
      setError('Akun tersebut tidak terdaftar sebagai pengguna System Monitoring.');
    }
  }, [searchParams]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    const configError = getSupabaseConfigError();
    if (configError || !supabase) {
      setError(configError || 'Supabase belum terkonfigurasi.');
      return;
    }

    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: selectedUser.email,
      password,
    });
    setBusy(false);

    if (signInError) {
      setError('Password salah atau akun belum dibuat/diaktifkan di Supabase.');
      return;
    }

    window.location.href = '/';
  }

  return (
    <div className={styles.screen}>
      <section className={styles.brandPanel}>
        <div className={styles.brandTop}>
          <div className={styles.logo}>SM</div>
          <div>
            <div className={styles.brandName}>SYSTEM</div>
            <div className={styles.brandSub}>MONITORING</div>
          </div>
        </div>

        <div className={styles.heroCopy}>
          <span>SUSTAINABILITY & COMPLIANCE</span>
          <h1>Monitoring workspace untuk Sustainability.</h1>
          <p>Grievance, audit, certification, NDPE, quotation dan weekly report dalam satu sistem.</p>
        </div>

        <div className={styles.securityNote}>Private access · Supabase Authentication</div>
      </section>

      <section className={styles.formPanel}>
        <form className={styles.card} onSubmit={handleSubmit}>
          <div className={styles.cardHead}>
            <span>SYSTEM ACCESS</span>
            <h2>Login</h2>
            <p>Pilih nama pengguna lalu masukkan password masing-masing.</p>
          </div>

          <label className={styles.field}>
            <span>User</span>
            <select value={selectedUsername} onChange={e => setSelectedUsername(e.target.value)}>
              {SYSTEM_USERS.map(user => (
                <option key={user.username} value={user.username}>{user.name}</option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Password</span>
            <div className={styles.passwordWrap}>
              <input
                required
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Masukkan password"
              />
              <button type="button" onClick={() => setShowPassword(v => !v)}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          <div className={styles.selectedAccount}>
            Login sebagai <strong>{selectedUser.name}</strong>
          </div>

          {error ? <div className={styles.error}>{error}</div> : null}

          <button className={styles.submit} type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Login to System Monitoring'}
          </button>

          <p className={styles.help}>Tidak ada registrasi publik. Akun dibuat oleh administrator Supabase.</p>
        </form>
      </section>
    </div>
  );
}
