# 第 10 讲｜Terminal-Bench 与评测工程

回顾计算机软件工程八十年的演进史：20 世纪 40 年代，程序员直接用十六进制机器码（如 `48 83 C0 05`）为 CPU 编写指令；50 年代初演进到汇编语言（`add rax, 5`）；50 年代末 FORTRAN 等高级语言的诞生（`x += 5`），将人类从繁琐的寄存器管理中解放出来。图灵奖得主 Tony Hoare 在 1969 年曾总结道：传统计算机编程是一门**演绎科学（Deductive Science）**——人类亲手编写确定性的规则（Code），程序将规则作用于输入从而推导出输出（$\text{Rules} + \text{Inputs} \to \text{Outputs}$），代码本身就是唯一的真相之源（Source of Truth）。

然而，从机器学习（ML）到大语言模型（LLMs）再到自主智能体（Agents），整个数字技术开发正在经历一场深刻的范式迁移——从**演绎式（Deductive）**全面转向**归纳式（Inductive）**：人类提供输入与期望的结果评判标准（$\text{Inputs} + \text{Outputs} \to \text{Rules}$），由模型习得策略并由 Agent 自动生成或操作软件。在这个新世界里，**代码不再是唯一的真相之源，评测（Evaluations / Evals）成为了新的真相之源；软件工程师的核心职责正在演变为“规格定义者与评测构建者（Specifier & Evaluator）”**。

本讲由 Terminal-Bench 与 Harbor 框架的联合创建者 Ryan Marten 和 Alex Shaw（Laude Institute）主讲，深入探讨为什么命令行终端（Terminal / Bash）是评测通用 Agent 最理想的试金石，并系统拆解如何通过 **Terminal-Bench** 与 **Harbor** 设计防作弊的真实评测任务、构建隔离的验证基础设施、执行多层级任务质量审查（Task QA），以及通过 CI/CD 与语义化版本控制维护演进中的基准测试。

## 学习目标

- 从演绎式编程（Deductive）向归纳式开发（Inductive）的范式转移理解“规格即评测（Specification $\to$ Evaluation）”的核心思想。
- 理解为什么 Bash 终端是训练与评测真实世界 Agent 的通用接口，掌握 Task、Trial、Benchmark、Verifier（Grader）、Trajectory、Agent Harness 与 Evaluation Harness 的标准定义。
- 掌握 Terminal-Bench / Harbor 任务目录的五元组结构（`instruction.md`、`task.toml`、`environment/`、`solution/`、`tests/`），学会编写指令与验证器严密对齐、防止奖励篡改（Reward Hacking）的高质量任务。
- 掌握评测环境的构建取舍、四分类混淆矩阵（TP/TN/FP/FN）验证器分析、信任域隔离架构以及六层任务质量保障（Task QA）流水线。
- 掌握基准测试的持续集成（CI/CD）与三段式版本管理法则（Major `x+1` 重跑、Minor `y+1` 重评、Patch `z+1` 复用）及完整结果存证（Full Receipts）规范。

## 知识讲解

### 1. 从软件历史到评测

#### 机器码、汇编与高级语言

在 20 世纪 50 年代早期，掌握机器码与汇编语言的程序员曾被 FORTRAN 之父 John Backus 形容为“守护着凡人无法企及的神秘技艺的祭司阶层”。高级编译器的出现打破了这层壁垒，极大地释放了软件生产力。1954 年 IBM 的 FORTRAN 初步报告甚至乐观地宣称：“FORTRAN 应当能几乎彻底消除编码和调试工作。”

历史当然证明了调试（Debugging）并未消失——每当抽象层级提高一层，人类的工作重心只是从“纠结底层语法细节”上移到了“定义更高层的系统逻辑与验证程序行为是否正确”。

#### Deductive 与 inductive

将传统软件工程与现代 AI Agent 工程放在一起对比，两者的底层逻辑发生了根本反转：

| 维度 | 传统软件开发（Traditional Software） | 智能体时代开发（Agentic World） |
|---|---|---|
| **推理范式** | **演绎式（Deductive）**：$\text{规则（代码）} + \text{输入} \to \text{输出}$ | **归纳式（Inductive / Empirical）**：$\text{输入} + \text{输出验证标准} \to \text{习得策略与软件}$ |
| **系统行为性质** | 确定性（Deterministic） | 随机性（Stochastic） |
| **软件生产方式** | 由人类逐行手工编写（Handcrafted） | 由模型与 Agent 从数据与评测反馈中习得或生成（Learned） |
| **真相之源（Source of Truth）** | **源代码（Code）** | **评测套件（Evals）** |

#### 规格变成评测

在 Agent 时代：
1. **模型（Models）** 是从海量数据与奖励信号中训练出来的；
2. **智能体（Agents）** 是围绕评测指标（Evaluation）迭代开发出来的；
3. **最终软件与操作结果（Software & Artifacts）** 是由智能体自主生成的。

这意味着，如果你无法用清晰、可自动验证的**评测（Eval）**来定义“什么叫把事情做对了”，你就既无法训练模型，也无法改进 Agent，更不敢把 Agent 生成的代码部署上线。**编写规格说明（Specification）与编写评测验证器（Evaluation）合二为一**。

### 2. 为什么终端是有用环境

#### 通用接口与任务难度

我们应该在什么环境里训练和评测 Agent？如果只做静态的多项选择题，完全测不出多步工具操作与错误恢复能力；而如果针对每个特定图形界面单独写一套脆弱的 DOM 点击脚本，又难以跨领域通用。

**命令行终端（Bash / Terminal）是连接数字世界几乎所有计算任务的“终极通用接口”**：
- 任何可以通过编程、系统管理、数据处理、云计算调度（如 `aws ec2 run-instances ...`）、编译构建或科学计算完成的任务，都可以通过终端命令与文件系统操作完成；
- 终端天然统一了 Agent 的训练环境（Rollout Environment）与测试环境，既足够贴近工程师的真实生产环境，又天然适合封装进轻量级的 Docker 容器中进行大规模并发评测。

#### 项目时间线与规模数字

作为评测终端 Agent 真实能力的标杆开源项目，**Terminal-Bench** 自 2025 年 1 月提交首行代码（恰逢同年 2 月 Claude Code 发布）以来，迅速发展为涵盖 64+ 模型卡片、171 位任务贡献者、超 1,000 名 GitHub 参与者与 **700 万次以上基准测试运行（Benchmark Runs）** 的活跃社区生态。

#### CAD 任务示例

不要以为终端基准只能测试“修改两行 Python 脚本”或“写个正则替换”。来看课件中展示的一个真实的 Terminal-Bench 跨学科硬核任务——**从二维工程图纸构建三维 CAD 模型**：

- **任务指令（`INSTRUCTION.MD`）**：
  > “请根据 `/app/schematic.png` 中的二维工程视图，在 `/app/out.step` 路径下输出对应的三维 STEP 模型文件。”
- **初始环境（`ENVIRONMENT/DOCKERFILE`）**：
  ```dockerfile
  FROM python:3.12-slim
  COPY schematic.png /app/schematic.png
  ```
- **客观状态验证器（`TEST/TEST_OUTPUTS.PY`）**：
  ```python
  assert valid_step_file()            # 验证 STEP 文件格式合法
  assert watertight()                 # 验证三维网格封闭无孔洞（水密性）
  assert correct_volume()             # 验证三维实体体积精确匹配
  assert correct_surface_area()       # 验证表面积精确匹配
  assert correct_principal_inertia()  # 验证主转动惯量匹配
  assert correct_convex_hull_volume() # 验证凸包体积与面积匹配
  assert correct_topology()           # 验证拓扑结构与平均曲率匹配
  assert correct_mean_curvature()
  ```

这个例子极具代表性地展示了终端评测的精髓：**任务指令只有短短一句话，给 Agent 完全开放的工具自由度（它可以写 Python 脚本调 CAD 库建模、自己渲染多视角投影图并与原图纸比对修正），而最终评分器则通过对产物 `/app/out.step` 进行严密的几何与物理属性断言，做到百分之百客观、可验证且无法蒙混过关！**

### 3. Terminal-Bench 与 Harbor

#### 基准与基础设施

在工程实践中，我们需要区分两个紧密配合的项目：
- **Terminal-Bench（`tbench.ai`）**：是由社区共同维护的**具体基准测试集（Benchmark）**，回答“我们用哪些真实困难的任务来考 Agent”；
- **Harbor（`harborframework.com`）**：是底层的**评测驱动开发基础设施（Evaluation Harness & Tooling）**，回答“如何让任何人都能轻松构建、并行运行、隔离验证并管理成千上万个自己的评测基准”。

#### 基本名词

为了消除交流歧义，评测工程（参照 Anthropic 与 Harbor 标准术语体系）严格定义了七个核心概念：
1. **Task（任务）**：具有明确初始输入、环境状态与成功评判标准的单个测试用例；
2. **Trial（尝试 / 试验）**：Agent 针对某一个 Task 进行的单次运行尝试（因模型具有随机性，同一 Task 可运行多次 Trials）；
3. **Benchmark / Evaluation Suite（基准 / 评测套件）**：用于衡量特定能力维度的一组 Tasks 集合；
4. **Verifier / Grader（验证器 / 评分器）**：对单次 Trial 的最终环境状态或产出进行打分的程序或判别逻辑；
5. **Trajectory / Trace / Transcript（轨迹 / 记录）**：单次 Trial 中从初始提示、模型每步思考、工具调用到环境返回结果的完整过程记录；
6. **Agent Harness（智能体运行底座）**：包裹在模型外层、驱动模型作为 Agent 调用工具并管理上下文的系统（如 Claude Code、OpenHands 或你在 HW1 中实现的系统）；
7. **Evaluation Harness（评测运行底座）**：在最外层负责启动容器环境、注入任务、调用 Agent Harness、控制超时预算、运行 Verifier 并归档结果的评测基础设施（如 Harbor）。

#### 任务目录

在 Harbor / Terminal-Bench 中，每一个评测任务都是一个自包含、与具体 Agent 无关（Agent-agnostic）、可移植且相互独立的标准文件夹：

```text
my-task/
├── instruction.md        # 呈现给 Agent 的自然语言任务指令
├── task.toml             # 任务元数据配置（超时时间、资源配额、标签等）
├── environment/
│   └── Dockerfile        # 构建任务初始运行环境的容器定义（含依赖、数据文件、服务）
├── solution/
│   └── solve.sh          # 参考标准解（Oracle Solution），用于证明任务可解并校验测试脚本
└── tests/
    └── test.sh           # 在任务结束后运行的验证器脚本（Verifier），判定最终成败
```

### 4. 任务设计与 verifier

#### 要求与评分对齐

如何编写一个高质量的评测任务？第一条铁律是：**指令说明（Instruction）与验证器断言（Verifier）必须严格一一对齐（1-to-1 Mapping）**。
- **如果 Verifier 检查了 Instruction 里根本没提到的隐含条件**（比如指令只说“输出 CSV 统计报表”，而测试脚本却暗中要求“列名必须全小写且按第二列降序排列”），那么即便 Agent 完美完成了指令要求，也会被冤枉判错，造成**假阴性（False Negative）**；
- **如果 Verifier 检查得过于宽松**（比如只检查 `/app/out.csv` 文件是否存在且非空，却不核对里面的数值），那么胡乱输出一行垃圾数据的 Agent 也能混过关，造成**假阳性（False Positive）** 与 **奖励篡改（Reward Hacking）**。

#### 完全指定但自然简洁

一条优秀的 `instruction.md` 应当同时满足三项要求：
1. **完全指定（Fully Specified）**：所有会被 Verifier 断言检查的文件路径、输出格式、边界处理规则与 schema 约束都必须清晰交代，绝不让 Agent 去猜出题人肚子里的潜台词；
2. **尽可能简洁（As Concise as Possible）**：剔除无关的背景废话；
3. **自然真实（As Natural as Possible）**：像真实高级工程师提需求那样描述“要达成什么结果”，而不是写成手把手教每一步敲什么命令的填空剧本。

#### 环境选择

在设计 `environment/Dockerfile` 时，核心原则是**尽可能逼近真实的生产环境分布（Simulate "Prod" Distribution）**：
- **优先使用真实软件与多容器服务（Actual Software > Mocks）**：尽量运行真实的数据库、编译器与 Web 服务，而不是脆弱失真的 Mock 脚本；
- **权衡开放网络与可复现性（Open World vs. Reproducibility）**：允许访问互联网更贴近真实世界，但外部网页改版、APT/Pip 源包更新或网络抖动会导致评测随时间发生不稳定漂移（Flakiness）。因此，工程最佳实践是**将关键依赖包、代码仓库快照与测试数据预先烘焙（Bake in）到容器镜像中并锁死版本号**，消除非必要的网络波动。

#### 用最终状态评分

在编写 `tests/test.sh` 验证器时，核心原则是**基于环境最终状态的客观结果评判（Outcome-based Classification on the State of the Environment）**——检查最终生成的文件、数据库记录、服务端口响应或测试套件通过情况，而不是去限制 Agent 中间必须敲哪几条命令。

我们可以通过经典的**四格混淆矩阵**来审视验证器（Verifier）自身的质量：
- **真阳性（True Positive, TP）**：Agent 真正解决了问题，Verifier 正确判定为 `PASS`；
- **真阴性（True Negative, TN）**：Agent 未能解决问题，Verifier 正确判定为 `FAIL`；
- **假阳性（False Positive, FP）**：Agent 作弊或产出错误结果，但粗糙的 Verifier 误判为 `PASS`（放过了错误）；
- **假阴性（False Negative, FN）**：Agent 采用了一种出题人没想到的合理合法解法完成了任务，但过于死板的 Verifier 误判为 `FAIL`（冤枉了好人）。

大多数终端任务优先采用确定性的**程序化检查（Programmatic Checks，如 pytest 断言）**；对于涉及视觉效果、文档可读性等难以纯靠正则断言的维度，则辅以受控的 **Agent / LLM Judges**。

### 5. 隔离、可靠性与质量审查

#### 隔离不同信任区域

如果把测试脚本 `tests/test.sh` 和标准答案 `solution/solve.sh` 直接放在 Agent 运行的同一个容器目录里，会发生什么？聪明的 Agent 在遇到难题时，会直接在终端里运行 `find / -name "*test*"` 或 `cat /tests/test.sh`，看一眼测试脚本里硬编码的断言答案，甚至直接修改 `test.sh` 把它改成 `exit 0`！这就是典型的 **奖励篡改（Reward Hacking）**。

为了从物理上根绝此类作弊，Harbor 等评测基础设施强制执行**跨信任域隔离（Environment Isolation）**：

```text
+-----------------------+              +--------------------------+
|   AGENT ENVIRONMENT   |              |   VERIFIER ENVIRONMENT   |
|  (Locked Down, No     |  --Artifact->|  (Isolated Container /   |
|   Tests or Solutions) |   Extraction |   Mounted Read-only      |
+-----------------------+              |   Artifact + Tests)      |
                                       +--------------------------+
```

1. **锁定的 Agent 运行环境**：在 Agent 执行阶段，容器中**绝不包含 `solution/` 或 `tests/` 目录**；
2. **隔离的验证器环境**：当 Agent 宣告完成或超时后，评测底座提取出产出工件（Artifacts）或在清理隔离后的环境中挂载 `tests/` 脚本运行验证，确保 Agent 代码执行绝无可能触碰或污染评分逻辑。

#### Oracle solution

每个任务目录下的 `solution/solve.sh`（即 **Oracle Solution / 金标准参考解**）扮演着至关重要的角色：它是验证你的 Dockerfile 环境配置无误、且 `tests/test.sh` 验证器确实能够跑通拿满分的自动化冒烟测试（Smoke Test）。编写 `solve.sh` 时，应当尽量模拟真实 Agent 会采取的真实构建或求解动作，而不是偷懒直接往目标路径 `echo` 一个硬编码的死答案——因为只有跑通真实求解流程，才能检验出环境中是否漏装了某个关键系统依赖库。

#### 基础设施要求

一套支撑大规模研发与强化学习采样的评测与轨迹基础设施（Eval & Rollout Infra）必须具备四项工程特性：
1. **高可靠与容错（Reliable & Fault Tolerant）**：能够区分“Agent 自身能力不足导致的任务失败”与“云主机断网、容器守护进程崩溃或 API 限流导致的基础设施故障”；
2. **严格可复现（Reproducible）**：容器镜像、依赖与评分脚本全部锁定；
3. **高并发快速执行（Fast）**：支持同时启动成百上千个相互独立的沙箱容器并行跑完整个基准；
4. **跨平台可移植（Portable）**：同一套任务定义既能在开发者笔记本的本地 Docker 上跑，也能一键调度到云端集群执行，同时服务于离线测试（Test）、强化学习训练采样（Train）与生产监控（Prod）。

#### 多层 task QA

俗话说“任务也是软件，是软件就会有 Bug”。在将一个新设计的任务合入 Terminal-Bench 之前，必须经过严密的**六层任务质量审查流水线（Multi-layer Task QA）**：
1. **静态检查（Static Checks）**：自动检查目录结构、`task.toml` 字段、Dockerfile 规范与脚本可执行权限；
2. **智能体审查（Agent Judge on Task Spec）**：让审查 Agent 检查 `instruction.md` 与 `tests/` 是否存在要求不一致或表述歧义；
3. **Oracle 验证（Oracle Agent Run）**：在全新容器中运行 `solution/solve.sh`，必须 $100\%$ 通过所有测试断言；
4. **空操作与作弊代理测试（Nop & Cheat Agents）**：运行一个什么都不干的空 Agent，以及一个专门尝试搜索测试文件、伪造空文件或钻漏洞的“作弊 Agent（Cheat Agent）”，确保它们 $100\%$ 被判 `FAIL`；
5. **前沿模型试跑（Frontier Agents）**：用当前最顶尖的数个前沿 Agent 实际跑几轮；
6. **轨迹人工与智能体复盘（Trajectory Inspection）**：当发现所有前沿模型在某道题上全军覆没时，不要急着庆祝“我出了一道超难的好题”——打开轨迹一看，十有八九是因为题目指令漏写了一个格式要求，或者容器里少装了一个依赖导致假阴性！

### 6. 维护与版本管理

#### 基准也需要 CI

许多学术基准在论文发表之日就停止了维护，久而久之因外部依赖失效或漏洞百出而无法使用。真实的评测基准必须像现代开源软件一样建立 **持续集成与持续演进机制（Continuous Benchmarks / CI/CD）**：随着社区百万次的运行，不断收集关于任务抖动（Flakiness）、新型模型展现出的意外合法解法（暴露出旧测试的假阴性）以及新型奖励作弊手法的 Bug Reports，持续修复并发布新版本。

#### Major：Agent 环境变化

一旦修改了基准中的任务，以前跑出来的模型排行榜分数还算不算数？要不要花几万美元把所有模型全部重跑一遍？Terminal-Bench / Harbor 为此制定了一套清晰的**评测语义化版本控制准则（Semantic Versioning for Benchmarks：`x.y.z`）**：

- **主版本号升级（Major `(x+1, y, z)` $\to$ 必须重新运行 Agent：`Rerun`）**：
  只要改动影响了 **Agent 在运行时所看到的环境、输入或交互过程**，就必须升级主版本号并重新运行 Trial。具体包括：新增或删除了任务、修复了原本指代不清或过度指定的 `instruction.md`、修改了容器内的初始数据或工具版本、或者调整了分配给 Agent 的 CPU/内存/超时资源。因为此时 Agent 面对的问题已经变了，旧轨迹不再有效。

#### Minor：verifier 变化

- **次版本号升级（Minor `(x, y+1, z)` $\to$ 只需对已有产物重新打分：`Regrade`）**：
  如果 Agent 运行时看到的提示词和环境**完全没变**，仅仅修改了事后的**验证器（Verifier）或计分逻辑**——例如修复了过于死板的正则断言（消除假阴性）、封堵了评分漏洞、微调了 Judge 提示词或增加了新的统计指标。此时无需重新花钱调用大模型跑 Agent，只需直接拿之前保存下来的 Trial 产出工件（Artifacts）与轨迹，在新版 Verifier 上**重新运行一次打分（Regrade）**即可！

#### Patch：不改变评测含义的修正

- **补丁版本号升级（Patch `(x, y, z+1)` $\to$ 直接复用已有分数：`Reuse`）**：
  如果改动既不影响 Agent 的行为，也不改变评分结果——例如更新了外部 README 文档、修复了 `solution/solve.sh` 参考脚本的偶发问题、锁死了某个原本浮动的镜像依赖版本，或修正了提示词里一个完全不影响理解的拼写错误，则可以直接复用已有评测成绩。

为了支撑这套版本演进与科学审计，排行榜上的每一个分数都必须附带**完整的原始凭证（Full Receipts for Every Row）**——公开每一次 Trial 的完整交互轨迹（Trajectory）、容器日志（Logs）、最终产出文件（Artifacts）与逐项得分明细（Rewards），让任何人都能随时核查与重评。

## 原课程阅读清单与导读

- [Terminal-Bench project site (leaderboard, tasks, and harness).](https://www.tbench.ai/)
  导读：浏览任务库与排行榜，观察每道终端任务的目录结构以及排行榜如何公开每次运行的完整轨迹凭证（Receipts）。
- [Merrill et al. "Terminal-Bench: Benchmarking Agents on Hard, Realistic Tasks in Command Line Interfaces." ICLR (2026).](https://arxiv.org/abs/2601.11868)
  导读：重点阅读任务构建原则、Harbor 沙箱隔离架构、多阶段任务质量审查流程以及对主流模型与 Agent 底座的错误模式分析。

## 动手练习

1. **构建一个完整的 Harbor 风格终端评测任务**：围绕“清洗一份包含缺失值与异常时区时间戳的服务器访问日志 `/app/access.log`，按小时统计独立 IP 数与 5xx 错误率并输出至 `/app/hourly_report.json`”这一场景，编写完整的任务四件套：（a）完全指定且自然简洁的 `instruction.md`；（b）`environment/Dockerfile`；（c）真实调用 Python/Awk 处理日志的参考解 `solution/solve.sh`；（d）检查输出 JSON 结构与精确数值的 `tests/test_outputs.py`。
2. **假阴性与作弊防御演练**：针对你编写的 `test_outputs.py`，构造（a）一个“数值完全正确、但 JSON 键顺序不同或浮点数保留了 4 位小数”的合理解法，检查你的 Verifier 是否会误判为 `FAIL`（假阴性）；（b）一个试图在 `/app/` 下搜寻测试脚本的作弊命令，说明如何通过容器信任域隔离彻底阻断该行为，并判断修复 `test_outputs.py` 的浮点数容差属于 Major、Minor 还是 Patch 版本更新。
