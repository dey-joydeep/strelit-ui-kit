# Location selectors

LocationSelectors specify the location of a component in terms of a parent and a index. LocationSelectors are useful for specifying where a new ContentItem should be placed.

A `LayoutManagerLocationSelector` does not specify the parent directly. Instead it specifies how the parent is to be searched for. It has the type:

```
export interface LayoutManagerLocationSelector {
    typeId: LayoutManagerLocationSelectorTypeId;
    index?: number;
}
```

`typeId` specifies the algorithm used to search for a parent.
`index` is used by the algorithm to work out the preferred child position under the parent.

Some `LayoutManagerLocationSelectorTypeId` values will always find a location. For example, `Root` is guaranteed to find a location. Others may not find a location; `FirstStack` will not find one if a layout is empty.

The `LayoutManager.addComponentAtLocation()` and `LayoutManager.newComponentAtLocation()` use an array of LocationSelectors to determine the location at which a new/added component will be installed. These functions will attempt to find a valid location starting with the first element in the LocationSelectors array. When a valid location is found, that location will be used for the new component. If no valid location is found from the LocationSelectors in the array, then the component will not be added.

The `LayoutManager.addComponent()` and `LayoutManager.newComponent()` use a default LocationSelectors array. The last element in this default array is a LocationSelector of type `LocationSelector.TypeId.Root`. So this array is guaranteed to find a location. Accordingly, `LayoutManager.addComponent()` and `LayoutManager.newComponent()` will always succeed in adding a component.

The default array is exported as `layoutManagerDefaultLocationSelectors`. The alternative `layoutManagerAfterFocusedItemIfPossibleLocationSelectors` preset prefers placement after the focused item.
