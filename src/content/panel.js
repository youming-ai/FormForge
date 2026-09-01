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
      :host {
        all: initial;
        --panel: rgba(255,255,255,.97); --panel-solid:#fff; --surface:#f6f8fc; --surface-2:#eef2f8;
        --text:#172033; --muted:#68758b; --line:#dfe5ef; --brand:#3b5bdb; --brand-2:#7048e8;
        --brand-soft:#edf2ff; --success:#099268; --danger:#e03131; --warning:#e67700;
        --shadow: 0 24px 64px rgba(22,32,51,.20), 0 4px 16px rgba(22,32,51,.10);
      }
      * { box-sizing:border-box; }
      button, input, textarea { font:inherit; }
      button { -webkit-tap-highlight-color:transparent; }
      .card {
        width:min(382px, calc(100vw - 28px)); color:var(--text); background:var(--panel);
        border:1px solid rgba(207,216,230,.92); border-radius:18px; box-shadow:var(--shadow);
        overflow:hidden; font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Hiragino Kaku Gothic ProN",sans-serif;
        backdrop-filter:blur(18px) saturate(140%); -webkit-backdrop-filter:blur(18px) saturate(140%);
        animation:panel-in .22s cubic-bezier(.2,.8,.2,1);
      }
      @keyframes panel-in { from { opacity:0; transform:translateY(10px) scale(.98); } }
      .hd {
        min-height:68px; display:flex; align-items:center; justify-content:space-between; gap:12px;
        padding:13px 14px 12px 15px; color:#fff;
        background:linear-gradient(125deg, #263b80 0%, var(--brand) 48%, var(--brand-2) 100%);
        position:relative; overflow:hidden;
      }
      .hd::after { content:""; position:absolute; width:150px; height:150px; right:-52px; top:-95px;
        border-radius:50%; background:rgba(255,255,255,.13); pointer-events:none; }
      .brand { display:flex; align-items:center; gap:11px; min-width:0; position:relative; z-index:1; }
      .logo { width:39px; height:39px; flex:0 0 auto; display:grid; place-items:center; border-radius:12px;
        background:rgba(255,255,255,.16); border:1px solid rgba(255,255,255,.22); box-shadow:inset 0 1px rgba(255,255,255,.18); }
      .logo svg { width:24px; height:24px; }
      .brand-copy { min-width:0; }
      .title { font-size:14px; line-height:1.2; font-weight:750; letter-spacing:.01em; white-space:nowrap; }
      .subtitle { display:flex; align-items:center; gap:6px; margin-top:5px; color:rgba(255,255,255,.78); font-size:11px; }
      .state-dot { width:7px; height:7px; border-radius:50%; background:#b7c0d1; box-shadow:0 0 0 3px rgba(255,255,255,.10); }
      .card.running .state-dot { background:#69db7c; animation:pulse 1.5s infinite; }
      @keyframes pulse { 50% { box-shadow:0 0 0 5px rgba(105,219,124,.12); } }
      .collapse { width:32px; height:32px; padding:0; display:grid; place-items:center; flex:0 0 auto; position:relative; z-index:1;
        cursor:pointer; color:#fff; background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.18); border-radius:10px; }
      .collapse:hover { background:rgba(255,255,255,.22); }
      .collapse svg { width:16px; transition:transform .2s ease; }
      .card.collapsed .collapse svg { transform:rotate(180deg); }
      .bd { max-height:calc(100vh - 104px); padding:15px; overflow:auto; scrollbar-width:thin; scrollbar-color:#c8d0df transparent; }
      .bd.hidden { display:none; }
      .section-label { display:flex; align-items:center; justify-content:space-between; margin-bottom:7px; color:var(--text); font-size:12px; font-weight:700; }
      .optional { color:var(--muted); font-size:10px; font-weight:500; }
      textarea, input[type="text"] { width:100%; color:var(--text); background:var(--panel-solid); border:1px solid var(--line); border-radius:10px;
        padding:9px 10px; outline:none; transition:border-color .15s, box-shadow .15s, background .15s; }
      textarea { min-height:67px; resize:vertical; line-height:1.5; }
      textarea::placeholder, input::placeholder { color:#9aa5b7; }
      textarea:hover, input[type="text"]:hover { border-color:#bec8d9; }
      textarea:focus, input[type="text"]:focus { border-color:var(--brand); box-shadow:0 0 0 3px rgba(59,91,219,.12); }
      .warn { display:flex; align-items:flex-start; gap:8px; margin-top:10px; padding:9px 10px; color:#8f4b00; background:#fff8e8;
        border:1px solid #ffe0a6; border-radius:10px; font-size:11px; }
      .warn[hidden] { display:none; }
      .warn svg { width:16px; flex:0 0 auto; margin-top:1px; color:var(--warning); }
      .actions { display:grid; grid-template-columns:minmax(0, 1fr) 96px; gap:8px; margin-top:12px; }
      .btn { min-height:38px; display:inline-flex; align-items:center; justify-content:center; gap:7px; padding:8px 12px;
        border-radius:10px; border:1px solid transparent; cursor:pointer; font-size:12px; font-weight:700; transition:transform .12s, box-shadow .15s, background .15s, border-color .15s; }
      .btn:active:not(:disabled) { transform:translateY(1px); }
      .btn:focus-visible, .collapse:focus-visible, summary:focus-visible, .mini:focus-visible { outline:3px solid rgba(59,91,219,.25); outline-offset:2px; }
      .btn svg { width:15px; height:15px; }
      .pri { color:#fff; background:linear-gradient(135deg, var(--brand), var(--brand-2)); box-shadow:0 6px 14px rgba(59,91,219,.24); }
      .pri:hover:not(:disabled) { box-shadow:0 8px 18px rgba(59,91,219,.30); }
      .gho { color:var(--text); background:var(--panel-solid); border-color:var(--line); }
      .gho:hover:not(:disabled) { background:var(--surface); border-color:#c7d0df; }
      .btn:disabled { cursor:not-allowed; opacity:.48; box-shadow:none; }
      .statusbar { display:flex; align-items:center; gap:8px; min-height:32px; margin-top:9px; padding:7px 9px;
        color:var(--muted); background:var(--surface); border:1px solid #edf0f5; border-radius:9px; font-size:11px; }
      .status-icon { width:18px; height:18px; display:grid; place-items:center; color:var(--brand); background:var(--brand-soft); border-radius:6px; }
      .status-icon svg { width:11px; }
      .status { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      details { margin-top:11px; border:1px solid var(--line); border-radius:11px; overflow:hidden; background:var(--panel-solid); }
      summary { list-style:none; display:flex; align-items:center; gap:8px; padding:10px 11px; cursor:pointer; color:var(--text); font-size:12px; font-weight:700; user-select:none; }
      summary::-webkit-details-marker { display:none; }
      summary:hover { background:var(--surface); }
      summary .gear { width:17px; color:var(--muted); }
      summary .chev { width:14px; margin-left:auto; color:var(--muted); transition:transform .18s; }
      details[open] summary { border-bottom:1px solid var(--line); }
      details[open] .chev { transform:rotate(180deg); }
      .settings-body { padding:4px 11px 12px; background:linear-gradient(180deg, var(--surface) 0, var(--panel-solid) 28px); }
      label.fl { display:block; margin:10px 0 5px; color:var(--text); font-size:11px; font-weight:700; }
      .hint { display:block; margin-top:3px; color:var(--muted); font-size:10px; line-height:1.4; font-weight:400; }
      .file { width:100%; color:var(--muted); font-size:10px; }
      .file::file-selector-button { margin-right:8px; padding:6px 9px; color:var(--text); background:var(--surface); border:1px solid var(--line); border-radius:8px; cursor:pointer; }
      .upload-name { margin-top:5px; color:var(--success); font-size:10px; word-break:break-all; }
      .setting-actions { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:11px; }
      .setting-actions .btn { min-height:33px; padding:6px 11px; }
      .remove { color:var(--danger); background:transparent; border-color:transparent; }
      .remove:hover:not(:disabled) { background:#fff0f0; }
      .log-card { margin-top:11px; border:1px solid var(--line); border-radius:11px; overflow:hidden; background:var(--surface); }
      .log-hd { display:flex; align-items:center; justify-content:space-between; padding:8px 10px; color:var(--muted); border-bottom:1px solid var(--line); font-size:10px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; }
      .mini { padding:3px 6px; color:var(--muted); background:transparent; border:0; border-radius:6px; cursor:pointer; font-size:10px; text-transform:none; letter-spacing:0; }
      .mini:hover { color:var(--text); background:var(--surface-2); }
      .log { min-height:74px; max-height:220px; overflow:auto; padding:8px 9px; color:var(--muted);
        font:10.5px/1.55 "SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace; white-space:pre-wrap; word-break:break-word; scrollbar-width:thin; }
      .log:empty::before { content:"Agent 的操作记录会显示在这里"; display:grid; min-height:56px; place-items:center; color:#9aa5b7; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
      .log .l { padding:2px 0; }
      .c-assistant { color:var(--text); }
      .c-tool { color:var(--brand); font-weight:650; }
      .c-result { color:var(--muted); }
      .c-result.err, .c-error { color:var(--danger); font-weight:700; }
      .c-status { color:#74829a; }
      .c-perf { color:#7c5cba; }
      .c-done { color:var(--success); font-weight:700; }
      .footnote { display:flex; align-items:center; justify-content:center; gap:5px; margin-top:9px; color:#98a3b5; font-size:9px; }
      .footnote svg { width:10px; }
      [hidden] { display:none !important; }
      @media (prefers-reduced-motion:reduce) { .card { animation:none; } .state-dot { animation:none !important; } * { scroll-behavior:auto !important; } }
      @media (prefers-color-scheme:dark) {
        :host { --panel:rgba(23,29,41,.97); --panel-solid:#171d29; --surface:#202838; --surface-2:#293348; --text:#edf1f7;
          --muted:#a7b1c2; --line:#354056; --brand-soft:#27345f; --shadow:0 24px 70px rgba(0,0,0,.45); }
        .card { border-color:#39445a; } textarea::placeholder, input::placeholder { color:#78859a; }
        .warn { color:#ffd8a8; background:#392d1d; border-color:#65491e; }
        .remove:hover:not(:disabled) { background:#3b2227; }
      }
    </style>
    <div class="card" id="card">
      <header class="hd">
        <div class="brand">
          <div class="logo" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M7 4.5h7l3 3V19a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 6 19V6a1.5 1.5 0 0 1 1-1.5Z" stroke="currentColor" stroke-width="1.7"/><path d="M14 4.8V8h3.1M8.8 11h5.8M8.8 14h4.3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="m9 17 1.2 1.2 2.4-2.5" stroke="#8ce99a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
          <div class="brand-copy"><div class="title">加盟店申请 · AI Agent</div><div class="subtitle"><span class="state-dot" id="statedot"></span><span id="headstatus">准备就绪</span></div></div>
        </div>
        <button class="collapse" id="collapse" type="button" title="折叠面板" aria-label="折叠面板" aria-expanded="true"><svg viewBox="0 0 20 20" fill="none"><path d="m5 8 5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </header>
      <div class="bd" id="body">
        <label class="section-label" for="scenario"><span>申请场景</span><span class="optional">选填</span></label>
        <textarea id="scenario" rows="2" placeholder="例如：东京个人事业主经营的拉面店"></textarea>
        <div class="warn" id="prodwarn" hidden><svg viewBox="0 0 20 20" fill="none"><path d="M10 2.5 18 17H2L10 2.5Z" stroke="currentColor" stroke-width="1.6"/><path d="M10 7v4.5M10 14.3v.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><span>生产环境：Agent 到确认页会停下、不会提交；请勿手动提交测试数据。</span></div>
        <div class="actions">
          <button class="btn pri" id="start" type="button"><svg viewBox="0 0 20 20" fill="none"><path d="m7 5 7 5-7 5V5Z" fill="currentColor"/></svg>开始自动填写</button>
          <button class="btn gho" id="stop" type="button" disabled><svg viewBox="0 0 20 20" fill="none"><rect x="5.5" y="5.5" width="9" height="9" rx="2" fill="currentColor"/></svg>停止</button>
        </div>
        <div class="statusbar"><span class="status-icon"><svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4"/><path d="M8 7v4M8 4.8v.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span><span class="status" id="status">准备就绪</span></div>
        <details id="settings">
          <summary><svg class="gear" viewBox="0 0 20 20" fill="none"><path d="M8.4 2.7h3.2l.5 2a6 6 0 0 1 1.2.7l2-.6 1.6 2.8-1.5 1.4a6 6 0 0 1 0 1.4l1.5 1.4-1.6 2.8-2-.6a6 6 0 0 1-1.2.7l-.5 2H8.4l-.5-2a6 6 0 0 1-1.2-.7l-2 .6-1.6-2.8 1.5-1.4a6 6 0 0 1 0-1.4L3.1 7.6l1.6-2.8 2 .6a6 6 0 0 1 1.2-.7l.5-2Z" stroke="currentColor" stroke-width="1.3"/><circle cx="10" cy="9.7" r="2.2" stroke="currentColor" stroke-width="1.4"/></svg>连接与高级设置<svg class="chev" viewBox="0 0 16 16" fill="none"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></summary>
          <div class="settings-body">
            <label class="fl" for="endpoint">推理服务地址<span class="hint">OpenAI 兼容的 /v1/chat/completions</span></label>
            <input id="endpoint" type="text" spellcheck="false" placeholder="http://10.0.0.64:8800/v1/chat/completions" />
            <label class="fl" for="model">模型<span class="hint">填写 auto 可优先选择当前已加载模型</span></label>
            <input id="model" type="text" spellcheck="false" placeholder="unsloth/gemma-4-26B-A4B-it-GGUF:gemma-4-26B-A4B-it-UD-Q4_K_M" />
            <label class="fl" for="baseemail">基础邮箱<span class="hint">留空自动探测；表单会使用安全的加号别名</span></label>
            <input id="baseemail" type="text" inputmode="email" placeholder="自动探测或手动填写" />
            <label class="fl" for="uploadimg">固定测试图片<span class="hint">可选，最大 4MB；默认使用自动生成的测试图</span></label>
            <input class="file" id="uploadimg" type="file" accept="image/*" />
            <div class="upload-name" id="uploadimgname"></div>
            <div class="setting-actions"><button class="btn remove" id="rmimg" type="button" hidden>移除图片</button><span></span><button class="btn gho" id="savecfg" type="button">保存设置</button></div>
          </div>
        </details>
        <div class="log-card"><div class="log-hd"><span>运行日志</span><button class="mini" id="clearlog" type="button">清空</button></div><div class="log" id="log" aria-live="polite"></div></div>
        <div class="footnote"><svg viewBox="0 0 16 16" fill="none"><path d="M8 1.8 13 4v3.5c0 3.2-2.1 5.5-5 6.7-2.9-1.2-5-3.5-5-6.7V4l5-2.2Z" stroke="currentColor" stroke-width="1.3"/><path d="m5.8 8 1.4 1.4 3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>确认页自动停止 · 不会提交申请</div>
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
    if (['Qwen/Qwen3-30B-A3B-GGUF:Qwen3-30B-A3B-Q4_K_M', 'unsloth/Qwen3.8-27B-GGUF:8-27B-Q4_K_M'].includes(s.model)) {
      ui.model.value = 'unsloth/gemma-4-26B-A4B-it-GGUF:gemma-4-26B-A4B-it-UD-Q4_K_M'
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
