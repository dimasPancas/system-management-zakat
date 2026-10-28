export type Role = 'super_admin' | 'org_admin' | 'pic';

export interface Organization {
	id: string;
	name: string;
	type: 'masjid' | 'karang_taruna' | 'lembaga';
	address: string;
	created_at: string;
}

export interface UserRow {
	id: string;
	organization_id: string | null;
	name: string;
	username: string;
	password_hash: string;
	role: Role;
	assigned_zone: string | null;
	created_at: string;
}

export type PublicUser = Omit<UserRow, 'password_hash'>;

export interface ZoneRow {
	id: string;
	organization_id: string;
	name: string;
	created_at: string;
}

export interface MustahiqRow {
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

export interface MuzakkiRow {
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

export interface JwtPayload {
	sub: string;
	username: string;
	name: string;
	role: Role;
	organization_id: string | null;
	assigned_zone: string | null;
}
