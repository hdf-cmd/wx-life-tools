// pages/toolbox/index.js
// 工具箱一级入口 - 展示功能分类，点击进入二级页面查看具体工具

Page({
  data: {
    categories: [
      { icon: 'cat-video', title: '视频工具', desc: '压缩 / 截图 / 去水印', type: 'video' },
      { icon: 'cat-edit', title: '视频编辑', desc: '裁剪 / 变速 / 合并等', type: 'videoEdit' },
      { icon: 'cat-pdf', title: 'PDF 工具', desc: '合并 / 拆分 / 压缩 / 转换', type: 'pdf' },
      { icon: 'cat-image', title: '图片工具', desc: '图片压缩', type: 'image' },
      { icon: 'cat-random', title: '随机选择', desc: '吃什么 / 喝什么随机选', type: 'random' }
    ]
  },

  goToCategory: function (e) {
    wx.navigateTo({
      url: '/pages/toolbox/list/index?type=' + e.currentTarget.dataset.type
    })
  }
})
