// snapshot.js —— 「眼」：get_form 表单快照与 ref 管理
// 每次调用 buildSnapshot 重建 REFS（ref → {item, kind}），供 dom-tools 按 ref 操作
// 选择器针对 legacy ApplyForm（.merchant-apply-info__*）；OEM 新版若不同需适配

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
    if (kind === 'radio' && !f.filled) f.options = [...item.querySelectorAll('.ant-radio-wrapper')].map(w => w.textContent.trim())
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
      ...(active ? {} : { options: cards.map(titleOf) }), // 已选中的卡片不必再给选项列表，省 token
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