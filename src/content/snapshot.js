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

// ApplyFormNew 给方案卡片加了 BEM 类；legacy ApplyForm/steps 的 PlanSelect
// 只有 .plan-select 根节点和直接子卡片；ContractSelect 的取引形態是
// .default-select-business-type-item 卡片。统一走同一 ref/kind='cards' 协议。
const planCardsOf = root => {
  const modern = [...root.querySelectorAll('.plan-select__plan')]
  if (modern.length) return modern
  return [...root.children].filter(el =>
    el.nodeType === 1 && !el.matches('a, button') && el.textContent.trim())
}

const planTitleOf = card =>
  (card.querySelector('.plan-select__plan__title, .font-bold')?.textContent || card.firstElementChild?.textContent || card.textContent || '').trim()

const planIsReadonly = card =>
  card.classList.contains('readonly') || card.className.includes('cursor-default')

const planIsActive = card =>
  card.classList.contains('active') ||
  card.classList.contains('bg-blue-50') ||
  card.className.includes('border-[#1890ff]') ||
  planIsReadonly(card)

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
    // legacy FileUploader 用自定义 itemRender（.file-downloader-item），没有 .ant-upload-list-item
    const n = item.querySelectorAll('.ant-upload-list-item, .file-downloader-item').length
    return n ? `已上传 ${n} 个文件` : ''
  }
  return ''
}

// 标签兜底：法人格下拉、取引形態子选项等无 label 也无 placeholder，
// 用最近一个带 label 的祖先 form-item 的标签 + 「·子字段」序号定位
function contextualLabel (item) {
  const self = item.closest('.ant-form-item')
  let el = self?.parentElement?.closest('.ant-form-item')
  while (el) {
    // 只取祖先自己的直属 label（:scope >），避免误取子字段的 label
    const label = (el.querySelector(':scope > .ant-form-item-label label')?.textContent || '').trim()
    if (label) {
      const leaves = [...el.querySelectorAll('.ant-form-item')]
        .filter(sub => sub !== el && !sub.querySelector('.ant-form-item'))
      const idx = leaves.indexOf(self)
      return `${label.replace(/\s+/g, '')}·子字段${idx + 1}`
    }
    el = el.parentElement?.closest('.ant-form-item')
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
    const f = { ref, kind, label: labelOf(item) || placeholderOf(item) || contextualLabel(item), value: valueOf(item, kind), required: isRequired(item) }
    f.filled = !!String(f.value || '').trim()
    const err = errorOf(item)
    if (err) f.error = err
    if (kind === 'radio' && !f.filled) f.options = [...item.querySelectorAll('.ant-radio-wrapper')].map(w => w.textContent.trim())
    if (kind === 'checkbox') {
      f.options = [...item.querySelectorAll('.ant-checkbox-wrapper')]
        .map(w => ({ label: w.textContent.trim(), checked: !!w.querySelector('.ant-checkbox-checked') }))
    }
    if (kind === 'unknown') f.note = '非标准控件，可能需 read_options/click 或人工处理'
    // 一个 form-item 混多种控件（如 SecurityMeasures 的 select+checkbox-group）：
    // 只按 classify 报主控件，note 提示还有别的控件别漏
    const kindsPresent = [
      item.querySelector('.ant-select') && 'select',
      item.querySelector('.ant-radio-group') && 'radio',
      item.querySelector('.ant-checkbox-wrapper') && 'checkbox',
      item.querySelector('.ant-picker') && 'date',
    ].filter(Boolean)
    if (kindsPresent.length > 1) f.note = `该字段组还包含多种控件：${kindsPresent.join('+')}；快照只报了主控件，处理完主控件后请重新 get_form 检查剩余控件`
    fields.push(f)
  }

  // 2) 料金プラン等可点卡片(.plan-select)
  const cardRoots = new Set()
  scope.querySelectorAll('.plan-select').forEach(el => cardRoots.add(el))
  // ContractSelect 的取引形態（isSupportBusinessSubtype 开启时）是自定义卡片，不在 form-item 里
  scope.querySelectorAll('.default-select-business-type-item').forEach(el => {
    if (el.parentElement) cardRoots.add(el.parentElement)
  })
  cardRoots.forEach(planRoot => {
    if (!visible(planRoot)) return
    const cards = planCardsOf(planRoot)
    if (!cards.length) return
    const ref = 'e' + REFS.length
    REFS.push({ ref, item: planRoot, kind: 'cards' })
    const active = cards.find(planIsActive)
    fields.push({
      ref, kind: 'cards',
      label: (planRoot.closest('.ant-form-item')?.querySelector('.ant-form-item-label label')?.textContent || '料金プラン/方案卡片').trim() || '方案/形態卡片',
      value: active ? planTitleOf(active) : '',
      filled: !!active,
      ...(active ? {} : { options: cards.map(planTitleOf) }), // 已选中的卡片不必再给选项列表，省 token
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
  const actionLabelOf = b => {
    // 先剔除 icon 内容再取文本：搜索按钮内的 .anticon/伪文本不算 label
    const clone = b.cloneNode(true)
    clone.querySelectorAll('.anticon, svg').forEach(el => el.remove())
    const text = (clone.textContent || '').trim()
    if (text) return text
    // 纯图标按钮（法人番号的 a-input-search 検索按钮等）：用所在字段的 label 命名
    if (b.classList.contains('ant-input-search-button')) {
      const fl = b.closest('.ant-form-item')?.querySelector('.ant-form-item-label label')?.textContent.trim()
      return `検索：${fl || '输入框搜索按钮'}`
    }
    return (b.getAttribute('title') || b.getAttribute('aria-label') || '').trim()
  }
  scope.querySelectorAll('button').forEach(b => {
    if (!visible(b) || b.disabled) return
    if (action && action.contains(b)) return
    const label = actionLabelOf(b)
    if (!label) return
    const ref = 'e' + REFS.length
    REFS.push({ ref, item: b, kind: 'button' })
    actions.push({ ref, label })
  })
  // CheckButton（「代表者と同一」「お店と同じ情報」等）：是 <a> + es-icon，非 button、不在 form-item 里
  scope.querySelectorAll('a').forEach(a => {
    if (!visible(a)) return
    const icon = a.querySelector('.es-icon')
    if (!icon) return
    const label = (a.textContent || '').trim()
    if (!label || a.closest('.ant-form-item')) return // 字段内链接（如 es-icon type=link）不当作动作
    const ref = 'e' + REFS.length
    REFS.push({ ref, item: a, kind: 'button' })
    actions.push({ ref, label: `${icon.classList.contains('active') ? '[已选✓]' : '[未选]'} ${label}` })
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
