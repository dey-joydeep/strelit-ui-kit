import GoldenLayout, {
  LayoutConfig,
  JsonValue,
  ResolvedLayoutConfig,
  SizeUnitEnum,
} from 'golden-layout';

type Settings = LayoutConfig.Settings;

const settings: Settings = { reorderEnabled: true };
const config: LayoutConfig = {
  settings,
  root: {
    type: 'component',
    componentType: 'editor',
    size: `50${SizeUnitEnum.Percent}`,
  },
};
const resolved = LayoutConfig.resolve(config);
if (!JsonValue.isJson(config)) {
  throw new Error('Configuration must be serializable');
}
const copied = ResolvedLayoutConfig.createCopy(resolved);
const serialized = LayoutConfig.fromResolved(copied);
const layout = new GoldenLayout(document.body);
layout.loadLayout(serialized);
layout.destroy();
