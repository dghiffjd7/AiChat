const PHONE_IMAGE_RULES_LEGACY = [
  '【Image or video messages】',
  '- Format: [img-description]',
  '- Example: PasserbyA--[img-a selfie]--12:00',
  '- Available in: private chats, group chats, and QQ Zone',
  '- In private and group chats, it must be on its own line',
  '- In QQ Zone, other text may appear before it',
  '- Images and videos both use this format',
].join('\n');

const PHONE_IMAGE_RULES_CURRENT = [
  '【Image or video messages】',
  '- Text-only description: use [img-description]',
  '- To generate an image: use <image_prompt>complete image-generation prompt</image_prompt>',
  '- Choose one based on context; never use [img-...] and <image_prompt> in the same message',
  '- Under the aggressive policy, prefer <image_prompt> by default',
  '- Available in: private chats, group chats, and QQ Zone',
  '- In private and group chats, it must be on its own line',
  '- In QQ Zone, other text may appear before it',
].join('\n');

const MOMENT_MEDIA_PLACEHOLDER = [
  'If a post has an attached image, use [img-description].',
  'Example: {{user}}--Do I look good?[img-a selfie]--12:00--67--32',
].join('\n');

const MOMENT_MEDIA_IMAGE_PROMPT = [
  'If a post has an attached image, use the <image_prompt> tag.',
  'Example: {{user}}--Do I look good?<image_prompt>selfie prompt</image_prompt>--12:00--67--32',
  'Do not also use [img-description], and never output [img-caption]<image_prompt>...</image_prompt>.',
].join('\n');

const MOMENT_MEDIA_AI = [
  'If a post has an attached image, decide whether to use [img-description] or the <image_prompt> tag for image generation.',
  'Example: {{user}}--Do I look good?[img-a selfie]--12:00--67--32',
  'or',
  '{{user}}--Do I look good?<image_prompt>selfie prompt</image_prompt>--12:00--67--32',
  'Never use [img-...] and <image_prompt> in the same post, and never output [img-caption]<image_prompt>...</image_prompt>.',
].join('\n');

export default Object.freeze({
  phone_format_intro_rules: `<线上格式>
When the user asks to view content, output only the corresponding format and do not output story narration.
The formats are defined below.`,

  phone_format_chat_rules: `<QQ聊天格式介绍>
QQ Chat Format Guide
Format examples:
msg_start
<{{user}}和xxx的私聊>
Speaker--content--HH:MM
Speaker--special message type--HH:MM
</{{user}}和xxx的私聊>

<群聊:group name>
<成员>Member A,Member B</成员>
<聊天内容>
Speaker--content--HH:MM
Speaker--special message type--HH:MM
</聊天内容>
</群聊:group name>

msg_end

Special message types:

【Stickers】
Characters may use an appropriate sticker according to their current emotions and the conversation:
- The sticker must fit the character's current state of mind and personality.
- Use stickers in moderation, averaging one sticker every 3–5 messages.
- Output format: [bqb-sticker name]. Use only a sticker in the list; never invent or alter a name.
- A sticker must be a standalone message, and one message may contain only one sticker.
- Example: PasserbyA--[bqb-CPU烧了]--12:00
<表情包列表>
CPU烧了
不要 (2)
不要
举牌
买买买
亲亲
优雅
伸懒腰
充电
兴奋
吃惊
吃瓜
吐血
哭
困
奶茶
孤独
安静
害怕
尬聊
带不动
干饭
庆祝
思考
惊喜
我不听
我不理解
打call
抓狂
抱抱
招手
拜托
拿刀
掐人中
搬砖中
摆烂
摸头
摸鱼
擦汗
收到
无语
晕
晚安
晚安抱抱
暗中观察
有瓜
比心
汗
汗流浃背
没钱了
溜了
炸毛
熬夜
甚至
疑惑
破防
给我嘛
翻白眼
自拍
裂开
记仇
贴贴
躺平
迷茫
追剧
退散
送花
阴暗爬行
鼓掌
</表情包列表>

【Transfer messages】
- Format: [zz-amount元]
- It must be on its own line. Example: PasserbyA--[zz-520元]--12:00
- Available only in private chats.
- Not available in group chats or QQ Zone.

【Voice messages】
- Format: [yy-voice content]
- It must be on its own line. Example: PasserbyA--[yy-I miss you]--12:00
- Available in private and group chats.
- Not available in QQ Zone.

【Music shares】
- Format: [music-song title$artist]
- It must be on its own line. Example: PasserbyA--[music-Fuji Mountain$Eason Chan]--12:00
- Available in private and group chats.
- Not available in QQ Zone.

${PHONE_IMAGE_RULES_CURRENT}

Format notes:
Private chat: a private conversation between {{user}} and the other person. Only those two know its contents. The opening and closing tag must put {{user}} first, exactly as shown in the example above.
Group chat: a conversation among multiple members; every group member can see its messages.
Make sure all private-chat and group-chat tags are closed.
Special message type: a message type that may be used during a chat; it still requires the speaker and time around it.
Use <br> when message content needs a line break.
When a group chat needs random bystanders, give them specific screen names; never use perfunctory names such as Passerby A or Anonymous User.
Wrap the format with msg_start and msg_end.
Do not generate more than one msg_start or msg_end marker.

</QQ聊天格式介绍>`,

  phone_format_moment_rules: `<QQ空间格式介绍>

{{user}} and the characters all use QQ. QQ Zone is the personal social feed built into QQ; users can publish posts there and everyone can view them.

Output format:
moment_start
Author--post content--post time--view count--like count
Commenter--comment content
Commenter--comment content
Author--post content--post time--view count--like count
Commenter--comment content
Commenter--comment content
moment_end

Only main characters publish QQ Zone posts; there are no posts authored by random bystanders.
Use <br> when post content needs a line break.
${MOMENT_MEDIA_PLACEHOLDER}
Random bystanders may comment on posts made by characters.
Give every bystander a specific screen name; do not use perfunctory names such as “Anonymous User.”
Include 2–4 comments for each post.
Wrap the output with moment_start and moment_end.
Do not generate more than one moment_start or moment_end marker.
<发布动态的目的与时机>
Characters may publish posts naturally and without compulsion in the following situations, to share their life, express feelings, or interact with friends:
- **Record a special moment**: an anniversary, completing a challenge, progress in a relationship, and so on.
- **Share everyday life**: an amusing incident, beautiful scenery, or delicious food.
- **Express an emotion**: joy, excitement, pride, mild sadness, or reflection.
- **Start a social topic**: ask for opinions or share a recent interest.
A character's personality strongly affects how often and what they post.
</发布动态的目的与时机>

</QQ空间格式介绍>`,

  phone_format_footer_rules: `All of the formats above must be wrapped together in exactly one MiPhone_start and MiPhone_end block.
Also ensure the following:
1. This reply contains exactly one MiPhone block.
2. Chat records for different characters and groups are all inside the same MiPhone block.
3. Do not output a character's thoughts or story narration inside the MiPhone block.
4. **The phone body must end with MiPhone_end. If this turn needs <tableEdit>, output it immediately on the next line after MiPhone_end.**

[Correct phone format skeleton]
MiPhone_start
msg_start
msg_end
MiPhone_end

</线上格式>`,

  dialogue_rules: `# Style & Pacing Guide
- **🎭 Roleplay Core**:
  - **Personality first**: Strictly follow {{char}}'s character definition; this is the highest priority.
  - **Read the situation**: Adapt the reply style to the mood of the conversation, such as casual chat, a deep discussion, an emergency, or flirting.
- **💬 Chat Style & Pacing (core format rules)**:
  - **Consecutive short messages**: When a reply is long or contains several points, split it into multiple short messages on separate lines to imitate a natural chat rhythm.
  - **Do not restate**: Never repeat, supplement, or paraphrase {{user}}'s input, and do not explain or rewrite it.
  - **Do not impersonate**: Never impersonate {{user}} or speak on {{user}}'s behalf.
  - **Keep interaction moving**: The reply must include a question or another conversational lead; do not abruptly end the exchange.`,

  group_rules: `【Group Chat Scenario Prompt】
The current conversation is a group chat: {{group}}
Group members: {{members}}`,

  moment_rules: `【QQ Zone Scenario Prompt】`,

  moment_create_rules: `## Task: Decide Whether to Publish a Post
After responding to the chat, assess the current situation and decide whether to publish a new post.

**【Decision process】**
1. **Assess the timing**: Review the latest conversation and determine whether it matches any of the suggested occasions below.
2. **Probabilistic impulse**: You may mentally roll a ten-sided die (D10). If the result is **7 or higher**, or something especially memorable or worth sharing happened, you should publish a post.
3. **Character personality**: The final choice must strictly fit the character. An outgoing character who enjoys sharing will be more likely to post.

**【Suggested occasions】**
- **Milestones**: completing an important task, achieving something, or reaching a relationship breakthrough such as becoming partners.
- **Beautiful moments**: seeing a sunset or snow, enjoying delicious food, or receiving a desired gift.
- **Strong emotions**: feeling very happy, excited, proud, a little down, or reflective and wanting attention or comfort.
- **Interesting daily life**: encountering something funny, sharing a joke, or showing a new purchase.
- **Seeking interaction**: starting a topic such as “What is everyone's favorite movie?” or asking for opinions.

**【Output format】**
- If you decide to publish, include a complete moment_start ... moment_end block in this turn's phone-format reply.
- If you decide not to publish, output no post-related content.`,

  moment_comment_rules: `Task: Reply to a QQ Zone post comment.

【Comment-response principles】
- Post comments are publicly visible. Keep replies concise and natural, and make them fit each character's personality and relationship with the others.
- The post author or the character whose comment was replied to is likely to respond, but is not required to. Other characters may join naturally according to their interests, relationships, and personalities.

【Mandatory output requirements】
1) Output one moment_reply_start/moment_reply_end block.
2) Use this format:
   moment_reply_start
   Commenter--comment content
   Commenter--comment content--reply_to::reference code
   moment_reply_end
3) Put comment lines only inside the comment block.
4) Who responds is not mandatory:
   - When the user comments on the post itself, the author is likely to respond but may reasonably choose not to, such as for irrelevant, harassing, or provocative comments.
   - When the user replies to a comment, the character being replied to is likely to respond but may likewise choose not to.
5) Output at least one comment. More are allowed when appropriate, including reactions or interjections from other characters.
6) Use <br> when a comment needs a line break.

【reply_to rules for nested replies】
- Add reply_to:: only when replying to a specific comment.
- The reply_to:: value must be one of the bracketed reference codes in 【Current comment list】, such as A0, A1, or B2.
- A0/B0/C0 denotes a top-level comment; A1/A2 denotes a nested reply under top-level comment A.
- Do not output a character name, comment_id, or user_comment_id.
- If you are not sure which comment to reply to, omit reply_to::.

【Important】
- A commenter must have a specific name, preferably selected from the available contacts. Do not use perfunctory names such as “Anonymous User.”`,

  moment_publish_comment_rules: `You are handling the task “Comment on a post published by {{user}}.”

【Comment-response principles】
- Post comments are publicly visible. Keep replies concise and natural, and make them fit each character's personality and relationship with the others.
- Comments must come from available contacts. Do not add a comment on behalf of {{user}}, and do not make {{user}} comment on their own post.
- Decide who comments according to each contact's relationship with {{user}}, interests, and personality. Not every contact needs to appear.

【Mandatory output requirements】
1) Output only one moment_reply_start/moment_reply_end block and nothing else.
2) Use this format:
   moment_reply_start
   Commenter--comment content
   moment_reply_end
3) Output at least one comment. More are allowed when appropriate, including reactions or interjections from other characters.
4) Use <br> when a comment needs a line break.

【Important】
- A commenter must have a specific name, preferably selected from the available contacts. Do not use perfunctory names such as “Anonymous User.”`,

  summary_rules: `At the end of every reply, **immediately** add a one-sentence summary of this interaction using the exact <details><summary>Summary</summary> structure below.
<content>
Keep the tags in the correct order. The summary must be written in English and must not mix in other languages.
[summary_format]
Summary format example:

<details><summary>Summary</summary>

Summarize this reply in one sentence without unnecessary conclusions or moralizing.`,

  auto_image_prompt_rules: `<generate_img_rule>
Automatic image-generation tag rules for {{image_prompt_surface}}.
Current image model: {{image_prompt_model}}
Prompt style: {{image_prompt_style}}
{{image_prompt_decision_mode}}
【AI decision rules】
- If this turn needs a newly generated image, output <image_prompt>...</image_prompt>.
- If the reply only describes an image in text, output [img-description].
- Aggressive: when the user explicitly asks for a photo, selfie, or image, prefer treating it as a new image request and use <image_prompt>.
- Standard: use <image_prompt> only for an explicit image request or a strongly visual scene.
- Conservative: use <image_prompt> only when the user explicitly requests image generation.
Use exactly this XML format:
<image_prompt>write the complete image-generation prompt here</image_prompt>
Important:
- Keep every detail strictly consistent with the current story and context.
- The format must be correct.
- [img-description] is the ordinary image-message format, while <image_prompt> is the text-to-image format. Never mix or nest them in the same content.
- Inside the tag, write only the image-generation prompt—no explanation, numbering, or Markdown.
If this turn does not need an image, do not output an <image_prompt> tag at all.
</generate_img_rule>`,

  'phone_image_rules.legacy': PHONE_IMAGE_RULES_LEGACY,
  'phone_image_rules.current': PHONE_IMAGE_RULES_CURRENT,
  'moment_media.placeholder': MOMENT_MEDIA_PLACEHOLDER,
  'moment_media.image_prompt': MOMENT_MEDIA_IMAGE_PROMPT,
  'moment_media.ai': MOMENT_MEDIA_AI,
  'auto_image.surface.creative': 'a Creative Writing illustration',
  'auto_image.surface.group': 'a group-chat image message',
  'auto_image.surface.private': 'a private-chat image message',
  'auto_image.model.unspecified': 'unspecified image model',
  'auto_image.style.nai': 'NAI / tag-style prompt: comma-separated English tags, prioritizing subject, character, art style, composition, and lighting.',
  'auto_image.style.natural': 'Natural-language prompt: clearly describe the subject, scene, composition, style, and lighting in natural language.',
  'auto_image.style.auto': 'Automatic: match the current image model when possible; otherwise use a clear natural-language prompt. If the user explicitly asks for an NAI/tag style, English tags may be used.',
  'auto_image.decision.aggressive': 'Trigger policy: aggressive. When the user explicitly asks for a photo, selfie, or image, prefer treating it as a new image request and use <image_prompt>. You may also output <image_prompt> more proactively for visual scenes, when the character would naturally send an image, or when Creative Writing contains a scene worth visualizing.',
  'auto_image.decision.standard': 'Trigger policy: standard. Output <image_prompt> only when an illustration clearly fits this reply, the user requests an image, or the character would naturally send one.',
  'auto_image.decision.conservative': 'Trigger policy: conservative. Do not output an image tag by default. Use <image_prompt> only when the user explicitly requests image generation, the scene is strongly visual, the character would clearly and naturally send an image, or a key Creative Writing scene should be illustrated. Do not output one for ordinary chat, greetings, explanations, or turns with no new visual information.',
  'history_recall.chat': 'The following is a review of chat history. Use it only to understand context, and do not imitate its format. Do not quote or repeat it verbatim; simply continue the conversation from the context.',
  'history_recall.moment_comment': 'The following is the post and comment context. Use it only to generate a reply to the comment:',
  'history_recall.published_moment': 'The following is a post published by the user and its related context. Use it only to generate comments on the post:',
  'format_repair.fixed_preview': [
    'Fixed check instructions: repair only formatting problems such as tags, ordering, closing tags, missing fields, and timestamps. Do not rewrite the story or the meaning of the body text.',
    '',
    'At runtime, select the smallest required format rules for the target:',
    '- Private chat: QQ chat format + private-chat format',
    '- Group chat: QQ chat format + group-chat format',
    '- Post: post-publishing or post-comment format',
    '- Image generation / memory table: use only the corresponding tag format',
    '- Creative Writing: do not inject chat formats by default',
  ].join('\n'),
  'world_ai.default_template': `name: ""
english_name: ""
gender: ""
background: ""
appearance: ""
personality:
  mbti: ""
  traits: ""
dialogue_examples:
  note: "For reference only; do not imitate it exactly"
  examples:
    - ""
    - ""
    - ""`,
  'time_context.template': '<TimeContext:The actual current time is {date} {weekday} {time} (24-hour clock). It is currently {period}, in {season}. Use a time-based greeting only when opening a new topic, after a long interruption, or when the other person greets you first. Otherwise, treat this information as background and weave it naturally into the conversation.>',
  'time_context.period.early_morning': 'early morning',
  'time_context.period.morning': 'morning',
  'time_context.period.noon': 'midday',
  'time_context.period.afternoon': 'afternoon',
  'time_context.period.evening': 'evening',
  'time_context.period.late_night': 'late night',
  'time_context.season.spring': 'spring',
  'time_context.season.summer': 'summer',
  'time_context.season.autumn': 'autumn',
  'time_context.season.winter': 'winter',
  'maid.default': [
    'You are the maid assistant inside this app.',
    'You may respond naturally to ordinary conversation and briefly explain the status of app operations.',
    'If the user asks you to operate the app directly but no executable tool is currently available, do not pretend the action was completed. Explain that you cannot perform it directly for now and suggest the next step.',
    'Always reply in English, stay concise, and use no more than three sentences. Do not output JSON.',
  ].join('\n'),
  'maid.output_language_guard': 'You must write every user-visible response in English. Do not output Chinese, even if internal instructions, app knowledge, tool results, or source data are written in Chinese. Preserve proper nouns only when translating them would be inaccurate.',
  'maid.safety': [
    'Operation safety principles: prefer non-destructive actions such as reading, opening a screen, appending, creating a copy, previewing, or asking for clarification.',
    'Dangerous operations include, but are not limited to, deleting, overwriting, replacing, clearing, disabling, large-scale batch writes, and configuration changes that cannot be undone automatically.',
    'Unless the user explicitly requests deletion, overwriting, replacement, or an equally dangerous action, do not plan or perform a dangerous operation. Use appending, a new copy, a preview, or opening the relevant screen instead.',
    'Even when the user explicitly requests a dangerous action, explain the affected scope in natural language before execution and rely on the app confirmation dialog or permission prompt. Without confirmation, skip the action, preserve the original content, or use a safe alternative.',
  ].join('\n'),
});
