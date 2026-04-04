package infra.web.repository

import com.mongodb.client.model.Filters.*
import com.mongodb.client.model.FindOneAndUpdateOptions
import com.mongodb.client.model.ReturnDocument
import com.mongodb.client.model.Updates.*
import com.mongodb.client.result.UpdateResult
import infra.*
import infra.common.Page
import infra.oplog.WebNovelTocMergeHistory
import infra.web.*
import infra.web.datasource.WebNovelEsDataSource
import infra.web.datasource.WebNovelHttpDataSource
import infra.web.datasource.providers.Hameln
import infra.web.datasource.providers.Pixiv
import infra.web.datasource.providers.RemoteNovelListItem
import infra.web.datasource.providers.Syosetu
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.toList
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import org.bson.conversions.Bson
import org.bson.types.ObjectId
import java.util.*
import kotlin.time.Duration.Companion.days
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.minutes

class WebNovelMetadataRepository(
    private val provider: WebNovelHttpDataSource,
    mongo: MongoClient,
    private val es: WebNovelEsDataSource,
    private val redis: RedisClient,
) {
    private val webNovelMetadataCollection =
        mongo.database.getCollection<WebNovel>(
            MongoCollectionNames.WEB_NOVEL,
        )
    private val tocMergeHistoryCollection =
        mongo.database.getCollection<WebNovelTocMergeHistory>(
            MongoCollectionNames.TOC_MERGE_HISTORY,
        )
    private val userFavoredWebCollection =
        mongo.database.getCollection<WebNovelFavoriteDbModel>(
            MongoCollectionNames.WEB_FAVORITE,
        )
    private val userReadHistoryWebCollection =
        mongo.database.getCollection<WebNovelReadHistoryDbModel>(
            MongoCollectionNames.WEB_READ_HISTORY,
        )

    private fun byId(providerId: String, novelId: String): Bson =
        and(
            eq(WebNovel::providerId.field(), providerId),
            eq(WebNovel::novelId.field(), novelId),
        )

    suspend fun listRank(
        providerId: String,
        options: Map<String, String>,
    ): Result<Page<WebNovelListItem>> {
        return provider
            .listRank(providerId, options)
            .map { rank ->
                rank.map { remote ->
                    val local = webNovelMetadataCollection
                        .find(byId(providerId, remote.novelId))
                        .firstOrNull()
                    remote.toOutline(providerId, local)
                }
            }
    }

    suspend fun search(
        userId: String?,
        userQuery: String?,
        filterProvider: List<String>,
        filterType: WebNovelFilter.Type,
        filterLevel: WebNovelFilter.Level,
        filterTranslate: WebNovelFilter.Translate,
        filterSort: WebNovelFilter.Sort,
        page: Int,
        pageSize: Int,
    ): Page<WebNovelListItem> {
        val (itemsEs, total) = es.searchNovel(
            userQuery = userQuery,
            filterProvider = filterProvider,
            filterType = filterType,
            filterLevel = filterLevel,
            filterTranslate = filterTranslate,
            filterSort = filterSort,
            page = page,
            pageSize = pageSize
        )
        val items = itemsEs.map { (providerId, novelId) ->
            webNovelMetadataCollection
                .find(byId(providerId, novelId))
                .firstOrNull()!!
        }
        val ids = items.map { it.id }
        val favoredList = userId?.let {
            userFavoredWebCollection
                .find(
                    and(
                        eq(WebNovelFavoriteDbModel::userId.field(), ObjectId(it)),
                        `in`(WebNovelFavoriteDbModel::novelId.field(), ids),
                    )
                )
                .toList()
        }
        val readHistoryList = userId?.let {
            userReadHistoryWebCollection
                .find(
                    and(
                        eq(WebNovelFavoriteDbModel::userId.field(), ObjectId(it)),
                        `in`(WebNovelReadHistoryDbModel::novelId.field(), ids),
                    )
                )
                .toList()
        }

        return Page(
            items = items.map { novel ->
                val favored = favoredList?.find { it.novelId == novel.id }
                val readHistory = readHistoryList?.find { it.novelId == novel.id }
                novel.toOutline(
                    favored = favored?.favoredId,
                    lastReadAt = readHistory?.createAt,
                )
            },
            total = total,
            pageSize = pageSize,
        )
    }

    suspend fun get(
        providerId: String,
        novelId: String,
    ): WebNovel? {
        return webNovelMetadataCollection
            .find(byId(providerId, novelId))
            .firstOrNull()
    }

    private suspend fun getRemote(
        providerId: String,
        novelId: String,
    ): Result<WebNovel> {
        return provider
            .getMetadata(providerId, novelId)
            .map { remote ->
                WebNovel(
                    id = ObjectId(),
                    providerId = providerId,
                    novelId = novelId,
                    titleJp = remote.title,
                    authors = remote.authors.map { WebNovelAuthor(it.name, it.link) },
                    type = remote.type,
                    keywords = remote.keywords,
                    attentions = remote.attentions,
                    points = remote.points,
                    totalCharacters = remote.totalCharacters,
                    introductionJp = remote.introduction,
                    toc = remote.toc.map { WebNovelTocItem(it.title, null, it.chapterId, it.createAt) },
                )
            }
    }

    suspend fun getNovelAndSave(
        providerId: String,
        novelId: String,
        expiredMinutes: Int? = null,
    ): Result<WebNovel> {
        val local = get(providerId, novelId)

        // 不在数据库中
        if (local == null) {
            return getRemote(providerId, novelId)
                .onSuccess {
                    webNovelMetadataCollection
                        .insertOne(it)
                    es.syncNovel(it)
                }
        }

        // 在数据库中，暂停更新
        if (local.pauseUpdate) {
            return Result.success(local)
        }

        // 在数据库中，没有过期
        val sinceLastSync = Clock.System.now() - local.syncAt
        val expiredDuration = expiredMinutes?.minutes
            ?: if (providerId == Pixiv.id) {
                7.days
            } else {
                20.hours
            }

        if (sinceLastSync <= expiredDuration) {
            return Result.success(local)
        }

        // 在数据库中，过期，合并
        val remoteNovel = getRemote(providerId, novelId)
            .getOrElse {
                // 无法更新，大概率小说被删了
                return Result.success(local)
            }
        val merged = mergeNovel(
            providerId = providerId,
            novelId = novelId,
            local = local,
            remote = remoteNovel,
        )
        return Result.success(merged)
    }

    private suspend fun mergeNovel(
        providerId: String,
        novelId: String,
        local: WebNovel,
        remote: WebNovel,
    ): WebNovel {
        val merged = mergeToc(
            remoteToc = remote.toc,
            localToc = local.toc,
            isIdUnstable = isProviderIdUnstable(providerId)
        )
        if (merged.reviewReason != null) {
            tocMergeHistoryCollection
                .insertOne(
                    WebNovelTocMergeHistory(
                        id = ObjectId(),
                        providerId = providerId,
                        novelId = novelId,
                        tocOld = local.toc,
                        tocNew = remote.toc,
                        reason = merged.reviewReason,
                    )
                )
        }

        val now = Clock.System.now()
        val list = mutableListOf(
            set(WebNovel::titleJp.field(), remote.titleJp),
            set(WebNovel::authors.field(), remote.authors),
            set(WebNovel::type.field(), remote.type),
            set(WebNovel::attentions.field(), remote.attentions),
            set(WebNovel::keywords.field(), remote.keywords),
            set(WebNovel::points.field(), remote.points),
            set(WebNovel::totalCharacters.field(), remote.totalCharacters),
            set(WebNovel::introductionJp.field(), remote.introductionJp),
            set(WebNovel::toc.field(), merged.toc),
            set(WebNovel::syncAt.field(), now),
        )
        if (merged.hasChanged) {
            list.add(set(WebNovel::changeAt.field(), now))
            list.add(set(WebNovel::updateAt.field(), now))
        }

        val novel = webNovelMetadataCollection
            .findOneAndUpdate(
                byId(providerId, novelId),
                combine(list),
                FindOneAndUpdateOptions().returnDocument(ReturnDocument.AFTER),
            )!!
        es.syncNovel(novel)
        if (merged.hasChanged) {
            userFavoredWebCollection.updateMany(
                eq(WebNovelFavoriteDbModel::novelId.field(), novel.id),
                set(WebNovelFavoriteDbModel::updateAt.field(), novel.updateAt),
            )
        }
        return novel
    }

    suspend fun increaseVisited(
        userIdOrIp: String,
        providerId: String,
        novelId: String,
    ) = redis.withRateLimit("web-visited:${userIdOrIp}:${providerId}:${novelId}") {
        val novel = webNovelMetadataCollection
            .findOneAndUpdate(
                byId(providerId, novelId),
                inc(WebNovel::visited.field(), 1),
                FindOneAndUpdateOptions().returnDocument(ReturnDocument.AFTER),
            ) ?: return
        es.syncVisited(novel)
    }

    suspend fun updateTranslation(
        providerId: String,
        novelId: String,
        titleZh: String?,
        introductionZh: String?,
        tocZh: Map<Int, String?>,
    ) {
        val list = mutableListOf(
            set(WebNovel::titleZh.field(), titleZh),
            set(WebNovel::introductionZh.field(), introductionZh),
        )
        tocZh.forEach { (index, itemTitleZh) ->
            list.add(
                set(
                    WebNovel::toc.field() + ".${index}." + WebNovelTocItem::titleZh.field(),
                    itemTitleZh,
                )
            )
        }
        list.add(set(WebNovel::changeAt.field(), Clock.System.now()))

        webNovelMetadataCollection
            .findOneAndUpdate(
                byId(providerId, novelId),
                combine(list),
                FindOneAndUpdateOptions().returnDocument(ReturnDocument.AFTER),
            )
            ?.also { es.syncNovel(it) }
    }

    suspend fun updateGlossary(
        providerId: String,
        novelId: String,
        glossary: Map<String, String>,
    ) {
        webNovelMetadataCollection
            .updateOne(
                byId(providerId, novelId),
                combine(
                    set(WebNovel::glossaryUuid.field(), UUID.randomUUID().toString()),
                    set(WebNovel::glossary.field(), glossary),
                ),
            )
    }

    suspend fun updateWenkuId(
        providerId: String,
        novelId: String,
        wenkuId: String?,
    ): UpdateResult {
        return webNovelMetadataCollection
            .updateOne(
                byId(providerId, novelId),
                set(WebNovel::wenkuId.field(), wenkuId),
            )
    }
}

private fun RemoteNovelListItem.toOutline(
    providerId: String,
    novel: WebNovel?,
) =
    WebNovelListItem(
        providerId = providerId,
        novelId = novelId,
        titleJp = title,
        titleZh = novel?.titleZh,
        type = null,
        attentions = attentions,
        keywords = keywords,
        total = novel?.toc?.count { it.chapterId != null }?.toLong() ?: 0,
        jp = novel?.jp ?: 0,
        baidu = novel?.baidu ?: 0,
        youdao = novel?.youdao ?: 0,
        gpt = novel?.gpt ?: 0,
        sakura = novel?.sakura ?: 0,
        extra = extra,
        wenkuId = novel?.wenkuId,
        updateAt = novel?.updateAt,
    )

fun WebNovel.toOutline(
    favored: String? = null,
    lastReadAt: Instant? = null,
) =
    WebNovelListItem(
        providerId = providerId,
        novelId = novelId,
        titleJp = titleJp,
        titleZh = titleZh,
        type = type,
        attentions = attentions,
        keywords = keywords,
        //
        favored = favored,
        lastReadAt = lastReadAt,
        //
        total = toc.count { it.chapterId != null }.toLong(),
        jp = jp,
        baidu = baidu,
        youdao = youdao,
        gpt = gpt,
        sakura = sakura,
        extra = null,
        wenkuId = wenkuId,
        updateAt = updateAt,
    )

fun isProviderIdUnstable(providerId: String): Boolean {
    return providerId == Syosetu.id || providerId == Hameln.id
}

data class MergedResult(
    val toc: List<WebNovelTocItem>,
    val hasChanged: Boolean,
    val reviewReason: String?,
)

fun mergeToc(
    remoteToc: List<WebNovelTocItem>,
    localToc: List<WebNovelTocItem>,
    isIdUnstable: Boolean,
): MergedResult {
    return if (isIdUnstable) {
        mergeTocUnstable(remoteToc, localToc)
    } else {
        mergeTocStable(remoteToc, localToc)
    }
}

private fun mergeTocUnstable(
    remoteToc: List<WebNovelTocItem>,
    localToc: List<WebNovelTocItem>,
): MergedResult {
    val remoteIdToTitle = remoteToc.mapNotNull {
        if (it.chapterId == null) null
        else it.chapterId to it.titleJp
    }.toMap()
    val localIdToTitle = localToc.mapNotNull {
        if (it.chapterId == null) null
        else it.chapterId to it.titleJp
    }.toMap()

    if (remoteIdToTitle.size < localIdToTitle.size) {
        return MergedResult(
            simpleMergeToc(remoteToc, localToc),
            true,
            "有未知章节被删了"
        )
    } else {
        val hasEpisodeTitleChanged = localIdToTitle.any { (eid, localTitle) ->
            val remoteTitle = remoteIdToTitle[eid]
            remoteTitle != localTitle
        }
        return MergedResult(
            simpleMergeToc(remoteToc, localToc),
            remoteIdToTitle.size != localIdToTitle.size,
            if (hasEpisodeTitleChanged) "有章节标题变化" else null
        )
    }
}

private fun mergeTocStable(
    remoteToc: List<WebNovelTocItem>,
    localToc: List<WebNovelTocItem>,
): MergedResult {
    val remoteEpIds = remoteToc.mapNotNull { it.chapterId }
    val localEpIds = localToc.mapNotNull { it.chapterId }
    val noEpDeleted = remoteEpIds.containsAll(localEpIds)
    val noEpAdded = localEpIds.containsAll(remoteEpIds)
    return MergedResult(
        simpleMergeToc(remoteToc, localToc),
        !(noEpAdded && noEpDeleted),
        if (noEpDeleted) null else "有章节被删了"
    )
}

private fun simpleMergeToc(
    remoteToc: List<WebNovelTocItem>,
    localToc: List<WebNovelTocItem>,
): List<WebNovelTocItem> {
    return remoteToc.map { itemNew ->
        val itemOld = localToc.find { it.titleJp == itemNew.titleJp }
        if (itemOld?.titleZh == null) {
            itemNew
        } else {
            itemNew.copy(titleZh = itemOld.titleZh)
        }
    }
}
