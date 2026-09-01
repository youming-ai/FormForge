// index.js —— background 入口（service worker, module）
// 跑 OpenAI 兼容(LM Studio/llama.cpp)的工具调用循环，驱动 content 执行 DOM 操作
// 同一轮的多个 tool_calls 并行下发执行（互不依赖的 DOM 操作同时进行，select 在 content 侧自动排队）
import { TOOLS } from './tools.js'
import { buildSystemPrompt } from './system-prompt.js'
import { getSettings, resolveModel, callLLM, parseArgs, toResultString, briefInput } from './llm.js'

const MAX_TURNS = 120
const MAX_CONTEXT_CHARS = 30000
const RECENT_CONTEXT_GROUPS = 4

const aborted = new Set()
const running = new Set()
const activeControllers = new Map()
const ms = startedAt => Math.max(0, Math.round(performance.now() - startedAt))

function log (tabId, kind, text, extra) {
  chrome.tabs.sendMessage(tabId, { type: 'agent:log', kind, text, extra }).catch(() => {})
}

// 长流程中快照/工具结果会不断累积。超过阈值时仅保留最近完整的
// assistant→tool 组，避免截断 tool_calls 与 tool 响应的配对关系。
function compactMessages (messages) {
  const size = messages.reduce((n, message) => n + JSON.stringify(message).length, 0)
  if (size <= MAX_CONTEXT_CHARS) return messages

  const groups = []
  for (let i = 2; i < messages.length;) {
    const group = [messages[i++]]
    while (i < messages.length && messages[i]?.role === 'tool') group.push(messages[i++])
    groups.push(group)
  }
  return [
    messages[0],
    messages[1],
    { role: 'user', content: '较早的工具历史已压缩以控制上下文。请以接下来的 get_form 返回为准，不要重复已经成功的动作。' },
    ...groups.slice(-RECENT_CONTEXT_GROUPS).flat(),
  ]
}

async function runAgent (tabId, scenario, baseEmail) {
  if (running.has(tabId)) { log(tabId, 'error', '已有任务在运行中'); return }
  running.add(tabId)
  aborted.delete(tabId)
  const runController = new AbortController()
  activeControllers.set(tabId, runController)

  const settings = await getSettings()
  const model = await resolveModel(settings)
  // 优先用 content 传来的(面板值 || 页面探测)，回退到已存设置
  const userEmail = (baseEmail || settings.baseEmail || '').trim()

  let messages = [
    { role: 'system', content: buildSystemPrompt({ baseEmail: userEmail }) },
    { role: 'user', content: `场景：${scenario || '一个常见的日本加盟店申请（个人事业主 / 单店 / 餐饮）'}\n\n现在开始：先调用 get_form 查看第一步表单。` },
  ]
  const perf = { turns: 0, llmMs: 0, toolWallMs: 0, toolCalls: 0, failures: 0, startedAt: performance.now() }

  log(tabId, 'status', `开始（模型 ${model}）`)

  try {
    let ended = null
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      if (aborted.has(tabId)) { log(tabId, 'status', '已被用户停止'); ended = 'abort'; break }

      const llmStartedAt = performance.now()
      const choice = await callLLM({ ...settings, model, messages, tools: TOOLS, signal: runController.signal })
      if (aborted.has(tabId) || runController.signal.aborted) {
        log(tabId, 'status', '已被用户停止')
        ended = 'abort'
        break
      }
      const llmMs = ms(llmStartedAt)
      perf.turns++
      perf.llmMs += llmMs
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

      const toolStartedAt = performance.now()
      const toolDurations = []
      const results = await Promise.all(toolCalls.map(async (tc, index) => {
        const startedAt = performance.now()
        try {
          return await chrome.tabs.sendMessage(tabId, { type: 'agent:exec', name: tc.function?.name, input: parseArgs(tc) })
        } catch (err) {
          return { ok: false, result: `与页面通信失败：${err?.message || err}` }
        } finally {
          toolDurations[index] = ms(startedAt)
        }
      }))
      const toolWallMs = ms(toolStartedAt)
      perf.toolWallMs += toolWallMs
      perf.toolCalls += toolCalls.length
      perf.failures += results.filter(result => result?.ok === false).length
      log(tabId, 'perf', `第 ${perf.turns} 轮：模型 ${llmMs}ms；工具墙钟 ${toolWallMs}ms（${toolCalls.map((tc, i) => `${tc.function?.name}:${toolDurations[i]}ms`).join('，')}）`)

      for (let i = 0; i < toolCalls.length; i++) {
        const res = results[i]
        log(tabId, 'result', toResultString(res?.result), { ok: res?.ok !== false })
        messages.push({ role: 'tool', tool_call_id: toolCalls[i].id, content: toResultString(res?.result) })
      }
      messages = compactMessages(messages)
    }
    if (!ended && !aborted.has(tabId)) {
      log(tabId, 'error', `已达最大轮数 ${MAX_TURNS}，自动停止；页面进度已保留，可重新「开始填写」继续（agent 会跳过已填字段）`)
    }
  } catch (err) {
    if (aborted.has(tabId) || runController.signal.aborted) {
      log(tabId, 'status', '已被用户停止')
    } else {
      log(tabId, 'error', String(err?.message || err))
    }
  } finally {
    log(tabId, 'perf', `本次性能：总计 ${ms(perf.startedAt)}ms；模型 ${perf.llmMs}ms/${perf.turns} 轮；工具 ${perf.toolWallMs}ms/${perf.toolCalls} 次；失败 ${perf.failures} 次`)
    running.delete(tabId)
    if (activeControllers.get(tabId) === runController) activeControllers.delete(tabId)
    chrome.tabs.sendMessage(tabId, { type: 'agent:ended' }).catch(() => {})
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id
  if (msg?.type === 'agent:start' && tabId != null) { runAgent(tabId, msg.scenario, msg.baseEmail); sendResponse({ ok: true }); return }
  if (msg?.type === 'agent:stop' && tabId != null) {
    aborted.add(tabId)
    activeControllers.get(tabId)?.abort()
    sendResponse({ ok: true })
    return
  }
})

chrome.action.onClicked.addListener(tab => {
  if (tab.id != null) chrome.tabs.sendMessage(tab.id, { type: 'panel:toggle' }).catch(() => {})
})
