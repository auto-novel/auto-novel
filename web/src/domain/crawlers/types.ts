/*
interface WebNovelProvider {
    suspend fun getRank(options: Map<String, String>): Page<RemoteNovelListItem>
    suspend fun getMetadata(novelId: String): RemoteNovelMetadata
    suspend fun getChapter(novelId: String, chapterId: String): RemoteChapter
}
*/
export interface WebNovelProvider {
  getRank(
    options: Record<string, string>,
  ): Promise<Page<RemoteNovelListItem> | null>;
  getMetadata(novelId: string): Promise<RemoteNovelMetadata | null>;
  getChapter(novelId: string, chapterId: string): Promise<RemoteChapter | null>;
}

export type Page<T> = {
  items: T[];
  hasNext: boolean;
};

/*
data class RemoteNovelListItem(
    val novelId: String,
    val title: String,
    val attentions: List<WebNovelAttention>,
    val keywords: List<String>,
    val extra: String,
)
*/
export type RemoteNovelListItem = {
  novelId: string;
  title: string;
  attentions: WebNovelAttention[];
  keywords: string[];
  extra: string;
};

/*
@Serializable
enum class WebNovelAttention {
    @SerialName("R15")
    R15,

    @SerialName("R18")
    R18,

    @SerialName("残酷描写")
    残酷描写,

    @SerialName("暴力描写")
    暴力描写,

    @SerialName("性描写")
    性描写,
}
*/
export enum WebNovelAttention {
  R15 = 'R15',
  R18 = 'R18',
  Cruelty = '残酷描写',
  Violence = '暴力描写',
  SexualContent = '性描写',
}

/*
@Serializable
data class WebNovelAuthor(
    val name: String,
    val link: String?,
)
*/
export type WebNovelAuthor = {
  name: string;
  link: string | null;
};

/*
@Serializable
enum class WebNovelType {
    @SerialName("连载中")
    连载中,

    @SerialName("已完结")
    已完结,

    @SerialName("短篇")
    短篇,
}
*/
export enum WebNovelType {
  Ongoing = '连载中',
  Completed = '已完结',
  ShortStory = '短篇',
}

/*
data class TocItem(
    val title: String,
    val chapterId: String? = null,
    val createAt: Instant? = null,
)
*/
export type TocItem = {
  title: string;
  chapterId: string | null;
  createAt: string | null;
};

/*
data class RemoteChapter(
    val paragraphs: List<String>,
)
*/
export type RemoteChapter = {
  paragraphs: string[];
};

/*
data class RemoteNovelMetadata(
    val title: String,
    val authors: List<WebNovelAuthor>,
    val type: WebNovelType,
    val attentions: List<WebNovelAttention>,
    val keywords: List<String>,
    val points: Int?,
    val totalCharacters: Int,
    val introduction: String,
    val toc: List<TocItem>,
) {
    data class TocItem(
        val title: String,
        val chapterId: String? = null,
        val createAt: Instant? = null,
    )
}
*/
export type RemoteNovelMetadata = {
  title: string;
  authors: WebNovelAuthor[];
  type: WebNovelType;
  attentions: WebNovelAttention[];
  keywords: string[];
  points: number | null;
  totalCharacters: number;
  introduction: string;
  toc: TocItem[];
};

// Errors
export const NovelRateLimitedException = () => new Error('源站获取频率太快');
export const NovelAccessDeniedException = () =>
  new Error('当前账号无法获取该小说资源');
export const NovelIdShouldBeReplacedException = (
  providerId: string,
  targetNovelId: string,
) => new Error('当前账号无法获取该小说资源');
