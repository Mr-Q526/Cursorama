/** 扩展原创乐谱：四套独立的和声、旋律与配器，使用确定性合成器制作。 */
import type { Score } from './score';

export type ExpandedSoundtrackId = 'paper-lantern' | 'velvet-cafe' | 'silver-screen' | 'pixel-journey';

export const EXPANDED_SCORES: readonly (Score & { id: ExpandedSoundtrackId })[] = [
  {
    id: 'paper-lantern', bpm: 92, bars: 16, seed: 108257,
    chords: [[50, 57, 62, 66], [47, 54, 59, 62], [43, 50, 57, 59], [45, 52, 59, 61]],
    melody: [[69, 71, 74, 71, 69], [66, 69, 71, 69, 66], [67, 69, 74, 71, 69], [64, 67, 69, 71, 69]],
    instrument: 'guitar', rhythm: 'folk', pad: 0.025, melodyGain: 0.19, bass: 0.078,
    arpeggio: true, swing: 0.048, space: 0.18,
    accompaniment: 'guitar', accompanimentOctave: 0, melodySteps: [0.25, 1, 1.75, 2.75, 3.5], melodyLength: 1.05,
  },
  {
    id: 'velvet-cafe', bpm: 108, bars: 16, seed: 119483,
    chords: [[48, 55, 59, 62], [45, 52, 55, 59], [50, 57, 60, 64], [43, 53, 57, 59]],
    melody: [[64, 67, 71, 69, 67], [64, 67, 71, 67, 64], [65, 69, 72, 76, 72], [65, 69, 71, 74, 71]],
    instrument: 'reed', rhythm: 'bossa', pad: 0.019, melodyGain: 0.13, bass: 0.1,
    arpeggio: false, swing: 0.075, space: 0.23,
    accompaniment: 'electric', accompanimentSteps: [0, 1.5, 2.5, 3.5], accompanimentLength: 0.85,
    melodySteps: [0.5, 1.25, 2, 2.75, 3.5], melodyLength: 0.9,
  },
  {
    id: 'silver-screen', bpm: 68, bars: 12, seed: 130787,
    chords: [[50, 57, 60, 65], [46, 53, 57, 62], [53, 60, 64, 69], [48, 55, 60, 64]],
    melody: [[69, 72, 77], [65, 69, 74], [72, 76, 81], [67, 72, 76]],
    instrument: 'strings', rhythm: 'none', pad: 0.07, melodyGain: 0.16, bass: 0.053,
    arpeggio: false, swing: 0, space: 0.56,
    accompaniment: 'strings', accompanimentSteps: [0], accompanimentLength: 3.9,
    melodySteps: [0.2, 1.6, 2.9], melodyLength: 1.8, swell: true,
  },
  {
    id: 'pixel-journey', bpm: 124, bars: 16, seed: 142381,
    chords: [[52, 59, 63, 66], [49, 56, 59, 63], [45, 52, 57, 61], [47, 54, 59, 66]],
    melody: [[76, 78, 83, 81, 78, 76, 73], [73, 76, 80, 83, 80, 76, 73], [73, 76, 81, 80, 76, 73, 69], [71, 75, 78, 83, 78, 75, 71]],
    instrument: 'retro', rhythm: 'retro', pad: 0.039, melodyGain: 0.105, bass: 0.095,
    arpeggio: true, swing: 0, space: 0.2,
    accompaniment: 'pluck', melodySteps: [0, 0.5, 1.5, 2, 2.5, 3, 3.5], melodyLength: 0.48,
  },
] as const;
