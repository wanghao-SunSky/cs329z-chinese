# 配套代码架构导读

本课程提供两套核心配套代码：第一套是 **[HW1：从零搭建 Agent Harness](exercises/HW1-从零搭建Agent-Harness.md)** 的工程骨架（`assignment1-harness`），第二套是 **[第 05 讲：框架与持久编排](05-框架与持久编排.md)** 的实战演示仓库（`lecture5-frameworks`）。

这两套代码构成了互补的工程视角：在 HW1 中，你将剥离所有高级框架，亲手用原生 Python 实现检索器、工具解析协议、状态循环与上下文压缩，看清运行底座（Harness）的每一处细节；而在第 05 讲的代码中，你将看到 DSPy、LangGraph 与 Temporal 如何将这些底层模式抽象为声明式模块、状态图与持久化工作流。

## 1. `assignment1-harness`：从零实现 Agent 运行底座

源码位于 [原课程 HW1 仓库](https://github.com/cs329z/assignment1-harness)。整个项目围绕能源公司 Cardinal Energy 的内部办公助手展开，要求在不调用模型原生 `tools` / `function_calling` API、不引入外部检索库的前提下，仅凭基础的文本生成接口 `lm(messages) -> str` 构建完整的 Agent 系统。

### 核心模块与接口契约

在动手编写代码前，建议按以下顺序阅读核心模块，理清数据流与接口边界：

| 文件 / 目录 | 核心职责 | 实现与阅读重点 |
|---|---|---|
| `cs329z_hw1/types.py` | 全局数据结构定义 | 定义了 `Email`、`ToolSpec`、`ToolCall`、`ToolResult`、`ParsedResponse`、`AgentConfig`、`AgentResult`、`DocWindow` 以及事件日志（Transcript Events）的标准字段。所有模块必须严格返回这些规范化类型。 |
| `cs329z_hw1/adapters.py` | 评测器与实现代码的唯一桥接层 | 包含全部 17 道题目的函数入口（如 `run_priority`、`run_bm25_build`、`run_agent_session`）。测试套件仅通过调用 `adapters.py` 验证你的实现，切勿修改函数签名。 |
| `cs329z_hw1/llm.py` | 语言模型调用封装与账本统计 | 统一封装了真实模型（通过 OpenRouter 调用）与离线确定性测试模型（`ScriptedLM`），内置 SQLite 响应缓存、Token 费用账本（Ledger）、累计预算检查（`BudgetExceeded`）与截断异常（`OutputTruncated`）。 |
| `cs329z_hw1/tokenizer.py` | 词法分析器 | 将文本转为小写并按非字母数字字符切分为词元（Token），供 BM25 索引构建与查询统一使用。 |
| `cs329z_hw1/tokens.py` | 上下文预算计数器 | 采用确定性近似规则（每 4 个字符计为 1 个 Token，每条消息附加固定开销）计算 `count_message_tokens`。上下文压缩（Compaction）与预算控制均以此计数器为准。 |
| `cs329z_hw1/data.py` | 邮件与政策文档加载器 | 负责加载 JSONL 邮件语料、按 UTC 日期过滤邮件，以及读取公司政策 Markdown 文档。 |
| `cs329z_hw1/cardinal.py` | 内置工具集定义 | 声明了 10 个核心办公工具的名称、JSON Schema 参数定义与只读属性（`read_only`），将固定流水线与检索器封装为可供 Agent 调用的标准工具。 |
| `cs329z_hw1/sandbox.py` | 终端命令执行与安全沙箱 | 提供工作区隔离、命令白名单校验、环境变量清理、超时控制、输出截断以及操作系统级沙箱（macOS `sandbox-exec` / Linux `bwrap`）。 |
| `cs329z_hw1/user.py` | 人机交互接口 | 定义 `UserIO` 抽象及其实现（`ScriptedUser` 与命令行 `ConsoleUser`），支持向用户提问（`ask`）、敏感操作审批（`approve`）与中途插话转向（`pending_message`）。 |
| `cs329z_hw1/pipelines/` | 第一部分：固定流水线实现区 | 存放邮件优先级分类、每日摘要、BM25 检索与多跳邮件问答的实现代码。 |
| `cs329z_hw1/agent/` | 第二部分：动态 Agent 循环实现区 | 存放工具注册表、文本工具协议、Agent 主循环、文档分页检索、终端观测策略、上下文压缩与跨会话记忆的实现代码。 |

### 双轨测试体系：离线确定性测试与真实模型评测

项目在 `tests/` 目录下设计了严密的验证体系，分为两类测试：

1. **离线确定性测试（Deterministic Tests）**：使用预设回复序列的 `ScriptedLM` 与 `ScriptedUser`，不消耗任何 API 额度。重点检验控制流逻辑是否严密：
   - **协议鲁棒性（`test_tool_protocol.py`）**：测试工具调用在任意字符位置被截断、参数中包含转义引号或文件路径、甚至参数字符串内部嵌套了另一段工具协议文本时的解析准确性，确保往返转换（Round-trip）不丢失 JSON 布尔值与数值类型。
   - **主循环边界（`test_agent_loop.py`）**：检验最大轮数限制（`max_turns`）、最后一个允许回合的工具执行、连续三次格式错误（Malformed）自动熔断、工具报错后错误信息的逐字回传，以及历史事件日志的追加不可变性。
   - **安全护栏（`test_guardrails.py`）**：验证确认模式（`confirm`）下的审批调用次数、拒绝规则（`deny_rules`）对危险命令的强制拦截，以及通过检查工作区文件状态确认被拒操作绝未实际执行。
2. **在线真实模型评测（Live Tests，标记为 `-m live`）**：连接真实大模型，在测试集切片（Fixture）上检验系统端到端准确率：
   - `priority_gold.json`（60 封平衡类别邮件，要求准确率 $\ge 85\%$）；
   - `bm25_queries.json`（17 条查询，要求 Top-10 平均召回率 $\ge 90\%$，并严格考核索引构建与稀有词毫秒级查询耗时）；
   - `email_qa.json`（25 道单跳与两跳邮件问答，要求准确率 $\ge 70\%$ 且正确引用证据邮件 ID）；
   - `terminal_questions.json`（9 道主问题加 1 道超长输出追问，考核终端工具与 60 万字符超大输出的截断/持久化策略）。

### 端到端模拟评测框架（`simulation/`）

除了单项能力测试，`cs329z_hw1/simulation/` 实现了一套完整的多轮用户模拟评测框架（对应第 15 题 `sim_eval`），包含 20 个不同画像的模拟用户（Personas），覆盖政策查询、多跳报销核对、日报追问、终端数据分析、跨会话记忆纠正、模糊指令澄清以及恶意提示注入攻击。

| 模块文件 | 核心设计机制 |
|---|---|
| `persona.py` & `persona_user.py` | 解析 JSON 格式的用户画像（包含初始请求、背景知识、工具审批策略、中途插话触发条件），由大模型扮演用户与你的 Agent 进行多轮交互。 |
| `runner.py` & `record.py` | 为每个 Persona 初始化独立的工作目录与记忆目录；在跨会话测试中，第二轮会话仅继承记忆目录而清空对话上下文，并完整归档对话轨迹与 Token 账单。 |
| `checks.py` | 执行确定性程序检查（如特定工具是否被调用、被拒绝的工具是否未执行、第二会话是否未重复询问已知偏好）。 |
| `judge.py` | 实现 LLM-as-Judge 评分器，依据每道题的评分量表（Rubric）逐项判定 `PASS`/`FAIL`，并专门检测回答是否存在脱离工具证据的编造（Fabrication）。 |
| `evaluate.py` & `__main__.py` | 支持并发执行评测、按类别筛选运行（如 `--only memory` 或 `--slice 3`），并输出汇总得分表。 |

> **工程细节提示**：在阅读 `judge.py` 时可以注意，裁判模型看到的并非无限长的完整上下文，而是经过裁剪的证据摘要（每条回复最多 4,000 字符，每个工具调用参数与返回结果开头各 300 字符及关键匹配片段）。这意味着你的 Agent 在回答问题时，应当清晰、准确地陈述从工具中获取的关键事实与出处。

## 2. `lecture5-frameworks`：用同一任务横向对比三大框架

源码位于 [原课程第 5 讲仓库](https://github.com/cs329z/lecture5-frameworks)。该仓库围绕一个统一的业务场景——**“从自然语言邮件中提取日程信息，自动匹配 Emoji 图标，并写入本地日历服务”**——在同一个 Jupyter Notebook（`lecture5.ipynb`）中依次展示了 **DSPy**、**LangGraph** 与 **Temporal** 的实现方式。

### 本地日历服务（`tinycal/`）与数据配置

为了提供真实的外部工具交互环境，仓库内置了一个轻量级 HTTP 日历服务 `tinycal`：
- **服务端与 SDK（`tinycal/server.py`、`tinycal/sdk.py`）**：基于标准库实现的本地 REST 服务（默认监听 `8765` 端口），将日程持久化在 JSON 文件中，提供 `today`、`list`、`add`、`update`、`delete`、`find_free_slots` 与 `clear` 接口，并包含日期格式校验与并发文件锁。
- **合成邮件数据集（`data/emails.json`）**：包含 50 封带标注的测试邮件（含 `event_name`、`date`、`start`、`duration` 四个字段），涵盖明确邀约、缺少时长的模糊通知以及完全无关的闲聊邮件。

### `lecture5.ipynb` 逐模块精读指南

Notebook 共包含 70 个单元格（编号 `0`–`69`），按四个递进阶段组织：

| 单元格范围 | 演进阶段 | 核心代码与架构看点 |
|---|---|---|
| **Cells 0–10** | 环境初始化与服务启动 | 配置 DSPy 与 LangChain 的语言模型客户端（内置基于 SQLite 的本地调用缓存 `llm_cache.py`），在后台启动 Temporal 本地开发服务器（UI 端口 `8233`）与 `tinycal` 日历服务，并初始化示例日程数据。 |
| **Cells 11–36** | **阶段一：DSPy 声明式流水线与自动优化** | **1. 签名定义（Cells 11–18）**：演示如何从自由文本输出演进到使用 `Literal` 枚举、`float` 与 Pydantic 可空字段定义 `ExtractEvent` Signature，并通过 `inspect_history` 观察底层生成的提示词。<br>**2. 模块组合（Cells 19–23）**：使用 `dspy.ChainOfThought` 串联 `ExtractEvent` 与 `PickEmoji`，在 `UpdateCalendarFromEmail` 中结合 Python 条件分支判断何时调用日历写入接口。<br>**3. GEPA 自动提示优化（Cells 24–33）**：将 50 封邮件按 `seed=0` 划分为 30 条训练集与 20 条测试集，定义精确匹配日期、开始时间与时长的评测指标（Metric），运行 `dspy.GEPA` 让反思模型自动演化出更精准的指令，使轻量级模型在测试集上逼近大模型表现。<br>**4. 动态 Agent 模块（Cells 34–36）**：展示 `dspy.ReAct` 如何自主调用日历查询与修改工具，以及 `dspy.RLM`（Recursive Language Model）如何通过编写程序在整批邮件中检索特定主题事件。 |
| **Cells 37–56** | **阶段二：LangGraph 显式状态图** | **1. 状态与节点（Cells 37–44）**：定义共享 `State`（TypedDict）与结构化输出模型 `EventDetails`，将每个处理步骤封装为读取并更新状态的图节点（Node）。<br>**2. 条件边与分支路由（Cells 45–52）**：通过 `add_conditional_edges` 显式声明控制流——当提取出的日程包含完整名称、日期与开始时间时路由至 `pick_emoji` 与 `add_event` 节点，否则直接跳转至 `END`，并可视化整张状态图。<br>**3. 预构建 Agent（Cells 53–56）**：演示如何使用 `langchain.agents.create_agent` 将日历函数列表快速组装为交互式工具调用 Agent。 |
| **Cells 57–69** | **阶段三：Temporal 持久化编排与容错恢复** | **1. 工作流与活动分离（Cells 57–62）**：将包含网络 I/O 和大模型调用的操作封装为 `@activity.defn`（`extract_event`、`pick_emoji`、`add_calendar_event`），将确定性的编排逻辑封装为 `@workflow.defn`，提交至 Temporal Worker 执行。<br>**2. 局部故障自动重试（Cells 63–65）**：注入一个前两次必定抛出异常、第三次才成功的故障版 `pick_emoji` Activity，配合 `RetryPolicy` 验证 Temporal 如何在不重新执行前序邮件提取的情况下仅重试失败步骤。<br>**3. 跨进程崩溃恢复（Cells 66–69）**：启动一个包含 `asyncio.sleep(20)` 耐久计时器的提醒工作流，在第 10 秒时强行终止本地 Worker 进程；重新启动 Worker 后，观察 Temporal 如何根据服务端保存的事件历史（Event History）无缝重放并完成后续提醒。 |

### 延伸思考与工程对照

对比这两套代码时，可以重点思考以下三个工程问题：
1. **控制权与可调试性**：对比你在 HW1 中手写的 `while` 循环、LangGraph 的显式状态边，以及 DSPy 的声明式模块，哪一种方式最容易排查“模型漏传参数”或“死循环调用同一工具”？
2. **评测指标对优化方向的牵引**：在 Notebook 第 27 单元格中，GEPA 的评测函数校验了 `date`、`start` 和 `duration`，但并未校验 `event_name`。如果直接将该评测函数用于生产优化，可能会带来什么隐患？
3. **重放确定性与外部副作用**：Temporal 能够在进程崩溃后恢复状态，前提是工作流代码本身是确定性的，且已成功执行的 Activity 结果会被直接复用。但如果某个 Activity 在写入外部日历后、向 Temporal 返回确认前发生了网络断开，重试机制会导致什么后果？如何在业务层实现真正的幂等（Idempotency）？
