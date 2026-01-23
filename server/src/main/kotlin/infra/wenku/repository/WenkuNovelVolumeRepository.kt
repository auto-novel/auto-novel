package infra.wenku.repository

import infra.TempFileClient
import infra.TempFileType
import infra.common.NovelFileMode
import infra.common.NovelFileTranslationsMode
import infra.common.TranslatorId
import infra.wenku.WenkuNovelVolumeList
import infra.wenku.datasource.WenkuNovelVolumeDiskDataSource
import io.ktor.utils.io.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.jsoup.Jsoup
import org.jsoup.nodes.Element
import org.jsoup.parser.Parser
import util.epub.Epub
import util.serialName
import java.security.MessageDigest
import kotlin.io.path.*

private fun String.escapePath() =
    replace('/', '.')

class WenkuNovelVolumeRepository(
    private val fs: WenkuNovelVolumeDiskDataSource,
    private val temp: TempFileClient,
) {
    private fun volumesDir(novelId: String) =
        Path("./data/files-wenku/${novelId}")

    suspend fun list(novelId: String): WenkuNovelVolumeList =
        fs.listVolumes(volumesDir(novelId))

    suspend fun createVolume(
        novelId: String,
        volumeId: String,
        inputStream: ByteReadChannel,
        unpack: Boolean,
    ) = fs.createVolume(
        volumesDir = volumesDir(novelId),
        volumeId = volumeId,
        inputStream = inputStream,
        unpack = unpack,
    )

    suspend fun deleteVolume(
        novelId: String,
        volumeId: String,
    ) = fs.deleteVolume(
        volumesDir = volumesDir(novelId),
        volumeId = volumeId,
    )

    suspend fun getVolume(
        novelId: String,
        volumeId: String,
    ) = fs.getVolume(
        volumesDir = volumesDir(novelId),
        volumeId = volumeId,
    )

    suspend fun makeTranslationVolumeFile(
        novelId: String,
        volumeId: String,
        mode: NovelFileMode,
        translationsMode: NovelFileTranslationsMode,
        translations: List<TranslatorId>,
    ) = withContext(Dispatchers.IO) {
        val volume = getVolume(novelId, volumeId)
            ?: return@withContext null

        fun md5(input: String): String {
            val digest = MessageDigest.getInstance("MD5").digest(input.toByteArray())
            return digest.fold("") { str, it -> str + "%02x".format(it) }
        }

        val zhFilename = buildString {
            append(novelId)
            append('.')
            append(mode.serialName())
            append('.')
            append(
                when (translationsMode) {
                    NovelFileTranslationsMode.Parallel -> "B"
                    NovelFileTranslationsMode.Priority -> "Y"
                }
            )
            translations.forEach {
                append(it.serialName()[0])
            }
            append('.')
            append(md5(volumeId))
            append('.')
            append(volumeId.substringAfterLast('.', "txt"))
        }

        val zhPath = temp.createFile(TempFileType.Wenku, zhFilename)

        suspend fun getZhLinesList(chapterId: String): List<List<String>> {
            return when (translationsMode) {
                NovelFileTranslationsMode.Parallel ->
                    translations.mapNotNull { volume.getTranslation(it, chapterId) }

                NovelFileTranslationsMode.Priority ->
                    translations.firstNotNullOfOrNull { volume.getTranslation(it, chapterId) }
                        ?.let { listOf(it) }
                        ?: emptyList()
            }
        }

        if (volumeId.endsWith(".txt")) {
            zhPath.bufferedWriter().use { bf ->
                volume.listChapter().sorted().forEach { chapterId ->
                    val zhLinesList = getZhLinesList(chapterId)
                    if (zhLinesList.isEmpty()) {
                        bf.appendLine("// 该分段翻译缺失。")
                    } else {
                        val jpLines = volume.getChapter(chapterId)!!
                        val linesList = when (mode) {
                            NovelFileMode.Jp -> throw RuntimeException("文库小说不允许日语下载")
                            NovelFileMode.Zh -> zhLinesList
                            NovelFileMode.JpZh -> listOf(jpLines) + zhLinesList
                            NovelFileMode.ZhJp -> zhLinesList + listOf(jpLines)
                        }
                        for (i in jpLines.indices) {
                            linesList.forEach { lines ->
                                bf.appendLine(lines[i])
                            }
                        }
                    }
                }
            }
            return@withContext zhFilename
        } else {
            val jpPath = volume.volumesDir / volumeId

            val chapters = volume.listChapter()
            Epub.modify(srcPath = jpPath, dstPath = zhPath) { name, bytesIn ->
                // 为了兼容ChapterId以斜杠开头的旧格式
                val chapterId = if ("/${name}".escapePath() in chapters) {
                    "/${name}".escapePath()
                } else if (name.escapePath() in chapters) {
                    name.escapePath()
                } else {
                    null
                }

                if (chapterId != null) {
                    // XHtml文件，尝试生成翻译版
                    val zhLinesList = getZhLinesList(chapterId)
                    if (zhLinesList.isEmpty()) {
                        bytesIn
                    } else {
                        val doc = Jsoup.parse(bytesIn.decodeToString(), Parser.xmlParser())

                        val jpEls = doc.select("p")
                            .filter { el ->
                                el.clone().apply {
                                    // NOTE(kuriko): 非破坏性移除 rt 元素，与翻译阶段统一
                                    // 见 WenkuNovelVolumeDiskDataSource.kt@unpackVolume
                                    select("rt").remove()
                                }.text().isNotBlank()
                            };

                        val jpSize = jpEls.size;
                        zhLinesList.forEachIndexed { i, lines ->
                            if (lines.size != jpSize) {
                                throw RuntimeException(
                                    "严重错误：章节 '$chapterId' 第 $i 份翻译行数 (${lines.size}) 与日文行数 ($jpSize) 不匹配")
                            }
                        }

                        jpEls.forEachIndexed { index, el ->
                            when (mode) {
                                NovelFileMode.Jp -> throw RuntimeException("文库小说不允许日语下载")
                                NovelFileMode.Zh -> {
                                    zhLinesList.forEach { lines ->
                                        val pNew = doc.createElement("p").text(lines[index])
                                        el.before(pNew)
                                    }
                                    el.remove()
                                }

                                NovelFileMode.JpZh -> {
                                    zhLinesList.asReversed().forEach { lines ->
                                        val pNew = doc.createElement("p").text(lines[index])
                                        el.after(pNew)
                                    }
                                    el.attr("style", "opacity:0.4;")
                                }

                                NovelFileMode.ZhJp -> {
                                    zhLinesList.forEach { lines ->
                                        val pNew = doc.createElement("p").text(lines[index])
                                        el.before(pNew)
                                    }
                                    el.attr("style", "opacity:0.4;")
                                }
                            }
                        }
                        doc.outputSettings().prettyPrint(false)
                        doc.html().toByteArray(Charsets.UTF_8)
                    }
                } else if (name.endsWith("opf")) {
                    val doc = Jsoup.parse(bytesIn.decodeToString(), Parser.xmlParser())

                    val metadataEl = doc.selectFirst("metadata")!!
                    val spineEl = doc.selectFirst("spine")!!

                    // 修改 EPUB 语言为简体中文，让 iOS iBook 阅读器可以使用中文字体
                    metadataEl.selectFirst("dc|language")
                        ?.text("zh-CN")
                        ?: metadataEl.appendChild(
                            Element("dc:language").text("zh-CN")
                        )

                    // 防止阅读器使用竖排
                    val metaNode = Element("meta")
                        .attr("name", "primary-writing-mode")
                        .attr("content", "horizontal-lr")
                    metadataEl.selectFirst("meta[name=primary-writing-mode]")
                        ?.replaceWith(metaNode)
                        ?: metadataEl.appendChild(metaNode)

                    spineEl.removeAttr("page-progression-direction")

                    doc.outputSettings().prettyPrint(true)
                    doc.html().toByteArray()
                } else if (name.endsWith("css")) {
                    "".toByteArray()
                } else {
                    bytesIn
                }
            }
            return@withContext zhFilename
        }
    }
}
