package api

import api.plugins.authenticateDb
import io.ktor.client.HttpClient
import io.ktor.client.engine.java.Java
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.HttpRequestTimeoutException
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.utils.io.*
import kotlinx.coroutines.CancellationException
import kotlinx.io.readByteArray
import java.io.IOException

private const val GO_CHAT_URL = "https://opencode.ai/inference/go/openai/v1/chat/completions"
private const val MAX_REQUEST_BYTES = 2 * 1024 * 1024
private const val SESSION_HEADER = "x-opencode-session"
private const val KEY_HEADER = "x-opencode-key"

fun Route.routeOpenCodeGo() {
    // 独立客户端：不加载 Cookie、日志或服务端凭据，不跟随携带 Key 的重定向。
    val client = HttpClient(Java) {
        followRedirects = false
        expectSuccess = false
        install(HttpTimeout) {
            connectTimeoutMillis = 15_000
            requestTimeoutMillis = 10 * 60_000
            socketTimeoutMillis = 10 * 60_000
        }
    }
    application.monitor.subscribe(ApplicationStopped) { client.close() }
    authenticateDb { openCodeGoRoutes(client) }
}

/** 调用方必须置于认证路由内；单独拆出便于无数据库的传输测试。 */
internal fun Route.openCodeGoRoutes(client: HttpClient) {
    post("/translator/opencode-go/chat/completions") {
        val key = call.request.headers[KEY_HEADER]
        val session = call.request.headers[SESSION_HEADER]
        if (key.isNullOrBlank() || key.length > 4096 || key.any { it <= ' ' || it >= '\u007f' }) {
            call.respondGoError(HttpStatusCode.BadRequest, "OpenCode Go Key 不合法")
            return@post
        }
        if (session == null || !Regex("[A-Za-z0-9_-]{1,128}").matches(session)) {
            call.respondGoError(HttpStatusCode.BadRequest, "OpenCode Go 会话 ID 不合法")
            return@post
        }
        if (!call.request.contentType().match(ContentType.Application.Json)) {
            call.respondGoError(HttpStatusCode.UnsupportedMediaType, "仅接受 JSON 请求")
            return@post
        }
        if ((call.request.contentLength() ?: 0) > MAX_REQUEST_BYTES) {
            call.respondGoError(HttpStatusCode.PayloadTooLarge, "OpenCode Go 请求过大")
            return@post
        }
        val body = call.receiveChannel().readRemaining(MAX_REQUEST_BYTES.toLong() + 1).readByteArray()
        if (body.size > MAX_REQUEST_BYTES) {
            call.respondGoError(HttpStatusCode.PayloadTooLarge, "OpenCode Go 请求过大")
            return@post
        }

        try {
            // 地址固定，不接受调用方 URL；本站 JWT、Cookie 以及其他请求头均不转发。
            client.preparePost(GO_CHAT_URL) {
                bearerAuth(key)
                contentType(ContentType.Application.Json)
                header(HttpHeaders.Accept, "text/event-stream, application/json")
                header(HttpHeaders.UserAgent, "AutoNovel/1.0")
                header(SESSION_HEADER, session)
                setBody(body)
            }.execute { upstream ->
                if (upstream.status.value in 300..399) {
                    call.respondGoError(HttpStatusCode.BadGateway, "OpenCode Go 返回了非预期重定向")
                    return@execute
                }
                call.response.header(HttpHeaders.CacheControl, "no-store")
                call.response.header("X-Accel-Buffering", "no")
                upstream.headers[HttpHeaders.RetryAfter]?.let {
                    call.response.header(HttpHeaders.RetryAfter, it)
                }
                // 原样流式转发 SSE/JSON，包括错误状态；不解析或缓存模型正文。
                call.respondBytesWriter(
                    contentType = upstream.contentType() ?: ContentType.Application.Json,
                    status = upstream.status,
                ) {
                    val source = upstream.bodyAsChannel()
                    val buffer = ByteArray(8192)
                    while (true) {
                        val count = source.readAvailable(buffer)
                        if (count < 0) break
                        writeFully(buffer, 0, count)
                        flush()
                    }
                }
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: HttpRequestTimeoutException) {
            if (!call.response.isCommitted) {
                call.respondGoError(HttpStatusCode.GatewayTimeout, "OpenCode Go 请求超时")
            }
        } catch (error: IOException) {
            // 不把可能含请求信息的异常写入日志或返回给客户端。
            if (!call.response.isCommitted) {
                call.respondGoError(HttpStatusCode.BadGateway, "无法连接 OpenCode Go")
            }
        }
    }
}

private suspend fun ApplicationCall.respondGoError(status: HttpStatusCode, message: String) {
    response.header(HttpHeaders.CacheControl, "no-store")
    respondText("{\"error\":{\"message\":\"$message\"}}", ContentType.Application.Json, status)
}
