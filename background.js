// background.js —— service worker：跑 OpenAI 兼容(LM Studio)的工具调用循环，驱动 content 执行 DOM 操作
import { TOOLS } from './tools.js'
import { buildSystemPrompt } from './system-prompt.js'

const MAX_TURNS = 80

const DEFAULT_SETTINGS = {
  // 本地/局域网 LM Studio（OpenAI 兼容）。Tailscale 时可改 100.96.69.27:8434，本机用 localhost:1234
  endpoint: 'http://10.0.0.64:8434/v1/chat/completions',
  // 'auto' = 调 /v1/models 自动选已加载模型；或写死如 qwen/qwen3-30b-a3b-2507（需支持 function calling）
  model: 'qwen/qwen3-30b-a3b-2507',
  // 当前用户邮箱：不写死人名，运行时由 content 自动探测(JWT)或面板设置提供
  baseEmail: '',
}

const aborted = new Set()
const running = new Set()

async function getSettings () {
  const { agentSettings } = await chrome.storage.local.get('agentSettings')
  return { ...DEFAULT_SETTINGS, ...(agentSettings || {}) }
}

function log (tabId, kind, text, extra) {
  chrome.tabs.sendMessage(tabId, { type: 'agent:log', kind, text, extra }).catch(() => {})
}

/** model='auto' → 调 /v1/models 取第一个非 embedding 模型 */
async function resolveModel (settings) {
  const m = (settings.model || '').trim()
  if (m && m !== 'auto') return m
  const modelsUrl = settings.endpoint.replace(/\/chat\/completions\/?$/, '/models')
  try {
    const r = await fetch(modelsUrl)
    if (r.ok) {
      const j = await r.json()
      const id = (j?.data || []).map(x => x.id).find(id => id && !/embed/i.test(id))
      if (id) return id
    }
  } catch (_) { /* 兜底 */ }
  return 'local-model'
}

async function callLLM ({ endpoint, model, messages }) {
  let resp
  try {
    resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
        temperature: 0.3,
        max_tokens: 2000,
        stream: false,
      }),
    })
  } catch (err) {
    throw new Error(`连不上 LM Studio (${endpoint})：${err?.message || err}。确认已启动并开启「Serve on Local Network」。`)
  }
  if (!resp.ok) {
    const t = await resp.text().catch(() => '')
    throw new Error(`LM Studio ${resp.status}：${t.slice(0, 400)}`)
  }
  const data = await resp.json()
  const choice = data?.choices?.[0]
  if (!choice) throw new Error('LM Studio 未返回 choices（模型是否已加载？）')
  return choice
}

function toResultString (res) {
  if (res == null) return '(no result)'
  if (typeof res === 'string') return res
  try { return JSON.stringify(res) } catch (_) { return String(res) }
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
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      if (aborted.has(tabId)) { log(tabId, 'status', '已被用户停止'); break }

      const choice = await callLLM({ ...settings, model, messages })
      const m = choice.message || {}
      messages.push(m) // 原样追加 assistant 消息（含 tool_calls）

      if (m.content && String(m.content).trim()) log(tabId, 'assistant', String(m.content).trim())

      const toolCalls = m.tool_calls || []
      if (!toolCalls.length) { log(tabId, 'done', '模型结束（无更多工具调用）'); break }

      let finished = false
      for (const tc of toolCalls) {
        if (aborted.has(tabId)) { finished = true; break }
        const name = tc.function?.name
        let args = {}
        try { args = JSON.parse(tc.function?.arguments || '{}') } catch (_) { /* 容错 */ }

        if (name === 'finish') {
          log(tabId, 'done', `✅ 完成：${args.summary || '(无说明)'}`)
          finished = true
          break
        }

        log(tabId, 'tool', `${name} ${briefInput(args)}`)
        let res
        try {
          res = await chrome.tabs.sendMessage(tabId, { type: 'agent:exec', name, input: args })
        } catch (err) {
          res = { ok: false, result: `与页面通信失败：${err?.message || err}` }
        }
        const ok = res?.ok !== false
        log(tabId, 'result', toResultString(res?.result), { ok })
        messages.push({ role: 'tool', tool_call_id: tc.id, content: toResultString(res?.result) })
      }

      if (finished) break
    }
  } catch (err) {
    log(tabId, 'error', String(err?.message || err))
  } finally {
    running.delete(tabId)
    chrome.tabs.sendMessage(tabId, { type: 'agent:ended' }).catch(() => {})
  }
}

function briefInput (input) {
  if (!input) return ''
  const s = JSON.stringify(input)
  return s.length > 120 ? s.slice(0, 117) + '…' : s
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id
  if (msg?.type === 'agent:start' && tabId != null) { runAgent(tabId, msg.scenario, msg.baseEmail); sendResponse({ ok: true }); return }
  if (msg?.type === 'agent:stop' && tabId != null) { aborted.add(tabId); sendResponse({ ok: true }); return }
})

chrome.action.onClicked.addListener(tab => {
  if (tab.id != null) chrome.tabs.sendMessage(tab.id, { type: 'panel:toggle' }).catch(() => {})
})
