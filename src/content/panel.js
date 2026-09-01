// panel.js —— 浮窗控制面板（shadow DOM 隔离，不污染宿主页面）

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
        width:min(340px, calc(100vw - 24px)); color:#111827; background:#fff;
        border:1px solid #e5e7eb; border-radius:8px; box-shadow:0 8px 28px rgba(0,0,0,.08);
        overflow:hidden; font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans",sans-serif;
        animation:panel-in .18s ease-out;
      }
      @keyframes panel-in { from { opacity:0; transform:translateY(6px); } }
      .hd { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 14px;
        border-bottom:1px solid #f0f1f3; }
      .hd-left { min-width:0; }
      .title { font-size:13px; font-weight:600; white-space:nowrap; }
      .subtitle { display:flex; align-items:center; gap:6px; margin-top:3px; color:#9ca3af; font-size:11px; }
      .state-dot { width:6px; height:6px; border-radius:50%; background:#d1d5db; }
      .card.running .state-dot { background:#10b981; }
      .collapse { border:0; background:none; padding:2px 4px; cursor:pointer; color:#9ca3af; font-size:14px; line-height:1; }
      .collapse:hover { color:#111827; }
      .bd { max-height:calc(100vh - 80px); padding:14px; overflow:auto; scrollbar-width:thin; scrollbar-color:#e5e7eb transparent; }
      .bd.hidden { display:none; }
      .section-label { display:flex; justify-content:space-between; margin-bottom:6px; color:#6b7280; font-size:11px; }
      .optional { color:#c4c9d1; }
      textarea, input[type="text"] { width:100%; color:#111827; background:#fff; border:1px solid #e5e7eb; border-radius:6px;
        padding:8px 9px; outline:none; transition:border-color .12s; }
      textarea { min-height:56px; resize:vertical; line-height:1.5; }
      textarea::placeholder, input::placeholder { color:#c4c9d1; }
      textarea:hover, input[type="text"]:hover { border-color:#d1d5db; }
      textarea:focus, input[type="text"]:focus { border-color:#111827; }
      .warn { margin-top:10px; padding:7px 9px; color:#92600a; background:#fffdf5; border:1px solid #f3ead2;
        border-radius:6px; font-size:11px; line-height:1.5; }
      .warn[hidden] { display:none; }
      .actions { display:grid; grid-template-columns:minmax(0,1fr) 72px; gap:8px; margin-top:12px; }
      .btn { min-height:34px; border-radius:6px; border:1px solid transparent; cursor:pointer;
        font-size:12.5px; font-weight:500; transition:background .12s, border-color .12s, opacity .12s; }
      .pri { color:#fff; background:#111827; }
      .pri:hover:not(:disabled) { background:#000; }
      .gho { color:#111827; background:#fff; border-color:#e5e7eb; }
      .gho:hover:not(:disabled) { border-color:#d1d5db; }
      .btn:disabled { cursor:not-allowed; opacity:.4; }
      .statusbar { display:flex; align-items:center; gap:6px; margin-top:10px; color:#9ca3af; font-size:11px; min-height:15px; }
      .status-icon { width:6px; height:6px; border-radius:50%; background:#d1d5db; flex:0 0 auto; }
      .status { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      details { margin-top:12px; }
      summary { list-style:none; display:flex; align-items:center; gap:6px; padding:4px 0; cursor:pointer;
        color:#6b7280; font-size:11.5px; user-select:none; }
      summary::-webkit-details-marker { display:none; }
      summary:hover { color:#111827; }
      summary .chev { width:9px; color:#c4c9d1; transition:transform .15s; }
      details[open] .chev { transform:rotate(180deg); }
      .settings-body { padding:6px 0 2px; }
      label.fl { display:block; margin:10px 0 4px; color:#6b7280; font-size:11px; }
      .hint { display:block; margin-top:2px; color:#c4c9d1; font-size:10px; font-weight:400; }
      .file { width:100%; color:#9ca3af; font-size:10.5px; }
      .file::file-selector-button { margin-right:8px; padding:5px 8px; color:#111827; background:#fff;
        border:1px solid #e5e7eb; border-radius:5px; cursor:pointer; font-size:10.5px; }
      .upload-name { margin-top:4px; color:#059669; font-size:10.5px; word-break:break-all; }
      .setting-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:12px; }
      .setting-actions .btn { min-height:30px; padding:5px 12px; font-size:12px; }
      .remove { color:#dc2626; background:transparent; border-color:transparent; }
      .remove:hover:not(:disabled) { border-color:#fecaca; }
      .log-hd { display:flex; align-items:center; justify-content:space-between; margin-top:14px; padding-top:12px;
        border-top:1px solid #f0f1f3; color:#9ca3af; font-size:10.5px; }
      .mini { padding:0 2px; color:#c4c9d1; background:none; border:0; cursor:pointer; font-size:10.5px; }
      .mini:hover { color:#111827; }
      .log { min-height:60px; max-height:220px; overflow:auto; margin-top:6px; color:#6b7280;
        font:10.5px/1.6 "SFMono-Regular",Consolas,Menlo,monospace; white-space:pre-wrap; word-break:break-word; scrollbar-width:thin; }
      .log:empty::before { content:"日志"; display:block; color:#e0e2e6; }
      .log .l { padding:1.5px 0; }
      .c-assistant { color:#111827; }
      .c-tool { color:#2563eb; }
      .c-result { color:#9ca3af; }
      .c-result.err, .c-error { color:#dc2626; }
      .c-status { color:#c4c9d1; }
      .c-perf { color:#c4c9d1; }
      .c-done { color:#059669; }
      .footnote { margin-top:12px; color:#c4c9d1; font-size:10px; text-align:center; }
      [hidden] { display:none !important; }
      @media (prefers-reduced-motion:reduce) { .card { animation:none; } }
    </style>
    <div class="card" id="card">
      <header class="hd">
        <div class="hd-left">
          <div class="title">加盟店申请 · AI Agent</div>
          <div class="subtitle"><span class="state-dot" id="statedot"></span><span id="headstatus">准备就绪</span></div>
        </div>
        <button class="collapse" id="collapse" type="button" title="折叠面板" aria-label="折叠面板" aria-expanded="true">▾</button>
      </header>
      <div class="bd" id="body">
        <label class="section-label" for="scenario"><span>申请场景</span><span class="optional">选填</span></label>
        <textarea id="scenario" rows="2" placeholder="例如：东京个人事业主经营的拉面店"></textarea>
        <div class="warn" id="prodwarn" hidden>生产环境：Agent 到确认页会停下、不会提交；请勿手动提交测试数据。</div>
        <div class="actions">
          <button class="btn pri" id="start" type="button">开始自动填写</button>
          <button class="btn gho" id="stop" type="button" disabled>停止</button>
        </div>
        <div class="statusbar"><span class="status-icon" id="statusdot"></span><span class="status" id="status">准备就绪</span></div>
        <details id="settings">
          <summary>连接与高级设置<svg class="chev" viewBox="0 0 16 16" fill="none"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></summary>
          <div class="settings-body">
            <label class="fl" for="endpoint">推理服务地址<span class="hint">OpenAI 兼容的 /v1/chat/completions</span></label>
            <input id="endpoint" type="text" spellcheck="false" placeholder="http://10.0.0.64:8800/v1/chat/completions" />
            <label class="fl" for="model">模型<span class="hint">填写 auto 可优先选择当前已加载模型</span></label>
            <input id="model" type="text" spellcheck="false" placeholder="Qwen/Qwen3-30B-A3B-GGUF:Qwen3-30B-A3B-Q4_K_M" />
            <label class="fl" for="baseemail">基础邮箱<span class="hint">留空自动探测；表单会使用安全的加号别名</span></label>
            <input id="baseemail" type="text" inputmode="email" placeholder="自动探测或手动填写" />
            <label class="fl" for="uploadimg">固定测试图片<span class="hint">可选，最大 4MB；默认使用自动生成的测试图</span></label>
            <input class="file" id="uploadimg" type="file" accept="image/*" />
            <div class="upload-name" id="uploadimgname" style="margin-top:4px;color:#059669;font-size:10.5px;word-break:break-all;"></div>
            <div class="setting-actions"><button class="btn remove" id="rmimg" type="button" hidden>移除图片</button><span style="flex:1"></span><button class="btn gho" id="savecfg" type="button">保存</button></div>
          </div>
        </details>
        <div class="log-hd"><span>运行日志</span><button class="mini" id="clearlog" type="button">清空</button></div>
        <div class="log" id="log" aria-live="polite"></div>
        <div class="footnote">确认页自动停止 · 不会提交申请</div>
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
    stop: $('stop'),
    status: $('status'),
    log: $('log'),
    endpoint: $('endpoint'),
    model: $('model'),
    baseemail: $('baseemail'),
    uploadimg: $('uploadimg'),
    uploadimgname: $('uploadimgname'),
    rmimg: $('rmimg'),
    prodwarn: $('prodwarn'),
    headstatus: $('headstatus'),
    statedot: $('statedot'),
  }

  $('collapse').addEventListener('click', event => {
    const collapsed = ui.body.classList.toggle('hidden')
    ui.card.classList.toggle('collapsed', collapsed)
    event.currentTarget.setAttribute('aria-expanded', String(!collapsed))
    event.currentTarget.setAttribute('aria-label', collapsed ? '展开面板' : '折叠面板')
    event.currentTarget.title = collapsed ? '展开面板' : '折叠面板'
  })
  $('clearlog').addEventListener('click', () => { ui.log.innerHTML = '' })
  ui.start.addEventListener('click', onStart)
  ui.stop.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'agent:stop' }))
  $('savecfg').addEventListener('click', saveCfg)
  ui.uploadimg.addEventListener('change', onPickImage)
  ui.rmimg.addEventListener('click', onRemoveImage)

  ui.prodwarn.hidden = !/^business\.(elepay\.io|sterasmartone\.com)$/.test(location.hostname)

  // 载入设置
  chrome.storage.local.get('agentSettings').then(({ agentSettings }) => {
    const s = agentSettings || {}
    if (s.endpoint) ui.endpoint.value = s.endpoint
    if (s.model === 'Qwen/Qwen3-30B-A3B-GGUF:Qwen3-30B-A3B-Q4_K_M') {
      ui.model.value = 'Qwen/Qwen3-30B-A3B-GGUF:Qwen3-30B-A3B-Q4_K_M'
      mergeSettings({ model: ui.model.value })
    } else if (s.model) ui.model.value = s.model
    // 基础邮箱：设置 > 页面探测；都没有就留空提示
    if (s.baseEmail) ui.baseemail.value = s.baseEmail
    else { const d = detectUserEmail(); if (d) { ui.baseemail.value = d; ui.baseemail.placeholder = `已探测：${d}` } }
    if (s.uploadImage?.name) {
      ui.uploadimgname.textContent = `当前固定图片：${s.uploadImage.name}`
      ui.rmimg.hidden = false
    }
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
  if (ep) patch.endpoint = ep
  if (md) patch.model = md
  // 基础邮箱总是写入（清空 = 恢复自动探测）
  patch.baseEmail = ui.baseemail.value.trim()
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

function onRemoveImage () {
  mergeSettings({ uploadImage: null })
    .then(() => { ui.uploadimgname.textContent = ''; ui.rmimg.hidden = true; setStatus('已恢复使用自动生成的测试图') })
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
  ui.card.classList.toggle('running', on)
  setStatus(on ? 'Agent 正在处理当前表单…' : '已结束')
}

function setStatus (t) {
  if (!ui) return
  ui.status.textContent = t
  const short = ui.card.classList.contains('running')
    ? '运行中'
    : (/失败|错误|禁止|未授权/.test(t) ? '需要处理' : (/保存/.test(t) ? '设置已保存' : (/结束|完成/.test(t) ? '任务结束' : '准备就绪')))
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
  ui.host.style.display = ui.host.style.display === 'none' ? 'block' : 'none'
}
