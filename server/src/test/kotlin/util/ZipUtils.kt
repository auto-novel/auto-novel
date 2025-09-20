package util

import io.kotest.core.spec.style.DescribeSpec
import util.epub.ZipUtils
import java.nio.file.Files
import java.nio.file.Paths
import kotlin.io.path.name

class EpubZipTest : DescribeSpec({
    describe("processing all EPUB files in the 'resources/util' directory") {
        val epubTestFiles = listOf("corrupted.01.epub")

        val epubFiles = epubTestFiles
            .mapNotNull { filename -> EpubZipTest::class.java.getResource("/util/$filename") }
            .mapNotNull { file -> Paths.get(file.toURI()) }
            .toList()

        if (epubFiles.isEmpty()) {
            it("missing epub test files") {
                throw AssertionError("No EPUB test files found.")
            }
        }

        epubFiles.forEach { epubPath ->
            it("testing unpacking ${epubPath.name}") {
                ZipUtils.use(epubPath) { fs ->
                    val root = fs.rootDirectories.first()
                    println("Checking epub: ${epubPath.name}")
                    println("Root directory inside epub: $root")
                    Files.walk(root).forEach { path ->
                        println("${epubPath.name}: $path")
                    }
                }
            }
        }
    }
})
