# 后续上游同步与当前差异

本页以 `00bdb91c2442cd8d715501b9469cec115735645f` 为固定上游，以签名提交 `2e158990fda780d69e2e91bc80e205c61fa4ac2c` 为本轮起点。01–08 记录最初迁移方案及历史验收；涉及旧默认值、兼容层和扩展框架的描述已由以下当前决策取代。本轮工作树暂不提交、不推送，排除本地 `.agents/`、`.codex/`。

## 当前产品与兼容边界

1. 发布应用仅开放 `aef`。完整上游游戏目录、`modHash` / `modHashV0` 身份及顺序保留，供原生算法、数据工具和测试使用。`PINNED_MOD_ID` 在应用组合处固定为 `aef`，请求、路由及缓存统一受此边界约束。
2. 旧目标类型 11–14 和 `cet` 沿上游当前默认忽略，不新增转换、拒载、警告或重编号。普通旧格式仅使用上游 `Migration`；不另外承诺已删除 ID 的迁移。三个内置示例已一次性改成当前编码器生成的链接。
3. 省略的无法生产及回收成本统一采用当前上游默认 `1e8 / 1`，不保留迁移阶段的 `1e6 / 1000` 补丁。保留终末地 surplus=1、电力=1、kW、light、BoxLine 和浏览器语言初始化。
4. 资源满额采集及盈余是当前功能。额度 560/min、需求 540/min 时仍采集 560/min，产生盈余 20/min；矿机、用水和功耗均按真实满额采集计算。
5. 来源、普通配方和显式机器目标的设置与勾选相互独立。关闭资源仅停止派生，重开保留来源设置；含 item 的合并步骤优先使用 item 勾选。

## 数据优先与原生机制

`public/data/aef/data.json` 使用英文实体名；zh/ja/ru 文件使用原生 `ModI18n` 字段覆盖。其余五种非英文实体包在资产准备时生成中文覆盖，所有八种非英文路径均进入 build 和 Karma。英文不再请求独立实体包，数据版本直接取基础数据。UI 游戏名称使用已有的 `options.game.endfield` 翻译键；上游九份 UI 词典保持原文件。

`scripts/update-hash.ts` 已恢复固定上游原文件，是 canonical hash 的唯一更新入口。原生更新将 9 个 item、22 个 recipe 的退休字符串改为原槽位 `null`，当前有效 ID 的索引和各数组长度不变；连续执行两次字节一致。今后允许原生算法复用 null，不再维护 append-only 或冻结旧字符串政策。`Zip` 的 subset 算法恢复上游，独立保留未知 ID、原始索引和当前输入校验。

旧 Git 数据转换器、声明、旧 hash/dataset 表和 legacy golden 已删除。日常构建及 CI 不再获取旧提交作为数据生成或测试 oracle。`scripts/endfield/data.spec.mjs` 检查当前 schema、身份、引用、图集及原生 hash 稳定性。隐藏 category 和当前保留的两项 settlement 机器数据仍是合法数据，不增加运行别名。未被当前数据使用的 `forceShowLabel` 已删除。

传输配方按原始当前数据的正 `domain_key_tundra` 输入识别，实际集合仍为原来的 59 项；不使用手抄名单、名字或已调整产率分类。保留一小时传输周期、共享整数预算、洪炉数量和连续例外、三条水约束及两地物理预设。

## 保留的运行接点

| 责任             | 当前实现与必要性                                                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 默认值与产品装配 | `extensions/defaults.ts` 仅提供 settings/preferences 快照、副本和 dataset pin；`endfield/product/product.ts` 提供具体默认值。品牌直接读取产品 manifest。没有 ProductProfile 或多产品回调。                          |
| 当前状态         | `EndfieldStore` 保留小型只读状态、六资源机器/超频、checked、电力及资源/洪炉/传输配置。普通状态仍由原生各 Store 管理。                                                                                               |
| 恢复与链接       | `compat/codec.ts` 编解码当前 ef；`restore.ts` 验证当前工作区。RouterSync 直接调用，保留异步代次、writeSequence、导航取消/重定向/离开、HTTP 失败重试和回滚。没有 StateExtension、preflight 或 WorkspacePreparation。 |
| 计算             | ObjectivesStore 直接调用纯派生及规则函数，只给 Solver 小型状态和可用性上下文；不复制整份 dataset/settings/objectives。`extensions/calculation-extension.ts` 仅保必要求解 DTO，没有可插拔 token。                    |
| 模型安全         | `solver/model-extension.ts` 绑定约束和整数列，校验数值、最终 MIP 解、原始约束和实际输入量。公开 Solver 在建模前拒绝负机器数量。                                                                                     |
| 成本             | `EndfieldAdjustment` 仅覆写原生公开 `adjustCosts`，调用当前成本函数。没有 settlement alias 或无消费者的 objective 成本重算。                                                                                        |
| 展示             | 主页面静态加载资源和指南；步骤、详情、Flow 与链接使用严格的六个来源目标 ID。没有 PresentationExtension 或泛型 owner/面板协议。                                                                                      |
| 当前可靠性       | 保留 UI 首次 HTTP 失败时的静态英文 fallback、当前错误 URL 原文导出，以及成本草稿的恢复门禁。构建期词典补缺与运行时网络失败分别验证。                                                                                |

来源配方只保存实际生效的 `machineId` 和 `overclock`，移除 source 的 fuel/modules/beacons/cost/productivity 编解码与复制机制。普通配方和显式目标的原生完整设置保留。来源链接继续保存完整工作区并定位资源面板，Flow 中同配方的多个目标按目标 ID 区分。

成本保持以下现有策略：显式 recipe override（含零和负数）优先；否则 raw recipe cost × factor；否则 raw machine usage × machine weight × electric，加 footprint 非零时的 machine weight × area；合计零时回退 machine weight，再应用 recycling。footprint 仍是面积项开关。显式机器目标的模型列原本不使用 recipe.cost，不为已删重算增加新目标系数。

成本弹窗直接管理 `{costs, electric}` 草稿：Reset 仅改草稿，Cancel 不写，Save 校验后同步保存两项；恢复中保留已有草稿。偏好只读取一次当前 schema，任一无效字段使整个文档不加载，原 key 原文受持久化门禁保护；合法的当前 partial 值可以补默认。不逐字段修复，不迁移 black，不创建 recovery.N，不读取孤立显示 key。普通编辑不能解除门禁，明确 Reset 可以恢复保存。错误区允许导出当前原文。

## 差异数量与测试责任

统计必须使用同一个上游基线，计入新建但尚未暂存的文件，并将运行代码、测试和数据分别列出。本轮起点的 `src` 为 119 个差异文件：86 个运行文件（56 修改、30 新增），33 个规格/夹具（6 修改、27 新增）。当前数量和逐文件清单以本轮验收目录 `.tmp/convergence-impl-2e158990/validation/current-src-inventory.json` 为准；不能只统计 tracked diff 或把迁移前 golden 行数当功能覆盖。

删除旧 golden、旧生成 oracle、旧字段兼容及任意插件重入测试。以下当前责任继续由真实组件、Router 和 GLPK 回归验证；共享组件行为的断言放回已有组件规格，避免为已删除 adapter 单独保留规格文件。

| 当前责任                                             | 主要验证位置                                                               |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| 满额、盈余、真实矿机/水/功耗及地区                   | domain、calculation-integration、constraint-acceptance                     |
| 来源/普通/显式设置、checked、重置、名称及完整链接    | EndfieldStore、Steps、DetailRow、RecipesSelect、Flow、acceptance-roundtrip |
| 成本、负值与零、草稿事务                             | cost、calculation-integration、cost-settings-dialog、electric-cost         |
| P2 当前输入拒绝和失败不提交                          | restore、Router、公开 Solver/model-extension                               |
| 当前链接、例子、原始索引、迟到读写、取消及 HTTP 重试 | codec、guide、router-sync、extension-sync、resource-retry、zip             |
| 坏偏好原文保护和显式 Reset、native 工具边界          | product、preferences、resources、extensions                                |
| 当前数据与交付                                       | Node delivery 检查、根路径/子路径打包和最终 SW 哈希                        |

不降低覆盖门槛，不删除原生测试来掩盖行为改变；实现变化时更新断言并保留有辨别力的当前责任。完整 scripts 类型检查的既存诊断、初始 bundle 预算警告与实际失败分别记录，不能以 app/spec 类型成功代指全项目成功。

## 后续同步

沿上游血缘合入新的 upstream/main，不从旧 fork 重新生成应用。先固定双方版本，检查原生 schema、默认值、索引和 Solver/Router 流程，再更新必要接点及当前数据。上游具备等价能力时删去本地重复实现；不新增长期旧数据转换层或多产品协议来预防假想需求。

发布前按顺序运行当前数据检查、app/spec 类型、lint/格式、完整 Chrome 测试及覆盖检查、生产与双站打包；核根路径和子路径、8 个非英文实体包、身份过滤、manifest/release 元数据及最终 SW。最后对冻结源码进行独立复核。未运行的检查、有限探针、真实端到端与数学等价论证分别陈述。
