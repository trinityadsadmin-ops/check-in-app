import { Alert, AlertDescription } from '@/components/ui/alert'
import { getErrorMessage } from '@/lib/api/errors'

export function ErrorBanner({ error, message }: { error: unknown; message?: string }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>{message ?? getErrorMessage(error)}</AlertDescription>
    </Alert>
  )
}
