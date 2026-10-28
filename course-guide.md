# CS329Z：AI Agent 系统工程（Engineering AI Agents）

从单一的大语言模型（LLM）走向**复合 AI 系统（Compound AI Systems）**——将语言模型、检索器、外部工具、记忆模块、编排框架与优化器协同组合——正在重塑现代软件与人工智能应用的构建方式。

本课程围绕 **系统（System）**、**数据（Data）** 与 **评测（Evals）** 三大支柱展开，带你跨越从基础模型调用、固定工作流（Workflows）到自主智能体（Autonomous Agents）的完整技术光谱。你将首先从零手写核心组件（检索增强生成、工具调用协议、Agent 主循环、上下文压缩与沙箱隔离），透彻理解底层运行机制；随后掌握 DSPy、LangGraph、Temporal 等工业级抽象框架，并深入多 Agent 协作、提示与权重优化、基准构建、安全防护及软件工程 Agent 等核心课题。

## 在线阅读与构建

课程提供完整的交互式网页阅读版：直接用浏览器打开 [HTML 课程文档 (`html/index.html`)](html/index.html)，即可使用章节导航、全文检索（快捷键 `⌘K` / `Ctrl+K`）、页内目录、深浅阅读主题、字号调节与排版打印功能。

若对 Markdown 文档进行了修改，可在课程目录下运行以下命令重新生成并校验 HTML 文档：

```bash
node tools/build_html.mjs
python3 tools/verify_html.py
```

## 先修要求与学习路径

学习本课程需要具备扎实的 Python 编程能力，熟悉常见的 HTTP/API 调用，并掌握基础的概率统计、线性代数与自然语言处理概念（如词向量、交叉熵损失、训练/验证/测试集划分及基础的 Transformer 机制，相当于修读过 CS224N、CS336 或具备同等工程背景）。你无需事先掌握任何 Agent 开发框架。

全课程按四个模块循序渐进展开：

| 模块 | 覆盖讲次 | 核心内容与能力目标 |
|---|---|---|
| **一、基础与核心组件** | 第 01–04 讲 | 剖析 Agent 的核心解剖结构（模型、推理、记忆、工具、环境）；深入 LLM 解码、注意力复杂度与推理系统瓶颈；掌握端到端 RAG 检索管线与 Function Calling / MCP 工具协议。 |
| **二、架构、记忆与系统优化** | 第 05–09 讲 | 对比手写 Harness 与 DSPy、LangGraph、Temporal 持久编排；掌握工作流与 Agent 设计模式、长上下文管理、跨会话记忆架构、多 Agent 协作机制，以及提示演化（MIPROv2、GEPA）与强化学习微调（PPO、GRPO）。 |
| **三、数据飞轮与评测工程** | 第 10–14 讲 | 从 Terminal-Bench 实战理解“规格即评测”；掌握轨迹、示范与反馈数据的构建与筛选；使用四元组框架（Request、Environment、Stopping Criteria、Scorer）与三类评分器（Code、LLM-as-Judge、Human）搭建高可靠评测基础设施。 |
| **四、安全防护与前沿应用** | 第 15–19 讲 | 防御直接与间接提示注入、构建权限模型与沙箱隔离；深入剖析 SWE-agent、Claude Code、OpenHands 等编程 Agent 架构，探索主动式 Agent（Proactive Agents）与多模态计算环境。 |

## 课程目录

| 讲次 | 所属单元 | 章节主题 | 核心议题 |
|---:|---|---|---|
| 01 | 基础与全景 | [Agent 基础与全景](01-Agent基础与全景.md) | Agent 演进史、核心解剖结构、推理模式（CoT / ReAct / Reflexion）、三类记忆与系统挑战 |
| 02 | 基础与全景 | [面向构建者的大语言模型](02-面向构建者的大语言模型.md) | 解码策略、Transformer 与线性/混合注意力、训练流水线、KV Cache、受限解码与上下文工程 |
| 03 | 核心构建块 | [检索增强生成（RAG）](03-检索增强生成RAG.md) | 潜变量视角、文档切块与上下文增强、HNSW、BM25 与 DPR 混合检索、ColBERT 重排与 Agentic RAG |
| 04 | 核心构建块 | [工具使用与函数调用](04-工具使用与函数调用.md) | Toolformer 自监督工具学习、Gorilla 与大规模 API、REST / Function Calling / MCP 协议、BFCL 与 τ-bench |
| 05 | 框架与设计 | [框架与持久编排](05-框架与持久编排.md) | DSPy 声明式编程、LangGraph 状态图、开源 Harness 剖析（mini-SWE-agent / OpenHands / Pi）、Temporal 持久执行 |
| 06 | 框架与设计 | [Agent 设计模式与上下文管理](06-Agent设计模式与上下文管理.md) | 五大工作流模式、ReAct / CodeAct / ReWOO / LLMCompiler、事件日志、上下文压缩与观测屏蔽 |
| 07 | 记忆与多智能体 | [Agent 记忆架构](07-Agent记忆架构.md) | CoALA 记忆分类、技能库复用（Voyager / AWM）、分层记忆（MemGPT）、反思整合与记忆基准评测 |
| 08 | 记忆与多智能体 | [多 Agent 系统](08-多Agent系统.md) | 单 Agent 与多 Agent 权衡、编排拓扑、Handoff 与 A2A 协议、任务账本与 Worktree 隔离、协作失效分类 |
| 09 | 系统优化 | [Agent 系统优化](09-Agent系统优化.md) | 示范引导、MIPROv2 与 GEPA 提示演化、TextGrad、Agent 轨迹 SFT、PPO / GRPO 强化学习与在线蒸馏 |
| 10 | 评测工程 | [Terminal-Bench 与评测工程](10-Terminal-Bench与评测工程.md) | 从演绎软件到归纳评测、Harbor 与终端评测架构、任务设计与防作弊验证器、基准测试的 CI/CD 与版本演进 |
| 11 | 数据工程 | [Agent 需要什么数据](11-Agent需要什么数据.md) | 运行轨迹（Traces）、示范（Demonstrations）与反馈（Feedback）、数据飞轮、合成数据与人机交互采集 |
| 12 | 数据工程 | [数据选择与质量](12-数据选择与质量.md) | 高信息量样本筛选、小而精的诊断基准、标注规范与一致性校准、从运行轨迹构建训练与评测数据集 |
| 13 | 评测体系 | [评测基础与基准设计](13-评测基础与基准设计.md) | 四元组评测框架（请求、环境、终止条件、评分器）、环境重置与脚手架公平性、多维可靠性度量 |
| 14 | 评测体系 | [LLM 裁判与评测基础设施](14-LLM裁判与评测基础设施.md) | 代码/模型/人工三类评分器、Judge 提示设计与偏差消解、Pass@k 与 Pass^k 统计、八步评测落地路线 |
| 15 | 安全与治理 | [Agent 安全与防护](15-Agent安全与防护.md) | 工具访问与情境隐私（PrivacyLens）、直接与间接提示注入、红队测试、沙箱与最小权限、人机协同审批 |
| 16 | 专题研讨 | [专题研讨：复合 Agent 系统架构复盘](16-客座讲座TBA.md) | 数据、系统与评测三大支柱的工程闭环、架构选型决策矩阵与端到端故障诊断方法论 |
| 17 | 应用与前沿 | [编程与软件 Agent](17-编程与软件Agent.md) | 端到端软件工程 Agent、Agent-计算机接口（ACI）、SWE-agent / Claude Code / OpenHands 架构与 SWE-bench |
| 18 | 应用与前沿 | [主动式 Agent](18-主动式Agent.md) | 从被动响应到主动发起、通用用户模型（GUM）、下一步动作预测、混合主动权（Mixed Initiative）与信任边界 |
| 19 | 应用与前沿 | [前沿与开放问题](19-前沿与开放问题.md) | 多模态与计算机操作 Agent、科学发现 Agent、超长周期架构、生产级可观测性（Tracing / 成本控制）与开放挑战 |

## 实战作业与项目指南

理论知识只有落地为可运行的代码与可复现的实验才能真正内化。本教程配套四项核心工程实践与一份源码导读：

- **[HW1：从零搭建 Agent Harness](exercises/HW1-从零搭建Agent-Harness.md)**：不依赖任何第三方 Agent 框架或原生 Function Calling 接口，使用纯 Python 从零构建企业内部助手 Cardinal Energy Agent。涵盖邮件分类、日报生成、BM25 倒排索引、多跳问答、自定义工具协议、Agent 循环、分页文档检索、终端沙箱执行、上下文压缩、跨会话记忆、用户审批与防注入护栏等 17 个递进模块。
- **[HW2：构建 Agent 评测体系](exercises/HW2-评测Agent.md)**：针对给定 Agent 系统设计完整的自动化评测套件。基于四元组框架编写测试任务，结合确定性代码评分器（Code Graders）与大模型裁判（LLM-as-Judge），开展多轮稳定性统计（$\text{pass}@k$ 与 $\text{pass}^k$）及系统性错误归因分析。
- **[课程项目：设计、构建与严格评测](exercises/学期项目-设计构建与评测.md)**：从问题定义与基线建立（Proposal）、原型搭建（Midpoint Prototype）到完整消融实验与失败模式分析（Final Report & Demo）的全周期工程指南。
- **[论文精读与复现扩展（Paper Video）](exercises/Paper-Video-论文讲解与复现.md)**：选择前沿 Agent 研究论文，深入剖析其系统架构与实验假设，并通过动手复现或微型扩展实验检验论文的核心主张。
- **[配套代码架构导读](code-guide.md)**：详细解析 HW1 代码库（`assignment1-harness`）的模块边界、类型契约与模拟评测框架，以及第 05 讲配套 Notebook（`lecture5-frameworks`）中 DSPy、LangGraph 与 Temporal 的实现细节。
