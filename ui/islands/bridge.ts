import { createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { IslandHandle, IslandBridge } from "./types.ts";

export interface IslandProps<TViewModel, TActions> {
  model: TViewModel;
  actions: TActions;
}

export function createReactIsland<TViewModel, TActions>(
  Component: ComponentType<IslandProps<TViewModel, TActions>>,
): IslandBridge<TViewModel, TActions> {
  return {
    mount(element, model, actions) {
      const root: Root = createRoot(element);
      let currentActions = actions;
      root.render(createElement(Component, { model, actions: currentActions }));
      return {
        update(nextModel) {
          root.render(createElement(Component, { model: nextModel, actions: currentActions }));
        },
        unmount() {
          root.unmount();
        },
      } satisfies IslandHandle<TViewModel>;
    },
  };
}
