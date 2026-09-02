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

// 设值核心：用原生 value setter 绕过框架的受控组件拦截，再派发 input（可选 change）
function setValue (el, value, { change = false } = {}) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter) setter.call(el, value)
  else el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  if (change) el.dispatchEvent(new Event('change', { bubbles: true }))
}

// 设值并触发 input + change（通用）
function setNativeValue (el, value) {
  setValue(el, value, { change: true })
}

// 仅设值并触发 input（不连带 change/blur，避免过早关闭面板，如日期选择器）
function setInputValue (el, value) {
  setValue(el, value)
}

// 可见性：offsetParent 对 position:fixed 元素恒为 null（弹窗/悬浮表单会被误判不可见），
// 改用渲染盒尺寸判断（display:none / 宽高为 0 → 不可见），并优先用原生 checkVisibility。
const visible = el => {
  if (!el) return false
  if (typeof el.checkVisibility === 'function') return el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: false })
  // 兜底：元素有渲染盒且在视口树内
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

// 从 localStorage 里的 JWT(ACCESS_TOKEN, es-banana 缓存)解出当前登录用户邮箱
function detectUserEmail () {
  // base64url → UTF-8 字符串（TextDecoder 替代已弃用的 escape/unescape）
  const b64UrlDecode = s => {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64)
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  }
  try {
    for (const k of Object.keys(localStorage)) {
      if (!/ACCESS_TOKEN$/.test(k)) continue
      let raw = localStorage.getItem(k)
      try { const o = JSON.parse(raw); raw = o?.value ?? raw } catch (_) { /* 非 JSON 直接用 */ }
      const parts = String(raw).split('.')
      if (parts.length < 2) continue
      try {
        const payload = JSON.parse(b64UrlDecode(parts[1]))
        const email = payload.email || payload.mail || payload.preferred_username || payload.username
        if (email && /@/.test(email)) return String(email)
      } catch (_) { /* 解码失败跳过 */ }
    }
  } catch (_) { /* 忽略 */ }
  return ''
}