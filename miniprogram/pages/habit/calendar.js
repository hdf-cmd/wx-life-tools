// pages/habit/calendar.js
// 习惯打卡 - 日历视图页

Page({
  data: {
    // 习惯信息
    habitId: '',
    habitName: '',
    habitIcon: '📌',

    // 日历数据
    year: 0,
    month: 0,
    monthStr: '',        // 显示用月份文字
    calendarDays: [],    // 日历网格数据
    weekHeaders: ['一', '二', '三', '四', '五', '六', '日'],

    // 打卡记录
    logDates: [],        // 已打卡的日期列表
    totalDays: 0,        // 本月应打卡天数
    checkedDays: 0,      // 本月已打卡天数
    completionRate: 0,   // 完成率百分比

    loading: true
  },

  onLoad: function (options) {
    const now = new Date()
    this.setData({
      habitId: options.habitId || '',
      habitName: decodeURIComponent(options.habitName || '习惯'),
      habitIcon: decodeURIComponent(options.habitIcon || '📌'),
      year: now.getFullYear(),
      month: now.getMonth() + 1
    })

    this.buildCalendar()
    this.loadLogs()
  },

  /**
   * 构建日历网格
   */
  buildCalendar: function () {
    const { year, month } = this.data
    const monthStr = `${year}年${month}月`

    // 获取本月第一天是周几（0=周日，需要转为周一开始）
    const firstDay = new Date(year, month - 1, 1).getDay()
    // 转换为周一起始：周日=6，周一=0，周二=1...
    const startOffset = firstDay === 0 ? 6 : firstDay - 1

    // 获取本月天数
    const daysInMonth = new Date(year, month, 0).getDate()

    // 构建日历网格
    const calendarDays = []

    // 填充前面的空白格
    for (let i = 0; i < startOffset; i++) {
      calendarDays.push({ day: '', date: '', isEmpty: true })
    }

    // 填充日期
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      calendarDays.push({
        day: d,
        date: dateStr,
        isEmpty: false,
        isToday: this.isToday(dateStr),
        isChecked: false // 稍后根据打卡记录更新
      })
    }

    this.setData({ calendarDays, monthStr, totalDays: daysInMonth })
  },

  /**
   * 判断是否是今天
   */
  isToday: function (dateStr) {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return dateStr === `${y}-${m}-${d}`
  },

  /**
   * 加载打卡记录
   */
  loadLogs: function () {
    const { habitId, year, month } = this.data
    const monthParam = `${year}-${String(month).padStart(2, '0')}`

    this.setData({ loading: true })

    wx.cloud.callFunction({
      followSystem: true,
      name: 'habit',
      data: {
        action: 'getLogs',
        habitId: habitId,
        month: monthParam
      }
    }).then(res => {
      if (res.result.code === 0) {
        const logs = res.result.data
        const logDates = logs.map(l => l.date)

        // 更新日历格子的打卡状态
        const calendarDays = this.data.calendarDays.map(d => {
          if (!d.isEmpty) {
            d.isChecked = logDates.includes(d.date)
          }
          return d
        })

        // 计算完成率（修复：daysInMonth 从 data 中获取，避免 ReferenceError）
        const daysInMonth = this.data.totalDays
        const rate = daysInMonth > 0 ? Math.round(logDates.length / daysInMonth * 100) : 0

        this.setData({
          logDates: logDates,
          calendarDays: calendarDays,
          checkedDays: logDates.length,
          completionRate: rate,
          loading: false
        })
      } else {
        this.setData({ loading: false })
      }
    }).catch(err => {
      console.error('加载打卡记录失败', err)
      this.setData({ loading: false })
    })
  },

  /**
   * 上个月
   */
  onPrevMonth: function () {
    let { year, month } = this.data
    month--
    if (month < 1) {
      month = 12
      year--
    }
    this.setData({ year, month })
    this.buildCalendar()
    this.loadLogs()
  },

  /**
   * 下个月
   */
  onNextMonth: function () {
    let { year, month } = this.data
    month++
    if (month > 12) {
      month = 1
      year++
    }
    this.setData({ year, month })
    this.buildCalendar()
    this.loadLogs()
  }
})
