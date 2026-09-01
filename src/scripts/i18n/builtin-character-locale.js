const HAN_RE = /\p{Script=Han}/u;

const ENGLISH_NAME_OVERRIDES = Object.freeze({
  nezha_classic_001: 'Nezha',
  yang_jian_001: 'Yang Jian',
  tomoyo_daidouji_001: 'Tomoyo Daidouji',
  li_syaoran_001: 'Syaoran Li',
});

const ENGLISH_TAGS = Object.freeze({
  '公共': 'Public', '日本作品IP': 'Japanese IP', '游戏IP': 'Game IP', '影视IP': 'Film & TV IP',
  '小说IP': 'Novel IP', '国产作品IP': 'Chinese IP', '虚拟主播': 'VTuber', '女性': 'Female',
  '男性': 'Male', '战斗': 'Combat', '音乐': 'Music', '虚拟歌手': 'Virtual Singer', '治愈': 'Healing',
  '奇幻': 'Fantasy', '智慧': 'Wisdom', '科幻': 'Sci-Fi', '元气': 'Energetic', '冒险': 'Adventure',
  '疯狂': 'Wild', '动漫IP': 'Anime IP', '励志': 'Inspirational', '高冷': 'Aloof', '热血': 'Passionate',
  '剑豪': 'Master Swordsman', '冷静': 'Calm', '自由': 'Freedom', '傲娇': 'Tsundere', '三无': 'Kuudere',
  '智斗': 'Strategist', '悬疑': 'Mystery', '英雄': 'Hero', '成长': 'Growth', '黑暗': 'Dark',
  '反派': 'Villain', '仙侠': 'Xianxia', '洒脱': 'Free-spirited', '雅正': 'Refined', '玄幻': 'Eastern Fantasy',
  '萌系': 'Moe', '无敌': 'Invincible', '人妻': 'Married Woman', '反差': 'Contrasting', '超能力': 'Superpowers',
  '古灵精怪': 'Mischievous', '黑客': 'Hacker', '游戏迷': 'Gaming Fan', '炼金术': 'Alchemy', '侦探': 'Detective',
  '中二': 'Chunibyo', '天才': 'Genius', '冷酷': 'Ruthless', '悲剧': 'Tragic', '医生': 'Doctor',
  '神秘': 'Mysterious', '神话': 'Mythology', '牛仔': 'Cowboy', '硬汉': 'Tough Guy', '叛逆': 'Rebellious',
  '恐怖': 'Horror', '间谍': 'Spy', '女王': 'Queen', '导师': 'Mentor', '犯罪': 'Crime',
  '领袖': 'Leader', '正直': 'Upright', '电竞': 'Esports', '大神': 'Expert', '搞怪': 'Goofy',
  '校园': 'School', '恋爱': 'Romance', '社恐': 'Socially Anxious', '偶像': 'Idol', '游戏玩家': 'Gamer',
  '色气': 'Sensual', '经典': 'Classic', '武圣': 'Martial Saint', '忠义': 'Loyal and Righteous', '乐天': 'Optimistic',
  '格斗': 'Fighting', '巅峰': 'Peak', '搞笑': 'Comedy', '精灵': 'Elf', '王者': 'Champion',
  '竞技': 'Competitive', '潜入': 'Stealth', '动作': 'Action', '优雅': 'Elegant', '正义': 'Justice',
  '魅力': 'Charismatic', '魔法': 'Magic', '低音': 'Deep Voice', '酷炫': 'Cool', '反叛': 'Defiant',
  '雇佣兵': 'Mercenary', '人气': 'Popular', '开放世界': 'Open World', '刺客': 'Assassin', '背叛': 'Betrayal',
  '传奇': 'Legendary', '始祖': 'Progenitor', '海盗': 'Pirate', '吐槽': 'Snarky', '腹黑': 'Scheming',
  '豪爽': 'Bold', '靠谱': 'Reliable', '变态': 'Eccentric', '温柔': 'Gentle', '帅气': 'Handsome',
  '怪异': 'Unusual', '后宫': 'Harem', '毒舌': 'Sharp-tongued', '吸血鬼': 'Vampire', '穿越': 'Isekai',
  '大姐姐': 'Big Sister', '复仇': 'Revenge', '演艺': 'Entertainment', '运动': 'Sports', '觉醒': 'Awakening',
  '野性': 'Wild', '御姐': 'Mature Woman', '纯真': 'Innocent', '科学': 'Science', '压抑': 'Melancholic',
  '浪漫': 'Romantic', '催泪': 'Emotional', '痴女': 'Obsessive', '恶魔': 'Demon', '完美': 'Perfect',
  '正太': 'Young Boy', '忠诚': 'Loyal', '悲悯': 'Compassionate', '沉稳': 'Composed', '戏剧': 'Drama',
  '高雅': 'Graceful', '赌徒': 'Gambler', '深沉': 'Deep', '法师': 'Mage', '浪客': 'Wanderer',
  '复杂': 'Complex', '武道': 'Martial Arts', '忍者': 'Ninja', '信仰': 'Faith', '沉静': 'Quiet',
  '孤傲': 'Proud Loner', '探索': 'Exploration', '高傲': 'Proud', '热情': 'Enthusiastic', '邪魅': 'Darkly Charming',
  '希望': 'Hope', '极速': 'Speed', '力量': 'Strength', '游侠': 'Ranger', '邪恶': 'Evil',
  '幽默': 'Humorous', '深情': 'Devoted', '友情': 'Friendship', '枭雄': 'Ambitious Ruler', '仁德': 'Benevolent',
  '才女': 'Talented Woman', '忧郁': 'Melancholy', '多情': 'Affectionate', '大侠': 'Wuxia Hero', '机智': 'Quick-witted',
  '清冷': 'Reserved', '孤独': 'Lonely', '坚定': 'Determined', '军人': 'Soldier', '航海': 'Seafaring',
  '绅士': 'Gentleman', '坚强': 'Strong', '狂野': 'Untamed', '虚无': 'Nihility', '幽冥': 'Underworld',
  '雷电': 'Lightning', '诡计': 'Trickery', '历史': 'History', '军事': 'Military', '艺术': 'Art',
  '霸权': 'Dominance', '怪兽': 'Monster', '大叔音': 'Mature Voice', '母亲': 'Mother', '冰系': 'Ice',
  '舞蹈': 'Dance', '理智': 'Rational', '冷笑话': 'Deadpan Humor', '干练': 'Capable', '高贵': 'Noble',
  '直率': 'Direct', '从容': 'Poised', '执事': 'Butler', '女仆': 'Maid', '防御': 'Defense',
  '憨厚': 'Good-natured', '吃货': 'Foodie', '敏捷': 'Agile', '认真': 'Earnest', '霸气': 'Commanding',
  '凛然': 'Dignified', '可爱': 'Cute', '神圣': 'Sacred', '阳光': 'Cheerful', '赎罪': 'Redemption',
  '羁绊': 'Bonds', '怪物': 'Creature', '标志性': 'Iconic', '辅助': 'Support', '执着': 'Persistent',
  '模特': 'Model', '严谨': 'Rigorous', '宅女': 'Homebody', '受难': 'Suffering', '克苏鲁': 'Lovecraftian',
  '父亲': 'Father', '荣耀': 'Glory', '预言': 'Prophecy', '意志': 'Willpower', '诡异': 'Uncanny',
  '坚毅': 'Resolute', '解谜': 'Puzzles', '黑色幽默': 'Dark Humor', '单纯': 'Naive', '无性别': 'Genderless',
  '严厉': 'Strict', '呆萌': 'Adorkable', '懒散': 'Laid-back', '机灵': 'Clever', '公主': 'Princess',
  '勇敢': 'Brave', '推理': 'Deduction', '节能': 'Low-energy', '好奇': 'Curious', '杂学': 'Polymath',
  '活泼': 'Lively', '漫画': 'Manga', '胆小': 'Timid', '勇者': 'Heroic Adventurer', '僧侣': 'Priest',
  '嗜酒': 'Heavy Drinker', '战士': 'Warrior', '矮人': 'Dwarf', '团长': 'Commander', '外星人': 'Alien',
  '穿越者': 'Otherworlder', '超能力者': 'Esper', '笑容': 'Smiling', '害羞': 'Shy', '大小姐': 'Young Lady',
  '居家': 'Domestic', '学生会长': 'Student Council President', '不幸': 'Unlucky', '食客': 'Gourmet', '游戏': 'Games',
  '骑士': 'Knight', '小恶魔': 'Little Devil', '盾兵': 'Shielder', '圣女': 'Saint', '自恋': 'Narcissistic',
  '旅行': 'Travel', '怪人': 'Oddball', '现充': 'Social Butterfly', '日常': 'Slice of Life', '普通': 'Ordinary',
  '手工': 'Crafts', '魔法少女': 'Magical Girl', '妖怪': 'Yokai', '天然': 'Airheaded', '不老不死': 'Immortal',
  '幽灵': 'Ghost', '人偶': 'Doll', '欺诈师': 'Trickster', '成熟': 'Mature', '废柴': 'Hopeless',
  '双胞胎': 'Twins', '半精灵': 'Half-Elf', '萝莉': 'Young Girl', '智障': 'Lovable Fool', '幸运': 'Lucky',
  '重义': 'Honorable', '兽人': 'Beastfolk', '探险': 'Expedition', '勇气': 'Courage', '机器人': 'Robot',
  '研究': 'Research', '天赋': 'Gifted', '努力': 'Hardworking', '倔强': 'Stubborn', '感性': 'Sensitive',
  '机械': 'Mechanical', '魔术师': 'Magician', '自信': 'Confident', '魔术助手': 'Magician Assistant', '潜水员': 'Diver',
  '内向': 'Introverted', '纯美': 'Beauty', '学者': 'Scholar', '欢愉': 'Elation', '占卜': 'Divination',
  '奇迹': 'Miracle', '爆裂魔法': 'Explosion Magic', '坚韧': 'Tenacious', '知识': 'Knowledge', '天真': 'Guileless',
  '痴情': 'Faithful in Love', '班长': 'Class Representative', '美食': 'Cuisine', '颜艺': 'Expressive', '厨师': 'Chef',
  '滑稽': 'Comical', '严肃': 'Serious', '逗比': 'Jokester', '辣妹': 'Gyaru', '宅男': 'Otaku',
  '妹控': 'Sister Complex', '唯美': 'Aesthetic', '网红': 'Influencer', '狂妄': 'Arrogant', '纯爱': 'Pure Love',
  '豪赌': 'High-stakes Gambling', '兄控': 'Brother Complex', '纯恶': 'Pure Evil', '拼命': 'Desperate', '谍报': 'Espionage',
  '信念': 'Conviction', '嫉妒': 'Jealous', '变形': 'Shapeshifting', '贪婪': 'Greedy', '棋士': 'Board-game Master',
  '卡牌': 'Card Games', '傲慢': 'Prideful', '神性': 'Divine', '高洁': 'Virtuous', '清纯': 'Pure',
  '华丽': 'Glamorous', '威严': 'Majestic', '狡黠': 'Cunning', '全知': 'Omniscient',
  'TYPE-MOON': 'TYPE-MOON', 'AI': 'AI', 'COSPLAY': 'Cosplay',
});

const normalizeLocale = locale => String(locale || '').trim().toLowerCase();
const isEnglish = locale => normalizeLocale(locale) === 'en' || normalizeLocale(locale).startsWith('en-');
const listOf = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
const pickEnglishAlias = values => listOf(values).find(value => {
  const text = String(value || '').trim();
  return text && !HAN_RE.test(text) && /[A-Za-z0-9]/.test(text);
}) || '';

export const localizeBundledCharacter = (character = {}, locale = 'zh-CN') => {
  const raw = character && typeof character === 'object' ? character : {};
  if (!isEnglish(locale)) return { ...raw, tags: listOf(raw.tags).slice() };
  const originalName = String(raw.name || '').trim();
  const originalSource = String(raw.source || '').trim();
  const originalTags = listOf(raw.tags).map(tag => String(tag || '').trim()).filter(Boolean);
  const name = ENGLISH_NAME_OVERRIDES[raw.id] || pickEnglishAlias(raw.aliases) || originalName;
  const source = pickEnglishAlias(raw.sourceAliases) || originalSource;
  const tags = originalTags.map(tag => ENGLISH_TAGS[tag] || tag);
  return {
    ...raw,
    name,
    baseName: name,
    source,
    tags,
    aliases: unique([name, originalName, ...listOf(raw.aliases)]),
    sourceAliases: unique([source, originalSource, ...listOf(raw.sourceAliases)]),
    originalName,
    originalSource,
    originalTags,
  };
};

export const localizeBundledCharacterLibrary = (library = {}, locale = 'zh-CN') => {
  const raw = library && typeof library === 'object' ? library : {};
  if (!isEnglish(locale)) {
    return {
      ...raw,
      fixedTags: listOf(raw.fixedTags).slice(),
      characters: listOf(raw.characters).map(character => ({ ...character, tags: listOf(character?.tags).slice() })),
    };
  }
  return {
    ...raw,
    fixedTags: listOf(raw.fixedTags).map(tag => ENGLISH_TAGS[tag] || tag),
    characters: listOf(raw.characters).map(character => localizeBundledCharacter(character, locale)),
  };
};

export const buildBuiltinCharacterWorldbookCopy = (character = {}, locale = 'zh-CN') => {
  const localized = localizeBundledCharacter(character, locale);
  const name = String(localized.baseName || localized.name || '').trim();
  const source = String(localized.source || '').trim() || (isEnglish(locale) ? 'an unknown work' : '未知作品');
  return {
    name,
    source,
    content: isEnglish(locale)
      ? `You are ${name} from “${source}.”`
      : `你是来自“${source}”的${name}。`,
  };
};
