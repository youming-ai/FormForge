// llm.js —— 推理服务客户端（OpenAI 兼容：llama.cpp / LM Studio）+ 设置读写

export const LLM_TIMEOUT_MS = 5 * 60 * 1000 // 单次 LLM 请求超时（冷加载大模型可能很慢，给足）

export const DEFAULT_SETTINGS = {
  // macstudio llama.cpp / llama-swap（OpenAI 兼容 + function calling + 多模态识图）。LM Studio 备选：Tailscale 100.96.69.27:8434，本机 localhost:1234
  endpoint: 'http://10.0.0.64:8800/v1/chat/completions',
  // 需支持 function calling + 图像输入（get_form 附页面截图）；llama-swap 未加载的模型按需 JIT 换入（首次有冷加载延迟）
  model: 'unsloth/Qwen3.8-27B-GGUF:8-27B-Q4_K_M',
  // 当前用户邮箱：不写死人名，运行时由 content 自动探测(JWT)或面板设置提供
  baseEmail: '',
}

export async function getSettings () {
  const { agentSettings } = await chrome.storage.local.get('agentSettings')
  return { ...DEFAULT_SETTINGS, ...(agentSettings || {}) }
}

export function parseArgs (tc) {
  try { return JSON.parse(tc.function?.arguments || '{}') } catch (_) { return {} }
}

/** 解析模型 → { id, image }。
 * image=true 表示该模型支持图像输入（llama.cpp /v1/models 的 architecture.input_modalities 含 image），
 * 决定 get_form 是否附带页面截图（纯文本模型收到 image_url 会报错）。
 * model='auto' 时优先选「已加载」的，排除 embedding/asr/rerank/whisper。 */
export async function resolveModel (settings) {
  const modelsUrl = settings.endpoint.replace(/\/chat\/completions\/?$/, '/models')
  const wanted = (settings.model || '').trim()
  try {
    const r = await fetch(modelsUrl)
    if (r.ok) {
      const j = await r.json()
      const list = (j?.data || []).filter(x => x.id && !/embed|asr|rerank|whisper/i.test(x.id))
      let entry
      if (wanted && wanted !== 'auto') {
        entry = list.find(x => x.id === wanted)
        return { id: wanted, image: !!entry?.architecture?.input_modalities?.includes('image') }
      }
      entry = list.find(x => x.status?.value === 'loaded') || list[0]
      if (entry) return { id: entry.id, image: !!entry.architecture?.input_modalities?.includes('image') }
    }
  } catch (_) { /* 兜底 */ }
  if (wanted && wanted !== 'auto') return { id: wanted, image: false } // 列表拿不到：保守按纯文本处理
  return { id: 'local-model', image: false }
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
        max_tokens: 2000,
        stream: false,
        cache_prompt: true, // llama.cpp / LM Studio：保留 KV prompt cache，多轮工具循环显著降低首 token 延迟
      }),
      signal: ctrl.signal,
    })
  } catch (err) {
    if (timedOut) throw new Error(`推理服务响应超时（>${Math.round(LLM_TIMEOUT_MS / 60000)} 分钟）：可能正在冷加载模型或队列拥堵，请重试`)
    if (signal?.aborted) throw new Error('已停止') // 用户主动中止，不是故障
    throw new Error(`连不上推理服务 (${endpoint})：${err?.message || err}。确认 llama-server/llama-swap 或 LM Studio 已启动并可从本机访问。`)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onExternal)
  }
  if (!resp.ok) {
    const t = await resp.text().catch(() => '')
    throw new Error(`推理服务 ${resp.status}：${t.slice(0, 400)}`)
  }
  const data = await resp.json()
  const choice = data?.choices?.[0]
  if (!choice) throw new Error('推理服务未返回 choices（模型是否已加载？）')
  return choice
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