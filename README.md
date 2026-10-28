# System Management Zakat (Monorepo: Elysia.js + SvelteKit)

Aplikasi **Multi-Tenant** untuk manajemen penerimaan dan penyaluran zakat (Masjid, Karang Taruna, Yayasan/Lembaga) dengan sinkronisasi *real-time* menggunakan **Elysia.js (Bun)** di sisi backend dan **SvelteKit (Svelte 5)** di sisi frontend.

Detail arsitektur lengkap, skema database, dan penjelasan sistem 3 Role (`super_admin`, `org_admin`, `pic`) dapat dibaca di **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

---

## Cara Menjalankan Proyek

Proyek ini terbagi menjadi 2 folder utama: **`backend/`** dan **`frontend/`**.

### 1. Jalankan Backend (Elysia.js — Port `3001`)
Buka terminal pertama di root folder:
```bash
bun run dev:backend
```
- Server API berjalan di: `http://localhost:3001`
- Dokumentasi Swagger UI: `http://localhost:3001/swagger`
- Database SQLite (`backend/data/zakat.db`) akan otomatis dibuat dan diisi dengan data contoh (*auto-seed*) saat pertama kali dijalankan.

### 2. Jalankan Frontend (SvelteKit — Port `5173`)
Buka terminal kedua di root folder:
```bash
bun run dev:frontend
```
- Buka aplikasi di browser: **`http://localhost:5173`**

---

## Akun Demo Siap Pakai (Tersedia Tombol 1-Klik di Halaman `/login`)

1. **Super Admin (Owner Platform):**
   - Username: `admin` | Password: `admin123`
2. **Admin Masjid Jami Ar-Rahman:**
   - Username: `arrahman` | Password: `masjid123`
3. **PIC Lapangan Masjid Ar-Rahman (Khusus Wilayah RT 01):**
   - Username: `dimas` | Password: `pic123`
4. **PIC Lapangan Masjid Ar-Rahman (Khusus Wilayah RT 02):**
   - Username: `budi` | Password: `pic123`
5. **Admin Karang Taruna Tunas Muda:**
   - Username: `karangtaruna` | Password: `kt123`
