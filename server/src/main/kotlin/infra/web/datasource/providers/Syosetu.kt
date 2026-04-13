package infra.web.datasource.providers

import infra.common.Page
import infra.common.emptyPage
import infra.web.WebNovelAttention
import infra.web.WebNovelAuthor
import infra.web.WebNovelType
import io.ktor.client.*
import io.ktor.client.plugins.cookies.*
import io.ktor.client.request.*
import io.ktor.http.*
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import org.jsoup.nodes.Document

class Syosetu(
    private val client: HttpClient,
) : WebNovelProvider {
    companion object {
        const val id = "syosetu"

        suspend fun addCookies(cookies: CookiesStorage) {
            cookies.addCookie(
                "https://ncode.syosetu.com/",
                Cookie(name = "over18", value = "yes", domain = ".syosetu.com")
            )
        }

        private val rangeIds = mapOf(
            "每日" to "daily",
            "每周" to "weekly",
            "每月" to "monthly",
            "季度" to "quarter",
            "每年" to "yearly",
            "总计" to "total",
        )
        private val statusIds = mapOf(
            "全部" to "total",
            "短篇" to "t",
            "连载" to "r",
            "完结" to "er",
        )
        private val genreIdsV1 = mapOf(
            "恋爱：异世界" to "101",
            "恋爱：现实世界" to "102",
            "幻想：高幻想" to "201",
            "幻想：低幻想" to "202",
            "文学：纯文学" to "301",
            "文学：人性剧" to "302",
            "文学：历史" to "303",
            "文学：推理" to "304",
            "文学：恐怖" to "305",
            "文学：动作" to "306",
            "文学：喜剧" to "307",
            "科幻：VR游戏" to "401",
            "科幻：宇宙" to "402",
            "科幻：空想科学" to "403",
            "科幻：惊悚" to "404",
            "其他：童话" to "9901",
            "其他：诗" to "9902",
            "其他：散文" to "9903",
            "其他：其他" to "9999",
        )
        private val genreIdsV2 = mapOf(
            "恋爱" to "1",
            "幻想" to "2",
            "文学/科幻/其他" to "o",
        )
    }

    override suspend fun getRank(options: Map<String, String>): Page<RemoteNovelListItem> {
        val genreFilter = options["genre"]
        val rangeFilter = options["range"] ?: return emptyPage()
        val statusFilter = options["status"] ?: return emptyPage()

        val rangeId = rangeIds[rangeFilter] ?: return emptyPage()
        val statusId = statusIds[statusFilter] ?: return emptyPage()

        val page = options["page"]?.toIntOrNull() ?: 1

        val path = when (options["type"]) {
            "流派" -> {
                val genreId = genreIdsV1[genreFilter] ?: return emptyPage()
                "genrelist/type/${rangeId}_${genreId}_${statusId}"
            }

            "综合" -> {
                "list/type/${rangeId}_${statusId}"
            }

            "异世界转生/转移" -> {
                val genreId = genreIdsV2[genreFilter] ?: return emptyPage()
                "isekailist/type/${rangeId}_${genreId}_${statusId}"
            }

            else -> return emptyPage()
        }

        val doc = client.get("https://yomou.syosetu.com/rank/$path/?p=${page}").document()

        val pageNumber = doc
            .getElementsByClass("c-pager")
            .first()!!
            .childrenSize() - 2

        val items = doc
            .getElementsByClass("p-ranklist-item")
            .map { item ->
                val elTitle = item.selectFirst("div.p-ranklist-item__title > a")!!
                val title = elTitle.text()
                val novelId = elTitle.attr("href")
                    .removeSuffix("/")
                    .substringAfterLast("/")

                val attentions = mutableListOf<WebNovelAttention>()
                val keywords = mutableListOf<String>()
                item
                    .selectFirst("div.p-ranklist-item__keyword")
                    ?.getElementsByTag("a")
                    ?.map { it.text() }
                    ?.forEach {
                        when (it) {
                            "R15" -> attentions.add(WebNovelAttention.R15)
                            "残酷な描写あり" -> attentions.add(WebNovelAttention.残酷描写)
                            else -> keywords.add(it)
                        }
                    }

                val elPoints = item.selectFirst("div.p-ranklist-item__points")!!
                val elInfomation = item.selectFirst("div.p-ranklist-item__infomation")!!
                val extra = (listOf(elPoints) + elInfomation.getElementsByClass("p-ranklist-item__separator"))
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
            pageNumber = pageNumber.toLong(),
        )
    }

    override suspend fun getMetadata(novelId: String): RemoteNovelMetadata {
        val (doc1, doc2) = coroutineScope {
            val url1 = "https://ncode.syosetu.com/$novelId"
            val url2 = "https://ncode.syosetu.com/novelview/infotop/ncode/$novelId"
            return@coroutineScope listOf(
                async { client.get(url1).document() },
                async { client.get(url2).document() },
            ).awaitAll()
        }

        val title = doc2
            .selectFirst("h1")!!
            .text()

        val infodataEl = doc2.getElementsByClass("p-infotop-data").first()!!
        val infotypeEl = doc2.getElementsByClass("p-infotop-type").first()!!

        fun row(label: String) = infodataEl
            .selectFirst("dt:containsOwn(${label})")
            ?.nextElementSibling()

        val author = row("作者名")!!
            .let { el ->
                WebNovelAuthor(
                    name = el.text(),
                    link = el.selectFirst("a")?.attr("href"),
                )
            }

        val type = infotypeEl.selectFirst(".p-infotop-type__type")!!
            .text()
            .let {
                when (it) {
                    "完結済" -> WebNovelType.已完结
                    "連載中" -> WebNovelType.连载中
                    "短編" -> WebNovelType.短篇
                    else -> throw RuntimeException("无法解析的小说类型:$it")
                }
            }

        val attentions = mutableSetOf<WebNovelAttention>()
        val keywords = mutableListOf<String>()
        row("キーワード")
            ?.text()
            ?.split(" ")
            ?.forEach {
                when (it) {
                    "R15" -> attentions.add(WebNovelAttention.R15)
                    "残酷な描写あり" -> attentions.add(WebNovelAttention.残酷描写)
                    else -> keywords.add(it)
                }
            }
        infotypeEl
            .selectFirst(".p-infotop-type__r18")
            ?.text()
            ?.let {
                if (it == "R18") attentions.add(WebNovelAttention.R18)
                else throw RuntimeException("无法解析的小说标签:$it")
            }

        val points = row("総合評価")
            ?.text()
            ?.filter { it.isDigit() }
            ?.toIntOrNull()

        val totalCharacters = row("文字数")!!
            .text()
            .filter { it.isDigit() }
            .toInt()

        val introduction = row("あらすじ")!!
            .text()

        val toc = if (doc1.selectFirst("div.p-eplist") == null) {
            listOf(
                RemoteNovelMetadata.TocItem(
                    title = "无名",
                    chapterId = "default",
                )
            )
        } else {
            val totalPages = doc1
                .getElementsByClass("c-pager__item--last")
                .first()
                ?.attr("href")
                ?.substringAfterLast("/?p=")
                ?.toInt()
                ?: 1

            fun parseToc(doc: Document) = doc
                .selectFirst("div.p-eplist")!!
                .children()
                .map { child ->
                    child.selectFirst("a")?.let { a ->
                        RemoteNovelMetadata.TocItem(
                            title = a.text(),
                            chapterId = a.attr("href")
                                .removeSuffix("/")
                                .substringAfterLast("/"),
                            createAt = parseJapanDateString(
                                "yyyy/MM/dd HH:mm",
                                child.selectFirst("div.p-eplist__update")!!.textNodes()[0].text(),
                            )
                        )
                    } ?: RemoteNovelMetadata.TocItem(
                        title = child.text(),
                    )
                }

            val tocFirstPage = parseToc(doc1)
            val tocRemainingPages =
                (2..totalPages)
                    .map { page ->
                        val url = "https://ncode.syosetu.com/$novelId/?p=${page}"
                        val doc = client.get(url).document()
                        return@map parseToc(doc)
                    }
                    .flatten()
            tocFirstPage + tocRemainingPages
        }
        return RemoteNovelMetadata(
            title = title,
            authors = listOf(author),
            type = type,
            attentions = attentions.toList(),
            keywords = keywords,
            points = points,
            totalCharacters = totalCharacters,
            introduction = introduction,
            toc = toc,
        )
    }

    override suspend fun getChapter(novelId: String, chapterId: String): RemoteChapter {
        val url =
            if (chapterId == "default") "https://ncode.syosetu.com/$novelId"
            else "https://ncode.syosetu.com/$novelId/$chapterId"
        val doc = client.get(url).document()
        doc.select("rp").remove()
        doc.select("rt").remove()
        val paragraphs = doc.select("div.p-novel__body > div > p").map { p ->
            p
                .firstElementChild()
                ?.firstElementChild()
                ?.takeIf { it.tagName() == "img" }
                ?.let { "<图片>https:${it.attr("src")}" }
                ?: p.text()
        }
        return RemoteChapter(paragraphs = paragraphs)
    }
}