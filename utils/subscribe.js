// 豆芽待办 · 微信订阅消息客户端授权与轻量云端同步助手
const { SUBSCRIBE_CONFIG, isSubscribeConfigured } = require('../config/subscribe');

const PENDING_STORAGE_KEY = 'bean_pending_reminders_v1';
let isCloudInitialized = false;

/**
 * 惰性初始化微信云环境
 */
function ensureCloudInit() {
  if (isCloudInitialized) return true;
  if (!isSubscribeConfigured()) return false;

  try {
    if (typeof wx !== 'undefined' && wx.cloud) {
      wx.cloud.init({
        env: SUBSCRIBE_CONFIG.CLOUD_ENV_ID,
        traceUser: true
      });
      isCloudInitialized = true;
      return true;
    }
  } catch (err) {
    console.warn('[Subscribe] wx.cloud.init 异常或未在小程序环境运行:', err);
  }
  return false;
}

/**
 * 获取本地离线待同步提醒队列
 * @returns {Array}
 */
function getPendingQueue() {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      const data = wx.getStorageSync(PENDING_STORAGE_KEY);
      return Array.isArray(data) ? data : [];
    }
  } catch (e) {
    console.error('[Subscribe] 读取离线提醒队列失败:', e);
  }
  return [];
}

/**
 * 保存离线待同步提醒队列
 * @param {Array} queue
 */
function savePendingQueue(queue) {
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync(PENDING_STORAGE_KEY, queue);
    }
  } catch (e) {
    console.error('[Subscribe] 保存离线提醒队列失败:', e);
  }
}

/**
 * 将待办加入待同步队列
 * @param {Object} todo
 */
function enqueuePending(todo) {
  if (!todo || !todo._id) return;
  const queue = getPendingQueue();
  const index = queue.findIndex((it) => it._id === todo._id);
  const payload = {
    _id: todo._id,
    title: todo.title,
    dueDate: todo.dueDate,
    priority: todo.priority || 'normal',
    enqueuedAt: Date.now()
  };
  if (index >= 0) {
    queue[index] = payload;
  } else {
    queue.push(payload);
  }
  savePendingQueue(queue);
}

/**
 * 从待同步队列移除待办
 * @param {string} todoId
 */
function dequeuePending(todoId) {
  if (!todoId) return;
  const queue = getPendingQueue();
  const filtered = queue.filter((it) => it._id !== todoId);
  if (filtered.length !== queue.length) {
    savePendingQueue(filtered);
  }
}

/**
 * 唤起微信系统订阅消息授权弹窗
 * @returns {Promise<{success: boolean, status: string, reason?: string}>}
 */
async function requestSubscription() {
  if (!isSubscribeConfigured()) {
    console.info('[Subscribe] 未配置 SUBSCRIBE_CONFIG.TEMPLATE_ID，已降级为纯本地运行模式');
    return { success: false, status: 'unconfigured', reason: '未配置模板ID' };
  }

  const templateId = SUBSCRIBE_CONFIG.TEMPLATE_ID;

  return new Promise((resolve) => {
    if (typeof wx === 'undefined' || !wx.requestSubscribeMessage) {
      return resolve({ success: false, status: 'unsupported', reason: '当前基础库不支持订阅消息' });
    }

    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success(res) {
        const status = res[templateId];
        if (status === 'accept') {
          resolve({ success: true, status: 'accept' });
        } else if (status === 'reject') {
          resolve({ success: false, status: 'reject', reason: '用户拒绝接收通知' });
        } else if (status === 'ban') {
          resolve({ success: false, status: 'ban', reason: '用户已被封禁接收此消息' });
        } else {
          resolve({ success: false, status: status || 'unknown' });
        }
      },
      fail(err) {
        console.warn('[Subscribe] 唤起订阅消息弹窗失败:', err);
        resolve({ success: false, status: 'fail', error: err });
      }
    });
  });
}

/**
 * 向云端注册定时提醒任务 (异步)
 * @param {Object} todo
 * @returns {Promise<{success: boolean, pending?: boolean, reminderId?: string}>}
 */
async function scheduleReminder(todo) {
  if (!todo || !todo._id || !todo.dueDate) {
    return { success: false, reason: '缺少待办核心数据' };
  }

  if (!isSubscribeConfigured() || !ensureCloudInit()) {
    return { success: false, reason: '未配置云环境或模板ID' };
  }

  try {
    const res = await wx.cloud.callFunction({
      name: 'todoReminder',
      data: {
        action: 'schedule',
        todoId: todo._id,
        title: todo.title,
        dueDate: todo.dueDate,
        priority: todo.priority || 'normal'
      }
    });

    if (res && res.result && res.result.code === 0) {
      dequeuePending(todo._id);
      return { success: true, reminderId: res.result.reminderId };
    } else {
      console.warn('[Subscribe] 云函数注册提醒返回非0状态:', res);
      enqueuePending(todo);
      return { success: false, pending: true };
    }
  } catch (err) {
    console.warn('[Subscribe] 云端注册提醒失败，已存入离线待同步队列:', err);
    enqueuePending(todo);
    return { success: false, pending: true };
  }
}

/**
 * 撤销云端提醒任务 (本地打勾完成或删除时静默调用)
 * @param {string} todoId
 * @returns {Promise<{success: boolean}>}
 */
async function cancelReminder(todoId) {
  if (!todoId) return { success: false };

  // 1. 先从本地待同步队列中移除
  dequeuePending(todoId);

  // 2. 如果已配置云端，则静默发送取消请求
  if (!isSubscribeConfigured() || !ensureCloudInit()) {
    return { success: true };
  }

  try {
    await wx.cloud.callFunction({
      name: 'todoReminder',
      data: {
        action: 'cancel',
        todoId: todoId
      }
    });
    return { success: true };
  } catch (err) {
    // 撤销失败静默吞并，发完即焚定时器在到期时会做兜底处理
    console.warn('[Subscribe] 静默撤销云端提醒失败(已忽略):', err);
    return { success: false };
  }
}

/**
 * 处理离线待同步队列（联网或冷启动时补偿调用）
 */
async function syncPendingReminders() {
  if (!isSubscribeConfigured() || !ensureCloudInit()) return;
  const queue = getPendingQueue();
  if (queue.length === 0) return;

  console.info(`[Subscribe] 正在后台同步 ${queue.length} 条待重试的提醒任务...`);
  for (const item of queue) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'todoReminder',
        data: {
          action: 'schedule',
          todoId: item._id,
          title: item.title,
          dueDate: item.dueDate,
          priority: item.priority || 'normal'
        }
      });
      if (res && res.result && res.result.code === 0) {
        dequeuePending(item._id);
      }
    } catch (e) {
      console.warn(`[Subscribe] 重试同步提醒 [${item._id}] 暂未成功，等待下一次网络触发`);
    }
  }
}

module.exports = {
  isSubscribeConfigured,
  requestSubscription,
  scheduleReminder,
  cancelReminder,
  syncPendingReminders,
  getPendingQueue,
  enqueuePending,
  dequeuePending
};
