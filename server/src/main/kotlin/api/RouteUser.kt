package api

import api.plugins.authenticateDb
import api.plugins.user
import infra.user.UserFavoredList
import infra.user.UserFavoredRepository
import io.ktor.resources.*
import io.ktor.server.resources.*
import io.ktor.server.routing.*
import org.koin.ktor.ext.inject

@Resource("/user")
private class UserRes {
    @Resource("/favored")
    class Favored(val parent: UserRes)
}

fun Route.routeUser() {
    val service by inject<UserApi>()

    authenticateDb {
        get<UserRes.Favored> {
            val user = call.user()
            call.tryRespond {
                service.listFavored(user.id)
            }
        }
    }
}

class UserApi(
    private val userFavoredRepo: UserFavoredRepository,
) {
    suspend fun listFavored(userId: String): UserFavoredList {
        return userFavoredRepo.getFavoredList(userId)
            ?: throwNotFound("用户不存在")
    }
}
