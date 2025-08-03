package api

import api.plugins.User
import api.plugins.authenticateDb
import api.plugins.user
import infra.common.FavoredNovelListSort
import infra.common.Page
import infra.user.UserFavored
import infra.user.UserFavoredRepository
import infra.wenku.WenkuNovelListItem
import infra.wenku.repository.WenkuNovelFavoredRepository
import infra.wenku.repository.WenkuNovelMetadataRepository
import io.ktor.resources.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.resources.*
import io.ktor.server.resources.post
import io.ktor.server.resources.put
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import org.bson.types.ObjectId
import org.koin.ktor.ext.inject
import java.util.*

@Resource("/user/favored-wenku")
private class UserFavoredWenkuRes {
    @Resource("/{favoredId}")
    class Id(
        val parent: UserFavoredWenkuRes,
        val favoredId: String,
    ) {
        @Resource("")
        class List(
            val parent: Id,
            val page: Int,
            val pageSize: Int,
            val sort: FavoredNovelListSort,
        )

        @Resource("/{novelId}")
        class Novel(
            val parent: Id,
            val novelId: String,
        )
    }
}

fun Route.routeUserFavoredWenku() {
    val service by inject<UserFavoredWenkuApi>()

    authenticateDb {
        post<UserFavoredWenkuRes> {
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
        put<UserFavoredWenkuRes.Id> { loc ->
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
        delete<UserFavoredWenkuRes.Id> { loc ->
            val user = call.user()
            call.tryRespond {
                service.deleteFavored(
                    user = user,
                    favoredId = loc.favoredId,
                )
            }
        }
        get<UserFavoredWenkuRes.Id.List> { loc ->
            val user = call.user()
            call.tryRespond {
                service.listFavoredNovel(
                    user = user,
                    favoredId = loc.parent.favoredId,
                    page = loc.page,
                    pageSize = loc.pageSize,
                    sort = loc.sort,
                )
            }
        }
        put<UserFavoredWenkuRes.Id.Novel> { loc ->
            val user = call.user()
            call.tryRespond {
                service.updateFavoredNovel(
                    user = user,
                    favoredId = loc.parent.favoredId,
                    novelId = loc.novelId,
                )
            }
        }
        delete<UserFavoredWenkuRes.Id.Novel> { loc ->
            val user = call.user()
            call.tryRespond {
                service.deleteFavoredNovel(
                    user = user,
                    novelId = loc.novelId,
                )
            }
        }
    }
}

class UserFavoredWenkuApi(
    private val userFavoredRepo: UserFavoredRepository,
    private val favoredRepo: WenkuNovelFavoredRepository,
    private val metadataRepo: WenkuNovelMetadataRepository,
) {
    suspend fun createFavored(
        user: User,
        title: String,
    ): String {
        if (title.length > 20) throwBadRequest("收藏夹标题至多为20个字符")

        val (_, favoredWenku) = userFavoredRepo.getFavoredList(user.id)!!
        if (favoredWenku.size >= 20) throwBadRequest("收藏夹最多只能创建20个")

        val newFavoredWenku = favoredWenku.toMutableList()
        val id = UUID.randomUUID().toString()
        newFavoredWenku.add(UserFavored(id = id, title = title))

        userFavoredRepo.updateFavoredWenku(
            userId = user.id,
            favored = newFavoredWenku,
        )
        return id
    }

    suspend fun updateFavored(
        user: User,
        favoredId: String,
        title: String,
    ) {
        if (title.length > 20) throwBadRequest("收藏夹标题至多为20个字符")

        val (_, favoredWenku) = userFavoredRepo.getFavoredList(user.id)!!

        userFavoredRepo.updateFavoredWenku(
            userId = user.id,
            favored = favoredWenku.map {
                if (it.id == favoredId) it.copy(title = title) else it
            },
        )
    }

    suspend fun deleteFavored(
        user: User,
        favoredId: String,
    ) {
        if (favoredId == "default") throwBadRequest("不可以删除默认收藏夹")

        val (_, favoredWenku) = userFavoredRepo.getFavoredList(user.id)!!

        userFavoredRepo.updateFavoredWenku(
            userId = user.id,
            favored = favoredWenku.filter { it.id != favoredId },
        )
    }

    suspend fun listFavoredNovel(
        user: User,
        favoredId: String,
        page: Int,
        pageSize: Int,
        sort: FavoredNovelListSort,
    ): Page<WenkuNovelListItem> {
        validatePageNumber(page)
        validatePageSize(pageSize)
        return favoredRepo
            .listFavoriteWenkuNovel(
                userId = user.id,
                favoredId = favoredId.takeIf { it != "all" },
                page = page,
                pageSize = pageSize,
                sort = sort,
            )
    }

    suspend fun updateFavoredNovel(
        user: User,
        favoredId: String,
        novelId: String,
    ) {
        val novel = metadataRepo.get(novelId)
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
        novelId: String,
    ) {
        if (!metadataRepo.exist(novelId)) {
            throwNotFound("小说不存在")
        }
        favoredRepo.deleteFavoredNovel(
            userId = ObjectId(user.id),
            novelId = ObjectId(novelId),
        )
    }
}
