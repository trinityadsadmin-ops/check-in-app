import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveActionName } from './action-name.js'

describe('resolveActionName', () => {
  it('names key employee actions', () => {
    assert.equal(resolveActionName('POST', '/api/mobile/attendance/check-in', '/api'), 'attendance.check_in')
    assert.equal(resolveActionName('post', '/api/mobile/attendance/check-out', '/api'), 'attendance.check_out')
    assert.equal(resolveActionName('POST', '/api/auth/sign-in', '/api'), 'auth.sign_in')
  })

  it('normalizes ids in paths', () => {
    assert.equal(
      resolveActionName('POST', '/api/mobile/emergency/0b8f3f7e-1c2d-4e5f-8a9b-0c1d2e3f4a5b/cancel', '/api'),
      'emergency.cancel'
    )
  })

  it('falls back to method + path for unnamed app mutations', () => {
    assert.equal(resolveActionName('POST', '/api/mobile/something-new', '/api'), 'POST /mobile/something-new')
  })

  it('skips reads, backoffice and the log endpoint itself', () => {
    assert.equal(resolveActionName('GET', '/api/mobile/emergency/active', '/api'), null)
    assert.equal(resolveActionName('POST', '/api/backoffice/users', '/api'), null)
    assert.equal(resolveActionName('POST', '/api/mobile/action-logs', '/api'), null)
  })
})
