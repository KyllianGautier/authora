import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from '@nestjs/swagger';
import type { AuthoraTenantConfig } from '../config/tenant-config';
import { TENANT_CONFIG } from '../config/tenant-config';
import { CheckPasswordStrengthInputDto } from '../dto/input/check-password-strength.input.dto';
import { CheckPasswordStrengthOutputDto } from '../dto/output/check-password-strength.output.dto';
import { PasswordRulesOutputDto } from '../dto/output/password-rules.output.dto';
import {
  HasMinLengthConstraint,
  HasDigitConstraint,
  HasSpecialCharConstraint,
  HasLowercaseConstraint,
  HasUppercaseConstraint,
  NoSequentialCharsConstraint,
  NoRepeatedCharsConstraint,
  NoKeyboardSequenceConstraint,
  NoUserInfoConstraint,
  NoCommonPasswordConstraint
} from '../dto/validator/password';

interface PasswordRule {
  validate(value: unknown): boolean | Promise<boolean>;
  defaultMessage(): string;
}

@ApiTags('Password')
@Controller('password')
export class PasswordController {
  private readonly _rules: PasswordRulesOutputDto;
  private readonly _constraints: PasswordRule[];

  constructor(
    @Inject(TENANT_CONFIG)
    private readonly _tenantConfig: AuthoraTenantConfig,
    private readonly _hasMinLength: HasMinLengthConstraint,
    private readonly _hasDigit: HasDigitConstraint,
    private readonly _hasSpecialChar: HasSpecialCharConstraint,
    private readonly _hasLowercase: HasLowercaseConstraint,
    private readonly _hasUppercase: HasUppercaseConstraint,
    private readonly _noSequentialChars: NoSequentialCharsConstraint,
    private readonly _noRepeatedChars: NoRepeatedCharsConstraint,
    private readonly _noKeyboardSequence: NoKeyboardSequenceConstraint,
    private readonly _noUserInfo: NoUserInfoConstraint,
    private readonly _noCommonPassword: NoCommonPasswordConstraint
  ) {
    this._rules = Object.assign(new PasswordRulesOutputDto(), {
      minLength: this._tenantConfig.passwordMinLength,
      requireDigit: this._tenantConfig.passwordRequireDigit,
      requireSpecialChar: this._tenantConfig.passwordRequireSpecialChar,
      requireLowercase: this._tenantConfig.passwordRequireLowercase,
      requireUppercase: this._tenantConfig.passwordRequireUppercase,
      forbidSequentialChars: this._tenantConfig.passwordForbidSequentialChars,
      forbidRepeatedChars: this._tenantConfig.passwordForbidRepeatedChars,
      forbidKeyboardSequence: this._tenantConfig.passwordForbidKeyboardSequence,
      forbidUserInfo: this._tenantConfig.passwordForbidUserInfo,
      forbidCommonPassword: this._tenantConfig.passwordForbidCommonPassword
    });

    this._constraints = [
      this._hasMinLength,
      this._hasDigit,
      this._hasSpecialChar,
      this._hasLowercase,
      this._hasUppercase,
      this._noSequentialChars,
      this._noRepeatedChars,
      this._noKeyboardSequence,
      this._noCommonPassword
    ];
  }

  @Get('rules')
  @ApiOperation({ summary: 'Get password strength rules' })
  @ApiOkResponse({
    description: 'Password strength rules',
    type: PasswordRulesOutputDto
  })
  getRules(): PasswordRulesOutputDto {
    return this._rules;
  }

  @Post('check-strength')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check password strength against rules' })
  @ApiOkResponse({
    description: 'Password strength check result',
    type: CheckPasswordStrengthOutputDto
  })
  async checkStrength(
    @Body() dto: CheckPasswordStrengthInputDto
  ): Promise<CheckPasswordStrengthOutputDto> {
    const errors: string[] = [];

    for (const constraint of this._constraints) {
      const result = await constraint.validate(dto.password);
      if (!result) {
        errors.push(constraint.defaultMessage());
      }
    }

    if (dto.email !== undefined) {
      const args = {
        object: { email: dto.email },
        constraints: ['email']
      } as import('class-validator').ValidationArguments;

      const result = this._noUserInfo.validate(dto.password, args);
      if (!result) {
        errors.push(this._noUserInfo.defaultMessage());
      }
    }

    return Object.assign(new CheckPasswordStrengthOutputDto(), {
      valid: errors.length === 0,
      errors
    });
  }
}
