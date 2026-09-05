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
  KeywordSerpCaptureSchema,
  KeywordSerpSourceBeginSchema,
} from "@kiditem/shared/advertising";
import { CurrentOrganization } from "../../../../auth/decorators/current-organization.decorator";
import { KeywordSerpSourceRepository } from "../../out/repository/keyword-serp-source.repository";

@Controller("ads/keyword-rank/serp")
export class KeywordSerpSourceController {
  constructor(private readonly owner: KeywordSerpSourceRepository) {}

  @Post("attempts")
  begin(
    @CurrentOrganization() org: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() raw: unknown,
  ) {
    const body = KeywordSerpSourceBeginSchema.safeParse(raw);
    if (!body.success || !key?.trim() || key.length > 128)
      throw new BadRequestException("INVALID_SERP_ATTEMPT");
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
    const body = KeywordSerpCaptureSchema.safeParse(raw);
    if (!body.success) throw new BadRequestException("INVALID_SERP_CAPTURE");
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
    if (!body.success) throw new BadRequestException("INVALID_SERP_FAILURE");
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
