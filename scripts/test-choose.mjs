// scripts/test-choose.mjs —— 验证 dom-tools 的 cards 选择与 read_options 路径（jsdom 无 Vue 响应属预期）
// jsdom window.eval 内的声明不跨 eval 暴露，故把测试调用也放进同一段 eval，用返回值带出结果
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const base = new URL('..', import.meta.url).pathname
const html = readFileSync(base + 'test/legacy-form.fixture.html', 'utf8')
const dom = new JSDOM(html, { pretendToBeVisual: true })
const { window } = dom
globalThis.document = window.document
for (const k of ['MouseEvent', 'KeyboardEvent', 'Event', 'DataTransfer']) {
  if (!window[k]) window[k] = window.Event
}
const utils = readFileSync(base + 'src/content/utils.js', 'utf8')
const snapshot = readFileSync(base + 'src/content/snapshot.js', 'utf8')
const domtools = readFileSync(base + 'src/content/dom-tools.js', 'utf8')

const payload = `
const { MouseEvent, KeyboardEvent } = document.defaultView;
const visible = () => true;
${utils.replace(/^const visible = .*$/m, '')}
${snapshot}
${domtools}
;(async () => {
  const out = []
  buildSnapshot()
  out.push(['choose cards', await chooseOption('e7', 'ネットショップ')])
  out.push(['不存在的卡片', await chooseOption('e7', '不存在卡片')])
  out.push(['read_options', await readOptions('e1')])
  try { out.push(['upload_file', await uploadFile('e5')]) } catch (e) { out.push(['upload_file', { ok: false, result: 'ERR ' + e.message }]) }
  return out
})()
`
const results = await window.eval(payload)
for (const [name, res] of results) console.log(name, '→', JSON.stringify(res).slice(0, 140))
