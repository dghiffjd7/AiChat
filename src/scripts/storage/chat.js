/**
 * 聊天记录存储管理
 */

import { logger } from '../utils/logger.js';

const safeInvoke = async (cmd, args) => {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    const invoker = g?.__TAURI__?.core?.invoke || g?.__TAURI__?.invoke || g?.__TAURI_INVOKE__ || g?.__TAURI_INTERNALS__?.invoke;
    if (typeof invoker === 'function') return invoker(cmd, args);
    return null;
};

export class ChatStorage {
    /**
     * 保存聊天消息
     * @param {string} characterId - 角色 ID
     * @param {Array} messages - 消息数组
     */
    async saveMessages(characterId, messages) {
        try {
            const cid = String(characterId || '').trim();
            await safeInvoke('save_chat_history', {
                character_id: cid,
                characterId: cid,
                messages: messages.map(msg => ({
                    character_id: cid,
                    characterId: cid,
                    ...msg,
                    timestamp: msg.timestamp || Date.now()
                }))
            });
            logger.debug(`保存了 ${messages.length} 条消息到角色 ${cid}`);
        } catch (error) {
            logger.error('保存聊天记录失败:', error);
            throw error;
        }
    }

    /**
     * 获取聊天历史
     * @param {string} characterId - 角色 ID
     * @param {number} limit - 限制数量
     * @returns {Promise<Array>} 消息数组
     */
    async getMessages(characterId, limit = 100) {
        try {
            const cid = String(characterId || '').trim();
            const messages = await safeInvoke('get_chat_history', {
                character_id: cid,
                characterId: cid,
                limit
            });
            logger.debug(`加载了 ${messages.length} 条消息从角色 ${characterId}`);
            return messages.reverse(); // 按时间正序排列
        } catch (error) {
            logger.error('加载聊天记录失败:', error);
            return [];
        }
    }

    /**
     * 清除聊天历史
     * @param {string} characterId - 角色 ID
     */
    async clearMessages(characterId) {
        try {
            const cid = String(characterId || '').trim();
            await safeInvoke('clear_chat_history', { character_id: cid, characterId: cid });
            logger.info(`清除了角色 ${characterId} 的聊天记录`);
        } catch (error) {
            logger.error('清除聊天记录失败:', error);
            throw error;
        }
    }

    /**
     * 获取最近对话的角色列表
     * @returns {Promise<Array<string>>} 角色 ID 列表
     */
    async getRecentCharacters() {
        // 这需要在后端添加对应的命令
        // 暂时返回空数组
        return [];
    }
}
