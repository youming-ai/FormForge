# CLAUDE.md — 加盟店申请表单 AI Agent（浏览器内 · 本地 LM Studio）

纯浏览器内的 Chrome MV3 扩展：页面右下角浮窗，点「开始」后由**本地 LM Studio**（OpenAI 兼容 + function calling）通过 DOM 工具逐步填写 elepay-business 加盟店申请表单，读真实下拉选项、按校验纠错、走到确认页停下（**绝不提交**）。

姊妹工具 `../elepay-apply-autofill-ext`：缓存注入式（LM Studio 生成完整 detail JSON 写 localStorage 后刷新，秒填）。本 agent 慢但智能，能处理动态字段/复杂控件/自我纠错。

## 架构

- **大脑** `background.js`（service worker, module）：跑 OpenAI 兼容工具调用循环，直连 LM Studio `/v1/chat/completions`（`tools` + `tool_calls`，无云端）。原样追加 assistant 消息保留 tool_calls，`{role:'tool',tool_call_id,content}` 回传结果，循环到无 tool_calls。
- **手** `content.js`：浮窗 UI（shadow DOM 隔离）+ DOM 工具执行器。每次 `get_form` 重建 `REFS`（ref→{el,item,kind}）。
- **眼** `get_form` / `read_options`：把当前步骤快照、真实下拉选项喂回模型。
- `tools.js` 工具定义（OpenAI function 格式）；`system-prompt.js` agent 指令 + 字段/枚举/日语格式指南。

## 运行配置

- 默认 endpoint `http://10.0.0.64:8434/v1/chat/completions`（macstudio LAN；Tailscale 用 `100.96.69.27:8434`，本机 `localhost:1234`）。
- 默认模型 `qwen/qwen3-30b-a3b-2507`（**必须支持 function calling**，已验证）；填 `auto` 则调 `/v1/models` 自动选已加载模型。
- 设置存 `chrome.storage.local.agentSettings = {endpoint, model, uploadImage}`，面板可改。
- 改 manifest `host_permissions` / `content_scripts.matches` 切环境（已含四个表单域名）。

## 目标表单的 DOM 现实（踩坑知识，改 content.js 前必读）

选择器针对 **legacy `ApplyForm`**（`.merchant-apply-info__*` + Ant Design Vue）；OEM 新版 `ApplyFormNew` class 不同需另适配。

- **scope** = `.merchant-apply-info__content`；步骤标题 `.merchant-apply-info__title`；导航按钮区 `.merchant-apply-info__action`（primary=下一步/提交，default=返回）。
- **确认页**：出现 `.merchant-apply-info__section` 即 `isConfirmStep`。`click_button` 在确认页**硬拦截**，只允许 `finish`，绝不提交（生产会产生真实申请）。
- **字段扫描**：遍历 `.ant-form-item` 取叶子（`!querySelector('.ant-form-item')`）。每字段给 `ref/kind/label/value/required/filled/error`。kind: text/textarea/select/radio/checkbox/date/upload/cards/unknown。
- **地址组 `AddressInputGroup`**：每个子字段（prefecture.kanji/kana、city、town、丁目番地、建物名…）**是独立 a-form-item，但无 label 文字、只有 placeholder**（「都道府県（カナ）」等）→ label 兜底用 `placeholderOf()`。必填靠 **`aria-required`** 而非 `.ant-form-item-required` → `isRequired()` 两者都查。**流程**：填邮编 → click「住所自動入力」按钮（ZipInput，i18n key `search`）异步带出汉字+カナ → 再填丁目番地/建物名。
- **カナ字段**：label 带「（カナ）」只接受全角片假名，填汉字报「カタカナと数字で入力してください」。
- **料金プラン**：自定义可点卡片 `.plan-select__plan`（选中加 `.active`），非标准 Ant 控件 → 单独识别为 `kind:'cards'`，choose_option 点匹配卡片。
- **日期选择器**：`a-date-picker`，格式 **`YYYY/MM/DD`（斜杠）**。set_date 走 开面板→键入完整日期→Enter→blur→回读校验（连字符作回退）。
- **动态下拉**（業種/シーン/支付方式/plan/银行/支店、地址 es-search-select）：选项接口返回，模型猜不到 → 必须 `read_options`（开 dropdown 读 `.ant-select-item-option`）再 `choose_option`。
- **文件上传** `.ant-upload`：隐藏 `input[type=file]`，用 `DataTransfer` 塞 File + dispatch `change` 触发 rc-upload（真传 OSS）。`upload_file` 默认 canvas 生成 dummy PNG，或面板固定图（dataURL）。只收 PDF 等的字段会失败。
- **checkbox**：点 `input.ant-checkbox-input`；点后 sleep 复读状态防「读到旧状态→再点→翻转」的反复勾选。

## Agent 行为约束（system-prompt.js）

只处理两类字段：① `missingRequired`（必填且空）；② 带 `error` 的。其余 `filled=true` 且无 error 一律跳过（表单可能缓存预填/上轮已填）。同一字段连续失败 2 次就记进 finish summary 留人工，**绝不无限循环**。

**测试数据策略**：① 所有加盟店名称（会社名/屋号/店名 + kana/romaji）必须带「テスト」标识。② 邮箱字段用「当前用户邮箱 + 加号别名」`local+<tag>@domain`——base 邮箱**不写死人名**：content `detectUserEmail()` 从 localStorage 的 JWT(`*ACCESS_TOKEN`)解 email，面板「基础邮箱」可覆盖，onStart 随 `agent:start` 传给 background → buildSystemPrompt({baseEmail})。**加号 tag 由 agent 按本次申请上下文自起**（如店名罗马字），便于识别邮件归属，不固定。base 邮箱缺失时 prompt 让 agent 用 `test+<tag>@example.com` 占位并在 finish 提示人工。

## 支持域名

elepay：`business.elepay.io`(prod) / `business.sandbox-elepay.com` / `stg-business.stg.elepay.dev` / `localhost:7082`。SMCC OEM：`*.sterasmartone.com`（prod `business.sterasmartone.com`，OEM 走 ApplyFormNew/smcc flow，启用 businessModel/partnerUsageInfo/特定商材/反社会协议等 SMCC 专有字段）。prod 警示（橙条）匹配 `business.elepay.io` 与 `business.sterasmartone.com`。

## 调试 / 扩展

- 真机测：`chrome://extensions` 改完**点「重新加载」**，刷新表单页，看浮窗实时日志（`▶`工具调用 / `↳`结果）。
- 端到端连通可在本机 `node` 里 `fetch` LM Studio `/v1/chat/completions` 带 `tools` 验证返回 `tool_calls`。
- 下个最可能要调的点：复杂联动控件、日期 picker 若 readonly 需改「点面板日期格」、「住所自動入力」若 click 没触发异步查询需换触发方式。
- **不要**引入 agent-sdk/打包构建（MV3 不能运行时 require，上 SDK 要 bundler，破坏即装即用；工具循环本身才几十行）。
- 字段/枚举/日语格式权威来源：elepay-business `ApplyForm/steps/*` 与姊妹工具 `../elepay-apply-autofill-ext/schema.js`。
