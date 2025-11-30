import Express, { Router } from 'express';
import * as z from 'zod';

import { ProxyConfigSchema, ProxyManager } from './manager';

const proxyBodySchema = ProxyConfigSchema.strict();

export function createProxyRouter(proxyManager: ProxyManager): Router {
  const router = Express.Router({ mergeParams: true });
  router.use(Express.json());

  router.get('/', (_req, res) => {
    try {
      res.json(proxyManager.list());
    } catch (error) {
      handleUnexpectedError(error, res, 'Failed to list proxies');
    }
  });

  router.post('/', (req, res) => {
    const result = proxyBodySchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Invalid proxy configuration',
        issues: result.error.issues.map(({ path, message }) => ({
          path,
          message,
        })),
      });
      return;
    }

    try {
      const state = proxyManager.add(result.data);
      res.status(201).json(state);
    } catch (error) {
      handleUnexpectedError(error, res, 'Failed to add proxy');
    }
  });

  router.delete('/:id', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid proxy id' });
      return;
    }

    try {
      proxyManager.remove(id);
      res.status(204).send();
    } catch (error) {
      handleUnexpectedError(error, res, 'Failed to remove proxy');
    }
  });

  return router;
}

function handleUnexpectedError(
  error: unknown,
  res: Express.Response,
  message: string,
) {
  console.error(message, error);
  res.status(500).json({ error: message });
}
