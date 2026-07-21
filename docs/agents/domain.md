# Domain Docs

工程 skills 探索代码库时，应按以下规则使用本仓库的领域文档。

## 探索前读取

- 根目录的 `CONTEXT.md`
- `docs/adr/` 中与当前工作区域相关的 ADR

如果这些文件不存在，静默继续。不要报告缺失，也不要预先建议创建。`/domain-modeling` 会在术语或决策实际明确后按需创建它们。

## 文件结构

本仓库采用 single-context 布局：

```text
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-example-decision.md
│   └── 0002-another-decision.md
└── src/
```

## 使用 glossary 中的词汇

当输出内容命名领域概念时，例如 issue 标题、重构提议、假设或测试名称，应使用 `CONTEXT.md` 定义的术语，不要改用 glossary 明确排除的同义词。

如果 glossary 尚未包含所需概念，应重新判断该术语是否确有必要；若确有领域缺口，则记录给 `/domain-modeling`。

## 标记 ADR 冲突

如果输出内容与已有 ADR 冲突，应明确指出，而不是静默覆盖：

> 与 ADR-0007 冲突，但值得重新讨论，因为……
