// content.js —— 页面侧：注入浮窗控制面板 + 执行 agent 的 DOM 工具
// 选择器针对 legacy ApplyForm（.merchant-apply-info__*）；OEM 新版若不同需适配。

// ===================== 通用工具 =====================
const sleep = ms => new Promise(r => setTimeout(r, ms))
const pad2 = n => String(n).padStart(2, '0')

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

// ===================== 快照 / ref =====================
let REFS = [] // [{ref, item, kind}]

const scopeEl = () =>
  document.querySelector('.merchant-apply-info__content') ||
  document.querySelector('.merchant-apply-info') ||
  document.body

const isConfirm = () => !!document.querySelector('.merchant-apply-info__section')

function classify (item) {
  if (item.querySelector('.ant-upload')) return 'upload'
  if (item.querySelector('.ant-picker')) return 'date'
  if (item.querySelector('.ant-radio-group')) return 'radio'
  if (item.querySelector('.ant-select')) return 'select'
  if (item.querySelector('textarea')) return 'textarea'
  if (item.querySelector('.ant-checkbox-wrapper')) return 'checkbox'
  if (item.querySelector('input:not([type="file"])')) return 'text'
  return 'unknown'
}

const labelOf = item =>
  (item.querySelector('.ant-form-item-label label, label')?.textContent || '').trim().replace(/\s+/g, ' ')

const errorOf = item =>
  (item.querySelector('.ant-form-item-explain-error')?.textContent || '').trim()

// Ant 给必填项的 label 加 .ant-form-item-required；无 label 时控件上有 aria-required
const isRequired = item =>
  !!(item.querySelector('.ant-form-item-required') || item.querySelector('[aria-required="true"]'))

// 取控件 placeholder 当标签兜底（地址组等子字段无 label，只有 placeholder 如「都道府県（カナ）」）
const placeholderOf = item => {
  const el = item.querySelector('input[placeholder], textarea[placeholder]')
  if (el) return (el.getAttribute('placeholder') || '').trim()
  const sp = item.querySelector('.ant-select-selection-placeholder')
  return sp ? sp.textContent.trim() : ''
}

function valueOf (item, kind) {
  if (kind === 'text' || kind === 'textarea') return (item.querySelector('textarea, input')?.value || '')
  if (kind === 'select') {
    const s = item.querySelector('.ant-select-selection-item')
    return s ? (s.getAttribute('title') || s.textContent).trim() : ''
  }
  if (kind === 'radio') return (item.querySelector('.ant-radio-wrapper-checked')?.textContent || '').trim()
  if (kind === 'checkbox') {
    return [...item.querySelectorAll('.ant-checkbox-wrapper')]
      .filter(w => w.querySelector('.ant-checkbox-checked'))
      .map(w => w.textContent.trim()).join(' | ')
  }
  if (kind === 'date') return (item.querySelector('.ant-picker-input input')?.value || '')
  if (kind === 'upload') {
    const n = item.querySelectorAll('.ant-upload-list-item').length
    return n ? `已上传 ${n} 个文件` : ''
  }
  return ''
}

function buildSnapshot () {
  REFS = []
  const scope = scopeEl()
  const fields = []

  // 1) 标准 Ant 表单字段
  const items = [...scope.querySelectorAll('.ant-form-item')].filter(visible)
  for (const item of items) {
    if (item.querySelector('.ant-form-item')) continue // 跳过含嵌套子项的父容器
    if (item.querySelector('.plan-select')) continue // 料金プラン卡片另行处理
    let kind = classify(item)
    const ref = 'e' + REFS.length
    REFS.push({ ref, item, kind })
    const f = { ref, kind, label: labelOf(item) || placeholderOf(item), value: valueOf(item, kind), required: isRequired(item) }
    f.filled = !!String(f.value || '').trim()
    const err = errorOf(item)
    if (err) f.error = err
    if (kind === 'radio') f.options = [...item.querySelectorAll('.ant-radio-wrapper')].map(w => w.textContent.trim())
    if (kind === 'checkbox') {
      f.options = [...item.querySelectorAll('.ant-checkbox-wrapper')]
        .map(w => ({ label: w.textContent.trim(), checked: !!w.querySelector('.ant-checkbox-checked') }))
    }
    if (kind === 'unknown') f.note = '非标准控件，可能需 read_options/click 或人工处理'
    fields.push(f)
  }

  // 2) 料金プラン等可点卡片(.plan-select)
  scope.querySelectorAll('.plan-select').forEach(planRoot => {
    if (!visible(planRoot)) return
    const cards = [...planRoot.querySelectorAll('.plan-select__plan')]
    if (!cards.length) return
    const ref = 'e' + REFS.length
    REFS.push({ ref, item: planRoot, kind: 'cards' })
    const active = cards.find(c => c.classList.contains('active'))
    const titleOf = c => (c.querySelector('.plan-select__plan__title')?.textContent || c.textContent || '').trim()
    fields.push({
      ref, kind: 'cards', label: '料金プラン/方案卡片',
      value: active ? titleOf(active) : '',
      filled: !!active,
      options: cards.map(titleOf),
      required: true,
    })
  })

  // 3) 导航按钮
  const action = document.querySelector('.merchant-apply-info__action')
  const buttons = []
  if (action) {
    action.querySelectorAll('button').forEach(b => {
      if (!visible(b)) return
      buttons.push({
        label: b.textContent.trim(),
        kind: b.classList.contains('ant-btn-primary') ? 'primary' : 'default',
        disabled: b.disabled,
      })
    })
  }

  // 4) 步骤内其它可点按钮（如「住所自動入力」），给 ref 供 click 使用
  const actions = []
  scope.querySelectorAll('button').forEach(b => {
    if (!visible(b) || b.disabled) return
    if (action && action.contains(b)) return
    const label = b.textContent.trim()
    if (!label) return
    const ref = 'e' + REFS.length
    REFS.push({ ref, item: b, kind: 'button' })
    actions.push({ ref, label })
  })

  const missingRequired = fields
    .filter(f => f.required && !String(f.value || '').trim())
    .map(f => `${f.ref}:${f.label || '(无标签)'}`)

  return {
    stepTitle: (document.querySelector('.merchant-apply-info__title')?.textContent || '').trim(),
    isConfirmStep: isConfirm(),
    fields,
    buttons,
    actions,
    missingRequired,
  }
}

const getRef = ref => REFS.find(r => r.ref === ref)

// ===================== DOM 工具执行器 =====================
function dropdownOptions () {
  return [...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')]
}
const optText = o => (o.getAttribute('title') || o.textContent || '').trim()

async function openSelect (item) {
  const selector = item.querySelector('.ant-select-selector') || item.querySelector('.ant-select')
  selector?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  selector?.click()
  await sleep(400)
}
function closeSelect (item) {
  const input = item.querySelector('input')
  input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  document.body.click()
}

async function fillText (ref, value) {
  const r = getRef(ref)
  if (!r) return { ok: false, result: `ref ${ref} 不存在，请重新 get_form` }
  const input = r.item.querySelector('textarea, input')
  if (!input) return { ok: false, result: '该字段不是文本框' }
  setNativeValue(input, value)
  await sleep(80)
  return { ok: true, result: `已填「${labelOf(r.item)}」= ${value}` }
}

async function chooseOption (ref, option) {
  const r = getRef(ref)
  if (!r) return { ok: false, result: `ref ${ref} 不存在，请重新 get_form` }

  if (r.kind === 'select') {
    await openSelect(r.item)
    const opts = dropdownOptions()
    let target = opts.find(o => optText(o) === option) || opts.find(o => optText(o).includes(option))
    if (!target) {
      const list = opts.slice(0, 20).map(optText).join(' / ')
      closeSelect(r.item)
      return { ok: false, result: `未找到选项「${option}」。当前可选：${list || '(空，可能是联动下拉需先选上级)'}` }
    }
    target.click()
    await sleep(250)
    return { ok: true, result: `已选「${labelOf(r.item)}」= ${optText(target)}` }
  }

  if (r.kind === 'radio') {
    const wraps = [...r.item.querySelectorAll('.ant-radio-wrapper')]
    const w = wraps.find(x => x.textContent.trim() === option) || wraps.find(x => x.textContent.trim().includes(option))
    if (!w) return { ok: false, result: `未找到单选项「${option}」，可选：${wraps.map(x => x.textContent.trim()).join(' / ')}` }
    w.click()
    await sleep(120)
    return { ok: true, result: `已选「${labelOf(r.item)}」= ${w.textContent.trim()}` }
  }

  if (r.kind === 'checkbox') {
    const wraps = [...r.item.querySelectorAll('.ant-checkbox-wrapper')]
    const checkedNow = () => wraps.filter(w => w.querySelector('.ant-checkbox-checked')).length
    if (option === 'check' || option === 'uncheck') {
      const want = option === 'check'
      let n = 0
      wraps.forEach(w => {
        const checked = !!w.querySelector('.ant-checkbox-checked')
        if (checked !== want) { (w.querySelector('input.ant-checkbox-input') || w).click(); n++ }
      })
      await sleep(200) // 等 Vue 更新，避免下一次 get_form 读到旧状态导致反复勾选
      if (n === 0) return { ok: true, result: `复选框已是目标状态（无需改动，当前勾选 ${checkedNow()}/${wraps.length}），请前进到下一项` }
      return { ok: true, result: `已${want ? '勾选' : '取消'} ${n} 个复选框（当前勾选 ${checkedNow()}/${wraps.length}）` }
    }
    const w = wraps.find(x => x.textContent.trim().includes(option))
    if (!w) return { ok: false, result: `未找到复选项「${option}」` }
    if (!w.querySelector('.ant-checkbox-checked')) (w.querySelector('input.ant-checkbox-input') || w).click()
    await sleep(200)
    return { ok: true, result: `「${option}」当前${w.querySelector('.ant-checkbox-checked') ? '已勾选' : '未勾选'}` }
  }

  if (r.kind === 'cards') {
    const cards = [...r.item.querySelectorAll('.plan-select__plan')]
    const titleOf = c => (c.querySelector('.plan-select__plan__title')?.textContent || c.textContent || '').trim()
    const card = cards.find(c => titleOf(c) === option) || cards.find(c => titleOf(c).includes(option))
    if (!card) return { ok: false, result: `未找到卡片「${option}」，可选：${cards.map(titleOf).join(' / ')}` }
    card.click()
    await sleep(250)
    return { ok: true, result: `已选卡片「${titleOf(card)}」` }
  }

  return { ok: false, result: `字段类型 ${r.kind} 不支持 choose_option` }
}

// 生成一张测试用 dummy PNG（无需任何素材）
function makeDummyPng () {
  const c = document.createElement('canvas')
  c.width = 1000; c.height = 700
  const x = c.getContext('2d')
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 1000, 700)
  x.strokeStyle = '#cccccc'; x.lineWidth = 4; x.strokeRect(20, 20, 960, 660)
  x.fillStyle = '#222222'; x.font = 'bold 48px sans-serif'
  x.fillText('TEST DOCUMENT', 60, 150)
  x.font = '26px sans-serif'
  x.fillText('自動アップロード用ダミー画像（テスト）', 60, 220)
  x.fillText('generated by apply-autofill-agent', 60, 270)
  x.fillText(`ts: ${Date.now()}`, 60, 320)
  return new Promise(res => c.toBlob(b => res(new File([b], `test-${Date.now()}.png`, { type: 'image/png' })), 'image/png'))
}

async function dataUrlToFile (dataUrl, name) {
  const r = await fetch(dataUrl)
  const b = await r.blob()
  return new File([b], name || `upload-${Date.now()}.png`, { type: b.type || 'image/png' })
}

async function makeUploadFile () {
  const { agentSettings } = await chrome.storage.local.get('agentSettings')
  const img = agentSettings?.uploadImage
  if (img?.dataUrl) {
    try { return await dataUrlToFile(img.dataUrl, img.name) } catch (_) { /* 回退到生成 */ }
  }
  return makeDummyPng()
}

// 向 Ant Upload 字段塞文件并触发上传（默认 dummy 图 / 面板固定图）
async function uploadFile (ref) {
  const r = getRef(ref)
  if (!r) return { ok: false, result: `ref ${ref} 不存在，请重新 get_form` }
  const input = r.item.querySelector('input[type="file"]')
  if (!input) return { ok: false, result: '该字段不是上传组件（找不到 file input）' }
  let file
  try { file = await makeUploadFile() } catch (e) { return { ok: false, result: '生成上传文件失败：' + (e?.message || e) } }
  try {
    const dt = new DataTransfer()
    dt.items.add(file)
    input.files = dt.files
  } catch (e) {
    return { ok: false, result: '无法写入 file input：' + (e?.message || e) }
  }
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await sleep(1500) // 等 rc-upload 走 customRequest 传到 OSS
  const n = r.item.querySelectorAll('.ant-upload-list-item').length
  const err = r.item.querySelector('.ant-upload-list-item-error')
  if (err) return { ok: false, result: `上传可能失败（列表项标红）。该字段或只接受特定类型(如 PDF)，需人工。` }
  return { ok: true, result: `已上传「${file.name}」，当前列表 ${n} 个文件；稍后可 get_form 复核。` }
}

// 点任意按钮/元素（如「住所自動入力」），ref 来自 get_form 的 actions/fields
async function clickElement (ref) {
  const r = getRef(ref)
  if (!r) return { ok: false, result: `ref ${ref} 不存在，请重新 get_form` }
  const el = r.item.matches('button') ? r.item : (r.item.querySelector('button') || r.item)
  el.click()
  await sleep(1300) // 住所自動入力等需异步查邮编→带出地址，多等一会
  return { ok: true, result: `已点击 ${ref}（如为「住所自動入力」，请 get_form 复核地址是否带出汉字+カナ）` }
}

async function readOptions (ref) {
  const r = getRef(ref)
  if (!r) return { ok: false, result: `ref ${ref} 不存在，请重新 get_form` }
  if (r.kind === 'radio') {
    return { ok: true, result: { options: [...r.item.querySelectorAll('.ant-radio-wrapper')].map(w => w.textContent.trim()) } }
  }
  if (r.kind === 'checkbox') {
    return { ok: true, result: { options: [...r.item.querySelectorAll('.ant-checkbox-wrapper')].map(w => w.textContent.trim()) } }
  }
  if (r.kind !== 'select') return { ok: false, result: `字段类型 ${r.kind} 没有可读选项` }
  await openSelect(r.item)
  const opts = dropdownOptions().map(optText).filter(Boolean)
  closeSelect(r.item)
  return { ok: true, result: { count: opts.length, options: opts.slice(0, 60) } }
}

// 仅设值并触发 input（不连带 change/blur，避免过早关闭面板）
function setInputValue (input, s) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(input, s)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function setDate (ref, y, m, d) {
  const r = getRef(ref)
  if (!r) return { ok: false, result: `ref ${ref} 不存在，请重新 get_form` }
  const input = r.item.querySelector('.ant-picker-input input')
  if (!input) return { ok: false, result: '该字段不是日期选择器' }
  const norm = s => String(s || '').replace(/[^0-9]/g, '')
  // 该表单日期格式为 YYYY/MM/DD；同时备一个连字符格式做回退
  const candidates = [`${y}/${pad2(m)}/${pad2(d)}`, `${y}-${pad2(m)}-${pad2(d)}`]
  const want = norm(candidates[0])

  for (const v of candidates) {
    input.focus()
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    input.click()
    await sleep(250) // 打开面板
    setInputValue(input, v) // 键入完整日期，面板据此定位
    await sleep(220)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }))
    await sleep(200)
    input.blur()
    document.body.click() // 关闭面板
    await sleep(250)
    const got = (r.item.querySelector('.ant-picker-input input')?.value || '').trim()
    if (got && norm(got) === want) return { ok: true, result: `已设日期「${labelOf(r.item)}」= ${got}` }
  }

  const got = (r.item.querySelector('.ant-picker-input input')?.value || '').trim()
  return { ok: false, result: `日期可能未生效（目标 ${y}/${pad2(m)}/${pad2(d)}，当前框内「${got || '空'}」）。该选择器或不可键入；先 get_form 复核，若多次仍失败请在 finish 里标注此字段需人工。` }
}

async function clickButton (target) {
  const action = document.querySelector('.merchant-apply-info__action')
  if (!action) return { ok: false, result: '未找到操作按钮区' }
  if (isConfirm()) return { ok: false, result: '已在最终确认页：禁止提交/前进，请调用 finish 结束。' }
  if (target === 'back') {
    const b = action.querySelector('button.ant-btn-default')
    if (b) { b.click(); await sleep(700) }
    return { ok: true, result: '已返回上一步' }
  }
  // next
  const b = action.querySelector('button.ant-btn-primary')
  if (!b) return { ok: false, result: '未找到「下一步」按钮' }
  if (b.disabled) return { ok: false, result: '「下一步」按钮被禁用：可能有未填必填项或未勾选的项。' }
  b.click()
  await sleep(1000)
  const err = document.querySelector('.ant-form-item-explain-error')
  if (err) return { ok: true, result: `已点下一步，但出现校验错误：${err.textContent.trim()}（请 get_form 复核并修正）` }
  return { ok: true, result: '已进入下一步（请 get_form 查看新步骤）' }
}

async function execTool (name, input) {
  switch (name) {
    case 'get_form': return { ok: true, result: buildSnapshot() }
    case 'read_options': return readOptions(input.ref)
    case 'fill_text': return fillText(input.ref, input.value)
    case 'choose_option': return chooseOption(input.ref, input.option)
    case 'set_date': return setDate(input.ref, input.year, input.month, input.day)
    case 'upload_file': return uploadFile(input.ref)
    case 'click': return clickElement(input.ref)
    case 'click_button': return clickButton(input.target)
    default: return { ok: false, result: '未知工具 ' + name }
  }
}

// ===================== 浮窗面板（shadow DOM 隔离） =====================
let ui = null

function createPanel () {
  if (ui) return
  const host = document.createElement('div')
  host.id = '__apply_agent_host'
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;right:16px;bottom:16px;'
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: -apple-system,"PingFang SC","Hiragino Sans",sans-serif; }
      .card { width: 360px; background:#fff; border:1px solid #d9dbe0; border-radius:10px;
        box-shadow:0 8px 30px rgba(0,0,0,.18); overflow:hidden; font-size:13px; color:#1f2329; }
      .hd { display:flex; align-items:center; justify-content:space-between; padding:8px 12px;
        background:#1f2329; color:#fff; cursor:default; }
      .hd b { font-size:13px; }
      .hd .x { cursor:pointer; opacity:.8; padding:0 4px; }
      .bd { padding:10px 12px; }
      .bd.hidden { display:none; }
      textarea, input, select { width:100%; padding:6px 8px; border:1px solid #d9d9d9; border-radius:6px;
        font-size:13px; font-family:inherit; }
      textarea { resize:vertical; }
      label.fl { display:block; font-weight:600; margin:8px 0 4px; }
      .row { display:flex; gap:8px; margin-top:10px; }
      button { cursor:pointer; border-radius:6px; padding:7px 12px; font-size:13px; border:1px solid transparent; }
      button.pri { flex:1; background:#165dff; color:#fff; font-weight:600; }
      button.pri:disabled { background:#94bfff; }
      button.gho { background:#fff; border-color:#d9d9d9; }
      .status { margin-top:8px; font-size:12px; color:#86909c; min-height:14px; }
      details { margin-top:8px; }
      summary { cursor:pointer; font-weight:600; }
      .log { margin-top:10px; max-height:240px; overflow:auto; background:#f7f8fa; border-radius:6px; padding:6px;
        font:11px/1.5 "SF Mono",Menlo,Consolas,monospace; white-space:pre-wrap; word-break:break-all; }
      .log .l { padding:1px 0; }
      .c-assistant { color:#1f2329; }
      .c-tool { color:#165dff; }
      .c-result { color:#5a6573; }
      .c-result.err { color:#f53f3f; }
      .c-status { color:#86909c; }
      .c-error { color:#f53f3f; font-weight:600; }
      .c-done { color:#00b42a; font-weight:600; }
      .warn { margin-top:8px; padding:6px 8px; background:#fff3e8; border:1px solid #ffcf99; border-radius:6px; color:#cb6a00; font-size:12px; }
    </style>
    <div class="card">
      <div class="hd"><b>加盟店申请 · AI Agent</b><span class="x" id="collapse">—</span></div>
      <div class="bd" id="body">
        <label class="fl" for="scenario">场景描述</label>
        <textarea id="scenario" rows="2" placeholder="例：东京一个个人事业主开的拉面店；留空=随机常见申请"></textarea>
        <div class="warn" id="prodwarn" hidden>⚠️ 生产环境：agent 到确认页会停下、不会提交；请勿手动提交测试数据。</div>
        <div class="row">
          <button class="pri" id="start">开始填写</button>
          <button class="gho" id="stop" disabled>停止</button>
        </div>
        <div class="status" id="status">就绪</div>
        <details id="settings">
          <summary>设置（LM Studio）</summary>
          <label class="fl" for="endpoint">接口地址</label>
          <input id="endpoint" type="text" placeholder="http://10.0.0.64:8434/v1/chat/completions" />
          <label class="fl" for="model">模型名（auto = 自动选已加载模型；需支持 function calling）</label>
          <input id="model" type="text" placeholder="qwen/qwen3-30b-a3b-2507" />
          <label class="fl" for="baseemail">基础邮箱（留空自动探测当前登录用户；邮箱字段会用其加号别名，tag 由 agent 按上下文起）</label>
          <input id="baseemail" type="text" placeholder="自动探测，可手填，如 you@elestyle.jp" />
          <label class="fl" for="uploadimg">固定上传图片（可选，默认用自动生成的测试图）</label>
          <input id="uploadimg" type="file" accept="image/*" />
          <div id="uploadimgname" style="font-size:11px;color:#86909c;margin-top:4px;"></div>
          <div class="row"><button class="gho" id="savecfg">保存</button></div>
        </details>
        <div class="log" id="log"></div>
      </div>
    </div>`
  ;(document.documentElement || document.body).appendChild(host)

  const $ = id => root.getElementById(id)
  ui = {
    host, root,
    body: $('body'),
    scenario: $('scenario'),
    start: $('start'),
    stop: $('stop'),
    status: $('status'),
    log: $('log'),
    endpoint: $('endpoint'),
    model: $('model'),
    baseemail: $('baseemail'),
    uploadimg: $('uploadimg'),
    uploadimgname: $('uploadimgname'),
    prodwarn: $('prodwarn'),
  }

  $('collapse').addEventListener('click', () => ui.body.classList.toggle('hidden'))
  ui.start.addEventListener('click', onStart)
  ui.stop.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'agent:stop' }))
  $('savecfg').addEventListener('click', saveCfg)
  ui.uploadimg.addEventListener('change', onPickImage)

  ui.prodwarn.hidden = !/^business\.(elepay\.io|sterasmartone\.com)$/.test(location.hostname)

  // 载入设置
  chrome.storage.local.get('agentSettings').then(({ agentSettings }) => {
    const s = agentSettings || {}
    if (s.endpoint) ui.endpoint.value = s.endpoint
    if (s.model) ui.model.value = s.model
    // 基础邮箱：设置 > 页面探测；都没有就留空提示
    if (s.baseEmail) ui.baseemail.value = s.baseEmail
    else { const d = detectUserEmail(); if (d) { ui.baseemail.value = d; ui.baseemail.placeholder = `已探测：${d}` } }
    if (s.uploadImage?.name) ui.uploadimgname.textContent = `当前固定图片：${s.uploadImage.name}`
    if (!agentSettings) $('settings').open = true
  })
}

async function mergeSettings (patch) {
  const { agentSettings } = await chrome.storage.local.get('agentSettings')
  await chrome.storage.local.set({ agentSettings: { ...(agentSettings || {}), ...patch } })
}

function saveCfg () {
  const patch = {}
  const ep = ui.endpoint.value.trim()
  const md = ui.model.value.trim()
  const be = ui.baseemail.value.trim()
  if (ep) patch.endpoint = ep
  if (md) patch.model = md
  if (be) patch.baseEmail = be
  mergeSettings(patch).then(() => setStatus('设置已保存'))
}

function onPickImage () {
  const file = ui.uploadimg.files?.[0]
  if (!file) return
  if (file.size > 4 * 1024 * 1024) { setStatus('图片过大（>4MB），请换小图'); ui.uploadimg.value = ''; return }
  const reader = new FileReader()
  reader.onload = () => {
    mergeSettings({ uploadImage: { dataUrl: reader.result, name: file.name, type: file.type } })
      .then(() => { ui.uploadimgname.textContent = `当前固定图片：${file.name}`; setStatus('固定上传图片已保存') })
  }
  reader.readAsDataURL(file)
}

function onStart () {
  saveCfg()
  ui.log.innerHTML = ''
  setRunning(true)
  const baseEmail = ui.baseemail.value.trim() || detectUserEmail()
  chrome.runtime.sendMessage({ type: 'agent:start', scenario: ui.scenario.value.trim(), baseEmail })
}

function setRunning (on) {
  if (!ui) return
  ui.start.disabled = on
  ui.stop.disabled = !on
  setStatus(on ? '运行中…' : '已结束')
}

function setStatus (t) { if (ui) ui.status.textContent = t }

function panelLog (kind, text, extra) {
  if (!ui) return
  const div = document.createElement('div')
  div.className = `l c-${kind}` + (kind === 'result' && extra && extra.ok === false ? ' err' : '')
  const tag = { assistant: '🗣', tool: '▶', result: '↳', status: 'ℹ', error: '✖', done: '✔' }[kind] || ''
  div.textContent = `${tag} ${text}`
  ui.log.appendChild(div)
  ui.log.scrollTop = ui.log.scrollHeight
  if (kind === 'status') setStatus(text)
}

function togglePanel () {
  if (!ui) { createPanel(); return }
  ui.host.style.display = ui.host.style.display === 'none' ? 'block' : 'none'
}

// ===================== 消息总线 =====================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'agent:exec') {
    execTool(msg.name, msg.input)
      .then(r => sendResponse(r))
      .catch(e => sendResponse({ ok: false, result: String(e?.message || e) }))
    return true // 异步
  }
  if (msg?.type === 'agent:log') { panelLog(msg.kind, msg.text, msg.extra); return }
  if (msg?.type === 'agent:ended') { setRunning(false); return }
  if (msg?.type === 'panel:toggle') { togglePanel(); return }
})

// 进入匹配页面即注入浮窗
createPanel()
