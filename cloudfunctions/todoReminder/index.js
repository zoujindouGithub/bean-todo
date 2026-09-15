// 豆芽待办 · 微信订阅消息定时下发与撤销云函数
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const COLLECTION_NAME = 'reminders';

/**
 * 获取上海时区的当前日期字符串 (YYYY-MM-DD)
 */
function getShanghaiToday() {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((p) => p.type === 'year').value;
  const month = parts.find((p) => p.type === 'month').value;
  const day = parts.find((p) => p.type === 'day').value;
  return `${year}-${month}-${day}`;
}

/**
 * 优先级中文映射
 */
const PRIORITY_MAP = {
  high: '高优先级',
  normal: '中优先级',
  low: '低优先级'
};

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID || event.openid;
  const action = event.action || (event.Type === 'Timer' ? 'checkAndSend' : 'unknown');

  switch (action) {
    /**
     * 1. 注册/更新提醒任务 (schedule)
     */
    case 'schedule': {
      if (!openid) {
        return { code: 401, message: '未获取到用户有效 openid' };
      }
      const todoId = event.todoId;
      const dueDate = event.dueDate;
      const title = (event.title || '').trim().slice(0, 20) || '待办事项提醒';
      const priority = event.priority || 'normal';

      if (!todoId || !dueDate) {
        return { code: 400, message: '缺少 todoId 或 dueDate 参数' };
      }

      // 检查或覆盖旧记录
      const existRes = await db.collection(COLLECTION_NAME).where({
        openid,
        todoId
      }).get();

      if (existRes.data && existRes.data.length > 0) {
        await db.collection(COLLECTION_NAME).doc(existRes.data[0]._id).update({
          data: {
            title,
            dueDate,
            priority,
            updatedAt: Date.now()
          }
        });
        return { code: 0, message: '提醒任务已更新', reminderId: existRes.data[0]._id };
      } else {
        const addRes = await db.collection(COLLECTION_NAME).add({
          data: {
            openid,
            todoId,
            title,
            dueDate,
            priority,
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        });
        return { code: 0, message: '提醒任务已注册', reminderId: addRes._id };
      }
    }

    /**
     * 2. 撤销/取消提醒任务 (cancel) - 本地打勾完成或删除时静默调用
     */
    case 'cancel': {
      const todoId = event.todoId;
      if (!todoId) {
        return { code: 400, message: '缺少 todoId 参数' };
      }

      const removeRes = await db.collection(COLLECTION_NAME).where({
        openid,
        todoId
      }).remove();

      return { code: 0, message: '提醒任务已撤销', removed: removeRes.stats.removed };
    }

    /**
     * 3. 扫描并下发到期提醒 (checkAndSend / Timer 自动调用)
     */
    case 'checkAndSend': {
      const todayStr = getShanghaiToday();
      const templateId = event.templateId;

      // 查询所有今天到期的待办提醒
      const queryRes = await db.collection(COLLECTION_NAME).where({
        dueDate: todayStr
      }).limit(100).get();

      const list = queryRes.data || [];
      const stats = { total: list.length, sent: 0, failed: 0 };

      for (const item of list) {
        try {
          if (templateId) {
            await cloud.openapi.subscribeMessage.send({
              touser: item.openid,
              templateId: templateId,
              page: `pages/index/index?todoId=${encodeURIComponent(item.todoId)}`,
              data: {
                thing1: { value: item.title.slice(0, 20) },
                time2: { value: `${item.dueDate} 09:00` },
                phrase3: { value: PRIORITY_MAP[item.priority] || '进行中' },
                thing4: { value: '点击进入小程序查看待办详情' }
              },
              miniprogramState: 'formal'
            });
            stats.sent += 1;
          }
        } catch (sendErr) {
          stats.failed += 1;
          console.error(`下发提醒失败 [todoId: ${item.todoId}]:`, sendErr);
        } finally {
          // 践行发完即焚：无论成功还是失败，均从待下发记录中物理移除，避免重复骚扰
          try {
            await db.collection(COLLECTION_NAME).doc(item._id).remove();
          } catch (delErr) {
            console.error(`清理已处理提醒失败:`, delErr);
          }
        }
      }

      return { code: 0, message: '到期提醒批处理已执行', stats, today: todayStr };
    }

    default:
      return { code: 404, message: `未知 action: ${action}` };
  }
};
