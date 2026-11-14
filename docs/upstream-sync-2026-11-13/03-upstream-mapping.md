# 架构与重写设计

上游路径以 `00bdb91c2442cd8d715501b9469cec115735645f` 为分析基线。本文的独立目录、扩展契约和接点是目标设计，固定上游尚未提供这些接口；实施时要显式添加并验证，不能假设现有依赖注入已自动支持。

## 1. 复用上游与重写本地功能的边界

| 方面 | 当前分支                                   | 上游基线                          | 目标处理                                                  |
| ---- | ------------------------------------------ | --------------------------------- | --------------------------------------------------------- |
| 框架 | Angular18/TypeScript5.5/Zone.js            | Angular22/TypeScript6/zoneless    | 保留上游依赖与初始化，不带回旧package-lock或NgZone假设    |
| 界面 | PrimeNG/Bootstrap/SCSS                     | CDK、上游基础组件、Tailwind/CSS   | 重写资源面板、指南和显示能力，使用上游组件                |
| 状态 | Store服务加组件effect协调                  | `src/state`各Store                | 保留通用Store，终末地额外状态独立，使用明确命令与恢复边界 |
| 数据 | `src/data`及旧模型                         | `public/data`与`src/data/schema`  | 转换aef，保留ID和协议含义；沿用上游解析与通用调整         |
| 计算 | 特殊逻辑散布在组件、归一化和SimplexService | Adjustment、Normalization、Solver | 规则编译集中；上游求解器只增加通用变量/约束接点           |
| URL  | v11隐藏目标和cet                           | RouterSync/Migration v12          | 旧编码限于兼容模块，新状态使用独立扩展段                  |
| 流图 | Cytoscape与旧样式                          | D3 SVG/ELK                        | 复用上游渲染与交互，仅接入准备后的数据和产品命名          |
| 发布 | `dist/browser`                             | `dist/factoriolab/browser`        | 本地发布脚本配置目的地、素材、release与最终SW哈希         |

来源：[上游依赖](https://github.com/factoriolab/factoriolab/blob/00bdb91c2442cd8d715501b9469cec115735645f/package.json)、[应用初始化](https://github.com/factoriolab/factoriolab/blob/00bdb91c2442cd8d715501b9469cec115735645f/src/app/app.config.ts)、[构建配置](https://github.com/factoriolab/factoriolab/blob/00bdb91c2442cd8d715501b9469cec115735645f/angular.json)。

## 2. 目录与依赖方向

| 目标位置                             | 职责                                                                | 依赖限制                                                        |
| ------------------------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------- |
| `src/extensions`                     | 中立接入契约、上游默认实现、注入token                               | 不含终末地ID、配额、别名和部署地址                              |
| `src/endfield/product`               | 产品身份、允许的数据集/路由、语言策略、默认值、链接、资源与导出命名 | 配置不直接修改Store或DOM                                        |
| `src/endfield/domain`                | 资源模型、预设、校验、成本策略、约束编译、展示规则                  | 纯函数及不可变值；不依赖Angular、Router、localStorage或GLPK对象 |
| `src/endfield/state`                 | 额外状态Store、动作、恢复协调、计算扩展输入快照                     | 不复制上游ObjectivesStore或SettingsStore                        |
| `src/endfield/compat`                | v11及更早aef解码、冻结hash、别名、旧偏好映射                        | 只在导入边界读旧协议，不传播11–14到新业务模型                   |
| `src/endfield/adapters`              | 将领域规则转换为四类中立契约，复用上游公开模型和调整服务            | 集中处理上游类型变化；不调用私有方法、不重写整套准备流程        |
| `src/endfield/ui`                    | 资源面板、指南、电力权重字段和本地展示组件                          | 复用上游控件；只发送动作或读取视图模型                          |
| `public/data/aef`、`public/endfield` | 游戏包、品牌素材、额外翻译与manifest源素材                          | 与上游系统精灵图分开，必要公共图标仍保留                        |
| `scripts/endfield`                   | schema/hash转换、翻译合成、按站点打包与发布准备                     | 只生成数据和产物，不正则替换TypeScript、不覆盖上游大类          |

依赖方向为：上游通用模块→中立契约；终末地适配器→中立契约与上游公开类型；应用组合入口→终末地提供者。上游注册表中必要的游戏身份声明属于登记接点，其他通用模块不能直接导入 `src/endfield`。

独立目录是集中维护位置，不是再实现一个应用框架。接入契约只服务现有需求，不建设动态插件市场、任意脚本执行或完整多游戏扩展平台。

CalculationExtension的derive/rules阶段只接收不可变值，不注入Adjustment、Normalization或会间接依赖调用方的服务。成本策略由本地Adjustment适配器在上游公开adjustCosts/adjustObjective入口调用纯领域函数，不通过CalculationExtension反向取得Normalization。ObjectivesStore使用自己已持有的Adjustment/Normalization准备扩展返回的声明。StateExtension只依赖独立额外状态，不注入RouterSync或计算Store，由RouterSync驱动恢复计划与提交。跨Store动作在UI适配/协调层提交，不能放进上述只读/编解码提供者形成依赖环。

## 3. 四类接入契约

| 契约                  | 输入与输出                                                                       | 上游默认行为                       | 终末地实现                                                       |
| --------------------- | -------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| ProductProfile        | 产品文本、资源引用、公开能力、有效默认快照与语言初始化策略                       | 上游原品牌、目录和默认值           | aef单游戏、EndfieldLab品牌、现行语言规则、kW/BoxLine及成本默认值 |
| CalculationExtension  | 不可变的调整后数据、目标、配方设置、通用设置和额外状态；输出派生目标与声明式约束 | 目标原样，额外约束为空             | 固定采矿供给、机器额度、传输和净水规则                           |
| StateExtension        | 命名空间、版本、快照读写、兼容解码与校验结果                                     | 无扩展状态，使用原上游恢复与序列化 | 旧类型11–14/cet导入、ef扩展段、冻结hash与别名                    |
| PresentationExtension | 实体、语言、已准备数据及owner；输出显示、动作能力、分派和链接计划                | 上游原有展示                       | 名称开关、隐藏生产者、额外面板、步骤owner操作与指南              |

默认实现必须可独立启用，能运行上游通用夹具。终末地提供者在 `app.config` 等组合入口一次绑定；不是在每个调用位置传gameId后分支选择。

新增界面翻译使用 `public/endfield` 的独立词典源，构建时按语言合成到上游预期的 `public/i18n` 产物；新增键与有意覆盖的品牌键分开登记。该合成不是运行时第二套语言选择器。英文游戏翻译请求与ModI18n扩展通过SettingsStore的数据适配接点处理，不复制Translate服务。

### 3.1 统一的有效默认快照

ProductProfile通过默认值工厂生成新建及重置工作区使用的只读EffectiveDefaults，含通用Settings、Preferences及扩展状态；初始化时克隆，不修改上游模块级常量。无终末地提供者时返回上游原默认值。

Store初始值、modified判断、成本/流图对话框及全局重置使用同一有效默认快照。数据集/preset已有的派生默认机制继续复用，Rational按值比较。旧链接缺字段解释与差分编码基准单独冻结：ProductProfile的serializedCostDefaults只提供历史unproduceable/recycling两项差量，其余普通字段仍由上游schema与编解码器处理。

新建及重置沿上游unproduceable=100000000、recycling=1，保留终末地surplus=1、电力权重1、BoxLine和kW。v12的省略基准仍为旧上游的1000000/1000，所以新默认显式写cun/cre；用户将surplus设0仍须写csu=0。对话框普通成本和电力权重共同暂存，Reset只改草稿，确认才提交，取消不写状态。

已支持的非空v0–12链接在普通解码后补历史两项成本，再由显式值覆盖；旧hash仍只用于v11及更早。ef版本1扩展字段继续使用固定默认值。真空query使用新工作区默认；无query旧书签与新空工作区无法区分，属于明确的默认变化。只有改变省略基准时才需增加协议标记，当前保持v12/ef1。偏好语言的初始快照在生产按浏览器规则生成，再由已保存偏好覆盖。

## 4. 资源状态、命令和恢复

### 4.1 单一状态来源

终末地计算状态保存：原料限制开关与六项供给率、机器限制开关与额度、传输开关/来源、电力权重、派生供给的配方设置及无物料派生行的勾选集合。供给内部统一为Rational每秒，面板明确显示每分钟；预设只有定义数据，不再保存第二套实时数值。名称显示等本地偏好单独保存，不纳入计算输入或ef。

净水禁用由上游 `excludedRecipeIds` 唯一保存，面板从两个配方是否同时排除派生；不在终末地Store或ef段另存一个布尔值。节点规则始终由可用变量编译，禁用动作只改这两个ID，保留其余排除项。

普通目标继续由上游ObjectivesStore保存，只含用户目标0–3。派生供给目标有稳定的本地命名空间ID及owner标记，属于计算输入，不写回普通目标Store，不参与标题、拖拽顺序或“新增目标继承数值”。

### 4.2 动作边界

面板通过“应用预设、修改供给、设置机器额度、设置传输、切换净水、清空资源配置、修改电力权重”等动作提交。涉及地区和排除项的动作由协调器一次生成一致快照，再允许求解与URL写回；不会先产生半套普通状态、稍后再用effect补另一半。

清空只重置资源配置、相关地区和预设规定的节点行为，不删除普通目标，不重置独立的电力权重或用户其他排除项。关闭限制与“启用但额度全0”是不同状态。输入错误在领域边界给出结构化诊断，不用NaN、空ID或0值静默代替。

### 4.3 恢复生命周期

恢复流程为读取来源→解压/旧协议解码→提取特殊目标与别名→完成数据加载及校验→提交普通状态和扩展状态→ready。完整恢复成功之前不启动面板默认值反写、自动求解或新URL序列化。

不使用300/700ms定时器、不在computed中修改目标、不让多个effect互相删除/重建目标。发生新导航时旧恢复结果不得覆盖新方案；非法输入保留原始URL并提示，未校验状态不得覆盖有效存档。

### 4.4 步骤操作与目标归属

完整计算上下文不只是读索引，还提供步骤的设置owner、勾选owner和操作能力。普通目标属于ObjectivesStore，自动配方属于RecipesStore，派生供给属于稳定的资源owner；仅凭recipeObjectiveId非空不能决定写入哪个Store。

| 操作                        | 普通路径                                  | 派生供给路径                                                                             |
| --------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| 切换机器及适用的燃料/插件等 | 复用上游目标/共享配方设置操作             | 写入独立resourceRecipeSettings，按同一上游规则清理失效设置，重新计算固定供给的机器当量   |
| 重置步骤                    | 保留上游物品设置与配方设置各自的重置语义  | 物品设置仍走上游；派生配方设置仅清对应owner，不插入幽灵普通目标，不顺带关闭资源限制      |
| 删除/排序普通目标           | 操作ObjectivesStore                       | 不开放对派生ID的普通删除/排序；资源开关与配额通过资源动作改变                            |
| 勾选与清空勾选              | 保留物品优先，再按普通目标/配方的现有归属 | 有itemId仍用checkedItemIds；仅无物料派生行用独立checkedDerived集合，清空操作覆盖两类集合 |
| 标号与定位                  | 普通目标按原顺序编号                      | 显示资源来源或定位入口，不冒用普通目标序号，不进入och的普通目标索引                      |
| 步骤链接                    | 保留上游普通目标链接语义                  | 保留当前完整计算设置并定位资源面板，不把派生行再次转换为普通Machines Output              |

PresentationExtension提供owner与能力描述及动作分派，所有步骤写入口、重置、勾选、全清和stepHref遵循同一规则。派生设置可以改变，不能以全部禁用行操作代替保留原功能；显式“新增普通目标”应生成具有完整targetId/单位/值的新普通记录，不继承派生ID。

resourceRecipeSettings按稳定资源ID保存，支持当前机器实际适用的设置字段，随ef序列化。改变单项供给保留该设置，应用预设或清空资源配置按预设语义重置其资源设置，不重置独立电力权重。旧类型12携带的适用设置和旧勾选归属在导入时映射，不能只提取数值后丢掉。

同一配方同时有用户显式目标和派生供给时，可能出现无itemId的配方行；该行的链接必须仍指向原资源配置，不新增第二份普通供给。设置owner和勾选owner分开判定，避免改变上游物品勾选优先级。

## 5. 计算准备与求解

### 5.1 复用原准备流程

SettingsStore、MachinesStore、RecipesStore及Adjustment继续完成上游的数据、机器、速度、功耗和地点准备。本地EndfieldAdjustment通过DI替换产品的Adjustment服务，仅覆写公开adjustCosts和adjustObjective：领域成本策略读取原始声明成本、最终选用机器、配方设置和电力快照，只覆盖成本字段，不重复调整速度、功耗或物料。普通配方沿adjustDataset的原生成本阶段处理；显式及派生目标在super.adjustObjective后使用同一成本函数。RecipesStore不再二次遍历覆盖成本。

该出口仍是统一的调整数据来源。Solver、步骤、图、导出及数据详情的成本都消费同一准备结果；不能只改Solver输入而让RecipeDetail显示另一套成本。电力权重在本地面板编辑并进入扩展状态，通用CostKey和上游成本对话框无需增加aef专属字段。

### 5.2 一个完整计算上下文

ObjectivesStore通过中立接点建立一次计算上下文，包含可见普通目标、求解用归一化目标、步骤用完整目标设置记录、准备后的数据、额外约束和输入版本。无扩展时保持上游原路径。

扩展纯阶段只返回派生ObjectiveState、owner、适用设置和规则声明；ObjectivesStore用自身已注入的Adjustment/Normalization执行准备及归一化，再把得到的值交给纯规则编译阶段。成本适配器调用纯函数，不注入Normalization或计算Store。候选恢复准备独立使用原Adjustment，不读取实时Endfield电力。步骤归一化按派生recipeObjectiveId读取完整设置；展示和写操作再按owner分派。上游steps当前只取普通objectives()，必须与matrixResult、勾选读取及操作接点一起接入，不能只修改求解入口。

### 5.3 规则先编译，模型后构造

领域编译器输出语义变量引用、上下界、共享预算、整数标记及约束来源，不返回GLPK Variable对象。上游模型接点负责将普通配方变量和显式配方目标变量映射到这些引用，合并同一规则下的全部实例，并检测缺失或重复绑定。

机器归属以实际选择的生产者为准。洪炉例外、传输批次和净水系数来自集中规则表；不再在通用求解器中扫描字符串前缀或硬编码aef。规则只绑定当前实际构造的变量，未进入模型的候选贡献为0；稀疏子集仍应用剩余系数。无变量且0满足约束时可以略过，不满足则报告不可行。派生目标或旧输入指向不存在的数据实体则报告诊断，不能借“本次无变量”静默丢掉目标。

模型只要存在整数变量就执行MIP；simplex/exact选择只决定LP准备。状态、变量值和目标值全部取同一个最终解，整数路径读取对应MIP数据，并按模型实际系数复算成本。失败状态不能回落成“成功”的LP松弛结果。

数学、整数例外和成本系数以[04](04-data-and-solver-contracts.md)为准。正供给仍是固定采矿产出并允许盈余，不因新模型更整洁而改成凭空输入或另一种目标函数。

## 6. 上游接入落点

以下是有限接点的预期位置，不是要求整文件替换。每个实际改动都登记到[09](09-upstream-maintenance.md)。

| 上游位置                                          | 通用接点                                                                               | 本地实现归属                                  |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------- |
| `src/app/app.config.ts`                           | 提供默认/产品扩展实现                                                                  | product与adapters                             |
| `src/data/datasets.ts`、`game.ts`、`game-info.ts` | 注册身份，公开目录由ProductProfile筛选                                                 | product与aef数据包                            |
| `app.config.ts`、landing/header                   | 在组合根装配原Routes的产品guard，显式处理editor顶层路由；共享路由表和guard保留上游字节 | ProductProfile及本地providers，不能只隐藏按钮 |
| PreferencesStore/SettingsStore初始化              | 统一EffectiveDefaults用于初始、缺字段恢复、差分编码、modified及重置                    | 现行语言选择及aef成本默认值                   |
| SettingsStore的数据/i18n资源出口                  | 数据格式和名称/版本翻译适配                                                            | 数据适配器，不复制数据Store                   |
| Adjustment公开adjustCosts/adjustObjective         | 在原生调整流程内计算成本，保留同一份可供详情读取的调整结果                             | 本地Adjustment适配器及领域成本策略            |
| ObjectivesStore计算入口及steps出口                | 完整上下文、两类目标的设置索引、owner和勾选读取                                        | 资源编译与准备适配器                          |
| `src/solver/solver.ts`及模型类型                  | 声明式约束绑定、通用整数求解与结果读取                                                 | 领域只给规则，不直接依赖GLPK                  |
| RouterSync/Migration                              | 旧协议前置解码、扩展状态变更订阅、ef读写与原子恢复                                     | compat与StateExtension                        |
| `display-rate.ts`                                 | 增加通用PerDay与86400因子                                                              | 有边界测试的小型通用改动                      |
| main/picker/steps/数据详情                        | 有限页面插槽、展示及步骤动作/链接owner分派                                             | 本地UI与PresentationExtension                 |
| Title/Release/Exporter/日志入口                   | 从统一产品配置取值，统计默认实现可替换                                                 | 品牌和禁用统计策略                            |
| 构建与工作流                                      | 调用本地资产/发布入口，保留上游质量检查                                                | `scripts/endfield`与独立工作流                |

源码依据：[目标与步骤计算入口](https://github.com/factoriolab/factoriolab/blob/00bdb91c2442cd8d715501b9469cec115735645f/src/state/objectives/objectives-store.ts#L53-L107)、[配方准备](https://github.com/factoriolab/factoriolab/blob/00bdb91c2442cd8d715501b9469cec115735645f/src/state/recipes/recipes-store.ts)、[RouterSync](https://github.com/factoriolab/factoriolab/blob/00bdb91c2442cd8d715501b9469cec115735645f/src/state/router/router-sync.ts)、[Solver](https://github.com/factoriolab/factoriolab/blob/00bdb91c2442cd8d715501b9469cec115735645f/src/solver/solver.ts)。

## 7. 功能等价和缺陷修复

等价检查对象是用户可完成的操作、保存状态、物理量、约束和目标函数含义，不是代码、组件树、隐藏枚举空隙、行顺序或布局像素。默认主题使用上游light实现，BoxLine/kW等功能默认保留。

可明确修复的问题包括整数求解未启用、节点子集和显式目标漏约束、机器误归属、LP/MIP成本混用、排序丢失、hash错解、退休目标被过滤及恢复竞争。每项修复对应一个能区分正确/错误实现的验收；未证明为缺陷的业务选择不应被悄悄替换。

普通配方成本与显式目标直接系数的区别、资源固定供给和洪炉整数例外仍按04执行。旧实现中的偶然状态和错误输出不限制设计改进，但“方便维护”不能成为丢功能、改产率或改存档含义的理由。

接点边界证据：[差分编码默认值](https://github.com/factoriolab/factoriolab/blob/00bdb91c2442cd8d715501b9469cec115735645f/src/state/router/router-sync.ts#L949-L969)、[步骤写操作](https://github.com/factoriolab/factoriolab/blob/00bdb91c2442cd8d715501b9469cec115735645f/src/components/steps/steps.ts#L190-L257)、[配方设置写入](https://github.com/factoriolab/factoriolab/blob/00bdb91c2442cd8d715501b9469cec115735645f/src/state/objectives/objectives-store.ts#L729-L753)、[Normalization依赖](https://github.com/factoriolab/factoriolab/blob/00bdb91c2442cd8d715501b9469cec115735645f/src/state/normalization.ts#L24-L28)。
