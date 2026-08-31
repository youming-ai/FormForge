# 加盟店申请表单 AI Agent（浏览器内 · 本地 LM Studio）

一个**纯浏览器内**的 agent：在加盟店申请表单页面注入右下角浮窗，点「开始」后，**本地 LM Studio 的模型**通过 DOM 工具**逐步识别并填写**表单——读真实下拉选项、按校验纠错、一路点到**最终确认页停下（绝不提交）**。

大脑是你自己的 LM Studio（OpenAI 兼容 + function calling），不走任何云端。与 `../elepay-apply-autofill-ext`（缓存注入，一次性填好）互补：那个最快、最稳；**这个智能**——能处理动态接口字段、自适应表单、看到报错自己改。

## 架构（无独立服务，全在浏览器）

```
浮窗(content) ──start──▶ background(service worker)
                              │  POST LM Studio /v1/chat/completions（工具调用循环）
                              ▼
                         模型决定调哪个工具(tool_calls)
                              │  agent:exec
                              ▼
                         content 执行 DOM 操作 ──tool 结果──▶ 回循环
```

- **大脑**：`background.js` 跑 OpenAI 兼容的 function-calling 循环，直连本地 LM Studio。
- **手**：`content.js` 就在页面上执行 DOM 工具。
- **眼**：`get_form` / `read_options` 把当前步骤和真实下拉选项喂回模型。

## 工具集

| 工具 | 作用 |
|---|---|
| `get_form` | 读当前步骤快照（字段 ref/类型/值/校验错误 + 按钮 + 是否确认页） |
| `read_options` | **打开下拉读真实选项**（业种/银行/支店/plan 等动态字段的关键） |
| `fill_text` | 填文本/多行 |
| `choose_option` | 选 select/radio/checkbox（同意条款 = check） |
| `set_date` | 设日期选择器 |
| `click` | 点任意按钮/卡片（如「住所自動入力」） |
| `upload_file` | 向上传字段塞测试图片（默认生成 dummy PNG / 面板固定图） |
| `click_button` | next/back（确认页禁止前进，硬拦截，只能 finish） |
| `finish` | 结束（到确认页 / 无法继续） |

## 安装

1. LM Studio：加载一个**支持 function calling** 的模型（如 `qwen/qwen3-30b-a3b-2507`），开启 Server +「Serve on Local Network」。
2. `chrome://extensions/` → 开发者模式 → 加载已解压扩展 → 选本目录。
3. 打开加盟店申请**新建**表单页 → 右下角出现浮窗 → 展开「设置」确认接口地址/模型 → 保存。
   - 默认接口 `http://10.0.0.64:8434/v1/chat/completions`（macstudio LAN）；Tailscale 用 `http://100.96.69.27:8434/...`；本机用 `http://localhost:1234/...`。
   - 模型默认 `qwen/qwen3-30b-a3b-2507`，填 `auto` 则调 `/v1/models` 自动选已加载模型。
4. 填场景（可留空）→「开始填写」→ 看浮窗里 agent 的实时动作日志。

> 点扩展图标可切换浮窗显示/隐藏。

## 注意 / 限制

- **必须用支持 function calling 的模型**。小模型在长 agentic 循环里可能不稳；不行就换大一点的（如 qwen3.5-27b/32b）。
- **文件上传**：agent 用 `upload_file` 自动上传图片——默认 canvas 生成的 dummy PNG，或在面板「设置 → 固定上传图片」里指定一张固定图（≤4MB，存为 dataURL）。会真正上传到 OSS。只接受 PDF 等特殊类型的字段可能失败，会提示人工。
- **生产环境 `business.elepay.io`**：浮窗显示橙色警示；agent 到确认页**只 finish、绝不提交**（`click_button` 在确认页被硬拦截）。手动也别提交测试数据。测试优先 sandbox/stg。
- **选择器**针对 legacy `ApplyForm`（`.merchant-apply-info__*` / Ant 组件）；OEM 新版 class 不同时需适配 `content.js`。
- **日期/联动地址**等复杂组件 best-effort，失败时 agent 会从 `get_form` 的 value 看出来重试；个别仍需人工。
- CORS：请求由扩展 service worker 发起，manifest 已声明这些主机，通常无需额外配置。

## 文件结构

```
manifest.json      MV3 配置（含 LM Studio 主机 + 表单域名）
background.js      service worker：OpenAI 兼容工具调用循环 + 调 LM Studio
content.js         浮窗 UI（shadow DOM）+ DOM 工具执行器
tools.js           工具定义（OpenAI function 格式）
system-prompt.js   agent 指令 + 字段/枚举/日语格式指南
```

## 后续可扩展

- 复杂组件（联动地址、文件上传引导）更稳的执行。
- `get_form` 快照里 select 选项预读，减少 read_options 往返。
- 流式输出，浮窗里实时显示进度。
