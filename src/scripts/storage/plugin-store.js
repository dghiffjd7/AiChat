import { safeInvoke } from '../utils/tauri.js';
import { logger } from '../utils/logger.js';

const PLUGIN_STORE_KEY = 'plugin_store_v1';
const PLUGIN_STORAGE_KEY = 'plugin_storage_v1';

const ALLOWED_MODES = new Set(['safe', 'power', 'legacy']);
const ALLOWED_PERMISSIONS = new Set([
  'chat.read',
  'chat.write',
  'worldbook.read',
  'worldbook.write',
  'storage',
  'network',
  'prompt.modify',
  'ui.inject',
  'variables.read',
  'variables.write',
  'system.settings',
]);
const POWER_REQUIRED_PERMISSIONS = new Set([
  'worldbook.write',
  'network',
  'prompt.modify',
  'system.settings',
]);

const FAILURE_WINDOW_MS = 10 * 60 * 1000;
const FAILURE_THRESHOLD = 3;

const normalizePermissions = (list = []) => {
  const normalized = Array.isArray(list)
    ? list.map(p => String(p || '').trim()).filter(Boolean)
    : [];
  return Array.from(new Set(normalized)).sort();
};

const computePermissionHash = (list = []) => normalizePermissions(list).join('|');

const readLocalJson = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const writeLocalJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

const loadKv = async (name) => {
  try {
    const data = await safeInvoke('load_kv', { name });
    if (data && typeof data === 'object') return data;
  } catch (err) {
    logger.debug('plugin store load_kv skipped (maybe not tauri)', err);
  }
  return null;
};

const saveKv = async (name, data) => {
  try {
    await safeInvoke('save_kv', { name, data });
    return true;
  } catch (err) {
    logger.debug('plugin store save_kv skipped (maybe not tauri)', err);
    return false;
  }
};

const normalizeManifest = (raw) => {
  const manifest = raw && typeof raw === 'object' ? { ...raw } : {};
  manifest.id = String(manifest.id || '').trim();
  manifest.name = String(manifest.name || '').trim();
  manifest.version = String(manifest.version || '').trim();
  manifest.apiVersion = String(manifest.apiVersion || '').trim();
  manifest.main = String(manifest.main || '').trim();
  manifest.mode = String(manifest.mode || 'safe').trim().toLowerCase();
  manifest.permissions = Array.isArray(manifest.permissions) ? manifest.permissions.map(p => String(p || '').trim()) : [];
  manifest.hooks = Array.isArray(manifest.hooks) ? manifest.hooks.map(h => String(h || '').trim()) : [];
  return manifest;
};

const isSemver = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return /^\d+\.\d+\.\d+([\-+][0-9A-Za-z.-]+)?$/.test(raw);
};

export const validateManifest = (rawManifest) => {
  const manifest = normalizeManifest(rawManifest);
  const errors = [];
  if (!manifest.id) errors.push('缺少 id');
  if (!manifest.name) errors.push('缺少 name');
  if (!manifest.version) errors.push('缺少 version');
  if (!manifest.apiVersion) errors.push('缺少 apiVersion');
  if (!manifest.main) errors.push('缺少 main');
  if (!Array.isArray(manifest.permissions) || manifest.permissions.length === 0) errors.push('缺少 permissions');
  if (manifest.id && !/^[a-zA-Z0-9._-]+$/.test(manifest.id)) errors.push('id 格式无效');
  if (manifest.version && !isSemver(manifest.version)) errors.push('version 非语义化版本');
  if (manifest.apiVersion && !/^\d+(\.\d+)?$/.test(manifest.apiVersion)) errors.push('apiVersion 格式无效');
  if (manifest.mode && !ALLOWED_MODES.has(manifest.mode)) errors.push(`mode 不支持: ${manifest.mode}`);
  const invalidPerms = manifest.permissions.filter(p => p && !ALLOWED_PERMISSIONS.has(p));
  if (invalidPerms.length) errors.push(`权限不支持: ${invalidPerms.join(', ')}`);
  const powerPerms = manifest.permissions.filter(p => p && POWER_REQUIRED_PERMISSIONS.has(p));
  if (powerPerms.length && manifest.mode !== 'power') {
    errors.push(`权限需要 power 模式: ${powerPerms.join(', ')}`);
  }
  return { manifest, ok: errors.length === 0, errors };
};

export class PluginStore {
  constructor() {
    this.records = new Map();
    this.storage = new Map();
    this.ready = this.load();
  }

  async load() {
    const [registry, storage] = await Promise.all([loadKv(PLUGIN_STORE_KEY), loadKv(PLUGIN_STORAGE_KEY)]);
    let registryData = registry && typeof registry === 'object' && !registry._tooLarge ? registry : null;
    let storageData = storage && typeof storage === 'object' && !storage._tooLarge ? storage : null;

    if (!registryData) registryData = readLocalJson(PLUGIN_STORE_KEY);
    if (!storageData) storageData = readLocalJson(PLUGIN_STORAGE_KEY);

    const records = new Map();
    const plugins = registryData && typeof registryData === 'object' ? registryData.plugins || {} : {};
    Object.entries(plugins || {}).forEach(([id, item]) => {
      if (!item || typeof item !== 'object') return;
      const manifest = normalizeManifest(item.manifest || item);
      records.set(id, {
        id,
        manifest,
        code: String(item.code || ''),
        enabled: Boolean(item.enabled),
        blocked: Boolean(item.blocked),
        powerApproved: Boolean(item.powerApproved),
        permissionApproved: Boolean(item.permissionApproved) && String(item.permissionHash || '') === computePermissionHash(manifest.permissions),
        permissionHash: computePermissionHash(manifest.permissions),
        failureCount: Number(item.failureCount || 0) || 0,
        lastFailureAt: Number(item.lastFailureAt || 0) || 0,
        lastFailureReason: String(item.lastFailureReason || ''),
        disabledReason: String(item.disabledReason || ''),
        backups: Array.isArray(item.backups) ? item.backups.filter(b => b && typeof b === 'object') : [],
        installedAt: Number(item.installedAt || 0) || 0,
        updatedAt: Number(item.updatedAt || 0) || 0,
        source: item.source || null,
      });
    });
    this.records = records;

    const storageMap = new Map();
    const storageEntries = storageData && typeof storageData === 'object' ? storageData.plugins || {} : {};
    Object.entries(storageEntries || {}).forEach(([id, item]) => {
      if (!item || typeof item !== 'object') return;
      storageMap.set(id, { ...item });
    });
    this.storage = storageMap;
  }

  async save() {
    const plugins = {};
    for (const [id, record] of this.records.entries()) {
      plugins[id] = {
        id,
        manifest: record.manifest,
        code: record.code,
        enabled: Boolean(record.enabled),
        blocked: Boolean(record.blocked),
        powerApproved: Boolean(record.powerApproved),
        permissionApproved: Boolean(record.permissionApproved),
        permissionHash: String(record.permissionHash || ''),
        failureCount: Number(record.failureCount || 0) || 0,
        lastFailureAt: Number(record.lastFailureAt || 0) || 0,
        lastFailureReason: String(record.lastFailureReason || ''),
        disabledReason: String(record.disabledReason || ''),
        backups: Array.isArray(record.backups) ? record.backups : [],
        installedAt: record.installedAt || Date.now(),
        updatedAt: Date.now(),
        source: record.source || null,
      };
    }
    const payload = { version: 1, plugins };
    const storagePayload = { version: 1, plugins: Object.fromEntries(this.storage.entries()) };

    const savedRegistry = await saveKv(PLUGIN_STORE_KEY, payload);
    const savedStorage = await saveKv(PLUGIN_STORAGE_KEY, storagePayload);
    if (!savedRegistry) writeLocalJson(PLUGIN_STORE_KEY, payload);
    if (!savedStorage) writeLocalJson(PLUGIN_STORAGE_KEY, storagePayload);
  }

  list() {
    return Array.from(this.records.values()).map(record => ({
      id: record.id,
      manifest: record.manifest,
      enabled: Boolean(record.enabled),
      blocked: Boolean(record.blocked),
      powerApproved: Boolean(record.powerApproved),
      permissionApproved: Boolean(record.permissionApproved),
      failureCount: Number(record.failureCount || 0) || 0,
      lastFailureAt: Number(record.lastFailureAt || 0) || 0,
      lastFailureReason: String(record.lastFailureReason || ''),
      disabledReason: String(record.disabledReason || ''),
      backupCount: Array.isArray(record.backups) ? record.backups.length : 0,
      installedAt: record.installedAt,
      updatedAt: record.updatedAt,
      source: record.source || null,
    }));
  }

  get(id) {
    const key = String(id || '').trim();
    return key ? this.records.get(key) : null;
  }

  has(id) {
    const key = String(id || '').trim();
    return key ? this.records.has(key) : false;
  }

  async installPlugin({ manifest, code, source } = {}) {
    const { manifest: normalized, ok, errors } = validateManifest(manifest);
    if (!ok) {
      throw new Error(errors.join('；'));
    }
    const id = normalized.id;
    const now = Date.now();
    const existing = this.records.get(id);
    const permHash = computePermissionHash(normalized.permissions);
    const backups = Array.isArray(existing?.backups) ? [...existing.backups] : [];
    const hasChange = existing
      ? (existing.code !== String(code || '') || JSON.stringify(existing.manifest || {}) !== JSON.stringify(normalized || {}))
      : false;
    if (existing && hasChange) {
      backups.unshift({
        manifest: existing.manifest,
        code: existing.code,
        version: String(existing.manifest?.version || ''),
        updatedAt: Number(existing.updatedAt || existing.installedAt || now) || now,
      });
      if (backups.length > 3) backups.length = 3;
    }
    const record = {
      id,
      manifest: normalized,
      code: String(code || ''),
      enabled: existing ? Boolean(existing.enabled) : false,
      blocked: existing ? Boolean(existing.blocked) : false,
      powerApproved: existing ? Boolean(existing.powerApproved) : false,
      permissionApproved: existing ? Boolean(existing.permissionApproved) && String(existing.permissionHash || '') === permHash : false,
      permissionHash: permHash,
      failureCount: existing ? Number(existing.failureCount || 0) || 0 : 0,
      lastFailureAt: existing ? Number(existing.lastFailureAt || 0) || 0 : 0,
      lastFailureReason: existing ? String(existing.lastFailureReason || '') : '',
      disabledReason: existing ? String(existing.disabledReason || '') : '',
      backups,
      installedAt: existing?.installedAt || now,
      updatedAt: now,
      source: source || null,
    };
    this.records.set(id, record);
    await this.save();
    return record;
  }

  async removePlugin(id) {
    const key = String(id || '').trim();
    if (!key) return;
    this.records.delete(key);
    this.storage.delete(key);
    await this.save();
  }

  async setEnabled(id, enabled) {
    const key = String(id || '').trim();
    const record = this.records.get(key);
    if (!record) return;
    record.enabled = Boolean(enabled);
    record.updatedAt = Date.now();
    this.records.set(key, record);
    await this.save();
  }

  async setBlocked(id, blocked) {
    const key = String(id || '').trim();
    const record = this.records.get(key);
    if (!record) return;
    record.blocked = Boolean(blocked);
    if (record.blocked) record.enabled = false;
    if (record.blocked) record.disabledReason = '已手动拉黑';
    if (!record.blocked && record.disabledReason === '已手动拉黑') record.disabledReason = '';
    record.updatedAt = Date.now();
    this.records.set(key, record);
    await this.save();
  }

  isBlocked(id) {
    const key = String(id || '').trim();
    const record = this.records.get(key);
    return Boolean(record?.blocked);
  }

  async setPowerApproved(id, approved) {
    const key = String(id || '').trim();
    const record = this.records.get(key);
    if (!record) return;
    record.powerApproved = Boolean(approved);
    record.updatedAt = Date.now();
    this.records.set(key, record);
    await this.save();
  }

  isPowerApproved(id) {
    const key = String(id || '').trim();
    const record = this.records.get(key);
    return Boolean(record?.powerApproved);
  }

  isPermissionsApproved(id) {
    const key = String(id || '').trim();
    const record = this.records.get(key);
    if (!record) return false;
    const currentHash = computePermissionHash(record.manifest?.permissions || []);
    return Boolean(record.permissionApproved) && String(record.permissionHash || '') === currentHash;
  }

  async approvePermissions(id) {
    const key = String(id || '').trim();
    const record = this.records.get(key);
    if (!record) return;
    record.permissionApproved = true;
    record.permissionHash = computePermissionHash(record.manifest?.permissions || []);
    record.updatedAt = Date.now();
    this.records.set(key, record);
    await this.save();
  }

  async revokePermissions(id) {
    const key = String(id || '').trim();
    const record = this.records.get(key);
    if (!record) return;
    record.permissionApproved = false;
    record.permissionHash = computePermissionHash(record.manifest?.permissions || []);
    record.updatedAt = Date.now();
    this.records.set(key, record);
    await this.save();
  }

  async recordFailure(id, reason = '') {
    const key = String(id || '').trim();
    const record = this.records.get(key);
    if (!record) return { blocked: false, count: 0 };
    const now = Date.now();
    const last = Number(record.lastFailureAt || 0) || 0;
    const withinWindow = last && (now - last) <= FAILURE_WINDOW_MS;
    record.failureCount = withinWindow ? (Number(record.failureCount || 0) || 0) + 1 : 1;
    record.lastFailureAt = now;
    record.lastFailureReason = String(reason || '');
    if (record.failureCount >= FAILURE_THRESHOLD) {
      record.blocked = true;
      record.enabled = false;
      record.disabledReason = '插件连续错误，已自动禁用';
    }
    record.updatedAt = now;
    this.records.set(key, record);
    await this.save();
    return { blocked: Boolean(record.blocked), count: record.failureCount };
  }

  async resetFailures(id) {
    const key = String(id || '').trim();
    const record = this.records.get(key);
    if (!record) return;
    record.failureCount = 0;
    record.lastFailureAt = 0;
    record.lastFailureReason = '';
    if (record.disabledReason === '插件连续错误，已自动禁用') record.disabledReason = '';
    record.updatedAt = Date.now();
    this.records.set(key, record);
    await this.save();
  }

  async rollbackPlugin(id) {
    const key = String(id || '').trim();
    const record = this.records.get(key);
    if (!record) return false;
    if (!Array.isArray(record.backups) || record.backups.length === 0) return false;
    const [backup, ...rest] = record.backups;
    const currentSnapshot = {
      manifest: record.manifest,
      code: record.code,
      version: String(record.manifest?.version || ''),
      updatedAt: Number(record.updatedAt || Date.now()),
    };
    const nextBackups = [currentSnapshot, ...rest].slice(0, 3);
    record.manifest = backup.manifest || record.manifest;
    record.code = String(backup.code || '');
    record.backups = nextBackups;
    record.enabled = false;
    record.blocked = false;
    record.powerApproved = record.powerApproved && String(record.manifest?.mode || '').toLowerCase() === 'power';
    record.permissionApproved = false;
    record.permissionHash = computePermissionHash(record.manifest?.permissions || []);
    record.disabledReason = '已回滚至上一版本';
    record.updatedAt = Date.now();
    this.records.set(key, record);
    await this.save();
    return true;
  }

  async storageGet(pluginId, key) {
    const pid = String(pluginId || '').trim();
    if (!pid) return null;
    const data = this.storage.get(pid) || {};
    if (!key) return null;
    return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
  }

  async storageSet(pluginId, key, value) {
    const pid = String(pluginId || '').trim();
    if (!pid || !key) return;
    const data = { ...(this.storage.get(pid) || {}) };
    data[key] = value;
    const size = JSON.stringify(data).length;
    if (size > 200 * 1024) {
      throw new Error('storage quota exceeded');
    }
    this.storage.set(pid, data);
    await this.save();
  }

  async storageRemove(pluginId, key) {
    const pid = String(pluginId || '').trim();
    if (!pid || !key) return;
    const data = { ...(this.storage.get(pid) || {}) };
    delete data[key];
    this.storage.set(pid, data);
    await this.save();
  }

  async storageKeys(pluginId) {
    const pid = String(pluginId || '').trim();
    if (!pid) return [];
    const data = this.storage.get(pid) || {};
    return Object.keys(data);
  }
}
