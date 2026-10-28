---
version: "1.0"
name: "System Management Zakat"
description: "Desain UI yang bersih, presisi, dan terpercaya untuk aplikasi manajemen zakat (mobile-first)."
colors:
  primary: "#003366"
  secondary: "#C0C0C0"
  tertiary: "#FFFFFF"
  neutral: "#E0E0E0"
  surface: "#00BFFF"
  accent: "#36454F"
typography:
  h1:
    fontFamily: Roboto
    fontSize: 2.5rem
    fontWeight: 700
  body-md:
    fontFamily: Roboto
    fontSize: 1rem
    fontWeight: 400
---

## Overview

Desain antarmuka yang presisi dan bersih untuk aplikasi penyaluran Zakat. Mengadaptasi gaya teknikal dan industrial yang rapi, estetika ini difokuskan pada keterbacaan, transparansi, dan efisiensi. Relawan di lapangan membutuhkan antarmuka yang tidak membingungkan, di mana setiap piksel memiliki tujuan fungsional dan tata letak terasa terstruktur seperti tabel data base yang rapi.

- **Style:** Minimalist, Precise, Trustworthy, Mobile-first
- **Keywords:** zakat, charity, distribution, relawan, real-time, clean, structured, efficient
- **Light/Dark:** ✓ Light Mode (diutamakan agar jelas di bawah sinar matahari)

## Colors

- **Trust Blue (#003366):** Warna utama untuk *header*, teks tebal, dan fokus utama.
- **Electric Blue (#00BFFF):** Aksen sekunder atau interaksi *hover*.
- **Putih & Abu-abu (#FFFFFF, #E0E0E0, #C0C0C0):** Latar belakang utama, pembatas kartu (*border*), dan teks sekunder.
- **Dark Slate (#36454F):** Warna kontras untuk teks utama (jangan gunakan hitam murni).
- **Hijau (#008000):** Indikator status "Selesai" atau "Delivered".
- **Oranye (#FFA500):** Indikator status "Pending".

## Typography & Spacing

- **Font Utama:** Roboto (atau standar Sans-serif modern seperti Inter/Geist).
- **Skala:** Judul tegas (Bold 700), teks deskripsi/alamat fungsional (Regular 400).
- **Spacing:** Gunakan unit dasar 8px (0.5rem). Jarak antar elemen harus lega (*airy*) agar tidak rapat dan mudah dibaca di layar HP.

## Layout & Components

- **Mobile-First Grid:** Tata letak utama maksimal lebar 768px (ukuran layar HP/Tablet).
- **Cards (Kartu Penerima Zakat):** Sudut melengkung halus (8px), latar belakang putih murni, bayangan sangat tipis (`0 2px 12px rgba(0,0,0,0.06)`), dengan garis tepi (*border*) 1px warna abu-abu terang.
- **Buttons (Tombol Aksi):** Area tap harus besar (minimal tinggi 44px) untuk kemudahan relawan. Warna biru solid untuk aksi utama. Saat ditekan (*active*), turunkan *opacity* atau beri efek *translate* kecil sebagai *feedback* sentuhan.

## Do's and Don'ts

- **Do** Gunakan warna Hijau dan Oranye secara konsisten untuk lencana (*badge*) status Mustahiq.
- **Do** Pastikan kontras teks tinggi agar mudah dibaca di luar ruangan.
- **Do** Berikan latar belakang pola *grid* samar (seperti kertas milimeter blok) jika memungkinkan, untuk menambah kesan teknis dan rapi.
- **Don't** Jangan gunakan animasi berat atau kompleks. Gunakan transisi *fade-in* sederhana (200ms).
- **Don't** Jangan gunakan bayangan tebal (*drop-shadow* besar) atau efek menyala (*glow*).
- **Don't** Jangan membuat kolom menyamping (*multi-column*) di tampilan HP, susun semuanya secara vertikal ke bawah.