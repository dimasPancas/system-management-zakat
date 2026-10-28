<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { apiFetch, getStoredSession, setStoredSession, type StoredSession } from '#lib/api';
	import { Button } from '#lib/components/ui/button';
	import { Input } from '#lib/components/ui/input';
	import {
		Card,
		CardContent,
		CardHeader,
		CardTitle
	} from '#lib/components/ui/card';
	import {
		Lock,
		User as UserIcon,
		Loader2,
		ShieldCheck,
		Building2,
		UserCheck,
		ArrowRight,
		CheckCircle2
	} from 'lucide-svelte';

	let username = $state<string>('');
	let password = $state<string>('');
	let loading = $state<boolean>(false);
	let errorMessage = $state<string | null>(null);

	onMount(() => {
		const existing = getStoredSession();
		if (existing?.token) {
			goto('/');
		}
	});

	async function handleLogin(e?: SubmitEvent) {
		e?.preventDefault();
		if (!username.trim() || !password) {
			errorMessage = 'Username dan password wajib diisi.';
			return;
		}

		loading = true;
		errorMessage = null;

		const { data, error } = await apiFetch<StoredSession>('/api/auth/login', {
			method: 'POST',
			body: JSON.stringify({
				username: username.trim(),
				password
			})
		});

		if (error || !data) {
			errorMessage = error || 'Gagal masuk ke sistem.';
			loading = false;
			return;
		}

		setStoredSession(data);
		loading = false;
		goto('/');
	}

	function quickFillAndLogin(u: string, p: string) {
		username = u;
		password = p;
		handleLogin();
	}
</script>

<svelte:head>
	<title>Login — System Management Zakat Multi-Tenant</title>
</svelte:head>

<div class="bg-tech-grid flex min-h-screen w-full items-center justify-center p-4 lg:p-8 text-[#36454F]">
	<main class="w-full max-w-md lg:max-w-5xl">
		<div class="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
			<!-- KOLOM KIRI (DI DESKTOP): BRANDING + FORM LOGIN -->
			<div class="flex flex-col gap-4 lg:col-span-6">
				<!-- Header Brand Trust Blue (#003366) -->
				<div class="rounded-[8px] bg-[#003366] p-5 lg:p-6 text-white shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
					<p class="text-[11px] font-bold tracking-wider text-[#00BFFF] uppercase">
						Multi-Tenant Zakat Platform
					</p>
					<h1 class="mt-1 text-2xl lg:text-3xl font-bold tracking-tight text-white">
						System Management Zakat
					</h1>
					<p class="mt-1.5 text-xs lg:text-sm leading-relaxed text-white/85">
						Masuk sesuai peran Anda: <strong>Super Admin (Owner)</strong>, <strong>Admin Masjid/Lembaga</strong>, atau <strong>PIC Pembagi Wilayah</strong>.
					</p>

					<!-- Highlight Fitur Desktop & Mobile -->
					<div class="mt-4 hidden lg:grid lg:grid-cols-2 lg:gap-2 border-t border-white/15 pt-4 text-xs text-white/90">
						<div class="flex items-center gap-1.5">
							<CheckCircle2 class="size-3.5 shrink-0 text-[#00BFFF]" />
							<span>Realtime Elysia WebSocket</span>
						</div>
						<div class="flex items-center gap-1.5">
							<CheckCircle2 class="size-3.5 shrink-0 text-[#00BFFF]" />
							<span>Multi-Masjid & Isolasi RT</span>
						</div>
						<div class="flex items-center gap-1.5">
							<CheckCircle2 class="size-3.5 shrink-0 text-[#00BFFF]" />
							<span>Kalkulator Jiwa & Kuota</span>
						</div>
						<div class="flex items-center gap-1.5">
							<CheckCircle2 class="size-3.5 shrink-0 text-[#00BFFF]" />
							<span>Bukti Terima WA & Cetak</span>
						</div>
					</div>
				</div>

				<!-- Kartu Form Login -->
				<Card class="rounded-[8px] border border-[#E0E0E0] bg-white py-0 shadow-[0_2px_12px_rgba(0,0,0,0.06)] ring-0">
					<CardHeader class="px-5 pt-5 pb-2">
						<CardTitle class="text-base lg:text-lg font-bold text-[#003366]">
							Masuk ke Akun Anda
						</CardTitle>
					</CardHeader>

					<CardContent class="px-5 pt-2 pb-5">
						{#if errorMessage}
							<div
								role="alert"
								class="mb-4 rounded-[8px] border border-red-300 bg-red-50 p-3 text-xs font-medium text-red-800"
							>
								{errorMessage}
							</div>
						{/if}

						<form onsubmit={handleLogin} class="flex flex-col gap-3.5">
							<div>
								<label for="login-username" class="mb-1.5 block text-xs font-bold text-[#36454F]">
									Username / Email
								</label>
								<div class="relative">
									<UserIcon class="pointer-events-none absolute top-3 left-3 size-4 text-[#36454F]/60" />
									<Input
										id="login-username"
										type="text"
										required
										bind:value={username}
										placeholder="Contoh: arrahman atau dimas"
										class="min-h-[42px] pl-9 text-sm"
									/>
								</div>
							</div>

							<div>
								<label for="login-password" class="mb-1.5 block text-xs font-bold text-[#36454F]">
									Password
								</label>
								<div class="relative">
									<Lock class="pointer-events-none absolute top-3 left-3 size-4 text-[#36454F]/60" />
									<Input
										id="login-password"
										type="password"
										required
										bind:value={password}
										placeholder="••••••••"
										class="min-h-[42px] pl-9 text-sm"
									/>
								</div>
							</div>

							<Button
								type="submit"
								disabled={loading}
								class="mt-1 min-h-[44px] w-full rounded-[8px] bg-[#003366] text-sm font-bold text-white transition-all duration-200 hover:bg-[#00BFFF] hover:text-[#003366] active:translate-y-0.5 disabled:opacity-60"
							>
								{#if loading}
									<Loader2 class="mr-2 size-4 animate-spin" />
									<span>Memverifikasi...</span>
								{:else}
									<span>Masuk Sekarang</span>
									<ArrowRight class="ml-2 size-4" />
								{/if}
							</Button>
						</form>
					</CardContent>
				</Card>
			</div>

			<!-- KOLOM KANAN (DI DESKTOP): PANEL DEMO LOGIN CEPAT 1-KLIK -->
			<section
				aria-label="Akun Demo Testing"
				class="rounded-[8px] border border-[#E0E0E0] bg-white p-4 lg:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.06)] lg:col-span-6"
			>
				<p class="mb-1 text-xs lg:text-sm font-bold tracking-wide text-[#003366] uppercase">
					Akses Cepat Testing (Klik untuk Masuk)
				</p>
				<p class="mb-3.5 text-[11px] lg:text-xs text-[#36454F]/80">
					Gunakan akun di bawah ini untuk mencoba langsung perbedaan tampilan tiap Role di HP maupun Laptop:
				</p>

				<div class="flex flex-col gap-2.5">
					<!-- Role 1: Super Admin -->
					<button
						type="button"
						disabled={loading}
						onclick={() => quickFillAndLogin('admin', 'admin123')}
						class="flex w-full items-center justify-between rounded-[6px] border border-[#003366]/30 bg-[#003366]/5 px-3.5 py-3 text-left text-xs transition-colors hover:border-[#003366] hover:bg-[#003366]/10"
					>
						<div class="flex items-center gap-2.5">
							<ShieldCheck class="size-4 shrink-0 text-[#003366]" />
							<div>
								<p class="font-bold text-[#003366]">1. Super Admin (Owner Platform)</p>
								<p class="text-[11px] text-[#36454F]/80">
									Kelola daftar Masjid / Karang Taruna & akun Admin tempat
								</p>
							</div>
						</div>
						<span class="rounded bg-[#003366] px-2 py-0.5 font-mono text-[10px] text-white">
							admin
						</span>
					</button>

					<!-- Role 2: Admin Masjid Ar-Rahman -->
					<button
						type="button"
						disabled={loading}
						onclick={() => quickFillAndLogin('arrahman', 'masjid123')}
						class="flex w-full items-center justify-between rounded-[6px] border border-[#E0E0E0] bg-[#FAFAFA] px-3.5 py-3 text-left text-xs transition-colors hover:border-[#00BFFF] hover:bg-white"
					>
						<div class="flex items-center gap-2.5">
							<Building2 class="size-4 shrink-0 text-[#008000]" />
							<div>
								<p class="font-bold text-[#36454F]">2. Admin Masjid Jami Ar-Rahman</p>
								<p class="text-[11px] text-[#36454F]/80">
									CRUD Mustahiq, Muzakki, Kuota, & Akun Login PIC
								</p>
							</div>
						</div>
						<span class="rounded bg-[#008000] px-2 py-0.5 font-mono text-[10px] text-white">
							arrahman
						</span>
					</button>

					<!-- Role 3A: PIC Dimas (RT 01) -->
					<button
						type="button"
						disabled={loading}
						onclick={() => quickFillAndLogin('dimas', 'pic123')}
						class="flex w-full items-center justify-between rounded-[6px] border border-[#E0E0E0] bg-[#FAFAFA] px-3.5 py-3 text-left text-xs transition-colors hover:border-[#FFA500] hover:bg-white"
					>
						<div class="flex items-center gap-2.5">
							<UserCheck class="size-4 shrink-0 text-[#FFA500]" />
							<div>
								<p class="font-bold text-[#36454F]">3A. PIC Dimas Pratama (Khusus RT 01)</p>
								<p class="text-[11px] text-[#36454F]/80">
									Masjid Ar-Rahman — Hanya melihat & memproses warga RT 01
								</p>
							</div>
						</div>
						<span class="rounded bg-[#FFA500] px-2 py-0.5 font-mono text-[10px] font-bold text-white">
							dimas
						</span>
					</button>

					<!-- Role 3B: PIC Budi (RT 02) -->
					<button
						type="button"
						disabled={loading}
						onclick={() => quickFillAndLogin('budi', 'pic123')}
						class="flex w-full items-center justify-between rounded-[6px] border border-[#E0E0E0] bg-[#FAFAFA] px-3.5 py-3 text-left text-xs transition-colors hover:border-[#FFA500] hover:bg-white"
					>
						<div class="flex items-center gap-2.5">
							<UserCheck class="size-4 shrink-0 text-[#FFA500]" />
							<div>
								<p class="font-bold text-[#36454F]">3B. PIC Budi Santoso (Khusus RT 02)</p>
								<p class="text-[11px] text-[#36454F]/80">
									Masjid Ar-Rahman — Hanya melihat & memproses warga RT 02
								</p>
							</div>
						</div>
						<span class="rounded bg-[#FFA500] px-2 py-0.5 font-mono text-[10px] font-bold text-white">
							budi
						</span>
					</button>

					<!-- Role 2B: Admin Karang Taruna -->
					<button
						type="button"
						disabled={loading}
						onclick={() => quickFillAndLogin('karangtaruna', 'kt123')}
						class="flex w-full items-center justify-between rounded-[6px] border border-[#E0E0E0] bg-[#FAFAFA] px-3.5 py-3 text-left text-xs transition-colors hover:border-[#00BFFF] hover:bg-white"
					>
						<div class="flex items-center gap-2.5">
							<Building2 class="size-4 shrink-0 text-[#003366]" />
							<div>
								<p class="font-bold text-[#36454F]">4. Admin Karang Taruna Tunas Muda</p>
								<p class="text-[11px] text-[#36454F]/80">
									Contoh lembaga ke-2 (data terpisah dari Masjid Ar-Rahman)
								</p>
							</div>
						</div>
						<span class="rounded bg-[#36454F] px-2 py-0.5 font-mono text-[10px] text-white">
							karangtaruna
						</span>
					</button>
				</div>
			</section>
		</div>
	</main>
</div>
