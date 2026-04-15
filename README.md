# insight_a16z

一个部署到 Cloudflare 的 `a16z AI 中文洞察站`。

核心运行方式：

- 只收集 `a16z` 官网的 `Articles` 与 `Investment News`
- 先抓取落库，再按状态逐步分析
- 中文标题是本站洞察标题，不是原文直译
- 前端只展示 `published` 内容
- 队列采用 `cron` 驱动的可恢复批处理模式

## 技术栈

- `apps/web`: `Astro` 内容站
- `apps/api`: `Hono + Cloudflare Workers` API、采集、分析、队列处理
- `packages/core`: 共享 schema、类型和 fixture
- `migrations`: `D1` 初始化 SQL

## 功能范围

- 收集 `a16z` 官网 `Articles` 与 `Investment News`
- 生成中文标题、摘要、要点、关键判断
- 聚合专题，输出共识、分歧和趋势推演
- 生成每周周报
- 通过公开前台页面直接消费已发布内容
- 单元、集成、E2E 测试

## 状态流转

文章状态以数据库为准：

- `ingested`: 已抓取入库，待分析
- `processing`: 正在分析
- `published`: 已发布到前台
- `failed`: 技术性失败，待排查

当前规则：

- 不走人工审核前置
- 分析成功后直接发布
- 输出不合理时回退到 `ingested`
- 已发布内容由前端直接从库中读取

## 本地开发

```bash
pnpm install
pnpm --filter @insight-a16z/api dev
pnpm --filter @insight-a16z/web dev
```

默认前端可用 fixture 数据渲染。切到真实 API 时，设置：

```bash
PUBLIC_DATA_MODE=api
PUBLIC_API_BASE_URL=http://127.0.0.1:8787
```

本地 API 如需接入真实模型，可在 [apps/api/.dev.vars.example](/Users/chijiaduo/develop/insight_a16z/apps/api/.dev.vars.example) 的基础上创建 `apps/api/.dev.vars`：

```env
AI_BASE_URL=https://api.example.com/v1
AI_API_KEY=replace-with-your-api-key
AI_MODEL=replace-with-your-model
```

`apps/api/src/local-dev.ts` 会自动读取这个文件；`wrangler dev` 也会使用同名本地变量文件。代码优先读取通用的 `AI_*` 变量，并兼容旧的 `OPENAI_*` 配置。

如需手动触发一次 bootstrap 抓取，可额外在 `apps/api/.dev.vars` 中设置：

```env
ADMIN_TRIGGER_TOKEN=replace-with-a-bootstrap-token
```

## 队列与抓取

正常运行遵循：

- 增量抓取，不清库重来
- 先抓取落库，再处理待分析文章
- `cron` 每次只处理一小批 `ingested`
- Worker 重启后，下次 `cron` 会继续从数据库状态接着跑

运行时以 `cron` 为主；如需一次性初始化或补采，可使用唯一保留的内部入口：

- `POST /internal/bootstrap`: 通过 `x-admin-token` 手动触发一次抓取

## 测试

```bash
pnpm test:unit
pnpm test:integration
pnpm test:e2e
```

`E2E` 默认使用本机已安装的 `Google Chrome`。如果在受限沙箱里跑，需要允许本地测试服务器绑定端口。

## Cloudflare 配置

- `apps/api/wrangler.toml`：Worker、`D1`、`R2`、cron
- `apps/web/wrangler.toml`：Pages 输出目录与 `SESSION` KV 绑定占位

建议的 `cron` 组合：

- 高频队列消费：例如每 `10` 分钟一次
- 周期性文章发现：例如每周一次

部署前需要替换：

- `database_id`
- `bucket_name`
- `SESSION` 的 `KV namespace id`
- `ADMIN_TRIGGER_TOKEN`
- `AI_API_KEY`
- `AI_BASE_URL`
- `AI_MODEL`
