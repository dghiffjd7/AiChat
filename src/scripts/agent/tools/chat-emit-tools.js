import { buildChatEmitCommitContract } from './chat-emit-commit-contract.js';
import { buildChatEmitCommitPreview } from './chat-emit-commit-plan.js';

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const list = value => (Array.isArray(value) ? value : [value])
  .map(item => trim(item))
  .filter(Boolean);

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

const baseCapabilities = Object.freeze({
  read: false,
  write: false,
  network: false,
  cost: 'none',
  undo: 'none',
  modelContext: 'allowlist',
  confirmation: 'allow_once',
});

const baseTool = ({
  name = '',
  title = '',
  description = '',
  schema = {},
  buildEvent,
} = {}) => ({
  name,
  title,
  description,
  source: 'chat-emit-agent',
  permissions: ['chat:emit_candidate'],
  riskLevel: 'low',
  capabilities: baseCapabilities,
  schema,
  execute: async (args = {}, context = {}) => {
    const eventDraft = buildEvent(args, context);
    const sessionId = trim(context?.sessionId || args.sessionId);
    const commitContract = buildChatEmitCommitContract({
      toolName: name,
      args,
      eventDraft,
      sessionId,
    });
    return {
      accepted: false,
      candidate: true,
      writesChat: false,
      commitReady: false,
      requiresUserReview: true,
      surface: eventDraft.surface,
      type: eventDraft.type,
      sessionId,
      eventDraft,
      commitPreview: buildChatEmitCommitPreview({ toolName: name, args, eventDraft, sessionId }),
      commitContract,
    };
  },
  summarizeResult: result => `captured ${trim(result?.type, 'chat event')} candidate; no chat write performed`,
});

const chatEventBaseProperties = {
  sessionId: {
    type: 'string',
    description: 'Optional current app session id used only for traceability.',
  },
  content: {
    type: 'string',
    minLength: 1,
    maxLength: 4000,
    description: 'Message body without wrapper prose.',
  },
  time: {
    type: 'string',
    maxLength: 32,
    description: 'Display time if known, for example 22:12.',
  },
};

const privateMessageSchema = {
  type: 'object',
  required: ['targetName', 'speakerName', 'content'],
  additionalProperties: false,
  properties: {
    ...chatEventBaseProperties,
    targetId: { type: 'string', description: 'Optional resolved contact id.' },
    targetName: { type: 'string', minLength: 1, description: 'Private chat counterpart name.' },
    speakerId: { type: 'string', description: 'Optional resolved speaker contact id.' },
    speakerName: { type: 'string', minLength: 1, description: 'Name of the speaker.' },
  },
};

const groupMessageSchema = {
  type: 'object',
  required: ['groupName', 'speakerName', 'content'],
  additionalProperties: false,
  properties: {
    ...chatEventBaseProperties,
    groupId: { type: 'string', description: 'Optional resolved group id.' },
    groupName: { type: 'string', minLength: 1, description: 'Group chat name.' },
    speakerId: { type: 'string', description: 'Optional resolved speaker contact id.' },
    speakerName: { type: 'string', minLength: 1, description: 'Name of the speaker or system message source.' },
    members: {
      type: 'array',
      items: { type: 'string' },
      description: 'Known group member names when available.',
    },
    system: {
      type: 'boolean',
      description: 'True only for group system events such as joins or removals.',
    },
  },
};

const momentCommentSchema = {
  type: 'object',
  required: ['momentId', 'author', 'content'],
  additionalProperties: false,
  properties: {
    ...chatEventBaseProperties,
    momentId: { type: 'string', minLength: 1, description: 'Target moment id.' },
    author: { type: 'string', minLength: 1, description: 'Comment author.' },
    replyTo: { type: 'string', description: 'Optional comment id being replied to.' },
    replyToAuthor: { type: 'string', description: 'Optional author being replied to.' },
  },
};

const momentPostSchema = {
  type: 'object',
  required: ['author', 'content'],
  additionalProperties: false,
  properties: {
    ...chatEventBaseProperties,
    momentId: { type: 'string', description: 'Optional generated or known moment id.' },
    author: { type: 'string', minLength: 1, description: 'Moment author.' },
    likes: { type: 'integer', minimum: 0, maximum: 100000 },
    views: { type: 'integer', minimum: 0, maximum: 100000 },
  },
};

const buildPrivateEvent = args => ({
  type: 'private_message',
  surface: 'chat',
  targetId: trim(args.targetId),
  targetName: trim(args.targetName),
  speakerId: trim(args.speakerId),
  speakerName: trim(args.speakerName),
  content: trim(args.content),
  time: trim(args.time),
  metadata: {
    protocolType: 'private_chat',
    source: 'provider_tool_chat_emit',
  },
});

const buildGroupEvent = args => ({
  type: args.system === true ? 'group_system_event' : 'group_message',
  surface: 'chat',
  targetId: trim(args.groupId),
  targetName: trim(args.groupName),
  speakerId: args.system === true ? '' : trim(args.speakerId),
  speakerName: trim(args.speakerName),
  content: trim(args.content),
  time: trim(args.time),
  metadata: {
    protocolType: 'group_chat',
    source: 'provider_tool_chat_emit',
    members: list(args.members),
  },
});

const buildMomentCommentEvent = args => ({
  type: 'moment_comment',
  surface: 'moments',
  targetId: trim(args.momentId),
  targetName: trim(args.replyToAuthor),
  speakerName: trim(args.author),
  content: trim(args.content),
  time: trim(args.time),
  metadata: {
    protocolType: 'moment_reply',
    source: 'provider_tool_chat_emit',
    replyTo: trim(args.replyTo),
    replyToAuthor: trim(args.replyToAuthor),
  },
});

const buildMomentPostEvent = args => ({
  type: 'moment_post',
  surface: 'moments',
  targetId: trim(args.momentId),
  targetName: trim(args.author),
  speakerName: trim(args.author),
  content: trim(args.content),
  time: trim(args.time),
  metadata: {
    protocolType: 'moments',
    source: 'provider_tool_chat_emit',
    likes: Number.isFinite(Number(args.likes)) ? Math.max(0, Math.trunc(Number(args.likes))) : 0,
    views: Number.isFinite(Number(args.views)) ? Math.max(0, Math.trunc(Number(args.views))) : 0,
  },
});

export const createChatEmitAgentTools = () => [
  baseTool({
    name: 'chat.emit_private',
    title: 'Capture private chat event',
    description: 'Capture a private chat message as a review-only candidate. This never writes to chat.',
    schema: privateMessageSchema,
    buildEvent: buildPrivateEvent,
  }),
  baseTool({
    name: 'chat.emit_group',
    title: 'Capture group chat event',
    description: 'Capture a group chat message or group system event as a review-only candidate. This never writes to chat.',
    schema: groupMessageSchema,
    buildEvent: buildGroupEvent,
  }),
  baseTool({
    name: 'chat.emit_moment_comment',
    title: 'Capture moment comment event',
    description: 'Capture a moment comment or reply as a review-only candidate. This never writes to moments.',
    schema: momentCommentSchema,
    buildEvent: buildMomentCommentEvent,
  }),
  baseTool({
    name: 'chat.emit_moment_post',
    title: 'Capture moment post event',
    description: 'Capture a moment post as a review-only candidate. This never writes to moments.',
    schema: momentPostSchema,
    buildEvent: buildMomentPostEvent,
  }),
].map(tool => ({
  ...tool,
  capabilities: clone(tool.capabilities),
  metadata: {
    writesChat: false,
    providerNative: true,
    reviewOnly: true,
  },
}));

export const registerChatEmitAgentTools = (registry) => {
  const tools = createChatEmitAgentTools();
  if (!registry || typeof registry.registerMany !== 'function') return tools;
  registry.registerMany(tools);
  return tools;
};
