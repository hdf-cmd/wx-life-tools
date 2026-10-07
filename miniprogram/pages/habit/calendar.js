// pages/habit/calendar.js
// 习惯打卡 - 日历视图页

const { pad2, todayStr, monthKey, shiftMonth, daysInMonth, parseLocalDate } = require('../../utils/date.js')

/** URL 参数可能是未解码的原始串，解码失败（残缺 %xx）时原样返回 */
function safeDecode(v) {
  if (v === undefined || v === null) return ''
  try {
    return decodeURIComponent(String(v))
  } catch (e) {
    return String(v)
  }
}

/**
 * 当月应打卡天数
 * daily（或 weekly 但没选周几）= 当月天数；weekly = 当月落在 weekDays 上的天数
 * weekDays 口径：1=周一 … 7=周日，与 add 页 weekOptions 一致
 */
function calcExpectedDays(monthStr, frequency, weekDays) {
  const total = daysInMonth(monthStr)
  if (frequency !== 'weekly' || !Array.isArray(weekDays) || weekDays.length === 0) return total
  let count = 0
  for (let d = 1; d <= total; d++) {
    const dow = parseLocalDate(`${monthStr}-${pad2(d)}`).getDay()
    const adjusted = dow === 0 ? 7 : dow
    if (weekDays.map(Number).indexOf(adjusted) > -1) count++
  }
  return count
}

Page({
  data: {
    // 习惯信息
    habitId: '',
    habitName: '',
    habitIcon: '📌',
    frequency: 'daily',  // daily | weekly
    weekDays: [],        // weekly 习惯的打卡周几

    // 日历数据
    year: 0,
    month: 0,
    monthStr: '',        // 显示用月份文字
    calendarDays: [],    // 日历网格数据
    weekHeaders: ['一', '二', '三', '四', '五', '六', '日'],

    // 打卡记录
    logDates: [],        // 已打卡的日期列表
    expectedDays: 0,     // 本月应打卡天数（按习惯频率算，作为完成率分母）
    checkedDays: 0,      // 本月已打卡天数
    completionRate: 0,   // 完成率百分比
    bestStreak: 0,       // 本月内最长连续打卡天数

    loading: true,
    loadError: false
  },

  onLoad: function (options) {
    this._reqSeq = 0        // 请求序号：切月/重试后丢弃在途旧请求，避免上月数据画到本月
    this._destroyed = false

    let weekDays = []
    try {
      const parsed = options.weekDays ? JSON.parse(safeDecode(options.weekDays)) : []
      if (Array.isArray(parsed)) weekDays = parsed
    } catch (e) {
      console.error('weekDays 参数解析失败', e)
    }

    const now = new Date()
    this.setData({
      habitId: options.habitId || '',
      habitName: safeDecode(options.habitName) || '习惯',
      habitIcon: safeDecode(options.habitIcon) || '📌',
      frequency: safeDecode(options.frequency) || 'daily',
      weekDays: weekDays,
      year: now.getFullYear(),
      month: now.getMonth() + 1
    })

    this.buildCalendar()
    this.loadLogs()
  },

  onUnload: function () {
    this._destroyed = true
  },

  /**
   * 构建日历网格
   */
  buildCalendar: function () {
    const { year, month } = this.data
    const monthStr = `${year}年${month}月`
    const mk = monthKey(year, month)

    // 获取本月第一天是周几（0=周日，需要转为周一开始）
    const firstDay = parseLocalDate(`${mk}-01`).getDay()
    // 转换为周一起始：周日=6，周一=0，周二=1...
    const startOffset = firstDay === 0 ? 6 : firstDay - 1

    // 获取本月天数
    const total = daysInMonth(mk)
    const today = todayStr()

    // 构建日历网格
    const calendarDays = []

    // 填充前面的空白格：date 全为空串会让 wx:key 重复（单月最多 6 个），必须给唯一 uid
    for (let i = 0; i < startOffset; i++) {
      calendarDays.push({ day: '', date: '', uid: `blank-${i}`, isEmpty: true })
    }

    // 填充日期
    for (let d = 1; d <= total; d++) {
      const dateStr = `${mk}-${pad2(d)}`
      calendarDays.push({
        day: d,
        date: dateStr,
        uid: dateStr,
        isEmpty: false,
        isToday: dateStr === today,
        isChecked: false // 稍后根据打卡记录更新
      })
    }

    this.setData({
      calendarDays,
      monthStr,
      expectedDays: calcExpectedDays(mk, this.data.frequency, this.data.weekDays)
    })
  },

  /**
   * 加载打卡记录
   */
  loadLogs: function () {
    const that = this
    const { habitId, year, month } = this.data
    const mk = monthKey(year, month)
    const seq = ++this._reqSeq

    this.setData({ loading: true, loadError: false })

    wx.cloud.callFunction({
      name: 'habit',
      data: {
        action: 'getLogs',
        habitId: habitId,
        month: mk
      }
    }).then(res => {
      // 在途旧请求（用户已切月/已重试/页面已退出）结果一律丢弃
      if (seq !== that._reqSeq || that._destroyed) return

      const r = (res && res.result) || {}
      if (r.code === 0) {
        const logs = r.data || []
        const logDates = logs.map(l => l.date)

        // 更新日历格子的打卡状态
        const calendarDays = that.data.calendarDays.map(d => {
          if (d.isEmpty) return d
          d.isChecked = logDates.indexOf(d.date) > -1
          return d
        })

        // 完成率分母 = 本月应打卡天数（daily 是整月天数，weekly 只算该打卡的那几天）
        const expectedDays = calcExpectedDays(mk, this.data.frequency, this.data.weekDays)
        const rate = expectedDays > 0 ? Math.min(100, Math.round(logDates.length / expectedDays * 100)) : 0

        // 本月内最长连续打卡天数（日期字符串升序逐日比较）
        const sorted = logDates.slice().sort()
        let best = 0
        let run = 0
        let prevTime = 0
        sorted.forEach(ds => {
          const t = parseLocalDate(ds).getTime()
          if (prevTime && t - prevTime === 86400000) {
            run++
          } else {
            run = 1
          }
          prevTime = t
          if (run > best) best = run
        })

        this.setData({
          logDates: logDates,
          calendarDays: calendarDays,
          expectedDays: expectedDays,
          checkedDays: logDates.length,
          completionRate: rate,
          bestStreak: best,
          loading: false,
          loadError: false
        })
      } else {
        // 非 0 码以前是静默的：整月空白看着像数据丢了
        console.error('加载打卡记录失败', r)
        this.setData({ loading: false, loadError: true })
        wx.showToast({ title: r.msg || '打卡记录加载失败', icon: 'none' })
      }
    }).catch(err => {
      if (seq !== that._reqSeq || that._destroyed) return
      console.error('加载打卡记录失败', err)
      this.setData({ loading: false, loadError: true })
      wx.showToast({ title: '网络错误', icon: 'none' })
    })
  },

  /**
   * 切月：先把旧月的网格与统计归零再发请求，否则上月数据会挂在本月标题下闪一下
   */
  applyMonth: function (year, month) {
    this.setData({
      year: year,
      month: month,
      calendarDays: [],
      logDates: [],
      expectedDays: 0,
      checkedDays: 0,
      completionRate: 0,
      bestStreak: 0,
      loading: true,
      loadError: false
    })
    this.buildCalendar()
    this.loadLogs()
  },

  /**
   * 上个月
   */
  onPrevMonth: function () {
    const parts = shiftMonth(monthKey(this.data.year, this.data.month), -1).split('-')
    this.applyMonth(parseInt(parts[0], 10), parseInt(parts[1], 10))
  },

  /**
   * 下个月
   */
  onNextMonth: function () {
    const parts = shiftMonth(monthKey(this.data.year, this.data.month), 1).split('-')
    this.applyMonth(parseInt(parts[0], 10), parseInt(parts[1], 10))
  },

  /**
   * 分享给好友
   */
  onShareAppMessage: function () {
    return {
      title: '我的打卡日历，坚持看得见',
      path: '/pages/habit/calendar'
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline: function () {
    return { title: '我的打卡日历，坚持看得见' }
  }
})
