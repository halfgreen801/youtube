const APP_NAME = "개골튜브";
const STORAGE_KEY = "tube-vault-state-v1";
const THEME_STORAGE_KEY = "gaegol-tube-theme-v1";
const IMPORT_VERSION = 2;
const CATEGORY_SHARE_VERSION = 3;
const DEFAULT_CATEGORY_ID = "general";
const DEFAULT_CATEGORY_NAME = "기본";
const DEFAULT_SLOT = "기본";
const SYNC_META_KEY = "tubeVaultSyncMeta";
const CLOUD_BACKUP_PREFIX = "tubeVaultBackupBeforeCloudPull:";
const SUPABASE_TABLE = "tube_vault_states";
const SYNC_DEBOUNCE_MS = 1200;
const DEFAULT_THEME = {
  bg: "#fff8f1",
  surface: "#ffffff",
  surfaceStrong: "#fff1f5",
  ink: "#263238",
  muted: "#6f7d85",
  line: "#eadde7",
  lineStrong: "#d9c5d3",
  accent: "#7bcfb2",
  accentDark: "#4fa88f",
  blue: "#8fb7ff",
  red: "#f08a8a",
  amber: "#f6c177"
};
const THEME_FIELDS = [
  ["bg", "--bg"],
  ["surface", "--surface"],
  ["surfaceStrong", "--surface-strong"],
  ["ink", "--ink"],
  ["muted", "--muted"],
  ["line", "--line"],
  ["lineStrong", "--line-strong"],
  ["accent", "--accent"],
  ["accentDark", "--accent-dark"],
  ["blue", "--blue"],
  ["red", "--red"],
  ["amber", "--amber"]
];

const syncConfig = {
  syncEnabled: false,
  supabaseUrl: "",
  supabaseAnonKey: "",
  allowSignup: false,
  ...(window.TUBE_VAULT_CONFIG && typeof window.TUBE_VAULT_CONFIG === "object" ? window.TUBE_VAULT_CONFIG : {})
};

syncConfig.supabaseUrl = String(syncConfig.supabaseUrl || "").trim();
syncConfig.supabaseAnonKey = String(syncConfig.supabaseAnonKey || "").trim();
syncConfig.syncEnabled = Boolean(syncConfig.syncEnabled);
syncConfig.allowSignup = Boolean(syncConfig.allowSignup);

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const initialState = {
  version: IMPORT_VERSION,
  profiles: ["나"],
  categories: [{ id: DEFAULT_CATEGORY_ID, name: DEFAULT_CATEGORY_NAME, slots: [DEFAULT_SLOT] }],
  items: [],
  view: "all",
  categoryFilter: "all",
  slotFilter: "all",
  query: "",
  sort: "newest",
  selectedId: null
};

let currentTheme = loadTheme();
applyTheme(currentTheme);

let state = loadState();
let toastTimer = 0;
let deferredInstallPrompt = null;
let draftTheme = { ...currentTheme };
let themeDialogSaved = false;
let syncMeta = loadSyncMeta();
const syncState = {
  client: null,
  session: null,
  configured: syncConfig.syncEnabled && Boolean(syncConfig.supabaseUrl && syncConfig.supabaseAnonKey),
  available: false,
  online: navigator.onLine,
  busy: false,
  status: "local",
  errorMessage: "",
  cloudRow: null,
  needsCloudChoice: false,
  saveTimer: 0
};

const els = {
  saveForm: $("#saveForm"),
  urlInput: $("#urlInput"),
  titleInput: $("#titleInput"),
  categoryInput: $("#categoryInput"),
  slotInput: $("#slotInput"),
  newCategoryButton: $("#newCategoryButton"),
  newSlotButton: $("#newSlotButton"),
  noteInput: $("#noteInput"),
  pasteButton: $("#pasteButton"),
  totalCount: $("#totalCount"),
  viewFilters: $("#viewFilters"),
  categoryFilter: $("#categoryFilter"),
  slotCloud: $("#slotCloud"),
  searchInput: $("#searchInput"),
  sortInput: $("#sortInput"),
  videoGrid: $("#videoGrid"),
  emptyState: $("#emptyState"),
  cardTemplate: $("#videoCardTemplate"),
  playerPanel: $("#playerPanel"),
  playerFrame: $("#playerFrame"),
  playerTitle: $("#playerTitle"),
  playerType: $("#playerType"),
  openPlayerLink: $("#openPlayerLink"),
  closePlayerButton: $("#closePlayerButton"),
  exportButton: $("#exportButton"),
  importInput: $("#importInput"),
  installButton: $("#installButton"),
  installDialog: $("#installDialog"),
  themeButton: $("#themeButton"),
  categoryShareButton: $("#categoryShareButton"),
  categoryShareDialog: $("#categoryShareDialog"),
  categoryShareForm: $("#categoryShareForm"),
  shareCategorySelect: $("#shareCategorySelect"),
  shareCategoryCount: $("#shareCategoryCount"),
  shareIncludeNotes: $("#shareIncludeNotes"),
  shareIncludeStatus: $("#shareIncludeStatus"),
  shareIncludeFavorite: $("#shareIncludeFavorite"),
  shareIncludeSlot: $("#shareIncludeSlot"),
  nativeShareCategoryButton: $("#nativeShareCategoryButton"),
  downloadCategoryShareButton: $("#downloadCategoryShareButton"),
  themeDialog: $("#themeDialog"),
  themeForm: $("#themeForm"),
  themeInputs: $$("[data-theme-key]"),
  resetThemeButton: $("#resetThemeButton"),
  editDialog: $("#editDialog"),
  editForm: $("#editForm"),
  editId: $("#editId"),
  editTitle: $("#editTitle"),
  editCategory: $("#editCategory"),
  editSlot: $("#editSlot"),
  newEditCategoryButton: $("#newEditCategoryButton"),
  newEditSlotButton: $("#newEditSlotButton"),
  editStatus: $("#editStatus"),
  editNote: $("#editNote"),
  deleteButton: $("#deleteButton"),
  syncStatusBadge: $("#syncStatusBadge"),
  syncDescription: $("#syncDescription"),
  syncLastSync: $("#syncLastSync"),
  syncAuthForm: $("#syncAuthForm"),
  syncEmail: $("#syncEmail"),
  syncPassword: $("#syncPassword"),
  syncLoginButton: $("#syncLoginButton"),
  syncSignupButton: $("#syncSignupButton"),
  syncSessionPanel: $("#syncSessionPanel"),
  syncUserEmail: $("#syncUserEmail"),
  syncNowButton: $("#syncNowButton"),
  syncLogoutButton: $("#syncLogoutButton"),
  cloudChoicePanel: $("#cloudChoicePanel"),
  cloudChoiceText: $("#cloudChoiceText"),
  cloudPullButton: $("#cloudPullButton"),
  cloudPushButton: $("#cloudPushButton"),
  cloudMergeButton: $("#cloudMergeButton"),
  toast: $("#toast")
};

init();

function init() {
  ensureLibraryShape();
  ensureCategoryOptions();
  bindEvents();
  wireThemeSettings();
  render();
  initSync();
  registerServiceWorker();
  hydrateMissingTitles();
}

function bindEvents() {
  els.saveForm.addEventListener("submit", handleSave);
  els.pasteButton.addEventListener("click", pasteFromClipboard);
  els.viewFilters.addEventListener("click", handleViewFilter);
  els.categoryFilter.addEventListener("change", () => {
    state.categoryFilter = els.categoryFilter.value;
    state.slotFilter = "all";
    persistAndRender();
  });
  els.categoryInput.addEventListener("change", () => {
    renderSlotOptions(els.categoryInput, els.slotInput);
  });
  els.editCategory.addEventListener("change", () => {
    renderSlotOptions(els.editCategory, els.editSlot);
  });
  els.newCategoryButton.addEventListener("click", () => addCategory("save"));
  els.newSlotButton.addEventListener("click", () => addSlot("save"));
  els.newEditCategoryButton.addEventListener("click", () => addCategory("edit"));
  els.newEditSlotButton.addEventListener("click", () => addSlot("edit"));
  els.searchInput.addEventListener("input", () => {
    state.query = els.searchInput.value.trim();
    persistAndRender(false);
  });
  els.sortInput.addEventListener("change", () => {
    state.sort = els.sortInput.value;
    persistAndRender();
  });
  els.slotCloud.addEventListener("click", handleSlotFilter);
  els.videoGrid.addEventListener("click", handleCardAction);
  els.closePlayerButton.addEventListener("click", closePlayer);
  els.exportButton.addEventListener("click", exportLibrary);
  els.importInput.addEventListener("change", importLibrary);
  els.categoryShareButton.addEventListener("click", openCategoryShareDialog);
  els.shareCategorySelect.addEventListener("change", updateCategoryShareCount);
  els.categoryShareForm.addEventListener("submit", handleCategoryShareSubmit);
  els.nativeShareCategoryButton.addEventListener("click", shareCategoryWithNativeShare);
  els.editForm.addEventListener("submit", saveEdit);
  els.deleteButton.addEventListener("click", deleteEditingItem);
  els.syncAuthForm.addEventListener("submit", handleSyncLogin);
  els.syncSignupButton.addEventListener("click", handleSyncSignup);
  els.syncLogoutButton.addEventListener("click", handleSyncLogout);
  els.syncNowButton.addEventListener("click", handleSyncNow);
  els.cloudPullButton.addEventListener("click", pullCloudState);
  els.cloudPushButton.addEventListener("click", pushLocalState);
  els.cloudMergeButton.addEventListener("click", mergeCloudState);

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      state = loadState();
      ensureLibraryShape();
      render();
      scheduleCloudSave();
    }
  });

  window.addEventListener("online", () => {
    syncState.online = true;
    renderSyncPanel();
    scheduleCloudSave();
  });

  window.addEventListener("offline", () => {
    syncState.online = false;
    renderSyncPanel();
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    if (isStandaloneMode()) return;
    deferredInstallPrompt = event;
    els.installButton.textContent = "앱 설치";
    els.installButton.title = "홈 화면/앱 목록에 추가합니다. 데이터 동기화 기능은 아닙니다.";
    els.installButton.setAttribute("aria-label", "홈 화면이나 앱 목록에 추가합니다. 데이터 동기화 기능은 아닙니다.");
    els.installButton.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    els.installButton.hidden = true;
  });

  els.installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      openInstallGuide();
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    els.installButton.hidden = true;
  });

  configureInstallButton();
}

function configureInstallButton() {
  if (isStandaloneMode()) {
    els.installButton.hidden = true;
    return;
  }

  if (isIosLikeDevice()) {
    els.installButton.textContent = "앱 설치";
    els.installButton.title = "iPhone/iPad에서는 Safari 공유 버튼에서 홈 화면에 추가를 선택해야 합니다. 데이터 동기화 기능은 아닙니다.";
    els.installButton.setAttribute("aria-label", "아이폰 앱 설치 방법 보기. 홈 화면에 추가하는 기능이며 데이터 동기화 기능은 아닙니다.");
    els.installButton.hidden = false;
  }
}

function openInstallGuide() {
  els.installDialog.showModal();
}

function isIosLikeDevice() {
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  return /iPad|iPhone|iPod/.test(ua)
    || (platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

function handleSave(event) {
  event.preventDefault();
  const parsed = parseYoutubeLinks(els.urlInput.value);

  if (!parsed.length) {
    showToast("저장할 YouTube 링크를 찾지 못했어요.");
    return;
  }

  const now = new Date().toISOString();
  const profile = "나";
  const category = getCategory(els.categoryInput.value) || getDefaultCategory();
  const slot = ensureCategorySlot(category.id, els.slotInput.value);
  let added = 0;
  let skipped = 0;

  parsed.forEach((video, index) => {
    const exists = state.items.some((item) => item.videoId === video.videoId && item.type === video.type);
    if (exists) {
      skipped += 1;
      return;
    }

    state.items.unshift({
      id: createId(video.videoId),
      videoId: video.videoId,
      type: video.type,
      url: video.url,
      title: parsed.length === 1 ? els.titleInput.value.trim() : "",
      author: "",
      note: els.noteInput.value.trim(),
      tags: [],
      profile,
      categoryId: category.id,
      slot,
      status: "queue",
      favorite: false,
      createdAt: now,
      updatedAt: now
    });
    added += 1;

    if (index === 0) {
      state.selectedId = state.items[0].id;
    }
  });

  ensureProfile(profile);
  persistAndRender();
  hydrateMissingTitles();

  if (added > 0) {
    els.saveForm.reset();
    els.categoryInput.value = category.id;
    renderSlotOptions(els.categoryInput, els.slotInput, slot);
  }

  const message = skipped
    ? `${added}개 저장, ${skipped}개는 이미 있었어요.`
    : `${added}개 저장했어요.`;
  showToast(message);
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    els.urlInput.value = [els.urlInput.value.trim(), text.trim()].filter(Boolean).join("\n");
    els.urlInput.focus();
  } catch {
    showToast("브라우저가 클립보드 읽기를 막았어요.");
  }
}

function handleViewFilter(event) {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  state.view = button.dataset.view;
  persistAndRender();
}

function handleSlotFilter(event) {
  const button = event.target.closest("[data-slot]");
  if (!button) return;
  state.slotFilter = button.dataset.slot;
  persistAndRender();
}

function handleCardAction(event) {
  const card = event.target.closest(".video-card");
  if (!card) return;
  const item = state.items.find((entry) => entry.id === card.dataset.id);
  if (!item) return;

  if (event.target.closest(".thumb-button")) {
    playItem(item.id);
    return;
  }

  if (event.target.closest(".favorite-button")) {
    item.favorite = !item.favorite;
    item.updatedAt = new Date().toISOString();
    persistAndRender();
    return;
  }

  if (event.target.closest(".status-button")) {
    item.status = item.status === "done" ? "queue" : "done";
    item.updatedAt = new Date().toISOString();
    persistAndRender();
    return;
  }

  if (event.target.closest(".edit-button")) {
    openEditDialog(item);
  }
}

function addCategory(target) {
  const name = window.prompt("추가할 카테고리 이름");
  if (!name) return;
  const cleaned = cleanLabel(name, "");
  if (!cleaned) return;
  const category = ensureCategory(cleaned);
  ensureCategoryOptions();
  setCategoryTarget(target, category.id, DEFAULT_SLOT);
  persist();
  showToast(`${category.name} 카테고리를 추가했어요.`);
}

function addSlot(target) {
  const categorySelect = target === "edit" ? els.editCategory : els.categoryInput;
  const slotSelect = target === "edit" ? els.editSlot : els.slotInput;
  const category = getCategory(categorySelect.value) || getDefaultCategory();
  const name = window.prompt(`${category.name}에 추가할 분류 칸 이름`);
  if (!name) return;
  const slot = ensureCategorySlot(category.id, name);
  renderSlotOptions(categorySelect, slotSelect, slot);
  persist();
  showToast(`${category.name} > ${slot} 칸을 추가했어요.`);
}

function setCategoryTarget(target, categoryId, slot) {
  const categorySelect = target === "edit" ? els.editCategory : els.categoryInput;
  const slotSelect = target === "edit" ? els.editSlot : els.slotInput;
  categorySelect.value = categoryId;
  renderSlotOptions(categorySelect, slotSelect, slot);
}

function openEditDialog(item) {
  ensureCategoryOptions();
  els.editId.value = item.id;
  els.editTitle.value = item.title || "";
  els.editCategory.value = item.categoryId || DEFAULT_CATEGORY_ID;
  renderSlotOptions(els.editCategory, els.editSlot, item.slot || DEFAULT_SLOT);
  els.editStatus.value = item.status || "queue";
  els.editNote.value = item.note || "";
  els.editDialog.showModal();
}

function saveEdit(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    els.editDialog.close();
    return;
  }

  const item = state.items.find((entry) => entry.id === els.editId.value);
  if (!item) return;

  const category = getCategory(els.editCategory.value) || getDefaultCategory();
  const slot = ensureCategorySlot(category.id, els.editSlot.value);
  item.title = els.editTitle.value.trim() || fallbackTitle(item);
  item.profile = item.profile || "나";
  item.categoryId = category.id;
  item.slot = slot;
  item.status = els.editStatus.value;
  item.tags = Array.isArray(item.tags) ? item.tags : [];
  item.note = els.editNote.value.trim();
  item.updatedAt = new Date().toISOString();
  ensureProfile(item.profile);
  els.editDialog.close();
  persistAndRender();
  showToast("수정했어요.");
}

function deleteEditingItem() {
  const item = state.items.find((entry) => entry.id === els.editId.value);
  if (!item) return;
  const ok = window.confirm("이 항목을 삭제할까요?");
  if (!ok) return;
  state.items = state.items.filter((entry) => entry.id !== item.id);
  if (state.selectedId === item.id) closePlayer();
  els.editDialog.close();
  persistAndRender();
  showToast("삭제했어요.");
}

function playItem(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;
  state.selectedId = id;
  persist();
  renderPlayer();
  els.playerPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closePlayer() {
  state.selectedId = null;
  els.playerFrame.src = "about:blank";
  els.playerPanel.hidden = true;
  persist();
}

function render() {
  ensureLibraryShape();
  ensureCategoryOptions();
  els.totalCount.value = String(state.items.length);
  els.searchInput.value = state.query;
  els.sortInput.value = state.sort;
  renderFilterState();
  renderSlotFilters();
  renderCards();
  renderPlayer();
  renderSyncPanel();
}

function renderFilterState() {
  $$("[data-view]", els.viewFilters).forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });

  els.categoryFilter.innerHTML = "";
  const allCategoryOption = new Option("모든 카테고리", "all");
  els.categoryFilter.add(allCategoryOption);
  state.categories.forEach((category) => els.categoryFilter.add(new Option(category.name, category.id)));
  els.categoryFilter.value = state.categoryFilter;
}

function renderSlotFilters() {
  const slots = getVisibleSlots();
  if (state.slotFilter !== "all" && !slots.includes(state.slotFilter)) {
    state.slotFilter = "all";
  }

  els.slotCloud.innerHTML = "";
  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.className = `slot-button ${state.slotFilter === "all" ? "active" : ""}`;
  allButton.dataset.slot = "all";
  allButton.textContent = "모든 분류 칸";
  els.slotCloud.append(allButton);

  slots.forEach((slot) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `slot-button ${state.slotFilter === slot ? "active" : ""}`;
    button.dataset.slot = slot;
    button.textContent = slot;
    els.slotCloud.append(button);
  });
}

function renderCards() {
  const items = getFilteredItems();
  els.videoGrid.innerHTML = "";
  els.emptyState.hidden = items.length > 0;

  items.forEach((item) => {
    const node = els.cardTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.id = item.id;

    const image = $(".thumb", node);
    image.src = thumbnailUrl(item);
    image.alt = `${displayTitle(item)} 썸네일`;
    image.loading = "lazy";

    $(".duration-chip", node).textContent = item.status === "done" ? "봤음" : "볼 예정";

    const typeBadge = $(".type-badge", node);
    typeBadge.textContent = item.type === "short" ? "숏츠" : "영상";
    typeBadge.classList.add(item.type === "short" ? "short" : "video");

    $(".category-badge", node).textContent = getCategoryName(item.categoryId);
    $(".slot-badge", node).textContent = item.slot || DEFAULT_SLOT;
    $(".card-title", node).textContent = displayTitle(item);
    $(".card-note", node).textContent = item.note || item.author || " ";

    const favoriteButton = $(".favorite-button", node);
    favoriteButton.textContent = item.favorite ? "★" : "☆";
    favoriteButton.classList.toggle("active", item.favorite);

    const statusButton = $(".status-button", node);
    statusButton.classList.toggle("done", item.status === "done");
    statusButton.title = item.status === "done" ? "볼 예정으로 변경" : "봤음 표시";

    $(".open-button", node).href = item.url;
    els.videoGrid.append(node);
  });
}

function renderPlayer() {
  const item = state.items.find((entry) => entry.id === state.selectedId);
  if (!item) {
    els.playerPanel.hidden = true;
    return;
  }

  els.playerPanel.hidden = false;
  els.playerTitle.textContent = displayTitle(item);
  els.playerType.textContent = item.type === "short" ? "숏츠" : "영상";
  els.playerType.className = `type-badge ${item.type === "short" ? "short" : "video"}`;
  els.openPlayerLink.href = item.url;
  const embed = `https://www.youtube.com/embed/${item.videoId}?autoplay=1&playsinline=1&rel=0`;
  if (els.playerFrame.src !== embed) {
    els.playerFrame.src = embed;
  }
}

function getFilteredItems() {
  const query = normalizeText(state.query);
  return state.items
    .filter((item) => {
      if (state.view === "video" && item.type !== "video") return false;
      if (state.view === "short" && item.type !== "short") return false;
      if (state.view === "queue" && item.status === "done") return false;
      if (state.view === "done" && item.status !== "done") return false;
      if (state.view === "favorite" && !item.favorite) return false;
      if (state.categoryFilter !== "all" && item.categoryId !== state.categoryFilter) return false;
      if (state.slotFilter !== "all" && item.slot !== state.slotFilter) return false;

      if (!query) return true;
      const haystack = normalizeText([
        item.title,
        item.author,
        item.note,
        getCategoryName(item.categoryId),
        item.slot
      ].join(" "));
      return haystack.includes(query);
    })
    .sort(sortItems);
}

function sortItems(a, b) {
  if (state.sort === "oldest") return new Date(a.createdAt) - new Date(b.createdAt);
  if (state.sort === "title") return displayTitle(a).localeCompare(displayTitle(b), "ko");
  if (state.sort === "category") {
    return getCategoryName(a.categoryId).localeCompare(getCategoryName(b.categoryId), "ko")
      || (a.slot || "").localeCompare(b.slot || "", "ko")
      || new Date(b.createdAt) - new Date(a.createdAt);
  }
  return new Date(b.createdAt) - new Date(a.createdAt);
}

function parseYoutubeLinks(text) {
  const matches = text.match(/(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\/[^\s<>"']+/gi) || [];
  const seen = new Set();
  const parsed = [];

  matches.forEach((raw) => {
    const item = parseYoutubeUrl(raw);
    if (!item) return;
    const key = `${item.type}:${item.videoId}`;
    if (seen.has(key)) return;
    seen.add(key);
    parsed.push(item);
  });

  return parsed;
}

function parseYoutubeUrl(rawUrl) {
  let value = rawUrl.trim().replace(/[),.\]]+$/g, "");
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;

  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  let videoId = "";
  let type = "video";

  if (host === "youtu.be") {
    videoId = parts[0] || "";
  } else if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v") || "";
    } else if (parts[0] === "shorts") {
      videoId = parts[1] || "";
      type = "short";
    } else if (parts[0] === "embed") {
      videoId = parts[1] || "";
    } else if (parts[0] === "live") {
      videoId = parts[1] || "";
    }
  }

  videoId = videoId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 11);
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;

  return {
    videoId,
    type,
    url: type === "short"
      ? `https://www.youtube.com/shorts/${videoId}`
      : `https://www.youtube.com/watch?v=${videoId}`
  };
}

async function hydrateMissingTitles() {
  const targets = state.items.filter((item) => !item.title || item.title === fallbackTitle(item)).slice(0, 8);
  if (!targets.length) return;

  for (const item of targets) {
    try {
      const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(item.url)}`);
      if (!response.ok) continue;
      const data = await response.json();
      item.title = data.title || item.title;
      item.author = data.author_name || item.author || "";
      item.updatedAt = new Date().toISOString();
      persistAndRender(false);
    } catch {
      return;
    }
  }
}

function wireThemeSettings() {
  els.themeButton.addEventListener("click", openThemeDialog);
  els.themeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (event.submitter?.value === "cancel") {
      closeThemeDialog(false);
      return;
    }
    saveTheme(draftTheme);
    currentTheme = { ...draftTheme };
    themeDialogSaved = true;
    els.themeDialog.close();
    showToast("색상 설정을 저장했어요.");
  });

  els.themeDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeThemeDialog(false);
  });

  els.themeDialog.addEventListener("close", () => {
    if (!themeDialogSaved) {
      draftTheme = { ...currentTheme };
      applyTheme(currentTheme);
      fillThemeInputs(currentTheme);
    }
  });

  els.resetThemeButton.addEventListener("click", resetTheme);
  els.themeInputs.forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.themeKey;
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_THEME, key) || !isValidHexColor(input.value)) return;
      draftTheme = {
        ...draftTheme,
        [key]: input.value
      };
      applyTheme(draftTheme);
    });
  });
}

function loadTheme() {
  try {
    const stored = JSON.parse(localStorage.getItem(THEME_STORAGE_KEY));
    if (!stored || typeof stored !== "object") return { ...DEFAULT_THEME };

    const merged = { ...DEFAULT_THEME, ...stored };
    const valid = THEME_FIELDS.every(([key]) => isValidHexColor(merged[key]));
    if (!valid) {
      localStorage.removeItem(THEME_STORAGE_KEY);
      return { ...DEFAULT_THEME };
    }
    return merged;
  } catch {
    localStorage.removeItem(THEME_STORAGE_KEY);
    return { ...DEFAULT_THEME };
  }
}

function saveTheme(theme) {
  const normalized = normalizeTheme(theme);
  localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(normalized));
}

function applyTheme(theme) {
  const normalized = normalizeTheme(theme);
  THEME_FIELDS.forEach(([key, variable]) => {
    document.documentElement.style.setProperty(variable, normalized[key]);
  });

  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) metaThemeColor.setAttribute("content", normalized.accentDark || normalized.ink);
}

function resetTheme() {
  draftTheme = { ...DEFAULT_THEME };
  applyTheme(DEFAULT_THEME);
  fillThemeInputs(DEFAULT_THEME);
  showToast("기본 파스텔 색상을 미리 적용했어요. 저장해야 유지됩니다.");
}

function openThemeDialog() {
  themeDialogSaved = false;
  draftTheme = { ...currentTheme };
  fillThemeInputs(draftTheme);
  els.themeDialog.showModal();
}

function closeThemeDialog(saveChanges = false) {
  themeDialogSaved = saveChanges;
  if (!saveChanges) {
    draftTheme = { ...currentTheme };
    applyTheme(currentTheme);
    fillThemeInputs(currentTheme);
  }
  els.themeDialog.close();
}

function fillThemeInputs(theme) {
  els.themeInputs.forEach((input) => {
    const key = input.dataset.themeKey;
    input.value = isValidHexColor(theme[key]) ? theme[key] : DEFAULT_THEME[key];
  });
}

function normalizeTheme(theme) {
  const source = theme && typeof theme === "object" ? theme : {};
  return THEME_FIELDS.reduce((result, [key]) => {
    result[key] = isValidHexColor(source[key]) ? source[key] : DEFAULT_THEME[key];
    return result;
  }, {});
}

function isValidHexColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || ""));
}

async function initSync() {
  renderSyncPanel();
  if (!syncState.configured) return;

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    try {
      await loadSupabaseClientScript();
    } catch {
      syncState.status = "unavailable";
      syncState.errorMessage = "Supabase 클라이언트를 불러오지 못했습니다.";
      renderSyncPanel();
      return;
    }
  }

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    syncState.status = "unavailable";
    syncState.errorMessage = "Supabase 클라이언트를 불러오지 못했습니다.";
    renderSyncPanel();
    return;
  }

  try {
    syncState.client = window.supabase.createClient(syncConfig.supabaseUrl, syncConfig.supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });
    syncState.available = true;

    const { data, error } = await syncState.client.auth.getSession();
    if (error) throw error;
    syncState.session = data.session || null;
    syncState.status = syncState.session ? "signed-in" : "local";
    renderSyncPanel();

    syncState.client.auth.onAuthStateChange((_event, session) => {
      syncState.session = session || null;
      syncState.errorMessage = "";
      if (!syncState.session) {
        syncState.status = "local";
        syncState.cloudRow = null;
        syncState.needsCloudChoice = false;
      }
      renderSyncPanel();
      if (syncState.session) {
        prepareCloudStateChoice();
      }
    });

    if (syncState.session) {
      await prepareCloudStateChoice();
    }
  } catch (error) {
    setSyncError(error, "동기화 초기화에 실패했습니다.");
  }
}

function loadSupabaseClientScript() {
  const existing = document.querySelector('script[data-tube-vault-supabase="true"]');
  if (existing) {
    if (existing.dataset.loaded === "true") return Promise.resolve();
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    script.async = true;
    script.defer = true;
    script.dataset.tubeVaultSupabase = "true";
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", reject, { once: true });
    document.head.append(script);
  });
}

function renderSyncPanel() {
  const localDescription = "현재 저장한 링크는 이 브라우저의 localStorage에 저장됩니다. 같은 주소로 다른 기기에서 접속해도 자동으로 보이지 않습니다.";
  const setupHint = "여러 기기 동기화를 사용하려면 Supabase 설정 후 로그인하세요.";
  const signedIn = Boolean(syncState.session);
  const lastSyncedAt = syncMeta.userId === syncState.session?.user?.id ? syncMeta.lastSyncedAt : "";
  let badge = "이 기기에만 저장 중";
  let detail = setupHint;

  if (syncState.status === "error") {
    badge = "동기화 실패";
    detail = "동기화 실패. 로컬 저장은 유지되었습니다.";
  } else if (signedIn && syncState.busy) {
    badge = "클라우드 동기화 중";
    detail = `클라우드 동기화 중 / 마지막 동기화: ${formatSyncTime(lastSyncedAt)}`;
  } else if (signedIn && syncState.needsCloudChoice) {
    badge = "동기화 선택 필요";
    detail = "클라우드 데이터와 현재 기기 데이터 중 사용할 방식을 선택하세요.";
  } else if (signedIn && syncState.available) {
    badge = "클라우드 동기화 중";
    detail = `클라우드 동기화 중 / 마지막 동기화: ${formatSyncTime(lastSyncedAt)}`;
  } else if (syncState.configured && syncState.status === "unavailable") {
    detail = "Supabase 클라이언트를 불러오지 못했습니다. 로컬 저장은 계속 사용할 수 있습니다.";
  } else if (syncState.configured) {
    detail = "Supabase 설정이 감지되었습니다. 로그인하면 이 계정의 데이터만 동기화됩니다.";
  }

  if (!syncState.online) {
    detail = `${detail} 오프라인 상태라 로컬 저장만 진행됩니다.`;
  }

  els.syncStatusBadge.textContent = badge;
  els.syncDescription.textContent = localDescription;
  els.syncLastSync.textContent = detail;
  els.syncAuthForm.hidden = !syncState.configured || !syncState.available || signedIn;
  els.syncSignupButton.hidden = !syncConfig.allowSignup;
  els.syncSessionPanel.hidden = !signedIn;
  els.syncUserEmail.textContent = signedIn ? `로그인: ${syncState.session.user.email || "계정"}` : "";
  els.syncNowButton.disabled = !canSync() || syncState.busy;
  els.syncLogoutButton.disabled = syncState.busy;
  els.syncLoginButton.disabled = syncState.busy || !syncState.online;
  els.syncSignupButton.disabled = syncState.busy || !syncState.online;
  els.cloudChoicePanel.hidden = !signedIn || !syncState.needsCloudChoice;
  els.cloudChoiceText.textContent = syncState.cloudRow
    ? "이 계정에 클라우드 데이터가 있습니다. 로컬 데이터를 덮어쓰기 전 자동 백업을 만듭니다."
    : "이 계정에는 아직 클라우드 데이터가 없습니다. 현재 기기 데이터를 업로드할 수 있습니다.";
  els.cloudPullButton.disabled = !syncState.cloudRow || syncState.busy || !syncState.online;
  els.cloudMergeButton.disabled = !syncState.cloudRow || syncState.busy || !syncState.online;
  els.cloudPushButton.disabled = syncState.busy || !syncState.online;
}

async function handleSyncLogin(event) {
  event.preventDefault();
  if (!syncState.available || !syncState.client) return;
  const email = els.syncEmail.value.trim();
  const password = els.syncPassword.value;
  if (!email || !password) {
    showToast("이메일과 비밀번호를 입력하세요.");
    return;
  }

  setSyncBusy(true);
  try {
    const { data, error } = await syncState.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    syncState.session = data.session || null;
    els.syncPassword.value = "";
    syncState.status = syncState.session ? "signed-in" : "local";
    renderSyncPanel();
    if (syncState.session) {
      await prepareCloudStateChoice();
      showToast("로그인했어요.");
    }
  } catch (error) {
    setSyncError(error, "로그인하지 못했습니다.");
  } finally {
    setSyncBusy(false);
  }
}

async function handleSyncSignup() {
  if (!syncConfig.allowSignup || !syncState.available || !syncState.client) return;
  const email = els.syncEmail.value.trim();
  const password = els.syncPassword.value;
  if (!email || !password) {
    showToast("이메일과 비밀번호를 입력하세요.");
    return;
  }

  setSyncBusy(true);
  try {
    const { data, error } = await syncState.client.auth.signUp({ email, password });
    if (error) throw error;
    syncState.session = data.session || null;
    els.syncPassword.value = "";
    renderSyncPanel();
    showToast("회원가입 요청을 보냈어요. 이메일 확인이 필요할 수 있어요.");
    if (syncState.session) await prepareCloudStateChoice();
  } catch (error) {
    setSyncError(error, "회원가입하지 못했습니다.");
  } finally {
    setSyncBusy(false);
  }
}

async function handleSyncLogout() {
  if (!syncState.client) return;
  setSyncBusy(true);
  try {
    const { error } = await syncState.client.auth.signOut();
    if (error) throw error;
    syncState.session = null;
    syncState.status = "local";
    syncState.cloudRow = null;
    syncState.needsCloudChoice = false;
    showToast("로그아웃했어요.");
  } catch (error) {
    setSyncError(error, "로그아웃하지 못했습니다.");
  } finally {
    setSyncBusy(false);
    renderSyncPanel();
  }
}

async function handleSyncNow() {
  if (!canSync()) {
    showToast(syncState.online ? "로그인 후 동기화할 수 있어요." : "오프라인 상태입니다.");
    return;
  }

  setSyncBusy(true);
  try {
    const row = await fetchCloudState();
    syncState.cloudRow = row;
    if (shouldPromptForCloud(row)) {
      syncState.needsCloudChoice = true;
      syncState.status = "needs-choice";
      renderSyncPanel();
      showToast("클라우드 데이터 처리 방식을 선택하세요.");
      return;
    }

    syncState.needsCloudChoice = false;
    await upsertCloudState();
    showToast("지금 동기화했어요.");
  } catch (error) {
    setSyncError(error, "지금 동기화하지 못했습니다.");
  } finally {
    setSyncBusy(false);
    renderSyncPanel();
  }
}

async function prepareCloudStateChoice() {
  if (!canSync()) return;

  setSyncBusy(true);
  try {
    const row = await fetchCloudState();
    syncState.cloudRow = row;
    syncState.needsCloudChoice = !row || shouldPromptForCloud(row);
    syncState.status = syncState.needsCloudChoice ? "needs-choice" : "synced";
    if (row && !syncState.needsCloudChoice) {
      markCloudSynced(row.updated_at || syncMeta.lastSyncedAt);
      scheduleCloudSave();
    }
  } catch (error) {
    setSyncError(error, "클라우드 상태를 확인하지 못했습니다.");
  } finally {
    setSyncBusy(false);
    renderSyncPanel();
  }
}

async function fetchCloudState() {
  const userId = syncState.session?.user?.id;
  if (!userId) return null;
  const { data, error } = await syncState.client
    .from(SUPABASE_TABLE)
    .select("data, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function pullCloudState() {
  if (!canSync()) return;

  setSyncBusy(true);
  try {
    const row = syncState.cloudRow || await fetchCloudState();
    if (!row) {
      showToast("불러올 클라우드 데이터가 없어요.");
      return;
    }

    backupLocalState("cloud-pull");
    applyStateObject(row.data);
    syncState.needsCloudChoice = false;
    syncState.cloudRow = row;
    markCloudSynced(row.updated_at || new Date().toISOString());
    persistAndRender(false);
    showToast("클라우드 데이터를 불러왔어요.");
  } catch (error) {
    setSyncError(error, "클라우드 데이터를 불러오지 못했습니다.");
  } finally {
    setSyncBusy(false);
    renderSyncPanel();
  }
}

async function pushLocalState() {
  if (!canSync()) return;

  setSyncBusy(true);
  try {
    syncState.needsCloudChoice = false;
    await upsertCloudState();
    showToast("현재 기기 데이터를 업로드했어요.");
  } catch (error) {
    setSyncError(error, "현재 기기 데이터를 업로드하지 못했습니다.");
  } finally {
    setSyncBusy(false);
    renderSyncPanel();
  }
}

async function mergeCloudState() {
  if (!canSync()) return;

  setSyncBusy(true);
  try {
    const row = syncState.cloudRow || await fetchCloudState();
    if (!row) {
      await upsertCloudState();
      showToast("업로드할 클라우드 데이터를 만들었어요.");
      return;
    }

    backupLocalState("cloud-merge");
    mergeStateObject(row.data);
    syncState.needsCloudChoice = false;
    persistAndRender(false);
    await upsertCloudState();
    showToast("가능한 항목을 병합하고 동기화했어요.");
  } catch (error) {
    setSyncError(error, "클라우드 데이터와 병합하지 못했습니다.");
  } finally {
    setSyncBusy(false);
    renderSyncPanel();
  }
}

function scheduleCloudSave() {
  window.clearTimeout(syncState.saveTimer);
  if (!canSync() || syncState.needsCloudChoice) return;
  syncState.saveTimer = window.setTimeout(() => {
    upsertCloudState({ silent: true }).catch((error) => {
      setSyncError(error, "클라우드 저장에 실패했습니다.");
    });
  }, SYNC_DEBOUNCE_MS);
}

async function upsertCloudState({ silent = false } = {}) {
  if (!canSync() || syncState.needsCloudChoice) return false;

  const userId = syncState.session.user.id;
  const updatedAt = new Date().toISOString();
  syncState.status = "syncing";
  if (!silent) renderSyncPanel();

  const { error } = await syncState.client
    .from(SUPABASE_TABLE)
    .upsert({
      user_id: userId,
      data: serializeStateForCloud(),
      updated_at: updatedAt
    }, { onConflict: "user_id" });

  if (error) throw error;
  syncState.status = "synced";
  syncState.errorMessage = "";
  syncState.cloudRow = {
    data: serializeStateForCloud(),
    updated_at: updatedAt
  };
  markCloudSynced(updatedAt);
  renderSyncPanel();
  return true;
}

function shouldPromptForCloud(row) {
  if (!row) return false;
  if (syncMeta.userId !== syncState.session?.user?.id || !syncMeta.lastSyncedAt) return true;
  return new Date(row.updated_at).getTime() > new Date(syncMeta.lastSyncedAt).getTime() + 1000;
}

function canSync() {
  return syncState.configured
    && syncState.available
    && Boolean(syncState.client)
    && Boolean(syncState.session)
    && syncState.online;
}

function setSyncBusy(value) {
  syncState.busy = value;
  if (value && syncState.status !== "error") syncState.status = "syncing";
  renderSyncPanel();
}

function setSyncError(error, fallback) {
  syncState.status = "error";
  syncState.errorMessage = error?.message || fallback;
  renderSyncPanel();
  showToast("동기화 실패. 로컬 저장은 유지되었습니다.");
}

function serializeStateForCloud() {
  ensureLibraryShape();
  return JSON.parse(JSON.stringify({
    version: IMPORT_VERSION,
    profiles: state.profiles,
    categories: state.categories,
    items: state.items,
    view: state.view,
    categoryFilter: state.categoryFilter,
    slotFilter: state.slotFilter,
    query: state.query,
    sort: state.sort,
    selectedId: state.selectedId
  }));
}

function applyStateObject(raw) {
  const incoming = raw && typeof raw === "object" ? raw : {};
  state = {
    ...structuredClone(initialState),
    ...incoming,
    profiles: Array.isArray(incoming.profiles) ? incoming.profiles : ["나"],
    categories: Array.isArray(incoming.categories) ? incoming.categories : structuredClone(initialState.categories),
    items: Array.isArray(incoming.items) ? incoming.items : []
  };
  ensureLibraryShape();
}

function mergeStateObject(raw) {
  const incoming = normalizeExternalState(raw);
  incoming.profiles.forEach((profile) => ensureProfile(String(profile)));
  incoming.categories.forEach(mergeImportedCategory);

  const indexByVideo = new Map(state.items.map((item, index) => [`${item.type}:${item.videoId}`, index]));
  incoming.items.map(cleanImportedItem).filter(Boolean).forEach((item) => {
    const key = `${item.type}:${item.videoId}`;
    const existingIndex = indexByVideo.get(key);
    if (existingIndex === undefined) {
      indexByVideo.set(key, state.items.length);
      state.items.push(item);
      return;
    }

    const existing = state.items[existingIndex];
    if (new Date(item.updatedAt).getTime() > new Date(existing.updatedAt || existing.createdAt || 0).getTime()) {
      state.items[existingIndex] = {
        ...existing,
        ...item,
        id: existing.id || item.id
      };
    }
  });

  ensureLibraryShape();
}

function normalizeExternalState(raw) {
  const previous = state;
  applyStateObject(raw);
  const normalized = serializeStateForCloud();
  state = previous;
  ensureLibraryShape();
  return normalized;
}

function backupLocalState(reason) {
  const backedUpAt = new Date().toISOString();
  localStorage.setItem(`${CLOUD_BACKUP_PREFIX}${backedUpAt}`, JSON.stringify({
    reason,
    backedUpAt,
    state: serializeStateForCloud()
  }));
}

function loadSyncMeta() {
  try {
    const meta = JSON.parse(localStorage.getItem(SYNC_META_KEY));
    if (!meta || typeof meta !== "object") return {};
    return {
      userId: String(meta.userId || ""),
      lastSyncedAt: String(meta.lastSyncedAt || "")
    };
  } catch {
    return {};
  }
}

function saveSyncMeta() {
  localStorage.setItem(SYNC_META_KEY, JSON.stringify(syncMeta));
}

function markCloudSynced(lastSyncedAt) {
  if (!syncState.session?.user?.id || !lastSyncedAt) return;
  syncMeta = {
    userId: syncState.session.user.id,
    lastSyncedAt
  };
  saveSyncMeta();
}

function formatSyncTime(value) {
  if (!value) return "아직 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "아직 없음";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function exportLibrary() {
  const payload = {
    version: IMPORT_VERSION,
    exportedAt: new Date().toISOString(),
    app: APP_NAME,
    profiles: state.profiles,
    categories: state.categories,
    items: state.items
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `gaegol-tube-${date}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("내보내기 파일을 만들었어요.");
}

function openCategoryShareDialog() {
  ensureLibraryShape();
  renderCategoryShareOptions();

  const preferred = state.categoryFilter !== "all" && getCategory(state.categoryFilter)
    ? state.categoryFilter
    : state.categories[0]?.id;

  if (preferred) els.shareCategorySelect.value = preferred;
  updateCategoryShareCount();
  configureNativeShareButton();
  els.categoryShareDialog.showModal();
}

function renderCategoryShareOptions() {
  els.shareCategorySelect.innerHTML = "";
  state.categories.forEach((category) => {
    const count = getItemsByCategory(category.id).length;
    els.shareCategorySelect.add(new Option(`${category.name} (${count}개)`, category.id));
  });
}

function getItemsByCategory(categoryId) {
  return state.items.filter((item) => item.categoryId === categoryId);
}

function updateCategoryShareCount() {
  const categoryId = els.shareCategorySelect.value;
  const count = getItemsByCategory(categoryId).length;
  const hasItems = count > 0;

  els.shareCategoryCount.textContent = hasItems
    ? `이 카테고리에 ${count}개 항목이 있습니다.`
    : "공유할 항목이 없습니다.";
  els.downloadCategoryShareButton.disabled = !hasItems;
  els.nativeShareCategoryButton.disabled = !hasItems;
}

function handleCategoryShareSubmit(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    els.categoryShareDialog.close();
    return;
  }
  downloadCategoryShare();
}

function buildCategorySharePayload() {
  const category = getCategory(els.shareCategorySelect.value);
  if (!category) throw new Error("category missing");

  const includeNotes = els.shareIncludeNotes.checked;
  const includeStatus = els.shareIncludeStatus.checked;
  const includeFavorite = els.shareIncludeFavorite.checked;
  const includeSlot = els.shareIncludeSlot.checked;
  const sharedCategoryId = `shared-${category.id}`;
  const items = getItemsByCategory(category.id).map((item) =>
    sanitizeSharedItem(item, sharedCategoryId, {
      includeNotes,
      includeStatus,
      includeFavorite,
      includeSlot
    })
  );

  if (!items.length) throw new Error("empty category");

  const slots = includeSlot
    ? [...new Set(items.map((item) => item.slot || DEFAULT_SLOT))]
    : [DEFAULT_SLOT];

  return {
    version: CATEGORY_SHARE_VERSION,
    app: APP_NAME,
    exportType: "category-share",
    exportedAt: new Date().toISOString(),
    source: {
      categoryId: category.id,
      categoryName: category.name,
      itemCount: items.length,
      includeNotes,
      includeStatus,
      includeFavorite,
      includeSlot
    },
    profiles: ["공유"],
    categories: [
      {
        id: sharedCategoryId,
        name: category.name,
        slots
      }
    ],
    items
  };
}

function sanitizeSharedItem(item, sharedCategoryId, options) {
  const now = new Date().toISOString();
  const slot = options.includeSlot ? item.slot || DEFAULT_SLOT : DEFAULT_SLOT;

  return {
    id: createId(item.videoId),
    videoId: item.videoId,
    type: item.type === "short" ? "short" : "video",
    url: item.url,
    title: item.title || "",
    author: item.author || "",
    note: options.includeNotes ? item.note || "" : "",
    tags: [],
    profile: "공유",
    categoryId: sharedCategoryId,
    categoryName: getCategoryName(item.categoryId),
    slot,
    status: options.includeStatus ? item.status || "queue" : "queue",
    favorite: options.includeFavorite ? Boolean(item.favorite) : false,
    createdAt: item.createdAt || now,
    updatedAt: item.updatedAt || now
  };
}

function downloadCategoryShare() {
  let payload;
  try {
    payload = buildCategorySharePayload();
  } catch {
    showToast("공유할 항목이 없어요.");
    return;
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = makeCategoryShareFileName(payload.source.categoryName);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("카테고리 공유 파일을 만들었어요.");
}

async function shareCategoryWithNativeShare() {
  let payload;
  try {
    payload = buildCategorySharePayload();
  } catch {
    showToast("공유할 항목이 없어요.");
    return;
  }

  const fileName = makeCategoryShareFileName(payload.source.categoryName);
  if (typeof File !== "function") {
    downloadCategoryShare();
    return;
  }

  const file = new File([JSON.stringify(payload, null, 2)], fileName, { type: "application/json" });

  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    try {
      await navigator.share({
        title: `${payload.source.categoryName} - ${APP_NAME} 공유 목록`,
        text: `${APP_NAME} ${payload.source.categoryName} 카테고리 공유 목록입니다.`,
        files: [file]
      });
      showToast("공유창을 열었어요.");
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }

  downloadCategoryShare();
}

function configureNativeShareButton() {
  els.nativeShareCategoryButton.hidden = !navigator.share;
}

function makeCategoryShareFileName(categoryName) {
  const date = new Date().toISOString().slice(0, 10);
  return `gaegol-tube-share-${safeFilePart(categoryName)}-${date}.json`;
}

function safeFilePart(value) {
  return String(value || "category")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 40) || "category";
}

async function importLibrary(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    const incomingItems = Array.isArray(imported) ? imported : imported.items;
    if (!Array.isArray(incomingItems)) throw new Error("items missing");
    const isCategoryShare = !Array.isArray(imported) && imported?.exportType === "category-share";
    const sharedCategoryName = isCategoryShare ? cleanLabel(imported.source?.categoryName, "") : "";

    ensureLibraryShape();
    const importedProfiles = Array.isArray(imported.profiles) ? imported.profiles : [];
    importedProfiles.forEach((profile) => ensureProfile(String(profile)));

    const importedCategories = Array.isArray(imported.categories) ? imported.categories : [];
    const categoryIdMap = new Map();
    importedCategories.forEach((raw) => {
      const incomingId = String(typeof raw === "object" && raw?.id ? raw.id : "").trim();
      const category = mergeImportedCategory(raw);
      if (incomingId && category) categoryIdMap.set(incomingId, category.id);
    });

    const existing = new Set(state.items.map((item) => `${item.type}:${item.videoId}`));
    const cleanedItems = incomingItems.map((item) => cleanImportedItem(item, categoryIdMap)).filter(Boolean);
    let added = 0;

    cleanedItems.forEach((item) => {
      const key = `${item.type}:${item.videoId}`;
      if (existing.has(key)) return;
      existing.add(key);
      state.items.push(item);
      added += 1;
    });

    ensureLibraryShape();
    persistAndRender();
    showToast(isCategoryShare && sharedCategoryName
      ? `${sharedCategoryName} 공유 목록에서 ${added}개를 가져왔어요.`
      : `${added}개를 가져왔어요.`);
  } catch {
    showToast("가져오기 파일을 읽지 못했어요.");
  } finally {
    els.importInput.value = "";
  }
}

function cleanImportedItem(raw, categoryIdMap = new Map()) {
  const parsed = parseYoutubeUrl(raw.url || `https://www.youtube.com/watch?v=${raw.videoId || ""}`);
  if (!parsed) return null;
  const now = new Date().toISOString();
  let categoryId = String(raw.categoryId || "").trim();
  if (categoryIdMap.has(categoryId)) categoryId = categoryIdMap.get(categoryId);
  if (!getCategory(categoryId)) {
    const categoryName = String(raw.categoryName || raw.category || "").trim();
    categoryId = categoryName ? ensureCategory(categoryName).id : DEFAULT_CATEGORY_ID;
  }
  const slot = ensureCategorySlot(categoryId, raw.slot || raw.section || raw.group || DEFAULT_SLOT);

  return {
    id: raw.id || createId(parsed.videoId),
    videoId: parsed.videoId,
    type: raw.type === "short" ? "short" : parsed.type,
    url: parsed.type === "short" ? `https://www.youtube.com/shorts/${parsed.videoId}` : `https://www.youtube.com/watch?v=${parsed.videoId}`,
    title: String(raw.title || "").trim(),
    author: String(raw.author || "").trim(),
    note: String(raw.note || "").trim(),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String).map((tag) => tag.trim()).filter(Boolean) : parseTags(raw.tags || ""),
    profile: String(raw.profile || "나").trim() || "나",
    categoryId,
    slot,
    status: raw.status === "done" ? "done" : "queue",
    favorite: Boolean(raw.favorite),
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now
  };
}

function ensureCategoryOptions() {
  ensureLibraryShape();

  [els.categoryInput, els.editCategory].forEach((select) => {
    const current = select.value;
    select.innerHTML = "";
    state.categories.forEach((category) => select.add(new Option(category.name, category.id)));
    select.value = getCategory(current) ? current : state.categories[0].id;
  });

  renderSlotOptions(els.categoryInput, els.slotInput);
  renderSlotOptions(els.editCategory, els.editSlot);
}

function renderSlotOptions(categorySelect, slotSelect, preferredSlot = slotSelect.value) {
  const category = getCategory(categorySelect.value) || getDefaultCategory();
  categorySelect.value = category.id;
  const slot = ensureCategorySlot(category.id, preferredSlot || category.slots[0] || DEFAULT_SLOT);

  slotSelect.innerHTML = "";
  category.slots.forEach((value) => slotSelect.add(new Option(value, value)));
  slotSelect.value = slot;
}

function ensureLibraryShape() {
  state.profiles = Array.isArray(state.profiles) ? state.profiles : ["나"];
  state.items = Array.isArray(state.items) ? state.items : [];

  const cleanedCategories = [];
  const seenIds = new Set();
  const rawCategories = Array.isArray(state.categories) ? state.categories : [];

  rawCategories.forEach((raw) => {
    const name = cleanLabel(typeof raw === "string" ? raw : raw?.name, "");
    if (!name) return;
    let id = String(typeof raw === "object" && raw?.id ? raw.id : "").trim() || createCategoryId();
    while (seenIds.has(id)) id = createCategoryId();
    seenIds.add(id);
    cleanedCategories.push({
      id,
      name,
      slots: cleanSlots(typeof raw === "object" ? raw.slots : [])
    });
  });

  if (!cleanedCategories.some((category) => category.id === DEFAULT_CATEGORY_ID)) {
    cleanedCategories.unshift(createDefaultCategory());
    seenIds.add(DEFAULT_CATEGORY_ID);
  }

  state.categories = cleanedCategories.map((category) => ({
    ...category,
    slots: category.slots.length ? category.slots : [DEFAULT_SLOT]
  }));

  state.items.forEach((item) => {
    const existingCategory = getCategory(item.categoryId);
    if (!existingCategory) {
      item.categoryId = DEFAULT_CATEGORY_ID;
    }
    item.slot = ensureCategorySlot(item.categoryId, item.slot || DEFAULT_SLOT);
  });

  if (state.categoryFilter !== "all" && !getCategory(state.categoryFilter)) state.categoryFilter = "all";
  if (!state.slotFilter) state.slotFilter = "all";
  delete state.profileFilter;
  delete state.tagFilter;
  if (!state.view) state.view = "all";
  if (!state.sort) state.sort = "newest";
}

function mergeImportedCategory(raw) {
  const name = cleanLabel(typeof raw === "string" ? raw : raw?.name, "");
  if (!name) return null;
  const incomingId = String(typeof raw === "object" && raw?.id ? raw.id : "").trim();
  let category = incomingId ? getCategory(incomingId) : null;
  if (!category) category = state.categories.find((entry) => entry.name === name);

  if (!category) {
    category = {
      id: incomingId || createCategoryId(),
      name,
      slots: []
    };
    state.categories.push(category);
  }

  cleanSlots(typeof raw === "object" ? raw.slots : []).forEach((slot) => ensureCategorySlot(category.id, slot));
  if (!category.slots.length) category.slots.push(DEFAULT_SLOT);
  return category;
}

function ensureProfile(profile) {
  const cleaned = cleanLabel(profile, "나");
  if (!state.profiles.includes(cleaned)) state.profiles.push(cleaned);
}

function ensureCategory(name) {
  const cleaned = cleanLabel(name, DEFAULT_CATEGORY_NAME);
  const existing = state.categories.find((category) => category.name === cleaned);
  if (existing) return existing;
  const category = { id: createCategoryId(), name: cleaned, slots: [DEFAULT_SLOT] };
  state.categories.push(category);
  return category;
}

function ensureCategorySlot(categoryId, slotName) {
  const category = getCategory(categoryId) || getDefaultCategory();
  const slot = cleanLabel(slotName, DEFAULT_SLOT);
  if (!category.slots.includes(slot)) {
    category.slots.push(slot);
    category.slots.sort((a, b) => {
      if (a === DEFAULT_SLOT) return -1;
      if (b === DEFAULT_SLOT) return 1;
      return a.localeCompare(b, "ko");
    });
  }
  return slot;
}

function getCategory(categoryId) {
  return state.categories.find((category) => category.id === categoryId) || null;
}

function getDefaultCategory() {
  return getCategory(DEFAULT_CATEGORY_ID) || state.categories[0] || createDefaultCategory();
}

function getCategoryName(categoryId) {
  return getCategory(categoryId)?.name || DEFAULT_CATEGORY_NAME;
}

function getVisibleSlots() {
  const categories = state.categoryFilter === "all"
    ? state.categories
    : state.categories.filter((category) => category.id === state.categoryFilter);
  return [...new Set(categories.flatMap((category) => category.slots || []))]
    .filter(Boolean)
    .sort((a, b) => {
      if (a === DEFAULT_SLOT) return -1;
      if (b === DEFAULT_SLOT) return 1;
      return a.localeCompare(b, "ko");
    });
}

function cleanSlots(slots) {
  return [...new Set((Array.isArray(slots) ? slots : [])
    .map((slot) => cleanLabel(slot, ""))
    .filter(Boolean))];
}

function cleanLabel(value, fallback) {
  return String(value || "").trim().slice(0, 28) || fallback;
}

function createDefaultCategory() {
  return { id: DEFAULT_CATEGORY_ID, name: DEFAULT_CATEGORY_NAME, slots: [DEFAULT_SLOT] };
}

function createCategoryId() {
  return `category-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseTags(value) {
  return [...new Set(String(value || "")
    .split(/[,#\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => tag.slice(0, 28)))];
}

function thumbnailUrl(item) {
  return `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`;
}

function displayTitle(item) {
  return item.title || fallbackTitle(item);
}

function fallbackTitle(item) {
  return item.type === "short" ? `YouTube 숏츠 ${item.videoId}` : `YouTube 영상 ${item.videoId}`;
}

function normalizeText(value) {
  return String(value || "").trim().toLocaleLowerCase("ko");
}

function createId(seed) {
  return `${seed}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function persistAndRender(show = true) {
  persist();
  render();
  if (show) requestAnimationFrame(() => {});
}

function persist() {
  state.version = IMPORT_VERSION;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  scheduleCloudSave();
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || typeof stored !== "object") return structuredClone(initialState);
    return {
      ...structuredClone(initialState),
      ...stored,
      profiles: Array.isArray(stored.profiles) ? stored.profiles : ["나"],
      categories: Array.isArray(stored.categories) ? stored.categories : structuredClone(initialState.categories),
      items: Array.isArray(stored.items) ? stored.items : []
    };
  } catch {
    return structuredClone(initialState);
  }
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = window.setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
