const test = require('node:test');
const assert = require('node:assert/strict');
const { computeCalendarTime, addTodoToPhoneCalendar } = require('../utils/calendar');

const todo = { title: '提交报告', desc: '带上附件', dueDate: '2099-09-20', priority: 'high' };

function useWx(t, implementation) {
  const previous = global.wx;
  global.wx = implementation;
  t.after(() => {
    if (previous === undefined) delete global.wx;
    else global.wx = previous;
  });
}

test('未来截止日在设备本地时间 09:00 开始，日程持续 30 分钟', () => {
  assert.deepEqual(computeCalendarTime('2026-09-20', new Date(2026, 8, 15, 8)), {
    startTime: new Date(2026, 8, 20, 9).getTime() / 1000,
    endTime: new Date(2026, 8, 20, 9, 30).getTime() / 1000
  });
});

test('已过提醒时间顺延十分钟，包括跨午夜', () => {
  const now = new Date(2026, 8, 20, 23, 55);
  assert.equal(computeCalendarTime('2026-09-20', now).startTime,
    new Date(2026, 8, 21, 0, 5).getTime() / 1000);
});

test('无效日期不能创建日程', () => {
  assert.equal(computeCalendarTime('2026-02-31'), null);
  assert.equal(computeCalendarTime(''), null);
});

test('不能把 ID 或更新结果误当成待办写入日历', async (t) => {
  useWx(t, { addPhoneCalendar() { assert.fail('无效待办不能调用日历'); } });
  assert.equal((await addTodoToPhoneCalendar('todo-id')).status, 'invalid_param');
  assert.equal((await addTodoToPhoneCalendar({ updated: 1 })).status, 'invalid_param');
});

test('隐私授权成功后创建带提醒的系统日程', async (t) => {
  let authorize;
  const events = [];
  useWx(t, {
    requirePrivacyAuthorize(options) { authorize = options; },
    addPhoneCalendar(options) {
      events.push(options);
      options.success({ errMsg: 'addPhoneCalendar:ok' });
    }
  });
  const pending = addTodoToPhoneCalendar(todo);
  assert.equal(events.length, 0, '未同意隐私前不能写日历');
  authorize.success({});
  const result = await pending;
  assert.equal(result.success, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].title, '待办提醒：提交报告');
  assert.equal(events[0].startTime, new Date(2099, 8, 20, 9).getTime() / 1000);
  assert.equal(events[0].endTime, String(new Date(2099, 8, 20, 9, 30).getTime() / 1000));
  assert.equal(events[0].alarm, true);
  assert.equal(events[0].alarmOffset, 0);
});

test('拒绝隐私授权后停止调用，不再尝试日历写入', async (t) => {
  let writes = 0;
  useWx(t, {
    requirePrivacyAuthorize(options) {
      options.fail({ errno: 104, errMsg: 'requirePrivacyAuthorize:fail user deny' });
    },
    addPhoneCalendar(options) { writes += 1; options.success({}); }
  });
  const result = await addTodoToPhoneCalendar(todo);
  assert.equal(writes, 0);
  assert.equal(result.status, 'privacy_denied');
  assert.equal(result.success, false);
});

test('后台隐私声明缺失与用户拒绝分开报告', async (t) => {
  const error = { errno: 112, errMsg: 'addPhoneCalendar:fail api scope is not declared in the privacy agreement' };
  useWx(t, { addPhoneCalendar(options) { options.fail(error); } });
  const result = await addTodoToPhoneCalendar(todo);
  assert.equal(result.status, 'privacy_missing');
  assert.equal(result.error, error);
});

test('系统授权被拒后返回 denied，调用方可引导设置', async (t) => {
  useWx(t, {
    addPhoneCalendar(options) { options.fail({ errMsg: 'addPhoneCalendar:fail auth deny' }); }
  });
  const result = await addTodoToPhoneCalendar(todo);
  assert.equal(result.status, 'denied');
  assert.equal(result.success, false);
});

test('用户取消日历写入不是添加成功', async (t) => {
  useWx(t, {
    addPhoneCalendar(options) { options.fail({ errMsg: 'addPhoneCalendar:fail cancel' }); }
  });
  const result = await addTodoToPhoneCalendar(todo);
  assert.equal(result.status, 'cancelled');
  assert.equal(result.success, false);
});

test('隐私接口抛异常时返回失败且不触碰日历', async (t) => {
  const error = new Error('privacy bridge unavailable');
  useWx(t, {
    requirePrivacyAuthorize() { throw error; },
    addPhoneCalendar() { assert.fail('隐私检查失败不能调用日历'); }
  });
  const result = await addTodoToPhoneCalendar(todo);
  assert.equal(result.status, 'fail');
  assert.equal(result.error, error);
});

test('手势丢失或过期错误被归类为 tap_gesture_lost', async (t) => {
  useWx(t, {
    requirePrivacyAuthorize(options) { options.success({}); },
    addPhoneCalendar(options) {
      options.fail({ errMsg: 'addPhoneCalendar:fail can only be invoked by user TAP gesture' });
    }
  });
  const result = await addTodoToPhoneCalendar(todo);
  assert.equal(result.status, 'tap_gesture_lost');
  assert.equal(result.success, false);
});
