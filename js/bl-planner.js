(function() {
  "use strict";
  const STORAGE_KEY = "cafe-bl-planner-selection";
  const MAP_FILTER_ALL = "all";
  let catalog = null;
  let selectedMapId = "";
  let selectedFloorIndex = null;
  let hubView = "browser";
  let canvasUiBound = false;
  let canvasFullscreenBound = false;
  function escapeHtml(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function getPageEl() {
    return document.getElementById("page-bl-planner");
  }
  function getHubEl() {
    return document.getElementById("bl-planner-hub");
  }
  function getCanvasEl() {
    return document.getElementById("bl-planner-canvas");
  }
  function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
  }
  function requestCanvasFullscreen(canvasEl) {
    if (!canvasEl || getFullscreenElement()) return;
    const req = canvasEl.requestFullscreen || canvasEl.webkitRequestFullscreen || canvasEl.msRequestFullscreen;
    if (!req) return;
    try {
      const result = req.call(canvasEl);
      if (result && typeof result.catch === "function") result.catch(() => {
      });
    } catch {
    }
  }
  function exitCanvasFullscreen() {
    if (!getFullscreenElement()) return;
    const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (!exit) return;
    try {
      const result = exit.call(document);
      if (result && typeof result.catch === "function") result.catch(() => {
      });
    } catch {
    }
  }
  function readStoredSelection() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return {
        mapId: String(parsed.mapId || ""),
        floorIndex: Number(parsed.floorIndex),
        hubView: parsed.hubView === "map" ? "map" : "browser"
      };
    } catch {
      return null;
    }
  }
  function writeStoredSelection() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          mapId: selectedMapId,
          floorIndex: selectedFloorIndex,
          hubView
        })
      );
    } catch {
    }
  }
  async function loadCatalog() {
    const res = await fetch("data/r6-map-layouts.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("catalog_fetch_failed");
    return res.json();
  }
  function getMapById(mapId) {
    return catalog?.maps?.find((m) => m.id === mapId) || null;
  }
  function getSelectedMap() {
    if (!selectedMapId) return null;
    return getMapById(selectedMapId);
  }
  function getSelectedFloor(map) {
    if (!map?.floors?.length) return null;
    const found = map.floors.find((f) => f.index === selectedFloorIndex);
    return found || map.floors[0];
  }
  function mapHasBlueprints(map) {
    return Boolean(map?.floors?.some((f) => (f.imageUrl || "").trim()));
  }
  function applyInitialSelection() {
    const stored = readStoredSelection();
    const maps = catalog?.maps || [];
    if (!maps.length) return;
    if (stored?.mapId && maps.some((m) => m.id === stored.mapId)) {
      selectedMapId = stored.mapId;
      const map = getMapById(stored.mapId);
      const floorOk = map?.floors?.some((f) => f.index === stored.floorIndex);
      selectedFloorIndex = floorOk ? stored.floorIndex : map?.floors?.[0]?.index ?? null;
      if (stored.hubView === "map" && mapHasBlueprints(map)) {
        hubView = "map";
      } else {
        hubView = "browser";
      }
      return;
    }
    selectedMapId = "";
    selectedFloorIndex = null;
    hubView = "browser";
  }
  function browserShellHtml() {
    return `
            <section id="bl-planner-browser" class="aim-trainer-browser bg-matte-900 rounded-lg border border-matte-800 p-6" aria-label="Siege maps">
                <div class="aim-trainer-browser-toolbar bl-planner-browser-toolbar">
                    <div class="aim-trainer-browser-search flex flex-col min-w-0">
                        <span class="text-sm font-bold tracking-widest uppercase text-white">Search</span>
                        <div id="bl-planner-map-pick" class="tool-picklist w-full" data-value="">
                            <div class="tool-picklist-control tool-picklist-control--has-icon aim-trainer-search-control ui-interactive">
                                <i class="ri-search-line tool-picklist-leading-icon" aria-hidden="true"></i>
                                <input id="bl-planner-map-input" type="text" class="tool-picklist-input w-full" placeholder="All maps" autocomplete="off" spellcheck="false" aria-label="Filter maps">
                                <i class="tool-picklist-chevron fa-solid fa-chevron-down text-xs text-slate-400" aria-hidden="true"></i>
                            </div>
                            <div id="bl-planner-map-menu" class="tool-picklist-menu dropdown-closed" role="listbox" aria-label="Map options"></div>
                        </div>
                    </div>
                </div>
                <div class="aim-trainer-browser-body">
                    <div id="bl-planner-map-list" class="aim-trainer-list aim-trainer-browser-pane grid grid-cols-1 sm:grid-cols-2" role="list"></div>
                    <p id="bl-planner-map-list-empty" class="aim-trainer-list-empty aim-trainer-browser-pane text-sm text-slate-400 tracking-wide text-center py-8" hidden>No maps match your search.</p>
                </div>
            </section>`;
  }
  function getMapPicklistQuery(pick) {
    const input = pick?.querySelector(".tool-picklist-input");
    return (input?.value || "").trim().toLowerCase();
  }
  function buildMapPicklistParts() {
    return [
      { id: MAP_FILTER_ALL, name: "All maps", search: "all maps" },
      ...(catalog.maps || []).map((m) => ({
        id: m.id,
        name: m.name,
        search: m.name
      }))
    ];
  }
  function getFilteredMaps(pick) {
    const maps = catalog?.maps || [];
    const selectedId = (pick?.dataset.value || MAP_FILTER_ALL).trim();
    if (selectedId && selectedId !== MAP_FILTER_ALL) {
      return maps.filter((m) => m.id === selectedId);
    }
    let q = getMapPicklistQuery(pick);
    if (q === "all maps") q = "";
    if (!q) return maps;
    return maps.filter((m) => {
      const hay = `${m.name} ${m.id}`.toLowerCase();
      return hay.includes(q);
    });
  }
  function mapFloorSummary(map) {
    const floors = map.floors || [];
    if (!floors.length) return "No floors in catalog";
    const labels = floors.map((f) => f.label).join(", ");
    const n = floors.length;
    const ready = floors.filter((f) => (f.imageUrl || "").trim()).length;
    const readyNote = ready > 0 ? `${ready}/${n} blueprints ready \xB7 ` : "";
    return `${readyNote}${n} floor${n === 1 ? "" : "s"} \xB7 ${labels}`;
  }
  function renderMapList() {
    const list = document.getElementById("bl-planner-map-list");
    const empty = document.getElementById("bl-planner-map-list-empty");
    const pick = document.getElementById("bl-planner-map-pick");
    if (!list || !catalog) return;
    const filtered = getFilteredMaps(pick);
    list.innerHTML = filtered.map((map) => {
      const floorCount = map.floors?.length || 0;
      const isSelected = map.id === selectedMapId && hubView === "browser";
      const summary = mapFloorSummary(map);
      const ready = mapHasBlueprints(map);
      return `
            <button type="button" class="aim-trainer-card bl-planner-map-card ui-interactive bg-matte-950 rounded-lg border border-matte-800 text-left${isSelected ? " bl-planner-map-card--selected" : ""}" data-map-id="${escapeHtml(map.id)}" data-map-ready="${ready ? "1" : "0"}" role="listitem" aria-label="${escapeHtml(map.name)}, ${floorCount} floors${ready ? ", blueprints ready" : ""}">
                <div class="aim-trainer-card-header">
                    <span class="aim-trainer-card-icon w-10 h-10 rounded-lg bg-matte-900 border border-matte-800 flex items-center justify-center text-redneon-500 shrink-0">
                        <i class="fa-solid fa-map text-sm" aria-hidden="true"></i>
                    </span>
                    <div class="aim-trainer-card-header-tags">
                        <span class="aim-trainer-card-difficulty aim-trainer-card-difficulty--${ready ? "easy" : "medium"}" data-difficulty="floors">${ready ? "Ready" : `${floorCount} floors`}</span>
                    </div>
                </div>
                <div class="aim-trainer-card-copy min-w-0">
                    <div class="aim-trainer-card-title-row flex items-center gap-2 min-w-0 flex-wrap">
                        <h3 class="text-sm font-bold tracking-widest uppercase text-white min-w-0">${escapeHtml(map.name)}</h3>
                    </div>
                    <p class="aim-trainer-card-description text-xs text-slate-400 tracking-wide leading-snug">${escapeHtml(summary)}</p>
                </div>
            </button>`;
    }).join("");
    if (empty) empty.hidden = true;
    list.hidden = false;
  }
  function bindMapPicklist(root) {
    const pick = root.querySelector("#bl-planner-map-pick");
    const api = window.__cafeCorePicklist;
    if (!pick || !api?.init || !catalog) return;
    const parts = buildMapPicklistParts();
    const allMapsPart = parts.find((p) => p.id === MAP_FILTER_ALL);
    api.init(pick, parts, {
      emptyMessage: "Couldn't find that map",
      onChange: () => {
        renderMapList();
      }
    });
    if (allMapsPart) {
      api.setValue(pick, allMapsPart);
    }
    const input = pick.querySelector(".tool-picklist-input");
    if (input && input.dataset.blFilterBound !== "1") {
      input.dataset.blFilterBound = "1";
      input.addEventListener("input", () => {
        renderMapList();
      });
    }
  }
  function bindMapList(root) {
    const list = root.querySelector("#bl-planner-map-list");
    if (!list || list.dataset.blListBound === "1") return;
    list.dataset.blListBound = "1";
    list.addEventListener("click", (event) => {
      const card = event.target.closest("[data-map-id]");
      if (!card) return;
      const id = card.getAttribute("data-map-id");
      if (!id) return;
      const map = getMapById(id);
      if (mapHasBlueprints(map)) {
        openMapCanvas(id);
        return;
      }
      selectedMapId = id;
      selectedFloorIndex = map?.floors?.[0]?.index ?? null;
      writeStoredSelection();
      renderMapList();
    });
  }
  function teardownMapViewport() {
    document.getElementById("bl-planner-map-viewport")?.dispatchEvent(
      new CustomEvent("bl-planner-teardown")
    );
  }
  function updateMapCanvasContent() {
    const map = getSelectedMap();
    const canvas = getCanvasEl();
    if (!map || !canvas) return;
    const floor = getSelectedFloor(map);
    if (selectedFloorIndex == null && floor) selectedFloorIndex = floor.index;
    const title = canvas.querySelector("#bl-planner-canvas-title");
    const floorsEl = canvas.querySelector("#bl-planner-canvas-floors");
    const caption = canvas.querySelector("#bl-planner-canvas-caption");
    const img = canvas.querySelector("#bl-planner-map-image");
    const viewport = canvas.querySelector("#bl-planner-map-viewport");
    if (title) title.textContent = map.name;
    if (floorsEl) {
      floorsEl.innerHTML = map.floors.map((f) => {
        const active = f.index === selectedFloorIndex;
        const hasImg = (f.imageUrl || "").trim();
        return `<button type="button" class="bl-planner-floor-tab ui-interactive${active ? " bl-planner-floor-tab--active" : ""}${hasImg ? "" : " bl-planner-floor-tab--disabled"}" data-bl-floor-index="${f.index}"${hasImg ? "" : " disabled"}>${escapeHtml(f.label)}</button>`;
      }).join("");
    }
    const imageUrl = (floor?.imageUrl || "").trim();
    if (caption) {
      caption.textContent = `${map.name} \xB7 ${floor?.label || ""}`;
    }
    if (img && viewport) {
      teardownMapViewport();
      if (imageUrl) {
        viewport.classList.remove("bl-planner-map-viewport--empty");
        img.hidden = false;
        img.src = imageUrl;
        img.alt = `${map.name} \u2014 ${floor?.label || "layout"}`;
        img.classList.remove("bl-planner-map-image--error");
        const stage = viewport.querySelector(".bl-planner-map-stage");
        if (stage) bindMapPanZoom(viewport, stage, img);
      } else {
        viewport.classList.add("bl-planner-map-viewport--empty");
        img.hidden = true;
        img.removeAttribute("src");
      }
    }
  }
  function bindCanvasUi() {
    if (canvasUiBound) return;
    canvasUiBound = true;
    const canvas = getCanvasEl();
    canvas?.querySelector("#bl-planner-canvas-back")?.addEventListener("click", () => {
      closeMapCanvas();
    });
    canvas?.querySelector("#bl-planner-canvas-floors")?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-bl-floor-index]");
      if (!btn || btn.disabled) return;
      selectedFloorIndex = Number(btn.getAttribute("data-bl-floor-index"));
      writeStoredSelection();
      updateMapCanvasContent();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || hubView !== "map") return;
      event.preventDefault();
      closeMapCanvas();
    });
  }
  function bindCanvasFullscreenExit() {
    if (canvasFullscreenBound) return;
    canvasFullscreenBound = true;
    const onFullscreenChange = () => {
      if (hubView !== "map") return;
      const canvas = getCanvasEl();
      if (getFullscreenElement() === canvas) return;
      closeMapCanvas({ skipFullscreenExit: true });
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
  }
  function showMapCanvasShell() {
    const page = getPageEl();
    const hub = getHubEl();
    const canvas = getCanvasEl();
    if (!page || !hub || !canvas) return;
    hub.classList.add("hidden");
    hub.setAttribute("aria-hidden", "true");
    canvas.classList.remove("hidden");
    canvas.setAttribute("aria-hidden", "false");
    page.classList.add("page-bl-planner--canvas");
    requestCanvasFullscreen(canvas);
  }
  function hideMapCanvasShell(options = {}) {
    const skipFullscreenExit = options.skipFullscreenExit === true;
    const page = getPageEl();
    const hub = getHubEl();
    const canvas = getCanvasEl();
    teardownMapViewport();
    if (!skipFullscreenExit) exitCanvasFullscreen();
    canvas?.classList.add("hidden");
    canvas?.setAttribute("aria-hidden", "true");
    hub?.classList.remove("hidden");
    hub?.setAttribute("aria-hidden", "false");
    page?.classList.remove("page-bl-planner--canvas");
  }
  function openMapCanvas(mapId) {
    const map = getMapById(mapId);
    if (!map || !mapHasBlueprints(map)) return;
    selectedMapId = mapId;
    if (selectedFloorIndex == null || !map.floors.some((f) => f.index === selectedFloorIndex)) {
      selectedFloorIndex = map.floors.find((f) => (f.imageUrl || "").trim())?.index ?? map.floors[0]?.index ?? null;
    }
    hubView = "map";
    writeStoredSelection();
    bindCanvasUi();
    bindCanvasFullscreenExit();
    showMapCanvasShell();
    updateMapCanvasContent();
  }
  function closeMapCanvas(options = {}) {
    hubView = "browser";
    writeStoredSelection();
    hideMapCanvasShell(options);
    renderMapList();
    const pick = document.getElementById("bl-planner-map-pick");
    const api = window.__cafeCorePicklist;
    const allMapsPart = buildMapPicklistParts().find((p) => p.id === MAP_FILTER_ALL);
    if (pick && api?.setValue && allMapsPart) {
      api.setValue(pick, allMapsPart);
    }
  }
  function bindMapPanZoom(viewport, stage, img) {
    const MIN_SCALE = 1;
    const MAX_SCALE = 5;
    let scale = 1;
    let panX = 0;
    let panY = 0;
    let dragPointerId = null;
    let dragLastX = 0;
    let dragLastY = 0;
    let pinchStartDistance = 0;
    let pinchStartScale = 1;
    let pinchMidX = 0;
    let pinchMidY = 0;
    let pinchPanX = 0;
    let pinchPanY = 0;
    const activePointers = new Map();
    const inCanvas = Boolean(viewport.closest("#bl-planner-canvas"));
    const abort = new AbortController();
    const { signal } = abort;
    viewport.addEventListener(
      "bl-planner-teardown",
      () => abort.abort(),
      { once: true }
    );
    function clampScale(next) {
      return Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    }
    function applyTransform() {
      if (scale <= MIN_SCALE + 1e-3) {
        scale = MIN_SCALE;
        panX = 0;
        panY = 0;
        viewport.classList.remove("bl-planner-map-viewport--zoomed");
      } else {
        viewport.classList.add("bl-planner-map-viewport--zoomed");
      }
      stage.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    }
    function resetView() {
      scale = MIN_SCALE;
      panX = 0;
      panY = 0;
      applyTransform();
    }
    function syncViewportFrameHeight() {
      if (inCanvas) {
        viewport.style.height = "";
        return;
      }
      if (scale !== MIN_SCALE) return;
      stage.style.transform = "none";
      const h = img.offsetHeight;
      if (h > 0) viewport.style.height = `${h}px`;
      stage.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    }
    function zoomAt(clientX, clientY, nextScale) {
      const rect = viewport.getBoundingClientRect();
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;
      const clamped = clampScale(nextScale);
      const ratio = clamped / scale;
      panX = localX - ratio * (localX - panX);
      panY = localY - ratio * (localY - panY);
      scale = clamped;
      applyTransform();
    }
    if (img.complete && img.naturalWidth) syncViewportFrameHeight();
    img.addEventListener(
      "load",
      () => {
        resetView();
        syncViewportFrameHeight();
      },
      { signal }
    );
    viewport.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
        zoomAt(event.clientX, event.clientY, scale * factor);
      },
      { passive: false, signal }
    );
    viewport.addEventListener(
      "dblclick",
      (event) => {
        event.preventDefault();
        if (scale > MIN_SCALE) resetView();
        else zoomAt(event.clientX, event.clientY, 2);
        syncViewportFrameHeight();
      },
      { signal }
    );
    function beginPinchIfNeeded() {
      if (activePointers.size !== 2) return;
      dragPointerId = null;
      viewport.classList.remove("bl-planner-map-viewport--dragging");
      const pts = [...activePointers.values()];
      const a = pts[0];
      const b = pts[1];
      pinchStartDistance = Math.hypot(a.x - b.x, a.y - b.y);
      pinchStartScale = scale;
      pinchPanX = panX;
      pinchPanY = panY;
      pinchMidX = (a.x + b.x) / 2;
      pinchMidY = (a.y + b.y) / 2;
    }
    viewport.addEventListener(
      "pointerdown",
      (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        viewport.setPointerCapture(event.pointerId);
        activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (activePointers.size >= 2) {
          beginPinchIfNeeded();
          return;
        }
        if (scale <= MIN_SCALE) return;
        dragPointerId = event.pointerId;
        dragLastX = event.clientX;
        dragLastY = event.clientY;
        viewport.classList.add("bl-planner-map-viewport--dragging");
      },
      { signal }
    );
    viewport.addEventListener(
      "pointermove",
      (event) => {
        if (activePointers.has(event.pointerId)) {
          activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        }
        if (activePointers.size >= 2) {
          if (pinchStartDistance <= 0) beginPinchIfNeeded();
          const pts = [...activePointers.values()];
          if (pts.length >= 2 && pinchStartDistance > 0) {
            const a = pts[0];
            const b = pts[1];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            const next = clampScale(pinchStartScale * (dist / pinchStartDistance));
            panX = pinchPanX;
            panY = pinchPanY;
            scale = pinchStartScale;
            zoomAt(pinchMidX, pinchMidY, next);
          }
          return;
        }
        if (dragPointerId !== event.pointerId) return;
        panX += event.clientX - dragLastX;
        panY += event.clientY - dragLastY;
        dragLastX = event.clientX;
        dragLastY = event.clientY;
        applyTransform();
      },
      { signal }
    );
    function endPointer(event) {
      activePointers.delete(event.pointerId);
      if (dragPointerId === event.pointerId) {
        dragPointerId = null;
        viewport.classList.remove("bl-planner-map-viewport--dragging");
      }
      if (activePointers.size < 2) pinchStartDistance = 0;
      try {
        viewport.releasePointerCapture(event.pointerId);
      } catch {
      }
    }
    viewport.addEventListener("pointerup", endPointer, { signal });
    viewport.addEventListener("pointercancel", endPointer, { signal });
    window.addEventListener(
      "resize",
      () => {
        resetView();
        syncViewportFrameHeight();
      },
      { signal }
    );
  }
  function renderBrowser(root) {
    root.innerHTML = browserShellHtml();
    bindMapPicklist(root);
    bindMapList(root);
    renderMapList();
  }
  async function mountPlanner() {
    const root = document.getElementById("bl-planner-root");
    if (!root) return;
    try {
      catalog = await loadCatalog();
      applyInitialSelection();
      hubView = "browser";
      selectedMapId = "";
      selectedFloorIndex = null;
      writeStoredSelection();
      renderBrowser(root);
    } catch {
      root.innerHTML = `
                <div class="auth-restricted-panel">
                    <p class="text-slate-300 tracking-wide">Could not load the map catalog. Serve the site over http(s) or redeploy with <code class="text-redneon-500">data/r6-map-layouts.json</code>.</p>
                </div>`;
    }
  }
  window.initBlPlannerPage = function initBlPlannerPage() {
    void mountPlanner();
  };
  window.teardownBlPlannerPage = function teardownBlPlannerPage() {
    if (hubView === "map") {
      closeMapCanvas({ skipFullscreenExit: false });
    }
    window.__cafeCorePicklist?.closeAll?.();
    catalog = null;
    hubView = "browser";
  };
})();
