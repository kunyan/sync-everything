# sync-everything

自动将 [Onelap (顽鹿)](https://www.onelap.cn) 的骑行数据同步到 [Strava](https://www.strava.com)。

从顽鹿下载 FIT 文件并上传到 Strava，基于时间去重避免重复上传。通过 GitHub Actions 每日自动执行，也支持手动触发。

## 安装

### 环境要求

- Node.js >= 22
- pnpm

### 安装依赖

```bash
pnpm install
```

### 配置环境变量

复制 `.env.example` 并填入你的账号信息：

```bash
cp .env.example .env
```

| 变量 | 说明 |
|------|------|
| `ONELAP_USERNAME` | 顽鹿账号（手机号） |
| `ONELAP_PASSWORD` | 顽鹿密码 |
| `STRAVA_CLIENT_ID` | Strava API 应用的 Client ID |
| `STRAVA_CLIENT_SECRET` | Strava API 应用的 Client Secret |
| `STRAVA_REFRESH_TOKEN` | Strava OAuth Refresh Token |

### Strava OAuth 授权

1. 在 [Strava API 设置](https://www.strava.com/settings/api) 创建应用，回调域名填 `localhost`。

2. 运行一次性授权脚本获取 refresh token：

```bash
pnpm tsx scripts/authorize-strava.ts
```

脚本会打开浏览器进行 OAuth 授权，完成后输出 token 信息。将 `refreshToken` 填入 `.env` 文件。

## 使用

### 本地运行

```bash
pnpm tsx scripts/sync-onelap-to-strava.ts
```

输出示例：

```
Onelap login successful
Strava client ready

Synced: 2 activities
  - 69f4219f... → upload 12345 (2026-05-06 10:00:00)
Skipped: 1 activities
  - 69d374c7... (already on Strava)
Failed: 0 activities
```

### GitHub Actions

Workflow 每天北京时间 ~10:17 自动运行，也可以在 Actions 页面手动触发。

在仓库的 Settings → Secrets and variables → Actions 中添加以下 secrets：

- `ONELAP_USERNAME`
- `ONELAP_PASSWORD`
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REFRESH_TOKEN`

## 工作原理

1. 获取顽鹿最近 7 天的骑行活动
2. 获取 Strava 同期的活动列表
3. 对每个顽鹿活动：
   - 比较开始时间 —— 如果 Strava 上已有活动的开始时间在 5 分钟内，视为重复，跳过
   - 从顽鹿下载 FIT 文件
   - 上传到 Strava
   - 轮询上传状态直到完成

顽鹿的时间戳为 UTC+8（北京时间），Strava 使用 UTC。同步时自动处理时区转换。

## 项目结构

```
src/
├── onelap/          # 顽鹿 API 客户端
├── strava/          # Strava API 客户端（OAuth + 上传）
└── sync/            # 同步桥接（顽鹿下载 → Strava 上传）
scripts/
├── sync-onelap-to-strava.ts   # 同步 CLI 脚本
└── authorize-strava.ts        # 一次性 OAuth 授权脚本
.github/workflows/
└── sync-onelap-to-strava.yml  # 每日定时 + 手动触发
```

## 开发

```bash
pnpm test        # 运行单元测试
pnpm typecheck   # 类型检查
pnpm build       # 构建到 dist/
```

库导出三个子路径模块：

```typescript
import { OnelapClient } from "sync-everything/onelap";
import { StravaClient } from "sync-everything/strava";
import { syncOnelapToStrava } from "sync-everything/sync";
```
