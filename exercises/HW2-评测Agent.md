# HW2｜构建 Agent 评测体系（Evaluate an Agent）

在 HW1 中，我们扮演的是“系统构建者（Builder）”：围绕现成的测试套件与模拟评测框架，从零实现一个办公 Agent。而在真实的工业研发与科研中，通常不会有人替你提前写好现成的测试脚本——**你必须自己定义什么叫成功，并亲手打造测量系统能力的标尺**。

本项实践（对应课程第 10–14 讲的评测工程体系）的核心任务是：**给定一个预构建的 Agent 系统（例如你在 HW1 中完成的 Cardinal Energy Agent，或第 05 讲中的日历编排 Agent），为其设计并实现一套严谨、可复现的综合评测套件（Evaluation Suite）**。评测体系需完整涵盖以下五个核心工程模块：
1. **用四元组框架（Request、Environment、Stopping Criteria、Scorer）构建评测任务集**；
2. **实现确定性代码评分器（Code-based Graders）**；
3. **设计并校准至少一个大模型裁判（LLM-as-a-Judge Eval）**；
4. **构建支持环境重置与多次独立采样（$\text{pass}@k$ / $\text{pass}^k$）的评测运行底座（Evaluation Harness）**；
5. **开展系统性的错误分析（Error Analysis）与受控验证实验**。

## 1. 锁定被测系统与实验边界

在开始编写评测任务前，第一步是**冻结被测对象（System Under Test, SUT）的配置快照**，确保所有测量结果建立在严格的控制变量基础之上：
- 记录并固定被测 Agent 的代码版本（Git Commit）、底层主模型与辅助模型标识、采样温度（Temperature）、系统提示词、启用工具集的 Schema 以及默认预算上限（`max_turns`、`context_budget`）；
- 划分清晰的**开发校准集（Dev Tasks）**与**独立留出测试集（Held-out Test Tasks）**：开发校准集可用于调试评分器与优化 Agent，而独立测试集仅用于最终报告测量。

建议围绕办公助手（邮件、政策文档、终端与本地日历）构建一个包含 **15–20 个代表性任务** 的评测集，覆盖六个关键能力切片：
1. **单跳与多跳信息检索**：跨多封邮件或长文档合并关键事实；
2. **版本冲突与时效判断**：新旧两版政策并存时识别现行有效条款；
3. **工具异常与降级恢复**：工具返回非零退出码、空结果或权限被用户拒绝后的改道能力；
4. **模糊需求主动澄清**：关键参数缺失时主动调用 `ask_user` 而非盲目猜测；
5. **跨会话记忆延续与覆写**：在第二轮新会话中准确应用更正后的用户偏好；
6. **对抗性安全与防注入**：抵御外部邮件或文档中植入的间接提示注入与隐私诱导。

## 2. 使用四元组框架定义评测任务

每一个评测任务都应当定义为结构化的**四元组（Request, Environment, Stopping Criteria, Scorer）**，并配套提供一份可通过验证的参考解（Positive Oracle）与至少一份应当被判失败的反例（Negative Case）：

```yaml
id: policy-meal-limit-v2
slice: conflict_resolution
request: "请根据公司现行差旅政策，告诉我国内出差每日餐饮报销上限是多少，并注明所依据的文档编号与生效日期。"
environment:
  fixture_dir: "fixtures/policy_conflict_01"
  files:
    - "DOC-2024-03_Travel_Policy_Legacy.md"   # 旧版：上限 $60/天（已被废止）
    - "DOC-2026-01_Travel_Policy_Current.md"  # 现行：上限 $75/天（自 2026-01-01 起生效）
  enabled_tools: ["search_docs", "read_doc"]
  mode: "auto"
  reset_policy: "每次 Trial 创建全新临时工作区与空会话状态"
stopping_criteria:
  max_turns: 8
  context_budget: 8000
  total_token_budget: 24000
  timeout_seconds: 60
scorer:
  code_checks:
    - type: "substring_present"
      value: "75"
    - type: "tool_called_with"
      tool: "read_doc"
      arg_match: {"doc_id": "DOC-2026-01"}
    - type: "no_file_mutation"
  judge_rubric:
    - id: "correct_current_policy"
      criterion: "回答明确给出了现行每日 $75 的餐饮标准，且未将旧版 $60 标准当作现行标准。"
    - id: "accurate_citation"
      criterion: "回答准确指出了出处为 DOC-2026-01 及其 2026 年生效信息，无任何脱离文档证据的编造。"
```

**设计检查点**：逐条核对你的 `request` 与 `scorer` 是否严格对齐（1-to-1 Alignment）——确保没有任何一条 `code_checks` 或 `judge_rubric` 要求了 `request` 与 `environment` 中未曾提供的隐含条件。

## 3. 实现组合评分器并验证“裁判的可靠性”

### 确定性代码评分器（Code-based Graders）

编写确定性检查函数，对每一次 Trial 的最终环境状态与事件轨迹（Transcript）进行硬性断言：
- **状态与产物断言**：检查目标文件是否生成、内容/JSON 字段是否合规、只读任务中工作区是否未被意外篡改；
- **过程证据断言**：检查回答引用的文档或邮件 ID 是否确实在 Transcript 的 `tool_call` 中被成功读取过，检查被拒绝的危险命令是否零执行；
- **细粒度故障归类**：将未通过的 Trial 明确区分为 `wrong_answer`、`missing_citation`、`policy_violation`、`max_turns_exceeded`、`budget_exceeded`、`malformed_output` 或 `infra_error`，避免将所有失败笼统归为一个布尔值 `False`。

### 大模型裁判（LLM-as-a-Judge）与偏差校准

针对开放语义维度实现结构化的 LLM-as-Judge 评分器：
1. **结构化二元 Rubric 与反编造检查**：向 Judge 提供原始任务请求、Agent 最终回复以及从 Transcript 中提取出的工具调用证据摘要，要求 Judge 对每条判据先输出 `explanation`（引用具体证据）再输出 `passed: true/false`，并独立判定是否存在事实编造（`fabricated: true/false`）；
2. **人工一致性校准（Human-Judge Alignment）**：在 15–20 条真实或合成的候选回答样本上，先由人工独立标注每条 Rubric 的 `PASS/FAIL` 金标准，再运行你的 LLM-as-Judge，统计裁判的**真阳性率（TPR）**与**真阴性率（TNR）**；
3. **偏差压力测试（Bias Stress Test）**：
   - **冗长偏差测试（Verbosity Test）**：构造两份事实完全相同的回答（一份精炼准确，一份扩写 3 倍废话但包含一处细微数值错误），检验 Judge 是否会被长文迷惑；
   - **位置交换测试（Position Swap Test）**：若使用成对比较（Pairwise Judge），交换 `(A, B)` 与 `(B, A)` 的展示顺序，统计判罚翻转率（Flip Rate）。

## 4. 评测运行底座与非确定性统计（$\text{pass}@k$ 与 $\text{pass}^k$）

搭建自动化评测运行脚本，对评测集中的每个任务执行 $n$ 次独立重复试验（例如取 $n = 5$，每次使用不同的缓存盐值 `salt` 并彻底重置工作区环境）。

汇总生成结构化评测报告，包含以下核心指标：
1. **能力与可靠性双指标**：按切片与全局分别计算 $k = 1, 3, 5$ 时的探索上限 **$\text{pass}@k = 1 - \frac{\binom{n-c}{k}}{\binom{n}{k}}$** 与生产级一致性 **$\text{pass}^k = \frac{\binom{c}{k}}{\binom{n}{k}}$**；
2. **资源与效率分布**：统计每个任务的平均模型调用轮数、工具调用次数、输入/输出 Token 数、端到端耗时（P50 / P90）与单任务美元成本。

## 5. 错误归因分析与闭环改进实验

评测的最终目的是驱动系统改进。在完成基准测量后，按以下步骤完成闭环分析：
1. **逐条轨迹复盘与故障树归因（Transcript Inspection & Error Taxonomy）**：阅读所有失败 Trial 的完整 Transcript，找出每条轨迹**最早偏离正确轨道的那一步（First Point of Failure）**，将其归入检索召回缺失、上下文中间迷失、工具参数错误、过早终止、未主动澄清或评分器自身假阴性等类别，并绘制错误分布统计表；
2. **单变量受控改进（Controlled Intervention）**：针对错误占比最高的一类故障，在被测 Agent 上实施一项有针对性的修改（例如改进某一个工具的描述、优化上下文压缩摘要提示词或增加一步检索重排），在保持其余所有配置与预算不变的前提下重跑评测集，对比改进前后的 $\text{pass}@1$、$\text{pass}^k$ 与成本变化。

## 推荐项目结构与交付清单

```text
hw2-eval-suite/
├── README.md                 # 环境配置、一键运行评测与重评分（Rescore）说明
├── sut_config.json           # 锁定的被测 Agent 版本、模型参数与预算配置
├── tasks/                    # 四元组任务定义文件、初始环境 Fixtures 与正反例 Oracle
├── graders/
│   ├── code_checks.py        # 确定性状态与轨迹断言函数
│   └── llm_judge.py          # 结构化 LLM-as-Judge 实现与提示模板
├── harness/
│   └── runner.py             # 环境隔离重置、多轮独立采样与指标聚合引擎
├── runs/                     # 归档的原始 Transcripts、产物快照与逐项评分明细
└── report.md                 # 评测设计说明、Judge 校准数据、pass@k / pass^k 结果表与错误归因分析
```

## 质量验收清单

| 验收维度 | 达标标准 |
|---|---|
| **四元组完备性** | 每个任务的 `Request`、`Environment`、`Stopping Criteria`、`Scorer` 清晰无歧义；正例 Oracle 100% 通过，反例 100% 拦截。 |
| **环境隔离与可复现** | 每次 Trial 拥有独立工作目录与缓存盐值，多次运行互不污染；保存完整原始凭证（Full Receipts）支持离线重评。 |
| **评分器可信度** | Code Grader 准确覆盖硬约束；LLM Judge 经过人工样本校准（披露 TPR/TNR）并通过冗长与位置交换偏差测试。 |
| **非确定性与成本度量** | 完整报告各能力切片的 $\text{pass}@k$、$\text{pass}^k$、平均轮数、耗时与 Token 成本。 |
| **错误分析与归因深度** | 基于真实 Transcript 定位根因，展示至少一次“定位故障 $\to$ 定向修复 $\to$ 指标验证”的完整工程闭环。 |
