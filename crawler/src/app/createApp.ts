import Express, { Router, Express as ExpressApp } from 'express';
import type { AppConfig } from './config';

export type AppDependencies = {
  router: Router;
};

export function createApp(
  config: AppConfig,
  deps: AppDependencies,
): ExpressApp {
  const app = Express();
  app.locals.config = config;
  app.use('/', deps.router);
  return app;
}
