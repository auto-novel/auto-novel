package infra.web.datasource

import com.jillesvangurp.jsondsl.JsonDsl
import com.jillesvangurp.ktsearch.*
import com.jillesvangurp.searchdsls.querydsl.*
import infra.ElasticSearchClient
import infra.ElasticSearchIndexNames
import infra.web.*
import kotlinx.datetime.Instant
import kotlinx.serialization.Contextual
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import util.serialName

class WebNovelEsDataSource(
    private val es: ElasticSearchClient,
) {
    private val target = ElasticSearchIndexNames.WEB_NOVEL

    @Serializable
    data class WebNovelMetadataEsModel(
        val providerId: String,
        val novelId: String,
        val titleJp: String,
        val titleZh: String?,
        val authors: List<String>,
        val type: WebNovelType,
        val attentions: List<WebNovelAttention>,
        val keywords: List<String>,
        val tocSize: Int,
        val visited: Int,
        val hasGpt: Boolean,
        val hasSakura: Boolean,
        val hasMurasaki: Boolean = false,
        @Contextual val updateAt: Instant,
    )

    suspend fun searchNovel(
        userQuery: String?,
        filterProvider: List<String>,
        filterType: WebNovelFilter.Type,
        filterLevel: WebNovelFilter.Level,
        filterTranslate: WebNovelFilter.Translate,
        filterSort: WebNovelFilter.Sort,
        page: Int,
        pageSize: Int,
    ): Pair<List<WebNovelMetadataEsModel>, Long> {
        val response = es.search(
            target = target,
            from = page * pageSize,
            size = pageSize
        ) {
            query = bool {
                val mustQueries = mutableListOf<ESQuery>()
                val mustNotQueries = mutableListOf<ESQuery>()

                // Filter provider
                mustQueries.add(
                    terms(
                        WebNovelMetadataEsModel::providerId,
                        *filterProvider.toTypedArray()
                    )
                )

                // Filter type
                when (filterType) {
                    WebNovelFilter.Type.连载中 -> WebNovelType.连载中
                    WebNovelFilter.Type.已完结 -> WebNovelType.已完结
                    WebNovelFilter.Type.短篇 -> WebNovelType.短篇
                    else -> null
                }?.let {
                    mustQueries.add(term(WebNovelMetadataEsModel::type, it.serialName()))
                }

                // Filter level
                when (filterLevel) {
                    WebNovelFilter.Level.一般向 -> mustNotQueries
                    WebNovelFilter.Level.R18 -> mustQueries
                    else -> null
                }?.add(
                    terms(
                        WebNovelMetadataEsModel::attentions,
                        WebNovelAttention.R18.serialName(),
                        WebNovelAttention.性描写.serialName(),
                    )
                )

                // Filter translate
                when (filterTranslate) {
                    WebNovelFilter.Translate.GPT3 ->
                        mustQueries.add(ESQuery("term", JsonDsl().apply { put("hasGpt", true) }))

                    WebNovelFilter.Translate.Sakura ->
                        mustQueries.add(ESQuery("term", JsonDsl().apply { put("hasSakura", true) }))

                    WebNovelFilter.Translate.Murasaki ->
                        mustQueries.add(ESQuery("term", JsonDsl().apply { put("hasMurasaki", true) }))

                    else -> Unit
                }

                // Parse query
                val allAttentions = WebNovelAttention.entries.map { it.serialName() }
                val queryWords = mutableListOf<String>()
                userQuery
                    ?.split(" ")
                    ?.forEach { token ->
                        if (token.startsWith('>') || token.startsWith('<')) {
                            token.substring(1).toUIntOrNull()?.toInt()?.let { number ->
                                mustQueries.add(range(WebNovelMetadataEsModel::tocSize) {
                                    if (token.startsWith('>')) {
                                        gt = number
                                    } else {
                                        lt = number
                                    }
                                })
                                return@forEach
                            }
                        }

                        if (token.endsWith('$')) {
                            val rawToken = token.removePrefix("-").removeSuffix("$")
                            val queries =
                                if (token.startsWith("-")) mustNotQueries
                                else mustQueries
                            val field =
                                if (allAttentions.contains(rawToken)) WebNovelMetadataEsModel::attentions
                                else WebNovelMetadataEsModel::keywords
                            queries.add(term(field, rawToken))
                        } else {
                            queryWords.add(token)
                        }
                    }

                filter(mustQueries)
                mustNot(mustNotQueries)

                if (queryWords.isNotEmpty()) {
                    must(
                        simpleQueryString(
                            queryWords.joinToString(" "),
                            WebNovelMetadataEsModel::titleJp,
                            WebNovelMetadataEsModel::titleZh,
                            WebNovelMetadataEsModel::authors,
                            WebNovelMetadataEsModel::attentions,
                            WebNovelMetadataEsModel::keywords,
                        ) {
                            defaultOperator = MatchOperator.AND
                        }
                    )
                }
                when (filterSort) {
                    WebNovelFilter.Sort.相关 -> if (queryWords.isEmpty()) {
                        sort {
                            add(WebNovelMetadataEsModel::updateAt)
                        }
                    }

                    WebNovelFilter.Sort.点击 -> sort {
                        add(WebNovelMetadataEsModel::visited)
                    }

                    WebNovelFilter.Sort.更新 -> sort {
                        add(WebNovelMetadataEsModel::updateAt)
                    }
                }
            }
        }

        val items = response.hits?.hits
            ?.map { hit -> hit.parseHit<WebNovelMetadataEsModel>() }
            ?: emptyList()
        val total = response.total
        return Pair(items, total)
    }

    suspend fun syncNovel(
        novel: WebNovel,
    ) {
        es.indexDocument(
            id = "${novel.providerId}.${novel.novelId}",
            target = target,
            document = WebNovelMetadataEsModel(
                providerId = novel.providerId,
                novelId = novel.novelId,
                titleJp = novel.titleJp,
                titleZh = novel.titleZh,
                authors = novel.authors.map { it.name },
                type = novel.type,
                keywords = novel.keywords,
                attentions = novel.attentions,
                tocSize = novel.toc.count { it.chapterId != null },
                visited = novel.visited.toInt(),
                hasGpt = novel.gpt > 0,
                hasSakura = novel.sakura > 0,
                hasMurasaki = novel.murasaki > 0,
                updateAt = novel.updateAt,
            ),
            refresh = Refresh.WaitFor,
        )
    }

    suspend fun syncVisited(
        novel: WebNovel,
    ) {
        es.updateDocument(
            id = "${novel.providerId}.${novel.novelId}",
            target = target,
            doc = buildJsonObject {
                put(
                    WebNovelMetadataEsModel::visited.name,
                    novel.visited,
                )
            },
            refresh = Refresh.WaitFor,
        )
    }
}
