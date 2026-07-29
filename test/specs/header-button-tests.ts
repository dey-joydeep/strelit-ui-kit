import { describe, expect, it, vi } from 'vitest';
import { HeaderButton } from '../../src/ts/controls/header-button';
import type { Header } from '../../src/ts/controls/header';

describe('HeaderButton activation', () => {
  it('uses the compatibility click as the single touch activation', () => {
    const controlsContainerElement = document.createElement('div');
    const header = {
      controlsContainerElement,
      on: vi.fn(),
    } as unknown as Header;
    const push = vi.fn();
    const button = new HeaderButton(header, 'Action', 'action', push);

    button.element.dispatchEvent(
      new TouchEvent('touchstart', { bubbles: true }),
    );
    button.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(push).toHaveBeenCalledOnce();
    button.destroy();
  });
});
