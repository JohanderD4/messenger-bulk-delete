function formatDate(timestamp) {
  if (!timestamp) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(timestamp));
}

function isMessagesUrl(url) {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname.toLowerCase();

    if (host === "messenger.com") {
      return true;
    }

    if (host === "facebook.com") {
      return path === "/messages" || path.startsWith("/messages/");
    }

    return false;
  } catch {
    return false;
  }
}

function renderLastRun(data) {
  const element = document.getElementById("last-run-text");
  if (!element) {
    return;
  }

  const lastRun = data?.lastRun;
  const progress = data?.progress;

  if (progress?.running) {
    element.textContent = `En progreso… ${progress.deletedCount} chat(s) eliminado(s).`;
    return;
  }

  if (!lastRun?.timestamp) {
    element.textContent = "Aún no se ha ejecutado.";
    return;
  }

  const count = lastRun.deletedCount ?? 0;
  const when = formatDate(lastRun.timestamp);
  element.textContent =
    count === 1
      ? `1 chat eliminado el ${when}.`
      : `${count} chats eliminados el ${when}.`;
}

function setPageStatus(type, message) {
  const element = document.getElementById("page-status");
  if (!element) {
    return;
  }

  element.className = type;
  element.textContent = message;
}

async function initPopup() {
  const startButton = document.getElementById("start-btn");
  if (!startButton) {
    return;
  }

  chrome.storage.local.get(["lastRun", "progress"], (result) => {
    renderLastRun(result);
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const supported = isMessagesUrl(tab?.url);

  if (!supported) {
    setPageStatus(
      "warn",
      "Abre facebook.com/messages en esta pestaña para usar la extensión."
    );
    startButton.disabled = true;
    return;
  }

  setPageStatus("ok", "Pestaña compatible detectada. Puedes iniciar la eliminación.");
  startButton.disabled = false;

  startButton.addEventListener("click", async () => {
    startButton.disabled = true;
    startButton.textContent = "Iniciando…";

    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: "START_BULK_DELETE" });
      if (response?.ok) {
        setPageStatus("ok", "Eliminación iniciada. Revisa la pestaña de mensajes.");
        window.close();
        return;
      }

      setPageStatus(
        "error",
        "No se pudo conectar con la página. Recarga facebook.com/messages e inténtalo de nuevo."
      );
    } catch {
      setPageStatus(
        "error",
        "La extensión no está activa en esta pestaña. Recarga la página de mensajes (F5) y vuelve a intentarlo."
      );
    } finally {
      startButton.disabled = false;
      startButton.textContent = "Eliminar todos los chats";
    }
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  chrome.storage.local.get(["lastRun", "progress"], renderLastRun);
});

initPopup();
