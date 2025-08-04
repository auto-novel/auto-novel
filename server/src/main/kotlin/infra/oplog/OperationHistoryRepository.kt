package infra.oplog

import com.mongodb.client.model.Aggregates.*
import com.mongodb.client.model.Facet
import com.mongodb.client.model.Filters.eq
import com.mongodb.client.model.Projections.*
import com.mongodb.client.model.Sorts.descending
import infra.*
import infra.common.Page
import infra.common.emptyPage
import infra.user.UserDbModel
import infra.user.UserOutline
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.toList
import kotlinx.datetime.Clock
import kotlinx.serialization.Serializable
import org.bson.types.ObjectId

class OperationHistoryRepository(
    mongo: MongoClient,
) {
    private val operationHistoryCollection =
        mongo.database.getCollection<OperationHistoryModel>(
            MongoCollectionNames.OPERATION_HISTORY,
        )
    private val tocMergeHistoryCollection =
        mongo.database.getCollection<WebNovelTocMergeHistory>(
            MongoCollectionNames.TOC_MERGE_HISTORY,
        )

    suspend fun list(
        page: Int,
        pageSize: Int,
        type: String,
    ): Page<OperationHistory> {
        @Serializable
        data class PageModel(val total: Int = 0, val items: List<OperationHistory>)

        val doc = operationHistoryCollection
            .aggregate<PageModel>(
                match(eq("${OperationHistoryModel::operation.field()}.___type", type)),
                facet(
                    Facet("count", count()),
                    Facet(
                        "items",
                        sort(
                            descending(OperationHistoryModel::createAt.field()),
                        ),
                        skip(page * pageSize),
                        limit(pageSize),
                        lookup(
                            MongoCollectionNames.USER,
                            OperationHistoryModel::operator.field(),
                            UserDbModel::id.field(),
                            OperationHistory::operator.field(),
                        ),
                        unwind(OperationHistory::operator.fieldPath()),
                        project(
                            fields(
                                include(
                                    OperationHistory::id.field(),
                                    OperationHistory::operator.field() + "." + UserOutline::username.field(),
                                    OperationHistory::operation.field(),
                                    OperationHistory::createAt.field(),
                                )
                            )
                        )
                    )
                ),
                project(
                    fields(
                        computed(PageModel::total.field(), arrayElemAt("count.count", 0)),
                        include(PageModel::items.field()),
                    )
                ),
            ).firstOrNull()

        return if (doc == null) {
            emptyPage()
        } else {
            Page(
                items = doc.items,
                total = doc.total.toLong(),
                pageSize = pageSize,
            )
        }
    }

    suspend fun create(
        operator: ObjectId,
        operation: Operation,
    ) {
        operationHistoryCollection.insertOne(
            OperationHistoryModel(
                id = ObjectId(),
                operator = operator,
                operation = operation,
                createAt = Clock.System.now(),
            )
        )
    }

    suspend fun delete(id: String) {
        operationHistoryCollection.deleteOne(
            eq(OperationHistoryModel::id.field(), ObjectId(id))
        )
    }

    suspend fun listMergeHistory(
        page: Int,
        pageSize: Int,
    ): Page<WebNovelTocMergeHistory> {
        val total = tocMergeHistoryCollection.countDocuments()
        val items = tocMergeHistoryCollection
            .find()
            .sort(
                descending(WebNovelTocMergeHistory::id.field()),
            )
            .skip(page * pageSize)
            .limit(pageSize)
            .toList()
        return Page(
            items = items,
            total = total,
            pageSize = pageSize,
        )
    }

    suspend fun deleteMergeHistory(id: String) {
        tocMergeHistoryCollection.deleteOne(
            eq(WebNovelTocMergeHistory::id.field(), ObjectId(id)),
        )
    }
}