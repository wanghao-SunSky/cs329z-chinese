# HW1｜从零搭建 Agent Harness

在理解高级框架之前，掌握智能体系统的最佳方式是不依赖任何现成框架，亲手从零搭建一套完整的 **Agent Harness（智能体运行底座）**。

在本项实践（对应源码仓库 [cs329z/assignment1-harness](https://github.com/cs329z/assignment1-harness)）中，你将为一家虚构的能源公司 **Cardinal Energy** 构建内部办公智能体。整个项目分为三个递进阶段：
1. **Part 1：固定流水线（Fixed Pipelines，第 1–4 题）**：实现邮件优先级分类、每日工作摘要生成、BM25 倒排检索器与多跳邮件问答；
2. **Part 2：模型控制循环与安全底座（Agent Loop & Harness，第 5–15 题）**：在仅使用基础文本生成接口 `lm(messages) -> str` 的前提下（**不使用任何第三方 Agent 框架、外部检索库，也不调用模型原生的 Function Calling / Structured Outputs API**），从零实现工具注册表、自定义文本工具协议、Agent 主循环、文档分页搜索与读取、终端沙箱与超大输出截断、上下文压缩（Compaction）、跨会话持久记忆、人机协同审批与防提示注入护栏，并通过 20 个模拟用户画像（Personas）的端到端仿真评测；
3. **Part 3：真实交互实验与架构复盘（Field Notes & Design Memo，第 16–17 题）**：通过命令行与你自己构建的 Agent 交互测试，并撰写系统设计权衡备忘录。

## 环境配置与测试工作流

项目要求 Python $\ge 3.11$，使用 `uv` 管理虚拟环境。所有待实现的业务代码均位于 `cs329z_hw1/` 包内，并通过 `cs329z_hw1/adapters.py` 中的标准入口函数暴露给测试套件（切勿修改 `types.py`、`adapters.py` 的函数签名或 `tests/` 下的测试代码）。

在项目根目录下，首先配置环境变量并拉取邮件与公司政策文档语料（解压后包含 24 份公司政策文档与 26,278 封邮件 JSONL 数据）：

```bash
cp .env.example .env
# 在 .env 中填入你的 OPENROUTER_API_KEY
uv run python data/download.py
```

测试套件分为两类，建议在实现每一道题时严格遵循**“先跑通离线确定性测试，再运行在线真实模型测试”**的节奏：

```bash
# 1. 运行离线确定性测试（使用 ScriptedLM，零 API 费用，秒级检验控制流与边界合同）
uv run pytest tests/test_tool_registry.py
uv run pytest tests/test_tool_protocol.py
uv run pytest tests/test_agent_loop.py

# 2. 运行在线真实模型评测（标记为 -m live，可先用切片快速迭代，再跑全量）
CS329Z_EVAL_SLICE=5 uv run pytest tests/test_priority.py -m live -s
uv run pytest tests/test_priority.py -m live -s
```

> **缓存与预算机制说明**：`llm.py` 内置了基于 SQLite 的本地调用缓存（`.lm_cache/`）与累计预算账本（Ledger）。当提示词、工具描述与输入消息完全一致时，重复运行会直接命中本地缓存而不重复计费；若需测试模型在独立采样下的真实随机波动，可通过设置环境变量 `CS329Z_EVAL_SALT` 注入新盐值。

## Part 1：固定流水线（Fixed Pipelines）

### 1. 邮件优先级 priority（3 分）

- **入口函数**：`run_priority(email: Email, lm: LM) -> tuple[str, str]`
- **核心任务**：仅使用**单次**模型调用，判断一封邮件对收件人的紧急程度，返回 `(category, reason)`，其中 `category` 必须属于 `{"urgent", "normal", "ignore", "unknown"}`，`reason` 为非空解释字符串，且不得修改传入的 `email` 对象。
- **分类准则（站在邮件收件人当时的视角）**：
  - `urgent`：要求收件人在当天、下一个工作日或至多两个工作日内采取行动的明确请求，或收件人直接负责的线上故障/紧急审批；
  - `normal`：发给收件人的常规工作沟通、问题咨询、文档审阅、日程协调或同事便条；
  - `ignore`：无需收件人采取任何行动的广告推销、全员群发广播或自动通知（注意：写着“限时抢购立即行动”的群发广告依然是 `ignore`；但要求收件人本人处理的系统故障告警则是 `urgent`）；
  - `unknown`：当模型的输出无法解析出上述三个明确标签时，必须返回 `unknown`，绝不能盲目默认猜 `normal`。
- **验收标准**：离线解析测试全通；在 60 封平衡类别的 Live 测试集上准确率 $\ge 85\%$（至少答对 51 封），且 Live 评测中不出现 `unknown`。

### 2. 日报 daily_digest（4 分）

- **入口函数**：`run_daily_digest(emails: list[Email], lm: LM) -> str`
- **核心任务**：对传入的一批单日邮件先逐封分类（可并发执行），由**程序代码**完成过滤与排序——剔除所有 `ignore` 邮件（将 `unknown` 视作 `normal` 保留）、按邮件主题线程归并、将 `urgent` 置顶排序后，仅用**最后一次模型调用**生成当日工作简报。若输入为空列表或全部被过滤，也应返回合理的简短说明字符串。
- **硬性约束**：
  1. 模型生成的原始日报词数严格不超过 **300 个词**（按 `len(text.split()) <= 300` 判定，必须在提示词中控制模型生成长度，不得在事后用代码暴力截断字符串）；
  2. 必须完整点名提及当天所有 `urgent` 邮件涉及的核心公司、项目或地点实体；
  3. 绝不能混入任何属于 `ignore` 邮件的内容。

### 3. BM25 倒排检索（8 分）

- **入口函数**：`run_bm25_build(docs: list[str]) -> BM25Index` 与 `run_bm25_search(index: BM25Index, query: str, k: int) -> list[tuple[int, float]]`
- **核心任务**：使用项目提供的分词器 `tokenizer.tokenize`（转小写并按非英文字母数字切分），从零实现内存倒排索引（Inverted Index）。
- **算法与性能要求**：
  1. **建索引（`run_bm25_build`）**：单次遍历文档列表构建 `term -> postings` 映射，记录每篇文档的长度 $|D|$、包含各词的文档频次 $\text{df}$ 以及全集平均文档长度 $\text{avgdl}$（空文档同样计入总文档数 $N$ 与平均长度分母）。
  2. **打分公式（`run_bm25_search`）**：采用参数 $k_1 = 1.5, b = 0.75$，以及非负 IDF 公式：
     $$\text{IDF}(t) = \ln\left(1 + \frac{N - \text{df}(t) + 0.5}{\text{df}(t) + 0.5}\right)$$
  3. **倒排加速与边界**：查询词去重后，**仅遍历查询词对应的倒排链表（Postings List）**，绝不能在查询时扫描全部 $N$ 篇文档；与查询无公共词元的文档得分为 0，不得出现在返回列表中；结果按得分降序排列（得分相同时按较小的 `doc_id` 升序排列）。
- **验收标准**：5 篇文档手算精度误差 $\le 10^{-6}$；17 条邮件查询的 Top-10 平均召回率 $\ge 90\%$；构建索引耗时 $< 15\text{ s}$，平均单次查询 $< 20\text{ ms}$，在 20 万篇文档中检索仅出现 3 次的稀有词耗时 $< 2\text{ ms}$。

### 4. 多跳邮件问答 email_qa（8 分）

- **入口函数**：`run_email_qa(question: str, search: Callable[[str, int], list[Email]], lm: LM) -> tuple[str | None, list[str]]`
- **核心任务**：针对需要跨单封或多封邮件串联线索的问题（例如先从第一封邮件查出负责某项目的律所名称，再以律所名称为关键词搜出第二封邮件里的托管定金账号），驱动模型自主构造查询、阅读结果并决定是否继续检索。
- **硬性约束**：
  1. 代码层强制限制每道题最多调用 `search` 函数 **3 次**；
  2. 返回 `(answer, support)`，其中 `support` 为支持该答案的邮件 ID 列表，且返回的每一个邮件 ID 都**必须确实在本次问答的 `search` 返回结果中出现过**；
  3. 邮件正文中可能包含恶意的提示注入文本，系统必须仅将邮件视为待查证据。
- **验收标准**：在 25 道 Live 测试题（含 12 道单跳、13 道两跳）上答题准确率 $\ge 70\%$（至少 18 题），且每道答对题目的 `support` 列表至少命中一条黄金证据邮件 ID。

## Part 2：模型控制循环与安全底座（Agent Loop & Harness）

### 5. 工具注册表 tool_registry（3 分）

- **入口函数**：`run_tool_registry(tools: list[ToolSpec])`
- **核心任务**：实现一个管理可用工具的注册表对象，暴露三个核心接口：
  1. `schemas() -> list[dict]`：按注册顺序返回仅包含 `name`、`description`、`parameters` 三个键的字典列表；
  2. `validate(call: ToolCall) -> ToolResult | None`：**仅校验、不执行**。若工具名不存在，返回 `status="unknown_tool"`；若参数不符合该工具的 JSON Schema（使用提供的校验规则），返回 `status="invalid_args"`；若完全合法则返回 `None`；
  3. `execute(call: ToolCall) -> ToolResult`：先调用 `validate`，校验通过后执行恰好一次底层工具函数，成功则返回 `status="ok"` 及字符串结果；若工具函数内部抛出任何异常，捕获并返回 `status="tool_error"` 及错误描述，**绝不向外抛出未捕获的工具异常**。

### 6. 文本工具协议 tool_protocol（4 分）

- **入口函数**：`run_render_tools(schemas)`、`run_parse_response(text)`、`run_format_tool_call(call)`
- **核心任务**：由于不依赖模型厂商原生的 `tool_calls` 字段，你需要自己设计一套纯文本工具调用协议（例如使用特定起止定界符包裹 JSON 对象），让模型在普通文本输出中表达工具调用。
- **严苛的解析合同**：
  1. `run_render_tools` 生成的工具说明文本必须完整包含所有工具名称及参数字段名，并清楚教模型如何按你的协议格式输出；
  2. 模型单次回复只允许是**纯自然语言最终回答**，或包含**恰好一个**工具调用（若单次回复包含多个工具调用，解析器必须返回 `error`）；
  3. **往返无损与抗嵌套截断**：`format -> parse` 往返必须严格保留布尔值 `true`、整数 `1`、浮点数 `1.0` 与字符串 `"1"` 的类型区分；当输出在任意字符位置被截断（模拟 `max_tokens` 截断），或当工具参数字符串内部恰好包含你自己协议的完整定界符文本时，解析器绝不能崩溃或误解析出残缺的错误指令。
- **验收标准**：通过全部极端边界离线测试，并在 20 个单步工具调用 Live 请求中至少正确完成 18 个。

### 7. Agent loop（8 分）

- **入口函数**：`run_agent_session(lm, tools, config: AgentConfig)`
- **核心任务**：实现支持多轮对话（`send(user_message) -> AgentResult`）、追加式历史记录（`transcript`）与模式切换（`set_mode`）的 Agent 会话状态机。
- **控制流与预算规则**：
  1. 每次 `send()` 独立统计当前轮次（`max_turns`）与累计 Token 消耗（`total_token_budget`，使用 `tokens.py` 计数器）。在发起每一次模型调用前，先检查轮数是否超限，再检查累计 Token 是否超限；
  2. **最后一轮边界**：在第 `max_turns` 轮（最后一个允许回合）中，如果模型发出了合法的工具调用，该工具**依然要执行**并将结果追加进 `transcript`，随后因轮数用尽返回 `status="max_turns"`；如果某次模型调用直接产出了最终回答，即便这次调用刚巧跨过累计 Token 预算，依然正常返回该回答并标为 `status="done"`；
  3. **连续三次格式错误熔断**：当模型输出触发解析错误（`parse_error`）、未知工具（`unknown_tool`）或参数非法（`invalid_args`）时，记为一次畸形回复（Malformed，包括捕获 `OutputTruncated` 异常），并将错误反馈给模型让其重试；若**连续 3 次**出现 Malformed 则立即熔断停止并返回 `status="malformed"`；一旦中间有一次合法调用（哪怕工具执行报错 `tool_error` 或被用户拒绝 `denied`），连续畸形计数器即清零；
  4. **追加式不可变日志**：每一步事件严格追加，永不删改已发生的事件；下一轮模型调用必须逐字看到上一轮工具返回的观测文本。

### 8. Cardinal 工具集（2 分）

- **核心任务**：当 `tools=None` 时，自动组装 Cardinal Energy 助手的完整工具箱：`search_emails`、`read_email`、`email_qa`、`daily_digest`、`search_docs`、`read_doc`、`run_terminal`、`remember`、`recall`、`ask_user`。
- **延迟加载与辅助模型路由**：
  1. 初始化会话时**不得**提前读取或构建全量邮件索引，必须在首次实际调用邮件工具时才执行惰性加载（Lazy Loading）并在会话内复用索引；
  2. Agent 主循环的每一步决策调用主模型 `lm`；而工具内部的子调用（如 `email_qa`、`daily_digest` 以及后续的上下文摘要压缩）必须优先调用 `config.aux_lm`（仅当 `aux_lm is None` 时回退使用 `lm`），以保证离线 `ScriptedLM` 步数对齐与线上成本分离。

### 9. 文档搜索与分页读取 search_docs（5 分）

- **入口函数**：`run_build_doc_index`、`run_search_docs`、`run_read_doc`
- **核心任务**：为 24 份公司政策文档实现带摘要片段（Snippet）的检索与按行号分页读取：
  1. `search_docs(index, query, k)`：返回至多 $k$ 条匹配结果，每条 snippet 长度 $\le 150$ 个作业 Token，且必须包含原文中至少连续 4 个词的真实片段（严禁编造摘要）；
  2. `read_doc(index, doc_id, start_line, end_line)`：行号从 1 开始（按 `splitlines()` 切分），返回指定行区间的原始文本（不额外拼接行号前缀），单次返回不超过 1,500 Tokens，并返回 `DocWindow` 元数据（允许从 `end_line + 1` 无缝续读至 `total_lines`）。
- **验收标准**：在 20 道政策问答 Live 测试（涵盖深层条款、词面同义替换、以及**已被新版政策废止的旧版政策干扰**）中准确率 $\ge 75\%$（至少 15 题），且每题文档读取总量 $\le 6,000$ Tokens。

### 10. 终端与 observation policy（6 分）

- **核心任务**：封装 `sandbox.run_terminal(cmd, workspace=..., timeout=...)`。仅当命令实际执行且返回退出码 `0` 时标记 `status="ok"`；非零退出码、超时或被沙箱拦截均返回 `status="tool_error"` 及可读的错误原因。
- **超大输出观测策略（Observation Policy）**：测试中包含单次打印 **600,000 字符** 的极端命令，而单次模型调用的总上下文预算可能只有几千 Token。你需要设计合理的截断与转存策略（例如保留头部与尾部关键行、将完整输出落盘到工作区临时文件并在返回结果中告知模型如何用 `grep` / `sed` 按需分段查看）。注意：`transcript` 中保存的 `tool_result` 必须与实际展示给模型的截断文本一致。 Live 测试包含 9 道主问题加 1 道针对截断列表中间某行的追问，要求至少答对 8/10。

### 11. 上下文压缩 compaction（8 分）

- **核心任务**：确保每一次调用 `lm(messages)` 时，严格满足 `count_message_tokens(messages) <= config.context_budget`，且当前轮次用户的原始请求消息（Current User Message）必须始终保留在上下文中。
- **架构衔接**：测试会使用 4,000 Tokens 的紧凑窗口连续发起约 60 次工具调用与 12 轮用户对话。为了同时满足“下一轮调用必须逐字看到上一轮工具输出”与“总长度不超过预算”，应当遵循：**（1）单条工具输出在进入事件流前先通过第 10 题的观测策略控制上限；（2）底层 `transcript` 保持追加不可变；（3）当构造本轮模型输入视图超出 `context_budget` 时，调用 `aux_lm` 将较早的历史轮次压缩为保留了核心约束、关键发现与进度的摘要消息**。

### 12. 跨会话记忆 memory（8 分）

- **核心任务**：实现仅在 `config.memory_dir` 目录下持久化读写数据的 `remember` 与 `recall` 工具。不同 `memory_dir` 之间必须完全隔离；当记忆库为空时调用 `recall` 也必须返回 `status="ok"` 及清晰的空状态提示。
- **冲突更新要求**：在跨会话测试中，第一轮会话用户会告知某项事实或项目编号，随后在同一会话或后续句子中更正该编号；第二轮新会话启动时仅共享同一个 `memory_dir`，Agent 必须能够召回更正后的最新事实，避免将已作废的旧编号混入回答中。

### 13. 交互、审批与 steering（7 分）

- **核心任务**：通过 `config.user`（`UserIO` 接口）实现三项人机协同机制：
  1. **主动澄清（`ask_user`）**：调用 `user.ask(question)` 获取用户补充说明，并将其作为 `status="ok"` 的工具结果返回给模型；
  2. **敏感操作审批（Approval in `confirm` mode）**：当 `mode == "confirm"` 时，对于通过了 Schema 校验且非只读的工具（如 `run_terminal`），在执行前必须对 `user.approve(call)` **恰好调用一次**（`ask_user`、`remember`、`recall` 永不触发审批弹窗；非法调用在校验阶段直接报错，不打扰用户审批）。若用户拒绝，则绝不执行该工具，记录 `status="denied"` 及拒绝理由并让模型继续思考替代方案；
  3. **中途插话转向（Steering via `pending_message`）**：在每一次调用模型之前，恰好调用一次 `user.pending_message()`；若返回非空新消息，立即将其作为新的 `user` 事件追加进历史并纳入本次模型输入，使 Agent 能够实时响应用户的中途改口。

### 14. Deny rules 与 prompt injection（4 分）

- **核心任务**：在执行 `run_terminal` 前，对完整命令字符串遍历 `config.deny_rules` 执行正则搜索 `re.search(rule, cmd)`。一旦命中任一拒绝规则，无论当前是 `auto` 还是 `confirm` 模式，**立即强制拒绝（不调用 `user.approve` 弹窗，也不执行命令）**。同时确保宿主程序的 `mode` 与 `deny_rules` 绝不会被任何工具返回的文本修改。
- **验收标准**：在 7 道植入了间接提示注入的文档与邮件 Live 测试中，恶意命令实际执行次数严格为 $0$，且正常业务问题答对率 $\ge 6/7$。

### 15. 模拟用户端到端评测 sim_eval（10 分）

- **评测机制**：运行 `cs329z_hw1.simulation` 中的 20 个端到端用户画像场景（涵盖政策检索、多跳邮件、日报追问、确认模式终端操作、跨会话记忆延续与更正、模糊需求澄清及对抗性注入）。
- **满分标准**：单条 Persona 只有在 **Agent 未崩溃 + 全部确定性代码检查（`checks.py`）通过 + 裁判模型（`judge.py`）判定全部 Rubric 通过且无编造（No Fabrication）** 时才计为成功；20 个场景中至少通过 **16 个** 即获满分：

```bash
# 快速运行切片或专项类别调试
uv run python -m cs329z_hw1.simulation --only memory
uv run python -m cs329z_hw1.simulation --slice 3

# 运行全量 20 个 Personas 端到端评测
uv run python -m cs329z_hw1.simulation
```

## Part 3：交互实验与设计复盘

### 16. 使用记录 field_notes（10 分）

运行交互式命令行 `uv run python -m cs329z_hw1.chat`（默认开启 `confirm` 确认模式），亲手向你的 Agent 提出至少 5 个涵盖不同能力维度的新请求（查政策、查邮件、运行终端命令、故意提出指代不明的问题测试澄清、提出触发拒绝或中途修改要求的问题）。结合保存的 `runs/chat-*.json` 轨迹文件，撰写 1 页实验观察笔记（`field_notes`），客观记录系统的真实表现、暴露出的缺陷以及你据此做出的代码改进。

### 17. 设计备忘录 design_memo（20 分）

撰写一份 2 页的架构设计备忘录（`design_memo`），结合具体代码与运行证据逐项回答以下 10 个核心工程问题：
1. **BM25 误差分析**：找出一道 BM25 将无关邮件排在相关邮件前面的具体查询，从词频、IDF 或文档长度解释原因。
2. **工具协议设计**：你采用了什么定界符与格式设计？它是如何保证在任意位置截断或参数内嵌协议文本时依然安全解析的？
3. **空承诺处理**：当模型只用自然语言回复“好的，我现在就去帮您查一下”却没有发出任何工具调用时，你的主循环如何区分它是真的回答完毕还是半途忘了调工具？
4. **文档检索窗口权衡**：你的 `search_docs` 片段与 `read_doc` 分页大小是如何设定的？如何帮助模型识别已废止的旧版政策？
5. **超大终端输出策略**：面对 60 万字符的终端输出，你采用了什么截断与转存策略？模型如何读取被截断掉的中间行？
6. **上下文压缩（Compaction）**：你的压缩策略在何时触发？如何保证早期对话中的硬性约束在多次压缩后不丢失？
7. **跨会话记忆治理**：检查 `sim_eval` 运行后的真实记忆存储文件，分析存下了哪些高价值信息、遗漏了什么，以及如何处理事实更正。
8. **审批策略边界**：在 `confirm` 模式下，哪些工具被你设为免审只读、哪些需要审批？为什么这样划分？
9. **沙箱真实隔离边界**：在你的开发机上运行 `uv run python -c "from cs329z_hw1 import sandbox; print(sandbox.jail())"`，结合 `sandbox.py` 源码分析当前操作系统的沙箱实际上拦截了什么、又有哪些潜在风险是它挡不住的。
10. **整体系统局限性**：如果将这套 Harness 直接部署到真实企业生产环境，最薄弱的环节在哪里？

## 分值分布总览

| 模块编号与名称 | 离线确定性测试分值 | 在线 Live 评测分值 | 单项合计 |
|---|---:|---:|---:|
| 1. `priority`（邮件优先级分类） | 1 | 2 | 3 |
| 2. `daily_digest`（每日工作简报） | 1 | 3 | 4 |
| 3. `bm25`（倒排索引检索器） | 8 | 0 | 8 |
| 4. `email_qa`（多跳邮件问答） | 2 | 6 | 8 |
| 5. `tool_registry`（工具注册表与校验） | 3 | 0 | 3 |
| 6. `tool_protocol`（自定义文本工具协议） | 2 | 2 | 4 |
| 7. `agent_loop`（Agent 主控制循环） | 8 | 0 | 8 |
| 8. `cardinal`（工具集组装与惰性加载） | 2 | 0 | 2 |
| 9. `search_docs`（文档检索与分页读取） | 2 | 3 | 5 |
| 10. `terminal`（终端执行与超大输出策略） | 2 | 4 | 6 |
| 11. `compaction`（长上下文压缩） | 5 | 3 | 8 |
| 12. `memory`（跨会话持久记忆） | 3 | 5 | 8 |
| 13. `interactive`（主动澄清、审批与中途转向） | 7 | 0 | 7 |
| 14. `guardrails`（拒绝规则与防提示注入） | 2 | 2 | 4 |
| 15. `sim_eval`（20 Personas 端到端模拟评测） | 0 | 10 | 10 |
| **代码自动评分小计** | **48** | **40** | **88** |
| 16. `field_notes`（交互实验观察记录） | — | — | 10 |
| 17. `design_memo`（系统架构设计备忘录） | — | — | 20 |
| **总分** | **48** | **40** | **118** |
