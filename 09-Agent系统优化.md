# 第 09 讲｜Agent 系统优化

来看看在同一个数学推理基准上，仅仅改变提示词里的一句引导语，PaLM 2-L-IT 模型的准确率会发生怎样的变化：
- 提示 A：`Let's think step by step.` $\to$ **71.8%**
- 提示 B：`Take a deep breath and work on this problem step-by-step.` $\to$ **80.2%**
- 提示 C：`Let's combine our numerical command and clear thinking to quickly and accurately decipher the answer.` $\to$ **74.5%**

相差将近 9 个百分点！但工程师显然不可能把宝贵的时间都耗在像炼丹一样凭直觉猜“到底是让模型深呼吸还是喝杯咖啡更好”上。当一个复合 AI 系统包含了五六个串联的模块、复杂的工具协议和成千上万行代码时，手工拼凑提示词很快就走到了尽头。

**系统优化（Optimization）** 的核心思想，正是让我们不再靠手工试探，而是**通过数据（Data）与评测指标（Evals/Metrics）明确表达系统意图，用算法自动搜寻最优的上下文提示（Context/Prompts）、模型权重（Weights）乃至系统架构（Harness）**。本讲将系统拆解从少样本示范自举（STaR、DSPy Bootstrap）、反思式与贝叶斯提示演化（OPRO、MIPROv2、TextGrad、GEPA），到 Agent 轨迹上的权重训练（SFT、PPO、GRPO 与在线策略蒸馏 On-Policy Distillation），再到自我演化代码的智能体（Darwin Gödel Machine、Meta-Harness、Autoresearch），并给出在工程实践中“何时优化提示词、何时优化模型权重”的决策准则。

## 学习目标

- 理解优化 AI 系统的三大前提（领域数据、可优化系统参数、可靠的评测指标），明确优化在“最后一公里（Last-mile Adaptation）”中的核心价值。
- 掌握上下文与提示词优化算法：理解 Few-shot 排序熵准则、推理轨迹拒绝采样自举（STaR / DSPy Bootstrapping）、OPRO、MIPROv2（三阶段贝叶斯组合搜索）、TextGrad（文本反馈反向传播）与 GEPA（帕累托遗传提示演化）。
- 深入掌握面向 Agent 的模型权重优化算法：对比基于轨迹的监督微调（SFT）、近端策略优化（PPO 的四模型架构与裁剪目标）、组相对策略优化（GRPO 的无 Critic 组内归一化优势估计）以及在线策略蒸馏（On-Policy Distillation）。
- 了解将 Agent 本身作为优化器的前沿探索（Darwin Gödel Machine、Meta-Harness、Autoresearch），并掌握权衡提示优化、权重微调与交替联合优化（BetterTogether）的工程路线图。

## 知识讲解

### 1. 优化的前提

#### 提示效果需要测量

为什么随着基础大模型越来越强，我们依然需要针对具体系统做优化？因为通用基础模型提供的是面向全网平均分布的通才方案，而你的企业应用面临的是**最后一公里适配问题（Last-mile Adaptation）**——你的业务有特定的领域文档格式、特定的工具返回怪癖、特定的安全红线与延迟预算。

很多时候，复杂的业务要求很难仅靠人工在提示词里写几条抽象规则就表达清楚，反而**一批具有代表性的输入输出样本（Data）加上一个严格的自动评分函数（Eval Metric），能够更精确地定义“什么叫作好结果”**。

#### 先打好三根支柱

在启动任何自动化优化算法之前，必须确认 AI 系统的三根支柱已经全部就位：
1. **代表性数据（Data）**：划分好严格的训练集（Train）、开发验证集（Dev）与独立测试集（Test）；
2. **参数化系统（System）**：明确系统中哪些部分是可被算法修改的自由度（是各个模块的指令文本、少样本示例槽位，还是底层模型的权重参数）；
3. **可信的评测指标（Eval + Metric）**：如果评测指标本身有漏洞或与真实业务目标脱节，优化算法越强大，系统就会越快地朝着错误方向过拟合（Reward Hacking）。

### 2. 示范选择与早期提示优化

#### Few-shot 排序敏感性

最轻量级的上下文优化对象是**少样本示例（Few-shot Demonstrations）的选择与排列顺序**。早期的上下文学习研究（Lu et al., 2022，《Fantastically Ordered Prompts and Where to Find Them》）发现了一个令人惊讶的现象：给模型提供完全相同的 4 个少样本示例，仅仅调换它们在提示词中的先后顺序，模型的分类准确率就可以在“接近随机瞎猜”和“接近最优上限”之间剧烈摆动！

如果在没有带标签验证集的情况下，如何自动挑出最优的示例排列顺序？Lu et al. 提出利用一个无标注的探测集（Probing Set），通过两个信息论熵指标来筛选排序：
- **高全局熵（High Global Entropy）**：好的排序应当让模型在整个探测集上的预测类别分布保持均衡，而不是不管输入什么都一边倒地全部预测为类别 `0`（避免类别坍缩 Bias）；
- **低局部熵（Low Local Entropy）**：对于探测集中的单条具体样本，模型给出的预测概率分布应当自信明确，而不是模棱两可。

#### STaR 与 rejection sampling

在复杂推理与 Agent 任务中，仅有最终的输入—输出标签对（$(x, y)$）是不够的，少样本示例里如果包含完整的**中间思维链推理步骤（Reasoning Traces）**，效果会好得多。但人工手写几十条高质量的思维链既费时又枯燥。

**STaR（Self-Taught Reasoner, Zelikman et al., 2022）** 提出了利用**拒绝采样（Rejection Sampling）自举挖掘推理轨迹**的经典思路：让模型自己在训练集问题 $x$ 上尝试生成“推理过程 $r$ + 最终答案 $\hat{y}$”；然后用已知的真实标签 $y$（或评测函数）去检验 $\hat{y}$ 是否正确——如果最终答案正确，就把这条模型自己生成的推理过程 $(x, r, y)$ 保留下来作为高质量示范（若失败，还可给模型提示标准答案让其反向补写合理推导 Rationalization），用于后续微调或上下文学习。

#### DSPy bootstrapping

**DSPy（Khattab et al., 2023/2024）** 将这一自举思想直接推广到了多阶段复合程序中，且**完全无需微调模型权重**：
1. 将训练集样本输入给未优化的完整多模块程序运行；
2. 如果整个程序的最终输出在全局 `metric` 上得高分，优化器就自动将该次运行中**每一个中间模块实际发生过的（输入，推理过程，输出）轨迹全部记录下来**，放入候选示范池；
3. 随后在开发集（Dev Set）上随机搜索或组合不同模块的示范子集，选出整体得分最高的一组 Few-shot 示例固化到程序中。实验表明，这种由模型自己跑通并经指标筛选出的自举示范，效果往往超越人工手写的示范。

#### OPRO

除了优化少样本示例，能不能让大模型自动改写任务指令（Instructions）？DeepMind 提出的 **OPRO（Optimization by PROmpting / Large Language Models as Optimizers, Yang et al., 2024）** 构建了一个元提示（Meta-Prompt）闭环：将过去尝试过的若干条历史指令及其在训练集上的准确率得分按升序排列展示给优化器大模型，要求它分析高分指令的规律并提出一条全新的候选指令；评测新指令得分后再将其加入历史列表继续迭代（开头提到的 `Take a deep breath and work on this problem step-by-step` 正是 OPRO 自动搜索发现的经典高分指令）。

### 3. MIPRO、TextGrad 与 GEPA

#### MIPRO 的示范引导

当系统包含多个串联或分支调用的模块时，单靠 OPRO 那样只看一个总分盲猜指令效率很低。为此，**MIPROv2（Multiprompt Instruction Proposal Optimizer, Opsahl-Ong et al., 2024）** 设计了一套结合**自举示范、受控指令提议与贝叶斯优化**的三阶段算法：
- **阶段一：自举多阶段示范（Bootstrap Demonstrations）**：先在训练集上多次运行程序，用 `metric` 过滤收集各模块的成功推理与输出轨迹，构建每个模块的候选少样本示范集合（`Demo Set 1 ... N`）。

#### Grounded instruction proposal

- **阶段二：基于多元上下文锚定的指令提议（Grounded Instruction Proposal）**：为了让提议模型（Proposal LM）写出的候选指令真正贴合当前模块在整体程序中的职责，MIPROv2 为提议模型收集了四项关键锚定信息（Grounding Context）：
  1. **程序感知摘要（Program-Aware Grounding）**：阅读整个程序的代码结构，总结出整套系统要解决什么问题以及当前子模块扮演什么角色；
  2. **数据感知摘要（Data-Aware Grounding）**：抽样观察训练数据集，总结输入特征的分布规律与潜在噪声；
  3. **已成功的自举轨迹（Successful Bootstrapped Traces）**：展示几条刚才在阶段一中跑通的真实输入输出样本；
  4. **随机提示工程技巧（Prompting Tips）**：每次随机附带一条引导策略（如“赋予相关专家角色”、“强调关键约束场景”或“保持指令极简清晰”）。

结合这四项证据，提议模型为每个模块生成 $N$ 条各具特色的候选指令（`Instruction 1 ... N`）。

#### Bayesian optimization 与组合搜索

- **阶段三：贝叶斯优化组合搜索（Bayesian Optimization over Combinations）**：现在每个模块都有了 $N$ 条候选指令和 $M$ 组候选少样本示范，组合空间呈指数级增长，如果每一种组合都在全量训练集上跑一遍，成本将无法承受。
  MIPROv2 引入了基于树结构帕森估计器（TPE）的**贝叶斯代理模型（Bayesian Surrogate Model）**：维护对每条指令和每组示范好坏的后验信念（Beliefs），每次根据当前信念采样一组“指令 + 示范”填入程序，仅在一个**小批量数据（Minibatch）**上快速运行评估并更新信念分布；每隔若干轮小批量迭代，再把当前最有希望的顶尖组合拿到全量验证集上做一次完整评估，最终输出最优程序配置。

#### 鸢尾花分类示例与机制边界

在课件演练的鸢尾花（Iris）分类玩具示例中，我们可以直观看到这一机制的威力与边界：Data-Aware Grounding 准确识别出花瓣长度（`petal_length`）和宽度（`petal_width`）比花萼特征更具区分度；但同时也要注意，通过“结果正确（Metric High）”筛选出来的自举思维链，其内部的文字解释未必每一句都符合严谨的领域科学事实（例如模型可能在最终分类正确的情况下，在 `rationale` 里写出了不太精确的数值对比描述）。因此，如果下游业务不仅要求最终标签正确，还要求中间解释完全合规，就必须把对解释质量的检查也写进 `metric` 中。

#### TextGrad

除了用贝叶斯搜索挑组合，能不能像神经网络反向传播梯度那样，让错误反馈沿着多步调用链一步步往回传？**TextGrad（Yuksekgonul et al., 2024）** 提出了**“文本梯度（Textual Gradients）”**的优雅类比：
- 当多阶段程序输出最终结果后，评估模型不再只给一个冷冰冰的数字分数，而是写出一段具体的自然语言批评：“最终报告漏掉了第三季度的风险对比，因为上游检索模块提供的摘要过于简略”；
- 框架将这段自然语言批评当作“文本梯度”，沿着计算图反向传播给上游模块，指导大语言模型像梯度下降更新参数一样，定向修改上游模块的系统提示词。

#### GEPA 的反思与 Pareto frontier

在复杂的 Agent 任务中，一条提示词往往在样本 A、B 上表现好，另一条提示词在样本 C、D 上表现好——如果每次只保留“平均总分最高”的那唯一一条提示词，其他在特定长尾难题上有独到之处的提示词就会被过早淘汰。

**GEPA（Genetic Pareto Prompt Evolution, Agrawal et al., 2026）** 将**诊断性反思变异（Reflective Mutation）**与**帕累托前沿进化选择（Pareto Frontier Selection）**结合了起来：
1. **基于失败轨迹的反思变异**：当父代提示词在某批任务上出错时，反思模型直接阅读完整的工具调用与报错轨迹，针对性地提出修复该类错误的子代提示词；
2. **维护帕累托前沿（Pareto Frontier）**：系统保留所有在验证集**至少某一个任务子集上取得最高分（未被其他候选全面支配）**的精英提示词集合；
3. **跨分支交叉融合**：在进化过程中，将擅长处理不同边界情况的帕累托前沿提示词进行优势合并，从而不断推高整体性能上限，在多项基准上仅靠少量反思迭代便超越了消耗海量采样轨迹的强化学习方法。

#### PAPILLON 案例与基线口径

在课件展示的 **PAPILLON（隐私保护提示委派系统，Siyan et al., 2025）** 案例中，系统包含两个模块：本地可信小模型先将包含用户隐私的原始请求改写为脱敏的通用查询，发给外部强大的不可信大模型获取参考解答，最后再由本地模型结合隐私信息合成最终回复。通过运行 GEPA 演化这两个模块的提示词，原本只有两三句话的简短基线提示词，自动进化成了包含严密脱敏准则、结构化占位符替换与分步合成规范的详尽工程指令，在兼顾回答质量与隐私零泄露的综合指标上获得了大幅提升。

### 4. 权重优化：SFT 与强化学习

#### 监督学习的轨迹来源

当上下文与提示词优化触及底层模型自身的能力天花板，或者我们希望将昂贵大模型的复杂推理能力固化到一个低延迟、低成本的轻量级模型中时，就需要进入**模型权重优化（Weight Optimization）**。

权重优化的第一步通常是**在 Agent 交互轨迹上进行监督微调（SFT on Agent Rollouts）**。训练轨迹怎么来？一般通过让强大的教师模型（Teacher LLM）在真实或合成环境中运行 ReAct、CodeAct 等多种推理模式，并用验证器过滤保留那些最终成功解决问题的轨迹（如 **FireAct**、**OpenThoughts-Agent** 等工作），然后让小模型（Student LLM）通过最小化动作与思考 Token 的交叉熵损失进行模仿学习。

#### RL 的学生自身采样

然而，纯靠模仿教师轨迹的 SFT 有一个根本弱点——**暴露偏差（Exposure Bias / Off-policy Distribution Shift）**：教师模型实力强，走的都是顺风顺水的正确路径；而学生模型上线自己跑的时候，一旦在第二步犯了一个小错，进入了一个教师轨迹里从未出现过的错误状态，学生模型就彻底不知所措了。

要让学生模型学会在自己实际会犯错的状态下自我纠错，就必须引入**在线强化学习（On-Policy Reinforcement Learning）**：让学生策略 $\pi_\theta$ **自己去环境中采样生成轨迹（Rollouts）**，根据环境或奖励模型给出的回报信号更新自身权重。

#### PPO 的四个角色

在深度强化学习与 RLHF 中，最经典的算法是 **近端策略优化（PPO: Proximal Policy Optimization）**。在标准的 PPO 训练流水线中，显存里通常需要同时维护**四个模型角色**：
1. **策略模型（Policy / Actor Model, $\pi_\theta$，需训练）**：正在被优化的 Agent 模型本身，负责生成动作 Token；
2. **参考模型（Reference Model, $\pi_{\text{ref}}$，冻结参数）**：通常是 SFT 结束时的初始模型副本，用于计算 KL 散度惩罚 $\text{KL}(\pi_\theta \parallel \pi_{\text{ref}})$，防止策略模型在追求高奖励时走火入魔、语言能力崩坏；
3. **奖励模型（Reward Model, $R_\phi$，冻结参数）**（或在 RLVR 中直接由确定性代码/单元测试替代）：对完整轨迹给出标量奖励得分；
4. **价值评估模型（Critic / Value Model, $V_\psi$，需训练）**：一个与策略模型尺寸相当的网络，负责预测每个时间步状态的期望累计回报，用于配合广义优势估计（GAE）计算每一步动作究竟比平均预期好多少（即**优势函数 Advantage $A_t$**）。

#### PPO clipping

如果一步梯度更新把策略改得太猛，强化学习极易发生训练崩溃。为此，PPO 定义了新旧策略对同一动作 $a_t$ 的概率比值 $r_t(\theta) = \frac{\pi_\theta(a_t \mid s_t)}{\pi_{\text{old}}(a_t \mid s_t)}$，并通过**裁剪替代目标函数（Clipped Surrogate Objective）**限制单步更新幅度：

$$\mathcal{L}^{\text{CLIP}}(\theta) = \hat{\mathbb{E}}_t \left[ \min \left( r_t(\theta) \hat{A}_t, \ \text{clip}(r_t(\theta), 1 - \epsilon, 1 + \epsilon) \hat{A}_t \right) \right]$$

当优势 $\hat{A}_t > 0$（说明这步动作是个好动作）时，我们增大它的概率，但一旦概率比值 $r_t(\theta)$ 超过 $1 + \epsilon$（如 $1.2$），$\text{clip}$ 项就会把目标函数截平，阻止梯度继续盲目推高该动作；反之当 $\hat{A}_t < 0$（坏动作）时，一旦比值低于 $1 - \epsilon$（如 $0.8$）也停止继续过度打压，从而保证了策略更新的平稳可靠。

#### GRPO 的组内相对奖励

PPO 虽然稳健，但在大模型训练中有一个巨大的工程负担：**必须额外训练并驻留一个与策略模型一样庞大的 Critic（Value）模型**，这直接吃掉了近一半的显存与算力，而且在长链条推理中很难把逐 Token 的 Value 函数训准。

能不能彻底砍掉 Critic 模型？DeepSeek 提出的 **组相对策略优化（GRPO: Group Relative Policy Optimization，Shao et al., 2024）** 给出了极其简洁高效的解法：
1. 对于同一个输入问题 $q$，直接让当前旧策略 $\pi_{\text{old}}$ 一次性并行采样生成**一组（Group）共 $G$ 条候选输出** $\{o_1, o_2, \dots, o_G\}$；
2. 用奖励模型或可验证代码评分器分别为这 $G$ 条输出算出标量奖励 $\{R_1, R_2, \dots, R_G\}$；
3. 直接用**这一组输出内部的奖励均值与标准差**做归一化，作为每一条输出的优势估计 $\hat{A}_{i, t}$：
   $$\hat{A}_{i, t} = \frac{R_i - \text{mean}(R_1, \dots, R_G)}{\text{std}(R_1, \dots, R_G)}$$

凡是在同组里得分高于本组平均水平的轨迹，其优势 $\hat{A}_i > 0$，受到正向强化；低于本组平均水平的轨迹，$\hat{A}_i < 0$，受到抑制！

#### GRPO 目标与边界

通过用“同组采样的均值”替代庞大的 Critic 网络，GRPO 将训练所需的模型数量从 4 个精简到了 3 个（若采用代码可验证奖励 RLVR，连神经 Reward Model 也省去，仅需训练中的 Policy 与冻结的 Reference），大幅降低了显存开销，成为现代推理模型与代码/搜索 Agent 强化学习的首选基石：

$$\mathcal{J}_{\text{GRPO}}(\theta) = \mathbb{E}_{q, \{o_i\}_{i=1}^G \sim \pi_{\text{old}}} \left[ \frac{1}{G} \sum_{i=1}^G \frac{1}{|o_i|} \sum_{t=1}^{|o_i|} \left\{ \min\left( r_{i,t}(\theta)\hat{A}_{i,t}, \ \text{clip}(r_{i,t}(\theta), 1-\epsilon, 1+\epsilon)\hat{A}_{i,t} \right) - \beta \mathbb{D}_{\text{KL}}(\pi_\theta \parallel \pi_{\text{ref}}) \right\} \right]$$

在工程实现 GRPO 时需要注意一个边界条件：如果某道题太简单（同组 $G$ 次采样全部拿满分 $1$）或太难（$G$ 次采样全部拿 $0$ 分），组内标准差 $\text{std}(R) = 0$，此时所有优势均为 $0$，该样本不提供有效梯度信号（在代码中计算除法时需加上平滑项 $\epsilon_{\text{std}}$ 防止除零错误，并在课程数据筛选中剔除全对或全错的无区分度样本）。

### 5. On-policy distillation

#### 在学生实际状态上获得教师反馈

如果既有强大的教师模型（Teacher），又想避免纯 SFT 的分布偏移和纯 RL 标量奖励过于稀疏的问题，能不能将两者结合起来？**在线策略蒸馏（On-Policy Distillation, Agarwal et al., 2024）** 提供了两全其美的路径：
1. **轨迹由学生自己采样（On-Policy Rollouts）**：让学生模型 $\pi_\theta$ 自己在任务环境中生成推理与动作序列 $y \sim \pi_\theta(\cdot \mid x)$，确保训练覆盖的是学生真实会遇到的状态分布；
2. **监督信号由教师逐 Token 给出（Dense Teacher Feedback）**：将学生生成的轨迹前缀交给强大的教师模型 $\pi_{\text{teacher}}$，计算教师在每一个位置 $t$ 上预测的完整词表概率分布，通过最小化学生分布与教师分布之间的反向或前向 KL 散度来更新学生权重。

#### 与 SFT 和 RL 的区别

把这三种权重优化方法放在一起对比，它们在**“谁负责采样轨迹”**与**“谁提供什么粒度的监督信号”**上形成了清晰的互补矩阵：

| 训练范式 | 轨迹采样者（Who rolls out?） | 监督信号粒度（What feedback?） | 核心优势 | 主要局限 |
|---|---|---|---|---|
| **监督微调（SFT）** | 教师模型或专家（Off-policy） | 沿教师轨迹的稠密 Token 级交叉熵 | 训练最简单稳定，快速习得基础格式 | 存在暴露偏差，学生一旦走偏不知如何自救 |
| **强化学习（PPO / GRPO）** | 学生模型自身（On-policy） | 整条轨迹末尾的**稀疏标量奖励**（每条轨迹仅 1 个数） | 能在自身状态分布上探索并超越教师上限 | 信用分配（Credit Assignment）难，采样开销大 |
| **在线策略蒸馏（On-Policy Distillation）** | 学生模型自身（On-policy） | 教师在学生轨迹每个位置给出的**稠密 Token 分布** | 兼顾自身状态覆盖与逐 Token 密集指导，样本效率极高 | 需要在线访问教师模型的 logits 分布，上限受教师制约 |

### 6. Harness 和程序自优化

#### Darwin Gödel Machine

既然提示词和模型权重都可以被算法优化，那包裹在模型外面的 **Agent 代码与运行底座（Harness）** 能不能由 Agent 自己动手修改优化？

**达尔文哥德尔机（Darwin Gödel Machine, DGM, Zhang et al., 2025）** 探索了能够自我改写代码的开放式进化 Agent：
1. 系统本身是一个具备读写自身源码权限的编码 Agent；
2. 在每一轮迭代中，系统提出一项改进自身工具或控制流的代码补丁，并在 SWE-bench 等编程基准上实际运行验证得分；
3. 与传统“永远只在最新一版代码上继续改”的贪心搜索不同，DGM 维护了一个**进化种群档案库（Archive of Agents）**——每次按候选父代的评测得分与目前已繁衍后代数量（鼓励探索尚未充分挖掘的分支）概率抽样选择父代进行变异，从而避免了因单次局部修改退化而锁死全局进化路径。

#### MetaHarness

同样聚焦于底座自动优化的 **Meta-Harness（Lee et al., 2026）** 则构建了一个外层元智能体（Meta-Agent）：它能够查阅文件系统中保存的所有历史 Harness 变体代码、完整评测日志与失败轨迹，通过对比分析定位当前底座在上下文管理或工具反馈上的短板，自动编写并验证新一代 Harness 架构。

#### Autoresearch 风格循环

在日常研发中，这种“让 Agent 自主做实验优化系统”的思想可以落地为受控的 **自动化研究循环（Autoresearch Loop，如 Karpathy 的 `autoresearch` 范式）**：给定一个受限的代码仓库（例如只允许 Agent 修改训练脚本或检索模块）、一个固定的单卡运行时间预算（如每次实验跑 5 分钟）以及一个不可篡改的验证集指标。Agent 循环执行：**阅读历史实验记录 $\to$ 提出假设并修改代码 $\to$ 运行实验测量指标 $\to$ 若指标提升则 `git commit` 保留改动，若指标退化则 `git reset` 回退 $\to$ 开启下一轮实验**。

> **安全与评测铁律**：在运行任何自修改或 Autoresearch 循环时，**评测脚本、验证集数据与计分环境必须置于只读隔离区**，严禁被测 Agent 修改评测代码或偷看测试集标准答案。

### 7. 选择优化路线

#### BetterTogether

面对上下文提示优化（Prompt Optimization）与模型权重微调（Weight Optimization），我们应该选哪一个？Soylu et al.（2024）在 **BetterTogether** 研究中证明：**这两者并非互斥，交替进行“提示优化 $\to$ 权重微调 $\to$ 再次提示优化”往往能取得超越任何单一手段的最佳效果**。因为权重更新后，模型的行为特性发生了变化，原本针对旧权重搜出的最佳提示词未必依然最匹配新权重，再次运行提示优化能够充分释放新模型权重的潜力。

#### 什么时候先优化提示

在工程实践中，推荐始终遵循**“先优化上下文/提示词，遇到瓶颈后再优化权重”**的演进路线。以下场景应当优先采用上下文与提示优化（如 MIPROv2、GEPA）：
- 只有商业闭源模型的黑盒 API 访问权限，无法修改底层权重；
- 处于业务探索早期，任务需求、工具 Schema 与评价标准每周都在快速变更；
- 手头只有几十到几百条标注样本，希望在几分钟到几小时内以几美元的极低成本快速拿到显著收益。

#### 什么时候考虑权重

而在以下场景中，则值得投入资源开展模型权重微调（SFT、GRPO 或在线蒸馏）：
- 提示词优化已经触及明显瓶颈，无论怎么改写指令和塞入少样本示例，底层模型依然无法掌握复杂的领域工具逻辑或多步推理；
- 希望将原本需要冗长提示词 + 昂贵超大模型才能完成的任务，蒸馏内化到一个轻量级开源小模型中，以大幅降低线上高并发推理的延迟与单次 Token 成本；
- 已经积累了数千条以上经过严格验证的高质量轨迹数据，或者拥有可自动化大规模采样的可验证强化学习环境（RLVR）。

## 原课程阅读清单与导读

- [Agrawal et al. "GEPA: Reflective Prompt Evolution Can Outperform Reinforcement Learning." ICLR (2026).](https://arxiv.org/abs/2507.19457)
  导读：理解为什么基于完整错误轨迹的自然语言反思（Reflective Mutation）比标量奖励包含高得多的诊断信息量，以及帕累托前沿选择如何保持候选提示词的多样性。
- [Opsahl-Ong et al. "Optimizing Instructions and Demonstrations for Multi-Stage Language Model Programs." EMNLP (2024).](https://arxiv.org/abs/2406.11695)
  导读：完整梳理 MIPROv2 的三个阶段（Bootstrap Few-shot、Grounded Instruction Proposal、Bayesian Surrogate Search），理解多阶段程序中模块间联合优化的必要性。
- [Shao et al. "DeepSeekMath: Pushing the Limits of Mathematical Reasoning in Open Language Models." arXiv (2024).](https://arxiv.org/abs/2402.03300)
  导读：重点精读第 4.1 节中 GRPO 与 PPO 的架构对比图及公式推导，掌握组内相对优势归一化如何消除独立 Value 网络的显存负担。

## 动手练习

1. **手工推导 GRPO 组内相对优势**：假设针对同一道编程题，策略模型采样生成了 $G = 4$ 条轨迹，经单元测试验证器打分得到的奖励分别为 $R = [0.0, 1.0, 1.0, 0.2]$。请计算该组的均值 $\mu$、标准差 $\sigma$ 以及每条轨迹归一化后的相对优势 $\hat{A}_i$，并分析哪几条轨迹的对数概率会在梯度更新中被推高、哪几条会被压低。
2. **闭环提示演化实验**：基于 HW1 第 1 题（邮件优先级分类 `priority`），将公开的 60 条标注样本按 40/20 划分为开发集与留出测试集。先测试你的初始手写提示词在开发集上的准确率与混淆矩阵；随后收集开发集上的所有错判案例，模仿 GEPA 的反思步骤编写一段诊断提示，让大模型针对错判原因修改分类准则，最后在从未参与调优的 20 条留出测试集上检验准确率是否提升。
