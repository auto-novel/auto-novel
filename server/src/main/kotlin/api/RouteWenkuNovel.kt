package api

import api.plugins.*
import infra.common.NovelFileMode
import infra.common.NovelFileTranslationsMode
import infra.common.Page
import infra.common.TranslatorId
import infra.oplog.Operation
import infra.oplog.OperationHistoryRepository
import infra.wenku.*
import infra.wenku.datasource.VolumeCreateException
import infra.wenku.repository.WenkuNovelFavoredRepository
import infra.wenku.repository.WenkuNovelMetadataRepository
import infra.wenku.repository.WenkuNovelVolumeRepository
import io.ktor.http.*
import io.ktor.http.content.*
import io.ktor.resources.*
import io.ktor.server.plugins.ratelimit.*
import io.ktor.server.request.*
import io.ktor.server.resources.*
import io.ktor.server.resources.post
import io.ktor.server.resources.put
import io.ktor.server.routing.*
import io.ktor.utils.io.*
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import org.bson.types.ObjectId
import org.koin.ktor.ext.inject

@Resource("/wenku")
private class WenkuNovelRes {
    @Resource("")
    class NovelList(
        val parent: WenkuNovelRes,
        val page: Int,
        val pageSize: Int,
        val query: String? = null,
        val level: Int = 0,
    )

    @Resource("/{novelId}")
    class Id(val parent: WenkuNovelRes, val novelId: String) {
        @Resource("/glossary")
        class Glossary(val parent: Id)

        @Resource("/volume/{volumeId}")
        class Volume(val parent: Id, val volumeId: String)

        @Resource("/translate-v2/{translatorId}/{volumeId}")
        class TranslateV2(val parent: Id, val translatorId: TranslatorId, val volumeId: String) {
            @Resource("/chapter-task/{chapterId}")
            class ChapterTask(val parent: TranslateV2, val chapterId: String)

            @Resource("/chapter/{chapterId}")
            class Chapter(val parent: TranslateV2, val chapterId: String)
        }

        @Resource("/file/{volumeId}")
        class File(
            val parent: Id,
            val volumeId: String,
            val mode: NovelFileMode,
            val translationsMode: NovelFileTranslationsMode,
            val translations: List<TranslatorId>,
            val filename: String,
        )
    }
}

fun Route.routeWenkuNovel() {
    val service by inject<WenkuNovelApi>()
    val translateV2Service by inject<WenkuNovelTranslateV2Api>()

    authenticateDb(optional = true) {
        get<WenkuNovelRes.NovelList> { loc ->
            val user = call.userOrNull()
            call.tryRespond {
                service.list(
                    user = user,
                    queryString = loc.query?.ifBlank { null },
                    page = loc.page,
                    pageSize = loc.pageSize,
                    filterLevel = when (loc.level) {
                        0 -> WenkuNovelFilter.Level.全部
                        1 -> WenkuNovelFilter.Level.轻小说
                        2 -> WenkuNovelFilter.Level.轻文学
                        3 -> WenkuNovelFilter.Level.文学
                        4 -> WenkuNovelFilter.Level.非小说
                        5 -> WenkuNovelFilter.Level.R18男性向
                        6 -> WenkuNovelFilter.Level.R18女性向
                        else -> WenkuNovelFilter.Level.全部
                    },
                )
            }
        }
    }

    authenticateDb(optional = true) {
        get<WenkuNovelRes.Id> { loc ->
            val user = call.userOrNull()
            call.tryRespond {
                service.getNovel(user = user, novelId = loc.novelId)
            }
        }
    }

    authenticateDb {
        rateLimit(RateLimitNames.CreateWenkuNovel) {
            post<WenkuNovelRes> {
                val user = call.user()
                val body = call.receive<WenkuNovelApi.MetadataCreateBody>()
                call.tryRespond {
                    service.createNovel(user = user, body = body)
                }
            }
        }
        put<WenkuNovelRes.Id> { loc ->
            val user = call.user()
            val body = call.receive<WenkuNovelApi.MetadataCreateBody>()
            call.tryRespond {
                service.updateNovel(user = user, novelId = loc.novelId, body = body)
            }
        }

        put<WenkuNovelRes.Id.Glossary> { loc ->
            val user = call.user()
            val body = call.receive<Map<String, String>>()
            call.tryRespond {
                service.updateGlossary(user = user, novelId = loc.parent.novelId, glossary = body)
            }
        }

        rateLimit(RateLimitNames.CreateWenkuVolume) {
            post<WenkuNovelRes.Id.Volume> { loc ->
                suspend fun MultiPartData.firstFilePart(): PartData.FileItem? {
                    while (true) {
                        val part = readPart() ?: return null
                        if (part is PartData.FileItem) return part
                        else part.dispose()
                    }
                }

                val user = call.user()
                val filePart = call.receiveMultipart().firstFilePart()
                call.tryRespond {
                    if (filePart == null) throwBadRequest("请求里没有文件")
                    service.createVolume(
                        user = user,
                        novelId = loc.parent.novelId,
                        volumeId = loc.volumeId,
                        inputStream = filePart.provider(),
                        unpack = filePart.name == "jp",
                    )
                }
            }
        }
        delete<WenkuNovelRes.Id.Volume> { loc ->
            val user = call.user()
            call.tryRespond {
                service.deleteVolume(
                    user = user,
                    novelId = loc.parent.novelId,
                    volumeId = loc.volumeId,
                )
            }
        }

        // TranslateV2
        get<WenkuNovelRes.Id.TranslateV2> { loc ->
            call.tryRespond {
                translateV2Service.getTranslateTask(
                    novelId = loc.parent.novelId,
                    translatorId = loc.translatorId,
                    volumeId = loc.volumeId,
                )
            }
        }
        get<WenkuNovelRes.Id.TranslateV2.ChapterTask> { loc ->
            call.tryRespond {
                translateV2Service.getChapterTranslateTask(
                    novelId = loc.parent.parent.novelId,
                    volumeId = loc.parent.volumeId,
                    translatorId = loc.parent.translatorId,
                    chapterId = loc.chapterId,
                )
            }
        }
        post<WenkuNovelRes.Id.TranslateV2.Chapter> { loc ->
            @Serializable
            class Body(
                val glossaryId: String? = null,
                val paragraphsZh: List<String>,
                val sakuraVersion: String? = null,
            )

            val body = call.receive<Body>()
            call.tryRespond {
                translateV2Service.updateChapterTranslation(
                    novelId = loc.parent.parent.novelId,
                    translatorId = loc.parent.translatorId,
                    volumeId = loc.parent.volumeId,
                    chapterId = loc.chapterId,
                    glossaryId = body.glossaryId,
                    paragraphsZh = body.paragraphsZh,
                    sakuraVersion = body.sakuraVersion,
                )
            }
        }
    }

    // File
    get<WenkuNovelRes.Id.File> { loc ->
        call.tryRespondRedirect {
            val path = service.updateFile(
                novelId = loc.parent.novelId,
                volumeId = loc.volumeId,
                mode = loc.mode,
                translationsMode = loc.translationsMode,
                translations = loc.translations,
            )
            val encodedFilename = loc.filename.encodeURLParameter(spaceToPlus = true)
            "/files-temp/wenku/${path.encodeURLParameter()}?filename=${encodedFilename}"
        }
    }
}

private fun throwNovelNotFound(): Nothing =
    throwNotFound("小说不存在")

private fun validateVolumeId(volumeId: String) {
    if (!volumeId.endsWith("txt") && !volumeId.endsWith("epub"))
        throwBadRequest("不支持的文件格式")
}

class WenkuNovelApi(
    private val metadataRepo: WenkuNovelMetadataRepository,
    private val volumeRepo: WenkuNovelVolumeRepository,
    private val favoredRepo: WenkuNovelFavoredRepository,
    private val operationHistoryRepo: OperationHistoryRepository,
) {
    suspend fun list(
        user: User?,
        queryString: String?,
        page: Int,
        pageSize: Int,
        filterLevel: WenkuNovelFilter.Level,
    ): Page<WenkuNovelListItem> {
        validatePageNumber(page)
        validatePageSize(pageSize)
        if (filterLevel.isNsfw) user.requireNsfwAccess()

        return metadataRepo
            .search(
                userId = user?.id,
                userQuery = queryString,
                page = page,
                pageSize = pageSize,
                filterLevel = filterLevel,
            )
    }

    @Serializable
    data class WenkuNovelDto(
        val title: String,
        val titleZh: String,
        val cover: String?,
        val authors: List<String>,
        val artists: List<String>,
        val keywords: List<String>,
        val publisher: String?,
        val imprint: String?,
        val latestPublishAt: Long?,
        val level: WenkuNovelLevel,
        val introduction: String,
        val glossary: Map<String, String>,
        val webIds: List<String>,
        val volumes: List<WenkuNovelVolume>,
        val visited: Long,
        val favored: String?,
        val volumeZh: List<String>,
        val volumeJp: List<WenkuNovelVolumeJp>,
    )

    suspend fun getNovel(
        user: User?,
        novelId: String,
    ): WenkuNovelDto {
        val metadata = metadataRepo.get(novelId)
            ?: throwNovelNotFound()

        if (metadata.level.isNsfw) user.requireNsfwAccess()

        if (user != null) {
            metadataRepo.increaseVisited(
                userIdOrIp = user.id,
                novelId = novelId,
            )
        }

        val volumes = volumeRepo.list(novelId)

        val dto = WenkuNovelDto(
            title = metadata.title,
            titleZh = metadata.titleZh,
            cover = metadata.cover,
            authors = metadata.authors,
            artists = metadata.artists,
            keywords = metadata.keywords,
            publisher = metadata.publisher,
            imprint = metadata.imprint,
            latestPublishAt = metadata.latestPublishAt?.epochSeconds,
            level = metadata.level,
            introduction = metadata.introduction,
            webIds = metadata.webIds,
            volumes = metadata.volumes,
            glossary = metadata.glossary,
            visited = metadata.visited,
            favored = null,
            volumeZh = volumes.zh,
            volumeJp = volumes.jp,
        )

        return if (user == null) {
            dto
        } else {
            val favored = favoredRepo
                .getFavoredId(user.id, novelId)
            dto.copy(
                favored = favored,
            )
        }
    }

    @Serializable
    class MetadataCreateBody(
        val title: String,
        val titleZh: String,
        val cover: String?,
        val authors: List<String>,
        val artists: List<String>,
        val level: WenkuNovelLevel,
        val introduction: String,
        val keywords: List<String>,
        val volumes: List<WenkuNovelVolume>,
    )

    suspend fun createNovel(
        user: User,
        body: MetadataCreateBody,
    ): String {
        user.requireNovelAccess()
        val novelId = metadataRepo.create(
            title = body.title,
            titleZh = body.titleZh,
            cover = body.cover,
            authors = body.authors,
            artists = body.artists,
            level = body.level,
            introduction = body.introduction,
            keywords = body.keywords,
            volumes = body.volumes,
        )
        operationHistoryRepo.create(
            operator = ObjectId(user.id),
            Operation.WenkuEdit(
                novelId = novelId,
                old = null,
                new = Operation.WenkuEdit.Data(
                    title = body.title,
                    titleZh = body.titleZh,
                    authors = body.authors,
                    artists = body.artists,
                    introduction = body.introduction,
                ),
            )
        )
        return novelId
    }

    suspend fun updateNovel(
        user: User,
        novelId: String,
        body: MetadataCreateBody,
    ) {
        user.requireNovelAccess()
        val novel = metadataRepo.get(novelId)
            ?: throwNovelNotFound()

        val noVolumeDeleted = novel
            .volumes
            .map { it.asin }
            .all { oldAsin ->
                body.volumes.any { newVolume ->
                    newVolume.asin == oldAsin
                }
            }
        if (!noVolumeDeleted) {
            user.requireAdmin()
        }

        metadataRepo.update(
            novelId = novelId,
            title = body.title,
            titleZh = body.titleZh,
            cover = body.cover,
            authors = body.authors,
            artists = body.artists,
            level = body.level,
            introduction = body.introduction,
            keywords = body.keywords,
            volumes = body.volumes,
        )

        operationHistoryRepo.create(
            operator = ObjectId(user.id),
            Operation.WenkuEdit(
                novelId = novelId,
                old = Operation.WenkuEdit.Data(
                    title = novel.title,
                    titleZh = novel.titleZh,
                    authors = novel.authors,
                    artists = novel.artists,
                    introduction = novel.introduction,
                ),
                new = Operation.WenkuEdit.Data(
                    title = body.title,
                    titleZh = body.titleZh,
                    authors = body.authors,
                    artists = body.artists,
                    introduction = body.introduction,
                ),
            )
        )
    }

    suspend fun updateGlossary(
        user: User,
        novelId: String,
        glossary: Map<String, String>,
    ) {
        user.requireNovelAccess()
        val novel = metadataRepo.get(novelId)
            ?: throwNovelNotFound()
        if (glossary == novel.glossary)
            throwBadRequest("术语表没有改变")
        metadataRepo.updateGlossary(
            novelId = novelId,
            glossary = glossary,
        )
        operationHistoryRepo.create(
            operator = ObjectId(user.id),
            operation = Operation.WenkuEditGlossary(
                novelId = novelId,
                old = novel.glossary,
                new = glossary,
            )
        )
    }

    private suspend fun validateNovelId(novelId: String) {
        if (!metadataRepo.exist(novelId))
            throwNovelNotFound()
    }

    suspend fun createVolume(
        user: User,
        novelId: String,
        volumeId: String,
        inputStream: ByteReadChannel,
        unpack: Boolean,
    ): Int {
        validateNovelId(novelId)
        validateVolumeId(volumeId)

        val total = try {
            volumeRepo.createVolume(
                novelId = novelId,
                volumeId = volumeId,
                inputStream = inputStream,
                unpack = unpack,
            )
        } catch (e: VolumeCreateException) {
            when (e) {
                is VolumeCreateException.VolumeAlreadyExist -> throwConflict("卷已经存在")
                is VolumeCreateException.VolumeUnpackFailure -> throwInternalServerError("解包失败,由于${e.cause?.message}")
            }
        }

        operationHistoryRepo.create(
            operator = ObjectId(user.id),
            operation = Operation.WenkuUpload(
                novelId = novelId,
                volumeId = volumeId,
            )
        )
        metadataRepo.notifyUpdate(novelId)

        return total ?: 0
    }

    suspend fun deleteVolume(
        user: User,
        novelId: String,
        volumeId: String,
    ) {
        user.requireAdmin()

        validateNovelId(novelId)
        validateVolumeId(volumeId)

        volumeRepo.deleteVolume(
            novelId = novelId,
            volumeId = volumeId,
        )
    }

    // File
    suspend fun updateFile(
        novelId: String,
        volumeId: String,
        mode: NovelFileMode,
        translationsMode: NovelFileTranslationsMode,
        translations: List<TranslatorId>,
    ): String {
        validateNovelId(novelId)
        validateVolumeId(volumeId)

        if (translations.isEmpty())
            throwBadRequest("没有设置翻译类型")

        if (mode == NovelFileMode.Jp)
            throwBadRequest("不支持的类型")

        val newFileName = volumeRepo.makeTranslationVolumeFile(
            novelId = novelId,
            volumeId = volumeId,
            mode = mode,
            translationsMode = translationsMode,
            translations = translations.distinct(),
        ) ?: throwNotFound("卷不存在")

        return newFileName
    }
}

class WenkuNovelTranslateV2Api(
    private val metadataRepo: WenkuNovelMetadataRepository,
    private val volumeRepo: WenkuNovelVolumeRepository,
) {
    @Serializable
    data class TranslateTaskDto(
        val glossaryId: String,
        val toc: List<TocItem>,
    ) {
        @Serializable
        data class TocItem(
            val chapterId: String,
            val glossaryId: String?,
        )
    }

    suspend fun getTranslateTask(
        novelId: String,
        translatorId: TranslatorId,
        volumeId: String,
    ): TranslateTaskDto {
        val novel = metadataRepo.get(novelId)
            ?: throwNovelNotFound()
        val volume = volumeRepo.getVolume(novelId, volumeId)
            ?: throwNotFound("卷不存在")

        val toc = volume.listChapter().map {
            val chapterGlossary = volume.getChapterGlossary(translatorId, it)
            val translated = volume.translationExist(translatorId, it)
            val glossaryId = if (!translated) {
                null
            } else if (
                translatorId == TranslatorId.Sakura && chapterGlossary?.sakuraVersion != "0.9"
            ) {
                "sakura outdated"
            } else {
                chapterGlossary?.uuid ?: "no glossary"
            }

            TranslateTaskDto.TocItem(
                chapterId = it,
                glossaryId = glossaryId,
            )
        }
        return TranslateTaskDto(
            glossaryId = novel.glossaryUuid ?: "no glossary",
            toc = toc,
        )
    }

    @Serializable
    data class ChapterTranslateTaskDto(
        val paragraphJp: List<String>,
        val oldParagraphZh: List<String>?,
        val glossaryId: String,
        val glossary: Map<String, String>,
        val oldGlossaryId: String?,
        val oldGlossary: Map<String, String>,
    )

    suspend fun getChapterTranslateTask(
        novelId: String,
        volumeId: String,
        translatorId: TranslatorId,
        chapterId: String,
    ): ChapterTranslateTaskDto {
        validateVolumeId(volumeId)

        val novel = metadataRepo.get(novelId)
            ?: throwNovelNotFound()
        val volume = volumeRepo.getVolume(novelId, volumeId)
            ?: throwNotFound("卷不存在")
        val chapter = volume.getChapter(chapterId)
            ?: throwNotFound("章节不存在")

        val oldTranslation = volume.getTranslation(translatorId, chapterId)
        val chapterGlossary = volume.getChapterGlossary(translatorId, chapterId)

        val sakuraOutdated =
            translatorId == TranslatorId.Sakura && chapterGlossary?.sakuraVersion != "0.9"

        val oldGlossaryId = if (oldTranslation == null) {
            null
        } else if (sakuraOutdated) {
            "sakura outdated"
        } else {
            chapterGlossary?.uuid ?: "no glossary"
        }

        return ChapterTranslateTaskDto(
            paragraphJp = chapter,
            oldParagraphZh = oldTranslation.takeIf { !sakuraOutdated },
            glossaryId = novel.glossaryUuid ?: "no glossary",
            glossary = novel.glossary,
            oldGlossaryId = oldGlossaryId,
            oldGlossary = chapterGlossary?.glossary ?: emptyMap(),
        )
    }


    suspend fun updateChapterTranslation(
        novelId: String,
        translatorId: TranslatorId,
        volumeId: String,
        chapterId: String,
        glossaryId: String?,
        paragraphsZh: List<String>,
        sakuraVersion: String?,
    ): Int {
        if (translatorId == TranslatorId.Sakura && sakuraVersion != "0.9") {
            throwBadRequest("旧版本Sakura不再允许上传")
        }

        validateVolumeId(volumeId)

        val novel = metadataRepo.get(novelId)
            ?: throwNovelNotFound()
        if ((glossaryId ?: "no glossary") != (novel.glossaryUuid ?: "no glossary")) {
            throwBadRequest("术语表失效")
        }

        val volume = volumeRepo.getVolume(novelId, volumeId)
            ?: throwNotFound("卷不存在")

        val jpLines = volume.getChapter(chapterId)
            ?: throwNotFound("章节不存在")

        if (jpLines.size != paragraphsZh.size)
            throwBadRequest("翻译行数不匹配")

        volume.setTranslation(
            translatorId = translatorId,
            chapterId = chapterId,
            lines = paragraphsZh,
        )
        volume.setChapterGlossary(
            translatorId = translatorId,
            chapterId = chapterId,
            glossaryUuid = glossaryId,
            glossary = novel.glossary,
            sakuraVersion = sakuraVersion?.takeIf { translatorId == TranslatorId.Sakura }
        )

        return volume.listTranslation(
            translatorId = translatorId,
        ).size
    }
}
