// 豆芽待办 · 手机系统日历强提醒助手 (100% 离线、零后端、零月租费)
const { parseDateOnly } = require('./date-helper');

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
 * 底层执行添加系统日历接口
 * @param {Object} todo
 * @param {{ startTime: number, endTime: number }} times
 * @returns {Promise<{ success: boolean, status: string, error?: any }>}
 */
function doAddPhoneCalendar(todo, times) {
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

        // 1. 微信后台《用户隐私保护指引》未配置或未审核通过 (最常见真机无法拉起原因)
        if (errMsg.includes('privacy agreement') || errMsg.includes('not declared in the privacy')) {
          if (wx.showModal) {
            wx.showModal({
              title: '需开启隐私指引',
              content: '微信后台尚未声明“日历(写入)”隐私权限。请小程序管理员在微信公众平台「设置 -> 用户隐私保护指引」中添加该权限并提交审核。',
              showCancel: false,
              confirmText: '我知道了'
            });
          }
          resolve({ success: false, status: 'privacy_missing', error: err });
          return;
        }

        // 2. 如果是系统权限被拒绝 (auth denied / authorize:fail)，引导去设置页开启
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

        // 3. 如果是用户主动在系统弹窗中点击取消
        if (errMsg.includes('cancel')) {
          resolve({ success: false, status: 'cancelled', error: err });
          return;
        }

        // 4. 其他未知异常：明确通过弹窗展示真实错误信息，方便真机排查，绝不静默掩盖
        if (wx.showModal) {
          wx.showModal({
            title: '日历添加异常',
            content: `系统日历调用失败：${errMsg || '未知错误'}`,
            showCancel: false,
            confirmText: '确定'
          });
        }
        resolve({ success: false, status: 'fail', error: err });
      }
    });
  });
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

  // 微信 2023 隐私保护合规拦截处理 (wx.requirePrivacyAuthorize)
  if (typeof wx.requirePrivacyAuthorize === 'function') {
    return new Promise((resolve) => {
      wx.requirePrivacyAuthorize({
        success: async () => {
          const res = await doAddPhoneCalendar(todo, times);
          resolve(res);
        },
        fail: (privErr) => {
          console.warn('[Calendar] 微信隐私授权检查失败:', privErr);
          const errMsg = (privErr && privErr.errMsg) ? String(privErr.errMsg) : '';
          if (errMsg.includes('not declared in the privacy') || errMsg.includes('privacy agreement')) {
            if (wx.showModal) {
              wx.showModal({
                title: '需开启隐私指引',
                content: '微信后台尚未声明“日历(写入)”隐私权限。请小程序管理员在微信公众平台后台添加该权限并审核通过后使用。',
                showCancel: false,
                confirmText: '我知道了'
              });
            }
            resolve({ success: false, status: 'privacy_missing', error: privErr });
          } else {
            // 用户在隐私弹窗中点击拒绝或降级直接尝试
            doAddPhoneCalendar(todo, times).then(resolve);
          }
        }
      });
    });
  }

  return doAddPhoneCalendar(todo, times);
}

module.exports = {
  computeCalendarTime,
  addTodoToPhoneCalendar,
  DEFAULT_REMINDER_HOUR,
  DEFAULT_REMINDER_MINUTE
};
