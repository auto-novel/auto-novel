package api

import api.model.WebNovelOutlineDto
import api.model.asDto
import api.plugins.User
import api.plugins.authenticateDb
import api.plugins.user
import infra.common.FavoredNovelListSort
import infra.common.Page
import infra.common.emptyPage
import infra.user.UserFavored
import infra.user.UserFavoredRepository
import infra.web.repository.WebNovelFavoredRepository
import infra.web.repository.WebNovelMetadataRepository
import infra.web.WebNovelFilter
import io.ktor.resources.*
import io.ktor.server.request.*
import io.ktor.server.resources.*
import io.ktor.server.resources.post
import io.ktor.server.resources.put
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import org.bson.types.ObjectId
import org.koin.ktor.ext.inject
import java.util.*

@Resource("/user/favored-web")
private class UserFavoredWebRes {
    @Resource("/{favoredId}")
    class Id(
        val parent: UserFavoredWebRes,
        val favoredId: String,
    ) {
        @Resource("")
        class List(
            val parent: Id,
            val page: Int,
            val pageSize: Int,
            val provider: String = "",
            val type: Int = 0,
            val level: Int = 0,
            val translate: Int = 0,
            val sort: FavoredNovelListSort,
            val query: String? = null,
        )

        @Resource("/{providerId}/{novelId}")
        class Novel(
            val parent: Id,
            val providerId: String,
            val novelId: String,
        )
    }
}

fun Route.routeUserFavoredWeb() {
    val service by inject<UserFavoredWebApi>()

    authenticateDb {
        post<UserFavoredWebRes> {
            @Serializable
            class Body(val title: String)

            val user = call.user()
            val body = call.receive<Body>()
            call.tryRespond {
                service.createFavored(
                    user = user,
                    title = body.title,
                )
            }
        }
        put<UserFavoredWebRes.Id> { loc ->
            @Serializable
            class Body(val title: String)

            val user = call.user()
            val body = call.receive<Body>()
            call.tryRespond {
                service.updateFavored(
                    user = user,
                    favoredId = loc.favoredId,
                    title = body.title,
                )
            }
        }
        delete<UserFavoredWebRes.Id> { loc ->
            val user = call.user()
            call.tryRespond {
                service.deleteFavored(
                    user = user,
                    favoredId = loc.favoredId,
                )
            }
        }
        get<UserFavoredWebRes.Id.List> { loc ->
            val user = call.user()
            call.tryRespond {
                service.listFavoredNovel(
                    user = user,
                    favoredId = loc.parent.favoredId,
                    queryString = loc.query?.ifBlank { null },
                    filterProvider = loc.provider,
                    filterType = when (loc.type) {
                        1 -> WebNovelFilter.Type.连载中
                        2 -> WebNovelFilter.Type.已完结
                        3 -> WebNovelFilter.Type.短篇
                        else -> WebNovelFilter.Type.全部
                    },
                    filterLevel = when (loc.level) {
                        1 -> WebNovelFilter.Level.一般向
                        2 -> WebNovelFilter.Level.R18
                        else -> WebNovelFilter.Level.全部
                    },
                    filterTranslate = when (loc.translate) {
                        1 -> WebNovelFilter.Translate.GPT3
                        2 -> WebNovelFilter.Translate.Sakura
                        else -> WebNovelFilter.Translate.全部
                    },
                    filterSort = loc.sort,
                    page = loc.page,
                    pageSize = loc.pageSize
                )
            }
        }
        put<UserFavoredWebRes.Id.Novel> { loc ->
            val user = call.user()
            call.tryRespond {
                service.updateFavoredNovel(
                    user = user,
                    favoredId = loc.parent.favoredId,
                    providerId = loc.providerId,
                    novelId = loc.novelId,
                )
            }
        }
        delete<UserFavoredWebRes.Id.Novel> { loc ->
            val user = call.user()
            call.tryRespond {
                service.deleteFavoredNovel(
                    user = user,
                    providerId = loc.providerId,
                    novelId = loc.novelId,
                )
            }
        }
    }
}

class UserFavoredWebApi(
    private val userFavoredRepo: UserFavoredRepository,
    private val favoredRepo: WebNovelFavoredRepository,
    private val metadataRepo: WebNovelMetadataRepository,
) {
    suspend fun createFavored(
        user: User,
        title: String,
    ): String {
        if (title.length > 20) throwBadRequest("收藏夹标题至多为20个字符")

        val (favoredWeb) = userFavoredRepo.getFavoredList(user.id)!!
        if (favoredWeb.size >= 20) throwBadRequest("收藏夹最多只能创建20个")

        val newFavoredWeb = favoredWeb.toMutableList()
        val id = UUID.randomUUID().toString()
        newFavoredWeb.add(UserFavored(id = id, title = title))

        userFavoredRepo.updateFavoredWeb(
            userId = user.id,
            favored = newFavoredWeb,
        )
        return id
    }

    suspend fun updateFavored(
        user: User,
        favoredId: String,
        title: String,
    ) {
        if (title.length > 20) throwBadRequest("收藏夹标题至多为20个字符")

        val (favoredWeb) = userFavoredRepo.getFavoredList(user.id)!!

        userFavoredRepo.updateFavoredWeb(
            userId = user.id,
            favored = favoredWeb.map {
                if (it.id == favoredId) it.copy(title = title) else it
            },
        )
    }

    suspend fun deleteFavored(
        user: User,
        favoredId: String,
    ) {
        if (favoredId == "default") throwBadRequest("不可以删除默认收藏夹")

        val (favoredWeb) = userFavoredRepo.getFavoredList(user.id)!!

        userFavoredRepo.updateFavoredWeb(
            userId = user.id,
            favored = favoredWeb.filter { it.id != favoredId },
        )
    }

    suspend fun listFavoredNovel(
        user: User,
        favoredId: String,
        queryString: String?,
        filterProvider: String,
        filterType: WebNovelFilter.Type,
        filterLevel: WebNovelFilter.Level,
        filterTranslate: WebNovelFilter.Translate,
        filterSort: FavoredNovelListSort,
        page: Int,
        pageSize: Int,
    ): Page<WebNovelOutlineDto> {
        validatePageNumber(page)
        validatePageSize(pageSize)
        
        val filterProviderParsed = if (filterProvider.isEmpty()) {
            return emptyPage()
        } else {
            filterProvider.split(",")
        }

        return favoredRepo
            .listFavoredNovel(
                userId = user.id,
                favoredId = favoredId.takeIf { it != "all" },
                queryString = queryString,
                filterProvider = filterProviderParsed,
                filterType = filterType,
                filterLevel = filterLevel,
                filterTranslate = filterTranslate,
                filterSort = filterSort,
                page = page,
                pageSize = pageSize,
            )
            .map { it.asDto() }
    }

    suspend fun updateFavoredNovel(
        user: User,
        favoredId: String,
        providerId: String,
        novelId: String,
    ) {
        val novel = metadataRepo.get(providerId, novelId)
            ?: throwNotFound("小说不存在")

        val total = favoredRepo.countFavoredNovelByUserId(
            userId = user.id,
            favoredId = favoredId,
        )
        if (total >= 5000) {
            throwBadRequest("收藏夹已达到上限")
        }
        favoredRepo.updateFavoredNovel(
            userId = ObjectId(user.id),
            novelId = novel.id,
            favoredId = favoredId,
            updateAt = novel.updateAt,
        )
    }

    suspend fun deleteFavoredNovel(
        user: User,
        providerId: String,
        novelId: String,
    ) {
        val novel = metadataRepo.get(providerId, novelId)
            ?: throwNotFound("小说不存在")
        favoredRepo.deleteFavoredNovel(
            userId = ObjectId(user.id),
            novelId = novel.id,
        )
    }
}
