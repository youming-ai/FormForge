# FormForge — 通用网页表单自动填充 Agent

纯浏览器内的 Chrome MV3 扩展：点扩展图标在**任意网页**唤出浮窗，由**本地推理服务**（OpenAI 兼容 + function calling）通过 DOM 工具逐步填写表单——读真实下拉选项、按校验纠错、到**确认页 / 提交前停下（绝不提交）**。数据只走你自己的本地 LLM。

## 安装

1. 准备 OpenAI 兼容的本地推理服务（LM Studio / llama.cpp），加载**支持 function calling** 的模型。
2. `chrome://extensions/` → 开发者模式 → 加载已解压扩展 → 选本目录。
3. 打开表单页 → 点扩展图标 → 填入服务地址与模型（默认占位符 `<your-host>:8434`；模型填 `auto` 自动选）。
4. 填场景（可留空）→「开始」，看浮窗实时日志。

## 能力

- **控件**：text / number / textarea / 富文本 / select（多选、远程）/ radio / checkbox / switch / date / file / 可点卡片；Ant Design 优先 + 原生 HTML 兜底，支持多步骤向导、长表单、弹窗表单。
- **智能**：读真实下拉选项、按校验纠错（如カナ转片假名）、按页面顺序逐个填、失败留人工不卡死。
- **安全**：`click_button` 硬拦截最终提交类按钮（送信/登録/Submit/購入等词表），确认页只能 `finish`。

## 注意

- 需支持 function calling 的模型；小模型在长 agentic 循环里可能不稳。
- 填的是测试值：名称类带「テスト/TEST/测试」标识，邮箱用加号别名 `local+<tag>@domain`（基础邮箱可设）。
- 零构建，直接加载源码；测试在 `test/`。

## 许可

MIT，见 `LICENSE`。请勿对真实生产表单批量提交虚假数据。
