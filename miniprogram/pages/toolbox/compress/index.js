// pages/toolbox/compress/index.js
// 工具箱 - 视频压缩

Page({
  data: {
    videoPath: '',
    videoSize: 0,
    // 质量选项
    qualityIndex: 1,
    qualityList: ['低（体积最小）', '中（推荐）', '高（画质最好）'],
    qualityValues: ['low', 'medium', 'high'],
    // 分辨率选项
    scaleIndex: 2,
    scaleList: ['0.5 倍', '0.75 倍', '原尺寸'],
    scaleValues: [0.5, 0.75, 1],
    // 压缩状态
    compressing: false,
    resultPath: '',
    resultSize: 0,
    resultSizeText: '',
    videoSizeText: ''
  },

  /**
   * 选择视频
   */
  chooseVideo: function () {
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['album', 'camera'],
      success: res => {
        const file = res.tempFiles[0]
        this.setData({
          videoPath: file.tempFilePath,
          videoSize: file.size,
          videoSizeText: this._fmtSize(file.size),
          resultPath: '',
          resultSize: 0,
          resultSizeText: ''
        })
      },
      fail: err => {
        if (err.errMsg && !err.errMsg.includes('cancel')) {
          wx.showToast({ title: '选择视频失败', icon: 'none' })
        }
      }
    })
  },

  onQualityChange: function (e) {
    this.setData({ qualityIndex: Number(e.detail.value) })
  },

  onScaleChange: function (e) {
    this.setData({ scaleIndex: Number(e.detail.value) })
  },

  /**
   * 执行压缩
   */
  doCompress: function () {
    if (!this.data.videoPath) {
      wx.showToast({ title: '请先选择视频', icon: 'none' })
      return
    }
    if (this.data.compressing) return

    this.setData({ compressing: true })
    wx.showLoading({ title: '压缩中...', mask: true })

    wx.compressVideo({
      src: this.data.videoPath,
      quality: this.data.qualityValues[this.data.qualityIndex],
      resolution: this.data.scaleValues[this.data.scaleIndex],
      fps: 30,
      success: res => {
        wx.hideLoading()
        this.setData({
          compressing: false,
          resultPath: res.tempFilePath,
          resultSize: res.size,
          resultSizeText: this._fmtSize(res.size)
        })
      },
      fail: err => {
        wx.hideLoading()
        this.setData({ compressing: false })
        console.error('[compressVideo] fail:', err)
        wx.showToast({ title: '压缩失败，请重试', icon: 'none' })
      }
    })
  },

  /**
   * 保存到相册
   */
  saveToAlbum: function () {
    wx.saveVideoToPhotosAlbum({
      filePath: this.data.resultPath,
      success: () => {
        wx.showToast({ title: '已保存到相册', icon: 'success' })
      },
      fail: err => {
        if (err.errMsg && err.errMsg.includes('auth')) {
          wx.showModal({
            title: '提示',
            content: '需要相册权限才能保存视频，请前往设置开启',
            success: modalRes => {
              if (modalRes.confirm) wx.openSetting()
            }
          })
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' })
        }
      }
    })
  },

  /**
   * 字节数格式化
   */
  _fmtSize: function (bytes) {
    if (!bytes && bytes !== 0) return ''
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1024 / 1024).toFixed(2) + ' MB'
  }
})
