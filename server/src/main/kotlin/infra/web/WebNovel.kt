package infra.web

import com.mongodb.client.model.Filters.and
import com.mongodb.client.model.Filters.eq
import infra.field
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.serialization.Contextual
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import org.bson.conversions.Bson
import org.bson.types.ObjectId

object WebNovelFilter {
    enum class Type { 全部, 连载中, 已完结, 短篇 }
    enum class Level {
        全部, 一般向, R18;

        val isNsfw get() = this != 一般向
    }

    enum class Translate { 全部, GPT3, Sakura }
    enum class Sort { 更新, 点击, 相关 }
}

@Serializable
enum class WebNovelAttention {
    @SerialName("R15")
    R15,

    @SerialName("R18")
    R18,

    @SerialName("残酷描写")
    残酷描写,

    @SerialName("暴力描写")
    暴力描写,

    @SerialName("性描写")
    性描写,
}

@Serializable
enum class WebNovelType {
    @SerialName("连载中")
    连载中,

    @SerialName("已完结")
    已完结,

    @SerialName("短篇")
    短篇,
}

@Serializable
data class WebNovelListItem(
    val providerId: String,
    @SerialName("bookId")
    val novelId: String,
    val titleJp: String,
    val titleZh: String?,
    val type: WebNovelType?,
    val attentions: List<WebNovelAttention>,
    val keywords: List<String>,
    //
    val favored: String? = null,
    @Contextual val lastReadAt: Instant? = null,
    //
    val total: Long = 0,
    val jp: Long = 0,
    val baidu: Long = 0,
    val youdao: Long = 0,
    val gpt: Long = 0,
    val sakura: Long,
    val extra: String? = null,
    val wenkuId: String? = null,
    @Contextual val updateAt: Instant? = null,
)

@Serializable
class WebNovel(
    @Contextual @SerialName("_id") val id: ObjectId,
    val providerId: String,
    @SerialName("bookId")
    val novelId: String,
    val wenkuId: String? = null,
    val titleJp: String,
    val titleZh: String? = null,
    val authors: List<WebNovelAuthor>,
    val type: WebNovelType = WebNovelType.连载中,
    val attentions: List<WebNovelAttention> = emptyList(),
    val keywords: List<String> = emptyList(),
    val points: Int?,
    val totalCharacters: Int? = null,
    val introductionJp: String,
    val introductionZh: String? = null,
    val glossaryUuid: String? = "no glossary",
    val glossary: Map<String, String> = emptyMap(),
    val toc: List<WebNovelTocItem>,
    // Translate state
    val jp: Long = 0,
    val baidu: Long = 0,
    val youdao: Long = 0,
    val gpt: Long = 0,
    val sakura: Long = 0,
    // Misc
    val visited: Long = 0,
    val pauseUpdate: Boolean = false,
    @Contextual val syncAt: Instant = Clock.System.now(),
    @Contextual val changeAt: Instant = Clock.System.now(),
    @Contextual val updateAt: Instant = Clock.System.now(),
) {
    companion object {
        fun byId(providerId: String, novelId: String): Bson =
            and(
                eq(WebNovel::providerId.field(), providerId),
                eq(WebNovel::novelId.field(), novelId),
            )
    }
}

@Serializable
data class WebNovelAuthor(
    val name: String,
    val link: String?,
)

@Serializable
data class WebNovelTocItem(
    val titleJp: String,
    val titleZh: String?,
    @SerialName("episodeId")
    val chapterId: String?,
    @Contextual val createAt: Instant? = null,
)

@Serializable
data class WebNovelChapter(
    val providerId: String,
    @SerialName("bookId")
    val novelId: String,
    @SerialName("episodeId")
    val chapterId: String,
    @SerialName("paragraphsJp")
    val paragraphs: List<String>,

    @SerialName("glossaryUuid")
    val baiduGlossaryUuid: String? = null,
    @SerialName("glossary")
    val baiduGlossary: Map<String, String>? = emptyMap(),
    @SerialName("paragraphsZh")
    val baiduParagraphs: List<String>? = null,

    val youdaoGlossaryUuid: String? = null,
    val youdaoGlossary: Map<String, String>? = emptyMap(),
    val youdaoParagraphs: List<String>? = null,

    val gptGlossaryUuid: String? = null,
    val gptGlossary: Map<String, String>? = emptyMap(),
    val gptParagraphs: List<String>? = null,

    val sakuraVersion: String? = null,
    val sakuraGlossaryUuid: String? = null,
    val sakuraGlossary: Map<String, String>? = emptyMap(),
    val sakuraParagraphs: List<String>? = null,
) {
    companion object {
        fun byId(providerId: String, novelId: String, chapterId: String): Bson {
            return and(
                eq(WebNovelChapter::providerId.field(), providerId),
                eq(WebNovelChapter::novelId.field(), novelId),
                eq(WebNovelChapter::chapterId.field(), chapterId),
            )
        }

        fun byNovelId(providerId: String, novelId: String): Bson {
            return and(
                eq(WebNovelChapter::providerId.field(), providerId),
                eq(WebNovelChapter::novelId.field(), novelId),
            )
        }
    }
}

@Serializable
data class WebNovelChapterTranslationState(
    val chapterId: String,
    val glossaryUuid: String?,
    val translated: Boolean,
    val sakuraVersion: String? = null,
)

// MongoDB
@Serializable
data class WebNovelFavoriteDbModel(
    @Contextual val userId: ObjectId,
    @Contextual val novelId: ObjectId,
    @Contextual val favoredId: String,
    @Contextual val createAt: Instant,
    @Contextual val updateAt: Instant,
)

@Serializable
data class WebNovelReadHistoryDbModel(
    @Contextual val userId: ObjectId,
    @Contextual val novelId: ObjectId,
    @Contextual val chapterId: String,
    @Contextual val createAt: Instant,
)
