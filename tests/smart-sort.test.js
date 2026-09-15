/**
 * tests/smart-sort.test.js
 * 截止日期紧迫度分级与智能多维排序专项测试
 */

const test = require('node:test');
const assert = require('node:assert');
const {
  parseDateOnly,
  getDueDiffDays,
  getDueStatus,
  sortTodoList
} = require('../utils/date-helper');
const { TodoManager } = require('../utils/todo');

test('=== 截止日期解析与天数差运算 ===', () => {
  assert.strictEqual(parseDateOnly(''), null);
  assert.strictEqual(parseDateOnly('invalid-date'), null);
  assert.strictEqual(parseDateOnly('2026-09-32'), null);

  const base = new Date(2026, 8, 15, 12, 0, 0); // 2026-09-15 12:00
  assert.strictEqual(getDueDiffDays('2026-09-13', base), -2); // 逾期2天
  assert.strictEqual(getDueDiffDays('2026-09-14', base), -1); // 逾期1天
  assert.strictEqual(getDueDiffDays('2026-09-15', base), 0);  // 今天
  assert.strictEqual(getDueDiffDays('2026-09-16', base), 1);  // 明天
  assert.strictEqual(getDueDiffDays('2026-09-17', base), 2);  // 2天后
  assert.strictEqual(getDueDiffDays('2026-09-18', base), 3);  // 3天后
  assert.strictEqual(getDueDiffDays('2026-09-25', base), 10); // 10天后
});

test('=== 截止日期紧迫度视觉分级状态 ===', () => {
  const base = new Date(2026, 8, 15, 10, 30, 0);

  // 1. 无日期
  const noDate = getDueStatus('', false, base);
  assert.strictEqual(noDate.type, 'none');

  // 2. 已完成：弱化淡灰
  const done = getDueStatus('2026-09-10', true, base);
  assert.strictEqual(done.type, 'completed');
  assert.strictEqual(done.color, '#9ca3af');
  assert.strictEqual(done.label, '截止 2026-09-10');

  // 3. 逾期（未完成）：警示深红
  const overdue1 = getDueStatus('2026-09-14', false, base);
  assert.strictEqual(overdue1.type, 'overdue');
  assert.strictEqual(overdue1.label, '已逾期 1 天');
  assert.strictEqual(overdue1.color, '#e5484d');

  const overdue5 = getDueStatus('2026-09-10', false, base);
  assert.strictEqual(overdue5.label, '已逾期 5 天');

  // 4. 今天截止：炽烈橙红
  const today = getDueStatus('2026-09-15', false, base);
  assert.strictEqual(today.type, 'today');
  assert.strictEqual(today.label, '今天截止');
  assert.strictEqual(today.color, '#e03e1a');

  // 5. 明天截止：暖橙色
  const tomorrow = getDueStatus('2026-09-16', false, base);
  assert.strictEqual(tomorrow.type, 'tomorrow');
  assert.strictEqual(tomorrow.label, '明天截止');
  assert.strictEqual(tomorrow.color, '#d97706');

  // 6. 2~3天内：活力蓝
  const soon = getDueStatus('2026-09-18', false, base);
  assert.strictEqual(soon.type, 'soon');
  assert.strictEqual(soon.label, '3天后截止');
  assert.strictEqual(soon.color, '#2563eb');

  // 7. 远期：中性灰
  const later = getDueStatus('2026-10-01', false, base);
  assert.strictEqual(later.type, 'later');
  assert.strictEqual(later.label, '截止 2026-10-01');
  assert.strictEqual(later.color, '#6b7280');
});

test('=== 待办列表智能多维排序算法 ===', async () => {
  const base = new Date(2026, 8, 15, 9, 0, 0); // 2026-09-15

  const items = [
    { _id: '1', title: '远期低优', dueDate: '2026-10-20', priority: 'low', completed: false, createdAt: 100 },
    { _id: '2', title: '明天截止', dueDate: '2026-09-16', priority: 'normal', completed: false, createdAt: 200 },
    { _id: '3', title: '已逾期久远', dueDate: '2026-09-10', priority: 'low', completed: false, createdAt: 300 },
    { _id: '4', title: '已完成项A', dueDate: '2026-09-12', priority: 'high', completed: true, completedAt: 1000 },
    { _id: '5', title: '今天高优', dueDate: '2026-09-15', priority: 'high', completed: false, createdAt: 400 },
    { _id: '6', title: '今天普通', dueDate: '2026-09-15', priority: 'normal', completed: false, createdAt: 450 },
    { _id: '7', title: '昨天逾期', dueDate: '2026-09-14', priority: 'high', completed: false, createdAt: 500 },
    { _id: '8', title: '无日期高优', dueDate: '', priority: 'high', completed: false, createdAt: 600 },
    { _id: '9', title: '无日期普通', dueDate: '', priority: 'normal', completed: false, createdAt: 700 },
    { _id: '10', title: '已完成项B(最新完成)', dueDate: '2026-09-15', priority: 'normal', completed: true, completedAt: 2000 },
    { _id: '11', title: '后天截止(2天后)', dueDate: '2026-09-17', priority: 'low', completed: false, createdAt: 800 }
  ];

  const sorted = sortTodoList(items, base);
  const titles = sorted.map((it) => it.title);

  // 期望顺序规则：
  // 1. 逾期（越早逾期越靠前）：'已逾期久远' (09-10) -> '昨天逾期' (09-14)
  assert.strictEqual(titles[0], '已逾期久远');
  assert.strictEqual(titles[1], '昨天逾期');

  // 2. 今天截止（高优在普通之前）：'今天高优' -> '今天普通'
  assert.strictEqual(titles[2], '今天高优');
  assert.strictEqual(titles[3], '今天普通');

  // 3. 明天截止：'明天截止'
  assert.strictEqual(titles[4], '明天截止');

  // 4. 2~3天内截止：'后天截止(2天后)'
  assert.strictEqual(titles[5], '后天截止(2天后)');

  // 5. 其余未完成项：高优先级优先 ('无日期高优' -> '无日期普通' -> '远期低优')
  assert.strictEqual(titles[6], '无日期高优');
  assert.strictEqual(titles[7], '无日期普通');
  assert.strictEqual(titles[8], '远期低优');

  // 6. 已完成项沉底且按完成时间倒序：'已完成项B(最新完成)' (completedAt:2000) -> '已完成项A' (completedAt:1000)
  assert.strictEqual(titles[9], '已完成项B(最新完成)');
  assert.strictEqual(titles[10], '已完成项A');
});

test('=== TodoManager 对接智能排序 ===', async () => {
  // Mock wx
  const mockStore = new Map();
  global.wx = {
    getStorageSync(k) { return mockStore.get(k) || ''; },
    setStorageSync(k, v) { mockStore.set(k, v); }
  };

  const tm = new TodoManager();
  const base = new Date(2026, 8, 15, 10, 0, 0);

  await tm.create({ title: '远期任务', dueDate: '2026-10-01' });
  await tm.create({ title: '今天任务', dueDate: '2026-09-15' });
  await tm.create({ title: '逾期任务', dueDate: '2026-09-12' });

  // 默认 createdAt 倒序（最后创建的在最前）
  const createdOrder = await tm.list({}, { sortBy: 'createdAt' });
  assert.strictEqual(createdOrder[0].title, '逾期任务');
  assert.strictEqual(createdOrder[1].title, '今天任务');
  assert.strictEqual(createdOrder[2].title, '远期任务');

  // 智能排序
  const smartOrder = await tm.list({}, { sortBy: 'smart', now: base });
  assert.strictEqual(smartOrder[0].title, '逾期任务'); // 逾期最危急
  assert.strictEqual(smartOrder[1].title, '今天任务'); // 今天必须做
  assert.strictEqual(smartOrder[2].title, '远期任务'); // 远期
});
