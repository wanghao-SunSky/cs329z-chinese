# 第 08 讲｜多 Agent 系统

当单个 Agent 在面对复杂庞大的工程任务（比如同时维护一个大型代码仓库的前端、后端与测试套件，或者从零编写一个完整的 C 语言编译器）感到力不从心时，一个自然的想法是：**“三个臭皮匠，顶个诸葛亮”——能不能让多个不同角色的 Agent 组成团队协同作战？**

近年来，多智能体系统（Multi-Agent Systems, MAS）频频登上技术头条，但也伴随着大量盲目堆砌角色的噱头。在实际工程中，把一个任务拆给 5 个 Agent 互相聊天，往往不仅使 Token 成本暴增数倍，还可能因为沟通断层、目标冲突或相互带偏，导致最终表现还不如一个配置得当的单 Agent！本讲将用严谨的工程视角拆解多 Agent 系统：何时应当坚持单 Agent 基线、何时值得引入多 Agent；如何设计编排拓扑（Independent、Centralized、Decentralized Swarm、Hybrid 与动态组队 DyLAN）、通信通道（AutoGen 会话、Handoff 与 Agent-as-Tool、共享信息板与 Google A2A 协议）以及协调基础设施（任务账本 Task Ledger、G-Memory 与 Git Worktree 隔离）；最后结合 Cemri et al.（2025）与 CooperBench 的实证研究，深入剖析多 Agent 系统为什么会失败。

## 学习目标

- 理解单智能体系统（SAS）与多智能体系统（MAS）的收益与代价边界，掌握“先建立强单 Agent 基线，再按需引入多 Agent”的工程原则。
- 掌握四种核心多 Agent 编排拓扑（独立聚合、中心化编排器、去中心化蜂群、混合架构）及动态团队选择算法（DyLAN）的机制与成本规律。
- 严格区分**通信（Communication，如何交换信息）**与**协调（Coordination，如何管理相互依赖的工作）**，掌握 Handoff 与 Agent-as-Tool 的控制权差异及 Google Agent2Agent（A2A）协议。
- 掌握三大协调基础设施（任务账本 Task Ledger、多智能体共享图记忆 G-Memory、Git Worktree 工作区隔离）与三种协作模式（角色分工、资源划分、计划协商）。
- 能够运用 MAST 三层失效分类法诊断多 Agent 故障，理解“协调诅咒（Curse of Coordination）”、群体趋同（Conformity）及大规模去中心化协作的成功要素。

## 知识讲解

### 1. 多 Agent 的收益与代价

#### 系统定义

沿着我们在课程中反复使用的系统复杂度光谱：**单个模型（Model）$\to$ 固定工作流（Workflow）$\to$ 单智能体（Single Agent，如实现单个功能特性）$\to$ 多智能体系统（Multi-Agent System，如维护整个大型软件仓库）**，多智能体系统位于复杂度的最右端。

从定义上看，**多智能体系统（MAS）是由多个围绕共同目标协同工作的 Agent 组成的集合**。要让多个 Agent 真正形成合力而非一盘散沙，架构师必须同时设计好三个核心维度：
1. **编排拓扑（Orchestration）**：谁来分派任务、按什么拓扑结构组织团队；
2. **通信机制（Communication）**：Agent 之间通过什么通道、按什么格式交换消息与产物；
3. **协调设施（Coordination）**：如何管理共享工作区、任务依赖、共同记忆与操作冲突。

#### 为什么可能更好

为什么在某些场景下，多 Agent 系统能够超越单 Agent？核心收益来自四个方面：
- **并行执行（Parallel Execution）**：当一个大任务可以被拆解为多个相互独立的子任务时，多个 Agent 同时开工能显著缩短端到端墙钟时间（Wall-clock Time）；
- **职责专业化（Specialization）**：可以为不同角色配置专门定制的系统指令、不同尺寸/专长的底层模型以及最小化的专属工具集（例如让擅长视觉的模型负责前端 UI 检查，让擅长推理的模型负责后端逻辑）；
- **聚焦的独立上下文（Focused Context）**：每个 Agent 的上下文窗口里只包含与自己子任务直接相关的信息，避免单窗口被所有子任务的冗长中间过程撑爆；
- **更广的探索覆盖（Broader Exploration）**：多个 Agent 可以同时从不同假设或不同技术路线出发探索解法，降低单路思维陷入局部死胡同的风险。

#### 为什么可能更差

然而，多 Agent 绝非免费的午餐。每增加一个 Agent，系统都会引入五项实打实的工程代价：
- **高昂的协调开销（Coordination Overhead）**：任务委派、往返消息传递与结果整合会消耗大量额外的时间与 Token 预算；
- **交接中的信息丢失（Information Loss）**：当 Agent A 把任务转交给 Agent B 时，往往会漏掉关键的隐含约束或早期背景；
- **动作冲突与覆写（Conflicting Actions）**：两个 Agent 可能重复干同一件事、违背之前的约定，甚至在同一个文件里互相覆盖对方的修改；
- **跨主体误差传播（Error Propagation）**：上游 Agent 的一次事实幻觉或错误假设，会被下游 Agent 当作既定事实全盘接收并进一步放大；
- **调试与维护复杂度激增（Engineering Complexity）**：更多的角色提示词、接口协议与交互状态使得故障定位难度倍增。

#### 强单 Agent baseline

Kim et al.（2025/2026）在《Towards a Science of Scaling Agent Systems》中通过系统的控制变量实验揭示了一个重要结论：**在许多高度依赖上下文连续推理的任务上，给定同等算力预算，单智能体系统（SAS）的表现明显优于多智能体系统！**

这为我们确立了清晰的多 Agent 选型准则：

| 优先使用单智能体系统（SAS）的场景 | 值得尝试多智能体系统（MAS）的场景 |
|---|---|
| 任务各个步骤之间高度串行依赖、环环相扣 | 子任务之间耦合度低，可以在有限同步下独立推进 |
| 所有操作紧密耦合在同一个共享状态上（存在大量重叠修改） | 信息可以自然切分为互不干扰的聚焦上下文（如按模块或文档分片） |
| 单个 Agent 在质量、成本与延迟上已经满足业务目标 | 并行探索、角色专精或独立审查恰好能解决已测出的单 Agent 瓶颈 |

**工程铁律**：永远先用相同的工具集与充足的 Token 预算构建一个**强单 Agent 基线（Strong Single-Agent Baseline）**；只有当新增 Agent 带来的实测质量或速度收益大于其协调成本时，才保留多 Agent 架构。

### 2. 拓扑与动态选择

#### Independent 与 centralized

多 Agent 系统的编排拓扑（Orchestration Patterns）主要有四种基本形态。前两种结构最为常见：
1. **独立聚合型（Independent）**：`Agent 1`、`Agent 2`、`Agent 3` 各自独立处理任务，彼此之间**不交换任何中间消息**，最后由一个聚合器（Aggregator）汇总或投票选出最终输出。这种模式并行度最高、无通信死循环风险，但各 Agent 无法在途中互相借鉴对方的中间发现。
2. **中心化编排型（Centralized / Orchestrator）**：设置一个主导全局的 `Orchestrator Agent`，由它负责拆解任务并分别与 `Worker Agent 1, 2, 3` 单独通信；Workers 只向 Orchestrator 汇报结果，由 Orchestrator 决定下一步调度。中心化监管简化了全局状态控制，但 Orchestrator 本身容易成为吞吐量与上下文容量的瓶颈。

#### Decentralized / swarm 与 hybrid

另外两种拓扑则赋予了工作节点直接横向交互的自由度：
3. **去中心化蜂群型（Decentralized / Swarm）**：没有唯一的中心主控节点，所有 Agent 地位对等，可以通过共享消息板或点对点通道直接相互通信（All-to-all communication），甚至动态派生新的子 Agent。这种拓扑非常适合大规模开放式探索与并行发现，但协调与收敛难度最高。
4. **混合型（Hybrid）**：既有顶层的 `Orchestrator Agent` 把控全局目标与最终集成，又允许部分 `Worker Agents` 在子任务需要紧密配合时直接横向交换信息，兼顾全局视野与局部协作效率。

在 Token 消耗与计算成本结构上，实验表明通常遵循明显的递增规律：**单智能体（Single Agent）$<$ 中心化编排（Orchestrated）$<$ 去中心化蜂群（Swarms）**。

#### DyLAN

既然固定一个庞大臃肿的 Agent 团队既费钱又容易互相干扰，能不能根据具体任务动态挑选最得力的精干小队？**DyLAN（Dynamic LLM-Powered Agent Network, Liu et al., 2023）** 提出了将多轮多 Agent 交互建模为多层前馈网络，并引入了动态组队与早停机制：
1. **前向传播与互评（Forward Pass & Peer Rating）**：在每一轮时间步，各个 Agent 生成方案并对上一轮同伴的回答进行实用性打分（Utility Scoring）；
2. **反向贡献归因（Backward Credit Assignment）**：在训练/探测阶段，从最终达成共识的正确答案出发，沿着交互图反向传播贡献度权重，计算出每个角色的 **智能体重要性得分（Agent Importance Scores）**，从而筛选出对该领域任务真正有贡献的精锐团队；
3. **推理时动态剪枝与早停（Dynamic Pruning & Early Stopping）**：在执行新任务时，实时剔除得分低效的 Agent，且一旦有 **$2/3$ 以上的 Agent 达成一致答案便立即提前终止（Early Stop）**，从而以更少的 API 调用次数获得更高的决策准确率。

### 3. 通信、交接与协议

#### Communication 不等于 coordination

在设计多 Agent 交互时，初学者最容易混淆的两个概念是**通信（Communication）**与**协调（Coordination）**：

| 维度 | 通信（Communication） | 协调（Coordination） |
|---|---|---|
| **核心问题** | Agent 之间**如何交换信息**（How agents exchange information） | Agent 之间**如何管理相互依赖的工作**（How agents manage interdependent work） |
| **关注焦点** | 谁在什么时机、通过什么信道收到什么消息？ | 谁负责哪项子任务？先后依赖顺序是什么？冲突如何裁决？ |
| **工程原语** | 消息格式、会话流、交接协议与共享产物（Artifacts） | 任务账本（Task Ledger）、共享记忆、工作区隔离与资源锁 |

简言之：**把话发出去（Communication）绝不等于工作已经对齐（Coordination）**。如果四个 Agent 在群聊里热烈讨论了五十轮，却既没有明确谁去改哪个文件，也没有防止两个人同时改同一行代码，那系统只有通信而毫无协调。

#### AutoGen 的会话结构

微软提出的 **AutoGen（Wu et al., 2024）** 将多 Agent 通信统一抽象为**可编程的多方对话（Multi-Agent Conversations）**：每个 Agent 都可以定制底层模型、工具执行能力与人工介入策略，并组合成丰富的会话模式：
- **顺序接力（Sequential Chat）**：前一个团队完成后将摘要交给下一个团队继续；
- **嵌套会话（Nested Chat）**：当某个 Agent 接到复杂请求时，在内部私下拉起一组子 Agent 讨论，得出结论后再回到主会话回复；
- **群聊模式（Group Chat）**：所有 Agent 共享同一个会话上下文，由群聊管理器通过轮询（`RoundRobinGroupChat`）、大模型动态点名（`SelectorGroupChat`）或蜂群自主接力（`Swarm`）决定下一轮谁来发言。

#### Handoff 与 agent-as-tool

当主 Agent 需要借助另一个专业 Agent（比如退款专员 Agent 或代码安全审计 Agent）的力量时，在架构上有两种截然不同的调用方式（以 OpenAI Agents SDK 等框架为例）：

1. **控制权移交（Handoff）**：
   - **机制**：当前 Agent 将对话的主导权（Control）连同历史上下文彻底**移交**给目标专业 Agent；接收方成为新的活跃主体，直接与用户继续后续交互。
   - **适用场景**：类似电话客服中的“为您转接专席”——后续步骤完全由该领域专家接管并直接面向用户负责。
2. **将智能体作为工具（Agent-as-Tool）**：
   - **机制**：主控 Agent（Caller）**保留全局控制权**，它只把一个边界清晰的局部请求和精选的必要上下文当作函数参数传给专业 Agent；专业 Agent 完成后将结果或产物作为工具返回值交回给主控 Agent，由主控 Agent 整合各方结果并向用户输出最终回答。
   - **适用场景**：需要由单一主控入口统筹多个不同专长子模块、且不希望用户感知底层角色频繁切换的场景。

#### 公共信息板与多方环境

除了点对点对话与函数调用，多 Agent 还可以通过**共享消息板（Message Board / Publish-Subscribe）**进行通信：
- **MetaGPT（Hong et al., 2024）**：模拟软件公司的标准作业程序（SOP），让产品经理、架构师、工程师、测试员不要在群聊里漫无目的地闲聊，而是将结构化的产品需求文档（PRD）、接口设计图与代码文件发布到公共消息池（Shared Message Pool），各角色按订阅规则拉取自己关心的上游标准件开展工作。
- **开放多方社交与平台环境（如 MoltBook、HuggingFace 社区事件）**：当成百上千个来自不同开发者的自主 Agent 在共享讨论板或开源平台上自由发帖、评论与触发动作时，还会涌现出复杂的社交传染与不可控的群体级联效应。

#### A2A

如果说第 04 讲介绍的 **MCP（Model Context Protocol）** 标准化了“Agent 如何调用外部工具与资源”，那么 Google 推出的 **Agent2Agent（A2A）协议** 则致力于标准化**“不同厂商、不同框架构建的独立 Agent 之间如何跨网络发现彼此并协同完成任务”**。

A2A 协议的核心交互流程围绕四个关键机制展开：
1. **能力声明与发现（Agent Cards）**：每个远程服务端 Agent 暴露一张标准 JSON 格式的“名片（Agent Card）”，明确声明自己的身份、擅长技能（Skills）、支持的多模态输入输出格式与鉴权方式；
2. **可追踪的任务派发（Task Dispatch）**：客户端 Agent 读取 Agent Card 后，向服务端 Agent 发送结构化任务请求，创建具有唯一 ID 和生命周期状态的 Task；
3. **流式进度通知与双向协商**：在长任务执行期间，服务端可以通过流式推送（Server-Sent Events / Notifications）实时汇报进度，若遇到信息缺失还可以与客户端 Agent 双向多轮追问；
4. **交付物归档（Artifacts）**：任务完成后，服务端将最终生成的文档、代码或结构化数据封装为标准 `Artifact` 返回给客户端。

### 4. 协调、共享记忆与文件

#### Magentic-One 的 task ledger

有了通信通道后，我们如何构建可靠的**协调基础设施（Coordination Infrastructure）**？第一件核心武器是**显式任务账本（Task Ledger）**。

在微软的通用多智能体系统 **Magentic-One（Fourney et al., 2024）** 中，主导编排器不再依赖翻阅冗长混乱的聊天记录来猜测进度，而是维护一份结构化的实时任务账本，显式记录四件事：
1. **全局目标与已知事实（Facts & Objective）**：当前已经确认的事实、待核实的假设与最终目标；
2. **当前计划与分工（Plan & Assignments）**：拆解出的子步骤列表及每一步指派给哪个 Worker；
3. **执行进度与依赖（Progress & Dependencies）**：哪些步骤已完成、当前卡在哪个阻塞点（Blocker）；
4. **停滞恢复触发（Recovery）**：外层循环每步检查账本，一旦发现连续几步进度未推进或陷入死循环，立即清空局部卡死状态、修正计划账本并重新指派。

#### Symphony

在软件工程团队自动化中，OpenAI 展示的 **Symphony** 进一步将理念延伸为**“把项目原有的 Issue Tracker（问题追踪系统）直接变成多 Agent 编排器”**：系统实时监听工单状态流转，自动将符合条件的独立开发或修复任务派发给运行在隔离工作区中的后台编程 Agent，使人类工程师与多个 AI Agent 共享同一套看板账本。

#### GMemory

第二件协调基础设施是**面向多 Agent 定制的共享记忆架构**。单 Agent 的记忆只需要记录“我做过什么”，而多 Agent 团队的记忆还需要知道“哪个角色在什么协作模式下解决了什么问题”。

**G-Memory（Zhang et al., 2025）** 提出了三层层次化图记忆结构，分别对应不同的认知抽象粒度：
1. **洞察图（Insight Graph $\leftrightarrow$ Reflections）**：最顶层，存储从过往团队成败中提炼出的跨任务通用协作经验与高阶洞察；
2. **查询图（Query Graph $\leftrightarrow$ Episodic Task Index）**：中间层，编码历史任务的语义特征及任务之间的关联索引；
3. **交互图（Interaction Graph $\leftrightarrow$ Episodic Memory）**：最底层，忠实保存某次任务中各个 Agent 之间关键的消息交互拓扑与动作轨迹。

当新任务到来时，系统先在 Query Graph 中匹配相似历史任务，再向上抽取 Insight Graph 中的高层避坑指南、向下抽取 Interaction Graph 中的精简示范轨迹，按各个角色的职责精准分发，实验表现显著优于直接套用单 Agent 记忆的基线。

#### Git worktree 与整合

第三件协调基础设施解决的是多 Agent 并行写代码时的头号灾难——**工作区文件踩踏**。如果两个编程 Agent 同时在同一个文件夹里运行 `edit` 和 `pytest`，Agent A 刚改到一半的代码会让 Agent B 的测试直接报错，而 Agent B 的保存又会把 Agent A 的修改冲掉。

工程上的标准解法是 **Git Worktree 工作区隔离（Worktree Isolation）**：
- 利用 `git worktree add` 为每一个并发工作的 Agent 检出（Checkout）一个**物理目录完全独立、各自绑定独立 Git 分支**的工作树；
- 每个 Agent 在自己的专属沙箱目录里自由修改代码、运行测试，彼此绝对零干扰；
- 当子任务开发并通过本地测试后，再进入**受控集成阶段（Controlled Integration）**：通过 Git 合并（Merge / Rebase）各分支贡献、检测并解决代码冲突，最后在集成主干上跑全量回归测试。

#### CooperBench 的角色与资源分工

在基础设施之上，多个 Agent 在微观协作中会演化出三种核心协调模式（Khatua et al., 2026 在 **CooperBench** 中对其进行了系统形式化）：
1. **角色分工（Role Division）**：各 Agent 明确约定谁负责实现哪一部分功能模块及模块间的接口签名；
2. **资源划分（Resource Division）**：对共享文件、端口或命名空间进行分区，避免操作碰撞；
3. **计划协商（Negotiation）**：当两个 Agent 的设计方案存在不兼容冲突时，通过沟通收敛到统一的接口规范上。

### 5. 失败分类与工程案例

#### 三类失败

为什么精心设计的多 Agent 系统在实际运行中依然频繁翻车？Cemri et al.（2025）在《Why Do Multi-Agent LLM Systems Fail?》中收集了大量主流多 Agent 框架的真实运行轨迹，归纳出了著名的 **MAST（Multi-Agent System Failure Taxonomy）三大类、14 小类失效分类体系**：

| 失效大类 | 核心症结 | 典型具体故障表现 |
|---|---|---|
| **1. 系统设计与规范缺陷（System Design Issues）** | 角色定义、任务拆解或流程边界本身不合理 | 违背任务规范与约束；角色职责重叠或缺失；完全无视历史步骤无限重复循环；丢失上下文关键背景。 |
| **2. 智能体间交互失调（Inter-Agent Misalignment）** | 沟通断层、承诺落空或相互带偏 | 对话突然偏离原始主题（Derailment）；隐藏重要信息未同步给同伴；完全忽略同伴发来的合理建议；未搞清需求就盲目出手而非请求澄清；说法与实际执行的动作自相矛盾。 |
| **3. 任务验证与终止缺陷（Task Verification & Termination）** | 缺乏有效验收就草率收工 | **过早终止（Premature Termination）**：子任务还没做完或代码还没跑通就宣布大功告成；验证不完整；或者验证器明明发现了错误却无力纠正、错误放行。 |

这套分类法的实用价值在于：当你遇到多 Agent 任务失败时，可以先将失败轨迹归入这三类之一——如果是第 1 类，应该去改拓扑与角色提示；如果是第 2 类，应该引入结构化交接契约与任务账本；如果是第 3 类，则必须补强独立的确定性测试验证器（Verifier）。

#### 预期、承诺与通信断裂

为什么即使底层模型单打独斗能力很强，两两配对协作时却依然漏洞百出？Khatua et al.（2026）将这一现象称为**“协调诅咒（The Curse of Coordination）”**，并指出了三大根源：
- **预期错位（Expectation Failures）**：Agent A 想当然地默认 Agent B 会帮它处理边界空值校验，而 Agent B 根本没这么想；
- **承诺违约（Commitment Failures）**：Agent A 在群聊里满口答应“我会把返回类型改成字典”，转头写代码时却依然返回了列表；
- **通信断裂（Communication Breakdowns）**：发送的消息含糊不清、时机过晚，或者充斥着毫无信息量的客套废话。

#### CooperBench 的证据

**CooperBench（Khatua et al., 2026）** 在跨越 4 种编程语言、12 个真实开源库的 **600 个协作编程任务**上进行了严格测试：让两个 Agent 各自负责在同一个代码库中实现一个相互关联的特性，要求两者合并后同时通过测试。实验结果令人警醒：**把两个特性都交给同一个单 Agent 独自完成（Solo），成功率显著高于让两个 Agent 分工协作（Coop）！** 这再次用硬核数据证明了：跨 Agent 协调本身具有极高的能力门槛，在缺乏严密的接口契约与集成验证时，盲目拆分任务只会招致集成灾难。

#### Conformity 与不兼容目标

当多 Agent 规模进一步扩大或目标存在张力时，还会出现两类棘手的涌现行为问题（Zou, 2026）：
- **群体趋同与多样性坍塌（Conformity）**：研究者让一群 Agent 自由协作、“各自创造一个令人印象深刻的项目”，结果超过一半的 Agent 最终都不约而同地扎堆去写“光线追踪器（Ray Tracers）”或“自举编译器（Self-hosting Compilers）”——模型在相互交流中不仅没有激发出百花齐放的创意，反而迅速收敛到了预训练分布中最刻板的常见套路上。
- **不兼容目标与对抗冲突（Incompatible Goals）**：当不同 Agent 被赋予存在潜在利益冲突的目标时（例如让几个分别偏爱不同编程语言的 Agent 共同迁移同一台虚拟机上的后端服务），它们甚至会相互覆盖配置、争夺系统控制权或学会隐瞒信息。

#### 可选案例：多 Agent 构建 C compiler

既然多 Agent 协作有这么多坑，那在什么条件下它才能真正发挥惊人威力？本讲最后剖析了一个极具启发性的成功工程案例——**使用去中心化多 Agent 团队从零构建一个能编译 Linux 内核的 C 语言编译器（Carlini, 2026）**。

这个系统之所以没有陷入群聊扯皮，核心在于它用**极度规范的软件工程基础设施取代了自然语言闲聊**：
1. **去中心化无限循环 + 文件锁任务认领**：没有容易成为瓶颈的中心编排器，每个 Agent 运行在一个简单的无限循环中——完成一个任务后，立即去 `current_tasks/` 目录下通过创建锁文件（利用 Git 原子同步）认领下一个待办任务；
2. **Git Worktree 隔离 + 强制合并前测试**：每个 Agent 在独立工作目录开发，只有跑通测试套件才允许推送合并回主仓库；
3. **职能高度专业化**：除了负责实现编译特性的主カ Agent，还专门设置了负责合并与消除重复代码的 Agent、负责优化编译器性能的 Agent、负责精简报错信息的 Agent 以及维护文档的 Agent；
4. **专为 LLM 设计的测试与环境**：测试脚本被改造得极快，且打印出的错误日志极其精简并自带关键词标签，方便 Agent 用 `grep` 瞬间定位问题，避免几万行报错撑爆上下文；同时通过维护 `README.md` 与进度文档，让任何新启动的无状态 Agent 都能在几秒钟内看懂全局架构并接手工作。

## 原课程阅读清单与导读

- [Wu et al. "AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation." COLM (2024).](https://arxiv.org/abs/2308.08155)
  导读：理解如何通过可对话智能体（Conversable Agents）与会话编程（Conversation Programming）统一表达顺序、嵌套与群聊协作模式。
- [Cemri et al. "Why Do Multi-Agent LLM Systems Fail?" NeurIPS Datasets & Benchmarks (2025).](https://arxiv.org/abs/2503.13657)
  导读：精读 MAST 的三阶段 14 类失效分类表，重点思考为什么仅靠改进局部提示词无法解决系统级协调与验证缺陷。
- [Kim et al. "Towards a Science of Scaling Agent Systems." arXiv (2025).](https://arxiv.org/abs/2512.08296)
  导读：对照论文中单 Agent 与独立、中心化、去中心化、混合多 Agent 在不同任务结构与预算下的定量表现，掌握何时应当（以及何时不应当）扩展 Agent 数量。

## 动手练习

1. **单 Agent 基线与双 Agent 协作对比**：设计一个“根据两份长文档编写带精确引用的对比分析简报”任务。固定总 Token 预算上限，对比（a）单 Agent 独立完成检索、撰写与核查，与（b）“撰稿人 Agent + 独立事实核查员 Agent（通过 Agent-as-Tool 或 Evaluator-Optimizer 交互）”两种方案在发现虚构引用上的准确率与耗时差异。
2. **基于任务账本与接口契约的协作设计**：假设你需要让两个编程 Agent 分别编写同一个项目中的 `bm25_index.py` 模块和 `doc_search_tool.py` 模块。请设计一份共享的 **Task Ledger（JSON/Markdown 格式）** 与模块间接口契约，避免出现 CooperBench 中常见的“承诺违约”与“接口参数不兼容”故障。
