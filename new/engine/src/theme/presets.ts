/**
 * Twelve preset themes matching the original jigex-prog.js set.
 * Colors are inlined here so the engine has no asset dependency.
 */
import type { Theme } from './types';

export const THEME_PRESETS: Record<string, Theme> = {
  lavender: {
    name: 'lavender',
    color: { background: '#95a2bd', panel: '#8296bd', highlight: '#8ba0c9', border: '#56637d' },
  },
  blue: {
    name: 'blue',
    color: { background: '#7592ac', panel: '#5a86ac', highlight: '#6c93b6', border: '#3b5a75' },
  },
  teal: {
    name: 'teal',
    color: { background: '#5d747c', panel: '#50717d', highlight: '#5a7f8c', border: '#2f434a' },
  },
  plum: {
    name: 'plum',
    color: { background: '#a699a6', panel: '#998899', highlight: '#a694a6', border: '#665b66' },
  },
  green: {
    name: 'green',
    color: { background: '#99a399', panel: '#8a968a', highlight: '#96a396', border: '#5b635b' },
  },
  olive: {
    name: 'olive',
    color: { background: '#68685a', panel: '#5c5c4a', highlight: '#696955', border: '#36362b' },
  },
  coral: {
    name: 'coral',
    color: { background: '#be9292', panel: '#b38181', highlight: '#bf8a8a', border: '#805c5c' },
  },
  yellow: {
    name: 'yellow',
    color: { background: '#b69366', panel: '#a88556', highlight: '#b58f5c', border: '#755c3c' },
  },
  brown: {
    name: 'brown',
    color: { background: '#997663', panel: '#8f6a57', highlight: '#a07662', border: '#563f35' },
  },
  white: {
    name: 'white',
    color: { background: '#dadada', panel: '#b3b3b3', highlight: '#bfbfbf', border: '#909090' },
  },
  gray: {
    name: 'gray',
    color: { background: '#9b9b9b', panel: '#818181', highlight: '#8f8f8f', border: '#565656' },
  },
  charcoal: {
    name: 'charcoal',
    color: { background: '#3d3d3d', panel: '#303030', highlight: '#343434', border: '#202020' },
  },
};

export const THEME_NAMES: string[] = Object.keys(THEME_PRESETS);

/** Default theme ordinal, matches the original (`blue` is ordinal 1). */
export const DEFAULT_THEME_NAME = 'blue';
