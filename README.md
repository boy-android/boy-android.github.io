# boy-android.github.io

## Batas satu perangkat untuk satu akun

Sebelum menerbitkan perubahan pembatasan perangkat, buka Supabase **SQL Editor** dan jalankan seluruh isi `single-device-session.sql`. Setelah itu, terbitkan perubahan website ke GitHub Pages.

Perangkat yang pertama kali berhasil masuk akan mengunci akun. Login berikutnya dari browser/perangkat lain ditolak sampai pengguna keluar dari perangkat yang terdaftar. Jika pengguna kehilangan data browser atau tidak bisa keluar, admin dapat membuka kunci melalui SQL Editor:

```sql
delete from public.account_device_locks
where user_id = '<AUTH_USER_UUID>';
```

Identitas yang dipakai adalah ID acak yang disimpan di penyimpanan browser, bukan nomor seri perangkat. Menghapus data situs tidak memindahkan kunci; admin perlu menghapus kunci akun di Supabase.
