package api

import api.plugins.*
import infra.article.ArticleRepository
import infra.comment.CommentRepository
import infra.comment.Comment
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

@Resource("/comment")
private class CommentRes {
    @Resource("")
    class List(
        val parent: CommentRes,
        val site: String,
        val parentId: String? = null,
        val page: Int,
        val pageSize: Int,
    )

    @Resource("/{id}")
    class Id(val parent: CommentRes, val id: String) {
        @Resource("/hidden")
        class Hidden(val parent: Id)
    }
}

fun Route.routeComment() {
    val service by inject<CommentApi>()

    authenticateDb(optional = true) {
        get<CommentRes.List> { loc ->
            call.tryRespond {
                val user = call.userOrNull()
                service.listComment(
                    user = user,
                    postId = loc.site,
                    parentId = loc.parentId,
                    page = loc.page,
                    pageSize = loc.pageSize,
                    replyPageSize = 10,
                    reverse = loc.parentId == null,
                )
            }
        }
    }

    authenticateDb {
        rateLimit(RateLimitNames.CreateComment) {
            post<CommentRes> {
                @Serializable
                class Body(
                    val site: String,
                    val parent: String? = null,
                    val content: String,
                )

                val user = call.user()
                val body = call.receive<Body>()
                call.tryRespond {
                    service.createComment(
                        user = user,
                        site = body.site,
                        parent = body.parent,
                        content = body.content,
                    )
                }
            }
        }

        delete<CommentRes.Id> { loc ->
            val user = call.user()
            call.tryRespond {
                service.deleteComment(user = user, id = loc.id)
            }
        }

        put<CommentRes.Id.Hidden> { loc ->
            val user = call.user()
            call.tryRespond {
                service.updateCommentHidden(user = user, id = loc.parent.id, hidden = true)
            }
        }
        delete<CommentRes.Id.Hidden> { loc ->
            val user = call.user()
            call.tryRespond {
                service.updateCommentHidden(user = user, id = loc.parent.id, hidden = false)
            }
        }
    }
}

class CommentApi(
    private val commentRepo: CommentRepository,
    private val articleRepo: ArticleRepository,
) {
    @Serializable
    data class CommentDto(
        val id: String,
        val user: UserOutline,
        val content: String,
        val hidden: Boolean,
        val createAt: Long,
        val numReplies: Int,
        val replies: List<CommentDto>,
    )

    private fun Comment.asDto(
        replies: List<CommentDto>,
        ignoreHidden: Boolean,
    ) =
        CommentDto(
            id = id,
            user = user,
            content = if (ignoreHidden || !hidden) content else "",
            hidden = hidden,
            createAt = createAt.epochSeconds,
            numReplies = numReplies,
            replies = replies,
        )

    suspend fun listComment(
        user: User?,
        postId: String,
        parentId: String?,
        page: Int,
        pageSize: Int,
        reverse: Boolean,
        replyPageSize: Int,
    ): Page<CommentDto> {
        validatePageNumber(page)
        validatePageSize(pageSize)
        validatePageSize(replyPageSize, max = 20)

        val ignoreHidden = user != null && user.role atLeast UserRole.Admin

        return commentRepo
            .listComment(
                site = postId,
                parent = parentId,
                page = page,
                pageSize = pageSize,
                reverse = reverse,
            )
            .map {
                val replies = if (parentId == null && it.numReplies > 0) {
                    commentRepo.listComment(
                        site = postId,
                        parent = it.id,
                        page = 0,
                        pageSize = replyPageSize,
                    ).items.map {
                        it.asDto(emptyList(), ignoreHidden)
                    }
                } else {
                    emptyList()
                }
                it.asDto(replies, ignoreHidden)
            }
    }

    suspend fun deleteComment(
        user: User,
        id: String,
    ) {
        user.requireForumAccess()
        if (!user.checkCustomRule { commentRepo.isCommentCanRevoke(id = id, userId = user.id) }) {
            throwUnauthorized("没有权限删除当前评论")
        }
        val isDeleted = commentRepo.deleteComment(id)
        if (!isDeleted) throwNotFound("评论不存在")
    }

    suspend fun createComment(
        user: User,
        site: String,
        parent: String?,
        content: String,
    ) {
        if (site.startsWith("article-")) {
            user.requireForumAccess()
        } else {
            user.requireNovelAccess()
        }
        if (content.isBlank()) {
            throwBadRequest("回复内容不能为空")
        }
        if (
            parent != null &&
            !commentRepo.increaseNumReplies(parent)
        ) {
            throwNotFound("回复的评论不存在")
        }

        if (site.startsWith("article-")) {
            articleRepo.increaseNumComments(
                site.removePrefix("article-")
            )
        }
        commentRepo.createComment(
            site = site,
            parent = parent,
            user = user.id,
            content = content,
        )
    }

    private fun throwCommentNotFound(): Nothing =
        throwNotFound("评论不存在")

    suspend fun updateCommentHidden(
        user: User,
        id: String,
        hidden: Boolean,
    ) {
        user.requireAdmin()
        val isUpdated = commentRepo.updateCommentHidden(
            id = id,
            hidden = hidden,
        )
        if (!isUpdated) throwCommentNotFound()
    }
}
