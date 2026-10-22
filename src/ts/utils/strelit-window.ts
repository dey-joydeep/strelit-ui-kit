import type { LayoutManager } from '../layout-manager';

/** Internal window shape used while a Strelit popout is open. */
export type StrelitWindow = Window & {
  __strelitInstance?: LayoutManager;
};
