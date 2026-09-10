// snapshot.js —— 「眼」：get_form 表单快照与 ref 管理（通用表单扫描）
// 分层适配：① Ant Design 字段优先 ② 可点卡片组（无障碍 role 模式） ③ 原生 HTML 控件兜底（任意网页表单：label/fieldset/原生 input/select/textarea）
// 刻意不含任何站点专有选择器：自定义卡片请用 [role=radiogroup]/[role=radio|option] 语义化标记。
// 每次 buildSnapshot 重建 REFS（ref → {item, kind}），供 dom-tools 按 ref 操作。

let REFS = [] // [{ref, item, kind}]
// ref 编号全局自增（不随快照重置）：否则同一批里 get_form 重建 REFS 后，上一轮的 e7 会指向本轮的另一个字段
let refSeq = 0

// 最终提交类按钮文案（安全红线：绝不点击）。多语言覆盖（日/中/英/韩/西/法/德）。
// 刻意不含「申請/次へ/確認/下一步/继续」等常见中间步骤词——宁可误拦（停下留人工）也不放过提交。
const SUBMIT_WORDS = /申し?込|送信|提出|登録|決済|購入|注文|完了|確定|応募|支払う|お支払い|submit|placeorder|ordernow|checkout|purchase|buynow|complete|register|signup|createaccount|paynow|confirmorder|提交|确认提交|立即购买|下单|支付|注册|完成|同意并提交|제출|등록|결제|구매|주문|완료|enviar|soumettre|absenden|bestellen|kaufen|bezahlen|confirmar|comprar|pagar/i
// 短且歧义的词只在按钮文案「完全等于」它时算提交（避免「支払方法を変更」「Apply coupon」被误拦）
const SUBMIT_EXACT = /^(apply|send|pay|order|finish|done|save|送る)$/i

// 中间步骤导航词：含这些词的按钮归 click_button 管，即使同时命中提交词表也不视为最终提交
// （如「登録して次へ」是下一步不是最终提交；「確認画面へ」是去确认页）。导航优先，避免误拦中间步骤。
const NEXT_WORDS = /次へ|次のステップ|確認画面へ|確認へ|進む|続ける|下一步|下一页|继续|next|continue|戻る|前へ|返回|上一步|back|prev/i
// 空白归一（覆盖 Ant 2 字符自动插空格「次 へ」与全角空格）
const normLabel = t => String(t || '').replace(/[\s\u00a0\u3000]+/g, '')
// 最终提交判定唯一入口：命中提交词表 且 不含导航词
const isSubmitLabel = t => { const n = normLabel(t); return (SUBMIT_WORDS.test(n) || SUBMIT_EXACT.test(n)) && !NEXT_WORDS.test(n) }

// —— 作用域：可见表单中控件最多的 → body ——
function pickScope () {
  let best = null
  for (const f of [...document.querySelectorAll('form')].filter(visible)) {
    const n = f.querySelectorAll('input:not([type="hidden"]), select, textarea').length
    if (n > 0 && (!best || n > best.n)) best = { f, n }
  }
  // 只有当这个 form 装着页面上过半的控件时才认它：主表单不用 <form>（React/Vue 常见）而页头有个
  // 搜索/登录 form 时，否则整个扫描会跑偏到搜索框上
  const all = document.querySelectorAll('input:not([type="hidden"]), select, textarea').length
  return best && best.n * 2 >= all ? best.f : document.body
}
const scopeEl = () => pickScope()

// —— 确认页判定 ——
// 通用启发式：范围内没有可编辑控件（含 contenteditable 富文本）+ 页面出现「最终提交」类按钮。
const isConfirm = () => {
  const scope = scopeEl()
  const editable = [...scope.querySelectorAll('input, textarea, select, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]')]
    .filter(el => visible(el) && !el.disabled && !['hidden', 'button', 'submit', 'reset', 'image', 'file'].includes(el.type || ''))
  if (editable.length) return false
  // 开关是 button 元素（无 input 子元素）：纯开关步骤 + 提交词按钮不能误判为确认页
  const hasSwitch = [...scope.querySelectorAll('button[role="switch"], button.ant-switch')]
    .some(el => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true')
  if (hasSwitch) return false
  return [...document.querySelectorAll('button, input[type="submit"], [role="button"], a.ant-btn')]
    .some(b => visible(b) && !b.disabled && isSubmitLabel(b.textContent || b.value))
}

const stepTitle = () =>
  (document.querySelector('.ant-steps-item-active .ant-steps-item-title')?.textContent || '').trim() ||
  (document.querySelector('h1, h2')?.textContent || '').trim()

// —— 控件类型（Ant 组件优先，原生兜底；执行端 dom-tools 再按有无 .ant-* 分支）——
function classify (item) {
  // item 自身即控件（多个 label+input 平铺共享父容器时，降级为控件本身作单元）：
  // querySelector 只查后代查不到自身，须直接判断
  if (item.matches?.('input, select, textarea')) {
    if (item.matches('input[type="file"]')) return 'upload'
    if (item.matches('input[type="date"], input[type="month"]')) return 'date'
    if (item.matches('input[type="radio"]')) return 'radio'
    if (item.matches('input[type="checkbox"]')) return 'checkbox'
    if (item.matches('input[type="number"]')) return 'number'
    if (item.tagName === 'SELECT') return 'select'
    if (item.tagName === 'TEXTAREA') return 'textarea'
    return 'text'
  }
  // 开关本体（button[role=switch]，无 input 子元素）：input 系已在上分支返回，这里只剩非 input 元素
  if (item.matches?.('.ant-switch, [role="switch"]')) return 'switch'
  if (item.querySelector('.ant-upload') || item.querySelector('input[type="file"]')) return 'upload'
  if (item.querySelector('.ant-picker') || item.querySelector('input[type="date"], input[type="month"]')) return 'date'
  if (item.querySelector('.ant-input-number') || item.querySelector('input[type="number"]')) return 'number'
  if (item.querySelector('.ant-radio-group') || item.querySelector('input[type="radio"]')) return 'radio'
  if (item.querySelector('.ant-select') || item.querySelector('select')) return 'select'
  if (item.querySelector('textarea')) return 'textarea'
  if (item.querySelector('.ant-checkbox-wrapper') || item.querySelector('input[type="checkbox"]')) return 'checkbox'
  if (item.querySelector('.ant-switch')) return 'switch'
  if (item.querySelector('input:not([type="file"])')) return 'text'
  // contenteditable 富文本（div[contenteditable] 等，现代表单常见）
  if (item.matches?.('[contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]') || item.querySelector('[contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]')) return 'richtext'
  return 'unknown'
}

const labelOf = item => {
  // fieldset 组：legend 是组标题（若直接取 label 会拿到第一个选项文本）
  const legend = item.querySelector?.('legend')?.textContent
  if (legend && legend.trim()) return legend.trim().replace(/\s+/g, ' ')
  // label 自身就是字段容器（原生 label 包 input）：取其文本但排除内嵌控件
  if (item.matches?.('label')) {
    const txt = [...item.childNodes]
      .filter(n => !(n.nodeType === 1 && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/i.test(n.tagName)))
      .map(n => n.textContent).join('')
    return txt.trim().replace(/\s+/g, ' ')
  }
  // item 自身即控件（平铺结构的降级单元）：label 查询不含自身，改查兄弟 label[for] 或自身 aria-label
  const selfId = item.matches?.('input, select, textarea') ? item.id : ''
  const t = (selfId && document.querySelector(`label[for="${CSS.escape(selfId)}"]`)?.textContent)
    || item.querySelector('.ant-form-item-label label, label')?.textContent
    || item.getAttribute?.('aria-label')
    || ''
  return String(t).trim().replace(/\s+/g, ' ')
}

const errorOf = item => {
  const sel = '.ant-form-item-explain-error, .invalid-feedback, .error-message, .field-error, [class*="form-error"]'
  // 子单元：Ant 把 explain-error 渲染在 .ant-form-item 下、输入组之外，只看自身/父元素会漏掉
  const scope = item.closest?.('.ant-form-item') ||
    (item.matches?.('input, select, textarea') ? (item.parentElement || item.closest('div, p, li')) : item)
  const textErr = [...(scope?.querySelectorAll(sel) || [])]
    .filter(visible)
    .map(el => (el.textContent || '').trim())
    .find(Boolean)
  if (textErr) return textErr
  // aria-invalid 不进通用选择器：挂在容器 div 上会把 label+错误整段文本当错误返回；
  // 只认控件自身被标记的情况——页面没有错误文案节点时给 agent 一个明确信号
  const control = [...(scope?.querySelectorAll('input, select, textarea') || [])]
    .find(el => el.getAttribute('aria-invalid') === 'true' && visible(el))
  return control ? '（控件被标记 aria-invalid：校验失败但无可见错误文案，请按字段语义换值重试）' : ''
}

// 必填：Ant 标记 / 原生 required / aria-required
const isRequired = item =>
  !!(item.querySelector('.ant-form-item-required, [required], [aria-required="true"]') ||
     item.matches?.('[required], [aria-required="true"]') ||
     // 子单元（输入组分段、input-group 容器等）：必填标记挂在外层 .ant-form-item 的 label 上，
     // 不往上找就会漏判成非必填 → 进不了 missingRequired，agent 按「跳过已完成」规则整段略过
     item.closest?.('.ant-form-item')?.querySelector('.ant-form-item-label .ant-form-item-required'))

// 取控件 placeholder 当标签兜底（无 label 只有 placeholder 的字段，如地址组子字段）
const placeholderOf = item => {
  const el = (item.matches?.('input[placeholder], textarea[placeholder]') && item) || item.querySelector('input[placeholder], textarea[placeholder]')
  if (el) return (el.getAttribute('placeholder') || '').trim()
  const sp = item.querySelector('.ant-select-selection-placeholder')
  return sp ? sp.textContent.trim() : ''
}

// —— 取值（Ant + 原生两路）——
// 选项文本：label 包裹 → 兄弟 label[for] → value。三种写法都常见，快照与 choose_option 必须同一口径，
// 否则会出现「快照列出了选项、按文本却选不中」
const optionTextOf = i => (
  i.closest('label')?.textContent ||
  (i.id && document.querySelector(`label[for="${CSS.escape(i.id)}"]`)?.textContent) ||
  i.value || ''
).trim()

function valueOf (item, kind) {
  if (kind === 'text' || kind === 'textarea' || kind === 'number') {
    if (item.matches?.('input, textarea')) return item.value || ''
    // 数字框优先读 .ant-input-number-input，避免抓到 stepper 等无关 input；hidden 排除（否则排在前面时读到 csrf 等假值）
    return (item.querySelector('.ant-input-number-input, textarea, input:not([type="hidden"])')?.value || '')
  }
  if (kind === 'select') {
    // Ant select：单/多选都取所有已选 .ant-select-selection-item（多选有多个）
    const ant = [...item.querySelectorAll('.ant-select-selection-item')]
    if (ant.length) return ant.map(el => (el.getAttribute('title') || el.textContent).trim()).filter(Boolean).join(' | ')
    // 原生 select：占位项（value=""，如「選択してください」）视为未填——浏览器会自动选中它，不能当已填
    const nat = item.querySelector('select')
    const opt = nat?.selectedOptions?.[0]
    return opt && opt.value !== '' ? opt.textContent.trim() : ''
  }
  if (kind === 'radio') {
    const ant = item.querySelector('.ant-radio-wrapper-checked')
    if (ant) return ant.textContent.trim()
    const c = item.querySelector('input[type="radio"]:checked')
    return c ? optionTextOf(c) : ''
  }
  if (kind === 'checkbox') {
    const ant = [...item.querySelectorAll('.ant-checkbox-wrapper')]
    if (ant.length) return ant.filter(w => w.querySelector('.ant-checkbox-checked')).map(w => w.textContent.trim()).join(' | ')
    return [...item.querySelectorAll('input[type="checkbox"]')]
      .filter(i => i.checked).map(optionTextOf).join(' | ')
  }
  if (kind === 'date') {
    const ant = item.querySelector('.ant-picker-input input')
    if (ant) return ant.value || ''
    return (item.querySelector('input[type="date"], input[type="month"]')?.value || '')
  }
  if (kind === 'upload') {
    const n = item.querySelectorAll('.ant-upload-list-item').length
    if (n) return `已上传 ${n} 个文件`
    return item.querySelector('input[type="file"]')?.files?.length ? '已选文件' : ''
  }
  if (kind === 'switch') {
    const sw = item.matches?.('.ant-switch, [role="switch"]') ? item : item.querySelector('.ant-switch, [role="switch"]')
    if (!sw) return ''
    const on = sw.classList.contains('ant-switch-checked') || sw.getAttribute('aria-checked') === 'true'
    return on ? 'on' : 'off'
  }
  if (kind === 'richtext') {
    const el = item.matches?.('[contenteditable]') ? item : item.querySelector('[contenteditable]')
    return (el?.textContent || '').trim()
  }
  return ''
}

// —— 选项列表（radio/checkbox 两路；native select 的 options 也免费可读）——
// 滤 disabled：与 choose_option 的可用性口径一致，否则「快照列了选项、按文本却选不中」
const radioOptionsOf = item => {
  const ant = [...item.querySelectorAll('.ant-radio-wrapper')].filter(w => !w.classList.contains('ant-radio-wrapper-disabled'))
  if (ant.length) return ant.map(w => w.textContent.trim())
  return [...item.querySelectorAll('input[type="radio"]')].filter(i => !i.disabled).map(optionTextOf).filter(Boolean)
}
const checkboxOptionsOf = item => {
  const ant = [...item.querySelectorAll('.ant-checkbox-wrapper')].filter(w => !w.classList.contains('ant-checkbox-wrapper-disabled'))
  if (ant.length) return ant.map(w => ({ label: w.textContent.trim(), checked: !!w.querySelector('.ant-checkbox-checked') }))
  return [...item.querySelectorAll('input[type="checkbox"]')].filter(i => !i.disabled)
    .map(i => ({ label: optionTextOf(i), checked: i.checked }))
    .filter(o => o.label)
}

// 单元容器：父级若是 form 级大容器则以控件自身为单元，避免把整个 form 当成一个字段
// （否则 click(ref) 的 querySelector('button') 会摸到表单里的提交按钮）
const unitBox = el => {
  const p = el.closest('label') || el.parentElement
  return p && p.matches('form, body, main, [role="main"], table') ? el : p
}

// 原生控件 → 字段单元：radio/checkbox 尝试按 name 在组容器（fieldset/[role]/ul/table）内聚合；
// 其余取最近 label 或父元素为单元。已被 Ant 路径覆盖的控件跳过。
function nativeFieldUnits (scope, covered) {
  const els = [...scope.querySelectorAll('input, select, textarea, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"], button[role="switch"], button.ant-switch')]
    .filter(el => visible(el) && !el.disabled)
    // type 黑名单只对 input 生效：button 的 type 默认 submit，不能沿用 input 语义过滤
    .filter(el => el.tagName !== 'INPUT' || !['hidden', 'button', 'submit', 'reset', 'image'].includes(el.type || ''))
    .filter(el => !covered.some(c => c.contains(el)))
    .filter(el => !el.closest('.ant-select, .ant-picker, .ant-upload'))
  const units = []
  const seen = new Set()
  for (const el of els) {
    let box
    if (el.type === 'radio' || el.type === 'checkbox') {
      let grp = el.closest('fieldset, [role="radiogroup"], [role="group"], ul, table')
      if (!grp) {
        // 无显式组容器时用「最近 div」聚合：该 div 内同类控件 >1 才当组（独立包装 div 不会误组）
        const div = el.closest('div')
        if (div && [...div.querySelectorAll(`input[type="${el.type}"]`)].filter(i => visible(i) && !i.disabled).length > 1) grp = div
      }
      if (grp && [...grp.querySelectorAll(`input[type="${el.type}"]`)].filter(i => !i.disabled).length > 1) {
        box = grp
      } else box = unitBox(el)
    } else {
      box = unitBox(el)
    }
    if (!box) continue
    if (seen.has(box)) {
      // 常见结构：多个 label+input 平铺在 form/同一父容器里，共享 box 会被去重丢字段 → 降级为控件自身作单元。
      // radio/checkbox 例外：同组控件共享组容器是正常的，降级会造出查不到任何选项的幻影字段。
      if ((box === el.parentElement || box === el.closest('label')) && el.type !== 'radio' && el.type !== 'checkbox') box = el
      else continue
    }
    if (seen.has(box)) continue
    seen.add(box)
    units.push(box)
  }
  return units
}

// —— 可点卡片组检测（通用无障碍模式：[role=radio]/[role=option] 组，如套餐/方案二选一卡片）——
// 返回 [{root, cards, titleOf, activeOf}]；titleOf 取卡片标题，activeOf 判选中态。
function findCardGroups (scope) {
  const groups = []
  for (const grp of scope.querySelectorAll('[role="radiogroup"], [role="group"]')) {
    const cards = [...grp.querySelectorAll('[role="radio"], [role="option"]')].filter(visible)
    if (cards.length > 1) groups.push({
      root: grp,
      cards,
      titleOf: c => c.textContent.trim(),
      activeOf: c => c.getAttribute('aria-checked') === 'true' || c.classList.contains('active') || c.classList.contains('selected'),
    })
  }
  return groups
}

// 页面语言检测：优先 html[lang]，否则按 body 文本 CJK 字符启发式（ja/zh/ko）
// 目标表单以日文为主：检测不到时默认按日文处理（多语言能力保留，prompt 按 lang 自适应）
const DEFAULT_LANG = 'ja'
function detectLang (doc = document) {
  const t = (doc.body?.textContent || '').slice(0, 2000)
  // 假名/谚文是日/韩独有文字：html[lang] 标错时（日文表单标 en 很常见）以页面文本为准
  if (/[\u3040-\u30ff]/.test(t)) return 'ja'
  if (/[\uac00-\ud7af]/.test(t)) return 'ko'
  const htmlLang = (doc.documentElement?.getAttribute('lang') || '').trim()
  if (htmlLang) return htmlLang
  // 汉字 zh/ja 共用有歧义：只在没有 html[lang] 线索时才按文本判 zh
  if (/[\u4e00-\u9fff]/.test(t)) return 'zh'
  return ''
}

function buildSnapshot () {
  REFS = []
  const scope = scopeEl()
  const fields = []
  const covered = [] // 已被 Ant/卡片路径覆盖的元素（原生扫描跳过其中控件）

  // 1) Ant 表单字段（.ant-form-item）
  const items = [...scope.querySelectorAll('.ant-form-item')].filter(visible)
  for (const item of items) {
    if (item.querySelector('.ant-form-item')) continue // 跳过含嵌套子项的父容器
    // 平铺多个输入框的项（a-input-group：电话分段/姓名分栏/地址组）：整项只能寻址到第一个，
    // 填完就 filled=true 而校验因其余为空报错 → 不认领，交给原生扫描按控件逐个建 ref
    const plainInputs = [...item.querySelectorAll('input:not([type="hidden"]), textarea')].filter(visible)
    if (plainInputs.length > 1 && !item.querySelector('.ant-select, .ant-picker, .ant-radio-group, .ant-checkbox-wrapper, .ant-upload, .ant-input-number')) continue
    covered.push(item)
    let kind = classify(item)
    const ref = 'e' + (refSeq++)
    REFS.push({ ref, item, kind })
    const f = { ref, kind, label: labelOf(item) || placeholderOf(item), value: valueOf(item, kind), required: isRequired(item) }
    f.filled = !!String(f.value || '').trim()
    if (kind === 'switch') f.filled = f.value === 'on' // 开关 off 是有效字符串，需单独判定
    if (kind === 'select' && item.querySelector('.ant-select-multiple')) f.multiple = true // 多选下拉
    const err = errorOf(item)
    if (err) f.error = err
    if (kind === 'radio' && !f.filled) f.options = radioOptionsOf(item)
    if (kind === 'checkbox') f.options = checkboxOptionsOf(item)
    if (kind === 'unknown') f.note = '非标准控件，可能需 read_options/click 或人工处理'
    fields.push(f)
  }

  // 2) 可点卡片组（[role=radio]/[role=option] 无障碍组）
  for (const { root, cards, titleOf, activeOf } of findCardGroups(scope)) {
    if (!visible(root)) continue
    covered.push(root)
    const ref = 'e' + (refSeq++)
    REFS.push({ ref, item: root, kind: 'cards', cards, titleOf, activeOf })
    const active = cards.find(activeOf)
    fields.push({
      ref, kind: 'cards', label: '方案/计划卡片',
      value: active ? titleOf(active) : '',
      filled: !!active,
      ...(active ? {} : { options: cards.map(titleOf) }), // 已选中的卡片不必再给选项列表，省 token
      required: true, // 卡片组通常必填；若目标站点非必填，模型看到 filled 会跳
    })
  }

  // 3) 原生 HTML 控件兜底（不在 Ant 字段/卡片内的 input/select/textarea）
  for (const box of nativeFieldUnits(scope, covered)) {
    if (!visible(box)) continue
    const kind = classify(box)
    if (kind === 'unknown') continue
    const ref = 'e' + (refSeq++)
    REFS.push({ ref, item: box, kind })
    const f = { ref, kind, label: labelOf(box) || placeholderOf(box), value: valueOf(box, kind), required: isRequired(box) }
    f.filled = !!String(f.value || '').trim()
    if (kind === 'switch') f.filled = f.value === 'on' // 开关 off 是有效字符串，需单独判定
    const err = errorOf(box)
    if (err) f.error = err
    if (kind === 'radio' && !f.filled) f.options = radioOptionsOf(box)
    if (kind === 'checkbox') f.options = checkboxOptionsOf(box)
    // 原生 select 的选项静态可读，直接带上（Ant select 的选项是动态的，需 read_options）；
    // 空值占位项（value="" 的「選択してください」）滤掉，避免 first 选中占位造成假填充
    if (kind === 'select' && !f.filled) {
      const all = [...(box.querySelector('select')?.options || [])]
      const real = all.filter(o => o.value !== '')
      f.options = (real.length ? real : all).map(o => (o.textContent || '').trim()).filter(Boolean).slice(0, 60)
    }
    fields.push(f)
  }

  // 4) 导航按钮（通用：全页面扫描，覆盖 form 外部的步骤条与底部操作区，如 .ant-steps-action）
  const buttons = []
  const allNavElements = Array.from(new Set([
    ...scope.querySelectorAll('button, input[type="submit"], [role="button"], a.ant-btn'),
    ...document.querySelectorAll('button, input[type="submit"], [role="button"], a.ant-btn, .ant-steps-action button')
  ])).filter(visible)

  const btnEntries = []
  allNavElements.forEach(b => {
    const t = (b.textContent || b.value || '').trim()
    if (!t) return
    const forbidden = isSubmitLabel(t)
    const disabled = b.disabled || b.getAttribute('aria-disabled') === 'true' || b.classList.contains('ant-btn-disabled') || b.classList.contains('is-disabled')
    btnEntries.push({
      label: t,
      kind: forbidden ? 'submit' : ((b.type === 'submit' || /primary|main/i.test(b.className)) ? 'primary' : 'default'),
      disabled: !!disabled,
      forbidden, // 最终提交类：点击会被硬拦截
    })
  })
  // 头部导航按钮多时前 15 个可能全是页头菜单：提交词/主按钮优先入列，其余按文档序补足
  const rank = e => (e.forbidden ? 2 : 0) + (e.kind === 'primary' ? 1 : 0)
  buttons.push(...btnEntries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => rank(b.e) - rank(a.e) || a.i - b.i)
    .slice(0, 15)
    .map(x => x.e))

  // 5) 步骤内其它可点按钮（如「住所自動入力」/「自动带入地址」），给 ref 供 click 使用
  // 口径与 buttons 一致：原生 button + [role=button] + a 按钮；上限 20 个控制快照 token
  const actions = []
  ;[...new Set(scope.querySelectorAll('button, [role="button"], a.ant-btn, a[role="button"]'))].slice(0, 20).forEach(b => {
    if (!visible(b) || b.disabled) return
    const label = (b.textContent || '').trim()
    if (!label) return
    if (isSubmitLabel(label)) return // 最终提交类不进 actions，避免 click 误点
    if (b.closest('.ant-upload')) return // 上传触发器归 upload_file；click 会弹原生文件框阻塞页面
    // 导航类按钮（次へ/戻る/確認画面へ…）归属 click_button，不进 actions
    if (NEXT_WORDS.test(normLabel(label))) return
    const ref = 'e' + (refSeq++)
    REFS.push({ ref, item: b, kind: 'button' })
    actions.push({ ref, label })
  })

  // 按页面视觉顺序（文档序）重排字段，保证模型从上到下逐个处理
  // ref→item 建表一次：sort 比较触发 O(n log n) 次回调，逐次 REFS.find 是 O(n²) 线性扫描，大表单下省掉重复遍历
  const itemOf = new Map(REFS.map(r => [r.ref, r.item]))
  fields.sort((a, b) => {
    const ea = itemOf.get(a.ref)
    const eb = itemOf.get(b.ref)
    if (!ea || !eb) return 0
    return ea.compareDocumentPosition(eb) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  })

  const missingRequired = fields
    .filter(f => f.required && !f.filled)
    .map(f => `${f.ref}:${f.label || '(无标签)'}`)

  // 超大表单保护：字段明细只给前 80 个（REFS 全保留，ref 照常可用）；
  // missingRequired 不受影响（全量），模型按序处理完本批后 get_form 继续。
  const MAX_SNAPSHOT_FIELDS = 80
  const totalFields = fields.length
  let truncatedFields = 0
  if (fields.length > MAX_SNAPSHOT_FIELDS) {
    truncatedFields = fields.length - MAX_SNAPSHOT_FIELDS
    fields.length = MAX_SNAPSHOT_FIELDS
  }

  return {
    stepTitle: stepTitle(),
    isConfirmStep: isConfirm(),
    lang: detectLang() || DEFAULT_LANG,
    fields,
    buttons,
    actions,
    missingRequired,
    ...(truncatedFields ? { totalFields, truncatedFields } : {}),
  }
}

// 按 ref 取字段：ref 已失效（SPA 路由切换/步骤重建后 DOM 节点被移除）时返回 null，
// 调用方会得到「ref 已失效，请 get_form 重新快照」的明确提示，而不是静默写孤儿节点。
const getRef = ref => {
  const r = REFS.find(r => r.ref === ref)
  if (!r) return null
  // 节点已 detach（框架重渲染）→ 失效。按钮也不例外：点游离节点是空操作却会返回「已点击」
  if (r.item.isConnected === false) return null
  return r
}