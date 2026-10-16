import { z } from 'zod';

export const AgentIdParams = z.object({ id: z.string().uuid() });

export const AgentVersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});
