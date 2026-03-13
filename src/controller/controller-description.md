# Controller description

## Sing-up controller

### POST /sign-up

Create a registration.

Input dto contains email and clear password.

It returns an error if the email is already used in registration or user

At the end, it sends a message throw the rabbitmq queue in order to communicate values to allow external service to send an email with email and a validation token.


### POST /sign-up/resend-verification-email

Send a new email verification token.

Input dto contains email.

It will create a new email verification token in the registration.

At the end, it sends a message throw the rabbitmq queue in order to communicate values to allow external service to send an email with email the new validation token.


### POST /sign-up/verify

Delete the registration and create a new user.

Input Dto contains the email and the email verification token.

Output Dto returns a user infos (email and createdAt).


### POST /sign-up/check-email

Check if an email is available.

Input Dto contains the email to check.

Check if the email is already used by a user or a registration.

Returns always a status 200 with a neutral message:
- Email is already used: "If the email can be used, you will be able to sign-up."
- Email is available: "You can continue the registration process if this email is valid."


## Two Factor Auth controller

### POST /2fa/setup

Create a two factor authentication with a secret for a user.

Input Dto contains the user email and the password.

It will create a two factor authentication for the user and generate a verification code.

Output a qrcode and a manual code.


### POST /2fa/verify

Enable the two factor authentication for a user.

Input Dto contains the email, the password and a 6-digits code from a 2fa authentication app.

It will enable the two factor authentication, and generate ten recovery codes. The pattern of recovery code is XXXX-XXXX (X can be 0-9A-Z).

It returns the 6-digits code list once.


### POST /2fa validate


## Auth controller

### POST /auth/change-password

Change the current user password.

Input Dto contains the user email, current password and new password. The current and new password has to be different.

It changes the previous password in revoked, and create a new one as the new current password. If the password is the same than a previous one, then an error is returned.

Output a confirmation.


### POST /auth/delete-account

Ask for a user deletion action.

Input Dto contains user email and password.

It creates a new verification token and send it by email.

Output a confirmation.


### POST /auth/delete-account/verify

Delete a user.

Input Dto contains user email and verification token.

Delete user and all its related data.

Output a confirmation.


## Sign-in controller

### POST /sign-in (v1)

Sign-in the user.

Input Dto contains email and password.

Depends on the 2FA configuration, this endpoint can have different behaviors.
- DISABLED: the endpoint will return new access
- OPTIONAL:
  - User has set up the 2fa: it will return an OTT for validate the second sign-in with 2FA
  - User hasn't set up the 2fa: or the 2fa is not enabled, then it will return new access
- MANDATORY:
  - User has set up the 2fa: it will return an OTT for validate the second sign-in with 2FA
  - User hasn't set up the 2fa: it will return an error

Output new access: access token, expiring date and refresh token
Output 2fa validation: validation token

---

### POST /sign-in (v2)

Sign-in the user.

Input Dto contains email and password.

The TWO_FACTOR_AUTH environment variable (DISABLED, OPTIONAL, MANDATORY) determines the behavior:
- DISABLED: always return new access (200)
- OPTIONAL:
  - User has 2FA enabled: return a validation token (202)
  - User has no 2FA enabled: return new access (200)
- MANDATORY:
  - User has 2FA enabled: return a validation token (202)
  - User has no 2FA enabled: return an error (403)

Output 200 (SignInAccessOutputDto): access token, expiring date and refresh token
Output 202 (SignInTwoFactorAuthOutputDto): validation token

---

### POST /sign-in (v3)

Sign-in the user.

Input Dto contains email, password and remember me.

It verifies the user credentials and generates new access tokens. The refresh token is generated, with an expiring date according to the remember me value. The previous one is revoked.
Remember me value:
- true: expiring date from JWT_REFRESH_TOKEN_LONG_EXPIRATION_SECONDS (default 1 month)
- false: expiring date from JWT_REFRESH_TOKEN_SHORT_EXPIRATION_SECONDS (default 1 day)

Output (SignInAccessOutputDto): access token, expiring date and refresh token


### POST /sign-in/refresh

Sign-in the user using the refresh token.

Input Dto contains nothing.

It verifies that both JWT and refresh token are submitted by header and cookie, and if the JWT is expired and the refresh token is correct, valid and not revoked, it generates new access tokens. A new refresh token is generated, but with the expiring date of the previous one.

Output 400: JWT is not yet expired
Output 401: refresh token expired or revoked
Output 200: same return than sign-in (access token, expiring date and the new refresh token by httpOnly cookie)