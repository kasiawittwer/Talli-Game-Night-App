import { createContext, type ReactNode } from 'react';

export type WebLayoutDimensions = {
  width: number;
  height: number;
};

export const WebLayoutDimensionsContext = createContext<WebLayoutDimensions | null>(null);

export function WebLayoutDimensionsProvider({
  value,
  children,
}: {
  value: WebLayoutDimensions;
  children: ReactNode;
}) {
  return (
    <WebLayoutDimensionsContext.Provider value={value}>{children}</WebLayoutDimensionsContext.Provider>
  );
}
