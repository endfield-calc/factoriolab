| Flag           | 描述(存在推测，可能不准)                         |
|----------------|---------------------------------------|
| mining         | 挖矿                                    |
| technology     | 科技/研究                                 |
| burn           | 燃烧(例如满燃料棒烧完变成空燃料棒)                    |
| grow           | 种植                                    |
| recycling      | 回收(配方成本会与回收类权重相乘)                     |
| locked         | 锁定(需要研究特定科技解锁)                        |
| hideProducer   | 隐藏制造设备(可用于例如腐败配方，某新鲜物品经过一段时间后自动变成腐烂物) |
| canProdUpgrade | 可提升生产效率                               |


对于需要`hideProducer`的情况，可能会同时需要一个设置了`hideRate: true`的机器，可参考`data-spa.json`的`spoilage`相关设置

