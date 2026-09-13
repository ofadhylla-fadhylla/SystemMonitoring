'use client';

export default function SimsContextBar({
  companies,
  standards,
  companyId,
  setCompanyId,
  standardId,
  setStandardId,
  year,
  setYear,
  onOpen,
  loading,
  hideOpenButton=false,
  helperText='Pilih PT, standard, dan tahun assessment.'
}){
  const years=[];
  const now=new Date().getFullYear();
  for(let y=now+1;y>=now-4;y--) years.push(y);

  return <section className="panel sims-context-panel">
    <div className="sims-context-title">
      <div>
        <span className="sims-step-label">ASSESSMENT CONTEXT</span>
        <h2>Pilih perusahaan yang akan dinilai</h2>
        <p>{helperText}</p>
      </div>
      {companyId?<span className="sims-ready-chip">Ready</span>:<span className="sims-wait-chip">Select PT</span>}
    </div>
    <div className={`sims-context-grid ${hideOpenButton?'sims-context-grid-auto':''}`}>
      <label className="form-field sims-company-field">
        <span>Company / PT *</span>
        <select value={companyId} onChange={e=>setCompanyId(e.target.value)}>
          <option value="">Select company…</option>
          {companies.map(c=><option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>)}
        </select>
      </label>
      <label className="form-field">
        <span>Standard *</span>
        <select value={standardId} onChange={e=>setStandardId(e.target.value)}>
          <option value="">Select standard…</option>
          {standards.map(s=><option key={s.id} value={s.id}>{s.name}{s.version?` · ${s.version}`:''}</option>)}
        </select>
      </label>
      <label className="form-field">
        <span>Assessment Year *</span>
        <select value={year} onChange={e=>setYear(Number(e.target.value))}>
          {years.map(y=><option key={y} value={y}>{y}</option>)}
        </select>
      </label>
      {!hideOpenButton?<div className="sims-open-wrap"><button className="primary-btn" onClick={onOpen} disabled={!companyId||!standardId||loading}>{loading?'Loading…':'Open Assessment'}</button></div>:null}
    </div>
    {hideOpenButton?<div className="sims-auto-note">Assessment akan dimuat otomatis setelah PT dipilih.</div>:null}
  </section>
}
