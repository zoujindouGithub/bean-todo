// 微信订阅消息与云开发轻量提醒配置
// 若需开启微信通知提醒，请在此填入你在微信公众平台申请的模板 ID 和云开发环境 ID。
// 若未配置，系统会自动降级为纯本地运行模式，不影响任何离线待办功能。

const SUBSCRIBE_CONFIG = {
  // 订阅消息模板 ID (一次性订阅，类目推荐：工具 > 备忘录/便签，模板关键词包含：待办事项、提醒时间、温馨提示)
  TEMPLATE_ID: '',

  // 微信云开发环境 ID (若使用云开发混合模式下发提醒)
  CLOUD_ENV_ID: '',

  // 默认提醒时间 (24小时制，固定为截止日早晨 09:00)
  REMINDER_HOUR: 9,
  REMINDER_MINUTE: 0,

  // 提醒卡片字段 key 映射（根据你在微信公众平台选取的模板关键词字段名调整）
  TEMPLATE_KEYS: {
    title: 'thing1',      // 待办事项/任务名称 (20个字符以内)
    time: 'time2',        // 提醒时间 (如 2026-09-18 09:00)
    status: 'phrase3',    // 优先级/状态 (如 进行中 / 高优先级)
    remark: 'thing4'      // 温馨提示 (如 点击进入小程序查看待办详情)
  }
};

/**
 * 校验订阅消息功能是否已正确配置
 * @returns {boolean}
 */
function isSubscribeConfigured() {
  return !!(
    SUBSCRIBE_CONFIG.TEMPLATE_ID &&
    SUBSCRIBE_CONFIG.TEMPLATE_ID.trim() !== '' &&
    SUBSCRIBE_CONFIG.CLOUD_ENV_ID &&
    SUBSCRIBE_CONFIG.CLOUD_ENV_ID.trim() !== ''
  );
}

module.exports = {
  SUBSCRIBE_CONFIG,
  isSubscribeConfigured
};
