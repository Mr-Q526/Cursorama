export interface RecorderControlsCatalog {
  title: string;
  pause: string;
  resume: string;
  paused: string;
  recording: string;
  drag: string;
  duration: string;
  shortcuts: string;
  failed: string;
  unavailable: string;
}

export const recorderControlsCatalog: RecorderControlsCatalog = {
  title: '录制控制', pause: '暂停录制', resume: '继续录制',
  paused: '已暂停', recording: '正在录制', drag: '拖动录制小组件',
  duration: '有效录制时长', shortcuts: 'Ctrl + Shift + F8 暂停／继续 · Ctrl + Shift + F9 结束',
  failed: '录制操作未完成，请重试。', unavailable: '当前没有正在进行的录制。',
};
