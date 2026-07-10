const APP_NAME = "개골튜브";
const APP_VERSION = "2026.07.11.1";
const STORAGE_KEY = "tube-vault-state-v1";
const THEME_STORAGE_KEY = "gaegol-tube-theme-v1";
const PAGE_SIZE_STORAGE_KEY = "gaegol-tube-page-size-v1";
const CATEGORY_SORT_STORAGE_KEY = "gaegol-tube-category-sort-mode-v1";
const IMPORT_VERSION = 2;
const CATEGORY_SHARE_VERSION = 3;
const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100];
const DEFAULT_CATEGORY_ID = "general";
const DEFAULT_CATEGORY_NAME = "기본";
const DEFAULT_SLOT = "기본";
const CATEGORY_SORT_MODES = ["custom", "name", "created"];
const SYNC_META_KEY = "tubeVaultSyncMeta";
const CLOUD_BACKUP_PREFIX = "tubeVaultBackupBeforeCloudPull:";
const CATEGORY_DELETE_BACKUP_PREFIX = "gaegolTubeBeforeCategoryDelete:";
const SUPABASE_TABLE = "tube_vault_states";
const SUPABASE_CLIENT_SCRIPT = "./vendor/supabase-js.min.js";
const SUPABASE_CLIENT_VERSION = "2.108.2";
const SYNC_DEBOUNCE_MS = 1200;
const METADATA_TIMEOUT_MS = 8000;
const METADATA_RETRY_MS = 24 * 60 * 60 * 1000;
const METADATA_AUTO_LIMIT = 10;
const METADATA_MANUAL_LIMIT = 20;
const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_ITEMS = 10000;
const MAX_IMPORT_CATEGORIES = 1000;
const MAX_IMPORT_PROFILES = 200;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com"
]);
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
  categories: [{
    id: DEFAULT_CATEGORY_ID,
    name: DEFAULT_CATEGORY_NAME,
    slots: [DEFAULT_SLOT],
    createdAt: "2020-01-01T00:00:00.000Z",
    order: 0
  }],
  items: [],
  view: "all",
  typeFilter: "all",
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
let waitingServiceWorker = null;
let refreshingForServiceWorker = false;
let currentPage = 1;
let pageSize = loadPageSize();
let categorySortMode = loadCategorySortMode();
let activePreviewItemId = null;
let draftTheme = { ...currentTheme };
let themeDialogSaved = false;
let syncMeta = loadSyncMeta();
let pendingDeleteCategoryId = null;
let metadataHydrationBusy = false;
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
  saveTimer: 0,
  writeQueue: Promise.resolve()
};

const els = {
  saveForm: $("#saveForm"),
  urlInput: $("#urlInput"),
  titleInput: $("#titleInput"),
  typeInput: $("#typeInput"),
  typeInputHelp: $("#typeInputHelp"),
  categoryInput: $("#categoryInput"),
  slotInput: $("#slotInput"),
  newCategoryButton: $("#newCategoryButton"),
  newSlotButton: $("#newSlotButton"),
  noteInput: $("#noteInput"),
  pasteButton: $("#pasteButton"),
  totalCount: $("#totalCount"),
  viewFilters: $("#viewFilters"),
  categoryFilter: $("#categoryFilter"),
  typeFilter: $("#typeFilter"),
  slotCloud: $("#slotCloud"),
  searchInput: $("#searchInput"),
  hydrateMetadataButton: $("#hydrateMetadataButton"),
  sortInput: $("#sortInput"),
  paginationPanel: $("#paginationPanel"),
  paginationSummary: $("#paginationSummary"),
  pageSizeSelect: $("#pageSizeSelect"),
  firstPageButton: $("#firstPageButton"),
  prevPageButton: $("#prevPageButton"),
  nextPageButton: $("#nextPageButton"),
  lastPageButton: $("#lastPageButton"),
  pageNumberList: $("#pageNumberList"),
  pageJumpForm: $("#pageJumpForm"),
  pageJumpInput: $("#pageJumpInput"),
  pageJumpButton: $("#pageJumpButton"),
  pageTotalText: $("#pageTotalText"),
  videoGrid: $("#videoGrid"),
  emptyState: $("#emptyState"),
  migrationEmptyNote: $("#migrationEmptyNote"),
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
  categoryManageButton: $("#categoryManageButton"),
  categoryManageDialog: $("#categoryManageDialog"),
  categoryManageForm: $("#categoryManageForm"),
  categorySortMode: $("#categorySortMode"),
  categorySortHelp: $("#categorySortHelp"),
  categoryManageList: $("#categoryManageList"),
  categoryDeleteDialog: $("#categoryDeleteDialog"),
  categoryDeleteForm: $("#categoryDeleteForm"),
  categoryDeleteDescription: $("#categoryDeleteDescription"),
  deleteCategoryName: $("#deleteCategoryName"),
  deleteCategoryItemCount: $("#deleteCategoryItemCount"),
  deleteCategoryOptions: $("#deleteCategoryOptions"),
  deleteMoveTargetSelect: $("#deleteMoveTargetSelect"),
  deleteModeMove: $("#deleteModeMove"),
  deleteModeDeleteItems: $("#deleteModeDeleteItems"),
  moveTargetField: $("#moveTargetField"),
  deleteCategoryDangerNote: $("#deleteCategoryDangerNote"),
  deleteConfirmTextField: $("#deleteConfirmTextField"),
  deleteConfirmTextInput: $("#deleteConfirmTextInput"),
  confirmDeleteCategoryButton: $("#confirmDeleteCategoryButton"),
  migrationButton: $("#migrationButton"),
  migrationDialog: $("#migrationDialog"),
  migrationForm: $("#migrationForm"),
  migrationMode: $("#migrationMode"),
  migrationOrigin: $("#migrationOrigin"),
  migrationStorageKey: $("#migrationStorageKey"),
  migrationItemCount: $("#migrationItemCount"),
  migrationAppVersion: $("#migrationAppVersion"),
  migrationWarning: $("#migrationWarning"),
  migrationBackupButton: $("#migrationBackupButton"),
  migrationImportButton: $("#migrationImportButton"),
  migrationReloadButton: $("#migrationReloadButton"),
  categoryShareButton: $("#categoryShareButton"),
  categoryShareDialog: $("#categoryShareDialog"),
  categoryShareForm: $("#categoryShareForm"),
  shareCategorySelect: $("#shareCategorySelect"),
  shareCategoryCount: $("#shareCategoryCount"),
  shareIncludeNotes: $("#shareIncludeNotes"),
  shareIncludeStatus: $("#shareIncludeStatus"),
  shareIncludeFavorite: $("#shareIncludeFavorite"),
  shareIncludeSlot: $("#shareIncludeSlot"),
  shareSummaryCount: $("#shareSummaryCount"),
  shareSummaryNotes: $("#shareSummaryNotes"),
  shareSummaryStatus: $("#shareSummaryStatus"),
  shareSummaryFavorite: $("#shareSummaryFavorite"),
  shareSummarySlot: $("#shareSummarySlot"),
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
  editAuthor: $("#editAuthor"),
  editCategory: $("#editCategory"),
  editSlot: $("#editSlot"),
  newEditCategoryButton: $("#newEditCategoryButton"),
  newEditSlotButton: $("#newEditSlotButton"),
  editStatus: $("#editStatus"),
  editType: $("#editType"),
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
  updateBanner: $("#updateBanner"),
  applyUpdateButton: $("#applyUpdateButton"),
  toast: $("#toast")
};

init();

function init() {
  ensureLibraryShape();
  ensureCategoryOptions();
  bindEvents();
  updateTypeInputHelp();
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
    resetToFirstPage();
    persistAndRender();
  });
  els.typeFilter.addEventListener("change", () => {
    state.typeFilter = els.typeFilter.value;
    resetToFirstPage();
    persistAndRender();
  });
  els.typeInput.addEventListener("change", updateTypeInputHelp);
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
    resetToFirstPage();
    persistAndRender(false);
  });
  els.hydrateMetadataButton?.addEventListener("click", () => {
    hydrateMissingMetadata({
      force: true,
      forceVisibleToast: true,
      limit: METADATA_MANUAL_LIMIT
    });
  });
  els.sortInput.addEventListener("change", () => {
    state.sort = els.sortInput.value;
    resetToFirstPage();
    persistAndRender();
  });
  els.pageSizeSelect.addEventListener("change", handlePageSizeChange);
  els.firstPageButton.addEventListener("click", () => goToPage(1));
  els.prevPageButton.addEventListener("click", () => goToPage(currentPage - 1));
  els.nextPageButton.addEventListener("click", () => goToPage(currentPage + 1));
  els.lastPageButton.addEventListener("click", () => goToPage(getTotalPages(getFilteredItems().length)));
  els.pageNumberList.addEventListener("click", handlePageNumberClick);
  els.pageJumpForm.addEventListener("submit", handlePageJump);
  els.pageJumpButton.addEventListener("click", handlePageJump);
  els.pageJumpInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") handlePageJump(event);
  });
  els.slotCloud.addEventListener("click", handleSlotFilter);
  els.videoGrid.addEventListener("click", handleCardAction);
  els.closePlayerButton?.addEventListener("click", closePlayer);
  els.exportButton.addEventListener("click", exportLibrary);
  els.importInput.addEventListener("change", importLibrary);
  els.categoryManageButton.addEventListener("click", openCategoryManageDialog);
  els.categorySortMode?.addEventListener("change", handleCategorySortModeChange);
  els.categoryManageForm.addEventListener("submit", handleCategoryManageSubmit);
  els.categoryManageList.addEventListener("click", handleCategoryManageAction);
  els.categoryManageList.addEventListener("dragstart", handleCategoryDragStart);
  els.categoryManageList.addEventListener("dragover", handleCategoryDragOver);
  els.categoryManageList.addEventListener("drop", handleCategoryDrop);
  els.categoryManageList.addEventListener("dragend", handleCategoryDragEnd);
  els.categoryDeleteForm.addEventListener("submit", handleCategoryDeleteSubmit);
  els.deleteModeMove.addEventListener("change", updateDeleteCategoryModeUI);
  els.deleteModeDeleteItems.addEventListener("change", updateDeleteCategoryModeUI);
  els.deleteConfirmTextInput.addEventListener("input", updateDeleteCategoryModeUI);
  els.migrationButton.addEventListener("click", openMigrationDialog);
  els.migrationForm.addEventListener("submit", handleMigrationSubmit);
  els.migrationBackupButton.addEventListener("click", exportMigrationBackup);
  els.migrationImportButton.addEventListener("click", openImportFromMigration);
  els.migrationReloadButton.addEventListener("click", reloadForFreshVersion);
  els.applyUpdateButton.addEventListener("click", applyWaitingServiceWorker);
  els.categoryShareButton.addEventListener("click", openCategoryShareDialog);
  els.shareCategorySelect.addEventListener("change", updateCategoryShareCount);
  [els.shareIncludeNotes, els.shareIncludeStatus, els.shareIncludeFavorite, els.shareIncludeSlot]
    .forEach((input) => input.addEventListener("change", updateCategoryShareSummary));
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
  openDialog(els.installDialog);
}

function openDialog(dialog) {
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
    return;
  }
  dialog.setAttribute("open", "");
}

function closeDialog(dialog) {
  if (typeof dialog.close === "function") {
    dialog.close();
    return;
  }
  dialog.removeAttribute("open");
  dialog.dispatchEvent(new Event("close"));
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
  const selectedTypeMode = getSelectedTypeMode();
  const addedIds = [];
  let added = 0;
  let skipped = 0;

  parsed.forEach((video) => {
    const type = resolveSelectedVideoType(video.type);
    const exists = state.items.some((item) => item.videoId === video.videoId && item.type === type);
    if (exists) {
      skipped += 1;
      return;
    }

    const item = {
      id: createId(video.videoId),
      videoId: video.videoId,
      type,
      url: normalizeYoutubeItemUrl(video.videoId, type),
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
    };
    state.items.unshift(item);
    addedIds.push(item.id);
    added += 1;

  });

  ensureProfile(profile);
  if (added > 0) resetToFirstPage();
  persistAndRender();
  hydrateMissingMetadata({ onlyIds: addedIds, limit: METADATA_AUTO_LIMIT });

  if (added > 0) {
    els.saveForm.reset();
    els.typeInput.value = selectedTypeMode;
    els.categoryInput.value = category.id;
    renderSlotOptions(els.categoryInput, els.slotInput, slot);
    updateTypeInputHelp();
  }

  const typeMessage = getSaveTypeToastSuffix(selectedTypeMode);
  const message = skipped
    ? `${added}개 저장, ${skipped}개는 이미 있었어요. ${typeMessage}`
    : `${added}개 저장했어요. ${typeMessage}`;
  showToast(message);
}

function getSelectedTypeMode() {
  const selected = els.typeInput?.value || "auto";
  return ["auto", "short", "video"].includes(selected) ? selected : "auto";
}

function resolveSelectedVideoType(detectedType) {
  const selected = getSelectedTypeMode();
  if (selected === "short") return "short";
  if (selected === "video") return "video";
  return detectedType === "short" ? "short" : "video";
}

function getSaveTypeToastSuffix(typeMode) {
  if (typeMode === "short") return "영상 유형은 숏츠로 저장했어요.";
  if (typeMode === "video") return "영상 유형은 롱폼으로 저장했어요.";
  return "영상 유형은 자동 인식했어요.";
}

function updateTypeInputHelp() {
  if (!els.typeInputHelp) return;
  const selected = getSelectedTypeMode();
  if (selected === "short") {
    els.typeInputHelp.textContent = "붙여넣은 링크 형태와 관계없이 숏츠로 저장합니다.";
    return;
  }
  if (selected === "video") {
    els.typeInputHelp.textContent = "붙여넣은 링크 형태와 관계없이 롱폼으로 저장합니다.";
    return;
  }
  els.typeInputHelp.textContent = "/shorts/ 링크는 숏츠로, 일반 watch 링크는 롱폼으로 자동 인식합니다.";
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
  resetToFirstPage();
  persistAndRender();
}

function handleSlotFilter(event) {
  const button = event.target.closest("[data-slot]");
  if (!button) return;
  state.slotFilter = button.dataset.slot;
  resetToFirstPage();
  persistAndRender();
}

function handleCardAction(event) {
  const card = event.target.closest(".video-card");
  if (!card) return;
  const item = state.items.find((entry) => entry.id === card.dataset.id);
  if (!item) return;

  const actionButton = event.target.closest("[data-action]");
  if (actionButton?.dataset.action === "play-preview") {
    event.preventDefault();
    event.stopPropagation();
    playInlinePreview(item.id);
    return;
  }

  if (actionButton?.dataset.action === "stop-preview") {
    event.preventDefault();
    event.stopPropagation();
    stopInlinePreview(item.id);
    return;
  }

  if (event.target.closest(".thumb-button")) {
    playInlinePreview(item.id);
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
  els.editAuthor.value = item.author || "";
  els.editCategory.value = item.categoryId || DEFAULT_CATEGORY_ID;
  renderSlotOptions(els.editCategory, els.editSlot, item.slot || DEFAULT_SLOT);
  els.editStatus.value = item.status || "queue";
  els.editType.value = item.type === "short" ? "short" : "video";
  els.editNote.value = item.note || "";
  openDialog(els.editDialog);
}

function saveEdit(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    closeDialog(els.editDialog);
    return;
  }

  const item = state.items.find((entry) => entry.id === els.editId.value);
  if (!item) return;

  const category = getCategory(els.editCategory.value) || getDefaultCategory();
  const slot = ensureCategorySlot(category.id, els.editSlot.value);
  const nextType = els.editType.value === "short" ? "short" : "video";
  const duplicate = state.items.some((entry) =>
    entry.id !== item.id && entry.videoId === item.videoId && entry.type === nextType
  );
  if (duplicate) {
    showToast("같은 유형의 같은 영상이 이미 있어요.");
    return;
  }

  const nextTitle = els.editTitle.value.trim();
  const nextAuthor = cleanMetadataText(els.editAuthor.value, 80);
  const shouldUseFallbackTitle = !nextTitle || isGeneratedFallbackTitle(nextTitle, item.videoId);
  item.profile = item.profile || "나";
  item.categoryId = category.id;
  item.slot = slot;
  item.type = nextType;
  item.url = normalizeYoutubeItemUrl(item.videoId, nextType);
  item.title = shouldUseFallbackTitle ? fallbackTitle(item) : nextTitle;
  if ((item.author || "") !== nextAuthor) item.authorEdited = true;
  item.author = nextAuthor;
  item.status = els.editStatus.value;
  item.tags = Array.isArray(item.tags) ? item.tags : [];
  item.note = els.editNote.value.trim();
  item.updatedAt = new Date().toISOString();
  ensureProfile(item.profile);
  closeDialog(els.editDialog);
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
  closeDialog(els.editDialog);
  persistAndRender(true, { allowEmptyOverwrite: true });
  showToast("삭제했어요.");
}

function playItem(id) {
  playInlinePreview(id);
}

function closePlayer() {
  state.selectedId = null;
  if (els.playerFrame) els.playerFrame.src = "about:blank";
  if (els.playerPanel) els.playerPanel.hidden = true;
  persist();
}

function render() {
  stopInlinePreview();
  state.selectedId = null;
  ensureLibraryShape();
  ensureCategoryOptions();
  els.totalCount.value = String(state.items.length);
  els.searchInput.value = state.query;
  els.sortInput.value = state.sort;
  renderFilterState();
  renderSlotFilters();

  const filteredItems = getFilteredItems();
  const totalPages = getTotalPages(filteredItems.length);
  currentPage = clampPage(currentPage, totalPages);
  const visibleItems = getPaginatedItems(filteredItems);

  renderCards(visibleItems, filteredItems.length);
  renderPagination(filteredItems.length);
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
  getOrderedCategories().forEach((category) => els.categoryFilter.add(new Option(category.name, category.id)));
  els.categoryFilter.value = state.categoryFilter;
  els.typeFilter.value = state.typeFilter || "all";
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

function renderCards(items, filteredItemCount) {
  els.videoGrid.innerHTML = "";
  els.emptyState.hidden = filteredItemCount > 0;
  renderMigrationEmptyNote(filteredItemCount);

  items.forEach((item) => {
    const node = els.cardTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.id = item.id;
    node.dataset.itemId = item.id;

    const mediaSlot = $(".card-media", node);
    mediaSlot.replaceWith(renderMediaPreview(item));

    const typeBadge = $(".type-badge", node);
    typeBadge.textContent = getTypeLabel(item.type);
    typeBadge.classList.add(getTypeClass(item.type));

    $(".category-badge", node).textContent = getCategoryName(item.categoryId);
    $(".slot-badge", node).textContent = item.slot || DEFAULT_SLOT;
    $(".card-title", node).textContent = displayTitle(item);
    const authorEl = $(".card-author", node);
    const author = cleanMetadataText(item.author, 80);
    authorEl.textContent = author ? `채널: ${author}` : "";
    authorEl.hidden = !author;
    $(".card-note", node).textContent = item.note || " ";

    const favoriteButton = $(".favorite-button", node);
    favoriteButton.textContent = item.favorite ? "★" : "☆";
    favoriteButton.classList.toggle("active", item.favorite);

    const statusButton = $(".status-button", node);
    statusButton.classList.toggle("done", item.status === "done");
    statusButton.title = item.status === "done" ? "볼 예정으로 변경" : "봤음 표시";

    const openButton = $(".open-button", node);
    const safeYoutubeUrl = normalizeYoutubeItemUrl(item.videoId, normalizeItemType(item));
    openButton.href = safeYoutubeUrl || "https://www.youtube.com/";
    openButton.hidden = !safeYoutubeUrl;
    els.videoGrid.append(node);
  });
}

function renderMigrationEmptyNote(visibleItemCount) {
  const shouldShow = visibleItemCount === 0 && state.items.length === 0 && isIosLikeDevice();
  els.migrationEmptyNote.hidden = !shouldShow;
}

function renderPlayer() {
  if (!els.playerPanel) return;
  els.playerPanel.hidden = true;
  if (els.playerFrame) els.playerFrame.src = "about:blank";
}

function renderMediaPreview(item) {
  const preview = document.createElement("div");
  preview.className = "media-preview";
  preview.dataset.itemId = item.id;
  preview.dataset.videoId = item.videoId;
  preview.dataset.type = item.type === "short" ? "short" : "video";

  const image = document.createElement("img");
  image.className = "video-thumbnail thumb";
  image.src = thumbnailUrl(item);
  image.alt = `${displayTitle(item) || "YouTube 영상"} 썸네일`;
  image.loading = "lazy";

  const playButton = document.createElement("button");
  playButton.className = "play-preview-button";
  playButton.type = "button";
  playButton.dataset.action = "play-preview";
  playButton.setAttribute("aria-label", `${displayTitle(item)} 재생`);
  playButton.title = "이 영상 재생";
  playButton.textContent = "▶";

  const status = document.createElement("span");
  status.className = "duration-chip";
  status.textContent = item.status === "done" ? "봤음" : "볼 예정";

  preview.append(image, playButton, status);
  return preview;
}

function playInlinePreview(itemId) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) return;

  if (activePreviewItemId === itemId) return;
  stopInlinePreview();

  const card = findCardByItemId(itemId);
  const mediaElement = card?.querySelector(".media-preview");
  if (!card || !mediaElement) return;

  const wrapper = document.createElement("div");
  wrapper.className = "inline-player-wrap";
  wrapper.dataset.itemId = item.id;
  wrapper.dataset.videoId = item.videoId;
  wrapper.dataset.type = item.type === "short" ? "short" : "video";

  const iframe = document.createElement("iframe");
  iframe.className = "inline-player";
  iframe.title = displayTitle(item) || "YouTube 영상";
  iframe.src = createYoutubeEmbedUrl(item.videoId, item.type, { autoplay: true });
  iframe.allow = "autoplay; encrypted-media; picture-in-picture";
  iframe.loading = "lazy";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.allowFullscreen = true;

  const stopButton = document.createElement("button");
  stopButton.className = "stop-preview-button";
  stopButton.type = "button";
  stopButton.dataset.action = "stop-preview";
  stopButton.setAttribute("aria-label", "미리보기 닫기");
  stopButton.title = "미리보기 닫기";
  stopButton.textContent = "닫기";

  wrapper.append(iframe, stopButton);
  mediaElement.replaceWith(wrapper);
  card.classList.add("preview-playing");
  activePreviewItemId = itemId;
}

function stopInlinePreview(itemId = activePreviewItemId) {
  if (!itemId) return;

  const item = state.items.find((entry) => entry.id === itemId);
  const card = findCardByItemId(itemId);
  const mediaElement = card?.querySelector(".inline-player-wrap");
  if (mediaElement && item) {
    restorePreview(mediaElement, item);
  }
  if (card) card.classList.remove("preview-playing");
  if (activePreviewItemId === itemId) activePreviewItemId = null;
}

function createYoutubeEmbedUrl(videoId, type, options = {}) {
  const normalizedVideoId = normalizeVideoId(videoId);
  if (!normalizedVideoId) return "about:blank";
  const params = new URLSearchParams({
    rel: "0",
    playsinline: "1"
  });
  if (options.autoplay) params.set("autoplay", "1");
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(normalizedVideoId)}?${params.toString()}`;
}

function restorePreview(mediaElement, item) {
  mediaElement.replaceWith(renderMediaPreview(item));
}

function findCardByItemId(itemId) {
  return $$(".video-card", els.videoGrid).find((card) =>
    card.dataset.itemId === itemId || card.dataset.id === itemId
  );
}

function getFilteredItems() {
  return state.items
    .filter((item) => {
      if (state.view === "video" && item.type !== "video") return false;
      if (state.view === "short" && item.type !== "short") return false;
      if (state.view === "queue" && item.status === "done") return false;
      if (state.view === "done" && item.status !== "done") return false;
      if (state.view === "favorite" && !item.favorite) return false;
      if (state.typeFilter === "short" && item.type !== "short") return false;
      if (state.typeFilter === "video" && item.type !== "video") return false;
      if (state.categoryFilter !== "all" && item.categoryId !== state.categoryFilter) return false;
      if (state.slotFilter !== "all" && item.slot !== state.slotFilter) return false;

      return matchesQuery(item, state.query);
    })
    .sort(sortItems);
}

function getSearchText(item) {
  return normalizeSearchText([
    displayTitle(item),
    item.author,
    item.videoId,
    item.url,
    item.note,
    getCategoryName(item.categoryId),
    item.slot,
    getTypeLabel(item.type)
  ].filter(Boolean).join(" "));
}

function matchesQuery(item, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  const haystack = getSearchText(item);
  return tokens.every((token) => haystack.includes(token));
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

function getPaginatedItems(items) {
  const start = (currentPage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

function getTotalPages(totalItems) {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

function clampPage(page, totalPages) {
  const safePage = Number.parseInt(page, 10) || 1;
  return Math.min(Math.max(safePage, 1), totalPages);
}

function resetToFirstPage() {
  currentPage = 1;
}

function goToPage(page) {
  const totalPages = getTotalPages(getFilteredItems().length);
  const nextPage = clampPage(page, totalPages);
  if (nextPage === currentPage) {
    renderPagination(getFilteredItems().length);
    return;
  }
  currentPage = nextPage;
  render();
}

function handlePageSizeChange() {
  const nextSize = Number.parseInt(els.pageSizeSelect.value, 10);
  pageSize = PAGE_SIZE_OPTIONS.includes(nextSize) ? nextSize : DEFAULT_PAGE_SIZE;
  savePageSize(pageSize);
  resetToFirstPage();
  render();
}

function handlePageNumberClick(event) {
  const button = event.target.closest("[data-page]");
  if (!button) return;
  goToPage(button.dataset.page);
}

function handlePageJump(event) {
  event.preventDefault();
  const value = Number.parseInt(els.pageJumpInput.value, 10);
  if (Number.isNaN(value)) {
    showToast("이동할 페이지 번호를 입력하세요.");
    els.pageJumpInput.focus();
    return;
  }
  goToPage(value);
}

function renderPagination(totalItems) {
  const totalPages = getTotalPages(totalItems);
  currentPage = clampPage(currentPage, totalPages);
  const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);
  const isFiltered = hasActiveItemFilter();
  const query = String(state.query || "").trim();
  const summaryPrefix = query ? `‘${query}’ 검색 결과` : isFiltered ? "필터 결과" : "전체";

  els.pageSizeSelect.value = String(pageSize);
  els.paginationSummary.textContent = totalItems === 0
    ? "표시할 항목이 없습니다."
    : `${summaryPrefix} ${totalItems}개 중 ${start}-${end}개 표시`;

  els.firstPageButton.disabled = totalItems === 0 || currentPage === 1;
  els.prevPageButton.disabled = totalItems === 0 || currentPage === 1;
  els.nextPageButton.disabled = totalItems === 0 || currentPage === totalPages;
  els.lastPageButton.disabled = totalItems === 0 || currentPage === totalPages;
  els.pageJumpInput.disabled = totalItems === 0;
  els.pageJumpInput.min = "1";
  els.pageJumpInput.max = String(totalPages);
  els.pageJumpInput.placeholder = String(currentPage);
  els.pageJumpInput.value = String(currentPage);
  els.pageTotalText.textContent = `/ ${totalPages}`;

  renderPageNumberButtons(totalItems, totalPages);
}

function renderPageNumberButtons(totalItems, totalPages) {
  els.pageNumberList.innerHTML = "";
  const pages = getPageWindow(currentPage, totalPages);
  let previousPage = 0;

  pages.forEach((page) => {
    if (previousPage && page - previousPage > 1) {
      const ellipsis = document.createElement("span");
      ellipsis.className = "page-ellipsis";
      ellipsis.textContent = "...";
      els.pageNumberList.append(ellipsis);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = `page-button ${page === currentPage ? "is-active" : ""}`;
    button.dataset.page = String(page);
    button.textContent = String(page);
    button.disabled = totalItems === 0;
    button.setAttribute("aria-label", `${page}페이지로 이동`);
    if (page === currentPage) button.setAttribute("aria-current", "page");
    els.pageNumberList.append(button);
    previousPage = page;
  });
}

function getPageWindow(page, totalPages) {
  if (totalPages <= 10) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages]);

  for (let nextPage = page - 2; nextPage <= page + 2; nextPage += 1) {
    if (nextPage >= 1 && nextPage <= totalPages) pages.add(nextPage);
  }

  if (page <= 4) {
    for (let nextPage = 1; nextPage <= 6; nextPage += 1) pages.add(nextPage);
  }

  if (page >= totalPages - 3) {
    for (let nextPage = totalPages - 5; nextPage <= totalPages; nextPage += 1) {
      if (nextPage >= 1) pages.add(nextPage);
    }
  }

  return Array.from(pages).sort((a, b) => a - b);
}

function hasActiveItemFilter() {
  return state.view !== "all"
    || state.typeFilter !== "all"
    || state.categoryFilter !== "all"
    || state.slotFilter !== "all"
    || Boolean(state.query);
}

function loadPageSize() {
  const stored = Number.parseInt(localStorage.getItem(PAGE_SIZE_STORAGE_KEY), 10);
  return PAGE_SIZE_OPTIONS.includes(stored) ? stored : DEFAULT_PAGE_SIZE;
}

function savePageSize(size) {
  const normalized = PAGE_SIZE_OPTIONS.includes(size) ? size : DEFAULT_PAGE_SIZE;
  localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(normalized));
}

function loadCategorySortMode() {
  try {
    return normalizeCategorySortMode(localStorage.getItem(CATEGORY_SORT_STORAGE_KEY));
  } catch {
    return "custom";
  }
}

function saveCategorySortMode(mode) {
  localStorage.setItem(CATEGORY_SORT_STORAGE_KEY, normalizeCategorySortMode(mode));
}

function normalizeCategorySortMode(mode) {
  return CATEGORY_SORT_MODES.includes(mode) ? mode : "custom";
}

function setCategorySortMode(mode) {
  categorySortMode = normalizeCategorySortMode(mode);
  saveCategorySortMode(categorySortMode);
  updateCategorySortUI();
}

function parseYoutubeLinks(text) {
  const matches = String(text || "").match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"']*)?/gi) || [];
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
  let value = String(rawUrl || "").trim().replace(/[),.\]}]+$/g, "");
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;

  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const parts = url.pathname.split("/").filter(Boolean);
  let videoId = "";

  if (host === "youtu.be") {
    videoId = parts[0] || "";
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v") || "";
    } else if (parts[0] === "shorts") {
      videoId = parts[1] || "";
    } else if (parts[0] === "embed") {
      videoId = parts[1] || "";
    } else if (parts[0] === "live") {
      videoId = parts[1] || "";
    }
  }

  videoId = normalizeVideoId(videoId);
  if (!videoId) return null;

  const type = detectYoutubeTypeFromUrl(url);

  return {
    videoId,
    type,
    url: normalizeYoutubeItemUrl(videoId, type)
  };
}

function detectYoutubeTypeFromUrl(url) {
  const parts = url.pathname.split("/").filter(Boolean);
  return parts[0] === "shorts" ? "short" : "video";
}

function normalizeYoutubeItemUrl(videoId, type) {
  const normalizedVideoId = normalizeVideoId(videoId);
  if (!normalizedVideoId) return "";
  return type === "short"
    ? `https://www.youtube.com/shorts/${normalizedVideoId}`
    : `https://www.youtube.com/watch?v=${normalizedVideoId}`;
}

function normalizeItemType(item) {
  if (item?.type === "short") return "short";
  if (item?.type === "video") return "video";
  if (typeof item?.url === "string" && item.url.includes("/shorts/")) return "short";
  return "video";
}

function hydrateMissingTitles() {
  hydrateMissingMetadata();
}

async function hydrateMissingMetadata(options = {}) {
  if (metadataHydrationBusy) {
    if (options.forceVisibleToast) showToast("이미 유튜버명을 가져오는 중이에요.");
    return { changedCount: 0, targetCount: 0 };
  }

  const onlyIds = Array.isArray(options.onlyIds) ? new Set(options.onlyIds) : null;
  const limit = options.limit || METADATA_AUTO_LIMIT;
  const targets = state.items
    .filter((item) => onlyIds ? onlyIds.has(item.id) : true)
    .filter((item) => shouldHydrateMetadata(item, { force: options.force }))
    .slice(0, limit);

  if (!targets.length) {
    if (options.forceVisibleToast) showToast("보강할 유튜버명이 없거나 최근에 이미 확인했어요.");
    return { changedCount: 0, targetCount: 0 };
  }

  metadataHydrationBusy = true;
  updateHydrateMetadataButton(true);
  if (options.forceVisibleToast) showToast("유튜버명을 가져오는 중이에요.");

  let changedCount = 0;
  let stateChanged = false;

  try {
    for (const item of targets) {
      const metadata = await fetchYoutubeMetadata(item);
      const now = new Date().toISOString();

      if (!metadata) {
        item.metadataFetchFailedAt = now;
        stateChanged = true;
        continue;
      }

      const changed = applyMetadataToItem(item, metadata);
      item.metadataFetchedAt = now;
      delete item.metadataFetchFailedAt;
      stateChanged = true;

      if (changed) {
        item.updatedAt = now;
        changedCount += 1;
      }
    }

    if (stateChanged) persistAndRender(false);

    if (options.forceVisibleToast) {
      showToast(changedCount > 0
        ? `${changedCount}개 항목의 유튜버명을 보강했어요.`
        : "보강할 유튜버명이 없거나 가져오지 못했어요.");
    }

    return { changedCount, targetCount: targets.length };
  } finally {
    metadataHydrationBusy = false;
    updateHydrateMetadataButton(false);
  }
}

function shouldHydrateMetadata(item, options = {}) {
  if (!item || !item.videoId || !item.url) return false;
  const needsTitle = !item.title || isGeneratedFallbackTitle(item.title, item.videoId);
  const needsAuthor = !cleanMetadataText(item.author, 80) && !item.authorEdited;
  if (!needsTitle && !needsAuthor) return false;
  if (options.force) return true;

  const lastAttempt = Math.max(
    Date.parse(item.metadataFetchedAt || "") || 0,
    Date.parse(item.metadataFetchFailedAt || "") || 0
  );
  return !lastAttempt || Date.now() - lastAttempt > METADATA_RETRY_MS;
}

async function fetchYoutubeMetadata(itemOrUrl) {
  const parsed = typeof itemOrUrl === "string" ? parseYoutubeUrl(itemOrUrl) : null;
  const videoId = parsed?.videoId || normalizeVideoId(itemOrUrl?.videoId);
  const type = parsed?.type || normalizeItemType(itemOrUrl);
  const url = normalizeYoutubeItemUrl(videoId, type);
  if (!url) return null;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), METADATA_TIMEOUT_MS);

  try {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const response = await fetch(endpoint, { signal: controller.signal });
    if (!response.ok) return null;

    const data = await response.json();
    return {
      title: cleanMetadataText(data.title, 200),
      author: cleanMetadataText(data.author_name, 80),
      authorUrl: cleanMetadataText(data.author_url, 300),
      thumbnailUrl: cleanMetadataText(data.thumbnail_url, 500)
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

function applyMetadataToItem(item, metadata) {
  let changed = false;

  if ((!item.title || isGeneratedFallbackTitle(item.title, item.videoId)) && metadata.title) {
    item.title = metadata.title;
    changed = true;
  }

  if (!item.authorEdited && !cleanMetadataText(item.author, 80) && metadata.author) {
    item.author = metadata.author;
    changed = true;
  }

  if (metadata.authorUrl && !item.authorUrl) {
    item.authorUrl = metadata.authorUrl;
    changed = true;
  }

  if (metadata.thumbnailUrl && !item.thumbnailUrl) {
    item.thumbnailUrl = metadata.thumbnailUrl;
    changed = true;
  }

  return changed;
}

function updateHydrateMetadataButton(isBusy) {
  if (!els.hydrateMetadataButton) return;
  els.hydrateMetadataButton.disabled = isBusy;
  els.hydrateMetadataButton.textContent = isBusy ? "가져오는 중..." : "유튜버명 보강";
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
    closeDialog(els.themeDialog);
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
  openDialog(els.themeDialog);
}

function closeThemeDialog(saveChanges = false) {
  themeDialogSaved = saveChanges;
  if (!saveChanges) {
    draftTheme = { ...currentTheme };
    applyTheme(currentTheme);
    fillThemeInputs(currentTheme);
  }
  closeDialog(els.themeDialog);
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
    script.src = SUPABASE_CLIENT_SCRIPT;
    script.async = true;
    script.defer = true;
    script.dataset.tubeVaultSupabase = "true";
    script.dataset.supabaseVersion = SUPABASE_CLIENT_VERSION;
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
  const cloudItemCount = getStateItemCount(syncState.cloudRow?.data);
  const localItemCount = state.items.length;
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
    badge = "클라우드 동기화됨";
    detail = `클라우드 연결됨 / 마지막 동기화: ${formatSyncTime(lastSyncedAt)}`;
  } else if (syncState.configured && syncState.status === "unavailable") {
    detail = "Supabase 클라이언트를 불러오지 못했습니다. 로컬 저장은 계속 사용할 수 있습니다.";
  } else if (syncState.configured) {
    detail = "Supabase 설정이 감지되었습니다. 로그인하면 이 계정의 데이터만 동기화됩니다.";
  }

  if (signedIn && !syncState.needsCloudChoice) {
    detail = `${detail} 여러 기기에서 자동으로 같은 목록을 보려면 로그인 동기화를 사용하세요. 단, 처음 로그인할 때는 목록이 있는 기기에서 먼저 현재 기기 데이터 업로드를 해야 합니다.`;
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
  els.cloudChoiceText.textContent = getCloudChoiceText(localItemCount, cloudItemCount);
  els.cloudPullButton.disabled = !syncState.cloudRow
    || (localItemCount > 0 && cloudItemCount === 0)
    || syncState.busy
    || !syncState.online;
  els.cloudMergeButton.disabled = !syncState.cloudRow || syncState.busy || !syncState.online;
  els.cloudPushButton.disabled = syncState.busy || !syncState.online || localItemCount === 0;
}

function getCloudChoiceText(localItemCount, cloudItemCount) {
  if (!syncState.cloudRow) {
    return "이 계정에는 아직 클라우드 데이터가 없습니다. 목록이 보이는 기기에서 현재 기기 데이터 업로드를 누르세요.";
  }

  if (localItemCount > 0 && cloudItemCount === 0) {
    return "클라우드 데이터가 비어 있습니다. 현재 로컬 목록을 비우지 않도록 클라우드 불러오기는 막아두었습니다. 목록이 보이는 기기에서 현재 기기 데이터 업로드를 누르세요.";
  }

  return "이 계정에 클라우드 데이터가 있습니다. 로컬 데이터를 덮어쓰기 전 자동 백업을 만듭니다.";
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
    const saved = await upsertCloudState();
    if (saved) showToast("지금 동기화했어요.");
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
    const row = await fetchCloudState();
    if (!row) {
      showToast("불러올 클라우드 데이터가 없어요.");
      return;
    }

    if (state.items.length > 0 && getStateItemCount(row.data) === 0) {
      showToast("클라우드가 비어 있어 현재 목록을 자동으로 비우지 않았어요. 목록이 있는 기기에서 업로드하세요.");
      return;
    }

    backupLocalState("cloud-pull");
    applyStateObject(row.data);
    resetToFirstPage();
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

  if (state.items.length === 0) {
    showToast("현재 목록이 비어 있어 클라우드에 업로드하지 않았어요. 목록이 있는 기기에서 먼저 업로드하세요.");
    return;
  }

  setSyncBusy(true);
  try {
    const row = await fetchCloudState();
    if (row && getStateItemCount(row.data) > 0 && !areLibraryStatesEqual(row.data, serializeStateForCloud())) {
      const confirmed = window.confirm("클라우드에 다른 기기에서 저장한 변경사항이 있습니다. 현재 기기 목록으로 덮어쓸까요? 취소하면 병합이나 클라우드 불러오기를 선택할 수 있습니다.");
      if (!confirmed) return;
      backupStateObject(row.data, "before-cloud-overwrite");
    }

    syncState.needsCloudChoice = false;
    const saved = await upsertCloudState({ force: true });
    if (saved) showToast("현재 기기 데이터를 업로드했어요.");
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
    const row = await fetchCloudState();
    if (!row) {
      syncState.needsCloudChoice = false;
      const saved = await upsertCloudState({ force: true });
      if (saved) showToast("업로드할 클라우드 데이터를 만들었어요.");
      return;
    }

    backupLocalState("cloud-merge");
    mergeStateObject(row.data);
    resetToFirstPage();
    syncState.needsCloudChoice = false;
    persistAndRender(false);
    await upsertCloudState({ force: true });
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

async function upsertCloudState(options = {}) {
  const previousWrite = syncState.writeQueue;
  let releaseWrite;
  syncState.writeQueue = new Promise((resolve) => {
    releaseWrite = resolve;
  });

  await previousWrite;
  try {
    return await performCloudUpsert(options);
  } finally {
    releaseWrite();
  }
}

async function performCloudUpsert({ silent = false, force = false } = {}) {
  if (!canSync() || syncState.needsCloudChoice) return false;
  if (state.items.length === 0) {
    if (!silent) {
      showToast("현재 목록이 비어 있어 클라우드에 업로드하지 않았어요. 목록이 있는 기기에서 먼저 업로드하세요.");
    }
    return false;
  }

  const userId = syncState.session.user.id;
  const localData = serializeStateForCloud();
  let latestRow = null;

  if (!force) {
    latestRow = await fetchCloudState();
    if (latestRow && areLibraryStatesEqual(latestRow.data, localData)) {
      finishCloudSave(latestRow);
      return true;
    }

    if (latestRow && shouldPromptForCloud(latestRow)) {
      requireCloudChoice(latestRow);
      return false;
    }
  }

  const updatedAt = new Date().toISOString();
  const payload = {
    user_id: userId,
    data: localData,
    updated_at: updatedAt
  };
  syncState.status = "syncing";
  if (!silent) renderSyncPanel();

  let result;
  if (force) {
    result = await syncState.client
      .from(SUPABASE_TABLE)
      .upsert(payload, { onConflict: "user_id" })
      .select("data, updated_at")
      .maybeSingle();
  } else if (latestRow) {
    result = await syncState.client
      .from(SUPABASE_TABLE)
      .update(payload)
      .eq("user_id", userId)
      .eq("updated_at", latestRow.updated_at)
      .select("data, updated_at")
      .maybeSingle();
  } else {
    result = await syncState.client
      .from(SUPABASE_TABLE)
      .insert(payload)
      .select("data, updated_at")
      .maybeSingle();
  }

  if (result.error) {
    if (!force && result.error.code === "23505") {
      requireCloudChoice(await fetchCloudState());
      return false;
    }
    throw result.error;
  }

  if (!result.data) {
    requireCloudChoice(await fetchCloudState());
    return false;
  }

  finishCloudSave(result.data);
  return true;
}

function finishCloudSave(row) {
  syncState.status = "synced";
  syncState.errorMessage = "";
  syncState.cloudRow = {
    data: row.data,
    updated_at: row.updated_at
  };
  syncState.needsCloudChoice = false;
  markCloudSynced(row.updated_at);
  renderSyncPanel();
}

function requireCloudChoice(row) {
  syncState.cloudRow = row || null;
  syncState.needsCloudChoice = true;
  syncState.status = "needs-choice";
  syncState.errorMessage = "";
  renderSyncPanel();
  showToast("다른 기기에서 저장한 변경사항을 발견했어요. 불러오기, 업로드 또는 병합을 선택하세요.");
}

function shouldPromptForCloud(row) {
  if (!row) return false;
  if (state.items.length > 0 && getStateItemCount(row.data) === 0) return true;
  if (syncMeta.userId !== syncState.session?.user?.id || !syncMeta.lastSyncedAt) return true;
  const remoteFingerprint = fingerprintLibraryState(row.data);
  if (syncMeta.lastSyncedFingerprint) {
    return remoteFingerprint !== syncMeta.lastSyncedFingerprint;
  }

  return !areLibraryStatesEqual(row.data, serializeStateForCloud());
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

function getStateItemCount(value) {
  return Array.isArray(value?.items) ? value.items.length : 0;
}

function serializeStateForCloud() {
  ensureLibraryShape();
  return JSON.parse(JSON.stringify({
    version: IMPORT_VERSION,
    profiles: state.profiles,
    categories: state.categories,
    items: state.items
  }));
}

function applyStateObject(raw) {
  const incoming = raw && typeof raw === "object" ? raw : {};
  const localViewState = {
    view: state.view,
    typeFilter: state.typeFilter,
    categoryFilter: state.categoryFilter,
    slotFilter: state.slotFilter,
    query: state.query,
    sort: state.sort,
    selectedId: null
  };
  state = {
    ...structuredClone(initialState),
    ...incoming,
    ...localViewState,
    profiles: Array.isArray(incoming.profiles) ? incoming.profiles : ["나"],
    categories: Array.isArray(incoming.categories) ? incoming.categories : structuredClone(initialState.categories),
    items: Array.isArray(incoming.items) ? incoming.items : []
  };
  ensureLibraryShape();
}

function mergeStateObject(raw) {
  const incoming = normalizeExternalState(raw);
  incoming.profiles.forEach((profile) => ensureProfile(String(profile)));
  const categoryIdMap = new Map();
  incoming.categories.forEach((category) => {
    const merged = mergeImportedCategory(category);
    if (merged && category.id) categoryIdMap.set(category.id, merged.id);
  });

  const indexByVideo = new Map(state.items.map((item, index) => [`${item.type}:${item.videoId}`, index]));
  incoming.items.map((item) => cleanImportedItem(item, categoryIdMap)).filter(Boolean).forEach((item) => {
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

function areLibraryStatesEqual(left, right) {
  return canonicalLibraryJson(left) === canonicalLibraryJson(right);
}

function fingerprintLibraryState(value) {
  const json = canonicalLibraryJson(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= BigInt(json.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return `${json.length}:${hash.toString(16).padStart(16, "0")}`;
}

function canonicalLibraryJson(value) {
  return JSON.stringify(sortJsonValue(normalizeExternalState(value)));
}

function sortJsonValue(value) {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      result[key] = sortJsonValue(value[key]);
      return result;
    }, {});
}

function backupLocalState(reason) {
  backupStateObject(serializeStateForCloud(), reason);
}

function backupStateObject(snapshot, reason) {
  const backedUpAt = new Date().toISOString();
  localStorage.setItem(`${CLOUD_BACKUP_PREFIX}${backedUpAt}`, JSON.stringify({
    reason,
    backedUpAt,
    state: normalizeExternalState(snapshot)
  }));
}

function loadSyncMeta() {
  try {
    const meta = JSON.parse(localStorage.getItem(SYNC_META_KEY));
    if (!meta || typeof meta !== "object") return {};
    return {
      userId: String(meta.userId || ""),
      lastSyncedAt: String(meta.lastSyncedAt || ""),
      lastSyncedFingerprint: String(meta.lastSyncedFingerprint || "")
    };
  } catch {
    return {};
  }
}

function saveSyncMeta() {
  localStorage.setItem(SYNC_META_KEY, JSON.stringify(syncMeta));
}

function markCloudSynced(lastSyncedAt, cloudData = syncState.cloudRow?.data) {
  if (!syncState.session?.user?.id || !lastSyncedAt) return;
  syncMeta = {
    userId: syncState.session.user.id,
    lastSyncedAt,
    lastSyncedFingerprint: fingerprintLibraryState(cloudData || serializeStateForCloud())
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
  const payload = buildFullExportPayload();
  const date = new Date().toISOString().slice(0, 10);
  downloadJsonFile(payload, `gaegol-tube-${date}.json`);
  showToast("내보내기 파일을 만들었어요.");
}

function buildFullExportPayload() {
  ensureLibraryShape();
  return {
    version: IMPORT_VERSION,
    exportedAt: new Date().toISOString(),
    app: APP_NAME,
    profiles: state.profiles,
    categories: state.categories,
    items: state.items
  };
}

function downloadJsonFile(payload, fileName) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function openCategoryManageDialog() {
  ensureLibraryShape();
  updateCategorySortUI();
  renderCategoryManageList();
  openDialog(els.categoryManageDialog);
}

function handleCategoryManageSubmit(event) {
  event.preventDefault();
  closeDialog(els.categoryManageDialog);
}

function handleCategorySortModeChange() {
  setCategorySortMode(els.categorySortMode.value);
  render();
  renderCategoryManageList();
}

function updateCategorySortUI() {
  if (!els.categorySortMode) return;
  els.categorySortMode.value = categorySortMode;
  if (!els.categorySortHelp) return;
  const messages = {
    custom: "직접정렬에서는 위/아래 버튼으로 원하는 순서를 만들 수 있습니다.",
    name: "카테고리명이 가나다/알파벳 순서로 표시됩니다.",
    created: "카테고리를 추가한 순서대로 표시됩니다."
  };
  els.categorySortHelp.textContent = messages[categorySortMode] || messages.custom;
}

function renderCategoryManageList() {
  els.categoryManageList.innerHTML = "";
  const orderedCategories = getOrderedCategories();
  const canManuallySort = categorySortMode === "custom";

  orderedCategories.forEach((category, index) => {
    const itemCount = getItemsByCategoryId(category.id).length;
    const deleteState = canDeleteCategory(category.id);
    const row = document.createElement("div");
    row.className = "category-manage-row";
    row.dataset.categoryId = category.id;
    row.draggable = canManuallySort;

    const dragHandle = document.createElement("div");
    dragHandle.className = "category-drag-handle";
    dragHandle.textContent = "☰";
    dragHandle.title = canManuallySort ? "직접정렬용 이동 손잡이" : "직접정렬 모드에서 사용할 수 있습니다.";
    dragHandle.setAttribute("aria-hidden", "true");

    const label = document.createElement("label");
    label.className = "category-name-field";
    const labelText = document.createElement("span");
    labelText.textContent = "카테고리 이름";
    const input = document.createElement("input");
    input.type = "text";
    input.value = category.name;
    input.maxLength = 30;
    input.autocomplete = "off";
    label.append(labelText, input);

    const count = document.createElement("span");
    count.className = "category-count";
    count.textContent = `${itemCount}개`;

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "secondary-button";
    saveButton.dataset.action = "rename-category";
    saveButton.textContent = "이름 저장";

    const actions = document.createElement("div");
    actions.className = "category-row-actions";

    const moveUpButton = document.createElement("button");
    moveUpButton.type = "button";
    moveUpButton.className = "secondary-button";
    moveUpButton.dataset.action = "move-category-up";
    moveUpButton.textContent = "위";
    moveUpButton.setAttribute("aria-label", `${category.name} 카테고리 위로 이동`);
    moveUpButton.disabled = !canManuallySort || index === 0;
    if (!canManuallySort) moveUpButton.title = "직접정렬 모드에서 사용할 수 있습니다.";

    const moveDownButton = document.createElement("button");
    moveDownButton.type = "button";
    moveDownButton.className = "secondary-button";
    moveDownButton.dataset.action = "move-category-down";
    moveDownButton.textContent = "아래";
    moveDownButton.setAttribute("aria-label", `${category.name} 카테고리 아래로 이동`);
    moveDownButton.disabled = !canManuallySort || index === orderedCategories.length - 1;
    if (!canManuallySort) moveDownButton.title = "직접정렬 모드에서 사용할 수 있습니다.";

    actions.append(moveUpButton, moveDownButton);
    actions.append(saveButton);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger-button";
    deleteButton.dataset.action = "delete-category";
    deleteButton.textContent = "삭제";
    deleteButton.setAttribute("aria-label", `${category.name} 카테고리 삭제`);
    if (!deleteState.ok) {
      deleteButton.disabled = true;
      deleteButton.title = deleteState.reason === "default-category"
        ? "기본 카테고리는 삭제할 수 없습니다."
        : "마지막 카테고리는 삭제할 수 없습니다.";
    }
    actions.append(deleteButton);

    row.append(dragHandle, label, count, actions);
    els.categoryManageList.append(row);
  });
}

function moveCategory(categoryId, direction) {
  if (categorySortMode !== "custom") {
    showToast("직접정렬 모드에서 순서를 바꿀 수 있어요.");
    return;
  }

  const ordered = getOrderedCategories({ mode: "custom" });
  const index = ordered.findIndex((category) => category.id === categoryId);
  if (index < 0) return;

  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= ordered.length) return;

  const nextOrdered = [...ordered];
  const [moved] = nextOrdered.splice(index, 1);
  nextOrdered.splice(nextIndex, 0, moved);
  reorderCategoryByIds(nextOrdered.map((category) => category.id));
}

function reorderCategoryByIds(orderedIds) {
  const orderMap = new Map(orderedIds.map((id, index) => [id, index]));

  state.categories.forEach((category) => {
    if (orderMap.has(category.id)) category.order = orderMap.get(category.id);
  });

  normalizeCategoryOrder();
  persistAndRender(false);
  renderCategoryManageList();
  showToast("카테고리 순서를 변경했어요.");
}

function handleCategoryDragStart(event) {
  if (categorySortMode !== "custom") {
    event.preventDefault();
    return;
  }
  const row = event.target.closest(".category-manage-row");
  if (!row) return;
  row.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", row.dataset.categoryId);
}

function handleCategoryDragOver(event) {
  if (categorySortMode !== "custom") return;
  const row = event.target.closest(".category-manage-row");
  if (!row) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

function handleCategoryDrop(event) {
  if (categorySortMode !== "custom") return;
  const targetRow = event.target.closest(".category-manage-row");
  if (!targetRow) return;
  event.preventDefault();

  const draggedId = event.dataTransfer.getData("text/plain");
  const targetId = targetRow.dataset.categoryId;
  if (!draggedId || !targetId || draggedId === targetId) return;

  const orderedIds = getOrderedCategories({ mode: "custom" }).map((category) => category.id);
  const fromIndex = orderedIds.indexOf(draggedId);
  const toIndex = orderedIds.indexOf(targetId);
  if (fromIndex < 0 || toIndex < 0) return;

  orderedIds.splice(fromIndex, 1);
  orderedIds.splice(toIndex, 0, draggedId);
  reorderCategoryByIds(orderedIds);
}

function handleCategoryDragEnd() {
  $$(".category-manage-row.is-dragging", els.categoryManageList).forEach((row) => {
    row.classList.remove("is-dragging");
  });
}

function handleCategoryManageAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const row = button.closest(".category-manage-row");
  if (!row) return;

  if (button.dataset.action === "rename-category") {
    renameCategoryFromRow(row);
    return;
  }

  if (button.dataset.action === "move-category-up") {
    moveCategory(row.dataset.categoryId, "up");
    return;
  }

  if (button.dataset.action === "move-category-down") {
    moveCategory(row.dataset.categoryId, "down");
    return;
  }

  if (button.dataset.action === "delete-category") {
    openDeleteCategoryDialog(row.dataset.categoryId);
  }
}

function renameCategoryFromRow(row) {
  const category = getCategory(row.dataset.categoryId);
  if (!category) return;
  const input = $("input", row);
  const nextName = cleanLabel(input.value, "");

  if (!nextName) {
    showToast("카테고리 이름을 입력하세요.");
    input.focus();
    return;
  }

  const duplicate = state.categories.some((entry) => entry.id !== category.id && entry.name === nextName);
  if (duplicate) {
    showToast("이미 있는 카테고리 이름입니다.");
    input.value = category.name;
    input.focus();
    return;
  }

  if (category.name === nextName) {
    showToast("변경된 이름이 없습니다.");
    return;
  }

  category.name = nextName;
  persistAndRender();
  renderCategoryManageList();
  showToast("카테고리 이름을 수정했어요.");
}

function getItemsByCategoryId(categoryId) {
  return state.items.filter((item) => item.categoryId === categoryId);
}

function canDeleteCategory(categoryId) {
  const category = getCategory(categoryId);
  if (!category) return { ok: false, reason: "missing-category" };
  if (category.id === DEFAULT_CATEGORY_ID) return { ok: false, reason: "default-category" };
  if (state.categories.length <= 1) return { ok: false, reason: "last-category" };
  return { ok: true };
}

function cloneStateForBackup() {
  if (typeof structuredClone === "function") return structuredClone(state);
  return JSON.parse(JSON.stringify(state));
}

function createLocalBackupBeforeCategoryDelete(categoryId) {
  const category = getCategory(categoryId);
  const createdAt = new Date().toISOString();
  localStorage.setItem(`${CATEGORY_DELETE_BACKUP_PREFIX}${createdAt}`, JSON.stringify({
    reason: "category-delete",
    categoryId,
    categoryName: category?.name || "",
    createdAt,
    state: cloneStateForBackup()
  }));
}

function openDeleteCategoryDialog(categoryId) {
  const category = getCategory(categoryId);
  if (!category) {
    showToast("카테고리를 찾지 못했어요.");
    return;
  }

  const deleteState = canDeleteCategory(categoryId);
  if (!deleteState.ok) {
    showToast(deleteState.reason === "default-category"
      ? "기본 카테고리는 삭제할 수 없어요."
      : "마지막 카테고리는 삭제할 수 없어요.");
    return;
  }

  pendingDeleteCategoryId = categoryId;
  const itemCount = getItemsByCategoryId(categoryId).length;
  els.deleteCategoryName.textContent = category.name;
  els.deleteCategoryItemCount.textContent = `${itemCount}개 항목`;
  els.categoryDeleteDescription.textContent = itemCount === 0
    ? "이 카테고리에는 항목이 없습니다. 삭제해도 영상 목록은 영향을 받지 않습니다."
    : `이 카테고리에는 ${itemCount}개 항목이 있습니다. 항목을 다른 카테고리로 이동하거나 항목까지 함께 삭제할 수 있습니다.`;
  els.deleteModeMove.checked = true;
  els.deleteModeDeleteItems.checked = false;
  els.deleteConfirmTextInput.value = "";
  renderDeleteMoveTargets(categoryId);
  updateDeleteCategoryModeUI();
  openDialog(els.categoryDeleteDialog);
}

function closeDeleteCategoryDialog() {
  pendingDeleteCategoryId = null;
  closeDialog(els.categoryDeleteDialog);
}

function renderDeleteMoveTargets(categoryId) {
  els.deleteMoveTargetSelect.innerHTML = "";
  getOrderedCategories()
    .filter((category) => category.id !== categoryId)
    .forEach((category) => {
      const count = getItemsByCategoryId(category.id).length;
      els.deleteMoveTargetSelect.add(new Option(`${category.name} (${count}개)`, category.id));
    });
}

function updateDeleteCategoryModeUI() {
  const categoryId = pendingDeleteCategoryId;
  const itemCount = categoryId ? getItemsByCategoryId(categoryId).length : 0;
  const hasItems = itemCount > 0;
  const mode = els.deleteModeDeleteItems.checked ? "delete-items" : "move";
  const hasMoveTarget = els.deleteMoveTargetSelect.options.length > 0;

  els.deleteCategoryOptions.hidden = !hasItems;
  els.moveTargetField.hidden = !hasItems || mode !== "move";
  els.deleteConfirmTextField.hidden = !hasItems || mode !== "delete-items";

  if (!hasItems) {
    els.deleteCategoryDangerNote.textContent = "삭제 전에 자동 백업이 이 기기의 localStorage에 저장됩니다. 키는 gaegolTubeBeforeCategoryDelete:로 시작합니다.";
    els.confirmDeleteCategoryButton.textContent = "카테고리 삭제";
    els.confirmDeleteCategoryButton.disabled = false;
    return;
  }

  if (mode === "move") {
    els.deleteCategoryDangerNote.textContent = "삭제 전에 자동 백업이 이 기기의 localStorage에 저장됩니다. 키는 gaegolTubeBeforeCategoryDelete:로 시작합니다. 그래도 중요한 목록은 먼저 내보내기하는 것을 권장합니다.";
    els.confirmDeleteCategoryButton.textContent = "카테고리 삭제 및 항목 이동";
    els.confirmDeleteCategoryButton.disabled = !hasMoveTarget;
    return;
  }

  els.deleteCategoryDangerNote.textContent = "항목까지 삭제하면 목록에서 영상이 제거됩니다. 삭제 전 자동 백업은 만들지만, 신중하게 선택하세요.";
  els.confirmDeleteCategoryButton.textContent = "카테고리와 항목 삭제";
  els.confirmDeleteCategoryButton.disabled = els.deleteConfirmTextInput.value.trim() !== "삭제";
}

function handleCategoryDeleteSubmit(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    closeDeleteCategoryDialog();
    return;
  }

  if (event.submitter?.value === "delete") {
    confirmDeleteCategory();
  }
}

function confirmDeleteCategory() {
  const categoryId = pendingDeleteCategoryId;
  const category = getCategory(categoryId);
  if (!category) {
    closeDeleteCategoryDialog();
    showToast("카테고리를 찾지 못했어요.");
    return;
  }

  const deleteState = canDeleteCategory(categoryId);
  if (!deleteState.ok) {
    showToast(deleteState.reason === "default-category"
      ? "기본 카테고리는 삭제할 수 없어요."
      : "마지막 카테고리는 삭제할 수 없어요.");
    return;
  }

  const items = getItemsByCategoryId(categoryId);
  const itemCount = items.length;
  const mode = els.deleteModeDeleteItems.checked ? "delete-items" : "move";

  if (itemCount === 0) {
    createLocalBackupBeforeCategoryDelete(categoryId);
    removeCategoryById(categoryId);
    repairCategoryReferencesAfterDelete(categoryId);
    closeDeleteCategoryDialog();
    persistAndRender();
    renderCategoryManageList();
    showToast("카테고리를 삭제했어요.");
    return;
  }

  if (mode === "move") {
    const targetCategoryId = els.deleteMoveTargetSelect.value;
    const targetCategory = getCategory(targetCategoryId);
    if (!targetCategory || targetCategoryId === categoryId) {
      showToast("이동할 카테고리를 선택하세요.");
      return;
    }

    createLocalBackupBeforeCategoryDelete(categoryId);
    items.forEach((item) => {
      const slot = item.slot || DEFAULT_SLOT;
      ensureCategorySlot(targetCategoryId, slot);
      item.categoryId = targetCategoryId;
      item.slot = slot;
      item.updatedAt = new Date().toISOString();
    });
    removeCategoryById(categoryId);
    repairCategoryReferencesAfterDelete(categoryId, targetCategoryId);
    closeDeleteCategoryDialog();
    persistAndRender();
    renderCategoryManageList();
    showToast(`카테고리를 삭제하고 ${itemCount}개 항목을 이동했어요.`);
    return;
  }

  if (els.deleteConfirmTextInput.value.trim() !== "삭제") {
    updateDeleteCategoryModeUI();
    return;
  }

  const ok = window.confirm(`정말 ${category.name} 카테고리와 ${itemCount}개 항목을 모두 삭제할까요? 삭제 전 백업은 만들었지만 화면에서는 제거됩니다.`);
  if (!ok) return;

  createLocalBackupBeforeCategoryDelete(categoryId);
  state.items = state.items.filter((item) => item.categoryId !== categoryId);
  removeCategoryById(categoryId);
  repairCategoryReferencesAfterDelete(categoryId);
  closeDeleteCategoryDialog();
  persistAndRender(true, { allowEmptyOverwrite: true });
  renderCategoryManageList();
  showToast(`카테고리와 ${itemCount}개 항목을 삭제했어요.`);
}

function removeCategoryById(categoryId) {
  state.categories = state.categories.filter((category) => category.id !== categoryId);
  if (!state.categories.length) state.categories.push(createDefaultCategory());
  normalizeCategoryOrder();
}

function repairCategoryReferencesAfterDelete(deletedCategoryId, preferredCategoryId = "") {
  const fallbackCategory = getCategory(preferredCategoryId) || getDefaultCategory();
  if (state.categoryFilter === deletedCategoryId) state.categoryFilter = "all";
  if (els.categoryInput.value === deletedCategoryId) els.categoryInput.value = fallbackCategory.id;
  if (els.editCategory.value === deletedCategoryId) els.editCategory.value = fallbackCategory.id;
  if (els.shareCategorySelect.value === deletedCategoryId) renderCategoryShareOptions();
  renderSaveCategoryOptions();
  renderEditCategoryOptions();
  renderSlotOptions(els.categoryInput, els.slotInput);
  renderSlotOptions(els.editCategory, els.editSlot);
  renderCategoryShareOptions();
  updateCategoryShareCount();
  currentPage = clampPage(currentPage, getTotalPages(getFilteredItems().length));
}

function openMigrationDialog() {
  renderMigrationDialog();
  openDialog(els.migrationDialog);
}

function renderMigrationDialog() {
  if (state.items.length === 0 && getStoredItemCount() > 0) {
    state = loadState();
    ensureLibraryShape();
    render();
  }

  const count = state.items.length;
  els.migrationMode.textContent = isStandaloneMode() ? "홈 화면 앱 모드" : "브라우저 탭 모드";
  els.migrationOrigin.textContent = window.location.origin;
  els.migrationStorageKey.textContent = STORAGE_KEY;
  els.migrationItemCount.textContent = `${count}개`;
  els.migrationAppVersion.textContent = APP_VERSION;
  els.migrationBackupButton.disabled = count === 0;
  els.migrationWarning.textContent = count === 0
    ? "현재 실행공간에는 백업할 목록이 없습니다."
    : "목록이 보이는 실행공간에서 백업 파일을 만든 뒤, 목록이 없는 쪽에서 가져오기를 하세요.";
}

function handleMigrationSubmit(event) {
  event.preventDefault();
  closeDialog(els.migrationDialog);
}

function exportMigrationBackup() {
  if (!state.items.length) {
    showToast("현재 실행공간에는 백업할 목록이 없습니다.");
    renderMigrationDialog();
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  downloadJsonFile(buildFullExportPayload(), `gaegol-tube-migration-${date}.json`);
  showToast("데이터 이전용 백업 파일을 만들었어요.");
}

function openImportFromMigration() {
  closeDialog(els.migrationDialog);
  els.importInput.click();
}

async function reloadForFreshVersion() {
  els.migrationReloadButton.disabled = true;
  try {
    const registration = await navigator.serviceWorker?.getRegistration?.();
    if (registration) {
      await registration.update();
      if (registration.waiting) {
        promptForServiceWorkerUpdate(registration);
        applyWaitingServiceWorker();
        return;
      }
    }
  } catch {
    // Reload still helps when the browser cannot complete an update check.
  } finally {
    els.migrationReloadButton.disabled = false;
  }
  window.location.reload();
}

function openCategoryShareDialog() {
  ensureLibraryShape();
  renderCategoryShareOptions();
  resetCategoryShareDefaults();

  const preferred = state.categoryFilter !== "all" && getCategory(state.categoryFilter)
    ? state.categoryFilter
    : state.categories[0]?.id;

  if (preferred) els.shareCategorySelect.value = preferred;
  updateCategoryShareCount();
  configureNativeShareButton();
  openDialog(els.categoryShareDialog);
}

function renderCategoryShareOptions() {
  els.shareCategorySelect.innerHTML = "";
  getOrderedCategories().forEach((category) => {
    const count = getItemsByCategory(category.id).length;
    els.shareCategorySelect.add(new Option(`${category.name} (${count}개)`, category.id));
  });
}

function getItemsByCategory(categoryId) {
  return getItemsByCategoryId(categoryId);
}

function resetCategoryShareDefaults() {
  els.shareIncludeNotes.checked = false;
  els.shareIncludeStatus.checked = false;
  els.shareIncludeFavorite.checked = false;
  els.shareIncludeSlot.checked = true;
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
  updateCategoryShareSummary();
}

function updateCategoryShareSummary() {
  const categoryId = els.shareCategorySelect.value;
  const count = getItemsByCategory(categoryId).length;
  els.shareSummaryCount.textContent = `${count}개`;
  els.shareSummaryNotes.textContent = els.shareIncludeNotes.checked ? "예" : "아니요";
  els.shareSummaryStatus.textContent = els.shareIncludeStatus.checked ? "예" : "아니요";
  els.shareSummaryFavorite.textContent = els.shareIncludeFavorite.checked ? "예" : "아니요";
  els.shareSummarySlot.textContent = els.shareIncludeSlot.checked ? "예" : "아니요";
}

function handleCategoryShareSubmit(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    closeDialog(els.categoryShareDialog);
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
        slots,
        createdAt: category.createdAt || new Date().toISOString(),
        order: Number.isFinite(Number(category.order)) ? Number(category.order) : 0
      }
    ],
    items
  };
}

function sanitizeSharedItem(item, sharedCategoryId, options) {
  const now = new Date().toISOString();
  const slot = options.includeSlot ? item.slot || DEFAULT_SLOT : DEFAULT_SLOT;
  const type = normalizeItemType(item);

  return {
    id: createId(item.videoId),
    videoId: item.videoId,
    type,
    url: normalizeYoutubeItemUrl(item.videoId, type),
    title: item.title || "",
    author: cleanMetadataText(item.author, 80),
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
    if (file.size > MAX_IMPORT_FILE_BYTES) throw new Error("IMPORT_FILE_TOO_LARGE");
    const text = await file.text();
    const imported = JSON.parse(text);
    const incomingItems = Array.isArray(imported) ? imported : imported.items;
    if (!Array.isArray(incomingItems)) throw new Error("items missing");
    if (incomingItems.length > MAX_IMPORT_ITEMS) throw new Error("IMPORT_TOO_MANY_ITEMS");
    const isCategoryShare = !Array.isArray(imported) && imported?.exportType === "category-share";
    const sharedCategoryName = isCategoryShare ? cleanLabel(imported.source?.categoryName, "") : "";

    ensureLibraryShape();
    const importedProfiles = Array.isArray(imported.profiles) ? imported.profiles : [];
    if (importedProfiles.length > MAX_IMPORT_PROFILES) throw new Error("IMPORT_TOO_MANY_PROFILES");
    importedProfiles.forEach((profile) => ensureProfile(String(profile)));

    const importedCategories = Array.isArray(imported.categories) ? imported.categories : [];
    if (importedCategories.length > MAX_IMPORT_CATEGORIES) throw new Error("IMPORT_TOO_MANY_CATEGORIES");
    const categoryIdMap = new Map();
    importedCategories.forEach((raw) => {
      const incomingId = String(typeof raw === "object" && raw?.id ? raw.id : "").trim();
      const category = mergeImportedCategory(raw);
      if (incomingId && category) categoryIdMap.set(incomingId, category.id);
    });

    const existing = new Set(state.items.map((item) => `${item.type}:${item.videoId}`));
    const existingIds = new Set(state.items.map((item) => String(item.id || "")));
    const cleanedItems = incomingItems.map((item) => cleanImportedItem(item, categoryIdMap)).filter(Boolean);
    let added = 0;

    cleanedItems.forEach((item) => {
      const key = `${item.type}:${item.videoId}`;
      if (existing.has(key)) return;
      while (existingIds.has(item.id)) item.id = createId(item.videoId);
      existing.add(key);
      existingIds.add(item.id);
      state.items.push(item);
      added += 1;
    });

    ensureLibraryShape();
    normalizeCategoryOrder();
    if (added > 0) resetToFirstPage();
    persistAndRender();
    showToast(isCategoryShare && sharedCategoryName
      ? `${sharedCategoryName} 공유 목록에서 ${added}개를 가져왔어요.`
      : `${added}개를 가져왔어요.`);
  } catch (error) {
    const limitError = String(error?.message || "").startsWith("IMPORT_");
    showToast(limitError
      ? "가져오기 파일이 너무 큽니다. 8MB 이하, 항목 10,000개 이하 파일을 사용하세요."
      : "가져오기 파일을 읽지 못했어요.");
  } finally {
    els.importInput.value = "";
  }
}

function cleanImportedItem(raw, categoryIdMap = new Map()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
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
  const type = normalizeItemType({
    type: raw.type,
    url: raw.url || parsed.url
  });

  return {
    id: cleanImportedItemId(raw.id) || createId(parsed.videoId),
    videoId: parsed.videoId,
    type,
    url: normalizeYoutubeItemUrl(parsed.videoId, type),
    title: cleanMetadataText(raw.title, 200),
    author: cleanMetadataText(raw.author, 80),
    authorUrl: cleanMetadataText(raw.authorUrl, 300),
    thumbnailUrl: cleanMetadataText(raw.thumbnailUrl, 500),
    metadataFetchedAt: cleanMetadataText(raw.metadataFetchedAt, 40),
    metadataFetchFailedAt: cleanMetadataText(raw.metadataFetchFailedAt, 40),
    authorEdited: Boolean(raw.authorEdited),
    note: String(raw.note || "").trim(),
    tags: cleanImportedTags(raw.tags),
    profile: cleanLabel(raw.profile, "나"),
    categoryId,
    slot,
    status: raw.status === "done" ? "done" : "queue",
    favorite: Boolean(raw.favorite),
    createdAt: isValidDateString(raw.createdAt) ? raw.createdAt : now,
    updatedAt: isValidDateString(raw.updatedAt) ? raw.updatedAt : now
  };
}

function cleanImportedItemId(value) {
  const id = String(value || "").trim().slice(0, 120);
  return /^[a-zA-Z0-9_-]+$/.test(id) ? id : "";
}

function cleanImportedTags(value) {
  const tags = Array.isArray(value) ? value : parseTags(value || "");
  return [...new Set(tags
    .map(String)
    .map((tag) => tag.trim())
    .filter(Boolean))];
}

function ensureCategoryOptions() {
  ensureLibraryShape();
  renderSaveCategoryOptions();
  renderEditCategoryOptions();
  renderSlotOptions(els.categoryInput, els.slotInput);
  renderSlotOptions(els.editCategory, els.editSlot);
}

function renderSaveCategoryOptions() {
  const current = els.categoryInput.value;
  const orderedCategories = getOrderedCategories();
  els.categoryInput.innerHTML = "";
  orderedCategories.forEach((category) => els.categoryInput.add(new Option(category.name, category.id)));
  els.categoryInput.value = getCategory(current)
    ? current
    : orderedCategories[0].id;
}

function renderEditCategoryOptions() {
  const current = els.editCategory.value;
  const orderedCategories = getOrderedCategories();
  els.editCategory.innerHTML = "";
  orderedCategories.forEach((category) => els.editCategory.add(new Option(category.name, category.id)));
  els.editCategory.value = getCategory(current) ? current : orderedCategories[0].id;
}

function renderSlotOptions(categorySelect, slotSelect, preferredSlot = slotSelect.value) {
  slotSelect.disabled = false;
  const category = getCategory(categorySelect.value) || getDefaultCategory();
  categorySelect.value = category.id;
  const slot = ensureCategorySlot(category.id, preferredSlot || category.slots[0] || DEFAULT_SLOT);

  slotSelect.innerHTML = "";
  category.slots.forEach((value) => slotSelect.add(new Option(value, value)));
  slotSelect.value = slot;
  return slot;
}

function ensureLibraryShape() {
  state.profiles = Array.isArray(state.profiles) ? state.profiles : ["나"];
  state.items = Array.isArray(state.items)
    ? state.items.filter((item) => item && typeof item === "object" && !Array.isArray(item))
    : [];

  const cleanedCategories = [];
  const seenIds = new Set();
  const rawCategories = Array.isArray(state.categories) ? state.categories : [];

  rawCategories.forEach((raw, index) => {
    const category = normalizeCategory(raw, index, seenIds);
    if (category) cleanedCategories.push(category);
  });

  if (!cleanedCategories.some((category) => category.id === DEFAULT_CATEGORY_ID)) {
    cleanedCategories.unshift(createDefaultCategory({
      createdAt: makeLegacyCategoryDate(-1),
      order: -1
    }));
    seenIds.add(DEFAULT_CATEGORY_ID);
  }

  state.categories = cleanedCategories.map((category) => ({
    ...category,
    slots: category.slots.length ? category.slots : [DEFAULT_SLOT]
  }));
  normalizeCategoryOrder();

  state.items.forEach((item) => {
    item.type = normalizeItemType(item);
    item.title = cleanMetadataText(item.title, 200);
    item.author = cleanMetadataText(item.author, 80);
    item.authorUrl = cleanMetadataText(item.authorUrl, 300);
    item.thumbnailUrl = cleanMetadataText(item.thumbnailUrl, 500);
    item.metadataFetchedAt = cleanMetadataText(item.metadataFetchedAt, 40);
    item.metadataFetchFailedAt = cleanMetadataText(item.metadataFetchFailedAt, 40);
    item.authorEdited = Boolean(item.authorEdited);
    const normalizedVideoId = normalizeVideoId(item.videoId);
    if (normalizedVideoId) {
      item.videoId = normalizedVideoId;
      item.url = normalizeYoutubeItemUrl(item.videoId, item.type);
      if (isGeneratedFallbackTitle(item.title, item.videoId)) {
        item.title = fallbackTitle(item);
      }
    } else {
      item.videoId = "";
      item.url = "";
    }
    const existingCategory = getCategory(item.categoryId);
    if (!existingCategory) {
      item.categoryId = DEFAULT_CATEGORY_ID;
    }
    item.slot = ensureCategorySlot(item.categoryId, item.slot || DEFAULT_SLOT);
  });

  if (state.categoryFilter !== "all" && !getCategory(state.categoryFilter)) state.categoryFilter = "all";
  if (!state.slotFilter) state.slotFilter = "all";
  if (!["all", "short", "video"].includes(state.typeFilter)) state.typeFilter = "all";
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
      slots: [],
      createdAt: isValidDateString(raw?.createdAt) ? raw.createdAt : new Date().toISOString(),
      order: getNextCategoryOrder()
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
  const category = {
    id: createCategoryId(),
    name: cleaned,
    slots: [DEFAULT_SLOT],
    createdAt: new Date().toISOString(),
    order: getNextCategoryOrder()
  };
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

function getOrderedCategories(options = {}) {
  const mode = normalizeCategorySortMode(options.mode || categorySortMode);
  const categories = [...state.categories];

  if (mode === "name") return categories.sort(compareCategoriesByName);
  if (mode === "created") return categories.sort(compareCategoriesByCreatedAt);
  return categories.sort(compareCategoriesByOrder);
}

function compareCategoriesByName(a, b) {
  const primary = String(a.name || "").localeCompare(String(b.name || ""), "ko-KR", {
    numeric: true,
    sensitivity: "base"
  });
  if (primary !== 0) return primary;
  return compareCategoriesByOrder(a, b);
}

function compareCategoriesByCreatedAt(a, b) {
  const timeA = Date.parse(a.createdAt || "") || 0;
  const timeB = Date.parse(b.createdAt || "") || 0;
  if (timeA !== timeB) return timeA - timeB;
  return compareCategoriesByOrder(a, b);
}

function compareCategoriesByOrder(a, b) {
  const orderA = Number.isFinite(Number(a.order)) ? Number(a.order) : 0;
  const orderB = Number.isFinite(Number(b.order)) ? Number(b.order) : 0;
  if (orderA !== orderB) return orderA - orderB;

  return String(a.name || "").localeCompare(String(b.name || ""), "ko-KR", {
    numeric: true,
    sensitivity: "base"
  });
}

function normalizeCategoryOrder() {
  state.categories = [...state.categories].sort(compareCategoriesByOrder);
  state.categories.forEach((category, index) => {
    category.order = index;
  });
}

function getNextCategoryOrder() {
  if (!state.categories.length) return 0;
  return Math.max(...state.categories.map((category) =>
    Number.isFinite(Number(category.order)) ? Number(category.order) : 0
  )) + 1;
}

function normalizeCategory(raw, index, seenIds = new Set()) {
  const source = raw && typeof raw === "object" ? raw : {};
  const name = cleanLabel(typeof raw === "string" ? raw : source.name, "");
  if (!name) return null;

  let id = String(source.id || "").trim();
  if (!id) {
    id = createCategoryId();
    while (seenIds.has(id)) id = createCategoryId();
  } else if (seenIds.has(id)) {
    id = createCategoryId();
  }
  seenIds.add(id);

  return {
    id,
    name,
    slots: normalizeSlots(source.slots),
    createdAt: isValidDateString(source.createdAt) ? source.createdAt : makeLegacyCategoryDate(index),
    order: Number.isFinite(Number(source.order)) ? Number(source.order) : index
  };
}

function makeLegacyCategoryDate(index) {
  const base = Date.UTC(2020, 0, 1, 0, 0, 0);
  return new Date(base + index * 1000).toISOString();
}

function isValidDateString(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function getVisibleSlots() {
  const categories = state.categoryFilter === "all"
    ? getOrderedCategories()
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

function normalizeSlots(slots) {
  const cleaned = cleanSlots(slots);
  return cleaned.length ? cleaned : [DEFAULT_SLOT];
}

function cleanLabel(value, fallback) {
  return String(value || "").trim().slice(0, 28) || fallback;
}

function cleanMetadataText(value, maxLength = 200) {
  if (typeof value !== "string") return "";
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeVideoId(value) {
  const videoId = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : "";
}

function createDefaultCategory(overrides = {}) {
  return {
    id: DEFAULT_CATEGORY_ID,
    name: DEFAULT_CATEGORY_NAME,
    slots: [DEFAULT_SLOT],
    createdAt: overrides.createdAt || makeLegacyCategoryDate(0),
    order: Number.isFinite(Number(overrides.order)) ? Number(overrides.order) : 0
  };
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
  const videoId = normalizeVideoId(item.videoId);
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "icon.svg";
}

function displayTitle(item) {
  return item.title || fallbackTitle(item);
}

function fallbackTitle(item) {
  return item.type === "short" ? `YouTube 숏츠 ${item.videoId}` : `YouTube 롱폼 ${item.videoId}`;
}

function isGeneratedFallbackTitle(title, videoId) {
  const value = String(title || "").trim();
  return value === `YouTube 숏츠 ${videoId}`
    || value === `YouTube 롱폼 ${videoId}`
    || value === `YouTube 영상 ${videoId}`;
}

function getTypeLabel(type) {
  return type === "short" ? "숏츠" : "롱폼";
}

function getTypeClass(type) {
  return type === "short" ? "type-short" : "type-video";
}

function normalizeText(value) {
  return normalizeSearchText(value);
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function createId(seed) {
  return `${seed}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function persistAndRender(show = true, options = {}) {
  const saved = persist(options);
  if (!saved) {
    state = loadState();
    ensureLibraryShape();
  }
  render();
  if (show) requestAnimationFrame(() => {});
}

function persist({ allowEmptyOverwrite = false } = {}) {
  state.version = IMPORT_VERSION;
  if (!allowEmptyOverwrite && shouldBlockEmptyOverwrite()) {
    showToast("기존 목록을 빈 목록으로 덮어쓰지 않도록 저장을 중단했어요. 데이터 이전에서 백업을 확인하세요.");
    return false;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    showToast("브라우저 저장공간이 부족해 저장하지 못했어요. 먼저 내보내기로 백업한 뒤 불필요한 항목을 정리하세요.");
    return false;
  }
  scheduleCloudSave();
  return true;
}

function shouldBlockEmptyOverwrite() {
  return state.items.length === 0 && getStoredItemCount() > 0;
}

function getStoredItemCount() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(stored?.items) ? stored.items.length : 0;
  } catch {
    return 0;
  }
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
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshingForServiceWorker) return;
    refreshingForServiceWorker = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then((registration) => {
        registration.update().catch(() => {});
        if (registration.waiting) promptForServiceWorkerUpdate(registration);

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              promptForServiceWorkerUpdate(registration);
            }
          });
        });
      })
      .catch(() => {});
  });
}

function promptForServiceWorkerUpdate(registration) {
  waitingServiceWorker = registration.waiting;
  if (!waitingServiceWorker) return;
  els.updateBanner.hidden = false;
  showToast("새 버전을 사용할 수 있어요. 새 버전 적용을 눌러 주세요.");
}

function applyWaitingServiceWorker() {
  if (!waitingServiceWorker) {
    window.location.reload();
    return;
  }

  els.updateBanner.hidden = true;
  waitingServiceWorker.postMessage({ type: "SKIP_WAITING" });
}
