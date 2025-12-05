import Express, { Router } from 'express';
import { Providers } from '@/index';
import ky from 'ky';
import { ProxyAgent } from 'undici';

const router: Router = Express.Router({ mergeParams: true });

const DEBUG_PROXY = 'http://localhost:8899';

function getClientWithProxy(proxyUrl: string) {
  const proxyAgent = new ProxyAgent(proxyUrl);
  const client = ky.create({
    // @ts-expect-error - dispatcher is not in the type definition, but it's passed through to fetch.
    dispatcher: proxyAgent,
  });
  return client;
}

router.get('/metadata', async (req, res) => {
  const { providerId, novelId } = req.params as any;
  const providerInitFn = Providers[providerId];
  if (!providerInitFn) {
    res.status(400).send({ error: 'Unknown providerId' });
    return;
  }
  const client = getClientWithProxy(DEBUG_PROXY);
  const provider = providerInitFn(client);
  const ret = await provider.getMetadata(novelId);
  res.json(ret);
});

router.get('/rank', async (req, res) => {
  const { providerId, novelId } = req.params as any;
  const providerInitFn = Providers[providerId];
  if (!providerInitFn) {
    res.status(400).send({ error: 'Unknown providerId' });
    return;
  }
  const client = getClientWithProxy(DEBUG_PROXY);
  const provider = providerInitFn(client);
  const ret = await provider.getRank(req.body);
  res.json(ret);
});

router.get('/:chapterId/chapter', async (req, res) => {
  const { providerId, novelId, chapterId } = req.params as any;
  const providerInitFn = Providers[providerId];
  if (!providerInitFn) {
    res.status(400).send({ error: 'Unknown providerId' });
    return;
  }
  const client = getClientWithProxy(DEBUG_PROXY);
  const provider = providerInitFn(client);
  const ret = await provider.getChapter(novelId, chapterId);
  res.json(ret);
});

export default router;
