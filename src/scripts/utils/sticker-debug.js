import { stickerPackStore } from '../storage/sticker-pack-store.js';
import { initMediaAssets, resolveMediaAsset } from './media-assets.js';

const formatDebugValue = (value, maxLen = 140) => {
    const raw = String(value || '');
    if (!raw) return '空';
    if (raw.startsWith('data:')) {
        return `data:${raw.slice(0, 24)}...(${raw.length})`;
    }
    if (raw.length > maxLen) return `${raw.slice(0, maxLen)}...`;
    return raw;
};

export const logStickerDebugInfo = async (panel, runId = '') => {
    if (!panel) return;
    const prefix = runId ? `[#${runId}] ` : '';
    panel.log(`${prefix}=== 贴图调试信息 ===`);
    try {
        const mediaState = await initMediaAssets();
        const state = stickerPackStore.getState();
        panel.log(`${prefix}默认贴图可用: ${state.defaultEnabled ? '是' : '否'}`);
        panel.log(`${prefix}自定义贴图包数: ${state.packs.length}`);
        if (mediaState?.baseType) panel.log(`${prefix}media baseType: ${mediaState.baseType}`);
        if (mediaState?.baseDir) panel.log(`${prefix}media baseDir: ${formatDebugValue(mediaState.baseDir, 80)}`);

        const g = typeof globalThis !== 'undefined' ? globalThis : window;
        const convert =
            g?.__TAURI__?.core?.convertFileSrc
            || g?.__TAURI__?.convertFileSrc
            || g?.__TAURI_INTERNALS__?.convertFileSrc;
        panel.log(`${prefix}convertFileSrc: ${typeof convert === 'function' ? 'ok' : 'missing'}`);

        const loadErrors = Array.isArray(g?.__stickerLoadErrors) ? g.__stickerLoadErrors : [];
        if (loadErrors.length) {
            panel.log(`${prefix}贴图加载失败记录: ${loadErrors.length}`);
            loadErrors.slice(-10).forEach((item, idx) => {
                const packLabel = item?.packId ? item.packId.slice(0, 8) : '无';
                const stickerLabel = item?.stickerId ? item.stickerId.slice(0, 8) : '无';
                const keyword = formatDebugValue(item?.keyword || '空', 40);
                const url = formatDebugValue(item?.url || '空', 80);
                panel.log(`${prefix}  ${idx + 1}. pack=${packLabel} sticker=${stickerLabel} key=${keyword} url=${url}`, 'warn');
            });
        } else {
            panel.log(`${prefix}贴图加载失败记录: 无`);
        }

        state.packs.forEach((pack, packIndex) => {
            const packId = String(pack?.id || '');
            const packLabel = packId ? packId.slice(0, 12) : `pack_${packIndex + 1}`;
            panel.log(`${prefix}包 ${packIndex + 1}: id=${packLabel} ai=${pack?.aiEnabled ? 'on' : 'off'} stickers=${pack?.stickers?.length || 0}`);
            (pack.stickers || []).forEach((sticker, idx) => {
                const stickerId = String(sticker?.id || '').trim();
                const keyword = String(sticker?.keyword || '').trim();
                const file = String(sticker?.path || sticker?.dataUrl || '').trim();
                const byId = stickerId ? resolveMediaAsset('sticker', stickerId) : null;
                const byKeyword = keyword ? resolveMediaAsset('sticker', keyword) : null;
                const url = byKeyword?.url || byId?.url || '';
                panel.log(
                    `${prefix}  [${idx + 1}] id=${stickerId.slice(0, 8) || '无'} key=${formatDebugValue(keyword || '空', 40)} file=${formatDebugValue(file, 80)} url=${formatDebugValue(url, 80)}`
                );
            });
        });
    } catch (err) {
        panel.log(`${prefix}贴图调试信息失败: ${err.message}`, 'error');
    }
};
