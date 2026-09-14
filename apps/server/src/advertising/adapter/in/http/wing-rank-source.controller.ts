import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import {
  WingRankCaptureSchema,
  WingRankSourceBeginSchema,
  WingRankBatchBeginSchema,
} from "@kiditem/shared/advertising";
import { CurrentOrganization } from "../../../../auth/decorators/current-organization.decorator";
import { WingRankSourceRepository } from "../../out/repository/wing-rank-source.repository";

@Controller("ads/keyword-rank/wing")
export class WingRankSourceController {
  constructor(private readonly owner: WingRankSourceRepository) {}

  @Post("batch-attempts")
  beginBatch(
    @CurrentOrganization() org: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() raw: unknown,
  ) {
    if (
      !WingRankBatchBeginSchema.safeParse(raw).success ||
      !key?.trim() ||
      key.length > 128
    )
      throw new BadRequestException("INVALID_WING_RANK_BATCH_ATTEMPT");
    return this.owner.beginBatch(org, key.trim());
  }

  @Get("batch-attempts")
  readBatch(
    @CurrentOrganization() org: string,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    if (!key?.trim() || key.length > 128)
      throw new BadRequestException("INVALID_WING_RANK_BATCH_ATTEMPT");
    return this.owner.readBatch(org, key.trim());
  }

  /** The current batch without its key; an empty body when the organization has none. */
  @Get("batch-attempts/current")
  readCurrentBatch(@CurrentOrganization() org: string) {
    return this.owner.readCurrentBatch(org);
  }

  @Post("batch-attempts/cancel")
  cancelBatch(
    @CurrentOrganization() org: string,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    if (!key?.trim() || key.length > 128)
      throw new BadRequestException("INVALID_WING_RANK_BATCH_ATTEMPT");
    return this.owner.cancelBatch(org, key.trim());
  }

  @Post("attempts")
  begin(
    @CurrentOrganization() org: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() raw: unknown,
  ) {
    const body = WingRankSourceBeginSchema.safeParse(raw);
    if (!body.success || !key?.trim() || key.length > 128)
      throw new BadRequestException("INVALID_WING_RANK_ATTEMPT");
    return this.owner.begin(org, key.trim(), body.data);
  }

  @Get("source")
  source(
    @CurrentOrganization() org: string,
    @Query("keyword") keyword: string,
  ) {
    if (typeof keyword !== "string" || !keyword.trim())
      throw new BadRequestException("INVALID_KEYWORD");
    return this.owner.source(org, keyword.trim());
  }

  @Get("attempts/:attemptId")
  read(
    @CurrentOrganization() org: string,
    @Param("attemptId", new ParseUUIDPipe()) id: string,
  ) {
    return this.owner.read(org, id);
  }

  @Get("attempts/:attemptId/capture")
  capture(
    @CurrentOrganization() org: string,
    @Param("attemptId", new ParseUUIDPipe()) id: string,
  ) {
    return this.owner.capture(org, id);
  }

  @Put("attempts/:attemptId")
  complete(
    @CurrentOrganization() org: string,
    @Param("attemptId", new ParseUUIDPipe()) id: string,
    @Headers("x-source-attempt-token") token: string,
    @Body() raw: unknown,
  ) {
    const body = WingRankCaptureSchema.safeParse(raw);
    if (!body.success)
      throw new BadRequestException("INVALID_WING_RANK_CAPTURE");
    return this.owner.complete(org, id, attemptToken(token), body.data);
  }

  @Post("attempts/:attemptId/fail")
  fail(
    @CurrentOrganization() org: string,
    @Param("attemptId", new ParseUUIDPipe()) id: string,
    @Headers("x-source-attempt-token") token: string,
    @Body() raw: unknown,
  ) {
    const body = z
      .object({
        code: z.string().trim().min(1).max(100),
        message: z.string().trim().min(1).max(300),
      })
      .strict()
      .safeParse(raw);
    if (!body.success)
      throw new BadRequestException("INVALID_WING_RANK_FAILURE");
    return this.owner.fail(
      org,
      id,
      attemptToken(token),
      body.data.code,
      body.data.message,
    );
  }
}

function attemptToken(raw: string) {
  const token = z.string().uuid().safeParse(raw);
  if (!token.success)
    throw new BadRequestException("INVALID_SOURCE_ATTEMPT_TOKEN");
  return token.data;
}
