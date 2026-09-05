// pages/index/index.js
// 首页 - 仪表盘式总览（设计语言 v2）

const app = getApp()

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

    // 功能快捷入口
    featureCards: [
      {
        id: 'bookkeeping',
        icon: 'card-bookkeeping',
        title: '记账本',
        desc: '轻松记录每笔收支',
        bg: 'linear-gradient(135deg, #E3F0FF 0%, #CFE4FF 100%)'
      },
      {
        id: 'habit',
        icon: 'card-habit',
        title: '习惯打卡',
        desc: '每天坚持，养成好习惯',
        bg: 'linear-gradient(135deg, #E4F7E6 0%, #CFF0D3 100%)'
      },
      {
        id: 'random',
        icon: 'card-random',
        title: '随机一下',
        desc: '吃什么喝什么，交给命运',
        bg: 'linear-gradient(135deg, #FFEBE8 0%, #FFD9D3 100%)'
      },
      {
        id: 'toolbox',
        icon: 'card-toolbox',
        title: '工具箱',
        desc: '媒体工具一站式解决',
        bg: 'linear-gradient(135deg, #F1EAFE 0%, #E4D8FB 100%)'
      }
    ]
  },

  onShow: function () {
    this.initGreeting()
    this.updateNickname()
    this.loadStats()
    this.loadWeather()
  },

  onHide: function () {
    this.clearAnimations()
  },

  onUnload: function () {
    this.clearAnimations()
  },

  /**
   * 数字滚动动效：从 0 缓动到目标值（约 600ms，三次方缓出）
   */
  animateStat: function (key, target, decimals) {
    const that = this
    if (!this._animTimers) this._animTimers = {}
    if (this._animTimers[key]) clearInterval(this._animTimers[key])

    const duration = 600
    const t0 = Date.now()
    const timer = setInterval(function () {
      const p = Math.min((Date.now() - t0) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      const val = target * eased
      const patch = {}
      patch['stats.' + key] = decimals > 0 ? val.toFixed(decimals) : String(Math.round(val))
      that.setData(patch)
      if (p >= 1) clearInterval(timer)
    }, 30)
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
   * 更新昵称显示
   */
  updateNickname: function () {
    const userInfo = app.globalData.userInfo
    if (userInfo && userInfo.nickName) {
      this.setData({ nickname: userInfo.nickName })
    } else {
      const cachedName = wx.getStorageSync('userNickname')
      if (cachedName) {
        this.setData({ nickname: cachedName })
      }
    }
  },

  /**
   * 加载实时统计（两路并行，互不影响）
   */
  loadStats: function () {
    // 本月支出
    wx.cloud.callFunction({
      followSystem: true,
      name: 'bookkeeping',
      data: { action: 'stats' }
    }).then(res => {
      if (res.result.code === 0) {
        this.animateStat('expense', res.result.data.totalExpense, 2)
      }
    }).catch(() => {})

    // 今日打卡进度 + 全部习惯中的最高连续天数
    wx.cloud.callFunction({
      followSystem: true,
      name: 'habit',
      data: { action: 'listHabits' }
    }).then(res => {
      if (res.result.code === 0) {
        const list = res.result.data || []
        const done = list.filter(h => h.checkedIn).length
        const maxStreak = list.reduce((m, h) => Math.max(m, h.streak || 0), 0)
        this.setData({ 'stats.checkin': `${done}/${list.length}` })
        this.animateStat('streak', maxStreak, 0)
      }
    }).catch(() => {})
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
