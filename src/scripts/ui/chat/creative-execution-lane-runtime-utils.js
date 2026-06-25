const TERMINAL_TASK_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'skipped']);
const RUNNING_TASK_STATUSES = new Set(['running', 'queued']);

export const CREATIVE_EXECUTION_STATUS_LABELS = Object.freeze({
  queued: '排队',
  running: '执行中',
  succeeded: '完成',
  failed: '失败',
  cancelled: '取消',
  skipped: '跳过',
});

export const CREATIVE_EXECUTION_DEFAULT_LANES = Object.freeze([
  { id: 'request', label: '请求', shortLabel: '请求', icon: 'spark' },
  { id: 'context', label: '上下文', shortLabel: '上下文', icon: 'book' },
  { id: 'model', label: '模型', shortLabel: '模型', icon: 'bolt' },
  { id: 'memory', label: '记忆表', shortLabel: '记忆', icon: 'table' },
  { id: 'profile', label: '画像', shortLabel: '画像', icon: 'portrait' },
  { id: 'variable', label: '变量', shortLabel: '变量', icon: 'braces' },
  { id: 'image', label: '图片', shortLabel: '图片', icon: 'image' },
]);

export const CREATIVE_EXECUTION_DEFAULT_TASKS = Object.freeze([
  {
    id: 'input',
    laneId: 'request',
    label: '请求入列',
    brief: '整理输入、附件与续写目标',
    timeBucket: 0,
    phaseIndex: 0,
    dependsOn: [],
  },
  {
    id: 'context',
    laneId: 'context',
    label: '上下文组装',
    brief: '收集聊天、世界书、记忆和变量',
    timeBucket: 1,
    phaseIndex: 1,
    dependsOn: ['input'],
  },
  {
    id: 'model',
    laneId: 'model',
    label: '正文生成',
    brief: '请求模型并接收正文',
    timeBucket: 2,
    phaseIndex: 2,
    dependsOn: ['context'],
  },
  {
    id: 'memory',
    laneId: 'memory',
    label: '记忆表',
    brief: '抽取并同步记忆表',
    timeBucket: 2,
    phaseIndex: 2,
    dependsOn: ['model'],
  },
  {
    id: 'profile',
    laneId: 'profile',
    label: '画像',
    brief: '检查是否触发画像任务',
    timeBucket: 3,
    phaseIndex: 3,
    dependsOn: ['model'],
  },
  {
    id: 'variable',
    laneId: 'variable',
    label: '变量',
    brief: '应用 before/after 变量规则',
    timeBucket: 3,
    phaseIndex: 3,
    dependsOn: ['model'],
  },
  {
    id: 'image',
    laneId: 'image',
    label: '图片提示',
    brief: '检查自动图片提示词',
    timeBucket: 3,
    phaseIndex: 3,
    dependsOn: ['model'],
  },
]);

const normalizeId = value => String(value || '').trim();
const normalizeExecutionPhase = (value, fallback = 'async') => {
  const phase = normalizeId(value).toLowerCase();
  if (phase === 'sync' || phase === 'async' || phase === 'none') return phase;
  return fallback;
};
const toFiniteNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const isPlainObject = value => value && typeof value === 'object' && !Array.isArray(value);

const truncateText = (value, limit = 88) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trim()}…`;
};

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatTimeLabel = value => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '未记录';
  const date = new Date(n);
  const pad = num => String(num).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const formatDuration = (start, end) => {
  const s = Number(start);
  const e = Number(end);
  if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(e) || e <= 0 || e < s) return '未记录';
  const ms = e - s;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
};

const stringifyCompact = value => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const mergeLogItems = (prev = [], next = []) => {
  const out = Array.isArray(prev) ? prev.slice() : [];
  const incoming = Array.isArray(next) ? next : [next];
  incoming.forEach(item => {
    const text = String(item || '').trim();
    if (text) out.push(text);
  });
  return out.slice(-24);
};

export const isCreativeExecutionTerminalStatus = status => TERMINAL_TASK_STATUSES.has(String(status || ''));

export const shouldShowCreativeExecutionForUiMode = uiMode => String(uiMode || '').trim() === 'rp';

export const normalizeCreativeExecutionTask = (task = {}, index = 0) => {
  const id = normalizeId(task.id) || `task-${index + 1}`;
  const status = normalizeId(task.status) || 'queued';
  return {
    id,
    laneId: normalizeId(task.laneId) || 'request',
    label: truncateText(task.label || id, 28),
    brief: truncateText(task.brief || task.summary || '', 96),
    summary: truncateText(task.summary || '', 140),
    status: CREATIVE_EXECUTION_STATUS_LABELS[status] ? status : 'queued',
    timeBucket: Math.max(0, Math.trunc(toFiniteNumber(task.timeBucket, index))),
    phaseIndex: Math.max(0, Math.trunc(toFiniteNumber(task.phaseIndex, index))),
    dependsOn: Array.isArray(task.dependsOn) ? task.dependsOn.map(normalizeId).filter(Boolean) : [],
    nodeRef: normalizeId(task.nodeRef),
    startedAt: Math.max(0, Math.trunc(toFiniteNumber(task.startedAt, 0))),
    updatedAt: Math.max(0, Math.trunc(toFiniteNumber(task.updatedAt, 0))),
    finishedAt: Math.max(0, Math.trunc(toFiniteNumber(task.finishedAt, 0))),
    input: task.input ?? null,
    output: task.output ?? null,
    detail: task.detail ?? null,
    error: task.error ? String(task.error) : '',
    logs: Array.isArray(task.logs) ? task.logs.map(item => String(item || '').trim()).filter(Boolean).slice(-24) : [],
  };
};

const normalizeLane = (lane = {}, index = 0) => ({
  id: normalizeId(lane.id) || `lane-${index + 1}`,
  label: truncateText(lane.label || lane.id || `泳道 ${index + 1}`, 18),
  shortLabel: truncateText(lane.shortLabel || lane.label || lane.id || `L${index + 1}`, 8),
  icon: normalizeId(lane.icon),
});

const summarizeRequestText = value => {
  const text = truncateText(value, 72);
  return text ? `请求：${text}` : '准备整理本次创意写作请求';
};

export const buildCreativeExecutionDefaultTasks = ({ executionPlan = {} } = {}) => {
  const memoryPhase = normalizeExecutionPhase(executionPlan.memoryPhase, 'sync');
  const variablePhase = normalizeExecutionPhase(executionPlan.variablePhase, 'sync');
  const bucketForPhase = phase => (phase === 'sync' ? 2 : 3);
  return CREATIVE_EXECUTION_DEFAULT_TASKS.map(task => {
    if (task.id === 'memory') {
      const timeBucket = bucketForPhase(memoryPhase);
      return {
        ...task,
        timeBucket,
        phaseIndex: timeBucket,
      };
    }
    if (task.id === 'variable') {
      const timeBucket = bucketForPhase(variablePhase);
      return {
        ...task,
        timeBucket,
        phaseIndex: timeBucket,
      };
    }
    return task;
  });
};

export const createCreativeExecutionInitialState = ({
  runId = '',
  sessionId = '',
  generationId = 0,
  title = '创意写作执行',
  text = '',
  executionPlan = {},
  now = Date.now(),
} = {}) => {
  const startedAt = Math.max(0, Math.trunc(toFiniteNumber(now, 0)));
  const id = normalizeId(runId) || `creative-execution:${startedAt || Date.now()}`;
  const tasks = buildCreativeExecutionDefaultTasks({ executionPlan }).map((task, index) => normalizeCreativeExecutionTask({
    ...task,
    status: 'queued',
    input: task.id === 'input'
      ? {
          requestPreview: truncateText(text, 160),
          sessionId: normalizeId(sessionId),
          generationId: Number(generationId) || 0,
        }
      : null,
    summary: task.id === 'input' ? summarizeRequestText(text) : '',
  }, index));
  return {
    visible: true,
    expanded: false,
    fullscreen: false,
    selectedTaskId: '',
    userPanned: false,
    run: {
      id,
      sessionId: normalizeId(sessionId),
      generationId: Number(generationId) || 0,
      title: truncateText(title || '创意写作执行', 42),
      status: 'running',
      summary: '准备执行',
      startedAt,
      updatedAt: startedAt,
      finishedAt: 0,
    },
    lanes: CREATIVE_EXECUTION_DEFAULT_LANES.map(normalizeLane),
    tasks,
  };
};

const getProgress = tasks => {
  const total = tasks.length;
  const terminal = tasks.filter(task => TERMINAL_TASK_STATUSES.has(task.status)).length;
  const succeeded = tasks.filter(task => task.status === 'succeeded').length;
  const failed = tasks.filter(task => task.status === 'failed').length;
  return { total, terminal, succeeded, failed };
};

const resolveRunStatus = state => {
  const status = normalizeId(state?.run?.status) || 'idle';
  if (status === 'failed' || status === 'cancelled' || status === 'succeeded') return status;
  const tasks = Array.isArray(state?.tasks) ? state.tasks.map(normalizeCreativeExecutionTask) : [];
  if (tasks.some(task => task.status === 'failed')) return 'failed';
  if (tasks.some(task => task.status === 'running')) return 'running';
  if (tasks.length && tasks.every(task => TERMINAL_TASK_STATUSES.has(task.status))) return 'succeeded';
  return 'queued';
};

const resolveCurrentTask = tasks => {
  const running = tasks
    .filter(task => task.status === 'running')
    .sort((a, b) => a.timeBucket - b.timeBucket || a.phaseIndex - b.phaseIndex);
  if (running.length) return running[0];
  const queued = tasks
    .filter(task => task.status === 'queued')
    .sort((a, b) => a.timeBucket - b.timeBucket || a.phaseIndex - b.phaseIndex);
  return queued[0] || tasks[tasks.length - 1] || null;
};

const buildPath = (source, target, orientation, nodeSize) => {
  const sameBucket = source.timeBucket === target.timeBucket;
  if (orientation === 'mobile') {
    if (sameBucket) {
      const sx = source.x + nodeSize.width;
      const sy = source.y + nodeSize.height / 2;
      const tx = target.x;
      const ty = target.y + nodeSize.height / 2;
      const mid = sx + Math.max(36, (tx - sx) / 2);
      return `M ${sx} ${sy} C ${mid} ${sy}, ${mid} ${ty}, ${tx} ${ty}`;
    }
    const sx = source.x + nodeSize.width / 2;
    const sy = source.y + nodeSize.height;
    const tx = target.x + nodeSize.width / 2;
    const ty = target.y;
    const mid = sy + Math.max(32, (ty - sy) / 2);
    return `M ${sx} ${sy} C ${sx} ${mid}, ${tx} ${mid}, ${tx} ${ty}`;
  }
  if (sameBucket) {
    const sx = source.x + nodeSize.width / 2;
    const sy = source.y + nodeSize.height;
    const tx = target.x + nodeSize.width / 2;
    const ty = target.y;
    const mid = sy + Math.max(34, (ty - sy) / 2);
    return `M ${sx} ${sy} C ${sx} ${mid}, ${tx} ${mid}, ${tx} ${ty}`;
  }
  const sx = source.x + nodeSize.width;
  const sy = source.y + nodeSize.height / 2;
  const tx = target.x;
  const ty = target.y + nodeSize.height / 2;
  const mid = sx + Math.max(42, (tx - sx) / 2);
  return `M ${sx} ${sy} C ${mid} ${sy}, ${mid} ${ty}, ${tx} ${ty}`;
};

export const buildCreativeExecutionLaneViewModel = (state = {}, { orientation = 'desktop' } = {}) => {
  const lanes = (Array.isArray(state.lanes) && state.lanes.length
    ? state.lanes
    : CREATIVE_EXECUTION_DEFAULT_LANES).map(normalizeLane);
  const laneIndex = new Map(lanes.map((lane, index) => [lane.id, index]));
  const tasks = (Array.isArray(state.tasks) ? state.tasks : []).map(normalizeCreativeExecutionTask)
    .filter(task => laneIndex.has(task.laneId))
    .sort((a, b) => a.timeBucket - b.timeBucket || laneIndex.get(a.laneId) - laneIndex.get(b.laneId));
  const currentTask = resolveCurrentTask(tasks);
  const runningTaskCount = tasks.filter(task => task.status === 'running').length;
  const activeBucket = currentTask?.timeBucket ?? 0;
  const progress = getProgress(tasks);
  const status = resolveRunStatus(state);
  const nodeSize = orientation === 'mobile'
    ? { width: 138, height: 74 }
    : { width: 168, height: 74 };
  const pad = orientation === 'mobile'
    ? { left: 116, top: 58, right: 48, bottom: 70 }
    : { left: 132, top: 58, right: 80, bottom: 64 };
  const gapX = orientation === 'mobile' ? 154 : 202;
  const gapY = orientation === 'mobile' ? 98 : 88;
  const maxBucket = tasks.reduce((max, task) => Math.max(max, task.timeBucket), 0);

  const positionedTasks = tasks.map(task => {
    const li = laneIndex.get(task.laneId) || 0;
    const x = orientation === 'mobile'
      ? pad.left + li * gapX
      : pad.left + task.timeBucket * gapX;
    const y = orientation === 'mobile'
      ? pad.top + task.timeBucket * gapY
      : pad.top + li * gapY;
    return {
      ...task,
      lane: lanes[li],
      x,
      y,
      width: nodeSize.width,
      height: nodeSize.height,
      isCurrent: currentTask?.id === task.id,
    };
  });
  const taskById = new Map(positionedTasks.map(task => [task.id, task]));
  const edges = [];
  positionedTasks.forEach(task => {
    task.dependsOn.forEach(sourceId => {
      const source = taskById.get(sourceId);
      if (!source) return;
      const active = task.status === 'running' && (source.status === 'succeeded' || source.status === 'running');
      const failed = task.status === 'failed' || source.status === 'failed';
      edges.push({
        id: `${source.id}->${task.id}`,
        sourceId: source.id,
        targetId: task.id,
        status: failed ? 'failed' : (active ? 'active' : task.status),
        active,
        path: buildPath(source, task, orientation, nodeSize),
      });
    });
  });

  const scene = orientation === 'mobile'
    ? {
        width: pad.left + lanes.length * gapX + nodeSize.width + pad.right,
        height: pad.top + (maxBucket + 1) * gapY + nodeSize.height + pad.bottom,
      }
    : {
        width: pad.left + (maxBucket + 1) * gapX + nodeSize.width + pad.right,
        height: pad.top + lanes.length * gapY + nodeSize.height + pad.bottom,
      };
  const timeMarkers = Array.from(new Set(tasks.map(task => task.timeBucket))).sort((a, b) => a - b).map(bucket => {
    if (orientation === 'mobile') {
      return {
        bucket,
        label: bucket === activeBucket && status === 'running' ? '进行中' : `T+${bucket}`,
        x1: 20,
        x2: scene.width - 28,
        y: pad.top + bucket * gapY + nodeSize.height / 2,
        active: bucket === activeBucket && status === 'running',
      };
    }
    return {
      bucket,
      label: bucket === activeBucket && status === 'running' ? '进行中' : `T+${bucket}`,
      x: pad.left + bucket * gapX + nodeSize.width / 2,
      y1: 22,
      y2: scene.height - 32,
      active: bucket === activeBucket && status === 'running',
    };
  });
  const laneLabels = lanes.map((lane, index) => {
    if (orientation === 'mobile') {
      return {
        ...lane,
        x: pad.left + index * gapX + nodeSize.width / 2,
        y: 18,
      };
    }
    return {
      ...lane,
      x: 22,
      y: pad.top + index * gapY + nodeSize.height / 2,
    };
  });
  const statusText = status === 'succeeded'
    ? '已完成'
    : status === 'failed'
      ? '失败'
      : status === 'cancelled'
        ? '已取消'
        : status === 'running'
          ? '执行中'
          : '准备中';
  const activityTitle = currentTask
    ? `${currentTask.label}${runningTaskCount > 1 ? ` 等 ${runningTaskCount} 项` : ''}`
    : '准备执行';
  const displayTitle = status === 'succeeded'
    ? '已完成 · 执行流程'
    : status === 'failed'
      ? `失败 · ${currentTask?.label || '查看详情'}`
      : status === 'cancelled'
        ? '已取消 · 执行流程'
        : `${statusText} · ${activityTitle}`;
  const summary = status === 'succeeded'
    ? '已完成 · 查看流程'
    : status === 'failed'
      ? `失败 · ${currentTask?.label || '查看详情'}`
      : status === 'cancelled'
        ? '已取消 · 查看流程'
        : (currentTask?.summary || currentTask?.brief || '等待状态更新');
  return {
    orientation,
    status,
    statusText,
    displayTitle,
    summary,
    progress,
    currentTaskId: currentTask?.id || '',
    activeBucket,
    scene,
    nodeSize,
    lanes,
    tasks: positionedTasks,
    edges,
    timeMarkers,
    laneLabels,
    selectedTask: taskById.get(state.selectedTaskId) || null,
  };
};

const iconSvg = name => {
  const common = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  const icons = {
    spark: `<svg ${common}><path d="M12 3l1.4 4.2L18 9l-4.6 1.8L12 15l-1.4-4.2L6 9l4.6-1.8L12 3z"/><path d="M5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8L5 15z"/><path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z"/></svg>`,
    book: `<svg ${common}><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H20v15H7.5A2.5 2.5 0 0 0 5 20.5V5.5z"/><path d="M5 5.5A2.5 2.5 0 0 0 2.5 3H2v15h.5A2.5 2.5 0 0 1 5 20.5"/><path d="M8 7h8M8 11h7"/></svg>`,
    bolt: `<svg ${common}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>`,
    table: `<svg ${common}><path d="M4 5h16v14H4z"/><path d="M4 10h16M9 5v14M15 5v14"/></svg>`,
    portrait: `<svg ${common}><path d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M4 21a8 8 0 0 1 16 0"/><path d="M3 3h18v18H3z"/></svg>`,
    braces: `<svg ${common}><path d="M8 4c-2 0-3 1-3 3v2c0 1-.5 2-2 2 1.5 0 2 1 2 2v2c0 2 1 3 3 3"/><path d="M16 4c2 0 3 1 3 3v2c0 1 .5 2 2 2-1.5 0-2 1-2 2v2c0 2-1 3-3 3"/></svg>`,
    image: `<svg ${common}><path d="M4 5h16v14H4z"/><path d="M8 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/><path d="M4 16l5-5 3.5 3.5 2-2L20 18"/></svg>`,
    close: `<svg ${common}><path d="M6 6l12 12M18 6L6 18"/></svg>`,
    expand: `<svg ${common}><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/><path d="M3 3l6 6M21 3l-6 6M3 21l6-6M21 21l-6-6"/></svg>`,
    collapse: `<svg ${common}><path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6"/><path d="M9 9L3 3M15 9l6-6M9 15l-6 6M15 15l6 6"/></svg>`,
    chevron: `<svg ${common}><path d="M6 9l6 6 6-6"/></svg>`,
    panel: `<svg ${common}><path d="M4 6h16v12H4z"/><path d="M14 6v12M7 10h4M7 14h4"/></svg>`,
    locate: `<svg ${common}><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  };
  return icons[name] || icons.spark;
};

const renderStripHtml = (view, state) => {
  const progress = `${view.progress.terminal}/${view.progress.total || 0}`;
  return `
    <button type="button" class="creative-execution-strip" data-cel-toggle="1" aria-expanded="${state.expanded ? 'true' : 'false'}" aria-label="展开创意写作执行流程">
      <span class="creative-execution-strip-icon" aria-hidden="true">${iconSvg('spark')}</span>
      <span class="creative-execution-strip-copy">
        <span class="creative-execution-strip-title">${escapeHtml(view.displayTitle)}</span>
        <span class="creative-execution-strip-summary">${escapeHtml(view.summary)}</span>
      </span>
      <span class="creative-execution-strip-progress" aria-label="执行进度">${escapeHtml(progress)}</span>
      <span class="creative-execution-strip-chevron" aria-hidden="true">${iconSvg('chevron')}</span>
    </button>
  `;
};

const renderGraphHtml = view => {
  const markerHtml = view.timeMarkers.map(marker => view.orientation === 'mobile'
    ? `<div class="creative-execution-time-marker ${marker.active ? 'is-active' : ''}" style="--cel-y:${marker.y}px;"><span>${escapeHtml(marker.label)}</span></div>`
    : `<div class="creative-execution-time-marker ${marker.active ? 'is-active' : ''}" style="--cel-x:${marker.x}px;"><span>${escapeHtml(marker.label)}</span></div>`).join('');
  const laneHtml = view.laneLabels.map(lane => view.orientation === 'mobile'
    ? `<div class="creative-execution-lane-label is-mobile" style="--cel-x:${lane.x}px; --cel-y:${lane.y}px;"><span>${iconSvg(lane.icon)}</span>${escapeHtml(lane.shortLabel)}</div>`
    : `<div class="creative-execution-lane-label" style="--cel-x:${lane.x}px; --cel-y:${lane.y}px;"><span>${iconSvg(lane.icon)}</span>${escapeHtml(lane.shortLabel)}</div>`).join('');
  const edgeHtml = view.edges.map(edge => `
    <path class="creative-execution-edge ${edge.active ? 'is-active' : ''} ${edge.status === 'failed' ? 'is-failed' : ''}" d="${escapeHtml(edge.path)}" />
    ${edge.active ? `<path class="creative-execution-edge-flow" d="${escapeHtml(edge.path)}" />` : ''}
  `).join('');
  const nodeHtml = view.tasks.map(task => {
    const selected = view.selectedTask?.id === task.id;
    return `
    <button type="button"
      class="creative-execution-node is-${escapeHtml(task.status)} ${task.isCurrent ? 'is-current' : ''} ${selected ? 'is-selected' : ''}"
      data-cel-task-id="${escapeHtml(task.id)}"
      aria-selected="${selected ? 'true' : 'false'}"
      style="--cel-x:${task.x}px; --cel-y:${task.y}px;"
      aria-label="${escapeHtml(`${task.label}，${CREATIVE_EXECUTION_STATUS_LABELS[task.status] || task.status}`)}">
      <span class="creative-execution-node-head">
        <span class="creative-execution-node-icon" aria-hidden="true">${iconSvg(task.lane?.icon || 'spark')}</span>
        <span class="creative-execution-node-phase">T+${escapeHtml(task.timeBucket)}</span>
      </span>
      <span class="creative-execution-node-title">${escapeHtml(task.label)}</span>
      <span class="creative-execution-node-brief">${escapeHtml(task.summary || task.brief || '等待状态')}</span>
      <span class="creative-execution-node-status">${escapeHtml(CREATIVE_EXECUTION_STATUS_LABELS[task.status] || task.status)}</span>
    </button>
  `;
  }).join('');
  return `
    <div class="creative-execution-graph-scroll" data-cel-graph-scroll="1">
      <div class="creative-execution-scene" style="width:${view.scene.width}px; height:${view.scene.height}px;">
        <svg class="creative-execution-edge-layer" width="${view.scene.width}" height="${view.scene.height}" viewBox="0 0 ${view.scene.width} ${view.scene.height}" aria-hidden="true">
          ${edgeHtml}
        </svg>
        ${markerHtml}
        ${laneHtml}
        ${nodeHtml}
      </div>
    </div>
  `;
};

const renderDetailsHtml = view => {
  const task = view.selectedTask;
  if (!task) {
    return `
      <aside class="creative-execution-detail is-empty" aria-label="节点详情">
        <div class="creative-execution-detail-empty">
          <span aria-hidden="true">${iconSvg('panel')}</span>
          <strong>选择一个节点</strong>
          <p>节点详情、日志和错误信息会在这里展开。</p>
        </div>
      </aside>
    `;
  }
  const downstream = view.tasks.filter(item => item.dependsOn.includes(task.id));
  const upstreamId = task.dependsOn[0] || '';
  const downstreamId = downstream[0]?.id || '';
  const inputText = stringifyCompact(task.input);
  const outputText = stringifyCompact(task.output);
  const detailText = stringifyCompact(task.detail);
  const logText = stringifyCompact(task.logs);
  const errorText = task.error ? String(task.error) : '';
  return `
    <aside class="creative-execution-detail" aria-label="节点详情">
      <div class="creative-execution-detail-head">
        <div class="creative-execution-detail-kicker">${escapeHtml(task.lane?.label || '')} · ${escapeHtml(CREATIVE_EXECUTION_STATUS_LABELS[task.status] || task.status)}</div>
        <button type="button" class="creative-execution-icon-btn" data-cel-detail-close="1" aria-label="关闭节点详情">${iconSvg('close')}</button>
      </div>
      <h3>${escapeHtml(task.label)}</h3>
      <p>${escapeHtml(task.summary || task.brief || '暂无摘要')}</p>
      <dl class="creative-execution-detail-grid">
        <div><dt>开始</dt><dd>${escapeHtml(formatTimeLabel(task.startedAt))}</dd></div>
        <div><dt>结束</dt><dd>${escapeHtml(formatTimeLabel(task.finishedAt))}</dd></div>
        <div><dt>耗时</dt><dd>${escapeHtml(formatDuration(task.startedAt, task.finishedAt || task.updatedAt))}</dd></div>
        <div><dt>阶段</dt><dd>T+${escapeHtml(task.timeBucket)}</dd></div>
      </dl>
      <div class="creative-execution-detail-actions">
        <button type="button" data-cel-jump-upstream="${escapeHtml(task.id)}" ${upstreamId ? '' : 'disabled'}>${iconSvg('locate')}上游</button>
        <button type="button" data-cel-jump-downstream="${escapeHtml(task.id)}" ${downstreamId ? '' : 'disabled'}>${iconSvg('locate')}下游</button>
      </div>
      ${errorText ? `<section class="creative-execution-detail-error"><strong>错误摘要</strong><p>${escapeHtml(errorText)}</p></section>` : ''}
      ${inputText ? `<details class="creative-execution-detail-block"><summary>输入摘要</summary><pre>${escapeHtml(inputText)}</pre></details>` : ''}
      ${outputText ? `<details class="creative-execution-detail-block"><summary>输出摘要</summary><pre>${escapeHtml(outputText)}</pre></details>` : ''}
      ${detailText ? `<details class="creative-execution-detail-block"><summary>关键参数</summary><pre>${escapeHtml(detailText)}</pre></details>` : ''}
      ${logText ? `<details class="creative-execution-detail-block"><summary>日志</summary><pre>${escapeHtml(logText)}</pre></details>` : ''}
    </aside>
  `;
};

const renderPanelHtml = (view, state) => `
  <section class="creative-execution-panel ${state.fullscreen ? 'is-fullscreen' : ''} ${view.selectedTask ? 'has-detail' : ''}" aria-label="创意写作执行泳道图">
    <header class="creative-execution-panel-head">
      <div class="creative-execution-panel-title">
        <span aria-hidden="true">${iconSvg('panel')}</span>
        <div>
          <strong>${escapeHtml(view.displayTitle)}</strong>
          <small>${escapeHtml(state.run?.title || '创意写作流程')} · ${escapeHtml(view.progress.terminal)}/${escapeHtml(view.progress.total)} · 时间${view.orientation === 'mobile' ? '纵轴' : '横轴'}</small>
        </div>
      </div>
      <div class="creative-execution-panel-actions">
        <button type="button" class="creative-execution-icon-btn" data-cel-fullscreen="1" aria-label="${state.fullscreen ? '退出全屏' : '全屏查看'}">${state.fullscreen ? iconSvg('collapse') : iconSvg('expand')}</button>
        <button type="button" class="creative-execution-icon-btn" data-cel-toggle="1" aria-label="收起执行流程">${iconSvg('chevron')}</button>
        <button type="button" class="creative-execution-icon-btn" data-cel-close="1" aria-label="关闭执行流程">${iconSvg('close')}</button>
      </div>
    </header>
    <div class="creative-execution-panel-body">
      <main class="creative-execution-graph" aria-label="执行泳道图">${renderGraphHtml(view)}</main>
      ${renderDetailsHtml(view)}
    </div>
  </section>
`;

const normalizePatchArg = value => {
  if (typeof value === 'string') return { summary: value };
  return isPlainObject(value) ? value : {};
};

const getWindowForDocument = doc => doc?.defaultView || (typeof window !== 'undefined' ? window : null);

export const createCreativeExecutionLaneRuntime = ({
  documentRef,
  inputContainer,
  getUiMode = () => '',
  now = () => Date.now(),
  requestAnimationFrameFn = null,
  logger = console,
} = {}) => {
  let root = null;
  let state = null;
  let mounted = false;
  const doc = documentRef || (typeof document !== 'undefined' ? document : null);
  const raf = requestAnimationFrameFn || getWindowForDocument(doc)?.requestAnimationFrame?.bind(getWindowForDocument(doc));

  const resolveOrientation = () => {
    const win = getWindowForDocument(doc);
    try {
      if (win?.matchMedia?.('(max-width: 720px)')?.matches) return 'mobile';
    } catch {}
    return 'desktop';
  };

  const scrollActiveIntoView = () => {
    if (!root || !state?.expanded || state.userPanned) return;
    const activeId = buildCreativeExecutionLaneViewModel(state, { orientation: resolveOrientation() }).currentTaskId;
    if (!activeId) return;
    const run = () => {
      try {
        root.querySelector(`[data-cel-task-id="${activeId}"]`)?.scrollIntoView({
          block: 'nearest',
          inline: 'center',
          behavior: 'smooth',
        });
      } catch {}
    };
    if (typeof raf === 'function') raf(run);
    else run();
  };

  const render = () => {
    if (!root || !mounted) return;
    const visible = Boolean(state?.visible) && shouldShowCreativeExecutionForUiMode(getUiMode());
    root.hidden = !visible;
    if (!visible || !state) return;
    const orientation = resolveOrientation();
    const view = buildCreativeExecutionLaneViewModel(state, { orientation });
    root.className = [
      'creative-execution-root',
      state.expanded ? 'is-expanded' : '',
      state.fullscreen ? 'is-fullscreen' : '',
      `is-${view.status}`,
    ].filter(Boolean).join(' ');
    root.dataset.status = view.status;
    root.dataset.orientation = orientation;
    root.innerHTML = `${renderStripHtml(view, state)}${state.expanded ? renderPanelHtml(view, state) : ''}`;
    scrollActiveIntoView();
  };

  const syncSelectedTaskDom = () => {
    if (!root || !state?.expanded) return false;
    const panel = root.querySelector?.('.creative-execution-panel');
    const body = root.querySelector?.('.creative-execution-panel-body');
    if (!panel || !body) return false;
    const view = buildCreativeExecutionLaneViewModel(state, { orientation: resolveOrientation() });
    panel.classList.toggle('has-detail', Boolean(view.selectedTask));
    root.querySelectorAll?.('[data-cel-task-id]')?.forEach(node => {
      const selected = node.getAttribute('data-cel-task-id') === state.selectedTaskId;
      node.classList.toggle('is-selected', selected);
      node.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    const currentDetail = Array.from(body.children || [])
      .find(child => child?.classList?.contains?.('creative-execution-detail'));
    const template = doc.createElement('template');
    template.innerHTML = renderDetailsHtml(view).trim();
    const nextDetail = template.content.firstElementChild;
    if (!nextDetail) return false;
    if (currentDetail) currentDetail.replaceWith(nextDetail);
    else body.appendChild(nextDetail);
    return true;
  };

  const touchRun = (patch = {}) => {
    if (!state?.run) return;
    const ts = Math.max(0, Math.trunc(toFiniteNumber(now(), Date.now())));
    state.run = {
      ...state.run,
      ...patch,
      updatedAt: ts,
    };
  };

  const updateTask = (taskId, updater) => {
    if (!state) return null;
    const id = normalizeId(taskId);
    let nextTask = null;
    const ts = Math.max(0, Math.trunc(toFiniteNumber(now(), Date.now())));
    state.tasks = state.tasks.map((task, index) => {
      if (task.id !== id) return task;
      const updated = normalizeCreativeExecutionTask(updater(task, ts) || task, index);
      nextTask = updated;
      return updated;
    });
    if (nextTask) touchRun({ status: nextTask.status === 'failed' ? 'failed' : state.run.status });
    return nextTask;
  };

  const selectTask = taskId => {
    if (!state) return;
    const id = normalizeId(taskId);
    if (!state.tasks.some(task => task.id === id)) return;
    const wasExpanded = state.expanded;
    state.selectedTaskId = id;
    state.expanded = true;
    if (wasExpanded && syncSelectedTaskDom()) return;
    render();
  };

  const setTaskStatus = (taskId, status, patch = {}) => {
    const normalizedStatus = CREATIVE_EXECUTION_STATUS_LABELS[status] ? status : 'queued';
    const task = updateTask(taskId, (prev, ts) => {
      const next = {
        ...prev,
        ...patch,
        status: normalizedStatus,
        summary: truncateText(patch.summary ?? prev.summary, 140),
        brief: truncateText(patch.brief ?? prev.brief, 96),
        input: patch.input ?? prev.input,
        output: patch.output ?? prev.output,
        detail: patch.detail ?? prev.detail,
        error: patch.error ? String(patch.error) : prev.error,
        logs: mergeLogItems(prev.logs, patch.logs || []),
        updatedAt: ts,
      };
      if (normalizedStatus === 'running' && !next.startedAt) next.startedAt = ts;
      if (TERMINAL_TASK_STATUSES.has(normalizedStatus)) {
        next.finishedAt = next.finishedAt || ts;
        if (!next.startedAt) next.startedAt = ts;
      }
      return next;
    });
    if (task) {
      if (normalizedStatus === 'running') touchRun({ status: 'running', summary: task.summary || task.brief || task.label });
      if (normalizedStatus === 'failed') touchRun({ status: 'failed', summary: task.error || task.summary || task.label });
    }
    render();
    return task;
  };

  const finishRemainingTasks = status => {
    if (!state) return;
    const ts = Math.max(0, Math.trunc(toFiniteNumber(now(), Date.now())));
    state.tasks = state.tasks.map((task, index) => {
      if (TERMINAL_TASK_STATUSES.has(task.status)) return task;
      return normalizeCreativeExecutionTask({
        ...task,
        status,
        summary: status === 'skipped' ? '本次未触发' : task.summary,
        startedAt: task.startedAt || ts,
        updatedAt: ts,
        finishedAt: ts,
      }, index);
    });
  };

  const mount = () => {
    if (!doc || !inputContainer) return false;
    if (mounted) return true;
    root = doc.createElement('div');
    root.className = 'creative-execution-root';
    root.hidden = true;
    const inputRow = inputContainer.querySelector?.('.chat-input-row') || null;
    if (inputRow?.parentNode === inputContainer) inputContainer.insertBefore(root, inputRow);
    else inputContainer.appendChild(root);
    root.addEventListener('click', event => {
      const target = event.target;
      const toggle = target.closest?.('[data-cel-toggle]');
      if (toggle) {
        event.preventDefault();
        if (!state) return;
        state.expanded = !state.expanded;
        if (state.expanded) state.userPanned = false;
        render();
        return;
      }
      const close = target.closest?.('[data-cel-close]');
      if (close) {
        event.preventDefault();
        if (!state) return;
        state.visible = false;
        state.expanded = false;
        render();
        return;
      }
      const fullscreen = target.closest?.('[data-cel-fullscreen]');
      if (fullscreen) {
        event.preventDefault();
        if (!state) return;
        state.fullscreen = !state.fullscreen;
        render();
        return;
      }
      const detailClose = target.closest?.('[data-cel-detail-close]');
      if (detailClose) {
        event.preventDefault();
        if (!state) return;
        state.selectedTaskId = '';
        if (syncSelectedTaskDom()) return;
        render();
        return;
      }
      const node = target.closest?.('[data-cel-task-id]');
      if (node) {
        event.preventDefault();
        selectTask(node.getAttribute('data-cel-task-id'));
        return;
      }
      const upstream = target.closest?.('[data-cel-jump-upstream]');
      if (upstream) {
        event.preventDefault();
        const task = state?.tasks?.find(item => item.id === upstream.getAttribute('data-cel-jump-upstream'));
        if (task?.dependsOn?.[0]) selectTask(task.dependsOn[0]);
        return;
      }
      const downstream = target.closest?.('[data-cel-jump-downstream]');
      if (downstream) {
        event.preventDefault();
        const id = downstream.getAttribute('data-cel-jump-downstream');
        const task = state?.tasks?.find(item => item.dependsOn.includes(id));
        if (task?.id) selectTask(task.id);
      }
    });
    root.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !state) return;
      if (state.selectedTaskId) {
        state.selectedTaskId = '';
        if (syncSelectedTaskDom()) return;
      } else state.expanded = false;
      render();
    });
    ['wheel', 'pointerdown', 'touchstart'].forEach(type => {
      root.addEventListener(type, event => {
        if (event.target?.closest?.('[data-cel-graph-scroll]') && state) state.userPanned = true;
      }, { passive: true });
    });
    mounted = true;
    render();
    return true;
  };

  const startRun = options => {
    const startedAt = Math.max(0, Math.trunc(toFiniteNumber(now(), Date.now())));
    state = createCreativeExecutionInitialState({
      ...options,
      now: startedAt,
    });
    setTaskStatus('input', 'running', {
      summary: summarizeRequestText(options?.text),
      logs: ['请求已进入创意写作发送链路'],
    });
    return state.run.id;
  };

  const appendTask = (task = {}) => {
    if (!state) return null;
    const laneIds = new Set((state.lanes || []).map(lane => lane.id));
    const laneId = normalizeId(task.laneId);
    if (!laneIds.has(laneId)) return null;
    const ids = new Set((state.tasks || []).map(item => item.id));
    const baseId = normalizeId(task.id) || `${laneId}-${Math.max(1, state.tasks.length + 1)}`;
    let id = baseId;
    let suffix = 2;
    while (ids.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    const maxBucket = state.tasks.reduce((max, item) => Math.max(max, Math.trunc(Number(item.timeBucket)) || 0), 0);
    const timeBucket = Math.max(0, Math.trunc(toFiniteNumber(task.timeBucket, maxBucket + 1)));
    const normalized = normalizeCreativeExecutionTask({
      ...task,
      id,
      laneId,
      status: task.status || 'queued',
      timeBucket,
      phaseIndex: Math.max(0, Math.trunc(toFiniteNumber(task.phaseIndex, timeBucket))),
    }, state.tasks.length);
    state.tasks = [...state.tasks, normalized];
    touchRun(normalized.status === 'running' ? { status: 'running', finishedAt: 0 } : {});
    render();
    return normalized;
  };

  const api = {
    mount,
    render,
    syncUiMode: render,
    getState: () => state,
    setExpanded(expanded) {
      if (!state) return;
      state.expanded = Boolean(expanded);
      if (state.expanded) state.userPanned = false;
      render();
    },
    setGenerationId(generationId) {
      if (!state) return;
      state.run.generationId = Number(generationId) || 0;
      state.tasks = state.tasks.map((task, index) => normalizeCreativeExecutionTask({
        ...task,
        input: task.id === 'input' && isPlainObject(task.input)
          ? { ...task.input, generationId: Number(generationId) || 0 }
          : task.input,
      }, index));
      render();
    },
    startRun,
    appendTask,
    activateTask(taskId, patch = {}) {
      return setTaskStatus(taskId, 'running', normalizePatchArg(patch));
    },
    finishTask(taskId, status = 'succeeded', patch = {}) {
      return setTaskStatus(taskId, status, normalizePatchArg(patch));
    },
    skipTask(taskId, patch = {}) {
      return setTaskStatus(taskId, 'skipped', normalizePatchArg(patch));
    },
    failTask(taskId, error, patch = {}) {
      return setTaskStatus(taskId, 'failed', {
        ...normalizePatchArg(patch),
        error: error?.message ? String(error.message) : String(error || ''),
      });
    },
    completeRun(patch = {}) {
      if (!state) return;
      finishRemainingTasks('skipped');
      touchRun({
        status: 'succeeded',
        summary: truncateText(patch.summary || '已完成 · 查看流程', 140),
        finishedAt: Math.max(0, Math.trunc(toFiniteNumber(now(), Date.now()))),
      });
      render();
    },
    failRun(error, patch = {}) {
      if (!state) return;
      const running = state.tasks.find(task => RUNNING_TASK_STATUSES.has(task.status));
      if (running) api.failTask(running.id, error, patch);
      finishRemainingTasks('skipped');
      touchRun({
        status: 'failed',
        summary: truncateText(error?.message || error || patch.summary || '执行失败', 140),
        finishedAt: Math.max(0, Math.trunc(toFiniteNumber(now(), Date.now()))),
      });
      render();
    },
    cancelRun(reason = 'user') {
      if (!state) return;
      state.tasks = state.tasks.map((task, index) => {
        if (task.status === 'running') {
          return normalizeCreativeExecutionTask({
            ...task,
            status: 'cancelled',
            summary: '已取消',
            error: String(reason || ''),
            finishedAt: Math.max(0, Math.trunc(toFiniteNumber(now(), Date.now()))),
          }, index);
        }
        if (task.status === 'queued') {
          return normalizeCreativeExecutionTask({ ...task, status: 'skipped', summary: '取消后跳过' }, index);
        }
        return task;
      });
      touchRun({
        status: 'cancelled',
        summary: '已取消 · 查看流程',
        finishedAt: Math.max(0, Math.trunc(toFiniteNumber(now(), Date.now()))),
      });
      render();
    },
    markPostModelTasksRunning(summary = '模型回复已返回，处理后续任务', taskIds = ['memory']) {
      const ids = Array.isArray(taskIds) && taskIds.length ? taskIds : ['memory'];
      ids.forEach(taskId => {
        const task = state?.tasks?.find(item => item.id === taskId);
        if (task?.status === 'queued') {
          setTaskStatus(taskId, 'running', { summary });
        }
      });
    },
    selectTask,
    hide() {
      if (!state) return;
      state.visible = false;
      state.expanded = false;
      render();
    },
  };

  if (!mounted) {
    try {
      mount();
    } catch (err) {
      logger?.warn?.('creative execution lane mount failed', err);
    }
  }
  return api;
};
