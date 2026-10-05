import type {
  SupervisorInspectionEntry,
  SupervisorInspectionEntryPosition,
  SupervisorInspectionEntrySlotsItem
} from '@/generated/api/model'
import type { Dict } from '@/lib/i18n/dictionaries'

/** Permission that makes check-in ask for supervisor inspection details. */
export const SUPERVISOR_INSPECTION_PERMISSION = 'mobile:supervisor_inspection'

export type InspectionPosition = SupervisorInspectionEntryPosition
export type InspectionSlot = SupervisorInspectionEntrySlotsItem

/** Selected slots per position; a position is "selected" when it has a key. */
export type InspectionSelection = Partial<Record<InspectionPosition, InspectionSlot[]>>

export const INSPECTION_POSITIONS: { value: InspectionPosition; label: string }[] = [
  { value: 'PC', label: 'PC' },
  { value: 'BA', label: 'BA' },
  { value: 'ROADSHOW', label: 'Roadshow' }
]

export const INSPECTION_SLOTS: { value: InspectionSlot; labelKey: keyof Dict }[] = [
  { value: 'START_SHIFT', labelKey: 'inspection_slot_start_shift' },
  { value: 'BEFORE_BREAK', labelKey: 'inspection_slot_before_break' },
  { value: 'AFTER_BREAK', labelKey: 'inspection_slot_after_break' },
  { value: 'END_SHIFT', labelKey: 'inspection_slot_end_shift' }
]

/** Valid when at least one position is selected and every selected one has a time. */
export function isInspectionComplete(selection: InspectionSelection) {
  const entries = Object.values(selection)
  return entries.length > 0 && entries.every((slots) => slots.length > 0)
}

/** Selection → API payload, in the canonical position/slot order. */
export function toInspectionPayload(selection: InspectionSelection): SupervisorInspectionEntry[] {
  return INSPECTION_POSITIONS.flatMap(({ value: position }) => {
    const slots = selection[position]
    if (!slots) return []
    return [
      {
        position,
        slots: INSPECTION_SLOTS.map((slot) => slot.value).filter((slot) => slots.includes(slot))
      }
    ]
  })
}
