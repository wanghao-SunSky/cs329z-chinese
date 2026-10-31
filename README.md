# 斯坦福 Stanford CS329Z 中文教程｜Engineering AI Agents

一套面向 Python 开发者的 AI 智能体（Agent）自学教程。围绕斯坦福大学 Stanford CS329Z 的公开材料，用中文讲解如何构建、评测和改进 Agent：从大语言模型、RAG、工具调用，到记忆、多 Agent 协作和安全防护。

Chinese study guide for Stanford CS329Z: Engineering AI Agents. Includes 19 lessons, 4 hands-on exercises, Markdown sources and an offline HTML reader.

**[在线阅读完整教程](https://cs329z-course-review-20261029.wanghao162263.chatgpt.site)** · **[课程目录与学习路径](course-guide.md)** · **[下载完整仓库](https://github.com/wanghao-SunSky/cs329z-chinese/archive/refs/heads/main.zip)**

## 包含什么

| 内容 | 入口 |
| --- | --- |
| 19 讲中文教程 | [从第 1 讲开始](01-Agent基础与全景.md) |
| 从零搭建 Agent、设计评测、课程项目、论文实践 | [实战练习](exercises/) |
| HW1 与第 5 讲配套代码的阅读指南 | [代码导读](code-guide.md) |
| 支持搜索、目录、深浅主题的网页，以及单文件离线版 | [HTML 文件](html/) |

适合会写 Python、了解基本 API 调用，希望系统学习 Agent 开发的读者。建议先读第 1–4 讲，再结合 HW1 动手实践；完整路线见课程目录。

## 本地阅读与构建

下载仓库后，直接用浏览器打开 `html/index.html`。只想保存一个文件，可以使用 `html/offline.html`。

修改 Markdown 后，在仓库目录运行（需要 Node.js 18+ 和 Python 3）：

```bash
node tools/build_site.mjs
python3 tools/verify_publication.py
```

## 来源与修订

本项目是独立整理的中文学习资料，并非 Stanford 官方中文版。原课程、论文和配套代码的权利归各自作者；来源入口、未公开材料及当前待修订问题见 [编写说明](docs/editorial-notes.md)。欢迎通过 [Issues](https://github.com/wanghao-SunSky/cs329z-chinese/issues) 反馈错误，注明章节和具体段落。
