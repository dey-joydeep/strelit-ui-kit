import { afterAll, describe, expect, it } from 'vitest';
import { StrelitLayout, LayoutConfig } from '../../src';
import TestTools from './test-tools';

describe('ground item', function () {
  let layout: StrelitLayout;

  afterAll(function () {
    layout?.destroy();
  });

  it('component gets wrapped in a stack', function () {
    const rootLayout: LayoutConfig = {
      root: {
        type: 'component',
        componentType: TestTools.TEST_COMPONENT_NAME,
      },
    };

    layout = TestTools.createLayout(rootLayout);

    const layoutElements = document.querySelectorAll('.lm_strelit');
    expect(layoutElements.length).toBe(1);
    TestTools.verifyPath('stack.0.component', layout);
  });

  it('only enables automatic container resizing for the body by default', function () {
    const customContainer = document.createElement('div');
    document.body.appendChild(customContainer);

    const customLayout = new StrelitLayout(customContainer);
    expect(customLayout.resizeWithContainerAutomatically).toBe(false);
    customLayout.destroy();
    customContainer.remove();

    const bodyLayout = new StrelitLayout();
    expect(bodyLayout.resizeWithContainerAutomatically).toBe(true);
    bodyLayout.destroy();
  });
});
