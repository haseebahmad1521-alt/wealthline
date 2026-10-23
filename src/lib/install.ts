// Native builds are already apps: nothing to install.
export const install = {
  standalone: () => true,
  isIOS: () => false,
  canPrompt: () => false,
  prompt: async () => {},
  subscribe: (_l: () => void) => () => {},
};
