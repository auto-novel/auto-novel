package infra

import com.mongodb.*
import com.mongodb.kotlin.client.coroutine.MongoCollection
import kotlinx.datetime.Instant
import kotlinx.serialization.*
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.modules.SerializersModule
import kotlinx.serialization.modules.plus
import org.bson.BsonDateTime
import org.bson.BsonString
import org.bson.Document
import org.bson.codecs.*
import org.bson.codecs.configuration.CodecProvider
import org.bson.codecs.configuration.CodecRegistries
import org.bson.codecs.configuration.CodecRegistry
import org.bson.codecs.kotlinx.*
import org.bson.conversions.Bson
import kotlin.reflect.KProperty
import kotlin.reflect.full.findAnnotation
import kotlin.reflect.full.hasAnnotation
import com.mongodb.kotlin.client.coroutine.MongoClient as KMongoClient

class MongoClient(host: String, port: Int?) {
    private object KInstantSerializer : KSerializer<Instant> {
        override val descriptor: SerialDescriptor =
            PrimitiveSerialDescriptor("KInstantSerializer", PrimitiveKind.STRING)

        override fun serialize(encoder: Encoder, value: Instant) {
            encoder as BsonEncoder
            encoder.encodeBsonValue(BsonDateTime(value.toEpochMilliseconds()))
        }

        override fun deserialize(decoder: Decoder): Instant {
            decoder as BsonDecoder
            return when (val a = decoder.decodeBsonValue()) {
                is BsonString -> Instant.parse(a.value) // 暂时兼容旧的数据格式
                is BsonDateTime -> Instant.fromEpochMilliseconds(a.value)
                else -> throw SerializationException("Unsupported reading date")
            }
        }
    }

    @OptIn(InternalSerializationApi::class, ExperimentalSerializationApi::class)
    private fun getPatchedCodecRegistries() =
        CodecRegistries.fromRegistries(
            CodecRegistries.fromProviders(
                object : CodecProvider {
                    private val serializersModule = defaultSerializersModule + SerializersModule {
                        contextual(Instant::class, KInstantSerializer)
                    }

                    override fun <T : Any> get(clazz: Class<T>, registry: CodecRegistry): Codec<T>? {
                        val kClass = clazz.kotlin
                        return if (kClass.hasAnnotation<Serializable>()) {
                            try {
                                KotlinSerializerCodec.create(
                                    kClass,
                                    serializersModule.getContextual(kClass) ?: kClass.serializer(),
                                    serializersModule,
                                    BsonConfiguration(),
                                )
                            } catch (exception: SerializationException) {
                                null
                            }
                        } else {
                            null
                        }
                    }
                },
            ),
            MongoClientSettings.getDefaultCodecRegistry(),
        )

    private val client = KMongoClient.create(
        MongoClientSettings
            .builder()
            .codecRegistry(getPatchedCodecRegistries())
            .applyConnectionString(
                ConnectionString(
                    "mongodb://${host}:${port ?: 27017}"
                ),
            )
            .build()
    )
    val database = client.getDatabase("main")
}

object MongoCollectionNames {
    const val ARTICLE = "article"
    const val COMMENT = "comment-alt"
    const val OPERATION_HISTORY = "operation-history"
    const val USER = "user"

    const val WEB_NOVEL = "metadata"
    const val WEB_FAVORITE = "web-favorite"
    const val WEB_READ_HISTORY = "web-read-history"
    const val WEB_OPLOG = "web-oplog"

    const val WENKU_NOVEL = "wenku-metadata"
    const val WENKU_FAVORITE = "wenku-favorite"

    // will deprecate
    const val WEB_CHAPTER = "episode"
    const val TOC_MERGE_HISTORY = "toc-merge-history"
}

// MongoDb Util
inline fun <reified T> KProperty<T>.field(): String =
    findAnnotation<SerialName>()?.value ?: name

inline fun <reified T> KProperty<T>.fieldPath(): String =
    "$" + field()

inline fun <reified R : Any> MongoCollection<*>.aggregate(vararg bson: Bson) =
    aggregate<R>(bson.asList())

fun arrayElemAt(path: String, index: Int = 0): Bson =
    Document("\$arrayElemAt", listOf("\$" + path, index))

fun toString(path: String): Bson =
    Document("\$toString", "\$" + path)
