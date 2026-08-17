/**
 * Ollama Provider（本地推理服务）
 * Uses Ollama's OpenAI-compatible API (default http://127.0.0.1:11434/v1)
 */

import { OpenAIProvider } from './openai.js';
import {
  invalidateOllamaModelCapabilities,
  readOllamaModelCapabilities,
  recordOllamaModelCapabilities,
} from '../ollama-model-capabilities.js';

export const OLLAMA_DEFAULT_BASE_URL = 'http://127.0.0.1:11434/v1';

// 云端 ollama.com 必须走 https：http 会被 301 重定向，POST 在重定向中降级为 GET，
// 聊天端点返回 405（而 GET 的模型列表照常成功，极易误判为“不兼容”）。
const upgradeOllamaCloudScheme = (baseUrl = '') => {
  const raw = String(baseUrl || '').trim();
  return /^http:\/\/(www\.)?ollama\.com(\/|$)/i.test(raw)
    ? raw.replace(/^http:/i, 'https:')
    : raw;
};

export const resolveOllamaNativeBaseUrl = (baseUrl = '') => {
  const normalized = upgradeOllamaCloudScheme(baseUrl || OLLAMA_DEFAULT_BASE_URL).replace(/\/+$/u, '');
  return normalized.replace(/\/v1$/iu, '');
};

const trim = value => String(value ?? '').trim();

const uniqueStrings = (items = []) => [...new Set(
  (Array.isArray(items) ? items : []).map(trim).filter(Boolean),
)];

export class OllamaProvider extends OpenAIProvider {
  constructor(config = {}) {
    super({
      ...config,
      provider: 'ollama',
      baseUrl: upgradeOllamaCloudScheme(config.baseUrl) || OLLAMA_DEFAULT_BASE_URL,
      // 本地 Ollama 忽略鉴权头；保持 key 可为空
      apiKey: config.apiKey || 'ollama',
    });
  }

  /**
   * 列出可用模型；优先读取带 digest 的原生 tags，兼容失败时回退 /v1/models。
   */
  async listModels() {
    try {
      const data = await this.requestJson({
        url: `${resolveOllamaNativeBaseUrl(this.baseUrl)}/api/tags`,
        method: 'GET',
        headers: this.getHeaders(),
      });
      return uniqueStrings((Array.isArray(data?.models) ? data.models : []).map(model => (
        model?.name || model?.model
      )));
    } catch (error) {
      try {
        const data = await this.requestJson({
          url: `${this.baseUrl}/models`,
          method: 'GET',
          headers: this.getHeaders(),
        });
        return uniqueStrings((Array.isArray(data?.data) ? data.data : []).map(model => model?.id));
      } catch (fallbackError) {
        console.warn('Failed to list Ollama models (本地服务未启动或无模型):', fallbackError);
        return [];
      }
    }
  }

  async prepareProviderFcCapabilities() {
    const cached = readOllamaModelCapabilities({
      baseUrl: this.baseUrl,
      model: this.model,
    });
    const model = trim(this.model);
    if (!model) return cached;
    const nativeBaseUrl = resolveOllamaNativeBaseUrl(this.baseUrl);
    try {
      const versionData = await this.requestJson({
        url: `${nativeBaseUrl}/api/version`,
        method: 'GET',
        headers: this.getHeaders(),
      });
      const serviceVersion = trim(versionData?.version);
      if (!serviceVersion) {
        invalidateOllamaModelCapabilities({ baseUrl: this.baseUrl, model });
        return readOllamaModelCapabilities({ baseUrl: this.baseUrl, model });
      }
      const tagsData = await this.requestJson({
        url: `${nativeBaseUrl}/api/tags`,
        method: 'GET',
        headers: this.getHeaders(),
      });
      const modelEntry = (Array.isArray(tagsData?.models) ? tagsData.models : []).find(item => (
        trim(item?.name || item?.model).toLowerCase() === model.toLowerCase()
      ));
      if (!modelEntry) {
        return recordOllamaModelCapabilities({
          baseUrl: this.baseUrl,
          version: serviceVersion,
          model,
          modelPresent: false,
        }) || cached;
      }
      const showData = await this.requestJson({
        url: `${nativeBaseUrl}/api/show`,
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ model }),
      });
      return recordOllamaModelCapabilities({
        baseUrl: this.baseUrl,
        version: serviceVersion,
        model,
        digest: trim(modelEntry?.digest),
        capabilities: showData?.capabilities,
        modelPresent: true,
      }) || cached;
    } catch (error) {
      console.warn('Failed to read Ollama model capabilities:', error);
      invalidateOllamaModelCapabilities({ baseUrl: this.baseUrl, model });
      return readOllamaModelCapabilities({ baseUrl: this.baseUrl, model });
    }
  }
}
