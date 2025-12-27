# MongoDB测试数据生成工具

## 简介

该脚本根据`server`文件夹下的MongoDB数据库模型，使用Python的`faker`库生成测试用的临时数据。

## 功能

该脚本会生成以下类型的测试数据：

- **用户数据** (UserDbModel): 包含用户名、收藏列表等
- **网络小说数据** (WebNovel): 包含小说元数据、目录、翻译状态等
- **网络小说章节数据** (WebNovelChapter): 包含章节内容和翻译
- **文库小说数据** (WenkuNovel): 包含文库小说元数据、卷信息等
- **文章数据** (ArticleDbModel): 包含论坛文章
- **评论数据** (CommentDbModel): 包含文章评论和回复
- **收藏数据** (WebNovelFavoriteDbModel, WenkuNovelFavoriteDbModel): 用户收藏记录
- **阅读历史数据** (WebNovelReadHistoryDbModel): 用户阅读历史

## 安装依赖

```bash
cd script
pip install -r generate_test_data_requirements.txt
```

## 使用方法

### 1. 启动MongoDB

使用docker-compose启动MongoDB服务：

```bash
# 在项目根目录
docker-compose up -d mongo
```

### 2. 运行脚本

```bash
cd script
python generate_test_data.py
```

脚本运行时会询问是否清空现有数据。输入`y`清空，按回车保留现有数据并添加新数据。

### 3. 自定义配置

可以通过环境变量自定义MongoDB连接参数：

```bash
# 使用环境变量
export MONGO_HOST=localhost
export MONGO_PORT=27017
export MONGO_DB=main

python generate_test_data.py
```

或者在运行时指定：

```bash
MONGO_HOST=localhost MONGO_PORT=27017 python generate_test_data.py
```

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `MONGO_HOST` | MongoDB主机地址 | `localhost` |
| `MONGO_PORT` | MongoDB端口 | `27017` |
| `MONGO_DB` | 数据库名称 | `main` |

## 生成的数据量

默认情况下，脚本会生成：

- 10个用户
- 20个网络小说
- ~50个网络小说章节（前10本小说，每本5章）
- 15个文库小说
- 15篇文章
- ~67个评论（50个顶级评论 + 17个回复）
- 30个网络小说收藏
- 20个文库小说收藏
- 40条阅读历史

可以通过修改脚本中的参数来调整数据量。

## 数据特征

- 使用中文、日文和英文Faker库生成逼真的测试数据
- 数据之间有关联关系（用户-收藏-小说-阅读历史）
- 时间戳使用相对时间（过去的随机时间点）
- 包含可选字段的随机填充
- 模拟真实的数据分布（如收藏率、翻译完成度等）

## 注意事项

1. 该脚本仅用于开发和测试环境，**请勿在生产环境使用**
2. 运行前请确保MongoDB服务已启动
3. 清空数据操作不可恢复，请谨慎使用
4. 生成的数据是随机的，每次运行结果都不同

## 数据库集合映射

| 模型 | 集合名称 |
|------|----------|
| UserDbModel | `user` |
| WebNovel | `metadata` |
| WebNovelChapter | `episode` |
| WenkuNovel | `wenku-metadata` |
| ArticleDbModel | `article` |
| CommentDbModel | `comment-alt` |
| WebNovelFavoriteDbModel | `web-favorite` |
| WenkuNovelFavoriteDbModel | `wenku-favorite` |
| WebNovelReadHistoryDbModel | `web-read-history` |
| OperationHistoryModel | `operation-history` |

## 故障排除

### 连接失败

如果出现连接失败的错误：

1. 确认MongoDB服务是否正在运行：`docker ps | grep mongo`
2. 检查端口是否正确映射：`docker-compose ps`
3. 尝试手动连接：`mongosh mongodb://localhost:27017`

### 权限错误

如果遇到权限错误，请确保：

1. MongoDB没有启用认证，或者使用正确的凭据
2. 用户对`main`数据库有读写权限

### 依赖安装问题

如果pip安装失败：

```bash
# 使用国内镜像源
pip install -r generate_test_data_requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

## 技术细节

- 使用`bson.ObjectId`生成MongoDB兼容的ObjectId
- 使用`datetime`生成符合Kotlin Instant的时间戳
- 数据结构完全匹配Kotlin序列化模型
- 支持嵌套文档和数组字段
- 处理可选字段和默认值
