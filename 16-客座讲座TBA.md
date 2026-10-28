# 第 16 讲｜专题研讨：复合 Agent 系统架构复盘

在原课程安排中，本讲为面向业界前沿实践的机动客座讲座（Guest Lecture）。借此承上启下的节点，我们将前十五讲所建立的**系统架构（System）**、**数据飞轮（Data）**与**评测与安全（Evals & Safety）**三大支柱串联起来，进行一次全局性的工程复盘，梳理在从零设计、调试与交付一个复合 Agent 系统时的核心决策清单与故障排查框架，为接下来最后三讲（编程 Agent、主动式 Agent 与前沿开放问题）以及期末系统交付做好准备。

## 学习目标

- 将前十五讲的核心组件（模型底座、RAG 检索、工具协议、编排框架、上下文与记忆、多 Agent 协作、提示与权重优化、基准评测与安全护栏）整合为统一的工程全景图。
- 掌握从零启动一个 Agent 工程项目时的五步架构选型决策矩阵，避免过度设计与盲目堆砌复杂组件。
- 建立跨层级的端到端系统故障诊断方法论，能够快速定位并修复线上复杂轨迹中的瓶颈。

## 知识讲解

### 1. 已知范围与占位

#### 主题 TBA

在课程大纲中，本课时预留为客座专题研讨（Guest Lecture, TBA）。为了使学习路径完整连贯，下面我们围绕全课程的三大工程支柱，系统提炼一套可直接用于课程项目（Course Project）与生产系统设计的**复合 Agent 架构师检查清单（Architect's Checklist）**。

### 2. 三大支柱的工程闭环与选型矩阵

当我们面对一个真实的业务或研究问题时，切忌一上来就拉起三四个多智能体群聊或盲目微调模型权重。一个成熟的 Agent 工程师会按照以下五个递进层级做出架构选型：

| 决策阶段 | 核心工程问题 | 默认首选方案（Keep It Simple） | 何时升级到更复杂方案（Upgrade Trigger） |
|---|---|---|---|
| **1. 控制流选型** | 谁来决定下一步？（Workflow vs. Agent） | 步骤固定、分类明确的任务，优先采用 **Prompt Chaining / Routing / Parallelization** 等确定性工作流 | 任务需要根据环境反馈做多轮未知探索（如排查未知代码故障、多跳动态检索）时，才引入 **ReAct / CodeAct** 循环 |
| **2. 知识与工具接入** | 如何补充外部信息与行动能力？ | 优先使用 **BM25 + 稠密向量混合检索（RRF）**；工具集保持极简正交（如遵循 MCP 标准协议） | 单次检索召回不足时升级为带跳数限制的 **Agentic RAG** 或引入 **ColBERT / Cross-Encoder 重排** |
| **3. 上下文与记忆治理** | 如何应对长周期与跨会话状态？ | 维护不可变的 **Event Log**，结合低成本的 **Observation Masking** 截断陈旧巨型输出，保持前缀稳定以复用 KV Cache | 超出窗口预算时触发结构化 **Compaction**；需要跨会话延续偏好或技能时引入 **Mem0 / MemGPT / Skill Files** |
| **4. 单智能体 vs. 多智能体** | 是否需要拆分多个角色？ | 永远先构建并压榨 **强单 Agent 基线（Strong Single-Agent Baseline）** | 仅当子任务天然可解耦并行、或需要严格的上下文隔离（Sub-agents）且实测收益大于协调成本时，才引入 **Orchestrator-Workers + Task Ledger + Worktree 隔离** |
| **5. 系统优化路径** | 如何提升最后一公里准确率与性价比？ | 先冻结评测指标，使用 **DSPy Bootstrapping / MIPROv2 / GEPA** 优化少样本示范与提示词 | 当提示优化触及天花板、或需将大模型能力蒸馏至低延迟小模型时，才开展轨迹 **SFT / GRPO / 在线策略蒸馏** |

### 3. 端到端系统故障诊断树

当你的 Agent 在评测集或线上运行中出现失败时，可按照以下五步诊断树由外向内快速定位根因：

1. **检查评测器与环境（Is the Eval Broken?）**：打开完整 Transcript，确认是不是因为测试环境未重置、外部依赖波动，或者 Verifier 正则断言过于死板（False Negative）冤枉了合理的解法。
2. **检查感知与检索层（Did it Find the Right Context?）**：如果答案错误，先看所需的正确文档或邮件是否出现在了 `search` 工具的返回结果中（排查检索端 Recall Ceiling），还是虽然检索出来了却因上下文太长被模型忽略（排查阅读端 Lost in the Middle）。
3. **检查工具契约与执行层（Did the Tool Call Succeed?）**：检查是否存在 JSON 协议截断、参数类型不匹配、或是工具返回了不透明的错误码导致模型在同一条失败命令上死循环重试。
4. **检查长程状态与记忆层（Did Context Drift or Conflict Occur?）**：在 10 轮以上的长任务中，检查是不是 Compaction 摘要丢掉了第 1 轮的用户硬约束，或者是跨会话记忆同时返回了相互矛盾的新旧数据。
5. **检查安全与人机边界（Did it Violate Policy or Act Without Clarifying?）**：检查 Agent 是否在信息模糊时盲目猜测而非调用 `ask_user`，或者是否被外部文档中的间接提示注入带偏了执行方向。

## 原课程阅读清单与导读

本讲无新增必读论文。建议结合前十五讲的核心阅读材料，重点复盘以下三篇贯穿全课程方法论的基石文献：
- [Zaharia et al. "The Shift from Models to Compound AI Systems." BAIR Blog (2024).](https://bair.berkeley.edu/blog/2024/02/18/compound-ai-systems/)
- [Schluntz & Zhang. "Building Effective AI Agents." Anthropic (2024).](https://www.anthropic.com/engineering/building-effective-agents)
- [Grace et al. "Demystifying Evals for AI Agents." Anthropic (2026).](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

## 动手练习

1. **课程项目架构全链路自检**：对照本讲的“五步架构选型矩阵”与“端到端故障诊断树”，审查你正在构建的课程项目或 HW1/HW2 系统：（a）列出你系统中每一个组件的选型理由及对应的强基线；（b）从最近的运行日志中抽取出 3 条真实失败轨迹，按五步诊断树定位根因并写出对应的修复实验方案。
