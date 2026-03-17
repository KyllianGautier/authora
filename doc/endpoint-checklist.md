# Endpoint Implementation Checklist

This checklist is a guide for implementing new endpoints in the API.

---

## 1. Define the Endpoint

Clearly define the endpoint in `controller-description.md`:
- Expected input parameters
- Output format
- Relevant business logic

---

## 2. Implement the Endpoint

### Architecture

- **Controller** — defines the endpoint
- **Service** — one service per controller, each method corresponds to an endpoint and handles all business logic
- **Entity services** (`src/service/entity-service/`) — dedicated service per entity for basic operations (create/update/delete are internal, only actions are exposed)

### Controller

- [ ] Add Swagger documentation: `@ApiOperation()` with summary, `@ApiOkResponse()`, `@ApiBadRequestResponse()`, `@ApiUnauthorizedResponse()`, `@ApiConflictResponse()`, `@ApiGoneResponse()`, etc.
- [ ] Add `@Delay()` decorator if the endpoint is enumeration-attack sensitive
- [ ] Add `@UseGuards(AuthThrottleGuard)` if the endpoint is enumeration-attack sensitive
- [ ] If the endpoint involves refresh tokens, use `@Res({ passthrough: true })` to set cookies with `httpOnly: true`, `secure: true`, `sameSite: 'strict'`

### Service

- [ ] Normalize emails to lowercase before any operation
- [ ] Define custom exceptions (extending NestJS base exceptions) at the bottom of the service file

### Registration

- [ ] Register new controllers in `src/controller/index.ts`
- [ ] Register new services in `src/service/index.ts`
- [ ] Register new entities in `src/entity/index.ts`
- [ ] If adding a custom validator with dependency injection, register it in `providers` in `app.module.ts`

### Environment Variables (if applicable)

- [ ] Add validation with Joi in `env.validation.ts`
- [ ] Add to `.env.example`
- [ ] Add to E2E tests configuration if needed

---

## 3. Write DTOs

### Input DTOs

- [ ] Add `@ApiProperty()` decorators
- [ ] Add validation decorators
- [ ] Consider custom decorators (`@IsDifferentFrom`, `@IsStrongPassword()`, ...) where appropriate

### Output DTOs

- [ ] Add `@ApiProperty()` decorators
- [ ] Implement a `static fromEntity()` factory method for entity-to-DTO serialization

---

## 4. Test the Endpoint

- [ ] Write unit tests if sensitive logic is involved
- [ ] Write E2E tests:
  - [ ] Create a dedicated file following the naming convention `endpoint-name.e2e-spec.ts`
  - [ ] Validation tests — ensure validation decorators reject invalid input
  - [ ] Behavioral tests — verify expected behavior under various conditions
  - [ ] Colliding scenario tests — verify correct handling of all entity states
  - [ ] Throttling tests — verify rate limiting returns 429 (for endpoints guarded with `AuthThrottleGuard`)

---

## 5. Write the Documentation

- [ ] Update `README.md` with endpoint purpose, input/output, and new env variables if any
- [ ] Update `DOCKERHUB.md` if the endpoint requires Docker image changes, deployment changes, or new env variables
- [ ] Update `endpoint-security-audit.md` with the new endpoint's delay, throttle, and threat information
