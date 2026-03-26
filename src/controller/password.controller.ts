import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from '@nestjs/swagger';
import { TenantSetting } from '../config/settings';
import { SettingsService } from '../service/settings.service';
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
  private readonly _constraints: PasswordRule[];

  constructor(
    private readonly _settingsService: SettingsService,
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
  async getRules(): Promise<PasswordRulesOutputDto> {
    // TODO: use tenant context when multi-tenant is enabled
    const tenantId = '';

    const settings = await this._settingsService.getMany([
      TenantSetting.PasswordMinLength,
      TenantSetting.PasswordRequireDigit,
      TenantSetting.PasswordRequireSpecialChar,
      TenantSetting.PasswordRequireLowercase,
      TenantSetting.PasswordRequireUppercase,
      TenantSetting.PasswordForbidSequentialChars,
      TenantSetting.PasswordForbidRepeatedChars,
      TenantSetting.PasswordForbidKeyboardSequence,
      TenantSetting.PasswordForbidUserInfo,
      TenantSetting.PasswordForbidCommonPassword
    ], tenantId);

    return Object.assign(new PasswordRulesOutputDto(), {
      minLength: settings.passwordMinLength,
      requireDigit: settings.passwordRequireDigit,
      requireSpecialChar: settings.passwordRequireSpecialChar,
      requireLowercase: settings.passwordRequireLowercase,
      requireUppercase: settings.passwordRequireUppercase,
      forbidSequentialChars: settings.passwordForbidSequentialChars,
      forbidRepeatedChars: settings.passwordForbidRepeatedChars,
      forbidKeyboardSequence: settings.passwordForbidKeyboardSequence,
      forbidUserInfo: settings.passwordForbidUserInfo,
      forbidCommonPassword: settings.passwordForbidCommonPassword
    });
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
