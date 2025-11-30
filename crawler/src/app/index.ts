import { Server } from 'node:http';
import { Command } from 'commander';

import manifest from '@/package.json';
import {
  createCrawlerRouter,
  createProxyRouter,
  CrawlerService,
  ProxyManager,
  ProxyStore,
} from '@/services';

import { loadConfig } from '@/config';
import { createApp } from '@/createApp';
import { mapValues } from 'lodash-es';

async function main() {
  const program = new Command();

  program
    .name('auto-novel-server-crawler')
    .description('Auto Novel Server Crawler')
    .version(manifest.version)
    .option(
      '-c, --config <path>',
      'Path to config file',
      process.env.CONFIG_PATH || 'config.json',
    );

  const { config: configPath } = program.parse().opts<{ config: string }>();

  const config = await loadConfig(configPath);

  const proxyStore = new ProxyStore(config.proxyDbPath);
  const proxyManager = new ProxyManager({
    store: proxyStore,
    defaultProxies: config.defaultProxies,
  });
  const crawlerService = new CrawlerService({
    proxyManager,
    headers: mapValues(config.providerConfig, (c) => c?.headers ?? {}),
  });

  const router = createCrawlerRouter(crawlerService);
  const proxyRouter = createProxyRouter(proxyManager);
  const app = createApp(config, { router });
  app.use('/proxies', proxyRouter);

  const server = app.listen(config.port, config.host, () => {
    console.log(`Server is running on http://${config.host}:${config.port}`);
  });

  const shutdown = createGracefulShutdown(server, [() => proxyStore.close()]);

  app.post('/shutdown', async (req, res) => {
    console.log('Shutdown requested via API');

    res.status(202).json({
      message: 'Server is shutting down...',
      uptime: process.uptime(),
      timestamp: Date.now(),
    });

    setImmediate(() => {
      shutdown('api-request', 0).catch((err) => {
        console.error('Error during API shutdown:', err);
        process.exit(1);
      });
    });
  });

  try {
    await waitForServerClose(server);
  } catch (error) {
    console.error('Server terminated unexpectedly', error);
    await shutdown('server-error', 1);
    throw error;
  }

  await shutdown('server-closed', 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exitCode = 1;
});

function waitForServerClose(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.once('close', resolve);
    server.once('error', reject);
  });
}

function createGracefulShutdown(
  server: Server,
  closers: Array<() => Promise<void> | void> = [],
) {
  let isShuttingDown = false;
  let cleanupPromise: Promise<void> | null = null;

  const runClosers = () => {
    if (!cleanupPromise) {
      cleanupPromise = Promise.allSettled(
        closers.map((closer) => Promise.resolve(closer())),
      ).then(() => undefined);
    }
    return cleanupPromise;
  };

  server.once('close', () => void runClosers());

  const closeServer = () =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

  const shutdown = async (reason: string, exitCode: number) => {
    if (isShuttingDown) {
      return runClosers();
    }
    isShuttingDown = true;
    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
    console.log(`Shutting down (${reason})`);
    try {
      await closeServer();
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ERR_SERVER_NOT_RUNNING') {
        console.error('Failed to stop server gracefully', error);
      }
    }
    await runClosers();
  };

  const handleSignal = (signal: 'SIGINT' | 'SIGTERM') => {
    void shutdown(signal, 0);
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  return shutdown;
}
