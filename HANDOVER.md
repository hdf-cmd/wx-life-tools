# life-toolkit 交接注意事项

> 面向下一个接手本项目的开发者或 AI 助手。读完本文档应能快速理解项目结构、关键约定和历史决策。

## 一、项目概览

- **类型**：微信小程序（原生开发，非 uni-app），云开发架构
- **远程仓库**：https://github.com/hdf-cmd/wx-life-tools （main 分支；GitHub 仓库名不支持中文，会静默转成短横线）
- **AppID**：`wxf676b631dbbc8e32`（个人主体）
- **云环境 ID**：`cloud1-d6g4x9h9m507b429c`（硬编码在 `miniprogram/app.js`）
- **功能定位**：生活工具集合——记账、习惯打卡、随机选择、工具箱（媒体处理/去水印）
- **基础库**：3.17.x，开发者工具 2.02.2608040 实测正常

## 二、目录结构

```
├── miniprogram/                # 小程序前端
│   ├── app.js                  # 云开发初始化、登录（带重试）
│   ├── app.json                # 页面路由 + 4 个 tabBar
│   ├── pages/
│   │   ├── index/              # 首页
│   │   ├── bookkeeping/        # 记账（index/add/stats）
│   │   ├── habit/              # 习惯（index/add/calendar）
│   │   ├── random/             # 随机选择（food/drink/decision/number/group）
│   │   └── toolbox/            # 工具箱（入口页 + 4 个子工具）
│   ├── components/             # empty-state、skeleton 通用组件
│   └── images/                 # tabbar 图标、奶茶品牌 logo
└── cloudfunctions/             # 云函数根目录（project.config.json 已声明）
    ├── login/                  # 获取 openid
    ├── bookkeeping/            # 记账 CRUD（accounts 集合）
    ├── habit/                  # 习惯管理（habits + habit_logs 集合）
    ├── nearby/                 # 附近门店搜索 + 逆地理 + 实况天气（高德 API，依赖 AMAP_KEY 环境变量）
    └── unwatermark/            # 去水印（详见第六节）
```

工具箱采用两级结构：一级入口页 `pages/toolbox/index` 只显示分类卡片（视频工具/视频编辑/PDF 工具/图片工具/随机选择），点击进入通用二级页 `pages/toolbox/list/index`（通过 `type` 参数渲染对应分类）。工具配置集中在二级页 `index.js` 顶部的 `CATEGORIES` 对象：本地工具加到对应分类的 `tools` 数组（并在 `app.json` 加路由），在线编辑工具加到对应分类的 `online` 数组（每个在线分类自带 `host` 域名：视频编辑→tools.video，PDF 工具→pdf.imagestool.com）。在线工具（视频编辑 8 项、PDF 工具 12 项）依赖浏览器端处理能力（ffmpeg.wasm / pdf wasm），小程序内无法运行，采用复制链接引导浏览器打开的方式。

## 三、数据库集合

| 集合 | 用途 | 说明 |
|---|---|---|
| `accounts` | 记账记录 | 核心集合，必存在 |
| `habits` | 习惯定义 | 核心集合，必存在 |
| `habit_logs` | 打卡记录 | **按需创建**，首次打卡前不存在 |
| `unwatermark/*` | 云存储目录 | 去水印转存的视频文件（无自动清理机制，需在云开发控制台手动管理） |

## 四、硬性开发规范（违反会直接出 Bug）

1. **所有 `wx.cloud.callFunction` 必须带 `followSystem: true`**
   项目中有 20+ 处调用点，漏加会导致云函数路由到错误环境。`wx.cloud.getTempFileURL`、`wx.cloud.downloadFile` 同理。
2. **查询可选集合必须独立 try-catch**
   `habit_logs` 这类按需创建的集合，查询前不知道是否存在。缺容错会导致整个云函数崩溃（历史事故）。错误信息要精确到具体失败环节。
3. **避免双重 `orderBy`**
   某些微信版本下双重排序会导致查询失败，reminder 云函数已因此修过一次，统一用单字段排序。
4. **云函数运行时为 Node 8.9，语法受限**
   不能用 `?.`、`??`、`fetch`、`new URL()` 构造器、`globalThis`、`TextEncoder` 等新特性。网络请求一律用 `httpGet` 风格的 http/https 手动封装（参见 `unwatermark/index.js`）。
5. **云函数的超时/内存配置在云端，不在代码里**
   `config.json` 里的 `timeout`/`memorySize` 上传时不一定会同步到云端。当前已手动配置：`unwatermark` 超时 60 秒/内存 512MB。改配置要去 **云开发控制台 → 云函数 → 配置**，否则报 `-504003 FUNCTIONS_TIME_LIMIT_EXCEEDED`（默认仅 3 秒）。
6. **环境变量**：`nearby` 云函数依赖 `AMAP_KEY`（高德 Web 服务 Key），在云开发控制台 → 云函数 → nearby → 配置 → 环境变量中设置。代码中无内置密钥兜底，未配置会优雅报错。

## 五、部署操作

- 部署云函数：开发者工具右键云函数文件夹 → **「上传并部署：云端安装依赖」**
- **不要选"创建并部署"**——云端已存在的函数会报 `ResourceInUse.FunctionName`
- 若云函数文件夹没有云朵图标：右键 `cloudfunctions` 根目录 → 「指定为当前环境云函数根目录」
- 排查"云函数调用失败"时，先确认云端跑的是不是最新代码（本地改了必须重新上传）

## 六、去水印功能专项（unwatermark）

这是项目中最复杂、最可能失效的模块：

- **架构**：前端受域名白名单限制无法直连平台 → 云函数解析 + 下载 → `cloud.uploadFile` 转存云存储 → 前端经 fileID 预览（`getTempFileURL`）/保存相册（`downloadFile` + `saveVideoToPhotosAlbum`）
- **抖音（核心难点）**：2026 年起匿名接口全部被 a_bogus 签名校验保护。当前方案内置了 **a_bogus 签名算法的纯 JS 实现**（SM3+RC4，源自 GitHub 仓库 `jiuhunwl/short_videos` 的 Cloudflare Workers 版 `workers.js`，已改造为 Node 8.9 兼容）。流程：短链取 aweme_id → ttwid cookie（ttwid.bytedance.com 注册）→ 签名请求 `/aweme/v1/web/aweme/detail/` → 取 bit_rate 无水印直链。另有 `_ROUTER_DATA` / `iteminfo` / HTML 正则三级兜底
- **皮皮虾**：`cell_h5_comment` 接口；item_id 提取需覆盖 `/item/` 路径格式（短链重定向为 `h5.pipix.com/item/{id}`）
- **小红书**：笔记页正则提取 `originVideoKey`，受登录墙限制，部分笔记解析不出属正常现象
- **各平台实测（2026-09-05，本地沙箱桩件 + 真实网络）**：
  - **皮皮虾 ✅ 可用**：`h5.pipix.com/s/xxx` 真实短链端到端解析+下载成功（1.9MB 真实视频）
  - **抖音 ⚠️ a_bogus 签名链路被风控间歇性 403**：算法本身仍有效，本机实测同代码同 IP 下约一半请求 403、一半成功（两个视频交叉复现）；分享页 `_ROUTER_DATA`（已改纯客户端渲染）与 iteminfo（返回空）两个兜底确认失效
  - **小红书 ⚠️ 门槛升高**：平台已要求笔记链接必须带 `xsec_token`（时效短）；App 分享文案通常自带，理论上仍可用，失败率高属预期
- **失效维护路径**：若抖音解析持续失败，当前已知最有效的修复是上游 `jiuhunwl/short_videos`（`api/douyin/DouyinParser.php`，2026-09 活跃维护）的 **Cookie 方案**：带登录 Cookie 请求 `user/self?modal_id={视频ID}`，从 HTML 的 `<script id="RENDER_DATA">` 提取 `app.videoDetail` 绕开签名校验（Cookie 需配到云函数环境变量，约 7~15 天需更换，建议小号）；或用上游最新签名实现替换 `unwatermark/index.js` 尾部「a_bogus 签名算法」区块（从 `function randomMsToken` 开始），再按第四节规范检查语法兼容性
- 仅供个人学习/备份用途，勿用于批量采集或二次分发

## 七、已删除的功能（勿重新引入）

- **提醒功能（2026-09-05 整体删除，用户决策）**：Tab、页面（`pages/reminder/`）、云函数（`cloudfunctions/reminder/`）、到期检查逻辑全部移除，tabBar 由 5 个减为 4 个。删除原因：实测发现微信"服务通知"离线推送是死链路（定时触发器事件无 `action` 字段未路由 + `config.json` 未声明 `subscribeMessage.send` 权限 + 订阅消息一次授权仅一条推送的平台限制），仅剩"打开小程序才能看到的弹窗"价值有限
- 云端善后（代码删除不会自动生效）：云开发控制台手动删除已部署的 `reminder` 云函数（含其 30 分钟定时触发器 `reminderCheck`）和 `reminders` 集合数据
- **媒体信息/EXIF 解析功能**（2026-08-26 整体删除）：微信 8.0.38+ 会对 `chooseMedia` 选取的图片剥离设备型号、GPS 等敏感 EXIF，功能鸡肋。相关的 `utils/exif.js`、`pages/toolbox/info` 已删除，不要再做这个方向。
- 若确实需要完整 EXIF，唯一可行路径是 `wx.chooseMessageFile` 从聊天记录选文件（保留原始文件不剥离）。

## UI 设计语言（v2）

全局视觉规范集中在 `app.wxss`，借鉴 Vant/WeUI 生态主流小程序的设计约定，改样式前先查 token：

- **设计 token**：主色 `--color-primary: #3E86E0`、主渐变 `--gradient-primary`、页面底 `--color-bg-page: #F4F6F9`；圆角/阴影/间距均用 `--radius-*` `--shadow-*` `--spacing-*` 变量，禁止页面里硬编码旧色值 `#4A90D9`
- **页面头部规范**：各列表页头部统一为"渐变圆角卡片 + 装饰圆"样式（首页 `.hero`、习惯 `.date-header`、工具箱 `.header`），全局还预留了 `.page-head` / `.page-head-title` / `.page-head-sub` 通用类，新页面直接用
- **深色模式**：通过 `@media (prefers-color-scheme: dark)` 覆盖 page 级 token 实现，新增颜色必须同时给深色值
- **首页为仪表盘结构**：`pages/index/index.js` 的 `loadStats()` 并行调 `bookkeeping(stats)` / `habit(listHabits)` / `reminder(list, status=active)` 三个云函数展示实时统计，任一失败静默忽略（显示 `--`）；统计卡和功能入口都用 `wx.switchTab` 跳转
- **主色同步点**：`app.json` 的 `navigationBarBackgroundColor` / `tabBar.selectedColor` 是字面量不走 token，改主色时记得同步这两处
- **图标系统（2026-09-05 重做）**：tabBar 与首页/工具箱图标为统一的圆角描边家族（96 网格、笔宽 7、全圆头、duotone 激活态），规范与色值见根目录 `ICON-DESIGN.md`；首页功能卡与工具箱分类已从 emoji 改为 PNG（`images/icons/`），源 SVG 由渲染脚本生成——**改图标请改 SVG 重新渲染，不要手改 PNG**；记账分类/随机食物等内容级 emoji 保留不动

## 八、已知陷阱清单

| 现象 | 原因 / 对策 |
|---|---|
| `-504003` 调用超时 | 云端函数超时配置太短，控制台改为 60s |
| `ResourceInUse.FunctionName` | 部署时误选"创建并部署"，改用"上传并部署" |
| `Env Not Exists` | 云函数未部署或环境 ID 混淆 |
| 视频截图空白帧 | 时序问题：需 pause+seek → 延迟约 900ms 再截；安卓需"播放 200ms→暂停→重截"兜底 |
| 高德 `location` 参数 | 顺序是 **经度,纬度**（与腾讯相反），已在 nearby 中处理 |
| 移除页面路由 | 需同步检查 `app.json` 的 tabBar 和 pages 两处引用 |
| 图片上传失败 | 注意图片体积限制，压缩页已处理 |
| `@swc/runtime/_define_property.js is not defined` | 展开语法 `{...}` 被增强编译转为辅助模块引用但模块未打包；**源码禁用展开语法**，用 `Object.assign` / `[].concat` / `slice()` 替代（已全局清理，`project.config.json` 的 `es6` 也已关闭） |

## 九、快速上手步骤

1. 微信开发者工具导入本项目目录（`project.config.json` 所在目录），AppID 用 `wxf676b631dbbc8e32` 或自己的测试号
2. 确认 `cloudfunctions` 是云函数根目录（文件夹带云朵图标）
3. 云开发控制台确认环境 `cloud1-d6g4x9h9m507b429c` 可用，5 个云函数均已部署；`unwatermark` 超时为 60 秒
4. （如需附近门店/首页天气功能）配置 `nearby` 的 `AMAP_KEY` 环境变量
5. 真机预览测试（部分功能如保存相册、定位在模拟器中不可靠）
