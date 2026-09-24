import { createReadStream } from "node:fs";
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Put,
  Res,
  StreamableFile,
  Headers,
  Post,
  Query,
  ParseUUIDPipe,
} from "@nestjs/common";
import { CurrentOrganization } from "../../../../../auth/decorators/current-organization.decorator";
import {
  COUPANG_SHIPMENTS_PORT,
  type CoupangShipmentsPort,
} from "../../../../application/port/in/shipments/index";
import {
  BeginShipmentSummaryDto,
  SubmitShipmentSummaryDto,
  FailShipmentSummaryDto,
} from "./dto/coupang-shipment-date-summary.dto";
import type { Response } from "express";

@Controller("coupang-shipments")
export class CoupangShipmentsController {
  constructor(
    @Inject(COUPANG_SHIPMENTS_PORT)
    private readonly coupangShipments: CoupangShipmentsPort,
  ) {}

  @Get()
  list(@CurrentOrganization() organizationId: string) {
    return this.coupangShipments.listLocalFiles(organizationId);
  }

  @Get("date-summary")
  listDateSummary(@CurrentOrganization() organizationId: string) {
    return this.coupangShipments.listDateSummary(organizationId);
  }

  @Post("date-summary/attempts")
  beginSummary(
    @CurrentOrganization() organizationId: string,
    @Headers("idempotency-key") key: string,
    @Body() dto: BeginShipmentSummaryDto,
  ) {
    return this.coupangShipments.beginSummary(
      organizationId,
      key,
      dto.maxPages,
    );
  }

  @Get("date-summary/source")
  readSummarySource(
    @CurrentOrganization() organizationId: string,
    @Query() query: BeginShipmentSummaryDto,
  ) {
    return this.coupangShipments.readSummarySource(
      organizationId,
      query.maxPages,
    );
  }

  @Get("date-summary/attempts/:attemptId")
  readSummaryAttempt(
    @CurrentOrganization() organizationId: string,
    @Param("attemptId", ParseUUIDPipe) attemptId: string,
  ) {
    return this.coupangShipments.readSummaryAttempt(organizationId, attemptId);
  }

  @Put("date-summary/attempts/:attemptId")
  completeSummary(
    @CurrentOrganization() organizationId: string,
    @Param("attemptId", ParseUUIDPipe) attemptId: string,
    @Headers("x-source-attempt-token") token: string,
    @Body() dto: SubmitShipmentSummaryDto,
  ) {
    return this.coupangShipments.completeSummary(
      organizationId,
      attemptId,
      token,
      dto,
    );
  }

  @Post("date-summary/attempts/:attemptId/fail")
  failSummary(
    @CurrentOrganization() organizationId: string,
    @Param("attemptId", ParseUUIDPipe) attemptId: string,
    @Headers("x-source-attempt-token") token: string,
    @Body() dto: FailShipmentSummaryDto,
  ) {
    return this.coupangShipments.failSummary(
      organizationId,
      attemptId,
      token,
      dto.code,
      dto.message,
    );
  }

  /** 화면의 중단 버튼. 토큰 없이 조직 범위로만 끝내며 실패 알림을 남기지 않는다. */
  @Post("date-summary/attempts/:attemptId/cancel")
  @HttpCode(200)
  cancelSummary(
    @CurrentOrganization() organizationId: string,
    @Param("attemptId", ParseUUIDPipe) attemptId: string,
  ) {
    return this.coupangShipments.cancelSummary(organizationId, attemptId);
  }

  @Get("files/:runId/:date/:fileName")
  @Header("Access-Control-Expose-Headers", "Content-Disposition")
  async download(
    @CurrentOrganization() organizationId: string,
    @Param("runId") runId: string,
    @Param("date") date: string,
    @Param("fileName") fileName: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.coupangShipments.resolveLocalFile(organizationId, {
      runId,
      date,
      fileName,
    });
    response.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(file.fileName),
    );
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Length", String(file.sizeBytes));
    return new StreamableFile(createReadStream(file.path));
  }
}

function contentDispositionAttachment(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
