// pages/index/index.js
const { TodoManager } = require('../../utils/todo');
const { getDueStatus } = require('../../utils/date-helper');
const {
  requestSubscription,
  scheduleReminder,
  cancelReminder
} = require('../../utils/subscribe');
const { addTodoToPhoneCalendar } = require('../../utils/calendar');
const todoManager = new TodoManager();

const FILTERS = {
  ALL: 'all',
  ACTIVE: 'active',
  COMPLETED: 'completed'
};

// 优先级展示元数据（标签文案 / 文字色 / 背景色）
const PRIORITY_META = {
  low: { label: '低', color: '#9aa3af', bg: '#eef0f2' },
  normal: { label: '中', color: '#2f6fed', bg: '#e7efff' },
  high: { label: '高', color: '#e5484d', bg: '#fdeaeb' }
};
const PRIORITIES = ['low', 'normal', 'high'];
const PRIORITY_LABELS = { low: '低', normal: '中', high: '高' };

 Page({
   data: {
     // 当前过滤：all | active | completed
     activeFilter: FILTERS.ALL,
     // 过滤 Tab 配置
     filters: [
       { key: FILTERS.ALL, label: '全部' },
       { key: FILTERS.ACTIVE, label: '进行中' },
       { key: FILTERS.COMPLETED, label: '已完成' }
     ],
     // 列表数据（已补充展示字段）
     list: [],
     // 统计：全部 / 进行中 / 已完成
     stats: { total: 0, active: 0, completed: 0 },
    loading: false,
    // 快速新增/编辑半屏抽屉
    showCreateDrawer: false,
    isDrawerEdit: false,
    editId: '',
    editCompleted: false,
    openedSwipeId: '',
    inputFocus: false,
    newTitle: '',
    newDesc: '',
    newPriority: 'normal',
    newPriorityIndex: 1,
    newDueDate: '',
    newRemind: false,
    priorities: PRIORITIES,
    priorityLabels: PRIORITY_LABELS,
    creating: false
  },
  onLoad(options) {
    if (options && options.todoId) {
      setTimeout(() => {
        this.openEditDrawer(options.todoId);
      }, 350);
    }
  },
  onShow() {
    this.loadTodos();
  },

  onPullDownRefresh() {
    this.loadTodos().then(() => wx.stopPullDownRefresh());
  },

  /**
   * 根据过滤类型构建查询条件。
   */
  buildWhere(filter) {
    if (filter === FILTERS.ACTIVE) return { completed: false };
    if (filter === FILTERS.COMPLETED) return { completed: true };
    return {};
  },

  /**
   * 加载当前过滤列表 + 全量统计。
   */
  async loadTodos() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const results = await Promise.all([
        todoManager.list(this.buildWhere(this.data.activeFilter), { sortBy: 'smart' }),
        todoManager.list({}, { sortBy: 'smart' })
      ]);
      const list = results[0];
      const all = results[1];
      const total = all.length;
      const completed = all.filter((it) => it.completed).length;
      this.setData({
        list: this.decorate(list),
        openedSwipeId: '',
        stats: {
          total,
          active: total - completed,
          completed
        }
      });
    } catch (err) {
      console.error('加载待办失败:', err);
      wx.showToast({ title: '加载失败，请重试', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 为列表项补充展示用字段（优先级标签文案/颜色）。
   */
  decorate(list) {
    const now = new Date();
    return list.map((it) => {
      const meta = PRIORITY_META[it.priority] || PRIORITY_META.normal;
      const due = getDueStatus(it.dueDate, it.completed, now);
      return {
        ...it,
        priorityLabel: meta.label,
        priorityColor: meta.color,
        priorityBg: meta.bg,
        dueMeta: due
      };
    });
  },

  /**
   * 切换过滤 Tab。
   */
  onSwitchFilter(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.activeFilter) return;
    this.setData({ activeFilter: key, openedSwipeId: '' }, () => this.loadTodos());
  },

  /**
   * 点击勾选框：切换完成态（大热区 catchtap，含马达微触感与原位弹跳划线缓冲）。
   */
  async onToggle(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    // 1. 触发轻微马达触感震动反馈 (微动效多巴胺闭环)
    if (typeof wx !== 'undefined' && wx.vibrateShort) {
      wx.vibrateShort({ type: 'light' });
    }
    // 2. 原位乐观更新：让用户立即看到对勾弹跳与文字划线，避免突兀瞬移
    const currentList = this.data.list || [];
    if (target) {
      target.completed = !target.completed;
      this.setData({ list: this.decorate(currentList) });
      if (target.completed) {
        cancelReminder(id);
      }
    }
    try {
      await todoManager.toggle(id);
      setTimeout(() => {
        this.loadTodos();
      }, 240);
    } catch (err) {
      console.error('切换状态失败:', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
      this.loadTodos();
    }
  },

  /**
   * 卡片触摸手势处理（防纵向滚动误触与排他性展开）
   */
  onTouchStart(e) {
    if (!e.touches || !e.touches[0]) return;
    const touch = e.touches[0];
    const id = e.currentTarget.dataset.id;
    this._touch = {
      startX: touch.clientX,
      startY: touch.clientY,
      id,
      lockedDir: ''
    };
    // 如果已有其他卡片处于展开状态，触摸新卡片时立即复位
    if (this.data.openedSwipeId && this.data.openedSwipeId !== id) {
      this.setData({ openedSwipeId: '' });
    }
  },

  onTouchMove(e) {
    if (!this._touch || !this._touch.id || !e.touches || !e.touches[0]) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - this._touch.startX;
    const deltaY = touch.clientY - this._touch.startY;

    // 未锁定方向前做正交位移判定
    if (!this._touch.lockedDir) {
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 8) {
        this._touch.lockedDir = 'vertical'; // 纵向滚动列表，放弃横滑拦截
        return;
      }
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 8) {
        this._touch.lockedDir = 'horizontal'; // 锁定横向手势
      }
    }
  },

  onTouchEnd(e) {
    if (!this._touch || !this._touch.id || !e.changedTouches || !e.changedTouches[0]) {
      this._touch = null;
      return;
    }
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - this._touch.startX;
    const id = this._touch.id;
    const isCurrentOpened = this.data.openedSwipeId === id;

    if (this._touch.lockedDir === 'horizontal') {
      // 左滑动量超过 50px：吸附展开
      if (deltaX < -50) {
        if (!isCurrentOpened) {
          this.setData({ openedSwipeId: id });
          if (typeof wx !== 'undefined' && wx.vibrateShort) {
            wx.vibrateShort({ type: 'light' });
          }
        }
      } else if (deltaX > 30) {
        // 右滑动量超过 30px：吸附收回
        if (isCurrentOpened) {
          this.setData({ openedSwipeId: '' });
        }
      }
    }
    this._touch = null;
  },

  /**
   * 点击卡片内容主体：已左滑展开时点击收回，未展开时打开编辑抽屉
   */
  onCardTap(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.openedSwipeId) {
      this.setData({ openedSwipeId: '' });
      return;
    }
    this.openEditDrawer(id);
  },

  /**
   * 左滑操作：标记完成 / 恢复
   */
  async onSwipeComplete(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ openedSwipeId: '' });
    await this.onToggle({ currentTarget: { dataset: { id } } });
  },

  /**
   * 左滑操作：删除待办
   */
  onSwipeDelete(e) {
    const id = e.currentTarget.dataset.id;
    const title = e.currentTarget.dataset.title || '该待办';
    this.setData({ openedSwipeId: '' });
    wx.showModal({
      title: '删除待办',
      content: `确定删除「${title}」吗？`,
      confirmColor: '#e5484d',
      success: (res) => {
        if (res.confirm) {
          this.doRemove(id);
        }
      }
    });
  },

  /**
   * 长按卡片：确认删除。
   */
  onLongPressDelete(e) {
    const id = e.currentTarget.dataset.id;
    const title = e.currentTarget.dataset.title || '该待办';
    this.setData({ openedSwipeId: '' });
    wx.showModal({
      title: '删除待办',
      content: `确定删除「${title}」吗？`,
      confirmColor: '#e5484d',
      success: (res) => {
        if (res.confirm) {
          this.doRemove(id);
        }
      }
    });
  },
  async doRemove(id) {
    try {
      await todoManager.remove(id);
      cancelReminder(id);
      wx.showToast({ title: '已删除', icon: 'success' });
    } catch (err) {
      console.error('删除失败:', err);
      wx.showToast({ title: '删除失败', icon: 'none' });
    }
  },

  /**
   * 跳转到新增页。
   */
  /**
   * 打开快速新增半屏抽屉
   */
  openCreateDrawer() {
    this.setData({
      showCreateDrawer: true,
      isDrawerEdit: false,
      editId: '',
      inputFocus: false,
      newTitle: '',
      newDesc: '',
      newPriority: 'normal',
      newPriorityIndex: 1,
      newDueDate: '',
      newRemind: false,
      creating: false
    });
    // 动画就绪后自动唤起输入聚焦
    setTimeout(() => {
      if (this.data.showCreateDrawer) {
        this.setData({ inputFocus: true });
      }
    }, 200);
  },

  /**
   * 点击待办卡片：在半屏抽屉中打开编辑
   */
  async openEditDrawer(id) {
    if (!id) return;
    const item = this.data.list.find((it) => it._id === id) || (await todoManager.get(id));
    if (!item) {
      wx.showToast({ title: '待办不存在', icon: 'none' });
      return;
    }
    const idx = PRIORITIES.indexOf(item.priority);
    this.setData({
      showCreateDrawer: true,
      isDrawerEdit: true,
      editId: id,
      inputFocus: false,
      newTitle: item.title || '',
      newDesc: item.desc || '',
      newPriority: item.priority || 'normal',
      newPriorityIndex: idx >= 0 ? idx : 1,
      newDueDate: item.dueDate || '',
      newRemind: !!item.remind,
      editCompleted: !!item.completed,
      creating: false
    });
  },

  /**
   * 抽屉顶栏完成状态切换
   */
  async onToggleDrawerComplete() {
    const { editId, editCompleted } = this.data;
    if (!editId) return;
    if (typeof wx !== 'undefined' && wx.vibrateShort) {
      wx.vibrateShort({ type: 'light' });
    }
    const nextCompleted = !editCompleted;
    this.setData({ editCompleted: nextCompleted });
    if (nextCompleted) {
      cancelReminder(editId);
    }
    try {
      wx.showToast({
        title: nextCompleted ? '已标记为完成' : '已设为进行中',
        icon: 'success',
        duration: 1500
      });
      this.loadTodos();
    } catch (err) {
      console.error('抽屉内切换完成状态失败:', err);
      this.setData({ editCompleted });
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  /**
   * 关闭快速新增半屏抽屉
   */
  closeCreateDrawer() {
    this.setData({
      showCreateDrawer: false,
      inputFocus: false
    });
  },

  /**
   * 空方法，用于阻止蒙层下的页面触摸滚动穿透
   */
  noop() {},

  onNewTitleInput(e) {
    this.setData({ newTitle: e.detail.value });
  },

  onNewDescInput(e) {
    this.setData({ newDesc: e.detail.value });
  },

  onNewPriorityTap(e) {
    const idx = Number(e.currentTarget.dataset.index);
    this.setData({
      newPriorityIndex: idx,
      newPriority: PRIORITIES[idx]
    });
  },

  onNewDateChange(e) {
    this.setData({ newDueDate: e.detail.value });
  },

  onClearNewDueDate() {
    this.setData({ newDueDate: '', newRemind: false });
  },

  onNewRemindChange(e) {
    this.setData({ newRemind: !!e.detail.value });
  },

  /**
   * 保存待办：根据 isDrawerEdit 自动分支为新增或更新
   */
  async onSaveCreate() {
    const { newTitle, newDesc, newPriority, newDueDate, newRemind, isDrawerEdit, editId, creating } = this.data;
    if (creating) return;
    if (!newTitle || !newTitle.trim()) {
      wx.showToast({ title: '请输入待办标题', icon: 'none' });
      return;
    }

    let shouldRemind = !!(newRemind && newDueDate);
    if (shouldRemind) {
      const subRes = await requestSubscription();
      if (subRes.status === 'reject') {
        wx.showToast({ title: '微信提醒未开启，待办已正常保存', icon: 'none' });
        shouldRemind = false;
      }
    }

    this.setData({ creating: true });
    try {
      let savedTodo;
      if (isDrawerEdit) {
        savedTodo = await todoManager.update(editId, {
          title: newTitle.trim(),
          desc: newDesc ? newDesc.trim() : '',
          priority: newPriority,
          dueDate: newDueDate || '',
          remind: shouldRemind
        });
        // 提示交由后续日历联动或默认处理
      } else {
        savedTodo = await todoManager.create({
          title: newTitle.trim(),
          desc: newDesc ? newDesc.trim() : '',
          priority: newPriority,
          dueDate: newDueDate || '',
          remind: shouldRemind
        });
        // 提示交由后续日历联动或默认处理
      }

      // 系统日历强提醒联动
      if (shouldRemind && savedTodo) {
        const calRes = await addTodoToPhoneCalendar(savedTodo);
        if (calRes.success) {
          wx.showToast({ title: isDrawerEdit ? '已保存并加入日历' : '已添加并加入日历', icon: 'success' });
        } else if (calRes.status === 'cancelled') {
          wx.showToast({ title: '待办已保存(未授权日历)', icon: 'none' });
        } else {
          wx.showToast({ title: isDrawerEdit ? '已保存' : '已添加', icon: 'success' });
        }
      } else {
        wx.showToast({ title: isDrawerEdit ? '已保存' : '已添加', icon: 'success' });
      }
      if (shouldRemind && savedTodo) {
        scheduleReminder(savedTodo);
      } else if (isDrawerEdit && !shouldRemind) {
        cancelReminder(editId);
      }

      this.closeCreateDrawer();
      this.loadTodos();
    } catch (err) {
      console.error('保存待办失败:', err);
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ creating: false });
    }
  },
  /**
   * 模态框中删除当前正在编辑的待办
   */
  onDrawerDelete() {
    const { editId, newTitle } = this.data;
    if (!editId) return;
    wx.showModal({
      title: '删除待办',
      content: `确定删除「${newTitle || '该待办'}」吗？`,
      confirmColor: '#e5484d',
      success: async (res) => {
        if (res.confirm) {
          try {
            await todoManager.remove(editId);
            cancelReminder(editId);
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadTodos();
          } catch (err) {
            console.error('删除待办失败:', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  goCreate() {
    this.openCreateDrawer();
  },

  /**
   * 点击待办卡片：在半屏抽屉中打开编辑
   */
  goEdit(e) {
    const id = e.currentTarget.dataset.id;
    this.openEditDrawer(id);
  }
});
