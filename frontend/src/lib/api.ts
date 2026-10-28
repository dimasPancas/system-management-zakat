export type Role = 'super_admin' | 'org_admin' | 'pic';

export interface Organization {
	id: string;
	name: string;
	type: 'masjid' | 'karang_taruna' | 'lembaga';
	address: string;
	created_at: string;
}

export interface User {
	id: string;
	organization_id: string | null;
	name: string;
	username: string;
	role: Role;
	assigned_zone: string | null;
	created_at: string;
}

export interface Zone {
	id: string;
	organization_id: string;
	name: string;
	created_at: string;
}

export interface Mustahiq {
	id: string;
	organization_id: string;
	name: string;
	address: string;
	zone: string;
	status: 'pending' | 'delivered';
	delivered_by: string | null;
	delivered_by_user_id: string | null;
	delivered_at: string | null;
	delivery_note: string | null;
	created_at: string;
}

export interface Muzakki {
	id: string;
	organization_id: string;
	name: string;
	phone: string | null;
	jiwa_count: number;
	zakat_type: 'uang' | 'beras';
	amount: number;
	notes: string | null;
	created_at: string;
}

export interface QuotaSummary {
	total_mustahiq: number;
	total_uang: number;
	total_beras: number;
	uang_per_mustahiq: number;
	beras_per_mustahiq: number;
}

export interface EnrichedOrganization extends Organization {
	admins: User[];
	pics_count: number;
	mustahiq_count: number;
	delivered_count: number;
	quota: QuotaSummary;
}

export interface StoredSession {
	token: string;
	user: User;
	organization: Organization | null;
}

const STORAGE_KEY = 'zakat_auth_session_v2';

export const API_BASE_URL =
	(import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:3001';

export const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws');

export function getStoredSession(): StoredSession | null {
	if (typeof window === 'undefined') return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		return JSON.parse(raw) as StoredSession;
	} catch {
		return null;
	}
}

export function setStoredSession(session: StoredSession): void {
	if (typeof window === 'undefined') return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession(): void {
	if (typeof window === 'undefined') return;
	localStorage.removeItem(STORAGE_KEY);
}

export async function apiFetch<T = any>(
	path: string,
	options: RequestInit = {},
	token?: string
): Promise<{ data: T | null; error: string | null; status: number }> {
	const sessionToken = token ?? getStoredSession()?.token;
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		...(options.headers as Record<string, string>)
	};

	if (sessionToken) {
		headers['Authorization'] = `Bearer ${sessionToken}`;
	}

	try {
		const res = await fetch(`${API_BASE_URL}${path}`, {
			...options,
			headers
		});
		const json = await res.json().catch(() => null);
		if (!res.ok) {
			return {
				data: null,
				error: json?.error || `Request gagal (${res.status})`,
				status: res.status
			};
		}
		return {
			data: json as T,
			error: null,
			status: res.status
		};
	} catch (err) {
		return {
			data: null,
			error: 'Tidak dapat terhubung ke server backend Elysia.js (pastikan port 3001 berjalan).',
			status: 0
		};
	}
}
