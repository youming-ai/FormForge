// panel.js —— 浮窗控制面板（shadow DOM 隔离，不污染宿主页面）
// HeroUI (NextUI) 现代化视觉风格 + Zima Blue（#0080ff）：
// 亚克力毛玻璃、rounded-2xl、Zinc 灰阶、阴影拟态按钮、微动效。
// 单按钮双态（開始/停止）、头部胶囊状态、场景输入自适应、设置自动保存。

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
        width: min(336px, calc(100vw - 24px)); color: #18181b;
        background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(20px) saturate(180%);
        border: 1px solid rgba(228, 228, 231, 0.9); border-radius: 20px;
        box-shadow: 0 16px 36px -6px rgba(0, 0, 0, 0.09), 0 0 1px rgba(0, 0, 0, 0.12);
        overflow: hidden; font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Hiragino Sans", sans-serif;
        animation: panel-in .2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes panel-in { from { opacity: 0; transform: translateY(10px) scale(.98); } }

      /* 头部：HeroUI CardHeader 风格 */
      .hd { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 14px;
        border-bottom: 1px solid #f4f4f5; }
      .brand { display: flex; align-items: center; gap: 9px; min-width: 0; }
      .mark-box { width: 26px; height: 26px; border-radius: 8px; background: #0080ff;
        display: flex; align-items: center; justify-content: center; flex: 0 0 auto;
        box-shadow: 0 2px 8px rgba(0, 128, 255, 0.35); }
      .mark { width: 14px; height: 14px; color: #fff; }
      .name { font-size: 13.5px; font-weight: 700; color: #18181b; letter-spacing: -0.2px; }
      .hd-right { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }

      /* HeroUI Chip 风格状态条 */
      .chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 9999px;
        background: #f4f4f5; transition: all .2s; }
      .card.running .chip { background: #ecfdf5; }
      .state-dot { width: 6px; height: 6px; border-radius: 50%; background: #a1a1aa; flex: 0 0 auto; }
      .card.running .state-dot { background: #10b981; animation: dot-pulse 1.2s ease-in-out infinite; }
      @keyframes dot-pulse { 50% { opacity: .3; } }
      .headstatus { color: #71717a; font-size: 11px; font-weight: 550; white-space: nowrap; }
      .card.running .headstatus { color: #059669; }

      .collapse { border: 0; background: transparent; width: 28px; height: 28px; cursor: pointer; color: #a1a1aa;
        border-radius: 8px; display: flex; align-items: center; justify-content: center; transition: all .15s; }
      .collapse:hover { color: #18181b; background: #f4f4f5; }
      .collapse svg { width: 14px; height: 14px; transition: transform .2s cubic-bezier(0.4, 0, 0.2, 1); }
      .card.collapsed .collapse svg { transform: rotate(-90deg); }

      .bd { max-height: calc(100vh - 90px); padding: 14px; overflow: auto;
        scrollbar-width: thin; scrollbar-color: #e4e4e7 transparent; }
      .bd.hidden { display: none; }

      /* HeroUI Alert 风格提示 */
      .warn { margin-bottom: 10px; padding: 8px 11px; color: #92400e; background: #fffbeb;
        border: 1px solid #fef3c7; border-radius: 12px; font-size: 11px; line-height: 1.45; }
      .warn[hidden] { display: none; }

      /* HeroUI Textarea & Input 风格 (Flat variant) */
      textarea { width: 100%; color: #18181b; background: #f4f4f5; border: 2px solid transparent; border-radius: 12px;
        padding: 9px 12px; outline: none; transition: background .15s, border-color .15s, box-shadow .15s; min-height: 40px;
        max-height: 120px; resize: none; overflow: hidden; font-size: 12px; line-height: 1.4; }
      textarea::placeholder, input::placeholder { color: #a1a1aa; font-size: 11.5px; }
      textarea:hover, input[type="text"]:hover { background: #e4e4e7; }
      textarea:focus, input[type="text"]:focus { background: #fff; border-color: #0080ff;
        box-shadow: 0 0 0 3px rgba(0, 128, 255, 0.15); }

      /* HeroUI Button (Shadow variant + Zima Blue) */
      .btn { width: 100%; min-height: 38px; margin-top: 10px; border-radius: 12px; border: 0;
        cursor: pointer; font-size: 13px; font-weight: 600; letter-spacing: -0.1px;
        display: flex; align-items: center; justify-content: center; gap: 6px;
        transition: transform .1s ease, filter .15s ease, box-shadow .15s ease; }
      .btn:active { transform: scale(0.98); }
      .btn.idle { color: #fff; background: #0080ff;
        box-shadow: 0 4px 14px 0 rgba(0, 128, 255, 0.38); }
      .btn.idle:hover { filter: brightness(1.06); }
      .btn.stop { color: #fff; background: #f31260;
        box-shadow: 0 4px 14px 0 rgba(243, 18, 96, 0.38); }
      .btn.stop:hover { filter: brightness(1.06); }
      .btn:disabled { cursor: not-allowed; opacity: .45; box-shadow: none; }

      /* HeroUI Accordion (Light variant) */
      details { margin-top: 12px; }
      summary { list-style: none; display: flex; align-items: center; gap: 6px; padding: 4px 2px; cursor: pointer;
        color: #71717a; font-size: 12px; font-weight: 600; user-select: none; transition: color .15s; }
      summary::-webkit-details-marker { display: none; }
      summary:hover { color: #18181b; }
      summary .chev { width: 10px; height: 10px; color: #a1a1aa; transition: transform .2s; }
      details[open] > summary .chev { transform: rotate(90deg); }
      summary .spacer { flex: 1; }
      .mini { padding: 2px 7px; color: #71717a; background: #f4f4f5; border: 0; border-radius: 6px;
        cursor: pointer; font-size: 11px; font-weight: 500; transition: all .15s; }
      .mini:hover { color: #18181b; background: #e4e4e7; }
      .settings-body { padding: 6px 0 2px; }
      label.fl { display: block; margin: 10px 0 4px; color: #3f3f46; font-size: 11.5px; font-weight: 600; }
      .hint { display: block; margin-top: 2px; color: #a1a1aa; font-size: 10.5px; font-weight: 400; }
      input[type="text"] { width: 100%; color: #18181b; background: #f4f4f5; border: 2px solid transparent;
        border-radius: 12px; padding: 8px 11px; outline: none; font-size: 12.5px;
        transition: background .15s, border-color .15s, box-shadow .15s; }
      .file { width: 100%; color: #71717a; font-size: 11px; }
      .file::file-selector-button { margin-right: 10px; padding: 6px 12px; color: #18181b; background: #e4e4e7;
        border: 0; border-radius: 10px; cursor: pointer; font-size: 11px; font-weight: 600; transition: all .15s; }
      .file::file-selector-button:hover { background: #d4d4d8; }
      .upload-name { margin-top: 5px; color: #059669; font-size: 11px; word-break: break-all; font-weight: 500; }
      .remove { color: #f31260; background: transparent; border: 0; cursor: pointer; font-size: 11px; padding: 0; margin-top: 4px; font-weight: 500; }
      .remove:hover { text-decoration: underline; }

      /* 日志区域 */
      .log { min-height: 42px; max-height: 220px; overflow: auto; margin-top: 6px; color: #52525b;
        background: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 12px; padding: 8px 10px;
        font: 11px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; word-break: break-word;
        scrollbar-width: thin; scrollbar-color: #d4d4d8 transparent; }
      .log:empty::before { content: "ログはありません"; display: block; color: #a1a1aa; }
      .log .l { padding: 1.5px 0; }
      .c-assistant { color: #18181b; }
      .c-tool { color: #0080ff; font-weight: 600; }
      .c-result { color: #71717a; }
      .c-result.err, .c-error { color: #f31260; font-weight: 600; }
      .c-status { color: #a1a1aa; }
      .c-done { color: #10b981; font-weight: 600; }

      /* 页脚 */
      .safeline { margin-top: 14px; color: #a1a1aa; font-size: 11px; text-align: center; display: flex;
        align-items: center; justify-content: center; gap: 5px; font-weight: 450; }
      .safeline svg { width: 12px; height: 12px; flex: 0 0 auto; color: #a1a1aa; }
      [hidden] { display: none !important; }
      @media (prefers-reduced-motion: reduce) { .card { animation: none; } .state-dot { animation: none !important; } }
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
          <span class="chip"><span class="state-dot" id="statedot"></span><span class="headstatus" id="headstatus">待機中</span></span>
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
  const patch = {}
  const ep = ui.endpoint.value.trim()
  const md = ui.model.value.trim() || 'unsloth/gemma-4-26B-A4B-it-GGUF:gemma-4-26B-A4B-it-UD-Q4_K_M'
  if (ep) patch.endpoint = ep
  if (md) patch.model = md
  patch.baseEmail = ui.baseemail.value.trim()
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
