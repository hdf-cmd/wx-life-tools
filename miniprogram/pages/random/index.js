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
  }
})
