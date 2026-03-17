# AutoNovel 轻小说机翻机器人

[![GPL-3.0](https://img.shields.io/github/license/auto-novel/auto-novel)](https://github.com/auto-novel/auto-novel#license)
[![cd-web](https://github.com/auto-novel/auto-novel/actions/workflows/cd-web.yml/badge.svg)](https://github.com/auto-novel/auto-novel/actions/workflows/cd-web.yml)
[![cd-api](https://github.com/auto-novel/auto-novel/actions/workflows/cd-api.yml/badge.svg)](https://github.com/auto-novel/auto-novel/actions/workflows/cd-api.yml)

> 重建巴别塔！！

[轻小说机翻机器人](https://n.novelia.top/)是一个自动生成轻小说机翻并分享的网站。

## 贡献

请务必在编写代码前阅读[贡献指南](https://github.com/auto-novel/auto-novel/blob/main/CONTRIBUTING.md)，感谢所有为本项目做出贡献的人们！

## 部署

> [!WARNING]
> 注意：本项目并不是为了个人部署设计的，不保证所有功能可用和前向兼容。

```bash
# 1. 克隆仓库
git clone https://github.com/auto-novel/auto-novel.git
cd auto-novel

# 2. 生成环境变量配置
cat > .env << EOF
HTTPS_PROXY=              # web 小说代理，可以为空
PIXIV_COOKIE_PHPSESSID=   # Pixiv Cookie，用于爬取P站小说，可以为空

# 以下字段个人部署不需要填写
ACCESS_TOKEN_SECRET=
MAILGUN_API_KEY=
MAILGUN_API_URL=https://api.eu.mailgun.net/v3/verify.fishhawk.top/messages
MAILGUN_FROM_EMAIL=postmaster@verify.fishhawk.top
EOF

# 3. 启动服务
mkdir -p -m 777 ./data/es/data ./data/es/plugins
docker compose up -d
```

启动后，访问 http://localhost 即可。
