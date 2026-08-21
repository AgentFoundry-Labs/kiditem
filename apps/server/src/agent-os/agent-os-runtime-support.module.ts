import { Module } from "@nestjs/common";
import { OpenAiResponsesOperatorRuntimeAdapter } from "./adapter/out/runtime/openai-responses-operator-runtime.adapter";

/** Stateless runtime client shared by official session and quarantined legacy lanes. */
@Module({
  providers: [OpenAiResponsesOperatorRuntimeAdapter],
  exports: [OpenAiResponsesOperatorRuntimeAdapter],
})
export class AgentOsRuntimeSupportModule {}
