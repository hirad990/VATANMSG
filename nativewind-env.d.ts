/// <reference types="nativewind/types" />

import "react-native";

declare module "react-native" {
  interface ViewProps {
    className?: string;
  }
  interface ScrollViewProps {
    className?: string;
  }
  interface PressableProps {
    className?: string;
  }
}
