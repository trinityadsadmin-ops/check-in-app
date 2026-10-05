import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ConfirmAttendanceRequestSchema } from './attendance.schemas.js'
import { resolveSupervisorInspection, SupervisorInspectionSchema } from './supervisor-inspection.js'

describe('SupervisorInspectionSchema', () => {
  it('accepts several positions, each with several slots', () => {
    const result = SupervisorInspectionSchema.safeParse([
      { position: 'PC', slots: ['START_SHIFT', 'BEFORE_BREAK'] },
      { position: 'ROADSHOW', slots: ['END_SHIFT'] }
    ])
    assert.equal(result.success, true)
  })

  it('rejects an empty inspection', () => {
    assert.equal(SupervisorInspectionSchema.safeParse([]).success, false)
  })

  it('rejects a position with no slots', () => {
    assert.equal(SupervisorInspectionSchema.safeParse([{ position: 'BA', slots: [] }]).success, false)
  })

  it('rejects the same position twice', () => {
    const result = SupervisorInspectionSchema.safeParse([
      { position: 'BA', slots: ['START_SHIFT'] },
      { position: 'BA', slots: ['END_SHIFT'] }
    ])
    assert.equal(result.success, false)
  })

  it('rejects duplicate slots', () => {
    const result = SupervisorInspectionSchema.safeParse([
      { position: 'PC', slots: ['AFTER_BREAK', 'AFTER_BREAK'] }
    ])
    assert.equal(result.success, false)
  })

  it('rejects unknown positions and slots', () => {
    assert.equal(SupervisorInspectionSchema.safeParse([{ position: 'CASHIER', slots: ['START_SHIFT'] }]).success, false)
    assert.equal(SupervisorInspectionSchema.safeParse([{ position: 'PC', slots: ['LUNCH'] }]).success, false)
  })
})

describe('ConfirmAttendanceRequestSchema', () => {
  it('still accepts a regular check-in without supervisorInspection', () => {
    const result = ConfirmAttendanceRequestSchema.safeParse({ lat: 13.75, lng: 100.5 })
    assert.equal(result.success, true)
  })
})

describe('resolveSupervisorInspection', () => {
  const inspection = [
    { position: 'ROADSHOW' as const, slots: ['END_SHIFT' as const, 'START_SHIFT' as const] },
    { position: 'PC' as const, slots: ['BEFORE_BREAK' as const] }
  ]

  it('leaves regular employees unchanged when they send nothing', () => {
    assert.deepEqual(
      resolveSupervisorInspection({ eventType: 'CHECK_IN', isSupervisor: false, inspection: undefined }),
      { ok: true, value: null }
    )
  })

  it('forbids regular employees from sending an inspection', () => {
    const result = resolveSupervisorInspection({ eventType: 'CHECK_IN', isSupervisor: false, inspection })
    assert.equal(result.ok, false)
    assert.equal(!result.ok && result.status, 403)
  })

  it('requires supervisors to send an inspection on check-in', () => {
    const result = resolveSupervisorInspection({ eventType: 'CHECK_IN', isSupervisor: true, inspection: undefined })
    assert.equal(result.ok, false)
    assert.equal(!result.ok && result.status, 400)
  })

  it('stores a supervisor inspection in canonical order', () => {
    assert.deepEqual(
      resolveSupervisorInspection({ eventType: 'CHECK_IN', isSupervisor: true, inspection }),
      {
        ok: true,
        value: [
          { position: 'PC', slots: ['BEFORE_BREAK'] },
          { position: 'ROADSHOW', slots: ['START_SHIFT', 'END_SHIFT'] }
        ]
      }
    )
  })

  it('does not require an inspection on check-out, even for supervisors', () => {
    assert.deepEqual(
      resolveSupervisorInspection({ eventType: 'CHECK_OUT', isSupervisor: true, inspection: undefined }),
      { ok: true, value: null }
    )
  })

  it('rejects an inspection sent on check-out', () => {
    const result = resolveSupervisorInspection({ eventType: 'CHECK_OUT', isSupervisor: true, inspection })
    assert.equal(result.ok, false)
    assert.equal(!result.ok && result.status, 400)
  })
})
