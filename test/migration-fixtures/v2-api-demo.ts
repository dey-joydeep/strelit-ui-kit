import { ItemType, LayoutConfig } from 'golden-layout';

// Representative source copied from the Golden Layout v2.6 API demo shape.
const demoLayout: LayoutConfig = {
  dimensions: { minItemWidth: 250 },
  root: {
    type: ItemType.row,
    content: [
      {
        type: ItemType.component,
        componentType: 'editor',
        width: 30,
        minWidth: 120,
      },
      {
        type: ItemType.column,
        height: 70,
        content: [],
      },
    ],
  },
};

void demoLayout;
