/**
 * ThemeProvider — app-level wrapper
 * =================================
 * Loads all registered themes and wraps children with the theme context.
 * Import the loader to ensure all built-in themes are registered before
 * the provider mounts.
 */

import React from "react";

// Side-effect: registers all built-in themes
import "@/themes/loader";

import { ThemeProvider as ThemeContextProvider } from "@/themes/context";

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  return <ThemeContextProvider>{children}</ThemeContextProvider>;
};
