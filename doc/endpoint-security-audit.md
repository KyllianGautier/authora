# Endpoint Security Audit

| Endpoint                                | Delay | Throttle | Threat                                                                        | Status    |
|-----------------------------------------|-------|----------|-------------------------------------------------------------------------------|-----------|
| POST /sign-up                           | Yes   | Yes      | Email enumeration (conflict reveals existing email)                           | Protected |
| POST /sign-up/resend-verification-email | Yes   | Yes      | Email enumeration (error reveals registration existence)                      | Protected |
| POST /sign-up/check-email               | Yes   | Yes      | Email enumeration (timing differences can leak info despite neutral messages) | Protected |
| POST /sign-up/verify                    | Yes   | Yes      | Token brute-force                                                             | Protected |
| POST /sign-in                           | Yes   | Yes      | Credential brute-force, email enumeration                                     | Protected |
| POST /sign-in/refresh                   | No    | Yes      | Token abuse (no body input to enumerate, must respond quickly)                | Protected |
| POST /sign-in/magic-link                | Yes   | Yes      | Email enumeration (timing differences despite neutral message)                | Protected |
| POST /sign-in/magic-link/validate       | Yes   | Yes      | Token brute-force                                                             | Protected |
| POST /auth/change-password              | Yes   | Yes      | Credential brute-force                                                        | Protected |
| POST /auth/delete-account               | Yes   | Yes      | Credential brute-force                                                        | Protected |
| POST /auth/delete-account/verify        | Yes   | Yes      | Token brute-force                                                             | Protected |
| POST /2fa/setup                         | Yes   | Yes      | Credential brute-force                                                        | Protected |
| POST /2fa/verify                        | Yes   | Yes      | TOTP code brute-force                                                         | Protected |
| POST /2fa/disable                       | Yes   | Yes      | Credential brute-force, TOTP code brute-force                                 | Protected |
| GET /status                             | No    | No       | Public health check, no sensitive data                                        | N/A       |
