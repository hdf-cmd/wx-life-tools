# 图标设计规范（Icon Design System）

> 设计方向：**圆角蓝图（Rounded Blueprint）**——以圆角描边线条为唯一语言的几何图标家族。
> 所有图标出自同一网格、同一笔宽、同一圆角，保证"一家人"的气质；杜桑双重色调（duotone）只用于表达"选中/彩色"状态，不引入第二套造型。

## 网格与笔触

- 画布：`viewBox 0 0 96 96`，安全区四周留白 ≥ 14px，视觉重心居中
- 笔宽：统一 `7`（约画布的 7.3%），端点 `round`、拐角 `round`——所有线段收尾都是圆头
- 圆角：容器类形状圆角半径 8–13，与全局 `--radius-*` 设计令牌同语言
- 不使用文字、不使用渐变、不使用投影；透明背景

## 颜色系统

| 用途 | 颜色 | 说明 |
|---|---|---|
| tabBar 未选中 | `#999999` | 与 `app.json` 的 `tabBar.color` 一致 |
| tabBar 选中 | `#3E86E0` + 同色 13% 透明填充 | 与 `selectedColor` 一致，双重色调（duotone）表达"点亮" |
| 首页卡片·记账 | `#3E86E0` | 呼应卡片浅蓝渐变底 |
| 首页卡片·习惯 | `#3CB162` | 呼应卡片浅绿渐变底 |
| 首页卡片·工具箱 | `#8A63E8` | 呼应卡片浅紫渐变底 |
| 首页卡片·随机 | `#E85D75` | 玫红骰子，呼应卡片浅粉渐变底 |
| 工具箱分类 | 视频 `#E8615A` / 剪辑 `#5B8DEF` / PDF `#F0A32F` / 图片 `#3CB162` / 随机 `#8A63E8` | 同亮度同饱和的一组色相，白卡上成体系不吵闹 |

## 双状态策略（tabBar）

同一几何造型，仅换"颜料"：
- **normal**：纯描边灰
- **active**：主色描边 + 同色 13% 半透明填充（形状内部泛起一层主色雾面）

不采用"线性→面性"两套造型，避免两个状态看起来像两个图标。

## 文件与规格

| 资产 | 路径 | 尺寸 |
|---|---|---|
| tabBar 图标（覆盖原文件，文件名不变） | `miniprogram/images/tabbar/{home,wallet,check,toolbox}_{normal,active}.png` | 81×81 |
| 首页功能卡 | `miniprogram/images/icons/card-{bookkeeping,habit,toolbox}.png` | 96×96 |
| 工具箱分类 | `miniprogram/images/icons/cat-{video,edit,pdf,image,random}.png` | 96×96 |

源文件：`tools/icon-forge.js`（SVG 定义 + sharp 渲染，依赖 `npm i sharp`，`node tools/icon-forge.js` 一键重绘全部 PNG 并输出预览拼图）。改动图标请改脚本里的 SVG 重新渲染，不要手改 PNG。

## 明确不做

- 记账分类、随机食物等**内容级 emoji**（🍜🚌🛒…）保留——它们是数据语义的一部分，数量多且跨平台表现稳定，不属于"界面骨架图标"
- 品牌 logo（`images/brands/`）是真实品牌资产，不在重绘范围
