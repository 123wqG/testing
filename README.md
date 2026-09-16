# 公务员备考个人工作台

一个用于每天安排任务、记录学习时长、保存截图和复习资料的个人网页。采用 Vite + 原生 JavaScript，构建后为纯静态文件。

## 功能

- 每日待办：新增、编辑、勾选、删除、排序、顺延。
- 每日固定模板，与每一天生成的任务分开保存。
- 手动学习时长、开始/暂停/结束计时、历史月历与轻量统计。
- 行测和申论资料库，多图、原图与缩略图、备注、标签、搜索、排序。
- 手机底部导航、桌面侧栏、浅色与深色、基础 PWA。
- Supabase 邮箱密码登录、个人数据隔离、私有图片存储。

**默认未连接云端时，数据保存在当前浏览器。上线网站不等于启用云同步。**

## 本地运行

需要 Node.js 22.12 或更新版本，推荐 24。

```sh
npm ci
npm run dev
```

打开终端显示的 Local 地址。手机与电脑在同一局域网时，可使用 Network 地址预览。

```sh
npm test
npm run test:db
npm run build
npm run preview
```

## GitHub Pages

在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。

推送 `main` 会运行 `.github/workflows/pages.yml`：安装依赖、业务与数据库测试、构建、发布 `dist/`。也可从 Actions 手动运行。发布成功后的网址以该工作流部署结果为准。

资源使用相对路径，页面使用 hash 路由，支持仓库子目录及刷新。GitHub Pages 只托管前端，不保存账号、数据库和学习图片。

流程参考 [GitHub 官方 Pages 工作流说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 配置私人云端

1. 创建 Supabase 项目，在全新项目执行 [`supabase/schema.sql`](supabase/schema.sql)。脚本创建五张表、owner RLS、私有图片 bucket 和事务函数。
2. 禁止开放注册，在 Auth 控制台手动创建自己的邮箱密码账号。
3. 网页“设置”中填写 Project URL 和 publishable / anon key，然后登录。其他设备使用相同配置和账号。
4. 可选：在仓库 Settings → Secrets and variables → Actions → Variables 配置 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` 后重新运行部署，使所有设备直接进入云端登录流程。

只能填写允许公开使用的 key。**不要提交 service_role、secret key 或密码，不要关闭 RLS，不要把图片 bucket 设为 public。**

本地 `.env.local` 不纳入版本控制。构建变量会进入公开静态文件，因此它们不能包含后台秘密。该项目未预置任何真实 Supabase 账号或密钥。

## 目录

```text
src/                 页面、样式、业务、图片与数据适配层
supabase/schema.sql  数据模型、RLS、私有 Storage
public/              PWA 清单、图标、service worker
tests/               核心逻辑、浏览器、SQL 与云接口测试
docs/                设计说明与本地验收记录
.github/workflows/   GitHub Pages 构建发布
```

更多规则与真机验收项见 [`使用说明.md`](使用说明.md)。本地测试结果见 [`docs/验收报告.md`](docs/验收报告.md)。本地模拟云接口测试不代表真实 Supabase 跨设备同步已完成验收。
