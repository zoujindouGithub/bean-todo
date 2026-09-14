// pages/edit/edit.js
const { TodoManager } = require('../../utils/todo');
const todoManager = new TodoManager();

const PRIORITIES = ['low', 'normal', 'high'];
const PRIORITY_LABELS = { low: '低', normal: '中', high: '高' };

Page({
  data: {
    isEdit: false, // 是否为编辑模式
    id: '', // 编辑模式下的文档 _id
    title: '',
    desc: '',
    priority: 'normal', // low | normal | high
    priorityIndex: 1, // 默认 normal
    dueDate: '',
    priorities: PRIORITIES,
    priorityLabels: PRIORITY_LABELS,
    saving: false
  },

  onLoad(options) {
    if (options && options.id) {
      this.setData({ isEdit: true, id: options.id });
      wx.setNavigationBarTitle({ title: '编辑待办' });
      this.loadDetail(options.id);
    } else {
      wx.setNavigationBarTitle({ title: '新增待办' });
    }
  },

  /**
   * 编辑模式：加载并回填表单。
   */
  async loadDetail(id) {
    try {
      const item = await todoManager.get(id);
      if (!item) {
        wx.showToast({ title: '待办不存在', icon: 'none' });
        return;
      }
      const idx = PRIORITIES.indexOf(item.priority);
      this.setData({
        title: item.title || '',
        desc: item.desc || '',
        priority: item.priority || 'normal',
        priorityIndex: idx >= 0 ? idx : 1,
        dueDate: item.dueDate || ''
      });
    } catch (err) {
      console.error('加载详情失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value });
  },

  onDescInput(e) {
    this.setData({ desc: e.detail.value });
  },

  onPriorityTap(e) {
    const idx = Number(e.currentTarget.dataset.index);
    this.setData({ priorityIndex: idx, priority: PRIORITIES[idx] });
  },

  onDateChange(e) {
    this.setData({ dueDate: e.detail.value });
  },

  /**
   * 保存：新增或更新。
   */
  async onSave() {
    const { title, desc, priority, dueDate, isEdit, id, saving } = this.data;
    if (saving) return;
    if (!title || !title.trim()) {
      wx.showToast({ title: '请输入标题', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      if (isEdit) {
        await todoManager.update(id, {
          title: title.trim(),
          desc: desc || '',
          priority,
          dueDate: dueDate || ''
        });
        wx.showToast({ title: '已保存', icon: 'success' });
      } else {
        await todoManager.create({
          title: title.trim(),
          desc: desc || '',
          priority,
          dueDate: dueDate || ''
        });
        wx.showToast({ title: '已添加', icon: 'success' });
      }
      setTimeout(() => wx.navigateBack(), 400);
    } catch (err) {
      console.error('保存失败:', err);
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  /**
   * 编辑模式：删除当前待办。
   */
  onDelete() {
    const { id, title } = this.data;
    wx.showModal({
      title: '删除待办',
      content: `确定删除「${title || '该待办'}」吗？`,
      confirmColor: '#e5484d',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await todoManager.remove(id);
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 400);
        } catch (err) {
          console.error('删除失败:', err);
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  }
});
