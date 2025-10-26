package infra.web.datasource.providers

import infra.common.Page
import infra.common.emptyPage
import infra.web.WebNovelAttention
import infra.web.WebNovelAuthor
import infra.web.WebNovelType
import io.ktor.client.*
import io.ktor.client.request.*
import kotlinx.datetime.Instant
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class Kakuyomu(
    private val client: HttpClient,
) : WebNovelProvider {
    companion object {
        const val id = "kakuyomu"
        private val rangeIds = mapOf(
            "每日" to "daily",
            "每周" to "weekly",
            "每月" to "monthly",
            "每年" to "yearly",
            "总计" to "entire",
        )
        private val genreIds = mapOf(
            "综合" to "all",
            "异世界幻想" to "fantasy",
            "现代幻想" to "action",
            "科幻" to "sf",
            "恋爱" to "love_story",
            "浪漫喜剧" to "romance",
            "现代戏剧" to "drama",
            "恐怖" to "horror",
            "推理" to "mystery",
            "散文·纪实" to "nonfiction",
            "历史·时代·传奇" to "history",
            "创作论·评论" to "criticism",
            "诗·童话·其他" to "others",
        )

        private val statusIds = mapOf(
            "全部" to "all",
            "长篇" to "long",
            "短篇" to "short",
        )
    }

    override suspend fun getRank(options: Map<String, String>): Page<RemoteNovelListItem> {
        val genre = genreIds[options["genre"]] ?: return emptyPage()
        val range = rangeIds[options["range"]] ?: return emptyPage()
        val status = statusIds[options["status"]] ?: return emptyPage()
        val url = "https://kakuyomu.jp/rankings/${genre}/${range}?work_variation=${status}"
        val doc = client.get(url).document()
        val items = doc.select("div.widget-media-genresWorkList-right > div.widget-work").map { workCard ->
            val a = workCard.selectFirst("a.bookWalker-work-title")!!
            val novelId = a.attr("href").removePrefix("/works/")
            val title = a.text()

            val attentions = workCard
                .select("b.widget-workCard-flags > span")
                .mapNotNull {
                    when (it.text()) {
                        "残酷描写有り" -> WebNovelAttention.残酷描写
                        "暴力描写有り" -> WebNovelAttention.暴力描写
                        "性描写有り" -> WebNovelAttention.性描写
                        else -> null
                    }
                }

            val keywords = workCard
                .select("span.widget-workCard-tags > a")
                .map { it.text() }

            val extra = workCard.selectFirst("p.widget-workCard-meta")!!.children()
                .joinToString(" / ") { it.text() }

            RemoteNovelListItem(
                novelId = novelId,
                title = title,
                attentions = attentions,
                keywords = keywords,
                extra = extra,
            )
        }
        return Page(
            items = items,
            pageNumber = 1L,
        )
    }

    override suspend fun getMetadata(novelId: String): RemoteNovelMetadata {
        val url = "https://kakuyomu.jp/works/$novelId"
        val doc = client.get(url).document()
        val script = doc.getElementById("__NEXT_DATA__")!!
        val apollo = Json
            .decodeFromString<JsonObject>(
                script.html()
            )["props"]!!
            .jsonObject["pageProps"]!!
            .jsonObject["__APOLLO_STATE__"]!!
            .jsonObject

        fun JsonObject.unref() = this["__ref"]!!
            .jsonPrimitive.content
            .let { apollo[it]!!.jsonObject }

        val work = apollo["Work:$novelId"]!!.jsonObject

        val title =
            work.stringOrNull("alternateTitle")
                ?: work.string("title")

        val author = work
            .obj("author")
            .unref()
            .let {
                WebNovelAuthor(
                    name = it.string("activityName"),
                    link = "https://kakuyomu.jp/users/${it.string("name")}",
                )
            }

        val type = when (val status = work.string("serialStatus")) {
            "COMPLETED" -> WebNovelType.已完结
            "RUNNING" -> WebNovelType.连载中
            else -> throw RuntimeException("无法解析的小说类型:$status")
        }

        val attentions = buildList {
            if (work.boolean("isCruel")) add(WebNovelAttention.残酷描写)
            if (work.boolean("isViolent")) add(WebNovelAttention.暴力描写)
            if (work.boolean("isSexual")) add(WebNovelAttention.性描写)
        }

        val keywords = work
            .array("tagLabels")
            .map { it.jsonPrimitive.content }

        val points = work.int("totalReviewPoint")
        val totalCharacters = work.int("totalCharacterCount")

        val introduction = work.string("introduction")

        val toc = work
            .array("tableOfContents")
            .map { it.jsonObject.unref() }
            .flatMap { tableOfContentsChapter ->
                val chapter = tableOfContentsChapter
                    .objOrNull("chapter")
                    ?.unref()
                val episodes = tableOfContentsChapter
                    .array("episodeUnions")
                    .map { it.jsonObject.unref() }
                buildList {
                    if (chapter != null) {
                        add(
                            RemoteNovelMetadata.TocItem(
                                title = chapter.string("title"),
                            )
                        )
                    }
                    episodes.forEach {
                        add(
                            RemoteNovelMetadata.TocItem(
                                title = it.string("title"),
                                chapterId = it.string("id"),
                                createAt = Instant.parse(it.string("publishedAt")),
                            )
                        )
                    }
                }
            }

        return RemoteNovelMetadata(
            title = title,
            authors = listOf(author),
            type = type,
            attentions = attentions,
            keywords = keywords,
            points = points,
            totalCharacters = totalCharacters,
            introduction = introduction,
            toc = toc,
        )
    }

    override suspend fun getChapter(novelId: String, chapterId: String): RemoteChapter {
        val url = "https://kakuyomu.jp/works/$novelId/episodes/$chapterId"
        val doc = client.get(url).document()
        doc.select("rp").remove()
        doc.select("rt").remove()
        val paragraphs = doc.select("div.widget-episodeBody > p").map { it.text() }
        if (paragraphs.isEmpty()) {
            throw RuntimeException("付费章节，无法获取")
        }
        return RemoteChapter(paragraphs = paragraphs)
    }
}