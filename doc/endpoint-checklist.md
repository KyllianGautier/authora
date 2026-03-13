# Endpoint implementation checklist

This checklist is intended to be used as a guide for implementing new endpoints in the API. It covers the essential steps and considerations to ensure that the endpoint is implemented correctly and efficiently.

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
