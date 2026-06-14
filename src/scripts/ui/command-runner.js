/**
 * Slash command runner (basic placeholders)
 */

import { logger } from '../utils/logger.js';
import { getCurrentWorldId, setCurrentWorld } from './world-session-runtime-utils.js';
import { buildRpFloorAssignments } from './chat/message-interaction-utils.js';

const RP_HIDE_META_KEY = 'hiddenFromRpPrompt';

const resolveUiMode = (ctx = {}) => {
  const direct = String(ctx?.uiMode || '').trim();
  if (direct) return direct;
  const fromGetter = typeof ctx?.getUiMode === 'function' ? String(ctx.getUiMode() || '').trim() : '';
  if (fromGetter) return fromGetter;
  if (typeof document !== 'undefined') {
    return String(document.body?.dataset?.uiMode || '').trim();
  }
  return '';
};

const isRpMode = (ctx = {}) => resolveUiMode(ctx) === 'rp';

const parseFloorRange = (token, maxFloor) => {
  const upper = Number.isFinite(maxFloor) ? Number(maxFloor) : -1;
  if (upper < 0) return null;
  const raw = String(token || '').trim();
  if (!raw) return { start: upper, end: upper };
  const single = raw.match(/^(\d+)$/);
  if (single) {
    const index = Number(single[1]);
    if (!Number.isFinite(index) || index < 0 || index > upper) return null;
    return { start: index, end: index };
  }
  const range = raw.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!range) return null;
  const start = Number(range[1]);
  const end = Number(range[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end < 0 || start > end || end > upper) return null;
  return { start, end };
};

const getPromptEligibleMessages = (chatStore) => {
  const sessionId = chatStore?.getCurrent?.();
  const messages = chatStore?.getMessages?.(sessionId) || [];
  return messages.filter(msg =>
    msg &&
    msg.status !== 'pending' &&
    msg.status !== 'sending' &&
    (msg.role === 'user' || msg.role === 'assistant')
  );
};

const buildPromptFloorTargets = (messages = []) => {
  const eligible = Array.isArray(messages) ? messages : [];
  const assignments = buildRpFloorAssignments(eligible);
  return eligible
    .map((message, index) => {
      const floor = Number(assignments[index]?.floor);
      if (!Number.isFinite(floor)) return null;
      return { message, floor };
    })
    .filter(Boolean);
};

const setPromptHiddenState = ({ chatStore, ui, reloadCurrentSession }, token, hidden) => {
  const sessionId = String(chatStore?.getCurrent?.() || '').trim();
  if (!sessionId) {
    window.toastr?.warning?.('未找到当前会话');
    return;
  }
  const eligible = getPromptEligibleMessages(chatStore);
  if (!eligible.length) {
    window.toastr?.info?.('当前会话暂无可处理的消息');
    return;
  }
  const floorTargets = buildPromptFloorTargets(eligible);
  const maxFloor = floorTargets.reduce((max, item) => Math.max(max, item.floor), -1);
  const range = parseFloorRange(token, maxFloor);
  if (!range) {
    window.toastr?.warning?.('请使用 /hide、/hide 3 或 /hide 2-5');
    return;
  }
  let changed = 0;
  const targets = floorTargets.filter(item => item.floor >= range.start && item.floor <= range.end);
  for (const { message: target } of targets) {
    if (!target?.id) continue;
    const meta = target.meta && typeof target.meta === 'object' ? { ...target.meta } : {};
    if (Boolean(meta[RP_HIDE_META_KEY]) === hidden) continue;
    meta[RP_HIDE_META_KEY] = hidden;
    chatStore.updateMessage(target.id, { meta }, sessionId);
    changed += 1;
  }
  if (!changed) {
    window.toastr?.info?.(hidden ? '指定消息已处于隐藏状态' : '指定消息未被隐藏');
    return;
  }
  if (typeof reloadCurrentSession === 'function') {
    try { reloadCurrentSession(); } catch {}
  }
  const label = range.start === range.end ? `${range.start}` : `${range.start}-${range.end}`;
  window.toastr?.success?.(
    hidden
      ? `已隐藏楼层 ${label}，后续创意写作提示词将忽略它`
      : `已恢复楼层 ${label} 到创意写作提示词`
  );
};

const runImageCommand = async (ctx = {}, args = []) => {
  const prompt = args.slice(1).join(' ').trim();
  if (!prompt) {
    if (typeof ctx?.prepareImageCommand === 'function') {
      ctx.prepareImageCommand();
    } else {
      ctx?.ui?.setInputText?.('/image ');
    }
    return;
  }
  if (typeof ctx?.generateImage !== 'function') {
    window.toastr?.error?.('图片生成接口未就绪');
    return;
  }
  await ctx.generateImage(prompt);
};

const COMMANDS = {
  '/clear': {
    desc: '清空当前会话',
    run: async ({ chatStore, ui }) => {
      const id = chatStore.getCurrent();
      chatStore.clear(id);
      ui.clearMessages();
      ui.setInputText('');
      window.toastr?.success(`已清空会话：${id}`);
    }
  },
  '/session': {
    desc: '显示会话面板',
    run: async ({ sessionPanel }) => sessionPanel.show()
  },
  '/world': {
    desc: '显示世界书面板',
    run: async ({ worldPanel }) => worldPanel.show()
  },
  '/worldset': {
    desc: '/worldset <id> 设置当前会话的世界书',
    run: async ({ appBridge }, args) => {
      const id = args[1];
      if (!id) {
        window.toastr?.warning('请提供世界书 ID');
        return;
      }
      setCurrentWorld(appBridge, id);
      window.toastr?.success(`已切换世界书：${id}`);
    }
  },
  '/worldlist': {
    desc: '列出已存世界书 ID',
    run: async ({ appBridge }) => {
      const names = appBridge.listWorlds();
      if (!names || !names.length) {
        window.toastr?.info('暂无世界书');
        return;
      }
      alert('世界书列表:\n' + names.join('\n'));
    }
  },
  '/exportworld': {
    desc: '导出当前世界书 JSON 到剪贴簿',
    run: async ({ appBridge }) => {
      const id = getCurrentWorldId(appBridge);
      if (!id) {
        window.toastr?.warning('尚未选择世界书');
        return;
      }
      const data = await appBridge.getWorldInfo(id);
      await navigator.clipboard?.writeText(JSON.stringify(data || {}, null, 2));
      window.toastr?.success(`已复制世界书：${id}`);
    }
  },
  '/export': {
    desc: '导出当前会话 JSON 到剪贴簿',
    run: async ({ chatStore }) => {
      const id = chatStore.getCurrent();
      const data = chatStore.getMessages(id);
      await navigator.clipboard?.writeText(JSON.stringify(data, null, 2));
      window.toastr?.success('已复制当前会话 JSON');
    }
  },
  '/image': {
    desc: '/image <提示词> 生成图片',
    run: runImageCommand,
  },
  '/send': {
    desc: '/send [--no-template] [--no-script] <内容> 发送并可跳过模板/脚本',
    run: async ({ sendMessage }, args) => {
      const flags = new Set();
      let idx = 1;
      while (idx < args.length && String(args[idx]).startsWith('--')) {
        flags.add(String(args[idx]).toLowerCase());
        idx += 1;
      }
      const text = args.slice(idx).join(' ');
      if (!text.trim()) {
        window.toastr?.warning('请输入要发送的内容');
        return;
      }
      if (typeof sendMessage !== 'function') {
        window.toastr?.error('发送接口未就绪');
        return;
      }
      const skipTemplate =
        flags.has('--no-template') || flags.has('--skip-template') || flags.has('--notemplate');
      const skipScripts =
        flags.has('--no-script') || flags.has('--skip-script') || flags.has('--no-scripts') || flags.has('--noscript');
      await sendMessage(text, { skipTemplate, skipScripts });
    }
  },
  '/rename': {
    desc: '/rename 新ID 重命名当前会话',
    run: async ({ chatStore, ui }, args) => {
      const newId = args[1];
      if (!newId) {
        window.toastr?.warning('请提供新 ID，例如 /rename mychat');
        return;
      }
      const old = chatStore.getCurrent();
      if (chatStore.listSessions().includes(newId)) {
        window.toastr?.warning('ID 已存在');
        return;
      }
      chatStore.rename(old, newId);
      ui.setSessionLabel(newId);
      window.dispatchEvent(new CustomEvent('session-changed', { detail: { id: newId } }));
      window.toastr?.success(`会话已重命名为 ${newId}`);
    }
  },
  '/hide': {
    desc: '/hide [楼层或范围] 隐藏楼层，不参与创意写作提示词',
    rpOnly: true,
    run: async (ctx, args) => {
      setPromptHiddenState(ctx, args[1], true);
    }
  },
  '/unhide': {
    desc: '/unhide [楼层或范围] 恢复楼层到创意写作提示词',
    rpOnly: true,
    run: async (ctx, args) => {
      setPromptHiddenState(ctx, args[1], false);
    }
  },
  '/help': {
    desc: '列出可用命令',
    run: async (ctx) => {
      const list = getCommandList(ctx).map(({ key, desc }) => `${key} - ${desc || ''}`).join('\n');
      alert(`可用命令：\n${list}`);
    }
  }
};

export function runCommand(input, ctx) {
  const text = (input || '').trim();
  const parts = text.split(/\s+/);
  const cmdKey = parts[0];
  const cmd = COMMANDS[cmdKey];
  if (!cmd) return false;
  if (cmd?.rpOnly && !isRpMode(ctx)) {
    window.toastr?.info?.('该命令只在创意写作中可用');
    return true;
  }
  const handler = COMMANDS[cmdKey];
  try {
    const result = handler.run(ctx, parts);
    if (result && typeof result.catch === 'function') {
      result.catch(err => {
        logger.error('命令执行失败', err);
        window.toastr?.error('命令执行失败');
      });
    }
  } catch (err) {
    logger.error('命令执行失败', err);
    window.toastr?.error('命令执行失败');
  }
  return true;
}

export function registerCommand(key, desc, runner) {
  COMMANDS[key] = { desc, run: runner };
}

export function getCommandList(ctx = {}) {
  const rpMode = isRpMode(ctx);
  return Object.entries(COMMANDS).map(([key, value]) => ({
    key,
    desc: value?.desc || '',
  })).filter(item => {
    const config = COMMANDS[item.key];
    if (config?.rpOnly && !rpMode) return false;
    return true;
  });
}
