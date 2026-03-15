# Endpoint Security Audit

| Endpoint                                            | Delay | Throttle | Threat                                                                        | Status    |
|-----------------------------------------------------|-------|----------|-------------------------------------------------------------------------------|-----------|
| POST /api/v1/sign-up                                | Yes   | Yes      | Email enumeration (conflict reveals existing email)                           | Protected |
| POST /api/v1/sign-up/resend-verification-email      | Yes   | Yes      | Email enumeration (error reveals registration existence)                      | Protected |
| POST /api/v1/sign-up/check-email                    | Yes   | Yes      | Email enumeration (timing differences can leak info despite neutral messages) | Protected |
| POST /api/v1/sign-up/verify                         | Yes   | Yes      | Token brute-force                                                             | Protected |
| POST /api/v1/sign-in                                | Yes   | Yes      | Credential brute-force, email enumeration                                     | Protected |
| POST /api/v1/sign-in/refresh                        | No    | Yes      | Token abuse (no body input to enumerate, must respond quickly)                | Protected |
| POST /api/v1/sign-in/magic-link                     | Yes   | Yes      | Email enumeration (timing differences despite neutral message)                | Protected |
| POST /api/v1/sign-in/magic-link/validate            | Yes   | Yes      | Token brute-force                                                             | Protected |
| POST /api/v1/auth/change-password                   | Yes   | Yes      | Credential brute-force                                                        | Protected |
| POST /api/v1/auth/delete-account                    | Yes   | Yes      | Credential brute-force                                                        | Protected |
| POST /api/v1/auth/delete-account/verify             | Yes   | Yes      | Token brute-force                                                             | Protected |
| POST /api/v1/2fa/setup                              | Yes   | Yes      | Credential brute-force                                                        | Protected |
| POST /api/v1/2fa/verify                             | Yes   | Yes      | TOTP code brute-force                                                         | Protected |
| POST /api/v1/2fa/disable                            | Yes   | Yes      | Credential brute-force, TOTP code brute-force                                 | Protected |
| GET  /api/v1/status                                 | No    | No       | Public health check, no sensitive data                                        | N/A       |
