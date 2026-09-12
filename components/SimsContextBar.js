'use client';

export default function SimsContextBar({companies,standards,companyId,setCompanyId,standardId,setStandardId,year,setYear,onOpen,loading}){
  const years=[];const now=new Date().getFullYear();for(let y=now+1;y>=now-4;y--)years.push(y);
  return <section className="panel sims-context-panel">
    <div className="sims-context-grid">
      <label className="form-field"><span>Company / PT *</span><select value={companyId} onChange={e=>setCompanyId(e.target.value)}><option value="">Select company…</option>{companies.map(c=><option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>)}</select></label>
      <label className="form-field"><span>Standard *</span><select value={standardId} onChange={e=>setStandardId(e.target.value)}><option value="">Select standard…</option>{standards.map(s=><option key={s.id} value={s.id}>{s.name}{s.version?` · ${s.version}`:''}</option>)}</select></label>
      <label className="form-field"><span>Assessment Year *</span><select value={year} onChange={e=>setYear(Number(e.target.value))}>{years.map(y=><option key={y} value={y}>{y}</option>)}</select></label>
      <div className="sims-open-wrap"><button className="primary-btn" onClick={onOpen} disabled={!companyId||!standardId||loading}>{loading?'Loading…':'Open Assessment'}</button></div>
    </div>
  </section>
}
