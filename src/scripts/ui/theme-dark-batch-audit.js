import {
  colorToString,
  formatDarkThemeAuditReport,
  runDarkThemeDomAudit,
} from './theme-dark-audit.js';

const STATUS_LABELS = {
  audited: '已审计',
  skipped: '跳过',
  error: '失败',
};

const STATUS_COLORS = {
  audited: {
    bg: 'rgba(16,185,129,0.16)',
    border: 'rgba(16,185,129,0.35)',
    text: '#bbf7d0',
  },
  skipped: {
    bg: 'rgba(148,163,184,0.14)',
    border: 'rgba(148,163,184,0.28)',
    text: '#cbd5e1',
  },
  error: {
    bg: 'rgba(239,68,68,0.16)',
    border: 'rgba(239,68,68,0.35)',
    text: '#fecaca',
  },
};

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const nextFrame = () => new Promise((resolve) => {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => resolve());
    return;
  }
  setTimeout(resolve, 16);
});

const settle = async (frames = 2, pauseMs = 50) => {
  for (let i = 0; i < frames; i += 1) {
    await nextFrame();
  }
  if (pauseMs > 0) await wait(pauseMs);
};

const normalizeId = (value = '') => String(value || '').trim();

const isElementNode = (value) => typeof Element !== 'undefined' && value instanceof Element;

const isVisibleElement = (element) => {
  if (!isElementNode(element)) return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  if (Number(style.opacity || 1) <= 0.02) return false;
  if (element.hasAttribute('hidden')) return false;
  const rect = element.getBoundingClientRect();
  return Number.isFinite(rect.width) && Number.isFinite(rect.height) && rect.width >= 2 && rect.height >= 2;
};

const getRegistry = () => {
  const registry = window.appBridge?.debugUiRegistry;
  if (!registry || typeof registry !== 'object') return null;
  return registry;
};

const pickVisibleElement = (...candidates) => {
  const list = candidates.flat().filter(isElementNode);
  return list.find((item) => isVisibleElement(item)) || list[0] || null;
};

const getCurrentPage = () => normalizeId(document.querySelector('.bottom-nav .nav-btn.active')?.dataset?.page || '');

const isChatRoomActive = () => document.body?.classList.contains('chat-room-active') === true;

const getContactName = (ctx, sessionId = '') => {
  const sid = normalizeId(sessionId);
  if (!sid) return '';
  return String(ctx.stores.contactsStore?.getContact?.(sid)?.name || sid);
};

const getSessionCandidates = (ctx) => {
  const chatStoreIds = Array.isArray(ctx.stores.chatStore?.listSessions?.()) ? ctx.stores.chatStore.listSessions() : [];
  const contactIds = Array.isArray(ctx.stores.contactsStore?.listContacts?.())
    ? ctx.stores.contactsStore.listContacts().map((item) => normalizeId(item?.id))
    : [];
  return [...new Set([...chatStoreIds, ...contactIds].filter(Boolean))];
};

const buildSessionContext = (ctx) => {
  const ids = getSessionCandidates(ctx);
  const current = normalizeId(ctx.stores.chatStore?.getCurrent?.());
  const privateSessionId = ids.find((sid) => sid && !sid.startsWith('group:') && !sid.startsWith('rp:'))
    || (current && !current.startsWith('group:') && !current.startsWith('rp:') ? current : '');
  const groupSessionId = ids.find((sid) => sid.startsWith('group:') || ctx.stores.contactsStore?.getContact?.(sid)?.isGroup) || '';
  const rpSessionId = ids.find((sid) => sid.startsWith('rp:')) || '';
  return {
    current,
    privateSessionId,
    groupSessionId,
    rpSessionId,
  };
};

const getActiveUserId = (ctx) => normalizeId(
  ctx.stores.userStore?.getActive?.()?.id
  || ctx.stores.userStore?.getAll?.()?.[0]?.id,
);

const getActivePersonaId = (ctx) => normalizeId(
  ctx.stores.personaStore?.getActive?.()?.id
  || ctx.stores.personaStore?.getAll?.()?.[0]?.id,
);

const getFirstGroupId = (ctx) => normalizeId(
  ctx.sessionIds.groupSessionId
  || ctx.stores.groupStore?.listGroups?.()?.[0]?.id,
);

const setActiveSession = async (ctx, sessionId = '') => {
  const sid = normalizeId(sessionId);
  if (!sid) return false;
  ctx.stores.chatStore?.switchSession?.(sid);
  try {
    window.appBridge?.setActiveSession?.(sid);
  } catch {}
  await settle();
  return true;
};

const makeWorldAuditData = () => ({
  name: '主题审计示例世界书',
  entries: [
    {
      id: 'audit_entry_1',
      comment: '主题审计示例条目',
      key: ['主题审计', 'audit'],
      content: '用于批量主题审计的示例世界书内容。',
      enabled: true,
      probability: 100,
      depth: 4,
      position: 4,
      order: 100,
      secondary_keys: [],
    },
  ],
});

const ensureMemoryTemplateRecord = async (ctx) => {
  if (ctx.cache.memoryTemplateRecord) return ctx.cache.memoryTemplateRecord;
  const list = await ctx.stores.memoryTemplateStore?.getTemplates?.({}).catch?.(() => []) || [];
  const record = Array.isArray(list) ? list[0] || null : null;
  ctx.cache.memoryTemplateRecord = record;
  return record;
};

const ensureWorldEditorState = async (ctx) => {
  const editor = ctx.panels.worldPanel?.editor;
  if (!editor) return null;
  await editor.show('主题审计示例世界书', makeWorldAuditData());
  await settle(3, 80);
  const entry = Array.isArray(editor.data?.entries) ? editor.data.entries[0] || null : null;
  const blocks = entry && typeof editor.ensureEntryPromptBlocks === 'function'
    ? editor.ensureEntryPromptBlocks(entry)
    : [];
  const blockId = normalizeId(blocks?.[0]?.id);
  return { editor, entry, blocks, blockId };
};

const getSceneRoot = (scene, ctx) => {
  const resolved = typeof scene.getRoot === 'function' ? scene.getRoot(ctx) : scene.getRoot;
  if (Array.isArray(resolved)) return pickVisibleElement(resolved);
  if (isElementNode(resolved)) return resolved;
  return null;
};

const getScrollableTargets = (root) => {
  const list = [];
  const pushIfScrollable = (element) => {
    if (!element) return;
    const target = element === document.body ? document.scrollingElement : element;
    if (!target) return;
    if (list.includes(target)) return;
    if (target === document.scrollingElement) {
      const max = Math.max(
        (document.documentElement?.scrollHeight || 0) - (window.innerHeight || 0),
        (document.body?.scrollHeight || 0) - (window.innerHeight || 0),
      );
      if (max > 80) list.push(target);
      return;
    }
    if (!isVisibleElement(target)) return;
    const style = window.getComputedStyle(target);
    const overflowY = `${style.overflowY || ''} ${style.overflow || ''}`;
    const canScroll = /(auto|scroll|overlay)/i.test(overflowY);
    if (!canScroll) return;
    if ((target.scrollHeight || 0) - (target.clientHeight || 0) <= 80) return;
    list.push(target);
  };

  pushIfScrollable(root);
  if (root === document.body || root === document.documentElement) {
    pushIfScrollable(document.scrollingElement || document.documentElement);
  }
  root?.querySelectorAll?.('*')?.forEach?.((node) => pushIfScrollable(node));
  return list
    .sort((a, b) => (((b.scrollHeight || 0) - (b.clientHeight || 0)) * (b.clientWidth || 0))
      - (((a.scrollHeight || 0) - (a.clientHeight || 0)) * (a.clientWidth || 0)))
    .slice(0, 4);
};

const getScrollTop = (target) => {
  if (!target) return 0;
  if (target === document.scrollingElement || target === document.documentElement || target === document.body) {
    return Number(window.scrollY || document.documentElement?.scrollTop || document.body?.scrollTop || 0);
  }
  return Number(target.scrollTop || 0);
};

const setScrollTop = (target, value) => {
  const next = Math.max(0, Math.round(Number(value) || 0));
  if (!target) return;
  if (target === document.scrollingElement || target === document.documentElement || target === document.body) {
    window.scrollTo({ top: next, left: Number(window.scrollX || 0), behavior: 'auto' });
    return;
  }
  target.scrollTop = next;
};

const getScrollPositions = (target) => {
  const maxScroll = target === document.scrollingElement || target === document.documentElement || target === document.body
    ? Math.max(
      (document.documentElement?.scrollHeight || 0) - (window.innerHeight || 0),
      (document.body?.scrollHeight || 0) - (window.innerHeight || 0),
    )
    : Math.max(0, (target.scrollHeight || 0) - (target.clientHeight || 0));
  if (maxScroll <= 80) return [0];
  return [...new Set([0, Math.round(maxScroll / 2), maxScroll])];
};

const makeIssueKey = (issue = {}) => [
  issue.category || '',
  issue.descriptor || '',
  issue.textSnippet || '',
  colorToString(issue.background),
  colorToString(issue.foreground),
  colorToString(issue.ownSurface),
].join('|');

const summarizeIssues = (issues = []) => {
  const byCategory = {};
  for (const issue of Array.isArray(issues) ? issues : []) {
    const key = String(issue?.category || 'unknown');
    byCategory[key] = (byCategory[key] || 0) + 1;
  }
  return {
    total: Array.isArray(issues) ? issues.length : 0,
    byCategory,
  };
};

const mergeReports = (reports = [], { issueLimit = 360 } = {}) => {
  const out = {
    mode: String(reports[0]?.mode || document.body?.dataset?.themeMode || 'unknown'),
    issueLimit,
    scannedElements: 0,
    issues: [],
    truncated: false,
    summary: { total: 0, byCategory: {} },
    generatedAt: new Date().toISOString(),
    message: '',
    passes: reports.length,
  };
  const seen = new Set();
  for (const report of reports) {
    if (!report || typeof report !== 'object') continue;
    out.scannedElements += Number(report.scannedElements || 0);
    out.truncated = out.truncated || report.truncated === true;
    if (!out.message && report.message) out.message = String(report.message);
    for (const issue of Array.isArray(report.issues) ? report.issues : []) {
      if (out.issues.length >= issueLimit) {
        out.truncated = true;
        break;
      }
      const key = makeIssueKey(issue);
      if (seen.has(key)) continue;
      seen.add(key);
      out.issues.push(issue);
    }
    if (out.issues.length >= issueLimit) break;
  }
  out.summary = summarizeIssues(out.issues);
  if (!out.summary.total && !out.message) {
    out.message = '当前场景没有发现明显的白底或低对比元素。';
  }
  return out;
};

const auditRootAcrossScrollPasses = async (root, { issueLimitPerPass = 160, sceneIssueLimit = 360 } = {}) => {
  const reports = [];
  const scrollTargets = getScrollableTargets(root);
  const originals = new Map(scrollTargets.map((target) => [target, getScrollTop(target)]));
  try {
    reports.push(runDarkThemeDomAudit({ root, issueLimit: issueLimitPerPass }));
    for (const target of scrollTargets) {
      const positions = getScrollPositions(target).filter((value) => value > 0);
      for (const position of positions) {
        setScrollTop(target, position);
        await settle(2, 70);
        reports.push(runDarkThemeDomAudit({ root, issueLimit: issueLimitPerPass }));
      }
      setScrollTop(target, originals.get(target) || 0);
      await settle(1, 20);
    }
  } finally {
    originals.forEach((value, target) => setScrollTop(target, value));
  }
  return mergeReports(reports, { issueLimit: sceneIssueLimit });
};

const createScene = (id, title, options = {}) => ({
  id,
  title,
  ...options,
});

const buildScenes = (ctx) => {
  const scenes = [];
  const { panels, actions, sessionIds } = ctx;
  const privateSid = normalizeId(sessionIds.privateSessionId);
  const groupSid = normalizeId(sessionIds.groupSessionId);
  const rpSid = normalizeId(sessionIds.rpSessionId);
  const groupId = getFirstGroupId(ctx);
  const userId = getActiveUserId(ctx);
  const personaId = getActivePersonaId(ctx);

  if (actions.switchPage) {
    scenes.push(
      createScene('page-chat-list', '聊天列表页面', {
        open: async () => {
          actions.exitChatRoom?.();
          actions.switchPage('chat');
          await settle(3, 80);
        },
        getRoot: () => document.body,
      }),
      createScene('page-contacts', '联系人页面', {
        open: async () => {
          actions.exitChatRoom?.();
          actions.switchPage('contacts');
          await settle(3, 80);
        },
        getRoot: () => document.body,
      }),
      createScene('page-moments', '动态页面', {
        open: async () => {
          actions.exitChatRoom?.();
          actions.switchPage('moments');
          await settle(3, 80);
        },
        getRoot: () => document.body,
      }),
    );
  }

  if (actions.enterChatRoom && privateSid) {
    scenes.push(createScene('room-private', `私聊聊天室`, {
      open: async () => {
        await actions.enterChatRoom(privateSid, getContactName(ctx, privateSid), 'chat', { suppressInitialAutoScroll: true });
        await settle(4, 100);
      },
      getRoot: () => document.body,
    }));
  }

  if (actions.enterChatRoom && groupSid) {
    scenes.push(createScene('room-group', '群聊聊天室', {
      open: async () => {
        await actions.enterChatRoom(groupSid, getContactName(ctx, groupSid), 'chat', { suppressInitialAutoScroll: true });
        await settle(4, 100);
      },
      getRoot: () => document.body,
    }));
  }

  if (actions.enterChatRoom && rpSid) {
    scenes.push(createScene('room-rp', 'RP 聊天室', {
      open: async () => {
        await actions.enterChatRoom(rpSid, getContactName(ctx, rpSid), 'chat', { suppressInitialAutoScroll: true });
        await settle(4, 100);
      },
      getRoot: () => document.body,
    }));
  }

  if (panels.generalSettingsPanel) {
    scenes.push(createScene('general-settings', '通用设定', {
      open: async () => {
        await panels.generalSettingsPanel.show?.();
        await settle(3, 80);
      },
      getRoot: () => pickVisibleElement(panels.generalSettingsPanel.element),
    }));
  }

  if (panels.configPanel) {
    scenes.push(
      createScene('config-chat', '连线设定: 聊天模型', {
        open: async () => {
          await panels.configPanel.show?.({ tab: 'chat' });
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.configPanel.element),
      }),
      createScene('config-image', '连线设定: 图片模型', {
        open: async () => {
          await panels.configPanel.show?.({ tab: 'image' });
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.configPanel.element),
      }),
    );
  }

  if (panels.sessionPanel) {
    scenes.push(createScene('session-panel', '新建私聊面板', {
      open: async () => {
        await panels.sessionPanel.show?.();
        await settle(3, 80);
      },
      getRoot: () => pickVisibleElement(panels.sessionPanel.panel),
    }));
  }

  if (panels.extensionsPanel) {
    scenes.push(createScene('extensions-panel', '扩展面板', {
      open: async () => {
        await panels.extensionsPanel.show?.();
        await settle(3, 80);
      },
      getRoot: () => pickVisibleElement(panels.extensionsPanel.element),
    }));
  }

  if (panels.presetPanel) {
    scenes.push(
      createScene('preset-panel', '预设面板', {
        open: async () => {
          await panels.presetPanel.show?.();
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.presetPanel.element),
      }),
      createScene('preset-bindings', '预设绑定页', {
        open: async () => {
          await panels.presetPanel.show?.();
          panels.presetPanel.openBindingsPage?.('openai');
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.presetPanel.element),
      }),
    );
  }

  if (panels.regexPanel) {
    scenes.push(createScene('regex-global', '全局正则面板', {
      open: async () => {
        await panels.regexPanel.show?.();
        await settle(3, 80);
      },
      getRoot: () => pickVisibleElement(panels.regexPanel.element),
    }));
  }

  if (panels.scriptPanel) {
    scenes.push(createScene('script-panel', '脚本管理', {
      open: async () => {
        await panels.scriptPanel.show?.();
        await settle(3, 80);
      },
      getRoot: () => pickVisibleElement(panels.scriptPanel.panel),
    }));
  }

  if (panels.pluginPanel) {
    scenes.push(
      createScene('plugin-panel', '插件面板', {
        open: async () => {
          await panels.pluginPanel.show?.();
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.pluginPanel.element),
      }),
      createScene('plugin-ui-manager', '插件 UI 注入管理', {
        open: async () => {
          await panels.pluginPanel.show?.();
          panels.pluginPanel.showUiManager?.();
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.pluginPanel.uiManagePanel),
      }),
    );
  }

  if (panels.memoryTemplatePanel) {
    scenes.push(createScene('memory-template-panel', '记忆模板面板', {
      open: async () => {
        await panels.memoryTemplatePanel.show?.();
        await settle(3, 80);
      },
      getRoot: () => pickVisibleElement(panels.memoryTemplatePanel.panel),
    }));
    scenes.push(createScene('memory-template-editor', '记忆模板结构编辑', {
      open: async () => {
        const record = await ensureMemoryTemplateRecord(ctx);
        if (!record) throw new Error('没有可用的记忆模板');
        await panels.memoryTemplatePanel.show?.();
        panels.memoryTemplatePanel.openTemplateEditor?.(record);
        await settle(3, 80);
      },
      getRoot: () => pickVisibleElement(panels.memoryTemplatePanel.templateEditorPanel),
    }));
  }

  if (panels.momentSummaryPanel) {
    scenes.push(createScene('moment-summary-panel', '动态摘要面板', {
      open: async () => {
        panels.momentSummaryPanel.show?.();
        await settle(3, 80);
      },
      getRoot: () => pickVisibleElement(panels.momentSummaryPanel.panel),
    }));
  }

  if (panels.groupCreatePanel) {
    scenes.push(createScene('group-create-panel', '创建群聊面板', {
      open: async () => {
        panels.groupCreatePanel.show?.();
        await settle(3, 80);
      },
      getRoot: () => pickVisibleElement(panels.groupCreatePanel.panel),
    }));
  }

  if (panels.groupPanel) {
    scenes.push(createScene('group-panel', '分组管理面板', {
      open: async () => {
        panels.groupPanel.show?.();
        await settle(3, 80);
      },
      getRoot: () => pickVisibleElement(panels.groupPanel.panel),
    }));
    if (groupId) {
      scenes.push(createScene('group-parent-picker', '分组上级选择器', {
        open: async () => {
          panels.groupPanel.show?.();
          panels.groupPanel.openParentPicker?.(groupId);
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.groupPanel.parentPickerPanel),
      }));
    }
  }

  if (panels.userPanel) {
    scenes.push(
      createScene('user-panel', '用户管理面板', {
        open: async () => {
          await panels.userPanel.show?.();
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.userPanel.panel),
      }),
      createScene('user-edit', '用户编辑页', {
        open: async () => {
          await panels.userPanel.show?.();
          panels.userPanel.openEdit?.(userId || null);
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.userPanel.panel?.querySelector?.('#user-edit-view'), panels.userPanel.panel),
      }),
    );
    if (userId) {
      scenes.push(createScene('user-binding', '用户绑定页', {
        open: async () => {
          await panels.userPanel.show?.();
          panels.userPanel.openBindingModal?.(userId);
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.userPanel.bindingModal?.panel),
      }));
    }
  }

  if (panels.personaPanel) {
    scenes.push(
      createScene('persona-panel', '角色卡管理面板', {
        open: async () => {
          await panels.personaPanel.show?.();
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.personaPanel.panel),
      }),
      createScene('persona-edit', '角色卡编辑页', {
        open: async () => {
          await panels.personaPanel.show?.();
          panels.personaPanel.openEdit?.(personaId || null);
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.personaPanel.panel?.querySelector?.('#persona-edit-view'), panels.personaPanel.panel),
      }),
      createScene('persona-import', '角色卡导入页', {
        open: async () => {
          await panels.personaPanel.show?.();
          panels.personaPanel.showImportModal?.();
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.personaPanel.importModal),
      }),
    );
    if (personaId) {
      scenes.push(createScene('persona-bulk', '角色卡批量绑定页', {
        open: async () => {
          await panels.personaPanel.show?.();
          panels.personaPanel.openBulkModal?.(personaId);
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.personaPanel.bulkModal?.panel),
      }));
    }
  }

  if (panels.contactSettingsPanel && privateSid) {
    scenes.push(
      createScene('contact-settings-private', '私聊设置', {
        open: async () => {
          await setActiveSession(ctx, privateSid);
          panels.contactSettingsPanel.show?.();
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.contactSettingsPanel.panel),
      }),
      createScene('contact-settings-private-memory', '私聊设置: 记忆共享', {
        open: async () => {
          await setActiveSession(ctx, privateSid);
          panels.contactSettingsPanel.show?.();
          await panels.contactSettingsPanel.openMemoryShareManager?.();
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.contactSettingsPanel.memorySharePanel),
      }),
    );
  }

  if (panels.contactSettingsPanel && rpSid) {
    scenes.push(createScene('contact-settings-rp', 'RP 设置', {
      open: async () => {
        await setActiveSession(ctx, rpSid);
        panels.contactSettingsPanel.show?.();
        await settle(3, 80);
      },
      getRoot: () => pickVisibleElement(panels.contactSettingsPanel.panel),
    }));
  }

  if (panels.groupSettingsPanel && groupSid) {
    scenes.push(
      createScene('group-settings', '群聊设置', {
        open: async () => {
          panels.groupSettingsPanel.show?.(groupSid);
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.groupSettingsPanel.panel),
      }),
      createScene('group-settings-add-members', '群聊设置: 添加成员', {
        open: async () => {
          panels.groupSettingsPanel.show?.(groupSid);
          panels.groupSettingsPanel.openAddMembers?.();
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.groupSettingsPanel.addPanel),
      }),
      createScene('group-settings-memory', '群聊设置: 记忆共享', {
        open: async () => {
          panels.groupSettingsPanel.show?.(groupSid);
          await panels.groupSettingsPanel.openMemoryShareManager?.();
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.groupSettingsPanel.memorySharePanel),
      }),
    );
  }

  if (panels.regexSessionPanel && privateSid) {
    scenes.push(createScene('regex-session', '聊天室正则', {
      open: async () => {
        await setActiveSession(ctx, privateSid);
        await panels.regexSessionPanel.show?.();
        await settle(3, 80);
      },
      getRoot: () => pickVisibleElement(panels.regexSessionPanel.element),
    }));
  }

  if (panels.variablePanel && privateSid) {
    scenes.push(
      createScene('variable-panel', '变量管理器', {
        open: async () => {
          await setActiveSession(ctx, privateSid);
          panels.variablePanel.show?.();
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.variablePanel.panel),
      }),
      createScene('variable-rules', '变量规则面板', {
        open: async () => {
          await setActiveSession(ctx, privateSid);
          panels.variablePanel.show?.();
          panels.variablePanel.showRules?.();
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.variablePanel.rulePanel),
      }),
      createScene('variable-rule-editor', '变量规则编辑器', {
        open: async () => {
          await setActiveSession(ctx, privateSid);
          panels.variablePanel.show?.();
          panels.variablePanel.showRuleEditor?.({
            id: 'audit_rule',
            name: '主题审计规则',
            enabled: true,
            trigger: { type: 'manual' },
            action: { type: 'notify', message: 'theme-audit' },
          });
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.variablePanel.ruleEditorPanel),
      }),
      createScene('variable-templates', '变量模板面板', {
        open: async () => {
          await setActiveSession(ctx, privateSid);
          panels.variablePanel.show?.();
          panels.variablePanel.showTemplateModal?.();
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.variablePanel.templatePanel),
      }),
      createScene('variable-import', '变量导入面板', {
        open: async () => {
          await setActiveSession(ctx, privateSid);
          panels.variablePanel.show?.();
          panels.variablePanel.showImportModal?.();
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.variablePanel.dataPanel),
      }),
      createScene('variable-schema', '变量编辑面板', {
        open: async () => {
          await setActiveSession(ctx, privateSid);
          panels.variablePanel.show?.();
          panels.variablePanel.showSchemaModal?.({ mode: 'create' });
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.variablePanel.schemaPanel),
      }),
    );
  }

  if (actions.openChatSettings && privateSid) {
    scenes.push(createScene('chat-settings', '聊天设置', {
      open: async () => {
        await setActiveSession(ctx, privateSid);
        actions.openChatSettings();
        await settle(3, 80);
      },
      getRoot: () => pickVisibleElement(document.getElementById('chat-settings-modal')),
    }));
  }

  if (panels.stickerPicker) {
    scenes.push(createScene('sticker-picker', '贴图选择器', {
      open: async () => {
        panels.stickerPicker.show?.();
        await settle(3, 80);
      },
      getRoot: () => pickVisibleElement(panels.stickerPicker.panel),
    }));
  }

  if (panels.worldPanel && privateSid) {
    scenes.push(
      createScene('world-panel-private', '世界书管理: 私聊', {
        open: async () => {
          await setActiveSession(ctx, privateSid);
          await panels.worldPanel.show?.({ scope: 'session' });
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.worldPanel.panel),
      }),
      createScene('world-library-private', '世界书书库: 私聊', {
        open: async () => {
          await setActiveSession(ctx, privateSid);
          await panels.worldPanel.show?.({ scope: 'session' });
          panels.worldPanel.openLibraryModal?.({ type: 'session_extra', sessionId: privateSid });
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.worldPanel.libraryModal),
      }),
    );
  }

  if (panels.worldPanel && groupSid) {
    scenes.push(createScene('world-panel-group', '世界书管理: 群聊', {
      open: async () => {
        await setActiveSession(ctx, groupSid);
        await panels.worldPanel.show?.({ scope: 'session' });
        await settle(3, 80);
      },
      getRoot: () => pickVisibleElement(panels.worldPanel.panel),
    }));
  }

  if (panels.worldPanel) {
    scenes.push(
      createScene('world-panel-global', '世界书管理: 全局', {
        open: async () => {
          await panels.worldPanel.show?.({ scope: 'global' });
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.worldPanel.panel),
      }),
      createScene('world-library-global', '世界书书库: 全局', {
        open: async () => {
          await panels.worldPanel.show?.({ scope: 'global' });
          panels.worldPanel.openLibraryModal?.({ type: 'global' });
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.worldPanel.libraryModal),
      }),
      createScene('world-editor-main', '世界书编辑器', {
        open: async () => {
          const state = await ensureWorldEditorState(ctx);
          if (!state) throw new Error('世界书编辑器不可用');
        },
        getRoot: () => pickVisibleElement(panels.worldPanel.editor?.modal),
      }),
      createScene('world-editor-manage', '世界书编辑器: 分页管理', {
        open: async () => {
          const state = await ensureWorldEditorState(ctx);
          if (!state) throw new Error('世界书编辑器不可用');
          state.editor.showManageModal?.();
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.worldPanel.editor?.manageModal),
      }),
      createScene('world-editor-ai', '世界书编辑器: AI 生成', {
        open: async () => {
          const state = await ensureWorldEditorState(ctx);
          if (!state?.entry) throw new Error('世界书示例条目不可用');
          state.editor.showAiModal?.(state.entry);
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.worldPanel.editor?.aiModal),
      }),
      createScene('world-editor-condition', '世界书编辑器: 条件编辑', {
        open: async () => {
          const state = await ensureWorldEditorState(ctx);
          if (!state?.blockId) throw new Error('世界书示例 block 不存在');
          state.editor.openBlockConditionEditor?.(state.blockId);
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.worldPanel.editor?.modal),
      }),
      createScene('world-editor-node', '世界书编辑器: 节点编辑', {
        open: async () => {
          const state = await ensureWorldEditorState(ctx);
          if (!state?.blockId) throw new Error('世界书示例 block 不存在');
          state.editor.openBlockNodeEditor?.(state.blockId, []);
          await settle(3, 80);
        },
        getRoot: () => pickVisibleElement(panels.worldPanel.editor?.modal),
      }),
    );
  }

  if (actions.showRawReplyModal) {
    scenes.push(createScene('raw-reply-modal', '原始回复面板', {
      open: async () => {
        actions.showRawReplyModal('theme audit raw reply', '批量主题审计');
        await settle(3, 80);
      },
      getRoot: () => pickVisibleElement(document.getElementById('raw-reply-panel')),
    }));
  }

  if (actions.showPromptPreviewModal) {
    scenes.push(createScene('prompt-preview-modal', 'Prompt 预览面板', {
      open: async () => {
        actions.showPromptPreviewModal('theme audit prompt preview', '批量主题审计');
        await settle(3, 80);
      },
      getRoot: () => pickVisibleElement(document.getElementById('prompt-preview-panel')),
    }));
  }

  if (actions.showWorldDebugLocatorModal) {
    scenes.push(createScene('world-debug-locator-modal', '世界书定位面板', {
      open: async () => {
        actions.showWorldDebugLocatorModal([
          {
            title: '主题审计示例条目',
            sourceKindLabel: '会话',
            worldId: 'audit-world',
            entryId: 'audit-entry',
            blockId: 'legacy',
            sectionLabel: '命中记录',
            positionLabel: '默认 Prompt',
            role: 'system',
          },
        ], { meta: '批量主题审计' });
        await settle(3, 80);
      },
      getRoot: () => pickVisibleElement(document.getElementById('world-debug-locator-panel')),
    }));
  }

  return scenes;
};

const closeAllUi = async (ctx) => {
  const { panels, actions } = ctx;
  try { actions.hideMenus?.(); } catch {}
  try { actions.closeChatSettings?.(); } catch {}
  try { actions.hideRawReplyModal?.(); } catch {}
  try { actions.hidePromptPreviewModal?.(); } catch {}
  try { actions.hideWorldDebugLocatorModal?.(); } catch {}
  try { actions.exitChatRoom?.(); } catch {}
  try { panels.generalSettingsPanel?.hide?.(); } catch {}
  try { panels.configPanel?.hide?.(); } catch {}
  try { panels.sessionPanel?.hide?.(); } catch {}
  try { panels.extensionsPanel?.hide?.(); } catch {}
  try { panels.presetPanel?.hide?.(); } catch {}
  try { panels.regexPanel?.hide?.(); } catch {}
  try { panels.scriptPanel?.hide?.(); } catch {}
  try { panels.pluginPanel?.hideUiManager?.(); } catch {}
  try { panels.pluginPanel?.hide?.(); } catch {}
  try { panels.memoryTemplatePanel?.closeTemplateEditor?.(); } catch {}
  try { panels.memoryTemplatePanel?.hide?.(); } catch {}
  try { panels.momentSummaryPanel?.hide?.(); } catch {}
  try { panels.groupCreatePanel?.hide?.(); } catch {}
  try { panels.groupPanel?.closeParentPicker?.(); } catch {}
  try { panels.groupPanel?.hide?.(); } catch {}
  try { panels.userPanel?.hideBindingModal?.(); } catch {}
  try { panels.userPanel?.hide?.(); } catch {}
  try { panels.personaPanel?.hideBulkModal?.(); } catch {}
  try { panels.personaPanel?.hideImportModal?.(); } catch {}
  try { panels.personaPanel?.hide?.(); } catch {}
  try { panels.contactSettingsPanel?.closeMemoryShareManager?.(); } catch {}
  try { panels.contactSettingsPanel?.hide?.(); } catch {}
  try { panels.groupSettingsPanel?.closeAddModal?.(); } catch {}
  try { panels.groupSettingsPanel?.closeMemoryShareManager?.(); } catch {}
  try { panels.groupSettingsPanel?.hide?.(); } catch {}
  try { panels.regexSessionPanel?.hide?.(); } catch {}
  try { panels.variablePanel?.hideSchemaModal?.(); } catch {}
  try { panels.variablePanel?.hideRuleEditor?.(); } catch {}
  try { panels.variablePanel?.hideRules?.(); } catch {}
  try { panels.variablePanel?.hideTemplateModal?.(); } catch {}
  try { panels.variablePanel?.hideDataModal?.(); } catch {}
  try { panels.variablePanel?.hide?.(); } catch {}
  try { panels.stickerPicker?.hide?.(); } catch {}
  try { panels.worldPanel?.editor?.hideAiModal?.(); } catch {}
  try { panels.worldPanel?.editor?.hideManageModal?.(); } catch {}
  try { panels.worldPanel?.editor?.hide?.(); } catch {}
  try { panels.worldPanel?.libraryOverlay?.classList?.remove?.('is-active'); } catch {}
  try { panels.worldPanel?.hide?.(); } catch {}
  await settle(2, 60);
};

const captureUiState = (ctx) => ({
  sessionId: normalizeId(ctx.stores.chatStore?.getCurrent?.()),
  activePage: getCurrentPage(),
  inChatRoom: isChatRoomActive(),
});

const restoreUiState = async (ctx, state = {}) => {
  await closeAllUi(ctx);
  if (state.inChatRoom && state.sessionId && ctx.actions.enterChatRoom) {
    await ctx.actions.enterChatRoom(
      state.sessionId,
      getContactName(ctx, state.sessionId),
      state.activePage || 'chat',
      { suppressInitialAutoScroll: true },
    );
    await settle(3, 80);
    return;
  }
  if (state.activePage && ctx.actions.switchPage) {
    ctx.actions.switchPage(state.activePage);
  }
  if (state.sessionId) {
    await setActiveSession(ctx, state.sessionId);
  }
  await settle(2, 50);
};

const formatSceneHeader = (scene = {}) => `${scene.title} (${scene.id})`;

const formatSceneReport = (scene = {}) => {
  const lines = [
    `=== ${formatSceneHeader(scene)} ===`,
    `status: ${STATUS_LABELS[scene.status] || scene.status || 'unknown'}`,
  ];
  if (scene.status === 'audited') {
    lines.push(`visible elements scanned: ${Number(scene.scannedElements || 0)}`);
    lines.push(`passes: ${Number(scene.passes || 0)}`);
    lines.push(`issues: ${Number(scene.issueCount || 0)}`);
  }
  if (scene.message) {
    lines.push(`message: ${scene.message}`);
  }
  if (scene.reportText) {
    lines.push('');
    lines.push(scene.reportText);
  }
  return lines.join('\n');
};

export function renderBatchDarkThemeAuditSceneHtml(scene = {}, index = 0) {
  const palette = STATUS_COLORS[scene.status] || STATUS_COLORS.skipped;
  const info = scene.status === 'audited'
    ? `issues ${Number(scene.issueCount || 0)} · scanned ${Number(scene.scannedElements || 0)} · passes ${Number(scene.passes || 0)}`
    : (scene.message || '未执行');
  return `
    <div style="
      border:1px solid ${palette.border};
      background:rgba(15,23,42,0.86);
      border-radius:12px;
      padding:10px 12px;
      display:flex;
      flex-direction:column;
      gap:6px;
    ">
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <span style="font-weight:800; color:#f8fafc;">#${index + 1}</span>
        <span style="padding:2px 8px; border-radius:999px; font-size:11px; font-weight:700; background:${palette.bg}; color:${palette.text};">${STATUS_LABELS[scene.status] || scene.status || 'unknown'}</span>
        <span style="font-size:12px; color:#e2e8f0;">${escapeHtml(scene.title || scene.id || `scene-${index + 1}`)}</span>
      </div>
      <div style="font-size:11px; color:inherit; opacity:0.72;">${escapeHtml(info)}</div>
    </div>
  `;
}

const escapeHtml = (value = '') => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export function formatBatchDarkThemeAuditReport(result = {}) {
  const lines = [
    'Dark Theme Batch Audit',
    `mode: ${String(result.mode || 'unknown')}`,
    `scenes: ${Number(result.sceneCount || 0)}`,
    `audited: ${Number(result.auditedSceneCount || 0)}`,
    `skipped: ${Number(result.skippedSceneCount || 0)}`,
    `errors: ${Number(result.errorSceneCount || 0)}`,
    `issues: ${Number(result.totalIssues || 0)}`,
  ];

  Object.entries(result.summary?.byCategory || {})
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([key, count]) => {
      lines.push(`- ${key}: ${count}`);
    });

  lines.push('');
  lines.push('Scene Summary');
  (Array.isArray(result.scenes) ? result.scenes : []).forEach((scene, index) => {
    const tail = scene.status === 'audited'
      ? `issues=${Number(scene.issueCount || 0)} scanned=${Number(scene.scannedElements || 0)} passes=${Number(scene.passes || 0)}`
      : `message=${scene.message || ''}`.trim();
    lines.push(`${String(index + 1).padStart(2, '0')}. [${STATUS_LABELS[scene.status] || scene.status}] ${scene.title} (${scene.id}) ${tail}`.trim());
  });

  const detailScenes = (Array.isArray(result.scenes) ? result.scenes : [])
    .filter((scene) => scene.status !== 'audited' || Number(scene.issueCount || 0) > 0);
  if (detailScenes.length) {
    lines.push('');
    lines.push('Scene Details');
    detailScenes.forEach((scene) => {
      lines.push('');
      lines.push(formatSceneReport(scene));
    });
  }

  return lines.join('\n').trim();
}

export async function runBatchDarkThemeAudit({ issueLimitPerPass = 160, sceneIssueLimit = 360 } = {}) {
  const mode = String(document.body?.dataset?.themeMode || 'light').toLowerCase();
  const result = {
    mode,
    generatedAt: new Date().toISOString(),
    sceneCount: 0,
    auditedSceneCount: 0,
    skippedSceneCount: 0,
    errorSceneCount: 0,
    totalIssues: 0,
    summary: { total: 0, byCategory: {} },
    scenes: [],
    message: '',
  };

  if (mode !== 'dark') {
    result.message = '当前不是 dark 模式，批量主题审计已跳过。';
    return result;
  }

  const registry = getRegistry();
  if (!registry) {
    result.message = '未找到 debugUiRegistry，无法执行批量主题审计。';
    return result;
  }

  const ctx = {
    registry,
    panels: registry.panels || {},
    stores: registry.stores || {},
    actions: registry.actions || {},
    cache: {},
    sessionIds: null,
  };
  ctx.sessionIds = buildSessionContext(ctx);

  const originalState = captureUiState(ctx);
  const scenes = buildScenes(ctx);
  result.sceneCount = scenes.length;

  try {
    for (const scene of scenes) {
      const sceneResult = {
        id: scene.id,
        title: scene.title,
        status: 'skipped',
        issueCount: 0,
        scannedElements: 0,
        passes: 0,
        summary: { total: 0, byCategory: {} },
        message: '',
        reportText: '',
      };
      try {
        await closeAllUi(ctx);
        await scene.open?.(ctx);
        const root = getSceneRoot(scene, ctx);
        if (!root) {
          sceneResult.status = 'skipped';
          sceneResult.message = '未找到可见根节点';
        } else {
          const report = await auditRootAcrossScrollPasses(root, { issueLimitPerPass, sceneIssueLimit });
          sceneResult.status = 'audited';
          sceneResult.issueCount = Number(report.summary?.total || 0);
          sceneResult.scannedElements = Number(report.scannedElements || 0);
          sceneResult.passes = Number(report.passes || 0);
          sceneResult.summary = report.summary || { total: 0, byCategory: {} };
          sceneResult.message = report.message || '';
          sceneResult.reportText = formatDarkThemeAuditReport(report);
          result.auditedSceneCount += 1;
          result.totalIssues += sceneResult.issueCount;
          Object.entries(sceneResult.summary.byCategory || {}).forEach(([key, count]) => {
            result.summary.byCategory[key] = (result.summary.byCategory[key] || 0) + Number(count || 0);
          });
        }
      } catch (err) {
        sceneResult.status = 'error';
        sceneResult.message = err?.message ? String(err.message) : String(err || 'unknown error');
        result.errorSceneCount += 1;
      }
      if (sceneResult.status === 'skipped') result.skippedSceneCount += 1;
      sceneResult.reportText = sceneResult.reportText || '';
      result.scenes.push(sceneResult);
    }
  } finally {
    await restoreUiState(ctx, originalState);
  }

  result.summary.total = result.totalIssues;
  if (!result.message) {
    result.message = result.auditedSceneCount
      ? `已完成 ${result.auditedSceneCount} 个场景的批量主题审计。`
      : '没有可审计的场景。';
  }
  return result;
}
