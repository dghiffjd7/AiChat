/**
 * Ollama Provider（本地推理服务）
 * Uses Ollama's OpenAI-compatible API (default http://127.0.0.1:11434/v1)
 */

import { OpenAIProvider } from './openai.js';

export const OLLAMA_DEFAULT_BASE_URL = 'http://127.0.0.1:11434/v1';

// 云端 ollama.com 必须走 https：http 会被 301 重定向，POST 在重定向中降级为 GET，
// 聊天端点返回 405（而 GET 的模型列表照常成功，极易误判为“不兼容”）。
const upgradeOllamaCloudScheme = (baseUrl = '') => {
  const raw = String(baseUrl || '').trim();
  return /^http:\/\/(www\.)?ollama\.com(\/|$)/i.test(raw)
    ? raw.replace(/^http:/i, 'https:')
    : raw;
};

export class OllamaProvider extends OpenAIProvider {
  constructor(config) {
    super({
      ...config,
      baseUrl: upgradeOllamaCloudScheme(config.baseUrl) || OLLAMA_DEFAULT_BASE_URL,
      // 本地 Ollama 忽略鉴权头；保持 key 可为空
      apiKey: config.apiKey || 'ollama',
    });
  }

  /**
   * 列出本地已 pull 的模型（Ollama 的 /v1/models 返回本地模型清单）
   */
  async listModels() {
    try {
      const data = await this.requestJson({
        url: `${this.baseUrl}/models`,
        method: 'GET',
        headers: this.getHeaders(),
      });
      return (data.data || []).map(m => m.id).filter(Boolean);
    } catch (error) {
      console.warn('Failed to list Ollama models (本地服务未启动或无模型):', error);
      return [];
    }
  }
}
