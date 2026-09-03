// panel.js —— 浮窗控制面板（shadow DOM 隔离，不污染宿主页面）
// Base UI 设计语言（无样式打底、功能优先）：1px 中性边框、全直角、无毛玻璃/无拟态阴影/无装饰动效。
// 单按钮双态（開始/停止）、头部纯文本状态、场景输入自适应、设置自动保存。

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
      * { box-sizing: border-box; }
      button, input, textarea { font: inherit; }
      .card {
        width: min(320px, calc(100vw - 24px)); color: #111827; background: #fff;
        border: 1px solid #d4d4d8; box-shadow: 0 4px 16px rgba(0, 0, 0, .08);
        font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Hiragino Sans", sans-serif;
      }
      .hd { display: flex; align-items: center; justify-content: space-between; gap: 8px;
        padding: 10px 12px; border-bottom: 1px solid #e4e4e7; }
      .brand { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .mark-box { width: 22px; height: 22px; background: #111827; color: #fff;
        display: flex; align-items: center; justify-content: center; flex: 0 0 auto; }
      .mark { width: 12px; height: 12px; }
      .name { font-size: 13px; font-weight: 600; }
      .hd-right { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }
      .status { display: inline-flex; align-items: center; gap: 6px; padding: 0 4px; }
      .state-dot { width: 6px; height: 6px; background: #d4d4d8; flex: 0 0 auto; }
      .card.running .state-dot { background: #059669; }
      .headstatus { color: #71717a; font-size: 11px; white-space: nowrap; }
      .card.running .headstatus { color: #059669; }
      .collapse { border: 0; background: transparent; width: 24px; height: 24px; cursor: pointer;
        color: #71717a; display: flex; align-items: center; justify-content: center; }
      .collapse:hover { color: #111827; background: #f4f4f5; }
      .collapse svg { width: 12px; height: 12px; }
      .card.collapsed .collapse svg { transform: rotate(-90deg); }
      .bd { max-height: calc(100vh - 90px); padding: 12px; overflow: auto; }
      .bd.hidden { display: none; }
      .warn { margin-bottom: 10px; padding: 7px 9px; color: #92400e; background: #fffbeb;
        border: 1px solid #fde68a; font-size: 11px; line-height: 1.5; }
      .warn[hidden] { display: none; }
      textarea { width: 100%; color: #111827; background: #fff; border: 1px solid #d4d4d8;
        padding: 7px 9px; outline: none; min-height: 34px; max-height: 120px;
        resize: none; overflow: hidden; font-size: 12px; line-height: 1.5; }
      textarea::placeholder, input::placeholder { color: #a1a1aa; }
      textarea:hover, input[type="text"]:hover { border-color: #a1a1aa; }
      textarea:focus, input[type="text"]:focus { border-color: #111827; }
      .btn { width: 100%; min-height: 34px; margin-top: 10px; border: 1px solid transparent;
        cursor: pointer; font-size: 13px; font-weight: 500; }
      .btn.idle { color: #fff; background: #111827; }
      .btn.idle:hover { background: #000; }
      .btn.stop { color: #fff; background: #dc2626; }
      .btn.stop:hover { background: #b91c1c; }
      .btn:disabled { cursor: not-allowed; opacity: .4; }
      details { margin-top: 10px; border-top: 1px solid #f4f4f5; }
      summary { list-style: none; display: flex; align-items: center; gap: 6px; padding: 6px 0;
        cursor: pointer; color: #52525b; font-size: 12px; user-select: none; }
      summary::-webkit-details-marker { display: none; }
      summary:hover { color: #111827; }
      summary .chev { width: 10px; height: 10px; color: #a1a1aa; }
      details[open] > summary .chev { transform: rotate(90deg); }
      summary .spacer { flex: 1; }
      .mini { padding: 0; color: #71717a; background: none; border: 0; cursor: pointer; font-size: 11px; }
      .mini:hover { color: #111827; text-decoration: underline; }
      .settings-body { padding: 2px 0 4px; }
      label.fl { display: block; margin: 10px 0 4px; color: #52525b; font-size: 11px; font-weight: 600; }
      .hint { display: block; margin-top: 2px; color: #a1a1aa; font-size: 10px; font-weight: 400; }
      input[type="text"] { width: 100%; color: #111827; background: #fff; border: 1px solid #d4d4d8;
        padding: 7px 9px; outline: none; font-size: 12px; }
      .file { width: 100%; color: #71717a; font-size: 11px; }
      .file::file-selector-button { margin-right: 8px; padding: 5px 10px; color: #111827; background: #f4f4f5;
        border: 1px solid #d4d4d8; cursor: pointer; font-size: 11px; }
      .file::file-selector-button:hover { background: #e4e4e7; }
      .upload-name { margin-top: 4px; color: #059669; font-size: 11px; word-break: break-all; }
      .remove { color: #dc2626; background: transparent; border: 0; cursor: pointer; font-size: 11px; padding: 0; margin-top: 4px; }
      .remove:hover { text-decoration: underline; }
      .log { min-height: 40px; max-height: 220px; overflow: auto; margin-top: 6px; color: #52525b;
        background: #fafafa; border: 1px solid #e4e4e7; padding: 6px 8px;
        font: 11px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; word-break: break-word; }
      .log:empty::before { content: "ログはありません"; display: block; color: #d4d4d8; }
      .log .l { padding: 1px 0; }
      .c-assistant { color: #111827; }
      .c-tool { color: #1d4ed8; }
      .c-result { color: #71717a; }
      .c-result.err, .c-error { color: #dc2626; }
      .c-status { color: #a1a1aa; }
      .c-done { color: #059669; }
      .safeline { margin-top: 12px; color: #a1a1aa; font-size: 10px; text-align: center; display: flex;
        align-items: center; justify-content: center; gap: 4px; }
      .safeline svg { width: 11px; height: 11px; flex: 0 0 auto; }
      [hidden] { display: none !important; }
    </style>
    <div class="card" id="card">
      <header class="hd">
        <div class="brand">
          <div class="mark-box">
            <svg class="mark" viewBox="0 0 100 95" aria-hidden="true"><path fill="currentColor" d="M100 39.1107V49.114C96.135 49.114 92.9891 52.265 92.9891 56.1462V72.2649C92.9891 80.9477 85.9383 88 77.2795 88H55.4479L61.4401 77.9968H77.2795C80.4354 77.9968 83.0021 75.4259 83.0021 72.2649V56.1462C83.0021 51.4447 84.9096 47.2034 87.9756 44.1124C84.9096 41.0314 83.0021 36.78 83.0021 32.0885V15.7251C83.0021 12.5741 80.4354 10.0032 77.2795 10.0032H60.7111C57.5552 10.0032 54.9885 12.5741 54.9885 15.7251L54.9885 39.1107H69.6894V49.114H54.9885V72.2649C54.9885 80.9477 47.9477 88 39.2889 88H22.7205C14.0617 88 7.01089 80.9477 7.01089 72.2649V56.1462C7.01089 52.265 3.86498 49.114 0 49.114V39.1107C3.86498 39.1107 7.01089 35.9597 7.01089 32.0885L7.01088 15.7251C7.01088 7.05228 14.0617 0 22.7205 0H44.5521L38.5599 10.0032H22.7205C19.5646 10.0032 16.9979 12.5741 16.9979 15.7251L16.9979 32.0885C16.9979 36.78 15.0904 41.0314 12.0244 44.1124C15.0904 47.2034 16.9979 51.4447 16.9979 56.1462V72.2649C16.9979 75.4259 19.5646 77.9968 22.7205 77.9968H39.2889C42.4348 77.9968 45.0015 75.4259 45.0015 72.2649L45.0015 15.7251C45.0015 7.05228 52.0523 0 60.7111 0H77.2795C85.9383 0 92.9891 7.05228 92.9891 15.7251L92.9891 32.0885C92.9891 35.9597 96.135 39.1107 100 39.1107Z"/></svg>
          </div>
          <span class="name">FormForge</span>
        </div>
        <div class="hd-right">
          <span class="status"><span class="state-dot" id="statedot"></span><span class="headstatus" id="headstatus">待機中</span></span>
          <button class="collapse" id="collapse" type="button" title="パネルを折りたたむ" aria-label="パネルを折りたたむ" aria-expanded="true">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>
          </button>
        </div>
      </header>
      <div class="bd" id="body">
        <div class="warn" id="prodwarn" hidden>本番環境：確認画面で自動停止します。テストデータを送信しないでください。</div>
        <textarea id="scenario" rows="1" placeholder="指示やシナリオ（任意、例：飲食店 / 個人等）"></textarea>
        <button class="btn idle" id="start" type="button">自動入力を開始</button>
        <details id="logbox">
          <summary><svg class="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>実行ログ<span class="spacer"></span><button class="mini" id="clearlog" type="button">クリア</button></summary>
          <div class="log" id="log" aria-live="polite"></div>
        </details>
        <details id="settings">
          <summary><svg class="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>接続設定<span class="spacer"></span><span class="hint" id="savedtip"></span></summary>
          <div class="settings-body">
            <label class="fl" for="endpoint">推論サービス URL<span class="hint">OpenAI 互換の /v1/chat/completions</span></label>
            <input id="endpoint" type="text" spellcheck="false" placeholder="http://<your-host>:8434/v1/chat/completions" />
            <label class="fl" for="model">モデル名<span class="hint">MoE 推奨モデル（変更も可）</span></label>
            <input id="model" type="text" spellcheck="false" placeholder="unsloth/gemma-4-26B-A4B-it-GGUF:gemma-4-26B-A4B-it-UD-Q4_K_M" />
            <label class="fl" for="baseemail">ベースメールアドレス<span class="hint">空欄時は自動検出。テスト時は安全なエイリアスを使用</span></label>
            <input id="baseemail" type="text" inputmode="email" placeholder="自動検出または手動入力" />
            <label class="fl" for="uploadimg">固定テスト画像<span class="hint">任意（最大 4MB）。未指定時はダミー画像を自動生成</span></label>
            <input class="file" id="uploadimg" type="file" accept="image/*" />
            <div class="upload-name" id="uploadimgname" hidden></div>
            <div class="setting-actions"><button class="btn remove" id="rmimg" type="button" hidden>画像を解除</button></div>
          </div>
        </details>
        <div class="safeline">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          確認画面で自動停止 · 送信は行いません
        </div>
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
    event.currentTarget.setAttribute('aria-label', collapsed ? 'パネルを展開' : 'パネルを折りたたむ')
    event.currentTarget.title = collapsed ? 'パネルを展開' : 'パネルを折りたたむ'
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
    ui.model.value = s.model || 'unsloth/gemma-4-26B-A4B-it-GGUF:gemma-4-26B-A4B-it-UD-Q4_K_M'
    // 基础邮箱：设置 > 页面探测；都没有就留空提示
    if (s.baseEmail) ui.baseemail.value = s.baseEmail
    else { const d = detectUserEmail(); if (d) { ui.baseemail.value = d; ui.baseemail.placeholder = `検出済み：${d}` } }
    if (s.uploadImage?.name) {
      ui.uploadimgname.textContent = `設定中の画像：${s.uploadImage.name}`
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
  // 三项直写（含空字符串）：getSettings 会把空串过滤回退默认，清空输入 = 恢复默认
  const patch = {
    endpoint: ui.endpoint.value.trim(),
    model: ui.model.value.trim(),
    baseEmail: ui.baseemail.value.trim(),
  }
  mergeSettings(patch).then(() => {
    if (silent) {
      if (ui.savedtip) {
        ui.savedtip.textContent = '保存済み'
        setTimeout(() => { ui.savedtip.textContent = '' }, 1500)
      }
    } else setStatus('設定を保存しました')
  })
}

function onPickImage () {
  const file = ui.uploadimg.files?.[0]
  if (!file) return
  if (file.size > 4 * 1024 * 1024) { setStatus('画像サイズが大きすぎます（最大 4MB）'); ui.uploadimg.value = ''; return }
  const reader = new FileReader()
  reader.onload = () => {
    mergeSettings({ uploadImage: { dataUrl: reader.result, name: file.name, type: file.type } })
      .then(() => { ui.uploadimgname.textContent = `設定中の画像：${file.name}`; ui.uploadimgname.hidden = false; ui.rmimg.hidden = false; setStatus('固定テスト画像を保存しました') })
  }
  reader.readAsDataURL(file)
}

function onRemoveImage () {
  mergeSettings({ uploadImage: null })
    .then(() => { ui.uploadimgname.textContent = ''; ui.uploadimgname.hidden = true; ui.rmimg.hidden = true; setStatus('ダミー画像の自動生成に戻しました') })
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
  ui.start.textContent = on ? '停止' : '自動入力を開始'
  if (on) ui.logbox.open = true
  setStatus(on ? 'Agent がフォームを処理中…' : '完了')
}

function setStatus (t) {
  if (!ui) return
  const short = ui.card.classList.contains('running')
    ? '実行中'
    : (/失敗|エラー|禁止|未授权|タイムアウト|超时|连不上|接続|上限|已达最大|无法|できない|要確認|推理服务/.test(t) ? '要確認' : (/保存/.test(t) ? '保存完了' : (/終了|完了|结束/.test(t) ? '完了' : '待機中')))
  ui.headstatus.textContent = short
}

function panelLog (kind, text, extra) {
  if (!ui) return
  const div = document.createElement('div')
  div.className = `l c-${kind}` + (kind === 'result' && extra && extra.ok === false ? ' err' : '')
  const tag = { assistant: '🤖', tool: '▶', result: '↳', status: 'ℹ', perf: '⏱', error: '✖', done: '✔' }[kind] || ''
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
