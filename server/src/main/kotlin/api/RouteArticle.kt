package api

import api.plugins.*
import infra.article.ArticleCategory
import infra.article.ArticleRepository
import infra.article.ArticleListItem
import infra.article.Article
import infra.comment.CommentRepository
import infra.common.Page
import infra.user.UserOutline
import io.ktor.resources.*
import io.ktor.server.plugins.ratelimit.*
import io.ktor.server.request.*
import io.ktor.server.resources.*
import io.ktor.server.resources.post
import io.ktor.server.resources.put
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import org.koin.ktor.ext.inject

@Resource("/article")
private class ArticleRes {
    @Resource("")
    class List(
        val parent: ArticleRes,
        val page: Int,
        val pageSize: Int,
        val category: ArticleCategory,
    )

    @Resource("/{id}")
    class Id(val parent: ArticleRes, val id: String) {
        @Resource("/locked")
        class Locked(val parent: Id)

        @Resource("/pinned")
        class Pinned(val parent: Id)

        @Resource("/hidden")
        class Hidden(val parent: Id)
    }
}

fun Route.routeArticle() {
    val service by inject<ArticleApi>()

    authenticateDb(optional = true) {
        get<ArticleRes.List> { loc ->
            val user = call.userOrNull()
            call.tryRespond {
                service.listArticle(
                    user = user,
                    page = loc.page,
                    pageSize = loc.pageSize,
                    category = loc.category,
                )
            }
        }

        get<ArticleRes.Id> { loc ->
            val user = call.userOrNull()
            call.tryRespond {
                service.getArticle(user = user, id = loc.id)
            }
        }
    }

    authenticateDb {
        @Serializable
        class ArticleBody(
            val title: String,
            val content: String,
            val category: ArticleCategory,
        )
        rateLimit(RateLimitNames.CreateArticle) {
            post<ArticleRes> {
                val user = call.user()
                val body = call.receive<ArticleBody>()
                call.tryRespond {
                    service.createArticle(
                        user = user,
                        title = body.title,
                        content = body.content,
                        category = body.category,
                    )
                }
            }
        }
        put<ArticleRes.Id> { loc ->
            val user = call.user()
            val body = call.receive<ArticleBody>()
            call.tryRespond {
                service.updateArticle(
                    user = user,
                    id = loc.id,
                    title = body.title,
                    content = body.content,
                    category = body.category,
                )
            }
        }
        delete<ArticleRes.Id> { loc ->
            val user = call.user()
            call.tryRespond {
                service.deleteArticle(user = user, id = loc.id)
            }
        }

        put<ArticleRes.Id.Locked> { loc ->
            val user = call.user()
            call.tryRespond {
                service.updateArticleLocked(user = user, id = loc.parent.id, locked = true)
            }
        }
        delete<ArticleRes.Id.Locked> { loc ->
            val user = call.user()
            call.tryRespond {
                service.updateArticleLocked(user = user, id = loc.parent.id, locked = false)
            }
        }

        put<ArticleRes.Id.Pinned> { loc ->
            val user = call.user()
            call.tryRespond {
                service.updateArticlePinned(user = user, id = loc.parent.id, pinned = true)
            }
        }
        delete<ArticleRes.Id.Pinned> { loc ->
            val user = call.user()
            call.tryRespond {
                service.updateArticlePinned(user = user, id = loc.parent.id, pinned = false)
            }
        }

        put<ArticleRes.Id.Hidden> { loc ->
            val user = call.user()
            call.tryRespond {
                service.updateArticleHidden(user = user, id = loc.parent.id, hidden = true)
            }
        }
        delete<ArticleRes.Id.Hidden> { loc ->
            val user = call.user()
            call.tryRespond {
                service.updateArticleHidden(user = user, id = loc.parent.id, hidden = false)
            }
        }
    }
}

class ArticleApi(
    private val articleRepo: ArticleRepository,
    private val commentRepo: CommentRepository,
) {
    @Serializable
    data class ArticleSimplifiedDto(
        val id: String,
        val title: String,
        val category: ArticleCategory,
        val locked: Boolean,
        val pinned: Boolean,
        val hidden: Boolean,
        val numViews: Int,
        val numComments: Int,
        val user: UserOutline,
        val createAt: Long,
        val updateAt: Long,
    )

    private fun ArticleListItem.asDto(
        ignoreHidden: Boolean,
    ) =
        ArticleSimplifiedDto(
            id = id,
            title = if (ignoreHidden || !hidden) title else "",
            category = category,
            locked = locked,
            pinned = pinned,
            hidden = hidden,
            numViews = numViews,
            numComments = numComments,
            user = user,
            createAt = createAt.epochSeconds,
            updateAt = updateAt.epochSeconds,
        )

    suspend fun listArticle(
        user: User?,
        page: Int,
        pageSize: Int,
        category: ArticleCategory,
    ): Page<ArticleSimplifiedDto> {
        validatePageNumber(page)
        validatePageSize(pageSize)

        val ignoreHidden = user != null && user.role atLeast UserRole.Admin

        return articleRepo
            .listArticle(
                page = page,
                pageSize = pageSize,
                category = category,
            )
            .map { it.asDto(ignoreHidden) }
    }

    private fun throwArticleNotFound(): Nothing =
        throwNotFound("文章不存在")

    @Serializable
    data class ArticleDto(
        val id: String,
        val title: String,
        val content: String,
        val category: ArticleCategory,
        val locked: Boolean,
        val pinned: Boolean,
        val hidden: Boolean,
        val numViews: Int,
        val numComments: Int,
        val user: UserOutline,
        val createAt: Long,
        val updateAt: Long,
    )

    private fun Article.asDto(
        ignoreHidden: Boolean,
    ) =
        ArticleDto(
            id = id,
            title = if (ignoreHidden || !hidden) title else "",
            content = if (ignoreHidden || !hidden) content else "",
            category = category,
            locked = locked,
            pinned = pinned,
            hidden = hidden,
            numViews = numViews,
            numComments = numComments,
            user = user,
            createAt = createAt.epochSeconds,
            updateAt = updateAt.epochSeconds,
        )

    suspend fun getArticle(
        user: User?,
        id: String,
    ): ArticleDto {
        val ignoreHidden = user != null && user.role atLeast UserRole.Admin

        val article = articleRepo.getArticle(id)
            ?: throwArticleNotFound()

        if (user != null) {
            articleRepo.increaseNumViews(
                userIdOrIp = user.id,
                id = article.id,
            )
        }

        return article.asDto(ignoreHidden)
    }

    private fun validateTitle(title: String) {
        if (title.length < 2) {
            throwBadRequest("标题长度不能少于2个字符")
        } else if (title.length > 80) {
            throwBadRequest("标题长度不能超过80个字符")
        }
    }

    private fun validateContent(content: String) {
        if (content.length < 2) {
            throwBadRequest("内容长度不能少于2个字符")
        } else if (content.length > 20_000) {
            throwBadRequest("内容长度不能超过2万个字符")
        }
    }

    suspend fun createArticle(
        user: User,
        title: String,
        content: String,
        category: ArticleCategory,
    ): String {
        validateTitle(title)
        validateContent(content)
        user.requireForumAccess()

        val articleId = articleRepo.createArticle(
            title = title,
            content = content,
            category = category,
            userId = user.id,
        )
        return articleId.toHexString()
    }

    suspend fun updateArticle(
        user: User,
        id: String,
        title: String,
        content: String,
        category: ArticleCategory,
    ) {
        validateTitle(title)
        validateContent(content)
        user.requireForumAccess()
        if (!user.checkCustomRule { articleRepo.isArticleCreateBy(id = id, userId = user.id) }) {
            throwUnauthorized("没有权限编辑当前文章")
        }

        articleRepo.updateTitleAndContent(
            id = id,
            title = title,
            content = content,
            category = category,
        )
    }

    suspend fun deleteArticle(
        user: User,
        id: String,
    ) {
        user.requireAdmin()
        val isDeleted = articleRepo.deleteArticle(id = id)
        if (!isDeleted) throwArticleNotFound()
        commentRepo.deleteCommentBySite("article-${id}")
    }

    suspend fun updateArticlePinned(
        user: User,
        id: String,
        pinned: Boolean,
    ) {
        user.requireAdmin()
        val isUpdated = articleRepo.updateArticlePinned(id = id, pinned = pinned)
        if (!isUpdated) throwArticleNotFound()
    }

    suspend fun updateArticleLocked(
        user: User,
        id: String,
        locked: Boolean,
    ) {
        user.requireAdmin()
        val isUpdated = articleRepo.updateArticleLocked(id = id, locked = locked)
        if (!isUpdated) throwArticleNotFound()
    }

    suspend fun updateArticleHidden(
        user: User,
        id: String,
        hidden: Boolean,
    ) {
        user.requireAdmin()
        val isUpdated = articleRepo.updateArticleHidden(id = id, hidden = hidden)
        if (!isUpdated) throwArticleNotFound()
    }
}
