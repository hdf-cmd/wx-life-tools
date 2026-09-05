// app.js
// 小程序入口文件，负责云开发初始化和全局状态管理

App({
  onLaunch: function () {
    // 初始化云开发环境
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }

    wx.cloud.init({
      // env 参数说明：
      // env 参数决定接下来小程序发起的云开发调用会默认去往的资源环境
      // 填写云开发控制台中的环境 ID
      env: 'cloud1-d6g4x9h9m507b429c',
      traceUser: true // 是否在将用户访问记录到用户管理中
    })

    // 执行用户登录
    this.login()
  },

  /**
   * 用户登录流程
   * 1. 调用 wx.cloud.callFunction 获取 openid
   * 2. 将 openid 存储到 globalData
   */
  login: function () {
    this._doLogin(0)
  },

  _doLogin: function (retryCount) {
    const that = this
    const MAX_RETRY = 3

    wx.cloud.callFunction({
      followSystem: true,
      name: 'login',
      data: {},
      success: res => {
        console.log('[云函数] [login] 调用成功:', res.result)
        const openid = res.result.openid
        that.globalData.openid = openid
        that.globalData.isLoggedIn = true
        wx.setStorageSync('openid', openid)
        if (that.loginCallback) {
          that.loginCallback(openid)
        }
      },
      fail: err => {
        console.error(`[云函数] [login] 调用失败(第${retryCount + 1}次):`, err)
        if (retryCount < MAX_RETRY) {
          console.log(`[login] ${2 ** retryCount}s 后重试...`)
          setTimeout(() => that._doLogin(retryCount + 1), 1000 * 2 ** retryCount)
        } else {
          const cachedOpenid = wx.getStorageSync('openid')
          if (cachedOpenid) {
            that.globalData.openid = cachedOpenid
            console.log('[login] 使用缓存 openid')
          }
        }
      }
    })
  },

  /**
   * 全局数据
   */
  globalData: {
    openid: '',       // 用户唯一标识
    userInfo: null,   // 用户信息对象
    isLoggedIn: false // 登录状态
  }
})
