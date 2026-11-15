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

  it('水位下调只阻止新派发，不取消执行中分段；排队重排可以替换准入者', async () => {
    queue.setHighWaterMark(2);
    let priority = 1;
    const first = createTask('first');
    const second = createTask('second');
    const head = { ...createTask('head'), getPriority: () => priority };
    const admission = queue.enqueueAll([first, second]);
    await admission;
    expect(await queue.dequeue()).toBe(first);
    const newAdmission = queue.enqueueAll([head]);
    priority = -1;
    queue.refresh();
    await newAdmission;
    queue.setHighWaterMark(1);
    let dispatched = false;
    const next = queue.dequeue().then((task) => {
      dispatched = true;
      return task;
    });
    await Promise.resolve();
    expect(dispatched).toBe(false);
    queue.ack(first);
    expect(await next).toBe(head);
    queue.ack(head);
    expect(await queue.dequeue()).toBe(second);
    queue.ack(second);
    expect(queue.needsInput()).toBe(true);
  });

  it('条件出队跳过不匹配的队首，并在退回时只唤醒匹配消费者', async () => {
    const restricted = { ...createTask('remote'), trustedOnly: true };
    const ordinary = createTask('local');
    const accepts = (task: Pick<SegmentTask, 'trustedOnly'>) =>
      !task.trustedOnly;
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
    // 未准入分段仍保留在暂存区，降水位不会丢弃输入。
    expect(queue.length).toBe(5);

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
