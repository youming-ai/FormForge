// index.js —— background 入口（service worker, module）
// 跑 OpenAI 兼容(LM Studio/llama.cpp)的工具调用循环，驱动 content 执行 DOM 操作
// 同一批 tool_calls 分阶段执行：read_options 并行 → 写入类并行 → click/click_button 串行 → get_form 收尾
import { TOOLS } from './tools.js'
import { buildSystemPrompt } from './system-prompt.js'
import { getSettings, resolveModel, callLLM, parseArgs, toResultString, briefInput } from './llm.js'

const MAX_TURNS = 120
// 上下文滑动窗口：保留最近 N 条消息，更早的 tool 结果压缩为一条说明。
// 因为 agent 每步都重新 get_form 拿当前完整状态，旧快照基本冗余；压缩可显著降低长跑时的
// 上下文长度 → 每 token 延迟与 KV cache 占用（对 30B 模型尤其重要）。
const MAX_KEPT_MESSAGES = 40
// 压缩滞回：超过 MAX_KEPT+SLACK 才压一次（压到 ~MAX_KEPT）。每轮都压会让 system 之后的前缀每轮左移，
// cache_prompt 的 KV 前缀全部失效 → 每轮重新 prefill，长跑时反而更慢。
const COMPRESS_SLACK = 16

const aborted = new Set()
const running = new Set()
// 工具执行阶段：1 读选项 → 2 写入类并行 → 3 动作串行 → 4 get_form 收尾。
// click_button/click 必须在所有写入落定后执行，否则「下一步」/「自动带入」会在值写入前触发，导致步骤推进与带出值错乱。
// get_form 排最后：同批里它会重建 REFS，先跑会让同批写入的旧 ref 落到新编号上；放末尾还能让快照反映本批操作后的状态。
export function toolPhase (name) {
  if (name === 'read_options') return 1
  if (name === 'click_button' || name === 'click') return 3
  if (name === 'get_form') return 4
  return 2
}
// 每个 tab 正在运行任务的请求中止控制器：用户「停止」时实时中断 in-flight LLM 请求
const controllers = new Map()

const sleep = ms => new Promise(r => setTimeout(r, ms))

// 压缩消息历史：保留 system + 一条压缩说明 + 最近若干条（从非 tool 消息边界开始，避免孤立 tool 结果开头）
function compressHistory (messages) {
  if (messages.length <= MAX_KEPT_MESSAGES + COMPRESS_SLACK) return messages
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
  return [
    head,
    // 用 user 而非 system：部分严格的 OpenAI 兼容服务拒绝中段出现的 system 消息
    { role: 'user', content: '（较早的对话已压缩省略。以最近一次 get_form 返回的当前表单状态为准，不要依赖被省略的历史。）' },
    ...tail,
  ]
}

function log (tabId, kind, text, extra) {
  chrome.tabs.sendMessage(tabId, { type: 'agent:log', kind, text, extra }).catch(() => {})
}

async function runAgent (tabId, scenario, baseEmail) {
  if (running.has(tabId)) { log(tabId, 'error', '已有任务在运行中'); return }
  running.add(tabId)
  aborted.delete(tabId)

  const ctrl = new AbortController() // 本任务请求中止器：stop 时实时中断 in-flight LLM 请求
  controllers.set(tabId, ctrl)
  // MV3 service worker：30 秒内无扩展 API 调用就被回收，而 callLLM 的 fetch 期间一个都不会发生
  // → 单轮推理超 30 秒时整个任务连同 finally 一起消失（面板永远停在「运行中」）。定期调用扩展 API 续命。
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo().catch(() => {}), 20000)

  try {
    const settings = await getSettings()
    const model = await resolveModel(settings)
    // 优先用 content 传来的(面板值 || 页面探测)，回退到已存设置
    const userEmail = (baseEmail || settings.baseEmail || '').trim()

    let messages = [
      { role: 'system', content: buildSystemPrompt({ baseEmail: userEmail }) },
      { role: 'user', content: `场景：${scenario || '一个常见的网页注册/申请表单'}\n\n现在开始：先调用 get_form 查看第一步表单。` },
    ]

    log(tabId, 'status', `开始（模型 ${model}）`)

    let ended = null
    let nudges = 0 // 连续「无工具调用」的催促次数
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      if (aborted.has(tabId)) { log(tabId, 'status', '已被用户停止'); ended = 'abort'; break }

      const choice = await callLLM({ ...settings, model, messages, tools: TOOLS, signal: ctrl.signal })
      const m = choice.message || {}
      messages.push(m) // 原样追加 assistant 消息（含 tool_calls）

      if (m.content && String(m.content).trim()) log(tabId, 'assistant', String(m.content).trim())

      const toolCalls = m.tool_calls || []
      if (!toolCalls.length) {
        // 输出被 max_tokens 截断、或模型只说不做（「接下来我将调用 get_form」）都会走到这里，
        // 直接当完成会让表单一字未填就结束 → 连续催 2 次仍无工具调用才收尾
        if (nudges++ < 2) {
          log(tabId, 'status', choice.finish_reason === 'length' ? '模型输出被截断，提示其直接调用工具' : '模型未调用工具，提示其继续')
          messages.push({ role: 'user', content: '请直接调用工具继续填写；若确认全部完成，请调用 finish 结束。' })
          continue
        }
        log(tabId, 'done', '模型结束（无更多工具调用）'); ended = 'end'; break
      }
      nudges = 0

      const finishTc = toolCalls.find(tc => tc.function?.name === 'finish')
      if (finishTc) {
        log(tabId, 'done', `✅ 完成：${parseArgs(finishTc).summary || '(无说明)'}`)
        ended = 'finish'
        break
      }

      // 先按序打日志，再分阶段执行同一批工具调用（get_form 收尾，见 toolPhase）。
      for (const tc of toolCalls) log(tabId, 'tool', `${tc.function?.name} ${briefInput(parseArgs(tc))}`)

      // MPA「次へ→POST→整页重载」有一段旧文档已卸载、新内容脚本未注入的空窗，sendMessage 报
      // "Receiving end does not exist"。此时工具必然尚未执行，重试无副作用：退避重试 ~6s 撑过空窗
      // （慢 POST 的整页跳转也可能超过 3s），别让一次整页跳转就终止整个任务。其它错误（tab 已关闭/端口中断，
      // 可能已产生副作用）不重试，立即判失联。
      const execTc = async tc => {
        for (let i = 0; ; i++) {
          try {
            return await chrome.tabs.sendMessage(tabId, { type: 'agent:exec', name: tc.function?.name, input: parseArgs(tc) })
          } catch (err) {
            const msg = String(err?.message || err)
            if (!/receiving end does not exist/i.test(msg) || i >= 15) {
              return { ok: false, lost: true, result: `与页面通信失败：${msg}` }
            }
            await sleep(400)
          }
        }
      }

      // 分阶段执行：同批内按阶段排序（稳定排序保持原相对顺序），读→写并行、动作串行收尾
      const phaseOf = i => toolPhase(toolCalls[i].function?.name)
      const order = toolCalls.map((_, i) => i)
        .sort((a, b) => phaseOf(a) - phaseOf(b))
      let results = []
      for (const phase of [1, 2]) {
        await Promise.all(order
          .filter(i => phaseOf(i) === phase)
          .map(async i => { results[i] = await execTc(toolCalls[i]) }))
      }
      for (const i of order.filter(i => phaseOf(i) >= 3)) {
        results[i] = await execTc(toolCalls[i])
      }

      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i]
        const res = results[i]
        const text = toResultString(res?.result)
        log(tabId, 'result', text, { ok: res?.ok !== false })
        messages.push({ role: 'tool', tool_call_id: tc.id, content: text })
      }
      // 页面已不可达（tab 关闭/内容脚本未注入）：日志同样送不到，继续只会空烧 120 轮推理
      if (results.some(r => r?.lost)) {
        log(tabId, 'error', '页面不可达（tab 已关闭或内容脚本未注入），任务终止；可刷新页面后重新「开始填写」继续')
        ended = 'lost'
        break
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
    clearInterval(keepAlive)
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
    // 任务不在本 SW 里（上一个 SW 已被回收，finally 没跑成）→ 补发 ended，否则面板永远停在「运行中」
    if (!running.has(tabId)) chrome.tabs.sendMessage(tabId, { type: 'agent:ended' }).catch(() => {})
    sendResponse({ ok: true }); return
  }
})

chrome.action.onClicked.addListener(tab => {
  if (tab.id != null) chrome.tabs.sendMessage(tab.id, { type: 'panel:toggle' }).catch(() => {})
})