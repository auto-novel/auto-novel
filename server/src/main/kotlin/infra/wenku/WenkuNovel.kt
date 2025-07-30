package infra.wenku

import com.mongodb.client.model.Filters.eq
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.serialization.Contextual
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import org.bson.conversions.Bson
import org.bson.types.ObjectId

object WenkuNovelFilter {
    enum class Level { 全部, 一般向, 成人向, 严肃向 }
}

@Serializable
enum class WenkuNovelLevel {
    @SerialName("一般向")
    一般向,

    @SerialName("成人向")
    成人向,

    @SerialName("严肃向")
    严肃向,
}

@Serializable
data class WenkuNovelListItem(
    val id: String,
    val title: String,
    val titleZh: String,
    val cover: String?,
    val favored: String?,
)

@Serializable
data class WenkuNovel(
    @Contextual @SerialName("_id") val id: ObjectId,
    val title: String,
    val titleZh: String,
    val cover: String? = null,
    val authors: List<String>,
    val artists: List<String>,
    val keywords: List<String>,
    val publisher: String? = null,
    val imprint: String? = null,
    @Contextual val latestPublishAt: Instant? = null,
    val level: WenkuNovelLevel,
    val introduction: String,
    val webIds: List<String> = emptyList(),
    val volumes: List<WenkuNovelVolume>,
    val glossaryUuid: String? = null,
    val glossary: Map<String, String> = emptyMap(),
    val visited: Long,
    @Contextual val updateAt: Instant = Clock.System.now(),
) {
    companion object {
        fun byId(id: String): Bson = eq("_id", ObjectId(id))
    }
}

@Serializable
data class WenkuNovelVolume(
    val asin: String,
    val title: String,
    val titleZh: String? = null,
    val cover: String,
    val coverHires: String? = null,
    val publisher: String? = null,
    val imprint: String? = null,
    val publishAt: Long? = null,
)

data class WenkuNovelVolumeList(
    val jp: List<WenkuNovelVolumeJp>,
    val zh: List<String>,
)

@Serializable
data class WenkuNovelVolumeJp(
    val volumeId: String,
    val fileSize: Long = 0,
    val lastModifiedTime: Long? = null,
    val total: Int,
    val baidu: Int,
    val youdao: Int,
    val gpt: Int,
    val sakura: Int,
)

@Serializable
data class WenkuChapterGlossary(
    val uuid: String?,
    val glossary: Map<String, String>,
    val sakuraVersion: String?,
)

// MongoDB
@Serializable
data class WenkuNovelFavoriteDbModel(
    @Contextual val userId: ObjectId,
    @Contextual val novelId: ObjectId,
    @Contextual val favoredId: String,
    @Contextual val createAt: Instant,
    @Contextual val updateAt: Instant,
)
