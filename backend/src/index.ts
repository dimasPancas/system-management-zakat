import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { jwt } from '@elysiajs/jwt';
import { swagger } from '@elysiajs/swagger';
import { db, initDatabase } from './db';
import type {
	JwtPayload,
	MustahiqRow,
	MuzakkiRow,
	Organization,
	PublicUser,
	UserRow,
	ZoneRow
} from './types';

await initDatabase();

const JWT_SECRET = process.env.JWT_SECRET || 'zakat-super-secret-jwt-key-2026';
const PORT = Number(process.env.PORT || 3001);

// Connected WebSocket clients grouped by organization_id (or 'global' for super_admin)
const wsClients = new Map<string, Set<{ send: (data: string) => void }>>();

function broadcastOrgEvent(orgId: string | null, event: string, data?: unknown) {
	const payload = JSON.stringify({
		event,
		organization_id: orgId,
		data,
		timestamp: new Date().toISOString()
	});

	if (orgId && wsClients.has(orgId)) {
		for (const client of wsClients.get(orgId)!) {
			try {
				client.send(payload);
			} catch {
				// ignore closed socket
			}
		}
	}

	if (wsClients.has('global')) {
		for (const client of wsClients.get('global')!) {
			try {
				client.send(payload);
			} catch {
				// ignore closed socket
			}
		}
	}
}

function toPublicUser(u: UserRow): PublicUser {
	const { password_hash: _, ...rest } = u;
	return rest;
}

function computeOrgQuota(orgId: string) {
	const countRow = db
		.query('SELECT COUNT(*) as total FROM mustahiq WHERE organization_id = ?')
		.get(orgId) as { total: number };
	const uangRow = db
		.query(
			"SELECT COALESCE(SUM(amount), 0) as total FROM muzakki WHERE organization_id = ? AND zakat_type = 'uang'"
		)
		.get(orgId) as { total: number };
	const berasRow = db
		.query(
			"SELECT COALESCE(SUM(amount), 0) as total FROM muzakki WHERE organization_id = ? AND zakat_type = 'beras'"
		)
		.get(orgId) as { total: number };

	const total_mustahiq = Number(countRow?.total || 0);
	const total_uang = Number(uangRow?.total || 0);
	const total_beras = Number(berasRow?.total || 0);

	return {
		total_mustahiq,
		total_uang,
		total_beras,
		uang_per_mustahiq: total_mustahiq > 0 ? Math.floor(total_uang / total_mustahiq) : 0,
		beras_per_mustahiq:
			total_mustahiq > 0 ? Number((total_beras / total_mustahiq).toFixed(2)) : 0
	};
}

const app = new Elysia()
	.use(
		cors({
			origin: true,
			credentials: true
		})
	)
	.use(
		swagger({
			documentation: {
				info: {
					title: 'System Management Zakat API (Elysia.js)',
					version: '2.0.0',
					description:
						'Multi-Tenant Zakat Distribution & Management API dengan RBAC (Super Admin, Admin Lembaga, PIC Wilayah)'
				}
			}
		})
	)
	.use(
		jwt({
			name: 'jwt',
			secret: JWT_SECRET,
			exp: '7d'
		})
	)
	// WebSocket endpoint untuk Live Realtime Sync
	.ws('/ws', {
		query: t.Object({
			orgId: t.Optional(t.String())
		}),
		open(ws) {
			const room = ws.data.query?.orgId || 'global';
			if (!wsClients.has(room)) {
				wsClients.set(room, new Set());
			}
			wsClients.get(room)!.add(ws);
			ws.send(
				JSON.stringify({
					event: 'CONNECTED',
					room,
					timestamp: new Date().toISOString()
				})
			);
		},
		close(ws) {
			const room = ws.data.query?.orgId || 'global';
			wsClients.get(room)?.delete(ws);
		},
		message(ws, message) {
			if (message === 'ping') {
				ws.send(JSON.stringify({ event: 'PONG' }));
			}
		}
	})
	// Health Check
	.get('/api/health', () => ({
		status: 'ok',
		runtime: 'Bun + Elysia.js',
		timestamp: new Date().toISOString()
	}))
	// ==========================================
	// AUTHENTICATION ENDPOINTS
	// ==========================================
	.post(
		'/api/auth/login',
		async ({ body, jwt, set }) => {
			const username = body.username.trim().toLowerCase();
			const user = db
				.query('SELECT * FROM users WHERE LOWER(username) = ? LIMIT 1')
				.get(username) as UserRow | null;

			if (!user) {
				set.status = 401;
				return { error: 'Username atau password tidak valid.' };
			}

			const valid = await Bun.password.verify(body.password, user.password_hash);
			if (!valid) {
				set.status = 401;
				return { error: 'Username atau password tidak valid.' };
			}

			const organization = user.organization_id
				? (db
						.query('SELECT * FROM organizations WHERE id = ?')
						.get(user.organization_id) as Organization | null)
				: null;

			const payload: JwtPayload = {
				sub: user.id,
				username: user.username,
				name: user.name,
				role: user.role,
				organization_id: user.organization_id,
				assigned_zone: user.assigned_zone
			};

			const token = await jwt.sign(payload as Record<string, string | null>);

			return {
				token,
				user: toPublicUser(user),
				organization
			};
		},
		{
			body: t.Object({
				username: t.String(),
				password: t.String()
			})
		}
	)
	// Helper derive untuk membaca user dari Authorization Bearer token
	.derive(async ({ headers, jwt }): Promise<{ authUser: UserRow | null }> => {
		const authHeader = headers['authorization'];
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return { authUser: null };
		}
		const token = authHeader.slice(7);
		const verified = await jwt.verify(token);
		if (!verified || typeof verified !== 'object' || !('sub' in verified)) {
			return { authUser: null };
		}
		const user = db
			.query('SELECT * FROM users WHERE id = ? LIMIT 1')
			.get(String(verified.sub)) as UserRow | null;
		return { authUser: user };
	})
	.get('/api/auth/me', ({ authUser, set }) => {
		if (!authUser) {
			set.status = 401;
			return { error: 'Unauthorized' };
		}
		const organization = authUser.organization_id
			? (db
					.query('SELECT * FROM organizations WHERE id = ?')
					.get(authUser.organization_id) as Organization | null)
			: null;

		return {
			user: toPublicUser(authUser),
			organization
		};
	})

	// ==========================================
	// SUPER ADMIN ENDPOINTS (CRUD Tempat/Lembaga & Admin)
	// ==========================================
	.get('/api/organizations', ({ authUser, set }) => {
		if (!authUser || authUser.role !== 'super_admin') {
			set.status = 403;
			return { error: 'Hanya Super Admin yang dapat mengakses daftar lembaga.' };
		}

		const orgs = db
			.query('SELECT * FROM organizations ORDER BY created_at DESC')
			.all() as Organization[];

		const enriched = orgs.map((org) => {
			const admins = (
				db
					.query(
						"SELECT * FROM users WHERE organization_id = ? AND role = 'org_admin' ORDER BY created_at ASC"
					)
					.all(org.id) as UserRow[]
			).map(toPublicUser);

			const picsCount = (
				db
					.query(
						"SELECT COUNT(*) as count FROM users WHERE organization_id = ? AND role = 'pic'"
					)
					.get(org.id) as { count: number }
			).count;

			const mustahiqTotal = (
				db
					.query('SELECT COUNT(*) as count FROM mustahiq WHERE organization_id = ?')
					.get(org.id) as { count: number }
			).count;

			const deliveredTotal = (
				db
					.query(
						"SELECT COUNT(*) as count FROM mustahiq WHERE organization_id = ? AND status = 'delivered'"
					)
					.get(org.id) as { count: number }
			).count;

			const quota = computeOrgQuota(org.id);

			return {
				...org,
				admins,
				pics_count: picsCount,
				mustahiq_count: mustahiqTotal,
				delivered_count: deliveredTotal,
				quota
			};
		});

		return { organizations: enriched };
	})
	.post(
		'/api/organizations',
		async ({ authUser, body, set }) => {
			if (!authUser || authUser.role !== 'super_admin') {
				set.status = 403;
				return { error: 'Hanya Super Admin yang dapat membuat lembaga baru.' };
			}

			const cleanUsername = body.admin_username.trim().toLowerCase();
			const existingUser = db
				.query('SELECT id FROM users WHERE LOWER(username) = ?')
				.get(cleanUsername);

			if (existingUser) {
				set.status = 400;
				return { error: `Username "${cleanUsername}" sudah digunakan.` };
			}

			const now = new Date().toISOString();
			const orgId = crypto.randomUUID();
			const adminId = crypto.randomUUID();
			const passHash = await Bun.password.hash(body.admin_password);

			db.query(
				'INSERT INTO organizations (id, name, type, address, created_at) VALUES (?, ?, ?, ?, ?)'
			).run(orgId, body.name.trim(), body.type, body.address.trim(), now);

			// Buat zona default RT 01 & RT 02 agar langsung siap pakai
			for (const z of ['RT 01', 'RT 02']) {
				db.query(
					'INSERT INTO zones (id, organization_id, name, created_at) VALUES (?, ?, ?, ?)'
				).run(crypto.randomUUID(), orgId, z, now);
			}

			db.query(
				`INSERT INTO users (id, organization_id, name, username, password_hash, role, assigned_zone, created_at)
				 VALUES (?, ?, ?, ?, ?, 'org_admin', NULL, ?)`
			).run(adminId, orgId, body.admin_name.trim(), cleanUsername, passHash, now);

			const createdOrg = db
				.query('SELECT * FROM organizations WHERE id = ?')
				.get(orgId) as Organization;

			broadcastOrgEvent(orgId, 'ORG_CREATED', createdOrg);

			return {
				organization: createdOrg,
				admin: {
					id: adminId,
					name: body.admin_name.trim(),
					username: cleanUsername,
					role: 'org_admin'
				}
			};
		},
		{
			body: t.Object({
				name: t.String(),
				type: t.Union([
					t.Literal('masjid'),
					t.Literal('karang_taruna'),
					t.Literal('lembaga')
				]),
				address: t.String(),
				admin_name: t.String(),
				admin_username: t.String(),
				admin_password: t.String()
			})
		}
	)
	.patch(
		'/api/organizations/:id',
		({ authUser, params, body, set }) => {
			if (!authUser || authUser.role !== 'super_admin') {
				set.status = 403;
				return { error: 'Forbidden' };
			}

			db.query(
				'UPDATE organizations SET name = ?, type = ?, address = ? WHERE id = ?'
			).run(body.name.trim(), body.type, body.address.trim(), params.id);

			const updated = db
				.query('SELECT * FROM organizations WHERE id = ?')
				.get(params.id) as Organization | null;

			broadcastOrgEvent(params.id, 'ORG_UPDATED', updated);
			return { organization: updated };
		},
		{
			body: t.Object({
				name: t.String(),
				type: t.Union([
					t.Literal('masjid'),
					t.Literal('karang_taruna'),
					t.Literal('lembaga')
				]),
				address: t.String()
			})
		}
	)
	.delete('/api/organizations/:id', ({ authUser, params, set }) => {
		if (!authUser || authUser.role !== 'super_admin') {
			set.status = 403;
			return { error: 'Forbidden' };
		}

		db.query('DELETE FROM organizations WHERE id = ?').run(params.id);
		broadcastOrgEvent(params.id, 'ORG_DELETED', { id: params.id });
		return { success: true };
	})
	.post(
		'/api/organizations/:id/admins',
		async ({ authUser, params, body, set }) => {
			if (!authUser || authUser.role !== 'super_admin') {
				set.status = 403;
				return { error: 'Forbidden' };
			}

			const cleanUsername = body.username.trim().toLowerCase();
			const existing = db
				.query('SELECT id FROM users WHERE LOWER(username) = ?')
				.get(cleanUsername);
			if (existing) {
				set.status = 400;
				return { error: `Username "${cleanUsername}" sudah terdaftar.` };
			}

			const now = new Date().toISOString();
			const newId = crypto.randomUUID();
			const hash = await Bun.password.hash(body.password);

			db.query(
				`INSERT INTO users (id, organization_id, name, username, password_hash, role, assigned_zone, created_at)
				 VALUES (?, ?, ?, ?, ?, 'org_admin', NULL, ?)`
			).run(newId, params.id, body.name.trim(), cleanUsername, hash, now);

			const created = db.query('SELECT * FROM users WHERE id = ?').get(newId) as UserRow;
			broadcastOrgEvent(params.id, 'USER_UPDATED');
			return { admin: toPublicUser(created) };
		},
		{
			body: t.Object({
				name: t.String(),
				username: t.String(),
				password: t.String()
			})
		}
	)

	// ==========================================
	// DASHBOARD SNAPSHOT (ORG_ADMIN & PIC)
	// ==========================================
	.get('/api/dashboard', ({ authUser, set }) => {
		if (!authUser || !authUser.organization_id) {
			set.status = 401;
			return { error: 'Akun ini tidak terikat pada lembaga manapun.' };
		}

		const orgId = authUser.organization_id;
		const organization = db
			.query('SELECT * FROM organizations WHERE id = ?')
			.get(orgId) as Organization | null;

		if (!organization) {
			set.status = 404;
			return { error: 'Lembaga tidak ditemukan.' };
		}

		// Daftar Wilayah/RT di lembaga ini
		const zoneRows = db
			.query('SELECT * FROM zones WHERE organization_id = ? ORDER BY name ASC')
			.all(orgId) as ZoneRow[];

		// Daftar seluruh PIC di lembaga ini
		const picUsers = (
			db
				.query(
					"SELECT * FROM users WHERE organization_id = ? AND role = 'pic' ORDER BY assigned_zone ASC, name ASC"
				)
				.all(orgId) as UserRow[]
		).map(toPublicUser);

		// Daftar Mustahiq:
		// Opsi B (Ketat): Jika role === 'pic', HANYA kembalikan mustahiq di wilayah assigned_zone PIC tersebut!
		let mustahiq: MustahiqRow[] = [];
		if (authUser.role === 'pic') {
			mustahiq = db
				.query(
					'SELECT * FROM mustahiq WHERE organization_id = ? AND zone = ? ORDER BY name ASC'
				)
				.all(orgId, authUser.assigned_zone || '') as MustahiqRow[];
		} else {
			mustahiq = db
				.query('SELECT * FROM mustahiq WHERE organization_id = ? ORDER BY name ASC')
				.all(orgId) as MustahiqRow[];
		}

		// Daftar Muzakki (Pemberi Zakat)
		const muzakki = db
			.query('SELECT * FROM muzakki WHERE organization_id = ? ORDER BY created_at DESC')
			.all(orgId) as MuzakkiRow[];

		// Kalkulator Kuota Distribusi Otomatis
		const quota = computeOrgQuota(orgId);

		return {
			organization,
			zones: zoneRows,
			pics: picUsers,
			mustahiq,
			muzakki,
			quota
		};
	})

	// ==========================================
	// WILAYAH / ZONES MANAGEMENT (ORG_ADMIN)
	// ==========================================
	.post(
		'/api/zones',
		({ authUser, body, set }) => {
			if (!authUser || authUser.role !== 'org_admin' || !authUser.organization_id) {
				set.status = 403;
				return { error: 'Hanya Admin Lembaga yang dapat menambah wilayah/RT.' };
			}

			const cleanName = body.name.trim();
			const existing = db
				.query('SELECT id FROM zones WHERE organization_id = ? AND LOWER(name) = LOWER(?)')
				.get(authUser.organization_id, cleanName);

			if (existing) {
				set.status = 400;
				return { error: `Wilayah "${cleanName}" sudah ada.` };
			}

			const id = crypto.randomUUID();
			const now = new Date().toISOString();
			db.query(
				'INSERT INTO zones (id, organization_id, name, created_at) VALUES (?, ?, ?, ?)'
			).run(id, authUser.organization_id, cleanName, now);

			const zone = db.query('SELECT * FROM zones WHERE id = ?').get(id) as ZoneRow;
			broadcastOrgEvent(authUser.organization_id, 'ZONE_CREATED', zone);
			return { zone };
		},
		{
			body: t.Object({
				name: t.String()
			})
		}
	)
	.delete('/api/zones/:id', ({ authUser, params, set }) => {
		if (!authUser || authUser.role !== 'org_admin' || !authUser.organization_id) {
			set.status = 403;
			return { error: 'Forbidden' };
		}

		db.query('DELETE FROM zones WHERE id = ? AND organization_id = ?').run(
			params.id,
			authUser.organization_id
		);
		broadcastOrgEvent(authUser.organization_id, 'ZONE_DELETED', { id: params.id });
		return { success: true };
	})

	// ==========================================
	// MANAJEMEN AKUN PIC PEMBAGI (ORG_ADMIN)
	// ==========================================
	.post(
		'/api/users/pic',
		async ({ authUser, body, set }) => {
			if (!authUser || authUser.role !== 'org_admin' || !authUser.organization_id) {
				set.status = 403;
				return { error: 'Hanya Admin Lembaga yang dapat membuat akun PIC.' };
			}

			const cleanUsername = body.username.trim().toLowerCase();
			const existing = db
				.query('SELECT id FROM users WHERE LOWER(username) = ?')
				.get(cleanUsername);

			if (existing) {
				set.status = 400;
				return { error: `Username "${cleanUsername}" sudah digunakan. Gunakan username lain.` };
			}

			const cleanZone = body.assigned_zone.trim();
			const now = new Date().toISOString();

			// Pastikan zona tersebut terdaftar di tabel zones
			const zoneExists = db
				.query('SELECT id FROM zones WHERE organization_id = ? AND name = ?')
				.get(authUser.organization_id, cleanZone);
			if (!zoneExists) {
				db.query(
					'INSERT INTO zones (id, organization_id, name, created_at) VALUES (?, ?, ?, ?)'
				).run(crypto.randomUUID(), authUser.organization_id, cleanZone, now);
			}

			const picId = crypto.randomUUID();
			const passHash = await Bun.password.hash(body.password);

			db.query(
				`INSERT INTO users (id, organization_id, name, username, password_hash, role, assigned_zone, created_at)
				 VALUES (?, ?, ?, ?, ?, 'pic', ?, ?)`
			).run(picId, authUser.organization_id, body.name.trim(), cleanUsername, passHash, cleanZone, now);

			const created = db.query('SELECT * FROM users WHERE id = ?').get(picId) as UserRow;
			broadcastOrgEvent(authUser.organization_id, 'PIC_CREATED', toPublicUser(created));

			return { pic: toPublicUser(created) };
		},
		{
			body: t.Object({
				name: t.String(),
				username: t.String(),
				password: t.String(),
				assigned_zone: t.String()
			})
		}
	)
	.delete('/api/users/:id', ({ authUser, params, set }) => {
		if (!authUser) {
			set.status = 401;
			return { error: 'Unauthorized' };
		}

		const target = db
			.query('SELECT * FROM users WHERE id = ?')
			.get(params.id) as UserRow | null;

		if (!target) {
			set.status = 404;
			return { error: 'User tidak ditemukan.' };
		}

		if (
			authUser.role !== 'super_admin' &&
			(authUser.role !== 'org_admin' || target.organization_id !== authUser.organization_id)
		) {
			set.status = 403;
			return { error: 'Forbidden' };
		}

		db.query('DELETE FROM users WHERE id = ?').run(params.id);
		broadcastOrgEvent(target.organization_id, 'USER_DELETED', { id: params.id });
		return { success: true };
	})

	// ==========================================
	// MUSTAHIQ (PENERIMA ZAKAT) & DISTRIBUSI
	// ==========================================
	.post(
		'/api/mustahiq',
		({ authUser, body, set }) => {
			if (!authUser || authUser.role !== 'org_admin' || !authUser.organization_id) {
				set.status = 403;
				return { error: 'Hanya Admin Lembaga yang dapat menambah penerima zakat.' };
			}

			const cleanZone = body.zone.trim();
			const now = new Date().toISOString();

			// Pastikan zona terdaftar di tabel zones
			const zoneExists = db
				.query('SELECT id FROM zones WHERE organization_id = ? AND name = ?')
				.get(authUser.organization_id, cleanZone);
			if (!zoneExists) {
				db.query(
					'INSERT INTO zones (id, organization_id, name, created_at) VALUES (?, ?, ?, ?)'
				).run(crypto.randomUUID(), authUser.organization_id, cleanZone, now);
			}

			const id = crypto.randomUUID();
			db.query(
				`INSERT INTO mustahiq (id, organization_id, name, address, zone, status, delivered_by, delivered_by_user_id, delivered_at, created_at)
				 VALUES (?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, ?)`
			).run(id, authUser.organization_id, body.name.trim(), body.address.trim(), cleanZone, now);

			const created = db.query('SELECT * FROM mustahiq WHERE id = ?').get(id) as MustahiqRow;
			broadcastOrgEvent(authUser.organization_id, 'MUSTAHIQ_CREATED', created);

			return { mustahiq: created };
		},
		{
			body: t.Object({
				name: t.String(),
				address: t.String(),
				zone: t.String()
			})
		}
	)
	.patch(
		'/api/mustahiq/:id',
		({ authUser, params, body, set }) => {
			if (!authUser || authUser.role !== 'org_admin' || !authUser.organization_id) {
				set.status = 403;
				return { error: 'Hanya Admin Lembaga yang dapat mengubah data penerima.' };
			}

			const existing = db
				.query('SELECT * FROM mustahiq WHERE id = ? AND organization_id = ?')
				.get(params.id, authUser.organization_id) as MustahiqRow | null;

			if (!existing) {
				set.status = 404;
				return { error: 'Data penerima tidak ditemukan.' };
			}

			db.query('UPDATE mustahiq SET name = ?, address = ?, zone = ? WHERE id = ?').run(
				body.name.trim(),
				body.address.trim(),
				body.zone.trim(),
				params.id
			);

			const updated = db
				.query('SELECT * FROM mustahiq WHERE id = ?')
				.get(params.id) as MustahiqRow;

			broadcastOrgEvent(authUser.organization_id, 'MUSTAHIQ_UPDATED', updated);
			return { mustahiq: updated };
		},
		{
			body: t.Object({
				name: t.String(),
				address: t.String(),
				zone: t.String()
			})
		}
	)
	// TANDAI SELESAI — Otomatis mencatat nama & ID user yang login + catatan penyerahan!
	.patch(
		'/api/mustahiq/:id/deliver',
		({ authUser, params, body, set }) => {
			if (!authUser || !authUser.organization_id) {
				set.status = 401;
				return { error: 'Unauthorized' };
			}

			const existing = db
				.query('SELECT * FROM mustahiq WHERE id = ? AND organization_id = ?')
				.get(params.id, authUser.organization_id) as MustahiqRow | null;

			if (!existing) {
				set.status = 404;
				return { error: 'Data penerima tidak ditemukan di lembaga Anda.' };
			}

			// Opsi B Enforcement: Jika PIC, wajib berada di wilayah assigned_zone miliknya!
			if (authUser.role === 'pic' && existing.zone !== authUser.assigned_zone) {
				set.status = 403;
				return {
					error: `Akses ditolak: Anda ditugaskan khusus untuk wilayah ${authUser.assigned_zone}, tidak dapat memproses wilayah ${existing.zone}.`
				};
			}

			const now = new Date().toISOString();
			const cleanNote = body?.delivery_note ? body.delivery_note.trim() : null;

			db.query(
				`UPDATE mustahiq
				 SET status = 'delivered',
				     delivered_by = ?,
				     delivered_by_user_id = ?,
				     delivered_at = ?,
				     delivery_note = ?
				 WHERE id = ?`
			).run(authUser.name, authUser.id, now, cleanNote, params.id);

			const updated = db
				.query('SELECT * FROM mustahiq WHERE id = ?')
				.get(params.id) as MustahiqRow;

			broadcastOrgEvent(authUser.organization_id, 'MUSTAHIQ_UPDATED', updated);
			return { mustahiq: updated };
		},
		{
			body: t.Optional(
				t.Object({
					delivery_note: t.Optional(t.String())
				})
			)
		}
	)
	// BATALKAN SELESAI (REVERT KE PENDING)
	.patch('/api/mustahiq/:id/revert', ({ authUser, params, set }) => {
		if (!authUser || !authUser.organization_id) {
			set.status = 401;
			return { error: 'Unauthorized' };
		}

		const existing = db
			.query('SELECT * FROM mustahiq WHERE id = ? AND organization_id = ?')
			.get(params.id, authUser.organization_id) as MustahiqRow | null;

		if (!existing) {
			set.status = 404;
			return { error: 'Data penerima tidak ditemukan.' };
		}

		// Opsi B Enforcement: Jika PIC, wajib berada di wilayah assigned_zone miliknya!
		if (authUser.role === 'pic' && existing.zone !== authUser.assigned_zone) {
			set.status = 403;
			return {
				error: `Akses ditolak: Anda hanya dapat membatalkan status di wilayah ${authUser.assigned_zone}.`
			};
		}

		db.query(
			`UPDATE mustahiq
			 SET status = 'pending',
			     delivered_by = NULL,
			     delivered_by_user_id = NULL,
			     delivered_at = NULL,
			     delivery_note = NULL
			 WHERE id = ?`
		).run(params.id);

		const updated = db
			.query('SELECT * FROM mustahiq WHERE id = ?')
			.get(params.id) as MustahiqRow;

		broadcastOrgEvent(authUser.organization_id, 'MUSTAHIQ_UPDATED', updated);
		return { mustahiq: updated };
	})
	.delete('/api/mustahiq/:id', ({ authUser, params, set }) => {
		if (!authUser || authUser.role !== 'org_admin' || !authUser.organization_id) {
			set.status = 403;
			return { error: 'Hanya Admin Lembaga yang dapat menghapus data penerima.' };
		}

		db.query('DELETE FROM mustahiq WHERE id = ? AND organization_id = ?').run(
			params.id,
			authUser.organization_id
		);
		broadcastOrgEvent(authUser.organization_id, 'MUSTAHIQ_DELETED', { id: params.id });
		return { success: true };
	})

	// ==========================================
	// MUZAKKI (PEMBERI ZAKAT)
	// ==========================================
	.post(
		'/api/muzakki',
		({ authUser, body, set }) => {
			if (!authUser || authUser.role !== 'org_admin' || !authUser.organization_id) {
				set.status = 403;
				return { error: 'Hanya Admin Lembaga yang dapat mencatat muzakki.' };
			}

			const id = crypto.randomUUID();
			const now = new Date().toISOString();
			const cleanPhone = body.phone ? body.phone.trim() : null;
			const jiwaCount = body.jiwa_count && body.jiwa_count > 0 ? Math.floor(body.jiwa_count) : 1;
			const cleanNotes = body.notes ? body.notes.trim() : null;

			db.query(
				`INSERT INTO muzakki (id, organization_id, name, phone, jiwa_count, zakat_type, amount, notes, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
			).run(
				id,
				authUser.organization_id,
				body.name.trim(),
				cleanPhone,
				jiwaCount,
				body.zakat_type,
				body.amount,
				cleanNotes,
				now
			);

			const created = db.query('SELECT * FROM muzakki WHERE id = ?').get(id) as MuzakkiRow;
			broadcastOrgEvent(authUser.organization_id, 'MUZAKKI_CREATED', created);

			return {
				muzakki: created,
				quota: computeOrgQuota(authUser.organization_id)
			};
		},
		{
			body: t.Object({
				name: t.String(),
				phone: t.Optional(t.String()),
				jiwa_count: t.Optional(t.Number()),
				zakat_type: t.Union([t.Literal('uang'), t.Literal('beras')]),
				amount: t.Number(),
				notes: t.Optional(t.String())
			})
		}
	)
	.delete('/api/muzakki/:id', ({ authUser, params, set }) => {
		if (!authUser || authUser.role !== 'org_admin' || !authUser.organization_id) {
			set.status = 403;
			return { error: 'Forbidden' };
		}

		db.query('DELETE FROM muzakki WHERE id = ? AND organization_id = ?').run(
			params.id,
			authUser.organization_id
		);
		broadcastOrgEvent(authUser.organization_id, 'MUZAKKI_DELETED', { id: params.id });

		return {
			success: true,
			quota: computeOrgQuota(authUser.organization_id)
		};
	})
	.listen(PORT);

console.log(
	`🦊 Elysia.js Zakat Backend running at http://${app.server?.hostname}:${app.server?.port}`
);
console.log(
	`📚 Swagger API Docs available at http://${app.server?.hostname}:${app.server?.port}/swagger`
);
