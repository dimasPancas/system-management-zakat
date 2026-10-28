# System Management Zakat - Product Requirements Document (PRD v2.0 Multi-Tenant)

## 1. Project Overview
Platform web *mobile-first* berarsitektur **Multi-Tenant** untuk manajemen penerimaan dan penyaluran zakat yang dapat didistribusikan ke banyak tempat (Masjid, Karang Taruna, Yayasan/Lembaga). Fokus utama pada isolasi data antar-lembaga, pembagian tugas per wilayah/RT dengan akun login masing-masing PIC, kalkulasi kuota otomatis, dan sinkronisasi status distribusi secara *real-time*.

## 2. Tech Stack (Monorepo dengan Bun)
- **Backend (`backend/`):** Elysia.js + Bun Runtime, `@elysiajs/jwt`, `@elysiajs/cors`, `@elysiajs/swagger`, Database `bun:sqlite`, serta Native Elysia WebSocket (`/ws`) untuk sinkronisasi *real-time*.
- **Frontend (`frontend/`):** SvelteKit (Svelte 5 Runes) + Tailwind CSS v4 & `shadcn-svelte`.

## 3. Sistem Role & Hak Akses (RBAC)
1. **`super_admin` (Owner Platform):**
   - CRUD Tempat/Lembaga (`organizations`) seperti Masjid Ar-Rahman, Karang Taruna, dll.
   - Membuat dan mengelola akun login untuk Admin masing-masing tempat (`org_admin`).
2. **`org_admin` (Pengurus / Admin Lembaga):**
   - Login dan langsung masuk ke konteks lembaganya sendiri.
   - CRUD Wilayah/RT (`zones`), CRUD Mustahiq (`mustahiq`), CRUD Muzakki (`muzakki`), serta membuat akun login untuk PIC Pembagi (`pic`).
   - Melihat Kalkulator Kuota Zakat Otomatis (*Total Zakat Uang/Beras ÷ Jumlah Mustahiq*).
3. **`pic` (Penanggung Jawab Pembagi Wilayah):**
   - Login menggunakan akun PIC masing-masing.
   - **Pembatasan Wilayah Ketat (Opsi B):** Hanya melihat dan memproses warga penerima zakat di wilayah tugasnya (`assigned_zone`, misal `RT 01`).
   - Ketika menekan **"Tandai Selesai"** atau **"Batal"**, nama penyalur otomatis tercatat dari sesi login PIC tersebut.
