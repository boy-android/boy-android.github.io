(() => {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/service-worker.js", { scope: "/" })
        .catch(error => console.error("Boy-Android PWA belum dapat diaktifkan:", error));
    });
  }

  let installPrompt = null;
  const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

  const style = document.createElement("style");
  style.textContent = `
    #baInstallButton{position:fixed;right:20px;bottom:20px;z-index:9998;display:inline-flex;align-items:center;gap:9px;padding:12px 17px;border:1px solid #69b3ff;border-radius:999px;background:linear-gradient(100deg,#1685ff,#0754e9);box-shadow:0 10px 28px #00133499;color:#fff;font:700 14px/1.2 system-ui,Segoe UI,sans-serif;cursor:pointer}
    #baInstallButton:hover{filter:brightness(1.1);transform:translateY(-1px)}
    #baInstallDialog{width:min(430px,calc(100% - 32px));padding:0;border:1px solid #31558c;border-radius:18px;background:#0b2045;color:#f4f7ff;box-shadow:0 24px 70px #0009}
    #baInstallDialog::backdrop{background:#020817aa;backdrop-filter:blur(3px)}
    #baInstallDialog .ba-dialog-content{padding:24px;font:15px/1.6 system-ui,Segoe UI,sans-serif}
    #baInstallDialog h2{margin:0 0 10px;font-size:21px}
    #baInstallDialog p{margin:0 0 12px;color:#b9d5ff}
    #baInstallDialog ol{margin:0 0 20px;padding-left:22px;color:#eef3ff}
    #baInstallDialog li{margin:5px 0}
    #baInstallDialog button{padding:9px 15px;border:1px solid #2a5da8;border-radius:9px;background:#102b55;color:#fff;font:700 14px system-ui,Segoe UI,sans-serif;cursor:pointer}
    @media(max-width:600px){#baInstallButton{right:12px;bottom:12px;padding:11px 14px;font-size:13px}}
  `;
  document.head.append(style);

  const button = document.createElement("button");
  button.id = "baInstallButton";
  button.type = "button";
  button.setAttribute("aria-haspopup", "dialog");
  button.textContent = "⇩  Pasang aplikasi";
  button.hidden = isInstalled();

  const dialog = document.createElement("dialog");
  dialog.id = "baInstallDialog";
  dialog.setAttribute("aria-labelledby", "baInstallTitle");
  dialog.innerHTML = `
    <div class="ba-dialog-content">
      <h2 id="baInstallTitle">Pasang Boy-Android di komputer</h2>
      <p>Agar lebih mudah dibuka, pasang Boy-Android sebagai aplikasi dari Chrome:</p>
      <ol>
        <li>Klik menu <strong>⋮</strong> di kanan atas Chrome.</li>
        <li>Pilih <strong>Cast, save and share</strong>.</li>
        <li>Klik <strong>Install page as app</strong> atau <strong>Install Boy-Android</strong>.</li>
        <li>Klik <strong>Install</strong> pada konfirmasi.</li>
      </ol>
      <button type="button" id="baInstallClose">Tutup</button>
    </div>
  `;

  document.body.append(button, dialog);
  dialog.querySelector("#baInstallClose").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });

  button.addEventListener("click", async () => {
    if (isInstalled()) {
      button.hidden = true;
      return;
    }
    if (!installPrompt) {
      dialog.showModal();
      return;
    }
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
  });

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
  });
  window.addEventListener("appinstalled", () => {
    button.hidden = true;
    installPrompt = null;
  });
})();
