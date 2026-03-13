import { execSync } from 'child_process';

// Runs once after all test suites. Stops the containers started by global-setup.ts.
export default async function globalTeardown() {
  execSync(
    'docker compose -f test/docker-compose.test.yml --env-file .env.test down',
    { stdio: 'inherit' }
  );
}
