# 第 06 讲｜Agent 设计模式与上下文管理

软件工程大师 Martin Fowler 在《企业应用架构模式》中曾说：“设计模式都是半成品——这意味着你永远必须根据自己的具体环境亲手完成并调适它们。”在构建 AI Agent 系统时更是如此。

很多初学者在接触 Agent 开发时，容易走向两个极端：要么不管什么任务都套一个无限自由的 ReAct 循环，结果在简单任务上既慢又贵还不稳定；要么把所有历史对话和成百上千行工具输出原封不动地往上下文里塞，导致几轮之后上下文膨胀腐化（Context Rot）、模型彻底迷失方向。本讲将系统梳理经过工业界验证的三大类设计模式：**五大可组合的工作流模式（Workflow Design Patterns）**、**推理与行动模式（Reasoning & Acting Patterns：ReAct、Reflexion、CRITIC、CodeAct、ReWOO、LLMCompiler）**，以及**长程上下文管理模式（Context Management Patterns：持久化事件日志、记忆卸载、上下文压缩、观测屏蔽、上下文隔离与渐进式披露）**，并通过极简编码底座 **Pi** 的案例剖析这些模式如何在生产系统中协同运作。

## 学习目标

- 熟练掌握五种基础工作流设计模式（Prompt Chaining、Routing、Parallelization、Orchestrator-Workers、Evaluator-Optimizer）及其组合方式（如 STORM 与 Archon）。
- 深入对比 Agent 推理与行动模式：理解 ReAct、Reflexion 与 CRITIC（工具辅助验证）的边界，掌握 CodeAct（以代码作为动作空间）以及 ReWOO / LLMCompiler（规划与并行执行分离）的机制与权衡。
- 掌握上下文工程的两大核心原则（保持聚焦 Focus 与维持连续性 Continuity），熟练运用五种上下文管理模式控制长任务窗口。
- 通过 Pi Agent Harness 的真实架构案例，分析极简工具集、树形上下文、技能渐进披露与安全边界的工程取舍。

## 知识讲解

### 1. 模式与五类 workflow

#### 模式是可组合的选择

在设计复合 AI 系统时，第一道架构选择题永远是：**控制流（Control Flow）应该放在哪里？**

| 维度 | 工作流（Workflows） | 自主智能体（Agents） |
|---|---|---|
| **控制流主导者** | **程序代码（Code）** | **大语言模型（LLM）** |
| **动态适应方式** | 沿着预先编程写好的分支、路由与固定循环执行 | 根据每一步的环境观测（Observations）自主决定下一步动作 |
| **最佳适用场景** | 结构清晰、步骤可重复、需要高度可预测性的任务 | 路径无法预先穷举、需要多轮探索与灵活应变的开放任务 |
| **典型实例** | 客服工单分类 $\to$ 检索对应政策 $\to$ 生成回复草稿 | 使用终端与搜索工具自主排查并修复未知线上 Bug |

在真实生产系统中，Workflow 与 Agent 并非非此即彼，而是像乐高积木一样相互嵌套组合。Anthropic（Schluntz & Zhang, 2024）将最核心的复合工作流归纳为五种基础设计模式。

#### Prompt chaining

**提示链（Prompt Chaining）** 将一个复杂的宏大任务拆解为一系列按固定顺序执行的子步骤（$\text{LLM}_1 \to \text{Gate} \to \text{LLM}_2 \to \text{LLM}_3$），每一步只专注于一件清晰的小事，并在步骤之间插入确定性的**程序校验门（Programmatic Gate）**。
- **典型场景**：先生成技术文档大纲 $\to$ 检查大纲是否覆盖必选章节 $\to$ 按大纲逐节撰写正文 $\to$ 将正文翻译为目标语言。
- **工程权衡**：通过增加串行调用的延迟（Latency），换取了每一步更高的准确率与可检查性；但若缺乏有效的中间校验门，前一步的错误会直接向下游传递。

#### Routing

**路由模式（Routing）** 先用一个分类器或轻量级模型判断输入请求的类型，再将其分发到专门定制的下游处理分支（不同的提示词、不同的工具集或不同尺寸的模型）。
- **典型场景**：将客户咨询路由到“退款售后”、“技术故障排查”或“常见 FAQ”三个不同分支；或者将简单问题路由给便宜快速的轻量级模型，将困难的数学/编程问题路由给高阶推理模型。
- **工程权衡**：实现了关注点分离（Separation of Concerns）并显著优化整体成本，防止单一提示词在兼顾几十种不同规则时顾此失彼。

#### Parallelization

**并行化模式（Parallelization）** 将工作分发到多个并发线程同时执行，最后由聚合器（Aggregator）汇总结果，主要包含两种形态：
1. **分片并行（Sectioning）**：将一个任务拆分为彼此独立的子方面同时处理。例如，一个线程调用模型生成用户回复，另一个并发线程同时审查该请求是否触发安全护栏（Guardrails）；或者用多个线程并发评估一份代码的不同维度。
2. **投票聚合（Voting）**：对同一个输入并发运行多次采样或不同提示策略，通过多数投票或综合评判得出最终结论（如多次安全扫描或代码漏洞检查）。

#### Orchestrator–workers

**编排器—工作者模式（Orchestrator-Workers）** 由一个中央编排大模型（Orchestrator）根据当前具体输入，**动态拆解子任务**并委派给多个专长工作者模型（Workers）并行或串行处理，最后由编排器收集所有 Worker 的产出并合成为最终结果。
- **与分片并行（Sectioning）的关键区别**：Sectioning 的子任务拆分方式是由代码事先固定写死的；而 Orchestrator-Workers 的子任务数量和具体内容事先无法预知，必须由 Orchestrator 根据具体输入动态规划（例如修改一个跨多文件的软件特性，需要先由 Orchestrator 查看仓库结构，再动态决定派几个 Worker 去改哪几个文件）。

#### Evaluator–optimizer

**评估器—优化器模式（Evaluator-Optimizer）** 由两个角色组成闭环：生成模型（Generator）负责产出方案，评估模型（Evaluator）负责根据明确的标准给出具体的改进反馈（Feedback），生成器根据反馈迭代修正，直到通过评估或达到最大轮数。
- **生效的两个前提条件**：（1）任务具有清晰、可明确表述的评价标准；（2）评估器确实有能力识别出缺陷，且生成器确实能够根据该反馈改好。

### 2. 组合模式与推理行动

#### STORM 与 Archon

真实的复杂系统往往是上述五种基础模式的有机组合：
- **STORM（Shao et al., 2024，斯坦福自动化维基百科长文生成系统）**：巧妙融合了多种工作流模式——先通过 **Orchestrator-Workers / Parallelization** 检索相关主题并生成多个不同视角的专家角色（Personas）；再让每个专家视角与检索源展开多轮问答访谈（近似 **Evaluator-Optimizer** 式的追问循环）；最后通过 **Prompt Chaining** 将访谈记录依次整理为大纲、分节草稿并合成为带引用的完整综述长文。
- **Archon（Saad-Falcon et al., 2024）**：进一步将生成、采样、重排（Reranker）、融合（Fuser）、验证（Critic）等推理时组件抽象为模块化图层，通过架构搜索在给定算力预算下自动寻找最优的复合推理架构。

#### ReAct

当任务无法用预先固定的工作流覆盖，必须让模型自主与环境交互时，我们便进入了 **Agent 推理与行动模式（Reasoning & Acting Patterns）**。其中最经典的基石正是 **ReAct（Yao et al., 2023）**：让模型在采取外部行动（Act）之前先输出显式的内部思考（Reason/Thought），再根据环境返回的观测（Observe）更新认知并决定下一步。原始论文的一个重要实验发现是：将 ReAct 与思维链结合、尤其是**使用 ReAct 格式的成功轨迹对模型进行微调（Finetuning）**后，性能会获得质的飞跃——如今，在后训练（Post-training）阶段使用工具轨迹微调模型已成为所有主流大模型的标准工序。

#### Reflexion

当 ReAct 循环在一次尝试（Trial）中失败时，**Reflexion（Shinn et al., 2023）** 引入了跨尝试的语言强化学习机制：
1. **Actor（行动者）** 在环境中执行轨迹；
2. **Evaluator（评估器）** 对轨迹结果打分（如单元测试是否通过、任务是否成功）；
3. **Self-Reflection（自我反思模型）** 将失败轨迹与外部评估信号转化为一段具体的自然语言经验教训（例如*“上次失败是因为我在未检查数组为空的情况下直接取了索引 0，下次应先加长度判断”*），追加到短期情景记忆中，指导 Actor 开展下一轮尝试。

消融实验清晰地证明：真正带来跨轮次准确率跃升的是**由 LLM 提炼出的反思总结（Reflection）**，而不仅仅是把上次失败的原始长轨迹塞回上下文。

#### 自我批评的局限与 CRITIC

既然反思有用，那我们能不能在没有任何外部环境反馈的情况下，单纯让大模型自己反问自己“你确定吗？请检查并修正你的答案”？

Huang et al.（2024）等研究揭示了**无外部证据的内省自我修正（Intrinsic Self-Correction）的重大局限**：当没有外部工具或真实验证器提供新信息时，让模型盲目自我批评往往会导致性能下降——因为模型很容易发生动摇，把原本正确的答案改成了错误答案！

为了解决这一问题，**CRITIC（Gou et al., 2024）** 提出了**工具交互式批评（Tool-Interactive Critiquing）**：验证器（Verifier/Critic）不再靠空想挑刺，而是调用外部工具（如代码解释器运行代码、搜索引擎核查事实、计算器验算公式），拿到客观的外部工具反馈后再指导模型修正。这一对比给出了明确的工程准则：**自我反思必须建立在外部环境或确定性工具提供的真实反馈信号之上**。

#### CodeAct

在传统的工具调用中，模型每次输出一个 JSON 对象调用一个函数。但设想这样一个任务：
> “请比较智能手机型号 `CodeAct 1` 在美国、日本、德国和印度四个国家的税后折合美元售价，找出最划算的国家。”

如果使用 **JSON Actions**，模型必须一轮一轮地调用 `get_price`、等待返回、再调 `get_tax`、再调 `convert_currency`，4 个国家乘上 3 个步骤需要来回交互十几个回合，极其繁琐且缓慢。

**CodeAct（Wang et al., 2024）** 提出了一个核心洞见：**可执行代码（Python Code）才是表达复杂动作组合最自然、最强大的媒介！** 在 CodeAct 模式下，模型直接生成一段包含 `for country in ["USA", "Japan", "Germany", "India"]:` 循环、变量赋值与 `min()` 比较的 Python 脚本，在沙箱中一次性运行即可在 **1 个回合内**直接算出精确结果 `Japan 904.0`。实验证明，将代码作为动作空间不仅大幅减少了交互轮数与 Token 消耗，还凭借代码的控制流表达力显著提高了复杂任务的成功率。

### 3. 计划与执行分离

#### ReWOO

在标准 ReAct 中，模型每调一个工具，都要把越来越长的全部历史记录重新带入下一步推理。如果一个任务的各个检索或工具步骤在初期就是可以预见的，能不能把“规划”和“工具执行”彻底拆开？

**ReWOO（Reasoning WithOut Observation, Xu et al., 2023）** 设计了“先一次性规划，再批量执行，最后汇总求解”的三阶段架构：
1. **Planner（规划器）**：在不执行任何工具的情况下，直接输出一张带占位变量的完整执行计划图（例如：`Plan 1: 搜索某电影导演 -> #E1`；`Plan 2: 搜索 #E1 的出生年份 -> #E2`）；
2. **Worker（执行器）**：按依赖顺序逐一调用外部工具，将真实返回值替换进占位变量 `#E1`、`#E2` 中，期间完全不需要调用大模型；
3. **Solver（求解器）**：将原始问题与填好结果的证据变量一次性交给大模型得出最终答案。

通过避免在每个中间工具步骤重复Prefill长历史，ReWOO 大幅降低了 Token 开销（例如在 HotpotQA 上以明显更少的 Token 取得了更高的准确率）。

#### LLMCompiler

ReWOO 的静态计划一旦遇到“工具执行结果出乎意料、需要改变后续步骤”的情况就会卡壳。为此，**LLMCompiler（Kim et al., 2024）** 引入了类似现代编译器指令调度的三组件架构：
1. **LLM Planner**：将用户请求分解为带有显式依赖关系的有向无环图（DAG）任务流；
2. **Task Fetching Unit**：实时监测依赖图，只要哪些工具调用的前置依赖已就绪，就立即将它们**并发调度（Parallel Execution）**给 Executor 同时执行；
3. **Dynamic Replanning（动态重规划）**：当某一步执行结果需要进一步探索时，将中间状态反馈回 Planner 动态更新后续执行图。

#### 现代并行调用与选择

随着现代前沿大模型原生支持**并行工具调用（Parallel Tool Calling，即单次回复中同时发出多个独立的工具调用请求）**，简单的无依赖并发已无需额外部署复杂的编译器框架。但在子任务依赖关系复杂、或需要对子 Agent（Sub-agents）进行有向图编排时，ReWOO 与 LLMCompiler 的“显式规划 + 依赖感知并发调度”思想依然是降低端到端延迟的利器。

### 4. 长任务的 context patterns

#### Focus 与 continuity

当 Agent 执行长达数十步的复杂任务时，上下文管理（Context Management）决定了系统的生死。上下文工程遵循两条看似矛盾却必须同时满足的核心原则：
1. **保持聚焦（Focus the Context）**：上下文窗口里只保留当前手头任务真正需要的信息，避免海量过时的长日志造成上下文膨胀（Context Bloat）与注意力分散；
2. **维持连续性（Preserve Continuity）**：在裁剪上下文的同时，绝不能弄丢用户的初始目标、硬性约束、已确认的关键事实与当前任务进度；并且在物理层面上应尽量维持前缀稳定以复用 **KV Cache**。

为了同时实现聚焦与连续性，工程界提炼出了五种核心的上下文管理模式（它们彼此完全兼容，生产系统往往组合使用）。

#### Event log 与重建

**模式一：持久化事件日志（Persistent Event Log，以 OpenHands 为代表）**。
系统的真相之源（Source of Truth）是一个严格追加、永不篡改的底层事件日志（Immutable Append-only Event Log），完整记录每一次用户输入、模型输出与原始工具返回。而每次调用大模型时传入的 `messages` 列表，并不是底层日志本身，而是由上下文管理器（Context Manager）在每一步根据当前策略**从事件日志动态投影重建（Reconstructed）出来的视图**。这样既保证了审计与回放的绝对完整，又允许我们自由裁剪送给模型的上下文视图，还方便挂载外部监控钩子（Hooks）。

#### Memory offloading

**模式二：记忆卸载（Memory Offloading，以 MemGPT 为代表）**。
当发现某段重要信息（如中间查到的长篇参考资料或阶段性结论）暂时用不上、但未来可能还需要时，让 Agent 主动调用工具将其写入外部记忆存储或本地磁盘文件，随后即可安全地将其从宝贵的上下文窗口中修剪掉，待后续需要时再按需检索回来。

#### Compaction

**模式三：上下文压缩（Compaction）**。
当历史对话与动作序列累积过长时，调用大语言模型将早期的一连串“思考—行动—观测”压缩为一段高密度的结构化摘要（Summary），用这几百 Token 的摘要替换掉原本数万 Token 的早期历史。对于复杂任务，压缩过程本身甚至可以设计为一个专门检查“目标、约束、已完成项、待办项与关键证据路径”的子流程。

#### Observation masking

**模式四：观测屏蔽（Observation Masking）**。
在编程或数据分析 Agent 中，真正撑爆上下文窗口的往往不是模型的思考或工具调用指令，而是工具返回的**巨型观测输出（Observations）**——比如一次 `cat` 或测试运行打印出的几千行日志。

研究发现（JetBrains Research 等，2025），相比大费周章地用 LLM 对全部历史做自然语言摘要，一种极其简单、零模型开销且往往更有效的方法是**观测屏蔽（Observation Masking）**：保留历史中所有的模型思考（Thoughts）和工具调用指令（Actions），但将 N 步之前的旧工具观测输出直接截断或替换为一句简短的占位符（如 `[Observation from step 3 omitted (12,400 chars); key findings were used in step 4]`）。这样模型既清楚记得自己“做过哪些操作”，又不会被陈旧的巨型输出淹没。

#### Context isolation

**模式五：上下文隔离（Context Isolation / Sub-agents）**。
当主 Agent 遇到一个需要翻阅大量文件或多次试错的局部子任务（例如“在代码库里找出某个函数的定义位置”）时，不要在主 Agent 的上下文里直接展开这十几步搜索，而是派生一个拥有**独立全新上下文窗口的子智能体（Sub-agent）**去完成搜索；子智能体跑完十几步后，只把最终找到的几行结论返回给主 Agent，中间成千上万 Token 的搜索弯路随着子智能体销毁而彻底消失，丝毫不污染主上下文。

#### Progressive disclosure 与 skills

上下文隔离的另一个重要体现是**渐进式披露（Progressive Disclosure，以 Agent Skills 机制为代表）**。我们不需要在初始系统提示词里把几十种专业工作流的操作手册和参考脚本全文塞进去，而是只在初始提示中放入每项技能（Skill）的**简短名称与一行触发说明**；只有当 Agent 判断当前任务确实需要用到某项技能时，才按需读取对应的 `SKILL.md` 详细指令与附属资源文件。

### 5. Pi 案例

#### 小核心与四个工具

为了看清上述模式如何在真实系统中落地，我们以开源极简编程底座 **Pi（pi.dev）** 作为案例剖析。Pi 的设计哲学是：*“Pi 是一个极简的 Agent 底座。让 Pi 适应你的工作流，而不是反过来。”*

Pi 默认仅启用 4 个基础工具：**`read`（读文件）、`bash`（执行命令）、`edit`（修改文件）、`write`（写文件）**，系统提示词控制在 1,000 Tokens 以内。なぜ不提供专门的 `grep`、`find` 或 `git` 工具？因为它们全都是 `bash` 的子集，极简的工具列表彻底消除了工具膨胀（Tool Bloat）。

#### 树形会话、日志与扩展

在主循环与上下文管理上，Pi 采用了精巧的组合设计：
1. **ReAct JSON 循环 + 树形上下文**：每次交互以事件日志保存，并组织成一棵分支树（Tree），开发者随时可以回退到之前的某个对话分支尝试另一条解决思路；
2. **三层上下文管理**：结合了（a）从事件日志转换构建 LLM 输入、（b）通过 **Skill Files（技能文件）** 实现渐进式披露、以及（c）当窗口将满时触发 **Compaction（压缩）**。

#### 没有内建功能的取舍

同样耐人寻味的是 Pi **明确选择不内建（Deliberately Omitted）** 的功能：它没有内建子 Agent、没有计划模式（Plan Mode）、没有待办清单工具（To-do lists）、没有后台 Bash，甚至**没有内建权限确认弹窗（No Permission Checks）**——Pi 直接继承启动它的操作系统的用户权限运行。这种极致克制使它对高级开发者极其轻量透明、易于通过插件定制；但这也意味着如果在不可信输入或自动化评测中运行它，开发者必须自己在外部包裹容器或操作系统沙箱（如 Docker / `sandbox-exec`）来兜底安全边界。

## 原课程阅读清单与导读

- [Yao et al. "ReAct: Synergizing Reasoning and Acting in Language Models." ICLR (2023).](https://arxiv.org/abs/2210.03629)
  导读：对比 Reason-only、Act-only 与 ReAct 在知识密集型问答（HotpotQA）与决策环境（ALFWorld）上的表现差异，理解微调对固化 ReAct 模式的作用。
- [Schluntz & Zhang. "Building Effective AI Agents." Anthropic (2024).](https://www.anthropic.com/engineering/building-effective-agents)
  导读：重点阅读五种工作流模式（Prompt Chaining、Routing、Parallelization、Orchestrator-Workers、Evaluator-Optimizer）的适用准则，体会“尽可能保持设计简单，仅在必要时增加自主度”的工程原则。
- [LangChain. "Context Engineering." LangChain Blog (2025).](https://www.langchain.com/blog/context-engineering-for-agents)
  导读：系统梳理写入上下文（Write）、筛选上下文（Select）、压缩上下文（Compress）与隔离上下文（Isolate）的四维分类框架。
- **拓展阅读**：[Shinn et al. "Reflexion: Language Agents with Verbal Reinforcement Learning." NeurIPS (2023).](https://arxiv.org/abs/2303.11366)
  导读：分析 Actor、Evaluator 与 Self-Reflection 三组件的协作流程，注意外部环境反馈信号在防止盲目自省中的关键角色。
- **拓展阅读**：[Wang et al. "Executable Code Actions Elicit Better LLM Agents." ICML (2024).](https://arxiv.org/abs/2402.01030)
  导读：对比 CodeAct 与传统 JSON / 文本动作格式在多工具组合控制流、交互轮数及任务成功率上的定量差异。

## 动手练习

1. **工作流与 Agent 架构选型**：针对“读取用户提交的报销单 PDF，核对公司差旅制度，计算各项汇率转换，并生成审批结论与财务入账条目”这一需求，设计一套结合 **Routing + Parallelization + Evaluator-Optimizer / CodeAct** 的混合系统图，说明每一步为什么选择固定工作流或动态 Agent。
2. **Observation Masking 与 Compaction 对比实现**：构造一段包含 15 轮工具调用的模拟长轨迹（其中第 2 轮和第 5 轮包含长达 20,000 字符的文件列表输出，第 1 轮包含用户的预算硬约束）。编写一个上下文投影函数，结合“保留最近 3 轮完整输出 + 对更早的超大工具输出执行 Observation Masking + 超出 4,000 Tokens 时触发摘要 Compaction”，验证最终生成的 `messages` 既严格满足 Token 预算，又不丢失第 1 轮的预算约束（直接衔接 HW1 第 10–11 题）。
