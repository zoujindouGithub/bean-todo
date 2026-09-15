// 微信订阅消息与云开发轻量提醒配置（示例文件）
// 使用说明：
// 1. 在微信公众平台「功能 -> 订阅消息」添加公共模板（如“待办事项提醒”）；
// 2. 在微信开发者工具开通微信云开发，获取环境 ID；
// 3. 将本文件复制或直接修改 config/subscribe.js，填入真实的模板 ID 和环境 ID。

const SUBSCRIBE_CONFIG = {
  // 微信公众平台模板 ID，例如：'vX8...aBcD'
  TEMPLATE_ID: 'YOUR_SUBSCRIBE_TEMPLATE_ID',

  // 微信云开发环境 ID，例如：'prod-1gxxxxxx'
  CLOUD_ENV_ID: 'YOUR_CLOUD_ENV_ID',

  // 默认提醒时间 (24小时制，固定为截止日早晨 09:00)
  REMINDER_HOUR: 9,
  REMINDER_MINUTE: 0,

  // 模板关键词字段映射
  TEMPLATE_KEYS: {
    title: 'thing1',      // 待办事项名称
    time: 'time2',        // 提醒时间
    status: 'phrase3',    // 状态或优先级
    remark: 'thing4'      // 温馨提示
  }
};

function isSubscribeConfigured() {
  return !!(
    SUBSCRIBE_CONFIG.TEMPLATE_ID &&
    SUBSCRIBE_CONFIG.TEMPLATE_ID !== 'YOUR_SUBSCRIBE_TEMPLATE_ID' &&
    SUBSCRIBE_CONFIG.CLOUD_ENV_ID &&
    SUBSCRIBE_CONFIG.CLOUD_ENV_ID !== 'YOUR_CLOUD_ENV_ID'
  );
}

module.exports = {
  SUBSCRIBE_CONFIG,
  isSubscribeConfigured
};
