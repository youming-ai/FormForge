# AGENTS.md — FormForge（通用表单自动填充 AI Agent · 浏览器内 · 本地推理）

纯浏览器内的 Chrome MV3 **通用**表单填充扩展：点扩展图标在**任意页面**唤出浮窗（不自动注入），由**本地推理服务**（OpenAI 兼容 + function calling）通过 **DOM 工具**逐步填写任意网页表单，读真实下拉选项、按校验纠错、走到确认页/提交前停下（**绝不提交**——最终提交类按钮文案有硬拦截词表 `SUBMIT_WORDS`）。扫描分层：Ant Design 优先适配 + 原生 HTML 表单兜底（label/fieldset/原生 input/select/textarea/radio/checkbox/date/file 全支持）。

## 架构

- **大脑** `src/background/`（service worker, module）：`index.js` 跑 OpenAI 兼容工具调用循环（`tools` + `tool_calls`，无云端）；`llm.js` 推理服务客户端（设置、5 分钟超时 AbortController、`cache_prompt:true`、`auto` 模型解析）；原样追加 assistant 消息保留 tool_calls（`arguments` 是对象时规整成 JSON 字符串，否则严格服务端下一轮 400），`{role:'tool',tool_call_id,content}` 回传结果，循环到无 tool_calls。**同批 tool_calls 分阶段执行**（`toolPhase`：read_options 并行 → 写入类并行 → click/click_button 串行 → **get_form 收尾**，防「填完/点完前就推进」竞态，也避免 get_form 先重建 REFS 导致同批旧 ref 错位；select 在 content 侧自动排队）；**同批含 `finish` 时先由 `splitBatch` 摘出，其余工具照常执行完才收尾**（曾直接 break → 同批写入既不执行也无日志却报 ✅完成）；`execTc` 与各阶段都查 `aborted`，用户停止后不再下发工具。`llm.js` 的超时/中止信号覆盖到 **body 读完**（`fetch` 只等到响应头就 resolve，过早 clearTimeout 会让发完头卡住的服务端永不超时、停止也失效）；非 JSON 响应与缺 `message` 都转成可读报错。MAX_TURNS=120，耗尽时明确提示。连续两轮没有 tool_calls（含 `finish_reason=length` 截断）才收尾，**且报 error 而非 done**（没有 finish、也没校验过快照，不能断言已完成）。**MV3 保活**：`runAgent` 期间每 20s 调一次扩展 API，否则单轮推理超 30s 时 service worker 连同任务一起被回收（面板会永远停在运行中）。
- **手** `src/content/dom-tools.js`：DOM 工具执行器，含 select 互斥锁与字段专属下拉定位（aria-owns）；`choose_option` 各分支（含 cards）与 `click` 都过 `isSubmitLabel`，`choose_option`/`click`/`click_button` 在确认页硬拦截。**等待全部自适应**（`waitFor` 轮询早退，替代固定 sleep）：下拉出现即读、checkbox/radio 到位即返、上传等项落列表且结束 uploading 即返（上限 12s，仍在上传则报未完成而非成功）、「自动带入地址」等异步按钮轮询表单值变化（最多 3s）。**写入一律回读**：`fill_text` 对 text/textarea/rich/数字都比对实际值（被拒/回滚/只读→明确失败，不回显请求值），原生 select 选后校验 `sel.value`，switch 比对前后状态。`click(ref)` 只点解析出的真实可点元素（找不到→明确失败），并检查单元内**所有**控件的文案与 `aria-label`。`utils.js`（通用工具）/`snapshot.js`（快照+ref）/`panel.js`（浮窗 UI）/`main.js`（消息总线）由 manifest `content_scripts.js` **按序注入共享同一隔离环境**（零构建，不能 import/export）。
- **眼** `src/content/snapshot.js` 的 `buildSnapshot`：把当前步骤快照、真实下拉选项喂回模型。已填的 radio/cards 不再带 options 列表省 token。**纯 DOM 方案**：get_form 只回文本快照；自定义组件下拉的选项靠 `read_options` 打开下拉读取（`activeDropdown` 修复了读错浮层节点、openSelect 聚焦触发异步加载）。曾试过截图识图（image_url 多模态），因每轮吃 1~2K 视觉 token + 稠密模型太慢而回退。
- `tools.js` 工具定义（OpenAI function 格式）；`system-prompt.js` agent 指令 + 通用格式指南。

## 运行配置

- 默认 endpoint `http://<your-host>:8434/v1/chat/completions`（占位符，用户填自己的本地推理服务；LM Studio / llama.cpp 均可，OpenAI 兼容 + function calling）。本机可用 `localhost:1234`。
- 默认模型 `Qwen/Qwen3-30B-A3B-GGUF:Qwen3-30B-A3B-Q4_K_M`（Qwen3 30B-A3B MoE，**3B 激活**）——多轮 agent 循环选 MoE 而非稠密大模型（慢数倍），且 Qwen 系工具调用最稳；面板直接默认填入，支持手动改写。
- 设置存 `chrome.storage.local.agentSettings = {endpoint, model, baseEmail, uploadImage}`（permissions 仅 storage，无 tabs），面板可改（基础邮箱可清空恢复自动探测，固定图片可移除）。
- 改 manifest `host_permissions` / `content_scripts.matches` 切环境。

## 目标表单的 DOM 现实（踩坑知识，改 content.js 前必读）

- **作用域**：Ant 表单字段用 `.ant-form-item` 扫描取叶子（`!querySelector('.ant-form-item')`）；通用兜底扫原生 `input/select/textarea` + 开关 button（`button[role=switch]/button.ant-switch`，裸开关以自身为单元）。超大表单字段明细截断 80（missingRequired 全量不受影响）。每字段给 `ref/kind/label/value/required/filled/error`。kind: text/number/textarea/select/radio/checkbox/switch/date/upload/cards/richtext/unknown。
- **确认页判定**：范围内没有可编辑控件（含 contenteditable 富文本与开关 button；**`readonly` 也算不可编辑**——确认页常用 readonly 回显，漏判会让确认门形同虚设）+ 页面出现「最终提交」类按钮（`SUBMIT_WORDS` 词表，唯一入口 `isSubmitLabel`）→ 视为确认页。`click_button`/`click`/`choose_option` 在确认页**硬拦截**，只允许 `finish`，绝不提交；`click` 另查单元内**所有**控件的 `isSubmitLabel`（字段单元里可能包着 `htmlType=submit` 图标按钮）。**词表在归一化后的串上匹配（空白已全部去掉）**，多词英文必须连写（`placeorder` 不是 `place order`）；短且歧义的词（apply/send/pay/save…）放 `SUBMIT_EXACT` 只做整串匹配。导航优先豁免**必须收窄**（`NAV_OVERRIDE` 只认「〜して次へ」与「〜を確認する」两种形态）：曾用「标签含任意导航词」做豁免，导致 `Submit and continue` / `Sign up and continue` 同时命中提交词与 continue → 被 `click_button(next)` 真点下去。
- **字段扫描**：Ant 的 `.ant-form-item`（含地址组等子字段无 label 只有 placeholder）或原生（label-for / label 包裹 / fieldset+legend / aria-label / placeholder 五级标签兜底）。必填查 `required` 属性 / aria-required / Ant 的 `.ant-form-item-required`——**子单元要往上找到 `.ant-form-item`**（必填标记与 explain-error 都挂在外层，漏读会让字段进不了 missingRequired 而被整段跳过）。一个 form-item 里平铺多个输入框（电话分段/姓名分栏/地址组）时**不认领整项**，改为「每个可见平铺输入框 + 每个最外层组件根」各建一个单元（含 `.ant-select`/`.ant-picker`/`.ant-upload`/`.ant-input-number` 等混合项），否则组件之外的子字段既没有 ref、也进不了 missingRequired 而被整段跳过。**合并 checkbox 组**的 `filled` 按「必填成员是否都已勾选」判定（否则 `同意(required,未勾选)+メルマガ(已勾选)` 会因同组另一项已勾选而逃出 missingRequired）。包裹层里的裸 `[role=switch]` 也要识别（漏了会被判 unknown 整字段丢弃）。取文本输入框时选**可见**的那个（同单元可能有 `display:none` 隐藏镜像，否则快照读空、写入幽灵节点、下轮报假已填）。
- **日期选择器**：Ant `a-date-picker`（键入完整日期 + Enter + blur 回读校验）或原生 `input[type=date]`（直接设 `YYYY-MM-DD`）。候选**月日一律补零**（rc-picker 用 dayjs 严格模式解析，`2024/4/5` 在 `YYYY/MM/DD` 下直接判无效）；placeholder 给不出分隔符时默认 `-`（Ant/Element 默认 format）；回读按数字序列保序比对，`04/05` 与 `05/04` 不会互相误判。
- **动态下拉**（选项接口动态返回）：模型猜不到 → 默认 `choose_option(ref,"first")` 选第一个可用项（校验通常只要求非空，最稳最快）；需要特定值时才 `read_options`（开 dropdown 读选项，读的是 `activeDropdown`——aria-owns 节点没选项时退回可见浮层）。**联动/级联下拉必须分轮选**（先选上级、下一轮确认下级选项带出后再选），不能同批并行。
- **原生控件**：select 直接设值 dispatch change；radio/checkbox 按 label 文本找 input 点击；原生 file input 用 `DataTransfer` 塞 File 后 dispatch change。多控件平铺共享父容器时按「控件自身」作单元（避免 seen 去重丢字段）。
- **checkbox**：点 `input`；点后 waitFor 复读状态防「读到旧状态→再点→翻转」的反复勾选。
- **可见性**：`visible()` 用 `checkVisibility()`（对 `position:fixed` 弹窗也正确），不能只用 `offsetParent`。
- **ref 失效**：编号 `e<n>` **全局自增、跨快照不重用**（否则同批 get_form 重建 REFS 后旧 ref 会指向另一个字段并静默写错）；`getRef` 另校验 `item.isConnected`，失效返回「请重新 get_form」明确提示。
- **选项文本口径**：radio/checkbox 选项文本统一走 `optionTextOf`（label 包裹 → 兄弟 `label[for]` → value），快照与 `choose_option` 必须同源，否则会出现「快照列了选项、按文本却选不中」。
- **校验错误**：`errorOf` 只认**可见**的错误节点——Bootstrap 的 `.invalid-feedback` 常驻 DOM 靠 display 切换，不滤会让所有字段都带 error、agent 反复重填。

## Agent 行为约束（system-prompt.js）

字段快照按**页面视觉顺序**排列（buildSnapshot 末尾按文档序 sort，混合 Ant/原生也正确），prompt 要求模型**严格按序逐个填**（默认一轮 1~3 个字段，校验联动时禁止并行）。只处理两类字段：① `missingRequired`（必填且空）；② 带 `error` 的。其余 `filled=true` 且无 error 一律跳过（表单可能缓存预填/上轮已填）。同一字段连续失败 2 次就记进 finish summary 留人工，**绝不无限循环**。

**测试数据策略**：agent 填合理测试值，名称/公司/店名类加「テスト/TEST/测试」标识；邮箱用「当前用户邮箱 + 加号别名」`local+<tag>@domain`——base 邮箱不写死：content `detectUserEmail()` 从 localStorage 的 JWT(`*ACCESS_TOKEN`)解 email，面板「基础邮箱」可覆盖，onStart 随 `agent:start` 传给 background → buildSystemPrompt({baseEmail})。加号 tag 由 agent 按本次上下文自起，base 缺失时用 `test+<tag>@example.com` 占位并在 finish 提示人工。

## 调试 / 扩展

- 真机测：`chrome://extensions` 改完**点「重新加载」**，刷新表单页，看浮窗实时日志（`▶`工具调用 / `↳`结果）。
- 端到端连通可在本机 `node` 里 `fetch` 推理服务 `/v1/chat/completions` 带 `tools` 验证返回 `tool_calls`。
- **不要**引入 agent-sdk/打包构建（MV3 不能运行时 require，上 SDK 要 bundler，破坏即装即用；background 已按 ES module 拆分 `src/background/`，content 侧靠 manifest 多文件按序注入共享作用域，均零构建；工具循环本身才几十行）。
- 图标：Zima Blue `#0080ff` 的 {F} + 透明底（FormForge 标识，取自 forgecode.dev logo 的图形部分、去除文字）；素材在 `icons/forge_mark.svg`（源）与 `icons/forge_mark_512.png`（透明底黑标母版），`make_icons.py` 套色生成各尺寸。
