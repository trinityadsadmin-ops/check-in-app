import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isMissingCheckOut } from './missing-check-out.js'

describe('isMissingCheckOut', () => {
  it('flags a past day left checked in', () => {
    assert.equal(isMissingCheckOut('2026-11-11', 'CHECK_IN', '2026-11-12'), true)
  })

  it('does not flag today while still working', () => {
    assert.equal(isMissingCheckOut('2026-11-12', 'CHECK_IN', '2026-11-12'), false)
  })

  it('does not flag closed or empty days', () => {
    assert.equal(isMissingCheckOut('2026-11-11', 'CHECK_OUT', '2026-11-12'), false)
    assert.equal(isMissingCheckOut('2026-11-11', null, '2026-11-12'), false)
  })
})
