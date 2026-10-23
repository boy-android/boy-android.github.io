import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://boy-android.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
]);

function firstKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const keys = JSON.parse(raw) as Record<string, string>;
    return keys.default || Object.values(keys)[0];
  } catch {
    return undefined;
  }
}

function json(body: unknown, status: number, origin: string | null) {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Vary": "Origin"
  });
  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "authorization, apikey, x-client-info, content-type");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.has(origin)) {
    return json({ error: "Origin tidak diizinkan." }, 403, null);
  }
  if (request.method === "OPTIONS") return json({ ok: true }, 200, origin);
  if (request.method !== "POST") return json({ error: "Metode tidak diizinkan." }, 405, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || firstKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"));
  const secretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || firstKey(Deno.env.get("SUPABASE_SECRET_KEYS"));
  if (!supabaseUrl || !publishableKey || !secretKey) {
    return json({ error: "Konfigurasi Supabase Edge Function belum lengkap." }, 500, origin);
  }

  const authorization = request.headers.get("Authorization") || "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) return json({ error: "Sesi admin diperlukan." }, 401, origin);

  const callerClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: callerData, error: callerError } = await callerClient.auth.getUser(accessToken);
  if (callerError || !callerData.user) return json({ error: "Sesi admin tidak valid." }, 401, origin);

  const { data: isAdmin, error: adminCheckError } = await callerClient.rpc("ba_is_admin");
  if (adminCheckError || isAdmin !== true) return json({ error: "Aksi ini hanya untuk admin." }, 403, origin);

  const { data: access, error: accessError } = await callerClient
    .from("user_access")
    .select("status, expires_on")
    .eq("user_id", callerData.user.id)
    .maybeSingle();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const expired = Boolean(access?.expires_on && access.expires_on < today);
  if (accessError || !access || access.status !== "approved" || expired) {
    return json({ error: "Akun admin tidak aktif atau masa berlakunya telah habis." }, 403, origin);
  }

  let body: { userId?: unknown; verified?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Isi permintaan tidak valid." }, 400, origin);
  }
  if (!body || typeof body !== "object") {
    return json({ error: "Isi permintaan tidak valid." }, 400, origin);
  }
  const userId = typeof body.userId === "string" ? body.userId : "";
  const verified = body.verified;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
      || typeof verified !== "boolean") {
    return json({ error: "ID akun atau status verifikasi tidak valid." }, 400, origin);
  }
  if (userId === callerData.user.id && verified === false) {
    return json({ error: "Admin tidak dapat membatalkan verifikasi email akunnya sendiri." }, 400, origin);
  }

  const { data: updated, error: updateError } = await adminClient.auth.admin.updateUserById(
    userId,
    { email_confirm: verified }
  );
  if (updateError) return json({ error: updateError.message }, 400, origin);
  return json({ ok: true, userId, emailVerified: Boolean(updated.user.email_confirmed_at) }, 200, origin);
});
