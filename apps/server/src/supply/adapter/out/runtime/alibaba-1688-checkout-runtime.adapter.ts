import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import type {
  PurchaseOrderCheckoutRuntimePort,
  SubmitPurchaseOrderCheckoutInput,
  SubmitPurchaseOrderCheckoutResult,
} from '../../../application/port/out/runtime/purchase-order-checkout-runtime.port';

const DEFAULT_TIMEOUT_MS = 60_000;

export interface Alibaba1688CheckoutProviderSubmitInput {
  url: string;
  timeoutMs: number;
  body: {
    organizationId: string;
    purchaseOrderId: string;
    purchaseOrder: SubmitPurchaseOrderCheckoutInput['purchaseOrder'];
  };
}

export interface Alibaba1688CheckoutProviderResult {
  ok: boolean;
  status: number;
  body: unknown;
}

export interface Alibaba1688CheckoutProviderClient {
  submit(
    input: Alibaba1688CheckoutProviderSubmitInput,
  ): Promise<Alibaba1688CheckoutProviderResult>;
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalPositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function providerUrl(): string {
  const runtime = stringField(process.env.AGENT_OS_1688_CHECKOUT_RUNTIME);
  const url = stringField(process.env.AGENT_OS_1688_CHECKOUT_PROVIDER_URL);
  if (runtime !== 'provider' || !url) {
    throw new BadRequestException(
      '1688 checkout provider runtime is not configured.',
    );
  }
  return url;
}

function providerTimeoutMs(): number {
  return (
    optionalPositiveInt(process.env.AGENT_OS_1688_CHECKOUT_TIMEOUT_MS) ??
    DEFAULT_TIMEOUT_MS
  );
}

function parseResult(body: unknown): SubmitPurchaseOrderCheckoutResult {
  const record = asRecord(body);
  const externalOrderId = stringField(record?.externalOrderId);
  if (!externalOrderId) {
    throw new BadRequestException(
      '1688 checkout provider did not return externalOrderId.',
    );
  }

  return {
    externalOrderPlatform:
      stringField(record?.externalOrderPlatform) ?? 'ALIBABA_1688',
    externalOrderId,
    externalOrderUrl: stringField(record?.externalOrderUrl),
  };
}

export class FetchAlibaba1688CheckoutProviderClient
  implements Alibaba1688CheckoutProviderClient
{
  async submit(
    input: Alibaba1688CheckoutProviderSubmitInput,
  ): Promise<Alibaba1688CheckoutProviderResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const response = await fetch(input.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input.body),
        signal: controller.signal,
      });
      const text = await response.text();
      let body: unknown = text;
      if (text.trim()) {
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          body = text;
        }
      }
      return { ok: response.ok, status: response.status, body };
    } finally {
      clearTimeout(timeout);
    }
  }
}

@Injectable()
export class Alibaba1688CheckoutRuntimeAdapter
  implements PurchaseOrderCheckoutRuntimePort
{
  constructor(
    @Optional()
    private readonly client: Alibaba1688CheckoutProviderClient =
      new FetchAlibaba1688CheckoutProviderClient(),
  ) {}

  async submit(
    input: SubmitPurchaseOrderCheckoutInput,
  ): Promise<SubmitPurchaseOrderCheckoutResult> {
    const response = await this.client.submit({
      url: providerUrl(),
      timeoutMs: providerTimeoutMs(),
      body: {
        organizationId: input.organizationId,
        purchaseOrderId: input.purchaseOrderId,
        purchaseOrder: input.purchaseOrder,
      },
    });

    if (!response.ok) {
      throw new BadRequestException(
        `1688 checkout provider failed with status ${response.status}.`,
      );
    }

    return parseResult(response.body);
  }
}
