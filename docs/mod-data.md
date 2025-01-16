# 模组数据需求内容

## 目录

- [分类](#分类)
- [图标](#图标)
- [物品信息](#物品信息)
  - [machine参数](#machine参数)
  - [module参数](#module参数)
  - [fuel参数](#fuel参数)
  - [technology参数](#technology参数)
- [配方信息](#配方信息)
- [地点](#地点)
- [限制](#限制)

## 分类

分类本质上是为了方便组织不同类型的物品，在该计算器中万物皆物品，但可以通过分类方便用户识别，分类的id和名称是可以任意指定的(
例如：item、machine、tech、upgrade、order等)

| 字段       | 类型                  | 描述                            |
|----------|---------------------|-------------------------------|
| id       | string              |                               |
| name     | string              | 支持i18n                        |
| icon     | string \| undefined | 图标，大小固定为64x64                 |
| iconText | string \| undefined | 图标说明，用于在图标无法显示时显示文字代替，一般不需要提供 |

---

## 图标

各种物品、配方、地点都需要有对应的图标，图标大小固定为64x64

其它项目的id与图标id相同时可以自动匹配，需要使用不同id的图标才需要指定图标id

| 字段          | 类型                   | 描述                                           |
|-------------|----------------------|----------------------------------------------|
| id          | string               |                                              |
| position    | string               | 图标坐标，满足正则/-?(\d+)px -?(\d+)px/               |
| color       | string               | 图标颜色，这一项可以使用`srcipts/calculate-color.ts`自动计算 |
| invertLight | boolean \| undefined | 设为true可在浅色主题下自动反色，可用于主要由浅色构成的图标              |

---

## 物品信息

| 字段         | 类型                              | 描述                                                 |
|------------|---------------------------------|----------------------------------------------------|
| id         | string                          |                                                    |
| name       | string                          | 支持i18n                                             |
| category   | string                          | 物品分类                                               |
| row        | number                          | 在同一个分类中显示在第几行，通过良好的定义可以让用户选择物品时更方便快捷               |
| stack      | number \| undefined             | 该物品的最大堆叠数量，不填则视为流体，并且会影响货车运输的计算                    |
| beacon     | object \| undefined             | 目前是只有Factorio(异星工厂)存在的一个设定，该物品为插件分享塔，可以为范围内的机器提供加成 |
| belt       | {speed: number} \| undefined    | 该物品为传送带，speed为每秒运输多少个物品                            |
| pipe       | {speed: number} \| undefined    | 该物品为流体管道，speed为每秒运输多少单位流体                          |
| machine    | object \| undefined             | 该物品为机器，拥有机器相关参数                                    |
| module     | object \| undefined             | 该物品为插件，可以对机器产生特殊效果(例如增减效率、增减耗能等)                   |
| fuel       | object \| undefined             | 该物品为燃料，拥有燃料相关参数                                    |
| cargoWagon | {size: number} \| undefined     | 该物品为物品专用货车(厢)，size为车厢大小                            |
| fluidWagon | {capacity: number} \| undefined | 该物品为流体专用货车(厢)，capacity为车厢容量                        |
| technology | object \| undefined             | 该物品为研究科技(而非真正意义上的物品)，拥有科技相关参数                      |
| icon       | string \| undefined             | 图标，大小固定为64x64                                      |
| iconText   | string \| undefined             | 图标说明，用于在图标无法显示时显示文字代替，一般不需要提供                      |

### machine参数

| 字段                | 类型                                   | 描述                                                                                                                  |
|-------------------|--------------------------------------|---------------------------------------------------------------------------------------------------------------------|
| speed             | number \| undefined                  | 工作速度(相对于配方耗时的百分比)，不提供则使用配方物品输入速度自动计算。大部分游戏中的机器都没有根据传送带输入情况改变制造配方速度的设定，所以都应该填写，一个不需要填写的示例是戴森球计划的重氢分馏，传送带走得越快分馏塔效率越高。 |
| modules           | number \| true \| undefined          | 可使用插件数量，`true`为无限数量，不提供则不可使用插件                                                                                      |
| disallowedEffects | string[] \| undefined                | 禁止影响的属性，可指定部分属性不会被插件影响(例如固定耗能)                                                                                      |
| type              | 'electric' \| 'burner'               | 需求能量类型，二选一，电力或烧物品                                                                                                   |
| fuelCategories    | string[] \| undefined                | 可用燃料类型，只在能量类型为`burner`时有效                                                                                           |
| fuel              | string \| undefined                  | 只有某个特定物品能作为燃料，只在能量类型为`burner`时有效                                                                                    |
| usage             | number \| undefined                  | 工作耗能，单位kW，只在能量类型为`electric`时有效                                                                                      |
| drain             | number \| undefined                  | 待机耗能，单位kW，只在能量类型为`electric`时有效                                                                                      |
| pollution         | number \| undefined                  | 工作造成的污染值，目前只见到Factorio(异星工厂)存在该设定                                                                                   |
| silo              | object \| undefined                  | 发射井相关参数，可设定需求配件数量和发射时间，目前只见到Factorio(异星工厂)存在该设定                                                                     |
| consumption       | {\[p: string\]: number} \| undefined | 该机器工作需要固定消耗特定物品，单位/min                                                                                              |
| size              | \[number, number\] \| undefined      | 该机器的占地面积(不要求顺序，一个长一个宽即可)，会影响配方成本计算，占地越大的机器成本越高                                                                      |
| baseEffect        | {\[p: string\]: number} \| undefined | 固定属性影响，该机器永远都有这个属性加成(例如某特殊机器制造任意配方都能提高20%效率)                                                                        |
| totalRecipe       | boolean \| undefined                 | 如果为true，按配方数量而非机器数量统计(例如在戴森球计划中一台矿机盖6个矿和两台矿机各盖3个矿是一样的，就需要设置这个属性为true)                                               |
| entityType        | string \| undefined                  | 实体类型，目前仅和品质设定有关，而且硬编码的异星工厂的参数，所以可以不管                                                                                |
| locations         | string[] \| undefined                | 限制该机器可用区域，不提供则无限制                                                                                                   |
| ingredientUsage   | number \| undefined                  | 输入使用百分比，配方的输入会乘上这个值，不影响输出(例如本来2矿产1锭，这里填0.5，就变成1矿产1锭，需要注意这个值对所有配方都生效)                                                |

### module参数

| 字段           | 类型                  | 描述                                  |
|--------------|---------------------|-------------------------------------|
| consumption  | number \| undefined | 能量消耗增加百分比，可为负数(例如0.2就是增加20%能量消耗，下同) |
| pollution    | number \| undefined | 污染增加百分比                             |
| productivity | number \| undefined | 产量增加百分比                             |
| quality      | number \| undefined | 品质增加百分比                             |
| speed        | number \| undefined | 生产速度增加百分比                           |
| limitation   | string \| undefined | 要求配方ID在指定类型的限制中才能生效                 |
| sprays       | number \| undefined | 喷涂量，戴森球计划专属的一个设定，会影响喷涂机的消耗计算        |
| proliferator | string \| undefined | 所属的增产剂ID，戴森球计划专属的一个设定，会影响喷涂机的消耗计算   |

### fuel参数

| 字段       | 类型                  | 描述                     |
|----------|---------------------|------------------------|
| category | string              | 燃料类型                   |
| value    | number              | 燃料热值，单位MJ              |
| result   | string \| undefined | 燃烧结果(例如满燃料棒的燃烧结果是空燃料棒) |

### technology参数

| 字段              | 类型                    | 描述         |
|-----------------|-----------------------|------------|
| prerequisites   | string[] \| undefined | 前置需求科技     |
| unlockedRecipes | string[] \| undefined | 研究完成后解锁的配方 |

---

## 配方信息

| 字段                | 类型                                   | 描述                                                                                                  |
|-------------------|--------------------------------------|-----------------------------------------------------------------------------------------------------|
| id                | string                               |                                                                                                     |
| name              | string                               | 支持i18n                                                                                              |
| category          | string                               | 配方分类                                                                                                |
| row               | number                               | 在同一个分类中显示在第几行，通过良好的定义可以让用户选择物品时更方便快捷                                                                |
| time              | number                               | 配方耗时，单位/秒                                                                                           |
| producers         | string[]                             | 生产设备(物品ID列表)                                                                                        |
| in                | {\[p: string\]: number}              | 输入的物品ID及对应数量                                                                                        |
| out               | {\[p: string\]: number}              | 输出的物品ID及对应数量                                                                                        |
| catalyst          | {\[p: string\]: number} \| undefined | 催化剂的物品ID及对应数量(虽然不知道为什么叫这个名字，但是实际上的效果是让部分输出的物品不受效率加成影响，例如输出a是5个，这里填a为4，生产效率为两倍，那么最终产出就是4+(5-4)*2=6个) |
| cost              | number \| undefined                  | 配方成本，最终成本会加上机器的成本、配方数量、各种因子，计算结果会选择最终成本最低的方案(例如对不同等级的矿物开采设置成本，或者对一些高价值的/困难的配方设置成本)                  |
| part              | string \| undefined                  | 指定火箭部件的配方ID，目前只在异星工厂用到                                                                              |
| usage             | number \| undefined                  | 配方专属能量需求，会覆盖机器的能量需求                                                                                 |
| disallowedEffects | string[] \| undefined                | 禁止影响的属性，可指定部分属性不会被插件影响(例如固定产量)                                                                      |
| locations         | string[] \| undefined                | 限制该机器可用区域，不提供则无限制                                                                                   |
| flags             | string[] \| undefined                | 配方flag，参考[recipe-flags.md](recipe-flags.md)                                                         |
| icon              | string \| undefined                  | 图标，大小固定为64x64                                                                                       |
| iconText          | string \| undefined                  | 图标说明，用于在图标无法显示时显示文字代替，一般不需要提供                                                                       |

---

## 地点

用于限制某些配方或机器仅在特定地点可用

| 字段       | 类型                  | 描述                            |
|----------|---------------------|-------------------------------|
| id       | string              |                               |
| name     | string              | 支持i18n                        |
| icon     | string \| undefined | 图标，大小固定为64x64                 |
| iconText | string \| undefined | 图标说明，用于在图标无法显示时显示文字代替，一般不需要提供 |

---

## 限制

指定某些插件只能对部分配方生效

格式为`{[p: string]: string[]}`
