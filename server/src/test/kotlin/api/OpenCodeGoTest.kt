package api

import io.kotest.core.spec.style.FunSpec
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldNotContain
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.*
import io.ktor.client.engine.java.Java
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.http.content.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.routing.*
import io.ktor.server.testing.*
import io.ktor.utils.io.*
import kotlinx.coroutines.*
import kotlinx.io.readByteArray
import java.io.IOException

private const val ROUTE = "/translator/opencode-go/chat/completions"
private const val BODY = """{"model":"deepseek-v4.1-flash","messages":[{"role":"user","content":"test"}],"stream":true,"reasoning_effort":"high"}"""

private fun ApplicationTestBuilder.relay(upstream: HttpClient) {
    application { relayModule(upstream) }
}

private fun Application.relayModule(upstream: HttpClient) {
    install(Authentication) {
        bearer("test") {
            authenticate { if (it.token == "site-token") UserIdPrincipal("member") else null }
        }
    }
    routing { authenticate("test") { openCodeGoRoutes(upstream) } }
}

private fun HttpRequestBuilder.goRequest() {
    bearerAuth("site-token")
    header("x-opencode-key", "go-secret")
    header("x-opencode-session", "session-123")
    contentType(ContentType.Application.Json)
    setBody(BODY)
}

class OpenCodeGoTest : FunSpec({
    test("转发到固定官方端点，隔离本站凭据并原样返回 SSE") {
        val sse = "data: {\"choices\":[{\"delta\":{\"content\":\"译文\"}}]}\n\ndata: [DONE]\n\n"
        val engine = MockEngine { request ->
            request.url.toString().shouldBe("https://opencode.ai/inference/go/openai/v1/chat/completions")
            request.method.shouldBe(HttpMethod.Post)
            request.headers[HttpHeaders.Authorization].shouldBe("Bearer go-secret")
            request.headers["x-opencode-session"].shouldBe("session-123")
            request.headers[HttpHeaders.UserAgent].shouldBe("AutoNovel/1.0")
            request.headers[HttpHeaders.Cookie].shouldBe(null)
            request.headers["x-unrelated"].shouldBe(null)
            request.body.toByteArray().decodeToString().shouldBe(BODY)
            respond(
                sse,
                headers = headersOf(
                    HttpHeaders.ContentType to listOf("text/event-stream"),
                    "X-OpenCode-Log-Id" to listOf("log-test"),
                ),
            )
        }
        HttpClient(engine).use { upstream ->
            testApplication {
                relay(upstream)
                val response = client.post("$ROUTE?url=https://evil.test") {
                    goRequest()
                    header(HttpHeaders.Cookie, "site-cookie=private")
                    header("x-unrelated", "private")
                }
                response.status.shouldBe(HttpStatusCode.OK)
                response.bodyAsText().shouldBe(sse)
                response.headers[HttpHeaders.CacheControl].shouldBe("no-store")
                response.headers["X-Accel-Buffering"].shouldBe("no")
                response.headers["X-OpenCode-Log-Id"].shouldBe("log-test")
            }
        }
    }

    test("未登录不会调用上游") {
        var calls = 0
        HttpClient(MockEngine { calls++; error("must not send") }).use { upstream ->
            testApplication {
                relay(upstream)
                client.post(ROUTE).status.shouldBe(HttpStatusCode.Unauthorized)
                calls.shouldBe(0)
            }
        }
    }

    test("上游尚未结束时即转发首个 SSE 事件") {
        withTimeout(10_000) {
            coroutineScope {
                val channel = ByteChannel(autoFlush = true)
                val finish = CompletableDeferred<Unit>()
                val writer = launch(Dispatchers.Default) {
                    try {
                        channel.writeStringUtf8("data: first\n\n")
                        finish.await()
                        channel.writeStringUtf8("data: [DONE]\n\n")
                    } finally {
                        channel.close()
                    }
                }
                try {
                    HttpClient(MockEngine {
                        respond(channel, headers = headersOf(HttpHeaders.ContentType, "text/event-stream"))
                    }).use { upstream ->
                        // 使用真实 TCP 验证 SSE 首包，避免内存测试客户端影响流式验证。
                        val server = embeddedServer(Netty, host = "127.0.0.1", port = 0) {
                            relayModule(upstream)
                        }.start(wait = false)
                        try {
                            val port = server.engine.resolvedConnectors().first().port
                            HttpClient(Java).use { browser ->
                                browser.preparePost("http://127.0.0.1:$port$ROUTE") { goRequest() }.execute { response ->
                                    val stream = response.bodyAsChannel()
                                    stream.readUTF8Line().shouldBe("data: first")
                                    finish.complete(Unit)
                                    stream.readRemaining().readByteArray().decodeToString()
                                        .shouldBe("\ndata: [DONE]\n\n")
                                }
                            }
                        } finally {
                            server.stop(0, 1000)
                        }
                    }
                } finally {
                    finish.complete(Unit)
                    writer.cancelAndJoin()
                }
            }
        }
    }

    test("拒绝缺少 Key、会话、错误类型及过大请求") {
        var calls = 0
        HttpClient(MockEngine { calls++; error("must not send") }).use { upstream ->
            testApplication {
                relay(upstream)
                client.post(ROUTE) {
                    goRequest()
                    headers.remove("x-opencode-key")
                }.status.shouldBe(HttpStatusCode.BadRequest)
                client.post(ROUTE) {
                    goRequest()
                    headers.remove("x-opencode-session")
                }.status.shouldBe(HttpStatusCode.BadRequest)
                client.post(ROUTE) {
                    goRequest()
                    headers["x-opencode-session"] = "invalid session"
                }.status.shouldBe(HttpStatusCode.BadRequest)
                client.post(ROUTE) {
                    goRequest()
                    contentType(ContentType.Text.Plain)
                }.status.shouldBe(HttpStatusCode.UnsupportedMediaType)
                client.post(ROUTE) {
                    goRequest()
                    setBody(" ".repeat(2 * 1024 * 1024 + 1))
                }.status.shouldBe(HttpStatusCode.PayloadTooLarge)
                client.post(ROUTE) {
                    goRequest()
                    setBody(object : OutgoingContent.ReadChannelContent() {
                        override val contentType = ContentType.Application.Json
                        override fun readFrom() = ByteReadChannel(ByteArray(2 * 1024 * 1024 + 1))
                    })
                }.status.shouldBe(HttpStatusCode.PayloadTooLarge)
                calls.shouldBe(0)
            }
        }
    }

    test("保留限流状态、Retry-After 和错误 JSON，不附加本站认证挑战") {
        val body = """{"error":{"message":"rate limited"}}"""
        HttpClient(MockEngine {
            respond(body, HttpStatusCode.TooManyRequests, headersOf(
                HttpHeaders.ContentType to listOf("application/json"),
                HttpHeaders.RetryAfter to listOf("30"),
                HttpHeaders.WWWAuthenticate to listOf("Bearer"),
                HttpHeaders.SetCookie to listOf("upstream=private"),
            ))
        }).use { upstream ->
            testApplication {
                relay(upstream)
                val response = client.post(ROUTE) { goRequest() }
                response.status.shouldBe(HttpStatusCode.TooManyRequests)
                response.bodyAsText().shouldBe(body)
                response.headers[HttpHeaders.RetryAfter].shouldBe("30")
                response.headers[HttpHeaders.WWWAuthenticate].shouldBe(null)
                response.headers[HttpHeaders.SetCookie].shouldBe(null)
            }
        }
    }

    test("不把重定向返回浏览器或把 Key 发往其他地址") {
        var calls = 0
        HttpClient(MockEngine {
            calls++
            respond("", HttpStatusCode.TemporaryRedirect, headersOf(HttpHeaders.Location, "https://evil.test"))
        }) { followRedirects = false }.use { upstream ->
            testApplication {
                relay(upstream)
                val response = client.post(ROUTE) { goRequest() }
                response.status.shouldBe(HttpStatusCode.BadGateway)
                response.headers[HttpHeaders.Location].shouldBe(null)
                calls.shouldBe(1)
            }
        }
    }

    test("网络故障返回通用错误，不泄露请求或凭据") {
        HttpClient(MockEngine { throw IOException("request contains go-secret site-token") }).use { upstream ->
            testApplication {
                relay(upstream)
                val response = client.post(ROUTE) { goRequest() }
                response.status.shouldBe(HttpStatusCode.BadGateway)
                response.bodyAsText().shouldNotContain("go-secret")
                response.bodyAsText().shouldNotContain("site-token")
            }
        }
    }
})
