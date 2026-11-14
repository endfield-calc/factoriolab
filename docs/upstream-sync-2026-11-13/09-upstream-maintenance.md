# 后续上游同步与当前差异

本页以 `00bdb91c2442cd8d715501b9469cec115735645f` 为固定上游，以签名提交 `590d26240711b017e50ffaaa6966faa04e6e75a9` 为本轮起点。该提交已完成原生默认值与通用 extensions 层收敛，GPG 验证通过，未推送。01–08 记录最初迁移方案及历史验收；涉及旧默认值、兼容层和扩展框架的描述已由以下当前决策取代。本轮 endfield 收敛经验证与独立复核后，按用户要求签名提交，暂不推送；排除本地 `.agents/`、`.codex/`。

## 当前产品与兼容边界

1. 发布应用仅开放 `aef`，直接使用原生 `DEFAULT_MOD`。完整上游游戏目录、`modHash` / `modHashV0` 身份及顺序保留，供原生算法、数据工具和测试使用。路由、缓存恢复及 HTTP 请求入口限制为 `aef`；内部算法和可信测试夹具保持原生接口，不再给每个读取方法叠加产品检查。
2. 旧目标类型 11–14 和 `cet` 沿上游当前默认忽略，不新增转换、拒载、警告或重编号。普通旧格式仅使用上游 `Migration`；不另外承诺已删除 ID 的迁移。三个内置示例已一次性改成当前编码器生成的链接。
3. 省略的无法生产及回收成本统一采用当前上游默认 `1e8 / 1`，不保留迁移阶段的 `1e6 / 1000` 补丁。保留终末地 surplus=1、电力=1、kW、light、BoxLine 和浏览器语言初始化。电力单位选择与单项设备预设显示使用上游原生控件；单位只影响显示。
4. 资源满额采集及盈余是当前功能。额度 560/min、需求 540/min 时仍采集 560/min，产生盈余 20/min；矿机、用水和功耗均按真实满额采集计算。
5. 来源、普通配方和显式机器目标的设置与勾选相互独立。关闭资源仅停止派生，重开保留来源设置；含 item 的合并步骤优先使用 item 勾选。

## 数据优先与原生机制

`public/data/aef/data.json` 使用英文实体名；zh/ja/ru 文件使用原生 `ModI18n` 字段覆盖。其余五种非英文实体包在资产准备时生成中文覆盖，所有八种非英文路径均进入 build 和 Karma。英文不再请求独立实体包，数据版本直接取基础数据。UI 游戏名称使用已有的 `options.game.endfield` 翻译键；上游九份 UI 词典保持原文件。

`scripts/update-hash.ts` 已恢复固定上游原文件，是 canonical hash 的唯一更新入口。原生更新将 9 个 item、22 个 recipe 的退休字符串改为原槽位 `null`，当前有效 ID 的索引和各数组长度不变；连续执行两次字节一致。今后允许原生算法复用 null，不再维护 append-only 或冻结旧字符串政策。`Zip` 的 subset 算法恢复上游，独立保留未知 ID、原始索引和当前输入校验。

旧 Git 数据转换器、声明、旧 hash/dataset 表和 legacy golden 已删除。日常构建及 CI 不再获取旧提交作为数据生成或测试 oracle。`scripts/endfield/data.spec.mjs` 检查当前 schema、身份、引用、图集及原生 hash 稳定性。隐藏 category 和当前保留的两项 settlement 机器数据仍是合法数据，不增加运行别名。未被当前数据使用的 `forceShowLabel` 已删除。

传输配方按原始当前数据的正 `domain_key_tundra` 输入识别，实际集合仍为原来的 59 项；不使用手抄名单、名字或已调整产率分类。保留一小时传输周期、共享整数预算、洪炉数量和连续例外及两地物理预设。净水只保留共享约束 `L + 3E ≤ 3`：所有自动及显式机器变量均非负，因此该约束严格推出 `L ≤ 3` 和 `E ≤ 1`，不再分别维护两条冗余行。净水仍连续计数，不能改成会包含其他污水配方的物料总量限制。

## 保留的运行接点

| 责任             | 当前实现与必要性                                                                                                                                                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 默认值与产品装配 | 直接修改原生 settings/preferences/flow 默认常量和 `DEFAULT_MOD`，品牌读取产品 manifest。没有默认值注入、产品默认值覆盖、dataset pin token 或第二套 neutral 默认值。初始化语言使用已有 language 模块中的具体函数。                                                            |
| 当前状态         | `EndfieldStore` 保留资源、洪炉、传输、电力和来源设置，沿用原生不可变调用约定：编辑时只复制实际修改的路径，`set` 直接接收状态。来源仅保存机器/超频，解码验证后省略空设置；Rational 沿用原生只读值。普通状态由原生各 Store 管理。                                              |
| 恢复与链接       | `compat/codec.ts` 编解码当前 ef；`restore.ts` 验证原生 `PartialState`。错误直接保存可显示的消息。`state/workspace-lifecycle.ts` 保留代次和恢复门禁，RouterSync 继续负责 writeSequence、导航取消/重定向/离开、HTTP 重试和回滚。没有额外的状态协议、诊断代码/字段/严重性协议。 |
| 计算             | 原生目标、配方和调整设置的映射集中在现有 `endfield/adapters/calculation-extension.ts`。domain/rules 只编译业务约束；所需模型类型归属实际消费者 `solver/model-extension.ts`。不复制整份 dataset/settings/objectives，不维护独立扩展类型文件或无消费者的规则来源元数据。       |
| 模型安全         | `solver/model-extension.ts` 绑定约束和整数列，校验数值、最终 MIP 解、原始约束和实际输入量。公开 Solver 在建模前拒绝负机器数量。                                                                                                                                              |
| 成本             | `EndfieldAdjustment` 覆写原生公开 `adjustCosts` 并提取成本函数实际所需的值；业务成本函数不接收完整原生 Recipe/Machine/RecipeSettings。没有 settlement alias 或无消费者的 objective 成本重算。                                                                                |
| 展示             | 主页面静态加载资源和指南；步骤、详情、Flow 与链接使用严格的六个来源目标 ID。没有 PresentationExtension 或泛型 owner/面板协议。                                                                                                                                               |
| 当前可靠性       | 保留 UI 首次 HTTP 失败时的静态英文 fallback、当前错误 URL 原文导出，以及成本草稿的恢复门禁。构建期词典补缺与运行时网络失败分别验证。                                                                                                                                         |

来源配方只保存实际生效的 `machineId` 和 `overclock`，移除 source 的 fuel/modules/beacons/cost/productivity 编解码与复制机制。普通配方和显式目标的原生完整设置保留。来源链接继续保存完整工作区并定位资源面板，Flow 中同配方的多个目标按目标 ID 区分。

资源面板直接用具体组件方法操作现有 Store，保留恢复门禁、原生数值输入校验和跨 Store 同步预设更新；删除 `EndfieldAction`、reducer、coordinator 和命令诊断协议。两地额度是面板唯一使用的小型静态矩阵，不再单列预设模块。预设会重置来源设置和勾选但保持电力；水排除只改变两项节点，不覆盖其他排除项。

生产页面另复现签名起点已有的资源输入问题：560 改为 90 后立即 Tab/Enter，DOM 显示新值但仍按 560 计算。同一任务同步派发 input/blur 则成功，旧测试没有覆盖真实交错。原因是模板每次换算创建新 Rational，使原生 InputNumber 的 linkedSignal 文本在提交前被旧值覆盖。六个显示速率改为稳定 computed；保持原生 Control/InputNumber 不变，补 input→变更检测→blur/Enter 两项真实控件回归。修复后的生产页面已验证即时提交会同步改变实际表格、机器数及链接。

适配器直接准备原生 `ObjectiveSettings`：来源机器数为物理速率除以调整后的正产率；传输先乘显示因子，再走原生 `normalizeRate`。现有 `normalizedObjectives` 统一归一化完整计算目标，不在计算上下文中另存一份归一化列表。普通目标编辑 UI 仍只读取普通目标。来源 checked 和 modified 均由 ObjectivesStore 统一投影，Steps 直接读取原生结果，不再重算一次。成本适配器只依赖单个原生 computed 电价 selector；勾选重算沿用上游，不另建计算状态投影框架。

`LabParams` 直接声明现行 `ef` 字段，RouterSync 直接读写，不再用 cast 和 Object.assign 绕开原生契约。ef 输出使用原生 `toFraction(false)`，精确 BigInt 输入解析仍保留整数、分数、十进制及科学计数法。当前预设只按 aef 的 `defaults.presets` 数据校验，不另列跨游戏后备值。Flow 布局完成始终检查当前输入引用，删除只为手工测试输入放行的第二种语义。

以下 13 个运行文件仍有实际责任，不因移动到另一个目录而计作收敛：

| 文件                                             | 保留理由                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| adapters/calculation-extension.ts                | 接入原生成本调整并准备真实采集/传输目标，集中解释原生结构                                 |
| adapters/translation-fallback.ts                 | 首次 UI 词典请求失败时仍提供完整英文及产品词条                                            |
| compat/codec.ts、compat/restore.ts               | 现行资源工作区精确往返，以及原生语法解析之后的当前数据/业务校验；不转换旧版 11–14/cet     |
| domain/model.ts、domain/cost.ts、domain/rules.ts | 来源状态身份、成本公式和共享设备/整数预算；数据本身不能表达这些随所选机器及超频变化的约束 |
| state/endfield-store.ts                          | 来源与普通/显式设置隔离，以及实际编辑时的不可变更新                                       |
| ui/resources.ts、ui/resources.html               | 资源面板及具体交互，直接使用原生组件和 Store                                              |
| ui/guide.ts、ui/guide.html                       | 当前三个示例链接、地区/成本/资源说明和产品入口                                            |
| providers.ts                                     | 实际应用与集成测试共用的两项具体 DI 装配，不声明插件协议                                  |

成本保持以下现有策略：显式 recipe override（含零和负数）优先；否则 raw recipe cost × factor；否则 raw machine usage × machine weight × electric，加 footprint 非零时的 machine weight × area；合计零时回退 machine weight，再应用 recycling。footprint 仍是面积项开关。显式机器目标的模型列原本不使用 recipe.cost，不为已删重算增加新目标系数。

成本弹窗直接管理 `{costs, electric}` 草稿：Reset 仅改草稿，Cancel 不写，Save 校验后同步保存两项；恢复中保留已有草稿。偏好只读取一次当前 schema，任一无效字段使整个文档不加载，原 key 原文受持久化门禁保护；合法的当前 partial 值可以补默认。不逐字段修复，不迁移 black，不创建 recovery.N，不读取孤立显示 key。普通编辑不能解除门禁，明确 Reset 可以恢复保存。错误区允许导出当前原文。

## 差异数量与测试责任

统计必须使用同一个上游基线，计入新建但尚未暂存的文件，并将运行代码、测试和数据分别列出。本轮起点的 `src` 为 119 个差异文件：74 个运行文件（57 修改、17 新增），45 个规格/夹具（24 修改、21 新增）。当前数量和逐文件清单以本轮验收目录 `.tmp/endfield-simplify-590d2624/validation/current-src-inventory.json` 为准；不能只统计 tracked diff 或把迁移前 golden 行数当功能覆盖。评价收敛还须检查上游结构在多少处被解释，以及一次上游变更会牵动多少调用点，不能只统计新增文件或 import 数。

本轮完成后为 116 个差异文件：73 个运行文件（58 修改、15 新增），43 个规格/夹具（24 修改、19 新增）。endfield 自身从 32 个文件减为 28 个，其中运行文件 15→13、测试文件 17→15；删除 coordinator/presets 及对应规格，唯一新增上游文件修改是 LabParams 的现行 ef 类型字段。收益包括删除命令链和派生目标包装协议、合并重复校验及展示判断，不只统计文件位置。

测试保留实际责任，移除 getter/proxy 编码状态、自造 detached 恢复协议、fixture 隔离自测、重复弱化断言和固定文案锁定。资源预设和恢复门禁迁入真实组件事件测试；完整工作区往返直接比较原生状态与配置，不再维护另一套 StateSummary。codec 中的严格 Zip 输入边界仍有独立断言，不为文件数量把有用用例删除或机械搬家。

资源 UI、步骤/Flow 中的来源目标交互、Router 的工作区原子恢复和 Solver 的实际模型绑定仍需接入原生流程；这些是现有业务功能的接点，上游改动对应流程时仍需复核。业务 domain 不再直接解释原生 Recipe/Objective 设置，也不以新框架隐藏这些必要耦合。

删除旧 golden、旧生成 oracle、旧字段兼容及任意插件重入测试。以下当前责任继续由真实组件、Router 和 GLPK 回归验证；共享组件行为的断言放回已有组件规格，避免为已删除 adapter 单独保留规格文件。

| 当前责任                                             | 主要验证位置                                                               |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| 满额、盈余、真实矿机/水/功耗及地区                   | domain、calculation-integration、constraint-acceptance                     |
| 来源/普通/显式设置、checked、重置、名称及完整链接    | EndfieldStore、Steps、DetailRow、RecipesSelect、Flow、acceptance-roundtrip |
| 成本、负值与零、草稿事务                             | cost、calculation-integration、cost-settings-dialog、electric-cost         |
| P2 当前输入拒绝和失败不提交                          | restore、Router、公开 Solver/model-extension                               |
| 当前链接、例子、原始索引、迟到读写、取消及 HTTP 重试 | codec、guide、router-sync、extension-sync、resource-retry、zip             |
| 坏偏好原文保护和显式 Reset、native 工具边界          | preferences、resources、settings-store、id、landing、extension-sync        |
| 当前数据与交付                                       | Node delivery 检查、根路径/子路径打包和最终 SW 哈希                        |

不降低覆盖门槛，不删除原生测试来掩盖行为改变；实现变化时更新断言并保留有辨别力的当前责任。完整 scripts 类型检查的既存诊断、初始 bundle 预算警告与实际失败分别记录，不能以 app/spec 类型成功代指全项目成功。

签名起点的验收为 Chrome 1434 项及四项 100% 覆盖率。本轮最终 Chrome 1427 项全部成功，语句 8517/8517、分支 2987/2987、函数 1720/1720、行 7574/7574，四项均为 100%；app/spec 类型、全量 lint/格式、13 项交付检查通过。完整 scripts 类型检查同签名起点均有 30 条诊断，逐条一致、无新增或消失，不作为零诊断通过。根路径及 `/endfield-review/` 完成双站生产打包，每站各 109 个最终 SW 哈希通过；初始包仍有 950 kB 预算警告，实际约 1.04 MB，超出 87.84 kB。

独立审查发现并关闭来源 modified 的重复判断，最终无未关闭发现。Reviewer 另完成 400 组原生目标对照、119 组编码精度/接受域/稳定编码对照及 38,808 组非负水变量可行性对照；独立数学推导与有界实验分开记录，不作为一般性的最优性证明。验收和冻结文件位于 `.tmp/endfield-simplify-590d2624/validation/`。

页面验证使用 Playwright（当前没有 Browser 插件）：四份根路径/子路径站点均验证资源 560→80 后立即 Tab 的实际提交；桌面 1366×900 还验证即时 Tab 90、Enter 120、负数不覆盖结果/链接、关闭重开、两地全部额度、Clear、成本 Cancel/Save 和 BoxLine 渲染/返回列表；移动 390×844 验证即时 Enter 100。未观察到控制台错误/警告或其他游戏数据请求，无页面横向溢出，移动表格沿原生设计横向滚动。基线复现、修复后 DOM/URL 结果和截图分别存档；仅验证 Chromium，未以构建成功替代其他浏览器或未执行场景。

## 后续同步

沿上游血缘合入新的 upstream/main，不从旧 fork 重新生成应用。先固定双方版本，检查原生 schema、默认值、索引和 Solver/Router 流程，再更新必要接点及当前数据。上游具备等价能力时删去本地重复实现；不新增长期旧数据转换层或多产品协议来预防假想需求。

发布前按顺序运行当前数据检查、app/spec 类型、lint/格式、完整 Chrome 测试及覆盖检查、生产与双站打包；核根路径和子路径、8 个非英文实体包、身份过滤、manifest/release 元数据及最终 SW。最后对冻结源码进行独立复核。未运行的检查、有限探针、真实端到端与数学等价论证分别陈述。
