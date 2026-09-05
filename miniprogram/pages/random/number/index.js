// pages/random/number/index.js
// 随机数生成器

const HISTORY_KEY = 'random_number_history'

Page({
  data: {
    minValue: '1',       // 最小值
    maxValue: '100',     // 最大值
    count: '1',          // 生成个数
    allowRepeat: true,   // 是否允许重复
    displayNumber: '?',  // 当前显示数字
    isRolling: false,    // 是否正在滚动
    results: [],         // 本次生成结果
    history: []          // 历史记录（最近10次）
  },

  _timer: null,

  onLoad: function () {
    this.loadHistory()
  },

  onUnload: function () {
    this.clearTimer()
  },

  // 加载历史记录
  loadHistory: function () {
    const history = wx.getStorageSync(HISTORY_KEY) || []
    this.setData({ history: history })
  },

  // 保存历史记录
  saveHistory: function (record) {
    let history = [].concat(this.data.history)
    history.unshift(record)
    // 只保留最近10条
    if (history.length > 10) {
      history = history.slice(0, 10)
    }
    wx.setStorageSync(HISTORY_KEY, history)
    this.setData({ history: history })
  },

  // 输入最小值
  onMinInput: function (e) {
    this.setData({ minValue: e.detail.value })
  },

  // 输入最大值
  onMaxInput: function (e) {
    this.setData({ maxValue: e.detail.value })
  },

  // 输入生成个数
  onCountInput: function (e) {
    this.setData({ count: e.detail.value })
  },

  // 切换允许重复
  toggleAllowRepeat: function () {
    this.setData({ allowRepeat: !this.data.allowRepeat })
  },

  // 生成随机数
  generate: function () {
    const min = parseInt(this.data.minValue)
    const max = parseInt(this.data.maxValue)
    const count = parseInt(this.data.count) || 1
    const allowRepeat = this.data.allowRepeat

    // 验证输入
    if (isNaN(min) || isNaN(max)) {
      wx.showToast({ title: '请输入有效数字', icon: 'none' })
      return
    }

    if (min >= max) {
      wx.showToast({ title: '最小值需小于最大值', icon: 'none' })
      return
    }

    // 检查不重复模式下数量是否超过范围
    const range = max - min + 1
    if (!allowRepeat && count > range) {
      wx.showToast({ title: '数量超过范围内不重复数', icon: 'none' })
      return
    }

    this.setData({ isRolling: true, results: [] })

    // 动画效果：数字快速翻滚
    let interval = 50
    let rollCount = 0
    const maxRoll = 20 + Math.floor(Math.random() * 10)

    const roll = () => {
      // 随机显示一个数字
      const displayNum = min + Math.floor(Math.random() * range)
      this.setData({ displayNumber: displayNum.toString() })
      rollCount++

      if (rollCount >= maxRoll) {
        // 停止，生成最终结果
        const results = this.generateNumbers(min, max, count, allowRepeat)
        this.setData({
          displayNumber: results[0].toString(),
          isRolling: false,
          results: results
        })
        this.clearTimer()

        // 保存到历史
        this.saveHistory({
          numbers: results.join(', '),
          min: min,
          max: max,
          time: new Date().toLocaleTimeString()
        })
        return
      }

      // 逐渐减速
      if (rollCount > maxRoll * 0.6) {
        interval += 20
      }

      this._timer = setTimeout(roll, interval)
    }

    roll()
  },

  // 生成指定数量的随机数
  generateNumbers: function (min, max, count, allowRepeat) {
    const results = []
    const range = max - min + 1

    if (allowRepeat) {
      // 允许重复：直接随机
      for (let i = 0; i < count; i++) {
        results.push(min + Math.floor(Math.random() * range))
      }
    } else {
      // 不重复模式 - 标准 Fisher-Yates 洗牌
      const pool = []
      for (let i = min; i <= max; i++) pool.push(i)
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const temp = pool[i]
        pool[i] = pool[j]
        pool[j] = temp
      }
      return pool.slice(0, count)
    }

    return results
  },

  // 清除定时器
  clearTimer: function () {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
  },

  // 清空历史
  clearHistory: function () {
    wx.showModal({
      title: '确认清空',
      content: '确定清空所有历史记录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.setStorageSync(HISTORY_KEY, [])
          this.setData({ history: [] })
          wx.showToast({ title: '已清空', icon: 'success' })
        }
      }
    })
  },

  /**
   * 分享给好友
   */
  onShareAppMessage: function () {
    return {
      title: '随手一个随机数',
      path: '/pages/random/number/index'
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline: function () {
    return { title: '随手一个随机数' }
  }
})
