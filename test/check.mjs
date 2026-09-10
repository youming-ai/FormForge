// check.mjs —— 语法自检：background 各模块必须能作为 ESM 真实加载（node --check 按 CJS 解析会漏报）
// 用法：node test/check.mjs
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

globalThis.chrome = {
  runtime: { onMessage: { addListener: () => {} }, sendMessage: async () => ({}), getPlatformInfo: async () => ({}) },
  action: { onClicked: { addListener: () => {} } },
  storage: { local: { get: async () => ({}), set: async () => {} } },
  tabs: { sendMessage: async () => {} },
}

let fail = 0
for (const f of ['tools.js', 'system-prompt.js', 'llm.js', 'index.js']) {
  try {
    await import(pathToFileURL(resolve('src/background', f)))
    console.log(`OK  src/background/${f}`)
  } catch (e) {
    fail++
    console.log(`FAIL src/background/${f}: ${e.message}`)
  }
}
// prompt 冒烟：能构建且包含安全红线
try {
  const m = await import(pathToFileURL(resolve('src/background/system-prompt.js')))
  const t = m.buildSystemPrompt({ baseEmail: 'a@b.com' })
  if (!t.includes('绝不点击')) throw new Error('prompt 缺少安全红线')
  console.log(`OK  buildSystemPrompt（${t.length} 字符，含安全红线）`)
} catch (e) {
  fail++
  console.log(`FAIL buildSystemPrompt: ${e.message}`)
}
// 分阶段执行：读选项 → 写入 → click/click_button 串行 → get_form 收尾（防动作竞态与同批 ref 错位）
try {
  const bg = await import(pathToFileURL(resolve('src/background/index.js')))
  const want = { get_form: 4, read_options: 1, fill_text: 2, choose_option: 2, set_date: 2, upload_file: 2, finish: 2, click: 3, click_button: 3, unknown_tool: 2 }
  for (const [n, w] of Object.entries(want)) {
    if (bg.toolPhase(n) !== w) throw new Error(`toolPhase(${n})=${bg.toolPhase(n)} want=${w}`)
  }
  console.log('OK  toolPhase 分阶段（click/click_button=3 串行、get_form=4 收尾）')
} catch (e) {
  fail++
  console.log(`FAIL toolPhase: ${e.message}`)
}
process.exit(fail ? 1 : 0)