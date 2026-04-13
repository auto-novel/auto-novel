package infra.user

import kotlinx.serialization.Contextual
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import org.bson.types.ObjectId

@Serializable
data class UserOutline(
    val username: String,
)

@Serializable
data class UserFavored(
    val id: String,
    val title: String,
)

@Serializable
data class UserFavoredList(
    val favoredWeb: List<UserFavored>,
    val favoredWenku: List<UserFavored>,
)

// MongoDB
@Serializable
data class UserDbModel(
    @Contextual @SerialName("_id") val id: ObjectId,
    val username: String,
    val favoredWeb: List<UserFavored>,
    val favoredWenku: List<UserFavored>,
    val readHistoryPaused: Boolean = false,
)