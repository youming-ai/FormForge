// index.js —— background 入口（service worker, module）
// 跑 OpenAI 兼容(LM Studio/llama.cpp)的工具调用循环，驱动 content 执行 DOM 操作
// 同一轮的多个 tool_calls 并行下发执行（互不依赖的 DOM 操作同时进行，select 在 content 侧自动排队）
import { TOOLS } from './tools.js'
import { buildSystemPrompt } from './system-prompt.js'
import { getSettings, resolveModel, callLLM, parseArgs, toResultString, briefInput } from './llm.js'

const MAX_TURNS = 120
// 上下文滑动窗口：保留最近 N 条消息，更早的 tool 结果压缩为一条说明。
// 因为 agent 每步都重新 get_form 拿当前完整状态，旧快照基本冗余；压缩可显著降低长跑时的
// 上下文长度 → 每 token 延迟与 KV cache 占用（对 30B 模型尤其重要）。
const MAX_KEPT_MESSAGES = 40

const aborted = new Set()
const running = new Set()
// 每个 tab 正在运行任务的请求中止控制器：用户「停止」时实时中断 in-flight LLM 请求
const controllers = new Map()

const sleep = ms => new Promise(r => setTimeout(r, ms))

// 压缩消息历史：保留 system + 一条压缩说明 + 最近若干条（从非 tool 消息边界开始，避免孤立 tool 结果开头）
function compressHistory (messages) {
  if (messages.length <= MAX_KEPT_MESSAGES) return messages
  const head = messages[0] // system
  let start = messages.length - (MAX_KEPT_MESSAGES - 2)
  while (start < messages.length && messages[start].role === 'tool') start++
  // 极端保护：若跳过了全部尾段（理论上是单批 38+ tool_calls 才可能），退回从最后一个 assistant 开始，
  // 保证尾段不会出现「声明了 tool_calls 却没有对应 tool 结果」的悬空消息
  if (start >= messages.length) {
    const lastAssistant = messages.map(m => m.role).lastIndexOf('assistant')
    start = Math.max(1, lastAssistant)
  }
  const tail = messages.slice(start)
  // 尾段里只保留最后一张页面截图，更早的剥掉图像只留文本（base64 截图非常占上下文）
  let lastImg = -1
  tail.forEach((m, i) => {
    if (Array.isArray(m?.content) && m.content.some(c => c.type === 'image_url')) lastImg = i
  })
  const kept = lastImg === -1 ? tail : tail.map((m, i) => {
    if (i === lastImg || !Array.isArray(m.content)) return m
    const t = m.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
    return { ...m, content: t || '（此前的页面截图已省略）' }
  })
  return [
    head,
    { role: 'system', content: '（较早的对话已压缩省略。以最近一次 get_form 返回的当前表单状态为准，不要依赖被省略的历史。）' },
    ...kept,
  ]
}

function log (tabId, kind, text, extra) {
  chrome.tabs.sendMessage(tabId, { type: 'agent:log', kind, text, extra }).catch(() => {})
}

// 截取当前标签页可见区域（jpeg dataURL）。多模态识图用：get_form 结果附带截图，
// 让模型直接「看」到自定义组件的真实渲染状态（下拉是否弹出、选项是什么、上传卡片长什么样）。
async function captureTab (tabId) {
  try {
    return await chrome.tabs.captureVisibleTab(tabId, { format: 'jpeg', quality: 55 })
  } catch (_) {
    return null // 无 tabs 权限/浏览器内置页/截屏失败：退回纯文本快照
  }
}

async function runAgent (tabId, scenario, baseEmail) {
  if (running.has(tabId)) { log(tabId, 'error', '已有任务在运行中'); return }
  running.add(tabId)
  aborted.delete(tabId)

  const ctrl = new AbortController() // 本任务请求中止器：stop 时实时中断 in-flight LLM 请求
  controllers.set(tabId, ctrl)

  try {
    const settings = await getSettings()
    const { id: model, image: modelVision } = await resolveModel(settings)
    // 优先用 content 传来的(面板值 || 页面探测)，回退到已存设置
    const userEmail = (baseEmail || settings.baseEmail || '').trim()

    let messages = [
      { role: 'system', content: buildSystemPrompt({ baseEmail: userEmail }) },
      { role: 'user', content: `场景：${scenario || '一个常见的日本加盟店申请（个人事业主 / 单店 / 餐饮）'}\n\n现在开始：先调用 get_form 查看第一步表单。` },
    ]

    log(tabId, 'status', `开始（模型 ${model}）`)

    let ended = null
    let captureWarned = false // 截图失败只提示一次，避免刷屏
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      if (aborted.has(tabId)) { log(tabId, 'status', '已被用户停止'); ended = 'abort'; break }

      const choice = await callLLM({ ...settings, model, messages, tools: TOOLS, signal: ctrl.signal })
      const m = choice.message || {}
      messages.push(m) // 原样追加 assistant 消息（含 tool_calls）

      // assistant 文本打日志（content 可能是 string / null / 多模态数组，数组时取 text 部分防 [object Object]）
      const assistantText = Array.isArray(m.content)
        ? m.content.filter(c => c?.type === 'text').map(c => c.text).join('\n').trim()
        : (m.content ? String(m.content).trim() : '')
      if (assistantText) log(tabId, 'assistant', assistantText)

      const toolCalls = m.tool_calls || []
      if (!toolCalls.length) { log(tabId, 'done', '模型结束（无更多工具调用）'); ended = 'end'; break }

      const finishTc = toolCalls.find(tc => tc.function?.name === 'finish')
      if (finishTc) {
        log(tabId, 'done', `✅ 完成：${parseArgs(finishTc).summary || '(无说明)'}`)
        ended = 'finish'
        break
      }

      // 先按序打日志，再执行同一批工具调用。
      // 时序关键：get_form 必须第一个单独执行并【立刻截图】——若与其它修改页面的工具并行，
      // 截图会混入改动后的状态（甚至开着下拉），导致「图与快照不一致」。
      // get_form 是同步 buildSnapshot，非常快，先跑它不拖慢整体。
      for (const tc of toolCalls) log(tabId, 'tool', `${tc.function?.name} ${briefInput(parseArgs(tc))}`)

      const execTc = tc => chrome.tabs.sendMessage(tabId, { type: 'agent:exec', name: tc.function?.name, input: parseArgs(tc) })
        .catch(err => ({ ok: false, result: `与页面通信失败：${err?.message || err}` }))

      // get_form 单独先跑 + 立刻截图（此时页面未被本批其它工具改动，图与快照一致）
      const getFormIdx = toolCalls.findIndex(tc => tc.function?.name === 'get_form')
      const wantShot = modelVision && getFormIdx !== -1
      let shot = null
      let results = []
      if (getFormIdx !== -1) {
        results[getFormIdx] = await execTc(toolCalls[getFormIdx])
        if (wantShot) {
          // 截面前隐藏浮窗（防浮窗入镜干扰识图），截完恢复
          chrome.tabs.sendMessage(tabId, { type: 'panel:hide' }).catch(() => {})
          await sleep(120) // 等隐藏 + 重绘
          shot = await captureTab(tabId)
          chrome.tabs.sendMessage(tabId, { type: 'panel:show' }).catch(() => {})
          if (!shot && !captureWarned) {
            captureWarned = true
            log(tabId, 'status', '页面截图不可用（权限/页面类型限制），本轮起仅用 DOM 快照 + 文本')
          }
        }
      }
      // 其余工具并行执行：总耗时从「求和」变为「取最大」
      await Promise.all(toolCalls.map(async (tc, i) => {
        if (i === getFormIdx) return
        results[i] = await execTc(tc)
      }))

      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i]
        const res = results[i]
        const text = toResultString(res?.result)
        log(tabId, 'result', text, { ok: res?.ok !== false })
        if (tc.function?.name === 'get_form' && shot) {
          // OpenAI 多模态格式：text + image_url（llama.cpp / LM Studio 均支持）
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: [
              { type: 'text', text },
              { type: 'image_url', image_url: { url: shot } },
            ],
          })
        } else {
          messages.push({ role: 'tool', tool_call_id: tc.id, content: text })
        }
      }
      // 每轮末尾压缩历史，控制上下文长度
      messages = compressHistory(messages)
    }
    if (!ended && !aborted.has(tabId)) {
      log(tabId, 'error', `已达最大轮数 ${MAX_TURNS}，自动停止；页面进度已保留，可重新「开始填写」继续（agent 会跳过已填字段）`)
    }
  } catch (err) {
    // 用户停止导致的请求中断不算故障，静默处理（循环顶部也会补一条状态日志）
    if (aborted.has(tabId)) log(tabId, 'status', '已被用户停止')
    else log(tabId, 'error', String(err?.message || err))
  } finally {
    running.delete(tabId)
    controllers.delete(tabId)
    chrome.tabs.sendMessage(tabId, { type: 'agent:ended' }).catch(() => {})
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id
  if (msg?.type === 'agent:start' && tabId != null) { runAgent(tabId, msg.scenario, msg.baseEmail); sendResponse({ ok: true }); return }
  if (msg?.type === 'agent:stop' && tabId != null) {
    aborted.add(tabId)
    controllers.get(tabId)?.abort() // 实时中断 in-flight LLM 请求
    sendResponse({ ok: true }); return
  }
})

chrome.action.onClicked.addListener(tab => {
  if (tab.id != null) chrome.tabs.sendMessage(tab.id, { type: 'panel:toggle' }).catch(() => {})
})