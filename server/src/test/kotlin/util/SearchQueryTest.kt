package util

import io.kotest.core.spec.style.DescribeSpec
import io.kotest.matchers.shouldBe
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class SearchQueryTest : DescribeSpec({
    describe("parseSearchQuery") {
        val cases = Json.parseToJsonElement(
            requireNotNull(SearchQueryTest::class.java.getResource("/search-query-cases.json"))
                .readText()
        ).jsonArray

        cases.forEach { element ->
            val case = element.jsonObject
            it(case.getValue("name").jsonPrimitive.content) {
                val expected = case.getValue("tokens").jsonArray.map { tokenElement ->
                    val token = tokenElement.jsonArray
                    SearchQueryToken(
                        raw = token[0].jsonPrimitive.content,
                        tag = token[1].takeUnless { it == JsonNull }
                            ?.jsonPrimitive?.content,
                        excluded = token[2].jsonPrimitive.boolean,
                    )
                }

                parseSearchQuery(case.getValue("input").jsonPrimitive.content) shouldBe expected
            }
        }
    }
})
