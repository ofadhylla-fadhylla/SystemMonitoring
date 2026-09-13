-- ============================================================
-- KPN SYSTEM MONITORING — SIMS V1.2 NDPE MASTER
-- Source: KPN Plantations Sustainability Policy, January 2023
-- Scope: NDPE / KPN Sustainability Policy
-- Derived master: 9 principles, 18 criteria groups, 48 indicators.
--
-- IMPORTANT:
-- 1) Run SUPABASE-SIMS-V1.sql first.
-- 2) This script adds NDPE as a SECOND standard. It does not change the
--    existing ISPO Permentan 33/2025 master.
-- 3) The policy contains commitments, not a formal certification checklist.
--    Principle/criterion grouping below is an application structure derived
--    from the policy headings and bullet commitments. Indicator wording is
--    based on the policy commitments.
-- 4) Object Evidence is intentionally left NULL because the policy does not
--    prescribe a formal evidence list. Users may still upload supporting evidence.
-- 5) Existing NDPE assessment/evidence is protected from destructive refresh.
-- ============================================================

begin;

insert into public.sims_standards(code,name,version,description,status,updated_at)
values (
  'NDPE-KPN-2023',
  'NDPE — KPN Sustainability Policy',
  'January 2023',
  'Assessment master derived from KPN Plantations Sustainability Policy January 2023.',
  'Active',
  now()
)
on conflict (code) do update set
  name=excluded.name,
  version=excluded.version,
  description=excluded.description,
  status='Active',
  updated_at=now();

do $$
declare
  v_standard_id uuid;
  v_items bigint;
begin
  select id into v_standard_id from public.sims_standards where code='NDPE-KPN-2023';

  select count(*) into v_items
  from public.sims_assessment_items ai
  join public.sims_assessments a on a.id=ai.assessment_id
  where a.standard_id=v_standard_id;

  if v_items > 0 then
    raise exception 'SIMS NDPE master refresh stopped: % assessment item(s) already exist. Existing assessment/evidence is protected.', v_items;
  end if;

  delete from public.sims_principles where standard_id=v_standard_id;
end $$;

-- Principles
with src as (
  select * from jsonb_to_recordset($principles$[{"code":"1","title":"Kepatuhan Hukum","sort_order":1},{"code":"2","title":"Perlindungan Ekosistem Hutan","sort_order":2},{"code":"3","title":"Perlindungan Lahan Gambut","sort_order":3},{"code":"4","title":"Pencegahan Kebakaran","sort_order":4},{"code":"5","title":"Praktik Manajemen Terbaik","sort_order":5},{"code":"6","title":"Keadilan Sosial","sort_order":6},{"code":"7","title":"Sumber yang Berkelanjutan","sort_order":7},{"code":"8","title":"Etika Bisnis","sort_order":8},{"code":"9","title":"Transparansi, Akuntabilitas, dan Pemantauan","sort_order":9}]$principles$::jsonb)
    as x(code text,title text,sort_order int)
), std as (
  select id from public.sims_standards where code='NDPE-KPN-2023'
)
insert into public.sims_principles(standard_id,code,title,sort_order)
select std.id,src.code,src.title,src.sort_order from src cross join std
on conflict (standard_id,code) do update set
  title=excluded.title,
  sort_order=excluded.sort_order;

-- Criteria
with src as (
  select * from jsonb_to_recordset($criteria$[{"principle_code":"1","code":"1.1","title":"Kepatuhan terhadap peraturan dan perjanjian yang berlaku","sort_order":1},{"principle_code":"2","code":"2.1","title":"Perlindungan HCV/HCS, habitat dan spesies","sort_order":2},{"principle_code":"3","code":"3.1","title":"Perlindungan dan pengelolaan lahan gambut","sort_order":3},{"principle_code":"4","code":"4.1","title":"Pencegahan dan pengendalian kebakaran","sort_order":4},{"principle_code":"4","code":"4.2","title":"Restorasi dan konservasi lanskap","sort_order":5},{"principle_code":"5","code":"5.1","title":"Assessment sebelum pembangunan dan penanaman kembali","sort_order":6},{"principle_code":"5","code":"5.2","title":"Produktivitas dan penelitian","sort_order":7},{"principle_code":"5","code":"5.3","title":"Bahan kimia pertanian dan pengendalian hama","sort_order":8},{"principle_code":"5","code":"5.4","title":"Daur ulang nutrisi dan pengelolaan limbah","sort_order":9},{"principle_code":"5","code":"5.5","title":"Aksi iklim dan emisi GRK","sort_order":10},{"principle_code":"6","code":"6.1","title":"Perlindungan dari eksploitasi dan persetujuan berbasis informasi","sort_order":11},{"principle_code":"6","code":"6.2","title":"Hak-hak pekerja","sort_order":12},{"principle_code":"6","code":"6.3","title":"Hak dan perlindungan masyarakat lokal","sort_order":13},{"principle_code":"7","code":"7.1","title":"Ketertelusuran dan kepatuhan pemasok","sort_order":14},{"principle_code":"8","code":"8.1","title":"Integritas dan kepatuhan etika bisnis","sort_order":15},{"principle_code":"9","code":"9.1","title":"Keterbukaan dan pelaporan","sort_order":16},{"principle_code":"9","code":"9.2","title":"Pengaduan dan keluhan","sort_order":17},{"principle_code":"9","code":"9.3","title":"Sistem pemantauan, rencana implementasi dan engagement","sort_order":18}]$criteria$::jsonb)
    as x(principle_code text,code text,title text,sort_order int)
), std as (
  select id from public.sims_standards where code='NDPE-KPN-2023'
)
insert into public.sims_criteria(principle_id,code,title,sort_order)
select p.id,src.code,src.title,src.sort_order
from src
cross join std
join public.sims_principles p
  on p.standard_id=std.id and p.code=src.principle_code
on conflict (principle_id,code) do update set
  title=excluded.title,
  sort_order=excluded.sort_order;

-- Indicators
with src as (
  select * from jsonb_to_recordset($indicators$[{"principle_code":"1","criterion_code":"1.1","code":"1.01","description":"Mematuhi semua peraturan perundang-undangan yang berlaku dari Pemerintah Indonesia dan perjanjian internasional yang telah diratifikasi oleh negara.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Kepatuhan Hukum.","weight":1,"sort_order":1,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"2","criterion_code":"2.1","code":"2.01","description":"Menerapkan nol konversi sesuai rekomendasi penilaian NKT/HCV dan SKT/HCS yang terintegrasi sebelum perluasan cadangan lahan, jika ada.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Perlindungan Ekosistem Hutan.","weight":1,"sort_order":2,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"2","criterion_code":"2.1","code":"2.02","description":"Secara proaktif mengelola kawasan NKT-SKT, termasuk vegetasi alami, badan air, dan air tanah.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Perlindungan Ekosistem Hutan.","weight":1,"sort_order":3,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"2","criterion_code":"2.1","code":"2.03","description":"Melakukan restorasi zona penyangga riparian untuk rehabilitasi habitat, pencegahan erosi tanah, dan pengurangan limpasan permukaan dari area perkebunan.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Perlindungan Ekosistem Hutan.","weight":1,"sort_order":4,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"2","criterion_code":"2.1","code":"2.04","description":"Mengidentifikasi, memantau, dan mengelola konservasi spesies Dilindungi dan Terancam Punah (RTE) di cadangan lahan dan lanskap yang lebih luas bersama pemangku kepentingan.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Perlindungan Ekosistem Hutan.","weight":1,"sort_order":5,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"3","criterion_code":"3.1","code":"3.01","description":"Tidak melakukan pengembangan perkebunan baru di lahan gambut pada kedalaman berapapun.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Perlindungan Lahan Gambut.","weight":1,"sort_order":6,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"3","criterion_code":"3.1","code":"3.02","description":"Mengembalikan dan melindungi vegetasi alami yang tersisa di lahan gambut dalam area konsesi.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Perlindungan Lahan Gambut.","weight":1,"sort_order":7,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"3","criterion_code":"3.1","code":"3.03","description":"Mengembalikan fungsi hidrologis gambut untuk memperlambat penurunan permukaan gambut dan mencegah bahaya kebakaran bersama pemangku kepentingan lainnya.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Perlindungan Lahan Gambut.","weight":1,"sort_order":8,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"3","criterion_code":"3.1","code":"3.04","description":"Menjaga tinggi muka air tanah hingga 40 cm di bawah permukaan gambut sesuai titik penaatan Kementerian Lingkungan Hidup dan Kehutanan.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Perlindungan Lahan Gambut.","weight":1,"sort_order":9,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"4","criterion_code":"4.1","code":"4.01","description":"Menerapkan kebijakan nol bencana kebakaran di area konsesi melalui SOP pembukaan lahan, penanganan kebakaran, dan pemantauan titik api di area konsesi dan sekitarnya.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Pencegahan Kebakaran.","weight":1,"sort_order":10,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"4","criterion_code":"4.1","code":"4.02","description":"Tidak mengakuisisi lahan yang terbakar setelah 1 Juli 2018.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Pencegahan Kebakaran.","weight":1,"sort_order":11,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"4","criterion_code":"4.1","code":"4.03","description":"Secara aktif melibatkan masyarakat dalam program pencegahan kebakaran dan kabut asap.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Pencegahan Kebakaran.","weight":1,"sort_order":12,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"4","criterion_code":"4.2","code":"4.04","description":"Mendukung pengelolaan hutan berbasis masyarakat di bawah program perhutanan sosial Pemerintah Indonesia.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Program Restorasi Lanskap.","weight":1,"sort_order":13,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"4","criterion_code":"4.2","code":"4.05","description":"Melakukan perlindungan dan konservasi unit hidrologis gambut bekerja sama dengan pemangku kepentingan lain, termasuk perusahaan, masyarakat dan LSM.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Program Restorasi Lanskap.","weight":1,"sort_order":14,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"4","criterion_code":"4.2","code":"4.06","description":"Melakukan restorasi ekosistem pada perhutanan sosial, hutan lindung dan kawasan konservasi satwa liar.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Program Restorasi Lanskap.","weight":1,"sort_order":15,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"4","criterion_code":"4.2","code":"4.07","description":"Meningkatkan kapasitas masyarakat lokal dan bisnis berbasis masyarakat melalui agroforestri berkelanjutan dan pengembangan produk non-kayu.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Program Restorasi Lanskap.","weight":1,"sort_order":16,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"5","criterion_code":"5.1","code":"5.01","description":"Melakukan penilaian lingkungan dan sosial di semua area konsesi sebelum pembangunan baru dan penanaman kembali.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Praktik Manajemen Terbaik.","weight":1,"sort_order":17,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"5","criterion_code":"5.2","code":"5.02","description":"Meningkatkan tingkat ekstraksi dan produksi minyak di perkebunan melalui penelitian dan pengembangan bioteknologi.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Praktik Manajemen Terbaik.","weight":1,"sort_order":18,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"5","criterion_code":"5.3","code":"5.03","description":"Tidak menggunakan bahan kimia pertanian yang mengandung Paraquat.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Praktik Manajemen Terbaik.","weight":1,"sort_order":19,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"5","criterion_code":"5.3","code":"5.04","description":"Tidak mengaplikasikan bahan kimia sangat berbahaya Kelas 1A dan 1B, kecuali dalam keadaan luar biasa yang diizinkan.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Praktik Manajemen Terbaik.","weight":1,"sort_order":20,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"5","criterion_code":"5.3","code":"5.05","description":"Menerapkan dan memperluas sistem Pengelolaan Hama Terpadu, termasuk penggunaan kontrol biologis alami.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Praktik Manajemen Terbaik.","weight":1,"sort_order":21,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"5","criterion_code":"5.4","code":"5.06","description":"Mengoptimalkan daur ulang nutrisi dengan meningkatkan kualitas tanah dan mengurangi limbah di perkebunan dan pabrik, termasuk pemanfaatan tandan buah kosong dan limbah minyak sawit.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Praktik Manajemen Terbaik.","weight":1,"sort_order":22,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"5","criterion_code":"5.4","code":"5.07","description":"Mengolah limbah domestik dan air limbah dari operasional perusahaan sesuai baku mutu pemerintah.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Praktik Manajemen Terbaik.","weight":1,"sort_order":23,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"5","criterion_code":"5.5","code":"5.08","description":"Mendukung aksi iklim dengan mengurangi emisi gas rumah kaca secara progresif dari semua unit operasional sejalan dengan target Pemerintah Indonesia.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Praktik Manajemen Terbaik.","weight":1,"sort_order":24,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"6","criterion_code":"6.1","code":"6.01","description":"Tidak melakukan eksploitasi terhadap pekerja, perempuan, anak-anak, pemasok, petani kecil, masyarakat adat dan komunitas lainnya.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Keadilan Sosial.","weight":1,"sort_order":25,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"6","criterion_code":"6.1","code":"6.02","description":"Mendapatkan Persetujuan Atas Dasar Informasi di Awal Tanpa Paksaan (PADIATAPA) dan persetujuan tertulis untuk program pembebasan lahan, pengelolaan perkebunan, restorasi dan konservasi dari perwakilan yang mempunyai mandat.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Keadilan Sosial.","weight":1,"sort_order":26,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"6","criterion_code":"6.2","code":"6.03","description":"Melarang pekerja anak, diskriminasi, pelecehan seksual dan bentuk pelecehan lainnya.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Menghormati Hak-hak Pekerja.","weight":1,"sort_order":27,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"6","criterion_code":"6.2","code":"6.04","description":"Memberikan gaji, tunjangan dan insentif kepada pekerja sesuai dengan atau di atas jumlah minimum yang sah.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Menghormati Hak-hak Pekerja.","weight":1,"sort_order":28,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"6","criterion_code":"6.2","code":"6.05","description":"Menghormati hak karyawan untuk membentuk dan/atau bergabung dengan serikat pekerja.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Menghormati Hak-hak Pekerja.","weight":1,"sort_order":29,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"6","criterion_code":"6.2","code":"6.06","description":"Menyediakan kesempatan kerja dan perlakuan yang sama untuk semua kelompok.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Menghormati Hak-hak Pekerja.","weight":1,"sort_order":30,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"6","criterion_code":"6.2","code":"6.07","description":"Menyediakan tempat kerja yang aman dan terjamin.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Menghormati Hak-hak Pekerja.","weight":1,"sort_order":31,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"6","criterion_code":"6.2","code":"6.08","description":"Menyediakan sarana dan prasarana untuk pendidikan, kesehatan, air bersih, olahraga, kegiatan keagamaan dan fasilitas lain guna memenuhi kebutuhan dasar pekerja dan keluarganya.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Menghormati Hak-hak Pekerja.","weight":1,"sort_order":32,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"6","criterion_code":"6.3","code":"6.09","description":"Menggunakan pendekatan musyawarah dan mufakat dalam menyelesaikan perselisihan sebagai bagian dari mekanisme pengaduan.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Menghormati Hak-hak Masyarakat Lokal.","weight":1,"sort_order":33,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"6","criterion_code":"6.3","code":"6.10","description":"Menjamin keamanan dan kerahasiaan identitas aktivis lingkungan, pembela HAM, pelapor, pengaduan, dan perwakilan masyarakat.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Menghormati Hak-hak Masyarakat Lokal.","weight":1,"sort_order":34,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"6","criterion_code":"6.3","code":"6.11","description":"Menyediakan sarana dan prasarana kesehatan dan keselamatan bagi anggota masyarakat yang terlibat dalam operasional perkebunan.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Menghormati Hak-hak Masyarakat Lokal.","weight":1,"sort_order":35,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"6","criterion_code":"6.3","code":"6.12","description":"Memberdayakan petani kecil melalui pelatihan, pengetahuan dan peralatan perkebunan untuk meningkatkan produksi perkebunan mereka.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Menghormati Hak-hak Masyarakat Lokal.","weight":1,"sort_order":36,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"7","criterion_code":"7.1","code":"7.01","description":"Mempertahankan dan meningkatkan sistem ketertelusuran terhadap semua pabrik kelapa sawit dan perkebunan pemasok TBS, termasuk pemasok pihak ketiga, untuk memastikan TBS diproduksi sesuai Kebijakan Keberlanjutan KPN Plantations.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Sumber yang Berkelanjutan.","weight":1,"sort_order":37,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"7","criterion_code":"7.1","code":"7.02","description":"Tidak membeli TBS dari pemasok yang lahannya terbakar setelah 1 Juli 2018.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Sumber yang Berkelanjutan.","weight":1,"sort_order":38,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"7","criterion_code":"7.1","code":"7.03","description":"Menghentikan pembelian dari pemasok yang tidak patuh sampai memenuhi persyaratan masuk kembali ke rantai pasok: Stop Work Order, adopsi kebijakan NDPE, rencana terikat waktu implementasi kebijakan, dan pelaporan rutin ke KPN Plantations.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Sumber yang Berkelanjutan.","weight":1,"sort_order":39,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"7","criterion_code":"7.1","code":"7.04","description":"Melakukan keterlibatan dengan pemasok untuk mencapai kepatuhan terhadap kebijakan keberlanjutan perusahaan.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Sumber yang Berkelanjutan.","weight":1,"sort_order":40,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"8","criterion_code":"8.1","code":"8.01","description":"Mendukung praktik bisnis yang mengikuti hukum dan peraturan Indonesia dengan tidak menoleransi korupsi, nepotisme, penyuapan, kekerasan, dan pelanggaran hukum lainnya.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Etika Bisnis.","weight":1,"sort_order":41,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"9","criterion_code":"9.1","code":"9.01","description":"Menyediakan peta konsesi terkini berdasarkan permintaan yang dibenarkan oleh pemangku kepentingan.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Transparansi, Akuntabilitas, dan Pemantauan.","weight":1,"sort_order":42,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"9","criterion_code":"9.1","code":"9.02","description":"Mensertifikasi seluruh perkebunan dan pabrik untuk ISPO setelah memenuhi prasyarat yang ditetapkan pemerintah.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Transparansi, Akuntabilitas, dan Pemantauan.","weight":1,"sort_order":43,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"9","criterion_code":"9.1","code":"9.03","description":"Menerbitkan Laporan Keberlanjutan dua tahunan dalam Bahasa Inggris dan Bahasa Indonesia mengikuti standar pelaporan yang sesuai seperti GRI.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Transparansi, Akuntabilitas, dan Pemantauan.","weight":1,"sort_order":44,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"9","criterion_code":"9.2","code":"9.04","description":"Menangani pengaduan dan keluhan menggunakan mekanisme yang transparan, dapat diakses dan fungsional bagi pemangku kepentingan dan mitra.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Transparansi, Akuntabilitas, dan Pemantauan.","weight":1,"sort_order":45,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"9","criterion_code":"9.3","code":"9.05","description":"Mengembangkan dan mengoperasikan sistem pengelolaan dan pemantauan untuk penerapan kebijakan keberlanjutan perusahaan.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Transparansi, Akuntabilitas, dan Pemantauan.","weight":1,"sort_order":46,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"9","criterion_code":"9.3","code":"9.06","description":"Memperbarui rencana implementasi terikat waktu keberlanjutan sebagai dokumen hidup yang dievaluasi dan diperbarui secara berkala.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Transparansi, Akuntabilitas, dan Pemantauan.","weight":1,"sort_order":47,"source_name":"KPN Plantations Sustainability Policy January 2023"},{"principle_code":"9","criterion_code":"9.3","code":"9.07","description":"Terlibat dengan pemangku kepentingan melalui dialog, penelitian dan cara lain untuk menerima masukan dan meningkatkan kualitas kebijakan keberlanjutan serta penerapannya.","object_evidence":null,"guidance":"Source: KPN Plantations Sustainability Policy, January 2023 — Transparansi, Akuntabilitas, dan Pemantauan.","weight":1,"sort_order":48,"source_name":"KPN Plantations Sustainability Policy January 2023"}]$indicators$::jsonb)
    as x(
      principle_code text,
      criterion_code text,
      code text,
      description text,
      object_evidence text,
      guidance text,
      weight numeric,
      sort_order int,
      source_name text
    )
), std as (
  select id from public.sims_standards where code='NDPE-KPN-2023'
)
insert into public.sims_indicators(
  criterion_id,code,description,object_evidence,guidance,weight,sort_order,active,source_name,updated_at
)
select
  c.id,src.code,src.description,src.object_evidence,src.guidance,src.weight,src.sort_order,true,src.source_name,now()
from src
cross join std
join public.sims_principles p
  on p.standard_id=std.id and p.code=src.principle_code
join public.sims_criteria c
  on c.principle_id=p.id and c.code=src.criterion_code
on conflict (criterion_id,code) do update set
  description=excluded.description,
  object_evidence=excluded.object_evidence,
  guidance=excluded.guidance,
  weight=excluded.weight,
  sort_order=excluded.sort_order,
  active=true,
  source_name=excluded.source_name,
  updated_at=now();

commit;

-- Verification summary
select
  s.code as standard_code,
  count(distinct p.id) as principles,
  count(distinct c.id) as criteria,
  count(distinct i.id) as indicators
from public.sims_standards s
left join public.sims_principles p on p.standard_id=s.id
left join public.sims_criteria c on c.principle_id=p.id
left join public.sims_indicators i on i.criterion_id=c.id and i.active=true
where s.code in ('ISPO-P33-2025','NDPE-KPN-2023')
group by s.code
order by s.code;
