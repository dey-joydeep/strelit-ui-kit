import { DomConstants } from '../utils/dom-constants';
import { Rect } from '../utils/types';

/** @internal */
export class TransitionIndicator {
  private readonly _element: HTMLElement;
  private readonly _toElement: HTMLElement | null;
  private readonly _fromDimensions: null;
  private readonly _totalAnimationDuration: number;
  private readonly _animationStartTime: number | null;

  constructor() {
    this._element = document.createElement('div');
    this._element.classList.add(DomConstants.ClassName.TransitionIndicator);
    document.body.appendChild(this._element);

    this._toElement = null;
    this._fromDimensions = null;
    this._totalAnimationDuration = 200;
    this._animationStartTime = null;
  }

  destroy(): void {
    this._element.remove();
  }

  transitionElements(_fromElement: HTMLElement, _toElement: HTMLElement): void {
    // Transitions are deliberately disabled until an accessible motion design
    // is specified. Keep the hook because BrowserPopout owns this lifecycle.
  }

  private nextAnimationFrame(): void {
    // if (this._toElement === null || this._fromDimensions === null || this._animationStartTime === null) {
    //     throw new UnexpectedNullError('TINAFTD97115');
    // } else {
    //     const toDimensions = this.measure(this._toElement);
    //     const animationProgress = (now() - this._animationStartTime) / this._totalAnimationDuration;
    //     const currentFrameStyles = {};
    //     const cssProperty;
    //     if (animationProgress >= 1) {
    //         this._element.style.display = 'none';
    //         return;
    //     }
    //     toDimensions.opacity = 0;
    //     for (const cssProperty in this._fromDimensions) {
    //         currentFrameStyles[cssProperty] = this._fromDimensions[cssProperty] +
    //             (toDimensions[cssProperty] - this._fromDimensions[cssProperty]) *
    //             animationProgress;
    //     }
    //     this._element.css(currentFrameStyles);
    //     animFrame(fnBind(this._nextAnimationFrame, this));
    // }
  }

  private measure(element: HTMLElement): Rect {
    const rect = element.getBoundingClientRect();

    return {
      left: rect.left,
      top: rect.top,
      width: element.offsetWidth,
      height: element.offsetHeight,
    };
  }
}
