export type GeoPlatform = 'ios' | 'android' | 'desktop'

/** Coarse platform sniff — only used to pick which "enable location" steps to show. */
export function detectGeoPlatform(): GeoPlatform {
  if (typeof navigator === 'undefined') {
    return 'desktop'
  }
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) {
    return 'ios'
  }
  if (/Android/.test(ua)) {
    return 'android'
  }
  return 'desktop'
}
