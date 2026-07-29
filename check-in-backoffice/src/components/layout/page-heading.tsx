'use client'

import { useI18n } from '@/lib/i18n'

export function PageHeading({ titleKey }: { titleKey: string }) {
  const { t } = useI18n()

  return <h1 className="text-xl font-medium tracking-tight text-foreground">{t(titleKey)}</h1>
}
