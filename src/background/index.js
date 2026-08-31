// index.js —— background 入口（service worker, module）
// 跑 OpenAI 兼容(LM Studio/llama.cpp)的工具调用循环，驱动 content 执行 DOM 操作
// 同一轮的多个 tool_calls 并行下发执行（互不依赖的 DOM 操作同时进行，select 在 content 侧自动排队）
import { TOOLS } from './tools.js'
import { buildSystemPrompt } from './system-prompt.js'
import { getSettings, resolveModel, callLLM, parseArgs, toResultString, briefInput } from './llm.js'

const MAX_TURNS = 120

const aborted = new Set()
const running = new Set()

function log (tabId, kind, text, extra) {
  chrome.tabs.sendMessage(tabId, { type: 'agent:log', kind, text, extra }).catch(() => {})
}

async function runAgent (tabId, scenario, baseEmail) {
  if (running.has(tabId)) { log(tabId, 'error', '已有任务在运行中'); return }
  running.add(tabId)
  aborted.delete(tabId)

  const settings = await getSettings()
  const model = await resolveModel(settings)
  // 优先用 content 传来的(面板值 || 页面探测)，回退到已存设置
  const userEmail = (baseEmail || settings.baseEmail || '').trim()

  const messages = [
    { role: 'system', content: buildSystemPrompt({ baseEmail: userEmail }) },
    { role: 'user', content: `场景：${scenario || '一个常见的日本加盟店申请（个人事业主 / 单店 / 餐饮）'}\n\n现在开始：先调用 get_form 查看第一步表单。` },
  ]

  log(tabId, 'status', `开始（模型 ${model}）`)

  try {
    let ended = null
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      if (aborted.has(tabId)) { log(tabId, 'status', '已被用户停止'); ended = 'abort'; break }

      const choice = await callLLM({ ...settings, model, messages, tools: TOOLS })
      const m = choice.message || {}
      messages.push(m) // 原样追加 assistant 消息（含 tool_calls）

      if (m.content && String(m.content).trim()) log(tabId, 'assistant', String(m.content).trim())

      const toolCalls = m.tool_calls || []
      if (!toolCalls.length) { log(tabId, 'done', '模型结束（无更多工具调用）'); ended = 'end'; break }

      const finishTc = toolCalls.find(tc => tc.function?.name === 'finish')
      if (finishTc) {
        log(tabId, 'done', `✅ 完成：${parseArgs(finishTc).summary || '(无说明)'}`)
        ended = 'finish'
        break
      }

      // 先按序打日志，再并行执行同一批工具调用：总耗时从「求和」变为「取最大」
      for (const tc of toolCalls) log(tabId, 'tool', `${tc.function?.name} ${briefInput(parseArgs(tc))}`)

      const results = await Promise.all(toolCalls.map(async tc => {
        try {
          return await chrome.tabs.sendMessage(tabId, { type: 'agent:exec', name: tc.function?.name, input: parseArgs(tc) })
        } catch (err) {
          return { ok: false, result: `与页面通信失败：${err?.message || err}` }
        }
      }))

      for (let i = 0; i < toolCalls.length; i++) {
        const res = results[i]
        log(tabId, 'result', toResultString(res?.result), { ok: res?.ok !== false })
        messages.push({ role: 'tool', tool_call_id: toolCalls[i].id, content: toResultString(res?.result) })
      }
    }
    if (!ended && !aborted.has(tabId)) {
      log(tabId, 'error', `已达最大轮数 ${MAX_TURNS}，自动停止；页面进度已保留，可重新「开始填写」继续（agent 会跳过已填字段）`)
    }
  } catch (err) {
    log(tabId, 'error', String(err?.message || err))
  } finally {
    running.delete(tabId)
    chrome.tabs.sendMessage(tabId, { type: 'agent:ended' }).catch(() => {})
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id
  if (msg?.type === 'agent:start' && tabId != null) { runAgent(tabId, msg.scenario, msg.baseEmail); sendResponse({ ok: true }); return }
  if (msg?.type === 'agent:stop' && tabId != null) { aborted.add(tabId); sendResponse({ ok: true }); return }
})

chrome.action.onClicked.addListener(tab => {
  if (tab.id != null) chrome.tabs.sendMessage(tab.id, { type: 'panel:toggle' }).catch(() => {})
})