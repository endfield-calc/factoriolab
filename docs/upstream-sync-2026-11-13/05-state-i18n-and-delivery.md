# 链接、存档、语言与交付

## 1. 兼容入口与优先级

应保留 `/aef`、`/aef/list`、`/aef/flow`、`/aef/data` 及数据详情链接。站点可能从根路径或带 base 的路径启动，路径拼接须使用构建 base/router 机制。旧 guard 中删除一个 `/` 的字符串处理不宜复制。

根入口提供单游戏欢迎/继续行为；其后的新计算默认 aef。兼容旧入口或重定向时保留完整 query，包括压缩参数 z、版本 v、重复 o 项及 cet。对其他游戏路由，安全回到 aef 入口，不能把其 query 当成 aef 目标直接执行。`/editor` 在上游是独立顶层路由，单靠 `:id` guard 不能关闭它，必须单独处理。

状态恢复顺序：确定入口和原始版本 → 解压并识别旧aef协议 → 加载对应hash/映射 → 提取特殊目标与别名 → 生成并校验完整普通/扩展状态 → 原子提交 → ready → 允许编辑、求解和新版写回。旧协议适配先于普通目标过滤，具体生命周期按03执行。不能先把资源面板的空默认值写入普通目标，再等待旧 URL 加载。

有效 URL 状态优先于“上次打开的 router”记录；用户手动打开链接不应被最近一次存档覆盖。没有有效 URL 状态时再执行上游继续上次工作区逻辑。显式无效的链接显示可理解的恢复提示，不静默写回一个看似成功的空方案。

## 2. v11 → 新协议的具体差异

上游设计基线协议为 v12，当前分支输出 v11。上游已有 `migrateV11`，主要把传送带/管道和货车设置合成 rank 数组，并把 v 改为12。它不认识本项目的游戏 ID、资源状态或 cet，也不会仅因迁移函数存在就保证本项目链接兼容。

| 兼容项            | 旧值/行为                                                                        | 新实现要求                                                          |
| ----------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 普通目标          | Output/Input/Maximize/Limit = 0/1/2/3                                            | 保留枚举数值和单位编码                                              |
| 隐藏目标          | HideSep=10；11=ItemLimit，12=ItemLimitOutput，13=MachineLimit，14=DomainTransfer | 先提取、解码为资源配置，不能当普通目标吞掉                          |
| 单位              | Items=0、Belts=1、Wagons=2、Machines=3                                           | 先按原单位决定 targetId 使用物品还是配方 hash，再转业务状态         |
| 日速率            | `odr=3`，因子86400                                                               | 新版补枚举与翻译，不回落为分钟                                      |
| 电力权重          | `cet`                                                                            | 旧cet导入ef电力权重；新状态由扩展codec读写与校验，不扩大全局CostKey |
| 净水节点禁用      | 两个 recipe ID 位于 excludedRecipeIds                                            | 回填面板，并保留其他排除项                                          |
| 赤铜原料          | 物品 copper_ore，配方 copper_ore-liquid_water                                    | 双向映射，不能按同名假设查找                                        |
| 隐藏数量          | 类型12保存机器当量；类型13保存实体数量                                           | 类型12按对应配方产率还原资源，类型13不做时间缩放                    |
| 重复内部条目      | 旧载入面板对相同资源或机器条目以后项覆盖前项                                     | 按原顺序后项生效并提示，保留原输入；不自动累加                      |
| 错误/未知内部目标 | 可能无法对应六种资源                                                             | 不删除用户普通目标；给出可定位提示，并保留原输入便于恢复            |

旧目标字段顺序仍是 target、value、unit、type、machine、modules、beacons、overclock、fuel。新旧 RouterSync 的普通字段结构相近，但后续状态模型与校验不相同，不能仅改版本号。

### 2.1 hash 索引必须分开

当前分支有两层 hash：全局 modHash/modHashV0，以及每个数据集的 items/recipes/machines/locations 数组。两层都必须处理。

| 索引表           | 当前分支                            | 上游基线同位置 | 风险                                     |
| ---------------- | ----------------------------------- | -------------- | ---------------------------------------- |
| modHashV0，索引2 | aef                                 | null           | 较早历史编码可能无法辨认                 |
| modHash，索引16  | aef                                 | kr2spo         | 若用上游表解释旧压缩 Mod，会错认其他游戏 |
| aef hash         | 本项目已有的物品/配方/机器/地点顺序 | 上游没有 aef   | 重排数组后短 ID 指向错误实体             |

v11 常用链接由 `/aef` 路径识别游戏，未必携带旧全局 mod 索引；全局表冲突尤其影响迁移链中较早版本的 Mod 字段。因此不要声称每条 v11 链接都会触发索引16，但也不能因为当前示例带 aef 就删掉旧表兼容。

将旧aef表作为只读兼容表，依据旧路径、协议版本和来源选择解码器。新写入采用固定且独立的新版身份/扩展参数，不为“只有一个游戏”而把所有表重排成 aef 在索引0。每数据集的原有 hash 索引保持不变，新增实体只追加；schema 新增但未用数组补空。当前表已缺少11个物品和14个配方，新版 pipe 也要追加；具体清单及禁止复用退休槽位的规则见[04 §1.1](04-data-and-solver-contracts.md#11-当前-hash-已有缺项不能原样视作完整新表)。

### 2.2 新状态编码

使用一个本地命名空间参数 `ef` 保存版本化扩展状态，与上游v12外层协议并存。它是StateExtension接点要新增的协议，不是上游已有字段。字段含义如下：

| 字段                   | 类型与归属                                                            |
| ---------------------- | --------------------------------------------------------------------- |
| version                | 扩展协议版本，固定为1；不能用上游v12代替本地版本                      |
| resourceLimits         | 启用状态与六项供给，数值为每秒Rational字符串，按稳定资源ID保存        |
| machineLimits          | 启用状态与机器额度，数量字符串，不按时间缩放                          |
| transfer               | 启用状态与来源ID；每小时1次的规则来自领域配置，不重复存一个可漂移预算 |
| electric               | 电力权重的Rational字符串，默认1，独立于资源清空动作                   |
| resourceRecipeSettings | 按稳定资源ID保存派生供给适用的机器/燃料/插件等设置；不写普通目标Store |
| checkedDerived         | 无itemId派生行的稳定owner集合；有itemId仍用上游ich，普通目标才进入och |

水节点禁用仅由上游rex/excludedRecipeIds保存，不在ef重复存布尔值。界面名称显示等个人偏好留在本地偏好，不影响共享计算状态。派生行的可分享设置及无物料行勾选属于扩展工作区状态，通过ef保留，不能混入按普通目标索引编码的och。

ef使用键顺序稳定的JSON包络，UTF-8后编码为URL安全base64，再交给Router正常编码；不双重转义。新链接写入ef及其version，即使资源限制关闭，也不能与“启用且全0”合并。具体源字段在领域schema中集中声明，codec只转换边界格式，不能另维护一套默认业务数值。

ef只接受无padding且尾位规范的URL安全base64。数值字符串使用BigInt精确解析；浏览器实现支持的十进制位移为−10000至10000，超过范围返回`numeric-limit`诊断并保留原输入，不截断、不解释为数学不可行。供给与额度保持非负，配方成本允许负值，配方超频必须为正数。

StateExtension把额外状态的响应式快照纳入RouterSync.state/zipState，在明文与hash配置中写入同一ef段，再由上游压缩。只改电力权重、资源配额或开关也必须触发URL更新；不能只订阅普通目标Store。保存/载入、最近工作区、分享、stepHref和图中链接均保留扩展设置。派生资源行按03的owner链接规则定位资源面板，不生成额外普通供给；两类目标的编辑、重置与勾选也由owner分派。

旧v11使用冻结旧表解码，提取11–14和cet，并映射类型12的适用配方设置及旧勾选ID到资源owner后转为领域状态；新v12+ef使用完整新aef表。进入上游版本迁移前保存原协议身份，不能先改成v12再猜选表。显式v12且无ef的aef链接由上游逻辑解码普通字段，按aef默认契约1补全省略值，资源限制关闭、电力权重1；它不按上游全游戏默认值补缺。新写入总是带有效ef。

有效ef与旧字段混合时，ef中对应扩展字段优先，提示忽略重复的旧特殊字段，普通目标保留。ef格式错误或版本未知时保留原输入并显示诊断，不能静默回退到默认值或旧字段再覆盖存档。缺失ef、扩展关闭、启用全0和解码失败是不同状态。

新建及重置使用ProductProfile的EffectiveDefaults；非空历史链接缺字段补全和URL省略基准独立冻结。v0–12省略的unproduceable/recycling仍解释为1000000/1000，显式值（含0）优先；新工作区沿上游100000000/1并显式编码。ef版本1扩展默认保持不变，当前无需升级v12/ef1。真空query的新默认变化不等于重新解释带状态的旧链接。

新编码再次加载必须恢复同一业务状态。上游将来若引入同名参数，应通过版本化适配更换新写入字段并保留旧ef解码，按09接点M07验证，不能复用旧字段含义。

### 2.3 退休配方与第三条示例的明确处理

第三条实际启用的示例“武陵毕业示例（旧版本，需谷地传输致密源石粉末）”含 `o=BS*4*3`：BS 解为 recipes 索引82，对应旧 ID `xiranite_powder`；当前数据中它仍是物品 ID，但已不是配方 ID。若让新版 baseObjectives 直接过滤，这条4台洪炉的指定配方目标会被静默丢失。仅冻结 hash 不能修复这种退休配方。

对这个已核实的案例，采用显式配方别名 `xiranite_powder` → `xiranite_powder-carbon_enr`。依据目标分支祖先 `c3f683cb30725e998606a6ad8a2785e5e0c4a59a` 与当前数据比较，两者均为 time=2、输入 carbon_enr×2 与 liquid_water×1、输出 xiranite_powder×1、生产者 xiranite_oven_1，且 usage/cost/flags/locations 均未另设，物理定义相同。其他同产物的碳块或气体转化配方不满足这组输入和机器条件，不能任意替换。

别名只在旧**配方**解码完成、普通目标校验之前应用，保留目标数量4、单位Machines和其他设置；同名物品目标不改写。随后可将指南第三条重编码为有效新链接，并保留其旧版说明。新链接和原链接迁移后应恢复同一规范化业务状态；不要声称旧版原链接在当前数据中本来就完整有效。

其余退休 ID 逐项登记：有可证明的等价别名才转换；无唯一等价关系则明确提示失效对象、保留原始目标和链接供恢复，不自动挑选同产物配方，不无声删除。其他两条现存示例的解码结果没有失效的物品/配方ID；这只是解码与数据存在性检查，不等于已运行求解通过。

证据：[祖先版本旧配方](https://github.com/endfield-calc/factoriolab/blob/c3f683cb30725e998606a6ad8a2785e5e0c4a59a/src/data/aef/data.json)、[当前数据](https://github.com/endfield-calc/factoriolab/blob/26a49e814f0570e050a19b726b3ba689d282aa3b/src/data/aef/data.json)、[上游目标过滤](https://github.com/factoriolab/factoriolab/blob/00bdb91c2442cd8d715501b9469cec115735645f/src/state/objectives/objectives-store.ts#L53-L64)。

证据：[旧 URL 编解码](https://github.com/endfield-calc/factoriolab/blob/26a49e814f0570e050a19b726b3ba689d282aa3b/src/app/services/router.service.ts#L572-L668)、[旧全局索引](https://github.com/endfield-calc/factoriolab/blob/26a49e814f0570e050a19b726b3ba689d282aa3b/src/data/index.ts)、[上游全局索引](https://github.com/factoriolab/factoriolab/blob/00bdb91c2442cd8d715501b9469cec115735645f/src/data/datasets.ts)、[上游 v11 迁移](https://github.com/factoriolab/factoriolab/blob/00bdb91c2442cd8d715501b9469cec115735645f/src/state/router/migration.ts#L1006-L1022)。

## 3. 本地存档与偏好

两版都使用 localStorage 的 `preferences` 和 `router`。旧 `preferences.states` 按 modId、存档名保存 URL 字符串。兼容读取原键，保留 aef 存档名与原始 URL，再逐个按上述迁移链加载；不要在首次启动时清空 storage 或要求用户手动重建全部方案。

| 字段                              | 处理                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| states.aef                        | 保留每个存档名、URL 和完整业务状态；打开后才进行可验证的转换                                                        |
| language                          | 已保存偏好覆盖初始语言；未保存时仅生产按浏览器完整代码/前缀匹配，未匹配或非生产默认en                               |
| theme=light/dark                  | 对应新版同名主题；不复制色值                                                                                        |
| theme=black                       | 新版无同名选项，映射 dark，并告知该外观名称已变化                                                                   |
| powerUnit                         | 旧数值编码与新版核对后映射，保留用户显式设置，新用户 kW                                                             |
| flowSettings                      | 保留既有枚举含义，缺失 elkAlgorithm 使用上游 layered 默认                                                           |
| hideDuplicateIcons                | 使用新版原生图标布局，旧字段仅保留为历史偏好数据，不重新建立不可操作的隐藏状态                                      |
| columns / rows / disablePaginator | 新版表格和 TableStore 结构不同，迁移有效列显示/精度；旧分页设置若不再有对应能力，只废弃该 UI 偏好，不能删除整份存档 |
| router                            | 只有不存在显式有效 URL 时作为恢复入口，避免跳回其他游戏                                                             |

普通目标与资源配置分别编辑，但新存档必须一起保存。跨页面切换、排序、增加目标、删除目标或更换显示单位不能丢失面板状态。损坏存储要回到可用默认值并保留可导出的原始内容，不写回破坏剩余有效条目。

不同站点的 localStorage 不共享；Pages 与一图流之间继续通过可分享链接交换方案，不能承诺跨域自动同步存档。

## 4. 现有语言选择与翻译加载

区分三个独立问题：界面语言默认值、游戏实体翻译、静态 HTML/manifest 元数据。

1. **界面语言**：支持集合直接复用上游languageOptions的九种语言。仅生产读取navigator.language，按大小写无关的完整代码、语言前缀依次匹配，返回规范代码（包括pt-BR）；都不支持则en。开发/测试初始en，保存偏好覆盖初始语言，手动切换继续持久化。保留environment.production而非域名、构建文案决定生产身份，不改用navigator.languages。
2. **游戏翻译**：aef 原数据名称中文，英文环境也必须请求 en.json。旧 `i18nWithDefault` 的默认常量实际是 en，所以原版缺失翻译优先尝试缓存中的英文包，再由基础数据中文兜底；它没有保证加载默认包。因此新版应明确、可靠地加载 fallback：当前语言完整/逐实体缺项 → 中文基础数据（需要英文回退时必须显式加载英文包），不能依赖“用户先切过英文”这一偶然状态。
3. **扩展名称**：游戏名称及版本文案可以继续由游戏包或品牌配置翻译；英文 EndfieldLab、中文“终末地量化计算器”。页面标题同时监听实体名称和当前界面语言，不只在目标数量变化时更新。
4. **缺失/失败**：游戏包只有 en/zh/ja/ru；de/fr/ko/pt-BR/es界面没有aef翻译包，切换时使用中文基础实体，不出现加载卡死、旧语言残留或空记录。UI词典缺项使用英文fallback，与游戏名称的中文兜底分开处理。
5. **新增文案**：资源面板和操作指南原来大量硬编码中文，新版至少完成中文与英文界面键；其他语言走明示兜底。QQ 入口只在界面语言 zh 时显示，一图流和源码链接始终可用。

上游 `SettingsStore.modI18nResource` 在 lang=en 时直接不请求，这是必须改的具体落点。[源码](https://github.com/factoriolab/factoriolab/blob/00bdb91c2442cd8d715501b9469cec115735645f/src/state/settings/settings-store.ts#L103-L107)

## 5. 品牌与资源处理

| 位置                                       | 目标                                                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| package/README/repository/homepage         | 项目名称、说明和来源改为本项目，保留 fork 来源和许可证                                                                     |
| index.html/title/description/lang/noscript | 按部署产物保留相应中/英文静态文案，产品说明和加载品牌为终末地；静态元数据不参与运行时语言选择                              |
| ObjectivesStore 动态 title                 | 第一个普通目标名称 + 本地化应用名，无普通目标只显示应用名                                                                  |
| Release.version                            | 上游硬编码 FactorioLab 前缀，改为项目名；保持 version/branch/date 可追踪                                                   |
| favicon/apple/Android/PWA/mask/tile        | 使用现有终末地品牌素材并核对尺寸、路径；需要更多尺寸时由源素材生成，不拉回 Factorio 图标                                   |
| 首页及加载图片                             | 处理 public 的 factoriolab.webp 与 factoriolab-animate.webp，以及所有 alt；可采用现有品牌静态图与上游加载容器              |
| 系统精灵图                                 | 只更换/注册游戏品牌图位置，不覆盖仍被通用控件引用的系统图标                                                                |
| 页头链接                                   | 本项目源码、一图流；指南的 Issue 链接保持现有指向并核验其站点配置                                                          |
| 列表/流程图导出                            | CSV/JSON/已有图像导出文件名前缀使用 endfield-calc 或统一产品名，保持导出功能                                               |
| 统计脚本                                   | 当前 AnalyticsService 为 no-op；新版移除上游 gtag 注入，并使 `src/utils/log.ts` 调用安全，不能只删脚本而保留未定义函数调用 |

涉及两类 manifest：旧 `resource/webmanifest/site.webmanifest` 和 `site-zh.webmanifest`，新版用 `public/manifest.webmanifest`。统一使用上游的manifest.webmanifest目标文件名，并同步HTML、SW和构建流程；现有图标根路径须改成能在实际 base 下解析的路径。

旧导出服务只改产品文件名，CSV按钮被禁用。当前沿新上游原生CSV字段、实体ID与编码，仅保留产品文件名前缀；取消迁移时额外增加的中文表头、名称替换和BOM层，保留JSON及图像导出。[源分支按钮条件](https://github.com/endfield-calc/factoriolab/blob/26a49e814f0570e050a19b726b3ba689d282aa3b/src/app/components/steps/steps.component.html#L30-L42)

## 6. 双站构建和发布顺序

目前源分支的生产工作流发布到 `endfield-calc/endfield-calc.github.io` 的 master 分支，并同步中文产物到一图流 COS，刷新 `factory.ef.yituliu.cn` CDN。仓库中的首页/源码/Issue URL 并不完全统一，迁移时按用途集中记录，不能全局字符串替换成同一个地址。凭据仅引用既有Secrets名称；远端权限在实施阶段验证。

迁移顺序：

1. 沿用上游package-lock、安装与quality checks，保留内部Angular项目键及 `dist/factoriolab/browser` 输出路径；产品名称与元数据由ProductProfile提供，不为外显品牌重命名整套构建目录。
2. 生成本项目 release.json。新版从根路径 `release.json` 读取，不能继续写到旧 `assets/release.json`。
3. 为 Pages 和中文站分别准备最终 index、404、manifest、图标等文件；404 继承本产物 index 内容和 base。
4. 所有变更完成后为**每一份最终产物**重新生成 ngsw.json，再上传。不能在写 release 或替换中文 title 前生成哈希。
5. 分别发布到本项目 Pages 与 COS/CDN；只在相应产物成功后清理对应临时 artifact。新上游的默认生产工作流指向上游仓库，必须先改目的地，避免保留错误目标。

push 的 paths 过滤必须覆盖 `public/**`、`src/**`、相关配置与工作流等真实输入。当前仅 `src/**` 的条件在数据迁到 public 后会漏掉数据更新。应保留 workflow_dispatch 的两个部署开关，适配新的工作分支/正式分支约定，并在发布前验证只构建和单目的地模式。

本次忽略其他本项目分支；源分支现存的 `/advance` SW 排除只作为已存在配置记录。可以保留它以免扩大旧 SW 控制范围，但不据此引入任何其他分支功能或部署任务。

来源：[源分支发布配置](https://github.com/endfield-calc/factoriolab/blob/26a49e814f0570e050a19b726b3ba689d282aa3b/.github/workflows/deploy.yml)、[上游发布配置](https://github.com/factoriolab/factoriolab/blob/00bdb91c2442cd8d715501b9469cec115735645f/.github/workflows/build.yml)、[上游 Release](https://github.com/factoriolab/factoriolab/blob/00bdb91c2442cd8d715501b9469cec115735645f/src/data/release.ts)。

## 7. PWA 更新行为

沿上游VERSION_READY确认更新和unrecoverable刷新路径；就绪通知允许稍后操作，不循环强制刷新。不再另加下载检测确认框和生产安装失败确认框，避免本地维护平行通知流程。

验证根 base 及子路径 base 的 index、404、manifest、图标、release、data、i18n、wasm 全部可加载，SW scope 与站点范围一致。上线前验证一个真实旧缓存客户端升级至新包的过程，尤其是 `assets/release.json`→`release.json`、旧图集坐标→新坐标、旧 JS→新数据组合不能混用。

## 8. 品牌与交付的集中边界

品牌、链接、导出前缀由ProductProfile提供，初始化/modified/重置共享EffectiveDefaults；历史省略成本采用两键冻结差量。名称开关仅属于当前Picker实例，不另建持久化显示Store；现存旧显示key与备份仍可导出，不新建或覆盖它们。专属词典构建时合成，静态标题、manifest和站点元数据由同一配置生成。

本地打包入口只收集aef及必需系统资产，通用源码与隔离测试夹具保留。发布目的地、release、404和SW的差异放在 `scripts/endfield` 与独立发布工作流，保留上游安装、检查、测试和构建能力，不把旧CI整体覆盖新上游CI。接点与后续同步规则按09执行。

## 9. 项目既有文档同步

README及既有数据/标志说明按D05维护，与对应实现一并完成。内容边界取01固定源提交的原文，允许在同一主题内校正过时术语、实际字段和已有链接；README保持既有产品说明用途，数据说明保持既有字段/语义说明用途。

不得借迁移添加原文没有的开发或执行记录、启动/迁移/验收入口、数据版本清单等主题，也不得将本方案的设计基线、实施路径和验收产物复制到这些项目文档。已有字段中的version含义、已有脚本引用或已有产品链接需要校正时，只更新原处的必要说明；不据此新增版本栏目或执行导航。

A31按原文范围、最终代码和最终文档逐项检查一致性与范围，不以新增文档篇幅或增加导航作为完成证据。
