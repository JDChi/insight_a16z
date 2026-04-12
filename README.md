# insight_a16z

一个部署到 Cloudflare 的 `a16z AI 中文洞察站`。

## 技术栈

- `apps/web`: `Astro` 内容站与最小后台
- `apps/api`: `Hono + Cloudflare Workers` API、采集、分析、发布流
- `packages/core`: 共享 schema、类型和 fixture
- `migrations`: `D1` 初始化 SQL

## 功能范围

- 收集 `a16z` 官网 `Articles` 与 `Investment News`
- 生成中文标题、摘要、要点、关键判断
- 聚合专题，输出共识、分歧和趋势推演
- 生成每周周报
- 最小后台支持查看、审核、发布和任务状态
- 单元、集成、E2E 测试

## 本地开发

```bash
pnpm install
pnpm --filter @insight-a16z/api dev
pnpm --filter @insight-a16z/web dev
```

默认前端用 fixture 数据渲染。切到真实 API 时，设置：

```bash
PUBLIC_DATA_MODE=api
PUBLIC_API_BASE_URL=http://127.0.0.1:8787
TEST_ADMIN_EMAIL=admin@local.test
```

本地 API 如需接入真实模型，可在 [apps/api/.dev.vars.example](/Users/chijiaduo/develop/insight_a16z/apps/api/.dev.vars.example) 的基础上创建 `apps/api/.dev.vars`：

```env
AI_BASE_URL=https://api.example.com/v1
AI_API_KEY=replace-with-your-api-key
AI_MODEL=replace-with-your-model
```

`apps/api/src/local-dev.ts` 会自动读取这个文件；`wrangler dev` 也会使用同名本地变量文件。代码优先读取通用的 `AI_*` 变量，并兼容旧的 `OPENAI_*` 配置。

## 测试

```bash
pnpm test:unit
pnpm test:integration
pnpm test:e2e
```

`E2E` 默认使用本机已安装的 `Google Chrome`。如果在受限沙箱里跑，需要允许本地测试服务器绑定端口。

## Cloudflare 配置

- `apps/api/wrangler.toml`：Worker、`D1`、`R2`、每周 cron
- `apps/web/wrangler.toml`：Pages 输出目录与 `SESSION` KV 绑定占位

部署前需要替换：

- `database_id`
- `bucket_name`
- `SESSION` 的 `KV namespace id`
- `ADMIN_EMAILS`
- `AI_API_KEY`
- `AI_BASE_URL`
- `AI_MODEL`
