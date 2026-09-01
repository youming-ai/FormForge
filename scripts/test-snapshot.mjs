// scripts/test-snapshot.mjs —— 用 JSDOM 加载 legacy 表单 DOM 夹具，验证 snapshot 扫描逻辑
// 运行：npm i jsdom（或 pnpm dlx）后 node scripts/test-snapshot.mjs
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const html = readFileSync(new URL('../test/legacy-form.fixture.html', import.meta.url), 'utf8')
const dom = new JSDOM(html, { pretendToBeVisual: true })
const { window } = dom

// jsdom 里 offsetParent 恒为 null（无布局），visible() 会全挂 → 打补丁成「在 DOM 里即可见」
globalThis.document = window.document
globalThis.visible = () => true

// 注入 utils.js（visible/sleep 等）+ snapshot.js
const utils = readFileSync(new URL('../src/content/utils.js', import.meta.url), 'utf8')
const snapshot = readFileSync(new URL('../src/content/snapshot.js', import.meta.url), 'utf8')
// 抹掉 utils 里的 visible 声明避免重复
const utilsPatched = utils.replace(/^const visible = .*$/m, '')
window.eval(utilsPatched + '\n' + snapshot)

const snap = window.eval('buildSnapshot()')

let fail = 0
const check = (name, cond, detail) => {
  console.log(`${cond ? '✔' : '✘'} ${name}${cond ? '' : '  ← ' + JSON.stringify(detail)}`)
  if (!cond) fail++
}

// ① 取引形態卡片：应识别为 cards，value=実店舗（対面），options 含 ネットショップ
const bizCards = snap.fields.filter(f => f.kind === 'cards' && /事業形態/.test(f.label))
check('取引形態卡片识别为 cards', bizCards.length === 1, snap.fields.map(f => f.label))
check('取引形態选中值', bizCards[0]?.value === '実店舗（対面）', bizCards[0])
check('取引形態选中后省略 options（省 token 预期）', !('options' in (bizCards[0] || {})), bizCards[0])

// 子选项 checkbox 应存在（label 既有逻辑取第一个选项文本，预期）
const sub = snap.fields.find(f => f.kind === 'checkbox' && /食品販売/.test(f.label))
check('取引子选项 checkbox 可见', !!sub, snap.fields.map(f => [f.ref, f.label, f.kind]))

// ② 法人格两个下拉：无 label/placeholder →「法人格·子字段1」「法人格·子字段2」
const legal = snap.fields.filter(f => f.kind === 'select' && f.label?.startsWith('法人格'))
check('法人格下拉 contextual label', legal.length === 2 && legal[0].label === '法人格·子字段1' && legal[1].label === '法人格·子字段2', legal.map(f => f.label))

// ③ 法人番号搜索按钮出现在 actions，label 含「検索：法人番号」
check('法人番号検索按钮在 actions', snap.actions.some(a => a.label === '検索：法人番号'), snap.actions)

// ④ 料金プラン卡片
const plan = snap.fields.find(f => f.kind === 'cards' && /料金プラン/.test(f.label))
check('料金プラン卡片识别', !!plan, snap.fields.map(f => f.label))
check('料金プラン选中值', plan?.value === 'スタンダード', plan)

// ⑤ 住所自動入力按钮在 actions
check('住所自動入力在 actions', snap.actions.some(a => a.label === '住所自動入力'), snap.actions)

// ⑥ CheckButton：actions 带 [未选] 前缀
const cb = snap.actions.find(a => a.label?.includes('お店と同じ情報'))
check('CheckButton 在 actions 且带状态前缀', !!cb && /^\[(已选✓|未选)\]/.test(cb.label), snap.actions)

// ⑦ FileUploader：upload 字段 value = 已上传 1 个文件
const up = snap.fields.find(f => f.kind === 'upload')
check('FileUploader 计数 .file-downloader-item', up?.value === '已上传 1 个文件', up)

// 导航按钮
check('next 按钮可见', snap.buttons.some(b => b.kind === 'primary'), snap.buttons)

console.log(fail ? `\n${fail} 个断言失败` : '\n全部通过 ✅')
process.exit(fail ? 1 : 0)