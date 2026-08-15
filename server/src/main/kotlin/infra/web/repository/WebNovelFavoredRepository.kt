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
import infra.web.WebNovelTocItem
import infra.web.WebNovelType
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.serialization.Contextual
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import org.bson.types.ObjectId
import org.bson.conversions.Bson
import org.bson.BsonArray
import org.bson.BsonDocument
import org.bson.BsonInt32
import org.bson.BsonString
import org.bson.Document

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
            val novel: FavoredNovelLookup,
            val favoredId: String,
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
                                        BsonDocument("\$size", BsonString("\$novel.toc")),
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
            else -> {}
        }

        val novelMatchBson = if (novelFilters.isNotEmpty()) match(and(novelFilters)) else null

        val doc = userFavoredWebCollection
            .aggregate<PageModel>(
                match(initialFilter),
                sort(sortBson),
                favoredNovelLookup(),
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
                        novelWithContext.favoredId
                    } else {
                        null
                    }
                    novelWithContext.novel.toOutline(favored = favored)
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

@Serializable
internal data class FavoredNovelTocLookup(
    @SerialName("episodeId") val chapterId: String? = null,
)

@Serializable
internal data class FavoredNovelLookup(
    val providerId: String,
    @SerialName("bookId") val novelId: String,
    val titleJp: String,
    val titleZh: String? = null,
    val type: WebNovelType? = null,
    val attentions: List<WebNovelAttention> = emptyList(),
    val keywords: List<String> = emptyList(),
    val toc: List<FavoredNovelTocLookup> = emptyList(),
    val jp: Long = 0,
    val baidu: Long = 0,
    val youdao: Long = 0,
    val gpt: Long = 0,
    val sakura: Long = 0,
    @Contextual val updateAt: Instant? = null,
) {
    fun toOutline(favored: String? = null) =
        WebNovelListItem(
            providerId = providerId,
            novelId = novelId,
            titleJp = titleJp,
            titleZh = titleZh,
            type = type,
            attentions = attentions,
            keywords = keywords,
            favored = favored,
            total = toc.count { it.chapterId != null }.toLong(),
            jp = jp,
            baidu = baidu,
            youdao = youdao,
            gpt = gpt,
            sakura = sakura,
            updateAt = updateAt,
        )
}

private fun favoredNovelLookup(): Bson =
    // Aggregates.lookup 没有 (from, localField, foreignField, pipeline, as) 重载，
    // 用 Document 构造 MongoDB 5.0+ 支持的 localField + pipeline 形态。
    Document(
        "\$lookup",
        Document()
            .append("from", MongoCollectionNames.WEB_NOVEL)
            .append("localField", WebNovelFavoriteDbModel::novelId.field())
            .append("foreignField", WebNovel::id.field())
            .append("pipeline", favoredNovelLookupProjectionPipeline())
            .append("as", "novel"),
    )

private fun favoredNovelLookupProjectionPipeline(): List<Bson> =
    listOf(
        project(
            fields(
                include(
                    WebNovel::providerId.field(),
                    WebNovel::novelId.field(),
                    WebNovel::titleJp.field(),
                    WebNovel::titleZh.field(),
                    WebNovel::type.field(),
                    WebNovel::attentions.field(),
                    WebNovel::keywords.field(),
                    WebNovel::jp.field(),
                    WebNovel::baidu.field(),
                    WebNovel::youdao.field(),
                    WebNovel::gpt.field(),
                    WebNovel::sakura.field(),
                    WebNovel::updateAt.field(),
                ),
                computed(
                    WebNovel::toc.field(),
                    BsonDocument(
                        "\$map",
                        BsonDocument()
                            .append("input", BsonString("\$${WebNovel::toc.field()}"))
                            .append("as", BsonString("item"))
                            .append(
                                "in",
                                BsonDocument(
                                    WebNovelTocItem::chapterId.field(),
                                    BsonString("\$\$item.${WebNovelTocItem::chapterId.field()}"),
                                ),
                            ),
                    ),
                ),
            ),
        ),
    )
