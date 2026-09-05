// pages/habit/add.js
// 习惯打卡 - 添加/编辑习惯页

Page({
  data: {
    // 编辑模式
    isEdit: false,
    habitId: '',

    // 表单数据
    name: '',
    icon: '📌',
    frequency: 'daily',    // daily | weekly
    weekDays: [],          // 每周模式选中的周几
    targetDays: '',

    // 预设 emoji 图标列表
    iconList: [
      { emoji: '📖', label: '阅读' },
      { emoji: '🏃', label: '跑步' },
      { emoji: '💧', label: '喝水' },
      { emoji: '🧘', label: '冥想' },
      { emoji: '✍️', label: '写作' },
      { emoji: '🎸', label: '练琴' },
      { emoji: '🌅', label: '早起' },
      { emoji: '💤', label: '早睡' },
      { emoji: '🍎', label: '健康' },
      { emoji: '📝', label: '日记' },
      { emoji: '💪', label: '健身' },
      { emoji: '🎯', label: '专注' },
      { emoji: '🧹', label: '整理' },
      { emoji: '💊', label: '吃药' },
      { emoji: '🚭', label: '戒烟' },
      { emoji: '🌿', label: '养生' },
      { emoji: '📚', label: '学习' },
      { emoji: '🎨', label: '画画' },
      { emoji: '🐕', label: '遛狗' },
      { emoji: '📌', label: '其他' }
    ],

    // 周几选项
    weekOptions: [
      { value: 1, label: '周一' },
      { value: 2, label: '周二' },
      { value: 3, label: '周三' },
      { value: 4, label: '周四' },
      { value: 5, label: '周五' },
      { value: 6, label: '周六' },
      { value: 7, label: '周日' }
    ],

    // 保存中状态
    saving: false
  },

  onLoad: function (options) {
    // 如果有参数，说明是编辑模式
    if (options.id) {
      this.setData({
        isEdit: true,
        habitId: options.id,
        name: options.name || '',
        icon: options.icon || '📌',
        frequency: options.frequency || 'daily',
        targetDays: options.targetDays || ''
      })
      if (options.weekDays) {
        this.setData({ weekDays: JSON.parse(decodeURIComponent(options.weekDays)) })
      }
      wx.setNavigationBarTitle({ title: '编辑习惯' })
    }
  },

  /**
   * 输入习惯名称
   */
  onNameInput: function (e) {
    this.setData({ name: e.detail.value })
  },

  /**
   * 选择图标
   */
  onIconSelect: function (e) {
    const icon = e.currentTarget.dataset.icon
    this.setData({ icon: icon })
  },

  /**
   * 切换频率
   */
  onFrequencyChange: function (e) {
    const freq = e.currentTarget.dataset.freq
    this.setData({
      frequency: freq,
      weekDays: freq === 'daily' ? [] : this.data.weekDays
    })
  },

  /**
   * 选择周几（每周模式）
   */
  onWeekDayToggle: function (e) {
    const day = e.currentTarget.dataset.day
    let weekDays = [].concat(this.data.weekDays)
    const idx = weekDays.indexOf(day)
    if (idx > -1) {
      weekDays.splice(idx, 1)
    } else {
      weekDays.push(day)
    }
    this.setData({ weekDays: weekDays.sort() })
  },

  /**
   * 输入目标天数
   */
  onTargetInput: function (e) {
    this.setData({ targetDays: e.detail.value })
  },

  /**
   * 保存习惯
   */
  onSave: function () {
    const { name, icon, frequency, weekDays, targetDays, isEdit, habitId } = this.data

    // 表单验证
    if (!name.trim()) {
      wx.showToast({ title: '请输入习惯名称', icon: 'none' })
      return
    }
    if (frequency === 'weekly' && weekDays.length === 0) {
      wx.showToast({ title: '请至少选择一天', icon: 'none' })
      return
    }

    this.setData({ saving: true })

    // 修复 Bug3：根据 isEdit 发送不同 action，编辑时调用 updateHabit
    const action = isEdit ? 'updateHabit' : 'addHabit'
    const callData = {
      action: action,
      name: name.trim(),
      icon: icon,
      frequency: frequency,
      weekDays: weekDays,
      targetDays: targetDays ? parseInt(targetDays) : 0
    }
    if (isEdit) {
      callData.habitId = habitId
    }

    wx.cloud.callFunction({
      followSystem: true,
      name: 'habit',
      data: callData
    }).then(res => {
      this.setData({ saving: false })
      if (res.result.code === 0) {
        wx.showToast({ title: isEdit ? '已更新' : '已添加', icon: 'success' })
        setTimeout(() => { wx.navigateBack() }, 1000)
      } else {
        wx.showToast({ title: res.result.msg, icon: 'none' })
      }
    }).catch(err => {
      this.setData({ saving: false })
      console.error('保存失败', err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    })
  }
})
