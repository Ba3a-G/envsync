import { describe, expect, test } from "bun:test";

import { buildSingleItemEnvVarUpdate } from "./single-item-env-update";
import type { EnvironmentVariable, EnvVarFormData } from "@/constants";

const baseVariable: EnvironmentVariable = {
  id: "var_123",
  key: "DATABASE_URL",
  value: "postgres://localhost:5432/app",
  sensitive: false,
  env_type_id: "env_type_123",
  app_id: "app_123",
  created_at: new Date("2024-01-01T00:00:00Z"),
  updated_at: new Date("2024-01-01T00:00:00Z"),
};

describe("buildSingleItemEnvVarUpdate", () => {
  test("returns a complete update payload when only the value changes", () => {
    const formData: EnvVarFormData = {
      key: "IGNORED_RENAME",
      value: "postgres://localhost:5432/updated",
      sensitive: true,
      env_type_id: "ignored_env_type_change",
    };

    expect(buildSingleItemEnvVarUpdate(baseVariable, formData, true)).toEqual({
      originalKey: "DATABASE_URL",
      value: "postgres://localhost:5432/updated",
      env_type_id: "env_type_123",
    });
  });

  test("returns null when the value was not modified", () => {
    const formData: EnvVarFormData = {
      key: baseVariable.key,
      value: baseVariable.value,
      sensitive: baseVariable.sensitive,
      env_type_id: baseVariable.env_type_id,
    };

    expect(buildSingleItemEnvVarUpdate(baseVariable, formData, false)).toBeNull();
  });

  test("trims the submitted value", () => {
    const formData: EnvVarFormData = {
      key: baseVariable.key,
      value: "  updated-secret  ",
      sensitive: true,
      env_type_id: baseVariable.env_type_id,
    };

    expect(buildSingleItemEnvVarUpdate(baseVariable, formData, true)).toEqual({
      originalKey: "DATABASE_URL",
      value: "updated-secret",
      env_type_id: "env_type_123",
    });
  });
});
