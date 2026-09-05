// pages/toolbox/unwatermark/index.js
// 工具箱 - 去水印（抖音/皮皮虾/小红书视频）

Page({
  data: {
    link: '',
    parsing: false,
    saving: false,
    result: null   // { fileID, desc, sizeMB }
  },

  onInput: function (e) {
    this.setData({ link: e.detail.value })
  },

  /**
   * 粘贴剪贴板内容
   */
  onPaste: function () {
    wx.getClipboardData({
      success: res => {
        if (res.data) {
          this.setData({ link: res.data })
        } else {
          wx.showToast({ title: '剪贴板为空', icon: 'none' })
        }
      }
    })
  },

  /**
   * 解析：云函数提取无水印视频并转存云存储
   */
  doParse: function () {
    const link = this.data.link.trim()
    if (!link) {
      wx.showToast({ title: '请先粘贴视频链接', icon: 'none' })
      return
    }
    if (!/https?:\/\//.test(link)) {
      wx.showToast({ title: '请输入正确的链接', icon: 'none' })
      return
    }
    if (this.data.parsing) return

    this.setData({ parsing: true, result: null })
    wx.showLoading({ title: '解析中，请稍候...', mask: true })

    wx.cloud.callFunction({
      name: 'unwatermark',
      followSystem: true,
      data: { url: link },
      success: res => {
        wx.hideLoading()
        const r = res && res.result
        if (r && r.code === 0) {
          this.setData({ parsing: false, result: r })
          this._getPreviewUrl(r.fileID)
        } else {
          this.setData({ parsing: false })
          wx.showModal({ title: '解析失败', content: (r && r.msg) || '未知错误', showCancel: false })
        }
      },
      fail: err => {
        wx.hideLoading()
        this.setData({ parsing: false })
        console.error('[unwatermark] 云函数调用失败:', err)
        wx.showModal({ title: '解析失败', content: '云函数调用失败，请确认已部署 unwatermark 云函数', showCancel: false })
      }
    })
  },

  /**
   * 获取临时链接用于视频预览
   */
  _getPreviewUrl: function (fileID) {
    wx.cloud.getTempFileURL({
      fileList: [fileID],
      followSystem: true,
      success: res => {
        const item = res.fileList && res.fileList[0]
        if (item && item.tempFileURL && this.data.result) {
          this.setData({ 'result.tempUrl': item.tempFileURL })
        }
      }
    })
  },

  /**
   * 从云存储下载并保存到相册
   */
  saveVideo: function () {
    if (!this.data.result || this.data.saving) return
    this.setData({ saving: true })
    wx.showLoading({ title: '保存中...', mask: true })

    wx.cloud.downloadFile({
      fileID: this.data.result.fileID,
      followSystem: true,
      success: res => {
        wx.saveVideoToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => {
            wx.hideLoading()
            this.setData({ saving: false })
            wx.showToast({ title: '已保存到相册', icon: 'success' })
          },
          fail: err => {
            wx.hideLoading()
            this.setData({ saving: false })
            if (err.errMsg && err.errMsg.indexOf('auth') >= 0) {
              wx.showModal({
                title: '提示',
                content: '需要相册权限才能保存视频，请前往设置开启',
                success: m => { if (m.confirm) wx.openSetting() }
              })
            } else {
              wx.showToast({ title: '保存失败', icon: 'none' })
            }
          }
        })
      },
      fail: () => {
        wx.hideLoading()
        this.setData({ saving: false })
        wx.showToast({ title: '下载失败，请重试', icon: 'none' })
      }
    })
  }
})
