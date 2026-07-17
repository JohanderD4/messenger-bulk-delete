(() => {
  "use strict";

  const LOG_PREFIX = "[Messenger Bulk Delete]";
  const MAX_ATTEMPTS = 8;
  const RETRY_DELAY_MS = 700;
  const POST_DELETE_WAIT_MS = 900;
  const POST_DELETE_FALLBACK_MS = 1800;
  const EMPTY_LIST_WAIT_MS = 2500;
  const LOADING_WAIT_MS = 1500;
  const MENU_WAIT_MS = 3500;
  const DIALOG_WAIT_MS = 4000;
  const DISAPPEAR_WAIT_MS = 5000;
  const MENU_OPEN_DELAY_MS = 220;
  const POLL_INTERVAL_MS = 100;

  const DELETE_CHAT_LABELS = [
    "delete chat",
    "eliminar chat",
    "borrar chat",
    "supprimer la discussion",
    "supprimer le chat",
    "löschen",
    "elimina chat"
  ];

  const MORE_OPTIONS_LABELS = [
    "more",
    "options",
    "opciones",
    "mas opciones",
    "más opciones",
    "más",
    "menu",
    "menú",
    "conversation settings",
    "configuración de la conversación",
    "configuracion de la conversacion",
    "configuración",
    "settings",
    "acciones"
  ];

  const LOADING_LABELS = [
    "loading",
    "cargando",
    "please wait",
    "espera"
  ];

  let isRunning = false;
  let deletedCount = 0;
  let floatingButton = null;
  let statusBadge = null;
  let uiRoot = null;
  let lastKnownPath = location.pathname;

  function isFacebookHost() {
    return /(^|\.)facebook\.com$/i.test(location.hostname);
  }

  function isMessagesPage() {
    if (/messenger\.com$/i.test(location.hostname)) {
      return true;
    }

    if (isFacebookHost()) {
      const path = location.pathname.toLowerCase();
      return path === "/messages" || path.startsWith("/messages/");
    }

    return false;
  }

  function log(message, ...args) {
    console.log(`${LOG_PREFIX} ${message}`, ...args);
  }

  function warn(message, ...args) {
    console.warn(`${LOG_PREFIX} ${message}`, ...args);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function normalizeText(value) {
    return (value || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function textMatchesAny(text, candidates) {
    const normalized = normalizeText(text);
    if (!normalized) {
      return false;
    }

    return candidates.some((candidate) => {
      const needle = normalizeText(candidate);
      return normalized.includes(needle) || needle.includes(normalized);
    });
  }

  function isVisible(element) {
    if (!element || !element.isConnected) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isDisabled(element) {
    return (
      element.getAttribute("aria-disabled") === "true" ||
      element.hasAttribute("disabled") ||
      element.getAttribute("aria-hidden") === "true"
    );
  }

  function getAccessibleName(element) {
    if (!element) {
      return "";
    }

    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const labels = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((node) => node.textContent)
        .join(" ");
      if (labels.trim()) {
        return labels;
      }
    }

    return (
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      element.textContent ||
      ""
    );
  }

  function isClickable(element) {
    if (!element || !isVisible(element) || isDisabled(element)) {
      return false;
    }

    const tag = element.tagName;
    const role = element.getAttribute("role");
    return (
      tag === "BUTTON" ||
      tag === "A" ||
      role === "button" ||
      role === "menuitem" ||
      role === "menuitemradio" ||
      role === "menuitemcheckbox" ||
      role === "option" ||
      element.getAttribute("tabindex") !== null
    );
  }

  function dispatchPointerEvents(element) {
    const options = { bubbles: true, cancelable: true, view: window };
    element.dispatchEvent(new MouseEvent("mouseover", options));
    element.dispatchEvent(new MouseEvent("mouseenter", options));
    element.dispatchEvent(new PointerEvent("pointerover", options));
    element.dispatchEvent(new PointerEvent("pointerenter", options));
  }

  function clickElement(element) {
    if (!element) {
      return false;
    }

    dispatchPointerEvents(element);
    element.focus?.({ preventScroll: true });

    const options = { bubbles: true, cancelable: true, view: window };
    element.dispatchEvent(new PointerEvent("pointerdown", options));
    element.dispatchEvent(new MouseEvent("mousedown", options));
    element.dispatchEvent(new PointerEvent("pointerup", options));
    element.dispatchEvent(new MouseEvent("mouseup", options));
    element.dispatchEvent(new MouseEvent("click", options));

    if (typeof element.click === "function") {
      element.click();
    }

    return true;
  }

  function waitFor(condition, timeoutMs, intervalMs = POLL_INTERVAL_MS) {
    return new Promise((resolve) => {
      const startedAt = Date.now();

      const checkNow = () => {
        try {
          const result = condition();
          if (result) {
            cleanup();
            resolve(result);
            return true;
          }
        } catch (error) {
          warn("Error evaluando condición de espera:", error);
        }

        if (Date.now() - startedAt >= timeoutMs) {
          cleanup();
          resolve(null);
          return true;
        }

        return false;
      };

      if (checkNow()) {
        return;
      }

      const observer = new MutationObserver(() => {
        checkNow();
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-hidden", "aria-expanded", "style", "class"]
      });

      const timer = setInterval(() => {
        checkNow();
      }, intervalMs);

      function cleanup() {
        observer.disconnect();
        clearInterval(timer);
      }
    });
  }

  async function retry(action, description, maxAttempts = MAX_ATTEMPTS) {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const result = await action();
      if (result) {
        return result;
      }

      warn(`${description}: intento ${attempt}/${maxAttempts} sin éxito.`);
      if (attempt < maxAttempts) {
        await sleep(RETRY_DELAY_MS);
      }
    }

    return null;
  }

  function findSidebarRoot() {
    const selectors = [
      '[aria-label*="Chats" i]',
      '[aria-label*="Chat list" i]',
      '[aria-label*="Lista de chats" i]',
      '[aria-label*="Conversaciones" i]',
      '[aria-label*="Lista de conversaciones" i]',
      '[aria-label*="Messenger" i]',
      '[role="navigation"]'
    ];

    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node && isVisible(node)) {
        return node;
      }
    }

    const threadLink = document.querySelector(
      'a[href*="/messages/t/"], a[href*="/messages/e2ee/t/"], a[href*="/t/"]'
    );
    if (threadLink) {
      const grid = threadLink.closest('[role="grid"], [role="list"], [role="listbox"]');
      if (grid && isVisible(grid)) {
        return grid;
      }

      const container = threadLink.closest("div");
      if (container) {
        return container.parentElement || container;
      }
    }

    const grids = [...document.querySelectorAll('[role="grid"]')].filter(isVisible);
    if (grids.length) {
      return grids.sort(
        (a, b) => b.querySelectorAll('[role="row"], a[href*="/messages/t/"]').length -
          a.querySelectorAll('[role="row"], a[href*="/messages/t/"]').length
      )[0];
    }

    return document.body;
  }

  function rowLooksLikeConversation(row) {
    if (!row || !isVisible(row)) {
      return false;
    }

    const text = normalizeText(row.textContent);
    if (!text || text.length < 1) {
      return false;
    }

    const ignorePatterns = [
      "new message",
      "nuevo mensaje",
      "search",
      "buscar",
      "messenger",
      "meta ai",
      "archived",
      "archivados",
      "marketplace",
      "requests",
      "solicitudes",
      "communities",
      "comunidades"
    ];

    if (ignorePatterns.some((pattern) => text === normalizeText(pattern))) {
      return false;
    }

    const hasThreadLink = Boolean(
      row.querySelector('a[href*="/messages/t/"]') ||
        row.querySelector('a[href*="/messages/e2ee/t/"]') ||
        row.querySelector('a[href*="/t/"]') ||
        row.querySelector('a[href*="thread_id"]') ||
        row.querySelector('[data-testid*="thread"]')
    );

    if (row.matches('a[href*="/messages/t/"], a[href*="/messages/e2ee/t/"], a[href*="/t/"]')) {
      return true;
    }

    const role = row.getAttribute("role");
    const isRowLike = role === "row" || role === "listitem" || role === "gridcell";

    return hasThreadLink || (isRowLike && text.length > 2);
  }

  function resolveConversationRow(node) {
    if (!node) {
      return null;
    }

    if (rowLooksLikeConversation(node)) {
      return node;
    }

    const row = node.closest('[role="row"], [role="listitem"], [role="gridcell"]');
    if (row && rowLooksLikeConversation(row)) {
      return row;
    }

    if (node.matches('a[href*="/messages/t/"], a[href*="/messages/e2ee/t/"], a[href*="/t/"]')) {
      const linkRow = node.closest('[role="row"], [role="listitem"]') || node.parentElement || node;
      if (rowLooksLikeConversation(linkRow)) {
        return linkRow;
      }
      return linkRow;
    }

    return null;
  }

  function getConversationRows() {
    const sidebar = findSidebarRoot();
    const candidates = new Set();
    const selectors = [
      '[role="row"]',
      '[role="listitem"]',
      'a[href*="/messages/t/"]',
      'a[href*="/messages/e2ee/t/"]',
      'a[href*="/t/"]'
    ];

    selectors.forEach((selector) => {
      sidebar.querySelectorAll(selector).forEach((node) => {
        const row = resolveConversationRow(node);
        if (row) {
          candidates.add(row);
        }
      });
    });

    const rows = [...candidates].filter(isVisible);
    rows.sort((a, b) => {
      const topDiff = a.getBoundingClientRect().top - b.getBoundingClientRect().top;
      if (Math.abs(topDiff) > 2) {
        return topDiff;
      }

      const position = a.compareDocumentPosition(b);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1;
      }
      if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        return 1;
      }

      return 0;
    });

    return rows;
  }

  function isMessengerLoading() {
    const busy = document.querySelector('[aria-busy="true"]');
    if (busy && isVisible(busy)) {
      return true;
    }

    const progress = document.querySelector('[role="progressbar"]');
    if (progress && isVisible(progress)) {
      return true;
    }

    return [...document.querySelectorAll("[aria-label], [role='status']")].some((node) => {
      if (!isVisible(node)) {
        return false;
      }
      return textMatchesAny(getAccessibleName(node), LOADING_LABELS);
    });
  }

  function findMoreOptionsButton(scope) {
    const buttons = [...scope.querySelectorAll("button, [role='button']")].filter(isClickable);

    const popupButton = buttons.find(
      (button) => button.getAttribute("aria-haspopup") === "menu" && isVisible(button)
    );
    if (popupButton) {
      return popupButton;
    }

    const byLabel = buttons.find((button) => {
      const name = getAccessibleName(button);
      return textMatchesAny(name, MORE_OPTIONS_LABELS);
    });
    if (byLabel) {
      return byLabel;
    }

    const ellipsisButton = buttons.find((button) => {
      const label = normalizeText(getAccessibleName(button));
      const text = normalizeText(button.textContent);
      return label === "..." || text === "..." || label.includes("⋯") || text.includes("⋯");
    });
    if (ellipsisButton) {
      return ellipsisButton;
    }

    const fallback = buttons.find((button) => {
      const name = normalizeText(getAccessibleName(button));
      return name.length > 0 && name.length <= 40;
    });

    return fallback || null;
  }

  function findMenuItems() {
    const menus = [...document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"]')]
      .filter(isVisible)
      .sort((a, b) => {
        const zA = Number(window.getComputedStyle(a).zIndex) || 0;
        const zB = Number(window.getComputedStyle(b).zIndex) || 0;
        return zB - zA;
      });

    for (const menu of menus) {
      const items = [...menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], button, [role="button"]')]
        .filter(isClickable);

      if (items.length) {
        return items;
      }
    }

    return [...document.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]')]
      .filter(isClickable)
      .filter(isVisible);
  }

  function findDeleteChatMenuItem() {
    const items = findMenuItems();
    return (
      items.find((item) => textMatchesAny(getAccessibleName(item), DELETE_CHAT_LABELS)) ||
      items.find((item) => textMatchesAny(item.textContent, DELETE_CHAT_LABELS)) ||
      null
    );
  }

  function findConfirmationDialog() {
    const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter(isVisible);
    return (
      dialogs.find((dialog) =>
        textMatchesAny(dialog.textContent, DELETE_CHAT_LABELS.concat(["delete", "eliminar", "borrar"]))
      ) || dialogs[0] || null
    );
  }

  function findConfirmDeleteButton(dialog) {
    const scope = dialog || document;
    const buttons = [...scope.querySelectorAll("button, [role='button']")].filter(isClickable);

    const primary = buttons.find((button) => {
      const name = getAccessibleName(button);
      return textMatchesAny(name, DELETE_CHAT_LABELS);
    });
    if (primary) {
      return primary;
    }

    const destructive = buttons.find((button) => {
      const name = normalizeText(getAccessibleName(button));
      return (
        name.includes("delete") ||
        name.includes("eliminar") ||
        name.includes("borrar") ||
        name.includes("confirm")
      );
    });

    return destructive || null;
  }

  function updateStatus(message) {
    if (!statusBadge) {
      return;
    }

    statusBadge.textContent = message;
    statusBadge.classList.add("mbd-visible");
  }

  function reportProgress(running) {
    chrome.runtime.sendMessage({
      type: "DELETION_PROGRESS",
      deletedCount,
      running
    });
  }

  async function waitForConversationRemoval(previousRow) {
    const previousText = normalizeText(previousRow?.textContent || "");
    const previousTop = previousRow?.getBoundingClientRect?.().top ?? null;

    const removed = await waitFor(() => {
      if (!previousRow?.isConnected) {
        return true;
      }

      if (!isVisible(previousRow)) {
        return true;
      }

      const currentText = normalizeText(previousRow.textContent || "");
      if (previousText && currentText !== previousText) {
        return true;
      }

      if (previousTop !== null) {
        const currentTop = previousRow.getBoundingClientRect().top;
        if (Math.abs(currentTop - previousTop) > 8 && getConversationRows()[0] !== previousRow) {
          return true;
        }
      }

      return false;
    }, DISAPPEAR_WAIT_MS);

    if (removed) {
      log("Chat eliminado.");
      await sleep(POST_DELETE_WAIT_MS);
    } else {
      warn("No se detectó la desaparición del chat; se continuará con el siguiente.");
      await sleep(POST_DELETE_FALLBACK_MS);
    }
  }

  async function openConversationMenu(row) {
    row.scrollIntoView({ block: "nearest", behavior: "auto" });
    dispatchPointerEvents(row);
    clickElement(row);
    await sleep(MENU_OPEN_DELAY_MS);

    let menuButton = null;
    let scope = row;

    for (let depth = 0; depth < 8 && scope; depth += 1) {
      dispatchPointerEvents(scope);
      menuButton = findMoreOptionsButton(scope);
      if (menuButton) {
        break;
      }
      scope = scope.parentElement;
    }

    if (!menuButton) {
      menuButton = findMoreOptionsButton(findSidebarRoot());
    }

    if (!menuButton) {
      return null;
    }

    log("Abriendo menú...");
    clickElement(menuButton);

    const menuItem = await waitFor(() => findDeleteChatMenuItem(), MENU_WAIT_MS);
    return menuItem;
  }

  async function confirmDeletion() {
    const dialog = await waitFor(() => findConfirmationDialog(), DIALOG_WAIT_MS);
    if (!dialog) {
      return false;
    }

    log("Confirmando eliminación...");
    const confirmButton = await waitFor(() => findConfirmDeleteButton(dialog), DIALOG_WAIT_MS);
    if (!confirmButton) {
      return false;
    }

    clickElement(confirmButton);
    return true;
  }

  async function deleteSingleConversation(row) {
    const menuItem = await retry(() => openConversationMenu(row), "Abrir menú contextual");
    if (!menuItem) {
      warn("No se pudo abrir el menú; se pasa a la siguiente conversación.");
      return false;
    }

    log("Click en Delete chat...");
    clickElement(menuItem);

    const confirmed = await retry(() => confirmDeletion(), "Confirmar eliminación", 6);
    if (!confirmed) {
      warn("No se pudo confirmar la eliminación; se pasa a la siguiente conversación.");
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await sleep(250);
      return false;
    }

    await waitForConversationRemoval(row);
    deletedCount += 1;
    reportProgress(true);
    updateStatus(`Eliminados: ${deletedCount}`);
    return true;
  }

  async function waitForConversations() {
    if (isMessengerLoading()) {
      log("Messenger está cargando conversaciones, esperando...");
      updateStatus("Esperando a que carguen los chats...");
      await sleep(LOADING_WAIT_MS);
    }

    let rows = getConversationRows();
    if (rows.length) {
      return rows;
    }

    log("No hay chats visibles; esperando nuevas conversaciones...");
    updateStatus("Esperando chats en la lista...");

    rows = await waitFor(() => {
      const found = getConversationRows();
      return found.length ? found : null;
    }, EMPTY_LIST_WAIT_MS);

    return rows || [];
  }

  async function runBulkDelete() {
    if (isRunning) {
      return;
    }

    isRunning = true;
    deletedCount = 0;

    if (floatingButton) {
      floatingButton.disabled = true;
      floatingButton.textContent = "Eliminando chats...";
    }

    updateStatus("Iniciando eliminación...");
    reportProgress(true);
    log("Inicio del proceso de eliminación masiva.");

    let emptyPasses = 0;

    while (isRunning) {
      const rows = await waitForConversations();

      if (!rows.length) {
        emptyPasses += 1;
        if (emptyPasses >= 3) {
          log("No quedan conversaciones por eliminar.");
          break;
        }

        await sleep(EMPTY_LIST_WAIT_MS);
        continue;
      }

      emptyPasses = 0;
      const firstRow = rows[0];
      updateStatus(`Procesando chat… (${deletedCount} eliminados)`);

      try {
        await deleteSingleConversation(firstRow);
      } catch (error) {
        warn("Error inesperado eliminando un chat:", error);
        await sleep(RETRY_DELAY_MS);
      }
    }

    isRunning = false;

    if (floatingButton) {
      floatingButton.disabled = false;
      floatingButton.textContent = "Eliminar todos los chats";
    }

    updateStatus(`Finalizado. ${deletedCount} chat(s) eliminado(s).`);
    reportProgress(false);

    chrome.runtime.sendMessage({
      type: "DELETION_COMPLETE",
      deletedCount
    });

    log(`Proceso finalizado. Total eliminados: ${deletedCount}.`);
  }

  function removeUi() {
    if (uiRoot?.isConnected) {
      uiRoot.remove();
    }

    uiRoot = null;
    floatingButton = null;
    statusBadge = null;
  }

  function createUi() {
    if (!isMessagesPage()) {
      removeUi();
      return;
    }

    if (!document.body) {
      return;
    }

    if (document.getElementById("mbd-root")) {
      floatingButton = document.getElementById("mbd-floating-btn");
      statusBadge = document.getElementById("mbd-status-badge");
      return;
    }

    uiRoot = document.createElement("div");
    uiRoot.id = "mbd-root";

    floatingButton = document.createElement("button");
    floatingButton.id = "mbd-floating-btn";
    floatingButton.type = "button";
    floatingButton.textContent = "Eliminar todos los chats";
    floatingButton.setAttribute("aria-label", "Eliminar todos los chats de Messenger");
    floatingButton.addEventListener("click", () => {
      runBulkDelete();
    });

    statusBadge = document.createElement("div");
    statusBadge.id = "mbd-status-badge";
    statusBadge.setAttribute("aria-live", "polite");

    uiRoot.appendChild(floatingButton);
    uiRoot.appendChild(statusBadge);
    document.body.appendChild(uiRoot);
  }

  function handleRouteChange() {
    if (location.pathname !== lastKnownPath) {
      lastKnownPath = location.pathname;
      log(`Ruta detectada: ${location.pathname}`);
    }

    createUi();
  }

  function init() {
    handleRouteChange();
    log(`Extensión cargada (${location.hostname}${location.pathname}).`);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "START_BULK_DELETE") {
      if (!isMessagesPage()) {
        sendResponse({ ok: false, reason: "not_messages_page" });
        return false;
      }

      createUi();
      runBulkDelete();
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type === "PING") {
      sendResponse({ ok: true, messagesPage: isMessagesPage() });
      return true;
    }

    return false;
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  window.addEventListener("popstate", handleRouteChange);
  window.addEventListener("hashchange", handleRouteChange);

  const originalPushState = history.pushState.bind(history);
  history.pushState = (...args) => {
    originalPushState(...args);
    handleRouteChange();
  };

  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = (...args) => {
    originalReplaceState(...args);
    handleRouteChange();
  };

  const routeObserver = new MutationObserver(() => {
    handleRouteChange();
  });

  routeObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  setInterval(handleRouteChange, 1500);
})();
