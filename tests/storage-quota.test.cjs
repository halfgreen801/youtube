const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const APP_PATH = path.join(__dirname, "..", "app.js");
const LIBRARY_KEY = "tube-vault-state-v1";
const META_KEY = "tubeVaultSyncMeta";
const CLOUD_PREFIX = "tubeVaultBackupBeforeCloudPull:";
const DELETE_PREFIX = "gaegolTubeBeforeCategoryDelete:";
const AUTH_KEY = "sb-project-auth-token";

// A quota failure is atomic: the prior value remains readable after setItem fails.
class QuotaStorage {
  constructor(entries = [], quota = Infinity) {
    this.values = new Map(entries);
    this.quota = quota;
    this.failKeys = new Set();
    this.removed = [];
    this.attempts = [];
  }

  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(String(key)) ?? null; }
  removeItem(key) {
    this.removed.push(String(key));
    this.values.delete(String(key));
  }
  bytes(entries = this.values) {
    return [...entries].reduce((sum, [key, value]) => sum + 2 * (key.length + value.length), 0);
  }
  setItem(key, value) {
    key = String(key);
    value = String(value);
    this.attempts.push(key);
    const proposed = new Map(this.values);
    proposed.set(key, value);
    if (this.failKeys.has(key) || this.bytes(proposed) > this.quota) {
      const error = new Error("The quota has been exceeded.");
      error.name = "QuotaExceededError";
      error.code = 22;
      throw error;
    }
    this.values = proposed;
  }
}

function harness(storage = new QuotaStorage()) {
  const element = () => ({
    style: { setProperty() {}, removeProperty() {} },
    classList: { add() {}, remove() {}, toggle() {} },
    dataset: {},
    setAttribute() {},
    removeAttribute() {},
    addEventListener() {},
    querySelector() { return element(); },
    querySelectorAll() { return []; },
    options: [],
    value: "",
  });
  const document = {
    documentElement: element(),
    querySelector() { return element(); },
    querySelectorAll() { return []; },
  };
  const context = vm.createContext({
    localStorage: storage,
    document,
    navigator: { onLine: true },
    window: {
      TUBE_VAULT_CONFIG: {},
      matchMedia: () => ({ matches: false }),
      setTimeout: () => 1,
      clearTimeout() {},
      confirm: () => true,
    },
    structuredClone,
    URL,
    URLSearchParams,
    requestAnimationFrame() {},
    console,
    __toasts: [],
    __uploads: 0,
  });
  const source = fs.readFileSync(APP_PATH, "utf8");
  assert.match(source, /^init\(\);\s*$/m, "app startup entry point should be removed only in the test harness");
  vm.runInContext(source.replace(/^init\(\);\s*$/m, ""), context, { filename: APP_PATH });
  vm.runInContext(`
    render = () => {};
    renderSyncPanel = () => {};
    showToast = (message) => __toasts.push(message);
  `, context);
  return {
    storage,
    context,
    run: (code) => vm.runInContext(code, context),
    read: (expression) => JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, context)),
  };
}

function backupKey(prefix, day) {
  return `${prefix}2026-09-${String(day).padStart(2, "0")}T00:00:00.000Z`;
}

function ownedBackups(storage) {
  return [...storage.values].filter(([key]) => key.startsWith(CLOUD_PREFIX) || key.startsWith(DELETE_PREFIX));
}

function protectedEntries() {
  return [
    [LIBRARY_KEY, '{"items":[{"id":"keep-library"}]}'],
    [AUTH_KEY, '{"access_token":"keep-session"}'],
    ["another-app-data", "keep-unrelated"],
    [META_KEY, '{"userId":"keep-baseline"}'],
  ];
}

function assertProtectedEntries(storage, entries) {
  for (const [key, value] of entries) assert.equal(storage.getItem(key), value, key);
}

test("legacy cloud and category backups share a count limit without changing library, session, or unrelated data", () => {
  const protectedData = protectedEntries();
  const backups = Array.from({ length: 7 }, (_, index) => [
    backupKey(index % 2 ? DELETE_PREFIX : CLOUD_PREFIX, index + 1),
    JSON.stringify({ backedUpAt: `2026-09-0${index + 1}T00:00:00.000Z`, state: {} }),
  ]);
  const h = harness(new QuotaStorage([...protectedData, ...backups]));
  h.run("pruneLocalBackups()");
  assert.equal(ownedBackups(h.storage).length, 3);
  assert.deepEqual(new Set(ownedBackups(h.storage).map(([key]) => key)), new Set(backups.slice(-3).map(([key]) => key)));
  assertProtectedEntries(h.storage, protectedData);
});

test("retained backups stay within the byte budget, preserving the newest backup if it alone exceeds the budget", () => {
  const backups = Array.from({ length: 3 }, (_, index) => [
    backupKey(index % 2 ? DELETE_PREFIX : CLOUD_PREFIX, index + 1),
    "x".repeat(250000),
  ]);
  const h = harness(new QuotaStorage(backups));
  h.run("pruneLocalBackups()");
  assert.ok(h.storage.bytes(new Map(ownedBackups(h.storage))) <= 1024 * 1024);
  assert.ok(h.storage.getItem(backups[2][0]));

  const newest = backupKey(DELETE_PREFIX, 10);
  h.storage.values.set(newest, "x".repeat(600000));
  h.run("pruneLocalBackups()");
  assert.deepEqual(ownedBackups(h.storage).map(([key]) => key), [newest]);
});

test("quota retry removes older application backups and preserves the newest backup and unrelated keys", () => {
  const protectedData = protectedEntries();
  const backups = [
    [backupKey(CLOUD_PREFIX, 1), "a".repeat(400)],
    [backupKey(DELETE_PREFIX, 2), "b".repeat(400)],
    [backupKey(CLOUD_PREFIX, 3), "c".repeat(400)],
  ];
  const storage = new QuotaStorage([...protectedData, ...backups]);
  storage.quota = storage.bytes() + 10;
  const h = harness(storage);
  h.context.__valueToWrite = "n".repeat(500);
  h.run('writeLocalStorageSafely("new-app-setting", __valueToWrite)');
  assert.equal(storage.getItem("new-app-setting"), "n".repeat(500));
  assert.equal(storage.getItem(backups[2][0]), backups[2][1]);
  assert.ok(storage.removed.length > 0);
  assert.ok(storage.removed.every((key) => backups.slice(0, -1).some(([backup]) => backup === key)));
  assertProtectedEntries(storage, protectedData);
});

test("a library replacement that cannot fit leaves the previous library and latest recovery backup intact", () => {
  const protectedData = protectedEntries();
  const oldest = backupKey(DELETE_PREFIX, 1);
  const latest = backupKey(CLOUD_PREFIX, 2);
  const storage = new QuotaStorage([...protectedData, [oldest, "a".repeat(200)], [latest, "b".repeat(200)]]);
  storage.quota = storage.bytes();
  const h = harness(storage);
  assert.throws(() => h.run(`writeLocalStorageSafely(STORAGE_KEY, "x".repeat(20000))`), { name: "QuotaExceededError" });
  assertProtectedEntries(storage, protectedData);
  assert.equal(storage.getItem(latest), "b".repeat(200));
  assert.equal(storage.getItem(oldest), null);
});

test("metadata persistence failure does not advance the in-memory sync baseline", () => {
  const storage = new QuotaStorage([[META_KEY, JSON.stringify({ userId: "user", lastSyncedAt: "old", lastSyncedFingerprint: "old-fingerprint" })]]);
  const h = harness(storage);
  h.run('syncState.session = { user: { id: "user" } }');
  const previous = h.read("syncMeta");
  storage.failKeys.add(META_KEY);
  assert.throws(() => h.run('markCloudSynced("new", { items: [] })'), { name: "QuotaExceededError" });
  assert.deepEqual(h.read("syncMeta"), previous);
  assert.deepEqual(JSON.parse(storage.getItem(META_KEY)), previous);
});

test("multiple snapshots written during the same millisecond keep distinct keys", () => {
  const h = harness();
  h.run(`
    writeLocalBackup(CLOUD_BACKUP_PREFIX, "2026-10-02T01:00:00.000Z", { reason: "first", state: {} });
    writeLocalBackup(CLOUD_BACKUP_PREFIX, "2026-10-02T01:00:00.000Z", { reason: "second", state: {} });
  `);
  assert.equal(ownedBackups(h.storage).length, 2);
  assert.deepEqual(ownedBackups(h.storage).map(([, value]) => JSON.parse(value).reason).sort(), ["first", "second"]);
});

for (const [previousPrefix, nextPrefix] of [[CLOUD_PREFIX, DELETE_PREFIX], [DELETE_PREFIX, CLOUD_PREFIX]]) {
  test(`a newly written ${nextPrefix} snapshot survives pruning when both backup types have the same timestamp`, () => {
    const timestamp = "2026-10-02T01:00:00.000Z";
    const previousKey = `${previousPrefix}${timestamp}`;
    const h = harness(new QuotaStorage([[previousKey, "x".repeat(600000)]]));
    h.context.__nextPrefix = nextPrefix;
    h.context.__timestamp = timestamp;
    h.run('writeLocalBackup(__nextPrefix, __timestamp, { reason: "newest", state: {} })');
    const backups = ownedBackups(h.storage);
    assert.equal(backups.length, 1);
    assert.equal(JSON.parse(backups[0][1]).reason, "newest");
    assert.equal(h.storage.getItem(previousKey), null);
  });
}

function library(videoId, title) {
  return {
    version: 2,
    profiles: ["나"],
    categories: [{ id: "general", name: "기본", slots: ["기본"], createdAt: "2020-01-01T00:00:00.000Z", order: 0 }],
    items: [{
      id: `item-${videoId}`,
      type: "video",
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title,
      categoryId: "general",
      slot: "기본",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    }],
  };
}

function syncHarness(action) {
  const h = harness();
  h.context.__initialLibrary = library("abcdefghijk", "Original iPhone library");
  h.context.__cloudRow = { data: library("lmnopqrstuv", "Cloud library"), updated_at: "2026-10-02T00:00:00.000Z" };
  h.context.__action = action;
  h.run(`
    applyStateObject(__initialLibrary);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    syncMeta = { userId: "user", lastSyncedAt: "previous", lastSyncedFingerprint: "previous-fingerprint" };
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(syncMeta));
    Object.assign(syncState, { configured: true, available: true, client: {}, online: true, session: { user: { id: "user" } } });
    fetchCloudState = async () => __cloudRow;
    getAutomaticSyncPlan = () => ({ action: __action, localItemCount: 1, cloudItemCount: 1 });
    upsertCloudState = async () => { __uploads += 1; syncState.status = "synced"; return true; };
  `);
  h.previousLibrary = h.storage.getItem(LIBRARY_KEY);
  h.previousMeta = h.storage.getItem(META_KEY);
  return h;
}

for (const [name, action, invocation] of [
  ["automatic download", "download", "handleSyncNow()"],
  ["manual download", "download", "pullCloudState()"],
  ["automatic merge", "merge", "handleSyncNow()"],
  ["manual merge", "merge", "mergeCloudState()"],
]) {
  test(`${name}: failed local persistence stops success reporting and cloud upload`, async () => {
    const h = syncHarness(action);
    h.storage.failKeys.add(LIBRARY_KEY);
    await h.run(invocation);
    assert.equal(h.read("syncState.status"), "error");
    assert.equal(h.context.__uploads, 0);
    assert.equal(h.storage.getItem(LIBRARY_KEY), h.previousLibrary);
    assert.equal(h.storage.getItem(META_KEY), h.previousMeta);
    assert.deepEqual(h.read("state.items"), JSON.parse(h.previousLibrary).items);
    assert.ok(!h.context.__toasts.some((message) => /동기화했습니다|불러왔어요|병합하고 동기화/.test(message)));
    assert.ok(ownedBackups(h.storage).length >= 1, "the pre-operation recovery backup must survive a failed save");
  });
}

test("when a new recovery backup cannot fit, download stops before mutating the current library", async () => {
  const h = syncHarness("download");
  h.storage.quota = h.storage.bytes();
  await h.run("handleSyncNow()");
  assert.equal(h.read("syncState.status"), "error");
  assert.equal(h.context.__uploads, 0);
  assert.equal(h.storage.getItem(LIBRARY_KEY), h.previousLibrary);
  assert.equal(h.storage.getItem(META_KEY), h.previousMeta);
  assert.deepEqual(h.read("state.items"), JSON.parse(h.previousLibrary).items);
});

test("successful downloads save the cloud library locally before marking it synced", async () => {
  const h = syncHarness("download");
  await h.run("handleSyncNow()");
  assert.equal(h.read("syncState.status"), "synced");
  const stored = JSON.parse(h.storage.getItem(LIBRARY_KEY));
  assert.equal(stored.items[0].videoId, "lmnopqrstuv");
  assert.equal(h.read("syncMeta.lastSyncedAt"), "2026-10-02T00:00:00.000Z");
  const lastLibraryWrite = h.storage.attempts.lastIndexOf(LIBRARY_KEY);
  const lastMetadataWrite = h.storage.attempts.lastIndexOf(META_KEY);
  assert.ok(lastLibraryWrite < lastMetadataWrite);
});

for (const mode of ["empty-category", "move", "delete-items"]) {
  test(`${mode}: failure to create the category recovery backup leaves categories and items unchanged`, () => {
    const h = syncHarness("none");
    h.context.__deleteMode = mode;
    h.run(`
      state.categories.push({ id: "custom", name: "To delete", slots: ["기본"], createdAt: "2026-09-01T00:00:00.000Z", order: 1 });
      if (__deleteMode !== "empty-category") state.items[0].categoryId = "custom";
      ensureLibraryShape();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      pendingDeleteCategoryId = "custom";
      els.deleteModeDeleteItems.checked = __deleteMode === "delete-items";
      els.deleteMoveTargetSelect.value = "general";
      els.deleteConfirmTextInput.value = "삭제";
    `);
    const original = h.read("state");
    const originalStored = h.storage.getItem(LIBRARY_KEY);
    h.storage.quota = h.storage.bytes();
    h.run("confirmDeleteCategory()");
    assert.deepEqual(h.read("state"), original);
    assert.equal(h.storage.getItem(LIBRARY_KEY), originalStored);
    assert.equal(h.context.__uploads, 0);
    assert.ok(!h.context.__toasts.some((message) => /삭제했어요|이동했어요/.test(message)));
    assert.ok(h.context.__toasts.some((message) => /백업|저장공간|내보내기/.test(message)));
  });
}

test("equal-state sync does not mark itself synced if the metadata baseline cannot be persisted", async () => {
  const h = syncHarness("none");
  h.run('__cloudRow.data = serializeStateForCloud(); syncState.status = "signed-in"');
  h.storage.failKeys.add(META_KEY);
  await assert.rejects(h.run("synchronizeAccountAutomatically()"), { name: "QuotaExceededError" });
  assert.equal(h.read("syncState.status"), "signed-in");
  assert.equal(h.context.__uploads, 0);
  assert.equal(h.storage.getItem(LIBRARY_KEY), h.previousLibrary);
  assert.equal(h.storage.getItem(META_KEY), h.previousMeta);
  assert.deepEqual(h.read("syncMeta"), JSON.parse(h.previousMeta));
});
