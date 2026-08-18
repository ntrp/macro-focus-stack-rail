import type { NativeScriptConfig } from "@nativescript/core";

export default {
  id: "dev.focusrail.controller",
  appPath: "app",
  appResourcesPath: "app/App_Resources",
  main: "app/app.ts",
  android: {
    v8Flags: "--expose_gc",
    markingMode: "none",
  },
} as NativeScriptConfig;
