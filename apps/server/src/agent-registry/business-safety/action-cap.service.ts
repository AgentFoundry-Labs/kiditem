import { Injectable, Logger } from '@nestjs/common';

interface ActionCapConfig {
  maxBudgetChangePct?: number;
  maxPriceChangePct?: number;
  maxAffectedProducts?: number;
  dailySpendLimit?: number;
  maxOrderAmount?: number;
}

export interface BlockedAction {
  reason: string;
  detail: string;
  action?: any;
}

@Injectable()
export class ActionCapService {
  private readonly logger = new Logger(ActionCapService.name);

  validate(
    actionCap: Record<string, unknown>,
    actions: any[],
  ): { allowed: any[]; blocked: BlockedAction[]; allBlocked: boolean } {
    const cap = (actionCap || {}) as ActionCapConfig;
    if (!cap.maxBudgetChangePct && !cap.maxPriceChangePct && !cap.maxAffectedProducts && !cap.dailySpendLimit && !cap.maxOrderAmount) {
      return { allowed: actions, blocked: [], allBlocked: false };
    }

    if (cap.maxAffectedProducts && actions.length > cap.maxAffectedProducts) {
      this.logger.warn(`BlastRadius exceeded: ${actions.length} > ${cap.maxAffectedProducts}`);
      return {
        allowed: [],
        blocked: [{ reason: 'blast_radius', detail: `${actions.length} > ${cap.maxAffectedProducts}` }],
        allBlocked: true,
      };
    }

    const allowed: any[] = [];
    const blocked: BlockedAction[] = [];

    for (const action of actions) {
      const violation = this.checkSingle(cap, action);
      if (violation) {
        blocked.push(violation);
      } else {
        allowed.push(action);
      }
    }

    return { allowed, blocked, allBlocked: allowed.length === 0 && blocked.length > 0 };
  }

  private checkSingle(cap: ActionCapConfig, action: any): BlockedAction | null {
    if (cap.maxBudgetChangePct && action.budgetChangePct != null) {
      if (Math.abs(action.budgetChangePct) > cap.maxBudgetChangePct) {
        return { reason: 'budget_change_exceeded', detail: `${action.budgetChangePct}% > ±${cap.maxBudgetChangePct}%`, action };
      }
    }
    if (cap.maxPriceChangePct && action.priceChangePct != null) {
      if (Math.abs(action.priceChangePct) > cap.maxPriceChangePct) {
        return { reason: 'price_change_exceeded', detail: `${action.priceChangePct}% > ±${cap.maxPriceChangePct}%`, action };
      }
    }
    if (cap.dailySpendLimit && action.newDailyBudget != null) {
      if (action.newDailyBudget > cap.dailySpendLimit) {
        return { reason: 'daily_spend_exceeded', detail: `₩${action.newDailyBudget} > ₩${cap.dailySpendLimit}`, action };
      }
    }
    if (cap.maxOrderAmount && action.orderAmount != null) {
      if (action.orderAmount > cap.maxOrderAmount) {
        return { reason: 'order_amount_exceeded', detail: `₩${action.orderAmount} > ₩${cap.maxOrderAmount}`, action };
      }
    }
    return null;
  }
}
