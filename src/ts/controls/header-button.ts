import { Header } from './header';

/** @internal */
export type HeaderButtonPushEvent = (this: void, ev: Event) => void;

/** @internal */
export class HeaderButton {
  private _element: HTMLElement;
  private _clickEventListener = (ev: MouseEvent) => this.onClick(ev);

  get element(): HTMLElement {
    return this._element;
  }

  constructor(
    private _header: Header,
    label: string,
    cssClass: string,
    private _pushEvent: HeaderButtonPushEvent,
  ) {
    this._element = document.createElement('div');
    this._element.classList.add(cssClass);
    this._element.title = label;
    this._header.on('destroy', () => this.destroy());
    this._element.addEventListener('click', this._clickEventListener, {
      passive: true,
    });
    this._header.controlsContainerElement.appendChild(this._element);
  }

  destroy(): void {
    this._element.removeEventListener('click', this._clickEventListener);
    this._element.parentNode?.removeChild(this._element);
  }

  private onClick(ev: MouseEvent) {
    this._pushEvent(ev);
  }
}
