// snapshot.js —— 「眼」：get_form 表单快照与 ref 管理（通用表单扫描）
// 分层适配：① Ant Design 字段（elepay legacy ApplyForm 及任何 Ant 页面优先）
//          ② 料金プラン类可点卡片（elepay）
//          ③ 原生 HTML 控件兜底（任意网页表单：label/fieldset/原生 input/select/textarea）
// 每次 buildSnapshot 重建 REFS（ref → {item, kind}），供 dom-tools 按 ref 操作。

let REFS = [] // [{ref, item, kind}]

// 最终提交类按钮文案（安全红线：绝不点击）。刻意不含「申請/次へ/確認」等常见中间步骤词。
// 宁可误拦（停下留人工）也不放过提交。
const SUBMIT_WORDS = /申込|申込み|送信|登録|提出|決済|購入|注文|完了|submit|place order|order now|checkout|purchase|buy now|complete/i

// —— 作用域：elepay 专属 → 可见表单中控件最多的 → body ——
function pickScope () {
  const elepay = document.querySelector('.merchant-apply-info__content') || document.querySelector('.merchant-apply-info')
  if (elepay && elepay.querySelector('.ant-form-item, input, select, textarea')) return elepay
  let best = null
  for (const f of [...document.querySelectorAll('form')].filter(visible)) {
    const n = f.querySelectorAll('input:not([type="hidden"]), select, textarea').length
    if (n > 0 && (!best || n > best.n)) best = { f, n }
  }
  return best ? best.f : document.body
}
const scopeEl = () => pickScope()

// —— 确认页判定 ——
// elepay 专属标记优先；通用启发式：范围内没有可编辑控件 + 页面出现「最终提交」类按钮。
const isConfirm = () => {
  if (document.querySelector('.merchant-apply-info__section')) return true
  const scope = scopeEl()
  const editable = [...scope.querySelectorAll('input, textarea, select')]
    .filter(el => visible(el) && !el.disabled && !['hidden', 'button', 'submit', 'reset', 'image', 'file'].includes(el.type || ''))
  if (editable.length) return false
  return [...document.querySelectorAll('button, input[type="submit"]')]
    .some(b => visible(b) && !b.disabled && SUBMIT_WORDS.test((b.textContent || b.value || '').trim()))
}

const stepTitle = () =>
  (document.querySelector('.merchant-apply-info__title')?.textContent || '').trim() ||
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
    if (item.tagName === 'SELECT') return 'select'
    if (item.tagName === 'TEXTAREA') return 'textarea'
    return 'text'
  }
  if (item.querySelector('.ant-upload') || item.querySelector('input[type="file"]')) return 'upload'
  if (item.querySelector('.ant-picker') || item.querySelector('input[type="date"], input[type="month"]')) return 'date'
  if (item.querySelector('.ant-radio-group') || item.querySelector('input[type="radio"]')) return 'radio'
  if (item.querySelector('.ant-select') || item.querySelector('select')) return 'select'
  if (item.querySelector('textarea')) return 'textarea'
  if (item.querySelector('.ant-checkbox-wrapper') || item.querySelector('input[type="checkbox"]')) return 'checkbox'
  if (item.querySelector('input:not([type="file"])')) return 'text'
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
  const sel = '.ant-form-item-explain-error, .invalid-feedback, .error-message, .field-error, [class*="form-error"], [aria-invalid="true"]'
  const scope = item.matches?.('input, select, textarea') ? (item.parentElement || item.closest('div, p, li')) : item
  const el = scope?.querySelector(sel)
  return (el?.textContent || '').trim()
}

// 必填：Ant 标记 / 原生 required / aria-required
const isRequired = item =>
  !!(item.querySelector('.ant-form-item-required, [required], [aria-required="true"]') ||
     item.matches?.('[required], [aria-required="true"]'))

// 取控件 placeholder 当标签兜底（无 label 只有 placeholder 的字段，如地址组子字段）
const placeholderOf = item => {
  const el = (item.matches?.('input[placeholder], textarea[placeholder]') && item) || item.querySelector('input[placeholder], textarea[placeholder]')
  if (el) return (el.getAttribute('placeholder') || '').trim()
  const sp = item.querySelector('.ant-select-selection-placeholder')
  return sp ? sp.textContent.trim() : ''
}

// —— 取值（Ant + 原生两路）——
const radioTextOf = i => (i.closest('label')?.textContent || i.value || '').trim()

function valueOf (item, kind) {
  if (kind === 'text' || kind === 'textarea') {
    if (item.matches?.('input, textarea')) return item.value || ''
    return (item.querySelector('textarea, input')?.value || '')
  }
  if (kind === 'select') {
    const ant = item.querySelector('.ant-select-selection-item')
    if (ant) return (ant.getAttribute('title') || ant.textContent).trim()
    // 原生 select：占位项（value=""，如「選択してください」）视为未填——浏览器会自动选中它，不能当已填
    const nat = item.querySelector('select')
    const opt = nat?.selectedOptions?.[0]
    return opt && opt.value !== '' ? opt.textContent.trim() : ''
  }
  if (kind === 'radio') {
    const ant = item.querySelector('.ant-radio-wrapper-checked')
    if (ant) return ant.textContent.trim()
    const c = item.querySelector('input[type="radio"]:checked')
    return c ? radioTextOf(c) : ''
  }
  if (kind === 'checkbox') {
    const ant = [...item.querySelectorAll('.ant-checkbox-wrapper')]
    if (ant.length) return ant.filter(w => w.querySelector('.ant-checkbox-checked')).map(w => w.textContent.trim()).join(' | ')
    return [...item.querySelectorAll('input[type="checkbox"]')]
      .filter(i => i.checked).map(i => (i.closest('label')?.textContent || i.value || '').trim()).join(' | ')
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
  return ''
}

// —— 选项列表（radio/checkbox 两路；native select 的 options 也免费可读）——
const radioOptionsOf = item => {
  const ant = [...item.querySelectorAll('.ant-radio-wrapper')]
  if (ant.length) return ant.map(w => w.textContent.trim())
  return [...item.querySelectorAll('input[type="radio"]')].map(radioTextOf).filter(Boolean)
}
const checkboxOptionsOf = item => {
  const ant = [...item.querySelectorAll('.ant-checkbox-wrapper')]
  if (ant.length) return ant.map(w => ({ label: w.textContent.trim(), checked: !!w.querySelector('.ant-checkbox-checked') }))
  return [...item.querySelectorAll('input[type="checkbox"]')]
    .map(i => ({ label: (i.closest('label')?.textContent || i.value || '').trim(), checked: i.checked }))
    .filter(o => o.label)
}

// 原生控件 → 字段单元：radio/checkbox 尝试按 name 在组容器（fieldset/[role]/ul/table）内聚合；
// 其余取最近 label 或父元素为单元。已被 Ant 路径覆盖的控件跳过。
function nativeFieldUnits (scope, covered) {
  const els = [...scope.querySelectorAll('input, select, textarea')]
    .filter(el => visible(el) && !el.disabled)
    .filter(el => !['hidden', 'button', 'submit', 'reset', 'image'].includes(el.type || ''))
    .filter(el => !covered.some(c => c.contains(el)))
    .filter(el => !el.closest('.ant-select, .ant-picker, .ant-upload, .plan-select'))
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
      } else box = el.closest('label') || el.parentElement
    } else {
      box = el.closest('label') || el.parentElement
    }
    if (!box) continue
    if (seen.has(box)) {
      // 常见结构：多个 label+input 平铺在 form/同一父容器里，共享 box 会被去重丢字段 → 降级为控件自身作单元
      if (box === el.parentElement || box === el.closest('label')) box = el
      else continue
    }
    if (seen.has(box)) continue
    seen.add(box)
    units.push(box)
  }
  return units
}

function buildSnapshot () {
  REFS = []
  const scope = scopeEl()
  const fields = []
  const covered = [] // 已被 Ant/卡片路径覆盖的元素（原生扫描跳过其中控件）

  // 1) Ant 表单字段（elepay legacy ApplyForm 及任何 Ant 页面）
  const items = [...scope.querySelectorAll('.ant-form-item')].filter(visible)
  for (const item of items) {
    if (item.querySelector('.ant-form-item')) continue // 跳过含嵌套子项的父容器
    if (item.querySelector('.plan-select')) continue // 料金プラン卡片另行处理
    covered.push(item)
    let kind = classify(item)
    const ref = 'e' + REFS.length
    REFS.push({ ref, item, kind })
    const f = { ref, kind, label: labelOf(item) || placeholderOf(item), value: valueOf(item, kind), required: isRequired(item) }
    f.filled = !!String(f.value || '').trim()
    const err = errorOf(item)
    if (err) f.error = err
    if (kind === 'radio' && !f.filled) f.options = radioOptionsOf(item)
    if (kind === 'checkbox') f.options = checkboxOptionsOf(item)
    if (kind === 'unknown') f.note = '非标准控件，可能需 read_options/click 或人工处理'
    fields.push(f)
  }

  // 2) 料金プラン等可点卡片(.plan-select)
  scope.querySelectorAll('.plan-select').forEach(planRoot => {
    if (!visible(planRoot)) return
    covered.push(planRoot)
    const cards = [...planRoot.querySelectorAll('.plan-select__plan')]
    if (!cards.length) return
    const ref = 'e' + REFS.length
    REFS.push({ ref, item: planRoot, kind: 'cards' })
    const active = cards.find(c => c.classList.contains('active'))
    const titleOf = c => (c.querySelector('.plan-select__plan__title')?.textContent || c.textContent || '').trim()
    fields.push({
      ref, kind: 'cards', label: '方案/计划卡片',
      value: active ? titleOf(active) : '',
      filled: !!active,
      ...(active ? {} : { options: cards.map(titleOf) }), // 已选中的卡片不必再给选项列表，省 token
      required: true, // 卡片组通常必填（elepay 料金プラン即如此）；若目标站点非必填，跳过即可
    })
  })

  // 3) 原生 HTML 控件兜底（不在 Ant 字段/卡片内的 input/select/textarea）
  for (const box of nativeFieldUnits(scope, covered)) {
    if (!visible(box)) continue
    const kind = classify(box)
    if (kind === 'unknown') continue
    const ref = 'e' + REFS.length
    REFS.push({ ref, item: box, kind })
    const f = { ref, kind, label: labelOf(box) || placeholderOf(box), value: valueOf(box, kind), required: isRequired(box) }
    f.filled = !!String(f.value || '').trim()
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

  // 4) 导航按钮（elepay 专属区优先；通用：submit/primary 类按钮，标注最终提交类为禁止）
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
  } else {
    ;[...scope.querySelectorAll('button, input[type="submit"]')].filter(visible).filter(b => !b.disabled).slice(0, 10).forEach(b => {
      const t = (b.textContent || b.value || '').trim()
      if (!t) return
      const forbidden = SUBMIT_WORDS.test(t)
      buttons.push({
        label: t,
        kind: forbidden ? 'submit' : ((b.type === 'submit' || /primary|main/i.test(b.className)) ? 'primary' : 'default'),
        disabled: b.disabled,
        forbidden, // 最终提交类：点击会被硬拦截
      })
    })
  }

  // 5) 步骤内其它可点按钮（如「住所自動入力」/「自动带入地址」），给 ref 供 click 使用
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

  // 按页面视觉顺序（文档序）重排字段，保证模型从上到下逐个处理
  fields.sort((a, b) => {
    const ea = REFS.find(r => r.ref === a.ref)?.item
    const eb = REFS.find(r => r.ref === b.ref)?.item
    if (!ea || !eb) return 0
    return ea.compareDocumentPosition(eb) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  })

  const missingRequired = fields
    .filter(f => f.required && !String(f.value || '').trim())
    .map(f => `${f.ref}:${f.label || '(无标签)'}`)

  return {
    stepTitle: stepTitle(),
    isConfirmStep: isConfirm(),
    fields,
    buttons,
    actions,
    missingRequired,
  }
}

// 按 ref 取字段：ref 已失效（SPA 路由切换/步骤重建后 DOM 节点被移除）时返回 null，
// 调用方会得到「ref 已失效，请 get_form 重新快照」的明确提示，而不是静默写孤儿节点。
const getRef = ref => {
  const r = REFS.find(r => r.ref === ref)
  if (!r) return null
  // 按钮类元素（如住所自動入力）可能被框架暂时移出 DOM 又放回；其它字段一旦 detach 即失效
  if (r.kind !== 'button' && r.item.isConnected === false) return null
  return r
}