import { downloadFile } from '@/util';
import type { ParsedFile } from '@/util/file';

export namespace FileProcessor {
  const downloadFiles = async (files: ParsedFile[]) => {
    if (files.length === 1) {
      const file = files[0];
      await downloadFile(file.name, await file.toBlob());
    } else {
      const { BlobReader, BlobWriter, ZipWriter } = await import(
        '@zip.js/zip.js'
      );
      const zipBlobWriter = new BlobWriter();
      const writer = new ZipWriter(zipBlobWriter);
      await Promise.all(
        files.map(async (file) => {
          const blob = await file.toBlob();
          await writer.add(file.name, new BlobReader(blob));
        }),
      );
      await writer.close();
      const zipBlob = await zipBlobWriter.getData();
      downloadFile(`处理打包下载[${files.length}].zip`, zipBlob);
    }
  };

  type ModifyFn<T extends ParsedFile> = (file: T) => Promise<void>;
  type ConvertFn<T extends ParsedFile> = (file: T) => Promise<ParsedFile>;
  type ErrorFn = (e: unknown) => void;

  export const modifyFiles = async <T extends ParsedFile>(
    files: T[],
    modify: ModifyFn<T>,
    onError: ErrorFn,
  ) => {
    try {
      const newFiles = await Promise.all(
        files.map(async (file) => {
          const newFile = (await file.clone()) as T;
          await modify(newFile);
          return newFile;
        }),
      );
      await downloadFiles(newFiles);
    } catch (e) {
      onError(e);
    }
  };

  export const convertFiles = async <T extends ParsedFile>(
    files: T[],
    convert: ConvertFn<T>,
    onError: ErrorFn,
  ) => {
    try {
      const newFiles = await Promise.all(
        files.map(async (file) => convert(file)),
      );
      await downloadFiles(newFiles);
    } catch (e) {
      onError(e);
    }
  };
}
