/**
 * LLM API 客户端 - 统一的接口层
 */

import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { CustomProvider } from './providers/custom.js';
import { GeminiProvider } from './providers/gemini.js';
import { DeepseekProvider } from './providers/deepseek.js';
import { MakersuiteProvider } from './providers/makersuite.js';
import { VertexAIProvider } from './providers/vertexai.js';

const PROVIDER_CLASSES = Object.freeze({
    openai: OpenAIProvider,
    anthropic: AnthropicProvider,
    gemini: GeminiProvider,
    makersuite: MakersuiteProvider,
    vertexai: VertexAIProvider,
    deepseek: DeepseekProvider,
    custom: CustomProvider,
});

export class LLMClient {
    constructor(config) {
        this.config = config;
        this.provider = this.createProvider(config.provider);
    }

    /**
     * 根据配置创建对应的提供商
     */
    createProvider(type) {
        const ProviderClass = PROVIDER_CLASSES[type];
        if (!ProviderClass) {
            throw new Error(`Unknown provider: ${type}. Available: ${Object.keys(PROVIDER_CLASSES).join(', ')}`);
        }

        return new ProviderClass(this.config);
    }

    /**
     * 发送聊天消息（非流式）
     * @param {Array} messages - 消息数组 [{role: 'user', content: '...'}]
     * @param {Object} options - 可选参数（temperature, maxTokens 等）
     * @returns {Promise<string>} AI 回复的文本
     */
    async chat(messages, options = {}) {
        return this.provider.chat(messages, options);
    }

    /**
     * 流式聊天
     * @param {Array} messages - 消息数组
     * @param {Object} options - 可选参数
     * @returns {AsyncGenerator<string>} 逐字符/逐词的文本流
     */
    async *streamChat(messages, options = {}) {
        yield* this.provider.streamChat(messages, options);
    }

    prepareChatRequest(messages, options = {}) {
        if (typeof this.provider?.prepareChatRequest === 'function') {
            return this.provider.prepareChatRequest(messages, options);
        }
        return null;
    }

    /**
     * 获取可用模型列表
     * @returns {Promise<Array<string>>} 模型 ID 列表
     */
    async listModels() {
        return this.provider.listModels();
    }

    /**
     * 健康检查
     * @returns {Promise<{ok: boolean, error?: string}>}
     */
    async healthCheck() {
        return this.provider.healthCheck();
    }

    /**
     * 生成图片（非流式）
     * @param {string} prompt
     * @param {Object} options
     * @returns {Promise<Array<{dataUrl?: string, url?: string, index: number}>>}
     */
    async generateImage(prompt, options = {}) {
        if (typeof this.provider.generateImage !== 'function') {
            throw new Error(`当前 provider 不支持图片生成: ${this.config.provider}`);
        }
        return this.provider.generateImage(prompt, options);
    }

    /**
     * 重新配置客户端
     * @param {Object} newConfig - 新的配置
     */
    reconfigure(newConfig) {
        this.config = newConfig;
        this.provider = this.createProvider(newConfig.provider);
    }
}
