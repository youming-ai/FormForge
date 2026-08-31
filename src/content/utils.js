// content/utils.js —— 页面侧通用工具（各 content 脚本共享同一隔离环境）
// 注意：本目录文件由 manifest content_scripts.js 按序注入，靠顺序保证依赖（utils → snapshot → dom-tools → panel → main）

const sleep = ms => new Promise(r => setTimeout(r, ms))
const pad2 = n => String(n).padStart(2, '0')

// 轮询等待条件成立（早退），替代固定 sleep：快则几十 ms 返回，慢则到 timeout 为止
async function waitFor (cond, { timeout = 1500, step = 50 } = {}) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (cond()) return true
    await sleep(step)
  }
  return cond()
}

function setNativeValue (el, value) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter) setter.call(el, value)
  else el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

const visible = el => !!el && el.offsetParent !== null

// 从 localStorage 里的 JWT(ACCESS_TOKEN, es-banana 缓存)解出当前登录用户邮箱
function detectUserEmail () {
  try {
    for (const k of Object.keys(localStorage)) {
      if (!/ACCESS_TOKEN$/.test(k)) continue
      let raw = localStorage.getItem(k)
      try { const o = JSON.parse(raw); raw = o?.value ?? raw } catch (_) { /* 非 JSON 直接用 */ }
      const parts = String(raw).split('.')
      if (parts.length < 2) continue
      try {
        const payload = JSON.parse(decodeURIComponent(escape(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))))
        const email = payload.email || payload.mail || payload.preferred_username || payload.username
        if (email && /@/.test(email)) return String(email)
      } catch (_) { /* 解码失败跳过 */ }
    }
  } catch (_) { /* 忽略 */ }
  return ''
}