| Flag             | 描述                                         |
| ---------------- | -------------------------------------------- |
| mining           | 挖矿                                         |
| activity         | 工业活动限定配方，包含据点换券配方           |
| activity-{key}   | 关联活动目录中的 key，按该活动的开放阶段筛选 |
| technology       | 科技/研究                                    |
| plant            | 种植                                         |
| burn             | 燃烧（例如满燃料棒烧完变成空燃料棒）         |
| recycling        | 回收（配方成本会与回收类权重相乘）           |
| locked           | 锁定（需要研究特定科技解锁）                 |
| noCostMultiplier | 配方不受材料成本倍率影响                     |
| infinite         | 机器数量按百分比表示                         |
| showCount        | 即使没有生产设备，也显示机器数量             |

配方省略 `producers` 时不显示生产设备；地点限制仍由配方的 `locations` 表示。

对于不需要显示设备数量的情况，可以在机器中设置 `hideRate: true`。
