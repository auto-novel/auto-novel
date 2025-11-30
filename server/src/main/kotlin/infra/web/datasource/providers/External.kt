package infra.web.datasource.providers

import infra.common.Page
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.http.appendPathSegments


class External(
    val providerId: String,
    private val client: HttpClient,
    private val baseUrl: String = "http://localhost:3000",
): WebNovelProvider {
    override suspend fun getRank(options: Map<String, String>): Page<RemoteNovelListItem> {
        return client.get(baseUrl) {
            url {
                appendPathSegments(providerId, "rank")
                options.forEach { (key, value) -> parameters.append(key, value)}
            }

        }.body()
    }

    override suspend fun getMetadata(novelId: String): RemoteNovelMetadata {
        return client.get(baseUrl){
            url {
                appendPathSegments(providerId, "novel", novelId)
            }
        }.body();
    }

    override suspend fun getChapter(
        novelId: String,
        chapterId: String
    ): RemoteChapter {
        return client.get(baseUrl){
            url {
                appendPathSegments(providerId, "chapter", novelId, chapterId)
            }
        }.body();
    }
}