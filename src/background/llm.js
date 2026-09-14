// llm.js —— 推理服务客户端（OpenAI 兼容：llama.cpp / LM Studio）+ 设置读写

export const LLM_TIMEOUT_MS = 5 * 60 * 1000 // 单次 LLM 请求超时（冷加载大模型可能很慢，给足）

export const DEFAULT_SETTINGS = {
  // 局域网 LM Studio（OpenAI 兼容 + function calling）。备选：macstudio llama.cpp/llama-swap <your-host>:8800，Tailscale <tailscale-host>:8434，本机 localhost:1234
  endpoint: 'http://<your-host>:8434/v1/chat/completions',
  // 纯 DOM 方案不依赖多模态：默认 Qwen3-30B-A3B（MoE 3B 激活，多轮循环快，工具调用稳）。
  // 填 auto 则自动选「最合适的已加载」对话模型（跳过翻译/专用模型，优先 MoE/Qwen）。
  model: 'Qwen/Qwen3-30B-A3B-GGUF:Qwen3-30B-A3B-Q4_K_M',
  // 当前用户邮箱：不写死人名，运行时由 content 自动探测(JWT)或面板设置提供
  baseEmail: '',
}

export async function getSettings () {
  const { agentSettings } = await chrome.storage.local.get('agentSettings')
  // 空字符串视为未设置（回退默认）：面板清空输入即恢复默认 endpoint/模型/自动探测邮箱
  const clean = Object.fromEntries(Object.entries(agentSettings || {}).filter(([, v]) => v !== ''))
  return { ...DEFAULT_SETTINGS, ...clean }
}

export function parseArgs (tc) {
  // 部分 OpenAI 兼容服务直接返回对象而非 JSON 字符串；此时 JSON.parse 会抛错导致参数全丢
  const a = tc.function?.arguments
  if (a && typeof a === 'object') return a
  try { return JSON.parse(a || '{}') } catch (_) { return {} }
}

/** 解析模型 → id 字符串。model='auto' 时从 /v1/models 选「最适合本 agent」的对话模型：
 *  ① 排除 embedding/asr/rerank/whisper 及翻译/专用模型（HY-MT 等）
 *  ② 优先已加载（避免冷加载等待）；无加载时按能力选，服务会自动拉起
 *  ③ 同档里 MoE(A3B/A4B，激活参数少、多轮快) ≥ Qwen 系（本 agent 工具调用最稳）≥ 参数量大者 */
export async function resolveModel (settings) {
  const modelsUrl = settings.endpoint.replace(/\/chat\/completions\/?$/, '/models')
  const wanted = (settings.model || '').trim()
  if (wanted && wanted !== 'auto') return wanted
  try {
    // 探测必须带超时：主机挂起（丢包不拒绝连接）时否则会永远卡在 resolveModel，面板停在「运行中」
    const r = await fetch(modelsUrl, { signal: AbortSignal.timeout(10_000) })
    if (r.ok) {
      const j = await r.json()
      const chat = (j?.data || []).filter(x =>
        x.id && /text/.test((x.architecture?.input_modalities || ['text']).join(' ')) &&
        !/embed|asr|rerank|whisper|hy[_-]?mt|mt-?\d|translat/i.test(x.id))
      if (!chat.length) return 'local-model'
      // 总参数量（GB）：优先 meta（加载过的准确），否则按 id 解析（35B-A3B → 35）
      const params = x => {
        if (x.meta?.n_params) return x.meta.n_params / 1e9
        const m = (x.id || '').match(/(\d+(?:\.\d+)?)[Bb]-(?:A\d+[Bb])?/) || (x.id || '').match(/(\d+(?:\.\d+)?)[Bb](?![A-Za-z])/)
        return m ? parseFloat(m[1]) : 0
      }
      // 已加载判定：llama.cpp/llama-swap 用 status.value，LM Studio 用 state（loaded / loaded-memory）
      const isLoaded = x => x.status?.value === 'loaded' || /^(loaded|loaded-memory)$/i.test(String(x.state || ''))
      const score = x => {
        let s = 0
        if (isLoaded(x)) s += 100000                             // 已加载优先（避免冷加载等待）
        if (/A\d+B/i.test(x.id || '')) s += 300                // MoE：激活参数少，多轮循环快
        if (/Qwen/i.test(x.id || '')) s += 500                 // Qwen 工具调用最稳（本 agent 首选系）
        s += Math.min(params(x), 40) * 100                     // 参数量越大通常能力越强（封顶 40B）
        return s
      }
      const best = [...chat].sort((a, b) => score(b) - score(a))[0]
      if (best?.id) return best.id
    }
  } catch (_) { /* 兜底 */ }
  return 'local-model'
}

export async function callLLM ({ endpoint, model, messages, tools, signal }) {
  const ctrl = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; ctrl.abort() }, LLM_TIMEOUT_MS)
  // 合并外部中止信号（如用户点「停止」），让 in-flight 请求被实时中断，不必等超时/响应
  const onExternal = () => ctrl.abort()
  if (signal) {
    if (signal.aborted) ctrl.abort()
    else signal.addEventListener('abort', onExternal, { once: true })
  }
  let resp
  // 整个「请求 + 读 body」都在同一个超时/中止信号下：fetch 只等到响应头就 resolve，
  // 若在读完 body 前就 clearTimeout/摘掉 abort 钩子，服务端发完头后卡住 body 会永久挂起
  // （面板停在运行中，且「停止」的 abort 无人监听而失效）。
  try {
    try {
      resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          tools,
          tool_choice: 'auto',
          temperature: 0.3,
          max_tokens: 4096, // 需容下 Qwen3 的 <think> 段：截断（finish_reason=length）会让整轮没有 tool_calls
          stream: false,
          cache_prompt: true, // llama.cpp / LM Studio：保留 KV prompt cache，多轮工具循环显著降低首 token 延迟
        }),
        signal: ctrl.signal,
      })
    } catch (err) {
      if (timedOut) throw new Error(`推理服务响应超时（>${Math.round(LLM_TIMEOUT_MS / 60000)} 分钟）：可能正在冷加载模型或队列拥堵，请重试`)
      if (signal?.aborted) throw new Error('已停止') // 用户主动中止，不是故障
      throw new Error(`连不上推理服务 (${endpoint})：${err?.message || err}。确认 llama-server/llama-swap 或 LM Studio 已启动并可从本机访问。`)
    }
    if (!resp.ok) {
      const t = await resp.text().catch(() => '')
      throw new Error(`推理服务 ${resp.status}：${t.slice(0, 400)}`)
    }
    let data
    try {
      data = await resp.json()
    } catch (err) {
      if (timedOut) throw new Error(`推理服务响应超时（>${Math.round(LLM_TIMEOUT_MS / 60000)} 分钟）：已返回响应头但 body 迟迟不结束`)
      if (signal?.aborted) throw new Error('已停止')
      // 200 + 非 JSON：多半是代理错误页，或服务端忽略了 stream:false 直接返回 SSE
      throw new Error(`推理服务返回非 JSON（可能是代理错误页或流式响应）：${String(err?.message || err)}`)
    }
    const choice = data?.choices?.[0]
    if (!choice) throw new Error('推理服务未返回 choices（模型是否已加载？）')
    // 无 message 的 choice 会让 index.js 把 {} 追加进历史，下一轮请求报 "role required"（错误信息与真因无关）
    if (!choice.message) throw new Error('推理服务返回的 choices[0] 缺少 message 字段（服务端响应格式异常）')
    return choice
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onExternal)
  }
}

export function toResultString (res) {
  if (res == null) return '(no result)'
  if (typeof res === 'string') return res
  try { return JSON.stringify(res) } catch (_) { return String(res) }
}

export function briefInput (input) {
  if (!input) return ''
  const s = JSON.stringify(input)
  return s.length > 120 ? s.slice(0, 117) + '…' : s
}