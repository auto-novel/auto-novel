import {
  CrawlerAuthError,
  CrawlerHttpError,
  CrawlerInputError,
} from '@auto-novel/crawler';
import * as z from 'zod';
import Express, { Router } from 'express';
import type { CrawlerService } from '@/services/crawler';
import { ProviderIdSchema } from '@/services/providers';

export function createCrawlerRouter(crawlerService: CrawlerService): Router {
  const router: Router = Express.Router({ mergeParams: true });

  router.use(requestLogger);

  router.get(
    '/healthz',
    asyncHandler((_, res) =>
      res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: Date.now(),
      }),
    ),
  );

  router.get(
    '/metadata/:providerId/:novelId',
    asyncHandler(async (req, res) => {
      const { providerId, novelId } = metadataParamsSchema.parse(req.params);
      const entity = await crawlerService.getMetadata(providerId, novelId);
      res.json(entity);
    }),
  );

  router.get(
    '/rank/:providerId',
    asyncHandler(async (req, res) => {
      const { providerId } = rankParamsSchema.parse(req.params);
      const normalizedQuery = normalizeQuery(
        req.query as Record<string, string | string[] | undefined>,
      );
      const validatedQuery = rankQuerySchema.parse(normalizedQuery);
      const filteredQuery = Object.fromEntries(
        Object.entries(validatedQuery).filter(
          ([, value]) => value !== undefined,
        ),
      ) as Record<string, string>;
      console.log(providerId, filteredQuery);
      const entity = await crawlerService.getRank(providerId, filteredQuery);
      res.json(entity);
    }),
  );

  router.get(
    '/chapter/:providerId/:novelId/:chapterId',
    asyncHandler(async (req, res) => {
      const { providerId, novelId, chapterId } = chapterParamsSchema.parse(
        req.params,
      );
      const entity = await crawlerService.getChapter(
        providerId,
        novelId,
        chapterId,
      );
      res.json(entity);
    }),
  );

  router.use(errorHandler);

  return router;
}

function requestLogger(
  req: Express.Request,
  res: Express.Response,
  next: Express.NextFunction,
) {
  const start = Date.now();
  res.once('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `[Crawler] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`,
    );
  });
  next();
}

function asyncHandler(handler: Express.RequestHandler): Express.RequestHandler {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}

function errorHandler(
  error: unknown,
  req: Express.Request,
  res: Express.Response,
  _next: Express.NextFunction,
) {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      error: 'Invalid request parameters',
      issues: error.issues.map(({ path, message }: z.ZodIssue) => ({
        path,
        message,
      })),
    });
    return;
  }

  if (error instanceof CrawlerInputError) {
    res.status(400).json({ error: error.message });
    return;
  }

  if (error instanceof CrawlerAuthError) {
    res.status(403).json({ error: error.message });
    return;
  }

  if (error instanceof CrawlerHttpError) {
    res.status(502).json({
      error: error.message,
      upstreamStatus: error.status,
      upstreamUrl: error.url,
    });
    return;
  }

  console.error('CrawlerService request failed', {
    message: (error as Error).message,
    path: req.originalUrl,
    method: req.method,
  });
  res.status(500).json({ error: 'Internal server error' });
}

function normalizeQuery(query: Record<string, string | string[] | undefined>) {
  return Object.entries(query).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      if (typeof value === 'string') {
        acc[key] = value;
      } else if (Array.isArray(value) && value.length > 0) {
        acc[key] = value[0];
      } else if (value !== undefined && value !== null) {
        acc[key] = String(value);
      }
      return acc;
    },
    {},
  );
}

const metadataParamsSchema = z.object({
  providerId: ProviderIdSchema,
  novelId: z.string().min(1),
});

const chapterParamsSchema = metadataParamsSchema.extend({
  chapterId: z.string().min(1),
});

const rankParamsSchema = z.object({
  providerId: ProviderIdSchema,
});

const rankQuerySchema = z
  .object({
    genre: z.string().min(1).optional(),
    range: z.string().min(1).optional(),
    status: z.string().min(1).optional(),
    type: z.string().min(1).optional(),
    page: z
      .string()
      .regex(/^[0-9]+$/)
      .optional(),
  })
  .strict();
