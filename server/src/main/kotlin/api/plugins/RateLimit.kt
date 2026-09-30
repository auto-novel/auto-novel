package api.plugins

import io.ktor.server.application.*
import io.ktor.server.plugins.ratelimit.*
import kotlin.time.Duration.Companion.minutes

object RateLimitNames {
    val CreateSakuraJob = RateLimitName("create-sakura-job")
    val CreateWenkuNovel = RateLimitName("create-wenku-novel")
    val CreateWenkuVolume = RateLimitName("create-wenku-volume")
}

fun Application.rateLimit() = install(RateLimit) {
    register(RateLimitNames.CreateSakuraJob) {
        rateLimiter(limit = 5, refillPeriod = 1.minutes)
        requestKey { call -> call.user().id }
    }
    register(RateLimitNames.CreateWenkuNovel) {
        rateLimiter { call, _ ->
            val limit = if (call.user().role atLeast UserRole.Trusted) 2_000 else 100
            RateLimiter.default(limit = limit, refillPeriod = 1.days)
        }
        requestKey { call -> call.user().id }
    }
    register(RateLimitNames.CreateWenkuVolume) {
        rateLimiter { call, _ ->
            val limit = if (call.user().role atLeast UserRole.Trusted) 10_000 else 500
            RateLimiter.default(limit = limit, refillPeriod = 1.days)
        }
        requestKey { call -> call.user().id }
    }
}
