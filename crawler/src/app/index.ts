import Express from 'express';
import { Command } from 'commander';
import router from '@/routes';

import fs from 'fs/promises';

import manifest from '@/package.json';
import { exit } from 'process';

import * as z from 'zod';

const ConfigSchema = z.object({
  host: z.string().default('127.0.0.1'),
  port: z.number().default(3000),
});

async function main() {
  const program = new Command();

  program
    .name('auto-novel-server-crawler')
    .description('Auto Novel Server Crawler')
    .version(manifest.version);

  program.option('-c, --config <path>', 'Path to config file', 'config.json');

  const configPath = program.parse().opts().config;

  const configStr = await fs.readFile(configPath, 'utf-8').catch(() => null);
  const configPart = configStr ? JSON.parse(configStr) : {};
  const config = ConfigSchema.parse(configPart);

  await fs
    .writeFile(configPath, JSON.stringify(config, null, 2))
    .catch((err) => {
      console.error('Failed to write config file:', err);
    });

  const app = Express();
  app.get('/ping', async (_, res) => res.send('pong'));
  app.get('/test', async (req, res) =>
    res.json({
      ip: req.ip,
      headers: req.headers,
      query: req.query,
      params: req.params,
    }),
  );
  app.get('/version', async (_, res) => {
    res.send(manifest.version);
  });
  app.use('/:providerId/:novelId', router);
  return new Promise<void>((resolve, reject) => {
    const server = app.listen(config.port, config.host, () => {
      console.log(`Server is running on http://${config.host}:${config.port}`);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shutdown = async (_: any, res: any) => {
      res.send('Server is gracefully shutting down...');
      server.close();
    };
    app.get('/quit', shutdown);
    app.get('/shutdown', shutdown);

    server.on('close', () => resolve());
    server.on('error', (err) => reject(err));
  });
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    exit(1);
  })
  .finally(() => {
    console.log('Server Crawler successfully exited.');
    exit(0);
  });
