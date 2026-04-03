package infra.common

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class TranslatorId {
    @SerialName("baidu")
    Baidu,

    @SerialName("youdao")
    Youdao,

    @SerialName("gpt")
    Gpt,

    @SerialName("sakura")
    Sakura,

    @SerialName("murasaki")
    Murasaki,
}

data class Glossary(
    val id: String,
    val map: Map<String, String>,
)