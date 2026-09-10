-- =========================================================
-- SYSTEM MONITORING V8.9
-- REAL WEEKLY REPORT BASELINE
-- Source: Progress_Weekly_System_Monitoring_Bilingual_28_August_2026.docx
-- This seeds the 28 Aug 2026 report so future weekly drafts can carry it forward.
-- Existing non-baseline weekly rows are preserved.
-- =========================================================

alter table public.weekly_ispo_plans
  add column if not exists source_module text,
  add column if not exists source_reference text;

-- Remove only this seed if it was run before.
delete from public.weekly_report_entries
where report_date = '2026-08-28'
  and source_module = 'baseline_word_20260828';

delete from public.weekly_ispo_plans
where report_date = '2026-08-28'
  and source_module = 'baseline_word_20260828';

-- ---------------------------------------------------------
-- 1. ISPO
-- ---------------------------------------------------------
insert into public.weekly_report_entries
(report_date, section, unit, stage, progress_id, progress_en, sort_order, source_module, source_reference)
values
(
 '2026-08-28','ISPO','PANP-P','Surveillance',
 $$Verifikasi Lembaga Sertifikasi tindakan perbaikan ketidaksesuaian Audit Surveillance 2 mengenai pemenuhan Plasma dengan hasil telah memenuhi. Sertifikat ISPO PANP-P direkomendasikan untuk tetap dipertahankan.$$, 
 $$The Certification Body has verified the corrective actions for the non-conformity identified during the 2nd Surveillance Audit regarding Plasma compliance, with the result confirming that the requirements have been fulfilled. The ISPO Certificate of PANP-P is recommended to be maintained.$$, 
 1,'baseline_word_20260828','word:2026-08-28:ISPO:1'
),
(
 '2026-08-28','ISPO','ACP','Preparation for initial audit',
 $$Persiapan Audit Sertifikasi sedang berlangsung. Internal Audit masih berlangsung pada 26 Agustus–5 September 2026.$$, 
 $$Preparation for the ISPO Certification Audit is currently underway. The Internal Audit is still ongoing from 26 August to 5 September 2026.$$, 
 2,'baseline_word_20260828','word:2026-08-28:ISPO:2'
);

-- ISPO Certification Plan 2026-2027
insert into public.weekly_ispo_plans
(report_date, pt, stage_1, stage_2, explanation, sort_order, source_module, source_reference)
values
('2026-08-28','ACP','3rd Week Oct 2026','3rd Week Apr 2027','ISPO certification contract has been approved.',1,'baseline_word_20260828','word:2026-08-28:PLAN:1'),
('2026-08-28','NJP','3rd Week Oct 2026','3rd Week Apr 2027','Certification Body vendor selection stage.',2,'baseline_word_20260828','word:2026-08-28:PLAN:2'),
('2026-08-28','PLD SBS','3rd Week Oct 2026','3rd Week Apr 2027','Certification Body vendor selection stage.',3,'baseline_word_20260828','word:2026-08-28:PLAN:3'),
('2026-08-28','GAN','4th Week Oct 2026','4th Week Apr 2027','Certification Body vendor selection stage.',4,'baseline_word_20260828','word:2026-08-28:PLAN:4'),
('2026-08-28','SUM SBS','4th Week Oct 2026','4th Week Apr 2027','Certification Body vendor selection stage.',5,'baseline_word_20260828','word:2026-08-28:PLAN:5'),
('2026-08-28','AJP','2nd Week Nov 2026','2nd Week May 2027','Certification Body vendor selection stage.',6,'baseline_word_20260828','word:2026-08-28:PLAN:6'),
('2026-08-28','APM','3rd Week Nov 2026','3rd Week May 2027','Certification Body vendor selection stage.',7,'baseline_word_20260828','word:2026-08-28:PLAN:7'),
('2026-08-28','PANP Ldk','4th Week Nov 2026','4th Week May 2027','Certification Body vendor selection stage.',8,'baseline_word_20260828','word:2026-08-28:PLAN:8'),
('2026-08-28','WKN','1st Week Dec 2026','1st Week Jun 2027','Certification Body vendor selection stage.',9,'baseline_word_20260828','word:2026-08-28:PLAN:9'),
('2026-08-28','SUAN','2nd Week Dec 2026','2nd Week Jun 2027','Certification Body vendor selection stage.',10,'baseline_word_20260828','word:2026-08-28:PLAN:10'),
('2026-08-28','WKSM','2nd Week Dec 2026','2nd Week Jun 2027','Certification Body vendor selection stage.',11,'baseline_word_20260828','word:2026-08-28:PLAN:11');

-- ---------------------------------------------------------
-- 2. ISCC
-- ---------------------------------------------------------
insert into public.weekly_report_entries
(report_date, section, unit, stage, progress_id, progress_en, sort_order, source_module, source_reference)
values
(
 '2026-08-28','ISCC','PBSU1, Estate BSU1, Estate BSU2, Estate BSU3, Estate BSU4','Re-certification',
 $$Sertifikat terbaru telah terbit, berlaku tanggal 28 Agustus 2026 – 27 Agustus 2027. Cakupan material: FFB, CPO, PK, POME Oil, EFB Oil dan Palm Kernel Shell.$$, 
 $$The latest certificate has been issued and is valid from 28 August 2026 to 27 August 2027. Material scope: FFB, CPO, PK, POME Oil, EFB Oil, and Palm Kernel Shell.$$, 
 1,'baseline_word_20260828','word:2026-08-28:ISCC:1'
),
(
 '2026-08-28','ISCC','PBSU2, PKAMU, PSAM','Re-certification',
 $$Sertifikat terbaru telah terbit, berlaku tanggal 28 Agustus 2026 – 27 Agustus 2027. Cakupan material: POME Oil, EFB Oil dan Palm Kernel Shell.$$, 
 $$The latest certificate has been issued and is valid from 28 August 2026 to 27 August 2027. Material scope: POME Oil, EFB Oil, and Palm Kernel Shell.$$, 
 2,'baseline_word_20260828','word:2026-08-28:ISCC:2'
);

-- ---------------------------------------------------------
-- 3. INS
-- ---------------------------------------------------------
insert into public.weekly_report_entries
(report_date, section, unit, stage, progress_id, progress_en, sort_order, source_module, source_reference)
values
(
 '2026-08-28','INS','PKAMU, PBSU2, PSAM','Surveillance',
 $$Audit Surveillance direncanakan pada 31 Agustus–4 September 2026. Proses persiapan audit.$$, 
 $$The Surveillance Audit is scheduled for 31 August–4 September 2026. Audit preparation is currently underway.$$, 
 1,'baseline_word_20260828','word:2026-08-28:INS:1'
),
(
 '2026-08-28','INS','PACP, PAPM, PWKSM','Surveillance',
 $$Audit Surveillance direncanakan pada 14–18 September 2026. Proses persiapan audit.$$, 
 $$The Surveillance Audit is scheduled for 14–18 September 2026. Audit preparation is currently underway.$$, 
 2,'baseline_word_20260828','word:2026-08-28:INS:2'
),
(
 '2026-08-28','INS','PSIP, PRamin, PPulai, PNyato, PAgatis','Surveillance',
 $$Audit Surveillance diperkirakan dilaksanakan pada minggu keempat Oktober 2026.$$, 
 $$The Surveillance Audit is estimated to be conducted in the fourth week of October 2026.$$, 
 3,'baseline_word_20260828','word:2026-08-28:INS:3'
),
(
 '2026-08-28','INS','PBSU1, PCRS1, PCRS2, PJJP, PWKN, PPTW','Re-certification',
 $$Audit Re-certification diperkirakan dilaksanakan pada minggu kedua September 2026. Saat ini menunggu proposal biaya resertifikasi dari SGS Italy.$$, 
 $$The Re-certification Audit is estimated to be conducted in the second week of September 2026. Currently awaiting the recertification cost proposal from SGS Italy.$$, 
 4,'baseline_word_20260828','word:2026-08-28:INS:4'
);

-- ---------------------------------------------------------
-- 5. Lain-lain
-- Grievance remains system-generated: if no new grievance, UI/Word prints the default sentence.
-- ---------------------------------------------------------
insert into public.weekly_report_entries
(report_date, section, unit, stage, progress_id, progress_en, sort_order, source_module, source_reference)
values
(
 '2026-08-28','Lain-lain',null,null,
 $$Staff Sertifikasi HO a.n Niky Sudarmono (mutase dari CRS) akan efektif bekerja di HO pada tanggal 7 September 2026.$$, 
 $$HO Certification Staff Niky Sudarmono (transferred from CRS), will officially commence his assignment at HO on 7 September 2026.$$, 
 1,'baseline_word_20260828','word:2026-08-28:MISC:1'
),
(
 '2026-08-28','Lain-lain',null,null,
 $$Training refreshment ISPO Permentan 33 tahun 2025 akan dilaksanakan pada 9–10 September 2026 diikuti oleh 10 personil Sustainability (7 dari HO dan 3 dari site). Pengajuan persetujuan biaya training sudah disetujui oleh CEO.$$, 
 $$The ISPO Refreshment Training on Ministry of Agriculture Regulation No. 33 of 2025 will be conducted on 9–10 September 2026, attended by 10 Sustainability personnel (7 from HO and 3 from the sites). The training cost approval request was approved by the CEO.$$, 
 2,'baseline_word_20260828','word:2026-08-28:MISC:2'
),
(
 '2026-08-28','Lain-lain',null,null,
 $$Training Auditor ISPO Permentan 33 tahun 2025 akan dilaksanakan di Bogor tanggal 21–26 September 2026, diikuti oleh 3 personil Sustainability (2 dari HO dan 1 dari site). Pengajuan training saat ini sedang diproses dengan Dept. POD HC HO.$$, 
 $$ISPO Auditor Training on Ministry of Agriculture Regulation No. 33 of 2025 will be held in Bogor on 21–26 September 2026, attended by 3 Sustainability personnel (2 from HO and 1 from the site). The training request is currently being processed with the POD Department, HC HO.$$, 
 3,'baseline_word_20260828','word:2026-08-28:MISC:3'
);

select
  (select count(*) from public.weekly_report_entries where report_date='2026-08-28' and source_module='baseline_word_20260828') as baseline_rows,
  (select count(*) from public.weekly_ispo_plans where report_date='2026-08-28' and source_module='baseline_word_20260828') as ispo_plan_rows,
  'V8.9 real weekly baseline loaded successfully' as result;
