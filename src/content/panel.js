// panel.js —— 浮窗控制面板（shadow DOM 隔离，不污染宿主页面）

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
          <summary>设置（推理服务）</summary>
          <label class="fl" for="endpoint">接口地址</label>
          <input id="endpoint" type="text" placeholder="http://10.0.0.64:8800/v1/chat/completions" />
          <label class="fl" for="model">模型名（auto = 自动选已加载模型；需支持 function calling）</label>
          <input id="model" type="text" placeholder="Qwen/Qwen3-30B-A3B-GGUF:Qwen3-30B-A3B-Q4_K_M" />
          <label class="fl" for="baseemail">基础邮箱（留空自动探测当前登录用户；邮箱字段会用其加号别名，tag 由 agent 按上下文起）</label>
          <input id="baseemail" type="text" placeholder="自动探测，可手填，如 you@elestyle.jp" />
          <label class="fl" for="uploadimg">固定上传图片（可选，默认用自动生成的测试图）</label>
          <input id="uploadimg" type="file" accept="image/*" />
          <div id="uploadimgname" style="font-size:11px;color:#86909c;margin-top:4px;"></div>
          <button class="gho" id="rmimg" hidden style="margin-top:4px;padding:3px 8px;font-size:11px;">移除固定图片</button>
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
    rmimg: $('rmimg'),
    prodwarn: $('prodwarn'),
  }

  $('collapse').addEventListener('click', () => ui.body.classList.toggle('hidden'))
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
    if (s.model) ui.model.value = s.model
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