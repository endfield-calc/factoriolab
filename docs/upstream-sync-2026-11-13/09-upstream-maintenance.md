# 后续上游同步设计

## 1. 维护目标

初次迁移建立以上游 main 为祖先的实现分支，此后沿上游血缘更新本地产品。业务功能集中在独立目录，通用代码只保留必要、可说明的接入点与通用能力；同步时区分上游演进、接点适配与本地规则变化。

上游文件变化不必为零。稳定、可测试的通用接点可以避免复制 Solver、Store 或整页模板；也不应为减少文件数而把无关职责塞进同一个适配器。生产产物只包含 aef 游戏数据，其他数据仅作为隔离夹具或明确排除的测试输入；保留上游游戏类型和通用算法不等于向用户开放其他游戏。

## 2. 差异分类

| 类型                                  | 存放与维护方式                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 业务规则、预设、旧编码、品牌和专属 UI | 集中于 `src/endfield`、`public/data/aef`、`public/endfield`、`scripts/endfield`，通用核心不反向导入业务实现。 |
| 接入契约和默认实现                    | 放在 `src/extensions`，由少量共享调用点消费；保留不启用产品扩展时的上游默认路径。                             |
| 必要通用能力                          | 模型约束、MIP 和 PerDay 等改动保留通用验证；上游提供等价能力后核对语义并删除重复实现。                        |
| 构建和发布                            | 产品配置选择数据、词典和入口；保留必要的发布工作流差异，不批量删除通用源码或隐藏源码改写。                    |

## 3. 接点清单与审计信息

以下以 `00bdb91c2442cd8d715501b9469cec115735645f` 为上游基线，登记 `3da0e41b8c111c8ed1080e6190f3439b88a8f8f8` 起点及其工作树收敛后的接点；包括未跟踪的实际产物，排除 `.agents/`、`.codex/`、`.tmp/`、`dist/`。按路径去重，起点为 114 个修改和 105 个新增，合计 219；第一轮收敛为 69 个修改和 116 个新增，合计 185；公开接口收敛后的快照为 64 个修改和 116 个新增，合计 180。数量用于识别维护面，不能替代对行为的审查。工作树继续变化时应重新计算。

### M01 组合与注册

`src/app/app.config.ts` 使用 `src/endfield/providers.ts` 的 `provideEndfield` 装配产品、状态、计算、展示与翻译 fallback，并把原 Routes 交给同模块的 `configureEndfieldRoutes`。该纯函数递归静态 children，按 guard 函数引用替换 id/landing 策略，并为 editor 添加产品 gate；保留其它 guard 顺序、route 字段及 lazy loader。`app.routes.ts`、`id/id-guard.ts`、`landing/landing-guard.ts` 已恢复上游字节。产品 guard 在 `allowedModIds` 缺省时直接委托原 guard；Endfield 启用时自己处理 shortcut、允许列表、默认入口和 last-good，不先执行上游旧迁移。`id.ts` 和 `SettingsStore` 继续负责事务交接及资源边界。`src/extensions/product-profile.ts` 定义产品契约，`src/data/{datasets,game,game-info}.ts` 保留 aef / endfield 身份注册。中立产品不限制 mod、允许 editor，沿上游目录工作。

**验证及同步边界：** `src/extensions/extensions.spec.ts`、`src/app/id/id.spec.ts`、`src/endfield/product/product.spec.ts`。上游若提供等价产品目录能力，可替换筛选，仍须保持身份和单游戏边界。

### M02 默认值与语言选择

`product-profile.ts` 的 `EffectiveDefaults`、`EFFECTIVE_DEFAULTS`、`cloneDefaults` 与 `immutable.ts` 提供不可变默认快照和写入副本；PreferencesStore、SettingsStore、RouterSync 和偏好、成本、列、流图设置消费同一有效默认值。未提供产品覆盖时使用 `initialPreferencesState` / `initialSettingsState`。

**验证及同步边界：** `src/extensions/extensions.spec.ts`、`src/endfield/product/product.spec.ts`、`src/endfield/ui/{preferences-recovery,electric-cost}.spec.ts`、`src/endfield/adapters/presentation-extension.spec.ts`。上游初始化、差分或重置变化时保留显式设回上游默认与产品默认的区别。

### M03 数据、翻译与 hash

SettingsStore 按 `ProductProfile.loadGameI18n` / `gameMetadata` 选择资源和元数据并提供失败重试；`TRANSLATION_FALLBACK` 默认 `undefined`。`scripts/update-hash.ts` 写入前先校验全部请求 ID；aef 候选由上游 `updateHash` 和空 hash 生成，保留 quality 展开，再交 `scripts/endfield/convert-data.mjs` 的追加合并；其他数据集走上游更新。converter 自身保留冻结前缀及重复检查，精确声明位于 `convert-data.d.mts`。`src/data/mod.ts`、`src/utils/hash.ts` 和其规格已恢复上游原字节，不存在 `ModInfo.hashPolicy` 接点。

**验证及同步边界：** `scripts/endfield/{convert-data,prepare-i18n}.spec.mjs`、`src/state/router/resource-retry.spec.ts`、`src/endfield/adapters/{state-extension,translation-fallback}.spec.ts`。上游 schema、资源加载或 hash 规则变化时重验请求和缺包、质量 ID、冻结索引、退休项及 null 槽；禁止重用历史槽位。

### M04 配方成本出口

`src/endfield/adapters/calculation-extension.ts` 的小型 `EndfieldAdjustment` 由产品 provider 注册，覆写上游公开的 `Adjustment.adjustCosts` 和 `adjustObjective`，调用 `calculateEndfieldRecipeCost`；其它配方调整、水合和 finalize 流程沿用上游。普通配方在 `adjustDataset` 的原生成本阶段处理，显式和派生配方目标在 `super.adjustObjective` 后使用同一策略；仅覆写前者会漏掉目标成本。`RecipesStore` 不再二次映射成本，`ObjectivesStore` 不再补调用成本包装；`CalculationExtension` 只保留 derive/rules，不保留 cost 或 `RecipeCostInput`。停用产品 provider 时使用原 `Adjustment`，保留上游成本公式。

成本规则保留 raw 声明成本、选中机器的原始 usage/size、显式零或负覆盖、电力系数、面积启用及 recycling 语义。实时计算读取 Endfield 的电力快照并形成响应依赖；`WorkspacePreparation` 在自己的注入上下文直接构造原 `Adjustment`，准备候选时不读取实时产品成本或电力状态。通用成本接口原先允许读取 finalized dataset，本轮按实际产品纯函数收窄这一内部能力，不承诺任意未来插件与原接口等价。

**验证及同步边界：** `src/endfield/domain/cost.spec.ts`、`src/endfield/adapters/calculation-integration.spec.ts`、`src/endfield/compat/golden.spec.ts`、`src/solver/model-extension.spec.ts`。替换时保留 raw/adjusted 区分、显式目标系数及详情与模型的一致性。

### M05 计算上下文与准备

`CalculationExtension.derive` / `rules` 和 `CalculationModelContext` 声明只读输入；ObjectivesStore 合并普通与派生目标、设置、owner 和标题/合计后传给求解器。`WorkspacePreparation.prepareObjectives` 与 items、machines、recipes 的 `prepareSettings` 在恢复前准备脱离实时 Store 的记录。中立 derive 和规则为空；中立 presentation 直接返回 normalized 数组，自定义 presentation 仍应用 checked 覆盖。

**验证及同步边界：** `src/extensions/extensions.spec.ts`、`src/endfield/adapters/state-extension.spec.ts`、`src/endfield/domain/rules.spec.ts`、`src/endfield/state/coordinator.spec.ts`、`src/endfield/adapters/calculation-integration.spec.ts`。上游归一化变化时重核目标索引、机器、归属、单位和 checked；纯扩展不能反向依赖 Store 或 Normalization。

### M06 模型与 MIP

`Solver.solve` 接收上下文并在 `src/solver/solver.ts` 建模；`src/solver/model-extension.ts` 的 `ModelSimplexState` 承载可选上下文，`ModelGlpkResult` 表达可缺 returnCode 的求解前不可行结果；该模块还负责绑定变量、约束和整数标记并校验解。非零 Rational 转换为零时拒绝建模；整数模型读取并验证最终 MIP 解。无扩展规则时不增加扩展约束或整数标记。`glpk-result.ts`、`simplex-state.ts` 与 `solver.spec.ts` 已恢复上游原字节；本轮对 `solver.ts` 仅调整类型，其生成的 JavaScript 与本轮起点一致，但它相对上游仍含模型扩展逻辑。

**验证及同步边界：** `src/solver/model-extension.spec.ts`、`src/endfield/adapters/{constraint-acceptance,calculation-integration}.spec.ts`、`src/endfield/compat/golden.spec.ts`。上游提供等价约束后必须重证变量覆盖、不可行处理、数值边界、整数容差及最终目标值。

### M07 编解码与恢复

`src/extensions/state-extension.ts` 和 `workspace-lifecycle.ts` 提供状态契约、错误、票据、诊断及 ready。`src/state/router/{router-sync,migration,zip}.ts` 协作准备、解码、提交、回滚、编码与链接；产品适配器委托 `src/endfield/compat/{codec,restore}.ts`。中立默认不添加状态参数，decode 保留传入状态；配置扩展后严格导入。

**验证及同步边界：** `src/extensions/extensions.spec.ts`、`src/state/router/{extension-sync,resource-retry,router-sync}.spec.ts`、`src/endfield/compat/{acceptance-roundtrip,codec,restore,golden}.spec.ts`。Router 或 hash 变化时重验并发导航、回滚、ready、重试、压缩/明文、存档和链接。

### M08 展示、流图与产品元数据

`src/extensions/presentation-extension.ts` 提供插槽、名称、owner、编辑、勾选、成本重置和链接契约；共享组件及模板消费，中立默认无插槽、隐藏名称开关、`stepFragment` 为 `undefined`，普通目标和配方保留中立 owner。该独立模块的展示节点/图结构类型复用上游 `Node` 和 `FlowData`，承载可选来源标签，`src/flow/node.ts` 已恢复上游字节；ELK 类型仅在既有 Flow 内细化。`src/flow/flow-builder.ts` 复用上游 `recipeStepNodeType` 前缀 helper，以目标 ID 区分同配方节点并提供安全标签；`src/app/main/flow/flow.ts` 继续用代次与销毁状态阻止过期异步布局。`src/components/select/select.ts` 对同值显式单选发出 `optionSelected`，不改变原表单和多选路径。`src/data/release.ts` 已恢复上游，`src/endfield/providers.ts` 的小型 `EndfieldRelease` 只覆盖公开 `version` 并复用继承的 config HTTP 资源；`src/exporter/exporter.ts` 消费产品导出选项。

**验证及同步边界：** `src/endfield/adapters/presentation-extension.spec.ts`、`src/endfield/ui/{main-recovery,preferences-recovery,electric-cost}.spec.ts`、`src/endfield/product/{product,csv}.spec.ts`、`src/components/steps/steps.spec.ts`。上游演进时核对 owner、勾选、链接、图节点身份和标签、异步取消、同值单选、功耗及无障碍行为。

### M09 通用小改动

`src/state/settings/display-rate.ts` 增加 `DisplayRate.PerDay`、选项和 86400 换算；通用翻译 fallback 与 M03 共用。日速率影响显示换算，不改变固定物理额度。

**验证及同步边界：** `src/endfield/compat/{codec,restore,golden}.spec.ts`、`src/endfield/domain/rules.spec.ts`。上游提供日速率时核对枚举值、文案和 URL 语义，再删除重复实现。

### M10 构建、资产与发布

`angular.json` 选择 aef 数据、合成词典并映射产品资产；`package.json`、`karma.conf.js`、`.gitignore`、`.prettierignore`、`.github/workflows/{build,staging,tests}.yml`、环境文件和 `src/index.html` 保留构建和发布接点。`scripts/endfield/{build-sites,package-sites,prepare-i18n,verify-sites}.mjs` 负责双站产物及 release 元数据。`release.config.js` 已恢复上游字节，现有 npm 和工作流入口不调用 semantic-release；以后重新启用该工具时须重新核对其插件和发布配置。技术包名与上游一致为 `factoriolab`，`package-lock.json` 恢复上游字节且依赖不变；产品品牌和导出前缀仍由本地配置提供。

**验证及同步边界：** `scripts/endfield/{build-sites,prepare-i18n}.spec.mjs`、`src/utils/log.spec.ts`；根路径与子路径产物、最终 SW 哈希按 [06](06-execution-and-acceptance.md) 复核。上游机制改变时保留发布目的地、数据过滤、最终元数据后生成 SW 和质量检查。

`npm run test:delivery` 同时执行数据/hash、词典、路由装配结构和双站工具的21项Node测试。build与tests工作流先浅获取固定旧源提交 `26a49e814f0570e050a19b726b3ba689d282aa3b`，供数据测试读取九个经摘要校验的源blob，再运行该入口；不检出或执行旧源码。路由结构测试通过TypeScript AST绑定真实导出、guard导入来源、父子路由关系及 `appConfig.providers` 中的实际 `provideRouter(configureEndfieldRoutes(routes))`；Jasmine测试负责运行行为和原配置不变。这样迁入Node的hash及结构断言仍受CI约束。修改旧源读取方式时应同时核对浅克隆环境，不能只用具有完整本地历史的仓库证明CI可用。

### 词典、资产和测试的上游边界

`public/i18n/{de,en,fr,ja,ru,zh}.json` 已恢复上游原字节。`public/endfield/i18n/{en,zh}.json` 补充两条更新检测文案，`public/endfield/product.json` 的 `uiLocaleOverrides` 仅覆盖 de、fr、ja、ru。`prepare-i18n.mjs` 在独立目录合成九种语言；本轮比较显示合成值与起点一致。`src/endfield/adapters/translation-fallback.ts` 静态合并上游 English 与本地 English，离线 fallback 仍包含这两条文案。更新通知由 `src/app/app.ts` 消费 `VERSION_DETECTED` 和 `VERSION_INSTALLATION_FAILED`，后者仅在 production 启用；其本地场景验证位于 `src/endfield/ui/main-recovery.spec.ts`；上游提供等价通知后再核对恢复动作和翻译回退。

八个 PWA PNG 位于 `public/endfield/icons/`，favicon 与 manifest 位于 `public/endfield/`；`angular.json` 显式映射到原有 `icons/`、`favicon.ico` 和 `manifest.webmanifest` 输出路径，使用本轮起点相同字节。对应上游 `public/icons/` 和根目录 favicon、manifest 已恢复；两个不由 Endfield 产品引用的 `public/factoriolab*.webp` 也恢复上游，产品继续使用独立 logo。同步时既要检查资产装配规则，也要检查输出路径和字节，不能依赖输入覆盖顺序。

起点相对于上游修改过的 24 个 spec，本轮已逐字节恢复 21 个；本地断言按职责迁入既有独立规格。仍相对上游修改的三个是 `src/app/id/id.spec.ts`、`src/components/steps/steps.spec.ts`、`src/state/router/router-sync.spec.ts`，分别承接事务恢复、owner 处理和路由同步的实际契约变化。恢复原测试文件不意味着删除验证：本地入口见上文和独立的产品、状态、兼容、模型与 UI 规格。不能只统计某一分组后相加，因为同一文件可能跨组。

除共享接点外，`src/endfield` 的 domain、adapters、compat、product、state、ui 及其测试和夹具集中承载业务；`public/data/aef`、`public/endfield`、`scripts/endfield` 分别保存数据、配置素材及工具。`compat/{legacy-hash,legacy-datasets}.json` 冻结旧索引，`domain/display-metadata.json` 保存展示标记。现有 README 与项目文档按原用途核对，不把同步记录扩写进原有主题。

公开接口收敛后ChromeHeadless全量1421/1421、Node21/21通过，四项覆盖率均100%；app/spec类型、lint、格式及根/子路径双站构建校验通过。完整scripts项目仍有30项既存类型诊断，本轮同环境起点30项，无新增；不得表述为该项目全量类型检查通过。当前输入、运行范围和浏览器证据按 [06](06-execution-and-acceptance.md) 第9节、[08](08-independent-review.md) 及 `.tmp/upstream-design-impl-3da0e41b/` 核对。第一轮1404/1404、Node20/20和模型138/138、状态270/270、UI187/187是此前阶段证据，保留在06第8节及 `.tmp/upstream-footprint-3da0e41b/`，不代替本轮验证。

## 4. 避免长期漂移的实现约束

1. 不复制上游大类、整页模板、旧 package-lock 或主题体系；不依靠继承重写大部分私有实现维持同名类。
2. 不用 postinstall 补丁、正则改源码、运行时 monkey patch 或 fileReplacements 覆盖 Solver / Store。构建可生成数据、词典和站点元数据，但不隐藏源码改写。
3. 共享代码不散布资源 ID、地区额度、xiranite 例外或业务 URL；必要身份注册、独立规则表和兼容数据除外。展示策略通过准备后的视图模型读取。
4. 新旧 URL 通过 StateExtension 衔接，不复制 RouterSync / Migration；旧 hash 只能解码，aef 新 hash 只追加，不能复用退休槽位。导入前校验身份，保留 converter 冻结和重复检查。
5. 未启用扩展时维持上游路径；纯领域函数不回读全局 Store，扩展不反向注入 Normalization 等调用者依赖。只启用 aef 的生产配置与覆盖通用行为的测试配置分开。
6. 不以删除上游测试、跳过质量检查或扩大容差换取维护性；迁移夹具和断言须保留验证能力，并登记生产排除方式。
7. `workspaceLink` 保留完整工作区序列化职责，`stepFragment` 只提供行链接片段；成本详情与同一目标模型使用一致的有效成本。

## 5. 提交与比较方式

实现按中立接点、数据与兼容、终末地状态与计算、UI 与品牌、构建交付等职责逐步拆分；每个阶段核对对应检查和暂存清单。通用修复与业务规则尽量分开，使评审能比较上游默认行为及本地扩展。

迁移及后续同步提交均排除 `.agents/` 和 `.codex/`，两目录保留在本地；每次只暂存相关路径，避免纳入本地代理配置或无关改动。

首次迁移从固定上游 main 开始；`ark-endfield-3rd-test` 只提供行为和素材证据，不作为重放队列。后续可在保留上游祖先的交付分支中合入新 upstream/main，不从旧 fork 重建，也不通过反复摘取历史制造无法追踪上游的分支。

审核时同时看完整最终差异和 M01–M10 接点。独立目录与数据增加不等同于核心改动；少量共享代码若耦合私有 API 或多个 Store，仍需解释其必要性。

## 6. 后续同步流程

| 步骤         | 操作与产出                                                                    |
| ------------ | ----------------------------------------------------------------------------- |
| 固定输入     | 确定交付分支 HEAD、原上游基线、新 upstream/main；保存可回退的源码与静态产物。 |
| 获取上游变化 | 在隔离同步分支合入新上游，读取实际 diff、依赖和 schema 变化，保留上游血缘。   |
| 分类处理     | 按 M01–M10 定位冲突和语义变化；先更新契约与适配器，再检查独立业务模块。       |
| 减少本地差异 | 上游已有等价机制时复用并删除重复逻辑，保留协议表、别名和业务规则。            |
| 双路径验证   | 运行上游默认配置的通用测试，以及 aef 的功能、兼容、成本、约束和构建验收。     |
| 检查最终差异 | 无未登记共享改动、源码覆盖或散落业务条件；解释新增依赖与数据规则。            |
| 交付与回退   | 固定基线、测试结果和最终产物；按双站流程发布，保留可回退产物与用户状态。      |

项目文档只在原用途和信息范围内校正描述与链接，不将同步过程、执行入口或数据版本清单写入 README 等原本没有这些内容的文档。D05 / A31 与代码语义核对一起完成。文本冲突解决不代表同步成功；还须检查成本时机、变量归属、默认值、URL / hash、资源加载和 SW。

## 7. 完成条件与历史演练

维护设计对应 [06](06-execution-and-acceptance.md) 中的 A27–A30：共享差异可追溯到接点，停用扩展时通用路径成立，状态与计算快照一致，旧链接与额外状态完整往返，并完成可复查的上游更新演练；A31 核对既有项目文档与实现一致且不扩写主题。

若没有新的上游提交，演练可在隔离分支使用受控上游侧变化，覆盖一个 UI 接点和一个状态或计算接点并运行相同契约测试；不能据此声称兼容所有未来上游版本。历史 S7 的受控提交 `245a581fac12fe4c069319b2134b5359221cbf88` 以 `00bdb91c2442cd8d715501b9469cec115735645f` 为父，与当时交付代码 `400c9f75` 合并为 `e348d354306ab5b7c1922dbe0efa4f5565c38568`；当时记录为 1402 项测试和四项覆盖率 100%，类型、lint 及独立复核通过。`rehearsal/actual-*` 保存当时的合并、解析、测试及返回证据，受控提交未并入当时的交付分支。该演练针对 `400c9f75`，不是本轮最终工作树的演练结果。

方案文档持续维护最终契约与当前接点。Git 的 fork / 祖先证据、旧协议定义和部署 release 元数据属于必要技术事实，继续保留。
