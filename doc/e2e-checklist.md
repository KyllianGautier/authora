# E2E checlist

E2E tests are organized under multiple sections. Each section has a specific goal. All tests should check at least status code and response body.

## Validation

Validation section should test the class-validator decorators, in the input DTOs. The tests should cover all cases (wrong value, missing value, missing body, ...).

## Behavior

Behavior section should test the feature of the endpoint, chat does it do, the result in database, the RabbitMQ message emitting, HTTP responses and errors.

The test should NEVER call another endpoint to insert data for the test. If the test needs specific data, use entity factories in `test/utils/`.

## Throttling

Throttling section should test 3 cases: origin, identity or combined types of request attack.
- Identity: Same email, different IPs
- Origin: Same IP, different emails
- Combined: Same email and IP