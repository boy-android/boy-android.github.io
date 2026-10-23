// One-account/one-browser-profile admission check. The browser ID is an
// installation token, not a hardware identifier. Keep it across page loads.
(() => {
  const STORAGE_KEY = "boyAndroidDeviceId";

  function getDeviceId() {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
          });
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  }

  async function claim(client) {
    let deviceId;
    try {
      deviceId = getDeviceId();
    } catch (error) {
      await client.auth.signOut({ scope: "local" });
      return { allowed: false, reason: "storage", error };
    }

    const { data, error } = await client.rpc("claim_account_device", {
      p_device_id: deviceId
    });
    if (error) {
      await client.auth.signOut({ scope: "local" });
      return { allowed: false, reason: "setup", error };
    }
    if (data !== true) {
      await client.auth.signOut({ scope: "local" });
      return { allowed: false, reason: "occupied" };
    }
    return { allowed: true, deviceId };
  }

  async function release(client) {
    try {
      const id = localStorage.getItem(STORAGE_KEY);
      if (id) await client.rpc("release_account_device", { p_device_id: id });
    } catch (_) {
      // Sign-out should still proceed if storage or the release RPC is unavailable.
    }
  }

  window.BoyDeviceLock = { claim, release };
})();
