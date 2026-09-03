// tools.js —— 工具定义（OpenAI function-calling 格式，供 llama.cpp / LM Studio /v1/chat/completions）
// 执行端在 src/content/dom-tools.js 的 execTool，按 function.name 分发。

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
    '读取当前步骤的表单快照：步骤标题、页面语言(lang)、是否为最终确认页(isConfirmStep)、所有可见字段(含 ref/类型/标签/当前值/校验错误)、以及可点按钮。注意：下拉组件的选项不在快照里，需要用 read_options 打开下拉读取。每进入新步骤或做完改动后都应重新调用以拿到最新 ref。',
    {}),
  fn('read_options',
    '打开某个下拉(select)，返回真实可选项。用于「接口动态返回」的字段（下拉选项需调用接口才拿到）——这些选项无法凭空知道，必须先读再选。可选 query 会先在该下拉自己的搜索框输入关键词（远程分页下拉必用，如搜某个词）。',
    {
      ref: { type: 'string', description: 'get_form 返回的字段 ref' },
      query: { type: 'string', description: '可选：搜索关键词；不传则返回当前列表（远程下拉只有第一页）' },
    },
    ['ref']),
  fn('fill_text',
    '向文本框/数字框/多行文本框/富文本(contenteditable)填值。按字段语义与表单语言填合理测试值（日文表单填地道日语，英文填英文，中文填中文）；数字框按标签单位填纯数字。',
    { ref: { type: 'string' }, value: { type: 'string' } },
    ['ref', 'value']),
  fn('choose_option',
    '为 select/radio/checkbox/switch 选一项。select/radio 传 option=标签文本或 value；select 传 option="first" 直接选第一个可用项（必填校验只要求非空时的最快路径，不确定选什么就用它）；checkbox 传 option="check" 或 "uncheck"(同意条款一律 check)；switch 传 option="on"、"off" 或 "toggle"；多选下拉(multiple=true)可多次调用选多个。需要特定选项时先 read_options。',
    { ref: { type: 'string' }, option: { type: 'string', description: '标签文本/value，first，或 check/uncheck，或 on/off/toggle' } },
    ['ref', 'option']),
  fn('set_date',
    '为日期选择器设置年月日。',
    { ref: { type: 'string' }, year: { type: 'integer' }, month: { type: 'integer' }, day: { type: 'integer' } },
    ['ref', 'year', 'month', 'day']),
  fn('click',
    '点击 get_form 返回的 actions/fields 里的某个按钮或可点元素(ref)。最常用：地址区填好邮编后点「自动带入地址/邮编搜索」类按钮，自动带出 都道府県/市区町村/町名 等地址字段。',
    { ref: { type: 'string' } },
    ['ref']),
  fn('upload_file',
    '向上传字段(kind="upload")上传一张测试图片（默认自动生成的 dummy PNG，或用户在设置里固定的图片）。每个必填的上传字段都调一次。',
    { ref: { type: 'string' } },
    ['ref']),
  fn('click_button',
    '点击导航按钮。target="next" 下一步、"back" 上一步。安全：最终确认页禁止前进/提交；「最终提交」类按钮（提交/送信/Submit/購入 等多语言）会被硬拦截，到确认页或单页表单填完请改用 finish。',
    { target: { type: 'string', enum: ['next', 'back'] } },
    ['target']),
  fn('finish',
    '任务结束时调用：已到最终确认页(不提交)，或无法继续而停止。summary 用中文简述完成到哪步、还需人工补什么(文件上传/某动态字段)。',
    { summary: { type: 'string' } },
    ['summary']),
]
