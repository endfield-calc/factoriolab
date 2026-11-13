# 游戏数据与求解契约

本文件给出迁移必须保持的数值语义。数据固定取自目标提交的 `src/data/aef`；不是对游戏当前正式版本的外部考据。ID、数量和版本均以该仓库快照为准。

## 1. 有效数据集与 schema 转换

有效输入为 `data.json`、`hash.json`、`icons.webp` 及 en/zh/ja/ru 四份游戏翻译。数据声明版本 `arknights-endfield: v1.5.3`，meta 指向本项目并标记来源 akedata。包含 161 个物品、257 条配方、254 个图标、5 个分类、2 个地点；其中有 34 个机器物品、59 条谷地传输配方、28 条 hideProducer 配方。

`data-dsp.json`、`data-sfy.json`、`data-spa.json`、`defaults-spa.json` 无有效运行引用，是遗留样例，不进入迁移数据。`resource/icons` 下的设计源文件可作为品牌素材来源，但无需全部进入浏览器包。

| 旧字段/机制                                      | 新版对应                         | 转换规则                                                                                                   |
| ------------------------------------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| flags 来自 `src/app/models/flags.ts` 的 aef 集合 | `ModData.flags`                  | 将 consumptionAsDrain、power、resourcePurity、hideMachineSettings 明确写入 aef 数据                        |
| 图标 position，如 `-64px 0px`                    | 图标 x/y                         | 解析为正坐标 x=64、y=0；保留 color、id、图集像素尺寸；不能把负号直接传给 viewBox                           |
| 物品 stack 缺失常被用来区分流体                  | `ItemJson.types`、物流 itemTypes | 实体物品通常为 item，液体/气体为 fluid；对虚拟 key、调度券、机器等逐类核对，不机械用“无 stack”推断所有实体 |
| 独立 `pipe` 子对象                               | 统一 `belt`                      | pipe 物品仍保持 id=pipe、速度 2/s，声明接收 fluid；belt 速度 0.5/s，声明接收 item                          |
| `minBelt/maxBelt/minPipe/maxPipe`                | beltRank 等 rank 数组            | 推荐单个自定义 preset：beltRank 包含 belt 与 pipe，locations 包含 tundra 与 jinlong，保留默认机器选择行为  |
| 顶层 defaults.locations                          | 新版自定义 preset 路径           | 使用新版已支持的 locations 通路，避免写到不读取 locations 的旧硬编码 preset 分支                           |
| `hideProducer`                                   | 新 schema 已移除                 | 保留其展示语义，见 [03](03-upstream-mapping.md)；不删除计算所需生产者                                      |
| `forceShowLabel`                                 | 新 schema 已移除                 | 兼容展示开关/局部元数据；当前数据没有实际引用                                                              |
| `ModI18n.name/version`                           | 新版只有实体名称映射             | 通过受控扩展或产品元数据恢复游戏名/版本翻译，不把名称翻译写成另一个游戏 id                                 |
| hash 仅含当前用到的部分数组                      | 新 `ModHash` 定义更多数组        | 对不存在的 beacons/fuels/wagons/modules/technologies 补空数组；原有数组索引保持稳定                        |
| meta、buildIcon 等生成器附加信息                 | 运行 schema 不直接消费           | 保留来源信息或明确放到构建元数据；图标叠加以实际图集为准，不承诺新运行时会读取旧扩展字段                   |

转换后物品、配方、地点和图标的 ID 集合与有效数据一一对应，配方输入、输出、耗时、地点和功耗不得因 schema 改名而变化。对旧不存在的质量、插件、燃料、货车、火箭等字段用空值，不凭空补出游戏能力。

分类是一个需要保留的展示例外：当前只有5个已注册分类，而 `machine`、`belt-and-pipe`、`__internal`、`__domain_transfer` 有实体引用但未注册。它们使机器物品、内部采矿用水/传输key、传输配方等不出现在普通分类选择器中，是现有隐藏方式。转换时保留这个可见性边界；可按新版可选 category 语义表达，但不要为了“修复引用”新增这些可见分类或删除其实体。物料、生产者、地点和图标引用应有效，未注册的展示分类应作为明确登记的例外。

来源：[固定 aef 数据](https://github.com/endfield-calc/factoriolab/blob/26a49e814f0570e050a19b726b3ba689d282aa3b/src/data/aef/data.json)、[新版 ModData](https://github.com/factoriolab/factoriolab/blob/00bdb91c2442cd8d715501b9469cec115735645f/src/data/schema/mod-data.ts)、[新版物流 schema](https://github.com/factoriolab/factoriolab/blob/00bdb91c2442cd8d715501b9469cec115735645f/src/data/schema/belt.ts)、[新版图标 schema](https://github.com/factoriolab/factoriolab/blob/00bdb91c2442cd8d715501b9469cec115735645f/src/data/schema/icon-data.ts)。

### 1.1 当前 hash 已有缺项，不能原样视作完整新表

静态比对数据和 hash 的结果如下。这里“缺少”是当前实体不在旧表中，“退休”是旧表仍有 ID 但当前数据已不存在，不能把这两类混为一谈。

| 数组                 | 当前实体缺项          | 旧表退休条目 | 处理                                               |
| -------------------- | --------------------- | ------------ | -------------------------------------------------- |
| items                | 11                    | 9            | 冻结旧表供旧协议解码，新表在原长度之后补齐当前缺项 |
| recipes              | 14                    | 22           | 同上；退休配方经明确别名或失效提示处理             |
| machines / locations | 0 / 0                 | 0 / 0        | 保持所有现有索引                                   |
| belts                | 新版统一管道后缺 pipe | 0            | 保留 belt 原索引，末尾追加 pipe                    |

11 个物品缺项为 activity_xiranite_lung、activity_xiranite_enr_lung、activity_xiranite_nugget、activity_xiranite_box、activity_copper_xiranite_tool、activity_copper_poly_gas、activity_copper_poly、activity_copper_poly_cmpt、activity_xiranite_enr_nugget、activity_copper_poly_tool、activity_xiranite_enr_box。

14 条配方缺项为 jinlong_coupon-activity_xiranite_lung、jinlong_coupon-activity_xiranite_enr_lung、activity_xiranite_lung、activity_xiranite_enr_lung、activity_xiranite_nugget、activity_xiranite_box、activity_copper_xiranite_tool、activity_copper_poly_gas、phase_trans_2-activity_copper_poly_gas、phase_trans_2-activity_copper_poly、activity_copper_poly_cmpt、activity_xiranite_enr_nugget、activity_copper_poly_tool、activity_xiranite_enr_box。

新上游的 updateHash 会把退休 ID 置 null，再由 addIfMissing 优先填入第一个 null。这会复用历史槽位，**不能直接用于需保持旧语义的 aef 表**。保留不可变的v11解码表，建立只追加的新表，并让 aef 的后续数据更新工具执行同样的规则：缺少的当前 ID 只能追加到末尾，退休 ID 的槽位不重新分配。对新旧协议明确选表；不以“索引大体没变”代替逐项验证。

验收应覆盖所有当前物品和配方的压缩编码→解码，并逐索引证明旧槽位含义不变，包括退休 ID。新增空数组、pipe 和实体缺项是不同工作，不能只补几组空数组就结束转换。

证据：[当前 aef hash](https://github.com/endfield-calc/factoriolab/blob/26a49e814f0570e050a19b726b3ba689d282aa3b/src/data/aef/hash.json)、[上游 hash 更新实现](https://github.com/factoriolab/factoriolab/blob/00bdb91c2442cd8d715501b9469cec115735645f/src/utils/hash.ts)。

## 2. 地点与资源预设

默认地点是 tundra（四号谷地）和 jinlong（武陵）同时启用。以下资源值的业务基准是每分钟；机器上限是实体数量。

| 预设         | 地点         | 源矿         | 紫晶矿 | 蓝铁矿 | 赤铜矿 | 息壤气 | 惰气 | 洪炉上限   | 传输来源 | 禁用净水节点 |
| ------------ | ------------ | ------------ | ------ | ------ | ------ | ------ | ---- | ---------- | -------- | ------------ |
| 四号谷地     | tundra       | 560          | 240    | 1080   | 0      | 0      | 0    | 不启用限制 | 无       | 不额外改写   |
| 武陵 1.5版本 | jinlong      | 540          | 0      | 120    | 510    | 150    | 460  | 12         | tundra   | false        |
| 清空设置     | 恢复默认地点 | 关闭原料限制 | —      | —      | —      | —      | —    | 关闭限制   | 无       | false        |

谷地预设的旧定义没有 disableWaterNode 字段，因此沿用已有禁用状态；武陵和清空显式恢复节点。这是当前配置对象的真实差别，不能把全部预设都当成无条件重置所有选项。

资源对应关系：

| 物品 ID       | 被配置的采矿配方 ID     |
| ------------- | ----------------------- |
| originium_ore | originium_ore           |
| quartz_sand   | quartz_sand             |
| iron_ore      | iron_ore                |
| copper_ore    | copper_ore-liquid_water |
| gas_xiranite  | gas_xiranite            |
| gas_inert     | gas_inert               |

赤铜矿依赖 `__miner_water`。不能把限制映射到物品同名配方，也不能将采矿替换成无成本外部输入，否则采矿用水、机器和功耗都会改变。

## 3. 原料限制的准确语义

旧面板启用原料限制后，对每种资源创建类型 11 的配方 Limit=0，阻止普通变量自由开采；对正数资源另创建类型 12 的配方 Output，数值为“输入值 ÷20”。这些类型在求解前分别转为普通 Limit 和 Output，且单位是 Machines。

当前对应基础配方均为每 3 秒产 1，速度 1 时每机器每分钟 20，所以 560 对应 28 个持续运行的采矿配方单位。**正数输入定义的是固定供给，不是总消耗上限**；未消耗部分可成为盈余，而默认 surplus 成本为 1 会影响最优方案。零输入表示禁用该普通采矿来源，不创建正供给目标。其他配方来源、地区和既有排除项仍应遵循数据及用户配置。

迁移时可继续用派生的配方目标表达等价物理量，也可直接形成等价约束；必须保留供给的机器、水、功耗与盈余。转换机器当量应依据调整后的单位产率；用当前数据验证其仍等于 ÷20，而不是把魔数 20 永久写进通用归一化逻辑。若用户显式改变机器导致产率不同，应有明确的数值测试。

面板关闭只清理由其生成的约束，不能移除用户普通 Output/Input/Maximize/Limit、checked 状态或其他 excluded 配方。旧载入流程对六种映射之外的目标、赤铜不同 ID、重复内部条目需要专门验收。

## 4. 单位统一

内部物流和供给率统一存为Rational每秒：秒、分、时、日对应因子1、60、3600、86400。资源面板明确固定显示每分钟，读写时只在边界乘/除60；结果显示单位切换不改变其供给快照，一键预设的数值同样按每分钟转入。机器额度和传输批次用各自数量类型，不混入速率类型。

以下不随显示速率改变：机器上限 12、净水额度 3、整数变量的离散数量。跨区预算固定为每小时 1 次，即内部 key 供给/消耗上限 `1/3600` 每秒，不能变成“当前显示单位下的 1 次”。

兼容旧链接时，必须遵循旧资源编码的机器当量数值，不能把类型 12 中的 28 解读为每分钟 28 个物品；机器类型 13 的 12 也不能按速率除以 60。

## 5. 天有洪炉的共享上限与整数变量

机器 ID 为 `xiranite_oven_1`。旧版把所有生产者集合包含该机器的普通配方变量，以及 Output/Maximize 显式配方目标变量的数量求和，约束 ≤ 配额；除 `xiranite_enr_powder` 外设置为整数。这个例外仍进入总额度，只是不强制整数。

新模型契约：

1. 普通变量与显式目标变量都进入相应机器的额度，不重复计数。
2. 以实际选中的机器判断归属；不能仅看候选 producers 列表而误计其他机器生产量。
3. `xiranite_enr_powder` 可为分数，其余受限洪炉配方为非负整数。
4. 配额 0 仍是一条有效限制，关闭限制才移除该机器额度。
5. 固定目标若已超额度，应返回不可行，不能通过只限制自动补全配方来绕过。

## 6. 跨地区传输

当前唯一来源为 tundra。59 条传输配方时间均为 3600 秒，输入 `domain_key_tundra:1`，输出批量物品，如源石粉末类 1500/小时、高容谷地电池 30/小时。机器是 `__domain_transfer`，hideRate=true、功耗 0。一个整数变量单位是一条完整传输批次的运行份额，不是每秒物流件数。

启用时旧求解器生成 key 的 Input 与 Limit，内部值均为 `1/3600`；关闭时生成 key 的 Limit=0。整体效果应为所有同来源传输变量共享每小时 1 次的预算，且每个传输选择为非负整数。结合整数条件及预算，本版本至多使用一种一份完整传输；可以不使用，不强迫选满。

新实现对显式选中的传输配方同样施加整数及 key 预算。界面不提供当前已选单一地区作为自己的来源；多地区模式按现有支持来源列表处理，不能增加不存在的线路。

静态审计风险：旧代码给 `transfer_` 设 integer，但实际 `intopt` 开关只在机器限制匹配时置 true。只启用传输、未启用机器限制时可能只求 LP；迁移应修正为“模型存在整数变量即进入 MIP”。此项须通过专门反例运行确认，不能沿用旧 LP 松弛作为等价标准。

## 7. 净水节点

设 x 为 `sewage-treat` 的总配方单位，y 为 `sewage-treat-export` 的总配方单位。业务约束为 x≤3、y≤1、x+3y≤3，且非负。x 的配方每秒处理 2 污水、无产物、声明成本 -30；y 的配方每 60 秒消耗 360 污水、产 12 壤晶废液、声明成本 -50。

禁用开关同时排除两个配方；恢复时仅撤销这两个禁用项，保留用户其他排除项。旧版仅在两个普通配方变量都存在时添加约束。新实现必须：

- 任一种变量单独存在时仍受其上限；
- 普通变量和显式配方目标共同占用同一额度；
- y=1 时 x=0，x=3 时 y=0；
- 不因关闭其他机器限制而取消节点额度；
- 不擅自要求这两个节点变量整数：旧代码没有该整数契约。

## 8. 成本与功耗

成本处理有明确优先级：

| 条件                  | 当前公式及应保留的语义                                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 用户给配方设置了 cost | 直接用用户值，包括显式 0；优先于数据默认成本                                                                                                                    |
| 数据配方声明了 cost   | cost × factor，包括 0/负值；不乘总产出量、不除耗时                                                                                                              |
| 无显式 cost           | 从 0 开始；若机器有非零 usage 且 electric 非零，加 machine × electric × machine.usage；若 footprint 非零且有尺寸，加 machine × 宽 × 高；合计为 0 时回落 machine |
| 配方带 recycling      | 最后再乘 recycling 权重                                                                                                                                         |

注意：旧 footprint 在该分支中是“非零则启用占地项”，其数值并没有再次乘进面积；这和通常理解的连续权重不同。为达到当前效果先保持公式，若要改变应另立行为变更。electric 成本用的是机器 usage，不是最终配方覆盖的 usage，也不是已向上取整的总电量；不要把“电力权重”误实现成新的电力平衡硬约束。

| 成本项                       | 当前默认   | 上游默认    | aef 迁移值 |
| ---------------------------- | ---------- | ----------- | ---------- |
| factor / machine / footprint | 1 / 1 / 1  | 1 / 1 / 1   | 1 / 1 / 1  |
| electric                     | 1          | 无该项      | 1          |
| unproduceable                | 1,000,000  | 100,000,000 | 1,000,000  |
| excluded                     | 0          | 0           | 0          |
| surplus                      | 1          | 0           | 1          |
| maximize                     | -1,000,000 | -1,000,000  | -1,000,000 |
| recycling                    | 1,000      | 1           | 1,000      |

例如机器 usage=50、尺寸5×5、machine=electric=footprint=1，无显式成本时结果为 75；electric=2 时为125；关闭 footprint 且 electric=1 时为50。声明 -30 的净水配方在 factor=2 时为 -60，即使 out 为空也不能变成 0。

上述计算的是配方调整层的 recipe.cost；它进入目标函数时还取决于变量角色。两版普通配方变量直接设置 obj=recipe.cost；显式 Output/Maximize 配方目标变量没有设置该 obj，直接系数为0，最大化奖励由另外的辅助变量表达。资源固定供给也属于显式目标路径。迁移先保持这种目标函数结构，不将所有最终配方运行量一律乘 recipe.cost 作为“总成本”，否则会无意改变当前结果。A13必须分别检查普通配方、显式Output、显式Maximize和固定采矿供给。

`consumptionAsDrain` 将消耗变成 drain，使半台机器也按一台的功耗计算；发电配方的负 usage 也要保持符号。电池发电等空输出配方仍可通过显式配方目标参加计算，不能在数据清理时删除。

## 9. 求解结果与异常契约

固定上游 Solver 当前执行 LP 的 simplex/exact，读取 `.value` 和 `model.status`；未实现本项目的整数步骤。返回码类型包含 MIP 不等于求解过程已经支持 MIP。

新实现若含整数变量，必须完成 LP 准备与整数求解，并使用整数解对应的 status、所有变量值以及目标函数值。读取应覆盖配方、显式目标、最大化、输入/盈余/排除/不可生产项；不能只把最终配方数量四舍五入。

旧版变量已切换到 valueMIP，但成本仍读取 model.value。glpk-ts 0.0.11的实现表明：`dist/index.js` 第 1067–1074 行中，value 调用 `_glp_get_obj_val`，valueMIP 调用 `_glp_mip_obj_val`；两版 package-lock 锁定的该包版本和 integrity 相同，因此这里确实会读取 LP 目标值。新整数路径应读取 model.valueMIP，并按模型中实际目标系数从同一组最终变量独立复算总成本。读取路径的错误有源码依据；具体场景的数值差距仍需运行确认。

变量角色证据：[旧普通与显式配方变量](https://github.com/endfield-calc/factoriolab/blob/26a49e814f0570e050a19b726b3ba689d282aa3b/src/app/services/simplex.service.ts#L516-L549)、[上游同一路径](https://github.com/factoriolab/factoriolab/blob/00bdb91c2442cd8d715501b9469cec115735645f/src/solver/solver.ts#L393-L424)。

不可行、无界、未获得符合要求的最优状态时明确显示失败或对应状态，不把 LP 可行状态当作整数最优完成。无整数规则时仍使用上游 LP 路径，避免无意义增加所有场景的求解成本。

## 10. 重写的实现自由与约束

本文件约束的是数据含义、可观察功能和模型结果。旧的÷20、隐藏类型、字符串前缀扫描或组件effect不是必须复制的实现；由领域规则编译器计算实际产率、生成带来源的派生目标和约束，并由通用模型接点绑定两类变量。

电力权重是独立扩展状态，旧cet只作为导入入口；领域成本策略覆盖统一准备结果中的成本，不在各Store和组件各算一次。无显式成本时的footprint布尔语义等仍按已确认契约保留；没有业务依据的“公式优化”不算缺陷修复。

约束缺失、MIP读取错误、退休目标过滤和恢复竞争等已有证据的问题按对应反例修正。源代码形态可以完全重写，但不能通过删目标、改物流、忽略盈余或改最大化系数来取得表面一致。
