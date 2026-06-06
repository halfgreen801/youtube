const STORAGE_KEY = "tube-vault-state-v1";
const IMPORT_VERSION = 1;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const initialState = {
  version: IMPORT_VERSION,
  profiles: ["나"],
  items: [],
  view: "all",
  profileFilter: "all",
  tagFilter: "all",
  query: "",
  sort: "newest",
  selectedId: null
};

let state = loadState();
let toastTimer = 0;
let deferredInstallPrompt = null;

const els = {
  saveForm: $("#saveForm"),
  urlInput: $("#urlInput"),
  titleInput: $("#titleInput"),
  profileInput: $("#profileInput"),
  tagsInput: $("#tagsInput"),
  noteInput: $("#noteInput"),
  pasteButton: $("#pasteButton"),
  totalCount: $("#totalCount"),
  viewFilters: $("#viewFilters"),
  profileFilter: $("#profileFilter"),
  tagCloud: $("#tagCloud"),
  newProfileButton: $("#newProfileButton"),
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
  editDialog: $("#editDialog"),
  editForm: $("#editForm"),
  editId: $("#editId"),
  editTitle: $("#editTitle"),
  editProfile: $("#editProfile"),
  editStatus: $("#editStatus"),
  editTags: $("#editTags"),
  editNote: $("#editNote"),
  deleteButton: $("#deleteButton"),
  toast: $("#toast")
};

init();

function init() {
  ensureProfileOptions();
  bindEvents();
  render();
  registerServiceWorker();
  hydrateMissingTitles();
}

function bindEvents() {
  els.saveForm.addEventListener("submit", handleSave);
  els.pasteButton.addEventListener("click", pasteFromClipboard);
  els.viewFilters.addEventListener("click", handleViewFilter);
  els.profileFilter.addEventListener("change", () => {
    state.profileFilter = els.profileFilter.value;
    persistAndRender();
  });
  els.newProfileButton.addEventListener("click", addProfile);
  els.searchInput.addEventListener("input", () => {
    state.query = els.searchInput.value.trim();
    persistAndRender(false);
  });
  els.sortInput.addEventListener("change", () => {
    state.sort = els.sortInput.value;
    persistAndRender();
  });
  els.tagCloud.addEventListener("click", handleTagFilter);
  els.videoGrid.addEventListener("click", handleCardAction);
  els.closePlayerButton.addEventListener("click", closePlayer);
  els.exportButton.addEventListener("click", exportLibrary);
  els.importInput.addEventListener("change", importLibrary);
  els.editForm.addEventListener("submit", saveEdit);
  els.deleteButton.addEventListener("click", deleteEditingItem);

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      state = loadState();
      render();
    }
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    els.installButton.hidden = false;
  });

  els.installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    els.installButton.hidden = true;
  });
}

function handleSave(event) {
  event.preventDefault();
  const parsed = parseYoutubeLinks(els.urlInput.value);

  if (!parsed.length) {
    showToast("저장할 YouTube 링크를 찾지 못했어요.");
    return;
  }

  const now = new Date().toISOString();
  const tags = parseTags(els.tagsInput.value);
  const profile = els.profileInput.value || "나";
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
      tags,
      profile,
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
    els.profileInput.value = profile;
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

function handleTagFilter(event) {
  const button = event.target.closest("[data-tag]");
  if (!button) return;
  state.tagFilter = button.dataset.tag;
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

function addProfile() {
  const name = window.prompt("추가할 프로필 이름");
  if (!name) return;
  const cleaned = name.trim().slice(0, 28);
  if (!cleaned) return;
  ensureProfile(cleaned);
  state.profileFilter = cleaned;
  persistAndRender();
  showToast(`${cleaned} 프로필을 추가했어요.`);
}

function openEditDialog(item) {
  ensureProfileOptions();
  els.editId.value = item.id;
  els.editTitle.value = item.title || "";
  els.editProfile.value = item.profile || "나";
  els.editStatus.value = item.status || "queue";
  els.editTags.value = (item.tags || []).join(", ");
  els.editNote.value = item.note || "";
  els.editDialog.showModal();
}

function saveEdit(event) {
  event.preventDefault();
  const item = state.items.find((entry) => entry.id === els.editId.value);
  if (!item) return;

  item.title = els.editTitle.value.trim() || fallbackTitle(item);
  item.profile = els.editProfile.value || "나";
  item.status = els.editStatus.value;
  item.tags = parseTags(els.editTags.value);
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
  ensureProfileOptions();
  els.totalCount.value = String(state.items.length);
  els.searchInput.value = state.query;
  els.sortInput.value = state.sort;
  renderFilterState();
  renderTags();
  renderCards();
  renderPlayer();
}

function renderFilterState() {
  $$("[data-view]", els.viewFilters).forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });

  els.profileFilter.innerHTML = "";
  const allOption = new Option("모든 프로필", "all");
  els.profileFilter.add(allOption);
  state.profiles.forEach((profile) => els.profileFilter.add(new Option(profile, profile)));
  els.profileFilter.value = state.profileFilter;
}

function renderTags() {
  const tags = [...new Set(state.items.flatMap((item) => item.tags || []))].sort((a, b) => a.localeCompare(b, "ko"));
  els.tagCloud.innerHTML = "";

  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.className = `tag-button ${state.tagFilter === "all" ? "active" : ""}`;
  allButton.dataset.tag = "all";
  allButton.textContent = "모든 태그";
  els.tagCloud.append(allButton);

  tags.forEach((tag) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tag-button ${state.tagFilter === tag ? "active" : ""}`;
    button.dataset.tag = tag;
    button.textContent = `#${tag}`;
    els.tagCloud.append(button);
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

    $(".profile-badge", node).textContent = item.profile || "나";
    $(".card-title", node).textContent = displayTitle(item);
    $(".card-note", node).textContent = item.note || item.author || " ";

    const tagWrap = $(".card-tags", node);
    (item.tags || []).forEach((tag) => {
      const chip = document.createElement("span");
      chip.textContent = `#${tag}`;
      tagWrap.append(chip);
    });

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
      if (state.profileFilter !== "all" && item.profile !== state.profileFilter) return false;
      if (state.tagFilter !== "all" && !(item.tags || []).includes(state.tagFilter)) return false;

      if (!query) return true;
      const haystack = normalizeText([
        item.title,
        item.author,
        item.note,
        item.profile,
        ...(item.tags || [])
      ].join(" "));
      return haystack.includes(query);
    })
    .sort(sortItems);
}

function sortItems(a, b) {
  if (state.sort === "oldest") return new Date(a.createdAt) - new Date(b.createdAt);
  if (state.sort === "title") return displayTitle(a).localeCompare(displayTitle(b), "ko");
  if (state.sort === "profile") return (a.profile || "").localeCompare(b.profile || "", "ko");
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

function exportLibrary() {
  const payload = {
    version: IMPORT_VERSION,
    exportedAt: new Date().toISOString(),
    app: "튜브서랍",
    profiles: state.profiles,
    items: state.items
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `tube-vault-${date}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("내보내기 파일을 만들었어요.");
}

async function importLibrary(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    const incomingItems = Array.isArray(imported) ? imported : imported.items;
    if (!Array.isArray(incomingItems)) throw new Error("items missing");

    const existing = new Set(state.items.map((item) => `${item.type}:${item.videoId}`));
    const cleanedItems = incomingItems.map(cleanImportedItem).filter(Boolean);
    let added = 0;

    cleanedItems.forEach((item) => {
      const key = `${item.type}:${item.videoId}`;
      if (existing.has(key)) return;
      existing.add(key);
      state.items.push(item);
      added += 1;
    });

    const importedProfiles = Array.isArray(imported.profiles) ? imported.profiles : [];
    importedProfiles.forEach((profile) => ensureProfile(String(profile)));
    state.items.forEach((item) => ensureProfile(item.profile || "나"));
    persistAndRender();
    showToast(`${added}개를 가져왔어요.`);
  } catch {
    showToast("가져오기 파일을 읽지 못했어요.");
  } finally {
    els.importInput.value = "";
  }
}

function cleanImportedItem(raw) {
  const parsed = parseYoutubeUrl(raw.url || `https://www.youtube.com/watch?v=${raw.videoId || ""}`);
  if (!parsed) return null;
  const now = new Date().toISOString();
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
    status: raw.status === "done" ? "done" : "queue",
    favorite: Boolean(raw.favorite),
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now
  };
}

function ensureProfileOptions() {
  state.profiles = [...new Set((state.profiles.length ? state.profiles : ["나"]).map((profile) => String(profile).trim()).filter(Boolean))];
  if (!state.profiles.includes("나")) state.profiles.unshift("나");

  [els.profileInput, els.editProfile].forEach((select) => {
    const current = select.value;
    select.innerHTML = "";
    state.profiles.forEach((profile) => select.add(new Option(profile, profile)));
    select.value = state.profiles.includes(current) ? current : state.profiles[0];
  });
}

function ensureProfile(profile) {
  const cleaned = String(profile || "나").trim() || "나";
  if (!state.profiles.includes(cleaned)) state.profiles.push(cleaned);
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || typeof stored !== "object") return structuredClone(initialState);
    return {
      ...structuredClone(initialState),
      ...stored,
      profiles: Array.isArray(stored.profiles) ? stored.profiles : ["나"],
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
