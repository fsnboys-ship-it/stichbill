import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiServiceUnavailableResponse } from '@nestjs/swagger';
export const DATABASE_PROBE = Symbol('DATABASE_PROBE');
export class HealthResponse {
  @ApiProperty({ type: String, enum: ['ok'], example: 'ok' }) status!: 'ok';
  @ApiProperty({ type: String, example: 'stichbill-api' }) service!: string;
}
export class ReadyResponse extends HealthResponse {
  @ApiProperty({ type: String, enum: ['up'], example: 'up' }) database!: 'up';
}
@Controller('health')
export class HealthController {
  constructor(@Inject(DATABASE_PROBE) private readonly databaseProbe: () => Promise<void>) {}
  @Get()
  @ApiOperation({ operationId: 'getHealth', summary: 'API process liveness; does not imply database readiness' })
  @ApiOkResponse({ type: HealthResponse })
  live(): HealthResponse { return { status: 'ok', service: 'stichbill-api' }; }
  @Get('ready')
  @ApiOperation({ operationId: 'getReadiness', summary: 'Local database readiness using SELECT 1' })
  @ApiOkResponse({ type: ReadyResponse })
  @ApiServiceUnavailableResponse({ description: 'Database unavailable; connection details are never exposed' })
  async ready(): Promise<ReadyResponse> {
    try { await this.databaseProbe(); }
    catch { throw new ServiceUnavailableException('Database unavailable'); }
    return { status: 'ok', service: 'stichbill-api', database: 'up' };
  }
}
