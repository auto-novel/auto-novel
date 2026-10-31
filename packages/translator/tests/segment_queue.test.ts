import { describe, it, expect, beforeEach } from 'vitest';
import { DefaultSegmentQueue } from '../src/segment';
import type { Segment } from '../src/types';

describe('DefaultSegmentQueue', () => {
  let queue: DefaultSegmentQueue;
  const HWM = 3; // 设置高水位线为 3，方便测试

  // 模拟数据的辅助函数
  const createSegment = (id: string): Segment =>
    ({ id, text: `content-${id}` }) as any;

  beforeEach(() => {
    queue = new DefaultSegmentQueue(HWM);
  });

  // --- 场景 1：基础功能 ---
  it('应该能正常入队和出队 (FIFO)', async () => {
    queue.enqueueAll([createSegment('1'), createSegment('2')]);

    const s1 = await queue.dequeue();
    const s2 = await queue.dequeue();

    expect(s1.id).toBe('1');
    expect(s2.id).toBe('2');
    expect(queue.length).toBe(0);
  });

  // --- 场景 2：消费者等待 ---
  it('当队列为空时，dequeue 应该等待直到有新数据', async () => {
    const dequeuePromise = queue.dequeue();

    // 模拟一段延迟后入队
    const mockData = createSegment('async-1');
    queue.enqueueAll([mockData]);

    const result = await dequeuePromise;
    expect(result.id).toBe('async-1');
  });

  // --- 场景 3：高水位线背压测试 ---
  it('当达到高水位线时，waitUntilBelowHighWaterMark 应该阻塞', async () => {
    // 1. 填满到水位线 (3个)
    await queue.enqueueAll([
      createSegment('1'),
      createSegment('2'),
      createSegment('3'),
    ]);

    let isResolved = false;
    const waitPromise = queue.waitUntilBelowHighWaterMark().then(() => {
      isResolved = true;
    });

    await Promise.resolve();
    expect(isResolved).toBe(false);

    // 取走但尚未完成的分段仍计入在途水位。
    await queue.dequeue();
    await Promise.resolve();
    expect(isResolved).toBe(false);
    queue.ack();

    // 消费者完成分段后才释放水位。
    await waitPromise;
    expect(isResolved).toBe(true);
    expect(queue.length).toBe(2);
  });

  // --- 场景 4：批量入队瞬间唤醒多个消费者 ---
  it('批量入队时，应该同时唤醒多个排队的消费者', async () => {
    const p1 = queue.dequeue();
    const p2 = queue.dequeue();

    queue.enqueueAll([
      createSegment('a'),
      createSegment('b'),
      createSegment('c'),
    ]);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.id).toBe('a');
    expect(r2.id).toBe('b');
    expect(queue.length).toBe(1); // 剩下一个 c 在队列里
  });
});
