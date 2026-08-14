# Using Vue with 'embedding via events' component binding

The following snippets of code demonstrate how Strelit Layout can be used in Vue using [**embedding via events**](../../binding-components/index.md#embedding-via-events) component binding. Note that it is recommended to use [**virtual via events**](../../binding-components/index.md#virtual-via-events) binding (ie Virtual Components) however some users may prefer this approach as less events are involved.

### Composable Hook

```typescript
import {
  StrelitLayout,
  type ComponentContainerComponent,
  type LayoutConfig,
} from 'strelit-ui-kit';
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';

export function useStrelitLayout(
  createComponent: (
    type: string,
    container: HTMLElement,
  ) => ComponentContainerComponent | undefined,
  destroyComponent: (container: HTMLElement) => void,
  config?: LayoutConfig,
) {
  const element = shallowRef<HTMLElement | null>(null);
  const layout = shallowRef<StrelitLayout | null>(null);
  const initialized = ref(false);

  onMounted(() => {
    if (element.value == null) throw new Error('Element must be set.');
    const strelitLayout = new StrelitLayout(
      element.value,
      (container, itemConfig) => {
        const { componentType } = itemConfig;
        if (typeof componentType !== 'string')
          throw new Error('Invalid component type.');
        const component = createComponent(componentType, container.element);
        return {
          component,
          virtual: false,
        };
      },
      (container) => destroyComponent(container.element),
    );

    layout.value = strelitLayout;
    if (config != null) strelitLayout.loadLayout(config);

    initialized.value = true;
  });

  onBeforeUnmount(() => {
    try {
      layout.value?.destroy();
    } finally {
      layout.value = null;
      initialized.value = false;
    }
  });

  return { element, initialized, layout };
}
```

### Usage

```vue
<template>
  <div ref="element" style="width: 100%; height: 75vh">
    <teleport
      v-for="{ id, type, element } in componentInstances"
      :key="id"
      :to="element"
    >
      <component :is="type"></component>
    </teleport>
  </div>
</template>
<script lang="ts">
import { useStrelitLayout } from '@/use-strelit-layout';
import { defineComponent, h, shallowRef } from 'vue';
import 'strelit-ui-kit/dist/css/strelit-base.css';
import 'strelit-ui-kit/dist/css/themes/strelit-dark-theme.css';

const Test = defineComponent({ render: () => h('span', 'It works!') });

const components = { Test /* other components */ };

export default defineComponent({
  components,
  setup() {
    interface ComponentInstance {
      id: number;
      type: string;
      element: HTMLElement;
    }
    let instanceId = 0;
    const componentTypes = new Set(Object.keys(components));
    const componentInstances = shallowRef<ComponentInstance[]>([]);

    const createComponent = (type: string, element: HTMLElement) => {
      if (!componentTypes.has(type)) {
        throw new Error(`Component not found: '${type}'`);
      }
      ++instanceId;
      componentInstances.value = componentInstances.value.concat({
        id: instanceId,
        type,
        element,
      });
      return { id: instanceId };
    };
    const destroyComponent = (toBeRemoved: HTMLElement) => {
      componentInstances.value = componentInstances.value.filter(
        ({ element }) => element !== toBeRemoved,
      );
    };

    const { element } = useStrelitLayout(createComponent, destroyComponent, {
      root: {
        type: 'column',
        content: [
          {
            type: 'component',
            componentType: 'Test',
          },
          {
            type: 'component',
            componentType: 'Test',
          },
        ],
      },
    });

    return { element, componentInstances };
  },
});
</script>
```
