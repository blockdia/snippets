import { createContext } from "react-router";

import type { AppDatabase } from "../db/client";

export interface PlatformContext {
  db: AppDatabase;
  env: Env;
  requestMetadata: {
    country: string | null;
    colo: string | null;
  };
}

export const platformContext = createContext<PlatformContext>();
