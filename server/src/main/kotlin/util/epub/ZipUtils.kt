package util.epub

import com.google.common.jimfs.Configuration
import com.google.common.jimfs.Jimfs
import net.lingala.zip4j.io.inputstream.ZipInputStream
import org.slf4j.LoggerFactory
import java.nio.file.FileSystem
import java.nio.file.Files
import java.nio.file.Path


/**
 * 修正 zip 内路径访问。
 *
 * @param: zip 内文件路径
 */
fun FileSystem.zipGetPath(path: String): Path {
    return if (!path.startsWith("/")) {
        getPath(Path.of("/").resolve(path).toString())
    } else {
        getPath(path)
    }
}

object ZipUtils {
    val logger = LoggerFactory.getLogger(ZipUtils::class.java)

    // FIXME(kuriko): 请考虑把所有常量找个地方放一起。
    const val MAX_ALLOWED_EPUB_SIZE = 50 * 1024 * 1024  // 50MiB

    /**
     * @param zipPath epub/zip 文件路径
     */
    inline fun use(zipPath: Path, block: (FileSystem) -> Unit) {
        val jimfs = Jimfs.newFileSystem(Configuration.unix())

        jimfs.use { fs ->
            val unzipMethods = listOf(ZipUtils::unzipByJDK, ZipUtils::unzipByZip4J)
            for (method in unzipMethods) {
                try {
                    method(zipPath, fs)
                    block(fs)
                    return@use
                } catch (e: Exception) {
                    logger.warn("Failed to unzip $zipPath with ${method.name}.", e)
                }
            }
            throw Exception("Failed to unzip $zipPath.")
        }
    }

    // Consider moving the unzipByXXX methods to a separate class and make them reusable.
    /**
     * Unzip via zip4j method
     * @param zipPath zip file path
     *
     */
    fun unzipByZip4J(zipPath: Path, fs: FileSystem) {
        var decSize = 0
        Files.newInputStream(zipPath).use { inputStream ->
            net.lingala.zip4j.io.inputstream.ZipInputStream(inputStream).use { zipInputStream ->
                generateSequence { zipInputStream.nextEntry }.forEach { localFileHeader ->
                    var readLen: Int
                    val readBuffer = ByteArray(4096)

                    val extractedFile = Path.of("/").resolve(localFileHeader.fileName)
                    val extractedFilePath = fs.getPath(extractedFile.toString())
                    if (localFileHeader.isDirectory) {
                        Files.createDirectories(extractedFilePath)
                    } else {
                        // NOTE(kuriko): 以防万一 zip iter 顺序并非目录在前。
                        Files.createDirectories(extractedFilePath.parent ?: fs.getPath("/"))
                        Files.newOutputStream(extractedFilePath).use { outputStream ->
                            while ((zipInputStream.read(readBuffer).also { readLen = it }) > 0) {
                                outputStream.write(readBuffer, 0, readLen)
                                decSize += readLen
                                if (decSize > MAX_ALLOWED_EPUB_SIZE) {
                                    throw IllegalStateException("Decompressed epub size exceeds the limit.")
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /**
     * Unzip via java native zip method.
     * @param zipPath zip file path
     */
    fun unzipByJDK(zipPath: Path, fs: FileSystem) {
        var decSize = 0
        Files.newInputStream(zipPath).use { inputStream ->
            java.util.zip.ZipInputStream(inputStream).use { zis ->
                generateSequence { zis.nextEntry }.forEach { entry ->
                    // TODO(kuriko): check invalid zip entry name.
                    val entryFile = Path.of("/").resolve(entry.name)
                    val entryPath = fs.getPath(entryFile.toString())
                    if (entry.isDirectory) {
                        Files.createDirectories(entryPath)
                    } else {
                        // Make sure the parent exists.
                        Files.createDirectories(entryPath.parent ?: fs.getPath("/"))
                        Files.newOutputStream(entryPath).use { outputStream ->
                            val buffer = ByteArray(4096)
                            var len: Int
                            while (zis.read(buffer).also { len = it } > 0) {
                                outputStream.write(buffer, 0, len)
                                decSize += len
                                if (decSize > MAX_ALLOWED_EPUB_SIZE) {
                                    throw IllegalStateException("Decompressed epub size exceeds the limit.")
                                }
                            }
                        }
                    }

                }

            }
        }
    }

    /**
     * Unzip via apache commons compress method.
     * @param zipPath zip file path
     */
    private fun unzipByApache(zipPath: Path, fs: FileSystem) {
        throw NotImplementedError("Unzip via apache commons compress method is not implemented yet.")
    }
}

