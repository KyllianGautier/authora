export interface AuthoraConfig {
  // Argon2id hashing
  hashMemoryCost: number;
  hashTimeCost: number;
  hashParallelism: number;

  // Throttle
  throttleTtlMs: number;
  throttleOriginLimit: number;
  throttleIdentityLimit: number;
  throttleCombinedLimit: number;

  // Delay (timing attack mitigation)
  endpointDelayMinMs: number;
  endpointDelayMaxMs: number;

  // Session & exchange TTLs (seconds)
  authSessionTtlSec: number;
  ottExchangeTtlSec: number;
}

export const defaultAuthoraConfig: AuthoraConfig = {
  hashMemoryCost: 65_536,
  hashTimeCost: 3,
  hashParallelism: 4,

  throttleTtlMs: 60_000,
  throttleOriginLimit: 30,
  throttleIdentityLimit: 10,
  throttleCombinedLimit: 5,

  endpointDelayMinMs: 200,
  endpointDelayMaxMs: 400,

  authSessionTtlSec: 600,
  ottExchangeTtlSec: 300
};

export const testAuthoraConfig: AuthoraConfig = {
  hashMemoryCost: 1_024,
  hashTimeCost: 1,
  hashParallelism: 1,

  throttleTtlMs: 60_000,
  throttleOriginLimit: 30,
  throttleIdentityLimit: 10,
  throttleCombinedLimit: 5,

  endpointDelayMinMs: 1,
  endpointDelayMaxMs: 2,

  authSessionTtlSec: 600,
  ottExchangeTtlSec: 300
};
