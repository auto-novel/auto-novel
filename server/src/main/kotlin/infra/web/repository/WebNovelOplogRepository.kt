package infra.web.repository

import com.mongodb.client.model.Filters.eq
import infra.MongoClient
import infra.MongoCollectionNames
import infra.field
import infra.oplog.OperationHistoryModel
import infra.web.WebNovelOperation
import infra.web.WebNovelOplogDbModel
import kotlinx.datetime.Clock
import org.bson.types.ObjectId

class WebNovelOplogRepository(
    mongo: MongoClient,
) {
    private val webNovelOplogCollection =
        mongo.database.getCollection<WebNovelOplogDbModel>(
            MongoCollectionNames.WEB_OPLOG,
        )

    suspend fun create(
        providerId: String,
        novelId: String,
        operator: String,
        operation: WebNovelOperation,
    ) {
        webNovelOplogCollection.insertOne(
            WebNovelOplogDbModel(
                providerId = providerId,
                novelId = novelId,
                operator = operator,
                operation = operation,
                createdAt = Clock.System.now(),
            )
        )
    }

    suspend fun delete(id: String) {
        webNovelOplogCollection.deleteOne(
            eq(
                OperationHistoryModel::id.field(),
                ObjectId(id),
            )
        )
    }
}