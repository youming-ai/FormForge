# FormForge — 通用网页表单自动填充 Agent

纯浏览器内的 Chrome MV3 扩展：点扩展图标在**任意网页**唤出浮窗，由**本地推理服务**（OpenAI 兼容 + function calling）通过 DOM 工具逐步识别并填写任意网页表单——读真实下拉选项、按校验纠错、走到**最终确认页 / 提交前停下（绝不提交）**。数据全程走你自己的本地 LLM，不上传云端。

## 安装

1. 准备一个 OpenAI 兼容的本地推理服务（LM Studio / llama.cpp 均可），加载一个**支持 function calling** 的模型。
2. `chrome://extensions/` → 开发者模式 → 加载已解压扩展 → 选本目录。
3. 打开任意表单页 → 点扩展图标 → 在「连接设置」填入推理服务地址和模型（默认地址为占位符 `<your-host>:8434`，填 `auto` 自动选已加载模型）。
4. 填场景（可留空）→「开始」→ 看浮窗里的实时动作日志。

## 能力

- **控件**：text / number / textarea / 富文本 / select（含多选/远程） / radio / checkbox / switch 开关 / date / file / 可点卡片；Ant Design 优先 + 原生 HTML 兜底，多步骤向导、单页长表单、弹窗表单均支持。
- **智能**：读真实下拉选项、按校验错误自动修正（如カナ字段转片假名）、按页面顺序逐个填、失败留人工不卡死。
- **安全**：`click_button` 硬拦截「最终提交」类按钮（送信/登録/Submit/購入等词表），确认页只能 `finish`，绝不提交真实申请。

## 注意

- 必须用支持 function calling 的模型；小模型在长 agentic 循环里可能不稳。
- agent 填的是合理测试值：名称类加「テスト/TEST/测试」标识，邮箱用你的加号别名 `local+<tag>@domain`（面板可设基础邮箱）。
- 零构建，直接加载源码；测试在 `test/`（headless Chrome 矩阵）。

## 许可

MIT，见 `LICENSE`。**请勿用于对真实生产表单批量提交虚假数据**；本扩展默认绝不提交，仅作自动化填表与测试研究。
