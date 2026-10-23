if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js", { scope: "/" })
      .catch(error => console.error("Boy-Android PWA belum dapat diaktifkan:", error));
  });
}
