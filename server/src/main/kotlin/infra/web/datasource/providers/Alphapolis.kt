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
import org.jsoup.nodes.Element
import org.jsoup.nodes.TextNode

class Alphapolis(
    private val client: HttpClient,
) : WebNovelProvider {
    companion object {
        const val id = "alphapolis"

        suspend fun addCookies(cookies: CookiesStorage) {
            cookies.addCookie(
                "https://www.alphapolis.co.jp",
                Cookie(name = "_pubcid", value = "8807a80b-fc00-4c56-b151-95e6780d9f8f", domain = ".alphapolis.co.jp")
            )
        }
    }

    override suspend fun getRank(options: Map<String, String>): Page<RemoteNovelListItem> {
        return emptyPage()
    }

    private fun getMetadataUrl(novelId: String): String {
        return "https://www.alphapolis.co.jp/novel/" + novelId.split('-').joinToString("/")
    }

    private fun getEpisodeUrl(novelId: String, chapterId: String): String {
        return getMetadataUrl(novelId) + "/episode/" + chapterId
    }

    override suspend fun getMetadata(novelId: String): RemoteNovelMetadata {
        val doc = client.get(getMetadataUrl(novelId)).document()

        val contentInfoEl = doc
            .getElementById("sidebar")!!
            .selectFirst(".content-info")!!

        val contentMainEl = doc
            .getElementById("main")!!
            .selectFirst(".content-main")!!

        val infoEl = contentInfoEl.selectFirst(".content-statuses")!!
        val tableEl = contentInfoEl.selectFirst("table.detail")!!

        fun row(label: String) = tableEl
            .selectFirst("th:containsOwn(${label})")!!
            .nextElementSibling()!!

        val title = contentMainEl
            .selectFirst("h1.title")!!
            .text()

        val author = contentMainEl
            .selectFirst("div.author")!!
            .selectFirst("a")!!
            .let {
                WebNovelAuthor(
                    name = it.text(),
                    link = it.attr("href"),
                )
            }

        val type = infoEl
            .selectFirst("span.complete")!!
            .text()
            .let {
                when (it) {
                    "連載中" -> WebNovelType.连载中
                    "完結" -> WebNovelType.已完结
                    else -> throw RuntimeException("无法解析的小说类型:$it")
                }
            }

        val attention = infoEl
            .selectFirst("span.rating")
            ?.text()
            .let {
                when (it) {
                    "R18" -> WebNovelAttention.R18
                    "R15" -> WebNovelAttention.R15
                    else -> null
                }
            }

        val keywords = contentMainEl
            .select(".content-tags > .tag")
            .map { it.text() }

        val points = row("累計ポイント")
            .text()
            .substringBefore("pt")
            .filter { it.isDigit() }
            .toInt()

        val totalCharacters = row("文字数")
            .text()
            .filter { it.isDigit() }
            .toInt()

        val introduction = contentMainEl
            .selectFirst("div.abstract")!!
            .text()

        val toc = mutableListOf<RemoteNovelMetadata.TocItem>()
        doc.selectFirst("div.episodes")!!.children().forEach { el ->
            if (el.hasClass("chapter-rental")) {
                toc.add(
                    RemoteNovelMetadata.TocItem(
                        title = el.selectFirst("h3")!!.text(),
                    )
                )
            } else if (el.hasClass("rental")) {
                el.select("div.rental-episode > a").not("[class]").forEach {
                    toc.add(
                        RemoteNovelMetadata.TocItem(
                            title = it.text(),
                            chapterId = it.attr("href").substringAfterLast("/"),
                        )
                    )
                }
            } else if (el.tagName() == "h3") {
                val chapterTitle = el.text()
                if (chapterTitle.isNotBlank()) {
                    toc.add(
                        RemoteNovelMetadata.TocItem(
                            title = el.text(),
                        )
                    )
                }
            } else if (el.hasClass("episode")) {
                toc.add(
                    RemoteNovelMetadata.TocItem(
                        title = el.selectFirst("span.title")!!.text(),
                        chapterId = el.selectFirst("a")!!.attr("href").substringAfterLast("/"),
                    )
                )
            }
        }

        return RemoteNovelMetadata(
            title = title,
            authors = listOf(author),
            type = type,
            attentions = attention?.let { listOf(it) } ?: emptyList(),
            keywords = keywords,
            points = points,
            totalCharacters = totalCharacters,
            introduction = introduction,
            toc = toc,
        )
    }

    override suspend fun getChapter(novelId: String, chapterId: String): RemoteChapter {
        val doc = client.get(getEpisodeUrl(novelId, chapterId)).document()
        val els = doc.selectFirst("div#novelBody")
            ?: doc.selectFirst("div.text")
        els!!
        els.select("rp").remove()
        els.select("rt").remove()
        val str = StringBuilder()
        els.childNodes().forEach {
            if (it is Element) {
                if (it.tagName() == "br") {
                    str.append('\n')
                } else {
                    str.append(it.text())
                }
            } else if (it is TextNode) {
                str.append(it.text())
            }
        }
        val paragraphs = str.lines().map { it.trimStart() }
        if (paragraphs.size < 5) {
            throw RuntimeException("章节内容太少，爬取频率太快导致未加载")
        }
        return RemoteChapter(paragraphs = paragraphs)
    }
}
