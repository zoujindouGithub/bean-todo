const test = require('node:test');
const assert = require('node:assert/strict');
const { TodoManager } = require('../utils/todo');

let pageDefinition;
const previousPage = global.Page;
global.Page = (definition) => { pageDefinition = definition; };
require('../pages/index/index');
if (previousPage === undefined) delete global.Page;
else global.Page = previousPage;

function setup(t, overrides = {}) {
  const storage = new Map();
  const events = [];
  const notices = [];
  const previousWx = global.wx;
  global.wx = {
    getStorageSync(key) { return structuredClone(storage.get(key)); },
    setStorageSync(key, value) { storage.set(key, structuredClone(value)); },
    requirePrivacyAuthorize(options) { options.success({}); },
    addPhoneCalendar(options) {
      events.push(options);
      options.success({ errMsg: 'addPhoneCalendar:ok' });
    },
    requestSubscribeMessage() { assert.fail('日历提醒不应申请订阅消息'); },
    showToast(options) { notices.push(options); },
    showModal(options) { notices.push(options); },
    vibrateShort() {},
    ...overrides
  };
  t.after(() => {
    if (page.onUnload) page.onUnload();
    if (previousWx === undefined) delete global.wx;
    else global.wx = previousWx;
  });
  const page = {
    ...pageDefinition,
    data: structuredClone(pageDefinition.data),
    setData(patch, callback) {
      Object.assign(this.data, patch);
      if (callback) callback();
    }
  };
  page.setData({
    showCreateDrawer: true,
    newTitle: '  提交报告  ',
    newDesc: '带上附件',
    newDueDate: '2099-09-20',
    newPriority: 'high',
    newRemind: true
  });
  return { page, events, notices, manager: new TodoManager() };
}

test('新增待办保存后，用完整内容请求日历并保留本地待办', async (t) => {
  const { page, events, manager } = setup(t);
  await page.onSaveCreate();
  const list = await manager.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].title, '提交报告');
  assert.equal(events.length, 1, '保存成功不能绕过日历 API');
  assert.equal(events[0].title, '待办提醒：提交报告');
  assert.equal(events[0].startTime, new Date(2099, 8, 20, 9).getTime() / 1000);
  assert.equal(events[0].alarm, true);
  assert.equal(page.data.creating, false);
});

test('编辑待办保存后，传给日历的是修改后内容而不是更新计数', async (t) => {
  const { page, events, manager } = setup(t);
  const id = await manager.create({ title: '旧标题', dueDate: '2099-09-19' });
  page.setData({ isDrawerEdit: true, editId: id });
  await page.onSaveCreate();
  assert.equal((await manager.get(id)).title, '提交报告');
  assert.equal(events.length, 1, '编辑结果不是待办对象');
  assert.equal(events[0].title, '待办提醒：提交报告');
  assert.equal(events[0].startTime, new Date(2099, 8, 20, 9).getTime() / 1000);
});

test('日历不可用时保留待办，但必须明确告知未添加日历', async (t) => {
  const { page, notices, manager } = setup(t, { addPhoneCalendar: undefined });
  await page.onSaveCreate();
  assert.equal((await manager.list()).length, 1);
  assert.ok(notices.some((notice) => notice.icon === 'none' && /日历/.test(notice.title)));
  assert.equal(notices.some((notice) => notice.icon === 'success'), false);
});

test('日历写入成功才记录添加状态，普通编辑保存不重复添加', async (t) => {
  const { page, events, manager } = setup(t);
  await page.onSaveCreate();
  const saved = (await manager.list())[0];
  assert.equal(saved.remind, true);
  await page.openEditDrawer(saved._id);
  assert.equal(page.data.newRemind, false, '编辑不是再次添加日历的用户授权');
  page.setData({ newDesc: '修改本地备注' });
  await page.onSaveCreate();
  assert.equal(events.length, 1);
  assert.equal((await manager.get(saved._id)).desc, '修改本地备注');
});

test('拒绝隐私授权后仍保存本地待办，但不写日历也不标记成功', async (t) => {
  const { page, events, notices, manager } = setup(t, {
    requirePrivacyAuthorize(options) {
      options.fail({ errno: 104, errMsg: 'requirePrivacyAuthorize:fail user deny' });
    }
  });
  await page.onSaveCreate();
  const saved = (await manager.list())[0];
  assert.equal(saved.title, '提交报告');
  assert.equal(!!saved.remind, false);
  assert.equal(events.length, 0);
  assert.ok(notices.some((notice) => notice.icon === 'none' && /隐私/.test(notice.title)));
  assert.equal(notices.some((notice) => notice.icon === 'success'), false);
});

test('日历调用失败可见原始原因，不被保存成功提示掩盖', async (t) => {
  const { page, notices, manager } = setup(t, {
    addPhoneCalendar(options) {
      options.fail({ errMsg: 'addPhoneCalendar:fail calendar account unavailable' });
    }
  });
  await page.onSaveCreate();
  assert.equal((await manager.list()).length, 1);
  assert.ok(notices.some((notice) => /calendar account unavailable/.test(notice.content || '')));
  assert.equal(notices.some((notice) => notice.icon === 'success'), false);
});

test('保存失败不得创建孤立的系统日程', async (t) => {
  const { page, events } = setup(t, {
    setStorageSync() { throw new Error('storage unavailable'); }
  });
  t.mock.method(console, 'error', () => {});
  await page.onSaveCreate();
  assert.equal(events.length, 0);
  assert.equal(page.data.creating, false);
});

test('等待授权时不能切换表单或重复保存', async (t) => {
  let authorize;
  let privacyRequested;
  const requested = new Promise((resolve) => { privacyRequested = resolve; });
  const { page, events, manager } = setup(t, {
    requirePrivacyAuthorize(options) {
      authorize = options;
      privacyRequested();
    }
  });
  const otherId = await manager.create({ title: '另一条待办' });
  const saving = page.onSaveCreate();
  await requested;
  try {
    page.closeCreateDrawer();
    assert.equal(page.data.showCreateDrawer, true);
    page.openCreateDrawer();
    assert.equal(page.data.newTitle, '  提交报告  ');
    await page.openEditDrawer(otherId);
    assert.equal(page.data.isDrawerEdit, false);
    page.onNewTitleInput({ detail: { value: '尚未保存的新输入' } });
    assert.equal(page.data.newTitle, '  提交报告  ');
    await page.onSaveCreate();
    assert.equal((await manager.list()).length, 2);
    assert.equal(page.data.creating, true);
  } finally {
    authorize.success({});
    await saving;
  }
  assert.equal(events.length, 1);
  assert.equal(page.data.showCreateDrawer, false);
  assert.equal(page.data.creating, false);
  await page.openEditDrawer(otherId);
  assert.equal(page.data.newTitle, '另一条待办');
});

test('日历开关开启时触发隐私预授权，授权被拒时自动关闭开关并轻提示', (t) => {
  let privacyCalled = false;
  const { page, notices } = setup(t, {
    requirePrivacyAuthorize(options) {
      privacyCalled = true;
      options.fail({ errMsg: 'user deny' });
    }
  });
  page.setData({ newRemind: false });
  page.onNewRemindChange({ detail: { value: true } });
  assert.equal(privacyCalled, true);
  assert.equal(page.data.newRemind, false);
  assert.ok(notices.some((n) => n.icon === 'none' && /隐私保护指引/.test(n.title)));
});

test('日历开关开启时隐私授权成功，开关保持开启', (t) => {
  let privacyCalled = false;
  const { page } = setup(t, {
    requirePrivacyAuthorize(options) {
      privacyCalled = true;
      options.success({});
    }
  });
  page.setData({ newRemind: false });
  page.onNewRemindChange({ detail: { value: true } });
  assert.equal(privacyCalled, true);
  assert.equal(page.data.newRemind, true);
});

test('打开已添加日历待办时展示已添加状态，尝试开启开关触发二次确认拦截（取消后保持关闭）', async (t) => {
  let modalOptions = null;
  const { page, manager } = setup(t, {
    showModal(options) {
      modalOptions = options;
      options.success({ confirm: false, cancel: true });
    }
  });
  const id = await manager.create({ title: '已入日历事项', dueDate: '2099-09-20' });
  await manager.update(id, { remind: true });
  await page.openEditDrawer(id);
  assert.equal(page.data.isCalendarAdded, true);
  assert.equal(page.data.newRemind, false);

  page.onNewRemindChange({ detail: { value: true } });
  assert.ok(modalOptions);
  assert.equal(modalOptions.title, '重复添加提醒');
  assert.ok(/该待办已在手机日历中有日程/.test(modalOptions.content));
  assert.equal(page.data.newRemind, false);
});

test('二次确认点击确认后才允许开启再次添加日历开关并触发隐私预授权', async (t) => {
  let modalOptions = null;
  let privacyCalled = false;
  const { page, manager } = setup(t, {
    showModal(options) {
      modalOptions = options;
      options.success({ confirm: true, cancel: false });
    },
    requirePrivacyAuthorize(options) {
      privacyCalled = true;
      options.success({});
    }
  });
  const id = await manager.create({ title: '已入日历事项2', dueDate: '2099-09-20' });
  await manager.update(id, { remind: true });
  await page.openEditDrawer(id);

  page.onNewRemindChange({ detail: { value: true } });
  assert.ok(modalOptions);
  assert.equal(modalOptions.title, '重复添加提醒');
  assert.equal(privacyCalled, true);
  assert.equal(page.data.newRemind, true);
});

test('打开新增抽屉时 isCalendarAdded 初始化为 false', (t) => {
  const { page } = setup(t);
  page.setData({ isCalendarAdded: true });
  page.openCreateDrawer();
  assert.equal(page.data.isCalendarAdded, false);
});

test('日历因 TAP 手势失效报错时给出中文友好提示，不暴露原始英文错误', async (t) => {
  const { page, notices, manager } = setup(t, {
    addPhoneCalendar(options) {
      options.fail({ errMsg: 'addPhoneCalendar:fail can only be invoked by user TAP gesture' });
    }
  });
  await page.onSaveCreate();
  assert.equal((await manager.list()).length, 1);
  assert.ok(notices.some((notice) => notice.icon === 'none' && /微信要求日历由点击直接拉起|再次点击保存/.test(notice.title)));
  assert.equal(notices.some((notice) => /user TAP gesture/i.test(notice.content || notice.title || '')), false);
  assert.equal(notices.some((notice) => notice.icon === 'success'), false);
});

test('点击复选框 onToggle 不抛 ReferenceError 且在本地数据中持久化完成状态', async (t) => {
  const { page, manager } = setup(t);
  const id = await manager.create({ title: '测试待办项' });
  await page.loadTodos();
  assert.equal(page.data.list.length, 1);
  assert.equal(page.data.list[0].completed, false);

  // 切换为已完成
  await page.onToggle({ currentTarget: { dataset: { id } } });
  assert.equal(page.data.list[0].completed, true, '原位乐观更新已生效');
  const itemAfterToggle = await manager.get(id);
  assert.equal(itemAfterToggle.completed, true, '数据层已持久化为完成状态');
  assert.ok(itemAfterToggle.completedAt, '应记录完成时间戳');

  // 再次点击切换为未完成
  await page.onToggle({ currentTarget: { dataset: { id } } });
  assert.equal(page.data.list[0].completed, false, '原位乐观更新已恢复未完成');
  const itemReverted = await manager.get(id);
  assert.equal(itemReverted.completed, false, '数据层已持久化为未完成');
  assert.equal(itemReverted.completedAt, null, '未完成状态下完成时间戳应为 null');
});

test('左滑点击完成 onSwipeComplete 正常代理 onToggle 且持久化状态', async (t) => {
  const { page, manager } = setup(t);
  const id = await manager.create({ title: '左滑待办项' });
  await page.loadTodos();
  page.setData({ openedSwipeId: id });

  await page.onSwipeComplete({ currentTarget: { dataset: { id } } });
  assert.equal(page.data.openedSwipeId, '', '左滑抽屉应已关闭');
  const item = await manager.get(id);
  assert.equal(item.completed, true, '左滑切换应持久化完成状态');
});

test('抽屉内 onToggleDrawerComplete 能够持久化状态并在重新 loadTodos 后的列表中反映', async (t) => {
  const { page, manager, notices } = setup(t);
  const id = await manager.create({ title: '抽屉待办项' });
  await page.loadTodos();

  await page.openEditDrawer(id);
  assert.equal(page.data.editId, id);
  assert.equal(page.data.editCompleted, false);

  // 切换为已完成
  await page.onToggleDrawerComplete();
  assert.equal(page.data.editCompleted, true, '抽屉内已更新为已完成');
  const persisted = await manager.get(id);
  assert.equal(persisted.completed, true, '数据层已持久化为完成状态');
  assert.ok(persisted.completedAt, '应记录完成时间戳');
  assert.ok(notices.some((n) => n.title === '已标记为完成' && n.icon === 'success'));

  // 检查列表反映
  await page.loadTodos();
  const listItem = page.data.list.find((it) => it._id === id);
  assert.ok(listItem, '列表中应存在该待办');
  assert.equal(listItem.completed, true, '重新加载后列表项反映完成态');

  // 再次切换为未完成
  await page.onToggleDrawerComplete();
  assert.equal(page.data.editCompleted, false, '抽屉内已切换回未完成');
  const reverted = await manager.get(id);
  assert.equal(reverted.completed, false, '数据层已恢复未完成状态');
  assert.ok(notices.some((n) => n.title === '已设为进行中' && n.icon === 'success'));

  await page.loadTodos();
  const revertedListItem = page.data.list.find((it) => it._id === id);
  assert.equal(revertedListItem.completed, false, '重新加载后列表项反映未完成态');
});

test('抽屉内 onToggleDrawerComplete 持久化失败时捕获异常并回滚 editCompleted', async (t) => {
  const { page, notices } = setup(t);
  page.setData({ editId: 'non-existent-id', editCompleted: false, creating: false });

  await page.onToggleDrawerComplete();
  assert.equal(page.data.editCompleted, false, '持久化异常时应回滚 editCompleted');
  assert.ok(notices.some((n) => n.title === '操作失败' && n.icon === 'none'), '应弹出操作失败提示');
});
