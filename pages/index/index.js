// pages/index/index.js
const { TodoManager } = require('../../utils/todo');
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
    // 快速新增半屏抽屉
    showCreateDrawer: false,
    inputFocus: false,
    newTitle: '',
    newDesc: '',
    newPriority: 'normal',
    newPriorityIndex: 1,
    newDueDate: '',
    priorities: PRIORITIES,
    priorityLabels: PRIORITY_LABELS,
    creating: false
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
        todoManager.list(this.buildWhere(this.data.activeFilter)),
        todoManager.list({})
      ]);
      const list = results[0];
      const all = results[1];
      const total = all.length;
      const completed = all.filter((it) => it.completed).length;
      this.setData({
        list: this.decorate(list),
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
    return list.map((it) => {
      const meta = PRIORITY_META[it.priority] || PRIORITY_META.normal;
      return {
        ...it,
        priorityLabel: meta.label,
        priorityColor: meta.color,
        priorityBg: meta.bg
      };
    });
  },

  /**
   * 切换过滤 Tab。
   */
  onSwitchFilter(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.activeFilter) return;
    this.setData({ activeFilter: key }, () => this.loadTodos());
  },

  /**
   * 点击勾选框：切换完成态（用 catchtap 阻止冒泡到卡片的编辑跳转）。
   */
  async onToggle(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await todoManager.toggle(id);
      this.loadTodos();
    } catch (err) {
      console.error('切换状态失败:', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  /**
   * 长按卡片：确认删除。
   */
  onLongPressDelete(e) {
    const id = e.currentTarget.dataset.id;
    const title = e.currentTarget.dataset.title || '该待办';
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
      wx.showToast({ title: '已删除', icon: 'success' });
      this.loadTodos();
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
      inputFocus: false,
      newTitle: '',
      newDesc: '',
      newPriority: 'normal',
      newPriorityIndex: 1,
      newDueDate: '',
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
    this.setData({ newDueDate: '' });
  },

  /**
   * 保存新增待办并刷新主页列表
   */
  async onSaveCreate() {
    const { newTitle, newDesc, newPriority, newDueDate, creating } = this.data;
    if (creating) return;
    if (!newTitle || !newTitle.trim()) {
      wx.showToast({ title: '请输入待办标题', icon: 'none' });
      return;
    }

    this.setData({ creating: true });
    try {
      await todoManager.create({
        title: newTitle.trim(),
        desc: newDesc ? newDesc.trim() : '',
        priority: newPriority,
        dueDate: newDueDate || ''
      });
      wx.showToast({ title: '已添加', icon: 'success' });
      this.closeCreateDrawer();
      this.loadTodos();
    } catch (err) {
      console.error('新增待办失败:', err);
      wx.showToast({ title: err.message || '添加失败', icon: 'none' });
    } finally {
      this.setData({ creating: false });
    }
  },

  goCreate() {
    this.openCreateDrawer();
  },
  /**
   * 点击卡片：跳转到编辑页。
   */
  goEdit(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/edit/edit?id=${id}` });
  }
});
