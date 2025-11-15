package infra.web.datasource.providers

import infra.common.Page
import infra.web.WebNovelAttention
import infra.web.WebNovelAuthor
import infra.web.WebNovelType
import io.ktor.client.call.*
import io.ktor.client.statement.*
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.datetime.toKotlinInstant
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import java.text.SimpleDateFormat
import java.util.*

@Serializable
data class UserProvidedData(
    val metadata: RemoteNovelMetadata? = null,
    val chapters: Map<String, RemoteChapter>? = null,
)

@Serializable
data class RemoteNovelMetadata(
    val title: String,
    val authors: List<WebNovelAuthor>,
    val type: WebNovelType,
    val attentions: List<WebNovelAttention>,
    val keywords: List<String>,
    val points: Int?,
    val totalCharacters: Int,
    val introduction: String,
    val toc: List<TocItem>,
) {
    @Serializable
    data class TocItem(
        val title: String,
        val chapterId: String? = null,
        val createAt: Instant? = null,
    )
}

@Serializable
data class RemoteChapter(
    val paragraphs: List<String>,
)

@Serializable
data class RemoteNovelListItem(
    val novelId: String,
    val title: String,
    val attentions: List<WebNovelAttention>,
    val keywords: List<String>,
    val extra: String,
)

interface WebNovelProvider {
    suspend fun getRank(options: Map<String, String>): Page<RemoteNovelListItem>
    suspend fun getMetadata(novelId: String): RemoteNovelMetadata
    suspend fun getChapter(novelId: String, chapterId: String): RemoteChapter
}

suspend fun HttpResponse.document(): Document = Jsoup.parse(body<String>())
suspend fun HttpResponse.json(): JsonObject = body()

// Datetime util
fun parseJapanDateString(pattern: String, dateString: String): Instant =
    SimpleDateFormat(pattern)
        .apply { timeZone = TimeZone.getTimeZone("Asia/Tokyo") }
        .parse(dateString)
        .toInstant()
        .toKotlinInstant()

// Json util
fun JsonObject.boolean(field: String) = get(field)!!.jsonPrimitive.boolean
fun JsonObject.int(field: String) = get(field)!!.jsonPrimitive.int
fun JsonObject.array(field: String) = get(field)!!.jsonArray

fun JsonObject.string(field: String) = get(field)!!.jsonPrimitive.content
fun JsonObject.stringOrNull(field: String) = get(field)!!.jsonPrimitive.contentOrNull

fun JsonObject.obj(field: String) = get(field)!!.jsonObject
fun JsonObject.objOrNull(field: String) = get(field)!!.takeUnless { it is JsonNull }?.jsonObject

// Exception
open class WebNovelProviderException(msg: String) : Exception(msg)

class NovelIdShouldBeReplacedException(
    providerId: String,
    targetNovelId: String,
) : WebNovelProviderException("小说ID不合适，应当使用：/${providerId}/${targetNovelId}")

class NovelRateLimitedException
    : WebNovelProviderException("源站获取频率太快")

class NovelAccessDeniedException
    : WebNovelProviderException("当前账号无法获取该小说资源")
