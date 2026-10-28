import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

const dbPath = join(dataDir, 'zakat.db');
export const db = new Database(dbPath, { create: true });

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function ensureColumn(table: string, column: string, definition: string) {
	const cols = db.query(`PRAGMA table_info(${table})`).all() as { name: string }[];
	if (!cols.some((c) => c.name === column)) {
		db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
	}
}

export async function initDatabase() {
	db.exec(`
		CREATE TABLE IF NOT EXISTS organizations (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			type TEXT NOT NULL DEFAULT 'masjid',
			address TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			username TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			role TEXT NOT NULL CHECK(role IN ('super_admin', 'org_admin', 'pic')),
			assigned_zone TEXT,
			created_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS zones (
			id TEXT PRIMARY KEY,
			organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			created_at TEXT NOT NULL,
			UNIQUE(organization_id, name)
		);

		CREATE TABLE IF NOT EXISTS mustahiq (
			id TEXT PRIMARY KEY,
			organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			address TEXT NOT NULL,
			zone TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'delivered')),
			delivered_by TEXT,
			delivered_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
			delivered_at TEXT,
			delivery_note TEXT,
			created_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS muzakki (
			id TEXT PRIMARY KEY,
			organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			phone TEXT,
			jiwa_count INTEGER NOT NULL DEFAULT 1,
			zakat_type TEXT NOT NULL CHECK(zakat_type IN ('uang', 'beras')),
			amount REAL NOT NULL,
			notes TEXT,
			created_at TEXT NOT NULL
		);
	`);

	// Auto-migrate existing SQLite database if columns were added in v2.1
	ensureColumn('mustahiq', 'delivery_note', 'TEXT');
	ensureColumn('muzakki', 'phone', 'TEXT');
	ensureColumn('muzakki', 'jiwa_count', 'INTEGER NOT NULL DEFAULT 1');
	ensureColumn('muzakki', 'notes', 'TEXT');

	const existingSuperAdmin = db
		.query('SELECT id FROM users WHERE role = ? LIMIT 1')
		.get('super_admin');

	if (!existingSuperAdmin) {
		console.log('🌱 Seeding initial multi-tenant database...');
		const now = new Date().toISOString();

		// 1. Super Admin
		const superAdminHash = await Bun.password.hash('admin123');
		db.query(
			`INSERT INTO users (id, organization_id, name, username, password_hash, role, assigned_zone, created_at)
			 VALUES (?, NULL, ?, ?, ?, 'super_admin', NULL, ?)`
		).run(crypto.randomUUID(), 'Owner Platform (Super Admin)', 'admin', superAdminHash, now);

		// 2. Organization 1: Masjid Ar-Rahman
		const org1Id = crypto.randomUUID();
		db.query(
			`INSERT INTO organizations (id, name, type, address, created_at)
			 VALUES (?, ?, 'masjid', ?, ?)`
		).run(org1Id, 'Masjid Jami Ar-Rahman', 'Jl. Melati Raya No. 10, Kec. Cempaka Putih', now);

		const org1AdminHash = await Bun.password.hash('masjid123');
		db.query(
			`INSERT INTO users (id, organization_id, name, username, password_hash, role, assigned_zone, created_at)
			 VALUES (?, ?, ?, ?, ?, 'org_admin', NULL, ?)`
		).run(
			crypto.randomUUID(),
			org1Id,
			'Ust. H. Fauzan (Admin Ar-Rahman)',
			'arrahman',
			org1AdminHash,
			now
		);

		for (const z of ['RT 01', 'RT 02', 'RT 03']) {
			db.query(
				`INSERT INTO zones (id, organization_id, name, created_at) VALUES (?, ?, ?, ?)`
			).run(crypto.randomUUID(), org1Id, z, now);
		}

		const picHash = await Bun.password.hash('pic123');
		const dimasId = crypto.randomUUID();
		const budiId = crypto.randomUUID();
		const fajarId = crypto.randomUUID();

		db.query(
			`INSERT INTO users (id, organization_id, name, username, password_hash, role, assigned_zone, created_at)
			 VALUES (?, ?, ?, ?, ?, 'pic', ?, ?)`
		).run(dimasId, org1Id, 'Dimas Pratama', 'dimas', picHash, 'RT 01', now);

		db.query(
			`INSERT INTO users (id, organization_id, name, username, password_hash, role, assigned_zone, created_at)
			 VALUES (?, ?, ?, ?, ?, 'pic', ?, ?)`
		).run(budiId, org1Id, 'Budi Santoso', 'budi', picHash, 'RT 02', now);

		db.query(
			`INSERT INTO users (id, organization_id, name, username, password_hash, role, assigned_zone, created_at)
			 VALUES (?, ?, ?, ?, ?, 'pic', ?, ?)`
		).run(fajarId, org1Id, 'Fajar Nugroho', 'fajar', picHash, 'RT 03', now);

		const insertMustahiq = db.query(
			`INSERT INTO mustahiq (id, organization_id, name, address, zone, status, delivered_by, delivered_by_user_id, delivered_at, delivery_note, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		);

		insertMustahiq.run(
			crypto.randomUUID(),
			org1Id,
			'Bpk. Ahmad Fauzi',
			'Jl. Melati No. 12, RT 01 / RW 04',
			'RT 01',
			'pending',
			null,
			null,
			null,
			null,
			now
		);
		insertMustahiq.run(
			crypto.randomUUID(),
			org1Id,
			'Ibu Siti Aminah',
			'Gg. Kenanga III No. 7, RT 01 / RW 04',
			'RT 01',
			'delivered',
			'Dimas Pratama',
			dimasId,
			now,
			'Diterima langsung oleh Ibu Siti',
			now
		);
		insertMustahiq.run(
			crypto.randomUUID(),
			org1Id,
			'Ibu Rohimah',
			'Jl. Melati Dalam No. 4, RT 01 / RW 04',
			'RT 01',
			'pending',
			null,
			null,
			null,
			null,
			now
		);
		insertMustahiq.run(
			crypto.randomUUID(),
			org1Id,
			'Bpk. H. Suparman',
			'Jl. Cempaka Putih No. 45, RT 02 / RW 04',
			'RT 02',
			'pending',
			null,
			null,
			null,
			null,
			now
		);
		insertMustahiq.run(
			crypto.randomUUID(),
			org1Id,
			'Ibu Hj. Maryam',
			'Jl. Mawar Raya Blok B2 No. 9, RT 02 / RW 04',
			'RT 02',
			'pending',
			null,
			null,
			null,
			null,
			now
		);
		insertMustahiq.run(
			crypto.randomUUID(),
			org1Id,
			'Bpk. Mulyono',
			'Kp. Sukamaju No. 18, RT 03 / RW 04',
			'RT 03',
			'pending',
			null,
			null,
			null,
			null,
			now
		);
		insertMustahiq.run(
			crypto.randomUUID(),
			org1Id,
			'Ibu Nurhayati',
			'Jl. Anggrek Dalam No. 3, RT 03 / RW 04',
			'RT 03',
			'delivered',
			'Fajar Nugroho',
			fajarId,
			now,
			'Diwakilkan oleh putra beliau (Rian)',
			now
		);

		const insertMuzakki = db.query(
			`INSERT INTO muzakki (id, organization_id, name, phone, jiwa_count, zakat_type, amount, notes, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		);
		insertMuzakki.run(
			crypto.randomUUID(),
			org1Id,
			'H. Hendra Wijaya & Keluarga',
			'081234567890',
			5,
			'uang',
			750000,
			'Zakat Fitrah 5 Jiwa + Zakat Maal',
			now
		);
		insertMuzakki.run(
			crypto.randomUUID(),
			org1Id,
			'Kel. Bpk. Bambang S.',
			'081388990011',
			10,
			'beras',
			25,
			'Zakat Fitrah 10 Jiwa @ 2.5 Kg',
			now
		);
		insertMuzakki.run(
			crypto.randomUUID(),
			org1Id,
			'Ibu dr. Ratna Sari',
			'081122334455',
			4,
			'uang',
			650000,
			'Zakat Fitrah 4 Jiwa + Infaq',
			now
		);
		insertMuzakki.run(
			crypto.randomUUID(),
			org1Id,
			'Bpk. Irfan Hakim',
			'085677889900',
			6,
			'beras',
			17,
			'Zakat Fitrah 6 Jiwa + Tambahan',
			now
		);

		// 3. Organization 2: Karang Taruna Tunas Muda
		const org2Id = crypto.randomUUID();
		db.query(
			`INSERT INTO organizations (id, name, type, address, created_at)
			 VALUES (?, ?, 'karang_taruna', ?, ?)`
		).run(org2Id, 'Karang Taruna Tunas Muda', 'Balai Warga RW 05, Kel. Sukamaju', now);

		const org2AdminHash = await Bun.password.hash('kt123');
		db.query(
			`INSERT INTO users (id, organization_id, name, username, password_hash, role, assigned_zone, created_at)
			 VALUES (?, ?, ?, ?, ?, 'org_admin', NULL, ?)`
		).run(
			crypto.randomUUID(),
			org2Id,
			'Reza Pahlevi (Ketua Karang Taruna)',
			'karangtaruna',
			org2AdminHash,
			now
		);

		for (const z of ['Blok A', 'Blok B']) {
			db.query(
				`INSERT INTO zones (id, organization_id, name, created_at) VALUES (?, ?, ?, ?)`
			).run(crypto.randomUUID(), org2Id, z, now);
		}

		const rizkyId = crypto.randomUUID();
		db.query(
			`INSERT INTO users (id, organization_id, name, username, password_hash, role, assigned_zone, created_at)
			 VALUES (?, ?, ?, ?, ?, 'pic', ?, ?)`
		).run(rizkyId, org2Id, 'Rizky Ramadhan', 'rizky', picHash, 'Blok A', now);

		insertMustahiq.run(
			crypto.randomUUID(),
			org2Id,
			'Bpk. Sutrisno',
			'Perum Griya Asri Blok A No. 3',
			'Blok A',
			'pending',
			null,
			null,
			null,
			null,
			now
		);
		insertMustahiq.run(
			crypto.randomUUID(),
			org2Id,
			'Ibu Wati',
			'Perum Griya Asri Blok B No. 11',
			'Blok B',
			'pending',
			null,
			null,
			null,
			null,
			now
		);

		insertMuzakki.run(
			crypto.randomUUID(),
			org2Id,
			'Donatur Warga RW 05',
			'081299887766',
			8,
			'uang',
			500000,
			'Zakat Kolektif Warga',
			now
		);
		insertMuzakki.run(
			crypto.randomUUID(),
			org2Id,
			'Kolektif Pemuda Blok A',
			'081900112233',
			6,
			'beras',
			15,
			'6 Jiwa @ 2.5 Kg',
			now
		);

		console.log('✅ Database seeded successfully!');
	}
}
