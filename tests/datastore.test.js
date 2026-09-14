/**
 * 数据层功能测试：用内存 Map 模拟小程序的 wx 存储 API，
 * 直接 require 项目里的 utils/todo.js 并跑完整 CRUD 流程。
 * 该文件仅用于本地验证，不属于小程序交付物。
 */

const path = require('path');
const PROJ = 'C:/Users/zouji/.workbuddy/腾讯云开发/todo-miniprogram';

// ---- mock wx ----
const store = new Map();
global.wx = {
  getStorageSync(key) {
    return store.has(key) ? JSON.parse(store.get(key)) : '';
  },
  setStorageSync(key, data) {
    store.set(key, JSON.stringify(data));
  }
};

const { TodoManager } = require(path.join(PROJ, 'utils/todo.js'));
const STORAGE_KEY = 'bean_todo_items_v1';

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`);
  }
}

(async () => {
  const tm = new TodoManager();

  console.log('\n[1] 空状态');
  check('list({}) 返回空数组', JSON.stringify(await tm.list({})) === '[]');
  check('get("x") 返回 null', (await tm.get('x')) === null);
  check('get() 无参返回 null', (await tm.get()) === null);

  console.log('\n[2] create 校验');
  try {
    await tm.create({ title: '' });
    check('空标题应抛错', false);
  } catch (e) {
    check('空标题抛「标题不能为空」', e.message === '标题不能为空', e.message);
  }
  try {
    await tm.create({ title: '   ' });
    check('纯空格标题应抛错', false);
  } catch (e) {
    check('纯空格标题抛错', e.message === '标题不能为空', e.message);
  }

  console.log('\n[3] create 正常流程');
  const idA = await tm.create({ title: '  写周报  ', desc: '含 Q3 数据', priority: 'high', dueDate: '2026-09-20' });
  const idB = await tm.create({ title: '买咖啡豆' });
  const idC = await tm.create({ title: '预约体检', priority: 'low' });
  check('create 返回非空 id', typeof idA === 'string' && idA.length > 0, idA);
  check('三个 id 互不相同', new Set([idA, idB, idC]).size === 3);

  const all = await tm.list({});
  check('list({}) 共 3 条', all.length === 3, all.length);
  check('标题已 trim', all.find((x) => x._id === idA).title === '写周报');
  check('默认 priority=normal', all.find((x) => x._id === idB).priority === 'normal');
  check('默认 desc 为空串', all.find((x) => x._id === idB).desc === '');
  check('默认 completed=false', all.every((x) => x.completed === false));
  check('createdAt 为数字时间戳', all.every((x) => typeof x.createdAt === 'number' && x.createdAt > 0));
  check('createdAt 严格递增(倒序=最新在前)', all[0]._id === idC && all[1]._id === idB && all[2]._id === idA,
    all.map((x) => x.title));
  check('completedAt 初始为 null', all.every((x) => x.completedAt === null));

  console.log('\n[4] 过滤');
  check('list({completed:false}) 共 3 条', (await tm.list({ completed: false })).length === 3);
  check('list({completed:true}) 共 0 条', (await tm.list({ completed: true })).length === 0);

  console.log('\n[5] get / update');
  const one = await tm.get(idA);
  check('get 命中且字段完整', one && one._id === idA && one.priority === 'high', one);
  await tm.update(idA, { title: '写周报（已改）', desc: '改过了' });
  const after = await tm.get(idA);
  check('update 标题已生效', after.title === '写周报（已改）', after.title);
  check('update 描述已生效', after.desc === '改过了', after.desc);
  check('update 保留未改字段', after.priority === 'high' && after.dueDate === '2026-09-20', after);
  check('update 不影响其他记录', (await tm.get(idB)).title === '买咖啡豆');
  try {
    await tm.update('not-exist', { title: 'x' });
    check('update 不存在应抛错', false);
  } catch (e) {
    check('update 不存在抛「待办不存在」', e.message === '待办不存在', e.message);
  }
  const beforeId = (await tm.get(idA))._id;
  await tm.update(idA, { _id: 'hacked', title: '试改 id' });
  check('update 忽略对 _id 的篡改', (await tm.get(idA))._id === beforeId && (await tm.get('hacked')) === null);

  console.log('\n[6] toggle');
  await tm.toggle(idB);
  const b1 = await tm.get(idB);
  check('toggle 后 completed=true', b1.completed === true);
  check('toggle 后 completedAt 有值', typeof b1.completedAt === 'number' && b1.completedAt > 0, b1.completedAt);
  check('completed 过滤生效', (await tm.list({ completed: true })).length === 1);
  check('active 过滤生效', (await tm.list({ completed: false })).length === 2);
  await tm.toggle(idB);
  const b2 = await tm.get(idB);
  check('再次 toggle 回到 false', b2.completed === false);
  check('再次 toggle 后 completedAt=null', b2.completedAt === null, b2.completedAt);
  try {
    await tm.toggle('not-exist');
    check('toggle 不存在应抛错', false);
  } catch (e) {
    check('toggle 不存在抛「待办不存在」', e.message === '待办不存在', e.message);
  }

  console.log('\n[7] remove / clearCompleted');
  await tm.toggle(idC);
  const cleared = await tm.clearCompleted();
  check('clearCompleted 返回 removed=1', cleared.removed === 1, cleared);
  check('clearCompleted 后剩 2 条', (await tm.list({})).length === 2);
  const removed = await tm.remove(idA);
  check('remove 返回 removed=1', removed.removed === 1, removed);
  check('remove 后剩 1 条', (await tm.list({})).length === 1);
  check('remove 不存在的 id 不报错', (await tm.remove('not-exist')).removed === 0);
  check('clearCompleted 无已完成时 removed=0', (await tm.clearCompleted()).removed === 0);

  console.log('\n[8] 脏数据 / 损坏数据容错');
  store.set(STORAGE_KEY, JSON.stringify('这不是数组'));
  check('存储为字符串 → list 返回 []', (await tm.list({})).length === 0);
  store.set(STORAGE_KEY, JSON.stringify([null, 123, { noId: true }, { _id: 'ok', title: '有效', createdAt: '2026-01-01T00:00:00Z' }]));
  const dirty = await tm.list({});
  check('脏数组被过滤，仅保留合法项', dirty.length === 1 && dirty[0]._id === 'ok', dirty);
  check('ISO 字符串时间被归一化为数字', typeof dirty[0].createdAt === 'number' && dirty[0].createdAt > 0, dirty[0].createdAt);
  delete store.get(STORAGE_KEY);
  store.clear();
  check('存储被清空(读到空串) → list 返回 []', (await tm.list({})).length === 0);

  console.log('\n[9] 写入超限可读报错');
  const origSet = global.wx.setStorageSync;
  global.wx.setStorageSync = () => {
    const e = new Error('exceed storage max size');
    throw e;
  };
  try {
    await tm.create({ title: '会写失败' });
    check('写入失败应抛错', false);
  } catch (e) {
    check('写入失败抛可读错误', e.message === '本地存储写入失败，可能是存储空间已满', e.message);
  }
  global.wx.setStorageSync = origSet;

  console.log(`\n===== 结果: ${pass} 通过 / ${fail} 失败 =====`);
  process.exit(fail === 0 ? 0 : 1);
})();
