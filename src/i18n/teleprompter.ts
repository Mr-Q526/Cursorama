export interface TeleprompterCatalog {
  title: string;
  enable: string;
  hint: string;
  script: string;
  placeholder: string;
  show: string;
  hide: string;
  scroll: string;
  pause: string;
  restart: string;
  speed: string;
  font: string;
  mirror: string;
  empty: string;
  finished: string;
  drag: string;
  protection: string;
}

export const teleprompterCatalog: TeleprompterCatalog = {
  title: '提词器', enable: '录制时打开提词器',
  hint: '写下讲解稿，录制时可自动滚动。暂停录制会同时暂停滚动。',
  script: '讲解稿', placeholder: '输入或粘贴你的讲解稿…',
  show: '打开提词器', hide: '收起提词器', scroll: '开始滚动', pause: '暂停滚动',
  restart: '回到稿件开头', speed: '滚动速度', font: '文字大小',
  mirror: '镜像显示', empty: '录制前在「提词器」中输入讲解稿。',
  finished: '稿件已读完', drag: '拖动提词器',
  protection: '悬浮录制控件和提词器不会进入 Windows 录屏画面。',
};
