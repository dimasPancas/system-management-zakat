# System Management Zakat — Dokumentasi Arsitektur Multi-Tenant (v2.0)

Platform distribusi dan manajemen zakat berbasis **Multi-Tenant** untuk berbagai Masjid, Musholla, Karang Taruna, dan Lembaga Amil Zakat. Dibangun dengan struktur **Monorepo** menggunakan **100% Bun Runtime**:
- **`backend/`**: **Elysia.js** + `bun:sqlite` + `@elysiajs/jwt` + Native WebSocket (`/ws`).
- **`frontend/`**: **SvelteKit (Svelte 5 Runes)** + Tailwind CSS v4 + `shadcn-svelte`.

---

## 1. Struktur Monorepo

```text
system-management-zakat/
├── backend/                  # Server API & WebSocket (Elysia.js + Bun - Port 3001)
│   ├── data/
│   │   └── zakat.db          # Database SQLite mandiri (dibuat & di-seed otomatis)
│   ├── src/
│   │   ├── db.ts             # Skema tabel & auto-seeding data multi-tenant
│   │   ├── index.ts          # Endpoint REST API, RBAC Guard, & WebSocket Server
│   │   └── types.ts          # Definisi tipe TypeScript
│   ├── package.json
│   └── tsconfig.json
├── frontend/                 # Aplikasi Web Mobile-First (SvelteKit - Port 5173)
│   ├── src/
│   │   ├── lib/
│   │   │   ├── api.ts        # Client API, Session JWT, & WebSocket Helper
│   │   │   └── components/   # Komponen UI shadcn-svelte
│   │   └── routes/
│   │       ├── +page.svelte  # Dashboard Dinamis sesuai Role (Super Admin / Admin / PIC)
│   │       └── login/
│   │           └── +page.svelte
│   ├── package.json
│   └── vite.config.ts
├── .gemini/
│   ├── prd.md                # Product Requirements Document (v2.0)
│   └── design.md             # Panduan Desain UI (Trust Blue #003366)
├── ARCHITECTURE.md           # Dokumentasi arsitektur ini
├── README.md                 # Panduan cepat menjalankan proyek
└── package.json              # Script root monorepo
```

---

## 2. Sistem 3 Role (Role-Based Access Control / RBAC)

### A. `super_admin` (Owner Platform / Anda)
- Mengelola seluruh tempat distribusi zakat (`organizations`), seperti *Masjid Jami Ar-Rahman*, *Karang Taruna Tunas Muda*, dll.
- Membuat akun login (`username` & `password`) untuk **Pengurus / Admin** masing-masing tempat.
- Memantau statistik penyaluran global lintas lembaga.

### B. `org_admin` (Pengurus / Admin Masjid atau Lembaga)
- Saat login, langsung masuk ke dashboard khusus lembaganya sendiri (data terisolasi penuh antar-lembaga).
- Mengelola daftar **Wilayah / RT** (contoh: `RT 01`, `RT 02`, `RT 03`).
- Membuat **Akun Login untuk PIC Pembagi** (`role: 'pic'`) yang dikaitkan ke wilayah/RT tertentu.
- Mengelola data **Mustahiq (Penerima Zakat)** dan **Muzakki (Pemberi Zakat Uang & Beras)**.
- Melihat **Kalkulator Kuota Distribusi Otomatis** (*Total Uang ÷ Total Mustahiq* dan *Total Beras ÷ Total Mustahiq*).

### C. `pic` (Penanggung Jawab / Relawan Pembagi Lapangan)
- Login menggunakan akun PIC yang dibuatkan oleh Admin Masjid.
- **Isolasi Wilayah Ketat (Opsi B):** PIC yang bertugas di `RT 01` hanya dapat melihat dan memproses warga penerima zakat di `RT 01` saja (divalidasi di level API Elysia.js maupun UI).
- **Otomatisasi Nama Penyalur:** Saat PIC menekan tombol **"Tandai Selesai"**, sistem otomatis mengambil nama dan ID PIC dari token JWT login-nya (`delivered_by = authUser.name`) dan menyinkronkannya secara *real-time* melalui WebSocket ke layar Admin Masjid.

---

## 3. Daftar Akun Demo Bawaan (Auto-Seed)

Database akan otomatis terisi dengan akun-akun berikut saat backend pertama kali dijalankan:

| Role | Lembaga | Wilayah Tugas | Username | Password |
| :--- | :--- | :--- | :--- | :--- |
| **Super Admin (Owner)** | Global (Semua Tempat) | Semua | `admin` | `admin123` |
| **Admin Masjid** | Masjid Jami Ar-Rahman | Semua RT | `arrahman` | `masjid123` |
| **PIC Lapangan** | Masjid Jami Ar-Rahman | Khusus `RT 01` | `dimas` | `pic123` |
| **PIC Lapangan** | Masjid Jami Ar-Rahman | Khusus `RT 02` | `budi` | `pic123` |
| **PIC Lapangan** | Masjid Jami Ar-Rahman | Khusus `RT 03` | `fajar` | `pic123` |
| **Admin Lembaga** | Karang Taruna Tunas Muda | Semua Blok | `karangtaruna` | `kt123` |
| **PIC Lapangan** | Karang Taruna Tunas Muda | Khusus `Blok A` | `rizky` | `pic123` |

---

## 4. Daftar Endpoint API Elysia.js (`http://localhost:3001`)

Dokumentasi interaktif Swagger dapat diakses langsung di: **`http://localhost:3001/swagger`**

- `POST /api/auth/login` — Login dengan username & password, menghasilkan JWT token.
- `GET /api/auth/me` — Mengambil profil user & organisasi aktif.
- `GET /api/organizations` — *(Super Admin)* Daftar seluruh lembaga & statistiknya.
- `POST /api/organizations` — *(Super Admin)* Buat lembaga baru sekaligus akun Admin-nya.
- `POST /api/organizations/:id/admins` — *(Super Admin)* Tambah akun Admin ke lembaga.
- `DELETE /api/organizations/:id` — *(Super Admin)* Hapus lembaga.
- `GET /api/dashboard` — *(Org Admin & PIC)* Snapshot data lembaga, kuota zakat, zona, PIC, muzakki, dan mustahiq (terfilter wilayah khusus jika role `pic`).
- `POST /api/zones` — *(Org Admin)* Tambah wilayah/RT baru.
- `POST /api/users/pic` — *(Org Admin)* Buat akun login baru untuk PIC wilayah.
- `DELETE /api/users/:id` — *(Org Admin / Super Admin)* Hapus akun PIC/user.
- `POST /api/mustahiq`, `PATCH /api/mustahiq/:id`, `DELETE /api/mustahiq/:id` — *(Org Admin)* CRUD penerima zakat.
- `PATCH /api/mustahiq/:id/deliver` — *(PIC & Org Admin)* Tandai selesai (otomatis mencatat nama user yang login & memvalidasi wilayah tugas PIC).
- `PATCH /api/mustahiq/:id/revert` — *(PIC & Org Admin)* Kembalikan status ke `pending`.
- `POST /api/muzakki`, `DELETE /api/muzakki/:id` — *(Org Admin)* Catat/hapus pemberi zakat & hitung ulang kuota.
- `WS /ws?orgId=<id>` — *Elysia Native WebSocket* untuk sinkronisasi langsung tanpa refresh.
