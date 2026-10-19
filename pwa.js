/* Instalação do aplicativo. A lógica da central permanece em app.js. */
(() => {
  "use strict";

  const banner = document.getElementById("pwaInstallBanner");
  const installButton = document.getElementById("pwaInstallButton");
  const description = document.getElementById("pwaInstallDescription");
  const help = document.getElementById("pwaInstallHelp");
  const helpText = document.getElementById("pwaHelpText");
  const dismissKey = "fenix-install-dismissed:" + new URL(".", location.href).pathname;
  const standalone = window.matchMedia("(display-mode: standalone)");
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(navigator.userAgent);
  let installPrompt = null;
  let installedThisSession = false;
  let dismissedThisSession = false;

  function isInstalledWindow() {
    return standalone.matches || navigator.standalone === true || installedThisSession;
  }

  function recentlyDismissed() {
    try {
      const dismissedAt = Number(localStorage.getItem(dismissKey));
      return dismissedAt > 0 && Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  }

  function renderInstall() {
    banner.hidden = isInstalledWindow() || dismissedThisSession || recentlyDismissed();
    installButton.textContent = installPrompt ? "Instalar app" : "Como instalar";
    description.textContent = isIos
      ? "Adicione à Tela de Início para abrir pelo ícone, como um aplicativo."
      : "Instale para abrir pelo ícone, em uma janela própria.";
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    renderInstall();
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    installedThisSession = true;
    banner.hidden = true;
    if (help.open && typeof help.close === "function") help.close();
  });

  if (typeof standalone.addEventListener === "function") {
    standalone.addEventListener("change", renderInstall);
  }

  document.getElementById("pwaInstallDismiss").addEventListener("click", () => {
    dismissedThisSession = true;
    banner.hidden = true;
    try { localStorage.setItem(dismissKey, String(Date.now())); } catch { /* armazenamento opcional */ }
  });

  installButton.addEventListener("click", async () => {
    if (!installPrompt) {
      helpText.textContent = isIos
        ? "Abra este link no Safari, toque em Compartilhar e escolha Adicionar à Tela de Início. Se aparecer a opção Abrir como App, mantenha-a ativada e confirme em Adicionar."
        : isAndroid
          ? "Abra este link no Chrome. No menu de três pontos, escolha Instalar app ou Adicionar à tela inicial e confirme. Se abriu pelo WhatsApp ou outro aplicativo, use Abrir no navegador primeiro."
          : "No Chrome ou Edge, procure o ícone de instalação na barra de endereço ou a opção de instalar este site no menu do navegador. No Safari do Mac, use Arquivo e Adicionar ao Dock.";
      if (typeof help.showModal === "function") help.showModal();
      else help.setAttribute("open", "");
      return;
    }

    const prompt = installPrompt;
    installPrompt = null;
    installButton.disabled = true;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") installedThisSession = true;
      renderInstall();
    } catch {
      renderInstall();
      description.textContent = "Use o menu do navegador para instalar. Toque em Como instalar para ver o passo a passo.";
    } finally {
      installButton.disabled = false;
    }
  });

  document.getElementById("pwaHelpClose").addEventListener("click", () => {
    if (typeof help.close === "function") help.close();
    else help.removeAttribute("open");
  });

  renderInstall();

  if ("serviceWorker" in navigator && window.isSecureContext) {
    // A atualização entra em uso depois de fechar as janelas do app, sem recarregar o painel em operação.
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js", { scope: "./", updateViaCache: "none" })
        .catch(error => console.warn("Registro do aplicativo:", error.message));
    }, { once: true });
  }
})();
