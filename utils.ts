import type { User } from "@/src/auth/store.ts";
import { createDefine } from "fresh";
import type { Store } from "@/src/storage/store.ts";
import type { Config } from "@/src/config.ts";

export interface State {
  store: Store;
  config: Config;
  user?: User;
  operator: boolean;
}
export const define = createDefine<State>();
