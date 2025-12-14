"""
生成MongoDB测试数据脚本

根据server文件夹下的MongoDB数据库模型，使用Python的faker库生成测试用的临时数据。

使用方法:
1. 安装依赖: pip install -r generate_test_data_requirements.txt
2. 启动MongoDB: docker-compose up -d mongo
3. 运行脚本: python generate_test_data.py

环境变量:
- MONGO_HOST: MongoDB主机地址 (默认: localhost)
- MONGO_PORT: MongoDB端口 (默认: 27017)
- MONGO_DB: 数据库名称 (默认: main)
"""

import os
import random
from datetime import datetime, timedelta
from typing import List, Dict, Any

from bson import ObjectId
from faker import Faker
from pymongo import MongoClient

# MongoDB配置
MONGO_HOST = os.getenv('MONGO_HOST', 'localhost')
try:
    MONGO_PORT = int(os.getenv('MONGO_PORT', '27017'))
except ValueError:
    print("⚠ 警告: MONGO_PORT 必须是数字，使用默认值 27017")
    MONGO_PORT = 27017
MONGO_DB = os.getenv('MONGO_DB', 'main')

# 初始化Faker (使用中文和日文)
fake_zh = Faker('zh_CN')
fake_ja = Faker('ja_JP')
fake_en = Faker('en_US')

# 配置常量
MAX_RETRY_MULTIPLIER = 3  # 生成收藏数据时的最大重试次数倍数
NO_GLOSSARY_VALUE = 'no glossary'  # 默认术语表值
MILLISECONDS_PER_SECOND = 1000  # 时间戳转换：秒到毫秒
ASIN_PATTERN = '??########'  # Amazon标准识别号格式

# 集合名称 (根据MongoCollectionNames定义)
COLLECTION_NAMES = {
    'ARTICLE': 'article',
    'COMMENT': 'comment-alt',
    'OPERATION_HISTORY': 'operation-history',
    'USER': 'user',
    'WEB_NOVEL': 'metadata',
    'WEB_FAVORITE': 'web-favorite',
    'WEB_READ_HISTORY': 'web-read-history',
    'WENKU_NOVEL': 'wenku-metadata',
    'WENKU_FAVORITE': 'wenku-favorite',
    'WEB_CHAPTER': 'episode',
}


def connect_mongodb() -> MongoClient:
    """连接MongoDB数据库"""
    try:
        client = MongoClient(f'mongodb://{MONGO_HOST}:{MONGO_PORT}/')
        # 测试连接
        client.server_info()
        print(f"✓ 成功连接到MongoDB: {MONGO_HOST}:{MONGO_PORT}")
        return client
    except Exception as e:
        print(f"✗ 连接MongoDB失败: {e}")
        raise


def generate_users(count: int = 10) -> List[Dict[str, Any]]:
    """生成用户测试数据"""
    users = []
    for _ in range(count):
        user = {
            '_id': ObjectId(),
            'username': fake_zh.user_name() + str(random.randint(100, 999)),
            'favoredWeb': [],
            'favoredWenku': [],
            'readHistoryPaused': fake_en.boolean(chance_of_getting_true=20),
        }
        users.append(user)
    return users


def generate_web_novels(count: int = 20) -> List[Dict[str, Any]]:
    """生成网络小说测试数据"""
    providers = ['syosetu', 'kakuyomu', 'novelup', 'hameln', 'pixiv', 'alphapolis']
    novel_types = ['连载中', '已完结', '短篇']
    attentions = ['R15', 'R18', '残酷描写', '暴力描写', '性描写']
    
    novels = []
    for _ in range(count):
        now = datetime.now()
        provider_id = random.choice(providers)
        novel_id = fake_en.uuid4()
        
        novel = {
            '_id': ObjectId(),
            'providerId': provider_id,
            'bookId': novel_id,
            'wenkuId': None if fake_en.boolean(chance_of_getting_true=80) else fake_en.uuid4(),
            'titleJp': fake_ja.sentence(nb_words=6),
            'titleZh': fake_zh.sentence(nb_words=8) if fake_en.boolean(chance_of_getting_true=70) else None,
            'authors': [
                {
                    'name': fake_ja.name(),
                    'link': f'https://{provider_id}.com/user/{fake_en.uuid4()}'
                }
            ],
            'type': random.choice(novel_types),
            'attentions': random.sample(attentions, k=random.randint(0, 3)),
            'keywords': [fake_ja.word() for _ in range(random.randint(3, 8))],
            'points': random.randint(100, 10000) if fake_en.boolean(chance_of_getting_true=80) else None,
            'totalCharacters': random.randint(10000, 1000000) if fake_en.boolean(chance_of_getting_true=80) else None,
            'introductionJp': fake_ja.text(max_nb_chars=300),
            'introductionZh': fake_zh.text(max_nb_chars=300) if fake_en.boolean(chance_of_getting_true=60) else None,
            'glossaryUuid': NO_GLOSSARY_VALUE,
            'glossary': {},
            'toc': generate_toc(random.randint(5, 50)),
            'jp': random.randint(0, 100),
            'baidu': random.randint(0, 100),
            'youdao': random.randint(0, 100),
            'gpt': random.randint(0, 100),
            'sakura': random.randint(0, 100),
            'visited': random.randint(0, 10000),
            'pauseUpdate': fake_en.boolean(chance_of_getting_true=10),
            'syncAt': now - timedelta(hours=random.randint(1, 240)),
            'changeAt': now - timedelta(hours=random.randint(1, 120)),
            'updateAt': now - timedelta(hours=random.randint(0, 72)),
        }
        novels.append(novel)
    return novels


def generate_toc(count: int) -> List[Dict[str, Any]]:
    """生成目录"""
    toc = []
    for i in range(count):
        item = {
            'titleJp': f'{fake_ja.sentence(nb_words=4)} - {i+1}',
            'titleZh': fake_zh.sentence(nb_words=5) if fake_en.boolean(chance_of_getting_true=60) else None,
            'episodeId': fake_en.uuid4(),
            'createAt': datetime.now() - timedelta(days=random.randint(1, 365)),
        }
        toc.append(item)
    return toc


def generate_web_chapters(novels: List[Dict[str, Any]], chapters_per_novel: int = 5) -> List[Dict[str, Any]]:
    """生成网络小说章节测试数据"""
    chapters = []
    for novel in novels[:min(len(novels), 10)]:  # 只为前10本小说生成章节
        toc_items = novel.get('toc', [])[:chapters_per_novel]
        for toc_item in toc_items:
            chapter = {
                'providerId': novel['providerId'],
                'bookId': novel['bookId'],
                'episodeId': toc_item['episodeId'],
                'paragraphsJp': [fake_ja.sentence(nb_words=20) for _ in range(random.randint(10, 30))],
                'glossaryUuid': None,
                'glossary': {},
                'paragraphsZh': [fake_zh.sentence(nb_words=25) for _ in range(random.randint(10, 30))] if fake_en.boolean(chance_of_getting_true=60) else None,
                'youdaoGlossaryUuid': None,
                'youdaoGlossary': {},
                'youdaoParagraphs': None,
                'gptGlossaryUuid': None,
                'gptGlossary': {},
                'gptParagraphs': None,
                'sakuraVersion': None,
                'sakuraGlossaryUuid': None,
                'sakuraGlossary': {},
                'sakuraParagraphs': None,
            }
            chapters.append(chapter)
    return chapters


def generate_wenku_novels(count: int = 15) -> List[Dict[str, Any]]:
    """生成文库小说测试数据"""
    levels = ['轻小说', '轻文学', '文学', 'R18男性向', 'R18女性向', '非小说']
    
    novels = []
    for _ in range(count):
        now = datetime.now()
        novel = {
            '_id': ObjectId(),
            'title': fake_ja.sentence(nb_words=6),
            'titleZh': fake_zh.sentence(nb_words=8),
            'cover': f'https://example.com/covers/{fake_en.uuid4()}.jpg' if fake_en.boolean(chance_of_getting_true=80) else None,
            'authors': [fake_ja.name() for _ in range(random.randint(1, 2))],
            'artists': [fake_ja.name() for _ in range(random.randint(0, 2))],
            'keywords': [fake_zh.word() for _ in range(random.randint(3, 10))],
            'publisher': fake_ja.company() if fake_en.boolean(chance_of_getting_true=80) else None,
            'imprint': fake_ja.word() if fake_en.boolean(chance_of_getting_true=60) else None,
            'latestPublishAt': now - timedelta(days=random.randint(1, 1000)) if fake_en.boolean(chance_of_getting_true=80) else None,
            'level': random.choice(levels),
            'introduction': fake_zh.text(max_nb_chars=400),
            'webIds': [str(ObjectId()) for _ in range(random.randint(0, 3))],
            'volumes': generate_volumes(random.randint(1, 10)),
            'glossaryUuid': fake_en.uuid4() if fake_en.boolean(chance_of_getting_true=30) else None,
            'glossary': {fake_ja.word(): fake_zh.word() for _ in range(random.randint(0, 5))},
            'visited': random.randint(0, 5000),
            'updateAt': now - timedelta(hours=random.randint(0, 720)),
        }
        novels.append(novel)
    return novels


def generate_volumes(count: int) -> List[Dict[str, Any]]:
    """生成卷"""
    volumes = []
    for i in range(count):
        # 生成随机发布时间（毫秒时间戳）
        publish_at = None
        if fake_en.boolean(chance_of_getting_true=80):
            publish_date = datetime.now() - timedelta(days=random.randint(30, 3000))
            publish_at = int(publish_date.timestamp() * MILLISECONDS_PER_SECOND)
        
        volume = {
            'asin': fake_en.bothify(text=ASIN_PATTERN),
            'title': f'{fake_ja.sentence(nb_words=5)} 第{i+1}巻',
            'titleZh': f'{fake_zh.sentence(nb_words=6)} 第{i+1}卷' if fake_en.boolean(chance_of_getting_true=70) else None,
            'cover': f'https://example.com/volumes/{fake_en.uuid4()}.jpg',
            'coverHires': f'https://example.com/volumes/{fake_en.uuid4()}_hires.jpg' if fake_en.boolean(chance_of_getting_true=60) else None,
            'publisher': fake_ja.company() if fake_en.boolean(chance_of_getting_true=80) else None,
            'imprint': fake_ja.word() if fake_en.boolean(chance_of_getting_true=60) else None,
            'publishAt': publish_at,
        }
        volumes.append(volume)
    return volumes


def generate_articles(users: List[Dict[str, Any]], count: int = 15) -> List[Dict[str, Any]]:
    """生成文章测试数据"""
    categories = ['Guide', 'General', 'Support']
    
    articles = []
    for _ in range(count):
        now = datetime.now()
        user = random.choice(users)
        article = {
            '_id': ObjectId(),
            'title': fake_zh.sentence(nb_words=8),
            'content': fake_zh.text(max_nb_chars=2000),
            'category': random.choice(categories),
            'locked': fake_en.boolean(chance_of_getting_true=10),
            'pinned': fake_en.boolean(chance_of_getting_true=10),
            'hidden': fake_en.boolean(chance_of_getting_true=5),
            'numViews': random.randint(0, 5000),
            'numComments': random.randint(0, 100),
            'user': user['_id'],
            'createAt': now - timedelta(days=random.randint(1, 365)),
            'updateAt': now - timedelta(hours=random.randint(0, 240)),
            'changeAt': now - timedelta(hours=random.randint(0, 120)),
        }
        articles.append(article)
    return articles


def generate_comments(users: List[Dict[str, Any]], articles: List[Dict[str, Any]], count: int = 50) -> List[Dict[str, Any]]:
    """生成评论测试数据"""
    comments = []
    
    # 生成顶级评论
    for _ in range(count):
        article = random.choice(articles)
        user = random.choice(users)
        comment = {
            '_id': ObjectId(),
            'site': f'article/{article["_id"]}',
            'content': fake_zh.text(max_nb_chars=500),
            'hidden': fake_en.boolean(chance_of_getting_true=5),
            'numReplies': random.randint(0, 20),
            'parent': None,
            'user': user['_id'],
            'createAt': datetime.now() - timedelta(days=random.randint(0, 100)),
        }
        comments.append(comment)
    
    # 生成一些回复评论
    for _ in range(count // 3):
        if comments:
            parent_comment = random.choice(comments)
            user = random.choice(users)
            reply = {
                '_id': ObjectId(),
                'site': parent_comment['site'],
                'content': fake_zh.text(max_nb_chars=300),
                'hidden': fake_en.boolean(chance_of_getting_true=5),
                'numReplies': 0,
                'parent': parent_comment['_id'],
                'user': user['_id'],
                'createAt': datetime.now() - timedelta(days=random.randint(0, 50)),
            }
            comments.append(reply)
    
    return comments


def generate_favorites(users: List[Dict[str, Any]], novels: List[Dict[str, Any]], count: int) -> List[Dict[str, Any]]:
    """生成收藏测试数据的通用函数"""
    favorites = []
    used_pairs = set()
    
    attempts = 0
    max_attempts = count * MAX_RETRY_MULTIPLIER  # 避免无限循环
    while len(favorites) < count and attempts < max_attempts:
        user = random.choice(users)
        novel = random.choice(novels)
        pair = (str(user['_id']), str(novel['_id']))
        
        if pair not in used_pairs:
            now = datetime.now()
            favorite = {
                'userId': user['_id'],
                'novelId': novel['_id'],
                'favoredId': fake_en.uuid4(),
                'createAt': now - timedelta(days=random.randint(1, 365)),
                'updateAt': now - timedelta(hours=random.randint(0, 240)),
            }
            favorites.append(favorite)
            used_pairs.add(pair)
        attempts += 1
    
    return favorites


def generate_web_favorites(users: List[Dict[str, Any]], novels: List[Dict[str, Any]], count: int = 30) -> List[Dict[str, Any]]:
    """生成网络小说收藏测试数据"""
    return generate_favorites(users, novels, count)


def generate_wenku_favorites(users: List[Dict[str, Any]], novels: List[Dict[str, Any]], count: int = 20) -> List[Dict[str, Any]]:
    """生成文库小说收藏测试数据"""
    return generate_favorites(users, novels, count)


def generate_web_read_history(users: List[Dict[str, Any]], novels: List[Dict[str, Any]], count: int = 40) -> List[Dict[str, Any]]:
    """生成网络小说阅读历史测试数据"""
    read_history = []
    
    for _ in range(count):
        user = random.choice(users)
        novel = random.choice(novels)
        toc = novel.get('toc', [])
        
        if toc:
            chapter = random.choice(toc)
            history = {
                'userId': user['_id'],
                'novelId': novel['_id'],
                'chapterId': chapter['episodeId'],
                'createAt': datetime.now() - timedelta(days=random.randint(0, 100)),
            }
            read_history.append(history)
    
    return read_history


def insert_data(client: MongoClient, clear_existing: bool = False):
    """插入测试数据到MongoDB"""
    db = client[MONGO_DB]
    
    print(f"\n{'='*60}")
    print(f"开始生成测试数据到数据库: {MONGO_DB}")
    print(f"{'='*60}\n")
    
    # 清空现有数据（如果需要）
    if clear_existing:
        print("⚠ 清空现有集合...")
        for collection_name in COLLECTION_NAMES.values():
            if collection_name in db.list_collection_names():
                db[collection_name].delete_many({})
                print(f"  - 已清空: {collection_name}")
        print()
    
    # 生成并插入用户数据
    print("📝 生成用户数据...")
    users = generate_users(10)
    db[COLLECTION_NAMES['USER']].insert_many(users)
    print(f"✓ 已插入 {len(users)} 个用户\n")
    
    # 生成并插入网络小说数据
    print("📚 生成网络小说数据...")
    web_novels = generate_web_novels(20)
    db[COLLECTION_NAMES['WEB_NOVEL']].insert_many(web_novels)
    print(f"✓ 已插入 {len(web_novels)} 个网络小说\n")
    
    # 生成并插入网络小说章节数据
    print("📄 生成网络小说章节数据...")
    web_chapters = generate_web_chapters(web_novels, 5)
    if web_chapters:
        db[COLLECTION_NAMES['WEB_CHAPTER']].insert_many(web_chapters)
    print(f"✓ 已插入 {len(web_chapters)} 个章节\n")
    
    # 生成并插入文库小说数据
    print("📖 生成文库小说数据...")
    wenku_novels = generate_wenku_novels(15)
    db[COLLECTION_NAMES['WENKU_NOVEL']].insert_many(wenku_novels)
    print(f"✓ 已插入 {len(wenku_novels)} 个文库小说\n")
    
    # 生成并插入文章数据
    print("✍️ 生成文章数据...")
    articles = generate_articles(users, 15)
    db[COLLECTION_NAMES['ARTICLE']].insert_many(articles)
    print(f"✓ 已插入 {len(articles)} 个文章\n")
    
    # 生成并插入评论数据
    print("💬 生成评论数据...")
    comments = generate_comments(users, articles, 50)
    db[COLLECTION_NAMES['COMMENT']].insert_many(comments)
    print(f"✓ 已插入 {len(comments)} 个评论\n")
    
    # 生成并插入网络小说收藏数据
    print("⭐ 生成网络小说收藏数据...")
    web_favorites = generate_web_favorites(users, web_novels, 30)
    if web_favorites:
        db[COLLECTION_NAMES['WEB_FAVORITE']].insert_many(web_favorites)
    print(f"✓ 已插入 {len(web_favorites)} 个网络小说收藏\n")
    
    # 生成并插入文库小说收藏数据
    print("⭐ 生成文库小说收藏数据...")
    wenku_favorites = generate_wenku_favorites(users, wenku_novels, 20)
    if wenku_favorites:
        db[COLLECTION_NAMES['WENKU_FAVORITE']].insert_many(wenku_favorites)
    print(f"✓ 已插入 {len(wenku_favorites)} 个文库小说收藏\n")
    
    # 生成并插入阅读历史数据
    print("📖 生成阅读历史数据...")
    read_history = generate_web_read_history(users, web_novels, 40)
    if read_history:
        db[COLLECTION_NAMES['WEB_READ_HISTORY']].insert_many(read_history)
    print(f"✓ 已插入 {len(read_history)} 个阅读历史\n")
    
    # 更新用户的收藏列表
    print("🔄 更新用户收藏列表...")
    
    # 创建小说ID到标题的映射
    web_novel_titles = {str(novel['_id']): novel['titleZh'] or novel['titleJp'] for novel in web_novels}
    wenku_novel_titles = {str(novel['_id']): novel['titleZh'] for novel in wenku_novels}
    
    for user in users:
        user_web_favorites = [
            {'id': str(fav['novelId']), 'title': web_novel_titles.get(str(fav['novelId']), 'Unknown')}
            for fav in web_favorites if fav['userId'] == user['_id']
        ]
        user_wenku_favorites = [
            {'id': str(fav['novelId']), 'title': wenku_novel_titles.get(str(fav['novelId']), 'Unknown')}
            for fav in wenku_favorites if fav['userId'] == user['_id']
        ]
        
        db[COLLECTION_NAMES['USER']].update_one(
            {'_id': user['_id']},
            {
                '$set': {
                    'favoredWeb': user_web_favorites,
                    'favoredWenku': user_wenku_favorites,
                }
            }
        )
    print(f"✓ 已更新 {len(users)} 个用户的收藏列表\n")
    
    print(f"{'='*60}")
    print("✅ 测试数据生成完成！")
    print(f"{'='*60}\n")
    
    # 统计信息
    print("📊 数据统计:")
    print(f"  - 用户: {len(users)}")
    print(f"  - 网络小说: {len(web_novels)}")
    print(f"  - 网络小说章节: {len(web_chapters)}")
    print(f"  - 文库小说: {len(wenku_novels)}")
    print(f"  - 文章: {len(articles)}")
    print(f"  - 评论: {len(comments)}")
    print(f"  - 网络小说收藏: {len(web_favorites)}")
    print(f"  - 文库小说收藏: {len(wenku_favorites)}")
    print(f"  - 阅读历史: {len(read_history)}")


def main():
    """主函数"""
    print("\n" + "="*60)
    print("MongoDB 测试数据生成脚本")
    print("="*60 + "\n")
    
    # 连接数据库
    client = connect_mongodb()
    
    # 询问是否清空现有数据
    print("\n是否清空现有数据？(y/N): ", end='')
    clear = input().strip().lower() == 'y'
    
    # 插入测试数据
    insert_data(client, clear_existing=clear)
    
    # 关闭连接
    client.close()
    print("\n✓ 数据库连接已关闭")


if __name__ == '__main__':
    main()
