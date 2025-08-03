import api.*
import api.plugins.authentication
import api.plugins.contentNegotiation
import api.plugins.rateLimit
import infra.*
import infra.article.ArticleRepository
import infra.comment.CommentRepository
import infra.oplog.OperationHistoryRepository
import infra.web.repository.WebNovelFavoredRepository
import infra.wenku.repository.WenkuNovelFavoredRepository
import infra.web.repository.WebNovelReadHistoryRepository
import infra.user.UserRepository
import infra.user.UserFavoredRepository
import infra.web.datasource.WebNovelHttpDataSource
import infra.web.repository.WebNovelChapterRepository
import infra.web.repository.WebNovelFileRepository
import infra.web.repository.WebNovelMetadataRepository
import infra.web.datasource.WebNovelEsDataSource
import infra.wenku.datasource.WenkuNovelEsDataSource
import infra.wenku.datasource.WenkuNovelVolumeDiskDataSource
import infra.wenku.repository.WenkuNovelMetadataRepository
import infra.wenku.repository.WenkuNovelVolumeRepository
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.plugins.cachingheaders.*
import io.ktor.server.plugins.calllogging.*
import io.ktor.server.plugins.statuspages.*
import io.ktor.server.request.*
import io.ktor.server.resources.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import org.koin.core.module.dsl.singleOf
import org.koin.dsl.module
import org.koin.ktor.plugin.Koin
import org.koin.logger.slf4jLogger

private fun env(name: String): String? =
    System.getenv(name)

private fun envNotNull(name: String): String =
    System.getenv(name) ?: ""

private fun envDbHost(name: String) =
    env(name) ?: env("DB_HOST_TEST") ?: "localhost"

private fun envDbPort(name: String) =
    env(name)?.toIntOrNull()


fun main() {
    embeddedServer(Netty, 8081) {
        install(Koin) {
            slf4jLogger()
            modules(appModule)
        }
        authentication(secret = envNotNull("JWT_SECRET"))
        rateLimit()
        install(Resources)
        install(CachingHeaders)
        contentNegotiation()
        install(CallLogging) {
            format { call ->
                val status = call.response.status()
                val httpMethod = call.request.httpMethod.value
                val uri = call.request.uri
                "$httpMethod-$status $uri"
            }
        }
        install(StatusPages) {
            exception<Throwable> { call, cause ->
                val httpMethod = call.request.httpMethod.value
                val uri = call.request.uri
                call.application.environment.log.error("未捕获异常 $httpMethod-$uri:", cause)
                call.respondText(text = "500: $cause", status = HttpStatusCode.InternalServerError)
            }
        }

        routing {
            routeArticle()
            routeComment()
            routeOperationHistory()
            //
            routeUser()
            routeUserFavoredWeb()
            routeUserFavoredWenku()
            routeUserReadHistoryWeb()
            //
            routeWebNovel()
            routeWenkuNovel()
        }
    }.start(wait = true)
}

val appModule = module {
    // Data layer: Client
    single {
        MongoClient(
            host = envDbHost("DB_HOST_MONGO"),
            port = envDbPort("DB_PORT_MONGO"),
        )
    }
    single {
        elasticSearchClient(
            host = envDbHost("DB_HOST_ES"),
            port = envDbPort("DB_PORT_ES"),
        )
    }
    single {
        redisClient(
            host = envDbHost("DB_HOST_REDIS"),
            port = envDbPort("DB_PORT_REDIS"),
        )
    }
    singleOf(::TempFileClient)

    // Data layer: Data Source
    singleOf(::WebNovelEsDataSource)
    single {
        WebNovelHttpDataSource(
            httpsProxy = env("HTTPS_PROXY"),
            hamelnToken = env("HAMELN_TOKEN"),
            pixivPhpsessid = env("PIXIV_COOKIE_PHPSESSID"),
        )
    }

    singleOf(::WenkuNovelEsDataSource)
    singleOf(::WenkuNovelVolumeDiskDataSource)

    // Data layer: Repository
    singleOf(::ArticleRepository)
    singleOf(::CommentRepository)
    singleOf(::OperationHistoryRepository)

    singleOf(::UserRepository)
    singleOf(::UserFavoredRepository)
    singleOf(::WebNovelMetadataRepository)
    singleOf(::WebNovelChapterRepository)
    singleOf(::WebNovelFileRepository)
    singleOf(::WebNovelFavoredRepository)
    singleOf(::WebNovelReadHistoryRepository)

    singleOf(::WenkuNovelMetadataRepository)
    singleOf(::WenkuNovelVolumeRepository)
    singleOf(::WenkuNovelFavoredRepository)

    // App Layer
    singleOf(::ArticleApi)
    singleOf(::CommentApi)
    singleOf(::OperationHistoryApi)

    singleOf(::UserApi)
    singleOf(::UserFavoredWebApi)
    singleOf(::UserFavoredWenkuApi)
    singleOf(::UserReadHistoryWebApi)

    singleOf(::WebNovelApi)
    singleOf(::WebNovelTranslateV2Api)
    singleOf(::WenkuNovelApi)
    singleOf(::WenkuNovelTranslateV2Api)
}
