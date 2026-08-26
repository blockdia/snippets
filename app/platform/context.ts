import { createContext } from "react-router";

import type { AppDatabase } from "../db/client";

export interface PlatformContext {
  db: AppDatabase;
  env: Env;
}

export const platformContext = createContext<PlatformContext>();
