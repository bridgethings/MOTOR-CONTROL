import { createTheme } from '@mantine/core';

export const theme = createTheme({
  primaryColor: 'blue',
  defaultColorScheme: 'light',
  colors: {
    // Professional Slate palette
    slate: [
      '#f8fafc',
      '#f1f5f9',
      '#e2e8f0',
      '#cbd5e1',
      '#94a3b8',
      '#64748b',
      '#475569',
      '#334155',
      '#1e293b',
      '#0f172a',
    ],
    // Professional Emerald palette
    emerald: [
      '#ecfdf5',
      '#d1fae5',
      '#a7f3d0',
      '#6ee7b7',
      '#34d399',
      '#10b981',
      '#059669',
      '#047857',
      '#065f46',
      '#064e3b',
    ],
  },
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  headings: {
    fontFamily: 'inherit',
    fontWeight: '600',
  },
  components: {
    Card: {
      defaultProps: {
        radius: 'md',
        withBorder: true,
        shadow: 'xs',
      },
    },
    Button: {
      defaultProps: {
        radius: 'md',
      },
    },
  },
});
