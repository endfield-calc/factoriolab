| Flag                              | 功能(存在推测，可能不准)                 |
|-----------------------------------|-------------------------------|
| beacons                           | 信标塔(Factorio专属建筑，对范围内的设备提供加成) |
| beltStack                         | 传送带可以堆叠物品                     |
| consumptionAsDrain                | 将工作能耗用作待机能耗并无视工作能耗            |
| diminishingBeacons                | 信标塔(Factorio专属建筑)的有效功率会衰减     |
| duplicators                       | 复制品(Final Factory专属道具)加成插槽    |
| expensive                         | 这个似乎是遗留的已经无用的                 |
| fuels                             | 燃料                            |
| hideMachineSettings               | 隐藏机器设置                        |
| inactiveDrain                     | 待机能耗和工作能耗不会叠加                 |
| inserterEstimation                | 估算信标塔(Factorio专属建筑)效果         |
| flowRate                          | 管道流速                          |
| fluidCostRatio                    | 流体成本比例(由于硬编码，是Factorio专属)     |
| maximumFactor                     | 限制最高效率                        |
| minimumFactor                     | 限制最低效率                        |
| minimumRecipeTime                 | 限制最小合成时间                      |
| miningDepletion                   | 采矿点会消耗                        |
| miningProductivity                | 采矿产能                          |
| miningSpeed                       | 采矿速度                          |
| miningTechnologyBypassLimitations | 采矿和科技研究的插槽不受限制                |
| mods                              | 可选择额外Mod                      |
| overclock                         | 机器可超频                         |
| pollution                         | 有污染值设定                        |
| power                             | 能量                            |
| proliferator                      | 增产剂插槽                         |
| quality                           | 机器和插件有品质设定                    |
| researchSpeed                     | 研究速度加成                        |
| resourcePurity                    | 资源纯度插槽                        |
| somersloop                        | 索莫晶体(Satisfactory专属道具)加成插槽    |
| wagons                            | 货车运输                          |

部分flag只在单个游戏中出现，下表没提到的大部分其实都是只在Factorio出现

| Flag               | 游戏                   | 备注                                                                                                              |
|--------------------|----------------------|-----------------------------------------------------------------------------------------------------------------|
| consumptionAsDrain | Satisfactory         | 这玩意是因为这游戏的机器即使没有满速运行电力消耗也是百分百，所以这个项目就直接把工作功耗变成0然后用待机功耗来算了(因为原本的计算逻辑在机器数量有小数的时候工作功耗直接乘小数，而待机功耗是向上取整算，这样就不用改计算逻辑) |
| duplicators        | Final Factory        |                                                                                                                 |
| inactiveDrain      | Dyson Sphere Program |                                                                                                                 |
| proliferator       | Dyson Sphere Program |                                                                                                                 |
| resourcePurity     | Satisfactory         |                                                                                                                 |
| somersloop         | Satisfactory         | 由于还没仔细研究源码，不明白为什么要专门写一个特殊功能，看起来异星工厂的插件槽已经能解决这个索莫晶体的需求了                                                          |

其它信息：

- 目前{游戏flag`duplicators`}等效{游戏flag`resourcePurity`+配方flag`mining`}，效果是增加一个效率插件插槽。但显然后者的语义更通用，前者这个单词只有Final Factory在使用
- 部分功能仅在游戏flag`quality`存在时才有效，但我的建议是发现有什么不生效再去研究看是不是这个的问题，因为很难列出到底有哪些是受`quality`影响的
