import { describe, it, expect, beforeEach } from 'vitest';
import { SegmentQueue, type SegmentTask } from '../src/pipeline/queue';

describe('SegmentQueue', () => {
  let queue: SegmentQueue;
  const HWM = 3; // 测试用高水位线

  // 模拟数据的辅助函数
  const createTask = (id: string): SegmentTask => ({
    segment: { id, order: 0, lines: [`content-${id}`] },
    observer: {
      start: () => {},
      complete: () => {},
      error: () => {},
    },
    resolve: () => {},
    reject: () => {},
  });

  beforeEach(() => {
    queue = new SegmentQueue();
    queue.setHighWaterMark(HWM);
  });

  // --- 场景 1：基础功能 ---
  it('应该能正常入队和出队 (FIFO)', async () => {
    await queue.enqueueAll([createTask('1'), createTask('2')]);

    const t1 = await queue.dequeue();
    const t2 = await queue.dequeue();

    expect(t1.segment.id).toBe('1');
    expect(t2.segment.id).toBe('2');
    expect(queue.length).toBe(0);
  });

  // --- 场景 2：消费者等待 ---
  it('当队列为空时，dequeue 应该等待直到有新数据', async () => {
    const dequeuePromise = queue.dequeue();

    // 模拟一段延迟后入队
    await queue.enqueueAll([createTask('async-1')]);

    const result = await dequeuePromise;
    expect(result.segment.id).toBe('async-1');
  });

  it('条件出队跳过不匹配的队首，并在退回时只唤醒匹配消费者', async () => {
    const restricted = { ...createTask('remote'), trustedOnly: true };
    const ordinary = createTask('local');
    const accepts = (task: SegmentTask) => !task.trustedOnly;
    const controller = new AbortController();
    const local = queue.dequeue(controller.signal, accepts);
    const remote = queue.dequeue();
    await queue.enqueueAll([restricted]);
    expect(await remote).toBe(restricted);
    // 退回的受限任务不能交给仍在等待的普通消费者。
    queue.requeue([restricted]);
    await queue.enqueueAll([ordinary]);
    expect(await local).toBe(ordinary);
    expect(await queue.dequeue()).toBe(restricted);
    queue.ack(ordinary);
    queue.ack(restricted);
  });

  it('等待恢复后水位再次下调，不破坏计数或重复入队', async () => {
    queue.setHighWaterMark(4);
    await queue.enqueueAll(['1', '2', '3'].map(createTask));
    const enqueuing = queue.enqueueAll(['4', '5'].map(createTask));
    queueMicrotask(() => queue.setHighWaterMark(1));
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.length).toBe(3);

    const received: string[] = [];
    for (let i = 0; i < 5; i++) {
      const task = await queue.dequeue();
      received.push(task.segment.id);
      queue.ack(task);
    }
    await enqueuing;
    expect(received).toEqual(['1', '2', '3', '4', '5']);
    expect(queue.length).toBe(0);
  });

  // --- 场景 3：高水位线背压测试 ---
  it('当达到高水位线时，waitUntilBelowHighWaterMark 应该阻塞', async () => {
    // 1. 填满到水位线 (3个)
    await queue.enqueueAll([createTask('1'), createTask('2'), createTask('3')]);

    let isResolved = false;
    const waitPromise = queue.waitUntilBelowHighWaterMark().then(() => {
      isResolved = true;
    });
    const secondWait = queue.waitUntilBelowHighWaterMark();

    await Promise.resolve();
    expect(isResolved).toBe(false);

    // 取走但尚未完成的分段仍计入在途水位。
    const task = await queue.dequeue();
    await Promise.resolve();
    expect(isResolved).toBe(false);
    queue.ack(task);

    // 消费者完成分段后才释放水位。
    await Promise.all([waitPromise, secondWait]);
    expect(isResolved).toBe(true);
    expect(queue.length).toBe(2);
  });

  // --- 场景 4：批量入队瞬间唤醒多个消费者 ---
  it('批量入队时，应该同时唤醒多个排队的消费者', async () => {
    const p1 = queue.dequeue();
    const p2 = queue.dequeue();

    await queue.enqueueAll([createTask('a'), createTask('b'), createTask('c')]);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.segment.id).toBe('a');
    expect(r2.segment.id).toBe('b');
    expect(queue.length).toBe(1); // 剩下一个 c 在队列里
  });
});
