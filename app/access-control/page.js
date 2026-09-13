'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase, getSupabaseConfigError } from '../../lib/supabaseClient';

const ROLES=[
  {value:'admin',label:'Administrator',desc:'Full access to every PT, configuration, commercial comparison, deletion and user access.'},
  {value:'assessor',label:'Assessor',desc:'Operational input for assigned PTs. Can fill assessments, evidence, grievance, audit and corrective action; cannot verify SIMS.'},
  {value:'verifier',label:'Verifier',desc:'Review and verification for assigned PTs. SIMS verification is separated from assessor input.'},
  {value:'viewer',label:'Management Viewer',desc:'Read-only access. Can be portfolio-wide or limited to selected PTs.'},
];

export default function AccessControl(){
  const [users,setUsers]=useState([]);
  const [companies,setCompanies]=useState([]);
  const [accessRows,setAccessRows]=useState([]);
  const [drafts,setDrafts]=useState({});
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [search,setSearch]=useState('');

  useEffect(()=>{loadAll()},[]);

  async function loadAll(){
    const ce=getSupabaseConfigError();
    if(ce||!supabase){setError(ce||'Supabase is not configured.');setLoading(false);return;}
    setLoading(true);setError('');
    const [u,c,a]=await Promise.all([
      supabase.from('app_user_roles').select('email,user_id,display_name,role,active,company_scope,updated_at').order('display_name'),
      supabase.from('companies').select('id,company_code,company_name,status').neq('status','Inactive').order('company_code'),
      supabase.from('app_user_company_access').select('email,company_id')
    ]);
    const e=u.error||c.error||a.error;
    if(e){setError(`${e.message}. Pastikan SUPABASE-ACCESS-CONTROL-V8-24.sql sudah dijalankan.`);setLoading(false);return;}
    const uu=u.data||[],cc=c.data||[],aa=a.data||[];
    setUsers(uu);setCompanies(cc);setAccessRows(aa);
    const next={};
    uu.forEach(row=>{
      next[row.email]={
        role:row.role||'viewer',
        active:row.active!==false,
        companyScope:row.role==='admin'?'all':(row.company_scope||'all'),
        companyIds:aa.filter(x=>x.email===row.email).map(x=>x.company_id),
      };
    });
    setDrafts(next);setLoading(false);
  }

  const visibleCompanies=useMemo(()=>{
    const q=search.trim().toLowerCase();
    if(!q)return companies;
    return companies.filter(c=>`${c.company_code} ${c.company_name}`.toLowerCase().includes(q));
  },[companies,search]);

  function patch(email,change){
    setDrafts(d=>{
      const current=d[email]||{role:'viewer',active:true,companyScope:'selected',companyIds:[]};
      const next={...current,...change};
      if(next.role==='admin')next.companyScope='all';
      return {...d,[email]:next};
    });
  }
  function toggleCompany(email,id){
    const d=drafts[email];if(!d)return;
    patch(email,{companyIds:d.companyIds.includes(id)?d.companyIds.filter(x=>x!==id):[...d.companyIds,id]});
  }

  async function saveUser(user){
    const d=drafts[user.email];if(!d)return;
    if(d.active&&d.role!=='admin'&&d.companyScope==='selected'&&!d.companyIds.length){setError('Selected PT membutuhkan minimal 1 PT.');return;}
    setBusy(user.email);setError('');setNotice('');
    const {error:e}=await supabase.rpc('smd_set_user_access',{
      p_email:user.email,
      p_role:d.role,
      p_company_scope:d.role==='admin'?'all':d.companyScope,
      p_company_ids:d.companyScope==='selected'?d.companyIds:[],
      p_active:d.active,
    });
    if(e)setError(e.message);
    else{setNotice(`Akses ${user.display_name} berhasil disimpan.`);await loadAll();}
    setBusy('');
  }

  async function syncUsers(){
    setBusy('sync');setError('');setNotice('');
    const {data,error:e}=await supabase.rpc('smd_sync_auth_users');
    if(e)setError(e.message);else{setNotice(`Supabase Auth tersinkron. ${data??0} user diproses.`);await loadAll();}
    setBusy('');
  }

  const activeAdmins=users.filter(u=>u.active&&u.role==='admin').length;

  return <div className="page-wrap access-root"><style>{styles}</style>
    <section className="access-hero">
      <div><span>ADMINISTRATION · SECURITY</span><h1>User Access & PT Scope</h1><p>Atur role dan batasi setiap user hanya ke PT yang menjadi tanggung jawabnya. Enforcement dilakukan oleh Supabase RLS, bukan hanya tampilan menu.</p></div>
      <button onClick={syncUsers} disabled={busy==='sync'}>{busy==='sync'?'Syncing…':'Sync Supabase Auth Users'}</button>
    </section>

    {error?<div className="access-alert error"><strong>Access control error</strong><span>{error}</span></div>:null}
    {notice?<div className="access-alert success">{notice}</div>:null}

    <section className="access-summary">
      <div><span>Registered Users</span><strong>{loading?'…':users.length}</strong></div>
      <div><span>Active Admins</span><strong>{loading?'…':activeAdmins}</strong></div>
      <div><span>Active PT</span><strong>{loading?'…':companies.length}</strong></div>
      <div><span>Security Mode</span><strong>Role + PT</strong></div>
    </section>

    <section className="role-guide">
      {ROLES.map(r=><article key={r.value}><b>{r.label}</b><span>{r.desc}</span></article>)}
    </section>

    <section className="access-toolbar"><label><span>Search PT</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Code / legal company name"/></label><p>Untuk user non-admin, pilih <b>Selected PT only</b> agar dropdown dan data di seluruh modul otomatis hanya menampilkan PT yang ditugaskan.</p></section>

    <section className="user-list">
      {loading?<div className="access-empty">Loading access registry…</div>:users.map(user=>{
        const d=drafts[user.email]||{};
        const role=ROLES.find(r=>r.value===d.role);
        return <article className={`user-card ${!d.active?'inactive':''}`} key={user.email}>
          <div className="user-head"><div className="avatar">{initials(user.display_name)}</div><div><h2>{user.display_name}</h2><p>{user.email}</p></div><span className={`state ${d.active?'on':'off'}`}>{d.active?'ACTIVE':'INACTIVE'}</span></div>
          <div className="access-grid">
            <label><span>Role</span><select value={d.role||'viewer'} onChange={e=>patch(user.email,{role:e.target.value})}>{ROLES.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select><small>{role?.desc}</small></label>
            <label><span>Account Status</span><select value={d.active?'active':'inactive'} onChange={e=>patch(user.email,{active:e.target.value==='active'})}><option value="active">Active</option><option value="inactive">Inactive / block access</option></select><small>Inactive user akan dikeluarkan saat sesi login diperiksa.</small></label>
            <label><span>PT Scope</span><select value={d.role==='admin'?'all':(d.companyScope||'all')} disabled={d.role==='admin'} onChange={e=>patch(user.email,{companyScope:e.target.value})}><option value="all">All PT</option><option value="selected">Selected PT only</option></select><small>{d.role==='admin'?'Administrator selalu mempunyai akses seluruh PT.':'Selected PT adalah pilihan paling aman untuk user operasional.'}</small></label>
          </div>
          {d.role!=='admin'&&d.companyScope==='selected'?<div className="company-scope"><div className="scope-head"><strong>Assigned PT</strong><span>{d.companyIds?.length||0} selected</span></div><div className="company-grid">{visibleCompanies.map(c=><label className={d.companyIds?.includes(c.id)?'checked':''} key={c.id}><input type="checkbox" checked={!!d.companyIds?.includes(c.id)} onChange={()=>toggleCompany(user.email,c.id)}/><span><b>{c.company_code}</b>{c.company_name}</span></label>)}</div>{!visibleCompanies.length?<div className="access-empty">No PT matches the search.</div>:null}</div>:null}
          <div className="card-footer"><div><b>Effective access</b><span>{d.role==='admin'?'All PT · Full administration':d.companyScope==='all'?`All PT · ${role?.label}`:`${d.companyIds?.length||0} PT · ${role?.label}`}</span></div><button onClick={()=>saveUser(user)} disabled={busy===user.email}>{busy===user.email?'Saving…':'Save Access'}</button></div>
        </article>
      })}
    </section>
    <section className="safety-note"><strong>Safety rule</strong><p>Sistem mencegah penghapusan Administrator aktif terakhir. Perubahan role + daftar PT disimpan atomik melalui database function agar tidak ada kondisi role berubah tetapi PT assignment gagal tersimpan.</p></section>
  </div>
}

function initials(name=''){return String(name).split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('')||'U'}

const styles=`
.access-root{max-width:1280px;margin:0 auto}.access-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:22px 24px;border-radius:20px;background:linear-gradient(135deg,#123d2d,#0d5438);color:white;margin-bottom:14px}.access-hero span{font-size:9px;letter-spacing:.13em;font-weight:900;color:#b9d6c5}.access-hero h1{margin:5px 0 4px;font-size:28px}.access-hero p{margin:0;max-width:790px;color:#d3e0d8;font-size:11px;line-height:1.55}.access-hero button,.card-footer button{border:0;border-radius:10px;background:#d7f36a;color:#173c2b;font-weight:900;padding:10px 14px;cursor:pointer}.access-hero button:disabled,.card-footer button:disabled{opacity:.55}.access-alert{display:grid;gap:3px;border-radius:10px;padding:10px 12px;margin:10px 0;font-size:11px}.access-alert.error{background:#fff0ee;border:1px solid #f0c6c1;color:#8e3028}.access-alert.success{background:#eef8f1;border:1px solid #cce6d4;color:#256241}.access-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0}.access-summary>div{background:#fff;border:1px solid #dce7e0;border-radius:13px;padding:13px}.access-summary span{display:block;color:#74847b;text-transform:uppercase;font-size:8px;font-weight:900;letter-spacing:.07em}.access-summary strong{display:block;margin-top:5px;font-size:21px;color:#183f2d}.role-guide{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:12px}.role-guide article{background:#f8fbf9;border:1px solid #dce7e0;border-radius:12px;padding:11px}.role-guide b{display:block;color:#24553b;font-size:11px}.role-guide span{display:block;margin-top:4px;color:#718178;font-size:9px;line-height:1.45}.access-toolbar{display:grid;grid-template-columns:minmax(260px,420px) 1fr;gap:14px;align-items:end;background:#fff;border:1px solid #dce7e0;border-radius:13px;padding:12px;margin-bottom:12px}.access-toolbar label{display:grid;gap:5px}.access-toolbar label>span,.access-grid label>span{font-size:8px;text-transform:uppercase;font-weight:900;letter-spacing:.08em;color:#718178}.access-toolbar input,.access-grid select{height:39px;border:1px solid #d5e1da;border-radius:9px;padding:0 10px;background:#fff;color:#264735}.access-toolbar p{margin:0;color:#64766c;font-size:10px}.user-list{display:grid;gap:12px}.user-card{background:#fff;border:1px solid #dbe7df;border-radius:16px;padding:16px;box-shadow:0 4px 18px rgba(25,68,46,.04)}.user-card.inactive{opacity:.72}.user-head{display:grid;grid-template-columns:auto 1fr auto;gap:11px;align-items:center;padding-bottom:12px;border-bottom:1px solid #edf2ee}.avatar{width:42px;height:42px;border-radius:12px;background:#173f2d;color:#d7f36a;display:grid;place-items:center;font-weight:900}.user-head h2{font-size:15px;margin:0;color:#173f2d}.user-head p{font-size:9px;color:#718178;margin:3px 0 0}.state{font-size:8px;font-weight:900;border-radius:999px;padding:5px 8px}.state.on{background:#e8f7ed;color:#24643f}.state.off{background:#f3f3f3;color:#777}.access-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:12px 0}.access-grid label{display:grid;gap:5px}.access-grid small{font-size:8px;line-height:1.4;color:#809087}.company-scope{background:#f8fbf9;border:1px solid #e0e9e3;border-radius:12px;padding:11px;margin-top:8px}.scope-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;color:#345c45;font-size:10px}.company-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;max-height:300px;overflow:auto;padding-right:3px}.company-grid label{display:flex;gap:8px;align-items:flex-start;border:1px solid #dde7e0;border-radius:9px;padding:8px;background:white;cursor:pointer}.company-grid label.checked{border-color:#8dc5a1;background:#eef8f1}.company-grid input{margin-top:2px}.company-grid span{font-size:9px;color:#61736a;line-height:1.35}.company-grid b{display:block;color:#234c36;font-size:10px}.card-footer{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-top:12px;padding-top:11px;border-top:1px solid #edf2ee}.card-footer div{display:grid;gap:2px}.card-footer b{font-size:9px;color:#345d46}.card-footer span{font-size:9px;color:#75867d}.safety-note{margin:14px 0 3px;padding:12px 14px;border-radius:12px;background:#fff9e8;border:1px solid #ead89d;color:#72591d}.safety-note strong{font-size:10px}.safety-note p{font-size:9px;line-height:1.5;margin:4px 0 0}.access-empty{text-align:center;color:#819087;font-size:10px;padding:18px}@media(max-width:960px){.access-summary,.role-guide{grid-template-columns:repeat(2,1fr)}.access-grid,.company-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:680px){.access-hero{flex-direction:column}.access-summary,.role-guide,.access-grid,.company-grid,.access-toolbar{grid-template-columns:1fr}.card-footer{align-items:flex-start;flex-direction:column}.card-footer button{width:100%}}
`;
