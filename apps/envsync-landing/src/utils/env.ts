import z, { ZodTypeAny } from 'zod';
import { runtimeConfig } from "@/utils/runtime-config";

export type JWT = `Bearer ${string}`;
export type TEnvKey = `VITE_${string}`;

/**
 * Function type with arguments and return type
 * @param P - Arguments
 * @param R - Return type
 */
export type Function<P = unknown, R = unknown> = (props: P) => R;
/**
 * Async function type with arguments and return type
 * @param P - Arguments
 * @param R - Return type
 */
export type AsyncFunction<P = unknown, R = unknown> = Function<P, Promise<R>>;

type EnvRecords = Record<TEnvKey, ZodTypeAny>;

const envSchema = z.object({
  VITE_API_BASE_URL: z.string().url().default('http://localhost:4000'),
} satisfies EnvRecords);

export const env = envSchema.parse({
  VITE_API_BASE_URL: runtimeConfig.apiBaseUrl,
});
export type Env = z.infer<typeof envSchema>;
