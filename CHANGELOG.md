# Changelog

本项目遵循语义化版本号：`主版本.次版本.修订版本`。

## [0.1.2] - 2026-06-12

### Added

- 新增本地自托管字体资源，包含 `Instrument Serif`、`Inter` 和 `LXGW WenKai`。
- 新增统一字体入口 `public/fonts/fonts.css`，移动端不再依赖远程字体服务。

## [0.1.1] - 2026-06-12

### Fixed

- 优化移动端字体栈，避免手机无法加载远程字体时掉回非设计字体。
- 统一页面硬编码字体声明，中文展示标题改用 `--font-cjk-display`。

## [0.1.0] - 2026-06-12

### Added

- 建立个人网站项目的 GitHub 发布准备。
- 新增版本号文件 `VERSION`。
- 新增项目操作文档 `docs/OPERATIONS.md`。
- 新增 Git 忽略规则，排除依赖、构建产物、环境变量和本地备份目录。

### Changed

- 将 npm scripts 调整为跨环境可执行命令，去除本机绝对路径依赖。
- 重写 README，补充运行、构建、版本和 GitHub 发布说明。
