// pages/random/index.js
// 随机模块主页 - 双入口卡片

Page({
  data: {},

  onLoad: function () {},

  goToFood: function () {
    wx.navigateTo({ url: '/pages/random/food/index' })
  },

  goToDrink: function () {
    wx.navigateTo({ url: '/pages/random/drink/index' })
  },

  /**
   * 分享给好友
   */
  onShareAppMessage: function () {
    return {
      title: '选择困难症救星来了',
      path: '/pages/random/index'
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline: function () {
    return { title: '选择困难症救星来了' }
  }
})
