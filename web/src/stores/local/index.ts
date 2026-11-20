import { createGlobalState } from '@vueuse/core';

import { lazy } from '@/util';
import { createLocalVolumeStore } from './LocalVolumeRepository';

export const useLocalVolumeStore = lazy(
  createGlobalState(createLocalVolumeStore),
);
