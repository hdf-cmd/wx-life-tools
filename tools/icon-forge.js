// 图标锻造脚本：SVG 定义 → sharp 渲染 PNG
// 设计规范见仓库 ICON-DESIGN.md：96 网格、笔宽 7、全圆头、duotone 双重色调
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const REPO = 'C:/Users/24755/Documents/QoderCN/2026-08-25/chat-4';
const OUT = {
  tabbar: path.join(REPO, 'miniprogram/images/tabbar'),
  icons: path.join(REPO, 'miniprogram/images/icons'),
  preview: __dirname
};
fs.mkdirSync(OUT.icons, { recursive: true });

const SW = 7; // 笔宽
const F = (d, c) => d ? `fill="${c}" fill-opacity="0.13"` : 'fill="none"'; // 主体填充：duotone 或无

// 每个字形 = (duotone, color) => inner SVG 标记
// duotone=true 时，主体形状附加同色半透明填充（激活态/彩色卡）
const GLYPHS = {
  home: (d, c) => `
    <path d="M20 48 L48 24 L76 48" ${F(d, c)} stroke="${c}" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M30 45 V66 q0 10 10 10 h16 q10 0 10 -10 V45" ${F(d, c)} stroke="${c}" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M42 76 V63 q0 -4 4 -4 h4 q4 0 4 4 V76" fill="#FFFFFF" stroke="${c}" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round"/>`,
  wallet: (d, c) => `
    <rect x="14" y="31" width="62" height="42" rx="9" ${F(d, c)} stroke="${c}" stroke-width="${SW}"/>
    <rect x="64" y="43" width="18" height="18" rx="7" fill="#FFFFFF" stroke="${c}" stroke-width="${SW}"/>
    <circle cx="73" cy="52" r="2.6" fill="${c}"/>`,
  check: (d, c) => `
    <circle cx="48" cy="48" r="30" ${F(d, c)} stroke="${c}" stroke-width="${SW}"/>
    <path d="M34 49 l10 10 l19 -22" fill="none" stroke="${c}" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round"/>`,
  toolbox: (d, c) => `
    <rect x="14" y="40" width="68" height="35" rx="9" ${F(d, c)} stroke="${c}" stroke-width="${SW}"/>
    <path d="M38 40 v-3 q0 -7 7 -7 h6 q7 0 7 7 v3" fill="none" stroke="${c}" stroke-width="${SW}" stroke-linecap="round"/>
    <path d="M14 54 H82" stroke="${c}" stroke-width="${SW}" stroke-linecap="round"/>
    <path d="M48 49 v10" stroke="${c}" stroke-width="${SW}" stroke-linecap="round"/>`,
  coin: (d, c) => `
    <circle cx="48" cy="48" r="30" ${F(d, c)} stroke="${c}" stroke-width="${SW}"/>
    <path d="M39 31 L48 45 L57 31" fill="none" stroke="${c}" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M48 45 V63" stroke="${c}" stroke-width="6.5" stroke-linecap="round"/>
    <path d="M38 50 H58" stroke="${c}" stroke-width="6.5" stroke-linecap="round"/>
    <path d="M38 58 H58" stroke="${c}" stroke-width="6.5" stroke-linecap="round"/>`,
  video: (d, c) => `
    <rect x="16" y="28" width="64" height="40" rx="10" ${F(d, c)} stroke="${c}" stroke-width="${SW}"/>
    <path d="M42 38 L60 48 L42 58 Z" fill="${c}" stroke="${c}" stroke-width="4" stroke-linejoin="round"/>`,
  edit: (d, c) => `
    <circle cx="34" cy="63" r="7.5" ${F(d, c)} stroke="${c}" stroke-width="${SW}"/>
    <circle cx="62" cy="63" r="7.5" ${F(d, c)} stroke="${c}" stroke-width="${SW}"/>
    <path d="M39 57 L62 26" stroke="${c}" stroke-width="${SW}" stroke-linecap="round"/>
    <path d="M57 57 L34 26" stroke="${c}" stroke-width="${SW}" stroke-linecap="round"/>`,
  pdf: (d, c) => `
    <rect x="28" y="16" width="40" height="64" rx="8" ${F(d, c)} stroke="${c}" stroke-width="${SW}"/>
    <path d="M38 34 H58" stroke="${c}" stroke-width="6" stroke-linecap="round"/>
    <path d="M38 46 H58" stroke="${c}" stroke-width="6" stroke-linecap="round"/>
    <path d="M38 58 H50" stroke="${c}" stroke-width="6" stroke-linecap="round"/>`,
  image: (d, c) => `
    <rect x="16" y="22" width="64" height="52" rx="10" ${F(d, c)} stroke="${c}" stroke-width="${SW}"/>
    <circle cx="35" cy="38" r="5" fill="none" stroke="${c}" stroke-width="6"/>
    <path d="M24 62 L40 46 L52 58 L60 51 L72 62" fill="none" stroke="${c}" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round"/>`,
  dice: (d, c) => `
    <rect x="18" y="18" width="60" height="60" rx="13" ${F(d, c)} stroke="${c}" stroke-width="${SW}"/>
    <circle cx="33" cy="33" r="4.5" fill="${c}"/><circle cx="63" cy="33" r="4.5" fill="${c}"/>
    <circle cx="48" cy="48" r="4.5" fill="${c}"/>
    <circle cx="33" cy="63" r="4.5" fill="${c}"/><circle cx="63" cy="63" r="4.5" fill="${c}"/>`
};

function svg(name, color, duotone, size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="${size}" height="${size}">${GLYPHS[name](duotone, color)}</svg>`;
}

const GRAY = '#999999', BLUE = '#3E86E0', GREEN = '#3CB162', PURPLE = '#8A63E8';
const JOBS = [
  // tabBar（覆盖原文件名，app.json 无需改动）
  ['home_normal.png', 'home', GRAY, false, 81, OUT.tabbar],
  ['home_active.png', 'home', BLUE, true, 81, OUT.tabbar],
  ['wallet_normal.png', 'wallet', GRAY, false, 81, OUT.tabbar],
  ['wallet_active.png', 'wallet', BLUE, true, 81, OUT.tabbar],
  ['check_normal.png', 'check', GRAY, false, 81, OUT.tabbar],
  ['check_active.png', 'check', BLUE, true, 81, OUT.tabbar],
  ['toolbox_normal.png', 'toolbox', GRAY, false, 81, OUT.tabbar],
  ['toolbox_active.png', 'toolbox', BLUE, true, 81, OUT.tabbar],
  // 首页功能卡
  ['card-bookkeeping.png', 'coin', BLUE, true, 96, OUT.icons],
  ['card-habit.png', 'check', GREEN, true, 96, OUT.icons],
  ['card-toolbox.png', 'toolbox', PURPLE, true, 96, OUT.icons],
  // 工具箱分类
  ['cat-video.png', 'video', '#E8615A', true, 96, OUT.icons],
  ['cat-edit.png', 'edit', '#5B8DEF', true, 96, OUT.icons],
  ['cat-pdf.png', 'pdf', '#F0A32F', true, 96, OUT.icons],
  ['cat-image.png', 'image', GREEN, true, 96, OUT.icons],
  ['cat-random.png', 'dice', PURPLE, true, 96, OUT.icons]
];

(async () => {
  for (const [file, glyph, color, duotone, size, dir] of JOBS) {
    await sharp(Buffer.from(svg(glyph, color, duotone, size))).png().toFile(path.join(dir, file));
    console.log('rendered', file);
  }

  // ===== 预览拼图（4 行：tabBar 灰态 / tabBar 彩态 / 首页卡片 / 工具箱分类）=====
  const cell = 110, pad = 24, W = cell * 5 + pad * 2, H = cell * 4 + pad * 2 + 30;
  const tile = (x, y, glyph, color, duotone, bg) =>
    `<g transform="translate(${x},${y})"><rect x="0" y="0" width="${cell}" height="${cell}" rx="14" fill="${bg}" stroke="#E8ECF2"/>` +
    `<g transform="translate(${(cell - 64) / 2},${(cell - 64) / 2}) scale(${64 / 96})">${GLYPHS[glyph](duotone, color)}</g></g>`;
  const rows = [
    [['home', GRAY, false], ['wallet', GRAY, false], ['check', GRAY, false], ['toolbox', GRAY, false]],
    [['home', BLUE, true], ['wallet', BLUE, true], ['check', BLUE, true], ['toolbox', BLUE, true]]
  ];
  let sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#F7F9FC"/>`;
  rows[0].forEach((g, i) => { sheet += tile(pad + i * cell, pad + 30, g[0], g[1], g[2], '#FFFFFF'); });
  rows[1].forEach((g, i) => { sheet += tile(pad + i * cell, pad + 30 + cell, g[0], g[1], g[2], '#FFFFFF'); });
  const cards = [['coin', BLUE, 'linear #E3F0FF-CFE4FF'], ['check', GREEN, ''], ['toolbox', PURPLE, '']];
  // 首页卡片：还原真实渐变底
  const cardBg = [
    `<defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E3F0FF"/><stop offset="1" stop-color="#CFE4FF"/></linearGradient>` +
    `<linearGradient id="g2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E4F7E6"/><stop offset="1" stop-color="#CFF0D3"/></linearGradient>` +
    `<linearGradient id="g3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F1EAFE"/><stop offset="1" stop-color="#E4D8FB"/></linearGradient></defs>`
  ].join('');
  sheet += cardBg;
  [['coin', BLUE, 'url(#g1)'], ['check', GREEN, 'url(#g2)'], ['toolbox', PURPLE, 'url(#g3)']].forEach((g, i) => {
    sheet += tile(pad + i * cell, pad + 30 + cell * 2, g[0], g[1], true, g[2]);
  });
  [['video', '#E8615A'], ['edit', '#5B8DEF'], ['pdf', '#F0A32F'], ['image', GREEN], ['dice', PURPLE]].forEach((g, i) => {
    sheet += tile(pad + i * cell, pad + 30 + cell * 3, g[0], g[1], true, '#FFFFFF');
  });
  sheet += '</svg>';
  await sharp(Buffer.from(sheet)).png().toFile(path.join(OUT.preview, 'preview.png'));
  console.log('preview sheet done');
})();
