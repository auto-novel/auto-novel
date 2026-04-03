package infra.web.repository

import com.mongodb.client.model.Aggregates.*
import com.mongodb.client.model.Facet
import com.mongodb.client.model.Filters.and
import com.mongodb.client.model.Filters.eq
import com.mongodb.client.model.Projections.*
import com.mongodb.client.model.ReplaceOptions
import com.mongodb.client.model.Sorts.descending
import com.mongodb.client.model.Filters
import infra.*
import infra.common.FavoredNovelListSort
import infra.common.Page
import infra.common.emptyPage
import infra.web.WebNovelFavoriteDbModel
import infra.web.WebNovel
import infra.web.WebNovelAttention
import infra.web.WebNovelListItem
import infra.web.WebNovelFilter
import infra.web.WebNovelType
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable
import org.bson.types.ObjectId
import org.bson.conversions.Bson
import org.bson.BsonArray
import org.bson.BsonDocument
import org.bson.BsonInt32
import org.bson.BsonString

class WebNovelFavoredRepository(
    mongo: MongoClient,
) {
    private val userFavoredWebCollection =
        mongo.database.getCollection<WebNovelFavoriteDbModel>(
            MongoCollectionNames.WEB_FAVORITE,
        )

    suspend fun getFavoredId(
        userId: String,
        novelId: String,
    ): String? {
        return userFavoredWebCollection
            .find(
                and(
                    eq(WebNovelFavoriteDbModel::userId.field(), ObjectId(userId)),
                    eq(WebNovelFavoriteDbModel::novelId.field(), ObjectId(novelId)),
                )
            ).firstOrNull()?.favoredId
    }

    suspend fun listFavoredNovel(
        userId: String,
        favoredId: String?,
        queryString: String?,
        filterProvider: List<String>,
        filterType: WebNovelFilter.Type,
        filterLevel: WebNovelFilter.Level,
        filterTranslate: WebNovelFilter.Translate,
        filterSort: FavoredNovelListSort,
        page: Int,
        pageSize: Int,
    ): Page<WebNovelListItem> {
        @Serializable
        data class NovelWithContext(
            val novel: WebNovel,
            val favoredId: String, // 小说所属的收藏夹ID
        )
        @Serializable
        data class PageModel(
            val total: Int = 0,
            val items: List<NovelWithContext>,
        )

        val initialFilter = if (favoredId == null) {
            eq(WebNovelFavoriteDbModel::userId.field(), ObjectId(userId))
        } else {
            and(
                eq(WebNovelFavoriteDbModel::userId.field(), ObjectId(userId)),
                eq(WebNovelFavoriteDbModel::favoredId.field(), favoredId),
            )
        }

        val sortBson = when (filterSort) {
            FavoredNovelListSort.CreateAt -> descending(WebNovelFavoriteDbModel::createAt.field())
            FavoredNovelListSort.UpdateAt -> descending(WebNovelFavoriteDbModel::updateAt.field())
        }
        
        // 搜索字符的筛选条件
        val novelFilters = mutableListOf<Bson>()
        val queryKeywords = mutableListOf<String>()
        if (!queryString.isNullOrBlank()) {
            val allAttentions = WebNovelAttention.entries.map { it.name }
            
            queryString.split(" ").filter { it.isNotBlank() }.forEach{ token ->
                if (token.startsWith('>') || token.startsWith('<')) {
                    val number = token.substring(1).toIntOrNull()
                    if (number != null) {
                        // 使用 $expr 和聚合操作符 $size 来动态比较数组长度
                        val operator = if (token.startsWith('>')) "\$gt" else "\$lt"
                        val exprFilter = BsonDocument(
                            "\$expr",
                            BsonDocument(
                                operator,
                                BsonArray(
                                    listOf(
                                        BsonDocument("\$size", BsonString("\$novel.toc")), // 获取 toc 数组的长度
                                        BsonInt32(number)
                                    )
                                )
                            )
                        )
                        novelFilters.add(exprFilter)
                        return@forEach
                    }
                }
                if (token.endsWith('$')) {
                    val isExclusion = token.startsWith('-')
                    val rawToken = token.removePrefix("-").removeSuffix("$")
                    val field = if (allAttentions.contains(rawToken)) {
                        "novel.${WebNovel::attentions.field()}"
                    } else {
                        "novel.${WebNovel::keywords.field()}"
                    }

                    val tagFilter = if (isExclusion) {
                        Filters.nin(field, rawToken)
                    } else {
                        Filters.eq(field, rawToken)
                    }
                    novelFilters.add(tagFilter)
                } else {
                    queryKeywords.add(token)
                }
            }
        }

        if (queryKeywords.isNotEmpty()) {
            val keywordFilters = queryKeywords.map { keyword ->
                Filters.or(
                    Filters.regex("novel.${WebNovel::titleJp.field()}", keyword, "i"),
                    Filters.regex("novel.${WebNovel::titleZh.field()}", keyword, "i"),
                    Filters.regex("novel.${WebNovel::keywords.field()}", keyword, "i")
                )
            }
            novelFilters.add(Filters.and(keywordFilters))
        }

        // 平台来源的筛选条件
        if (filterProvider.isNotEmpty()) {
            novelFilters.add(Filters.`in`("novel.${WebNovel::providerId.field()}", filterProvider))
        }

        // 连载状态类型的筛选条件
        if (filterType != WebNovelFilter.Type.全部) {
            novelFilters.add(eq("novel.${WebNovel::type.field()}", WebNovelType.valueOf(filterType.name)))
        }

        // 限制等级的筛选条件
        when (filterLevel) {
            WebNovelFilter.Level.一般向 -> novelFilters.add(Filters.ne("novel.${WebNovel::attentions.field()}", WebNovelAttention.R18))
            WebNovelFilter.Level.R18 -> novelFilters.add(Filters.eq("novel.${WebNovel::attentions.field()}", WebNovelAttention.R18))
            else -> {}
        }

        // 翻译状态的筛选条件
        when (filterTranslate) {
            WebNovelFilter.Translate.GPT3 -> novelFilters.add(Filters.gt("novel.${WebNovel::gpt.field()}", 0L))
            WebNovelFilter.Translate.Sakura -> novelFilters.add(Filters.gt("novel.${WebNovel::sakura.field()}", 0L))
            WebNovelFilter.Translate.Murasaki -> novelFilters.add(Filters.gt("novel.${WebNovel::murasaki.field()}", 0L))
            else -> {}
        }

        val novelMatchBson = if (novelFilters.isNotEmpty()) match(and(novelFilters)) else null

        val doc = userFavoredWebCollection
            .aggregate<PageModel>(
                match(initialFilter),
                sort(sortBson),
                lookup(
                    /* from = */ MongoCollectionNames.WEB_NOVEL,
                    /* localField = */ WebNovelFavoriteDbModel::novelId.field(),
                    /* foreignField = */ WebNovel::id.field(),
                    /* as = */ "novel"
                ),
                unwind("\$novel"),
                project(
                    fields(
                        computed("novel", "\$novel"),
                        computed("favoredId", "\$${WebNovelFavoriteDbModel::favoredId.field()}")
                    )
                ),
                *(if (novelMatchBson != null) arrayOf(novelMatchBson) else emptyArray()),

                facet(
                    Facet("count", count()),
                    Facet(
                        "items",
                        skip(page * pageSize),
                        limit(pageSize),
                    )
                ),
                project(
                    fields(
                        computed(PageModel::total.field(), arrayElemAt("count.count", 0)),
                        include(PageModel::items.field())
                    )
                ),
            )
            .firstOrNull()
        return if (doc == null) {
            emptyPage()
        } else {
            Page(
                items = doc.items.map { novelWithContext ->
                    val favored = if (favoredId == null) {
                        // favoredId为null时的模式为查询所有收藏夹，这时把查询小说的收藏夹发送回去
                        novelWithContext.favoredId
                    } else {
                        null
                    }
                    novelWithContext.novel.toOutline(
                        favored = favored
                    )
                },
                total = doc.total.toLong(),
                pageSize = pageSize,
            )
        }
    }

    suspend fun countFavoredNovelByUserId(
        userId: String,
        favoredId: String,
    ): Long {
        return userFavoredWebCollection
            .countDocuments(
                and(
                    eq(WebNovelFavoriteDbModel::userId.field(), ObjectId(userId)),
                    eq(WebNovelFavoriteDbModel::favoredId.field(), favoredId),
                )
            )
    }

    suspend fun updateFavoredNovel(
        userId: ObjectId,
        novelId: ObjectId,
        favoredId: String,
        updateAt: Instant,
    ) {
        userFavoredWebCollection
            .replaceOne(
                and(
                    eq(WebNovelFavoriteDbModel::userId.field(), userId),
                    eq(WebNovelFavoriteDbModel::novelId.field(), novelId),
                ),
                WebNovelFavoriteDbModel(
                    userId = userId,
                    novelId = novelId,
                    favoredId = favoredId,
                    createAt = Clock.System.now(),
                    updateAt = updateAt,
                ),
                ReplaceOptions().upsert(true),
            )
    }

    suspend fun deleteFavoredNovel(
        userId: ObjectId,
        novelId: ObjectId,
    ) {
        userFavoredWebCollection
            .deleteOne(
                and(
                    eq(WebNovelFavoriteDbModel::userId.field(), userId),
                    eq(WebNovelFavoriteDbModel::novelId.field(), novelId),
                )
            )
    }
}