package infra

import com.jillesvangurp.ktsearch.KtorRestClient
import com.jillesvangurp.ktsearch.Node
import com.jillesvangurp.ktsearch.SearchClient
import com.jillesvangurp.ktsearch.createIndex
import kotlinx.coroutines.runBlocking

typealias ElasticSearchClient = SearchClient

fun elasticSearchClient(host: String, port: Int?) =
    SearchClient(
        KtorRestClient(
            Node(host, port ?: 9200),
        )
    ).apply {
        runBlocking {
            runCatching {
                createIndex(ElasticSearchIndexNames.WEB_NOVEL) {
                    mappings(dynamicEnabled = false) {
                        keyword("providerId")
                        text("titleJp") { analyzer = "icu_analyzer" }
                        text("titleZh") { analyzer = "icu_analyzer" }
                        keyword("authors")
                        keyword("type")
                        keyword("attentions")
                        keyword("keywords")
                        number<Int>("tocSize")
                        number<Int>("visited")
                        bool("hasGpt")
                        bool("hasSakura")
                        bool("hasMurasaki")
                        date("updateAt")
                    }
                }
            }

            runCatching {
                createIndex(ElasticSearchIndexNames.WENKU_NOVEL) {
                    mappings(dynamicEnabled = false) {
                        text("title") { analyzer = "icu_analyzer" }
                        text("titleZh") { analyzer = "icu_analyzer" }
                        keyword("authors")
                        keyword("artists")
                        keyword("keywords")
                        keyword("level")
                        keyword("publisher")
                        keyword("imprint")
                        date("latestPublishAt")
                        date("updateAt")
                    }
                }
            }
        }
    }

object ElasticSearchIndexNames {
    const val WEB_NOVEL = "web.2024-06-10"
    const val WENKU_NOVEL = "wenku.2024-05-15"
}
