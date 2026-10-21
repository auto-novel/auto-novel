package infra.web.repository

import com.jillesvangurp.ktsearch.createIndex
import com.jillesvangurp.ktsearch.deleteDocument
import com.jillesvangurp.ktsearch.getIndex
import com.mongodb.client.model.Filters
import infra.ElasticSearchClient
import infra.ElasticSearchIndexNames
import infra.MongoClient
import infra.MongoCollectionNames
import infra.common.FavoredNovelListSort
import infra.common.Page
import infra.web.WebNovel
import infra.web.WebNovelAttention
import infra.web.WebNovelAuthor
import infra.web.WebNovelFavoriteDbModel
import infra.web.WebNovelFilter
import infra.web.WebNovelListItem
import infra.web.WebNovelTocItem
import infra.web.WebNovelType
import infra.web.datasource.WebNovelEsDataSource
import io.kotest.core.spec.style.DescribeSpec
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.shouldBe
import koinExtensions
import kotlinx.datetime.Instant
import org.bson.types.ObjectId
import org.koin.test.KoinTest
import org.koin.test.inject

// 集成测试：fixture 使用固定 ObjectId，用后清理；ES 索引已存在则不重建。
// 本地 ES 无 analysis-icu 插件，索引以默认 analyzer 创建——只影响日文分词质量，不影响功能断言。
class WebNovelFavoredSearchEsTest : DescribeSpec(), KoinTest {
    override fun extensions() = koinExtensions()
    private val mongo by inject<MongoClient>()
    private val esClient by inject<ElasticSearchClient>()
    private val es by inject<WebNovelEsDataSource>()
    private val repo by inject<WebNovelFavoredRepository>()

    private val userId = ObjectId("0000000000000000000000f1")

    private fun novel(
        id: String,
        providerId: String,
        novelId: String,
        titleJp: String,
        keywords: List<String> = emptyList(),
        attentions: List<WebNovelAttention> = emptyList(),
        type: WebNovelType = WebNovelType.连载中,
        tocSize: Int,
        tocNullEntries: Int = 0,
        gpt: Long = 0,
    ) = WebNovel(
        id = ObjectId(id),
        providerId = providerId,
        novelId = novelId,
        titleJp = titleJp,
        authors = listOf(WebNovelAuthor(name = "作者", link = null)),
        type = type,
        attentions = attentions,
        keywords = keywords,
        points = null,
        introductionJp = "",
        toc = (1..tocSize).map {
            WebNovelTocItem(titleJp = "第$it 话", titleZh = null, chapterId = "$it")
        } + (1..tocNullEntries).map {
            WebNovelTocItem(titleJp = "卷名$it", titleZh = null, chapterId = null)
        },
        gpt = gpt,
    )

    // n2 有 1 个无 chapterId 的卷名行：ES tocSize=4，Mongo 旧实现 $size=5
    private val n1 = novel("000000000000000000000001", "syosetu", "n0001", "例の物語", keywords = listOf("A B", "ファンタジー"), tocSize = 3, gpt = 1)
    private val n2 = novel("000000000000000000000002", "syosetu", "n0002", "別物語 ファンタジー", keywords = listOf("冒険"), tocSize = 4, tocNullEntries = 1)
    private val n3 = novel("000000000000000000000003", "pixiv", "123", "第三の物語", keywords = listOf("SF"), attentions = listOf(WebNovelAttention.R18), tocSize = 1)
    private val n4 = novel("000000000000000000000004", "syosetu", "n0003", "範囲外", keywords = listOf("ファンタジー"), tocSize = 2)
    private val n5 = novel(
        "000000000000000000000005", "syosetu", "n0004", "性的な物語",
        keywords = listOf("ファンタジー"),
        attentions = listOf(WebNovelAttention.性描写),
        type = WebNovelType.已完结,
        tocSize = 1,
    )

    private fun favored(novel: WebNovel, favoredId: String, createAtMs: Long) =
        WebNovelFavoriteDbModel(
            userId = userId,
            novelId = novel.id,
            favoredId = favoredId,
            createAt = Instant.fromEpochMilliseconds(createAtMs),
            updateAt = Instant.fromEpochMilliseconds(createAtMs),
        )

    private suspend fun list(
        query: String?,
        favoredId: String? = "default",
        filterProvider: List<String> = listOf("syosetu", "pixiv"),
        filterType: WebNovelFilter.Type = WebNovelFilter.Type.全部,
        filterLevel: WebNovelFilter.Level = WebNovelFilter.Level.全部,
        filterTranslate: WebNovelFilter.Translate = WebNovelFilter.Translate.全部,
        page: Int = 0,
        pageSize: Int = 30,
    ) = repo.listFavoredNovel(
        userId = userId.toHexString(),
        favoredId = favoredId,
        queryString = query,
        filterProvider = filterProvider,
        filterType = filterType,
        filterLevel = filterLevel,
        filterTranslate = filterTranslate,
        filterSort = FavoredNovelListSort.CreateAt,
        page = page,
        pageSize = pageSize,
    )

    private fun ids(page: Page<WebNovelListItem>) =
        page.items.map { "${it.providerId}/${it.novelId}" }

    private val novelCollection by lazy {
        mongo.database.getCollection<WebNovel>(MongoCollectionNames.WEB_NOVEL)
    }
    private val favoredCollection by lazy {
        mongo.database.getCollection<WebNovelFavoriteDbModel>(MongoCollectionNames.WEB_FAVORITE)
    }

    init {
        // Koin 扩展按用例级别拦截，spec 级回调里 Koin 未启动，播种与清理只能放用例级回调
        beforeEach {
            if (runCatching { esClient.getIndex(ElasticSearchIndexNames.WEB_NOVEL) }.isFailure) {
                esClient.createIndex(ElasticSearchIndexNames.WEB_NOVEL) {
                    settings {
                        replicas = 0
                    }
                    mappings(dynamicEnabled = false) {
                        keyword("providerId")
                        text("titleJp")
                        text("titleZh")
                        keyword("authors")
                        keyword("type")
                        keyword("attentions")
                        keyword("keywords")
                        number<Int>("tocSize")
                        number<Int>("visited")
                        bool("hasGpt")
                        bool("hasSakura")
                        date("updateAt")
                    }
                }
            }

            val novels = listOf(n1, n2, n3, n4, n5)
            novelCollection.deleteMany(Filters.`in`("_id", novels.map { it.id }))
            favoredCollection.deleteMany(Filters.eq("userId", userId))
            novelCollection.insertMany(novels)
            favoredCollection.insertMany(
                listOf(
                    favored(n1, "default", 1000),
                    favored(n2, "default", 2000),
                    favored(n5, "default", 3000),
                    favored(n3, "second", 4000),
                )
            )
            novels.forEach { es.syncNovel(it) }
        }

        afterEach {
            listOf(n1, n2, n3, n4, n5).forEach {
                runCatching {
                    esClient.deleteDocument(ElasticSearchIndexNames.WEB_NOVEL, "${it.providerId}.${it.novelId}")
                }
            }
            novelCollection.deleteMany(Filters.`in`("_id", listOf(n1, n2, n3, n4, n5).map { it.id }))
            favoredCollection.deleteMany(Filters.eq("userId", userId))
        }

        describe("收藏夹搜索（ES 接力）") {
            it("精确标签$：只命中收藏范围内含该关键词的书，按收藏 createAt 倒序") {
                val page = list("ファンタジー$")
                ids(page) shouldContainExactly listOf("syosetu/n0004", "syosetu/n0001")
                page.items.size shouldBe 2
            }

            it("普通词：命中关键词或标题，收藏范围外的不出现") {
                val page = list("ファンタジー")
                ids(page) shouldContainExactly
                    listOf("syosetu/n0004", "syosetu/n0002", "syosetu/n0001")
            }

            it("目录数过滤：ES tocSize 只数有 chapterId 的条目") {
                // n2 toc 5 条但有 1 条无 chapterId，tocSize=4，>4 不命中
                list(">4").items.size shouldBe 0
                list(">3").let { page ->
                    ids(page) shouldContainExactly listOf("syosetu/n0002")
                }
            }

            it("排除语法 + 普通词组合") {
                val page = list("-ファンタジー$ 物語")
                ids(page) shouldContainExactly listOf("syosetu/n0002")
            }

            it("其他收藏夹与全部收藏夹范围") {
                ids(list("SF$", favoredId = "second")) shouldContainExactly listOf("pixiv/123")
                // favoredId=null 即全部夹
                ids(list("SF$", favoredId = null)) shouldContainExactly listOf("pixiv/123")
                ids(list("ファンタジー$", favoredId = null)) shouldContainExactly
                    listOf("syosetu/n0004", "syosetu/n0001")
            }

            it("level 过滤：两路径统一按主搜索标准（R18 档含性描写）") {
                ids(list("SF$", favoredId = "second", filterLevel = WebNovelFilter.Level.R18)) shouldContainExactly
                    listOf("pixiv/123")
                list("SF$", favoredId = "second", filterLevel = WebNovelFilter.Level.一般向).items.size shouldBe 0
                // R18 档含性描写：n3(R18) 与 n5(性描写) 都命中
                ids(list("物語", favoredId = null, filterLevel = WebNovelFilter.Level.R18)) shouldContainExactly
                    listOf("pixiv/123", "syosetu/n0004")
                // 一般向排除性描写：n5 不命中
                ids(list("ファンタジー$", filterLevel = WebNovelFilter.Level.一般向)) shouldContainExactly
                    listOf("syosetu/n0001")
                // 无 query 的 Mongo 路径同定义：一般向排性描写（n5 出列），R18 档收性描写（n5 入列）
                ids(list(null, filterLevel = WebNovelFilter.Level.一般向)) shouldContainExactly
                    listOf("syosetu/n0002", "syosetu/n0001")
                ids(list(null, filterLevel = WebNovelFilter.Level.R18)) shouldContainExactly
                    listOf("syosetu/n0004")
            }

            it("provider/type/translate 过滤在 query 路径由 ES 生效") {
                list("ファンタジー$", filterProvider = listOf("pixiv")).items.size shouldBe 0
                ids(list("ファンタジー$", filterType = WebNovelFilter.Type.已完结)) shouldContainExactly
                    listOf("syosetu/n0004")
                ids(list("ファンタジー$", filterTranslate = WebNovelFilter.Translate.GPT3)) shouldContainExactly
                    listOf("syosetu/n0001")
            }

            it("分页：pageNumber 准确、页间不重叠") {
                val p0 = list("ファンタジー", page = 0, pageSize = 2)
                p0.pageNumber shouldBe 2
                ids(p0) shouldContainExactly listOf("syosetu/n0004", "syosetu/n0002")
                ids(list("ファンタジー", page = 1, pageSize = 2)) shouldContainExactly
                    listOf("syosetu/n0001")
            }

            it("无 query 时不走 ES，原样返回收藏列表") {
                val page = list(null)
                page.items.size shouldBe 3
                ids(page) shouldContainExactly
                    listOf("syosetu/n0004", "syosetu/n0002", "syosetu/n0001")
            }
        }
    }
}
