package util.epub

import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.jsoup.parser.Parser
import java.io.BufferedOutputStream
import java.nio.file.FileSystem
import java.nio.file.FileSystems
import java.nio.file.Files
import java.nio.file.Path
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.io.path.isRegularFile
import kotlin.io.path.outputStream
import kotlin.io.path.readBytes
import kotlin.io.path.readText
import kotlin.streams.asSequence


private fun FileSystem.readFileAsXHtml(path: String): Document {
    return Jsoup.parse(getPath(path).readText(), Parser.xmlParser())
}

object Epub {
    fun forEachXHtmlFile(path: Path, block: (xhtmlPath: String, doc: Document) -> Unit) {
        FileSystems.newFileSystem(path).use { fs ->
            val xmlContainer = fs.readFileAsXHtml("/META-INF/container.xml")
            val opfPath = xmlContainer.selectFirst("rootfile")!!.attr("full-path")

            val opfDir = opfPath.substringBeforeLast("/", "")
            fs.readFileAsXHtml(opfPath)
                .select("manifest item[media-type=application/xhtml+xml]")
                .map { opfDir + "/" + it.attr("href") }
                .forEach { block(it, fs.readFileAsXHtml(it)) }
        }
    }

    inline fun modify(
        srcPath: Path,
        dstPath: Path,
        modify: (name: String, bytes: ByteArray) -> ByteArray,
    ) {
        FileSystems.newFileSystem(srcPath).use { fs ->
            ZipOutputStream(BufferedOutputStream(dstPath.outputStream())).use { zipOut ->
                Files
                    .walk(fs.rootDirectories.first())
                    .filter { it.isRegularFile() }
                    .sorted { path1, path2 ->
                        val pathToNumber = { path: Path ->
                            val s = path.toString()
                            when {
                                s == "/mimetype" -> 3
                                s == "/META-INF/container.xml" -> 2
                                s.endsWith("opf") -> 1
                                else -> 0
                            }
                        }
                        val n1 = pathToNumber(path1)
                        val n2 = pathToNumber(path2)
                        if (n1 != n2) {
                            n2.compareTo(n1)
                        } else {
                            path1.compareTo(path2)
                        }
                    }
                    .asSequence()
                    .forEach { path ->
                        val name = path.toString().removePrefix("/")
                        val bytesIn = path.readBytes()
                        val bytesOut = modify(name, bytesIn)
                        zipOut.putNextEntry(ZipEntry(name))
                        zipOut.write(bytesOut)
                        zipOut.closeEntry()
                    }
            }
        }
    }
}
