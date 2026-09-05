// pages/toolbox/list/index.js
// 工具箱二级页面 - 根据 type 参数渲染对应分类的工具列表

// 各分类的工具配置（新增工具在此注册；本地工具加到 tools，在线编辑工具加到 online）
const CATEGORIES = {
  // 视频工具（本地实现）
  video: {
    title: '视频工具',
    tools: [
      { icon: '🗜️', title: '视频压缩', desc: '降低视频体积', page: '/pages/toolbox/compress/index' },
      { icon: '📸', title: '视频截图', desc: '提取视频画面', page: '/pages/toolbox/screenshot/index' },
      { icon: '🎬', title: '去水印', desc: '抖音等平台无水印下载', page: '/pages/toolbox/unwatermark/index' }
    ]
  },
  // 视频编辑（在线工具，跳转 tools.video）
  videoEdit: {
    title: '视频编辑',
    host: 'https://tools.video',
    online: [
      { icon: '✂️', title: '视频裁剪', path: '/video-trim' },
      { icon: '⚡', title: '视频变速', path: '/video-speed' },
      { icon: '🔗', title: '视频合并', path: '/video-merge' },
      { icon: '🌀', title: '视频转GIF', path: '/video-to-gif' },
      { icon: '🎵', title: '音频提取', path: '/audio-extract' },
      { icon: '🎧', title: '音频转换', path: '/audio-convert' },
      { icon: '💬', title: '加字幕', path: '/video-subtitle' },
      { icon: '🔄', title: '视频旋转', path: '/video-rotate' }
    ]
  },
  // PDF 工具（在线工具，跳转 pdf.imagestool.com，浏览器本地处理不上传服务器）
  pdf: {
    title: 'PDF 工具',
    host: 'https://pdf.imagestool.com',
    online: [
      { icon: '🔗', title: 'PDF合并', path: '/merge-pdf' },
      { icon: '✂️', title: 'PDF拆分', path: '/split-pdf' },
      { icon: '🗜️', title: 'PDF压缩', path: '/compress-pdf' },
      { icon: '🖼️', title: 'PDF转图片', path: '/pdf-to-image' },
      { icon: '📄', title: '图片转PDF', path: '/image-to-pdf' },
      { icon: '📑', title: '提取页面', path: '/extract-page' },
      { icon: '🗑️', title: '删除页面', path: '/remove-page' },
      { icon: '🔃', title: 'PDF旋转', path: '/rotate-pdf' },
      { icon: '🔒', title: 'PDF加密', path: '/encrypt-pdf' },
      { icon: '🔓', title: 'PDF解密', path: '/unlock-pdf' },
      { icon: '🔤', title: '提取文字', path: '/extract-text' },
      { icon: '💧', title: '加水印', path: '/add-watermark' }
    ]
  },
  // 图片工具（本地实现）
  image: {
    title: '图片工具',
    tools: [
      { icon: '🖼️', title: '图片压缩', desc: '降低图片体积', page: '/pages/toolbox/image-compress/index' }
    ]
  },
  // 随机选择（原随机模块）
  random: {
    title: '随机选择',
    tools: [
      { icon: '🍜', title: '今天吃什么？', desc: '美食菜品随机选', page: '/pages/random/food/index' },
      { icon: '🧋', title: '今天喝什么？', desc: '奶茶饮品随机选', page: '/pages/random/drink/index' }
    ]
  }
}

Page({
  data: {
    tools: [],    // 本地工具列表
    online: [],   // 在线编辑工具列表
    host: ''      // 在线工具域名（按分类配置）
  },

  onLoad: function (options) {
    const cat = CATEGORIES[options.type] || CATEGORIES.video
    wx.setNavigationBarTitle({ title: cat.title })
    this.setData({
      tools: cat.tools || [],
      online: cat.online || [],
      host: cat.host || ''
    })
  },

  goToPage: function (e) {
    wx.navigateTo({ url: e.currentTarget.dataset.page })
  },

  /**
   * 在线工具：复制链接，引导浏览器打开
   * (这些工具依赖浏览器端处理能力，如 ffmpeg.wasm / pdf wasm，小程序内无法运行)
   */
  openOnline: function (e) {
    const url = this.data.host + e.currentTarget.dataset.path
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showModal({
          title: '链接已复制',
          content: '该工具需在浏览器中使用，链接已复制到剪贴板，请打开手机浏览器粘贴访问',
          confirmText: '知道了',
          showCancel: false
        })
      }
    })
  }
})
