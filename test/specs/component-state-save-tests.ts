import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    ComponentContainer,
    StrelitLayout,
    LayoutConfig,
    SerializableValue,
} from '../../src';

describe('Component State Saving & Initial State', function () {
    let layout: StrelitLayout;

    beforeEach(function () {
        layout = new StrelitLayout();
    });

    afterEach(function () {
        layout.destroy();
    });

    it('passes initial state to component and requests updated state on saveLayout', function () {
        let receivedInitialState: SerializableValue | undefined;

        layout.registerComponentFactoryFunction(
            'stateComponent',
            (
                container: ComponentContainer,
                state: SerializableValue | undefined,
            ) => {
                receivedInitialState = state;
                container.stateRequestEvent = () => ({ testValue: 'updated' });
            },
        );

        const config: LayoutConfig = {
            root: {
                type: 'component',
                componentType: 'stateComponent',
                componentState: { testValue: 'initial' },
            },
        };

        layout.loadLayout(config);

        expect(receivedInitialState).toEqual({ testValue: 'initial' });

        const savedConfig = layout.saveLayout();
        const savedRoot = savedConfig.root as any;
        expect(savedRoot.content[0].componentState).toEqual({
            testValue: 'updated',
        });
    });
});
