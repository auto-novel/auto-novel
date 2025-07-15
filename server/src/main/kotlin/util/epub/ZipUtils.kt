package util.epub

import com.google.common.jimfs.Configuration
import com.google.common.jimfs.Jimfs
import net.lingala.zip4j.io.inputstream.ZipInputStream
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
    /**
     * @param zipPath epub/zip 文件路径
     */
    fun use(zipPath: Path, block: (FileSystem) -> Unit) {
        val jimfs = Jimfs.newFileSystem(Configuration.unix())

        jimfs.use { fs ->
            unzipToAnyfs(zipPath, fs)
            block(fs)
        }
    }

    /**
     * @param zipPath zip 文件路径
     * @param fs 任意一个 filesystem 对象，例如 jimfs
     */
    private fun unzipToAnyfs(zipPath: Path, fs: FileSystem) {
        // FIXME(kuriko): 请考虑把所有常量找个地方放一起。
        val MAX_ALLOWED_EPUB_SIZE = 50 * 1024 * 1024  // 50MiB

        var decSize = 0
        Files.newInputStream(zipPath).use { inputStream ->
            ZipInputStream(inputStream).use { zipInputStream ->
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
                            while ((zipInputStream.read(readBuffer).also { readLen = it }) != -1) {
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
}

