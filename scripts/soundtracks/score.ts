/** Cursorama 原创配乐乐谱：和声、旋律、配器及段落均由本项目定义。 */
export type Instrument = 'piano' | 'electric' | 'pad' | 'pluck' | 'mallet' | 'bass';
export type RhythmStyle = 'none' | 'brush' | 'soft' | 'pulse';

export interface Score {
  id: string;
  bpm: number;
  bars: number;
  seed: number;
  chords: readonly (readonly number[])[];
  melody: readonly (readonly number[])[];
  instrument: Instrument;
  rhythm: RhythmStyle;
  pad: number;
  melodyGain: number;
  bass: number;
  arpeggio: boolean;
  swing: number;
  space: number;
}

export const SCORE_TIMING = { beatsPerBar: 4, secondsPerMinute: 60, tailSeconds: 3.5 } as const;

export const SCORES: readonly Score[] = [
  {
    id: 'clear-morning', bpm: 88, bars: 16, seed: 18421,
    chords: [[48, 55, 59, 62], [45, 52, 55, 59], [41, 48, 52, 57], [43, 50, 55, 59]],
    melody: [[72, 76, 79, 76, 74, 72], [71, 72, 76, 79, 76, 72], [69, 72, 76, 74, 72, 69], [67, 71, 74, 76, 74, 71]],
    instrument: 'piano', rhythm: 'brush', pad: 0.048, melodyGain: 0.21, bass: 0.095,
    arpeggio: true, swing: 0.035, space: 0.29,
  },
  {
    id: 'quiet-current', bpm: 72, bars: 16, seed: 27439,
    chords: [[50, 57, 61, 64], [47, 54, 57, 61], [43, 50, 54, 59], [45, 52, 57, 61]],
    melody: [[73, 76, 78, 76], [73, 69, 66, 69], [71, 74, 78, 74], [73, 76, 73, 69]],
    instrument: 'electric', rhythm: 'none', pad: 0.094, melodyGain: 0.135, bass: 0.065,
    arpeggio: false, swing: 0.015, space: 0.45,
  },
  {
    id: 'soft-grid', bpm: 104, bars: 16, seed: 49321,
    chords: [[48, 55, 58, 62], [41, 48, 55, 57], [45, 52, 55, 60], [43, 50, 53, 59]],
    melody: [[72, 74, 79, 74, 72, 70], [69, 72, 77, 76, 72, 69], [72, 76, 79, 76, 74, 72], [71, 74, 77, 74, 71, 67]],
    instrument: 'electric', rhythm: 'soft', pad: 0.038, melodyGain: 0.15, bass: 0.13,
    arpeggio: true, swing: 0.13, space: 0.22,
  },
  {
    id: 'neon-focus', bpm: 116, bars: 16, seed: 64391,
    chords: [[45, 52, 55, 59], [41, 48, 52, 55], [48, 55, 59, 62], [43, 50, 55, 57]],
    melody: [[76, 79, 83, 79, 76, 74], [72, 76, 79, 76, 72, 71], [74, 79, 83, 81, 79, 76], [74, 76, 79, 76, 74, 71]],
    instrument: 'pluck', rhythm: 'pulse', pad: 0.053, melodyGain: 0.135, bass: 0.14,
    arpeggio: true, swing: 0.008, space: 0.28,
  },
  {
    id: 'cloud-atlas', bpm: 96, bars: 16, seed: 81517,
    chords: [[53, 60, 64, 67], [50, 57, 60, 64], [46, 53, 57, 62], [48, 55, 60, 64]],
    melody: [[79, 81, 84, 81, 79, 76], [77, 81, 84, 81, 77, 76], [74, 77, 81, 79, 77, 74], [76, 79, 84, 81, 79, 76]],
    instrument: 'mallet', rhythm: 'brush', pad: 0.056, melodyGain: 0.155, bass: 0.085,
    arpeggio: true, swing: 0.055, space: 0.39,
  },
  {
    id: 'midnight-ink', bpm: 82, bars: 16, seed: 92387,
    chords: [[45, 52, 55, 59], [50, 57, 60, 64], [43, 50, 53, 57], [48, 55, 59, 64]],
    melody: [[71, 72, 76, 74, 72, 71], [72, 76, 79, 76, 74, 72], [69, 72, 74, 72, 69, 65], [71, 74, 76, 74, 71, 67]],
    instrument: 'piano', rhythm: 'soft', pad: 0.055, melodyGain: 0.16, bass: 0.115,
    arpeggio: false, swing: 0.09, space: 0.34,
  },
] as const;
