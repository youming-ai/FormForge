// main.js —— content 入口：消息总线（浮窗按需创建，不自动注入打扰所有网站）
// 消息：agent:exec(background→content 执行工具) / agent:log / agent:ended / panel:toggle / panel:hide / panel:show

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'agent:exec') {
    execTool(msg.name, msg.input)
      .then(r => sendResponse(r))
      .catch(e => sendResponse({ ok: false, result: String(e?.message || e) }))
    return true // 异步
  }
  if (msg?.type === 'agent:log') { panelLog(msg.kind, msg.text, msg.extra); return }
  if (msg?.type === 'agent:ended') { setRunning(false); return }
  if (msg?.type === 'panel:toggle') { togglePanel(); return }
  if (msg?.type === 'panel:hide') { setPanelVisible(false); return }
  if (msg?.type === 'panel:show') { setPanelVisible(true); return }
})

// 通用插件：浮窗不自动注入；用户点扩展图标（panel:toggle）时按需创建