# Crawler Daemon

Crawler Daemon 将 `@auto-novel/crawler` 暴露为 HTTP 服务，并提供持久化代理池。

当前各小说站的实测状态参见
[Daemon API 与小说站可用性测试](docs/daemon-api-availability-2026-08-15.md)。返回 HTTP 200
只代表 daemon 成功处理了请求，不一定代表目标站数据完整；例如尚未实现的排行接口也可能返回空页。

## 构建与运行

要求 Node.js 22.5 或更高版本、pnpm 10。

```bash
pnpm install
pnpm build:daemon
node daemon/dist/app.js --config daemon/config.json
```

也可以在 `daemon/` 目录中使用：

```bash
pnpm build
pnpm dev
pnpm test
```

配置文件路径的优先级为 `--config <path>`、环境变量 `CONFIG_PATH`、默认值
`config.json`。文件不存在时会生成包含默认值的新文件。

## 配置

```json
{
  "host": "127.0.0.1",
  "port": 3000,
  "proxyDbPath": "data/crawler-proxies.db",
  "defaultProxies": [],
  "providerConfig": {
    "default": {
      "headers": {
        "User-Agent": "Mozilla/5.0 ...",
        "Accept-Language": "ja,en;q=0.8"
      }
    },
    "pixiv": {
      "headers": {
        "Cookie": "<SECRET>"
      }
    }
  }
}
```

| 字段                                | 默认值               | 说明                                                   |
| ----------------------------------- | -------------------- | ------------------------------------------------------ |
| `host`                              | `127.0.0.1`          | HTTP 监听地址；设为 `::` 或 `0.0.0.0` 会暴露到网络     |
| `port`                              | `3000`               | HTTP 监听端口                                          |
| `proxyDbPath`                       | `crawler-proxies.db` | 代理池 SQLite 文件，相对路径基于进程工作目录           |
| `defaultProxies`                    | `[]`                 | 启动时写入代理池的代理；同协议、主机、端口不会重复插入 |
| `providerConfig.default.headers`    | `{}`                 | 所有 provider 的默认请求头                             |
| `providerConfig.<provider>.headers` | `{}`                 | 指定 provider 的请求头，会覆盖同名默认请求头           |

支持的 `providerId`：

- alphapolis
- hameln
- kakuyomu
- novelup
- pixiv
- syosetu

daemon 当前没有 API 鉴权；严格暴露于公网。

## HTTP API

以下示例假设服务地址为 `http://127.0.0.1:3000`。

### 健康检查

`GET /healthz`

```json
{
  "status": "ok",
  "uptime": 12.34,
  "timestamp": 1786808027310
}
```

这是进程存活检查，不会验证 SQLite、代理连通性或小说站可访问性。

### 获取小说元数据

`GET /metadata/:providerId/:novelId`

```bash
curl http://127.0.0.1:3000/metadata/kakuyomu/16818093075963348153
```

响应结构：

```json
{
  "title": "小说标题",
  "authors": [{ "name": "作者", "link": "https://example.com/author" }],
  "type": "连载中",
  "attentions": [],
  "keywords": [],
  "points": 100,
  "totalCharacters": 12345,
  "introduction": "简介",
  "toc": [
    {
      "title": "第一章",
      "chapterId": "chapter-id",
      "createAt": "2026-08-15T00:00:00.000Z"
    }
  ]
}
```

### 获取排行

`GET /rank/:providerId`

允许的查询参数为 `genre`、`range`、`status`、`type`、`page`，不接受未知参数；
`page` 必须由数字组成。每个站点只会使用自己支持的字段和值。

Kakuyomu 示例：

```bash
curl "http://127.0.0.1:3000/rank/kakuyomu?genre=综合&range=每日&status=全部"
```

Syosetu 示例：

```bash
curl "http://127.0.0.1:3000/rank/syosetu?type=综合&range=每日&status=全部&page=1"
```

响应结构：

```json
{
  "items": [
    {
      "novelId": "novel-id",
      "title": "小说标题",
      "attentions": [],
      "keywords": [],
      "extra": "站点附加信息"
    }
  ],
  "pageNumber": 1
}
```

缺少站点必需参数、参数值不受该站支持，或者站点排行尚未实现时，当前实现可能返回空页而不是 400。

### 获取章节正文

`GET /chapter/:providerId/:novelId/:chapterId`

```bash
curl http://127.0.0.1:3000/chapter/kakuyomu/16818093075963348153/16818093075963352409
```

```json
{
  "paragraphs": ["第一段", "第二段"]
}
```

### 查询代理池

`GET /proxies`

```json
[
  {
    "id": 1,
    "config": {
      "protocol": "http",
      "host": "127.0.0.1",
      "port": 8899
    },
    "failCount": 0,
    "successCount": 4,
    "cooldownUntil": null,
    "lastUsedAt": 1786807923397
  }
]
```

响应只包含代理的协议、主机、端口和健康状态，不会返回 `username` 或 `password`。

### 添加代理

`POST /proxies`

支持 `http`、`https` 和 `socks5`。HTTP 和 SOCKS5 共用同一个端口时，可以作为两条记录分别添加。

```bash
curl -X POST http://127.0.0.1:3000/proxies \
  -H "Content-Type: application/json" \
  -d '{"protocol":"socks5","host":"127.0.0.1","port":8899}'
```

带认证的代理：

```json
{
  "protocol": "http",
  "host": "proxy.example.com",
  "port": 8080,
  "username": "proxy-user",
  "password": "proxy-password"
}
```

成功返回 `201 Created` 和脱敏后的代理状态，不会返回请求中的 `username` 或 `password`。相同
`protocol + host + port` 再次添加不会更新已有凭据；如需变更，先删除旧记录。

### 删除代理

`DELETE /proxies/:id`

```bash
curl -X DELETE http://127.0.0.1:3000/proxies/1
```

成功返回 `204 No Content`。调用前应使用 `GET /proxies` 确认数字 ID。

### 停止服务

`POST /shutdown`

```bash
curl -X POST http://127.0.0.1:3000/shutdown
```

返回 `202 Accepted` 后停止接受新连接，等待活动连接结束，关闭 SQLite，再退出进程。该接口当前没有鉴权。

### 错误响应

| HTTP 状态 | 含义                                   |
| --------- | -------------------------------------- |
| `400`     | provider、路径参数或排行查询参数无效   |
| `403`     | 目标站需要登录，或账号没有所需内容权限 |
| `502`     | 目标小说站返回非成功 HTTP 状态         |
| `500`     | 网络、代理、解析或其他未分类错误       |

## 代理池的配置与行为

代理可以通过 `defaultProxies` 在启动时配置，也可以通过 `/proxies` API 动态管理；两种方式都会写入 `proxyDbPath` 指向的 SQLite 数据库。

每个爬取请求会按以下流程处理：

1. 排除仍在冷却期的代理。
2. 按 `max(100 + successCount - 10 × failCount, 10)` 加权随机选择代理。
3. 成功后将 `failCount` 清零并增加 `successCount`。
4. 失败后增加 `failCount`；连续失败 3 次时冷却 5 分钟。
5. 成功、失败、冷却和最后使用时间都会持久化，重启后保留。

当前有几个重要限制：

- 没有可用代理时会直接连接目标站，并不会令请求失败。如果业务要求强制代理，需要在部署网络层阻止直连，或先修改此行为。
- 单次请求失败后不会自动选择下一代理重试。
- 代理健康度是全局状态，没有按小说站分别统计。
- 所有爬取异常都会计为代理失败，包括登录失效或页面解析错误。
- CookieJar 按 provider 共享而不是按代理隔离，且仅保存在内存中。

建议先添加代理，再用一个已确认可访问的章节接口验证，最后检查计数：

```bash
curl http://127.0.0.1:3000/proxies
curl http://127.0.0.1:3000/chapter/kakuyomu/WORK_ID/EPISODE_ID
curl http://127.0.0.1:3000/proxies
```

## Docker

镜像需要工作区中的 crawler 包，因此构建上下文必须是仓库根目录：

```bash
docker compose -f daemon/docker-compose.yml build
docker compose -f daemon/docker-compose.yml up -d
```

Compose 会挂载 `daemon/config.json` 和 `daemon/data/`，并通过 `/healthz` 检查进程存活。
