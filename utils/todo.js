/**
 * utils/todo.js
 * TodoManager —— 待办事项数据访问封装。
 *
 * 当前实现：数据持久化在小程序**本地缓存**（`wx.setStorageSync`），
 * 不依赖云开发、不依赖任何后端服务，离线完全可用。
 *
 * 隔离性：微信本地缓存按「小程序 + 用户」维度隔离，
 *        同一台设备上不同用户、不同小程序之间互不可见。
 * 容量上限：单个 key 1MB、总量 10MB（微信官方限制）。
 *          纯文本待办远低于该上限；写入失败会抛出可读错误。
 *
 * 对外接口与「云端实现」完全一致
 * （list / get / create / update / toggle / remove / clearCompleted），
 * 将来若需要多设备同步，只需替换本文件内部实现，页面代码无需改动。
 *
 * 调用方（页面）应自行 try/catch 处理异常，本模块只负责抛出/透传错误。
 */

const STORAGE_KEY = 'bean_todo_items_v1';

const { sortTodoList } = require('./date-helper');

/**
 * 把各种时间表示统一成毫秒时间戳，无法识别时返回 0。
 * 兼容 Date / 数字 / ISO 字符串，避免历史数据或脏数据导致排序异常。
 * @param {*} value
 * @returns {number}
 */
function toTime(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && isFinite(value)) return value;
  if (typeof value === 'string' && value) {
    const t = Date.parse(value);
    return isNaN(t) ? 0 : t;
  }
  return 0;
}

/**
 * 读取全部待办。
 * 数据缺失或损坏时返回空数组（并在控制台暴露原因），避免整页崩溃。
 * @returns {Array<Object>}
 */
function readAll() {
  let raw;
  try {
    raw = wx.getStorageSync(STORAGE_KEY);
  } catch (err) {
    console.error('[todo] 读取本地缓存失败:', err);
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((it) => it && typeof it === 'object' && it._id)
    .map((it) => ({
      ...it,
      createdAt: toTime(it.createdAt),
      updatedAt: toTime(it.updatedAt) || toTime(it.createdAt),
      completedAt: it.completedAt ? toTime(it.completedAt) : null
    }));
}

/**
 * 写入全部待办。失败时抛出可读错误（最常见原因是存储超限）。
 * @param {Array<Object>} items
 */
function writeAll(items) {
  try {
    wx.setStorageSync(STORAGE_KEY, items);
  } catch (err) {
    console.error('[todo] 写入本地缓存失败:', err);
    throw new Error('本地存储写入失败，可能是存储空间已满');
  }
}

// 同一毫秒内多次创建时用于保序，配合随机串确保 id 唯一
let idSeq = 0;

/**
 * 生成本地唯一 id。
 * @returns {string}
 */
function genId() {
  idSeq += 1;
  return `t_${Date.now()}_${idSeq}_${Math.random().toString(36).slice(2, 8)}`;
}

class TodoManager {
  /**
   * 查询待办列表。
   * @param {Object} [filter={}] 查询条件，如 { completed: false }
   * @param {Object} [options={}] 排序选项
   * @param {('createdAt'|'smart')} [options.sortBy='createdAt'] 排序方式，'createdAt' 为按创建时间倒序，'smart' 为按截止日期紧迫度与优先级智能排序
   * @param {Date} [options.now=new Date()] 基准时间（用于日期比对）
   * @returns {Promise<Array<Object>>} 待办数组
   */
  async list(filter = {}, options = {}) {
    const keys = Object.keys(filter || {});
    const filtered = readAll().filter((it) => keys.every((k) => it[k] === filter[k]));
    const sortBy = options.sortBy || 'createdAt';
    if (sortBy === 'smart') {
      return sortTodoList(filtered, options.now || new Date());
    }
    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * 获取单条待办。
   * @param {string} id 待办 id
   * @returns {Promise<Object|null>} 不存在时返回 null
   */
  async get(id) {
    if (!id) return null;
    return readAll().find((it) => it._id === id) || null;
  }

  /**
   * 新增待办。
   * @param {Object} payload
   * @param {string} payload.title 标题（必填，去空格后不能为空）
   * @param {string} [payload.desc=''] 描述
   * @param {('low'|'normal'|'high')} [payload.priority='normal'] 优先级
   * @param {string} [payload.dueDate=''] 到期日，如 "2026-08-30"
   * @returns {Promise<string>} 新待办 id
   */
  async create({ title, desc = '', priority = 'normal', dueDate = '' }) {
    if (!title || !title.trim()) {
      throw new Error('标题不能为空');
    }
    const items = readAll();
    // 保证 createdAt 严格递增，避免同一毫秒内连续创建时列表倒序出现歧义
    const prevMax = items.reduce((m, it) => Math.max(m, toTime(it.createdAt)), 0);
    const now = Math.max(Date.now(), prevMax + 1);
    const item = {
      _id: genId(),
      title: title.trim(),
      desc: desc || '',
      priority: priority || 'normal',
      dueDate: dueDate || '',
      completed: false,
      completedAt: null,
      createdAt: now,
      updatedAt: now
    };
    items.push(item);
    writeAll(items);
    return item._id;
  }

  /**
   * 局部更新待办。
   * @param {string} id 待办 id
   * @param {Object} patch 更新字段（`_id` 会被忽略）
   * @returns {Promise<Object>} { updated: number }
   */
  async update(id, patch) {
    const items = readAll();
    const idx = items.findIndex((it) => it._id === id);
    if (idx === -1) {
      throw new Error('待办不存在');
    }
    const { _id, ...safePatch } = patch || {};
    items[idx] = { ...items[idx], ...safePatch, updatedAt: Date.now() };
    writeAll(items);
    return { updated: 1 };
  }

  /**
   * 切换完成状态。
   * @param {string} id 待办 id
   * @returns {Promise<Object>} { updated: number }
   */
  async toggle(id) {
    const items = readAll();
    const idx = items.findIndex((it) => it._id === id);
    if (idx === -1) {
      throw new Error('待办不存在');
    }
    const cur = items[idx];
    const completed = !cur.completed;
    items[idx] = {
      ...cur,
      completed,
      completedAt: completed ? Date.now() : null,
      updatedAt: Date.now()
    };
    writeAll(items);
    return { updated: 1 };
  }

  /**
   * 删除单条待办。
   * @param {string} id 待办 id
   * @returns {Promise<Object>} { removed: number }
   */
  async remove(id) {
    const items = readAll();
    const rest = items.filter((it) => it._id !== id);
    const removed = items.length - rest.length;
    if (removed > 0) {
      writeAll(rest);
    }
    return { removed };
  }

  /**
   * 清空所有已完成的待办。
   * @returns {Promise<Object>} { removed: number }
   */
  async clearCompleted() {
    const items = readAll();
    const rest = items.filter((it) => !it.completed);
    const removed = items.length - rest.length;
    if (removed > 0) {
      writeAll(rest);
    }
    return { removed };
  }
}

module.exports = { TodoManager };
