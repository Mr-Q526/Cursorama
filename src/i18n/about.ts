export const aboutCatalog = {
  title: '关于', tagline: '录下操作，让镜头自动跟上你的思路。',
  author: '主作者', authorName: 'Mr-Q526', repository: '开源仓库', repositoryName: 'Cursorama · MIT',
  support: '请作者喝杯咖啡', supportHint: '支持项目持续开发',
  feedback: '意见反馈', feedbackHint: '报告问题或提出建议',
  coffeeIntro: '如果 Cursorama 帮你省下了制作演示视频的时间，欢迎请作者喝杯咖啡。你的支持会帮助项目持续改进。',
  coffeeThanks: '感谢每一份支持，也欢迎通过反馈与代码贡献一起完善 Cursorama。',
  wechat: '微信', alipay: '支付宝', scanHint: '打开对应应用扫一扫',
  wechatCode: '微信赞赏二维码', alipayCode: '支付宝赞赏二维码',
  closeSupport: '收起赞赏二维码', releaseLog: '更新日志',
  linkFailed: '暂时无法打开链接，请稍后重试。',
} as const;

export type AboutCatalog = typeof aboutCatalog;
