package infra.wenku.datasource

import infra.TempFileClient
import infra.common.TranslatorId
import infra.wenku.WenkuChapterGlossary
import infra.wenku.WenkuNovelVolumeJp
import infra.wenku.WenkuNovelVolumeList
import io.ktor.utils.io.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json
import util.epub.Epub
import util.serialName
import java.nio.charset.Charset
import java.nio.file.FileAlreadyExistsException
import java.nio.file.Path
import java.util.UUID
import kotlin.io.path.*

sealed class VolumeCreateException(message: String, cause: Throwable? = null) : Exception(message, cause) {
    class VolumeAlreadyExist : VolumeCreateException("卷已经存在")
    class VolumeUploadInterrupted(cause: Throwable? = null) : VolumeCreateException("上传已中断或文件不完整", cause)
    class VolumeTooLarge(message: String) : VolumeCreateException(message, null)
    class VolumeCorrupted(cause: Throwable? = null) : VolumeCreateException("文件损坏或不是合法的 epub", cause)
    class VolumeCreateFailure(cause: Throwable? = null) : VolumeCreateException("无法保存上传文件", cause)
    class VolumeUnpackFailure(cause: Throwable) : VolumeCreateException("卷解包失败", cause)
}

@OptIn(ExperimentalPathApi::class)
class WenkuNovelVolumeDiskDataSource(
    private val temp: TempFileClient,
) {
    suspend fun listVolumes(
        volumesDir: Path,
    ) = withContext(Dispatchers.IO) {
        val volumesJp = mutableListOf<WenkuNovelVolumeJp>()
        val volumesZh = mutableListOf<String>()
        if (volumesDir.exists() && volumesDir.isDirectory()) {
            volumesDir
                .listDirectoryEntries()
                .filter {
                    it.isRegularFile() && it.fileName.extension in listOf("epub", "txt")
                }
                .map {
                    VolumeAccessor(volumesDir, it.fileName.toString())
                }
                .forEach {
                    if (it.unpacked) {
                        volumesJp.add(
                            WenkuNovelVolumeJp(
                                volumeId = it.volumeId,
                                total = it.listChapter().size,
                                baidu = it.listTranslation(TranslatorId.Baidu).size,
                                youdao = it.listTranslation(TranslatorId.Youdao).size,
                                gpt = it.listTranslation(TranslatorId.Gpt).size,
                                sakura = it.listTranslation(TranslatorId.Sakura).size,
                            )
                        )
                    } else {
                        volumesZh.add(it.volumeId)
                    }
                }
        }
        return@withContext WenkuNovelVolumeList(
            jp = volumesJp,
            zh = volumesZh,
        )
    }

    suspend fun createVolume(
        volumesDir: Path,
        volumeId: String,
        inputStream: ByteReadChannel,
        unpack: Boolean,
    ) = withContext(Dispatchers.IO) {
        if (!volumesDir.exists()) {
            volumesDir.createDirectories()
        }

        val normVolumesDir = volumesDir.normalize()
        val finalPath = (normVolumesDir / volumeId).normalize()
        val uploadTempPath = (
            normVolumesDir / "$volumeId.${UUID.randomUUID()}.uploading"
        ).normalize()

        // Security(kuriko): 检查是否存在路径穿越风险
        // Security(kuriko): 如果 volumesDir 存在 / 等字符，仍然存在非预期的目录创建
        if (!finalPath.startsWith(normVolumesDir) || !uploadTempPath.startsWith(normVolumesDir)) {
            throw VolumeCreateException.VolumeCreateFailure()
        }

        if (finalPath.exists()) {
            throw VolumeCreateException.VolumeAlreadyExist()
        }
        val tempOutputStream = try {
            uploadTempPath.deleteIfExists()
            uploadTempPath.createFile().outputStream()
        } catch (e: Throwable) {
            throw VolumeCreateException.VolumeCreateFailure(e)
        }

        val volumeTooLarge = tempOutputStream.use { out ->
            try {
                var bytesCopied: Long = 0
                val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                while (true) {
                    when (val bytes = inputStream.readAvailable(buffer)) {
                        -1 -> break
                        0 -> continue
                        else -> {
                            bytesCopied += bytes
                            if (bytesCopied > 1024 * 1024 * 40) {
                                return@use true
                            }
                            out.write(buffer, 0, bytes)
                        }
                    }
                }
            } catch (e: Throwable) {
                uploadTempPath.deleteIfExists()
                if (e is CancellationException) throw e
                throw VolumeCreateException.VolumeUploadInterrupted(e)
            }

            inputStream.closedCause?.let {
                uploadTempPath.deleteIfExists()
                throw VolumeCreateException.VolumeUploadInterrupted(it)
            }
            return@use false
        }

        if (volumeTooLarge) {
            uploadTempPath.deleteIfExists()
            throw VolumeCreateException.VolumeTooLarge("文件大小不能超过40MB")
        }

        // 根据不同上传文件，分别进行合法性检测
        when (finalPath.extension.lowercase()) {
                "txt" -> {
                    /* txt 暂时没有额外检测 */
                }
                "epub" -> {
                    Epub.checkZipValid(uploadTempPath).getOrElse { e ->
                        uploadTempPath.deleteIfExists()
                        throw VolumeCreateException.VolumeCorrupted(e)
                    }
                }
                else -> {
                uploadTempPath.deleteIfExists()
                throw VolumeCreateException.VolumeCorrupted()
            }
        }

        try {
            uploadTempPath.moveTo(finalPath)
        } catch (e: FileAlreadyExistsException) {
            throw VolumeCreateException.VolumeAlreadyExist()
        } catch (e: Throwable) {
            throw VolumeCreateException.VolumeCreateFailure(e)
        } finally {
            uploadTempPath.deleteIfExists()
        }

        if (unpack) {
            val unpackPath = normVolumesDir / "$volumeId.unpack"
            try {
                unpackVolume(normVolumesDir, volumeId)
                val volume = getVolume(normVolumesDir, volumeId)
                return@withContext volume?.listChapter()?.size
            } catch (e: Throwable) {
                e.printStackTrace()
                unpackPath.deleteRecursively()
                finalPath.deleteIfExists()
                throw VolumeCreateException.VolumeUnpackFailure(e)
            } finally {
                uploadTempPath.deleteIfExists()
            }
        }
        return@withContext null
    }

    private suspend fun unpackVolume(
        volumesDir: Path,
        volumeId: String,
    ) = withContext(Dispatchers.IO) {
        val volumePath = volumesDir / volumeId
        val unpackPath = volumesDir / "$volumeId.unpack" / "jp"
        if (unpackPath.notExists()) {
            unpackPath.createDirectories()
        }
        if (volumePath.extension == "txt") {
            val jpLines = runCatching {
                volumePath.readLines()
            }.getOrElse {
                volumePath.readLines(Charset.forName("GBK"))
            }
            jpLines.chunked(1000).forEachIndexed { index, lines ->
                val chapterPath = unpackPath / "${String.format("%04d", index)}.txt"
                chapterPath.writeLines(lines)
            }
        } else {
            Epub.forEachXHtmlFile(volumePath) { xhtmlPath, doc ->
                doc.select("rt").remove()
                val lines = doc.body().select("p")
                    .mapNotNull { it.text().ifBlank { null } }
                if (lines.isNotEmpty()) {
                    val chapterPath = unpackPath / xhtmlPath.escapePath()
                    chapterPath.writeLines(lines)
                }
            }
        }
    }

    suspend fun deleteVolume(
        volumesDir: Path,
        volumeId: String,
    ) = withContext(Dispatchers.IO) {
        val volumePath = volumesDir / volumeId
        val unpackPath = volumesDir / "$volumeId.unpack"

        if (volumePath.exists()) {
            temp.trash(volumePath)
        }
        if (unpackPath.exists()) {
            unpackPath.deleteRecursively()
        }
    }

    suspend fun getVolume(
        volumesDir: Path,
        volumeId: String,
    ): VolumeAccessor? = withContext(Dispatchers.IO) {
        val volumePath = volumesDir / volumeId
        val unpackPath = volumesDir / "$volumeId.unpack"
        return@withContext if (volumePath.exists() && unpackPath.exists()) {
            VolumeAccessor(volumesDir, volumeId)
        } else {
            null
        }
    }
}

private fun String.escapePath() =
    replace('/', '.')

class VolumeAccessor(val volumesDir: Path, val volumeId: String) {
    val unpacked
        get() = (volumesDir / "${volumeId}.unpack").exists()

    //
    private suspend fun listFiles(dir: String) =
        withContext(Dispatchers.IO) {
            val chapterPath = volumesDir / "$volumeId.unpack" / dir
            return@withContext if (chapterPath.notExists()) {
                emptyList()
            } else {
                chapterPath
                    .listDirectoryEntries()
                    .map { it.fileName.toString() }
            }
        }

    suspend fun listChapter(): List<String> =
        listFiles("jp")

    suspend fun listTranslation(translatorId: TranslatorId): List<String> =
        listFiles(translatorId.serialName())


    private fun Path.readLinesOrNull() =
        if (notExists()) null else readLines()

    //
    private fun chapterPath(chapterId: String) =
        volumesDir / "$volumeId.unpack" / "jp" / chapterId

    suspend fun getChapter(chapterId: String) =
        withContext(Dispatchers.IO) {
            val path = chapterPath(chapterId)
            return@withContext path.readLinesOrNull()
        }

    //
    private fun translationPath(translatorId: TranslatorId, chapterId: String) =
        volumesDir / "$volumeId.unpack" / translatorId.serialName() / chapterId

    suspend fun translationExist(translatorId: TranslatorId, chapterId: String) =
        withContext(Dispatchers.IO) {
            val path = translationPath(translatorId, chapterId)
            return@withContext path.exists()
        }

    suspend fun getTranslation(translatorId: TranslatorId, chapterId: String) =
        withContext(Dispatchers.IO) {
            val path = translationPath(translatorId, chapterId)
            return@withContext path.readLinesOrNull()
        }

    suspend fun setTranslation(translatorId: TranslatorId, chapterId: String, lines: List<String>) =
        withContext(Dispatchers.IO) {
            val path = translationPath(translatorId, chapterId)
            if (path.parent.notExists()) {
                path.parent.createDirectories()
            }
            path.writeLines(lines)
        }

    //
    private fun chapterGlossaryPath(translatorId: TranslatorId, chapterId: String) =
        volumesDir / "$volumeId.unpack" / "${translatorId.serialName()}.g" / chapterId

    suspend fun getChapterGlossary(
        translatorId: TranslatorId,
        chapterId: String,
    ) = getGlossary(
        path = chapterGlossaryPath(
            translatorId = translatorId,
            chapterId = chapterId,
        ),
    )

    suspend fun setChapterGlossary(
        translatorId: TranslatorId,
        chapterId: String,
        glossaryUuid: String?,
        glossary: Map<String, String>,
        sakuraVersion: String?,
    ) = setGlossary(
        path = chapterGlossaryPath(
            translatorId = translatorId,
            chapterId = chapterId,
        ),
        glossaryUuid = glossaryUuid,
        glossary = glossary,
        sakuraVersion = sakuraVersion,
    )

}

private suspend fun getGlossary(path: Path) =
    withContext(Dispatchers.IO) {
        return@withContext if (path.notExists())
            null
        else try {
            Json.decodeFromString<WenkuChapterGlossary>(path.readText())
        } catch (_: Throwable) {
            null
        }
    }

private suspend fun setGlossary(
    path: Path,
    glossaryUuid: String?,
    glossary: Map<String, String>,
    sakuraVersion: String?,
) = withContext(Dispatchers.IO) {
    if (path.parent.notExists()) {
        path.parent.createDirectories()
    }
    path.writeText(
        Json.encodeToString(
            WenkuChapterGlossary(
                uuid = glossaryUuid,
                glossary = glossary,
                sakuraVersion = sakuraVersion
            )
        )
    )
}

