/* 女仆动态工具：以用户身份发布动态（QQ 空间式信息流）。
   发布本体复用 app 既有链路（normalizeMomentRecordForStore → persistComposedMomentRecord →
   可选的发布后评论生成），经依赖注入接入；本模块不直接触碰 store。 */

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

export const createMomentsAgentTools = ({
  publishMoment = null,
} = {}) => [
  {
    name: 'moments.publish',
    title: 'Publish a moment',
    description: 'Publish a moment (feed post) on the moments page as the user. Characters may then comment on it like a real social feed.',
    source: 'maid-moments',
    permissions: [],
    riskLevel: 'medium',
    capabilities: {
      read: false,
      write: true,
      network: false,
      cost: 'variable',
      undo: 'none',
      modelContext: 'allowlist',
      confirmation: 'allow_once',
    },
    schema: {
      type: 'object',
      required: ['content'],
      additionalProperties: false,
      properties: {
        content: {
          type: 'string',
          minLength: 1,
          maxLength: 2000,
          description: 'The moment text to publish, written in the user\'s voice. Mention contacts with @Name inside the text.',
        },
        generateComments: {
          type: 'boolean',
          description: 'Whether characters should auto-comment after publishing (default true; involves model calls).',
        },
      },
    },
    execute: async (args = {}) => {
      if (typeof publishMoment !== 'function') {
        return { ok: false, reason: 'moments_publish_unavailable', message: '动态发布通道未接入。' };
      }
      const content = trim(args.content);
      if (!content) {
        return { ok: false, reason: 'moments_publish_empty', message: '动态正文为空。' };
      }
      const result = await publishMoment({
        content,
        generateComments: args.generateComments !== false,
      });
      if (result?.ok !== true) {
        return {
          ok: false,
          reason: trim(result?.reason, 'moments_publish_failed'),
          message: trim(result?.message, '动态发布失败。'),
        };
      }
      return {
        ok: true,
        momentId: trim(result.momentId),
        commentsRequested: result.commentsRequested === true,
        message: result.commentsRequested === true
          ? '动态已发布，角色们稍后会来评论。'
          : '动态已发布。',
      };
    },
    summarizeResult: result => (result?.ok === true
      ? `moment published id=${trim(result?.momentId, '-')} comments=${result?.commentsRequested === true}`
      : `moment publish failed: ${trim(result?.reason || result?.message, 'unknown')}`),
  },
];

export const registerMomentsAgentTools = (registry, deps = {}) => {
  const tools = createMomentsAgentTools(deps);
  if (!registry || typeof registry.registerMany !== 'function') return tools;
  registry.registerMany(tools);
  return tools;
};
