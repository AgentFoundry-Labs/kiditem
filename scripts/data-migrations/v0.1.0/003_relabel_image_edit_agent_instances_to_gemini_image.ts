import type { DataMigration } from '../types';

export const relabelImageEditAgentInstancesToGeminiImage: DataMigration = {
  id: 'v0.1.0:003_relabel_image_edit_agent_instances_to_gemini_image',
  releaseVersion: '0.1.0',
  name: 'Relabel image_edit Agent OS runtime adapter from python_http to gemini_image',
  async run(tx) {
    const instancesUpdated = await tx.$executeRaw`
      UPDATE agent_instances
      SET adapter_type = 'gemini_image',
          updated_at = now()
      WHERE type = 'image_edit'
        AND adapter_type = 'python_http'
    `;

    const taskSessionsUpdated = await tx.$executeRaw`
      UPDATE agent_task_sessions AS session
      SET adapter_type = 'gemini_image',
          updated_at = now()
      FROM agent_instances AS instance
      WHERE session.agent_instance_id = instance.id
        AND instance.type = 'image_edit'
        AND session.adapter_type = 'python_http'
        AND NOT EXISTS (
          SELECT 1
          FROM agent_task_sessions AS existing
          WHERE existing.organization_id = session.organization_id
            AND existing.agent_instance_id = session.agent_instance_id
            AND existing.adapter_type = 'gemini_image'
            AND existing.task_key = session.task_key
        )
    `;

    return {
      affectedRows: instancesUpdated + taskSessionsUpdated,
      details: { instancesUpdated, taskSessionsUpdated },
    };
  },
};
