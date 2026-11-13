# 差异文件索引

## 统计和读法

本索引按只读 `git diff --name-status --find-renames` 的结果列出文件，固定目标为 `26a49e814f0570e050a19b726b3ba689d282aa3b`。原始基线为 `7b46c4389f257a57aaa23b3094c556ae1a39d7a9`，辅助检查点为 `b8c1f021037993bba644887f0127b6ca0e869b3c`。

原始差异344个文件；M表示修改、A表示新增、D表示删除、R100表示内容完全相同的重命名。辅助列是“检查点→目标”的状态，`=`表示该路径与检查点相同。处理列是范围分流，并不表示整文件可以直接复制；具体语义以02–06的功能和契约为准。

| 分组                     | 原始差异文件数 |
| ------------------------ | -------------- |
| 仓库、构建、文档与工作流 | 21             |
| 翻译与品牌素材           | 23             |
| 应用源码和测试           | 80             |
| 游戏数据与注册           | 213            |
| 入口、环境与样式         | 7              |

重命名一行计一个文件；如果关闭重命名识别，会把一个迁移样例文件拆成删除和新增，多出一行。原始差异和辅助差异的文件集合不完全相同，不能将两者文件数相减当作本地定制数。

## 仓库、构建、文档与工作流

| 原始状态 | 路径（相对仓库根目录）                      | 辅助状态 | 处理                                                     |
| -------- | ------------------------------------------- | -------- | -------------------------------------------------------- |
| M        | `.editorconfig`                             | M        | 沿用新上游开发工具规则，不机械复制（03）                 |
| D        | `.github/CODEOWNERS`                        | D        | 重接本项目交付/维护配置；保留新版质量检查（05、06）      |
| D        | `.github/FUNDING.yml`                       | D        | 重接本项目交付/维护配置；保留新版质量检查（05、06）      |
| D        | `.github/ISSUE_TEMPLATE/bug_report.md`      | D        | 重接本项目交付/维护配置；保留新版质量检查（05、06）      |
| D        | `.github/ISSUE_TEMPLATE/feature_request.md` | D        | 重接本项目交付/维护配置；保留新版质量检查（05、06）      |
| D        | `.github/ISSUE_TEMPLATE/mod-request.md`     | D        | 重接本项目交付/维护配置；保留新版质量检查（05、06）      |
| A        | `.github/workflows/deploy.yml`              | A        | 重接本项目交付/维护配置；保留新版质量检查（05、06）      |
| D        | `.github/workflows/pr-title.yml`            | D        | 重接本项目交付/维护配置；保留新版质量检查（05、06）      |
| D        | `.github/workflows/prod.yml`                | D        | 重接本项目交付/维护配置；保留新版质量检查（05、06）      |
| D        | `.github/workflows/staging.yml`             | D        | 重接本项目交付/维护配置；保留新版质量检查（05、06）      |
| D        | `.github/workflows/tests.yml`               | D        | 重接本项目交付/维护配置；保留新版质量检查（05、06）      |
| M        | `.prettierignore`                           | M        | 沿用新上游开发工具规则，不机械复制（03）                 |
| M        | `README.md`                                 | M        | 校订既有项目介绍与链接，不增开发/执行/版本栏目（02、06） |
| A        | `docs/flags.md`                             | A        | 沿既有字段/语义说明按实现校订，不扩写新主题（02、06）    |
| A        | `docs/mod-data.md`                          | A        | 沿既有字段/语义说明按实现校订，不扩写新主题（02、06）    |
| A        | `docs/recipe-flags.md`                      | A        | 沿既有字段/语义说明按实现校订，不扩写新主题（02、06）    |
| M        | `ngsw-config.json`                          | M        | 部署/SW/release按新架构重新对接（05）                    |
| M        | `package-lock.json`                         | M        | 不搬旧锁文件；使用上游锁文件（03、06）                   |
| M        | `package.json`                              | M        | 只恢复项目元数据；依赖与脚本沿用新上游（03、05）         |
| M        | `release.config.js`                         | M        | 部署/SW/release按新架构重新对接（05）                    |
| M        | `scripts/write-release-info.sh`             | M        | 部署/SW/release按新架构重新对接（05）                    |

## 翻译与品牌素材

| 原始状态 | 路径（相对仓库根目录）                        | 辅助状态 | 处理                                         |
| -------- | --------------------------------------------- | -------- | -------------------------------------------- |
| A        | `resource/icons/icon-svg.ai`                  | A        | 品牌/图集/manifest素材；适配新路径（04、05） |
| A        | `resource/icons/icon.psd`                     | A        | 品牌/图集/manifest素材；适配新路径（04、05） |
| A        | `resource/webmanifest/site-zh.webmanifest`    | A        | 品牌/图集/manifest素材；适配新路径（04、05） |
| A        | `resource/webmanifest/site.webmanifest`       | A        | 品牌/图集/manifest素材；适配新路径（04、05） |
| M        | `src/assets/i18n/de.json`                     | M        | 提取品牌/功能翻译，合入上游新词典（02、05）  |
| M        | `src/assets/i18n/en.json`                     | M        | 提取品牌/功能翻译，合入上游新词典（02、05）  |
| M        | `src/assets/i18n/fr.json`                     | M        | 提取品牌/功能翻译，合入上游新词典（02、05）  |
| M        | `src/assets/i18n/ja.json`                     | M        | 提取品牌/功能翻译，合入上游新词典（02、05）  |
| M        | `src/assets/i18n/ru.json`                     | M        | 提取品牌/功能翻译，合入上游新词典（02、05）  |
| M        | `src/assets/i18n/zh.json`                     | M        | 提取品牌/功能翻译，合入上游新词典（02、05）  |
| M        | `src/assets/icons/android-chrome-192x192.png` | M        | 品牌/图集/manifest素材；适配新路径（04、05） |
| M        | `src/assets/icons/android-chrome-512x512.png` | M        | 品牌/图集/manifest素材；适配新路径（04、05） |
| M        | `src/assets/icons/apple-touch-icon.png`       | M        | 品牌/图集/manifest素材；适配新路径（04、05） |
| M        | `src/assets/icons/browserconfig.xml`          | M        | 品牌/图集/manifest素材；适配新路径（04、05） |
| M        | `src/assets/icons/factoriolab.webp`           | M        | 品牌/图集/manifest素材；适配新路径（04、05） |
| M        | `src/assets/icons/favicon-128x128.png`        | M        | 品牌/图集/manifest素材；适配新路径（04、05） |
| M        | `src/assets/icons/favicon-16x16.png`          | M        | 品牌/图集/manifest素材；适配新路径（04、05） |
| M        | `src/assets/icons/favicon-32x32.png`          | M        | 品牌/图集/manifest素材；适配新路径（04、05） |
| M        | `src/assets/icons/favicon.ico`                | M        | 品牌/图集/manifest素材；适配新路径（04、05） |
| M        | `src/assets/icons/icons.webp`                 | M        | 品牌/图集/manifest素材；适配新路径（04、05） |
| M        | `src/assets/icons/mstile-150x150.png`         | M        | 品牌/图集/manifest素材；适配新路径（04、05） |
| M        | `src/assets/icons/safari-pinned-tab.svg`      | M        | 品牌/图集/manifest素材；适配新路径（04、05） |
| D        | `src/assets/icons/site.webmanifest`           | D        | 品牌/图集/manifest素材；适配新路径（04、05） |

## 应用源码和测试

| 原始状态 | 路径（相对仓库根目录）                                               | 辅助状态 | 处理                                               |
| -------- | -------------------------------------------------------------------- | -------- | -------------------------------------------------- |
| M        | `src/app/app.component.spec.ts`                                      | M        | 按新架构重写有效行为测试；不复制旧夹具依赖（06）   |
| M        | `src/app/app.component.ts`                                           | M        | 新版SW通知与资源初始化（03、05）                   |
| M        | `src/app/app.config.ts`                                              | M        | 新版SW通知与资源初始化（03、05）                   |
| M        | `src/app/components/belt-overlay/belt-overlay.component.ts`          | =        | 上游已有/历史合入；验证复用（01、03）              |
| M        | `src/app/components/costs/costs.component.html`                      | M        | 恢复有效界面/品牌/名称能力，使用上游组件（02、03） |
| M        | `src/app/components/costs/costs.component.spec.ts`                   | M        | 按新架构重写有效行为测试；不复制旧夹具依赖（06）   |
| M        | `src/app/components/flow-settings/flow-settings.component.spec.ts`   | M        | 按新架构重写有效行为测试；不复制旧夹具依赖（06）   |
| M        | `src/app/components/header/header.component.html`                    | M        | 恢复有效界面/品牌/名称能力，使用上游组件（02、03） |
| M        | `src/app/components/header/header.component.scss`                    | =        | 上游已有/历史合入；验证复用（01、03）              |
| M        | `src/app/components/header/header.component.spec.ts`                 | M        | 按新架构重写有效行为测试；不复制旧夹具依赖（06）   |
| M        | `src/app/components/header/header.component.ts`                      | M        | 恢复有效界面/品牌/名称能力，使用上游组件（02、03） |
| M        | `src/app/components/objectives/objectives.component.html`            | M        | 恢复有效界面/品牌/名称能力，使用上游组件（02、03） |
| M        | `src/app/components/objectives/objectives.component.ts`              | M        | 恢复有效界面/品牌/名称能力，使用上游组件（02、03） |
| M        | `src/app/components/picker/picker.component.html`                    | M        | 恢复有效界面/品牌/名称能力，使用上游组件（02、03） |
| M        | `src/app/components/picker/picker.component.spec.ts`                 | M        | 按新架构重写有效行为测试；不复制旧夹具依赖（06）   |
| M        | `src/app/components/picker/picker.component.ts`                      | M        | 恢复有效界面/品牌/名称能力，使用上游组件（02、03） |
| A        | `src/app/components/resource-input/resource-input.component.html`    | A        | 重建资源面板与业务状态；不搬旧组件（02–06）        |
| A        | `src/app/components/resource-input/resource-input.component.scss`    | A        | 旧样式不迁移；功能表现由上游组件承接（02、03）     |
| A        | `src/app/components/resource-input/resource-input.component.spec.ts` | A        | 按新架构重写有效行为测试；不复制旧夹具依赖（06）   |
| A        | `src/app/components/resource-input/resource-input.component.ts`      | A        | 重建资源面板与业务状态；不搬旧组件（02–06）        |
| M        | `src/app/components/settings/settings.component.html`                | M        | 恢复有效界面/品牌/名称能力，使用上游组件（02、03） |
| M        | `src/app/components/settings/settings.component.scss`                | M        | 旧样式不迁移；功能表现由上游组件承接（02、03）     |
| M        | `src/app/components/settings/settings.component.spec.ts`             | M        | 按新架构重写有效行为测试；不复制旧夹具依赖（06）   |
| M        | `src/app/components/settings/settings.component.ts`                  | M        | 恢复有效界面/品牌/名称能力，使用上游组件（02、03） |
| M        | `src/app/components/steps/steps.component.html`                      | M        | 恢复有效界面/品牌/名称能力，使用上游组件（02、03） |
| M        | `src/app/components/steps/steps.component.scss`                      | M        | 旧样式不迁移；功能表现由上游组件承接（02、03）     |
| M        | `src/app/components/tech-picker/tech-picker.component.ts`            | =        | 上游已有/历史合入；验证复用（01、03）              |
| M        | `src/app/components/tooltip/tooltip.component.html`                  | =        | 上游已有/历史合入；验证复用（01、03）              |
| A        | `src/app/components/user-tips/user-tips.component.html`              | A        | 操作指南和3条示例；使用新组件（02、05、06）        |
| A        | `src/app/components/user-tips/user-tips.component.scss`              | A        | 旧样式不迁移；功能表现由上游组件承接（02、03）     |
| A        | `src/app/components/user-tips/user-tips.component.spec.ts`           | A        | 按新架构重写有效行为测试；不复制旧夹具依赖（06）   |
| A        | `src/app/components/user-tips/user-tips.component.ts`                | A        | 操作指南和3条示例；使用新组件（02、05、06）        |
| M        | `src/app/guards/id.guard.ts`                                         | M        | 单游戏/数据/翻译/默认设置（02–05）                 |
| M        | `src/app/models/constants.ts`                                        | M        | 单游戏/数据/翻译/默认设置（02–05）                 |
| M        | `src/app/models/data/defaults.ts`                                    | M        | 单游戏/数据/翻译/默认设置（02–05）                 |
| M        | `src/app/models/data/mod-i18n.ts`                                    | M        | 单游戏/数据/翻译/默认设置（02–05）                 |
| M        | `src/app/models/data/recipe.ts`                                      | M        | 恢复有效界面/品牌/名称能力，使用上游组件（02、03） |
| M        | `src/app/models/defaults.ts`                                         | =        | 上游已有/历史合入；验证复用（01、03）              |
| M        | `src/app/models/enum/display-rate.ts`                                | M        | 恢复有效界面/品牌/名称能力，使用上游组件（02、03） |
| M        | `src/app/models/enum/game.ts`                                        | M        | 单游戏/数据/翻译/默认设置（02–05）                 |
| M        | `src/app/models/enum/language.ts`                                    | M        | 现有语言选择与偏好映射（02、05）                   |
| M        | `src/app/models/enum/objective-type.ts`                              | M        | 协议/隐藏目标兼容及资源状态拆分（03–06）           |
| M        | `src/app/models/enum/preset.spec.ts`                                 | =        | 上游已有/历史合入；验证复用（01、03）              |
| M        | `src/app/models/enum/preset.ts`                                      | =        | 上游已有/历史合入；验证复用（01、03）              |
| M        | `src/app/models/enum/theme.ts`                                       | M        | 现有语言选择与偏好映射（02、05）                   |
| M        | `src/app/models/flags.ts`                                            | M        | 单游戏/数据/翻译/默认设置（02–05）                 |
| M        | `src/app/models/game-info.ts`                                        | M        | 单游戏/数据/翻译/默认设置（02–05）                 |
| M        | `src/app/models/lab-params.ts`                                       | M        | 协议/隐藏目标兼容及资源状态拆分（03–06）           |
| M        | `src/app/models/matrix-result.ts`                                    | M        | 规则集中编译，经通用接点接入（03、04、06、09）     |
| M        | `src/app/models/objective.ts`                                        | M        | 协议/隐藏目标兼容及资源状态拆分（03–06）           |
| M        | `src/app/models/settings/cost-settings.ts`                           | M        | 恢复有效界面/品牌/名称能力，使用上游组件（02、03） |
| M        | `src/app/routes/landing/landing.component.html`                      | M        | 恢复有效界面/品牌/名称能力，使用上游组件（02、03） |
| M        | `src/app/routes/landing/landing.component.scss`                      | M        | 旧样式不迁移；功能表现由上游组件承接（02、03）     |
| M        | `src/app/routes/landing/landing.component.ts`                        | M        | 恢复有效界面/品牌/名称能力，使用上游组件（02、03） |
| M        | `src/app/routes/main/main.component.html`                            | M        | 恢复有效界面/品牌/名称能力，使用上游组件（02、03） |
| M        | `src/app/routes/main/main.component.ts`                              | M        | 恢复有效界面/品牌/名称能力，使用上游组件（02、03） |
| M        | `src/app/routes/main/routes/data/data.component.html`                | M        | 恢复有效界面/品牌/名称能力，使用上游组件（02、03） |
| M        | `src/app/routes/main/routes/data/data.component.ts`                  | M        | 恢复有效界面/品牌/名称能力，使用上游组件（02、03） |
| M        | `src/app/routes/main/routes/flow/flow.component.scss`                | M        | 旧样式不迁移；功能表现由上游组件承接（02、03）     |
| M        | `src/app/routes/main/routes/flow/flow.component.spec.ts`             | M        | 按新架构重写有效行为测试；不复制旧夹具依赖（06）   |
| M        | `src/app/routes/main/routes/flow/flow.component.ts`                  | M        | 复用新版流图/导出，恢复项目命名（02、03、05）      |
| M        | `src/app/services/analytics.service.ts`                              | M        | 保持禁用统计；同步处理log调用（05）                |
| M        | `src/app/services/content.service.spec.ts`                           | M        | 按新架构重写有效行为测试；不复制旧夹具依赖（06）   |
| M        | `src/app/services/content.service.ts`                                | M        | 新版SW通知与资源初始化（03、05）                   |
| M        | `src/app/services/data.service.ts`                                   | M        | 单游戏/数据/翻译/默认设置（02–05）                 |
| M        | `src/app/services/export.service.ts`                                 | M        | 复用新版流图/导出，恢复项目命名（02、03、05）      |
| M        | `src/app/services/rate.service.spec.ts`                              | M        | 按新架构重写有效行为测试；不复制旧夹具依赖（06）   |
| M        | `src/app/services/rate.service.ts`                                   | M        | 规则集中编译，经通用接点接入（03、04、06、09）     |
| M        | `src/app/services/recipe.service.spec.ts`                            | M        | 按新架构重写有效行为测试；不复制旧夹具依赖（06）   |
| M        | `src/app/services/recipe.service.ts`                                 | M        | 规则集中编译，经通用接点接入（03、04、06、09）     |
| M        | `src/app/services/router.service.spec.ts`                            | M        | 按新架构重写有效行为测试；不复制旧夹具依赖（06）   |
| M        | `src/app/services/router.service.ts`                                 | M        | 协议/隐藏目标兼容及资源状态拆分（03–06）           |
| M        | `src/app/services/simplex.service.spec.ts`                           | M        | 按新架构重写有效行为测试；不复制旧夹具依赖（06）   |
| M        | `src/app/services/simplex.service.ts`                                | M        | 规则集中编译，经通用接点接入（03、04、06、09）     |
| M        | `src/app/store/objectives.service.spec.ts`                           | M        | 按新架构重写有效行为测试；不复制旧夹具依赖（06）   |
| M        | `src/app/store/objectives.service.ts`                                | M        | 普通目标/资源状态所有权与完整计算上下文（03–06）   |
| M        | `src/app/store/preferences.service.ts`                               | M        | 现有语言选择与偏好映射（02、05）                   |
| M        | `src/app/store/settings.service.spec.ts`                             | M        | 按新架构重写有效行为测试；不复制旧夹具依赖（06）   |
| M        | `src/app/store/settings.service.ts`                                  | M        | 单游戏/数据/翻译/默认设置（02–05）                 |
| M        | `src/app/store/store.ts`                                             | M        | 普通目标/资源状态所有权与完整计算上下文（03–06）   |

## 游戏数据与注册

| 原始状态 | 路径（相对仓库根目录）                                        | 辅助状态 | 处理                                               |
| -------- | ------------------------------------------------------------- | -------- | -------------------------------------------------- |
| D        | `src/data/016/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/016/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/016/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/016/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/017/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/017/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/017/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/017/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/1.1e/data.json`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/1.1e/defaults.json`                                 | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/1.1e/hash.json`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/1.1e/i18n/ja.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/1.1e/icons.webp`                                    | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/2.0/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/2.0/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/2.0/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/2.0/i18n/ja.json`                                   | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/2.0/i18n/zh.json`                                   | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/2.0/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/2.0q/data.json`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/2.0q/defaults.json`                                 | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/2.0q/hash.json`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/2.0q/icons.webp`                                    | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/248/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/248/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/248/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/248/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/248kr2sxp/data.json`                                | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/248kr2sxp/defaults.json`                            | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/248kr2sxp/hash.json`                                | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/248kr2sxp/icons.webp`                               | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/248o/data.json`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/248o/defaults.json`                                 | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/248o/hash.json`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/248o/icons.webp`                                    | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/aai/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/aai/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/aai/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/aai/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| A        | `src/data/aef/data-dsp.json`                                  | A        | 历史样例，不进入产品数据（04）                     |
| A        | `src/data/aef/data-sfy.json`                                  | A        | 历史样例，不进入产品数据（04）                     |
| A        | `src/data/aef/data-spa.json`                                  | A        | 历史样例，不进入产品数据（04）                     |
| A        | `src/data/aef/data.json`                                      | A        | aef有效数据；转换schema并保持ID/hash语义（04、05） |
| R100     | `src/data/dsp/defaults.json → src/data/aef/defaults-spa.json` | R100     | 历史样例，不进入产品数据（04）                     |
| A        | `src/data/aef/hash.json`                                      | A        | aef有效数据；转换schema并保持ID/hash语义（04、05） |
| A        | `src/data/aef/i18n/en.json`                                   | A        | aef有效数据；转换schema并保持ID/hash语义（04、05） |
| A        | `src/data/aef/i18n/ja.json`                                   | A        | aef有效数据；转换schema并保持ID/hash语义（04、05） |
| A        | `src/data/aef/i18n/ru.json`                                   | A        | aef有效数据；转换schema并保持ID/hash语义（04、05） |
| A        | `src/data/aef/i18n/zh.json`                                   | A        | aef有效数据；转换schema并保持ID/hash语义（04、05） |
| A        | `src/data/aef/icons.webp`                                     | A        | aef有效数据；转换schema并保持ID/hash语义（04、05） |
| D        | `src/data/ang/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ang/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ang/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ang/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ango/data.json`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ango/defaults.json`                                 | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ango/hash.json`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ango/icons.webp`                                    | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/bio/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/bio/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/bio/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/bio/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/bob/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/bob/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/bob/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/bob/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/bobang/data.json`                                   | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/bobang/defaults.json`                               | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/bobang/hash.json`                                   | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/bobang/icons.webp`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/coi/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/coi/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/coi/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/coi/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/dsp/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/dsp/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/dsp/i18n/zh.json`                                   | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/dsp/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/dsp/map.json`                                       | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/efs/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/efs/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/efs/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/efs/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/fep/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/fep/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/fep/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/fep/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ffw/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ffw/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ffw/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ffw/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ffy/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ffy/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ffy/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ffy/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/fpp/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/fpp/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/fpp/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/fpp/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| M        | `src/data/index.ts`                                           | M        | 单游戏注册与旧全局hash兼容（03、05）               |
| D        | `src/data/ir3/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ir3/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ir3/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ir3/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/kr2/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/kr2/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/kr2/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/kr2/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/kr2248/data.json`                                   | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/kr2248/defaults.json`                               | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/kr2248/hash.json`                                   | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/kr2248/icons.webp`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/kr2aai/data.json`                                   | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/kr2aai/defaults.json`                               | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/kr2aai/hash.json`                                   | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/kr2aai/icons.webp`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/kr2ffw/data.json`                                   | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/kr2ffw/defaults.json`                               | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/kr2ffw/hash.json`                                   | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/kr2ffw/icons.webp`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/kr2p/data.json`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/kr2p/defaults.json`                                 | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/kr2p/hash.json`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/kr2p/icons.webp`                                    | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/kr2sxp/data.json`                                   | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/kr2sxp/defaults.json`                               | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/kr2sxp/hash.json`                                   | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/kr2sxp/icons.webp`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/lls/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/lls/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/lls/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/lls/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/mbf/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/mbf/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/mbf/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/mbf/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/msc/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/msc/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/msc/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/msc/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/nls/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/nls/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/nls/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/nls/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/omf/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/omf/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/omf/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/omf/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ps2/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ps2/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ps2/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ps2/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/pys/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/pys/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/pys/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/pys/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/pysalf/data.json`                                   | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/pysalf/defaults.json`                               | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/pysalf/hash.json`                                   | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/pysalf/icons.webp`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/qat/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/qat/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/qat/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/qat/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ram/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ram/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ram/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ram/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/sbk/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/sbk/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/sbk/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/sbk/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/sea/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/sea/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/sea/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/sea/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/sfy/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/sfy/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/sfy/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/sfy/i18n/fr.json`                                   | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/sfy/i18n/zh.json`                                   | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/sfy/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/spa/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/spa/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/spa/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/spa/i18n/ja.json`                                   | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/spa/i18n/zh.json`                                   | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/spa/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/sxp/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/sxp/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/sxp/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/sxp/i18n/ja.json`                                   | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/sxp/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/tta/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/tta/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/tta/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/tta/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ulc/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ulc/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ulc/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/ulc/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/vbz/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/vbz/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/vbz/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/vbz/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/wt2/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/wt2/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/wt2/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/wt2/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/xan/data.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/xan/defaults.json`                                  | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/xan/hash.json`                                      | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |
| D        | `src/data/xan/icons.webp`                                     | D        | 旧分支删除项；新生产包排除，通用夹具保留（01、09） |

## 入口、环境与样式

| 原始状态 | 路径（相对仓库根目录）                 | 辅助状态 | 处理                                           |
| -------- | -------------------------------------- | -------- | ---------------------------------------------- |
| M        | `src/environments/environment.prod.ts` | M        | 部署/SW/release按新架构重新对接（05）          |
| M        | `src/environments/index.ts`            | M        | 部署/SW/release按新架构重新对接（05）          |
| M        | `src/index.html`                       | M        | 品牌/入口/元数据（02、05）                     |
| M        | `src/styles.scss`                      | =        | 上游已有/历史合入；验证复用（01、03）          |
| M        | `src/styles/_icons.scss`               | M        | 旧样式不迁移；功能表现由上游组件承接（02、03） |
| M        | `src/styles/_theme-overrides.scss`     | M        | 旧样式不迁移；功能表现由上游组件承接（02、03） |
| M        | `src/styles/themes/light/theme.css`    | M        | 旧样式不迁移；功能表现由上游组件承接（02、03） |

## 辅助检查点额外发现的路径

下列路径在原fork点不存在，之后由旧上游引入，再被本项目删除，所以不出现在原始344行中。它们只用于证明历史来源；不能以此增加非Endfield迁移功能。

| 辅助状态 | 路径                         | 处理                       |
| -------- | ---------------------------- | -------------------------- |
| D        | `src/data/fay/data.json`     | 其他游戏数据，不进入生产包 |
| D        | `src/data/fay/defaults.json` | 其他游戏数据，不进入生产包 |
| D        | `src/data/fay/hash.json`     | 其他游戏数据，不进入生产包 |
| D        | `src/data/fay/icons.webp`    | 其他游戏数据，不进入生产包 |

## 未修改文件的边界检查

本索引只列Git差异，不能代替依赖审计。例如旧ItemJson未读取的buildIcon附加字段、未修改的aef hash消费路径、上游新增editor顶层路由、log统计函数、ModHash空数组和新TableStore都可能影响迁移。它们的处理已在03–06说明，不因未出现在原始diff中就忽略。

迁移不按本表逐文件重放补丁；这些路径用于确认来源和功能范围。新实现布局与共享文件变化按03和09集中设计，物理数据、协议及可观察行为按04–06验收。
