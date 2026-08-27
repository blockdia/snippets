#!/usr/bin/env node

import { loadReleaseConfig } from "./release/config";

loadReleaseConfig()
  .then((config) => {
    console.log(
      `Release config ready: D1=${config.databaseName} R2=${config.r2BucketName} Access=${config.accessTeamDomain}`,
    );
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
