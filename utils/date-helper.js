/**
 * utils/date-helper.js
 * 待办项截止日期紧迫度计算、视觉分级与智能排序辅助工具
 */

/**
 * 优先级权重（用于排序比较）
 */
const PRIORITY_ORDER = {
  high: 3,
  normal: 2,
  low: 1
};

/**
 * 解析 "YYYY-MM-DD" 字符串为本地零点时间 Date 对象
 * @param {string} str
 * @returns {Date|null}
 */
function parseDateOnly(str) {
  if (!str || typeof str !== 'string') return null;
  const parts = str.trim().split('-');
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null;
  const date = new Date(y, m - 1, d, 0, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  // 防 JS Date 跨月自动溢出，例如 9月32日
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }
  return date;
}

/**
 * 归一化 Date 对象为当天 00:00:00.000
 * @param {Date} date
 * @returns {Date}
 */
function toMidnight(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * 计算截止日期与基准日期的天数差
 * diffDays < 0: 已逾期
 * diffDays = 0: 今天到期
 * diffDays = 1: 明天到期
 * diffDays > 1: 未来到期
 * @param {string} dueDateStr
 * @param {Date} [now=new Date()]
 * @returns {number|null} 无法解析时返回 null
 */
function getDueDiffDays(dueDateStr, now = new Date()) {
  const target = parseDateOnly(dueDateStr);
  if (!target) return null;
  const today = toMidnight(now);
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (24 * 3600 * 1000));
}

/**
 * 获取待办截止日期的展示元数据（包含视觉分级、文案、主题色与紧迫度层级）
 *
 * 分级规范（越近越醒目）：
 * 1. 已完成: 中性淡灰，降低视觉噪音
 * 2. 已逾期 (diffDays < 0): 警示深红 (#e5484d / #ffebee)，展示具体逾期天数
 * 3. 今天截止 (diffDays = 0): 炽烈橙红 (#e03e1a / #fff0ee)，强调今日必办
 * 4. 明天截止 (diffDays = 1): 暖橙色 (#d97706 / #fef3c7)，提醒及早推进
 * 5. 2~3天内 (diffDays 2~3): 活力蓝 (#2563eb / #eff6ff)，清晰温和
 * 6. 远期 (>3天): 平静中性灰 (#6b7280 / #f3f4f6)，背景融合
 *
 * @param {string} dueDateStr
 * @param {boolean} [completed=false]
 * @param {Date} [now=new Date()]
 * @returns {Object}
 */
function getDueStatus(dueDateStr, completed = false, now = new Date()) {
  if (!dueDateStr) {
    return {
      type: 'none',
      label: '',
      color: '',
      bg: '',
      textClass: '',
      tier: 99
    };
  }

  // 已完成待办弱化呈现
  if (completed) {
    return {
      type: 'completed',
      label: `截止 ${dueDateStr}`,
      color: '#9ca3af',
      bg: '#f3f4f6',
      textClass: 'due--completed',
      tier: 90
    };
  }

  const diffDays = getDueDiffDays(dueDateStr, now);
  if (diffDays === null) {
    return {
      type: 'invalid',
      label: `截止 ${dueDateStr}`,
      color: '#6b7280',
      bg: '#f3f4f6',
      textClass: 'due--later',
      tier: 50
    };
  }

  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    const label = overdueDays === 1 ? '已逾期 1 天' : `已逾期 ${overdueDays} 天`;
    return {
      type: 'overdue',
      label,
      color: '#e5484d',
      bg: '#ffebee',
      textClass: 'due--overdue',
      tier: 1
    };
  }

  if (diffDays === 0) {
    return {
      type: 'today',
      label: '今天截止',
      color: '#e03e1a',
      bg: '#fff0ee',
      textClass: 'due--today',
      tier: 2
    };
  }

  if (diffDays === 1) {
    return {
      type: 'tomorrow',
      label: '明天截止',
      color: '#d97706',
      bg: '#fef3c7',
      textClass: 'due--tomorrow',
      tier: 3
    };
  }

  if (diffDays <= 3) {
    return {
      type: 'soon',
      label: `${diffDays}天后截止`,
      color: '#2563eb',
      bg: '#eff6ff',
      textClass: 'due--soon',
      tier: 4
    };
  }

  return {
    type: 'later',
    label: `截止 ${dueDateStr}`,
    color: '#6b7280',
    bg: '#f3f4f6',
    textClass: 'due--later',
    tier: 5
  };
}

/**
 * 待办列表智能排序算法
 *
 * 排序法则：
 * 1. 完成状态分流：未完成排前，已完成统一沉底；
 * 2. 未完成梯队：
 *    - Tier 1: 已逾期未完成（最危急，按截止日期由早到晚升序排，越早逾期越靠前）
 *    - Tier 2: 今天截止未完成（今日必须处理，按优先级由高到低，再按创建时间倒序）
 *    - Tier 3: 明天截止未完成（及早准备，按优先级由高到低，再按创建时间倒序）
 *    - Tier 4: 近期(2-3天)截止未完成（按截止日期由近到远升序，再按优先级）
 *    - Tier 5: 远期截止与无截止日期正常待办：
 *             - 优先级优先（高 > 普通 > 低）
 *             - 同等优先级下，有截止日期的早于无截止日期的（按日期升序）
 *             - 其余按创建时间倒序（最新创建优先）
 * 3. 已完成梯队：
 *    - 按完成时间倒序（最新完成的靠前），无完成时间则按更新/创建时间倒序
 *
 * @param {Array<Object>} list
 * @param {Date} [now=new Date()]
 * @returns {Array<Object>}
 */
function sortTodoList(list, now = new Date()) {
  if (!Array.isArray(list) || list.length <= 1) return list || [];

  return [...list].sort((a, b) => {
    // 1. 完成状态沉底原则
    const aComp = !!a.completed;
    const bComp = !!b.completed;
    if (aComp !== bComp) {
      return aComp ? 1 : -1;
    }

    // 2. 已完成项排序：完成时间倒序（最近完成的在前）
    if (aComp && bComp) {
      const aDoneTime = Number(a.completedAt || a.updatedAt || a.createdAt || 0);
      const bDoneTime = Number(b.completedAt || b.updatedAt || b.createdAt || 0);
      return bDoneTime - aDoneTime;
    }

    // 3. 未完成项综合紧迫度 + 优先级智能排序
    const aDiff = getDueDiffDays(a.dueDate, now);
    const bDiff = getDueDiffDays(b.dueDate, now);

    const getRank = (item, diff) => {
      if (diff !== null) {
        if (diff < 0) return { tier: 1, diff }; // 已逾期
        if (diff === 0) return { tier: 2, diff: 0 }; // 今天
        if (diff === 1) return { tier: 3, diff: 1 }; // 明天
        if (diff <= 3) return { tier: 4, diff }; // 2-3天内
        return { tier: 5, diff }; // 远期
      }
      return { tier: 5, diff: Infinity }; // 无截止日期
    };

    const rankA = getRank(a, aDiff);
    const rankB = getRank(b, bDiff);

    // 梯队不同直接按梯队排列 (Tier 1 < Tier 2 < Tier 3 < Tier 4 < Tier 5)
    if (rankA.tier !== rankB.tier) {
      return rankA.tier - rankB.tier;
    }

    const prioA = PRIORITY_ORDER[a.priority] || PRIORITY_ORDER.normal;
    const prioB = PRIORITY_ORDER[b.priority] || PRIORITY_ORDER.normal;
    const createA = Number(a.createdAt || 0);
    const createB = Number(b.createdAt || 0);

    // 同为 Tier 1 (已逾期)：截止日期越早，逾期越久，越要优先处理 (按截止日期升序)
    if (rankA.tier === 1) {
      if (rankA.diff !== rankB.diff) {
        return rankA.diff - rankB.diff;
      }
      if (prioA !== prioB) return prioB - prioA;
      return createB - createA;
    }

    // 同为 Tier 2 (今天截止) 或 Tier 3 (明天截止)：
    // 先按优先级高低，再按创建时间倒序
    if (rankA.tier === 2 || rankA.tier === 3) {
      if (prioA !== prioB) return prioB - prioA;
      return createB - createA;
    }

    // 同为 Tier 4 (近期 2-3 天内)：
    // 先按到期日期升序（近的在前），再按优先级，最后按创建时间倒序
    if (rankA.tier === 4) {
      if (rankA.diff !== rankB.diff) {
        return rankA.diff - rankB.diff;
      }
      if (prioA !== prioB) return prioB - prioA;
      return createB - createA;
    }

    // 同为 Tier 5 (远期 或 无截止日期)：
    // 首先看优先级（高优 > 普通 > 低优）
    if (prioA !== prioB) {
      return prioB - prioA;
    }
    // 优先级相同时：有较早截止日期的优先于较晚截止日期/无截止日期的
    if (rankA.diff !== rankB.diff) {
      return rankA.diff - rankB.diff;
    }
    // 最后按创建时间倒序
    return createB - createA;
  });
}

module.exports = {
  PRIORITY_ORDER,
  parseDateOnly,
  toMidnight,
  getDueDiffDays,
  getDueStatus,
  sortTodoList
};
