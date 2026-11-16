// Stable source IDs and platform metadata used by manifests and extractors.
const definitions = [
  ['bangumi', 'Bangumi', 'Bangumi', ['bgm.tv', 'bangumi.tv', 'chii.in'], '.bgm.tv'],
  ['bilibili', '哔哩哔哩', 'Bilibili', ['bilibili.com', 'b23.tv', 'bili2233.cn'], '.bilibili.com', ['p']],
  ['coolapk', '酷安', 'Coolapk', ['coolapk.com'], '.coolapk.com'],
  ['douban', '豆瓣', 'Douban', ['douban.com', 'douc.cc'], '.douban.com'],
  ['douyin', '抖音', 'Douyin', ['douyin.com'], '.douyin.com', ['modal_id']],
  ['facebook', 'Facebook', 'Facebook', ['facebook.com', 'fb.watch'], '.facebook.com', ['v']],
  ['instagram', 'Instagram', 'Instagram', ['instagram.com'], '.instagram.com'],
  ['kuaishou', '快手', 'Kuaishou', ['kuaishou.com', 'chenzhongtech.com'], '.kuaishou.com'],
  ['medium', 'Medium', 'Medium', ['medium.com'], '.medium.com'],
  ['pipix', '皮皮虾', 'Pipix', ['pipix.com'], '.pipix.com'],
  ['snapchat', 'Snapchat', 'Snapchat', ['snapchat.com'], '.snapchat.com'],
  ['threads', 'Threads', 'Threads', ['threads.com', 'threads.net'], '.threads.com'],
  ['tieba', '百度贴吧', 'Baidu Tieba', ['tieba.baidu.com'], '.baidu.com'],
  ['tiktok', 'TikTok', 'TikTok', ['tiktok.com'], '.tiktok.com'],
  ['toutiao', '今日头条', 'Toutiao', ['toutiao.com', 'toutiaocdn.cn'], '.toutiao.com'],
  ['twitter', 'X / Twitter', 'X / Twitter', ['x.com', 'twitter.com', 'fixupx.com'], '.x.com'],
  ['weibo', '微博', 'Weibo', ['weibo.com', 'weibo.cn'], '.weibo.com', ['fid']],
  ['weixin', '微信公众号', 'WeChat articles', ['mp.weixin.qq.com'], '.weixin.qq.com', ['__biz', 'mid', 'idx', 'sn']],
  ['weixin_channels', '微信视频号', 'WeChat Channels', ['weixin.qq.com', 'channels.weixin.qq.com'], 'yuanbao.tencent.com', ['id']],
  ['xhs', '小红书', 'Xiaohongshu', ['xiaohongshu.com', 'xhslink.com', 'xhslink.cn'], '.xiaohongshu.com'],
  ['xiaoheihe', '小黑盒', 'Xiaoheihe', ['xiaoheihe.cn'], '.xiaoheihe.cn'],
  ['youtube', 'YouTube', 'YouTube', ['youtube.com', 'youtu.be', 'youtube-nocookie.com'], '.youtube.com', ['v']],
  ['zhihu', '知乎', 'Zhihu', ['zhihu.com'], '.zhihu.com'],
  ['zuiyou', '最右', 'Zuiyou', ['xiaochuankeji.cn', 'izuiyou.com'], '.xiaochuankeji.cn', ['pid']],
  ['generic_web', '网页', 'Web page', [], null],
];
export const catalog = definitions.map(([id, zh, en, hosts, cookieDomain, keep = []]) => ({
  id, version: '0.1.0', name: { zh, en }, hosts, cookieDomain, keep,
  priority: id === 'generic_web' ? 0 : id === 'weixin' ? 200 : 100,
}));
export const platform = (id) => catalog.find((source) => source.id === id);
