import { useColorScheme } from 'react-native';

const light = {
  bg: '#f3f4f0',
  surface: '#ffffff',
  surface2: '#f8f9f6',
  text: '#16211b',
  muted: '#5f6b64',
  line: '#dfe3dc',
  lineStrong: '#c9cfc6',
  pitch: '#123a2b',
  onPitch: '#f2f6f3',
  onPitchMuted: '#a9bdb2',
  accent: '#1d6b46',
  accentSoft: '#e4efe8',
  onAccent: '#ffffff',
  brass: '#b98a3a',
  brassSoft: '#f6eedd',
  brassText: '#5a3f0e',
  taken: '#eceee9',
  takenText: '#8b948e',
  off: '#f6f7f4',
  offText: '#b8beb9',
  danger: '#b4432f',
  dangerSoft: '#f8e6e2',
};

const dark: typeof light = {
  bg: '#0d1411',
  surface: '#141d18',
  surface2: '#18231d',
  text: '#e7eee9',
  muted: '#9aa9a0',
  line: '#25322b',
  lineStrong: '#33433a',
  pitch: '#0b2219',
  onPitch: '#e9f1ec',
  onPitchMuted: '#8fa89a',
  accent: '#4fae7e',
  accentSoft: '#1a3328',
  onAccent: '#08130d',
  brass: '#d5a95a',
  brassSoft: '#33291a',
  brassText: '#f1d9a8',
  taken: '#1f2a24',
  takenText: '#7f8c84',
  off: '#111915',
  offText: '#4a5750',
  danger: '#ec8a76',
  dangerSoft: '#3a201b',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}
