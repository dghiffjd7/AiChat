/**
 * OpenRouter API provider.
 * Uses OpenAI-compatible Chat Completions with OpenRouter attribution headers.
 */

import { OpenAIProvider } from './openai.js';
import {
  readOpenRouterModelCapabilities,
  recordOpenRouterModelCapabilities,
  recordOpenRouterModelCatalog,
} from '../openrouter-model-capabilities.js';
import {
  extractOpenRouterModelProviders,
  normalizeOpenRouterProviderSlugs,
} from '../openrouter-provider-routing.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_DEFAULT_MODEL = 'openrouter/auto';
const OPENROUTER_DEFAULT_MODELS = Object.freeze([
  OPENROUTER_DEFAULT_MODEL,
]);
const DEFAULT_APP_TITLE = 'OmniTavern';
const DEFAULT_HTTP_REFERER = 'https://github.com/dghiffjd7/OmniTavern';

const trim = (value) => String(value ?? '').trim();

const uniqueStrings = (items = []) => {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const value = trim(item);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
};

export class OpenRouterProvider extends OpenAIProvider {
  constructor(config = {}) {
    const openrouterConfig = {
      ...config,
      provider: 'openrouter',
      baseUrl: config.baseUrl || OPENROUTER_BASE_URL,
      model: config.model || OPENROUTER_DEFAULT_MODEL,
    };
    super(openrouterConfig);
    this.openrouterReferer = trim(config.openrouterReferer || config.httpReferer || DEFAULT_HTTP_REFERER);
    this.openrouterTitle = trim(config.openrouterTitle || config.appTitle || DEFAULT_APP_TITLE);
    this.openrouterProviderOnly = normalizeOpenRouterProviderSlugs(config.openrouterProviderOnly);
  }

  normalizeOptions(options = {}) {
    const normalized = super.normalizeOptions(options);
    if (this.openrouterProviderOnly.length) {
      normalized.provider = {
        ...(normalized.provider || {}),
        only: [...this.openrouterProviderOnly],
      };
    }
    return normalized;
  }

  getHeaders() {
    const headers = super.getHeaders();
    if (this.openrouterReferer) {
      headers['HTTP-Referer'] = this.openrouterReferer;
    }
    if (this.openrouterTitle) {
      headers['X-OpenRouter-Title'] = this.openrouterTitle;
      headers['X-Title'] = this.openrouterTitle;
    }
    return headers;
  }

  async listModels() {
    try {
      const data = await this.requestJson({
        url: `${this.baseUrl}/models`,
        method: 'GET',
        headers: this.getHeaders(),
      });
      const ids = Array.isArray(data?.data)
        ? data.data.map(model => model?.id)
        : [];
      recordOpenRouterModelCatalog({ baseUrl: this.baseUrl, models: data?.data });
      return uniqueStrings([...OPENROUTER_DEFAULT_MODELS, ...ids]);
    } catch (error) {
      console.warn('Failed to list OpenRouter models, using defaults:', error);
      return [...OPENROUTER_DEFAULT_MODELS];
    }
  }

  async listModelProviders(model = this.model) {
    const modelId = trim(model);
    const slashIndex = modelId.indexOf('/');
    if (slashIndex <= 0 || slashIndex >= modelId.length - 1 || modelId === OPENROUTER_DEFAULT_MODEL) {
      throw new Error('请先选择一个具体的 OpenRouter 模型');
    }
    const author = encodeURIComponent(modelId.slice(0, slashIndex));
    const slug = encodeURIComponent(modelId.slice(slashIndex + 1));
    const data = await this.requestJson({
      url: `${this.baseUrl}/models/${author}/${slug}/endpoints`,
      method: 'GET',
      headers: this.getHeaders(),
    });
    return extractOpenRouterModelProviders(data);
  }

  async prepareProviderFcCapabilities() {
    const cached = readOpenRouterModelCapabilities({
      baseUrl: this.baseUrl,
      model: this.model,
    });
    if (cached.known) return cached;
    if (!this.model || this.model === OPENROUTER_DEFAULT_MODEL) return cached;
    const path = this.model
      .split('/')
      .map(part => encodeURIComponent(part))
      .join('/');
    try {
      const data = await this.requestJson({
        url: `${this.baseUrl}/model/${path}`,
        method: 'GET',
        headers: this.getHeaders(),
      });
      return recordOpenRouterModelCapabilities({ baseUrl: this.baseUrl, model: data?.data }) || cached;
    } catch (error) {
      console.warn('Failed to read OpenRouter model capabilities:', error);
      return cached;
    }
  }
}
