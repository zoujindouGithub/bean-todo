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

  const nowSeconds = Math.floor(now.getTime() / 1000);
  let startSeconds = Math.floor(targetDate.getTime() / 1000);

  // 健壮性防御：如果计算出的提醒时间早于或等于当前系统时间（如截止于今天且已过早晨9点，或误选了历史日期）
  // 自动将提醒时间顺延至当前时间后 10 分钟，确保 iOS / Android 系统日历不会因过去时间而拒绝写入
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
 * 将待办事项添加到手机系统日历 (支持 iOS / Android 原生日历日程强提醒)
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
        console.warn('[Calendar] 写入手机系统日历失败:', err);
        const errMsg = (err && err.errMsg) ? String(err.errMsg) : '';

        // 1. 如果是权限被拒绝 (auth denied / authorize:fail)，弹窗引导用户前往设置开启
        if (errMsg.includes('auth denied') || errMsg.includes('authorize:fail')) {
          if (wx.showModal) {
            wx.showModal({
              title: '需要日历权限',
              content: '添加手机日历强提醒需要开启日历读写权限。是否前往设置开启？',
              confirmText: '去设置',
              confirmColor: '#2f6fed',
              success(modalRes) {
                if (modalRes.confirm && wx.openSetting) {
                  wx.openSetting();
                }
              }
            });
          }
          resolve({ success: false, status: 'denied', error: err });
          return;
        }

        // 2. 如果是用户主动点击系统日历弹窗的取消/拒绝
        if (errMsg.includes('cancel')) {
          resolve({ success: false, status: 'cancelled', error: err });
          return;
        }

        // 3. 其他未知异常
        resolve({ success: false, status: 'fail', error: err });
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
