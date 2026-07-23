const FLOW_CHIPS = Object.freeze([
  { id: 'setup-api', label: '接好 API', flowId: 'setup-api' },
  { id: 'add-friend', label: '添加好友', flowId: 'add-friend' },
  { id: 'first-chat', label: '第一次对话', flowId: 'first-chat' },
  { id: 'meet-maid', label: '认识女仆', flowId: 'meet-maid' },
]);

const includesAny = (text, keys) => keys.some(key => text.includes(key));

export const matchMaidIntent = (raw = '') => {
  const text = String(raw || '').trim().toLowerCase();
  if (!text) return null;

  if (includesAny(text, ['跳过', '退出引导', '停止引导', '取消引导', '不用引导'])) {
    return {
      kind: 'skip',
      reply: '好嘞，引导已收起。主人什么时候想继续，随时喊我～',
      chips: FLOW_CHIPS,
    };
  }

  // 不用裸「引导」做判定：「请引导我打开世界书」这类功能引导请求要落给真实女仆
  if (includesAny(text, ['新手', '教程', '教学', '上手', '带我逛', '怎么开始'])) {
    return {
      kind: 'catalog',
      reply: '欢迎回家，主人～我备好了 4 堂新手小课，选一堂就能跟着聚光灯一步步完成：',
      chips: FLOW_CHIPS,
    };
  }

  if (includesAny(text, ['api', 'apikey', 'api key', '接线', '连线', '配置模型', '模型配置'])) {
    return {
      kind: 'flow',
      flowId: 'setup-api',
      reply: '收到～这就带主人给女仆接上 API，大约两分钟就好。',
    };
  }

  const wantsFriend = includesAny(text, ['添加好友', '加好友', '推荐好友', '推荐角色', '认识角色', '联系人']);
  if (wantsFriend) {
    return {
      kind: 'flow',
      flowId: 'add-friend',
      reply: '包在我身上～我们去推荐列表认识第一位角色好友。',
    };
  }

  const wantsChat = includesAny(text, ['第一次对话', '第一次聊天', '怎么聊天', '怎么发消息', '发消息', '开始聊天']);
  if (wantsChat) {
    return {
      kind: 'flow',
      flowId: 'first-chat',
      reply: '想和角色聊天？安排！「第一次对话」引导这就开始。',
    };
  }

  if (includesAny(text, ['agent center', 'agent中心', 'agent 中心', '认识女仆', '女仆工作台', '小助手', '怎么用女仆'])) {
    return {
      kind: 'flow',
      flowId: 'meet-maid',
      reply: '收到。这就带主人巡视女仆工作台和 Agent Center。',
    };
  }

  return null;
};

export const listMaidIntentChips = () => FLOW_CHIPS.map(chip => ({ ...chip }));
