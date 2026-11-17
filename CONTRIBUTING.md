# 贡献指南

欢迎为本项目贡献！为了确保高效协作，我们有以下建议。

- 如果您计划实现较大的功能或变更，请先通过 Issue 或聊天群联系管理员讨论。
- 请保持 Pull Request 的内容精简，聚焦于一个独立的修改点，以便快速检视和合入。

## 以调试模式启动服务

在仓库根目录执行以下命令，以调试模式启动服务：

```bash
# Elasticsearch 只能以非 root 用户运行，需要配置目录权限
mkdir -p -m 777 ./data/es/data ./data/es/plugins

export COMPOSE_FILE="docker-compose.yml:docker-compose.debug.yml"
docker compose up -d
```

服务启动后，可通过以下地址访问：

- Web：http://localhost:5000
- API：http://localhost:5000/api
- MongoDB：localhost:5001
- Elasticsearch：localhost:5002
- Redis：localhost:5003

## 构建工作区包

本项目是一个 monorepo，`web` 依赖 `packages/` 下的工作区包。因此，在启动前端服务器前，需要先在根目录下执行以下命令构建工作区包：

```bash
pnpm install # 安装依赖
pnpm build   # 构建工作区包和前端
```

## 前端开发

基于 Vue 3 / TypeScript / Vite / [Nuxt UI](https://ui.nuxt.com) 构建，共享组件来自 `@novelia/web-kit`。

在仓库根目录执行：

```bash
pnpm dev:web   # 构建依赖并启动用户端开发服务器
pnpm dev:admin # 启动管理端开发服务器
pnpm build     # 构建工作区包和前端
```

开发服务器默认连接线上后端，请勿污染线上数据。

若需要在手机等设备调试，可添加 `--host` 参数启动服务。

## 后端开发

基于 JVM 17 / Kotlin / Ktor 开发，推荐使用 IntelliJ IDEA 打开项目。

如果你的修改不涉及 HTTP API，可以使用 Kotest 编写单元测试调试，推荐安装 Kotest 插件。

> [!NOTE]
> NixOS 开发环境配置可以参见 [flake.nix](https://gist.github.com/kurikomoe/9dd60f9613e0b8f75c137779d223da4f)。由于使用了 devenv，因此需要 `--impure`。
