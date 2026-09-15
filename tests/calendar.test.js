// 手机系统日历强提醒助手专项单元测试套件
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeCalendarTime,
  addTodoToPhoneCalendar,
  DEFAULT_REMINDER_HOUR,
  DEFAULT_REMINDER_MINUTE
} = require('../utils/calendar');

test('系统日历时间戳运算与边界容错测试', async (t) => {
  await t.test('正常未来日期应严格定位至 09:00:00 且跨度为 1800 秒', () => {
    const fixedNow = new Date(2026, 8, 15, 8, 0, 0); // 2026-09-15 08:00
    const res = computeCalendarTime('2026-09-20', fixedNow);
    assert.ok(res);
    assert.equal(typeof res.startTime, 'number');
    assert.equal(typeof res.endTime, 'number');
    assert.equal(res.endTime - res.startTime, 1800); // 30 分钟

    const startDate = new Date(res.startTime * 1000);
    assert.equal(startDate.getFullYear(), 2026);
    assert.equal(startDate.getMonth(), 8); // 9月 (0-indexed)
    assert.equal(startDate.getDate(), 20);
    assert.equal(startDate.getHours(), DEFAULT_REMINDER_HOUR);
    assert.equal(startDate.getMinutes(), DEFAULT_REMINDER_MINUTE);
  });

  await t.test('当天截止且当前时间已逾 09:00 时应自动顺延 10 分钟', () => {
    const afternoonNow = new Date(2026, 8, 15, 14, 20, 0); // 2026-09-15 14:20
    const res = computeCalendarTime('2026-09-15', afternoonNow);
    assert.ok(res);
    const startDate = new Date(res.startTime * 1000);
    // 应比当前时间晚 10 分钟 (14:30)
    assert.equal(startDate.getHours(), 14);
    assert.equal(startDate.getMinutes(), 30);
  });

  await t.test('非法或格式不合规的日期应安全返回 null', () => {
    assert.equal(computeCalendarTime(''), null);
    assert.equal(computeCalendarTime('invalid-date'), null);
    assert.equal(computeCalendarTime('2026-02-31'), null);
  });
});

test('addTodoToPhoneCalendar 接口包装与调用契约测试', async (t) => {
  await t.test('缺少标题或截止日期时应直接拦截并返回 invalid_param', async () => {
    const r1 = await addTodoToPhoneCalendar(null);
    assert.equal(r1.success, false);
    assert.equal(r1.status, 'invalid_param');

    const r2 = await addTodoToPhoneCalendar({ title: '没有日期' });
    assert.equal(r2.success, false);
    assert.equal(r2.status, 'invalid_param');
  });

  await t.test('在 Mock 微信环境中验证调用参数完整度与成功回调', async () => {
    let capturedOptions = null;
    global.wx = {
      addPhoneCalendar(options) {
        capturedOptions = options;
        options.success({ errMsg: 'addPhoneCalendar:ok' });
      }
    };

    const res = await addTodoToPhoneCalendar({
      title: '上线发布部署',
      desc: '检查线上静态资源与数据库索引',
      dueDate: '2026-09-25',
      priority: 'high'
    });

    assert.equal(res.success, true);
    assert.equal(res.status, 'ok');
    assert.ok(capturedOptions);
    assert.equal(capturedOptions.title, '待办提醒：上线发布部署');
    assert.equal(capturedOptions.alarm, true);
    assert.equal(capturedOptions.alarmOffset, 0);
    assert.match(capturedOptions.description, /高优先级/);
    assert.match(capturedOptions.description, /豆芽待办/);
  });

  await t.test('用户拒绝或取消系统日历权限时应柔性标记 cancelled 而不抛异常', async () => {
    global.wx = {
      addPhoneCalendar(options) {
        options.fail({ errMsg: 'addPhoneCalendar:fail cancel' });
      }
    };

    const res = await addTodoToPhoneCalendar({
      title: '买牛奶',
      dueDate: '2026-09-26'
    });

    assert.equal(res.success, false);
    assert.equal(res.status, 'cancelled');
  });
});
