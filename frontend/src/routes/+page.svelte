<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		apiFetch,
		clearStoredSession,
		getStoredSession,
		WS_BASE_URL,
		type EnrichedOrganization,
		type Mustahiq,
		type Muzakki,
		type Organization,
		type QuotaSummary,
		type User,
		type Zone
	} from '#lib/api';
	import {
		Card,
		CardContent,
		CardFooter,
		CardHeader,
		CardTitle
	} from '#lib/components/ui/card';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import { Input } from '#lib/components/ui/input';
	import {
		MapPin,
		CheckCircle2,
		Clock,
		Filter,
		Radio,
		Loader2,
		RefreshCw,
		UserCheck,
		Compass,
		Plus,
		Trash2,
		RotateCcw,
		Users,
		Wallet,
		Wheat,
		UserCog,
		Pencil,
		X,
		LogOut,
		Building2,
		ShieldCheck,
		Calculator,
		KeyRound,
		Search,
		MessageSquare,
		Printer,
		Send,
		FileText,
		Phone,
		LayoutGrid,
		Table2
	} from 'lucide-svelte';

	// Sesi User Login
	let currentUser = $state<User | null>(null);
	let currentOrg = $state<Organization | null>(null);
	let authChecked = $state<boolean>(false);

	// Status Umum & Realtime WebSocket
	let loading = $state<boolean>(true);
	let realtimeConnected = $state<boolean>(false);
	let errorMessage = $state<string | null>(null);
	let successMessage = $state<string | null>(null);

	// Mode Tampilan Khusus Layar Desktop/Laptop: 'grid' (Kartu) atau 'table' (Tabel Baris Ringkas)
	let desktopViewMode = $state<'grid' | 'table'>('grid');

	// =========================================================
	// STATE KHUSUS SUPER ADMIN (OWNER)
	// =========================================================
	let organizationsList = $state<EnrichedOrganization[]>([]);
	let formOrgName = $state<string>('');
	let formOrgType = $state<'masjid' | 'karang_taruna' | 'lembaga'>('masjid');
	let formOrgAddress = $state<string>('');
	let formOrgAdminName = $state<string>('');
	let formOrgAdminUsername = $state<string>('');
	let formOrgAdminPassword = $state<string>('');
	let submittingOrg = $state<boolean>(false);

	// Tambah admin ekstra ke lembaga tertentu
	let addingAdminForOrgId = $state<string | null>(null);
	let extraAdminName = $state<string>('');
	let extraAdminUsername = $state<string>('');
	let extraAdminPassword = $state<string>('');

	// =========================================================
	// STATE KHUSUS ORG_ADMIN & PIC
	// =========================================================
	type OrgTab = 'distribusi' | 'mustahiq' | 'pic' | 'muzakki';
	let activeTab = $state<OrgTab>('distribusi');

	let zonesList = $state<Zone[]>([]);
	let picsList = $state<User[]>([]);
	let mustahiqList = $state<Mustahiq[]>([]);
	let muzakkiList = $state<Muzakki[]>([]);
	let quota = $state<QuotaSummary>({
		total_mustahiq: 0,
		total_uang: 0,
		total_beras: 0,
		uang_per_mustahiq: 0,
		beras_per_mustahiq: 0
	});

	// Filter & Search di Halaman Distribusi (Paket 1)
	let selectedZone = $state<string>('Semua');
	let selectedStatusFilter = $state<'all' | 'pending' | 'delivered'>('all');
	let searchQuery = $state<string>('');
	let deliveryNotes = $state<Record<string, string>>({});

	let updatingIds = $state<Record<string, boolean>>({});
	let deletingIds = $state<Record<string, boolean>>({});

	// Form Mustahiq (Admin Lembaga)
	let editingMustahiqId = $state<string | null>(null);
	let formMustahiqName = $state<string>('');
	let formMustahiqAddress = $state<string>('');
	let formMustahiqZone = $state<string>('RT 01');
	let submittingMustahiq = $state<boolean>(false);

	// Form Wilayah & Akun PIC Baru (Admin Lembaga)
	let formNewZoneName = $state<string>('');
	let formPicName = $state<string>('');
	let formPicUsername = $state<string>('');
	let formPicPassword = $state<string>('');
	let formPicZone = $state<string>('RT 01');
	let submittingPic = $state<boolean>(false);

	// Form Muzakki + Kalkulator Jumlah Jiwa & Bukti Terima (Paket 2)
	let formMuzakkiName = $state<string>('');
	let formMuzakkiPhone = $state<string>('');
	let formMuzakkiType = $state<'uang' | 'beras'>('uang');
	let useFitrahCalculator = $state<boolean>(true);
	let formJiwaCount = $state<number>(1);
	let standardUangPerJiwa = $state<number>(45000);
	let standardBerasPerJiwa = $state<number>(2.5);
	let formMuzakkiAmount = $state<string>('45000');
	let formMuzakkiNotes = $state<string>('');
	let submittingMuzakki = $state<boolean>(false);

	// Modal Kwitansi / Bukti Terima Muzakki
	let selectedReceiptMuzakki = $state<Muzakki | null>(null);

	// Peta Wilayah -> Daftar nama PIC yang bertugas di wilayah tersebut
	let zonePicNamesMap = $derived.by(() => {
		const map: Record<string, string[]> = {};
		for (const p of picsList) {
			if (p.assigned_zone) {
				if (!map[p.assigned_zone]) map[p.assigned_zone] = [];
				map[p.assigned_zone].push(p.name);
			}
		}
		return map;
	});

	// Daftar nama zona unik untuk dropdown & filter
	let availableZoneNames = $derived(
		Array.from(
			new Set([
				...zonesList.map((z) => z.name),
				...mustahiqList.map((m) => m.zone).filter(Boolean)
			])
		).sort()
	);

	let filterZones = $derived(['Semua', ...availableZoneNames]);

	// Filter Mustahiq berdasarkan Zona (untuk Statistik Header)
	let zoneFilteredMustahiq = $derived(
		currentUser?.role === 'pic'
			? mustahiqList
			: selectedZone === 'Semua'
				? mustahiqList
				: mustahiqList.filter((item) => item.zone === selectedZone)
	);

	// Filter Mustahiq lengkap dengan Search Nama/Alamat + Filter Status (Pending / Delivered)
	let filteredMustahiq = $derived.by(() => {
		let list = zoneFilteredMustahiq;

		if (selectedStatusFilter !== 'all') {
			list = list.filter((item) => item.status === selectedStatusFilter);
		}

		const q = searchQuery.trim().toLowerCase();
		if (q) {
			list = list.filter(
				(item) =>
					item.name.toLowerCase().includes(q) ||
					item.address.toLowerCase().includes(q) ||
					item.zone.toLowerCase().includes(q) ||
					(item.delivery_note && item.delivery_note.toLowerCase().includes(q))
			);
		}

		return list;
	});

	// Statistik Progres Distribusi (berdasarkan wilayah yang dipilih)
	let totalCount = $derived(zoneFilteredMustahiq.length);
	let deliveredCount = $derived(
		zoneFilteredMustahiq.filter((item) => item.status === 'delivered').length
	);
	let pendingCount = $derived(
		zoneFilteredMustahiq.filter((item) => item.status === 'pending').length
	);
	let progressPercent = $derived(
		totalCount > 0 ? Math.round((deliveredCount / totalCount) * 100) : 0
	);

	// Total Jiwa Muzakki
	let totalJiwaMuzakki = $derived(
		muzakkiList.reduce((acc, m) => acc + Number(m.jiwa_count || 1), 0)
	);

	// Statistik Global untuk Super Admin
	let globalMustahiqTotal = $derived(
		organizationsList.reduce((acc, o) => acc + o.mustahiq_count, 0)
	);
	let globalDeliveredTotal = $derived(
		organizationsList.reduce((acc, o) => acc + o.delivered_count, 0)
	);
	let globalPicsTotal = $derived(organizationsList.reduce((acc, o) => acc + o.pics_count, 0));

	// Fungsi bantu hitung otomatis kalkulator Zakat Fitrah per jiwa
	function recalculateFitrahAmount() {
		if (!useFitrahCalculator) return;
		const jiwa = Math.max(1, Number(formJiwaCount) || 1);
		if (formMuzakkiType === 'uang') {
			const total = jiwa * (Number(standardUangPerJiwa) || 0);
			formMuzakkiAmount = String(total);
		} else {
			const total = Number((jiwa * (Number(standardBerasPerJiwa) || 0)).toFixed(2));
			formMuzakkiAmount = String(total);
		}
	}

	function setQuickJiwa(count: number) {
		formJiwaCount = count;
		recalculateFitrahAmount();
	}

	function handleMuzakkiTypeChange(newType: 'uang' | 'beras') {
		formMuzakkiType = newType;
		recalculateFitrahAmount();
	}

	function notify(msg: string) {
		successMessage = msg;
		setTimeout(() => {
			if (successMessage === msg) successMessage = null;
		}, 3500);
	}

	function handleLogout() {
		clearStoredSession();
		goto('/login');
	}

	// Load Data sesuai Role
	async function loadData() {
		if (!currentUser) return;
		loading = true;
		errorMessage = null;

		if (currentUser.role === 'super_admin') {
			const { data, error, status } = await apiFetch<{
				organizations: EnrichedOrganization[];
			}>('/api/organizations');

			if (status === 401) {
				handleLogout();
				return;
			}
			if (error) {
				errorMessage = error;
			} else if (data) {
				organizationsList = data.organizations;
			}
		} else {
			const { data, error, status } = await apiFetch<{
				organization: Organization;
				zones: Zone[];
				pics: User[];
				mustahiq: Mustahiq[];
				muzakki: Muzakki[];
				quota: QuotaSummary;
			}>('/api/dashboard');

			if (status === 401) {
				handleLogout();
				return;
			}
			if (error) {
				errorMessage = error;
			} else if (data) {
				currentOrg = data.organization;
				zonesList = data.zones;
				picsList = data.pics;
				mustahiqList = data.mustahiq;
				muzakkiList = data.muzakki;
				quota = data.quota;

				if (data.zones.length > 0 && !formMustahiqZone) {
					formMustahiqZone = data.zones[0].name;
				}
				if (data.zones.length > 0 && !formPicZone) {
					formPicZone = data.zones[0].name;
				}
			}
		}

		loading = false;
	}

	// =========================================================
	// AKSI SUPER ADMIN (CRUD TEMPAT / MASJID & ADMIN)
	// =========================================================
	async function handleCreateOrganization(e: SubmitEvent) {
		e.preventDefault();
		submittingOrg = true;
		errorMessage = null;

		const { data, error } = await apiFetch('/api/organizations', {
			method: 'POST',
			body: JSON.stringify({
				name: formOrgName,
				type: formOrgType,
				address: formOrgAddress,
				admin_name: formOrgAdminName,
				admin_username: formOrgAdminUsername,
				admin_password: formOrgAdminPassword
			})
		});

		if (error) {
			errorMessage = error;
		} else if (data) {
			formOrgName = '';
			formOrgAddress = '';
			formOrgAdminName = '';
			formOrgAdminUsername = '';
			formOrgAdminPassword = '';
			notify('Tempat/Lembaga beserta akun Admin berhasil dibuat!');
			await loadData();
		}

		submittingOrg = false;
	}

	async function handleAddExtraAdmin(orgId: string, e: SubmitEvent) {
		e.preventDefault();
		errorMessage = null;

		const { error } = await apiFetch(`/api/organizations/${orgId}/admins`, {
			method: 'POST',
			body: JSON.stringify({
				name: extraAdminName,
				username: extraAdminUsername,
				password: extraAdminPassword
			})
		});

		if (error) {
			errorMessage = error;
		} else {
			extraAdminName = '';
			extraAdminUsername = '';
			extraAdminPassword = '';
			addingAdminForOrgId = null;
			notify('Akun Admin tambahan berhasil dibuat.');
			await loadData();
		}
	}

	async function handleDeleteOrganization(org: EnrichedOrganization) {
		if (deletingIds[org.id]) return;
		deletingIds[org.id] = true;

		const { error } = await apiFetch(`/api/organizations/${org.id}`, {
			method: 'DELETE'
		});

		if (error) {
			errorMessage = error;
		} else {
			organizationsList = organizationsList.filter((o) => o.id !== org.id);
			notify(`Lembaga "${org.name}" telah dihapus.`);
		}

		deletingIds[org.id] = false;
	}

	// =========================================================
	// AKSI DISTRIBUSI (TANDAI SELESAI + CATATAN PENYERAHAN & BATAL)
	// =========================================================
	async function markAsDelivered(item: Mustahiq) {
		if (updatingIds[item.id]) return;
		updatingIds[item.id] = true;
		errorMessage = null;

		const noteText = (deliveryNotes[item.id] || '').trim();

		const { data, error } = await apiFetch<{ mustahiq: Mustahiq }>(
			`/api/mustahiq/${item.id}/deliver`,
			{
				method: 'PATCH',
				body: JSON.stringify({
					delivery_note: noteText || undefined
				})
			}
		);

		if (error) {
			errorMessage = error;
		} else if (data?.mustahiq) {
			const idx = mustahiqList.findIndex((m) => m.id === item.id);
			if (idx !== -1) mustahiqList[idx] = data.mustahiq;
			deliveryNotes[item.id] = '';
			notify(
				`Zakat untuk ${item.name} selesai disalurkan (Oleh: ${data.mustahiq.delivered_by}).`
			);
		}

		updatingIds[item.id] = false;
	}

	async function revertToPending(item: Mustahiq) {
		if (updatingIds[item.id]) return;
		updatingIds[item.id] = true;
		errorMessage = null;

		const { data, error } = await apiFetch<{ mustahiq: Mustahiq }>(
			`/api/mustahiq/${item.id}/revert`,
			{ method: 'PATCH' }
		);

		if (error) {
			errorMessage = error;
		} else if (data?.mustahiq) {
			const idx = mustahiqList.findIndex((m) => m.id === item.id);
			if (idx !== -1) mustahiqList[idx] = data.mustahiq;
			notify(`Status penyaluran ${item.name} dikembalikan ke Pending.`);
		}

		updatingIds[item.id] = false;
	}

	// =========================================================
	// AKSI ADMIN LEMBAGA: CRUD MUSTAHIQ, WILAYAH, AKUN PIC, MUZAKKI
	// =========================================================
	async function handleSaveMustahiq(e: SubmitEvent) {
		e.preventDefault();
		submittingMustahiq = true;
		errorMessage = null;

		if (editingMustahiqId) {
			const { data, error } = await apiFetch<{ mustahiq: Mustahiq }>(
				`/api/mustahiq/${editingMustahiqId}`,
				{
					method: 'PATCH',
					body: JSON.stringify({
						name: formMustahiqName,
						address: formMustahiqAddress,
						zone: formMustahiqZone
					})
				}
			);

			if (error) {
				errorMessage = error;
			} else if (data?.mustahiq) {
				const idx = mustahiqList.findIndex((m) => m.id === editingMustahiqId);
				if (idx !== -1) mustahiqList[idx] = data.mustahiq;
				editingMustahiqId = null;
				formMustahiqName = '';
				formMustahiqAddress = '';
				notify('Data penerima zakat berhasil diperbarui.');
			}
		} else {
			const { data, error } = await apiFetch<{ mustahiq: Mustahiq }>('/api/mustahiq', {
				method: 'POST',
				body: JSON.stringify({
					name: formMustahiqName,
					address: formMustahiqAddress,
					zone: formMustahiqZone
				})
			});

			if (error) {
				errorMessage = error;
			} else if (data?.mustahiq) {
				formMustahiqName = '';
				formMustahiqAddress = '';
				notify(`Penerima "${data.mustahiq.name}" berhasil ditambahkan.`);
				await loadData();
			}
		}

		submittingMustahiq = false;
	}

	function startEditMustahiq(item: Mustahiq) {
		editingMustahiqId = item.id;
		formMustahiqName = item.name;
		formMustahiqAddress = item.address;
		formMustahiqZone = item.zone;
		activeTab = 'mustahiq';
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	async function handleDeleteMustahiq(item: Mustahiq) {
		if (deletingIds[item.id]) return;
		deletingIds[item.id] = true;

		const { error } = await apiFetch(`/api/mustahiq/${item.id}`, { method: 'DELETE' });
		if (error) {
			errorMessage = error;
		} else {
			mustahiqList = mustahiqList.filter((m) => m.id !== item.id);
			notify(`Penerima "${item.name}" telah dihapus.`);
			await loadData();
		}

		deletingIds[item.id] = false;
	}

	async function handleAddZone(e: SubmitEvent) {
		e.preventDefault();
		if (!formNewZoneName.trim()) return;
		errorMessage = null;

		const { data, error } = await apiFetch<{ zone: Zone }>('/api/zones', {
			method: 'POST',
			body: JSON.stringify({ name: formNewZoneName.trim() })
		});

		if (error) {
			errorMessage = error;
		} else if (data?.zone) {
			zonesList = [...zonesList, data.zone];
			formPicZone = data.zone.name;
			formMustahiqZone = data.zone.name;
			formNewZoneName = '';
			notify(`Wilayah "${data.zone.name}" berhasil ditambahkan.`);
		}
	}

	async function handleCreatePicAccount(e: SubmitEvent) {
		e.preventDefault();
		submittingPic = true;
		errorMessage = null;

		const { data, error } = await apiFetch<{ pic: User }>('/api/users/pic', {
			method: 'POST',
			body: JSON.stringify({
				name: formPicName,
				username: formPicUsername,
				password: formPicPassword,
				assigned_zone: formPicZone
			})
		});

		if (error) {
			errorMessage = error;
		} else if (data?.pic) {
			picsList = [...picsList, data.pic];
			formPicName = '';
			formPicUsername = '';
			formPicPassword = '';
			notify(
				`Akun PIC "${data.pic.name}" (Username: ${data.pic.username}) untuk wilayah ${data.pic.assigned_zone} berhasil dibuat!`
			);
			await loadData();
		}

		submittingPic = false;
	}

	async function handleDeleteUser(u: User) {
		if (deletingIds[u.id]) return;
		deletingIds[u.id] = true;

		const { error } = await apiFetch(`/api/users/${u.id}`, { method: 'DELETE' });
		if (error) {
			errorMessage = error;
		} else {
			picsList = picsList.filter((p) => p.id !== u.id);
			notify(`Akun "${u.name}" telah dihapus.`);
		}

		deletingIds[u.id] = false;
	}

	async function handleAddMuzakki(e: SubmitEvent) {
		e.preventDefault();
		const parsedAmount = Number(formMuzakkiAmount);
		if (!formMuzakkiName.trim() || !parsedAmount || parsedAmount <= 0) {
			errorMessage = 'Nama muzakki dan jumlah zakat wajib valid.';
			return;
		}

		submittingMuzakki = true;
		errorMessage = null;

		const jiwa = Math.max(1, Number(formJiwaCount) || 1);
		const defaultNote = useFitrahCalculator
			? `Zakat Fitrah ${jiwa} Jiwa (${
					formMuzakkiType === 'uang'
						? `@ ${formatRupiah(standardUangPerJiwa)}`
						: `@ ${standardBerasPerJiwa} Kg`
				})`
			: 'Zakat / Infaq';

		const { data, error } = await apiFetch<{ muzakki: Muzakki; quota: QuotaSummary }>(
			'/api/muzakki',
			{
				method: 'POST',
				body: JSON.stringify({
					name: formMuzakkiName,
					phone: formMuzakkiPhone.trim() || undefined,
					jiwa_count: jiwa,
					zakat_type: formMuzakkiType,
					amount: parsedAmount,
					notes: formMuzakkiNotes.trim() || defaultNote
				})
			}
		);

		if (error) {
			errorMessage = error;
		} else if (data) {
			muzakkiList = [data.muzakki, ...muzakkiList];
			quota = data.quota;
			formMuzakkiName = '';
			formMuzakkiPhone = '';
			formMuzakkiNotes = '';
			formJiwaCount = 1;
			recalculateFitrahAmount();
			notify(`Zakat dari "${data.muzakki.name}" berhasil dicatat.`);
		}

		submittingMuzakki = false;
	}

	async function handleDeleteMuzakki(item: Muzakki) {
		if (deletingIds[item.id]) return;
		deletingIds[item.id] = true;

		const { data, error } = await apiFetch<{ success: boolean; quota: QuotaSummary }>(
			`/api/muzakki/${item.id}`,
			{ method: 'DELETE' }
		);

		if (error) {
			errorMessage = error;
		} else {
			muzakkiList = muzakkiList.filter((m) => m.id !== item.id);
			if (data?.quota) quota = data.quota;
			notify(`Data muzakki "${item.name}" dihapus.`);
		}

		deletingIds[item.id] = false;
	}

	// Buat URL Kirim Bukti Terima Zakat via WhatsApp (Paket 2)
	function buildWhatsAppReceiptUrl(item: Muzakki): string {
		const orgName = currentOrg?.name || 'Panitia Zakat';
		const amountStr =
			item.zakat_type === 'uang' ? formatRupiah(Number(item.amount)) : `${item.amount} Kg Beras`;
		const dateStr = formatDate(item.created_at);
		const receiptCode = item.id.slice(0, 8).toUpperCase();

		const message = [
			`*BUKTI TERIMA ZAKAT — ${orgName.toUpperCase()}*`,
			`No. Kwitansi: #ZKT-${receiptCode}`,
			`Tanggal: ${dateStr}`,
			`--------------------------------`,
			`Telah diterima zakat dari:`,
			`• *Nama Muzakki:* ${item.name}`,
			`• *Jumlah tanggungan:* ${item.jiwa_count || 1} Jiwa`,
			`• *Jenis & Jumlah:* ${amountStr}`,
			item.notes ? `• *Keterangan:* ${item.notes}` : '',
			`--------------------------------`,
			`*Doa Penerimaan Zakat:*`,
			`_“Ajarakallahu fima a'thaita, wa baraka fima abqaita, wa ja'alahu laka thahuran.”_`,
			`(Semoga Allah memberikan pahala atas apa yang engkau berikan, memberkahi harta yang engkau sisakan, dan menjadikannya penyuci jiwa dan hartamu).`,
			``,
			`Terima kasih,`,
			`*Panitia Amil Zakat ${orgName}*`
		]
			.filter(Boolean)
			.join('\n');

		let cleanPhone = (item.phone || '').replace(/[^0-9]/g, '');
		if (cleanPhone.startsWith('0')) {
			cleanPhone = '62' + cleanPhone.slice(1);
		}

		if (cleanPhone) {
			return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
		}
		return `https://wa.me/?text=${encodeURIComponent(message)}`;
	}

	function formatTime(isoString: string | null): string {
		if (!isoString) return '';
		try {
			return new Date(isoString).toLocaleTimeString('id-ID', {
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return '';
		}
	}

	function formatDate(isoString: string | null): string {
		if (!isoString) return '';
		try {
			return new Date(isoString).toLocaleDateString('id-ID', {
				day: '2-digit',
				month: 'short',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return '';
		}
	}

	function formatRupiah(num: number): string {
		return new Intl.NumberFormat('id-ID', {
			style: 'currency',
			currency: 'IDR',
			maximumFractionDigits: 0
		}).format(num || 0);
	}

	function getZonePicLabel(zoneName: string): string {
		const names = zonePicNamesMap[zoneName];
		if (!names || names.length === 0) return 'Belum ada PIC';
		return names.join(', ');
	}

	// Inisialisasi Sesi & Elysia Native WebSocket dengan Auto-Reconnect (Paket 1)
	onMount(() => {
		const session = getStoredSession();
		if (!session?.token || !session.user) {
			goto('/login');
			return;
		}

		currentUser = session.user;
		currentOrg = session.organization;
		authChecked = true;

		loadData();

		const roomParam =
			session.user.role === 'super_admin'
				? 'global'
				: session.user.organization_id || 'global';

		let ws: WebSocket | null = null;
		let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
		let isDestroyed = false;

		function connectWebSocket() {
			if (isDestroyed) return;
			try {
				ws = new WebSocket(`${WS_BASE_URL}/ws?orgId=${encodeURIComponent(roomParam)}`);

				ws.onopen = () => {
					realtimeConnected = true;
				};

				ws.onmessage = (event) => {
					try {
						const payload = JSON.parse(event.data);
						if (payload.event === 'CONNECTED' || payload.event === 'PONG') return;

						if (payload.event === 'MUSTAHIQ_UPDATED' && payload.data) {
							const updated = payload.data as Mustahiq;
							if (
								currentUser?.role === 'pic' &&
								updated.zone !== currentUser.assigned_zone
							) {
								return;
							}
							const idx = mustahiqList.findIndex((m) => m.id === updated.id);
							if (idx !== -1) {
								mustahiqList[idx] = updated;
							} else {
								mustahiqList = [...mustahiqList, updated].sort((a, b) =>
									a.name.localeCompare(b.name)
								);
							}
							if (currentUser?.role === 'super_admin') loadData();
						} else {
							loadData();
						}
					} catch {
						// ignore malformed message
					}
				};

				ws.onclose = () => {
					realtimeConnected = false;
					if (!isDestroyed) {
						reconnectTimer = setTimeout(connectWebSocket, 3000);
					}
				};
			} catch {
				realtimeConnected = false;
				if (!isDestroyed) {
					reconnectTimer = setTimeout(connectWebSocket, 3000);
				}
			}
		}

		connectWebSocket();

		return () => {
			isDestroyed = true;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			if (ws) ws.close();
		};
	});
</script>

<svelte:head>
	<title>
		{currentOrg ? `${currentOrg.name} — Zakat Tracker` : 'System Management Zakat'}
	</title>
</svelte:head>

{#if !authChecked || !currentUser}
	<div class="bg-tech-grid flex min-h-screen items-center justify-center p-4">
		<div class="flex flex-col items-center gap-2 text-[#003366]">
			<Loader2 class="size-8 animate-spin" />
			<p class="text-xs font-bold">Memuat sesi pengguna...</p>
		</div>
	</div>
{:else}
	<!-- =================================================================== -->
	<!-- KONTAINER RESPONSIVE:                                               -->
	<!-- - Di HP (< lg): max-w-md mx-auto 1 kolom (seperti semula)           -->
	<!-- - Di Laptop/Desktop (lg:): Sidebar Kiri + Konten Kanan max-w-[1440px] -->
	<!-- =================================================================== -->
	<div class="bg-tech-grid min-h-screen w-full text-[#36454F]">
		<div
			class="mx-auto min-h-screen max-w-md bg-white/85 p-4 shadow-[0_0_24px_rgba(0,0,0,0.03)] backdrop-blur-[1px] lg:flex lg:max-w-[1440px] lg:gap-6 lg:bg-transparent lg:p-6 lg:shadow-none"
		>
			<!-- ============================================================= -->
			<!-- SIDEBAR KIRI KHUSUS DESKTOP / LAPTOP (lg:flex)                 -->
			<!-- ============================================================= -->
			<aside
				aria-label="Sidebar Navigasi Desktop"
				class="hidden lg:sticky lg:top-6 lg:flex lg:h-[calc(100vh-3rem)] lg:w-72 lg:shrink-0 lg:flex-col lg:justify-between lg:overflow-y-auto lg:rounded-[10px] lg:border lg:border-[#E0E0E0] lg:bg-white lg:p-4 lg:shadow-[0_2px_16px_rgba(0,0,0,0.06)]"
			>
				<div class="flex flex-col gap-4">
					<!-- Kartu Identitas Lembaga & Role di Sidebar -->
					<div class="rounded-[8px] bg-[#003366] p-4 text-white">
						<div class="flex items-center justify-between gap-1.5">
							<span class="rounded bg-[#00BFFF]/20 px-2 py-0.5 text-[10px] font-bold tracking-wider text-[#00BFFF] uppercase">
								{#if currentUser.role === 'super_admin'}
									Super Admin
								{:else if currentUser.role === 'org_admin'}
									Admin Lembaga
								{:else}
									PIC {currentUser.assigned_zone}
								{/if}
							</span>

							<span
								class="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white"
								title={realtimeConnected ? 'Elysia WebSocket Live' : 'Auto-reconnecting...'}
							>
								<span
									class="h-1.5 w-1.5 rounded-full {realtimeConnected
										? 'bg-[#00FF66]'
										: 'bg-[#FFA500]'}"
								></span>
								{realtimeConnected ? 'Live WS' : 'Reconnecting'}
							</span>
						</div>

						<h1 class="mt-2 text-base leading-snug font-bold text-white">
							{#if currentUser.role === 'super_admin'}
								Owner Platform Zakat
							{:else}
								{currentOrg?.name || 'Lembaga Zakat'}
							{/if}
						</h1>

						{#if currentOrg?.address}
							<p class="mt-0.5 text-[11px] text-white/75">{currentOrg.address}</p>
						{/if}

						<div class="mt-3 border-t border-white/15 pt-2.5 text-xs text-white/90">
							<p class="truncate font-bold">{currentUser.name}</p>
							<p class="text-[11px] text-white/70">@{currentUser.username}</p>
						</div>
					</div>

					<!-- Menu Navigasi Vertikal Sesuai Role -->
					{#if currentUser.role === 'org_admin'}
						<nav aria-label="Menu Utama Lembaga" class="flex flex-col gap-1.5">
							<p class="px-2 text-[10px] font-bold tracking-wider text-[#36454F]/60 uppercase">
								Menu Manajemen Lembaga
							</p>

							<button
								type="button"
								onclick={() => (activeTab = 'distribusi')}
								class="flex items-center justify-between rounded-[8px] px-3 py-2.5 text-left text-xs font-bold transition-all {activeTab ===
								'distribusi'
									? 'bg-[#003366] text-white shadow-sm'
									: 'text-[#36454F] hover:bg-[#F8FAFC]'}"
							>
								<span class="flex items-center gap-2.5">
									<Compass class="size-4 {activeTab === 'distribusi' ? 'text-[#00BFFF]' : 'text-[#003366]'}" />
									<span>Distribusi Tracker</span>
								</span>
								<span
									class="rounded px-1.5 py-0.5 text-[10px] {activeTab === 'distribusi'
										? 'bg-white/20 text-white'
										: 'bg-[#003366]/10 text-[#003366]'}"
								>
									{progressPercent}%
								</span>
							</button>

							<button
								type="button"
								onclick={() => (activeTab = 'mustahiq')}
								class="flex items-center justify-between rounded-[8px] px-3 py-2.5 text-left text-xs font-bold transition-all {activeTab ===
								'mustahiq'
									? 'bg-[#003366] text-white shadow-sm'
									: 'text-[#36454F] hover:bg-[#F8FAFC]'}"
							>
								<span class="flex items-center gap-2.5">
									<Users class="size-4 {activeTab === 'mustahiq' ? 'text-[#00BFFF]' : 'text-[#003366]'}" />
									<span>Data Mustahiq (Penerima)</span>
								</span>
								<span
									class="rounded px-1.5 py-0.5 text-[10px] {activeTab === 'mustahiq'
										? 'bg-white/20 text-white'
										: 'bg-[#003366]/10 text-[#003366]'}"
								>
									{mustahiqList.length}
								</span>
							</button>

							<button
								type="button"
								onclick={() => (activeTab = 'pic')}
								class="flex items-center justify-between rounded-[8px] px-3 py-2.5 text-left text-xs font-bold transition-all {activeTab ===
								'pic'
									? 'bg-[#003366] text-white shadow-sm'
									: 'text-[#36454F] hover:bg-[#F8FAFC]'}"
							>
								<span class="flex items-center gap-2.5">
									<UserCog class="size-4 {activeTab === 'pic' ? 'text-[#00BFFF]' : 'text-[#003366]'}" />
									<span>Akun PIC & Wilayah RT</span>
								</span>
								<span
									class="rounded px-1.5 py-0.5 text-[10px] {activeTab === 'pic'
										? 'bg-white/20 text-white'
										: 'bg-[#003366]/10 text-[#003366]'}"
								>
									{picsList.length} PIC
								</span>
							</button>

							<button
								type="button"
								onclick={() => (activeTab = 'muzakki')}
								class="flex items-center justify-between rounded-[8px] px-3 py-2.5 text-left text-xs font-bold transition-all {activeTab ===
								'muzakki'
									? 'bg-[#003366] text-white shadow-sm'
									: 'text-[#36454F] hover:bg-[#F8FAFC]'}"
							>
								<span class="flex items-center gap-2.5">
									<Wallet class="size-4 {activeTab === 'muzakki' ? 'text-[#00BFFF]' : 'text-[#003366]'}" />
									<span>Data Muzakki & Kwitansi</span>
								</span>
								<span
									class="rounded px-1.5 py-0.5 text-[10px] {activeTab === 'muzakki'
										? 'bg-white/20 text-white'
										: 'bg-[#003366]/10 text-[#003366]'}"
								>
									{muzakkiList.length}
								</span>
							</button>
						</nav>
					{:else if currentUser.role === 'pic'}
						<div class="rounded-[8px] border border-[#003366]/20 bg-[#003366]/5 p-3 text-xs">
							<p class="font-bold text-[#003366]">
								Wilayah Tugas: {currentUser.assigned_zone}
							</p>
							<p class="mt-1 text-[11px] leading-relaxed text-[#36454F]/85">
								Anda hanya menampilkan dan menyalurkan zakat untuk warga di wilayah <strong>{currentUser.assigned_zone}</strong>.
							</p>
						</div>
					{:else}
						<div class="rounded-[8px] border border-[#E0E0E0] bg-[#F8FAFC] p-3 text-xs">
							<p class="font-bold text-[#003366]">Ringkasan Platform Global</p>
							<div class="mt-2 flex flex-col gap-1.5 text-[11px]">
								<div class="flex justify-between">
									<span class="text-[#36454F]/75">Total Lembaga:</span>
									<strong class="text-[#003366]">{organizationsList.length} Tempat</strong>
								</div>
								<div class="flex justify-between">
									<span class="text-[#36454F]/75">Total Akun PIC:</span>
									<strong class="text-[#003366]">{globalPicsTotal} Relawan</strong>
								</div>
								<div class="flex justify-between">
									<span class="text-[#36454F]/75">Penyaluran Global:</span>
									<strong class="text-[#008000]">
										{globalDeliveredTotal} / {globalMustahiqTotal}
									</strong>
								</div>
							</div>
						</div>
					{/if}

					<!-- Ringkasan Kalkulator Kuota di Sidebar Desktop (Untuk Org Admin & PIC) -->
					{#if currentUser.role !== 'super_admin'}
						<div class="rounded-[8px] border border-[#E0E0E0] bg-[#F8FAFC] p-3">
							<div class="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-[#003366] uppercase">
								<Calculator class="size-3.5 text-[#00BFFF]" />
								<span>Kuota / Mustahiq</span>
							</div>

							<div class="flex flex-col gap-2 text-xs">
								<div class="rounded-[6px] border border-[#E0E0E0] bg-white p-2">
									<span class="text-[10px] text-[#36454F]/75">Jatah Uang / Orang</span>
									<p class="font-bold text-[#003366]">
										{formatRupiah(quota.uang_per_mustahiq)}
									</p>
									<p class="text-[10px] text-[#36454F]/65">
										Total: {formatRupiah(quota.total_uang)}
									</p>
								</div>

								<div class="rounded-[6px] border border-[#E0E0E0] bg-white p-2">
									<span class="text-[10px] text-[#36454F]/75">Jatah Beras / Orang</span>
									<p class="font-bold text-[#008000]">{quota.beras_per_mustahiq} Kg</p>
									<p class="text-[10px] text-[#36454F]/65">
										Total: {quota.total_beras} Kg ({totalJiwaMuzakki} Jiwa)
									</p>
								</div>
							</div>
						</div>
					{/if}
				</div>

				<!-- Footer Sidebar Desktop: Tombol Segarkan & Keluar -->
				<div class="mt-4 flex flex-col gap-2 border-t border-[#E0E0E0] pt-3">
					<button
						type="button"
						onclick={loadData}
						class="flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-[8px] border border-[#E0E0E0] bg-[#F8FAFC] px-3 py-2 text-xs font-bold text-[#003366] transition-colors hover:border-[#003366] hover:bg-white"
					>
						<RefreshCw class="size-3.5 {loading ? 'animate-spin' : ''}" />
						<span>Segarkan Data</span>
					</button>

					<button
						type="button"
						onclick={handleLogout}
						class="flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-[8px] border border-red-200 bg-red-50/70 px-3 py-2 text-xs font-bold text-red-700 transition-colors hover:bg-red-600 hover:text-white"
					>
						<LogOut class="size-3.5" />
						<span>Keluar / Ganti Akun</span>
					</button>
				</div>
			</aside>

			<!-- ============================================================= -->
			<!-- AREA KONTEN UTAMA (MOBILE + DESKTOP KANAN)                    -->
			<!-- ============================================================= -->
			<main class="min-w-0 flex-1">
				<!-- HEADER KHUSUS MOBILE (< lg) — Persis Seperti Semula -->
				<header class="mb-3 rounded-[8px] bg-[#003366] p-4 text-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] lg:hidden">
					<div class="flex items-start justify-between gap-2">
						<div class="min-w-0">
							<div class="flex items-center gap-1.5">
								<span class="rounded bg-[#00BFFF]/20 px-2 py-0.5 text-[10px] font-bold tracking-wider text-[#00BFFF] uppercase">
									{#if currentUser.role === 'super_admin'}
										Super Admin (Owner)
									{:else if currentUser.role === 'org_admin'}
										Admin Lembaga
									{:else}
										PIC Wilayah {currentUser.assigned_zone}
									{/if}
								</span>

								<span
									class="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white"
									title={realtimeConnected ? 'Elysia WebSocket Live' : 'Auto-reconnecting...'}
								>
									<span
										class="h-1.5 w-1.5 rounded-full {realtimeConnected
											? 'bg-[#00FF66]'
											: 'bg-[#FFA500]'}"
									></span>
									{realtimeConnected ? 'Live WS' : 'Reconnecting'}
								</span>
							</div>

							<h1 class="mt-1.5 truncate text-lg font-bold tracking-tight text-white">
								{#if currentUser.role === 'super_admin'}
									Manajemen Tempat & Lembaga
								{:else}
									{currentOrg?.name || 'Lembaga Zakat'}
								{/if}
							</h1>

							<p class="mt-0.5 text-xs text-white/80">
								Login: <strong class="text-white">{currentUser.name}</strong>
								({currentUser.username})
							</p>
						</div>

						<button
							type="button"
							onclick={handleLogout}
							class="inline-flex shrink-0 items-center gap-1 rounded-[6px] border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600/80"
							title="Keluar / Ganti Akun"
						>
							<LogOut class="size-3.5" />
							<span>Keluar</span>
						</button>
					</div>

					{#if currentUser.role !== 'super_admin'}
						<div class="mt-3.5 border-t border-white/15 pt-3">
							<div class="mb-1.5 flex items-center justify-between text-xs">
								<span class="text-white/85">
									{#if currentUser.role === 'pic'}
										Progres Wilayah Tugas ({currentUser.assigned_zone})
									{:else}
										Progres Penyaluran ({selectedZone})
									{/if}
								</span>
								<span class="font-bold text-[#00BFFF]">
									{deliveredCount} / {totalCount} Selesai ({progressPercent}%)
								</span>
							</div>
							<div class="h-2 w-full overflow-hidden rounded-full bg-white/15">
								<div
									class="h-full rounded-full bg-[#00BFFF] transition-all duration-200"
									style="width: {progressPercent}%"
								></div>
							</div>

							<div class="mt-3 grid grid-cols-3 gap-2 text-center">
								<div class="rounded-[6px] bg-white/10 px-2 py-1.5">
									<div class="text-[11px] text-white/75">Mustahiq</div>
									<div class="text-sm font-bold text-white">{totalCount}</div>
								</div>
								<div class="rounded-[6px] bg-white/10 px-2 py-1.5">
									<div class="text-[11px] text-[#FFA500]">Pending</div>
									<div class="text-sm font-bold text-white">{pendingCount}</div>
								</div>
								<div class="rounded-[6px] bg-white/10 px-2 py-1.5">
									<div class="text-[11px] text-[#4ADE80]">Delivered</div>
									<div class="text-sm font-bold text-white">{deliveredCount}</div>
								</div>
							</div>
						</div>
					{/if}
				</header>

				<!-- TOP BAR KHUSUS DESKTOP (lg:flex) — Progres + Switcher Grid Kartu vs Tabel Baris -->
				<div
					class="mb-5 hidden lg:flex lg:items-center lg:justify-between lg:gap-4 lg:rounded-[10px] lg:border lg:border-[#E0E0E0] lg:bg-white lg:px-5 lg:py-4 lg:shadow-[0_2px_12px_rgba(0,0,0,0.04)]"
				>
					<div class="min-w-0">
						<h2 class="text-lg font-bold text-[#003366]">
							{#if currentUser.role === 'super_admin'}
								Dashboard Owner — Manajemen Multi-Lembaga
							{:else if currentUser.role === 'pic'}
								Dashboard Penyaluran Lapangan — Wilayah {currentUser.assigned_zone}
							{:else if activeTab === 'distribusi'}
								Monitoring & Penyaluran Zakat ({selectedZone})
							{:else if activeTab === 'mustahiq'}
								Manajemen Data Mustahiq (Penerima Zakat)
							{:else if activeTab === 'pic'}
								Manajemen Wilayah RT & Akun Login PIC
							{:else}
								Penerimaan Zakat Muzakki & Cetak Kwitansi
							{/if}
						</h2>
						<p class="mt-0.5 text-xs text-[#36454F]/75">
							{#if currentUser.role === 'super_admin'}
								Kelola seluruh tempat distribusi zakat (Masjid, Musholla, Karang Taruna) beserta akun pengurusnya.
							{:else}
								Sinkronisasi real-time aktif untuk <strong>{currentOrg?.name}</strong> — perubahan dari HP relawan langsung tampil di layar ini.
							{/if}
						</p>
					</div>

					<div class="flex shrink-0 items-center gap-4">
						{#if currentUser.role !== 'super_admin'}
							<!-- Ringkasan Cepat Angka Distribusi di Desktop Header -->
							<div class="flex items-center gap-2 rounded-[8px] border border-[#E0E0E0] bg-[#F8FAFC] px-3 py-1.5 text-xs">
								<span class="font-medium text-[#36454F]/80">Total: <strong>{totalCount}</strong></span>
								<span class="text-[#C0C0C0]">|</span>
								<span class="font-bold text-[#FFA500]">Pending: {pendingCount}</span>
								<span class="text-[#C0C0C0]">|</span>
								<span class="font-bold text-[#008000]">
									Selesai: {deliveredCount} ({progressPercent}%)
								</span>
							</div>
						{/if}

						<!-- Toggle Tampilan Desktop: Grid Kartu vs Tabel Baris (Compact Table) -->
						<div
							class="inline-flex items-center rounded-[8px] border border-[#E0E0E0] bg-[#F8FAFC] p-1"
							role="group"
							aria-label="Pilih Tampilan Data Desktop"
						>
							<button
								type="button"
								onclick={() => (desktopViewMode = 'grid')}
								class="inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-xs font-bold transition-all {desktopViewMode ===
								'grid'
									? 'bg-[#003366] text-white shadow-xs'
									: 'text-[#36454F] hover:text-[#003366]'}"
							>
								<LayoutGrid class="size-3.5" />
								<span>Grid Kartu</span>
							</button>

							<button
								type="button"
								onclick={() => (desktopViewMode = 'table')}
								class="inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-xs font-bold transition-all {desktopViewMode ===
								'table'
									? 'bg-[#003366] text-white shadow-xs'
									: 'text-[#36454F] hover:text-[#003366]'}"
							>
								<Table2 class="size-3.5" />
								<span>Tabel Baris</span>
							</button>
						</div>
					</div>
				</div>

				<!-- Notifikasi Sukses & Error -->
				{#if successMessage}
					<div
						role="status"
						class="mb-4 flex items-center justify-between rounded-[8px] border border-[#008000]/30 bg-[#008000]/10 px-3.5 py-2.5 text-xs font-medium text-[#008000]"
					>
						<span>{successMessage}</span>
						<button
							type="button"
							onclick={() => (successMessage = null)}
							class="ml-2 text-[#008000]"
						>
							<X class="size-3.5" />
						</button>
					</div>
				{/if}

				{#if errorMessage}
					<div
						role="alert"
						class="mb-4 flex items-center justify-between rounded-[8px] border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800"
					>
						<span>{errorMessage}</span>
						<button
							type="button"
							onclick={() => (errorMessage = null)}
							class="ml-2 text-red-800"
						>
							<X class="size-3.5" />
						</button>
					</div>
				{/if}

				<!-- ========================================================= -->
				<!-- VIEW 1: ROLE SUPER_ADMIN (OWNER PLATFORM)                 -->
				<!-- ========================================================= -->
				{#if currentUser.role === 'super_admin'}
					<div class="flex flex-col gap-4 pb-8">
						<!-- Ringkasan Global (Mobile 2 kolom, Desktop 3 kolom) -->
						<div class="grid grid-cols-2 gap-2.5 lg:grid-cols-3 lg:gap-4">
							<div class="rounded-[8px] border border-[#E0E0E0] bg-white p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
								<p class="text-[11px] font-medium text-[#36454F]/75">Total Tempat / Lembaga</p>
								<p class="mt-0.5 text-xl font-bold text-[#003366]">
									{organizationsList.length} Lembaga
								</p>
							</div>
							<div class="rounded-[8px] border border-[#E0E0E0] bg-white p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
								<p class="text-[11px] font-medium text-[#36454F]/75">Total Penerima Global</p>
								<p class="mt-0.5 text-xl font-bold text-[#008000]">
									{globalDeliveredTotal} / {globalMustahiqTotal} Selesai
								</p>
							</div>
							<div class="col-span-2 hidden rounded-[8px] border border-[#E0E0E0] bg-white p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.06)] lg:col-span-1 lg:block">
								<p class="text-[11px] font-medium text-[#36454F]/75">Total Relawan PIC Aktif</p>
								<p class="mt-0.5 text-xl font-bold text-[#003366]">
									{globalPicsTotal} Akun PIC
								</p>
							</div>
						</div>

						<!-- Split Layout di Desktop: Kiri Form Tambah Lembaga (4 col), Kanan Daftar Lembaga (8 col) -->
						<div class="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
							<!-- Form Tambah Tempat / Masjid Baru + Akun Admin -->
							<section
								class="rounded-[8px] border border-[#E0E0E0] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] lg:sticky lg:top-6 lg:col-span-4"
							>
								<div class="mb-3 flex items-center gap-2">
									<Building2 class="size-4 text-[#003366]" />
									<h2 class="text-sm font-bold text-[#003366]">
										+ Daftarkan Masjid / Lembaga Baru
									</h2>
								</div>

								<form onsubmit={handleCreateOrganization} class="flex flex-col gap-3">
									<div>
										<label for="org-name" class="mb-1 block text-xs font-bold text-[#36454F]">
											Nama Masjid / Karang Taruna / Lembaga
										</label>
										<Input
											id="org-name"
											type="text"
											required
											bind:value={formOrgName}
											placeholder="Contoh: Masjid Al-Ikhlas"
											class="min-h-[40px] text-sm"
										/>
									</div>

									<div class="grid grid-cols-2 gap-2">
										<div>
											<label for="org-type" class="mb-1 block text-xs font-bold text-[#36454F]">
												Kategori
											</label>
											<select
												id="org-type"
												bind:value={formOrgType}
												class="min-h-[40px] w-full rounded-[8px] border border-[#C0C0C0] bg-white px-2.5 py-2 text-xs font-medium text-[#36454F]"
											>
												<option value="masjid">Masjid / Musholla</option>
												<option value="karang_taruna">Karang Taruna / RW</option>
												<option value="lembaga">Yayasan / Lembaga</option>
											</select>
										</div>

										<div>
											<label for="org-address" class="mb-1 block text-xs font-bold text-[#36454F]">
												Alamat Singkat
											</label>
											<Input
												id="org-address"
												type="text"
												required
												bind:value={formOrgAddress}
												placeholder="Jl. Mawar No. 5"
												class="min-h-[40px] text-xs"
											/>
										</div>
									</div>

									<div class="mt-1 rounded-[6px] border border-[#003366]/20 bg-[#003366]/5 p-3">
										<p class="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#003366]">
											<KeyRound class="size-3.5" />
											<span>Buat Akun Login Pengurus / Admin Tempat Ini</span>
										</p>

										<div class="flex flex-col gap-2.5">
											<Input
												type="text"
												required
												bind:value={formOrgAdminName}
												placeholder="Nama Pengurus (mis: Bpk. H. Ridwan)"
												class="h-9 bg-white text-xs"
											/>
											<div class="grid grid-cols-2 gap-2">
												<Input
													type="text"
													required
													bind:value={formOrgAdminUsername}
													placeholder="Username Login (mis: alikhlas)"
													class="h-9 bg-white text-xs"
												/>
												<Input
													type="text"
													required
													bind:value={formOrgAdminPassword}
													placeholder="Password Login"
													class="h-9 bg-white text-xs"
												/>
											</div>
										</div>
									</div>

									<Button
										type="submit"
										disabled={submittingOrg}
										class="min-h-[44px] w-full rounded-[8px] bg-[#003366] text-sm font-bold text-white hover:bg-[#00BFFF] hover:text-[#003366]"
									>
										{#if submittingOrg}
											<Loader2 class="mr-2 size-4 animate-spin" />
											<span>Menyimpan...</span>
										{:else}
											<Plus class="mr-2 size-4" />
											<span>Buat Lembaga & Akun Admin</span>
										{/if}
									</Button>
								</form>
							</section>

							<!-- Daftar Tempat / Lembaga Terdaftar -->
							<section class="flex flex-col gap-3 lg:col-span-8">
								<div class="flex items-center justify-between">
									<h2 class="text-xs font-bold tracking-wide text-[#003366] uppercase">
										Daftar Tempat Distribusi ({organizationsList.length})
									</h2>
									<button
										type="button"
										onclick={loadData}
										class="inline-flex items-center gap-1 text-xs font-medium text-[#003366]"
									>
										<RefreshCw class="size-3.5 {loading ? 'animate-spin' : ''}" />
										<span>Segarkan</span>
									</button>
								</div>

								<!-- TAMPILAN TABEL BARIS KHUSUS DESKTOP (Saat desktopViewMode === 'table') -->
								{#if desktopViewMode === 'table'}
									<div class="hidden overflow-hidden rounded-[8px] border border-[#E0E0E0] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] lg:block">
										<table class="w-full border-collapse text-left text-xs">
											<thead>
												<tr class="border-b border-[#E0E0E0] bg-[#003366] text-[11px] font-bold text-white uppercase">
													<th class="px-4 py-3">Nama Lembaga & Alamat</th>
													<th class="px-3 py-3 text-center">Progres Mustahiq</th>
													<th class="px-3 py-3 text-center">Akun PIC</th>
													<th class="px-3 py-3">Zakat Terkumpul</th>
													<th class="px-4 py-3">Akun Pengurus (Admin)</th>
													<th class="px-3 py-3 text-right">Aksi</th>
												</tr>
											</thead>
											<tbody class="divide-y divide-[#E0E0E0]">
												{#each organizationsList as org (org.id)}
													<tr class="align-top transition-colors hover:bg-[#F8FAFC]">
														<td class="px-4 py-3">
															<span class="rounded bg-[#003366]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#003366] uppercase">
																{org.type.replace('_', ' ')}
															</span>
															<p class="mt-1 text-sm font-bold text-[#003366]">{org.name}</p>
															<p class="text-[11px] text-[#36454F]/75">{org.address}</p>
														</td>
														<td class="px-3 py-3 text-center">
															<span class="inline-flex rounded-full bg-[#008000]/10 px-2.5 py-1 font-bold text-[#008000]">
																{org.delivered_count} / {org.mustahiq_count}
															</span>
														</td>
														<td class="px-3 py-3 text-center font-bold text-[#003366]">
															{org.pics_count} PIC
														</td>
														<td class="px-3 py-3">
															<p class="font-bold text-[#003366]">{formatRupiah(org.quota.total_uang)}</p>
															<p class="text-[11px] font-medium text-[#008000]">{org.quota.total_beras} Kg Beras</p>
														</td>
														<td class="px-4 py-3">
															<div class="flex flex-wrap gap-1">
																{#each org.admins as adm (adm.id)}
																	<span class="inline-flex items-center gap-1 rounded border border-[#E0E0E0] bg-[#FAFAFA] px-2 py-0.5 text-[11px]">
																		<strong>{adm.name}</strong>
																		<code class="text-[#003366]">@{adm.username}</code>
																	</span>
																{/each}
															</div>
															<button
																type="button"
																onclick={() =>
																	(addingAdminForOrgId =
																		addingAdminForOrgId === org.id ? null : org.id)}
																class="mt-1.5 text-[11px] font-bold text-[#003366] hover:underline"
															>
																+ Tambah Admin
															</button>

															{#if addingAdminForOrgId === org.id}
																<form
																	onsubmit={(e) => handleAddExtraAdmin(org.id, e)}
																	class="mt-2 flex flex-col gap-1.5 rounded border border-[#E0E0E0] bg-[#FAFAFA] p-2"
																>
																	<Input
																		type="text"
																		required
																		bind:value={extraAdminName}
																		placeholder="Nama Pengurus"
																		class="h-7 bg-white text-xs"
																	/>
																	<div class="grid grid-cols-2 gap-1.5">
																		<Input
																			type="text"
																			required
																			bind:value={extraAdminUsername}
																			placeholder="Username"
																			class="h-7 bg-white text-xs"
																		/>
																		<Input
																			type="text"
																			required
																			bind:value={extraAdminPassword}
																			placeholder="Password"
																			class="h-7 bg-white text-xs"
																		/>
																	</div>
																	<Button type="submit" class="h-7 bg-[#003366] text-[11px] font-bold text-white">
																		Simpan
																	</Button>
																</form>
															{/if}
														</td>
														<td class="px-3 py-3 text-right">
															<button
																type="button"
																onclick={() => handleDeleteOrganization(org)}
																class="inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-red-200 text-red-600 hover:bg-red-50"
																title="Hapus Lembaga"
															>
																<Trash2 class="size-3.5" />
															</button>
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								{/if}

								<!-- TAMPILAN GRID KARTU (Selalu tampil di HP, dan tampil di Desktop saat desktopViewMode === 'grid') -->
								<div
									class="grid grid-cols-1 gap-3 {desktopViewMode === 'table'
										? 'lg:hidden'
										: 'lg:grid-cols-2 lg:gap-4'}"
								>
									{#each organizationsList as org (org.id)}
										<Card class="rounded-[8px] border border-[#E0E0E0] bg-white py-0 shadow-[0_2px_12px_rgba(0,0,0,0.06)] ring-0">
											<CardHeader class="flex flex-row items-start justify-between gap-2 px-4 pt-4 pb-2">
												<div>
													<span class="rounded bg-[#003366]/10 px-2 py-0.5 text-[10px] font-bold text-[#003366] uppercase">
														{org.type.replace('_', ' ')}
													</span>
													<CardTitle class="mt-1 text-base font-bold text-[#003366]">
														{org.name}
													</CardTitle>
													<p class="mt-0.5 text-xs text-[#36454F]/80">{org.address}</p>
												</div>

												<button
													type="button"
													onclick={() => handleDeleteOrganization(org)}
													class="inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-red-200 text-red-600 hover:bg-red-50"
													title="Hapus Lembaga"
												>
													<Trash2 class="size-3.5" />
												</button>
											</CardHeader>

											<CardContent class="px-4 py-2 text-xs">
												<div class="grid grid-cols-3 gap-2 rounded-[6px] bg-[#F8FAFC] p-2.5 text-center">
													<div>
														<p class="text-[10px] text-[#36454F]/70">Penyaluran</p>
														<p class="font-bold text-[#008000]">
															{org.delivered_count} / {org.mustahiq_count}
														</p>
													</div>
													<div>
														<p class="text-[10px] text-[#36454F]/70">Jumlah PIC</p>
														<p class="font-bold text-[#003366]">{org.pics_count} Akun</p>
													</div>
													<div>
														<p class="text-[10px] text-[#36454F]/70">Zakat Terkumpul</p>
														<p class="font-bold text-[#36454F]">
															{org.quota.total_beras} Kg
														</p>
													</div>
												</div>

												<div class="mt-3">
													<div class="mb-1.5 flex items-center justify-between">
														<span class="font-bold text-[#36454F]">
															Akun Login Pengurus ({org.admins.length}):
														</span>
														<button
															type="button"
															onclick={() =>
																(addingAdminForOrgId =
																	addingAdminForOrgId === org.id ? null : org.id)}
															class="text-[11px] font-bold text-[#003366] hover:underline"
														>
															+ Tambah Admin
														</button>
													</div>

													<div class="flex flex-wrap gap-1.5">
														{#each org.admins as adm (adm.id)}
															<span class="inline-flex items-center gap-1 rounded border border-[#E0E0E0] bg-white px-2 py-1 text-[11px]">
																<ShieldCheck class="size-3 text-[#008000]" />
																<strong>{adm.name}</strong>
																<code class="rounded bg-[#003366]/10 px-1 text-[#003366]">
																	@{adm.username}
																</code>
															</span>
														{/each}
													</div>

													{#if addingAdminForOrgId === org.id}
														<form
															onsubmit={(e) => handleAddExtraAdmin(org.id, e)}
															class="mt-2.5 flex flex-col gap-2 rounded border border-[#E0E0E0] bg-[#FAFAFA] p-2.5"
														>
															<Input
																type="text"
																required
																bind:value={extraAdminName}
																placeholder="Nama Pengurus Baru"
																class="h-8 bg-white text-xs"
															/>
															<div class="grid grid-cols-2 gap-2">
																<Input
																	type="text"
																	required
																	bind:value={extraAdminUsername}
																	placeholder="Username"
																	class="h-8 bg-white text-xs"
																/>
																<Input
																	type="text"
																	required
																	bind:value={extraAdminPassword}
																	placeholder="Password"
																	class="h-8 bg-white text-xs"
																/>
															</div>
															<Button
																type="submit"
																class="h-8 bg-[#003366] text-xs font-bold text-white"
															>
																Simpan Akun Admin
															</Button>
														</form>
													{/if}
												</div>
											</CardContent>
										</Card>
									{/each}
								</div>
							</section>
						</div>
					</div>

				<!-- ========================================================= -->
				<!-- VIEW 2: ROLE ORG_ADMIN & PIC (DALAM LEMBAGA/MASJID)       -->
				<!-- ========================================================= -->
				{:else}
					<!-- Kartu Kalkulator Kuota Zakat Otomatis (Tampil di Mobile, di Desktop sudah ada di Sidebar namun tetap ada ringkasan bar) -->
					<section
						aria-label="Kalkulator Kuota Distribusi"
						class="mb-3 rounded-[8px] border border-[#003366]/20 bg-white p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.06)] lg:hidden"
					>
						<div class="mb-2 flex items-center justify-between">
							<div class="flex items-center gap-1.5 text-xs font-bold text-[#003366] uppercase">
								<Calculator class="size-4 text-[#00BFFF]" />
								<span>Kalkulasi Kuota Zakat ({currentOrg?.name})</span>
							</div>
							<span class="text-[11px] font-medium text-[#36454F]/75">
								{quota.total_mustahiq} Mustahiq • {totalJiwaMuzakki} Jiwa Muzakki
							</span>
						</div>

						<div class="grid grid-cols-2 gap-2.5">
							<div class="rounded-[6px] border border-[#E0E0E0] bg-[#F8FAFC] p-2.5">
								<div class="flex items-center gap-1 text-[11px] font-medium text-[#36454F]/80">
									<Wallet class="size-3.5 text-[#003366]" />
									<span>Jatah Uang / Mustahiq</span>
								</div>
								<p class="mt-1 text-sm font-bold text-[#003366]">
									{formatRupiah(quota.uang_per_mustahiq)}
								</p>
								<p class="text-[10px] text-[#36454F]/70">
									Dari total {formatRupiah(quota.total_uang)}
								</p>
							</div>

							<div class="rounded-[6px] border border-[#E0E0E0] bg-[#F8FAFC] p-2.5">
								<div class="flex items-center gap-1 text-[11px] font-medium text-[#36454F]/80">
									<Wheat class="size-3.5 text-[#FFA500]" />
									<span>Jatah Beras / Mustahiq</span>
								</div>
								<p class="mt-1 text-sm font-bold text-[#008000]">
									{quota.beras_per_mustahiq} Kg
								</p>
								<p class="text-[10px] text-[#36454F]/70">
									Dari total {quota.total_beras} Kg beras
								</p>
							</div>
						</div>
					</section>

					<!-- Jika Role === 'pic': Banner Informasi Pembatasan Wilayah Ketat (Opsi B) -->
					{#if currentUser.role === 'pic'}
						<div class="mb-3 rounded-[8px] border border-[#003366]/25 bg-[#003366]/5 p-3 text-xs lg:mb-4">
							<div class="flex items-center justify-between">
								<span class="font-bold text-[#003366]">
									Mode Tugas Lapangan — Wilayah Khusus: {currentUser.assigned_zone}
								</span>
								<button
									type="button"
									onclick={loadData}
									class="inline-flex items-center gap-1 text-[11px] font-bold text-[#003366]"
								>
									<RefreshCw class="size-3 {loading ? 'animate-spin' : ''}" />
									<span>Segarkan</span>
								</button>
							</div>
							<p class="mt-1 text-[11px] text-[#36454F]/85">
								Anda masuk sebagai <strong>{currentUser.name}</strong>. Setiap item yang Anda tandai selesai akan otomatis mencatat nama Anda sebagai penyalur.
							</p>
						</div>
					{/if}

					<!-- Navigasi 4 Tab Horizontal Khusus Mobile (< lg) untuk ORG_ADMIN -->
					{#if currentUser.role === 'org_admin'}
						<nav
							aria-label="Navigasi Admin Lembaga Mobile"
							class="mb-4 grid grid-cols-4 gap-1 rounded-[8px] border border-[#E0E0E0] bg-white p-1 shadow-[0_2px_12px_rgba(0,0,0,0.06)] lg:hidden"
						>
							<button
								type="button"
								onclick={() => (activeTab = 'distribusi')}
								class="flex min-h-[40px] flex-col items-center justify-center rounded-[6px] px-1 py-1 text-[11px] font-bold transition-all {activeTab ===
								'distribusi'
									? 'bg-[#003366] text-white'
									: 'text-[#36454F] hover:bg-[#F8FAFC]'}"
							>
								<span>Distribusi</span>
								<span class="text-[9px] font-normal opacity-80">Tracker</span>
							</button>

							<button
								type="button"
								onclick={() => (activeTab = 'mustahiq')}
								class="flex min-h-[40px] flex-col items-center justify-center rounded-[6px] px-1 py-1 text-[11px] font-bold transition-all {activeTab ===
								'mustahiq'
									? 'bg-[#003366] text-white'
									: 'text-[#36454F] hover:bg-[#F8FAFC]'}"
							>
								<span>Mustahiq</span>
								<span class="text-[9px] font-normal opacity-80">Penerima ({mustahiqList.length})</span>
							</button>

							<button
								type="button"
								onclick={() => (activeTab = 'pic')}
								class="flex min-h-[40px] flex-col items-center justify-center rounded-[6px] px-1 py-1 text-[11px] font-bold transition-all {activeTab ===
								'pic'
									? 'bg-[#003366] text-white'
									: 'text-[#36454F] hover:bg-[#F8FAFC]'}"
							>
								<span>Akun PIC</span>
								<span class="text-[9px] font-normal opacity-80">& Wilayah ({picsList.length})</span>
							</button>

							<button
								type="button"
								onclick={() => (activeTab = 'muzakki')}
								class="flex min-h-[40px] flex-col items-center justify-center rounded-[6px] px-1 py-1 text-[11px] font-bold transition-all {activeTab ===
								'muzakki'
									? 'bg-[#003366] text-white'
									: 'text-[#36454F] hover:bg-[#F8FAFC]'}"
							>
								<span>Muzakki</span>
								<span class="text-[9px] font-normal opacity-80">Pemberi ({muzakkiList.length})</span>
							</button>
						</nav>
					{/if}

					<!-- ===================================================== -->
					<!-- TAB 1 (ATAU TAMPILAN UTAMA PIC): DISTRIBUSI LAPANGAN  -->
					<!-- ===================================================== -->
					{#if currentUser.role === 'pic' || activeTab === 'distribusi'}
						<!-- Panel Search Bar & Filter Status + Wilayah (Responsive di Mobile & Desktop) -->
						<section
							aria-label="Pencarian dan Filter Distribusi"
							class="mb-4 rounded-[8px] border border-[#E0E0E0] bg-white p-3 lg:p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
						>
							<div class="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
								<!-- 1. Kolom Search Nama / Alamat Warga -->
								<div class="relative flex-1">
									<Search class="pointer-events-none absolute top-2.5 left-3 size-4 text-[#36454F]/60" />
									<Input
										type="text"
										bind:value={searchQuery}
										placeholder="Cari nama warga, alamat, RT, atau isi catatan penyaluran..."
										class="h-9 pr-8 pl-9 text-xs"
									/>
									{#if searchQuery}
										<button
											type="button"
											onclick={() => (searchQuery = '')}
											class="absolute top-2.5 right-2.5 text-[#36454F]/60 hover:text-[#003366]"
											title="Hapus pencarian"
										>
											<X class="size-4" />
										</button>
									{/if}
								</div>

								<!-- 2. Filter Status Cepat (Semua | Pending | Selesai) -->
								<div class="grid grid-cols-3 gap-1.5 lg:w-80 lg:shrink-0">
									<button
										type="button"
										onclick={() => (selectedStatusFilter = 'all')}
										class="min-h-[34px] rounded-[6px] border px-2.5 py-1 text-[11px] font-bold transition-all {selectedStatusFilter ===
										'all'
											? 'border-[#003366] bg-[#003366] text-white'
											: 'border-[#E0E0E0] bg-[#F8FAFC] text-[#36454F]'}"
									>
										Semua ({totalCount})
									</button>
									<button
										type="button"
										onclick={() => (selectedStatusFilter = 'pending')}
										class="min-h-[34px] rounded-[6px] border px-2.5 py-1 text-[11px] font-bold transition-all {selectedStatusFilter ===
										'pending'
											? 'border-[#FFA500] bg-[#FFA500] text-white'
											: 'border-[#E0E0E0] bg-[#F8FAFC] text-[#36454F]'}"
									>
										Pending ({pendingCount})
									</button>
									<button
										type="button"
										onclick={() => (selectedStatusFilter = 'delivered')}
										class="min-h-[34px] rounded-[6px] border px-2.5 py-1 text-[11px] font-bold transition-all {selectedStatusFilter ===
										'delivered'
											? 'border-[#008000] bg-[#008000] text-white'
											: 'border-[#E0E0E0] bg-[#F8FAFC] text-[#36454F]'}"
									>
										Selesai ({deliveredCount})
									</button>
								</div>
							</div>

							<!-- 3. Filter Wilayah hanya untuk Admin Lembaga -->
							{#if currentUser.role === 'org_admin'}
								<div class="mt-2.5 border-t border-[#E0E0E0] pt-2.5">
									<div class="mb-1.5 flex items-center justify-between">
										<div class="flex items-center gap-1 text-[11px] font-bold text-[#003366] uppercase">
											<Filter class="size-3" />
											<span>Filter Wilayah / RT</span>
										</div>
										<button
											type="button"
											onclick={loadData}
											class="inline-flex items-center gap-1 text-[11px] font-medium text-[#003366] lg:hidden"
										>
											<RefreshCw class="size-3 {loading ? 'animate-spin' : ''}" />
											<span>Segarkan</span>
										</button>
									</div>

									<div class="flex flex-wrap gap-1.5">
										{#each filterZones as zone (zone)}
											{@const isActive = selectedZone === zone}
											<button
												type="button"
												onclick={() => (selectedZone = zone)}
												class="min-h-[30px] rounded-[6px] border px-2.5 py-1 text-[11px] font-medium transition-all {isActive
													? 'border-[#003366] bg-[#003366] text-white'
													: 'border-[#E0E0E0] bg-[#F8FAFC] text-[#36454F] hover:border-[#00BFFF]'}"
											>
												{#if zone === 'Semua'}
													Semua RT
												{:else}
													<span>{zone}</span>
													<span class="ml-1 opacity-75">({getZonePicLabel(zone)})</span>
												{/if}
											</button>
										{/each}
									</div>
								</div>
							{/if}
						</section>

						<!-- Daftar Mustahiq (Mendukung Grid Kartu & Tabel Baris di Desktop) -->
						<section aria-label="Daftar Mustahiq" class="pb-8">
							{#if loading && mustahiqList.length === 0}
								<div
									class="flex flex-col items-center justify-center rounded-[8px] border border-[#E0E0E0] bg-white py-12 text-center shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
								>
									<Loader2 class="mb-2 size-7 animate-spin text-[#003366]" />
									<p class="text-sm font-medium text-[#36454F]">Memuat daftar penerima zakat...</p>
								</div>
							{:else if filteredMustahiq.length === 0}
								<div
									class="flex flex-col items-center justify-center rounded-[8px] border border-[#E0E0E0] bg-white px-4 py-10 text-center shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
								>
									<Radio class="mb-2 size-7 text-[#C0C0C0]" />
									<p class="text-sm font-bold text-[#003366]">Tidak Ada Data yang Cocok</p>
									<p class="mt-1 text-xs text-[#36454F]/80">
										Coba ubah kata kunci pencarian atau filter status di atas.
									</p>
								</div>
							{:else}
								<!-- MODE TABEL BARIS KHUSUS DESKTOP (Saat desktopViewMode === 'table') -->
								{#if desktopViewMode === 'table'}
									<div class="hidden overflow-hidden rounded-[8px] border border-[#E0E0E0] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] lg:block">
										<table class="w-full border-collapse text-left text-xs">
											<thead>
												<tr class="border-b border-[#E0E0E0] bg-[#003366] text-[11px] font-bold text-white uppercase">
													<th class="px-4 py-3">Nama Penerima & Alamat</th>
													<th class="px-3 py-3">Wilayah & PIC</th>
													<th class="px-3 py-3 text-center">Status</th>
													<th class="px-4 py-3">Catatan Penyerahan / Info Penyalur</th>
													<th class="px-4 py-3 text-right">Aksi Penyaluran</th>
												</tr>
											</thead>
											<tbody class="divide-y divide-[#E0E0E0]">
												{#each filteredMustahiq as item (item.id)}
													{@const isDelivered = item.status === 'delivered'}
													{@const isUpdating = Boolean(updatingIds[item.id])}
													<tr class="align-middle transition-colors hover:bg-[#F8FAFC]">
														<td class="px-4 py-3">
															<p class="text-sm font-bold text-[#36454F]">{item.name}</p>
															<p class="mt-0.5 flex items-center gap-1 text-[11px] text-[#36454F]/80">
																<MapPin class="size-3 shrink-0 text-[#003366]" />
																<span>{item.address}</span>
															</p>
														</td>
														<td class="px-3 py-3">
															<span class="inline-flex items-center gap-1 rounded bg-[#003366]/10 px-2 py-0.5 font-bold text-[#003366]">
																{item.zone}
															</span>
															<p class="mt-1 text-[11px] text-[#36454F]/80">
																PIC: <strong>{getZonePicLabel(item.zone)}</strong>
															</p>
														</td>
														<td class="px-3 py-3 text-center">
															{#if isDelivered}
																<Badge class="gap-1 rounded-[6px] border-transparent bg-[#008000] px-2.5 py-0.5 text-[11px] font-bold text-white">
																	<CheckCircle2 class="size-3" />
																	<span>Delivered</span>
																</Badge>
															{:else}
																<Badge class="gap-1 rounded-[6px] border-transparent bg-[#FFA500] px-2.5 py-0.5 text-[11px] font-bold text-white">
																	<Clock class="size-3" />
																	<span>Pending</span>
																</Badge>
															{/if}
														</td>
														<td class="px-4 py-3">
															{#if !isDelivered}
																<div class="flex flex-col gap-1">
																	<input
																		type="text"
																		bind:value={deliveryNotes[item.id]}
																		placeholder="Catatan opsional (mis: Diterima langsung)..."
																		class="h-8 w-full rounded border border-[#C0C0C0] bg-white px-2.5 text-xs text-[#36454F] focus:border-[#003366] focus:outline-none"
																	/>
																	<div class="flex flex-wrap gap-1">
																		{#each ['Diterima langsung', 'Diwakilkan keluarga', 'Titip Ketua RT'] as preset (preset)}
																			<button
																				type="button"
																				onclick={() => (deliveryNotes[item.id] = preset)}
																				class="rounded border border-[#E0E0E0] bg-[#F8FAFC] px-1.5 py-0.5 text-[10px] text-[#36454F] hover:border-[#003366] hover:text-[#003366]"
																			>
																				+ {preset}
																			</button>
																		{/each}
																	</div>
																</div>
															{:else}
																<div class="text-xs">
																	<p class="font-bold text-[#008000]">
																		Oleh: {item.delivered_by || 'Relawan'}
																		{#if item.delivered_at}
																			<span class="font-normal text-[#36454F]/70">
																				({formatTime(item.delivered_at)})
																			</span>
																		{/if}
																	</p>
																	{#if item.delivery_note}
																		<p class="mt-0.5 rounded bg-[#008000]/10 px-2 py-0.5 text-[11px] font-medium text-[#003366]">
																			"{item.delivery_note}"
																		</p>
																	{/if}
																</div>
															{/if}
														</td>
														<td class="px-4 py-3 text-right">
															{#if !isDelivered}
																<Button
																	type="button"
																	disabled={isUpdating}
																	onclick={() => markAsDelivered(item)}
																	class="h-9 rounded-[6px] bg-[#003366] px-3 text-xs font-bold text-white hover:bg-[#00BFFF] hover:text-[#003366]"
																>
																	{#if isUpdating}
																		<Loader2 class="mr-1.5 size-3.5 animate-spin" />
																		<span>Proses...</span>
																	{:else}
																		<CheckCircle2 class="mr-1.5 size-3.5" />
																		<span>Tandai Selesai</span>
																	{/if}
																</Button>
															{:else}
																<button
																	type="button"
																	disabled={isUpdating}
																	onclick={() => revertToPending(item)}
																	class="inline-flex items-center gap-1 rounded-[6px] border border-[#C0C0C0] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#36454F] hover:border-[#FFA500] hover:text-[#003366]"
																>
																	<RotateCcw class="size-3" />
																	<span>Batal</span>
																</button>
															{/if}
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								{/if}

								<!-- MODE GRID KARTU (Selalu tampil di HP, dan tampil di Desktop 2-3 kolom saat desktopViewMode === 'grid') -->
								<div
									class="grid grid-cols-1 gap-3 {desktopViewMode === 'table'
										? 'lg:hidden'
										: 'lg:grid-cols-2 xl:grid-cols-3 lg:gap-4'}"
								>
									{#each filteredMustahiq as item (item.id)}
										{@const isDelivered = item.status === 'delivered'}
										{@const isUpdating = Boolean(updatingIds[item.id])}

										<Card
											class="flex flex-col justify-between rounded-[8px] border border-[#E0E0E0] bg-[#FFFFFF] py-0 shadow-[0_2px_12px_rgba(0,0,0,0.06)] ring-0 transition-opacity duration-200"
										>
											<div>
												<CardHeader class="flex flex-row items-start justify-between gap-3 px-4 pt-4 pb-2">
													<div class="min-w-0 flex-1">
														<div class="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
															<span
																class="inline-flex items-center gap-1 rounded-[4px] bg-[#003366]/10 px-2 py-0.5 font-bold text-[#003366]"
															>
																<Compass class="size-3 shrink-0 text-[#003366]" />
																{item.zone}
															</span>
															<span
																class="inline-flex items-center gap-1 rounded-[4px] border border-[#E0E0E0] bg-[#F8FAFC] px-2 py-0.5 text-[11px] font-medium text-[#36454F]"
															>
																<UserCog class="size-3 shrink-0 text-[#00BFFF]" />
																PIC: <strong>{getZonePicLabel(item.zone)}</strong>
															</span>
														</div>

														<CardTitle class="text-base leading-snug font-bold text-[#36454F]">
															{item.name}
														</CardTitle>
													</div>

													{#if isDelivered}
														<Badge
															class="h-6 shrink-0 gap-1 rounded-[6px] border-transparent bg-[#008000] px-2.5 py-0.5 text-xs font-bold text-white"
														>
															<CheckCircle2 class="size-3.5" />
															<span>Delivered</span>
														</Badge>
													{:else}
														<Badge
															class="h-6 shrink-0 gap-1 rounded-[6px] border-transparent bg-[#FFA500] px-2.5 py-0.5 text-xs font-bold text-white"
														>
															<Clock class="size-3.5" />
															<span>Pending</span>
														</Badge>
													{/if}
												</CardHeader>

												<CardContent class="px-4 py-2">
													<div class="flex items-start gap-2 text-sm text-[#36454F]">
														<MapPin class="mt-0.5 size-4 shrink-0 text-[#003366]" />
														<p class="leading-relaxed">{item.address}</p>
													</div>

													{#if !isDelivered}
														<div class="mt-3 rounded-[6px] border border-[#E0E0E0] bg-[#F8FAFC] p-2.5">
															<label
																for="note-{item.id}"
																class="mb-1 flex items-center gap-1 text-[11px] font-bold text-[#003366]"
															>
																<MessageSquare class="size-3 text-[#00BFFF]" />
																<span>Catatan Penyerahan (Opsional):</span>
															</label>
															<input
																id="note-{item.id}"
																type="text"
																bind:value={deliveryNotes[item.id]}
																placeholder="Contoh: Diterima langsung / Diwakilkan anak..."
																class="h-8 w-full rounded border border-[#C0C0C0] bg-white px-2.5 text-xs text-[#36454F] focus:border-[#003366] focus:outline-none"
															/>
															<div class="mt-1.5 flex flex-wrap gap-1">
																{#each ['Diterima langsung', 'Diwakilkan keluarga', 'Titip Ketua RT'] as preset (preset)}
																	<button
																		type="button"
																		onclick={() => (deliveryNotes[item.id] = preset)}
																		class="rounded border border-[#E0E0E0] bg-white px-2 py-0.5 text-[10px] font-medium text-[#36454F] hover:border-[#003366] hover:text-[#003366]"
																	>
																		+ {preset}
																	</button>
																{/each}
															</div>
														</div>
													{/if}
												</CardContent>
											</div>

											<CardFooter class="border-t border-[#E0E0E0]/70 bg-[#FAFAFA] px-4 py-3">
												{#if !isDelivered}
													<Button
														type="button"
														disabled={isUpdating}
														onclick={() => markAsDelivered(item)}
														class="min-h-[44px] w-full rounded-[8px] bg-[#003366] text-sm font-bold text-white transition-all duration-200 hover:bg-[#00BFFF] hover:text-[#003366] active:translate-y-0.5 active:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
													>
														{#if isUpdating}
															<Loader2 class="mr-2 size-4 animate-spin" />
															<span>Memproses Update...</span>
														{:else}
															<CheckCircle2 class="mr-2 size-4" />
															<span>Tandai Selesai (Oleh {currentUser.name})</span>
														{/if}
													</Button>
												{:else}
													<div class="flex w-full items-start justify-between gap-2 text-xs text-[#36454F]">
														<div class="min-w-0 flex-1">
															<span class="inline-flex items-center gap-1.5 font-bold text-[#008000]">
																<UserCheck class="size-4 shrink-0" />
																<span>Disalurkan oleh {item.delivered_by || 'Relawan'}</span>
															</span>
															{#if item.delivered_at}
																<p class="mt-0.5 text-[11px] text-[#36454F]/75">
																	Selesai pukul {formatTime(item.delivered_at)}
																</p>
															{/if}
															{#if item.delivery_note}
																<p class="mt-1 rounded bg-[#008000]/10 px-2 py-1 text-[11px] font-medium text-[#003366]">
																	Catatan: "{item.delivery_note}"
																</p>
															{/if}
														</div>

														<button
															type="button"
															disabled={isUpdating}
															onclick={() => revertToPending(item)}
															class="inline-flex shrink-0 items-center gap-1 rounded-[6px] border border-[#C0C0C0] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#36454F] hover:border-[#FFA500] hover:text-[#003366] disabled:opacity-50"
														>
															<RotateCcw class="size-3" />
															<span>Batal</span>
														</button>
													</div>
												{/if}
											</CardFooter>
										</Card>
									{/each}
								</div>
							{/if}
						</section>
					{/if}

					<!-- ===================================================== -->
					<!-- TAB 2 (ORG_ADMIN): CRUD MUSTAHIQ (PENERIMA ZAKAT)     -->
					<!-- ===================================================== -->
					{#if currentUser.role === 'org_admin' && activeTab === 'mustahiq'}
						<div class="flex flex-col gap-4 pb-8 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
							<!-- Form Tambah/Edit Mustahiq (Sticky di Kiri pada Layar Laptop) -->
							<section
								class="rounded-[8px] border border-[#E0E0E0] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] lg:sticky lg:top-6 lg:col-span-4"
							>
								<div class="mb-3 flex items-center justify-between">
									<div class="flex items-center gap-2">
										<Users class="size-4 text-[#003366]" />
										<h2 class="text-sm font-bold text-[#003366]">
											{editingMustahiqId ? 'Edit Data Penerima' : '+ Tambah Penerima Zakat'}
										</h2>
									</div>
									{#if editingMustahiqId}
										<button
											type="button"
											onclick={() => {
												editingMustahiqId = null;
												formMustahiqName = '';
												formMustahiqAddress = '';
											}}
											class="text-xs font-medium text-red-600 hover:underline"
										>
											Batal Edit
										</button>
									{/if}
								</div>

								<form onsubmit={handleSaveMustahiq} class="flex flex-col gap-3">
									<div>
										<label for="m-name" class="mb-1 block text-xs font-bold text-[#36454F]">
											Nama Lengkap Penerima
										</label>
										<Input
											id="m-name"
											type="text"
											required
											bind:value={formMustahiqName}
											placeholder="Contoh: Bpk. Slamet Raharjo"
											class="min-h-[40px] text-sm"
										/>
									</div>

									<div>
										<label for="m-addr" class="mb-1 block text-xs font-bold text-[#36454F]">
											Alamat Lengkap
										</label>
										<Input
											id="m-addr"
											type="text"
											required
											bind:value={formMustahiqAddress}
											placeholder="Contoh: Jl. Kenari No. 8, RT 01 / RW 04"
											class="min-h-[40px] text-sm"
										/>
									</div>

									<div>
										<label for="m-zone" class="mb-1 block text-xs font-bold text-[#36454F]">
											Wilayah / RT (Otomatis terhubung ke PIC Wilayah)
										</label>
										<select
											id="m-zone"
											bind:value={formMustahiqZone}
											class="min-h-[40px] w-full rounded-[8px] border border-[#C0C0C0] bg-white px-2.5 py-2 text-sm text-[#36454F]"
										>
											{#each availableZoneNames as z (z)}
												<option value={z}>
													{z} (PIC: {getZonePicLabel(z)})
												</option>
											{/each}
										</select>
									</div>

									<Button
										type="submit"
										disabled={submittingMustahiq}
										class="min-h-[44px] w-full rounded-[8px] bg-[#003366] text-sm font-bold text-white hover:bg-[#00BFFF] hover:text-[#003366]"
									>
										<Plus class="mr-2 size-4" />
										<span>{editingMustahiqId ? 'Simpan Perubahan' : 'Simpan Penerima Zakat'}</span>
									</Button>
								</form>
							</section>

							<!-- Daftar Seluruh Mustahiq (Kanan di Laptop) -->
							<section
								class="rounded-[8px] border border-[#E0E0E0] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] lg:col-span-8"
							>
								<h3 class="mb-3 text-xs font-bold tracking-wide text-[#003366] uppercase">
									Daftar Seluruh Mustahiq ({mustahiqList.length})
								</h3>

								{#if desktopViewMode === 'table'}
									<div class="hidden overflow-hidden rounded-[8px] border border-[#E0E0E0] lg:block">
										<table class="w-full border-collapse text-left text-xs">
											<thead>
												<tr class="border-b border-[#E0E0E0] bg-[#003366] text-[11px] font-bold text-white uppercase">
													<th class="px-3.5 py-2.5">Nama Penerima</th>
													<th class="px-3.5 py-2.5">Alamat</th>
													<th class="px-3 py-2.5">Wilayah & PIC</th>
													<th class="px-3 py-2.5 text-center">Status</th>
													<th class="px-3.5 py-2.5 text-right">Aksi</th>
												</tr>
											</thead>
											<tbody class="divide-y divide-[#E0E0E0]">
												{#each mustahiqList as item (item.id)}
													<tr class="hover:bg-[#F8FAFC]">
														<td class="px-3.5 py-2.5 font-bold text-[#36454F]">{item.name}</td>
														<td class="px-3.5 py-2.5 text-[#36454F]/85">{item.address}</td>
														<td class="px-3 py-2.5">
															<span class="font-bold text-[#003366]">{item.zone}</span>
															<span class="block text-[10px] text-[#36454F]/70">
																PIC: {getZonePicLabel(item.zone)}
															</span>
														</td>
														<td class="px-3 py-2.5 text-center">
															<span
																class="rounded px-2 py-0.5 text-[10px] font-bold text-white {item.status ===
																'delivered'
																	? 'bg-[#008000]'
																	: 'bg-[#FFA500]'}"
															>
																{item.status}
															</span>
														</td>
														<td class="px-3.5 py-2.5 text-right">
															<div class="inline-flex items-center gap-1">
																<button
																	type="button"
																	onclick={() => startEditMustahiq(item)}
																	class="inline-flex h-7 w-7 items-center justify-center rounded border border-[#C0C0C0] bg-white text-[#003366]"
																	title="Edit"
																>
																	<Pencil class="size-3.5" />
																</button>
																<button
																	type="button"
																	onclick={() => handleDeleteMustahiq(item)}
																	class="inline-flex h-7 w-7 items-center justify-center rounded border border-red-200 bg-white text-red-600"
																	title="Hapus"
																>
																	<Trash2 class="size-3.5" />
																</button>
															</div>
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								{/if}

								<div
									class="grid grid-cols-1 gap-2.5 {desktopViewMode === 'table'
										? 'lg:hidden'
										: 'lg:grid-cols-2 lg:gap-3'}"
								>
									{#each mustahiqList as item (item.id)}
										<div
											class="flex items-start justify-between gap-2 rounded-[8px] border border-[#E0E0E0] bg-[#FAFAFA] p-3"
										>
											<div class="min-w-0 flex-1">
												<div class="flex flex-wrap items-center gap-1.5">
													<span class="text-sm font-bold text-[#36454F]">{item.name}</span>
													<span
														class="rounded px-1.5 py-0.5 text-[10px] font-bold text-white {item.status ===
														'delivered'
															? 'bg-[#008000]'
															: 'bg-[#FFA500]'}"
													>
														{item.status}
													</span>
												</div>
												<p class="mt-0.5 text-xs text-[#36454F]/80">{item.address}</p>
												<p class="mt-1 text-[11px] font-medium text-[#003366]">
													Wilayah: <strong>{item.zone}</strong>
													{#if item.delivered_by}
														• Disalurkan oleh: <strong>{item.delivered_by}</strong>
													{:else}
														• PIC Tugas: <strong>{getZonePicLabel(item.zone)}</strong>
													{/if}
												</p>
											</div>

											<div class="flex shrink-0 items-center gap-1">
												<button
													type="button"
													onclick={() => startEditMustahiq(item)}
													class="inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-[#C0C0C0] bg-white text-[#003366]"
													title="Edit"
												>
													<Pencil class="size-3.5" />
												</button>
												<button
													type="button"
													onclick={() => handleDeleteMustahiq(item)}
													class="inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-red-200 bg-white text-red-600"
													title="Hapus"
												>
													<Trash2 class="size-3.5" />
												</button>
											</div>
										</div>
									{/each}
								</div>
							</section>
						</div>
					{/if}

					<!-- ===================================================== -->
					<!-- TAB 3 (ORG_ADMIN): KELOLA WILAYAH & AKUN LOGIN PIC    -->
					<!-- ===================================================== -->
					{#if currentUser.role === 'org_admin' && activeTab === 'pic'}
						<div class="flex flex-col gap-4 pb-8 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
							<!-- Kolom Kiri di Laptop: Kelola Wilayah + Form Buat Akun Login PIC -->
							<div class="flex flex-col gap-4 lg:sticky lg:top-6 lg:col-span-5">
								<!-- Tambah Wilayah / RT -->
								<section
									class="rounded-[8px] border border-[#E0E0E0] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
								>
									<h2 class="mb-2 text-sm font-bold text-[#003366]">
										1. Daftar Wilayah / RT ({availableZoneNames.length})
									</h2>
									<div class="mb-3 flex flex-wrap gap-1.5">
										{#each availableZoneNames as zName (zName)}
											<span class="rounded-[6px] border border-[#003366]/20 bg-[#003366]/5 px-2.5 py-1 text-xs font-bold text-[#003366]">
												{zName}
											</span>
										{/each}
									</div>

									<form onsubmit={handleAddZone} class="flex gap-2">
										<Input
											type="text"
											bind:value={formNewZoneName}
											placeholder="Tambah Wilayah (contoh: RT 04)"
											class="h-9 flex-1 text-xs"
										/>
										<Button
											type="submit"
											class="h-9 bg-[#003366] px-3 text-xs font-bold text-white"
										>
											+ Wilayah
										</Button>
									</form>
								</section>

								<!-- Buat Akun Login PIC Baru -->
								<section
									class="rounded-[8px] border border-[#E0E0E0] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
								>
									<div class="mb-2 flex items-center gap-2">
										<KeyRound class="size-4 text-[#003366]" />
										<h2 class="text-sm font-bold text-[#003366]">
											2. Buat Akun Login PIC Pembagi
										</h2>
									</div>
									<p class="mb-3 text-xs text-[#36454F]/80">
										Setiap PIC yang dibuatkan akun dapat login sendiri dan hanya melihat/menyalurkan warga di wilayah tugasnya.
									</p>

									<form onsubmit={handleCreatePicAccount} class="flex flex-col gap-3">
										<div>
											<label for="pic-name" class="mb-1 block text-xs font-bold text-[#36454F]">
												Nama Lengkap PIC / Relawan
											</label>
											<Input
												id="pic-name"
												type="text"
												required
												bind:value={formPicName}
												placeholder="Contoh: Hendra Setiawan"
												class="min-h-[40px] text-sm"
											/>
										</div>

										<div>
											<label for="pic-zone" class="mb-1 block text-xs font-bold text-[#36454F]">
												Wilayah Tugas (RT / Blok)
											</label>
											<select
												id="pic-zone"
												bind:value={formPicZone}
												class="min-h-[40px] w-full rounded-[8px] border border-[#C0C0C0] bg-white px-2.5 py-2 text-sm text-[#36454F]"
											>
												{#each availableZoneNames as z (z)}
													<option value={z}>{z}</option>
												{/each}
											</select>
										</div>

										<div class="grid grid-cols-2 gap-2">
											<div>
												<label for="pic-user" class="mb-1 block text-xs font-bold text-[#36454F]">
													Username Login
												</label>
												<Input
													id="pic-user"
													type="text"
													required
													bind:value={formPicUsername}
													placeholder="Contoh: hendra"
													class="min-h-[40px] text-sm"
												/>
											</div>

											<div>
												<label for="pic-pass" class="mb-1 block text-xs font-bold text-[#36454F]">
													Password Login
												</label>
												<Input
													id="pic-pass"
													type="text"
													required
													bind:value={formPicPassword}
													placeholder="Contoh: pic123"
													class="min-h-[40px] text-sm"
												/>
											</div>
										</div>

										<Button
											type="submit"
											disabled={submittingPic}
											class="min-h-[44px] w-full rounded-[8px] bg-[#003366] text-sm font-bold text-white hover:bg-[#00BFFF] hover:text-[#003366]"
										>
											<Plus class="mr-2 size-4" />
											<span>Buat Akun Login PIC</span>
										</Button>
									</form>
								</section>
							</div>

							<!-- Kolom Kanan di Laptop: Daftar Akun PIC Terdaftar -->
							<section
								class="rounded-[8px] border border-[#E0E0E0] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] lg:col-span-7"
							>
								<h3 class="mb-3 text-xs font-bold tracking-wide text-[#003366] uppercase">
									Daftar Akun PIC Terdaftar ({picsList.length})
								</h3>

								{#if desktopViewMode === 'table'}
									<div class="hidden overflow-hidden rounded-[8px] border border-[#E0E0E0] lg:block">
										<table class="w-full border-collapse text-left text-xs">
											<thead>
												<tr class="border-b border-[#E0E0E0] bg-[#003366] text-[11px] font-bold text-white uppercase">
													<th class="px-4 py-2.5">Nama Lengkap PIC</th>
													<th class="px-3 py-2.5">Username Login</th>
													<th class="px-3 py-2.5">Wilayah Tugas</th>
													<th class="px-4 py-2.5 text-right">Aksi</th>
												</tr>
											</thead>
											<tbody class="divide-y divide-[#E0E0E0]">
												{#each picsList as pic (pic.id)}
													<tr class="hover:bg-[#F8FAFC]">
														<td class="px-4 py-2.5 font-bold text-[#36454F]">{pic.name}</td>
														<td class="px-3 py-2.5">
															<code class="rounded bg-[#003366]/10 px-1.5 py-0.5 font-bold text-[#003366]">
																@{pic.username}
															</code>
														</td>
														<td class="px-3 py-2.5">
															<span class="rounded bg-[#003366] px-2 py-0.5 text-[10px] font-bold text-white">
																{pic.assigned_zone}
															</span>
														</td>
														<td class="px-4 py-2.5 text-right">
															<button
																type="button"
																onclick={() => handleDeleteUser(pic)}
																class="inline-flex h-7 w-7 items-center justify-center rounded border border-red-200 bg-white text-red-600"
																title="Hapus Akun PIC"
															>
																<Trash2 class="size-3.5" />
															</button>
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								{/if}

								<div
									class="grid grid-cols-1 gap-2.5 {desktopViewMode === 'table'
										? 'lg:hidden'
										: 'lg:grid-cols-2 lg:gap-3'}"
								>
									{#each picsList as pic (pic.id)}
										<div
											class="flex items-center justify-between rounded-[8px] border border-[#E0E0E0] bg-[#FAFAFA] p-3"
										>
											<div>
												<div class="flex items-center gap-2">
													<span class="text-sm font-bold text-[#36454F]">{pic.name}</span>
													<span class="rounded bg-[#003366] px-2 py-0.5 text-[10px] font-bold text-white">
														Wilayah: {pic.assigned_zone}
													</span>
												</div>
												<p class="mt-1 text-xs text-[#36454F]/80">
													Username Login: <code class="font-bold text-[#003366]">{pic.username}</code>
												</p>
											</div>

											<button
												type="button"
												onclick={() => handleDeleteUser(pic)}
												class="inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-red-200 bg-white text-red-600"
												title="Hapus Akun PIC"
											>
												<Trash2 class="size-3.5" />
											</button>
										</div>
									{/each}
								</div>
							</section>
						</div>
					{/if}

					<!-- ===================================================== -->
					<!-- TAB 4 (ORG_ADMIN): DATA MUZAKKI + KALKULATOR JIWA     -->
					<!-- ===================================================== -->
					{#if currentUser.role === 'org_admin' && activeTab === 'muzakki'}
						<div class="flex flex-col gap-4 pb-8 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
							<!-- Kolom Kiri di Laptop: Form Muzakki + Kalkulator Jiwa -->
							<section
								class="rounded-[8px] border border-[#E0E0E0] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] lg:sticky lg:top-6 lg:col-span-5"
							>
								<h2 class="mb-3 text-sm font-bold text-[#003366]">
									+ Catat Penerimaan Zakat (Muzakki)
								</h2>

								<form onsubmit={handleAddMuzakki} class="flex flex-col gap-3">
									<div>
										<label for="mz-name" class="mb-1 block text-xs font-bold text-[#36454F]">
											Nama Muzakki / Kepala Keluarga
										</label>
										<Input
											id="mz-name"
											type="text"
											required
											bind:value={formMuzakkiName}
											placeholder="Contoh: Kel. Bpk. H. Ridwan"
											class="min-h-[40px] text-sm"
										/>
									</div>

									<div>
										<label for="mz-phone" class="mb-1 flex items-center gap-1 text-xs font-bold text-[#36454F]">
											<Phone class="size-3.5 text-[#003366]" />
											<span>No. WhatsApp (Opsional — untuk Kirim Bukti Terima)</span>
										</label>
										<Input
											id="mz-phone"
											type="tel"
											bind:value={formMuzakkiPhone}
											placeholder="Contoh: 081234567890"
											class="min-h-[40px] text-sm"
										/>
									</div>

									<!-- Toggle Kalkulator Zakat Fitrah per Jiwa (Paket 2) -->
									<div class="rounded-[8px] border border-[#003366]/20 bg-[#003366]/5 p-3">
										<div class="mb-2 flex items-center justify-between">
											<span class="flex items-center gap-1.5 text-xs font-bold text-[#003366]">
												<Calculator class="size-3.5 text-[#00BFFF]" />
												<span>Kalkulator Jumlah Jiwa (Zakat Fitrah)</span>
											</span>
											<input
												type="checkbox"
												bind:checked={useFitrahCalculator}
												onchange={recalculateFitrahAmount}
												class="size-4 accent-[#003366]"
											/>
										</div>

										<div class="grid grid-cols-2 gap-2">
											<div>
												<label for="mz-jiwa" class="mb-1 block text-[11px] font-bold text-[#36454F]">
													Jumlah Jiwa (Orang)
												</label>
												<Input
													id="mz-jiwa"
													type="number"
													min="1"
													max="50"
													bind:value={formJiwaCount}
													oninput={recalculateFitrahAmount}
													class="h-9 bg-white text-sm font-bold"
												/>
											</div>

											<div>
												<label for="mz-std" class="mb-1 block text-[11px] font-bold text-[#36454F]">
													Takaran / Jiwa ({formMuzakkiType === 'uang' ? 'Rp' : 'Kg'})
												</label>
												{#if formMuzakkiType === 'uang'}
													<Input
														id="mz-std"
														type="number"
														step="1000"
														bind:value={standardUangPerJiwa}
														oninput={recalculateFitrahAmount}
														class="h-9 bg-white text-xs"
													/>
												{:else}
													<Input
														id="mz-std"
														type="number"
														step="0.1"
														bind:value={standardBerasPerJiwa}
														oninput={recalculateFitrahAmount}
														class="h-9 bg-white text-xs"
													/>
												{/if}
											</div>
										</div>

										<div class="mt-2 flex items-center gap-1">
											<span class="mr-1 text-[10px] font-medium text-[#36454F]/80">Pilih Cepat:</span>
											{#each [1, 2, 3, 4, 5, 6] as n (n)}
												<button
													type="button"
													onclick={() => setQuickJiwa(n)}
													class="h-6 rounded border px-2 text-[11px] font-bold transition-colors {formJiwaCount ===
													n
														? 'border-[#003366] bg-[#003366] text-white'
														: 'border-[#C0C0C0] bg-white text-[#36454F]'}"
												>
													{n}
												</button>
											{/each}
										</div>
									</div>

									<div class="grid grid-cols-2 gap-2.5">
										<div>
											<label for="mz-type" class="mb-1 block text-xs font-bold text-[#36454F]">
												Jenis Zakat
											</label>
											<select
												id="mz-type"
												value={formMuzakkiType}
												onchange={(e) =>
													handleMuzakkiTypeChange(
														(e.currentTarget as HTMLSelectElement).value as 'uang' | 'beras'
													)}
												class="min-h-[40px] w-full rounded-[8px] border border-[#C0C0C0] bg-white px-2.5 py-2 text-sm text-[#36454F]"
											>
												<option value="uang">Uang (Rupiah)</option>
												<option value="beras">Beras (Kg)</option>
											</select>
										</div>

										<div>
											<label for="mz-amount" class="mb-1 block text-xs font-bold text-[#36454F]">
												Total Diterima ({formMuzakkiType === 'uang' ? 'Rp' : 'Kg'})
											</label>
											<Input
												id="mz-amount"
												type="number"
												step="any"
												min="0.1"
												required
												bind:value={formMuzakkiAmount}
												placeholder={formMuzakkiType === 'uang' ? '180000' : '10'}
												class="min-h-[40px] text-sm font-bold text-[#008000]"
											/>
										</div>
									</div>

									<div>
										<label for="mz-notes" class="mb-1 block text-xs font-bold text-[#36454F]">
											Keterangan Tambahan (Opsional)
										</label>
										<Input
											id="mz-notes"
											type="text"
											bind:value={formMuzakkiNotes}
											placeholder="Contoh: Zakat Fitrah + Infaq Masjid"
											class="min-h-[38px] text-xs"
										/>
									</div>

									<Button
										type="submit"
										disabled={submittingMuzakki}
										class="min-h-[44px] w-full rounded-[8px] bg-[#003366] text-sm font-bold text-white hover:bg-[#00BFFF] hover:text-[#003366]"
									>
										<Plus class="mr-2 size-4" />
										<span>Simpan & Buat Bukti Terima</span>
									</Button>
								</form>
							</section>

							<!-- Kolom Kanan di Laptop: Daftar Muzakki + Kirim WA & Cetak Kwitansi -->
							<section
								class="rounded-[8px] border border-[#E0E0E0] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] lg:col-span-7"
							>
								<h3 class="mb-3 text-xs font-bold tracking-wide text-[#003366] uppercase">
									Daftar Muzakki Terdaftar ({muzakkiList.length})
								</h3>

								{#if desktopViewMode === 'table'}
									<div class="hidden overflow-hidden rounded-[8px] border border-[#E0E0E0] lg:block">
										<table class="w-full border-collapse text-left text-xs">
											<thead>
												<tr class="border-b border-[#E0E0E0] bg-[#003366] text-[11px] font-bold text-white uppercase">
													<th class="px-3.5 py-2.5">Nama Muzakki</th>
													<th class="px-3 py-2.5 text-center">Jiwa</th>
													<th class="px-3 py-2.5">Jumlah Zakat</th>
													<th class="px-3.5 py-2.5 text-right">Bukti Terima & Aksi</th>
												</tr>
											</thead>
											<tbody class="divide-y divide-[#E0E0E0]">
												{#each muzakkiList as item (item.id)}
													<tr class="hover:bg-[#F8FAFC]">
														<td class="px-3.5 py-2.5">
															<p class="font-bold text-[#36454F]">{item.name}</p>
															{#if item.notes}
																<p class="text-[11px] text-[#36454F]/75">{item.notes}</p>
															{/if}
														</td>
														<td class="px-3 py-2.5 text-center">
															<span class="rounded bg-[#003366] px-2 py-0.5 text-[10px] font-bold text-white">
																{item.jiwa_count || 1} Jiwa
															</span>
														</td>
														<td class="px-3 py-2.5">
															<span class="font-bold text-[#008000]">
																{item.zakat_type === 'uang'
																	? formatRupiah(Number(item.amount))
																	: `${item.amount} Kg Beras`}
															</span>
														</td>
														<td class="px-3.5 py-2.5 text-right">
															<div class="inline-flex items-center gap-1.5">
																<a
																	href={buildWhatsAppReceiptUrl(item)}
																	target="_blank"
																	rel="noopener noreferrer"
																	class="inline-flex h-7 items-center gap-1 rounded bg-[#008000] px-2.5 text-[11px] font-bold text-white hover:opacity-90"
																>
																	<Send class="size-3" />
																	<span>WA</span>
																</a>
																<button
																	type="button"
																	onclick={() => (selectedReceiptMuzakki = item)}
																	class="inline-flex h-7 items-center gap-1 rounded border border-[#003366] bg-white px-2 text-[11px] font-bold text-[#003366] hover:bg-[#003366] hover:text-white"
																>
																	<FileText class="size-3" />
																	<span>Kwitansi</span>
																</button>
																<button
																	type="button"
																	onclick={() => handleDeleteMuzakki(item)}
																	class="inline-flex h-7 w-7 items-center justify-center rounded border border-red-200 bg-white text-red-600"
																	title="Hapus"
																>
																	<Trash2 class="size-3.5" />
																</button>
															</div>
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								{/if}

								<div
									class="grid grid-cols-1 gap-3 {desktopViewMode === 'table'
										? 'lg:hidden'
										: 'lg:grid-cols-2 lg:gap-3.5'}"
								>
									{#each muzakkiList as item (item.id)}
										<div
											class="flex flex-col justify-between rounded-[8px] border border-[#E0E0E0] bg-[#FAFAFA] p-3"
										>
											<div class="flex items-start justify-between gap-2">
												<div>
													<div class="flex flex-wrap items-center gap-1.5">
														<p class="text-sm font-bold text-[#36454F]">{item.name}</p>
														<span class="rounded bg-[#003366] px-2 py-0.5 text-[10px] font-bold text-white">
															{item.jiwa_count || 1} Jiwa
														</span>
													</div>

													<div class="mt-1 flex flex-wrap items-center gap-2 text-xs">
														<span
															class="rounded px-2 py-0.5 text-[10px] font-bold {item.zakat_type ===
															'uang'
																? 'bg-[#003366]/10 text-[#003366]'
																: 'bg-[#FFA500]/20 text-[#36454F]'}"
														>
															{item.zakat_type === 'uang' ? 'Zakat Uang' : 'Zakat Beras'}
														</span>
														<span class="font-bold text-[#008000]">
															{item.zakat_type === 'uang'
																? formatRupiah(Number(item.amount))
																: `${item.amount} Kg`}
														</span>
													</div>

													{#if item.notes}
														<p class="mt-1 text-[11px] text-[#36454F]/75">{item.notes}</p>
													{/if}
												</div>

												<button
													type="button"
													onclick={() => handleDeleteMuzakki(item)}
													class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-red-200 bg-white text-red-600"
													title="Hapus Muzakki"
												>
													<Trash2 class="size-3.5" />
												</button>
											</div>

											<div class="mt-2.5 flex items-center gap-2 border-t border-[#E0E0E0] pt-2.5">
												<a
													href={buildWhatsAppReceiptUrl(item)}
													target="_blank"
													rel="noopener noreferrer"
													class="inline-flex min-h-[34px] flex-1 items-center justify-center gap-1.5 rounded-[6px] bg-[#008000] px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
												>
													<Send class="size-3.5" />
													<span>Kirim WA {item.phone ? `(${item.phone})` : ''}</span>
												</a>

												<button
													type="button"
													onclick={() => (selectedReceiptMuzakki = item)}
													class="inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-[6px] border border-[#003366] bg-white px-3 py-1.5 text-xs font-bold text-[#003366] hover:bg-[#003366] hover:text-white"
												>
													<FileText class="size-3.5" />
													<span>Kwitansi</span>
												</button>
											</div>
										</div>
									{/each}
								</div>
							</section>
						</div>
					{/if}
				{/if}
			</main>
		</div>
	</div>
{/if}

<!-- ========================================================= -->
<!-- MODAL KWITANSI / STRUK BUKTI TERIMA ZAKAT (PAKET 2)       -->
<!-- ========================================================= -->
{#if selectedReceiptMuzakki}
	<div
		role="dialog"
		aria-modal="true"
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
	>
		<div class="w-full max-w-sm rounded-[8px] border border-[#E0E0E0] bg-white p-5 shadow-xl">
			<div class="border-b-2 border-dashed border-[#003366]/30 pb-3 text-center">
				<p class="text-[10px] font-bold tracking-widest text-[#003366] uppercase">
					Bukti Terima Zakat Resmi
				</p>
				<h3 class="mt-0.5 text-base font-bold text-[#003366]">
					{currentOrg?.name || 'Lembaga Amil Zakat'}
				</h3>
				<p class="text-[11px] text-[#36454F]/75">{currentOrg?.address || ''}</p>
			</div>

			<div class="my-4 flex flex-col gap-2 text-xs text-[#36454F]">
				<div class="flex justify-between">
					<span class="text-[#36454F]/70">No. Kwitansi:</span>
					<span class="font-mono font-bold text-[#003366]">
						#ZKT-{selectedReceiptMuzakki.id.slice(0, 8).toUpperCase()}
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-[#36454F]/70">Tanggal Terima:</span>
					<span class="font-medium">{formatDate(selectedReceiptMuzakki.created_at)}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-[#36454F]/70">Nama Muzakki:</span>
					<span class="font-bold text-[#36454F]">{selectedReceiptMuzakki.name}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-[#36454F]/70">Jumlah Tanggungan:</span>
					<span class="font-bold">{selectedReceiptMuzakki.jiwa_count || 1} Jiwa</span>
				</div>
				<div class="flex justify-between border-t border-[#E0E0E0] pt-2 text-sm">
					<span class="font-bold text-[#003366]">Total Diterima:</span>
					<span class="font-bold text-[#008000]">
						{selectedReceiptMuzakki.zakat_type === 'uang'
							? formatRupiah(Number(selectedReceiptMuzakki.amount))
							: `${selectedReceiptMuzakki.amount} Kg Beras`}
					</span>
				</div>
				{#if selectedReceiptMuzakki.notes}
					<div class="rounded bg-[#F8FAFC] p-2 text-[11px] text-[#36454F]/85">
						<strong>Keterangan:</strong> {selectedReceiptMuzakki.notes}
					</div>
				{/if}
			</div>

			<div class="rounded-[6px] border border-[#003366]/15 bg-[#003366]/5 p-2.5 text-center text-[11px] leading-relaxed text-[#003366]">
				<p class="font-bold">Doa Penerimaan Zakat:</p>
				<p class="mt-0.5 italic">
					"Ajarakallahu fima a'thaita, wa baraka fima abqaita, wa ja'alahu laka thahuran."
				</p>
			</div>

			<div class="mt-4 flex items-center gap-2">
				<Button
					type="button"
					onclick={() => window.print()}
					class="min-h-[40px] flex-1 rounded-[8px] bg-[#003366] text-xs font-bold text-white hover:bg-[#00BFFF] hover:text-[#003366]"
				>
					<Printer class="mr-1.5 size-4" />
					<span>Cetak / PDF</span>
				</Button>

				<a
					href={buildWhatsAppReceiptUrl(selectedReceiptMuzakki)}
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-[8px] bg-[#008000] px-3 text-xs font-bold text-white"
				>
					<Send class="size-3.5" />
					<span>Kirim WA</span>
				</a>

				<button
					type="button"
					onclick={() => (selectedReceiptMuzakki = null)}
					class="inline-flex min-h-[40px] items-center justify-center rounded-[8px] border border-[#C0C0C0] bg-white px-3 text-xs font-bold text-[#36454F]"
				>
					Tutup
				</button>
			</div>
		</div>
	</div>
{/if}
