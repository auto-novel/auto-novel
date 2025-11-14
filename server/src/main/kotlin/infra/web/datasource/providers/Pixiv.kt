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
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class Pixiv(
    private val client: HttpClient,
) : WebNovelProvider {
    companion object {
        const val id = "pixiv"

        suspend fun addCookies(cookies: CookiesStorage, phpsessid: String) {
            cookies.addCookie(
                "https://www.pixiv.net",
                Cookie(name = "PHPSESSID", value = phpsessid, domain = ".pixiv.net")
            )
        }
    }

    override suspend fun getRank(options: Map<String, String>): Page<RemoteNovelListItem> {
        return emptyPage()
    }

    override suspend fun getMetadata(novelId: String): RemoteNovelMetadata {
        // FIXME(kuriko): 测试用，完全屏蔽 server 的 pixiv 加载
        throw NovelAccessDeniedException()
        if (novelId.startsWith("s")) {
            val chapterId = novelId.removePrefix("s")
            val url = "https://www.pixiv.net/ajax/novel/$chapterId"
            val obj = client.get(url).json().obj("body")

            val seriesData = obj.objOrNull("seriesNavData")
            if (seriesData != null) {
                val targetNovelId = seriesData.int("seriesId").toString()
                throw NovelIdShouldBeReplacedException(id, targetNovelId)
            }

            val title = obj
                .string("title")

            val author = WebNovelAuthor(
                name = obj.string("userName"),
                link = "https://www.pixiv.net/users/" + obj.string("userId"),
            )

            val keywords = obj
                .obj("tags")
                .array("tags")
                .map { it.jsonObject.string("tag") }
                .filter { it != "R-18" }

            val attentions = obj
                .int("xRestrict")
                .let {
                    if (it == 0) emptyList()
                    else listOf(WebNovelAttention.R18)
                }

            val totalCharacters = obj
                .int("characterCount")

            val introduction = obj
                .string("description")
                .replace("<br />", "\n")

            return RemoteNovelMetadata(
                title = title,
                authors = listOf(author),
                type = WebNovelType.短篇,
                keywords = keywords,
                attentions = attentions,
                points = null,
                totalCharacters = totalCharacters,
                introduction = introduction,
                toc = listOf(
                    RemoteNovelMetadata.TocItem(
                        title = "无名",
                        chapterId = chapterId,
                    )
                ),
            )
        } else {
            val obj1 = client.get("https://www.pixiv.net/ajax/novel/series/$novelId")
                .json()
                .obj("body")

            val title = obj1
                .string("title")

            val author = WebNovelAuthor(
                name = obj1.string("userName"),
                link = "https://www.pixiv.net/users/" + obj1.string("userId"),
            )

            val attentions = obj1
                .int("xRestrict")
                .let {
                    if (it == 0) emptyList()
                    else listOf(WebNovelAttention.R18)
                }

            val totalCharacters = obj1
                .int("publishedTotalCharacterCount")

            val introduction = obj1
                .string("caption")

            val toc = mutableListOf<RemoteNovelMetadata.TocItem>()
            val keywords = mutableListOf<String>()

            obj1
                .array("tags")
                .forEach { keywords.add(it.jsonPrimitive.content) }

            if (keywords.isEmpty()) {
                val arr1 =
                    client.get("https://www.pixiv.net/ajax/novel/series_content/${novelId}?limit=30&last_order=0&order_by=asc")
                        .json()
                        .obj("body")
                        .obj("page")
                        .array("seriesContents")

                val keywordsBuffer = mutableSetOf<String>()
                arr1
                    .map { it.jsonObject }
                    .forEach { seriesContent ->
                        if (seriesContent.containsKey("title")) {
                            keywordsBuffer.addAll(
                                seriesContent
                                    .array("tags")
                                    .map { it.jsonPrimitive.content }
                            )
                            toc.add(
                                RemoteNovelMetadata.TocItem(
                                    title = seriesContent.string("title"),
                                    chapterId = seriesContent.string("id"),
                                )
                            )
                        } else {
                            throw NovelAccessDeniedException()
                        }
                    }
                keywords.addAll(keywordsBuffer)

                if (arr1.size < 30) {
                    // 只有一页
                    return RemoteNovelMetadata(
                        title = title,
                        authors = listOf(author),
                        type = WebNovelType.连载中,
                        keywords = keywords,
                        attentions = attentions,
                        points = null,
                        totalCharacters = totalCharacters,
                        introduction = introduction,
                        toc = toc,
                    )
                }
            }

            toc.clear()
            val arr2 = client.get("https://www.pixiv.net/ajax/novel/series/$novelId/content_titles")
                .json()
                .array("body")

            arr2
                .map { it.jsonObject }
                .forEach {
                    if (it.boolean("available")) {
                        toc.add(
                            RemoteNovelMetadata.TocItem(
                                title = it.string("title"),
                                chapterId = it.string("id"),
                            )
                        )
                    } else {
                        throw NovelAccessDeniedException()
                    }
                }

            return RemoteNovelMetadata(
                title = title,
                authors = listOf(author),
                type = WebNovelType.连载中,
                keywords = keywords,
                attentions = attentions,
                points = null,
                totalCharacters = totalCharacters,
                introduction = introduction,
                toc = toc,
            )
        }
    }

    private val imagePattern1 = """\[uploadedimage:(\d+)]""".toRegex()
    private val imagePattern2 = """\[pixivimage:(\d+)]""".toRegex()

    private fun parseImageUrlPattern1(line: String, embeddedImages: JsonObject?): String? {
        embeddedImages ?: return null
        val id = imagePattern1.find(line)?.groupValues?.get(1) ?: return null
        val url = embeddedImages.obj(id).obj("urls").string("original")
        return url
    }

    private suspend fun parseImageUrlPattern2(line: String, chapterId: String): String? {
        val id = imagePattern2.find(line)?.groupValues?.get(1) ?: return null
        val fetchUrl = "https://www.pixiv.net/ajax/novel/${chapterId}/insert_illusts?id%5B%5D=${id}"
        val body = client.get(fetchUrl).json().obj("body")
        val illust = body.obj(id).objOrNull("illust") ?: return null
        val url = illust.obj("images").string("original")
        return url
    }

    private val rubyPattern = """\[\[rb:([^>]+) > ([^]]+)]]""".toRegex()
    private val chapterPattern = """\[charpter:([^]]+)]""".toRegex()
    private fun cleanFormat(line: String): String {
        return line
            .replace(rubyPattern, "$1")
            .replace(chapterPattern, "章节：$1")
            .replace("[newpage]", "")
    }

    override suspend fun getChapter(novelId: String, chapterId: String): RemoteChapter {
        // FIXME(kuriko): 测试用，完全屏蔽 server 的 pixiv 加载
        throw NovelAccessDeniedException()
        val url = "https://www.pixiv.net/ajax/novel/$chapterId"
        val body = client.get(url).json().obj("body")

        val embeddedImages = body.objOrNull("textEmbeddedImages")
        val content = body.string("content")

        val paragraphs = content.lines().map { line ->
            val imageUrl = parseImageUrlPattern1(line, embeddedImages)
                ?: parseImageUrlPattern2(line, chapterId)

            if (imageUrl == null) {
                cleanFormat(line)
            } else {
                "<图片>${imageUrl}"
            }
        }
        return RemoteChapter(paragraphs = paragraphs)
    }
}
