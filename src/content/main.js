// main.js —— content 入口：消息总线 + 注入浮窗
// 消息：agent:exec(background→content 执行工具) / agent:log / agent:ended / panel:toggle

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
})

// 进入匹配页面即注入浮窗
createPanel()