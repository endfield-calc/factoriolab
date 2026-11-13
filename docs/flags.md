| Flag                              | 功能                                      |
| --------------------------------- | ----------------------------------------- |
| beltStack                         | 传送带可以堆叠物品                        |
| consumptionAsDrain                | 将工作电耗作为待机电耗计算                |
| duplicators                       | 复制品（Final Factory 专属道具）加成插槽  |
| hideMachineSettings               | 隐藏机器设置                              |
| inactiveDrain                     | 待机能耗和工作能耗不会叠加                |
| flowRate                          | 管道流速                                  |
| fluidCostRatio                    | 流体成本比例                              |
| lowEffectPrecision                | 使用较低的插件效果精度                    |
| maximumFactor                     | 限制最高效率                              |
| minimumFactor                     | 限制最低效率                              |
| minimumRecipeTime                 | 限制最小合成时间                          |
| miningDepletion                   | 采矿点会消耗                              |
| miningProductivity                | 采矿产能                                  |
| miningSpeed                       | 采矿速度                                  |
| miningTechnologyBypassLimitations | 采矿和科技研究的插件不受配方限制          |
| mods                              | 可选择额外模组                            |
| overclock                         | 机器可超频                                |
| pollution                         | 有污染值设定                              |
| power                             | 有能耗设定                                |
| proliferator                      | 增产剂插槽                                |
| recipeCostMultiplier              | 配方材料成本倍率                          |
| researchProductivity              | 研究产能加成                              |
| researchSpeed                     | 研究速度加成                              |
| resourcePurity                    | 资源纯度插槽                              |
| rockets                           | 火箭运输                                  |
| somersloop                        | 索莫晶体（Satisfactory 专属道具）加成插槽 |

部分 flag 只在特定游戏中使用：

| Flag               | 游戏                           | 备注                                                   |
| ------------------ | ------------------------------ | ------------------------------------------------------ |
| consumptionAsDrain | Satisfactory、明日方舟：终末地 | 将工作电耗转成待机电耗；待机电耗按机器数量向上取整计算 |
| duplicators        | Final Factory                  |                                                        |
| inactiveDrain      | Dyson Sphere Program           |                                                        |
| proliferator       | Dyson Sphere Program           |                                                        |
| resourcePurity     | Satisfactory、明日方舟：终末地 |                                                        |
| somersloop         | Satisfactory                   |                                                        |

其它信息：

- 插件选项受到 `duplicators`、`resourcePurity`、配方的 `mining` 标记及机器可用插槽共同影响。
- 信标、燃料、品质和货车等能力由对应的数据实体决定，不再使用同名游戏 flag。
