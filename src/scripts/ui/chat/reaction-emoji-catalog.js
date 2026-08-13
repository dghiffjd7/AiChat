const defineEmojiEntries = (rows = []) => Object.freeze(rows.map(([
  emoji,
  label,
  keywords = '',
  englishKeywords = '',
]) => Object.freeze({
  emoji,
  label,
  keywords: `${label} ${keywords}`.trim(),
  englishKeywords: String(englishKeywords || '').trim(),
})));

export const REACTION_EMOJI_CATEGORIES = Object.freeze([
  Object.freeze({
    id: 'faces',
    label: '表情',
    icon: '😀',
    emojis: defineEmojiEntries([
      ['😀', '开心', '笑脸 高兴', 'grinning face smile happy grin'],
      ['😃', '大笑', '开心', 'grinning face with big eyes smile happy laugh'],
      ['😄', '灿烂笑脸', '快乐', 'grinning face with smiling eyes smile happy laugh'],
      ['😁', '咧嘴笑', '开心', 'beaming face with smiling eyes grin smile'],
      ['😆', '眯眼笑', '爆笑', 'grinning squinting face laugh smile'],
      ['😅', '流汗笑', '尴尬 苦笑', 'grinning face with sweat nervous smile'],
      ['😂', '笑哭', '好笑', 'face with tears of joy laugh crying smile'],
      ['🤣', '笑翻', '爆笑', 'rolling on the floor laughing rofl laugh'],
      ['😊', '微笑', '害羞', 'smiling face with smiling eyes smile blush happy'],
      ['🙂', '浅笑', '友好', 'slightly smiling face smile friendly'],
      ['😉', '眨眼', '调皮', 'winking face wink playful'],
      ['😍', '花痴', '喜欢 爱', 'smiling face with heart eyes love crush'],
      ['🥰', '喜爱', '爱心 幸福', 'smiling face with hearts love happy'],
      ['😘', '飞吻', '亲亲', 'face blowing a kiss kiss love'],
      ['😋', '美味', '好吃', 'face savoring food yummy delicious'],
      ['😜', '吐舌眨眼', '调皮', 'winking face with tongue playful silly'],
      ['🤪', '疯狂脸', '搞怪', 'zany face crazy silly'],
      ['🤓', '书呆子', '眼镜 学习', 'nerd face glasses study'],
      ['😎', '酷', '墨镜', 'smiling face with sunglasses cool'],
      ['🥳', '庆祝脸', '派对 生日', 'partying face party birthday celebrate'],
      ['🤔', '思考', '疑问', 'thinking face think question'],
      ['🤭', '偷笑', '捂嘴', 'face with hand over mouth giggle laugh'],
      ['🤫', '安静', '嘘', 'shushing face quiet hush'],
      ['🙄', '白眼', '无语', 'face with rolling eyes eye roll whatever'],
      ['😮', '惊讶', '张嘴', 'face with open mouth surprised wow'],
      ['😳', '脸红', '害羞', 'flushed face embarrassed blush'],
      ['🥺', '恳求', '可怜', 'pleading face puppy eyes please'],
      ['😢', '难过', '流泪', 'crying face sad tear'],
      ['😭', '大哭', '伤心', 'loudly crying face sob sad'],
      ['😡', '生气', '愤怒', 'enraged face angry mad'],
      ['🤯', '震惊', '爆炸', 'exploding head mind blown shocked'],
      ['😱', '尖叫', '害怕', 'face screaming in fear scream afraid'],
      ['🫠', '融化', '尴尬', 'melting face awkward embarrassed'],
    ]),
  }),
  Object.freeze({
    id: 'gestures',
    label: '手势',
    icon: '👍',
    emojis: defineEmojiEntries([
      ['👍', '赞', '同意 很棒', 'thumbs up like approve yes'],
      ['👎', '踩', '反对 不赞同', 'thumbs down dislike disapprove no'],
      ['👌', '好的', '没问题', 'OK hand okay perfect'],
      ['✌️', '胜利', '剪刀手', 'victory hand peace'],
      ['🤞', '祝好运', '交叉手指', 'crossed fingers good luck'],
      ['🫰', '指心', '爱 钱', 'hand with index finger and thumb crossed finger heart money'],
      ['🤟', '爱你手势', '手语', 'love you gesture sign language'],
      ['🤘', '摇滚', '金属', 'sign of the horns rock metal'],
      ['🤙', '打电话', '联系我', 'call me hand shaka phone'],
      ['👈', '向左指', '左边', 'backhand index pointing left point left'],
      ['👉', '向右指', '右边', 'backhand index pointing right point right'],
      ['👆', '向上指', '上面', 'backhand index pointing up point up'],
      ['👇', '向下指', '下面', 'backhand index pointing down point down'],
      ['☝️', '注意', '第一', 'index pointing up attention one'],
      ['👋', '挥手', '你好 再见', 'waving hand wave hello goodbye'],
      ['👏', '鼓掌', '喝彩', 'clapping hands clap applause'],
      ['🙌', '举手庆祝', '万岁', 'raising hands celebrate hooray'],
      ['🫶', '爱心手', '喜欢', 'heart hands love'],
      ['🙏', '感谢', '祈祷 拜托', 'folded hands pray thanks please'],
      ['💪', '加油', '力量', 'flexed biceps strong muscle'],
    ]),
  }),
  Object.freeze({
    id: 'hearts',
    label: '心意',
    icon: '❤️',
    emojis: defineEmojiEntries([
      ['❤️', '红心', '爱 喜欢', 'red heart love'],
      ['🧡', '橙心', '爱', 'orange heart love'],
      ['💛', '黄心', '爱', 'yellow heart love'],
      ['💚', '绿心', '爱', 'green heart love'],
      ['💙', '蓝心', '爱', 'blue heart love'],
      ['💜', '紫心', '爱', 'purple heart love'],
      ['🖤', '黑心', '爱', 'black heart love'],
      ['🤍', '白心', '爱', 'white heart love'],
      ['🤎', '棕心', '爱', 'brown heart love'],
      ['💔', '心碎', '伤心', 'broken heart heartbreak sad'],
      ['💕', '两颗心', '喜欢', 'two hearts love'],
      ['💞', '旋转的心', '相爱', 'revolving hearts love'],
      ['💓', '心跳', '心动', 'beating heart heartbeat love'],
      ['💗', '成长的心', '喜欢', 'growing heart love'],
      ['💖', '闪亮的心', '喜欢', 'sparkling heart love'],
      ['💘', '丘比特之箭', '恋爱', 'heart with arrow cupid romance'],
      ['💝', '礼物心', '送爱', 'heart with ribbon gift love'],
      ['💯', '满分', '完美', 'hundred points perfect score'],
      ['💋', '唇印', '亲吻', 'kiss mark lips kiss'],
    ]),
  }),
  Object.freeze({
    id: 'nature',
    label: '自然',
    icon: '🐱',
    emojis: defineEmojiEntries([
      ['🐱', '猫', '小猫', 'cat face kitten'],
      ['🐶', '狗', '小狗', 'dog face puppy'],
      ['🐰', '兔子', '可爱', 'rabbit face bunny'],
      ['🦊', '狐狸', '动物', 'fox animal'],
      ['🐻', '熊', '动物', 'bear animal'],
      ['🐼', '熊猫', '动物', 'panda animal'],
      ['🐨', '考拉', '动物', 'koala animal'],
      ['🐯', '老虎', '动物', 'tiger face animal'],
      ['🦁', '狮子', '动物', 'lion animal'],
      ['🐸', '青蛙', '动物', 'frog animal'],
      ['🐵', '猴子', '动物', 'monkey face animal'],
      ['🦄', '独角兽', '幻想', 'unicorn fantasy'],
      ['🌸', '樱花', '花 春天', 'cherry blossom flower spring'],
      ['🌹', '玫瑰', '花 爱', 'rose flower love'],
      ['🌻', '向日葵', '花 阳光', 'sunflower flower sun'],
      ['🍀', '四叶草', '好运', 'four leaf clover luck'],
      ['🌈', '彩虹', '天气', 'rainbow weather'],
      ['🌙', '月亮', '晚安', 'crescent moon night goodnight'],
    ]),
  }),
  Object.freeze({
    id: 'food-activity',
    label: '食物与活动',
    icon: '🍰',
    emojis: defineEmojiEntries([
      ['🍎', '苹果', '水果', 'red apple fruit'],
      ['🍓', '草莓', '水果', 'strawberry fruit'],
      ['🍉', '西瓜', '水果', 'watermelon fruit'],
      ['🍑', '桃子', '水果', 'peach fruit'],
      ['🍒', '樱桃', '水果', 'cherries fruit cherry'],
      ['🍕', '披萨', '食物', 'pizza food'],
      ['🍔', '汉堡', '食物', 'hamburger burger food'],
      ['🍟', '薯条', '食物', 'french fries fries food'],
      ['🍿', '爆米花', '电影', 'popcorn movie snack'],
      ['🍰', '蛋糕', '甜点', 'shortcake cake dessert'],
      ['🎂', '生日蛋糕', '庆祝 生日', 'birthday cake party celebrate'],
      ['🍫', '巧克力', '甜食', 'chocolate bar candy sweet'],
      ['☕', '咖啡', '饮料', 'hot beverage coffee drink'],
      ['🍵', '茶', '饮料', 'teacup without handle tea drink'],
      ['🍻', '干杯', '啤酒', 'clinking beer mugs cheers beer'],
      ['🎉', '礼花', '庆祝 派对', 'party popper party celebrate'],
      ['🎊', '彩球', '庆祝', 'confetti ball party celebrate'],
      ['🎮', '游戏', '手柄', 'video game controller gaming'],
      ['🎵', '音乐', '音符', 'musical note music'],
      ['🏆', '奖杯', '胜利', 'trophy winner victory'],
    ]),
  }),
  Object.freeze({
    id: 'symbols',
    label: '符号',
    icon: '✨',
    emojis: defineEmojiEntries([
      ['🔥', '火', '热门 厉害', 'fire flame hot trending'],
      ['✨', '闪光', '漂亮', 'sparkles sparkle shiny'],
      ['⭐', '星星', '收藏', 'star favorite'],
      ['🌟', '闪亮星星', '优秀', 'glowing star excellent'],
      ['💫', '眩晕星', '闪耀', 'dizzy star sparkle'],
      ['⚡', '闪电', '快速', 'high voltage lightning fast'],
      ['💥', '碰撞', '爆炸', 'collision boom explosion'],
      ['✅', '完成', '正确 勾选', 'check mark button done correct complete'],
      ['❌', '错误', '取消', 'cross mark wrong cancel'],
      ['❓', '问号', '疑问', 'question mark question'],
      ['❗', '感叹号', '注意', 'exclamation mark alert'],
      ['⚠️', '警告', '危险', 'warning danger caution'],
      ['💡', '灯泡', '想法 灵感', 'light bulb idea inspiration'],
      ['📌', '图钉', '置顶', 'pushpin pin'],
      ['👀', '眼睛', '围观 看', 'eyes look watch'],
      ['🎁', '礼物', '惊喜', 'wrapped gift present surprise'],
      ['🚀', '火箭', '起飞 加速', 'rocket launch fast'],
      ['💤', '睡觉', '困', 'zzz sleep tired'],
      ['🗿', '石像', '无语', 'moai stone statue'],
      ['🤡', '小丑', '搞笑', 'clown face funny'],
    ]),
  }),
]);

const ALL_REACTION_EMOJIS = Object.freeze(REACTION_EMOJI_CATEGORIES.flatMap(category => (
  category.emojis.map(item => Object.freeze({ ...item, categoryId: category.id, categoryLabel: category.label }))
)));

export const getReactionEmojiCatalog = () => ALL_REACTION_EMOJIS.slice();

export const findReactionEmoji = (emoji = '') => (
  ALL_REACTION_EMOJIS.find(item => item.emoji === String(emoji || '').trim()) || null
);

export const filterReactionEmojiCatalog = (query = '', { categoryId = '' } = {}) => {
  const normalizedQuery = String(query || '').trim().toLocaleLowerCase('zh-CN');
  const normalizedCategory = String(categoryId || '').trim();
  return ALL_REACTION_EMOJIS.filter((item) => {
    if (normalizedCategory && item.categoryId !== normalizedCategory) return false;
    if (!normalizedQuery) return true;
    return `${item.emoji} ${item.label} ${item.keywords} ${item.englishKeywords} ${item.categoryLabel}`
      .toLocaleLowerCase('zh-CN')
      .includes(normalizedQuery);
  });
};

export const getTwemojiCodePoint = (emoji = '') => Array.from(String(emoji || '').trim())
  .map(char => char.codePointAt(0))
  .filter(codePoint => codePoint !== 0xfe0e && codePoint !== 0xfe0f)
  .map(codePoint => codePoint.toString(16))
  .join('-');

export const getTwemojiAssetPath = (emoji = '') => {
  const codePoint = getTwemojiCodePoint(emoji);
  return codePoint ? `./assets/emoji/twemoji/${codePoint}.svg` : '';
};
