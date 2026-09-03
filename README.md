# FormForge — 通用网页表单自动填充 Agent

纯浏览器内的 Chrome MV3 扩展：点扩展图标在**任意网页**唤出浮窗，由**本地推理服务**（OpenAI 兼容 + function calling）通过 **DOM 工具**逐步识别并填写任意网页表单——读真实下拉选项、按校验纠错、一路走到**最终确认页 / 提交前停下（绝不提交）**。

数据全程走你自己的本地 LLM，不上传任何云端。

## 架构（无独立服务，全在浏览器）

```
浮窗(content) ──start──▶ background(service worker)
                              │  POST 本地推理服务 /v1/chat/completions（工具调用循环）
                              ▼
                         模型决定调哪个工具(tool_calls)
                              │  agent:exec
                              ▼
                         content 执行 DOM 操作 ──tool 结果──▶ 回循环
```

- **大脑**：`src/background/index.js` 跑 OpenAI 兼容的 function-calling 循环，直连本地推理服务。
- **手**：`src/content/dom-tools.js` 在页面上执行 DOM 工具（fill/choose/date/upload/click/导航）。
- **眼**：`src/content/snapshot.js` 的 `get_form` 把当前步骤和可选项喂回模型。

## 工具集

| 工具 | 作用 |
|---|---|
| `get_form` | 读当前步骤快照（字段 ref/类型/值/校验错误 + 按钮 + 是否确认页） |
| `read_options` | 打开下拉读真实选项（动态接口字段/远程搜索下拉的关键） |
| `fill_text` | 填文本/多行 |
| `choose_option` | 选 select/radio/checkbox/卡片（`first` 选第一个 / 文本匹配） |
| `set_date` | 设日期选择器 |
| `click` | 点任意按钮/元素（如「自动带入地址」） |
| `upload_file` | 向上传字段塞测试图片 |
| `click_button` | next/back（确认页与最终提交类按钮被硬拦截） |
| `finish` | 结束（到确认页 / 无法继续） |

## 支持的控件（Ant Design 优先 + 原生 HTML 兜底）

text / textarea / select / radio / checkbox / date / file upload / 可点卡片。标签识别覆盖 `label[for]` / label 包裹 / `legend` / `aria-label` / `placeholder` 五种结构。多步骤向导、单页长表单、登录/弹窗表单（`position:fixed`）均支持。

## 安装

1. 准备一个 OpenAI 兼容的本地推理服务（LM Studio / llama.cpp / llama-swap 均可），加载一个**支持 function calling** 的模型。
2. `chrome://extensions/` → 开发者模式 → 加载已解压扩展 → 选本目录。
3. 打开任意表单页面 → 点扩展图标唤出浮窗 → 展开「连接设置」填入推理服务地址和模型。
   - 默认地址用占位符 `<your-host>:8434`，请换成你实际的推理服务地址；填 `auto` 会自动选已加载模型。
   - 默认模型 Qwen3 系 MoE（如 `qwen3.6-35b-a3b-mlx` / `qwen3-30b-a3b`）在本地多轮 agent 循环中性能/速度均衡。
4. 填场景（可留空）→「开始」→ 看浮窗里 agent 的实时动作日志。

## 注意 / 限制

- **必须用支持 function calling 的模型**。小模型在长 agentic 循环里可能不稳；不行就换大一点的 MoE。
- **测试数据策略**：agent 填的是合理测试值；名称类字段加「テスト/TEST/测试」标识，邮箱用你的「加号别名」`local+<tag>@domain`（面板可设基础邮箱），便于识别归属、不污染真实数据。
- **安全红线**：`click_button` 会硬拦截「最终提交」类按钮（送信/登録/Submit/購入等文案的词表），确认页只能 `finish`、绝不上传/提交真实申请。
- **文件上传**：用 `upload_file` 自动塞一张 dummy 图（或面板指定固定图）。只接受特殊类型（如 PDF）的字段会失败，agent 会在 finish 里提示人工。
- **零构建**：MV3 直接加载源码，无需打包。测试在 `test/`（headless Chrome 矩阵）。

## 文件结构

```
manifest.json          MV3 配置（<all_urls>）
src/background/       service worker（ES module）
  index.js            入口：工具调用循环 + 消息路由 + 上下文压缩 + 停止中断
  llm.js              推理服务客户端（设置/超时/auto 模型解析）
  tools.js            工具定义（OpenAI function 格式）
  system-prompt.js    agent 指令 + 错误修正对照表
src/content/          页面侧脚本（按序注入，共享隔离环境，零构建）
  utils.js            通用工具（waitFor / setNativeValue / visible / JWT 邮箱探测）
  snapshot.js         「眼」：get_form 快照 + ref 管理
  dom-tools.js        「手」：DOM 工具执行器
  panel.js            浮窗 UI（shadow DOM 隔离）
  main.js             消息总线
test/                 自动化测试（表单类型矩阵 / 面板冒烟 / ESM 语法自检）
icons/                {F} logo 素材 + 生成脚本
```

## 许可

开源协议见 `LICENSE`。**请勿用于对真实生产表单批量提交虚假数据**；本扩展默认绝不提交，仅作自动化填表与测试研究。
