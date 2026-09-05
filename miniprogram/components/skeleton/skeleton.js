// components/skeleton/skeleton.js
// 骨架屏组件 - 用于列表页加载状态展示

Component({
  /**
   * 组件属性
   */
  properties: {
    // 显示行数
    rows: {
      type: Number,
      value: 3
    },
    // 是否显示头像占位
    avatar: {
      type: Boolean,
      value: false
    },
    // 是否显示卡片占位
    card: {
      type: Boolean,
      value: false
    },
    // 是否正在加载
    loading: {
      type: Boolean,
      value: true
    }
  },

  /**
   * 组件的初始数据
   */
  data: {},

  /**
   * 组件的方法
   */
  methods: {}
})
