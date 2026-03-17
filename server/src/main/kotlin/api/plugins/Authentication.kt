package api.plugins

import api.throwUnauthorized
import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import infra.user.UserRepository
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.util.*
import kotlinx.datetime.Clock
import org.koin.ktor.ext.get
import kotlin.time.Duration.Companion.days
import kotlinx.datetime.Instant
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class UserRole {
    @SerialName("admin")
    Admin,

    @SerialName("trusted")
    Trusted,

    @SerialName("member")
    Member,

    @SerialName("restricted")
    Restricted,

    @SerialName("banned")
    Banned;

    private fun authLevel() = when (this) {
        Admin -> 4
        Trusted -> 3
        Member -> 2
        Restricted -> 1
        Banned -> 0
    }

    infix fun atLeast(other: UserRole): Boolean =
        authLevel() >= other.authLevel()
}

data class User(
    val id: String,
    val username: String,
    val role: UserRole,
    val createdAt: Instant,
)

fun Application.authentication(secret: String) = install(Authentication) {
    jwt {
        verifier(
            JWT.require(Algorithm.HMAC256(secret.ifBlank { "a-string-secret-at-least-256-bits-long" })).build()
        )
        validate { credential ->
            if (credential.subject != null) {
                JWTPrincipal(credential.payload)
            } else {
                null
            }
        }
        challenge { _, _ ->
            call.respond(HttpStatusCode.Unauthorized, "Token不合法或者过期")
        }
    }
}

fun ApplicationCall.user(): User =
    attributes[AuthenticatedUserKey]

fun ApplicationCall.userOrNull(): User? =
    attributes.getOrNull(AuthenticatedUserKey)

private fun User.atLeast(role: UserRole) =
    this.role atLeast role

private fun User.createAtLeast(days: Int): Boolean =
    Clock.System.now() - createdAt >= days.days

suspend fun User.checkCustomRule(block: suspend () -> Boolean): Boolean =
    atLeast(UserRole.Admin) || block()

fun User.requireAdmin() {
    if (!atLeast(UserRole.Admin)) {
        throwUnauthorized("当前账户没有权限执行此操作")
    }
}

fun User?.requireNsfwAccess() {
    if (this == null) {
        throwUnauthorized("游客没有权限执行此操作")
    } else if (!createAtLeast(30)) {
        throwUnauthorized("你还太年轻了")
    }
}

fun User.requireForumAccess() {
    if (!atLeast(UserRole.Member)) {
        throwUnauthorized("当前账户没有权限执行此操作")
    }
}

fun User.requireNovelAccess() {
    if (!atLeast(UserRole.Member)) {
        throwUnauthorized("当前账户没有权限执行此操作")
    } else if (!createAtLeast(30)) {
        throwUnauthorized("你还太年轻了")
    }
}

fun Route.authenticateDb(
    optional: Boolean = false,
    build: Route.() -> Unit,
): Route {
    return authenticate(
        strategy = if (optional) AuthenticationStrategy.Optional else AuthenticationStrategy.FirstSuccessful,
        build = build,
    ).apply {
        install(PostAuthenticationInterceptors)
    }
}

private val AuthenticatedUserKey = AttributeKey<User>("AuthenticatedUserKey")

private val PostAuthenticationInterceptors = createRouteScopedPlugin(name = "User Validator") {
    val userRepo = application.get<UserRepository>()

    on(AuthenticationChecked) { call ->
        call.principal<JWTPrincipal>()?.let { principal ->
            val user = User(
                id = userRepo.getId(principal.subject!!),
                username = principal.subject!!,
                role = when (principal["role"]) {
                    "admin" -> UserRole.Admin
                    "trusted" -> UserRole.Trusted
                    "member" -> UserRole.Member
                    "restricted" -> UserRole.Restricted
                    else -> UserRole.Banned
                },
                createdAt = Instant.fromEpochSeconds(
                    principal.getClaim("crat", Long::class)!!
                ),
            )
            if (user.role === UserRole.Banned) {
                call.respond(HttpStatusCode.Unauthorized, "用户已被封禁")
            } else {
                call.attributes.put(AuthenticatedUserKey, user)
            }
        }
    }
}
