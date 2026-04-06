import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse
} from '@nestjs/swagger';
import { TenantSetting } from '../config/settings';
import { CurrentTenant } from '../decorator/current-tenant.decorator';
import { UpdateTenantSettingInputDto } from '../dto/input/update-tenant-setting.input.dto';
import { TenantEntity } from '../entity/tenant.entity';
import { JwtAuthGuard } from '../guard/jwt-auth.guard';
import { AdminGuard } from '../guard/admin.guard';
import { SettingsService } from '../service/settings.service';

@ApiTags('Tenant Admin')
@Controller('tenant-admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class TenantAdminController {
  constructor(
    private readonly _settingsService: SettingsService
  ) {}

  @Get('settings')
  @ApiOperation({ summary: 'Get all tenant settings' })
  @ApiOkResponse({ description: 'Current tenant settings' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Admin access required' })
  async getSettings(
    @CurrentTenant() tenant: TenantEntity
  ): Promise<Record<string, unknown>> {
    const keys = Object.values(TenantSetting);
    return this._settingsService.getMany(keys, tenant.id);
  }

  @Post('settings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a tenant setting' })
  @ApiOkResponse({ description: 'Setting updated' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Admin access required' })
  async updateSetting(
    @Body() dto: UpdateTenantSettingInputDto,
    @CurrentTenant() tenant: TenantEntity
  ): Promise<{ message: string }> {
    await this._settingsService.set(dto.key, dto.value as never, tenant.slug);

    return { message: 'Setting updated' };
  }
}
