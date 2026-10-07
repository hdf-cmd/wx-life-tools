// pages/index/index.js
// 首页 - 仪表盘式总览（设计语言 v2）

const date = require('../../utils/date.js')

Page({
  data: {
    // 问候语相关
    greeting: '你好',
    greetEmoji: '👋',
    nickname: '朋友',
    dateText: '',
    weekDay: '',

    // 实时天气（定位获取，失败时回退问候 emoji）
    weatherIcon: '',
    weatherTemp: '',
    weatherText: '',
    weatherCity: '',

    // 实时统计（本月支出 / 今日打卡 / 最高连续天数）
    stats: {
      expense: '--',
      checkin: '--',
      streak: '0'
    },

    // 功能快捷入口（配色在 index.wxss 的 .quick-icon--<id>，含深色模式变体；
    // 原先把渐变写在 JS 数据里当内联样式，@media prefers-color-scheme 覆盖不到）
    featureCards: [
      {
        id: 'bookkeeping',
        icon: 'card-bookkeeping',
        title: '记账本',
        desc: '轻松记录每笔收支'
      },
      {
        id: 'habit',
        icon: 'card-habit',
        title: '习惯打卡',
        desc: '每天坚持，养成好习惯'
      },
      {
        id: 'random',
        icon: 'card-random',
        title: '随机一下',
        desc: '吃什么喝什么，交给命运'
      },
      {
        id: 'toolbox',
        icon: 'card-toolbox',
        title: '工具箱',
        desc: '媒体工具一站式解决'
      }
    ]
  },

  onShow: function () {
    // 节流：切 Tab 回首页会连续触发 onShow，5 秒内不重复拉数据/重跑动效
    const now = Date.now()
    if (this._lastRefreshAt && now - this._lastRefreshAt < 5000) return
    this._lastRefreshAt = now

    this.initGreeting()
    this.loadStats()
    this.loadWeather()
  },

  onHide: function () {
    this.clearAnimations()
  },

  onUnload: function () {
    this._destroyed = true
    this.clearAnimations()
  },

  /**
   * 数字滚动动效：从 0 缓动到目标值（12 帧 / 约 720ms，三次方缓出）
   * 帧数刻意压低：30ms×600ms 会打出约 20 帧，两个统计键合计 40 次 setData，低端机首屏掉帧
   */
  animateStat: function (key, target, decimals) {
    const that = this
    if (!this._animTimers) this._animTimers = {}
    if (this._animTimers[key]) clearInterval(this._animTimers[key])

    const totalFrames = 12
    let frame = 0
    const timer = setInterval(function () {
      if (that._destroyed) {
        clearInterval(timer)
        return
      }
      frame++
      const p = Math.min(frame / totalFrames, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      const val = target * eased
      const patch = {}
      patch['stats.' + key] = decimals > 0 ? val.toFixed(decimals) : String(Math.round(val))
      that.setData(patch)
      if (p >= 1) clearInterval(timer)
    }, 60)
    this._animTimers[key] = timer
  },

  clearAnimations: function () {
    if (this._animTimers) {
      const that = this
      Object.keys(this._animTimers).forEach(function (k) { clearInterval(that._animTimers[k]) })
      this._animTimers = {}
    }
  },

  /**
   * 初始化问候语与日期
   */
  initGreeting: function () {
    const now = new Date()
    const hour = now.getHours()
    let greeting = '晚上好'
    let greetEmoji = '🌙'
    if (hour < 6) {
      greeting = '夜深了'
      greetEmoji = '🌌'
    } else if (hour < 12) {
      greeting = '早上好'
      greetEmoji = '🌤️'
    } else if (hour < 14) {
      greeting = '中午好'
      greetEmoji = '☀️'
    } else if (hour < 18) {
      greeting = '下午好'
      greetEmoji = '🍃'
    }

    const weekDays = ['日', '一', '二', '三', '四', '五', '六']
    const m = now.getMonth() + 1
    const d = now.getDate()

    this.setData({
      greeting: greeting,
      greetEmoji: greetEmoji,
      dateText: `${m}月${d}日`,
      weekDay: `星期${weekDays[now.getDay()]}`
    })
  },

  /**
   * 加载实时统计（两路并行，互不影响）
   */
  loadStats: function () {
    // 本月支出（云函数 stats 必须带 YYYY-MM，缺参按失败返回，故此处显式传当月）
    wx.cloud.callFunction({
      name: 'bookkeeping',
      data: { action: 'stats', month: date.currentMonthStr() }
    }).then(res => {
      const r = (res && res.result) || {}
      if (r.code === 0) {
        const data = r.data || {}
        this.animateStat('expense', data.totalExpense || 0, 2)
      } else {
        console.error('[index] 本月支出加载失败:', r.msg)
      }
    }).catch((err) => {
      console.error('[index] 本月支出加载失败', err)
    })

    // 今日打卡进度 + 全部习惯中的最高连续天数
    wx.cloud.callFunction({
      name: 'habit',
      data: { action: 'listHabits' }
    }).then(res => {
      const r = (res && res.result) || {}
      if (r.code === 0) {
        const list = Array.isArray(r.data) ? r.data : []
        const done = list.filter(h => h.checkedIn).length
        const maxStreak = list.reduce((m, h) => Math.max(m, h.streak || 0), 0)
        this.setData({ 'stats.checkin': `${done}/${list.length}` })
        this.animateStat('streak', maxStreak, 0)
      }
    }).catch((err) => {
      console.error('[index] 打卡统计加载失败', err)
    })
  },

  /**
   * 加载实时天气（与"附近品牌"共享定位，1 小时缓存保护高德配额）
   */
  loadWeather: function () {
    const CACHE_KEY = 'home_weather_cache'
    let cached = null
    try { cached = wx.getStorageSync(CACHE_KEY) } catch (e) { /* 忽略 */ }
    if (cached && cached.time && Date.now() - cached.time < 3600 * 1000 && cached.data && cached.data.weather) {
      this.applyWeather(cached.data)
      return
    }
    const map = require('../../utils/map.js')
    map.getSharedLocation().then(loc => {
      return map.getWeather(loc.latitude, loc.longitude)
    }).then(data => {
      if (data && data.weather) {
        try {
          wx.setStorageSync(CACHE_KEY, { data: data, time: Date.now() })
        } catch (e) { /* 缓存失败忽略 */ }
        this.applyWeather(data)
      }
    }).catch(() => {
      // 定位/天气失败：静默保留问候 emoji
    })
  },

  /**
   * 渲染天气信息到 Hero 区
   */
  applyWeather: function (data) {
    this.setData({
      weatherIcon: this.weatherToIcon(data.weather),
      weatherTemp: data.temperature ? data.temperature + '°C' : '',
      weatherText: data.weather,
      weatherCity: data.city || ''
    })
  },

  /**
   * 高德天气文案 → emoji 图标
   */
  weatherToIcon: function (w) {
    if (!w) return '🌤️'
    if (w.indexOf('雷') >= 0) return '⛈️'
    if (w.indexOf('雨夹雪') >= 0) return '🌨️'
    if (w.indexOf('雪') >= 0) return '❄️'
    if (w.indexOf('暴雨') >= 0 || w.indexOf('大雨') >= 0) return '🌧️'
    if (w.indexOf('雨') >= 0) return '🌦️'
    if (w.indexOf('霾') >= 0 || w.indexOf('沙') >= 0 || w.indexOf('尘') >= 0 || w.indexOf('雾') >= 0) return '🌫️'
    if (w.indexOf('阴') >= 0) return '☁️'
    if (w.indexOf('多云') >= 0) return '⛅'
    if (w.indexOf('晴') >= 0) return '☀️'
    return '🌤️'
  },

  /**
   * 点击统计卡 / 功能入口 - 切换对应 Tab
   */
  goTab: function (e) {
    const tab = e.currentTarget.dataset.tab
    // tabBar 页面用 switchTab，普通页面用 navigateTo
    const switchMap = {
      bookkeeping: '/pages/bookkeeping/index',
      habit: '/pages/habit/index',
      toolbox: '/pages/toolbox/index'
    }
    const navMap = {
      random: '/pages/random/index'
    }
    if (switchMap[tab]) {
      wx.switchTab({
        url: switchMap[tab],
        fail: () => {
          console.error('跳转失败:', tab)
        }
      })
    } else if (navMap[tab]) {
      wx.navigateTo({ url: navMap[tab] })
    }
  },

  /**
   * 分享给好友
   */
  onShareAppMessage: function () {
    return {
      title: '生活小工具 · 记账、打卡、随机选，一个就够',
      path: '/pages/index/index'
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline: function () {
    return { title: '生活小工具 · 记账、打卡、随机选，一个就够' }
  }
})
