import { ComponentItem } from './component-item';
import { ContentItem } from './content-item';

/**
 * Provides component parentable item behavior.
 * @public
 */
export abstract class ComponentParentableItem extends ContentItem {
  /** @internal */
  private _focused = false;

  /** Gets the focused. */
  get focused(): boolean {
    return this._focused;
  }

  /** @internal */
  setFocusedValue(value: boolean): void {
    this._focused = value;
  }

  /** Sets active component item. */
  abstract setActiveComponentItem(
    item: ComponentItem,
    focus: boolean,
    suppressFocusEvent: boolean,
  ): void;
}
