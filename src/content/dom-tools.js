// dom-tools.js —— 「手」：DOM 工具执行器（fill_text / choose_option / set_date / click 等）
// 注：同一轮的多个工具调用会被 background 并行执行，select 类操作用互斥锁排队，避免多个下拉互相开合干扰

const optText = o => (o.getAttribute('title') || o.textContent || '').trim()
const usableOption = o =>
  o.getAttribute('aria-disabled') !== 'true' &&
  !o.classList.contains('ant-select-item-option-disabled') &&
  !o.classList.contains('es-options-item-tips')
const optionsReady = root =>
  [...root.querySelectorAll('.ant-select-item-option')].some(usableOption) || !!root.querySelector('.ant-empty')

// 定位该字段专属的下拉浮层（aria-owns / aria-controls），避免读到其它字段的下拉；取不到则退回全局
function dropdownEl (item) {
  const sel = item.querySelector('.ant-select')
  const inp = item.querySelector('.ant-select-selection-search input, .ant-select input')
  const id = (sel && (sel.getAttribute('aria-owns') || sel.getAttribute('aria-controls'))) ||
    (inp && (inp.getAttribute('aria-controls') || inp.getAttribute('aria-owns')))
  return id ? document.getElementById(id) : null
}
function optionsOf (item) {
  const dd = dropdownEl(item)
  if (dd) return dd.classList.contains('ant-select-dropdown-hidden') ? [] : [...dd.querySelectorAll('.ant-select-item-option')]
  return [...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')]
}

// select 操作互斥：并行批量执行工具时防止多个下拉互相开合/串台
let selectQueue = Promise.resolve()
function withSelectLock (fn) {
  const p = selectQueue.then(fn)
  selectQueue = p.then(() => {}, () => {})
  return p
}

async function openSelect (item) {
  const selector = item.querySelector('.ant-select-selector') || item.querySelector('.ant-select')
  selector?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  selector?.click()
  // 等下拉浮层出现且渲染出选项（动态接口选项可能异步到达），出现即早退
  const timeout = item.querySelector('.es-search-select') ? 4000 : 1000
  await waitFor(() => {
    const dd = dropdownEl(item)
    if (dd) return !dd.classList.contains('ant-select-dropdown-hidden') && optionsReady(dd)
    const visibleDropdown = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    return !!visibleDropdown && optionsReady(visibleDropdown)
  }, { timeout, step: 50 })
}
async function closeSelect (item) {
  const input = item.querySelector('input')
  input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  const dd = dropdownEl(item)
  if (dd) {
    if (!dd.classList.contains('ant-select-dropdown-hidden')) {
      await sleep(80)
      if (!dd.classList.contains('ant-select-dropdown-hidden')) document.body.click() // Escape 没关掉才用全局点击，避免误关其它浮层
    }
  } else {
    await sleep(60)
    document.body.click()
  }
}

async function fillText (ref, value) {
  const r = getRef(ref)
  if (!r) return { ok: false, result: `ref ${ref} 不存在，请重新 get_form` }
  // 防误用：上传/日期/单选/复选/卡片不适用 fill_text（select 保留：搜索型下拉需要键入过滤）
  if (['upload', 'date', 'radio', 'checkbox', 'cards'].includes(r.kind)) {
    return { ok: false, result: `字段「${labelOf(r.item) || ref}」类型是 ${r.kind}，请改用对应工具：date→set_date、upload→upload_file、radio/checkbox/cards→choose_option` }
  }
  const input = r.item.querySelector('textarea, input')
  if (!input) return { ok: false, result: '该字段不是文本框' }
  setNativeValue(input, value) // 已含 input+change 事件
  // es-input-currency / a-input-number：额外发 blur 触发 antd-vue InputNumber 的失焦归一化与校验
  if (input.closest('.ant-input-number')) {
    input.dispatchEvent(new Event('blur', { bubbles: true }))
  }
  await sleep(30)
  const got = input.value || ''
  return { ok: true, result: `已填「${labelOf(r.item)}」= ${value}${got && got !== value ? `（控件已归一化为 ${got}）` : ''}` }
}

async function chooseOption (ref, option) {
  const r = getRef(ref)
  if (!r) return { ok: false, result: `ref ${ref} 不存在，请重新 get_form` }
  if (isConfirm()) return { ok: false, result: '已在最终确认页：禁止修改选项，请调用 finish 结束。' }

  if (r.kind === 'select') {
    return withSelectLock(async () => {
      await openSelect(r.item)
      const opts = optionsOf(r.item).filter(usableOption)
      let target = opts.find(o => optText(o) === option) || opts.find(o => optText(o).includes(option))
      if (!target) {
        const list = opts.slice(0, 20).map(optText).join(' / ')
        await closeSelect(r.item)
        return { ok: false, result: `未找到选项「${option}」。当前可选：${list || '(空，可能是联动下拉需先选上级)'}` }
      }
      const wanted = optText(target)
      target.click()
      const selected = await waitFor(() => [...r.item.querySelectorAll('.ant-select-selection-item')]
        .some(el => optText(el) === wanted), { timeout: 700, step: 50 })
      if (!selected) return { ok: false, result: `点击选项「${wanted}」后未检测到选中状态，请 get_form 复核` }
      return { ok: true, result: `已选「${labelOf(r.item)}」= ${wanted}` }
    })
  }

  if (r.kind === 'radio') {
    const wraps = [...r.item.querySelectorAll('.ant-radio-wrapper')]
    const w = wraps.find(x => x.textContent.trim() === option) || wraps.find(x => x.textContent.trim().includes(option))
    if (!w) return { ok: false, result: `未找到单选项「${option}」，可选：${wraps.map(x => x.textContent.trim()).join(' / ')}` }
    w.click()
    await waitFor(() => !!w.querySelector('.ant-radio-checked') || w.classList.contains('ant-radio-wrapper-checked'), { timeout: 400, step: 40 })
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
      // 等 Vue 更新到目标状态（早退），避免下一次 get_form 读到旧状态导致反复勾选
      await waitFor(() => wraps.every(w => !!w.querySelector('.ant-checkbox-checked') === want), { timeout: 600, step: 40 })
      if (n === 0) return { ok: true, result: `复选框已是目标状态（无需改动，当前勾选 ${checkedNow()}/${wraps.length}），请前进到下一项` }
      return { ok: true, result: `已${want ? '勾选' : '取消'} ${n} 个复选框（当前勾选 ${checkedNow()}/${wraps.length}）` }
    }
    const w = wraps.find(x => x.textContent.trim().includes(option))
    if (!w) return { ok: false, result: `未找到复选项「${option}」` }
    if (!w.querySelector('.ant-checkbox-checked')) (w.querySelector('input.ant-checkbox-input') || w).click()
    await waitFor(() => !!w.querySelector('.ant-checkbox-checked'), { timeout: 400, step: 40 })
    return { ok: true, result: `「${option}」当前${w.querySelector('.ant-checkbox-checked') ? '已勾选' : '未勾选'}` }
  }

  if (r.kind === 'cards') {
    const cards = planCardsOf(r.item)
    const card = cards.find(c => planTitleOf(c) === option) || cards.find(c => planTitleOf(c).includes(option))
    if (!card) return { ok: false, result: `未找到卡片「${option}」，可选：${cards.map(planTitleOf).join(' / ')}` }
    card.click()
    const selected = await waitFor(() => planIsActive(card), { timeout: 500, step: 50 })
    if (!selected) return { ok: false, result: `卡片「${planTitleOf(card)}」点击后未显示已选状态，请 get_form 复核` }
    return { ok: true, result: `已选卡片「${planTitleOf(card)}」` }
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

// 上传列表项计数：legacy FileUploader 用自定义 itemRender（.file-downloader-item），
// 标准 a-upload 才有 .ant-upload-list-item，两者都兼容
const uploadItemsOf = item => [...item.querySelectorAll('.ant-upload-list-item, .file-downloader-item')]

// 向 Ant Upload 字段塞文件并触发上传（默认 dummy 图 / 面板固定图）
async function uploadFile (ref) {
  const r = getRef(ref)
  if (!r) return { ok: false, result: `ref ${ref} 不存在，请重新 get_form` }
  const input = r.item.querySelector('input[type="file"]')
  if (!input) return { ok: false, result: '该字段不是上传组件（找不到 file input）' }
  let file
  try { file = await makeUploadFile() } catch (e) { return { ok: false, result: '生成上传文件失败：' + (e?.message || e) } }
  const n0 = uploadItemsOf(r.item).length
  try {
    const dt = new DataTransfer()
    dt.items.add(file)
    input.files = dt.files
  } catch (e) {
    return { ok: false, result: '无法写入 file input：' + (e?.message || e) }
  }
  input.dispatchEvent(new Event('change', { bubbles: true }))
  // 等上传项出现且上传结束（上传中带 .ant-upload-list-item-uploading）：快则早退，慢则最多 12s
  // FileUploader 的真实上传走 fileApi.upload（OSS），列表项上传成功后才出现
  await waitFor(() => {
    const items = uploadItemsOf(r.item)
    return items.length > n0 && items.every(it => !it.classList.contains('ant-upload-list-item-uploading'))
  }, { timeout: 12000, step: 120 })
  const n = uploadItemsOf(r.item).length
  const err = r.item.querySelector('.ant-upload-list-item-error')
  if (err) return { ok: false, result: `上传可能失败（列表项标红）。该字段或只接受特定类型(如 PDF)，需人工。` }
  if (n <= n0) return { ok: false, result: '上传后列表未出现文件（可能被组件拒绝，如类型/数量/大小限制），需人工处理。' }
  return { ok: true, result: `已上传「${file.name}」，当前列表 ${n} 个文件；稍后可 get_form 复核。` }
}

// 点任意按钮/元素（如「住所自動入力」），ref 来自 get_form 的 actions/fields
async function clickElement (ref) {
  const r = getRef(ref)
  if (!r) return { ok: false, result: `ref ${ref} 不存在，请重新 get_form` }
  if (isConfirm()) return { ok: false, result: '已在最终确认页：禁止点击页面元素（防误提交），请调用 finish 结束。' }
  const el = r.item.matches('button') ? r.item : (r.item.querySelector('button') || r.item)
  const label = (r.item.textContent || '').trim()
  // 「住所自動入力」等按钮会异步查邮编带出地址：轮询等表单值变化，有变化立即返回
  if (/住所|自動入力|検索|search/i.test(label)) {
    const scope = scopeEl()
    const before = [...scope.querySelectorAll('input')].map(i => i.value)
    el.click()
    const changed = await waitFor(() => {
      const now = [...scope.querySelectorAll('input')].map(i => i.value)
      return now.length !== before.length || now.some((v, i) => v !== before[i])
    }, { timeout: 3000, step: 100 })
    await sleep(150)
    return { ok: true, result: `已点击「${label || ref}」${changed ? '，已检测到表单值带出' : '（3 秒内未检测到值变化）'}；请 get_form 复核地址汉字+カナ` }
  }
  el.click()
  await sleep(250)
  return { ok: true, result: `已点击 ${ref}（如为「住所自動入力」，请 get_form 复核地址是否带出汉字+カナ）` }
}

async function readOptions (ref, query = '') {
  const r = getRef(ref)
  if (!r) return { ok: false, result: `ref ${ref} 不存在，请重新 get_form` }
  if (r.kind === 'radio') {
    return { ok: true, result: { options: [...r.item.querySelectorAll('.ant-radio-wrapper')].map(w => w.textContent.trim()) } }
  }
  if (r.kind === 'checkbox') {
    return { ok: true, result: { options: [...r.item.querySelectorAll('.ant-checkbox-wrapper')].map(w => w.textContent.trim()) } }
  }
  if (r.kind !== 'select') return { ok: false, result: `字段类型 ${r.kind} 没有可读选项` }
  return withSelectLock(async () => {
    await openSelect(r.item)
    const keyword = String(query || '').trim()
    if (keyword) {
      const input = r.item.querySelector('.ant-select-selection-search-input, .ant-select input')
      if (!input) {
        await closeSelect(r.item)
        return { ok: false, result: `下拉「${labelOf(r.item)}」没有可用搜索框，无法搜索「${keyword}」` }
      }
      setInputValue(input, keyword)
      // EsSearchSelect 的远程搜索有 500ms debounce；静态 options 则会更快更新。
      await sleep(520)
      await waitFor(() => {
        const dd = dropdownEl(r.item)
        const visibleDropdown = dd || document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
        return !!visibleDropdown && optionsReady(visibleDropdown)
      }, { timeout: 2500, step: 60 })
    }
    const opts = optionsOf(r.item).filter(usableOption).map(optText).filter(Boolean)
    await closeSelect(r.item)
    return { ok: true, result: { count: opts.length, options: opts.slice(0, 60), ...(keyword ? { query: keyword } : {}) } }
  })
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
    await waitFor(() => !!document.querySelector('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)'), { timeout: 500, step: 40 })
    setInputValue(input, v) // 键入完整日期，面板据此定位
    await sleep(120)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }))
    await sleep(100)
    input.blur()
    document.body.click() // 关闭面板
    await sleep(120)
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

  // 轮询等步骤切换（标题/确认页状态变化），有变化早退，比固定 sleep 快
  const before = {
    title: (document.querySelector('.merchant-apply-info__title')?.textContent || '').trim(),
    confirm: isConfirm(),
  }
  const waitStepChange = () => waitFor(() => {
    const title = (document.querySelector('.merchant-apply-info__title')?.textContent || '').trim()
    return title !== before.title || isConfirm() !== before.confirm
  }, { timeout: 1500, step: 80 })

  if (target === 'back') {
    const b = action.querySelector('button.ant-btn-default')
    if (!b || b.disabled) return { ok: false, result: '未找到可用的「返回」按钮（可能已在第一步）' }
    b.click()
    await waitStepChange()
    await sleep(150)
    return { ok: true, result: '已返回上一步（请 get_form 查看）' }
  }
  // next
  const b = action.querySelector('button.ant-btn-primary')
  if (!b) return { ok: false, result: '未找到「下一步」按钮' }
  if (b.disabled) return { ok: false, result: '「下一步」按钮被禁用：可能有未填必填项或未勾选的项。' }
  b.click()
  const changed = await waitStepChange()
  await sleep(200) // 等新步骤渲染
  const err = document.querySelector('.ant-form-item-explain-error')
  if (err) return { ok: true, result: `已点下一步，但出现校验错误：${err.textContent.trim()}（请 get_form 复核并修正）` }
  return { ok: true, result: changed ? '已进入下一步（请 get_form 查看新步骤）' : '已点下一步（未检测到步骤变化，可能校验未过，请 get_form 复核）' }
}

// 工具分发：background 下发的 agent:exec 按名字路由到这里
async function execTool (name, input) {
  switch (name) {
    case 'get_form': return { ok: true, result: buildSnapshot() }
    case 'read_options': return readOptions(input.ref, input.query)
    case 'fill_text': return fillText(input.ref, input.value)
    case 'choose_option': return chooseOption(input.ref, input.option)
    case 'set_date': return setDate(input.ref, input.year, input.month, input.day)
    case 'upload_file': return uploadFile(input.ref)
    case 'click': return clickElement(input.ref)
    case 'click_button': return clickButton(input.target)
    default: return { ok: false, result: '未知工具 ' + name }
  }
}
