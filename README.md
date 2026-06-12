# YYQ 个人网站

这是一个基于 Vite、React、TypeScript 和 Tailwind CSS 的个人网站项目，用于展示个人介绍、项目经历、技能信息和联系方式。

## 项目状态

- 当前版本：`0.1.2`
- GitHub 仓库：`https://github.com/mrxiaoxies/YYQ-Personal-web`
- 版本记录：见 [CHANGELOG.md](./CHANGELOG.md)
- 操作文档：见 [docs/OPERATIONS.md](./docs/OPERATIONS.md)

## 技术栈

- Vite 7
- React 19
- TypeScript
- Tailwind CSS
- lucide-react

## 本地运行

```powershell
npm install
npm run dev
```

开发服务默认监听 `127.0.0.1`，终端会输出实际访问地址。

## 构建与预览

```powershell
npm run build
npm run preview
```

构建产物会生成到 `dist/`，该目录不提交到 GitHub。

## 目录结构

```text
.
├── public/              # 静态资源
├── src/                 # React 源码
│   ├── components/      # UI 组件
│   ├── lib/             # 工具函数
│   ├── App.tsx          # 主页面
│   ├── index.css        # 全局样式
│   └── main.tsx         # 应用入口
├── docs/                # 操作与维护文档
├── CHANGELOG.md         # 版本记录
├── VERSION              # 当前版本号
└── package.json         # 依赖、脚本和 npm 版本号
```

## GitHub 发布

首次上传到当前仓库：

```powershell
git remote add origin https://github.com/mrxiaoxies/YYQ-Personal-web.git
git branch -M main
git push -u origin main
```

如果已经绑定远程仓库，后续更新使用：

```powershell
git add .
git commit -m "chore: update site"
git push
```
