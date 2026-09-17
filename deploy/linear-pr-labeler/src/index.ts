import { DurableObject } from "cloudflare:workers";
import { createGitHubClient } from "./github";
import { createLinearClient } from "./linear";
import { errorMessage, log } from "./log";
import { reconcilePullRequest, type ReconcileJob } from "./reconcile";
import { handleWebhook } from "./webhook";

// The entry module may only export handlers, so constants stay private here.
/** Update events this soon after a clean run are skipped; checks and reviews arrive in bursts. */
const UPDATE_DEBOUNCE_MS = 60_000;

/**
 * One instance per pull request. Linear sends one attachment delivery per
 * linked issue, often at the same moment; this object runs them one at a time
 * so a PR never gets two labels. A promise chain does the queueing: unlike
 * blockConcurrencyWhile, a failed or slow run does not reset the object and
 * drop the deliveries queued behind it.
 */
export class PrReconciler extends DurableObject<Env> {
  private tail: Promise<void> = Promise.resolve();
  private lastCleanRunAt = 0;

  reconcile(job: ReconcileJob): Promise<void> {
    const run = this.tail.then(() => this.runOne(job));
    this.tail = run;
    return run;
  }

  /** Never throws, so one failed run cannot break the chain. */
  private async runOne(job: ReconcileJob): Promise<void> {
    const context = { delivery: job.delivery, pr: job.prNumber, action: job.action };
    // A create may be the only event for a new link, so it always runs.
    if (job.action === "update" && Date.now() - this.lastCleanRunAt < UPDATE_DEBOUNCE_MS) {
      log("info", { event: "reconcile_skipped", reason: "debounced", ...context });
      return;
    }
    // Until this run finishes cleanly, the next update must not be skipped.
    this.lastCleanRunAt = 0;
    try {
      const result = await reconcilePullRequest(job, {
        teamKey: this.env.LINEAR_TEAM_KEY,
        repo: this.env.GITHUB_REPO,
        linear: createLinearClient({
          apiUrl: this.env.LINEAR_API_URL,
          apiKey: this.env.LINEAR_API_KEY ?? "",
          prLabelGroupId: this.env.PR_LABEL_GROUP_ID,
          prLabelColor: this.env.PR_LABEL_COLOR,
        }),
        github: createGitHubClient({
          apiUrl: this.env.GITHUB_API_URL,
          repo: this.env.GITHUB_REPO,
          token: this.env.GITHUB_TOKEN ?? "",
        }),
      });
      if (result.failed.length > 0) {
        log("error", { event: "reconcile_partial", ...context, ...result });
        return;
      }
      this.lastCleanRunAt = Date.now();
      log(result.orphanedLabel ? "warn" : "info", { event: "reconciled", ...context, ...result });
    } catch (error) {
      log("error", { event: "reconcile_failed", ...context, message: errorMessage(error) });
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    return handleWebhook(request, env, {
      now: Date.now(),
      waitUntil: (promise) => ctx.waitUntil(promise),
      dispatch: (job) => {
        const stub = env.PR_RECONCILER.get(env.PR_RECONCILER.idFromName(`pr-${job.prNumber}`));
        return stub.reconcile(job);
      },
    });
  },
} satisfies ExportedHandler<Env>;
