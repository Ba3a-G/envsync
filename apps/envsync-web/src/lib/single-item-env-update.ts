import { EnvironmentVariable, EnvVarFormData, SingleItemEnvVarUpdateData } from "@/constants";

export function buildSingleItemEnvVarUpdate(
  variable: EnvironmentVariable,
  formData: EnvVarFormData,
  isValueModified: boolean
): SingleItemEnvVarUpdateData | null {
  if (!isValueModified) {
    return null;
  }

  return {
    originalKey: variable.key,
    value: formData.value.trim(),
    env_type_id: variable.env_type_id,
  };
}
