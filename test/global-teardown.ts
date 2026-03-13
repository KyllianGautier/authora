// Runs once after all test suites. Stops the containers started by global-setup.ts.
export default async function globalTeardown() {
  const postgresContainer = (globalThis as any).__POSTGRES_CONTAINER__;
  const rabbitmqContainer = (globalThis as any).__RABBITMQ_CONTAINER__;

  if (postgresContainer) await postgresContainer.stop();
  if (rabbitmqContainer) await rabbitmqContainer.stop();
}
