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
// finish 混批：splitBatch 必须把 finish 摘出，兄弟调用照常保留（不再短路吞掉同批）
try {
  const bg2 = await import(pathToFileURL(resolve('src/background/index.js')))
  const tc = (name, args) => ({ id: name + '-id', function: { name, arguments: JSON.stringify(args || {}) } })
  const mixed = bg2.splitBatch([tc('fill_text', { ref: 'e7', value: 'x' }), tc('finish', { summary: 'ok' }), tc('get_form')])
  if (!mixed.finish || mixed.batch.length !== 2) throw new Error(`splitBatch 未摘出 finish：batch=${mixed.batch.length}`)
  if (mixed.batch.some(t => t.function.name === 'finish')) throw new Error('splitBatch 的 batch 仍含 finish')
  if (!mixed.batch.some(t => t.function.name === 'fill_text')) throw new Error('splitBatch 丢了同批的 fill_text')
  const only = bg2.splitBatch([tc('finish', { summary: 's' })])
  if (!only.finish || only.batch.length !== 0) throw new Error('splitBatch 纯 finish 批处理错误')
  const none = bg2.splitBatch([tc('get_form')])
  if (none.finish !== null || none.batch.length !== 1) throw new Error('splitBatch 无 finish 时行为错误')
  console.log('OK  splitBatch（finish 混批不吞兄弟调用）')
} catch (e) {
  fail++
  console.log(`FAIL splitBatch: ${e.message}`)
}
// llm.js：异常响应必须给出可读报错，而不是把原始 SyntaxError / 空 message 抛给面板
try {
  const { callLLM } = await import(pathToFileURL(resolve('src/background/llm.js')))
  const realFetch = globalThis.fetch
  const call = () => callLLM({ endpoint: 'http://127.0.0.1:1/v1/chat/completions', model: 'm', messages: [], tools: [] })
  globalThis.fetch = async () => ({ ok: true, json: async () => { throw new SyntaxError('Unexpected token < in JSON') } })
  const e1 = await call().then(() => '', e => e.message)
  if (!/非 JSON/.test(e1)) throw new Error('非 JSON 响应未给出可读错误：' + e1)
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{}] }) })
  const e2 = await call().then(() => '', e => e.message)
  if (!/message/.test(e2)) throw new Error('choices[0] 缺 message 未报错：' + e2)
  globalThis.fetch = async () => ({ ok: false, status: 404, text: async () => 'not found' })
  const e3 = await call().then(() => '', e => e.message)
  if (!/404/.test(e3)) throw new Error('HTTP 错误未上报状态码：' + e3)
  globalThis.fetch = realFetch
  console.log('OK  callLLM 异常响应（非 JSON / 缺 message / HTTP 错误）有可读报错')
} catch (e) {
  fail++
  console.log(`FAIL callLLM 异常响应: ${e.message}`)
}
process.exit(fail ? 1 : 0)