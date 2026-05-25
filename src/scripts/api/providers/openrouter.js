/**
 * OpenRouter API provider.
 * Uses OpenAI-compatible Chat Completions with OpenRouter attribution headers.
 */

import { OpenAIProvider } from './openai.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_DEFAULT_MODEL = 'openrouter/auto';
const OPENROUTER_DEFAULT_MODELS = Object.freeze([
  OPENROUTER_DEFAULT_MODEL,
]);
const DEFAULT_APP_TITLE = 'Tauri Chat App';
const DEFAULT_HTTP_REFERER = 'https://tauri-chat-app.local';

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
      return uniqueStrings([...OPENROUTER_DEFAULT_MODELS, ...ids]);
    } catch (error) {
      console.warn('Failed to list OpenRouter models, using defaults:', error);
      return [...OPENROUTER_DEFAULT_MODELS];
    }
  }
}
