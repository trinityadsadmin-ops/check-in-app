import { z } from '@hono/zod-openapi'

/** Staff positions a supervisor can inspect. */
export const inspectionPositions = ['PC', 'BA', 'ROADSHOW'] as const

/** Shift moments an inspection can happen at. Named START_SHIFT/END_SHIFT
 *  (not CHECK_IN/CHECK_OUT) so they can't be confused with attendance event types. */
export const inspectionSlots = ['START_SHIFT', 'BEFORE_BREAK', 'AFTER_BREAK', 'END_SHIFT'] as const

export const InspectionPositionSchema = z.enum(inspectionPositions)
export const InspectionSlotSchema = z.enum(inspectionSlots)

export const SupervisorInspectionEntrySchema = z
  .object({
    position: InspectionPositionSchema,
    slots: z
      .array(InspectionSlotSchema)
      .min(1)
      .refine((slots) => new Set(slots).size === slots.length, 'Inspection slots must be unique')
  })
  .openapi('SupervisorInspectionEntry')

export const SupervisorInspectionSchema = z
  .array(SupervisorInspectionEntrySchema)
  .min(1)
  .refine(
    (entries) => new Set(entries.map((entry) => entry.position)).size === entries.length,
    'Each inspected position may appear only once'
  )

export type SupervisorInspection = z.infer<typeof SupervisorInspectionSchema>

export type SupervisorInspectionDecision =
  | { ok: true; value: SupervisorInspection | null }
  | { ok: false; status: 400 | 403; message: string }

/**
 * Decides what supervisor inspection (if any) a punch should store.
 *
 * - Only CHECK_IN events carry an inspection.
 * - Users holding `mobile:supervisor_inspection` must send one on check-in.
 * - Users without it may not send one, so inspection data can't be forged by
 *   regular employees.
 *
 * Entries are re-ordered into the canonical position/slot order so the stored
 * value doesn't depend on tap order in the app.
 */
export function resolveSupervisorInspection(input: {
  eventType: 'CHECK_IN' | 'CHECK_OUT'
  isSupervisor: boolean
  inspection: SupervisorInspection | undefined
}): SupervisorInspectionDecision {
  if (input.eventType === 'CHECK_OUT') {
    return input.inspection
      ? { ok: false, status: 400, message: 'supervisorInspection is only accepted on check-in' }
      : { ok: true, value: null }
  }

  if (!input.isSupervisor) {
    return input.inspection
      ? { ok: false, status: 403, message: 'Missing permission: mobile:supervisor_inspection' }
      : { ok: true, value: null }
  }

  if (!input.inspection) {
    return { ok: false, status: 400, message: 'supervisorInspection is required for supervisors' }
  }

  const value = [...input.inspection]
    .sort((left, right) => inspectionPositions.indexOf(left.position) - inspectionPositions.indexOf(right.position))
    .map((entry) => ({
      position: entry.position,
      slots: [...entry.slots].sort((left, right) => inspectionSlots.indexOf(left) - inspectionSlots.indexOf(right))
    }))

  return { ok: true, value }
}
