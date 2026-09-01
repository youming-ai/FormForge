// tools.js —— 工具定义（OpenAI function-calling 格式，供 LM Studio /v1/chat/completions）
// 执行端在 content.js，按 function.name 分发。

function fn (name, description, properties, required) {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: { type: 'object', properties: properties || {}, required: required || [] },
    },
  }
}

export const TOOLS = [
  fn('get_form',
    '读取当前步骤的表单快照：步骤标题、是否为最终确认页(isConfirmStep)、所有可见字段(含 ref/类型/标签/当前值/校验错误)、可点按钮、以及 actions(可点按钮/快捷链接，如「住所自動入力」「代表者と同一」)。每进入新步骤或做完改动后都应重新调用以拿到最新 ref。',
    {}),
  fn('read_options',
    '打开某个下拉(select)，返回真实可选项。用于业种/利用シーン/支付方式/计划/银行/支店等「接口动态返回」的字段——这些选项无法凭空知道，必须先读再选。可选 query 会先在该下拉自己的搜索框输入关键词。',
    {
      ref: { type: 'string', description: 'get_form 返回的字段 ref' },
      query: { type: 'string', description: '可选：下拉搜索词，例如 飲食業；不传则返回当前列表' },
    },
    ['ref']),
  fn('fill_text',
    '向文本框/多行文本框/数字金额框（資本金/年商/店舗数等）填值。日语字段填地道日语测试值(汉字/片假名/罗马字按字段要求)，数字字段填纯数字。',
    { ref: { type: 'string' }, value: { type: 'string' } },
    ['ref', 'value']),
  fn('choose_option',
    '为 select/radio/checkbox/可点卡片(cards) 选一项。select/radio/cards 传 option=标签文本或卡片标题；checkbox 传 option="check" 或 "uncheck"(同意条款一律 check)；cards(料金プラン/取引形態)传卡片标题。select 不确定合法 option 时先调 read_options。',
    { ref: { type: 'string' }, option: { type: 'string', description: '标签文本/卡片标题/value，或 check/uncheck' } },
    ['ref', 'option']),
  fn('set_date',
    '为日期选择器设置年月日(如生年月日、オープン予定日、設立日)。',
    { ref: { type: 'string' }, year: { type: 'integer' }, month: { type: 'integer' }, day: { type: 'integer' } },
    ['ref', 'year', 'month', 'day']),
  fn('click',
    '点击 get_form 返回的 actions 里的按钮/可点元素(ref)。最常用：「住所自動入力」(填完邮编后带出地址)、「検索：法人番号」(填完13位后自动带出法人格/会社名/邮编)、带 [已选✓]/[未选] 前缀的 CheckButton 快捷复制(如「代表者と同一」「お店と同じ情報」)。',
    { ref: { type: 'string' } },
    ['ref']),
  fn('upload_file',
    '向上传字段(kind="upload"，如身分证/登记簿/口座确认书等提出書類)上传一张测试图片（默认自动生成的 dummy PNG，或用户在设置里固定的图片）。每个必填的上传字段都调一次。',
    { ref: { type: 'string' } },
    ['ref']),
  fn('click_button',
    '点击导航按钮。target="next" 下一步、"back" 上一步。安全：最终确认页禁止前进/提交，到确认页请改用 finish。',
    { target: { type: 'string', enum: ['next', 'back'] } },
    ['target']),
  fn('finish',
    '任务结束时调用：已到最终确认页(不提交)，或无法继续而停止。summary 用中文简述完成到哪步、还需人工补什么(文件上传/某动态字段)。',
    { summary: { type: 'string' } },
    ['summary']),
]
