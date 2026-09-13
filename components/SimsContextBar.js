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

  return <>
    <style>{`
      .sims-context-panel{border-color:#d8e6dd!important;background:linear-gradient(180deg,#fff,#fbfdfc)!important;padding:22px!important}
      .sims-context-title{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:18px}
      .sims-context-title h2{margin:4px 0 5px;font-size:18px;color:#103b29}
      .sims-context-title p{margin:0;color:#74857b;font-size:12px}
      .sims-step-label{font-size:10px;letter-spacing:.12em;font-weight:800;color:#6d8175}
      .sims-ready-chip,.sims-wait-chip{display:inline-flex;padding:7px 10px;border-radius:999px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
      .sims-ready-chip{background:#e8f6ed;color:#17613e;border:1px solid #cde7d6}
      .sims-wait-chip{background:#f3f5f4;color:#718078;border:1px solid #e0e6e2}
      .sims-context-grid{display:grid;grid-template-columns:minmax(260px,1.7fr) minmax(220px,1.1fr) 170px auto;gap:12px;align-items:end}
      .sims-context-grid-auto{grid-template-columns:minmax(280px,1.8fr) minmax(230px,1.1fr) 180px}
      .sims-open-wrap{display:flex;align-items:end}.sims-open-wrap button{height:42px;white-space:nowrap}
      .page-wrap:has(.sims-context-auto)>.page-heading p{display:none!important}
      @media(max-width:1000px){.sims-context-grid,.sims-context-grid-auto{grid-template-columns:1fr 1fr}.sims-company-field{grid-column:1/-1}}
      @media(max-width:650px){.sims-context-title{flex-direction:column}.sims-context-grid,.sims-context-grid-auto{grid-template-columns:1fr}.sims-company-field{grid-column:auto}}
    `}</style>
    <section className={`panel sims-context-panel ${hideOpenButton?'sims-context-auto':''}`}>
      <div className="sims-context-title">
        <div>
          <span className="sims-step-label">ASSESSMENT CONTEXT</span>
          <h2>Pilih perusahaan yang akan dinilai</h2>
          {!hideOpenButton&&helperText?<p>{helperText}</p>:null}
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
    </section>
  </>
}
