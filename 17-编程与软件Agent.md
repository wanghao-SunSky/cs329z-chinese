# 第 17 讲｜编程与软件 Agent

如果问过去两年里，AI Agent 在哪个垂直领域率先走出了实验室、真正成为了全球数百万专业人士每天离不开的生产力工具，答案毫无疑问是**软件工程与编程（Coding & Software Engineering）**。

为什么软件工程成了 Agent 最理想的突破口？一方面，代码库和命令行终端构成了一个天然数字化、工具完备的环境；另一方面，软件工程拥有极其强大的**客观可验证反馈信号**——代码能不能编译通过、静态类型检查报不报错、单元测试（Unit Tests）和集成测试能不能跑通，全都有确定性的环境反馈，这让 Agent 能够真正形成“定位问题 $\to$ 修改代码 $\to$ 运行测试 $\to$ 根据报错修正”的自主闭环。

本讲将深入剖析现代**编程与软件智能体（Coding & Software Agents）**的端到端工作原理：对比三大代表性架构——**SWE-agent**（开创性的 Agent-计算机接口 ACI）、**Claude Code**（极简工具与终端原生长程协作）以及 **OpenHands**（事件流驱动的全栈容器开发平台）；探讨为什么脚手架（Scaffolds）中的每一项细节都是关键的工程决策；结合 **SWE-bench** 审视四元组评测框架在真实开源仓库修复中的落地；并展望软件开发工程范式的未来演进。

## 学习目标

- 理解端到端编程 Agent 从理解需求/Issue、代码库探索定位、编辑修改到运行测试验证的完整工作循环。
- 深入掌握 **Agent-计算机接口（ACI: Agent-Computer Interface）** 的设计哲学，对比剖析 SWE-agent、Claude Code 与 OpenHands 三大主流架构的工程权衡。
- 理解脚手架设计决策（工具粒度、文件编辑格式、终端状态持久性、长程上下文压缩与跨会话进度交接）对编码表现的决定性影响。
- 掌握 SWE-bench 基准的四元组结构（Request、Environment、Stopping Criteria、Scorer）及其防泄漏与测试验证机制。

## 知识讲解

### 1. 从需求到修改和验证

#### 端到端 coding agent

早期的代码生成工具（如第一代 GitHub Copilot）本质上是光标处的“自动补全（Autocomplete）”：人类程序员负责找对文件、定位到具体函数、想好架构，模型只负责续写接下来的几行代码。

而一个**端到端编程智能体（End-to-End Coding Agent）**面对的输入直接是一个仓库级的自然语言需求或 Bug 报告（例如一条真实的 GitHub Issue：“当传入空的 DataFrame 且设置了 `multi_index=True` 时，`groupby.agg()` 抛出 `KeyError`”）。为了独立解决这一问题，Coding Agent 必须自主完成五个紧密衔接的阶段：
1. **代码库探索与故障定位（Exploration & Localization）**：在包含成百上千个文件的陌生代码库中，利用目录浏览、关键词搜索（`grep` / `ripgrep`）或符号跳转，找出与 Issue 相关的核心源文件与测试文件；
2. **故障复现（Reproduction）**：编写或运行一段最小复现脚本/测试，亲眼观察报错堆栈，确认自己真正抓住了病因；
3. **代码编辑与补丁生成（Editing & Patching）**：在保持原有代码风格与上下文缩进正确的前提下，跨一个或多个文件实施精准修改；
4. **测试验证与迭代修复（Verification & Iteration）**：运行复现测试与相关回归测试套件；若测试失败或引入了语法错误，根据编译器/测试报错信息迭代修改代码；
5. **生成干净补丁并提交（Submission）**：检查 `git diff` 确认未残留临时调试文件或无关改动，输出最终代码补丁（Patch / Pull Request）。

#### SWE-agent 架构

如果直接把标准的 Linux Bash 终端和 `vim` 编辑器原封不动地交给大语言模型，会发生什么？模型很容易在非交互式管道里调出卡死的交互式命令，或者用 `cat` 一次性打印出一万行源码瞬间撑爆上下文窗口，抑或在用 `sed` 替换代码时因为引号转义和行号偏移把整个文件改坏。

普林斯顿大学在 **SWE-agent（Yang et al., 2024）** 中提出了一个极具洞察力的核心概念——**智能体—计算机接口（ACI: Agent-Computer Interface）**：
> 正如人类程序员需要图形界面（GUI）或精心设计的 IDE（人机交互 HCI）才能高效工作一样，以大语言模型为核心的 Agent 也有其独特的感知与认知脾气，需要专门为 LM 量身定制一套 **ACI 接口**！

SWE-agent 的 ACI 设计体现在三个关键细节上：
- **带滑动窗口的文件查看器（Windowed File Viewer）**：不让模型直接 `cat` 整个大文件，而是提供 `open <path> [<line_number>]`、`scroll_down`、`scroll_up`，每次只展示约 100 行带行号的代码窗口，并在顶部提示文件总行数与当前所处位置；
- **内置语法检查的受控编辑命令（Linter-gated Edit）**：提供 `edit <start_line>:<end_line> <<EOF ... EOF`。最绝妙的设计在于：每当模型执行一次 `edit`，**ACI 会在底层自动立即运行语法检查器（Linter，如 `flake8`）**！如果模型这次修改漏了一个冒号或缩进错了一格导致语法错误，ACI 会**直接拒绝写入该次修改**，并把清晰的语法报错行号立即反馈给模型要求重改，从而彻底杜绝了“一步语法改错导致后续十步全面崩溃”的雪崩效应；
- **精简高信噪比的搜索输出**：定制 `search_dir` 与 `find_file`，当匹配结果过多时自动提示模型缩小搜索词，而不是把几千条无用匹配全倒进上下文。消融实验证明，在同一底座模型下，精心设计的 ACI 能将 SWE-bench 解决率比原生 Bash 提升数倍。

#### Claude Code 架构

随着新一代前沿大模型自身对长上下文与原生工具调用的掌握越来越强，**Claude Code（Anthropic, 2025）** 展示了另一种极具代表性的现代架构哲学——**“极简原子工具 + 终端原生协作（Minimalist Tools & Terminal-Native）”**：
1. **克制而正交的工具原语**：不堆砌几十个复杂的专用封装命令，而是提供少数高正交性的核心工具——文件读取（`View`/`Read`）、高精度字符串替换编辑（`Edit`，通过匹配唯一旧代码块替换为新代码块，彻底避免了模型数错行号的问题）、全文件写入（`Write`）、高速模式搜索（`Glob` / `Grep`）以及直接执行测试与构建的 `Bash` 工具；
2. **项目级持久指令与记忆（`CLAUDE.md`）**：通过读取代码库根目录或子目录下的 `CLAUDE.md` 文件，自动加载项目的构建命令、测试运行方式、代码规范与架构约定；
3. **子智能体上下文隔离（Sub-agents for Exploration）**：当需要跨大量文件做探索性搜索时，派生只读子 Agent 去翻找代码，只将精简结论汇回主会话，保持主编码上下文干净聚焦；
4. **分层权限与人机共驾**：文件读取与搜索默认放行，文件修改与 Shell 命令执行支持按目录、按命令前缀精细配置授权，支持开发者随时在终端里观察 diff、打断引导或切换至“先规划再执行（Plan Mode）”。

#### OpenHands 架构

作为开源软件工程 Agent 平台的标杆，**OpenHands（原 OpenDevin, Wang et al., 2025）** 则采用了**事件流驱动的客户端—沙箱分离架构（Event-Stream & Sandboxed Runtime Architecture）**：
- **核心中枢是不可变的事件流（Event Stream）**：Agent、工具环境（Runtime）与用户界面之间全部通过结构化的 Action 和 Observation 事件通信；
- **全功能持久化容器沙箱**：每个会话运行在独立的 Docker 容器中，内部同时集成了持久化的 Bash 终端会话（通过 `tmux` 保持工作目录与虚拟环境状态）、Jupyter IPython 内核（支持 CodeAct 交互式执行 Python 代码块）以及无头浏览器（Headless Browser，支持前端页面渲染检查与网页查阅）；
- **多 Agent 委派与卡死检测**：支持主 Agent 将特定子任务委派给专职的浏览或验证 Agent，并在运行底座层内置循环检测器，防止在失败命令上无限空转。

### 2. Scaffold、基准与未来

#### Scaffolds as design decisions

对比 SWE-agent、Claude Code 与 OpenHands 可以看清一个核心工程事实：**包裹在模型外层的脚手架（Scaffold / Harness）绝不是无关紧要的胶水代码，其中的每一处设计都是直接决定成败的架构决策**。

在设计或优化一个 Coding Agent 的 Scaffold 时，工程师需要重点权衡以下五个具体问题（Anthropic《Effective Harnesses for Long-Running Agents》, Young, 2025）：
1. **文件编辑接口怎么设计（Line-based vs. Search-Replace vs. Full Rewrite）**？按行号替换容易因模型数错行号而破坏相邻代码；全文重写在几千行的大文件上既贵又容易漏代码；而**要求模型提供足够长且唯一的原始上下文代码段（Old String）进行精确匹配替换（New String）**，配合保存前的自动语法校验，是目前最稳健的工程实践。
2. **Shell 状态是否持久**？独立子进程简单无副作用，持久会话保留环境变量但需防进程卡死。
3. **测试输出如何防爆窗**？运行一次全量 `pytest` 可能打印出几万行通过日志和几百行堆栈，必须对终端输出做智能首尾保留或按需查询（Observation Masking）。
4. **长周期任务如何跨上下文窗口交接（Multi-Window Handover）**？当一个大型软件开发任务跨越几十个小时、经历多次上下文窗口重置时，单靠模型记忆是不够的。最佳实践是将其拆分为**初始化智能体（Initializer Agent，负责搭建环境、编写功能特性清单 `feature_list.json` 与进度日志 `claude-progress.txt` 并做初始 Git 提交）**与**增量编码智能体（Coding Agent，每次新会话启动先读进度文件与 `git log`，每次只专注完成并测试一个原子特性，提交干净的 Git commit 并更新进度文件）**。

#### SWE-bench 的四元组

我们如何客观评测上述各种编程 Agent 的真实水平？普林斯顿提出的 **SWE-bench（Jimenez et al., 2024）** 及其人工精选验证子集 **SWE-bench Verified** 是目前公认的行业黄金标准。如果用第 13 讲学习的**四元组框架**来拆解 SWE-bench，其结构极其清晰：

| 四元组组件 | SWE-bench 中的具体设计 |
|---|---|
| **1. Request（请求）** | 来自 GitHub 真实开源仓库（如 `django`、`scikit-learn`、`sympy`）的一条真实 **Issue 文本描述**（包含用户报告的现象或复现代码，不含对应的 Pull Request 讨论） |
| **2. Environment（环境）** | 一个精确回滚到该 Issue 被修复前那个历史 Commit（`base_commit`）的独立 Docker 容器，内含完整源码与配好的 Conda/虚拟环境（测试集答案与未来 Git 历史已被彻底剥离） |
| **3. Stopping Criteria（终止条件）** | Agent 自主提交最终的 `git diff` 补丁文件（`model_patch`），或达到最大交互轮数 / Token 费用 / 时间上限 |
| **4. Scorer（评分器）** | 将 Agent 生成的 `model_patch` 应用到干净仓库中，接着将真实人类开发者当年提交的 **黄金测试补丁（`test_patch`）** 应用上去并运行测试套件，必须同时满足两项硬指标：<br>• **`FAIL_TO_PASS`**：原本能复现该 Bug 的新增测试必须全部由失败变为通过（证明 Bug 真的修好了）；<br>• **`PASS_TO_PASS`**：原本就通过的存量回归测试必须全部保持通过（证明没有修好一个 Bug 却搞挂了其他功能）。 |

#### 软件开发的未来问题

随着 Coding Agents 从“解决单个独立 Issue”走向“跨多天自主开发完整系统”，软件工程正面临一系列深刻的开放问题：
- **从写代码转向写规格与写测试（Spec & Test Engineering）**：当生成代码的速度提升十倍时，工程瓶颈迅速转移到了“如何用无歧义的规格说明与严密的测试套件防止 Agent 引入隐蔽的架构债与安全漏洞”；
- **代码审查与人类心智模型同步（Code Review & Mental Model）**：如果 Agent 一夜之间生成了 5,000 行虽然能跑通测试但人类工程师从未读过的代码，后续系统的可维护性与事故责任该如何界定？设计支持高可读性分解、小步提交与可验证不变量的协作范式，是未来软件 Agent 的核心方向。

## 原课程阅读清单与导读

- [Yang et al. "SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering." NeurIPS (2024).](https://arxiv.org/abs/2405.15793)
  导读：重点阅读 ACI 的设计原则，对比带行号滑动窗口、自动 Linter 拦截编辑与原生 Bash 在错误率与定位效率上的消融实验。
- [Wang et al. "OpenHands: An Open Platform for AI Software Developers." ICLR (2025).](https://arxiv.org/abs/2407.16741)
  导读：理解事件流（Event Stream）与 Docker 沙箱运行时的解耦架构，以及如何统一支持代码执行、命令行与网页浏览。
- **拓展阅读**：[Anthropic. "Claude Code: Best Practices for Agentic Coding." (2025).](https://www.anthropic.com/engineering/claude-code-best-practices)
  导读：掌握 `CLAUDE.md` 上下文配置、“先探索、再规划、后编码验证（Explore, Plan, Code, Commit）”的工作流以及测试驱动开发（TDD）在 Agent 编程中的实战技巧。
- **拓展阅读**：[Young. "Effective Harnesses for Long-Running Agents." Anthropic (2025).](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
  导读：精读跨多个上下文窗口的长周期编码 Agent 为什么容易“过早宣布完成”或留下半拉子状态，以及如何通过 `feature_list.json`、进度日志与 Git 提交契约实现可靠的跨会话接力。
- **拓展阅读**：[Jimenez et al. "SWE-bench: Can Language Models Resolve Real-World GitHub Issues?" ICLR (2024).](https://arxiv.org/abs/2310.06770)
  导读：理解 SWE-bench 的任务采集过滤管线以及 `FAIL_TO_PASS` / `PASS_TO_PASS` 双重测试验证机制。

## 动手练习

1. **ACI 文件编辑工具对比设计**：编写两个供 Agent 修改本地代码文件的工具函数：（a）按行号区间替换 `edit_by_lines(path, start_line, end_line, new_text)`；（b）按唯一原文本块匹配替换 `edit_by_match(path, old_str, new_str)`，并在写入后自动调用 `ast.parse()` 检查 Python 语法合法性（若语法错误则回滚并返回报错行）。在一段 200 行的代码文件上模拟连续两次修改，分析为什么方案（b）加语法门禁能显著减少连续编辑事故。
2. **微型 SWE-bench 任务构造与验证**：在一个包含 3 个文件的小型 Python 项目中植入一个真实的边界条件 Bug（例如除零或时区偏移错误），编写对应的 Issue 描述（`Request`）、一个在修复前必定失败的 `FAIL_TO_PASS` 单元测试以及三个存量的 `PASS_TO_PASS` 回归测试，并用你的 Agent 走完“搜索定位 $\to$ 运行测试复现 $\to$ 修改代码 $\to$ 验证通过”的完整闭环。
