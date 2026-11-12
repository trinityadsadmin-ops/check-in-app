import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { describe, it } from 'node:test'
import {
  buildSignedPayload,
  diffFingerprints,
  isHardwareChange,
  parseCounter,
  parseDeviceFingerprint,
  parseDevicePublicKey,
  verifyDeviceSignature
} from './device-trust.js'

async function makeDevice() {
  const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
    'verify'
  ])
  const jwk = await webcrypto.subtle.exportKey('jwk', keys.publicKey)
  const sign = async (payload: string) =>
    Buffer.from(
      await webcrypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        keys.privateKey,
        new TextEncoder().encode(payload)
      )
    ).toString('base64url')
  const header = Buffer.from(JSON.stringify(jwk)).toString('base64url')
  return { jwk, header, sign }
}

describe('device request signatures', () => {
  const payload = buildSignedPayload({
    deviceId: '0b8f3f7e-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
    counter: 7,
    method: 'post',
    path: '/api/mobile/attendance/check-in'
  })

  it('accepts a signature from the enrolled key', async () => {
    const device = await makeDevice()
    const key = parseDevicePublicKey(device.header)
    assert.ok(key)
    assert.equal(await verifyDeviceSignature(key, payload, await device.sign(payload)), true)
  })

  it('rejects another key, a different request, or garbage', async () => {
    const device = await makeDevice()
    const other = await makeDevice()
    const key = parseDevicePublicKey(device.header)
    assert.ok(key)
    assert.equal(await verifyDeviceSignature(key, payload, await other.sign(payload)), false)
    const otherPath = payload.replace('check-in', 'check-out')
    assert.equal(await verifyDeviceSignature(key, otherPath, await device.sign(payload)), false)
    assert.equal(await verifyDeviceSignature(key, payload, 'not-a-signature'), false)
    assert.equal(await verifyDeviceSignature(key, payload, undefined), false)
  })

  it('only accepts bare P-256 public keys', () => {
    assert.equal(parseDevicePublicKey({ kty: 'EC', crv: 'P-256', x: 'a', y: 'b', d: 'secret' }), null)
    assert.equal(parseDevicePublicKey({ kty: 'RSA', n: 'a', e: 'b' }), null)
    assert.equal(parseDevicePublicKey('%%%'), null)
  })

  it('parses counters strictly', () => {
    assert.equal(parseCounter('42'), 42)
    assert.equal(parseCounter('-1'), null)
    assert.equal(parseCounter('1e5'), null)
    assert.equal(parseCounter(undefined), null)
  })
})

describe('device fingerprints', () => {
  it('reports only fields that changed on both sides', () => {
    const enrolled = parseDeviceFingerprint({ platform: 'iPhone', screen: '390x844@3', cores: 6, gpu: 'Apple GPU' })
    const sameModel = parseDeviceFingerprint({ platform: 'iPhone', screen: '390x844@3', cores: 6 })
    const newModel = parseDeviceFingerprint({ platform: 'iPhone', screen: '430x932@3', cores: 6, gpu: 'Apple GPU' })
    assert.ok(enrolled && sameModel && newModel)
    assert.deepEqual(diffFingerprints(enrolled, sameModel), [])
    assert.deepEqual(diffFingerprints(enrolled, newModel), ['screen'])
  })

  it('treats a screen change or two changed traits as new hardware', () => {
    assert.equal(isHardwareChange([]), false)
    assert.equal(isHardwareChange(['gpu']), false)
    assert.equal(isHardwareChange(['platform']), false)
    assert.equal(isHardwareChange(['screen']), true)
    assert.equal(isHardwareChange(['gpu', 'cores']), true)
  })

  it('drops unknown or malformed fields', () => {
    assert.deepEqual(parseDeviceFingerprint({ platform: 'x', evil: 'y', cores: 'many' }), { platform: 'x' })
  })
})
