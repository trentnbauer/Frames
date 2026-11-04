import { createContext, useContext } from 'react';

export type NewCompositionStart = { name?: string; photoIds?: number[] };
type Ui = { openSearch: () => void; openNew: (start?: NewCompositionStart) => void };
export const UiContext = createContext<Ui>({ openSearch: () => undefined, openNew: () => undefined });
export const useUi = () => useContext(UiContext);
