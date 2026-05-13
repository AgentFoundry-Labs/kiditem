import { z } from 'zod';

export const IMAGE_EDIT_AGENT_TYPE = 'image_edit' as const;

export const ImageEditAgentInputSchema = z
  .object({
    image_url: z.string().min(1).optional(),
    image_urls: z.array(z.string().min(1)).optional(),
    preset: z.string().min(1).default('custom'),
    user_prompt: z.string().optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (value.preset === 'color_guide') {
      if (!value.image_urls || value.image_urls.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['image_urls'],
          message: 'color_guide requires at least two image URLs.',
        });
      }
      return;
    }

    if (!value.image_url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['image_url'],
        message: 'image_url is required.',
      });
    }
  });

export const ImageEditAgentOutputSchema = z
  .object({
    image_url: z.string().min(1),
  })
  .passthrough();

export type ImageEditAgentInput = z.infer<typeof ImageEditAgentInputSchema>;
export type ImageEditAgentOutput = z.infer<typeof ImageEditAgentOutputSchema>;
