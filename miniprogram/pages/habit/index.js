// pages/habit/habit.js
// 习惯打卡 - 列表页

const app = getApp()

Page({
  data: {
    // 今日日期信息
    todayDate: '',      // YYYY-MM-DD
    todayDisplay: '',   // 显示用日期文字
    weekDay: '',        // 星期几

    // 习惯列表
    habitList: [],
    loading: true,

    // 打卡成功提示
    showEncourage: false,
    encourageText: '',

    // 长按操作菜单
    showActionSheet: false,
    currentHabit: null
  },

  onLoad: function () {
    this.initDate()
  },

  onShow: function () {
    // 每次显示页面时刷新列表（从添加页返回时也能刷新）
    this.loadHabits()
  },

  /**
   * 初始化今日日期显示
   */
  initDate: function () {
    const now = new Date()
    const weekDays = ['日', '一', '二', '三', '四', '五', '六']
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    const d = now.getDate()
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

    this.setData({
      todayDate: dateStr,
      todayDisplay: `${m}月${d}日`,
      weekDay: `星期${weekDays[now.getDay()]}`
    })
  },

  /**
   * 加载习惯列表
   */
  loadHabits: function () {
    this.setData({ loading: true })

    wx.cloud.callFunction({
      followSystem: true,
      name: 'habit',
      data: { action: 'listHabits' }
    }).then(res => {
      if (res.result.code === 0) {
        this.setData({
          habitList: res.result.data,
          loading: false
        })
      } else {
        this.setData({ loading: false })
        wx.showToast({ title: res.result.msg || '加载失败', icon: 'none' })
      }
    }).catch(err => {
      console.error('加载习惯列表失败', err)
      this.setData({ loading: false })
      wx.showToast({ title: '网络错误', icon: 'none' })
    })
  },

  /**
   * 点击卡片 - 打卡
   */
  onCardTap: function (e) {
    if (this._checkingIn) return
    const habit = e.currentTarget.dataset.habit
    if (habit.checkedIn) {
      // 已打卡，跳转到日历视图
      wx.navigateTo({
        url: `/pages/habit/calendar?habitId=${habit._id}&habitName=${encodeURIComponent(habit.name)}&habitIcon=${encodeURIComponent(habit.icon)}`
      })
      return
    }

    // 未打卡，执行打卡
    this._checkingIn = true
    wx.cloud.callFunction({
      followSystem: true,
      name: 'habit',
      data: {
        action: 'checkIn',
        habitId: habit._id,
        date: this.data.todayDate
      }
    }).then(res => {
      if (res.result.code === 0) {
        // 打卡成功，显示鼓励文字
        const encourages = [
          '太棒了！坚持就是胜利！',
          '又完成一天，继续加油！',
          '你真棒！习惯正在养成中～',
          '坚持的力量，为你点赞！',
          '每一小步都是大进步！'
        ]
        const text = encourages[Math.floor(Math.random() * encourages.length)]
        this.setData({
          showEncourage: true,
          encourageText: text
        })

        // 2秒后隐藏鼓励
        setTimeout(() => {
          this.setData({ showEncourage: false })
        }, 2000)

        // 刷新列表
        this.loadHabits()
      } else {
        wx.showToast({ title: res.result.msg, icon: 'none' })
      }
    }).catch(err => {
      console.error('打卡失败', err)
      wx.showToast({ title: '打卡失败', icon: 'none' })
    }).finally(() => {
      this._checkingIn = false
    })
  },

  /**
   * 长按卡片 - 显示操作菜单
   */
  onCardLongPress: function (e) {
    const habit = e.currentTarget.dataset.habit
    this.setData({ currentHabit: habit, showActionSheet: true })
  },

  /**
   * 关闭操作菜单
   */
  closeActionSheet: function () {
    this.setData({ showActionSheet: false, currentHabit: null })
  },

  /**
   * 编辑习惯
   */
  onEditHabit: function () {
    const habit = this.data.currentHabit
    this.setData({ showActionSheet: false })
    wx.navigateTo({
      url: `/pages/habit/add?id=${habit._id}&name=${encodeURIComponent(habit.name)}&icon=${encodeURIComponent(habit.icon)}&frequency=${habit.frequency}&targetDays=${habit.targetDays || 0}&weekDays=${encodeURIComponent(JSON.stringify(habit.weekDays || []))}`
    })
  },

  /**
   * 删除习惯（二次确认）
   */
  onDeleteHabit: function () {
    const habit = this.data.currentHabit
    this.setData({ showActionSheet: false })

    wx.showModal({
      title: '确认删除',
      content: `确定要删除「${habit.name}」吗？所有打卡记录也会被清除。`,
      confirmColor: '#FF5252',
      success: (res) => {
        if (res.confirm) {
          wx.cloud.callFunction({
            followSystem: true,
            name: 'habit',
            data: {
              action: 'deleteHabit',
              habitId: habit._id
            }
          }).then(res => {
            if (res.result.code === 0) {
              wx.showToast({ title: '已删除', icon: 'success' })
              this.loadHabits()
            } else {
              wx.showToast({ title: res.result.msg, icon: 'none' })
            }
          }).catch(err => {
            // 删除习惯失败错误处理
            console.error('删除习惯失败:', err)
            wx.showToast({ title: '删除失败', icon: 'none' })
          })
        }
      }
    })
  },

  /**
   * 跳转添加习惯页
   */
  goAddHabit: function () {
    wx.navigateTo({ url: '/pages/habit/add' })
  },

  /**
   * 空状态 - 点击添加
   */
  onEmptyAction: function () {
    this.goAddHabit()
  }
})
