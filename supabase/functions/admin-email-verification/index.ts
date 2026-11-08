import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OWNER = "boy-android";
const REPO = "boy-android.github.io";
const BRANCH = "main";
const BUCKET = "schematics-release-staging";
const CHUNK_SIZE = 10 * 1024 * 1024;
const MAX_FILE_SIZE = 200 * 1024 * 1024;
const LEGACY_VERSION_PREFIX = "v_0.1.28.10.26";
const allowedOrigins = new Set([
  "https://boy-android.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

function firstKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const keys = JSON.parse(raw) as Record<string, string>;
    return keys.default || Object.values(keys)[0];
  } catch { return undefined; }
}

function response(body: unknown, status: number, origin: string | null) {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin" });
  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "authorization, apikey, x-client-info, content-type");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function safeJson(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value, null, 2) + "\n");
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function numericVersion(version: unknown): number[] | null {
  if (typeof version !== "string") return null;
  const match = version.match(/^v_(\d+)\.(\d+)\.(\d{2})\.(\d{2})\.(\d{2})\.(\d+)\.(\d+)$/);
  if (!match) return null;
  const [, major, minor, day, month, year, build, special] = match;
  const parts = [Number(major), Number(minor), Number(year), Number(month), Number(day), Number(build), Number(special)];
  const fullYear = 2000 + Number(year);
  const date = new Date(Date.UTC(fullYear, Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== fullYear || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)) return null;
  return parts;
}

function legacyNumericVersion(version: unknown): number[] | null {
  if (typeof version !== "string" || !/^v_\d+(?:\.\d+){6}$/.test(version)) return null;
  return version.slice(2).split(".").map(Number);
}

function legacyCompatibleVersion(version: string, currentManifest: Record<string, unknown>): string | null {
  const match = version.match(/^v_(\d+)\.(\d+)\.(\d{2})\.(\d{2})\.(\d{2})\.(\d+)\.(\d+)$/);
  if (!match) return null;
  const [, major, minor, , , , build, special] = match;
  const previous = typeof currentManifest.legacyVersion === "string" ? currentManifest.legacyVersion : LEGACY_VERSION_PREFIX;
  const previousMatch = previous.match(/^v_(\d+)\.(\d+)\.(\d{2})\.(\d{2})\.(\d{2})(?:\.(\d+)\.(\d+))?$/);
  if (!previousMatch || previousMatch[1] !== major || previousMatch[2] !== minor) return null;
  const next = `v_${major}.${minor}.${previousMatch[3]}.${previousMatch[4]}.${previousMatch[5]}.${build}.${special}`;
  const nextParts = legacyNumericVersion(next);
  const currentParts = legacyNumericVersion(currentManifest.legacyVersion || currentManifest.version);
  if (!nextParts) return null;
  if (currentParts && compareVersions(nextParts, currentParts) <= 0) return null;
  return next;
}

function compareVersions(left: number[], right: number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.has(origin)) return response({ error: "Origin tidak diizinkan." }, 403, null);
  if (request.method === "OPTIONS") return response({ ok: true }, 200, origin);
  if (request.method !== "POST") return response({ error: "Metode tidak diizinkan." }, 405, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || firstKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"));
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || firstKey(Deno.env.get("SUPABASE_SECRET_KEYS"));
  const githubToken = Deno.env.get("GITHUB_RELEASE_TOKEN");
  if (!supabaseUrl || !publishableKey || !serviceKey || !githubToken) {
    return response({ error: "Secret Supabase atau GITHUB_RELEASE_TOKEN belum dikonfigurasi." }, 500, origin);
  }

  const authorization = request.headers.get("Authorization") || "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) return response({ error: "Sesi admin diperlukan." }, 401, origin);

  const caller = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const service = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: userData, error: userError } = await caller.auth.getUser(accessToken);
  if (userError || !userData.user) return response({ error: "Sesi admin tidak valid." }, 401, origin);
  const { data: isAdmin, error: roleError } = await caller.rpc("ba_is_admin");
  if (roleError || isAdmin !== true) return response({ error: "Aksi ini hanya untuk admin." }, 403, origin);
  const { data: access, error: accessError } = await caller.from("user_access").select("status,expires_on").eq("user_id", userData.user.id).maybeSingle();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  if (accessError || !access || access.status !== "approved" || (access.expires_on && access.expires_on < today)) {
    return response({ error: "Akun admin tidak aktif atau masa berlakunya telah habis." }, 403, origin);
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return response({ error: "Isi permintaan tidak valid." }, 400, origin); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return response({ error: "Isi permintaan tidak valid." }, 400, origin);
  const action = body.action;
  const uploadId = typeof body.uploadId === "string" ? body.uploadId : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uploadId)) {
    return response({ error: "ID unggahan tidak valid." }, 400, origin);
  }
  const prefix = `${userData.user.id}/${uploadId}`;

  async function removeStaging(count: number) {
    const paths = Array.from({ length: count }, (_, index) => `${prefix}/${String(index).padStart(3, "0")}.part`);
    await service.storage.from(BUCKET).remove(paths);
  }

  if (action === "cleanup") {
    const count = Number(body.chunkCount);
    if (!Number.isInteger(count) || count < 1 || count > 20) return response({ error: "Jumlah potongan tidak valid." }, 400, origin);
    await removeStaging(count);
    return response({ ok: true }, 200, origin);
  }

  if (action === "prepare") {
    const fileSize = Number(body.fileSize);
    const chunkCount = Number(body.chunkCount);
    if (!Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > MAX_FILE_SIZE
      || !Number.isInteger(chunkCount) || chunkCount !== Math.ceil(fileSize / CHUNK_SIZE)) {
      return response({ error: "Ukuran installer atau jumlah potongan tidak sesuai." }, 400, origin);
    }
    const chunks: Array<{ path: string; token: string }> = [];
    for (let index = 0; index < chunkCount; index++) {
      const path = `${prefix}/${String(index).padStart(3, "0")}.part`;
      const { data, error } = await service.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
      if (error || !data?.token) {
        await removeStaging(chunkCount);
        return response({ error: `Gagal menyiapkan potongan unggahan ${index + 1}. ${error?.message || ""}` }, 500, origin);
      }
      chunks.push({ path, token: data.token });
    }
    return response({ uploadId, chunks }, 200, origin);
  }

  if (action !== "publish") return response({ error: "Aksi tidak dikenal." }, 400, origin);
  const fileSize = Number(body.fileSize);
  const chunkCount = Number(body.chunkCount);
  const version = typeof body.version === "string" ? body.version.trim() : "";
  const sha256 = typeof body.sha256 === "string" ? body.sha256.toLowerCase() : "";
  const updates = body.schematicsUpdates;
  const websiteUpdates = body.websiteUpdates;
  if (!/^v_\d+(?:\.\d+){6}$/.test(version)
    || !Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > MAX_FILE_SIZE
    || !Number.isInteger(chunkCount) || chunkCount !== Math.ceil(fileSize / CHUNK_SIZE)
    || !/^[a-f0-9]{64}$/.test(sha256)
    || !Array.isArray(updates) || updates.length < 1 || updates.length > 50
    || updates.some((item) => typeof item !== "string" || !item.trim() || item.length > 1000)
    || !Array.isArray(websiteUpdates) || websiteUpdates.length < 1 || websiteUpdates.length > 50
    || websiteUpdates.some((item) => !item || typeof item !== "object" || typeof item.title !== "string" || typeof item.description !== "string" || !item.title.trim() || !item.description.trim() || item.title.length > 120 || item.description.length > 1000)) {
    await removeStaging(Math.min(Math.max(chunkCount || 0, 0), 20));
    return response({ error: "Versi, hash, atau rincian update tidak valid." }, 400, origin);
  }

  const fileName = `BOY-ANDROID.HARDWARE.SCHEMATICS.${version}.Setup.exe`;
  const githubHeaders = {
    Authorization: `Bearer ${githubToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Boy-Android-Schematics-Release-Admin",
  };
  async function githubJson(url: string, init?: RequestInit) {
    const result = await fetch(url, { ...init, headers: { ...githubHeaders, ...(init?.headers as Record<string, string> || {}) } });
    const text = await result.text();
    let parsed: Record<string, unknown> = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch { /* handled below */ }
    if (!result.ok) throw new Error(`GitHub API (${result.status}): ${String(parsed.message || text).slice(0, 500)}`);
    return parsed;
  }

  try {
    const fileApi = `https://api.github.com/repos/${OWNER}/${REPO}/contents/schematics-update.json`;
    const current = await githubJson(`${fileApi}?ref=${encodeURIComponent(BRANCH)}`);
    const currentText = new TextDecoder().decode(Uint8Array.from(atob(String(current.content || "").replace(/\s/g, "")), (character) => character.charCodeAt(0)));
    let currentManifest: Record<string, unknown>;
    try { currentManifest = JSON.parse(currentText); } catch { throw new Error("schematics-update.json saat ini tidak dapat dibaca sebagai JSON."); }
    const nextParts = numericVersion(version);
    const currentParts = numericVersion(currentManifest.displayVersion || currentManifest.version);
    if (!nextParts || !currentParts || compareVersions(nextParts, currentParts) <= 0) {
      throw new Error(`Versi rilis harus lebih baru daripada versi saat ini (${String(currentManifest.version || "tidak diketahui")}).`);
    }
    const currentSha = typeof current.sha === "string" ? current.sha : "";
    if (!currentSha) throw new Error("GitHub tidak mengembalikan SHA manifest untuk pembaruan.");
    const legacyVersion = legacyCompatibleVersion(version, currentManifest);
    if (!legacyVersion) throw new Error("Versi kompatibilitas untuk aplikasi lama tidak dapat dibuat.");

    const releaseApi = `https://api.github.com/repos/${OWNER}/${REPO}/releases`;
    let release: Record<string, unknown>;
    const tagResponse = await fetch(`${releaseApi}/tags/${encodeURIComponent(version)}`, { headers: githubHeaders });
    if (tagResponse.ok) release = await tagResponse.json();
    else if (tagResponse.status === 404) {
      release = await githubJson(releaseApi, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tag_name: version, target_commitish: BRANCH, name: `Boy-Android SCHEMATICS ${version}`, body: `Installer Boy-Android SCHEMATICS ${version}`, draft: true, prerelease: false }) });
    } else {
      const detail = await tagResponse.text();
      throw new Error(`Tidak dapat memeriksa GitHub Release (${tagResponse.status}): ${detail.slice(0, 400)}`);
    }
    const releaseId = Number(release.id);
    const uploadBase = String(release.upload_url || "").split("{")[0];
    if (!releaseId || !uploadBase) throw new Error("GitHub tidak mengembalikan detail Release yang dapat digunakan.");

    const assets = Array.isArray(release.assets) ? release.assets as Array<Record<string, unknown>> : [];
    const oldAsset = assets.find((asset) => asset.name === fileName);
    if (oldAsset?.id) await githubJson(`https://api.github.com/repos/${OWNER}/${REPO}/releases/assets/${oldAsset.id}`, { method: "DELETE" });

    // GitHub's release-asset endpoint rejects streamed request bodies when the
    // manually declared Content-Length does not match the bytes on the wire.
    // Assemble a fixed-size byte array so fetch can send a body with a known,
    // exact length. The installer is capped at 200 MiB above.
    const fileBytes = new Uint8Array(fileSize);
    let byteOffset = 0;
    for (let partIndex = 0; partIndex < chunkCount; partIndex++) {
      const path = `${prefix}/${String(partIndex).padStart(3, "0")}.part`;
      const { data, error } = await service.storage.from(BUCKET).download(path);
      if (error || !data) throw new Error(`Potongan ${partIndex + 1} tidak ditemukan: ${error?.message || ""}`);
      const expected = Math.min(CHUNK_SIZE, fileSize - partIndex * CHUNK_SIZE);
      if (data.size !== expected) throw new Error(`Ukuran potongan ${partIndex + 1} tidak sesuai.`);
      const partBytes = new Uint8Array(await data.arrayBuffer());
      if (partBytes.byteLength !== expected || byteOffset + partBytes.byteLength > fileBytes.byteLength) {
        throw new Error(`Ukuran potongan ${partIndex + 1} tidak cocok dengan ukuran installer.`);
      }
      fileBytes.set(partBytes, byteOffset);
      byteOffset += partBytes.byteLength;
    }
    if (byteOffset !== fileSize || fileBytes.byteLength !== fileSize) {
      throw new Error(`Ukuran gabungan tidak cocok (${byteOffset}/${fileSize}).`);
    }
    const uploadUrl = `${uploadBase}?name=${encodeURIComponent(fileName)}`;
    const assetResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: { ...githubHeaders, "Content-Type": "application/octet-stream" },
      body: fileBytes,
    });
    const assetText = await assetResponse.text();
    let asset: Record<string, unknown> = {};
    try { asset = assetText ? JSON.parse(assetText) : {}; } catch { /* handled below */ }
    if (!assetResponse.ok) throw new Error(`Unggah ke GitHub gagal (${assetResponse.status}): ${String(asset.message || assetText).slice(0, 500)}`);

    if (release.draft === true) {
      release = await githubJson(`${releaseApi}/${releaseId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: false }) });
    }
    const downloadUrl = `https://github.com/${OWNER}/${REPO}/releases/download/${encodeURIComponent(version)}/${encodeURIComponent(fileName)}`;
    const manifest = { version: legacyVersion, displayVersion: version, legacyVersion, downloadUrl, sha256, schematicsUpdates: updates.map((text) => text.trim()), websiteUpdates: websiteUpdates.map((entry) => ({ title: entry.title.trim(), description: entry.description.trim() })) };

    const commitBody: Record<string, unknown> = {
      message: `Perbarui manifest SCHEMATICS ${version}`,
      content: safeJson(manifest),
      branch: BRANCH,
      sha: currentSha,
    };
    await githubJson(fileApi, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(commitBody) });
    await removeStaging(chunkCount);
    return response({ ok: true, version, downloadUrl, releaseUrl: String(release.html_url || `https://github.com/${OWNER}/${REPO}/releases/tag/${version}`) }, 200, origin);
  } catch (error) {
    console.error("admin-schematics-release publish failed", error);
    await removeStaging(Math.min(chunkCount, 20));
    return response({ error: error instanceof Error ? error.message : "Penerbitan gagal." }, 502, origin);
  }
});
