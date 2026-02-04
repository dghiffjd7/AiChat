/**
 * Slash command runner (basic placeholders)
 */

import { logger } from '../utils/logger.js';

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
      appBridge.setCurrentWorld(id);
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
      const id = appBridge.currentWorldId;
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
  '/help': {
    desc: '列出可用命令',
    run: async () => {
      const list = Object.entries(COMMANDS).map(([k, v]) => `${k} - ${v.desc || ''}`).join('\n');
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
  const handler = COMMANDS[cmdKey];
  try {
    handler.run(ctx, parts);
  } catch (err) {
    logger.error('命令执行失败', err);
    window.toastr?.error('命令执行失败');
  }
  return true;
}

export function registerCommand(key, desc, runner) {
  COMMANDS[key] = { desc, run: runner };
}

export function getCommandList() {
  return Object.entries(COMMANDS).map(([key, value]) => ({
    key,
    desc: value?.desc || '',
  }));
}
