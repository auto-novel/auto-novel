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
import org.jsoup.nodes.Element

class Hameln(
    private val client: HttpClient,
    useProxy: Boolean,
) : WebNovelProvider {
    companion object {
        const val id = "hameln"

        private const val URL_ORIGIN = "https://syosetu.org"
        private const val URL_PROXY = "https://hml.xkvi.top"

        suspend fun addCookies(cookies: CookiesStorage, token: String) {
            cookies.addCookie(
                URL_ORIGIN,
                Cookie(name = "over18", value = "off", domain = ".syosetu.org")
            )
            cookies.addCookie(
                URL_PROXY,
                Cookie(name = "token", value = token, domain = ".hml.xkvi.top")
            )
        }
    }

    private val baseUrl =
        if (useProxy) URL_PROXY else URL_ORIGIN

    override suspend fun getRank(options: Map<String, String>): Page<RemoteNovelListItem> {
        return emptyPage()
    }

    override suspend fun getMetadata(novelId: String): RemoteNovelMetadata {
        val (doc1, doc2) = coroutineScope {
            val url1 = "$baseUrl/novel/$novelId"
            val url2 = "$baseUrl/?mode=ss_detail&nid=$novelId"
            return@coroutineScope listOf(
                async { client.get(url1).document() },
                async { client.get(url2).document() },
            ).awaitAll()
        }

        val mainEl = doc2.getElementById("main")!!

        fun row(label: String) = mainEl
            .selectFirst("td:matches(^$label\$)")!!
            .nextElementSibling()!!

        val title = row("タイトル")
            .text()

        val author = row("作者")
            .let { el ->
                WebNovelAuthor(
                    name = el.text(),
                    link = el.selectFirst("a")
                        ?.attr("href")
                        ?.replace(baseUrl, URL_ORIGIN),
                )
            }

        val type = row("話数")
            .text()
            .let {
                when {
                    it.startsWith("連載(完結)") -> WebNovelType.已完结
                    it.startsWith("連載(未完)") -> WebNovelType.连载中
                    it.startsWith("連載(連載中)") -> WebNovelType.连载中
                    it.startsWith("短編") -> WebNovelType.短篇
                    else -> throw RuntimeException("无法解析的小说类型:$it")
                }
            }

        val attentions = mutableSetOf<WebNovelAttention>()
        val keywords = mutableListOf<String>()
        row("原作").select("a").map { it.text() }.forEach {
            keywords.add(it)
        }
        listOf("タグ", "必須タグ")
            .flatMap { row(it).select("a") }
            .map { it.text() }
            .forEach {
                when (it) {
                    "残酷な描写" -> attentions.add(WebNovelAttention.残酷描写)
                    "R-15" -> attentions.add(WebNovelAttention.R15)
                    "R-18" -> attentions.add(WebNovelAttention.R18)
                    else -> keywords.add(it)
                }
            }

        val points = row("総合評価")
            .text()
            .filter { it.isDigit() }
            .toIntOrNull()

        val totalCharacters = row("合計文字数")
            .text()
            .filter { it.isDigit() }
            .toInt()

        val introduction = row("あらすじ")
            .text()

        val toc = if (doc1.selectFirst("span[itemprop=name]") != null) {
            doc1.select("tbody > tr").map { trTag ->
                trTag.selectFirst("a")?.let {
                    val chapterId = it.attr("href").removePrefix("./").removeSuffix(".html")
                    RemoteNovelMetadata.TocItem(
                        title = it.text(),
                        chapterId = chapterId,
                        createAt = parseJapanDateString(
                            "yyyy年MM月dd日 HH:mm",
                            trTag.selectFirst("nobr")!!.childNode(0)
                                .let { if (it is Element) it.text() else it.toString() }
                                .replace("\\(.*?\\)".toRegex(), "")
                        ),
                    )
                } ?: RemoteNovelMetadata.TocItem(
                    title = trTag.text(),
                )
            }
        } else {
            listOf(
                RemoteNovelMetadata.TocItem(
                    title = "无名",
                    chapterId = "default",
                )
            )
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
            if (chapterId == "default") "$baseUrl/novel/$novelId"
            else "$baseUrl/novel/$novelId/$chapterId.html"
        val paragraphs = client.get(url).document()
            .selectFirst("div#honbun")!!
            .getElementsByTag("p")
            .apply {
                select("rp").remove()
                select("rt").remove()
            }
            .filter { it -> it.id().isNotEmpty() }
            .map { it.text() }
        return RemoteChapter(paragraphs = paragraphs)
    }
}