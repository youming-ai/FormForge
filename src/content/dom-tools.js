// dom-tools.js —— 「手」：DOM 工具执行器（fill_text / choose_option / set_date / click 等）
// 注：同一轮的多个工具调用会被 background 并行执行，select 类操作用互斥锁排队，避免多个下拉互相开合干扰

const optText = o => (o.getAttribute('title') || o.textContent || '').trim()
// 可用选项 = 非禁用、非搜索提示项（es-options-item-tips 是「输入关键词搜索」提示，不是选项）
const usableOption = o =>
  o.getAttribute('aria-disabled') !== 'true' &&
  !o.classList.contains('ant-select-item-option-disabled') &&
  !o.classList.contains('es-options-item-tips')
// 下拉状态：'usable' 有可用选项 / 'empty' 空态 / false 仍加载中。
// 注意：空态(.ant-empty)若立即当作就绪，会在异步选项还没到达时就提前返回，拿到空列表。
const optionState = root => {
  if (!root) return false
  if ([...root.querySelectorAll('.ant-select-item-option')].some(usableOption)) return 'usable'
  return root.querySelector('.ant-empty') ? 'empty' : false
}

// 定位该字段专属的下拉浮层（aria-owns / aria-controls），避免读到其它字段的下拉；取不到则退回全局
function dropdownEl (item) {
  const sel = item.querySelector('.ant-select')
  const inp = item.querySelector('.ant-select-selection-search input, .ant-select input')
  const id = (sel && (sel.getAttribute('aria-owns') || sel.getAttribute('aria-controls'))) ||
    (inp && (inp.getAttribute('aria-controls') || inp.getAttribute('aria-owns')))
  return id ? document.getElementById(id) : null
}
// 完整按下序列：真实点击 = pointerdown → mousedown → mouseup → click。
// rc-select 打开浮层/选中选项都在 mousedown 上响应，仅 click() 不够。
function pressEl (el) {
  try { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })) } catch { /* 旧环境忽略 */ }
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  el.click()
}

// 该字段当前生效的浮层：优先 aria-owns 定位；其上没有选项时退回「当前可见浮层」。
// 有的组件重渲染后 aria-owns 仍指向旧节点（显示空态），真实带选项的浮层是另一个节点——
// 这就是「用户能看到选项、代码却读到空」的原因。
function activeDropdown (item) {
  const dd = dropdownEl(item)
  const vis = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
  if (dd && !dd.classList.contains('ant-select-dropdown-hidden')) {
    if (dd.querySelector('.ant-select-item-option')) return dd
    return vis || dd
  }
  return vis
}
function optionsOf (item) {
  const root = activeDropdown(item)
  return root ? [...root.querySelectorAll('.ant-select-item-option')] : []
}

function outsideClick () {
  // 顺序接近真实交互：pointerdown → mousedown → click（rc-select 关浮层监听 pointerdown/mousedown）
  try { document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })) } catch { /* 旧浏览器忽略 */ }
  document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  document.body.click()
}
const anyOpenDropdown = () => document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')

// select 操作互斥：并行批量执行工具时防止多个下拉互相开合/串台
let selectQueue = Promise.resolve()
function withSelectLock (fn) {
  const p = selectQueue.then(fn)
  selectQueue = p.then(() => {}, () => {})
  return p
}

async function openSelect (item) {
  // 其它浮层开着会把本次 mousedown 当成外部点击（或 toggle 成关闭）：先关掉并等它收起
  if (anyOpenDropdown()) {
    outsideClick()
    await waitFor(() => !anyOpenDropdown(), { timeout: 400, step: 50 })
  }
  const selector = item.querySelector('.ant-select-selector') || item.querySelector('.ant-select')
  pressEl(selector) // 完整按下序列打开浮层
  // 聚焦搜索框：动态下拉的选项异步加载常挂在 focus 上
  const input = item.querySelector('.ant-select-selection-search-input, .ant-select input')
  if (input) {
    input.focus()
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
  }
  // 等「可见浮层」里出现可用选项（动态接口选项异步到达）；搜索型下拉给 4s
  const timeout = item.querySelector('.es-search-select') ? 4000 : 2500
  return await waitFor(() => optionState(activeDropdown(item)) === 'usable', { timeout, step: 50 })
}
async function closeSelect (item) {
  const input = item.querySelector('input')
  input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  const dd = dropdownEl(item) || anyOpenDropdown()
  if (dd && !dd.classList.contains('ant-select-dropdown-hidden')) outsideClick()
  // 主动等浮层真正隐藏；800ms 还在就再补一轮外部点击
  const closed = await waitFor(() => !anyOpenDropdown(), { timeout: 800, step: 60 })
  if (!closed) await sleep(120)
  return closed
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
  setNativeValue(input, value)
  await sleep(30)
  // 主动 blur：很多框架在失焦时才触发校验，让错误尽早出现在下一次 get_form 快照里
  input.blur()
  await sleep(50)
  return { ok: true, result: `已填「${labelOf(r.item)}」= ${value}` }
}

async function chooseOption (ref, option) {
  const r = getRef(ref)
  if (!r) return { ok: false, result: `ref ${ref} 不存在，请重新 get_form` }

  if (r.kind === 'select') {
    // 原生 <select>：直接设值（不走 Ant 互斥锁/浮层逻辑）
    if (!r.item.querySelector('.ant-select')) {
      const sel = r.item.matches('select') ? r.item : r.item.querySelector('select')
      if (!sel) return { ok: false, result: '该字段没有可用 select' }
      // first/random 跳过空值占位项（選択してください），避免选中占位造成假填充
      const all = [...sel.options].filter(o => (o.textContent || o.value || '').trim())
      const real = all.filter(o => o.value !== '')
      const opts = (real.length ? real : all).map(o => ({ o, t: (o.textContent || o.value).trim() }))
      if (!opts.length) return { ok: false, result: '该下拉没有可选项' }
      const want = String(option ?? '').trim()
      const hit = /^(random|随机|任意)$/i.test(want) ? opts[Math.floor(Math.random() * opts.length)]
        : /^(first|第一个|默认)$/i.test(want) ? opts[0]
        : (opts.find(x => x.t === want) || opts.find(x => x.t.includes(want)))
      if (!hit) return { ok: false, result: `未找到选项「${option}」。当前可选：${opts.slice(0, 20).map(x => x.t).join(' / ')}` }
      sel.value = hit.o.value
      sel.dispatchEvent(new Event('input', { bubbles: true }))
      sel.dispatchEvent(new Event('change', { bubbles: true }))
      return { ok: true, result: `已选「${labelOf(r.item) || r.ref || ''}」= ${hit.t}` }
    }
    return withSelectLock(async () => {
      const norm = t => String(t || '').replace(/\s+/g, '')
      const selectedTexts = () => [...r.item.querySelectorAll('.ant-select-selection-item')].map(el => optText(el))
      // 键盘兜底：聚焦搜索框 → ArrowDown 激活首项 → Enter 选中
      const kbSelect = async () => {
        const input = r.item.querySelector('.ant-select-selection-search-input, .ant-select input')
        input?.focus?.()
        for (const [key, kc] of [['ArrowDown', 40], ['Enter', 13]]) {
          for (const type of ['keydown', 'keyup']) {
            (input || document.activeElement)?.dispatchEvent(new KeyboardEvent(type, { key, code: key, keyCode: kc, which: kc, bubbles: true, cancelable: true }))
          }
          await sleep(80)
        }
      }

      // 目标解析：random=随机可用项（测试场景推荐）/ first=第一个 / 文本匹配
      const resolveTarget = (opts) => {
        const want = String(option ?? '').trim()
        if (/^(random|随机|任意)$/i.test(want)) return opts[Math.floor(Math.random() * opts.length)]
        if (/^(first|第一个|默认)$/i.test(want)) return opts[0]
        return opts.find(o => optText(o) === want) || opts.find(o => optText(o).includes(want))
      }

      for (let attempt = 1; attempt <= 2; attempt++) {
        await openSelect(r.item)
        const opts = optionsOf(r.item).filter(usableOption)

        if (!opts.length) {
          // 无可用选项：诊断需区分「aria-owns 浮层」与「当前可见浮层」（两者可能是不同节点）
          const dd = dropdownEl(r.item)
          const vis = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
          const empty = (vis || dd)?.querySelector('.ant-empty')
          const diag = JSON.stringify({
            raw: optionsOf(r.item).length,
            emptyText: empty?.textContent?.trim() || '',
            ownDropdown: dd ? (dd.classList.contains('ant-select-dropdown-hidden') ? 'hidden' : 'visible') : 'none',
            visDropdown: vis ? 'visible' : 'none',
            visOptions: vis ? vis.querySelectorAll('.ant-select-item-option').length : null,
            sameNode: dd && vis ? dd === vis : null,
            selectDisabled: !!r.item.querySelector('.ant-select-disabled'),
          })
          await closeSelect(r.item)
          return { ok: false, result: `下拉无可用选项（诊断：${diag}）。可能是联动下拉需先选上级、选项未加载完，可稍后 read_options 重试` }
        }

        const target = resolveTarget(opts)
        if (!target) {
          const list = opts.slice(0, 20).map(optText).join(' / ')
          await closeSelect(r.item)
          return { ok: false, result: `未找到选项「${option}」。当前可选：${list}` }
        }
        const wanted = optText(target)

        if (attempt === 1) {
          pressEl(target) // 完整按下序列（rc-select 在 mousedown 上响应选择）
        } else {
          await kbSelect() // 键盘兜底
        }
        // 回读校验：选中项出现且文本匹配（whitespace 归一化 + 双向 includes 容错）
        const verified = await waitFor(
          () => selectedTexts().some(t => norm(t) && (norm(t) === norm(wanted) || norm(t).includes(norm(wanted)) || norm(wanted).includes(norm(t)))),
          { timeout: 800, step: 50 })
        if (verified) {
          const got = selectedTexts()[0] || wanted
          return { ok: true, result: `已选「${labelOf(r.item)}」= ${got}${attempt > 1 ? '（键盘兜底）' : ''}` }
        }
        await closeSelect(r.item)
        await sleep(120)
      }
      const cur = (r.item.querySelector('.ant-select-selection-item')?.textContent || '').trim()
      return { ok: false, result: `选择「${option}」两次（点击/键盘）均未验证通过，当前框内值：${cur || '空'}。请 get_form 复核实际值再决定` }
    })
  }

  if (r.kind === 'radio') {
    const wraps = [...r.item.querySelectorAll('.ant-radio-wrapper')]
    // 原生 radio（无 Ant wrapper）：按文本/值找 input 点击（radio 天然互斥）
    if (!wraps.length) {
      const radios = [...r.item.querySelectorAll('input[type="radio"]')]
      if (!radios.length) return { ok: false, result: '该字段没有可选项' }
      const by = i => (i.closest('label')?.textContent || i.value || '').trim()
      const want = String(option ?? '').trim()
      const target = /^(random|随机|任意)$/i.test(want) ? radios[Math.floor(Math.random() * radios.length)]
        : (radios.find(i => by(i) === want) || radios.find(i => by(i).includes(want)))
      if (!target) return { ok: false, result: `未找到单选项「${option}」，可选：${radios.map(by).join(' / ')}` }
      target.click()
      await waitFor(() => target.checked, { timeout: 400, step: 40 })
      return { ok: true, result: `已选「${labelOf(r.item) || r.ref || ''}」= ${by(target)}` }
    }
    const w = wraps.find(x => x.textContent.trim() === option) || wraps.find(x => x.textContent.trim().includes(option))
    if (!w) return { ok: false, result: `未找到单选项「${option}」，可选：${wraps.map(x => x.textContent.trim()).join(' / ')}` }
    w.click()
    await waitFor(() => !!w.querySelector('.ant-radio-checked') || w.classList.contains('ant-radio-wrapper-checked'), { timeout: 400, step: 40 })
    return { ok: true, result: `已选「${labelOf(r.item)}」= ${w.textContent.trim()}` }
  }

  if (r.kind === 'checkbox') {
    const wraps = [...r.item.querySelectorAll('.ant-checkbox-wrapper')]
    // 原生 checkbox（无 Ant wrapper）
    if (!wraps.length) {
      const inputs = [...r.item.querySelectorAll('input[type="checkbox"]')]
      if (!inputs.length) return { ok: false, result: '该字段没有复选框' }
      const by = i => (i.closest('label')?.textContent || i.value || '').trim()
      if (option === 'check' || option === 'uncheck') {
        const want = option === 'check'
        let n = 0
        inputs.forEach(i => { if (i.checked !== want) { i.click(); n++ } })
        await waitFor(() => inputs.every(i => i.checked === want), { timeout: 600, step: 40 })
        if (n === 0) return { ok: true, result: `复选框已是目标状态（当前勾选 ${inputs.filter(i => i.checked).length}/${inputs.length}）` }
        return { ok: true, result: `已${want ? '勾选' : '取消'} ${n} 个复选框` }
      }
      const w = inputs.find(i => by(i).includes(option))
      if (!w) return { ok: false, result: `未找到复选项「${option}」` }
      if (!w.checked) w.click()
      await waitFor(() => w.checked, { timeout: 400, step: 40 })
      return { ok: true, result: `「${option}」已勾选` }
    }
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
    const cards = [...r.item.querySelectorAll('.plan-select__plan')]
    const titleOf = c => (c.querySelector('.plan-select__plan__title')?.textContent || c.textContent || '').trim()
    const card = cards.find(c => titleOf(c) === option) || cards.find(c => titleOf(c).includes(option))
    if (!card) return { ok: false, result: `未找到卡片「${option}」，可选：${cards.map(titleOf).join(' / ')}` }
    card.click()
    await waitFor(() => card.classList.contains('active'), { timeout: 500, step: 50 })
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
  const n0 = r.item.querySelectorAll('.ant-upload-list-item').length
  try {
    const dt = new DataTransfer()
    dt.items.add(file)
    input.files = dt.files
  } catch (e) {
    return { ok: false, result: '无法写入 file input：' + (e?.message || e) }
  }
  input.dispatchEvent(new Event('change', { bubbles: true }))
  // 非 Ant 上传组件（原生 input[type=file]）：塞入即成功，无列表 UI 可等
  if (!r.item.querySelector('.ant-upload')) {
    await sleep(150)
    const nf = input.files?.length || 0
    return nf > 0
      ? { ok: true, result: `已向「${labelOf(r.item) || ref}」塞入 ${nf} 个文件（原生上传控件，无列表 UI；可 get_form 复核）` }
      : { ok: false, result: '文件未能写入 input.files，需人工处理。' }
  }
  // 等上传项出现且上传结束（上传中带 .ant-upload-list-item-uploading）：快则早退，慢则最多 12s
  await waitFor(() => {
    const items = [...r.item.querySelectorAll('.ant-upload-list-item')]
    return items.length > n0 && items.every(it => !it.classList.contains('ant-upload-list-item-uploading'))
  }, { timeout: 12000, step: 120 })
  const n = r.item.querySelectorAll('.ant-upload-list-item').length
  const err = r.item.querySelector('.ant-upload-list-item-error')
  if (err) return { ok: false, result: `上传可能失败（列表项标红）。该字段或只接受特定类型(如 PDF)，需人工。` }
  if (n <= n0) return { ok: false, result: '上传后列表未出现文件（可能被组件拒绝），需人工处理。' }
  return { ok: true, result: `已上传「${file.name}」，当前列表 ${n} 个文件；稍后可 get_form 复核。` }
}

// 点任意按钮/元素（如「住所自動入力」），ref 来自 get_form 的 actions/fields
async function clickElement (ref) {
  const r = getRef(ref)
  if (!r) return { ok: false, result: `ref ${ref} 不存在，请重新 get_form` }
  if (isConfirm()) return { ok: false, result: '已在最终确认页：禁止点击页面元素（防误提交），请调用 finish 结束。' }
  const el = r.item.matches('button') ? r.item : (r.item.querySelector('button') || r.item)
  const label = (r.item.textContent || '').trim()
  // 「住所自動入力 / 自动带入地址 / 邮编搜索」等异步按钮：轮询等表单值变化，有变化立即返回
  if (/住所|自動入力|自动|邮编|郵便|検索|search|lookup/i.test(label)) {
    const scope = scopeEl()
    const before = [...scope.querySelectorAll('input')].map(i => i.value)
    el.click()
    const changed = await waitFor(() => {
      const now = [...scope.querySelectorAll('input')].map(i => i.value)
      return now.length !== before.length || now.some((v, i) => v !== before[i])
    }, { timeout: 3000, step: 100 })
    await sleep(150)
    return { ok: true, result: `已点击「${label || ref}」${changed ? '，已检测到表单值带出' : '（3 秒内未检测到值变化）'}；请 get_form 复核自动带出的值` }
  }
  el.click()
  await sleep(250)
  return { ok: true, result: `已点击「${label || ref}」（请 get_form 复核效果）` }
}

async function readOptions (ref, query = '') {
  const r = getRef(ref)
  if (!r) return { ok: false, result: `ref ${ref} 不存在，请重新 get_form` }
  if (r.kind === 'radio') {
    return { ok: true, result: { options: radioOptionsOf(r.item) } }
  }
  if (r.kind === 'checkbox') {
    return { ok: true, result: { options: checkboxOptionsOf(r.item) } }
  }
  if (r.kind !== 'select') return { ok: false, result: `字段类型 ${r.kind} 没有可读选项` }
  // 原生 select：options 静态可读（get_form 已带，这里按需全量/过滤）
  if (!r.item.querySelector('.ant-select')) {
    const sel = r.item.matches('select') ? r.item : r.item.querySelector('select')
    if (!sel) return { ok: false, result: '该字段没有可用 select' }
    const all = [...sel.options].map(o => (o.textContent || o.value || '').trim()).filter(Boolean)
    const real = [...sel.options].filter(o => o.value !== '').map(o => (o.textContent || '').trim()).filter(Boolean)
    let opts = real.length ? real : all // 空值占位项滤掉
    const keyword = String(query || '').trim()
    if (keyword) opts = opts.filter(t => t.includes(keyword))
    return { ok: true, result: { count: opts.length, options: opts.slice(0, 60), ...(keyword ? { query: keyword } : {}) } }
  }
  return withSelectLock(async () => {
    await openSelect(r.item)
    const keyword = String(query || '').trim()
    let input = null
    if (keyword) {
      // EsSearchSelect 银行/支店等远程分页下拉：在下拉搜索框键入关键词再读
      input = r.item.querySelector('.ant-select-selection-search-input, .ant-select input')
      if (!input) {
        await closeSelect(r.item)
        return { ok: false, result: `下拉「${labelOf(r.item)}」没有可用搜索框，无法搜索「${keyword}」` }
      }
      input.focus()
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
      setNativeValue(input, keyword)
      await sleep(700) // EsSearchSelect 远程搜索 debounce 500ms + 接口耗时
      await waitFor(() => optionState(activeDropdown(r.item)) === 'usable', { timeout: 3000, step: 80 })
    }
    let opts = optionsOf(r.item).filter(usableOption).map(optText).filter(Boolean)
    // 查询无结果：清空搜索框回退读全量（该字段可能不是远程搜索，而是打开即全量加载）
    if (keyword && opts.length === 0 && input) {
      setNativeValue(input, '')
      await sleep(500)
      opts = optionsOf(r.item).filter(usableOption).map(optText).filter(Boolean)
    }
    await closeSelect(r.item)
    const res = { count: opts.length, options: opts.slice(0, 60) }
    if (keyword) res.query = keyword
    return { ok: true, result: res }
  })
}

async function setDate (ref, y, m, d) {
  const r = getRef(ref)
  if (!r) return { ok: false, result: `ref ${ref} 不存在，请重新 get_form` }
  // 原生 date input：直接设 YYYY-MM-DD
  const native = r.item.querySelector('input[type="date"]') || (r.item.matches?.('input[type="date"]') ? r.item : null)
  if (native) {
    const v = `${y}-${pad2(m)}-${pad2(d)}`
    setNativeValue(native, v)
    await sleep(100)
    return native.value === v
      ? { ok: true, result: `已设日期「${labelOf(r.item) || r.ref || ''}」= ${native.value}` }
      : { ok: false, result: `日期未生效（目标 ${v}，当前「${native.value || '空'}」）` }
  }
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

// 找导航按钮：elepay 专属区优先，通用兜底（按文案/类型/样式评分，排除最终提交词）
function findNavButton (kind) {
  const action = document.querySelector('.merchant-apply-info__action')
  if (action) {
    const b = kind === 'back' ? action.querySelector('button.ant-btn-default') : action.querySelector('button.ant-btn-primary')
    if (b && !b.disabled) return b
    return null
  }
  const scope = scopeEl()
  const btns = [...scope.querySelectorAll('button, input[type="submit"]'), ...document.querySelectorAll('button[type="submit"], input[type="submit"]')]
    .filter(b => visible(b) && !b.disabled)
  const text = b => (b.textContent || b.value || '').trim()
  if (kind === 'back') {
    return btns.find(b => /^(戻る|戻|前へ|前|back|prev)/i.test(text(b))) || null
  }
  // next：像「推进本步」的按钮（显式下一步文案 > submit 类型 > primary 样式），排除最终提交词
  const nextish = b => /次へ|次の|次|next|進む|続ける|continue|step/i.test(text(b)) || b.type === 'submit' || /primary|main/i.test(b.className)
  const score = b => (/次へ|次|next|進む|continue/i.test(text(b)) ? 3 : 0) + (b.type === 'submit' ? 2 : 0) + (/primary|main/i.test(b.className) ? 1 : 0)
  const cand = btns.filter(b => nextish(b) && !SUBMIT_WORDS.test(text(b)))
  return cand.length ? cand.sort((a, b) => score(b) - score(a))[0] : null
}

async function clickButton (target) {
  if (isConfirm()) return { ok: false, result: '已在最终确认页：禁止提交/前进，请调用 finish 结束。' }
  const btn = findNavButton(target === 'back' ? 'back' : 'next')
  if (!btn) {
    return { ok: false, result: target === 'back'
      ? '未找到可用的「返回」按钮（可能已在第一步）'
      : '未找到「下一步」类按钮（可能当前不是多步表单，或必填项未填完被禁用；单页表单填完即可 finish）' }
  }
  const label = (btn.textContent || btn.value || '').trim()
  // 安全红线：最终提交类按钮绝不点击（双保险，确认页之外也要拦）
  if (target !== 'back' && SUBMIT_WORDS.test(label)) {
    return { ok: false, result: `「${label}」疑似最终提交按钮，已硬拦截（安全红线：绝不提交）。若确是中间步骤按钮，请用 finish 说明留人工。` }
  }

  // 轮询等步骤/表单变化（标题/确认页/控件数量/所有值签名），有变化早退
  const allInputs = () => [...document.querySelectorAll('input, select, textarea')]
  const before = { t: stepTitle(), c: isConfirm(), n: allInputs().length, sig: allInputs().map(e => e.value).join('§') }
  btn.click()
  const changed = await waitFor(() => {
    const now = { t: stepTitle(), c: isConfirm(), n: allInputs().length, sig: allInputs().map(e => e.value).join('§') }
    return now.t !== before.t || now.c !== before.c || now.n !== before.n || now.sig !== before.sig
  }, { timeout: 1500, step: 80 })
  // 等新步骤渲染出表单控件（早退），替代固定 sleep
  await waitFor(() => !!document.querySelector('.ant-form-item, form, input, select, textarea'), { timeout: 800, step: 60 })
  const err = document.querySelector('.ant-form-item-explain-error, .invalid-feedback, [class*="form-error"], [class*="invalid"]')
  if (err) return { ok: true, result: `已点「${label}」，但出现校验错误：${(err.textContent || '').trim()}（请 get_form 复核并修正）` }
  return { ok: true, result: changed ? `已点「${label}」（请 get_form 查看新状态）` : `已点「${label}」（未检测到步骤变化，可能校验未过，请 get_form 复核）` }
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