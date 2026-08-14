package infra.web.repository

import infra.web.WebNovelAttention
import infra.web.WebNovelType
import io.kotest.core.spec.style.DescribeSpec
import io.kotest.matchers.shouldBe
import kotlinx.datetime.Instant

class WebNovelFavoredRepositoryTest : DescribeSpec({
    describe("FavoredNovelLookup.toOutline") {
        it("只根据 chapterId 统计章节数，忽略 null 条目") {
            val novel = FavoredNovelLookup(
                providerId = "syosetu",
                novelId = "n1234",
                titleJp = "テスト",
                titleZh = "测试",
                type = WebNovelType.连载中,
                attentions = listOf(WebNovelAttention.R18),
                keywords = listOf("奇幻"),
                toc = listOf(
                    FavoredNovelTocLookup(chapterId = "1"),
                    FavoredNovelTocLookup(chapterId = null),
                    FavoredNovelTocLookup(chapterId = "2"),
                ),
                jp = 1,
                baidu = 2,
                youdao = 3,
                gpt = 4,
                sakura = 5,
                updateAt = Instant.fromEpochSeconds(1_700_000_000),
            )

            val outline = novel.toOutline(favored = "default")

            outline.providerId shouldBe "syosetu"
            outline.novelId shouldBe "n1234"
            outline.titleJp shouldBe "テスト"
            outline.titleZh shouldBe "测试"
            outline.type shouldBe WebNovelType.连载中
            outline.attentions shouldBe listOf(WebNovelAttention.R18)
            outline.keywords shouldBe listOf("奇幻")
            outline.favored shouldBe "default"
            outline.total shouldBe 2
            outline.jp shouldBe 1
            outline.baidu shouldBe 2
            outline.youdao shouldBe 3
            outline.gpt shouldBe 4
            outline.sakura shouldBe 5
            outline.updateAt shouldBe Instant.fromEpochSeconds(1_700_000_000)
        }

        it("favored 为 null 时不写入收藏夹信息") {
            val novel = FavoredNovelLookup(
                providerId = "kakuyomu",
                novelId = "works/1",
                titleJp = "作品",
            )

            novel.toOutline(favored = null).favored shouldBe null
        }
    }
})
