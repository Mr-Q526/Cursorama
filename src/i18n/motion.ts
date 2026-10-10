export interface MotionCatalog {
  autoFocus: string;
  followFocus: string;
  focusHint: string;
  regenerated: string;
}

export const motionCatalog: MotionCatalog = {
  autoFocus: '操作自动聚焦',
  followFocus: '跟随操作焦点',
  focusHint: '点击后短暂放大；输入、滚动和拖动时保持聚焦，空闲后缓慢回到全景。',
  regenerated: '已根据点击与持续操作重新生成镜头',
};
