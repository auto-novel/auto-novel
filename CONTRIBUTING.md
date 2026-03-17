# 贡献指南

欢迎为本项目贡献！为了确保高效协作，我们有以下建议。

- 如果您计划实现较大的功能或变更，请先通过 Issue 或聊天群联系管理员先行讨论。
- 请保持 Pull Request 的内容精简，聚焦于一个独立的修改点，以便快速检视和合入。

## 以调试模式启动服务

在开发前，建议执行以下命令，以调试模式启动服务。

```bash
# ElasticSearch只能非root用户运行，需要专门配置权限
mkdir -p -m 777 ./data/es/data ./data/es/plugins

export COMPOSE_FILE="docker-compose.yml:docker-compose.debug.yml"
docker compose up -d
```

服务启动后，可通过以下地址访问：

- Web: localhost:5000
- Api: localhost:5000/api
- Mongo: localhost:5001
- ElasticSearch: localhost:5002
- Redis: localhost:5003

## 前端开发

基于 Vue3 / TypeScript / Vite / [Naive UI](https://www.naiveui.com/zh-CN) 构建。

```bash
cd web
pnpm install
pnpm prepare

pnpm dev     # 启动开发服务器
pnpm build   # 编译项目
```

启动时可根据需要连接不同的后端服务：

- `pnpm dev` 或 `pnpm dev:remote`:对接线上后端 API，适合纯前端修改，请勿污染线上数据，默认禁用翻译上传。
- `pnpm dev:local`:对接本地 Docker 后端 API，需修改后端数据时使用。
- `pnpm dev:native`:对接本地原生启动的后端 API，用于前后端联调。

若需要在手机等设备调试，可添加 `--host` 参数启动服务。

## 后端开发

基于 JVM17 / Kotlin / Ktor 开发，推荐使用 IntelliJ IDEA 打开项目。

如果你的修改不涉及 Http API，可以使用 kotest 编写单元测试调试，推荐安装 kotest 插件。

如果你的修改涉及 Http API，你可以使用 `pnpm dev:local` 启动开发服务器，参考「如何参与前端开发」一节。

> [!NOTE]
> NixOS 开发环境配置可以参见 [flake.nix](https://gist.github.com/kurikomoe/9dd60f9613e0b8f75c137779d223da4f)。由于使用了 devenv，因此需要 `--impure`。
