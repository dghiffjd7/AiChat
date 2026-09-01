import assert from 'node:assert/strict';

import {
  bootstrapAppLanguage,
  detectExistingInstall,
} from '../../src/scripts/i18n/app-language-bootstrap.js';
import { showFirstRunLanguageChooser } from '../../src/scripts/i18n/first-run-language.js';

const createStorage = (entries = {}) => {
  const keys = Object.keys(entries);
  return {
    get length() { return keys.length; },
    key(index) { return keys[index] ?? null; },
    getItem(key) { return Object.prototype.hasOwnProperty.call(entries, key) ? String(entries[key]) : null; },
  };
};

const createChooserDocument = () => {
  const byId = new Map();
  class Element {
    constructor(tagName) {
      this.tagName = String(tagName).toUpperCase();
      this.children = [];
      this.parentElement = null;
      this.dataset = {};
      this.attributes = new Map();
      this.listeners = new Map();
      this.textContent = '';
      this.className = '';
      this.classList = {
        toggle: (name, enabled) => {
          const tokens = new Set(this.className.split(/\s+/).filter(Boolean));
          if (enabled) tokens.add(name);
          else tokens.delete(name);
          this.className = Array.from(tokens).join(' ');
        },
      };
    }
    set id(value) {
      this._id = String(value || '');
      if (this._id) byId.set(this._id, this);
    }
    get id() { return this._id || ''; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    click() { this.listeners.get('click')?.({ currentTarget: this, target: this }); }
    focus() { this.focused = true; }
    remove() {
      if (this.id) byId.delete(this.id);
      if (this.parentElement) {
        this.parentElement.children = this.parentElement.children.filter(child => child !== this);
      }
      this.parentElement = null;
    }
    querySelector(selector) {
      if (selector.startsWith('#')) return byId.get(selector.slice(1)) || null;
      return null;
    }
  }
  const body = new Element('body');
  const splash = new Element('div');
  splash.id = 'app-splash';
  const icon = new Element('div');
  icon.id = 'splash-icon';
  splash.appendChild(icon);
  body.appendChild(splash);
  return {
    body,
    createElement: tagName => new Element(tagName),
    getElementById: id => byId.get(id) || null,
  };
};

assert.equal(detectExistingInstall({ storage: createStorage(), hasPersistedSettings: false }), false);
assert.equal(detectExistingInstall({ storage: createStorage(), hasPersistedSettings: true }), true);
assert.equal(detectExistingInstall({
  storage: createStorage({ chat_store_v1: '{}' }),
  hasPersistedSettings: false,
}), true);

{
  const documentLike = createChooserDocument();
  const choicePromise = showFirstRunLanguageChooser({ documentLike, systemLocale: 'zh-TW' });
  const root = documentLike.getElementById('first-run-language');
  assert.ok(root, '确认选择前必须保留阻塞式语言页');
  const title = documentLike.getElementById('first-run-language-title');
  assert.equal(title.textContent, '选择语言 / 選擇語言 / Choose language');
  const english = root.children
    .flatMap(child => child.children || [])
    .find(child => child.dataset?.localePreference === 'en');
  const continueButton = root.children.find(child => child.className === 'first-run-language-continue');
  english.click();
  assert.equal(continueButton.textContent, 'Continue');
  continueButton.click();
  assert.equal(await choicePromise, 'en');
  assert.equal(documentLike.getElementById('first-run-language'), null);
  assert.equal(documentLike.getElementById('app-splash').attributes.has('data-language-setup'), false);
}
assert.equal(detectExistingInstall({
  storage: createStorage({ chatapp_renderer_lifecycle_v1: '{}' }),
  hasPersistedSettings: false,
}), false);
assert.equal(detectExistingInstall({
  storage: createStorage({ user_character_state_v1: '{}' }),
  hasPersistedSettings: false,
}), true);
assert.equal(detectExistingInstall({
  storage: createStorage({ worldinfo_index_v2: '{}' }),
  hasPersistedSettings: false,
}), true);

const createSettings = ({ state, hasPersistedSettings = false } = {}) => {
  let current = { ...state };
  const updates = [];
  return {
    get: () => ({ ...current }),
    update: patch => {
      updates.push({ ...patch });
      current = { ...current, ...patch };
      return { ...current };
    },
    getPersistenceMeta: () => ({ hasPersistedSettings }),
    read: () => ({ ...current }),
    updates,
  };
};

{
  const settings = createSettings({
    state: { locale: 'system', languageSetupCompleted: false },
  });
  let chooserCalls = 0;
  const result = await bootstrapAppLanguage({
    appSettings: settings,
    storage: createStorage(),
    documentLike: null,
    navigatorLike: { language: 'zh-TW' },
    chooserFn: async ({ systemLocale }) => {
      chooserCalls += 1;
      assert.equal(systemLocale, 'zh-TW');
      return 'en';
    },
    fetchFn: async () => ({ ok: true, json: async () => ({ 保存: 'Save' }) }),
    MutationObserverClass: null,
  });
  assert.equal(chooserCalls, 1, '全新安装必须等待用户选择语言');
  assert.deepEqual(settings.updates, [{ locale: 'en', languageSetupCompleted: true }]);
  assert.equal(settings.read().locale, 'en');
  assert.equal(result.locale, 'en');
}

{
  const settings = createSettings({
    state: { locale: 'system', languageSetupCompleted: false },
    hasPersistedSettings: true,
  });
  const result = await bootstrapAppLanguage({
    appSettings: settings,
    storage: createStorage(),
    documentLike: null,
    navigatorLike: { language: 'en-US' },
    chooserFn: async () => { throw new Error('既有安装不应显示语言选择'); },
    fetchFn: async () => { throw new Error('迁移到简体中文不应加载目录'); },
    MutationObserverClass: null,
  });
  assert.deepEqual(settings.updates, [{ locale: 'zh-CN', languageSetupCompleted: true }]);
  assert.equal(result.locale, 'zh-CN');
}

{
  const settings = createSettings({
    state: { locale: 'system', languageSetupCompleted: true },
    hasPersistedSettings: true,
  });
  const fetched = [];
  const first = await bootstrapAppLanguage({
    appSettings: settings,
    documentLike: null,
    navigatorLike: { language: 'zh-HK' },
    fetchFn: async url => {
      fetched.push(String(url));
      return { ok: true, json: async () => ({}) };
    },
    MutationObserverClass: null,
  });
  assert.equal(first.locale, 'zh-TW');
  const second = await bootstrapAppLanguage({
    appSettings: settings,
    documentLike: null,
    navigatorLike: { language: 'en-GB' },
    fetchFn: async url => {
      fetched.push(String(url));
      return { ok: true, json: async () => ({}) };
    },
    MutationObserverClass: null,
  });
  assert.equal(second.locale, 'en');
  assert.equal(settings.read().locale, 'system', '运行时解析结果不得覆写 system 偏好');
  assert.equal(settings.updates.length, 0);
  assert.ok(fetched.some(url => url.endsWith('/zh-TW.json')));
  assert.ok(fetched.some(url => url.endsWith('/en.json')));
}

console.log('i18n-app-language-bootstrap-tests passed');
