// components/empty-state/empty-state.js
// 空状态组件 - 用于列表为空时展示

Component({
  /**
   * 组件配置
   */
  options: {
    multipleSlots: true // 启用多 slot 支持
  },

  /**
   * 组件属性
   */
  properties: {
    // 图标（支持 emoji 或文字）
    icon: {
      type: String,
      value: '📭'
    },
    // 提示文字
    text: {
      type: String,
      value: '暂无数据'
    },
    // 是否显示操作按钮
    showAction: {
      type: Boolean,
      value: false
    },
    // 操作按钮文字
    actionText: {
      type: String,
      value: '立即添加'
    }
  },

  /**
   * 组件的初始数据
   */
  data: {},

  /**
   * 组件的方法
   */
  methods: {
    /**
     * 点击操作按钮
     */
    onActionTap: function () {
      this.triggerEvent('action')
    }
  }
})
