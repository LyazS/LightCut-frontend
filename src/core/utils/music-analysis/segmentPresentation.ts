export type MusicAnalysisSegmentColorKey =
  | 'start'
  | 'intro'
  | 'verse'
  | 'chorus'
  | 'bridge'
  | 'break'
  | 'instrumental'
  | 'solo'
  | 'outro'
  | 'end'
  | 'other'

const MUSIC_ANALYSIS_SEGMENT_COLOR_KEYS: Record<string, MusicAnalysisSegmentColorKey> = {
  start: 'start',
  intro: 'intro',
  verse: 'verse',
  chorus: 'chorus',
  bridge: 'bridge',
  break: 'break',
  inst: 'instrumental',
  solo: 'solo',
  outro: 'outro',
  end: 'end',
}

export function getMusicAnalysisSegmentColorKey(label: string): MusicAnalysisSegmentColorKey {
  return MUSIC_ANALYSIS_SEGMENT_COLOR_KEYS[label] ?? 'other'
}
