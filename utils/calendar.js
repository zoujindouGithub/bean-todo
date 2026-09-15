// 豆芽待办 · 手机系统日历强提醒助手 (100% 离线、零后端、零月租费)
const { parseDateOnly, toMidnight } = require('./date-helper');

const DEFAULT_REMINDER_HOUR = 9;
const DEFAULT_REMINDER_MINUTE = 0;
const DURATION_SECONDS = 1800; // 默认日程时长 30 分钟

/**
 * 优先级中文映射
 */
const PRIORITY_TEXT = {
  high: '高优先级 🔴',
  normal: '中优先级 🔵',
  low: '低优先级 ⚪'
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

  // 边缘场景：如果是今天截止，且当前本地时间已超过 09:00，则顺延至当前时间后 10 分钟提醒
  const todayMidnight = toMidnight(now);
  const isToday = parsedDate.getTime() === todayMidnight.getTime();

  if (isToday && targetDate.getTime() <= now.getTime()) {
    targetDate.setTime(now.getTime() + 10 * 60 * 1000);
  }

  const startSeconds = Math.floor(targetDate.getTime() / 1000);
  const endSeconds = startSeconds + DURATION_SECONDS;

  return {
    startTime: startSeconds,
    endTime: endSeconds
  };
}

/**
 * 将待办事项添加到手机系统日历 (支持 iOS / Android 原生日历提醒)
 * @param {Object} todo - 待办对象
 * @param {string} todo.title - 待办标题
 * @param {string} [todo.desc] - 待办描述
 * @param {string} todo.dueDate - 截止日期 (YYYY-MM-DD)
 * @param {string} [todo.priority] - 优先级
 * @returns {Promise<{ success: boolean, status: string, error?: any }>}
 */
async function addTodoToPhoneCalendar(todo) {
  if (!todo || !todo.title || !todo.dueDate) {
    return { success: false, status: 'invalid_param', error: '待办缺少标题或截止日期' };
  }

  const times = computeCalendarTime(todo.dueDate);
  if (!times) {
    return { success: false, status: 'invalid_date', error: '截止日期格式不合法' };
  }

  if (typeof wx === 'undefined' || !wx.addPhoneCalendar) {
    console.warn('[Calendar] 当前宿主环境不支持 wx.addPhoneCalendar 接口');
    return { success: false, status: 'unsupported', error: '当前环境不支持系统日历' };
  }

  const priorityDesc = PRIORITY_TEXT[todo.priority] || PRIORITY_TEXT.normal;
  const descContent = [
    todo.desc ? `说明：${todo.desc}` : '',
    `优先级：${priorityDesc}`,
    `截止日期：${todo.dueDate}`,
    '—— 来自「豆芽待办」小程序'
  ].filter(Boolean).join('\n');

  return new Promise((resolve) => {
    wx.addPhoneCalendar({
      title: `待办提醒：${todo.title.trim()}`,
      startTime: times.startTime,
      endTime: times.endTime,
      allDay: false,
      description: descContent,
      alarm: true,
      alarmOffset: 0, // 事件开始时准时响铃/弹窗
      success(res) {
        resolve({ success: true, status: 'ok', res });
      },
      fail(err) {
        console.warn('[Calendar] 写入手机系统日历被取消或失败:', err);
        const isCancel = err && (
          err.errMsg?.includes('cancel') ||
          err.errMsg?.includes('deny') ||
          err.errMsg?.includes('auth')
        );
        resolve({
          success: false,
          status: isCancel ? 'cancelled' : 'fail',
          error: err
        });
      }
    });
  });
}

module.exports = {
  computeCalendarTime,
  addTodoToPhoneCalendar,
  DEFAULT_REMINDER_HOUR,
  DEFAULT_REMINDER_MINUTE
};
