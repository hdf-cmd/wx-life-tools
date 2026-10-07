// pages/habit/add.js
// 习惯打卡 - 添加/编辑习惯页

/**
 * 安全解码 URL 参数：小程序 onLoad 拿到的 query 是未解码的原始串，
 * 中文习惯名会保持 %E4%B9%A6… 形态写回数据库；已是明文或解码失败时原样返回
 */
function safeDecode(v) {
  if (v === undefined || v === null) return ''
  try {
    return decodeURIComponent(String(v))
  } catch (e) {
    return String(v)
  }
}

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
        habitId: safeDecode(options.id),
        name: safeDecode(options.name),
        icon: safeDecode(options.icon) || '📌',
        frequency: safeDecode(options.frequency) || 'daily',
        targetDays: safeDecode(options.targetDays)
      })
      if (options.weekDays) {
        let weekDays = []
        try {
          weekDays = JSON.parse(safeDecode(options.weekDays)) || []
        } catch (e) {
          console.error('weekDays 参数解析失败', e)
          weekDays = []
        }
        this.setData({ weekDays: Array.isArray(weekDays) ? weekDays : [] })
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
    // 防重复提交：按钮 disabled 有渲染延迟，快速连点会创建出重复习惯
    if (this.data.saving) return

    const { name, icon, frequency, weekDays, targetDays, isEdit, habitId } = this.data
    const habitName = String(name || '').trim()

    // 表单验证（口径与云函数 addHabit/updateHabit 保持一致）
    if (!habitName) {
      wx.showToast({ title: '请输入习惯名称', icon: 'none' })
      return
    }
    if (habitName.length > 20) {
      wx.showToast({ title: '习惯名称不能超过 20 个字符', icon: 'none' })
      return
    }
    if (frequency === 'weekly' && (!weekDays || weekDays.length === 0)) {
      wx.showToast({ title: '请至少选择一天', icon: 'none' })
      return
    }

    this.setData({ saving: true })

    // 修复 Bug3：根据 isEdit 发送不同 action，编辑时调用 updateHabit
    const action = isEdit ? 'updateHabit' : 'addHabit'
    const callData = {
      action: action,
      name: habitName,
      icon: icon,
      frequency: frequency,
      weekDays: weekDays,
      targetDays: targetDays ? parseInt(targetDays, 10) || 0 : 0
    }
    if (isEdit) {
      callData.habitId = habitId
    }

    wx.cloud.callFunction({
      name: 'habit',
      data: callData
    }).then(res => {
      this.setData({ saving: false })
      const r = (res && res.result) || {}
      if (r.code === 0) {
        wx.showToast({ title: isEdit ? '已更新' : '已添加', icon: 'success' })
        setTimeout(() => { wx.navigateBack() }, 1000)
      } else {
        wx.showToast({ title: r.msg || '保存失败', icon: 'none' })
      }
    }).catch(err => {
      this.setData({ saving: false })
      console.error('保存失败', err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    })
  }
})
