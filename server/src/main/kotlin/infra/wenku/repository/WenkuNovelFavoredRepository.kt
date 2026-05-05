package infra.wenku.repository

import com.mongodb.client.model.Aggregates.*
import com.mongodb.client.model.Facet
import com.mongodb.client.model.Filters.and
import com.mongodb.client.model.Filters.eq
import com.mongodb.client.model.Projections.*
import com.mongodb.client.model.ReplaceOptions
import com.mongodb.client.model.Sorts.descending
import infra.*
import infra.common.FavoredNovelListSort
import infra.common.Page
import infra.common.emptyPage
import infra.wenku.WenkuNovelFavoriteDbModel
import infra.wenku.WenkuNovel
import infra.wenku.WenkuNovelListItem
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable
import org.bson.types.ObjectId

class WenkuNovelFavoredRepository(
    mongo: MongoClient,
) {
    private val userFavoredWenkuCollection =
        mongo.database.getCollection<WenkuNovelFavoriteDbModel>(
            MongoCollectionNames.WENKU_FAVORITE,
        )

    suspend fun getFavoredId(
        userId: String,
        novelId: String,
    ): String? {
        return userFavoredWenkuCollection
            .find(
                and(
                    eq(
                        WenkuNovelFavoriteDbModel::userId.field(), ObjectId(userId)
                    ),
                    eq(WenkuNovelFavoriteDbModel::novelId.field(), ObjectId(novelId)),
                )
            )
            .firstOrNull()?.favoredId
    }

    suspend fun listFavoriteWenkuNovel(
        userId: String,
        favoredId: String?,
        page: Int,
        pageSize: Int,
        sort: FavoredNovelListSort,
    ): Page<WenkuNovelListItem> {
        @Serializable
        data class PageModel(
            val total: Int = 0,
            val items: List<WenkuNovel>,
        )

        val filterBson = if (favoredId == null) {
            eq(WenkuNovelFavoriteDbModel::userId.field(), ObjectId(userId))
        } else {
            and(
                eq(WenkuNovelFavoriteDbModel::userId.field(), ObjectId(userId)),
                eq(WenkuNovelFavoriteDbModel::favoredId.field(), favoredId),
            )
        }

        val sortBson = when (sort) {
            FavoredNovelListSort.CreateAt -> descending(WenkuNovelFavoriteDbModel::createAt.field())
            FavoredNovelListSort.UpdateAt -> descending("novel.${WenkuNovel::updateAt.field()}")
        }

        val doc = userFavoredWenkuCollection
            .aggregate<PageModel>(
                match(filterBson),
                lookup(
                    /* from = */ MongoCollectionNames.WENKU_NOVEL,
                    /* localField = */ WenkuNovelFavoriteDbModel::novelId.field(),
                    /* foreignField = */ WenkuNovel::id.field(),
                    /* as = */ "novel"
                ),
                unwind("\$novel"),
                facet(
                    Facet("count", count()),
                    Facet(
                        "items",
                        sort(sortBson),
                        skip(page * pageSize),
                        limit(pageSize),
                        replaceRoot("\$novel"),
                    )
                ),
                project(
                    fields(
                        computed(PageModel::total.field(), arrayElemAt("count.count", 0)),
                        include(PageModel::items.field())
                    )
                ),
            )
            .firstOrNull()

        return if (doc == null) {
            emptyPage()
        } else {
            Page(
                total = doc.total.toLong(),
                items = doc.items.map {
                    WenkuNovelListItem(
                        id = it.id.toHexString(),
                        title = it.title,
                        titleZh = it.titleZh,
                        cover = it.cover,
                        favored = null,
                    )
                },
                pageSize = pageSize,
            )
        }
    }

    suspend fun countFavoredNovelByUserId(
        userId: String,
        favoredId: String,
    ): Long {
        return userFavoredWenkuCollection
            .countDocuments(
                and(
                    eq(WenkuNovelFavoriteDbModel::userId.field(), ObjectId(userId)),
                    eq(WenkuNovelFavoriteDbModel::favoredId.field(), favoredId),
                )
            )
    }

    suspend fun updateFavoredNovel(
        userId: ObjectId,
        novelId: ObjectId,
        favoredId: String,
        updateAt: Instant,
    ) {
        userFavoredWenkuCollection
            .replaceOne(
                and(
                    eq(WenkuNovelFavoriteDbModel::userId.field(), userId),
                    eq(WenkuNovelFavoriteDbModel::novelId.field(), novelId),
                ),
                WenkuNovelFavoriteDbModel(
                    userId = userId,
                    novelId = novelId,
                    favoredId = favoredId,
                    createAt = Clock.System.now(),
                    updateAt = updateAt,
                ),
                ReplaceOptions().upsert(true),
            )
    }

    suspend fun deleteFavoredNovel(
        userId: ObjectId,
        novelId: ObjectId,
    ) {
        userFavoredWenkuCollection
            .deleteOne(
                and(
                    eq(WenkuNovelFavoriteDbModel::userId.field(), userId),
                    eq(WenkuNovelFavoriteDbModel::novelId.field(), novelId),
                )
            )
    }
}