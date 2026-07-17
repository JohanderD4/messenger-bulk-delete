chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "DELETION_COMPLETE") {
    const count = message.deletedCount ?? 0;
    const title = "Messenger Bulk Delete";
    const body =
      count === 0
        ? "No se encontraron conversaciones para eliminar."
        : count === 1
          ? "Se eliminó 1 chat correctamente."
          : `Se eliminaron ${count} chats correctamente.`;

    chrome.notifications.create(`messenger-bulk-delete-${Date.now()}`, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title,
      message: body,
      priority: 2
    });

    chrome.storage.local.set({
      lastRun: {
        timestamp: Date.now(),
        deletedCount: count
      }
    });

    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "DELETION_PROGRESS") {
    chrome.storage.local.set({
      progress: {
        deletedCount: message.deletedCount ?? 0,
        running: message.running ?? false,
        timestamp: Date.now()
      }
    });
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
