# boy-android.github.io

## Masa berlaku akun

Untuk mengaktifkan masa berlaku akun, jalankan `account-expiration.sql` di Supabase Dashboard → SQL Editor terlebih dahulu. Setelah berhasil, unggah/push perubahan file website ke GitHub Pages.

- Admin dapat memilih tanggal berlaku pada halaman `admin.html`.
- Akun tetap aktif sampai akhir tanggal yang dipilih (zona waktu WIB).
- Kosongkan tanggal untuk menghapus batas masa berlaku.
- Akun lama memiliki `expires_on = NULL`, sehingga tetap aktif tanpa batas waktu sampai admin menetapkan tanggal.
- Kebijakan Row Level Security Supabase juga memblokir data katalog dan berkas privat setelah kedaluwarsa.

```sql
delete from public.account_device_locks
where user_id = '<AUTH_USER_UUID>';
```
