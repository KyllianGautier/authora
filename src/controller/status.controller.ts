import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Status')
@Controller('status')
export class StatusController {
  @Get()
  @ApiOperation({ summary: 'Check service status' })
  @ApiResponse({ status: 200, description: 'Service is running', type: String })
  getStatus(): string {
    return 'Authora is running';
  }
}
