import { BaseFile } from './base';
import { StandardNovel } from './standard';

const MIMETYPE_PATH = 'mimetype';
const MIMETYPE_TEMPLATE = 'application/epub+zip';

const CONTAINER_PATH = 'META-INF/container.xml';
const CONTAINER_TEMPLATE = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

const getEl = (doc: Document, tagName: string) =>
  doc.getElementsByTagName(tagName).item(0);

const MIME = {
  IMAGE: [
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/svg+xml',
    'image/webp',
  ],
  CSS: ['text/css'],
};

type EpubItemBase = {
  id: string;
  href: string;
  mediaType: string;
  overlay: string | null;
  properties: string[] | null;
  fallback: string | null;
};
type EpubItemDoc = EpubItemBase & { doc: Document };
type EpubItemBlob = EpubItemBase & { blob: Blob };
type EpubItem = EpubItemDoc | EpubItemBlob;

interface EpubItemref {
  idref: string;
  linear: string | null;
  properties: string[] | null;
}

interface EpubNavItem {
  text: string;
  href?: string;
  children: EpubNavItem[];
}

export class Epub extends BaseFile {
  type = 'epub' as const;
  packagePath: string = '';
  navigationPath: string | undefined;
  ncxPath: string | undefined;
  packageDoc!: Document;
  items = new Map<string, EpubItem>();
  itemrefs: EpubItemref[] = [];
  navItems: EpubNavItem[] = [];

  private resolve(root: string, rpath: string) {
    const rootUrl = new URL(root, 'files://books');
    const rootDirUrl = new URL('.', rootUrl);
    const newURL = new URL(rpath, rootDirUrl);
    return newURL.pathname.substring(1);
  }

  private updateHref(oldHref: string, newHref: string) {
    // TODO
  }

  // ==============================
  // 读取文件内容
  // ==============================

  private parseProperties(attr: string | null) {
    if (!attr) return null;
    return attr.split(' ').filter((prop) => prop);
  }

  private parseContainer(doc: Document) {
    const rootfile = getEl(doc, 'rootfile');
    if (!rootfile) throw new Error('Container does not have rootfile');
    const packagePath = rootfile.getAttribute('full-path');
    if (!packagePath) throw new Error('Container does not have package path');
    this.packagePath = packagePath;
  }

  private parsePackage(doc: Document) {
    const metadata = getEl(doc, 'metadata');
    if (!metadata) throw new Error('Package does not have metadata');
    const manifest = getEl(doc, 'manifest');
    if (!manifest) throw new Error('Package does not have manifest');
    const spine = getEl(doc, 'spine');
    if (!spine) throw new Error('Package does not have spine');

    this.packageDoc = doc;
    this.parseManifest(manifest);
    this.parseSpine(spine);
  }

  private parseManifest(el: Element) {
    for (const itemEl of Array.from(el.getElementsByTagName('item'))) {
      const id = itemEl.getAttribute('id');
      if (!id) throw new Error('Manifest item does not have id');
      const href = itemEl.getAttribute('href');
      if (!href) throw new Error('Manifest item does not have href');
      const mediaType = itemEl.getAttribute('media-type');
      if (!mediaType) throw new Error('Manifest item does not have media type');
      const overlay = itemEl.getAttribute('media-overlay');
      const properties = itemEl.getAttribute('properties');
      const fallback = itemEl.getAttribute('fallback');

      const itemBase: EpubItemBase = {
        id,
        href,
        mediaType,
        overlay,
        properties: this.parseProperties(properties),
        fallback,
      };
      this.items.set(id, itemBase as EpubItem);
    }

    const navHref = Array.from(this.items.values()).find(({ properties }) =>
      properties?.includes('nav'),
    )?.href;
    this.navigationPath = navHref && this.resolve(this.packagePath, navHref);
  }

  private parseSpine(el: Element) {
    for (const itemEl of Array.from(el.getElementsByTagName('itemref'))) {
      const idref = itemEl.getAttribute('idref');
      if (!idref) throw new Error('Spine itemref does not have idref');
      if (!this.items.has(idref))
        throw new Error('Spine itemref idref not in manifest');
      const linear = itemEl.getAttribute('linear');
      const properties = itemEl.getAttribute('properties');

      const itemref: EpubItemref = {
        idref,
        linear,
        properties: this.parseProperties(properties),
      };
      this.itemrefs.push(itemref);
    }
    const tocIdref = el.getAttribute('toc');
    if (tocIdref) {
      const tocItem = this.items.get(tocIdref);
      const tocItemHref = tocItem?.href;
      this.ncxPath = tocItemHref && this.resolve(this.packagePath, tocItemHref);
    }
  }

  private parseNavigationDocument(doc: Document) {
    const parseTocList = (olEl: Element): EpubNavItem[] => {
      const items: EpubNavItem[] = [];

      olEl.querySelectorAll(':scope > li').forEach((liEl) => {
        const linkEl = liEl.querySelector(':scope > a, :scope > span');
        if (!linkEl) throw new Error('Nav toc item does not have link');

        const item: EpubNavItem = {
          text: linkEl.textContent?.trim() || '',
          href: linkEl.getAttribute('href')?.split('#')[0] || '',
          children: [],
        };
        const childOlEl = liEl.querySelector(':scope > ol');
        if (childOlEl) item.children = parseTocList(childOlEl);
        items.push(item);
      });
      return items;
    };
    const navEls = Array.from(doc.getElementsByTagName('nav'));
    const tocNavEl =
      navEls.find((navEl) => navEl.getAttribute('epub:type') === 'toc') ??
      navEls.find((navEl) => navEl.id === 'toc'); // 为了兼容不标准的epub
    const tocOlEl = tocNavEl?.querySelector(':scope > ol');
    if (!tocOlEl) throw new Error('Nav toc not exist');
    this.navItems = parseTocList(tocOlEl);
  }

  private parseNcx(doc: Document) {
    Array.from(doc.getElementsByTagName('navPoint')).forEach((navPointEl) => {
      const navLabel = navPointEl.querySelector('navLabel');
      if (!navLabel) throw new Error('Nav point does not have label');
      const content = navPointEl.querySelector('content');
      if (!content) throw new Error('Nav point does not have content');

      const text = navLabel.textContent?.trim() || '';
      const href = content.getAttribute('src')?.split('#')[0] || '';

      const item: EpubNavItem = {
        text,
        href,
        children: [],
      };
      this.navItems.push(item);
    });
  }

  private async parseFile(file: File) {
    const { BlobReader, BlobWriter, ZipReader, TextWriter } = await import(
      '@zip.js/zip.js'
    );
    const reader = new ZipReader(new BlobReader(file));
    const entries = new Map(
      (await reader.getEntries()).map((obj) => [obj.filename, obj] as const),
    );

    const readDocWithType = async (
      path: string,
      type: DOMParserSupportedType,
    ) => {
      const entry = entries.get(path);
      if (!entry) throw new Error(`Entry not found: ${path}`);
      const text = await entry.getData!(new TextWriter());
      const parser = new DOMParser();
      return parser.parseFromString(text, type);
    };

    const readDoc = async (path: string) =>
      readDocWithType(path, 'application/xhtml+xml');
    const readDocLegacy = async (path: string) =>
      readDocWithType(path, 'text/html');

    const readBlob = async (path: string, type: string) => {
      const entry = entries.get(path);
      if (!entry) throw new Error(`Entry not found: ${path}`);
      const data = await entry.getData!(new BlobWriter());
      return new Blob([data], { type });
    };

    this.parseContainer(await readDoc(CONTAINER_PATH));
    this.parsePackage(await readDoc(this.packagePath));

    if (this.navigationPath) {
      this.parseNavigationDocument(await readDoc(this.navigationPath));
    } else if (this.ncxPath) {
      this.parseNcx(await readDoc(this.ncxPath));
    }

    for (const item of this.items.values()) {
      const path = this.resolve(this.packagePath, item.href);

      if (item.mediaType === 'application/xhtml+xml') {
        (item as EpubItemDoc).doc = await readDoc(path);
      } else if (item.mediaType === 'text/html') {
        item.mediaType = 'application/xhtml+xml';
        (item as EpubItemDoc).doc = await readDocLegacy(path);
      } else {
        (item as EpubItemBlob).blob = await readBlob(path, item.mediaType);
      }
    }
  }

  static async fromFile(file: File) {
    const epub = new Epub(file.name, file);
    await epub.parseFile(file);
    StandardNovel.fromEpub(epub);
    return epub;
  }

  async clone() {
    if (!this.rawFile)
      throw new Error('Cannot clone manually constructed file.');
    return Epub.fromFile(this.rawFile);
  }

  // ==============================
  // 将内容写入文件
  // ==============================

  private fixHrefExtension() {
    const getFileExtension = (path: string) => {
      const match = path.match(/\.([a-zA-Z0-9]+)$/);
      if (match) return match[1];
      return '';
    };

    const mimeToExtensions: { [key: string]: string[] } = {
      'image/gif': ['.gif'],
      'image/jpeg': ['.jpg', '.jpeg', '.jpe', '.jif', '.jfif'],
      'image/png': ['.png'],
      'image/svg+xml': ['.svg'],
      'image/webp': ['.webp'],
    };
    for (const item of this.items.values()) {
      const mime = item.mediaType;
      if (mime in mimeToExtensions) {
        const extensions = mimeToExtensions[mime];
        const ext = getFileExtension(item.href);
        if (!extensions.includes(ext)) {
          const newHref = item.href.replace(/\.([a-zA-Z0-9]+)$/, extensions[0]);
          this.updateHref(item.href, newHref);
          item.href = newHref;
        }
      }
    }
  }

  private updatePackage() {
    const packageDocNs = this.packageDoc.documentElement.namespaceURI;
    const items = [...this.items.values()].map((item) => {
      const itemEl = this.packageDoc.createElementNS(packageDocNs, 'item');
      itemEl.setAttribute('id', item.id);
      itemEl.setAttribute('href', item.href);
      itemEl.setAttribute('media-type', item.mediaType);
      if (item.overlay) itemEl.setAttribute('media-overlay', item.overlay);
      if (item.properties)
        itemEl.setAttribute('properties', item.properties.join(' '));
      if (item.fallback) itemEl.setAttribute('fallback', item.fallback);
      return itemEl;
    });
    const manifest = getEl(this.packageDoc, 'manifest')!;
    manifest.replaceChildren(...items);
  }

  async toBlob() {
    // this.fixHrefExtension();
    this.updatePackage();

    const { BlobReader, BlobWriter, ZipWriter, TextReader } = await import(
      '@zip.js/zip.js'
    );

    const zipBlobWriter = new BlobWriter();
    const writer = new ZipWriter(zipBlobWriter);

    const writeText = (path: string, text: string) =>
      writer.add(path, new TextReader(text));
    const writeBlob = (path: string, blob: Blob) =>
      writer.add(path, new BlobReader(blob));
    const writeDoc = (path: string, doc: Document) =>
      writeText(path, new XMLSerializer().serializeToString(doc));

    await writeText(MIMETYPE_PATH, MIMETYPE_TEMPLATE);
    await writeText(
      CONTAINER_PATH,
      CONTAINER_TEMPLATE.replace('OEBPS/content.opf', this.packagePath),
    );
    await writeDoc(this.packagePath, this.packageDoc);

    for (const item of this.items.values()) {
      const path = this.resolve(this.packagePath, item.href);
      if ('doc' in item) {
        await writeDoc(path, item.doc);
      } else {
        await writeBlob(path, item.blob);
      }
    }

    await writer.close();

    const zipBlob = await zipBlobWriter.getData();
    return zipBlob;
  }

  // ==============================
  // API
  // ==============================

  iterDocInSpine() {
    return this.itemrefs
      .map((itemref) => this.items.get(itemref.idref)!)
      .filter((item) => 'doc' in item);
  }
  iterDoc() {
    return [...this.items.values()].filter((item) => 'doc' in item);
  }
  iterBlob(mediaTypes: string[]) {
    return [...this.items.values()]
      .filter((item) => 'blob' in item)
      .filter((item) => mediaTypes.includes(item.mediaType));
  }
  iterImage() {
    return this.iterBlob(MIME.IMAGE);
  }

  updateImage(id: string, blob: Blob) {
    if (!MIME.IMAGE.includes(blob.type)) return;

    const item = this.items.get(id);
    if (!item || !('blob' in item) || !MIME.IMAGE.includes(item.mediaType))
      return;

    item.mediaType = blob.type;
    item.blob = blob;
  }

  cleanStyle() {
    for (const item of this.iterBlob(MIME.CSS)) {
      item.blob = new Blob([''], { type: item.mediaType });
    }
  }

  getText() {
    const contents: string[] = [];
    for (const item of this.iterDocInSpine()) {
      Array.from(item.doc.getElementsByClassName('rt')).forEach((node) =>
        node.parentNode!.removeChild(node),
      );
      contents.push(item.doc.body.textContent ?? '');
    }
    return contents.join('\n');
  }
}
