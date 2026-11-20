import { createContext, useContext } from 'react';

export type NewCompositionStart = { name?: string; photoIds?: number[] };
/**
 * openNew starts something new: it always asks first what is being made (a composition, an Instagram carousel or a zine), with or without
 * photographs. openComposition goes straight to New composition, for the picker once Composition has been chosen; nothing else uses it.
 */
type Ui = { openSearch: () => void; openNew: (start?: NewCompositionStart) => void; openComposition: (start?: NewCompositionStart) => void };
export const UiContext = createContext<Ui>({ openSearch: () => undefined, openNew: () => undefined, openComposition: () => undefined });
export const useUi = () => useContext(UiContext);
