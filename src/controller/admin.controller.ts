import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
  UseGuards
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import { AuthThrottleGuard } from '../config/auth-throttle.guard';
import { Delay } from '../decorator/delay.decorator';
import { AuthoraSetting } from '../config/settings';
import { SuperAdminLoginInputDto } from '../dto/input/super-admin-login.input.dto';
import { UpdateAuthoraSettingInputDto } from '../dto/input/update-authora-setting.input.dto';
import { SuperAdminGuard } from '../guard/super-admin.guard';
import { SettingsService } from '../service/settings.service';
import { AuthoraConfig } from '../config/authora-config';

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly _configService: ConfigService,
    private readonly _jwtService: JwtService,
    private readonly _settingsService: SettingsService
  ) {}

  @Post('sign-in')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate as super admin' })
  @ApiOkResponse({ description: 'Super admin JWT token' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async signIn(
    @Body() dto: SuperAdminLoginInputDto
  ): Promise<{ accessToken: string; type: string; expiresIn: number }> {
    const expectedUsername = this._configService.getOrThrow<string>('AUTHORA_SUPER_ADMIN_USERNAME');
    const expectedPassword = this._configService.getOrThrow<string>('AUTHORA_SUPER_ADMIN_PASSWORD');

    if (dto.username !== expectedUsername || dto.password !== expectedPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const secret = this._configService.getOrThrow<string>('AUTHORA_SUPER_ADMIN_SECRET');
    const expiresIn = await this._settingsService.get(AuthoraSetting.SuperAdminJwtExpirationSec);

    const accessToken = this._jwtService.sign(
      { sub: 'super-admin', role: 'SUPER_ADMIN' },
      { secret, expiresIn, algorithm: 'HS256' }
    );

    return { accessToken, type: 'Bearer', expiresIn };
  }

  @Get('settings')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Get all Authora settings' })
  @ApiOkResponse({ description: 'Current Authora settings' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Super admin access required' })
  async getSettings(): Promise<Record<string, unknown>> {
    const keys = Object.values(AuthoraSetting);
    return this._settingsService.getMany(keys);
  }

  @Post('settings')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update an Authora setting' })
  @ApiOkResponse({ description: 'Setting updated' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Super admin access required' })
  async updateSetting(
    @Body() dto: UpdateAuthoraSettingInputDto
  ): Promise<{ message: string }> {
    await this._settingsService.set(dto.key, dto.value as never);

    return { message: 'Setting updated' };
  }
}
