import {
  ComponentItem,
  ContentItem,
  ItemType,
  type LayoutConfig,
  Stack,
  createLayoutConfigFromResolved,
} from '../src';
import * as Strelit from '../src';
import { App } from './app';
import { prefinedLayouts } from './predefined-layouts';

function element<T extends HTMLElement>(selector: string): T {
  const result = document.querySelector<T>(selector);
  if (result === null) {
    throw new Error(`Workbench element missing: ${selector}`);
  }
  return result;
}

/** Human-operated controls for the local API demo. */
export class Workbench {
  private readonly configEditor = element<HTMLTextAreaElement>('#configEditor');
  private readonly layoutSelect = element<HTMLSelectElement>('#layoutSelect');
  private readonly targetSelect =
    element<HTMLSelectElement>('#apiTargetSelect');
  private readonly actionSelect =
    element<HTMLSelectElement>('#apiActionSelect');
  private readonly actionValue = element<HTMLInputElement>('#apiActionValue');
  private readonly status = element<HTMLElement>('#workbenchStatus');
  private readonly summary = element<HTMLElement>('#layoutSummary');
  private readonly snapshot = element<HTMLElement>('#liveSnapshot');
  private readonly activity = element<HTMLOListElement>('#activityLog');
  private readonly apiObjectSelect =
    element<HTMLSelectElement>('#apiObjectSelect');
  private readonly apiMethodSelect =
    element<HTMLSelectElement>('#apiMethodSelect');
  private readonly apiArgsEditor =
    element<HTMLTextAreaElement>('#apiArgsEditor');
  private readonly methodResult = element<HTMLElement>('#methodResult');
  private refreshScheduled = false;

  constructor(private readonly app: App) {
    element<HTMLButtonElement>('#configFromPresetButton').addEventListener(
      'click',
      () => this.showPresetConfig(),
    );
    element<HTMLButtonElement>('#configFromLiveButton').addEventListener(
      'click',
      () => this.showLiveConfig(),
    );
    element<HTMLButtonElement>('#applyConfigButton').addEventListener(
      'click',
      () => this.applyConfig(),
    );
    element<HTMLButtonElement>('#apiRunButton').addEventListener('click', () =>
      this.runAction(),
    );
    element<HTMLButtonElement>('#refreshSnapshotButton').addEventListener(
      'click',
      () => this.refresh(),
    );
    element<HTMLButtonElement>('#clearLogButton').addEventListener(
      'click',
      () => this.activity.replaceChildren(),
    );
    element<HTMLButtonElement>('#runMethodButton').addEventListener(
      'click',
      () => void this.runMethod(),
    );
    this.apiObjectSelect.addEventListener('change', () =>
      this.refreshMethods(),
    );
    this.targetSelect.addEventListener('change', () => this.refreshMethods());
    this.layoutSelect.addEventListener('change', () => this.showPresetConfig());
    this.app.layout.on('stateChanged', () => this.scheduleRefresh());
    this.app.layout.container.addEventListener('input', () =>
      this.scheduleRefresh(),
    );
    globalThis.addEventListener('error', (event) =>
      this.reportError(event.error ?? event.message),
    );
    globalThis.addEventListener('unhandledrejection', (event) =>
      this.reportError(event.reason),
    );
    for (const id of [
      'loadLayoutButton',
      'clearButton',
      'addComponentButton',
      'loadComponentAsRootButton',
      'replaceComponentButton',
      'reloadSavedLayoutButton',
    ]) {
      element<HTMLButtonElement>(`#${id}`).addEventListener('click', () =>
        this.scheduleRefresh(),
      );
    }
    this.showPresetConfig();
    this.refresh();
    this.refreshMethods();
    this.log('Standard layout loaded. Try a tab, pane control, or API action.');
  }

  private get components(): ComponentItem[] {
    return this.app.layout
      .getItemsByType(ItemType.component)
      .filter((item): item is ComponentItem =>
        ContentItem.isComponentItem(item),
      );
  }

  private get target(): ComponentItem | undefined {
    const index = Number(this.targetSelect.value);
    return Number.isInteger(index) ? this.components[index] : undefined;
  }

  private showPresetConfig(): void {
    const preset = prefinedLayouts.allComponents.find(
      (item) => item.name === this.layoutSelect.value,
    );
    if (preset === undefined) {
      this.reportError(new Error('Select a preset first'));
      return;
    }
    this.configEditor.value = JSON.stringify(preset.config, null, 2);
    this.setStatus(`${preset.name} preset ready`, false);
  }

  private showLiveConfig(): void {
    try {
      const config = createLayoutConfigFromResolved(
        this.app.layout.saveLayout(),
      );
      this.configEditor.value = JSON.stringify(config, null, 2);
      this.setStatus('Current layout copied to editor', false);
      this.log('Converted saveLayout() to editable LayoutConfig.');
    } catch (error) {
      this.reportError(error);
    }
  }

  private applyConfig(): void {
    try {
      const parsed: unknown = JSON.parse(this.configEditor.value);
      if (
        parsed === null ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed)
      ) {
        throw new Error('LayoutConfig must be a JSON object');
      }
      this.app.layout.loadLayout(parsed as LayoutConfig);
      this.setStatus('Configuration applied', false);
      this.log('loadLayout() applied the edited JSON.');
      this.refresh();
    } catch (error) {
      this.reportError(error);
    }
  }

  private runAction(): void {
    try {
      const layout = this.app.layout;
      const target = this.target;
      const action = this.actionSelect.value;
      if (action === 'blur') {
        layout.clearComponentFocus();
      } else if (action === 'popin') {
        const popout = layout.openPopouts[layout.openPopouts.length - 1];
        if (popout === undefined) throw new Error('No pop-out window is open');
        popout.popIn();
      } else {
        if (target === undefined) throw new Error('Select a component first');
        switch (action) {
          case 'focus':
            layout.focusComponent(target);
            break;
          case 'rename':
            if (this.actionValue.value.trim() === '') {
              throw new Error('Enter a title before renaming');
            }
            target.container.setTitle(this.actionValue.value.trim());
            break;
          case 'close':
            target.close();
            break;
          case 'maximize':
          case 'popout': {
            const stack = target.parentItem;
            if (!(stack instanceof Stack)) {
              throw new Error('Selected component is not inside a stack');
            }
            if (action === 'maximize') stack.toggleMaximise();
            else stack.popout();
            break;
          }
          default:
            throw new Error(`Unknown API action: ${action}`);
        }
      }
      this.setStatus(`${action} completed`, false);
      this.log(`API action: ${action}${target ? ` · ${target.title}` : ''}`);
      this.scheduleRefresh();
    } catch (error) {
      this.reportError(error);
    }
  }

  private get methodObject(): object | undefined {
    const target = this.target;
    switch (this.apiObjectSelect.value) {
      case 'layout':
        return this.app.layout;
      case 'selected':
        return target;
      case 'container':
        return target?.container;
      case 'stack':
        return target?.parentItem instanceof Stack
          ? target.parentItem
          : undefined;
      case 'popout':
        return this.app.layout.openPopouts[
          this.app.layout.openPopouts.length - 1
        ];
      case 'exports':
        return Strelit;
      default:
        return undefined;
    }
  }

  private refreshMethods(): void {
    const object = this.methodObject;
    const previous = this.apiMethodSelect.value;
    const methods = new Set<string>();
    let current: object | null | undefined = object;
    while (
      current !== null &&
      current !== undefined &&
      current !== Object.prototype
    ) {
      for (const name of Object.getOwnPropertyNames(current)) {
        const descriptor = Object.getOwnPropertyDescriptor(current, name);
        if (
          name !== 'constructor' &&
          !name.startsWith('_') &&
          typeof descriptor?.value === 'function'
        ) {
          methods.add(name);
        }
      }
      current = Object.getPrototypeOf(current) as object | null;
    }
    const names = [...methods].sort();
    this.apiMethodSelect.replaceChildren(
      ...names.map((name) => new Option(`${name}()`, name)),
    );
    if (names.length === 0) {
      this.apiMethodSelect.add(new Option('No methods available', ''));
    } else if (names.includes(previous)) {
      this.apiMethodSelect.value = previous;
    } else if (names.includes('saveLayout')) {
      this.apiMethodSelect.value = 'saveLayout';
    }
  }

  private resolveArgument(value: unknown): unknown {
    if (Array.isArray(value))
      return value.map((item) => this.resolveArgument(item));
    if (value !== null && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (Object.keys(record).length === 1 && typeof record.$ref === 'string') {
        let referenced: unknown;
        switch (record.$ref) {
          case 'selected':
            referenced = this.target;
            break;
          case 'stack':
            referenced = this.target?.parentItem;
            break;
          case 'root':
            referenced = this.app.layout.rootItem;
            break;
          case 'saved':
            return this.app.layout.saveLayout();
          case 'config':
            return JSON.parse(this.configEditor.value) as unknown;
          default:
            throw new Error(`Unknown reference: ${record.$ref}`);
        }
        if (referenced === undefined) {
          throw new Error(`No ${record.$ref} object is available`);
        }
        return referenced;
      }
      return Object.fromEntries(
        Object.entries(record).map(([key, item]) => [
          key,
          this.resolveArgument(item),
        ]),
      );
    }
    return value;
  }

  private async runMethod(): Promise<void> {
    try {
      const object = this.methodObject;
      if (object === undefined)
        throw new Error('Select an available API object');
      const name = this.apiMethodSelect.value;
      const method = Reflect.get(object, name) as unknown;
      if (typeof method !== 'function')
        throw new Error('Select a callable method');
      const parsed: unknown = JSON.parse(this.apiArgsEditor.value);
      if (!Array.isArray(parsed))
        throw new Error('Arguments must be a JSON array');
      const args = parsed.map((value) => this.resolveArgument(value));
      const result: unknown = await Reflect.apply(method, object, args);
      if (result === undefined) {
        this.methodResult.textContent = 'undefined';
      } else {
        try {
          this.methodResult.textContent =
            JSON.stringify(result, null, 2) ??
            Object.prototype.toString.call(result);
        } catch {
          this.methodResult.textContent =
            Object.prototype.toString.call(result);
        }
      }
      this.setStatus(`${name}() completed`, false);
      this.log(`Called ${this.apiObjectSelect.value}.${name}()`);
      this.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
      this.methodResult.textContent = message;
      this.reportError(error);
    }
  }

  private scheduleRefresh(): void {
    if (this.refreshScheduled) return;
    this.refreshScheduled = true;
    globalThis.setTimeout(() => {
      this.refreshScheduled = false;
      this.refresh();
    }, 0);
  }

  private refresh(): void {
    try {
      const components = this.components;
      const previous = this.targetSelect.value;
      this.targetSelect.replaceChildren(
        ...components.map(
          (item, index) =>
            new Option(`${index + 1}. ${item.title}`, String(index)),
        ),
      );
      if (components.length === 0) {
        this.targetSelect.add(new Option('No components', ''));
      } else if (
        previous !== '' &&
        components[Number(previous)] !== undefined
      ) {
        this.targetSelect.value = previous;
      } else {
        this.targetSelect.selectedIndex = 0;
      }
      const stacks = this.app.layout.getItemsByType(ItemType.stack).length;
      const popouts = this.app.layout.openPopouts.length;
      this.summary.textContent = `${components.length} components · ${stacks} stacks · ${popouts} pop-outs`;
      this.snapshot.textContent = JSON.stringify(
        this.app.layout.saveLayout(),
        null,
        2,
      );
      this.refreshMethods();
    } catch (error) {
      this.reportError(error);
      this.snapshot.textContent = `Snapshot unavailable: ${String(error)}`;
    }
  }

  private setStatus(message: string, isError: boolean): void {
    this.status.textContent = message;
    this.status.classList.toggle('error', isError);
  }

  private reportError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.setStatus(message, true);
    this.log(`Error: ${message}`);
  }

  private log(message: string): void {
    const entry = document.createElement('li');
    const time = document.createElement('time');
    time.textContent = new Date().toLocaleTimeString();
    const content = document.createElement('span');
    content.textContent = message;
    entry.append(time, content);
    this.activity.prepend(entry);
    while (this.activity.childElementCount > 30) {
      this.activity.lastElementChild?.remove();
    }
  }
}
