package util

/** raw 保留全文语法，tag 保存解码后的标签值；excluded 仅表示标签排除。 */
data class SearchQueryToken(
    val raw: String,
    val tag: String? = null,
    val excluded: Boolean = false,
)

/**
 * 只在双引号外按空白分词，单次扫描 O(n)，不解释 author: 等字段前缀。
 * 未闭合的引号延续到输入末尾，原始片段仍交给现有搜索逻辑处理。
 */
fun parseSearchQuery(input: String): List<SearchQueryToken> {
    val tokens = mutableListOf<SearchQueryToken>()
    val decoded = StringBuilder()
    var start = -1
    var quoted = false
    var tagMarker = false
    var index = 0

    fun finishToken(end: Int) {
        if (start < 0) return
        // 引号内的前导负号属于标签名，不表示排除条件。
        val excluded = tagMarker && input[start] == '-'
        tokens.add(
            SearchQueryToken(
                raw = input.substring(start, end),
                tag = if (tagMarker) {
                    decoded.substring(if (excluded) 1 else 0, decoded.length - 1)
                } else null,
                excluded = excluded,
            )
        )
        start = -1
        decoded.setLength(0)
        tagMarker = false
    }

    while (index < input.length) {
        val char = input[index]
        if (char.isWhitespace() && !quoted) {
            finishToken(index)
            index++
            continue
        }
        if (start < 0) start = index

        val next = input.getOrNull(index + 1)
        when {
            // 仅解码引号和反斜杠，未知转义按原文保留。
            char == '\\' && (next == '"' || next == '\\') -> {
                decoded.append(next)
                tagMarker = false
                index += 2
            }

            char == '"' -> {
                quoted = !quoted
                tagMarker = false
                index++
            }

            else -> {
                decoded.append(char)
                // 只有片段最后一个字符是引号外的 '$'，才提取为标签。
                tagMarker = char == '$' && !quoted
                index++
            }
        }
    }
    finishToken(input.length)
    return tokens
}
