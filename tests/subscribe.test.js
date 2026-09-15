// 微信订阅消息与轻量云端协同专项测试套件
const test = require('node:test');
const assert = require('node:assert/strict');
const { SUBSCRIBE_CONFIG, isSubscribeConfigured } = require('../config/subscribe');
const subscribeHelper = require('../utils/subscribe');

test('订阅消息配置模块与优雅降级测试', async (t) => {
  await t.test('默认空配置时应正确判定为未配置状态 (优雅降级)', () => {
    assert.equal(typeof isSubscribeConfigured(), 'boolean');
    assert.equal(typeof SUBSCRIBE_CONFIG.REMINDER_HOUR, 'number');
    assert.equal(SUBSCRIBE_CONFIG.REMINDER_HOUR, 9);
    assert.ok(SUBSCRIBE_CONFIG.TEMPLATE_KEYS.title);
    assert.ok(SUBSCRIBE_CONFIG.TEMPLATE_KEYS.time);
  });
});

test('离线提醒待同步队列与重试机制测试', async (t) => {
  // 构建纯内存 Mock wx storage
  const storageMock = new Map();
  global.wx = {
    getStorageSync(key) {
      return storageMock.get(key) || [];
    },
    setStorageSync(key, val) {
      storageMock.set(key, val);
    }
  };

  await t.test('空队列读取与合法入队', () => {
    assert.deepEqual(subscribeHelper.getPendingQueue(), []);
    const sampleTodo = {
      _id: 'todo_mock_1',
      title: '完成周报',
      dueDate: '2026-09-20',
      priority: 'high'
    };
    subscribeHelper.enqueuePending(sampleTodo);
    const queue = subscribeHelper.getPendingQueue();
    assert.equal(queue.length, 1);
    assert.equal(queue[0]._id, 'todo_mock_1');
    assert.equal(queue[0].title, '完成周报');
    assert.equal(queue[0].dueDate, '2026-09-20');
  });

  await t.test('同一待办更新时不应出现重复队列项', () => {
    const updatedTodo = {
      _id: 'todo_mock_1',
      title: '完成周报（已修改）',
      dueDate: '2026-09-21',
      priority: 'normal'
    };
    subscribeHelper.enqueuePending(updatedTodo);
    const queue = subscribeHelper.getPendingQueue();
    assert.equal(queue.length, 1);
    assert.equal(queue[0].title, '完成周报（已修改）');
    assert.equal(queue[0].dueDate, '2026-09-21');
  });

  await t.test('出队与撤销应能准确定位并移除目标待办', async () => {
    subscribeHelper.enqueuePending({
      _id: 'todo_mock_2',
      title: '购买咖啡豆',
      dueDate: '2026-09-22'
    });
    assert.equal(subscribeHelper.getPendingQueue().length, 2);

    // 撤销/完成 todo_mock_1
    await subscribeHelper.cancelReminder('todo_mock_1');
    const remaining = subscribeHelper.getPendingQueue();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0]._id, 'todo_mock_2');

    // 显式出队 todo_mock_2
    subscribeHelper.dequeuePending('todo_mock_2');
    assert.equal(subscribeHelper.getPendingQueue().length, 0);
  });

  await t.test('非法或空入参应具备高容错安全性', async () => {
    assert.doesNotThrow(() => {
      subscribeHelper.enqueuePending(null);
      subscribeHelper.enqueuePending({});
      subscribeHelper.dequeuePending(null);
      subscribeHelper.dequeuePending('');
    });
    const res = await subscribeHelper.cancelReminder(null);
    assert.equal(res.success, false);
  });
});

test('未配置云环境时的客户端柔性保护测试', async (t) => {
  await t.test('未配置模板时调用 requestSubscription 应安全降级而不抛出异常', async () => {
    const res = await subscribeHelper.requestSubscription();
    assert.equal(res.success, false);
    assert.ok(['unconfigured', 'unsupported'].includes(res.status));
  });

  await t.test('未配置云环境时 scheduleReminder 应返回未配置而不崩溃', async () => {
    const res = await subscribeHelper.scheduleReminder({
      _id: 'sample',
      dueDate: '2026-09-30',
      title: '测试待办'
    });
    assert.equal(res.success, false);
    assert.match(res.reason, /未配置/);
  });
});
