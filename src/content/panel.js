// panel.js —— 浮窗控制面板（shadow DOM 隔离，不污染宿主页面）
// 极简实用：单按钮双态（开始/停止）、头部单行状态、场景一行自适应、
// 日志默认折叠（运行中自动展开）、设置输入即自动保存。

let ui = null

function createPanel () {
  if (ui) return
  const host = document.createElement('div')
  host.id = '__apply_agent_host'
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;right:14px;bottom:14px;'
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing:border-box; }
      button, input, textarea { font:inherit; }
      .card {
        width:min(320px, calc(100vw - 24px)); color:#111827; background:#fff;
        border:1px solid #e5e7eb; border-radius:8px; box-shadow:0 8px 28px rgba(0,0,0,.08);
        overflow:hidden; font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans",sans-serif;
        animation:panel-in .18s ease-out;
      }
      @keyframes panel-in { from { opacity:0; transform:translateY(6px); } }
      /* 头部单行：标题 + 状态 + 折叠 */
      .hd { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 12px;
        border-bottom:1px solid #f0f1f3; }
      .title { font-size:13px; font-weight:600; white-space:nowrap; }
      .hd-right { display:flex; align-items:center; gap:6px; min-width:0; }
      .state-dot { width:6px; height:6px; border-radius:50%; background:#d1d5db; flex:0 0 auto; }
      .card.running .state-dot { background:#10b981; animation:dot-pulse 1.2s ease-in-out infinite; }
      @keyframes dot-pulse { 50% { opacity:.35; } }
      .headstatus { color:#9ca3af; font-size:11px; white-space:nowrap; }
      .collapse { border:0; background:none; padding:2px 4px; cursor:pointer; color:#9ca3af; font-size:14px; line-height:1; }
      .collapse:hover { color:#111827; }
      .bd { max-height:calc(100vh - 80px); padding:12px; overflow:auto; scrollbar-width:thin; scrollbar-color:#e5e7eb transparent; }
      .bd.hidden { display:none; }
      /* 场景：一行起步，自动增高 */
      textarea { width:100%; color:#111827; background:#fff; border:1px solid #e5e7eb; border-radius:6px;
        padding:8px 9px; outline:none; transition:border-color .12s; min-height:34px; max-height:120px;
        resize:none; overflow:hidden; line-height:1.5; }
      textarea::placeholder, input::placeholder { color:#c4c9d1; }
      textarea:hover { border-color:#d1d5db; }
      textarea:focus { border-color:#111827; }
      .warn { margin-bottom:8px; padding:7px 9px; color:#92600a; background:#fffdf5; border:1px solid #f3ead2;
        border-radius:6px; font-size:11px; line-height:1.5; }
      .warn[hidden] { display:none; }
      /* 单按钮双态：待机=黑（开始），运行=红（停止） */
      .btn { width:100%; min-height:36px; margin-top:10px; border-radius:6px; border:1px solid transparent;
        cursor:pointer; font-size:13px; font-weight:500; transition:background .12s, opacity .12s; }
      .btn.idle { color:#fff; background:#111827; }
      .btn.idle:hover { background:#000; }
      .btn.stop { color:#fff; background:#dc2626; }
      .btn.stop:hover { background:#b91c1c; }
      .btn:disabled { cursor:not-allowed; opacity:.4; }
      /* 折叠区（日志/设置）*/
      details { margin-top:10px; }
      summary { list-style:none; display:flex; align-items:center; gap:6px; padding:4px 0; cursor:pointer;
        color:#6b7280; font-size:11.5px; user-select:none; }
      summary::-webkit-details-marker { display:none; }
      summary:hover { color:#111827; }
      summary .chev { width:9px; color:#c4c9d1; transition:transform .15s; }
      details[open] > summary .chev { transform:rotate(180deg); }
      summary .spacer { flex:1; }
      .mini { padding:0 2px; color:#c4c9d1; background:none; border:0; cursor:pointer; font-size:10.5px; }
      .mini:hover { color:#111827; }
      .settings-body { padding:4px 0 2px; }
      label.fl { display:block; margin:10px 0 4px; color:#6b7280; font-size:11px; }
      .hint { display:block; margin-top:2px; color:#c4c9d1; font-size:10px; font-weight:400; }
      input[type="text"] { width:100%; color:#111827; background:#fff; border:1px solid #e5e7eb; border-radius:6px;
        padding:8px 9px; outline:none; transition:border-color .12s; }
      input[type="text"]:hover { border-color:#d1d5db; }
      input[type="text"]:focus { border-color:#111827; }
      .file { width:100%; color:#9ca3af; font-size:10.5px; }
      .file::file-selector-button { margin-right:8px; padding:5px 8px; color:#111827; background:#fff;
        border:1px solid #e5e7eb; border-radius:5px; cursor:pointer; font-size:10.5px; }
      .upload-name { margin-top:4px; color:#059669; font-size:10.5px; word-break:break-all; }
      .remove { color:#dc2626; background:transparent; border:0; cursor:pointer; font-size:10.5px; }
      .remove:hover { text-decoration:underline; }
      .log { min-height:40px; max-height:220px; overflow:auto; margin-top:4px; color:#6b7280;
        font:10.5px/1.6 "SFMono-Regular",Consolas,Menlo,monospace; white-space:pre-wrap; word-break:break-word; scrollbar-width:thin; }
      .log:empty::before { content:"暂无日志"; display:block; color:#e0e2e6; }
      .log .l { padding:1.5px 0; }
      .c-assistant { color:#111827; }
      .c-tool { color:#2563eb; }
      .c-result { color:#9ca3af; }
      .c-result.err, .c-error { color:#dc2626; }
      .c-status { color:#c4c9d1; }
      .c-done { color:#059669; }
      .safeline { margin-top:10px; color:#c4c9d1; font-size:10px; text-align:center; }
      [hidden] { display:none !important; }
      @media (prefers-reduced-motion:reduce) { .card { animation:none; } .state-dot { animation:none !important; } }
    </style>
    <div class="card" id="card">
      <header class="hd">
        <div class="title">FormForge</div>
        <div class="hd-right">
          <span class="state-dot" id="statedot"></span>
          <span class="headstatus" id="headstatus">就绪</span>
          <button class="collapse" id="collapse" type="button" title="折叠面板" aria-label="折叠面板" aria-expanded="true">▾</button>
        </div>
      </header>
      <div class="bd" id="body">
        <div class="warn" id="prodwarn" hidden>非本机环境：Agent 到确认页会停下、不会提交；请勿手动提交测试数据。</div>
        <textarea id="scenario" rows="1" placeholder="场景/目标（选填）"></textarea>
        <button class="btn idle" id="start" type="button">开始自动填写</button>
        <details id="logbox">
          <summary>运行日志<span class="spacer"></span><button class="mini" id="clearlog" type="button">清空</button></summary>
          <div class="log" id="log" aria-live="polite"></div>
        </details>
        <details id="settings">
          <summary>连接设置<span class="spacer"></span><span class="hint" id="savedtip"></span></summary>
          <div class="settings-body">
            <label class="fl" for="endpoint">推理服务地址<span class="hint">OpenAI 兼容的 /v1/chat/completions</span></label>
            <input id="endpoint" type="text" spellcheck="false" placeholder="http://10.0.0.64:8434/v1/chat/completions" />
            <label class="fl" for="model">模型<span class="hint">auto = 优先选当前已加载模型；修改后自动保存</span></label>
            <input id="model" type="text" spellcheck="false" placeholder="qwen/qwen3-30b-a3b-2507" />
            <label class="fl" for="baseemail">基础邮箱<span class="hint">留空自动探测；提交用安全的加号别名</span></label>
            <input id="baseemail" type="text" inputmode="email" placeholder="自动探测或手动填写" />
            <label class="fl" for="uploadimg">固定测试图片<span class="hint">可选，最大 4MB；默认自动生成测试图</span></label>
            <input class="file" id="uploadimg" type="file" accept="image/*" />
            <div class="upload-name" id="uploadimgname" hidden></div>
            <div class="setting-actions"><button class="btn remove" id="rmimg" type="button" hidden>移除图片</button></div>
          </div>
        </details>
        <div class="safeline">确认页自动停止 · 不会提交</div>
      </div>
    </div>`
  ;(document.documentElement || document.body).appendChild(host)

  const $ = id => root.getElementById(id)
  ui = {
    host, root,
    card: $('card'),
    body: $('body'),
    scenario: $('scenario'),
    start: $('start'),
    log: $('log'),
    logbox: $('logbox'),
    endpoint: $('endpoint'),
    model: $('model'),
    baseemail: $('baseemail'),
    uploadimg: $('uploadimg'),
    uploadimgname: $('uploadimgname'),
    rmimg: $('rmimg'),
    prodwarn: $('prodwarn'),
    headstatus: $('headstatus'),
    statedot: $('statedot'),
    savedtip: $('savedtip'),
    settings: $('settings'),
  }

  $('collapse').addEventListener('click', event => {
    const collapsed = ui.body.classList.toggle('hidden')
    ui.card.classList.toggle('collapsed', collapsed)
    event.currentTarget.setAttribute('aria-expanded', String(!collapsed))
    event.currentTarget.setAttribute('aria-label', collapsed ? '展开面板' : '折叠面板')
    event.currentTarget.title = collapsed ? '展开面板' : '折叠面板'
  })
  $('clearlog').addEventListener('click', e => { e.stopPropagation(); ui.log.innerHTML = '' })
  ui.start.addEventListener('click', onMainButton)
  ui.uploadimg.addEventListener('change', onPickImage)
  ui.rmimg.addEventListener('click', onRemoveImage)
  // 场景 textarea 自动增高（一行起步，最多 ~5 行）
  const grow = () => { ui.scenario.style.height = 'auto'; ui.scenario.style.height = Math.min(ui.scenario.scrollHeight, 120) + 'px' }
  ui.scenario.addEventListener('input', grow)
  // 设置免保存：输入即自动保存（change 触发），轻提示
  for (const el of [ui.endpoint, ui.model, ui.baseemail]) {
    el.addEventListener('change', () => { saveCfg(true) })
  }

  ui.prodwarn.hidden = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)

  // 载入设置
  chrome.storage.local.get('agentSettings').then(({ agentSettings }) => {
    const s = agentSettings || {}
    if (s.endpoint) ui.endpoint.value = s.endpoint
    if (s.model) ui.model.value = s.model
    // 基础邮箱：设置 > 页面探测；都没有就留空提示
    if (s.baseEmail) ui.baseemail.value = s.baseEmail
    else { const d = detectUserEmail(); if (d) { ui.baseemail.value = d; ui.baseemail.placeholder = `已探测：${d}` } }
    if (s.uploadImage?.name) {
      ui.uploadimgname.textContent = `当前固定图片：${s.uploadImage.name}`
      ui.uploadimgname.hidden = false
      ui.rmimg.hidden = false
    }
    if (!agentSettings) ui.settings.open = true
  })
}

async function mergeSettings (patch) {
  const { agentSettings } = await chrome.storage.local.get('agentSettings')
  await chrome.storage.local.set({ agentSettings: { ...(agentSettings || {}), ...patch } })
}

function saveCfg (silent) {
  const patch = {}
  const ep = ui.endpoint.value.trim()
  const md = ui.model.value.trim()
  if (ep) patch.endpoint = ep
  if (md) patch.model = md
  // 基础邮箱总是写入（清空 = 恢复自动探测）
  patch.baseEmail = ui.baseemail.value.trim()
  mergeSettings(patch).then(() => {
    if (silent) {
      // 轻提示：连接设置 summary 里短暂显示「已保存」
      if (ui.savedtip) {
        ui.savedtip.textContent = '已保存'
        setTimeout(() => { ui.savedtip.textContent = '' }, 1500)
      }
    } else setStatus('设置已保存')
  })
}

function onPickImage () {
  const file = ui.uploadimg.files?.[0]
  if (!file) return
  if (file.size > 4 * 1024 * 1024) { setStatus('图片过大（>4MB），请换小图'); ui.uploadimg.value = ''; return }
  const reader = new FileReader()
  reader.onload = () => {
    mergeSettings({ uploadImage: { dataUrl: reader.result, name: file.name, type: file.type } })
      .then(() => { ui.uploadimgname.textContent = `当前固定图片：${file.name}`; ui.uploadimgname.hidden = false; ui.rmimg.hidden = false; setStatus('固定上传图片已保存') })
  }
  reader.readAsDataURL(file)
}

function onRemoveImage () {
  mergeSettings({ uploadImage: null })
    .then(() => { ui.uploadimgname.textContent = ''; ui.uploadimgname.hidden = true; ui.rmimg.hidden = true; setStatus('已恢复使用自动生成的测试图') })
}

function onMainButton () {
  if (ui.card.classList.contains('running')) {
    chrome.runtime.sendMessage({ type: 'agent:stop' })
    return
  }
  onStart()
}

function onStart () {
  saveCfg(true)
  ui.log.innerHTML = ''
  setRunning(true)
  const baseEmail = ui.baseemail.value.trim() || detectUserEmail()
  chrome.runtime.sendMessage({ type: 'agent:start', scenario: ui.scenario.value.trim(), baseEmail })
}

function setRunning (on) {
  if (!ui) return
  ui.card.classList.toggle('running', on)
  ui.start.className = 'btn ' + (on ? 'stop' : 'idle')
  ui.start.textContent = on ? '停止' : '开始自动填写'
  if (on) ui.logbox.open = true // 运行中自动展开日志
  setStatus(on ? 'Agent 正在处理当前表单…' : '已结束')
}

function setStatus (t) {
  if (!ui) return
  const short = ui.card.classList.contains('running')
    ? '运行中'
    : (/失败|错误|禁止|未授权|超时|连不上|已达最大|无法/.test(t) ? '需要处理' : (/保存/.test(t) ? '设置已保存' : (/结束|完成/.test(t) ? '已结束' : '就绪')))
  ui.headstatus.textContent = short
}

function panelLog (kind, text, extra) {
  if (!ui) return
  const div = document.createElement('div')
  div.className = `l c-${kind}` + (kind === 'result' && extra && extra.ok === false ? ' err' : '')
  const tag = { assistant: '🗣', tool: '▶', result: '↳', status: 'ℹ', perf: '⏱', error: '✖', done: '✔' }[kind] || ''
  div.textContent = `${tag} ${text}`
  ui.log.appendChild(div)
  while (ui.log.children.length > 300) ui.log.firstElementChild?.remove()
  ui.log.scrollTop = ui.log.scrollHeight
  if (kind === 'status') setStatus(text)
}

function togglePanel () {
  if (!ui) { createPanel(); return }
  ui.host.style.display = (ui.host.style.display === 'none') ? '' : 'none'
}