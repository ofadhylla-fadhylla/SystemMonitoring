# System Monitoring V8.17 — Automatic Supplier Spatial Screening

## Fitur baru
Menu Monitoring Spasial sekarang membuka **Quick Supplier Screening** sebagai tab utama.

Cukup masukkan:
- Supplier name (opsional saat Generate)
- Latitude
- Longitude
- Claimed land status (HGU / SHM / dll.)
- Internal document status (opsional untuk penyimpanan)
- Document number (opsional)

Lalu klik **Generate Spatial Risk**.

Server akan mencoba melakukan point screening ke:
1. **BHUMI ATR/BPN** — best-effort GetFeatureInfo pada public `bhumi_persil` layer untuk mencari indikasi HGU pada atribut yang dikembalikan publik.
2. **BIG Satu Peta** — Peta Lahan Gambut.
3. **BIG Satu Peta** — Fungsi Ekosistem Gambut.
4. **Geoportal Kementerian Kehutanan** — Kawasan Hutan.

Hasil menghasilkan:
- HGU / land-tenure indication
- Peat indication
- Peat ecosystem function
- Forest-area indication
- Risk component
- Overall score 0–100
- Risk level Low / Medium / High / Critical
- Screening confidence berdasarkan ketersediaan sumber
- Recommendation

## Penting: HGU
BHUMI tidak diperlakukan sebagai penetapan legal. Jika endpoint machine query publik tidak mengembalikan data atau sedang tidak tersedia, aplikasi menampilkan **Source unavailable** atau **No public indication**, bukan menyimpulkan “tidak ada HGU”.

Jika supplier mengklaim SHM tetapi public response mengindikasikan HGU di titik tersebut, sistem memberi land-tenure inconsistency flag untuk verifikasi lebih lanjut.

## Cara install bila V8.16 SUDAH terpasang
Upload/replace di GitHub:

- `app/spatial-monitoring/page.js`
- `app/spatial-monitoring/page.module.css`
- `app/api/spatial-screening/route.js`

`components/Sidebar.js` tidak wajib diganti bila menu Monitoring Spasial sudah ada.

Tidak ada SQL baru untuk V8.17.

Tunggu Vercel **Ready**, lalu `Ctrl + F5`.

## Bila database Spatial V8.16 BELUM dibuat
Jalankan lebih dulu:

`SUPABASE-SPATIAL-BASE-V8-16.sql`

melalui Supabase > SQL Editor.

## Cara pakai
1. Monitoring Spasial
2. Quick Supplier Screening
3. Masukkan latitude & longitude
4. Pilih claimed land status bila diketahui
5. Klik Generate Spatial Risk
6. Review HGU, Peat, Forest Area dan Risk Drivers
7. Isi Supplier Name dan klik **Save Screening Result** bila ingin menyimpan ke Supplier Register

Supplier yang sudah tersimpan juga mempunyai tombol **Official Check** di Supplier Register.

## Risk logic V8.17
- Claim SHM/SHGB/Girik/Adat + HGU indication: +35
- No/unknown land claim + HGU indication: +30
- Claim HGU tetapi public automatic check tidak mengkonfirmasi label HGU: +20
- Peat protection-function indication: +25
- Peat cultivation-function indication: +12
- Peat indication tanpa function detail: +15
- Protected/conservation forest indication: +35
- HPT: +30
- HP / HPK / other forest-area indication: +25
- APL: +0

Score maksimum 100.

## Source failure handling
Sumber publik dapat mengalami timeout, CORS/upstream blocking, perubahan endpoint, atau service maintenance. Karena query dilakukan melalui Next.js server route, CORS browser diminimalkan. Namun upstream failure tetap mungkin terjadi. Source failure tidak menambah risk score; confidence diturunkan agar tidak menghasilkan false negative.
