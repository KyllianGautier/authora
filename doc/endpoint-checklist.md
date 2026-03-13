# Endpoint implementation checklist

This checklist is intended to be used as a guide for implementing new endpoints in the API. It covers the essential steps and considerations to ensure that the endpoint is implemented correctly and efficiently.

1. **Define the endpoint**: Clearly define the purpose and functionality of the endpoint in the `controller-description.md` file. This should include the expected input parameters, the output format, and any relevant business logic.
2. **Implement the endpoint**: From the `controller-description.md` file, write the code for the endpoint in the appropriate controller file. Ensure that the code follows best practices for readability, maintainability, and performance.
   - Add Swagger UI documentation for the endpoint: `@ApiOperation()` with summary, `@ApiOkResponse()`, `@ApiBadRequestResponse()`, `@ApiUnauthorizedResponse()`, `@ApiConflictResponse()`, `@ApiGoneResponse()`, etc.
   - Add `@Delay()` decorator if the endpoint is enumerating attack sensitive
   - Add `@UseGuards(AuthThrottleGuard)` decorator if the endpoint is enumerating attack sensitive
   - If the endpoint involves refresh tokens, use `@Res({ passthrough: true })` to set cookies with `httpOnly: true`, `secure: true`, `sameSite: 'strict'`.
   - Normalize emails to lowercase before any operation in the service layer.
   - Define custom exceptions (extending NestJS base exceptions) at the bottom of the service file.
   - Register new controllers in `src/controller/index.ts`, new services in `src/service/index.ts`, and new entities in `src/entity/index.ts`. If adding a custom validator with dependency injection, register it in `providers` in `app.module.ts`.
   - If the implementation needs to add new env variables, then
     - Add env variable validation with Joi in the `env.validation.ts`
     - Add env variables to the `.env.example` file
     - Add env variables to the E2E tests configuration file if needed
3. **Write DTOs**:
   - **Input DTOs**: Add Swagger UI documentation (`@ApiProperty()`) and validation decorators to ensure that the input data is valid.
     - Consider using the custom decorators (`@IsDifferentFrom`, `@IsStrongPassword()`, ...) decorators where appropriate.
   - **Output DTOs**: Add `@ApiProperty()` decorators and implement a `static fromEntity()` factory method for entity-to-DTO serialization.
4. **Test the endpoint**:
   - Write unit tests if some sensitive logic is implemented in the endpoint.
   - Write E2E tests to ensure that the endpoint works as expected and handles edge cases correctly.
     - Create a dedicated E2E test file for the new endpoint, following the naming convention `endpoint-name.e2e-spec.ts`.
     - Add validation E2E tests to ensure that the validation decorators are working correctly and that invalid input is handled appropriately.
     - Add behavioral E2E tests to ensure that the endpoint behaves as expected under various conditions and scenarios.
     - Add colliding scenarios E2E tests to ensure that the endpoint handles all the entity states correctly
     - Add throttling E2E tests to verify rate limiting returns 429 when thresholds are exceeded (for endpoints guarded with `AuthThrottleGuard`).
5. **Write the documentation**
   - Update the `README.md` file with any relevant information about the new endpoint, including its purpose, input parameters, output format, and new env variables if any.
   - Update the `DOCKERHUB.md` file if the new endpoint requires any changes to the Docker image, deployment process, or new env variables.