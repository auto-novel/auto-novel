package api

import api.model.WebNovelOutlineDto
import api.model.asDto
import api.plugins.User
import api.plugins.authenticateDb
import api.plugins.user
import infra.common.Page
import infra.user.UserRepository
import infra.web.repository.WebNovelReadHistoryRepository
import infra.web.repository.WebNovelMetadataRepository
import io.ktor.resources.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.resources.*
import io.ktor.server.resources.put
import io.ktor.server.routing.*
import org.koin.ktor.ext.inject

@Resource("/user/read-history")
private class UserReadHistoryWebRes {
    @Resource("")
    class List(
        val parent: UserReadHistoryWebRes,
        val page: Int,
        val pageSize: Int,
    )

    @Resource("/paused")
    class Paused(
        val parent: UserReadHistoryWebRes,
    )

    @Resource("/{providerId}/{novelId}")
    class Novel(
        val parent: UserReadHistoryWebRes,
        val providerId: String,
        val novelId: String,
    )
}

fun Route.routeUserReadHistoryWeb() {
    val service by inject<UserReadHistoryWebApi>()

    authenticateDb {
        get<UserReadHistoryWebRes.List> { loc ->
            val user = call.user()
            call.tryRespond {
                service.listReadHistory(
                    user = user,
                    page = loc.page,
                    pageSize = loc.pageSize,
                )
            }
        }
        delete<UserReadHistoryWebRes> {
            val user = call.user()
            call.tryRespond {
                service.clearReadHistory(
                    user = user,
                )
            }
        }

        get<UserReadHistoryWebRes.Paused> {
            val user = call.user()
            call.tryRespond {
                service.getReadHistoryPaused(user = user)
            }
        }
        put<UserReadHistoryWebRes.Paused> {
            val user = call.user()
            call.tryRespond {
                service.updateReadHistoryPaused(user = user, readHistoryPaused = true)
            }
        }
        delete<UserReadHistoryWebRes.Paused> {
            val user = call.user()
            call.tryRespond {
                service.updateReadHistoryPaused(user = user, readHistoryPaused = false)
            }
        }

        put<UserReadHistoryWebRes.Novel> { loc ->
            val user = call.user()
            val chapterId = call.receive<String>()
            call.tryRespond {
                service.updateReadHistory(
                    user = user,
                    providerId = loc.providerId,
                    novelId = loc.novelId,
                    chapterId = chapterId,
                )
            }
        }
        delete<UserReadHistoryWebRes.Novel> { loc ->
            val user = call.user()
            call.tryRespond {
                service.deleteReadHistory(
                    user = user,
                    providerId = loc.providerId,
                    novelId = loc.novelId,
                )
            }
        }
    }
}

class UserReadHistoryWebApi(
    private val userRepo: UserRepository,
    private val historyRepo: WebNovelReadHistoryRepository,
    private val metadataRepo: WebNovelMetadataRepository,
) {
    suspend fun listReadHistory(
        user: User,
        page: Int,
        pageSize: Int,
    ): Page<WebNovelOutlineDto> {
        validatePageNumber(page)
        validatePageSize(pageSize)
        return historyRepo
            .listReaderHistory(
                userId = user.id,
                page = page,
                pageSize = pageSize,
            )
            .map { it.asDto() }
    }

    suspend fun clearReadHistory(
        user: User,
    ) {
        historyRepo.deleteReadHistoryByUser(
            userId = user.id,
        )
    }

    suspend fun getReadHistoryPaused(
        user: User,
    ): Boolean {
        return userRepo.isReadHistoryPaused(
            userId = user.id,
        )
    }

    suspend fun updateReadHistoryPaused(
        user: User,
        readHistoryPaused: Boolean,
    ) {
        userRepo.updateUserReadHistoryPaused(
            userId = user.id,
            readHistoryPause = readHistoryPaused,
        )
    }

    suspend fun updateReadHistory(
        user: User,
        providerId: String,
        novelId: String,
        chapterId: String,
    ) {
        if (userRepo.isReadHistoryPaused(user.id)) {
            return
        }
        val novel = metadataRepo.get(providerId, novelId)
            ?: throwNotFound("小说不存在")
        historyRepo.updateReadHistory(
            userId = user.id,
            novelId = novel.id.toHexString(),
            chapterId = chapterId,
        )
    }

    suspend fun deleteReadHistory(
        user: User,
        providerId: String,
        novelId: String,
    ) {
        val novel = metadataRepo.get(providerId, novelId)
            ?: throwNotFound("小说不存在")
        historyRepo.deleteReadHistory(
            userId = user.id,
            novelId = novel.id.toHexString(),
        )
    }
}
