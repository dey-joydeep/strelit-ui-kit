import GoldenLayout from 'golden-layout';

const layout = new GoldenLayout(document.body);
layout.loadLayout({
  root: {
    type: 'component',
    componentName: 'legacy-panel',
  },
});

layout.destroy();
