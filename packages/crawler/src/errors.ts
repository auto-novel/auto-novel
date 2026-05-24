export class CrawlerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class CrawlerParseError extends CrawlerError {}

export class CrawlerAuthError extends CrawlerError {}

export class CrawlerHttpError extends CrawlerError {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
  }
}

export class CrawlerInputError extends CrawlerError {}
