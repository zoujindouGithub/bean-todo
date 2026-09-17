// 手机系统日历提醒；是否弹窗、响铃由设备权限和通知设置决定。
const { parseDateOnly } = require('./date-helper');

const DEFAULT_REMINDER_HOUR = 9;
const DEFAULT_REMINDER_MINUTE = 0;
const DURATION_SECONDS = 1800; // 默认日程时长 30 分钟

/**
 * 优先级中文映射
 */
const PRIORITY_TEXT = {
  high: '高优先级',
  normal: '中优先级',
  low: '低优先级'
};

/**
 * 计算待办日程的秒级开始时间戳与结束时间戳 (精确到秒)
 * @param {string} dueDateStr - 格式为 YYYY-MM-DD
 * @param {Date} [now=new Date()] - 当前参考时间
 * @returns {{ startTime: number, endTime: number } | null}
 */
function computeCalendarTime(dueDateStr, now = new Date()) {
  const parsedDate = parseDateOnly(dueDateStr);
  if (!parsedDate) return null;

  // 默认设置为截止日早晨 09:00:00
  const targetDate = new Date(parsedDate);
  targetDate.setHours(DEFAULT_REMINDER_HOUR, DEFAULT_REMINDER_MINUTE, 0, 0);

  const nowSeconds = Math.floor(now.getTime() / 1000);
  let startSeconds = Math.floor(targetDate.getTime() / 1000);

  // 已过提醒时间时，沿用十分钟后提醒的约定，避免创建不会再触发的过去提醒。
  if (startSeconds <= nowSeconds) {
    startSeconds = nowSeconds + 600; // 顺延 10 分钟 (600秒)
  }

  const endSeconds = startSeconds + DURATION_SECONDS;

  return {
    startTime: startSeconds,
    endTime: endSeconds
  };
}

/**
 * 保留微信原始错误供页面展示；隐私拒绝与后台未声明不能混为一谈。
 */
function calendarFailure(error, phase) {
  const message = String(error && (error.errMsg || error.message) || '');
  const code = error && error.errno;
  let status = 'fail';
  if (/user tap gesture/i.test(message)) {
    status = 'tap_gesture_lost';
  } else if (code === 112 || /not declared in the privacy|appid privacy api banned/i.test(message)) {
    status = 'privacy_missing';
  } else if (code === 104 || (phase === 'privacy' && (code === 103 || /deny|denied|disagree|cancel/i.test(message)))) {
    status = 'privacy_denied';
  } else if (code === 103 || /auth deny|auth denied|authorize:fail/i.test(message)) {
    status = 'denied';
  } else if (/cancel/i.test(message)) {
    status = 'cancelled';
  }
  return { success: false, status, error };
}

/**
 * 将待办事项添加到手机系统日历 (支持 iOS / Android 原生日历日程强提醒)
 * @param {Object} todo - 待办对象
 * @param {string} todo.title - 待办标题
 * @param {string} [todo.desc] - 待办描述
 * @param {string} todo.dueDate - 截止日期 (YYYY-MM-DD)
 * @param {string} [todo.priority] - 优先级
 * @returns {Promise<{ success: boolean, status: string, error?: any }>}
 */
async function addTodoToPhoneCalendar(todo) {
  if (!todo || typeof todo.title !== 'string' || !todo.title.trim() || !todo.dueDate) {
    return { success: false, status: 'invalid_param', error: '待办缺少标题或截止日期' };
  }

  const times = computeCalendarTime(todo.dueDate);
  if (!times) {
    return { success: false, status: 'invalid_date', error: '截止日期格式不合法' };
  }
  if (typeof wx === 'undefined' || typeof wx.addPhoneCalendar !== 'function') {
    return { success: false, status: 'unsupported', error: '当前微信环境不支持系统日历' };
  }

  let phase = 'privacy';
  try {
    if (typeof wx.requirePrivacyAuthorize === 'function') {
      // 由微信显示官方隐私弹窗；用户拒绝后必须停止，不能继续调用敏感接口。
      await new Promise((resolve, reject) => {
        wx.requirePrivacyAuthorize({ success: resolve, fail: reject });
      });
    }
    phase = 'calendar';
    const description = [
      todo.desc ? `说明：${todo.desc}` : '',
      `优先级：${PRIORITY_TEXT[todo.priority] || PRIORITY_TEXT.normal}`,
      `截止日期：${todo.dueDate}`,
      '—— 来自「豆芽待办」小程序'
    ].filter(Boolean).join('\n');
    await new Promise((resolve, reject) => {
      wx.addPhoneCalendar({
        title: `待办提醒：${todo.title.trim()}`,
        startTime: times.startTime,
        endTime: String(times.endTime),
        allDay: false,
        description,
        alarm: true,
        alarmOffset: 0,
        success: resolve,
        fail: reject
      });
    });
    return { success: true, status: 'ok' };
  } catch (error) {
    return calendarFailure(error, phase);
  }
}

module.exports = {
  computeCalendarTime,
  addTodoToPhoneCalendar,
  DEFAULT_REMINDER_HOUR,
  DEFAULT_REMINDER_MINUTE
};
