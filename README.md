# AutoNovel 轻小说机翻机器人

[![GPL-3.0](https://img.shields.io/github/license/auto-novel/auto-novel)](https://github.com/auto-novel/auto-novel#license)
[![cd-web](https://github.com/auto-novel/auto-novel/actions/workflows/cd-web.yml/badge.svg)](https://github.com/auto-novel/auto-novel/actions/workflows/cd-web.yml)
[![cd-api](https://github.com/auto-novel/auto-novel/actions/workflows/cd-api.yml/badge.svg)](https://github.com/auto-novel/auto-novel/actions/workflows/cd-api.yml)

> 重建巴别塔！！

[轻小说机翻机器人](https://n.novelia.top/)是一个自动生成轻小说机翻并分享的网站。

## 贡献

请务必在编写代码前阅读 [贡献指南](CONTRIBUTING.md)，感谢所有为本项目做出贡献的人们！

## OpenCode Go

在 GPT 工作区添加翻译器时，选择「OpenCode Go」接口格式，填写 Go API Key 和
Go 模型 ID。默认端点为 `https://opencode.ai/inference/go/openai/v1`，思考强度
可留为「默认」或选择该模型支持的值。模型目录和服务使用要求以
[OpenCode Go 官方文档](https://opencode.ai/docs/console/go/)为准。

官方 Go 接口由本站登录认证后的后端路由转发，浏览器无需扩展。Go Key 随本次请求
发送到本站服务器，再转发到固定的官方 Chat Completions 地址；后端不保存 Key、
提示词或模型响应，不跟随重定向。每个翻译器运行实例复用一个会话 ID，并使用
`AutoNovel/1.0` 标识客户端。服务商仍可按账号、模型和使用要求拒绝请求。

自定义网关和其他服务商仍由浏览器直接连接。个人部署需同时更新前端和 `server`；
反向代理应保留 SSE 流和客户端断开，并为长时间的模型响应配置足够的读取超时。

## 部署

> [!WARNING]
> 注意：本项目并不是为了个人部署设计的，不保证所有功能可用和前向兼容。

```bash
# 1. 克隆仓库
git clone https://github.com/auto-novel/auto-novel.git
cd auto-novel

# 2. 生成环境变量配置
cat > .env << EOF
SHIELD_PROXY_URL=         # API 出口代理：http://<shield 的 Tailscale 地址>:8888，可以为空
HTTPS_PROXY=              # server 的 Web 小说代理，可以为空
PIXIV_COOKIE_PHPSESSID=   # Pixiv Cookie，用于爬取 Pixiv 小说，可以为空

# 以下字段个人部署不需要填写
ACCESS_TOKEN_SECRET=
EOF

# 3. 启动服务
mkdir -p -m 777 ./data/es/data ./data/es/plugins
docker compose up -d
```

启动后，可通过以下地址访问：

- 用户端：http://localhost/
