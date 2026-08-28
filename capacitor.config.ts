import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'eu.tysonsocial.app',
  appName: 'Tyson Social',
  webDir: 'frontend/dist',
  server: {
    url: 'https://tysonsocial.eu.cc',
    cleartext: false,
  },
};

export default config;
