// Shared date check for account access expiry. Expiry dates stay valid through
// the end of the selected day in Indonesia's WIB timezone.
(() => {
  const timeZone = "Asia/Jakarta";
  let countdownInterval;

  function today() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  }

  function isExpired(access) {
    return Boolean(access?.expires_on && access.expires_on < today());
  }

  function formatDate(value) {
    if (!value) return "Tanpa batas waktu";
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone
    }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  }

  function mountCountdown(element, expiresOn) {
    if (!element) return;
    window.clearInterval(countdownInterval);
    element.hidden = false;
    if (!expiresOn) {
      element.textContent = "Sisa masa berlaku: Tanpa batas";
      return;
    }

    const [year, month, day] = expiresOn.split("-").map(Number);
    // Expiry stays valid until midnight WIB at the start of the next day.
    const deadline = Date.UTC(year, month - 1, day + 1) - (7 * 60 * 60 * 1000);
    const update = () => {
      const remaining = Math.max(0, deadline - Date.now());
      const totalMinutes = Math.ceil(remaining / 60000);
      const days = Math.floor(totalMinutes / 1440);
      const hours = Math.floor((totalMinutes % 1440) / 60);
      const minutes = totalMinutes % 60;
      element.textContent = remaining > 0
        ? `Sisa masa berlaku: ${days} hari; ${String(hours).padStart(2, "0")} jam; ${String(minutes).padStart(2, "0")} menit`
        : "Masa berlaku akun telah habis";
      element.classList.toggle("is-expired", remaining <= 0);
    };

    update();
    countdownInterval = window.setInterval(update, 60000);
  }

  window.BoyAccountExpiry = { today, isExpired, formatDate, mountCountdown };
})();
